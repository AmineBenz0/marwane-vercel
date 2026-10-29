"""Atomic, revision-checked correction preview/apply command.

Supports audited transaction, stock and ordinary cash/bank corrections.
Delivered-stock resolutions, terminal cheques and letters of credit remain gated.
"""
from copy import deepcopy
from datetime import date, datetime, time, timezone
from decimal import Decimal
from hashlib import sha256
import json

from fastapi import HTTPException
from sqlalchemy import case, func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.correction_operation import CorrectionOperation
from app.models.caisse import Caisse
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.paiement import Paiement
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.schemas.correction import CorrectionApplyCommand, CorrectionCommand, CorrectionPreviewRead
from app.services.correction_contract import (
    lock_expected_revision,
    replay_result,
    request_fingerprint,
    request_payload,
)
from app.services.financial import validate_payment_date
from app.services.financial_ledger import sync_payment_cash_movement
from app.services.stock_corrections import (
    STOCK_FIELDS, lock_stock_scope, stock_dependencies, plan_stock_correction, apply_stock_plan,
    stock_plan_matches,
)


_MODELS = {"transaction": Transaction, "paiement": Paiement}
_IDS = {"transaction": "id_transaction", "paiement": "id_paiement"}


def _snapshot(entity_type: str, record) -> dict:
    return {
        column.name: _json_value(getattr(record, column.name))
        for column in _MODELS[entity_type].__table__.columns
    }


def _json_value(value):
    if isinstance(value, datetime):
        return _utc(value).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value.quantize(Decimal("0.01")), "f")
    return value


def _utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _effective_payment_date(payment: Paiement) -> date:
    if payment.type_paiement == "cheque":
        return payment.date_encaissement_effective or payment.date_paiement
    return payment.date_paiement


def _field_value(name, value):
    if value is not None and name in {"date_echeance", "date_transaction", "date_paiement"}:
        return date.fromisoformat(value) if isinstance(value, str) else value
    if value is not None and name in {"prix_unitaire", "montant_total", "montant"}:
        return Decimal(value)
    return value


def _stock_plan(db, command, record, changes):
    if command.target.entity_type != 'transaction':
        return None
    relevant = STOCK_FIELDS - ({'prix_unitaire'} if record.id_client is not None else set())
    changed = any(name in changes and getattr(record, name) != _field_value(name, changes[name]) for name in relevant)
    explicit = command.changes.stock_allocations
    if not changed and explicit is None:
        return None
    if not changed and explicit is not None:
        supplied = [(a.id_production, a.quantite) for a in explicit]
        current = [(a.id_production, a.quantite) for a in record.allocations]
        if sorted(supplied) == sorted(current):
            return None
    return plan_stock_correction(db, record, changes,
        [a.model_dump() for a in explicit] if explicit is not None else None)


def _dependencies(db, entity_type, record, transaction=None, *, lock=False, changes=None):
    """Read the same dependency set for preview and locked apply."""
    def rows(model, predicate, key):
        query = db.query(model).filter(predicate).order_by(key).populate_existing()
        if lock:
            query = query.with_for_update()
        return query.all()

    payments = rows(Paiement, Paiement.id_transaction == record.id_transaction, Paiement.id_paiement)
    # Include all linked movements, including canceled rows: replacement,
    # cancellation and new movements must invalidate an earlier preview.
    payment_ids = [payment.id_paiement for payment in payments]
    # A malformed cash link still belongs to the dependency and validation set.
    cash = rows(
        Caisse,
        or_(Caisse.id_transaction == record.id_transaction, Caisse.id_paiement.in_(payment_ids)),
        Caisse.id_mouvement,
    )
    bank = rows(
        MouvementBancaire,
        MouvementBancaire.id_paiement.in_(payment_ids),
        MouvementBancaire.id_mouvement,
    ) if payment_ids else []
    account_ids = {row.id_compte for row in bank}
    account_ids.update(payment.id_compte for payment in payments if payment.id_compte is not None)
    if changes and changes.get("id_compte") is not None:
        account_ids.add(changes["id_compte"])
    accounts = []
    if account_ids:
        account_query = db.query(CompteBancaire).filter(
            CompteBancaire.id_compte.in_(sorted(account_ids)),
        ).order_by(CompteBancaire.id_compte).populate_existing()
        if lock:
            account_query = account_query.with_for_update()
        accounts = account_query.all()

    contact_ids = set()
    if entity_type == "transaction":
        contact_ids.update(value for value in (record.id_client, record.id_fournisseur) if value is not None)
        if changes:
            contact_ids.update(value for value in (changes.get("id_client"), changes.get("id_fournisseur")) if value is not None)
    clients, suppliers = [], []
    if contact_ids:
        client_query = db.query(Client).filter(Client.id_client.in_(sorted(contact_ids))).order_by(Client.id_client).populate_existing()
        supplier_query = db.query(Fournisseur).filter(Fournisseur.id_fournisseur.in_(sorted(contact_ids))).order_by(Fournisseur.id_fournisseur).populate_existing()
        if lock:
            client_query = client_query.with_for_update()
            supplier_query = supplier_query.with_for_update()
        clients, suppliers = client_query.all(), supplier_query.all()

    def snapshot(row):
        return {column.name: _json_value(getattr(row, column.name)) for column in row.__table__.columns}

    result = {
        "transaction": _snapshot("transaction", transaction if transaction is not None else record),
        "payments": [snapshot(row) for row in payments],
        "cash": [snapshot(row) for row in cash],
        "bank": [snapshot(row) for row in bank],
        "accounts": [snapshot(row) for row in accounts],
        "clients": [snapshot(row) for row in clients],
        "suppliers": [snapshot(row) for row in suppliers],
    }
    return result


def _normalize_and_validate(command: CorrectionCommand, record, *, db: Session, transaction=None) -> dict:
    entity_type = command.target.entity_type
    requested = command.changes.model_dump(exclude_unset=True)
    stock_allocations_supplied = 'stock_allocations' in requested
    if stock_allocations_supplied:
        if entity_type != 'transaction' or requested['stock_allocations'] is None:
            raise HTTPException(422, 'La répartition de stock doit être une liste pour une transaction.')
        requested.pop('stock_allocations')
    allowed = (
        {"date_echeance", "date_transaction", "id_client", "id_fournisseur", "prix_unitaire", "quantite", "id_produit", "id_batiment", "id_production"}
        if entity_type == "transaction"
        else {"notes", "date_paiement", "montant", "type_paiement", "id_compte", "source_reglement"}
    )
    if (not requested and not stock_allocations_supplied) or set(requested) - allowed:
        raise HTTPException(422, "Un ou plusieurs champs ne sont pas encore disponibles pour la correction.")

    final_transaction_date = (
        requested.get("date_transaction", record.date_transaction)
        if entity_type == "transaction" else None
    )
    linked_payments = []
    if entity_type == "transaction":
        linked_payments = db.query(Paiement).filter(
            Paiement.id_transaction == record.id_transaction,
        ).order_by(Paiement.id_paiement).populate_existing().all()
    if entity_type == "transaction" and "date_transaction" in requested:
        if requested["date_transaction"] is None:
            raise HTTPException(422, "La date de transaction doit être renseignée.")
        final_due_date = requested.get("date_echeance", record.date_echeance)
        if final_due_date is not None and final_due_date < requested["date_transaction"]:
            raise HTTPException(409, "La date d’échéance deviendrait antérieure à la transaction. Corrigez les deux dates ensemble.")
        chronology_payments = [payment for payment in linked_payments if payment.statut != "annule"]
        if any(_effective_payment_date(payment) < requested["date_transaction"] for payment in chronology_payments):
            raise HTTPException(
                409,
                "Un paiement non annulé précède cette nouvelle date. Corrigez d’abord sa date ou enregistrez-le comme avance.",
            )

    if entity_type == "transaction" and requested.get("date_echeance") is not None:
        if requested["date_echeance"] < final_transaction_date:
            raise HTTPException(422, "La date d’échéance ne peut pas précéder la date de transaction.")

    if entity_type == "transaction" and ({"id_client", "id_fournisseur"} & requested.keys()):
        if "id_client" in requested and requested["id_client"] is None:
            raise HTTPException(422, "Sélectionnez un client valide pour cette vente.")
        if "id_fournisseur" in requested and requested["id_fournisseur"] is None:
            raise HTTPException(422, "Sélectionnez un fournisseur valide pour cet achat.")
        if "id_client" in requested and record.id_client is None:
            raise HTTPException(409, "Une correction de contact conserve le type de transaction. Un achat ne peut pas devenir une vente ici.")
        if "id_fournisseur" in requested and record.id_fournisseur is None:
            raise HTTPException(409, "Une correction de contact conserve le type de transaction. Une vente ne peut pas devenir un achat ici.")
        if any(payment.id_lc is not None for payment in linked_payments):
            raise HTTPException(409, "L’attribution d’un paiement lié à une lettre de crédit nécessite son adaptateur dédié.")
        if "id_client" in requested:
            contact = db.query(Client).filter(Client.id_client == requested["id_client"]).one_or_none()
            product = db.query(Produit).filter(Produit.id_produit == record.id_produit).one_or_none()
            if not contact or not contact.est_actif:
                raise HTTPException(422, "Le client sélectionné est introuvable ou inactif.")
            if not product or product.usage != "vendu":
                raise HTTPException(409, "Ce produit n’est pas configuré pour une vente client.")
        if "id_fournisseur" in requested:
            contact = db.query(Fournisseur).filter(
                Fournisseur.id_fournisseur == requested["id_fournisseur"],
            ).one_or_none()
            product = db.query(Produit).filter(Produit.id_produit == record.id_produit).one_or_none()
            if not contact or not contact.est_actif:
                raise HTTPException(422, "Le fournisseur sélectionné est introuvable ou inactif.")
            if not product or product.usage != "achete":
                raise HTTPException(409, "Ce produit n’est pas configuré pour un achat fournisseur.")

    if entity_type == "transaction" and ({"prix_unitaire", "quantite"} & requested.keys()):
        if requested.get("prix_unitaire", record.prix_unitaire) is None or requested.get("quantite", record.quantite) is None:
            raise HTTPException(422, "Le prix unitaire doit être renseigné.")
        requested["montant_total"] = Decimal(str(requested.get("quantite", record.quantite))) * Decimal(str(requested.get("prix_unitaire", record.prix_unitaire)))
        if requested['montant_total'] > Decimal('9999999999999.99'):
            raise HTTPException(422, 'Le montant total dépasse la capacité de la transaction.')

    payment_financial_fields = {"date_paiement", "montant", "type_paiement", "id_compte", "source_reglement"}
    if entity_type == "paiement" and payment_financial_fields.intersection(requested):
        if "date_paiement" in requested and requested["date_paiement"] is None:
            raise HTTPException(422, "La date du paiement doit être renseignée.")
        if "montant" in requested and requested["montant"] is None:
            raise HTTPException(422, "Le montant du paiement doit être renseigné.")
        if record.statut == "annule":
            raise HTTPException(409, "Un paiement annulé ne peut plus changer ses attributs financiers.")
        next_method = requested.get("type_paiement", record.type_paiement)
        if record.type_paiement == "cheque" or next_method == "cheque":
            raise HTTPException(409, "Le moyen de paiement ne peut pas passer vers ou depuis un chèque par cette correction.")
        if record.type_paiement == "lc" or next_method == "lc" or record.id_lc is not None:
            raise HTTPException(409, "La correction d’un paiement par lettre de crédit attend son adaptateur dédié.")
        if not transaction or not transaction.est_actif:
            raise HTTPException(409, "Le paiement d’une transaction inactive ne peut pas être corrigé.")
        if not record.est_effectif:
            raise HTTPException(409, "Seul un paiement effectif peut changer ses attributs financiers.")
        # Avoid leaving stale bank-account fields after a routing change.
        if transaction.id_fournisseur is None and next_method != "virement" and "id_compte" not in requested:
            requested["id_compte"] = None
        if transaction.id_fournisseur is not None and requested.get("source_reglement") == "caisse":
            requested["id_compte"] = None
        if (
            transaction.id_fournisseur is not None
            and requested.get("source_reglement", record.source_reglement) != "banque"
            and next_method != "virement" and "id_compte" not in requested
        ):
            requested["id_compte"] = None
        next_account_id = requested.get("id_compte", record.id_compte)
        next_source = requested.get("source_reglement", record.source_reglement)
        if "id_compte" in requested and requested["id_compte"] is not None:
            account = db.query(CompteBancaire.id_compte).filter(
                CompteBancaire.id_compte == requested["id_compte"],
            ).scalar()
            if account is None:
                raise HTTPException(422, "Le compte bancaire sélectionné est introuvable.")
        if transaction.id_fournisseur is not None:
            if next_source == "banque" and next_account_id is None:
                raise HTTPException(422, "Sélectionnez le compte à débiter pour un règlement bancaire.")
            if next_source == "caisse" and next_account_id is not None:
                raise HTTPException(422, "Un règlement depuis la caisse ne peut pas conserver de compte bancaire.")
            if "source_reglement" in requested and requested["source_reglement"] is None:
                raise HTTPException(422, "Choisissez explicitement la caisse ou le compte bancaire pour ce règlement fournisseur.")
        else:
            if "source_reglement" in requested and requested["source_reglement"] is not None:
                raise HTTPException(422, "La source de règlement enregistrée concerne les paiements fournisseur.")
            if next_account_id is not None and next_method != "virement":
                raise HTTPException(422, "Un compte bancaire est disponible ici uniquement pour un virement.")
            if next_method == "virement" and next_account_id is None:
                raise HTTPException(422, "Sélectionnez le compte bancaire utilisé pour ce virement.")
        if (
            transaction.id_fournisseur is not None
            and next_method == "virement" and record.type_paiement != "virement"
            and next_source is None and "source_reglement" not in requested
        ):
            raise HTTPException(422, "Choisissez la caisse ou le compte bancaire pour ce virement fournisseur.")
        if transaction.id_fournisseur is not None and next_source == "caisse" and next_account_id is not None:
            raise HTTPException(422, "Un règlement depuis la caisse ne peut pas conserver de compte bancaire.")

        existing_bank_funded = (
            transaction.id_fournisseur is not None and record.source_reglement == "banque"
        ) or (
            record.source_reglement is None and record.type_paiement == "virement" and record.id_compte is not None
        )
        bank_funded = (
            transaction.id_fournisseur is not None and next_source == "banque"
        ) or (
            next_source is None and next_method == "virement" and next_account_id is not None
        )
        active_cash = db.query(Caisse).filter(
            Caisse.id_paiement == record.id_paiement, Caisse.statut == "active",
        ).all()
        active_bank = db.query(MouvementBancaire).filter(
            MouvementBancaire.id_paiement == record.id_paiement,
            MouvementBancaire.statut == "active",
        ).all()
        affected_account_ids = set()
        if existing_bank_funded and record.id_compte is not None:
            affected_account_ids.add(record.id_compte)
        if bank_funded and next_account_id is not None:
            affected_account_ids.add(next_account_id)
        for account_id in sorted(affected_account_ids):
            account = db.query(CompteBancaire).filter(
                CompteBancaire.id_compte == account_id,
            ).populate_existing().one_or_none()
            if account is None:
                raise HTTPException(409, "Un compte bancaire lié à ce paiement est introuvable.")
            ledger_balance = db.query(func.coalesce(func.sum(case(
                (MouvementBancaire.type_mouvement == "ENTREE", MouvementBancaire.montant),
                else_=-MouvementBancaire.montant,
            )), 0)).filter(
                MouvementBancaire.id_compte == account_id,
                MouvementBancaire.statut == "active",
            ).scalar()
            if Decimal(str(account.solde_actuel)) != Decimal(str(ledger_balance)):
                raise HTTPException(
                    409,
                    "Le solde du compte bancaire ne correspond pas à ses mouvements. Réconciliez le compte avant la correction.",
                )
        if existing_bank_funded:
            if len(active_bank) != 1 or active_cash:
                raise HTTPException(409, "Le mouvement bancaire de ce paiement doit être réconcilié avant sa correction.")
            movement = active_bank[0]
            expected_date = datetime.combine(record.date_paiement, time.min, tzinfo=timezone.utc)
            if (
                movement.id_compte != record.id_compte or movement.montant != record.montant
                or movement.type_mouvement != ("ENTREE" if transaction.id_client is not None else "SORTIE")
                or _utc(movement.date_mouvement) != expected_date
                or movement.id_paiement != record.id_paiement or movement.id_charge is not None
                or movement.source != record.type_paiement
                or movement.reference != (record.reference_virement or record.numero_cheque)
            ):
                raise HTTPException(409, "Le mouvement bancaire ne correspond pas au paiement. Réconciliez-le avant sa correction.")
        else:
            if len(active_cash) != 1 or active_bank:
                raise HTTPException(409, "Le mouvement de caisse de ce paiement doit être réconcilié avant sa correction.")
            movement = active_cash[0]
            expected_date = datetime.combine(record.date_paiement, time.min, tzinfo=timezone.utc)
            if (
                movement.montant != record.montant
                or movement.type_mouvement != ("ENTREE" if transaction.id_client is not None else "SORTIE")
                or _utc(movement.date_mouvement) != expected_date
                or movement.id_transaction != record.id_transaction
                or movement.id_charge is not None or movement.id_cession is not None
            ):
                raise HTTPException(409, "Le mouvement de caisse ne correspond pas au paiement. Réconciliez-le avant sa correction.")
        if "date_paiement" in requested:
            validate_payment_date(
                transaction, requested["date_paiement"],
            )

    normalized = {key: _json_value(value) for key, value in requested.items()}
    stock_plan = _stock_plan(db, command, record, normalized)
    return normalized


def _impact(entity_type: str, changes: dict, record=None, transaction=None, db: Session | None = None) -> dict:
    impact = {
        "cash": "unchanged",
        "bank": "unchanged",
        "stock": "unchanged",
    }
    if entity_type == "transaction":
        if "date_echeance" in changes:
            impact["overdue_follow_up"] = "recalculated from the corrected due date"
        if "prix_unitaire" in changes or "montant_total" in changes:
            if record.id_client is not None:
                impact["receivable"] = "recalculated from the corrected sale total"
            else:
                impact["payable"] = "recalculated from the corrected purchase total"
        if "date_transaction" in changes:
            impact["reporting_periods"] = {
                "before": _json_value(record.date_transaction),
                "after": changes["date_transaction"],
            }
        if "id_client" in changes or "id_fournisseur" in changes:
            field = "id_client" if "id_client" in changes else "id_fournisseur"
            impact["contact_balance"] = {"from": getattr(record, field), "to": changes[field]}
    else:
        if "notes" in changes:
            impact["payment_note"] = "updated"
        if record is not None and {"date_paiement", "montant", "type_paiement", "id_compte", "source_reglement"}.intersection(changes):
            old_movement = db.query(Caisse).filter(
                Caisse.id_paiement == record.id_paiement,
                Caisse.statut == "active",
            ).one_or_none()
            old_bank = db.query(MouvementBancaire).filter(
                MouvementBancaire.id_paiement == record.id_paiement,
                MouvementBancaire.statut == "active",
            ).one_or_none()
            old_movement = old_movement or old_bank
            old_amount = _json_value(old_movement.montant if old_movement else record.montant)
            old_date = _json_value(old_movement.date_mouvement.date() if old_movement else record.date_paiement)
            direction = "ENTREE" if transaction and transaction.id_client is not None else "SORTIE"
            after_method = changes.get("type_paiement", record.type_paiement)
            after_account = changes.get("id_compte", record.id_compte)
            after_source = changes.get("source_reglement", record.source_reglement)
            after_bank = (
                transaction is not None and (
                    transaction.id_fournisseur is not None and after_source == "banque"
                    or after_source is None and after_method == "virement" and after_account is not None
                )
            )
            after = {
                "date": changes.get("date_paiement", _json_value(record.date_paiement)),
                "amount": changes.get("montant", _json_value(record.montant)),
                "direction": direction,
                "method": after_method,
                "source": after_source or ("banque" if after_bank else "caisse"),
                "account_id": after_account if after_bank else None,
            }
            before = {
                "date": old_date,
                "amount": old_amount,
                "direction": old_movement.type_mouvement if old_movement else direction,
                "method": record.type_paiement,
            }
            if old_bank or after_bank:
                impact["bank"] = {
                    "before": {**before, "account_id": old_bank.id_compte} if old_bank else None,
                    "after": after if after_bank else None,
                }
                account_deltas: dict[int, Decimal] = {}
                if old_bank:
                    old_amount_decimal = Decimal(str(old_bank.montant))
                    account_deltas[old_bank.id_compte] = account_deltas.get(old_bank.id_compte, Decimal("0")) + (
                        old_amount_decimal if old_bank.type_mouvement == "SORTIE" else -old_amount_decimal
                    )
                if after_bank and after_account is not None:
                    new_amount_decimal = Decimal(str(after["amount"]))
                    account_deltas[after_account] = account_deltas.get(after_account, Decimal("0")) + (
                        -new_amount_decimal if direction == "SORTIE" else new_amount_decimal
                    )
                account_impacts = []
                for account_id, delta in sorted(account_deltas.items()):
                    account = db.query(CompteBancaire).filter(
                        CompteBancaire.id_compte == account_id,
                    ).one_or_none()
                    if account:
                        balance_before = Decimal(str(account.solde_actuel))
                        account_impacts.append({
                            "account_id": account_id,
                            "before": format(balance_before.quantize(Decimal("0.01")), "f"),
                            "after": format((balance_before + delta).quantize(Decimal("0.01")), "f"),
                        })
                impact["bank"]["account_balances"] = account_impacts
                impact["cash"] = {
                    "before": before if isinstance(old_movement, Caisse) else None,
                    "after": None if after_bank else after,
                }
            else:
                impact["cash"] = {"before": before, "after": after}
    return impact


def _dependency_fingerprint(entity_type: str, entity_id: int, revision: int, changes: dict, dependencies: dict) -> str:
    canonical = json.dumps(
        {"entity_type": entity_type, "entity_id": entity_id,
         "revision": revision, "changes": changes, "dependencies": dependencies},
        sort_keys=True, separators=(",", ":"), ensure_ascii=False,
    )
    return sha256(canonical.encode("utf-8")).hexdigest()


def preview_correction(db: Session, command: CorrectionCommand) -> dict:
    model = _MODELS[command.target.entity_type]
    key = getattr(model, _IDS[command.target.entity_type])
    record = db.query(model).filter(key == command.target.entity_id).populate_existing().one_or_none()
    if record is None:
        raise HTTPException(404, "L’enregistrement à corriger est introuvable.")
    if record.row_version != command.target.expected_version:
        raise HTTPException(409, "Cet enregistrement a été modifié. Actualisez-le avant de préparer la correction.")

    transaction = None
    if command.target.entity_type == "paiement":
        transaction = db.query(Transaction).filter(
            Transaction.id_transaction == record.id_transaction,
        ).populate_existing().one_or_none()
    changes = _normalize_and_validate(command, record, db=db, transaction=transaction)
    stock_plan = _stock_plan(db, command, record, changes)
    before = _snapshot(command.target.entity_type, record)
    after = deepcopy(before)
    after.update(changes)
    if stock_plan and stock_plan['kind'] == 'eggs':
        after.update(id_production=stock_plan['source'], id_cycle=stock_plan['cycle'])
    dependencies = _dependencies(db, command.target.entity_type, record, transaction, changes=changes)
    if stock_plan:
        dependencies['stock_plan'] = stock_plan
        dependencies['stock'] = stock_dependencies(db)
    fingerprint = _dependency_fingerprint(
        command.target.entity_type, command.target.entity_id,
        command.target.expected_version, changes,
        dependencies,
    )
    preview = CorrectionPreviewRead(
        operation_id=command.operation_id,
        target=command.target,
        changes=changes,
        before=before,
        after=after,
        impact=_impact(command.target.entity_type, changes, record, transaction, db),
        dependency_fingerprint=fingerprint,
    ).model_dump(mode="json")
    if stock_plan:
        preview['impact']['stock'] = stock_plan
    return preview


def apply_correction(db: Session, command: CorrectionApplyCommand, actor) -> dict:
    if actor is None:
        raise HTTPException(401, "Une session authentifiée est nécessaire pour enregistrer une correction.")
    actor_id = actor.id_utilisateur
    request_hash = request_fingerprint(command)

    previous = replay_result(db, command.operation_id, request_hash, actor_id)
    if previous is not None:
        return {**previous, "replayed": True}

    if command.target.entity_type == 'transaction' and (STOCK_FIELDS.intersection(command.changes.model_fields_set) or 'stock_allocations' in command.changes.model_fields_set):
        lock_stock_scope(db)

    transaction = None
    if command.target.entity_type == "paiement":
        payment_transaction_id = db.query(Paiement.id_transaction).filter(
            Paiement.id_paiement == command.target.entity_id,
        ).scalar()
        if payment_transaction_id is None:
            raise HTTPException(404, "L’enregistrement à corriger est introuvable.")
        transaction = db.query(Transaction).filter(
            Transaction.id_transaction == payment_transaction_id,
        ).populate_existing().with_for_update().one_or_none()
        if transaction is None:
            raise HTTPException(404, "La transaction associée au paiement est introuvable.")
    try:
        record = lock_expected_revision(db, command.target)
    except HTTPException as exc:
        # A matching operation may commit while this request is waiting on the
        # target lock, advancing its revision. Resolve that retry before
        # returning the otherwise-correct stale-revision conflict.
        if exc.status_code == 409:
            previous = replay_result(db, command.operation_id, request_hash, actor_id)
            if previous is not None:
                return {**previous, "replayed": True}
        raise

    # Also recheck after acquiring the row lock: a concurrent matching request
    # can have committed while the initial operation lookup was in flight.
    previous = replay_result(db, command.operation_id, request_hash, actor_id)
    if previous is not None:
        return {**previous, "replayed": True}

    changes = _normalize_and_validate(command, record, db=db, transaction=transaction)
    dependencies = _dependencies(
        db, command.target.entity_type, record, transaction, lock=True, changes=changes,
    )
    # Revalidate after locking the complete dependency set, including both
    # source and destination bank accounts.
    changes = _normalize_and_validate(command, record, db=db, transaction=transaction)
    stock_plan = _stock_plan(db, command, record, changes)
    if stock_plan:
        dependencies['stock_plan'] = stock_plan
        dependencies['stock'] = stock_dependencies(db)
    before = _snapshot(command.target.entity_type, record)
    fingerprint = _dependency_fingerprint(
        command.target.entity_type, command.target.entity_id,
        command.target.expected_version, changes, dependencies,
    )
    if getattr(command, "dependency_fingerprint", None) != fingerprint:
        raise HTTPException(409, "Les données liées à cette correction ont changé. Actualisez son aperçu avant de confirmer.")
    if stock_plan and stock_plan['kind'] == 'eggs':
        changes.update(id_production=stock_plan['source'], id_cycle=stock_plan['cycle'])
    actual_changes = {
        name: value
        for name, value in changes.items()
        if getattr(record, name) != _field_value(name, value)
    }
    allocation_changes = bool(stock_plan and stock_plan['kind']=='eggs' and stock_plan['before'] != stock_plan['after'])
    if not actual_changes and not allocation_changes:
        return {
            "operation_id": str(command.operation_id),
            "replayed": False,
            "target": command.target.model_dump(mode="json"),
            "record": before,
            "impact": _impact(command.target.entity_type, changes, record, transaction, db),
            "no_op": True,
        }

    if stock_plan:
        actual_changes['stock_revision'] = record.stock_revision + 1

    expected_after_version = record.row_version + 1
    modified_at = datetime.now(timezone.utc)
    result = {
        "operation_id": str(command.operation_id),
        "target": command.target.model_dump(mode="json"),
        "record": {
            **before,
            **actual_changes,
            "row_version": expected_after_version,
            "id_utilisateur_modification": actor_id,
            "date_modification": _json_value(modified_at),
        },
        "impact": _impact(command.target.entity_type, actual_changes, record, transaction, db),
    }
    if stock_plan:
        result['impact']['stock'] = stock_plan
    # The guard authorizes the normalized write, including derived account
    # clears. Retain submitted fields separately; retry hashing continues to
    # use the original command, independently of this authorization payload.
    authorized_payload = request_payload(command)
    authorized_payload["submitted_changes"] = deepcopy(authorized_payload["changes"])
    authorized_payload["changes"].update(actual_changes)
    operation = CorrectionOperation(
        operation_id=command.operation_id,
        request_hash=request_hash,
        id_utilisateur=actor_id,
        reason=command.reason,
        request_payload=authorized_payload,
        result_payload=result,
    )
    db.add(operation)
    try:
        db.flush()
    except IntegrityError:
        # Concurrent reuse of an operation UUID is resolved by reading the
        # committed result after rolling back this transaction.
        db.rollback()
        replayed = replay_result(db, command.operation_id, request_hash, actor_id)
        if replayed is not None:
            return {**replayed, "replayed": True}
        raise

    if db.get_bind().dialect.name == "postgresql":
        db.execute(
            text("SELECT set_config('app.correction_operation_id', :operation_id, true)"),
            {"operation_id": str(command.operation_id)},
        )

    for name, value in actual_changes.items():
        setattr(record, name, _field_value(name, value))
    record.id_utilisateur_modification = actor_id
    record.date_modification = modified_at
    if stock_plan:
        apply_stock_plan(db, record, stock_plan, actor, command.operation_id, command.reason)
    if command.target.entity_type == "paiement" and {
        "date_paiement", "montant", "type_paiement", "id_compte", "source_reglement",
    }.intersection(actual_changes):
        sync_payment_cash_movement(
            db,
            record,
            transaction,
            current_user=actor,
            reason=command.reason,
            operation_id=command.operation_id,
        )
    db.flush()
    # Verify the immutable replay payload against actual DB-generated values
    # while the target lock is still held, before making the operation durable.
    db.refresh(record)
    if (_snapshot(command.target.entity_type, record) != result["record"]
            or stock_plan and not stock_plan_matches(db, record, stock_plan)):
        db.rollback()
        raise HTTPException(409, "Le résultat enregistré diffère de la correction prévue. Actualisez son aperçu.")
    db.commit()
    return {**deepcopy(result), "replayed": False}
