from datetime import date, timedelta
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4
import pytest
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from app.models.correction_operation import CorrectionOperation
from app.models.caisse import Caisse
from app.models.client import Client
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.fournisseur import Fournisseur
from app.models.paiement import Paiement
from app.models.financial_correction import CorrectionFinanciere
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.schemas.correction import CorrectionApplyCommand, CorrectionCommand, CorrectionEnvelope, CorrectionTarget
from app.services.correction_commands import apply_correction, preview_correction


def prepared(db, command):
    preview = preview_correction(db, command)
    return CorrectionApplyCommand(
        **command.model_dump(exclude_unset=True),
        dependency_fingerprint=preview["dependency_fingerprint"],
    )


@pytest.fixture
def correction_transaction(db_session, test_user):
    supplier = Fournisseur(nom_fournisseur="Correction test", est_actif=True)
    product = Produit(nom_produit="Produit correction", pour_clients=False,
                      pour_fournisseurs=True, type_produit="matiere_premiere")
    db_session.add_all([supplier, product])
    db_session.flush()
    transaction = Transaction(
        date_transaction=date.today(), date_echeance=date.today() + timedelta(days=5),
        id_fournisseur=supplier.id_fournisseur, id_produit=product.id_produit,
        quantite=10, prix_unitaire=Decimal("2.50"), montant_total=Decimal("25.00"),
        est_actif=True, id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(transaction)
    db_session.commit()
    return transaction


@pytest.fixture
def correction_sale(db_session, test_user):
    client = Client(nom_client="Client correction")
    product = Produit(nom_produit="Produit vendu correction", pour_clients=True,
                      pour_fournisseurs=False, type_produit="produit_fini")
    db_session.add_all([client, product])
    db_session.flush()
    sale = Transaction(
        date_transaction=date.today(), id_client=client.id_client,
        id_produit=product.id_produit, quantite=10,
        prix_unitaire=Decimal("1.50"), montant_total=Decimal("15.00"),
        est_actif=True, id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(sale)
    db_session.flush()
    payment = Paiement(
        id_transaction=sale.id_transaction, date_paiement=date.today(),
        montant=Decimal("5.00"), type_paiement="cash", statut="valide",
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(payment)
    db_session.commit()
    return sale, payment
from app.services.correction_contract import lock_expected_revision, replay_result, request_fingerprint


@pytest.mark.parametrize("supplier", [False, True])
def test_bank_to_cash_authorizes_derived_account_clear_and_replays(
    db_session, correction_sale, correction_transaction, test_user, supplier,
):
    transaction = correction_transaction if supplier else correction_sale[0]
    payment = Paiement(
        id_transaction=transaction.id_transaction, date_paiement=transaction.date_transaction,
        montant=Decimal("5.00"), type_paiement="virement", statut="valide",
        source_reglement="banque" if supplier else None,
        id_utilisateur_creation=test_user.id_utilisateur,
    ) if supplier else correction_sale[1]
    payment.type_paiement = "virement"
    account = CompteBancaire(nom_banque="Correction route", numero_compte="CORR-ROUTE", solde_actuel=Decimal("-5.00" if supplier else "5.00"))
    db_session.add(account)
    db_session.flush()
    payment.id_compte = account.id_compte
    db_session.add(payment)
    db_session.flush()
    db_session.add(MouvementBancaire(
        id_compte=account.id_compte, montant=payment.montant,
        type_mouvement="SORTIE" if supplier else "ENTREE", source="virement",
        id_paiement=payment.id_paiement, statut="active",
        date_mouvement=datetime.combine(payment.date_paiement, datetime.min.time(), tzinfo=timezone.utc),
    ))
    db_session.commit()
    revision_trigger(db_session, "paiements", "type_paiement,id_compte,source_reglement")
    submitted = {"source_reglement": "caisse"} if supplier else {"type_paiement": "cash"}
    command = prepared(db_session, CorrectionCommand(
        operation_id=uuid4(), reason="Règlement effectué en caisse",
        target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},
        changes=submitted,
    ))
    result = apply_correction(db_session, command, test_user)
    operation = db_session.get(CorrectionOperation, command.operation_id)
    assert operation.request_payload["submitted_changes"] == submitted
    assert operation.request_payload["changes"] == {**submitted, "id_compte": None}
    assert operation.request_hash == request_fingerprint(command)
    assert result["record"]["id_compte"] is None
    db_session.refresh(account)
    assert account.solde_actuel == Decimal("0.00")
    active_cash = db_session.query(Caisse).filter(Caisse.id_paiement == payment.id_paiement, Caisse.statut == "active").one()
    assert active_cash.montant == Decimal("5.00")
    assert active_cash.type_mouvement == ("SORTIE" if supplier else "ENTREE")
    assert db_session.query(MouvementBancaire).filter(MouvementBancaire.id_paiement == payment.id_paiement, MouvementBancaire.statut == "active").count() == 0
    retry = apply_correction(db_session, command, test_user)
    assert retry["replayed"] is True
    assert retry["record"] == result["record"]
    assert retry["impact"] == result["impact"]
    assert db_session.query(CorrectionOperation).count() == 1


@pytest.mark.parametrize("clear_due_date", [False, True])
def test_service_date_and_due_date_correction_validates_final_pair(db_session, correction_transaction, test_user, clear_due_date):
    transaction = correction_transaction
    transaction.produit.type_produit = "service"
    transaction.date_transaction = date.today() - timedelta(days=10)
    transaction.date_echeance = date.today() - timedelta(days=5)
    db_session.commit()
    revision_trigger(db_session, "transactions", "date_transaction,date_echeance")
    final_due_date = None if clear_due_date else date.today() + timedelta(days=5)
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Dates du service corrigées ensemble",
        target={"entity_type":"transaction","entity_id":transaction.id_transaction,"expected_version":1},
        changes={"date_transaction": date.today(), "date_echeance": final_due_date},
    )
    result = apply_correction(db_session, prepared(db_session, command), test_user)
    assert result["record"]["date_transaction"] == date.today().isoformat()
    assert result["record"]["date_echeance"] == (final_due_date.isoformat() if final_due_date else None)
    invalid = CorrectionCommand(
        operation_id=uuid4(), reason="Dates incohérentes",
        target={"entity_type":"transaction","entity_id":transaction.id_transaction,"expected_version":2},
        changes={"date_transaction": date.today(), "date_echeance": date.today() - timedelta(days=1)},
    )
    with pytest.raises(HTTPException):
        preview_correction(db_session, invalid)
    assert db_session.query(CorrectionOperation).count() == 1


@pytest.mark.parametrize("endpoint", ["preview", "apply"])
def test_explicit_null_payment_method_returns_422(client, auth_headers, endpoint):
    payload = {
        "operation_id": str(uuid4()), "reason": "Moyen de paiement manquant",
        "target": {"entity_type":"paiement","entity_id":1,"expected_version":1},
        "changes": {"type_paiement": None},
    }
    if endpoint == "apply":
        payload["dependency_fingerprint"] = "a" * 64
    response = client.post(f"/api/v1/corrections/{endpoint}", json=payload, headers=auth_headers)
    assert response.status_code == 422, response.text
    assert "moyen de paiement" in response.text


def test_validated_contract_rejects_blank_reason_and_invalid_version():
    with pytest.raises(ValidationError):
        CorrectionEnvelope(operation_id=uuid4(), reason="   ", target={"entity_type":"transaction", "entity_id":1,"expected_version":1})
    with pytest.raises(ValidationError):
        CorrectionTarget(entity_type="transaction", entity_id=1, expected_version=0)


def test_fingerprint_preserves_exact_decimal_and_dictionary_order():
    class Request(BaseModel):
        values: dict[str, Decimal]
    a = Request(values={"a":Decimal("9007199254740993.01"),"b":Decimal("2")})
    b = Request(values={"b":Decimal("2"),"a":Decimal("9007199254740993.01")})
    c = Request(values={"a":Decimal("9007199254740993.02"),"b":Decimal("2")})
    assert request_fingerprint(a) == request_fingerprint(b)
    assert request_fingerprint(a) != request_fingerprint(c)


def test_operation_replay_checks_actor_and_payload_without_writes(db_session, test_user):
    operation_id = uuid4()
    assert replay_result(db_session, operation_id, "a"*64, test_user.id_utilisateur) is None
    db_session.add(CorrectionOperation(operation_id=operation_id, request_hash="a"*64,
        id_utilisateur=test_user.id_utilisateur, reason="Correction", request_payload={}, result_payload={"saved":True}))
    db_session.commit()
    assert replay_result(db_session, operation_id,"a"*64,test_user.id_utilisateur)=={"saved":True}
    for fingerprint, actor in [("b"*64,test_user.id_utilisateur),("a"*64,test_user.id_utilisateur+1)]:
        with pytest.raises(HTTPException) as error:
            replay_result(db_session, operation_id, fingerprint, actor)
        assert error.value.status_code == 409
    assert not db_session.dirty and not db_session.new


def test_missing_target_is_404(db_session):
    with pytest.raises(HTTPException) as error:
        lock_expected_revision(db_session, CorrectionTarget(entity_type="paiement",entity_id=999,expected_version=1))
    assert error.value.status_code == 404


def test_preview_and_apply_create_one_atomic_versioned_operation(db_session, correction_transaction, test_user):
    from sqlalchemy import text
    # SQLite does not install the PostgreSQL foundation triggers, so mirror the
    # DB-managed revision increment needed by this command-service integration test.
    db_session.execute(text("""
        CREATE TRIGGER test_transaction_revision AFTER UPDATE OF date_echeance ON transactions
        BEGIN UPDATE transactions SET row_version=OLD.row_version+1
        WHERE id_transaction=OLD.id_transaction; END
    """))
    db_session.commit()
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Date d’échéance mal saisie",
        target={"entity_type":"transaction","entity_id":correction_transaction.id_transaction,"expected_version":1},
        changes={"date_echeance": correction_transaction.date_echeance + timedelta(days=1)},
    )
    before_count = db_session.query(CorrectionOperation).count()
    preview = preview_correction(db_session, command)
    assert preview["before"]["row_version"] == 1
    assert preview["after"]["row_version"] == 1
    assert preview["impact"]["cash"] == "unchanged"
    assert db_session.query(CorrectionOperation).count() == before_count

    command = prepared(db_session, command)
    applied = apply_correction(db_session, command, test_user)
    assert applied["record"]["row_version"] == 2
    assert db_session.query(CorrectionOperation).count() == before_count + 1
    saved = db_session.query(CorrectionOperation).one()
    assert saved.result_payload["record"]["row_version"] == 2
    replayed = apply_correction(db_session, command, test_user)
    assert replayed["replayed"] is True
    assert db_session.query(CorrectionOperation).count() == before_count + 1


def test_correction_noop_does_not_create_operation(db_session, correction_transaction, test_user):
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Vérification",
        target={"entity_type":"transaction","entity_id":correction_transaction.id_transaction,"expected_version":1},
        changes={"date_echeance": correction_transaction.date_echeance},
    )
    command = prepared(db_session, command)
    result = apply_correction(db_session, command, test_user)
    assert result["no_op"] is True
    assert db_session.query(CorrectionOperation).count() == 0


def test_correction_rejects_stale_expected_version(db_session, correction_transaction, test_user):
    from fastapi import HTTPException
    from sqlalchemy import update
    db_session.execute(
        update(Transaction).where(Transaction.id_transaction == correction_transaction.id_transaction)
        .values(row_version=2), execution_options={"synchronize_session": False},
    )
    db_session.commit()
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Date d’échéance corrigée",
        target={"entity_type":"transaction","entity_id":correction_transaction.id_transaction,"expected_version":1},
        changes={"date_echeance": correction_transaction.date_echeance},
    )
    with pytest.raises(HTTPException) as error:
        apply_correction(db_session, command, test_user)
    assert error.value.status_code == 409


def test_matching_retry_after_lock_wait_replays_before_stale_conflict(db_session, correction_transaction, test_user, monkeypatch):
    from fastapi import HTTPException
    from sqlalchemy import update
    import app.services.correction_commands as commands

    db_session.execute(
        update(Transaction).where(Transaction.id_transaction == correction_transaction.id_transaction)
        .values(row_version=2), execution_options={"synchronize_session": False},
    )
    db_session.commit()
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Rejeu après attente du verrou",
        target={"entity_type":"transaction","entity_id":correction_transaction.id_transaction,"expected_version":1},
        changes={"date_echeance": correction_transaction.date_echeance + timedelta(days=1)},
    )
    committed_result = {
        "operation_id": str(command.operation_id),
        "target": command.target.model_dump(mode="json"),
        "record": {"row_version": 2},
        "impact": {"cash":"unchanged"},
    }
    calls = {"count": 0}
    def replay_after_stale(*args):
        calls["count"] += 1
        return None if calls["count"] == 1 else committed_result
    monkeypatch.setattr(commands, "replay_result", replay_after_stale)

    command = CorrectionApplyCommand(**command.model_dump(exclude_unset=True), dependency_fingerprint="0"*64)
    response = apply_correction(db_session, command, test_user)
    assert response["replayed"] is True
    assert response["record"]["row_version"] == 2


def test_failed_commit_rolls_back_operation_and_record(db_session, correction_transaction, test_user, monkeypatch):
    from sqlalchemy import text
    db_session.execute(text("""
        CREATE TRIGGER test_transaction_revision AFTER UPDATE OF date_echeance ON transactions
        BEGIN UPDATE transactions SET row_version=OLD.row_version+1
        WHERE id_transaction=OLD.id_transaction; END
    """))
    db_session.commit()
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Correction à annuler",
        target={"entity_type":"transaction","entity_id":correction_transaction.id_transaction,"expected_version":1},
        changes={"date_echeance": correction_transaction.date_echeance + timedelta(days=1)},
    )
    command = prepared(db_session, command)
    def fail_commit():
        raise RuntimeError("simulated commit failure")
    monkeypatch.setattr(db_session, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="simulated commit failure"):
        apply_correction(db_session, command, test_user)
    db_session.rollback()
    db_session.expire_all()
    assert db_session.query(CorrectionOperation).count() == 0
    assert db_session.get(Transaction, correction_transaction.id_transaction).date_echeance == command.changes.date_echeance - timedelta(days=1)


def test_paid_sale_price_correction_recalculates_total_without_changing_payment(db_session, correction_sale, test_user):
    from sqlalchemy import text
    sale, payment = correction_sale
    db_session.execute(text("""
        CREATE TRIGGER test_transaction_revision AFTER UPDATE OF prix_unitaire, montant_total ON transactions
        BEGIN UPDATE transactions SET row_version=OLD.row_version+1
        WHERE id_transaction=OLD.id_transaction; END
    """))
    db_session.commit()
    original_payment = payment.montant
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Prix de vente mal saisi",
        target={"entity_type":"transaction","entity_id":sale.id_transaction,"expected_version":1},
        changes={"prix_unitaire":"2.25"},
    )
    preview = preview_correction(db_session, command)
    assert preview["after"]["montant_total"] == "22.50"
    assert preview["impact"]["receivable"] == "recalculated from the corrected sale total"
    command = prepared(db_session, command)
    applied = apply_correction(db_session, command, test_user)
    assert applied["record"]["prix_unitaire"] == "2.25"
    assert applied["record"]["montant_total"] == "22.50"
    db_session.refresh(payment)
    assert payment.montant == original_payment == Decimal("5.00")
    assert sale.montant_restant == Decimal("17.50")


def test_purchase_price_correction_waits_for_stock_cost_adapter(db_session, correction_transaction):
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Coût d’achat à corriger",
        target={"entity_type":"transaction","entity_id":correction_transaction.id_transaction,"expected_version":1},
        changes={"prix_unitaire":"3.00"},
    )
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session, command)
    assert error.value.status_code == 409
    assert "valorisation du stock" in error.value.detail


@pytest.mark.parametrize(
    ("entity_type", "changes"),
    [
        ("transaction", {"prix_unitaire": None}),
        ("paiement", {"date_paiement": None}),
        ("paiement", {"montant": None}),
    ],
)
def test_required_correction_values_reject_null(db_session, correction_sale, entity_type, changes):
    sale, payment = correction_sale
    entity = sale if entity_type == "transaction" else payment
    entity_id = entity.id_transaction if entity_type == "transaction" else entity.id_paiement
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Valeur obligatoire manquante",
        target={"entity_type": entity_type, "entity_id": entity_id, "expected_version": 1},
        changes=changes,
    )
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session, command)
    assert error.value.status_code == 422


def test_cash_payment_date_and_amount_correction_replaces_ledger_once(db_session, correction_sale, test_user):
    from sqlalchemy import text
    sale, payment = correction_sale
    db_session.add(Caisse(
        montant=Decimal("5.00"), type_mouvement="ENTREE", statut="active",
        id_transaction=sale.id_transaction, id_paiement=payment.id_paiement,
        date_mouvement=datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc),
    ))
    db_session.execute(text("""
        CREATE TRIGGER test_payment_revision AFTER UPDATE OF date_paiement, montant ON paiements
        BEGIN UPDATE paiements SET row_version=OLD.row_version+1
        WHERE id_paiement=OLD.id_paiement; END
    """))
    db_session.commit()
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Date et montant du paiement corrigés",
        target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},
        changes={"date_paiement":date.today() + timedelta(days=1),"montant":"8.00"},
    )
    preview = preview_correction(db_session, command)
    assert preview["impact"]["cash"]["before"]["amount"] == "5.00"
    assert preview["impact"]["cash"]["after"]["amount"] == "8.00"
    command = prepared(db_session, command)
    result = apply_correction(db_session, command, test_user)
    assert result["record"]["row_version"] == 2
    assert result["record"]["montant"] == "8.00"
    assert result["record"]["date_paiement"] == command.changes.date_paiement.isoformat()
    movements = db_session.query(Caisse).filter(Caisse.id_paiement == payment.id_paiement).all()
    assert len(movements) == 2
    assert [m.statut for m in movements].count("active") == 1
    active = next(m for m in movements if m.statut == "active")
    assert active.montant == Decimal("8.00")
    assert active.date_mouvement.date() == command.changes.date_paiement
    assert db_session.query(CorrectionFinanciere).filter(
        CorrectionFinanciere.operation_id == command.operation_id,
    ).count() >= 1


@pytest.fixture
def cash_payment(db_session, correction_sale):
    sale, payment = correction_sale
    movement = Caisse(
        montant=payment.montant, type_mouvement="ENTREE", statut="active",
        id_transaction=sale.id_transaction, id_paiement=payment.id_paiement,
        date_mouvement=datetime.combine(payment.date_paiement, datetime.min.time(), tzinfo=timezone.utc),
    )
    db_session.add(movement)
    db_session.commit()
    return sale, payment, movement


def revision_trigger(db, table, fields):
    from sqlalchemy import text
    key = "id_transaction" if table == "transactions" else "id_paiement"
    db.execute(text(f"""CREATE TRIGGER correction_test_revision AFTER UPDATE OF {fields} ON {table}
      BEGIN UPDATE {table} SET row_version=OLD.row_version+1 WHERE {key}=OLD.{key}; END"""))
    db.commit()


@pytest.mark.parametrize("changes", [{"montant": "8.00"}, {"date_paiement": date.today()+timedelta(days=1)}])
def test_single_field_payment_corrections_preserve_omitted_fields(db_session, cash_payment, test_user, changes):
    sale, payment, movement = cash_payment
    revision_trigger(db_session, "paiements", "montant,date_paiement")
    command = prepared(db_session, CorrectionCommand(
        operation_id=uuid4(), reason="Correction d’un seul champ",
        target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},
        changes=changes,
    ))
    result = apply_correction(db_session, command, test_user)
    saved = db_session.get(CorrectionOperation, command.operation_id)
    assert set(saved.request_payload["changes"]) == set(changes)
    assert result["record"]["row_version"] == 2
    assert db_session.query(Caisse).filter(Caisse.statut == "active").one().montant == Decimal(changes.get("montant", "5.00"))
    retry = apply_correction(db_session, command, test_user)
    assert retry["record"] == result["record"]
    assert retry["impact"] == result["impact"]
    assert retry["replayed"] is True


@pytest.mark.parametrize("kind,changes", [("transaction", {"prix_unitaire":"1.5"}), ("paiement", {"montant":"5.0"})])
def test_equal_decimal_scale_is_a_noop(db_session, cash_payment, test_user, kind, changes):
    sale, payment, movement = cash_payment
    command = prepared(db_session, CorrectionCommand(
        operation_id=uuid4(), reason="Même valeur, présentation différente",
        target={"entity_type":kind,"entity_id":sale.id_transaction if kind == "transaction" else payment.id_paiement,"expected_version":1},
        changes=changes,
    ))
    result = apply_correction(db_session, command, test_user)
    assert result["no_op"] is True
    assert result["record"]["row_version"] == 1
    assert db_session.query(CorrectionOperation).count() == 0
    assert db_session.query(Caisse).count() == 1
    assert db_session.query(CorrectionFinanciere).count() == 0


def test_replay_keeps_actual_timestamp_and_actor_even_after_later_edit(db_session, correction_sale, test_user):
    sale, _ = correction_sale
    sale.date_modification = datetime(2000,1,1,tzinfo=timezone.utc)
    db_session.commit()
    revision_trigger(db_session, "transactions", "date_echeance")
    command = prepared(db_session, CorrectionCommand(
        operation_id=uuid4(), reason="Historique fidèle",
        target={"entity_type":"transaction","entity_id":sale.id_transaction,"expected_version":1},
        changes={"date_echeance":date.today()+timedelta(days=1)},
    ))
    first = apply_correction(db_session, command, test_user)
    saved = db_session.get(CorrectionOperation, command.operation_id)
    assert saved.result_payload["record"] == first["record"]
    assert first["record"]["id_utilisateur_modification"] == test_user.id_utilisateur
    assert first["record"]["date_modification"].startswith("2000") is False
    sale.date_echeance = date.today()+timedelta(days=2)
    db_session.commit()
    retry = apply_correction(db_session, command, test_user)
    assert retry["record"] == first["record"]


@pytest.mark.parametrize("field,value", [
    ("montant", Decimal("999")), ("type_mouvement", "SORTIE"),
    ("date_mouvement", datetime(2000,1,1,tzinfo=timezone.utc)), ("id_transaction", None),
])
def test_inconsistent_cash_blocks_preview_and_apply(db_session, cash_payment, test_user, field, value):
    sale, payment, movement = cash_payment
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Ne pas réparer une incohérence indirectement",
        target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},
        changes={"montant":"8.00"},
    )
    confirmed = prepared(db_session, command)
    setattr(movement, field, value)
    db_session.commit()
    for action, request in [(preview_correction, command), (lambda db, cmd: apply_correction(db,cmd,test_user), confirmed)]:
        with pytest.raises(HTTPException) as error:
            action(db_session, request)
        assert error.value.status_code == 409
    assert db_session.query(CorrectionOperation).count() == 0


@pytest.mark.parametrize("dependency", ["parent", "payment", "cash"])
def test_apply_rejects_dependency_changed_since_preview(db_session, cash_payment, test_user, dependency):
    sale, payment, movement = cash_payment
    command = prepared(db_session, CorrectionCommand(
        operation_id=uuid4(), reason="Aperçu périmé",
        target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},
        changes={"notes":"Nouvelle note"},
    ))
    if dependency == "parent":
        sale.date_echeance = date.today()+timedelta(days=5)
    elif dependency == "payment":
        db_session.add(Paiement(id_transaction=sale.id_transaction,date_paiement=date.today(),montant=Decimal("1"),type_paiement="cash",statut="valide"))
    else:
        movement.motif_annulation = "Modification indirecte"
    db_session.commit()
    with pytest.raises(HTTPException) as error:
        apply_correction(db_session, command, test_user)
    assert error.value.status_code == 409
    assert db_session.query(CorrectionOperation).count() == 0
    assert payment.notes is None


def test_apply_contract_requires_preview_fingerprint():
    with pytest.raises(ValidationError):
        CorrectionApplyCommand(operation_id=uuid4(),reason="Aperçu obligatoire",target={"entity_type":"transaction","entity_id":1,"expected_version":1},changes={"date_echeance":None})


def test_payload_keeps_explicit_null_and_normalizes_money():
    from app.services.correction_contract import request_payload
    command = CorrectionCommand(operation_id=uuid4(),reason="Normaliser",target={"entity_type":"transaction","entity_id":1,"expected_version":1},changes={"date_echeance":None,"prix_unitaire":"1.5"})
    payload = request_payload(command)
    assert payload["changes"] == {"date_echeance":None,"prix_unitaire":"1.50"}
    same = command.model_copy(update={"changes":command.changes.model_copy(update={"prix_unitaire":Decimal("1.50")})})
    assert request_fingerprint(command) == request_fingerprint(same)


def test_cash_correction_rolls_back_all_writes_on_commit_failure(db_session, cash_payment, test_user, monkeypatch):
    sale, payment, movement = cash_payment
    revision_trigger(db_session, "paiements", "montant,date_paiement")
    command = prepared(db_session, CorrectionCommand(operation_id=uuid4(),reason="Échec atomique",target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},changes={"montant":"8.00"}))
    def fail_commit():
        raise RuntimeError("commit failure")
    monkeypatch.setattr(db_session,"commit",fail_commit)
    with pytest.raises(RuntimeError,match="commit failure"):
        apply_correction(db_session,command,test_user)
    db_session.rollback()
    db_session.expire_all()
    assert db_session.query(CorrectionOperation).count() == 0
    assert db_session.query(CorrectionFinanciere).count() == 0
    assert db_session.query(Caisse).count() == 1
    assert db_session.get(Caisse,movement.id_mouvement).statut == "active"
    assert db_session.get(Paiement,payment.id_paiement).montant == Decimal("5.00")
    assert db_session.get(Paiement,payment.id_paiement).row_version == 1


def test_database_result_mismatch_rolls_back_the_operation(db_session, correction_sale, test_user):
    from sqlalchemy import text
    sale, _ = correction_sale
    revision_trigger(db_session, "transactions", "date_echeance")
    db_session.execute(text("""CREATE TRIGGER unexpected_db_change AFTER UPDATE OF date_echeance ON transactions
      BEGIN UPDATE transactions SET date_modification='2000-01-01 00:00:00' WHERE id_transaction=OLD.id_transaction; END"""))
    db_session.commit()
    command = prepared(db_session,CorrectionCommand(operation_id=uuid4(),reason="Résultat non conforme",target={"entity_type":"transaction","entity_id":sale.id_transaction,"expected_version":1},changes={"date_echeance":date.today()+timedelta(days=2)}))
    with pytest.raises(HTTPException) as error:
        apply_correction(db_session,command,test_user)
    assert error.value.status_code == 409
    assert db_session.query(CorrectionOperation).count() == 0
    assert db_session.get(Transaction,sale.id_transaction).date_echeance is None
    assert db_session.get(Transaction,sale.id_transaction).row_version == 1


def test_supplier_payment_can_move_from_cashbox_to_bank_atomically(db_session, correction_transaction, test_user):
    account = CompteBancaire(
        nom_banque="Compte test", numero_compte="CORR-001", solde_actuel=Decimal("100.00"),
    )
    db_session.add(account)
    db_session.flush()
    db_session.add(MouvementBancaire(
        id_compte=account.id_compte, montant=Decimal("100.00"), type_mouvement="ENTREE",
        source="initial", statut="active",
    ))
    payment = Paiement(
        id_transaction=correction_transaction.id_transaction,
        date_paiement=correction_transaction.date_transaction,
        montant=Decimal("5.00"), type_paiement="cash", source_reglement="caisse",
        statut="valide", id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(payment)
    db_session.flush()
    original = Caisse(
        montant=payment.montant, type_mouvement="SORTIE", statut="active",
        id_transaction=correction_transaction.id_transaction, id_paiement=payment.id_paiement,
        date_mouvement=datetime.combine(payment.date_paiement, datetime.min.time(), tzinfo=timezone.utc),
    )
    db_session.add(original)
    db_session.commit()
    revision_trigger(db_session, "paiements", "type_paiement,id_compte,source_reglement")
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Le règlement provenait du compte bancaire",
        target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},
        changes={"source_reglement":"banque", "id_compte":account.id_compte},
    )
    preview = preview_correction(db_session, command)
    assert preview["impact"]["cash"]["before"]["amount"] == "5.00"
    assert preview["impact"]["cash"]["after"] is None
    assert preview["impact"]["bank"]["after"]["account_id"] == account.id_compte
    assert preview["impact"]["bank"]["account_balances"] == [
        {"account_id":account.id_compte,"before":"100.00","after":"95.00"},
    ]
    result = apply_correction(db_session, prepared(db_session, command), test_user)

    db_session.refresh(account)
    db_session.refresh(payment)
    assert payment.source_reglement == "banque"
    assert payment.id_compte == account.id_compte
    assert account.solde_actuel == Decimal("95.00")
    assert db_session.query(Caisse).filter(
        Caisse.id_paiement == payment.id_paiement, Caisse.statut == "active",
    ).count() == 0
    movements = db_session.query(MouvementBancaire).filter(
        MouvementBancaire.id_paiement == payment.id_paiement, MouvementBancaire.statut == "active",
    ).all()
    assert len(movements) == 1
    assert movements[0].id_compte == account.id_compte
    assert movements[0].type_mouvement == "SORTIE"
    assert result["record"]["row_version"] == 2
    assert db_session.query(CorrectionFinanciere).filter(
        CorrectionFinanciere.operation_id == command.operation_id,
    ).count() >= 1


def test_bank_balance_change_after_preview_requires_fresh_confirmation(db_session, correction_transaction, test_user):
    account = CompteBancaire(
        nom_banque="Compte aperçu", numero_compte="CORR-002", solde_actuel=Decimal("100.00"),
    )
    db_session.add(account)
    db_session.flush()
    db_session.add(MouvementBancaire(
        id_compte=account.id_compte, montant=Decimal("100.00"), type_mouvement="ENTREE",
        source="initial", statut="active",
    ))
    payment = Paiement(
        id_transaction=correction_transaction.id_transaction,
        date_paiement=correction_transaction.date_transaction,
        montant=Decimal("5.00"), type_paiement="cash", source_reglement="caisse",
        statut="valide", id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(payment)
    db_session.flush()
    db_session.add(Caisse(
        montant=payment.montant, type_mouvement="SORTIE", statut="active",
        id_transaction=correction_transaction.id_transaction, id_paiement=payment.id_paiement,
        date_mouvement=datetime.combine(payment.date_paiement, datetime.min.time(), tzinfo=timezone.utc),
    ))
    db_session.commit()
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Affecter le règlement à la banque",
        target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},
        changes={"source_reglement":"banque", "id_compte":account.id_compte},
    )
    preview = preview_correction(db_session, command)
    db_session.query(CompteBancaire).filter(
        CompteBancaire.id_compte == account.id_compte,
    ).update({"solde_actuel":Decimal("110.00")}, synchronize_session=False)
    db_session.add(MouvementBancaire(
        id_compte=account.id_compte, montant=Decimal("10.00"), type_mouvement="ENTREE",
        source="adjustment", statut="active",
    ))
    db_session.commit()
    apply_command = CorrectionApplyCommand(
        **command.model_dump(exclude_unset=True),
        dependency_fingerprint=preview["dependency_fingerprint"],
    )
    with pytest.raises(HTTPException) as error:
        apply_correction(db_session, apply_command, test_user)
    assert error.value.status_code == 409
    db_session.refresh(payment)
    assert payment.source_reglement == "caisse"
    assert db_session.query(MouvementBancaire).filter(
        MouvementBancaire.id_paiement == payment.id_paiement, MouvementBancaire.statut == "active",
    ).count() == 0
    assert db_session.query(CorrectionOperation).filter(
        CorrectionOperation.operation_id == command.operation_id,
    ).count() == 0


def test_supplier_payment_account_change_reconciles_both_accounts(db_session, correction_transaction, test_user):
    old_account = CompteBancaire(
        nom_banque="Ancienne banque", numero_compte="CORR-003", solde_actuel=Decimal("95.00"),
    )
    new_account = CompteBancaire(
        nom_banque="Nouvelle banque", numero_compte="CORR-004", solde_actuel=Decimal("200.00"),
    )
    db_session.add_all([old_account, new_account])
    db_session.flush()
    payment = Paiement(
        id_transaction=correction_transaction.id_transaction,
        date_paiement=correction_transaction.date_transaction,
        montant=Decimal("5.00"), type_paiement="virement", source_reglement="banque",
        id_compte=old_account.id_compte, statut="valide",
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(payment)
    db_session.flush()
    db_session.add_all([
        MouvementBancaire(id_compte=old_account.id_compte, montant=Decimal("100.00"), type_mouvement="ENTREE", source="initial", statut="active"),
        MouvementBancaire(
            id_compte=old_account.id_compte, montant=Decimal("5.00"), type_mouvement="SORTIE",
            source="virement", statut="active", id_paiement=payment.id_paiement,
            date_mouvement=datetime.combine(payment.date_paiement, datetime.min.time(), tzinfo=timezone.utc),
        ),
        MouvementBancaire(id_compte=new_account.id_compte, montant=Decimal("200.00"), type_mouvement="ENTREE", source="initial", statut="active"),
    ])
    db_session.commit()
    revision_trigger(db_session, "paiements", "id_compte")
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Règlement rattaché au mauvais compte",
        target={"entity_type":"paiement","entity_id":payment.id_paiement,"expected_version":1},
        changes={"id_compte":new_account.id_compte},
    )
    preview = preview_correction(db_session, command)
    assert preview["impact"]["bank"]["account_balances"] == [
        {"account_id":old_account.id_compte,"before":"95.00","after":"100.00"},
        {"account_id":new_account.id_compte,"before":"200.00","after":"195.00"},
    ]
    apply_correction(db_session, prepared(db_session, command), test_user)
    db_session.refresh(old_account)
    db_session.refresh(new_account)
    db_session.refresh(payment)
    assert old_account.solde_actuel == Decimal("100.00")
    assert new_account.solde_actuel == Decimal("195.00")
    assert payment.id_compte == new_account.id_compte
    active = db_session.query(MouvementBancaire).filter(
        MouvementBancaire.id_paiement == payment.id_paiement,
        MouvementBancaire.statut == "active",
    ).one()
    assert active.id_compte == new_account.id_compte


def test_transaction_date_correction_is_limited_to_service_records(db_session, correction_sale, test_user):
    stock_sale, _ = correction_sale
    blocked = CorrectionCommand(
        operation_id=uuid4(), reason="Date de vente corrigée",
        target={"entity_type":"transaction","entity_id":stock_sale.id_transaction,"expected_version":1},
        changes={"date_transaction":date.today() - timedelta(days=1)},
    )
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session, blocked)
    assert error.value.status_code == 409

    client = Client(nom_client="Client service correction")
    service = Produit(nom_produit="Service de correction date", type_produit="service")
    db_session.add_all([client, service])
    db_session.flush()
    transaction = Transaction(
        date_transaction=date.today(), date_echeance=date.today() + timedelta(days=10),
        id_client=client.id_client, id_produit=service.id_produit, quantite=1,
        prix_unitaire=Decimal("20.00"), montant_total=Decimal("20.00"), est_actif=True,
    )
    db_session.add(transaction)
    db_session.flush()
    db_session.add(Paiement(
        id_transaction=transaction.id_transaction,
        date_paiement=date.today() - timedelta(days=5),
        montant=Decimal("2.00"), type_paiement="cash", statut="annule",
    ))
    db_session.add(Paiement(
        id_transaction=transaction.id_transaction,
        date_paiement=date.today(),
        montant=Decimal("3.00"), type_paiement="cash", statut="valide",
    ))
    db_session.commit()
    revision_trigger(db_session, "transactions", "date_transaction")
    later_than_payment = CorrectionCommand(
        operation_id=uuid4(), reason="Date postérieure au paiement",
        target={"entity_type":"transaction","entity_id":transaction.id_transaction,"expected_version":1},
        changes={"date_transaction":date.today() + timedelta(days=1)},
    )
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session, later_than_payment)
    assert error.value.status_code == 409
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Date de service saisie trop tard",
        target={"entity_type":"transaction","entity_id":transaction.id_transaction,"expected_version":1},
        changes={"date_transaction":date.today() - timedelta(days=2)},
    )
    preview = preview_correction(db_session, command)
    assert preview["impact"]["reporting_periods"]["after"] == (date.today() - timedelta(days=2)).isoformat()
    result = apply_correction(db_session, prepared(db_session, command), test_user)
    db_session.refresh(transaction)
    assert transaction.date_transaction == date.today() - timedelta(days=2)
    assert result["record"]["row_version"] == 2


def test_transaction_contact_correction_preserves_side_and_linked_payment(db_session, correction_sale, test_user):
    sale, payment = correction_sale
    replacement = Client(nom_client="Client de remplacement", est_actif=True)
    db_session.add(replacement)
    db_session.commit()
    revision_trigger(db_session, "transactions", "id_client")
    original_contact = sale.id_client
    command = CorrectionCommand(
        operation_id=uuid4(), reason="Vente attribuée au mauvais client",
        target={"entity_type":"transaction","entity_id":sale.id_transaction,"expected_version":1},
        changes={"id_client":replacement.id_client},
    )
    preview = preview_correction(db_session, command)
    assert preview["impact"]["contact_balance"] == {"from":original_contact,"to":replacement.id_client}
    applied = apply_correction(db_session, prepared(db_session, command), test_user)
    db_session.refresh(sale)
    db_session.refresh(payment)
    assert sale.id_client == replacement.id_client
    assert payment.id_transaction == sale.id_transaction
    assert payment.montant == Decimal("5.00")
    assert applied["record"]["row_version"] == 2
