"""Phase 6E-B conversion: linked replacement, rollback, payment and stock invariants."""
from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.caisse import Caisse
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.inventory import MouvementStock
from app.models.paiement import Paiement
from app.models.produit import Produit
from app.models.transaction import Transaction
from app.models.correction_operation import CorrectionOperation
from app.schemas.conversion import ConversionApplyCommand, ConversionPreviewCommand
from app.services.financial_ledger import sync_payment_cash_movement
from app.services.inventory import get_stock_quantity
from app.services.transaction_conversion import (
    apply_conversion, conversion_link, preview_conversion,
)
from app.services.transaction_restoration import build_reactivation_preview


@pytest.fixture
def conversion_case(db_session, test_user):
    buyer = Client(nom_client="Acheteur conversion", est_actif=True)
    vendor = Fournisseur(nom_fournisseur="Fournisseur conversion", est_actif=True)
    sold = Produit(nom_produit="Prestation vendue conversion", type_produit="service",
                   pour_clients=True, pour_fournisseurs=False, est_actif=True)
    bought = Produit(nom_produit="Prestation achetée conversion", type_produit="service",
                     pour_clients=False, pour_fournisseurs=True, est_actif=True)
    db_session.add_all([buyer, vendor, sold, bought])
    db_session.flush()
    transaction = Transaction(
        date_transaction=date(2026, 10, 20), id_produit=sold.id_produit,
        quantite=3, prix_unitaire=Decimal("20.00"), montant_total=Decimal("60.00"),
        id_client=buyer.id_client, est_actif=True,
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(transaction)
    db_session.commit()
    return transaction, buyer, vendor, sold, bought


def preview_command(tx, contact, product, **overrides):
    return ConversionPreviewCommand(**{
        "expected_version": tx.row_version,
        "id_contact_cible": contact.id_fournisseur if hasattr(contact, "id_fournisseur") else contact.id_client,
        "id_produit_cible": product.id_produit, "quantite": tx.quantite, "prix_unitaire": tx.prix_unitaire,
        **overrides,
    })


def confirmed(tx, contact, product, db, **overrides):
    cmd = preview_command(tx, contact, product, **overrides)
    review = preview_conversion(db, tx.id_transaction, cmd)
    return ConversionApplyCommand(**cmd.model_dump(),
        operation_id=uuid4(), dependency_fingerprint=review["dependency_fingerprint"],
        annuler_paiements_existants=bool(review["paiements_a_annuler"]))


def test_preview_is_read_only_and_conversion_retains_both_links(
    db_session, conversion_case, test_user
):
    tx, buyer, vendor, sold, bought = conversion_case
    cmd = preview_command(tx, vendor, bought)
    before_count = db_session.query(Transaction).count()
    preview = preview_conversion(db_session, tx.id_transaction, cmd)
    assert preview["type_origine"] == "vente"
    assert preview["type_cible"] == "achat"
    assert preview["montant_total_cible"] == "60.00"
    assert preview["paiements_a_annuler"] == []
    assert db_session.query(Transaction).count() == before_count
    assert not db_session.dirty

    op = ConversionApplyCommand(**cmd.model_dump(), operation_id=uuid4(),
        dependency_fingerprint=preview["dependency_fingerprint"])
    outcome = apply_conversion(db_session, tx.id_transaction, op, test_user)
    db_session.expire_all()
    original = db_session.get(Transaction, tx.id_transaction)
    replacement = db_session.get(Transaction, outcome["id_transaction_remplacement"])
    assert original.est_actif is False
    assert replacement.est_actif is True
    assert replacement.id_client is None and replacement.id_fournisseur == vendor.id_fournisseur
    assert (replacement.id_produit, replacement.quantite, replacement.prix_unitaire) == (
        bought.id_produit, tx.quantite, Decimal("20.00"))
    assert conversion_link(db_session, original.id_transaction)["id_transaction_remplacement"] == replacement.id_transaction
    assert conversion_link(db_session, replacement.id_transaction)["id_transaction_origine"] == original.id_transaction
    assert db_session.query(CorrectionOperation).count() == 1
    with pytest.raises(HTTPException) as blocked:
        build_reactivation_preview(db_session, original)
    assert blocked.value.status_code == 409

    replay = apply_conversion(db_session, tx.id_transaction, op, test_user)
    assert replay["replayed"] is True
    assert replay["id_transaction_remplacement"] == replacement.id_transaction
    assert db_session.query(Transaction).count() == before_count + 1


def test_stale_preview_and_wrong_reuse_cannot_create_replacement(db_session, conversion_case, test_user):
    tx, buyer, vendor, sold, bought = conversion_case
    op = confirmed(tx, vendor, bought, db_session)
    stale = op.model_copy(update={"dependency_fingerprint": "0" * 64})
    with pytest.raises(HTTPException) as conflict:
        apply_conversion(db_session, tx.id_transaction, stale, test_user)
    assert conflict.value.status_code == 409
    assert db_session.query(Transaction).count() == 1
    assert tx.est_actif is True

    first = apply_conversion(db_session, tx.id_transaction, op, test_user)
    changed_request = op.model_copy(update={"quantite": 4})
    with pytest.raises(HTTPException) as reuse:
        apply_conversion(db_session, tx.id_transaction, changed_request, test_user)
    assert reuse.value.status_code == 409
    assert db_session.query(Transaction).count() == 2
    assert first["id_transaction_remplacement"] > 0


def test_cash_is_voided_atomically_only_after_explicit_confirmation(
    db_session, conversion_case, test_user
):
    tx, buyer, vendor, sold, bought = conversion_case
    payment = Paiement(id_transaction=tx.id_transaction, date_paiement=tx.date_transaction,
        montant=Decimal("20.00"), type_paiement="cash", statut="valide",
        id_utilisateur_creation=test_user.id_utilisateur)
    db_session.add(payment)
    db_session.flush()
    sync_payment_cash_movement(db_session, payment, tx, current_user=test_user)
    db_session.commit()
    op = confirmed(tx, vendor, bought, db_session)
    review = preview_conversion(db_session, tx.id_transaction,
        preview_command(tx, vendor, bought))
    assert [p["id_paiement"] for p in review["paiements_a_annuler"]] == [payment.id_paiement]

    no_consent = op.model_copy(update={"annuler_paiements_existants": False})
    with pytest.raises(HTTPException) as refused:
        apply_conversion(db_session, tx.id_transaction, no_consent, test_user)
    assert refused.value.status_code == 422
    db_session.refresh(payment)
    assert payment.statut == "valide"
    assert db_session.query(Transaction).count() == 1

    result = apply_conversion(db_session, tx.id_transaction, op, test_user)
    db_session.expire_all()
    assert db_session.get(Paiement, payment.id_paiement).statut == "annule"
    assert db_session.query(Paiement).filter(
        Paiement.id_transaction == result["id_transaction_remplacement"]).count() == 0
    assert db_session.query(Caisse).filter(
        Caisse.id_paiement == payment.id_paiement, Caisse.statut == "active").count() == 0
    assert result["paiements_annules"] == [payment.id_paiement]


def test_injected_failure_rolls_back_original_new_record_and_money(
    db_session, conversion_case, test_user, monkeypatch
):
    tx, buyer, vendor, sold, bought = conversion_case
    op = confirmed(tx, vendor, bought, db_session)

    def fail(*args, **kwargs):
        raise RuntimeError("Stock writer unavailable")
    monkeypatch.setattr("app.services.transaction_conversion.record_transaction_movement", fail)
    with pytest.raises(RuntimeError, match="Stock writer unavailable"):
        apply_conversion(db_session, tx.id_transaction, op, test_user)
    db_session.expire_all()
    assert db_session.get(Transaction, tx.id_transaction).est_actif is True
    assert db_session.query(Transaction).count() == 1
    assert db_session.query(CorrectionOperation).count() == 0


def test_block_instrument_payment_and_deferred_sale(db_session, conversion_case):
    tx, buyer, vendor, sold, bought = conversion_case
    tx.est_promesse = True
    db_session.commit()
    with pytest.raises(HTTPException) as deferred:
        preview_conversion(db_session, tx.id_transaction, preview_command(tx, vendor, bought))
    assert deferred.value.status_code == 409
    tx.est_promesse = False
    payment = Paiement(id_transaction=tx.id_transaction, date_paiement=tx.date_transaction,
        montant=Decimal("20.00"), type_paiement="cheque", statut="en_attente",
        statut_cheque="emis")
    db_session.add(payment)
    db_session.commit()
    with pytest.raises(HTTPException) as instrument:
        preview_conversion(db_session, tx.id_transaction, preview_command(tx, vendor, bought))
    assert instrument.value.status_code == 409


def test_reversal_keeps_purchase_stock_nonnegative_at_every_date(db_session, conversion_case):
    tx, buyer, vendor, sold, bought = conversion_case
    tx.id_client = None
    tx.id_fournisseur = vendor.id_fournisseur
    tx.id_produit = bought.id_produit
    tx.quantite = 10
    tx.prix_unitaire = Decimal("2.00")
    tx.montant_total = Decimal("20.00")
    bought.type_produit = "matiere_premiere"
    db_session.flush()
    db_session.add_all([
        MouvementStock(id_produit=bought.id_produit, quantite_delta=10, cout_unitaire=2,
            type_mouvement="achat", source_type="transaction", source_id=tx.id_transaction,
            date_mouvement=datetime(2026, 10, 20, tzinfo=timezone.utc)),
        MouvementStock(id_produit=bought.id_produit, quantite_delta=-9, cout_unitaire=2,
            type_mouvement="transformation_input", source_type="transformation", source_id=123,
            date_mouvement=datetime(2026, 10, 21, tzinfo=timezone.utc)),
    ])
    db_session.commit()
    with pytest.raises(HTTPException) as error:
        preview_conversion(db_session, tx.id_transaction, preview_command(tx, buyer, sold))
    assert error.value.status_code == 409
    assert get_stock_quantity(db_session, bought.id_produit) == Decimal("1")


def test_invalid_target_type_is_rejected(db_session, conversion_case):
    tx, buyer, vendor, sold, bought = conversion_case
    with pytest.raises(HTTPException) as wrong_product:
        preview_conversion(db_session, tx.id_transaction, preview_command(tx, vendor, sold))
    assert wrong_product.value.status_code == 409
