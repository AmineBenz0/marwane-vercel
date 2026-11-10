"""Native PostgreSQL acceptance for the grouped correction writer.

Only run against disposable CI PostgreSQL AFTER the foundation and integrated
candidate migrations were installed. Never run this test against production.
"""
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import text

from app.models.caisse import Caisse
from app.models.client import Client
from app.models.correction_operation import CorrectionOperation, EntityRevision
from app.models.financial_correction import CorrectionFinanciere
from app.models.paiement import Paiement
from app.models.transaction import Transaction
from app.schemas.correction import CorrectionCommand, CorrectionApplyCommand
from app.services.correction_commands import preview_correction, apply_correction


def _cmd(entity_type, entity_id, version, changes):
    return CorrectionCommand(
        operation_id=uuid4(), reason="Correction métier contrôlée",
        target={"entity_type": entity_type, "entity_id": entity_id, "expected_version": version},
        changes=changes,
    )


def _ready(db, command):
    preview = preview_correction(db, command)
    return preview, CorrectionApplyCommand(
        **command.model_dump(exclude_unset=True),
        dependency_fingerprint=preview["dependency_fingerprint"],
    )


def test_correction_native_revision_ledger_and_replay(db_session, test_user, test_produit):
    db = db_session
    if db.bind.dialect.name != "postgresql":
        pytest.skip("Native correction acceptance requires isolated PostgreSQL")

    # Prove this is the disposable migrated CI database with active audit triggers.
    triggers = db.execute(text("""
      SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      WHERE c.relname='transactions' AND t.tgname='trg_correction_capture'
        AND t.tgenabled IN ('O','A')
    """)).scalar_one()
    assert triggers == 1

    customer = Client(nom_client="Client CI Corrections", est_actif=True)
    db.add(customer)
    db.flush()
    sale = Transaction(
        date_transaction=date.today(),
        date_echeance=date.today() + timedelta(days=7),
        id_client=customer.id_client, id_produit=test_produit.id_produit,
        quantite=10, prix_unitaire=Decimal("5.00"), montant_total=Decimal("50.00"),
        est_actif=True, id_utilisateur_creation=test_user.id_utilisateur,
    )
    db.add(sale)
    db.commit()
    db.refresh(sale)
    assert sale.row_version == 1

    change = _cmd("transaction", sale.id_transaction, sale.row_version,
                  {"date_echeance": date.today() + timedelta(days=14)})
    preview, apply = _ready(db, change)
    assert preview["before"]["montant_total"] == "50.00"
    assert preview["impact"]["cash"] == "unchanged"
    result = apply_correction(db, apply, test_user)
    db.refresh(sale)
    assert sale.row_version == 2
    assert sale.date_echeance == date.today() + timedelta(days=14)
    assert result["record"]["row_version"] == 2
    assert apply_correction(db, apply, test_user)["replayed"] is True
    assert db.query(CorrectionOperation).count() == 1
    assert db.query(EntityRevision).filter_by(
        entity_type="transaction", entity_id=sale.id_transaction).count() == 2
    with pytest.raises(HTTPException) as exc:
        apply_correction(db, apply.model_copy(update={"reason": "Conflit de réessai"}), test_user)
    assert exc.value.status_code == 409

    # Add a valid current cash payment, then correct its amount. The old cash
    # movement must be voided and replaced *once*, keeping the operation link.
    payment = Paiement(
        id_transaction=sale.id_transaction, date_paiement=date.today(),
        montant=Decimal("5.00"), type_paiement="cash", statut="valide",
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db.add(payment)
    db.flush()
    old_cash = Caisse(
        id_transaction=sale.id_transaction, id_paiement=payment.id_paiement,
        date_mouvement=datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc),
        montant=Decimal("5.00"), type_mouvement="ENTREE", statut="active",
    )
    db.add(old_cash)
    db.commit()
    db.refresh(payment)
    assert payment.row_version == 1
    correction = _cmd("paiement", payment.id_paiement, payment.row_version, {"montant": Decimal("6.00")})
    earlier, prepared = _ready(db, correction)
    assert earlier["impact"]["cash"]["before"]["amount"] == "5.00"
    written = apply_correction(db, prepared, test_user)
    db.refresh(payment)
    assert payment.montant == Decimal("6.00") and payment.row_version == 2
    active = db.query(Caisse).filter_by(id_paiement=payment.id_paiement, statut="active").all()
    assert len(active) == 1 and active[0].montant == Decimal("6.00")
    assert db.query(CorrectionFinanciere).filter_by(operation_id=correction.operation_id).count() > 0
    assert apply_correction(db, prepared, test_user)["replayed"] is True
    assert db.query(Caisse).filter_by(id_paiement=payment.id_paiement, statut="active").count() == 1

    # If someone else modifies a dependency after preview, apply must fail
    # without recording a partial operation or altering the original payment.
    stale = _cmd("paiement", payment.id_paiement, payment.row_version, {"montant": Decimal("7.00")})
    _, stale_apply = _ready(db, stale)
    db.query(Caisse).filter_by(id_mouvement=active[0].id_mouvement).update({"motif_annulation": "changed since preview"})
    db.commit()
    with pytest.raises(HTTPException) as exc:
        apply_correction(db, stale_apply, test_user)
    assert exc.value.status_code == 409
    db.refresh(payment)
    assert payment.montant == Decimal("6.00")
    assert db.query(CorrectionOperation).filter_by(operation_id=stale.operation_id).count() == 0
