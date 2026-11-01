from datetime import date, timedelta, datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest

from app.models.transaction import Transaction
from app.models.paiement import Paiement
from app.models.caisse import Caisse
from app.models.client import Client
from app.models.fournisseur import Fournisseur
from app.models.correction_operation import CorrectionOperation
from app.schemas.correction import CorrectionCommand
from app.services.correction_commands import apply_correction, preview_correction
from app.services.financial import payment_status, query_financial_transactions
from tests.test_correction_contract import correction_sale, prepared, revision_trigger


@pytest.mark.parametrize('supplier', [False, True])
@pytest.mark.parametrize('paid, expected, overdue', [
    ('99.99', 'partiel', True), ('100.00', 'paye', False),
    ('100.01', 'surpaye', False), ('120.00', 'surpaye', False),
])
def test_every_cent_and_surplus_agree_in_model_and_sql(
    db_session, test_produit, supplier, paid, expected, overdue,
):
    contact = Fournisseur(nom_fournisseur='Crédit test') if supplier else Client(nom_client='Crédit test')
    db_session.add(contact)
    db_session.flush()
    tx = Transaction(date_transaction=date.today() - timedelta(days=30),
        date_echeance=date.today() - timedelta(days=1), quantite=1,
        prix_unitaire=100, montant_total=100, id_produit=test_produit.id_produit,
        **({'id_fournisseur': contact.id_fournisseur} if supplier else {'id_client': contact.id_client}))
    db_session.add(tx)
    db_session.flush()
    db_session.add(Paiement(id_transaction=tx.id_transaction, date_paiement=date.today(),
        montant=Decimal(paid), type_paiement='cash', statut='valide'))
    db_session.commit()
    assert tx.statut_paiement == expected
    assert tx.est_en_retard is overdue
    canonical = 'en_retard' if overdue else expected
    assert payment_status(tx) == canonical
    rows = query_financial_transactions(db_session,
        direction='payable' if supplier else 'receivable', statut=canonical)
    assert [row.id_transaction for row in rows] == [tx.id_transaction]
    assert tx.montant_restant == Decimal('100') - Decimal(paid)


def test_price_correction_retains_credit_without_changing_money_or_repeating_it(
    db_session, correction_sale, test_user,
):
    tx, payment = correction_sale
    cash = Caisse(id_transaction=tx.id_transaction, id_paiement=payment.id_paiement,
        montant=payment.montant, type_mouvement='ENTREE', statut='active',
        date_mouvement=datetime.combine(payment.date_paiement, datetime.min.time(), tzinfo=timezone.utc))
    db_session.add(cash)
    db_session.commit()
    revision_trigger(db_session, 'transactions', 'prix_unitaire')
    cmd = CorrectionCommand(operation_id=uuid4(), reason='Prix corrigé, crédit conservé',
        target={'entity_type': 'transaction', 'entity_id': tx.id_transaction, 'expected_version': tx.row_version},
        changes={'prix_unitaire': '0.40'})
    preview = preview_correction(db_session, cmd)
    assert Decimal(preview['impact']['balance']['remaining']) == Decimal('-1')
    ready = prepared(db_session, cmd)
    result = apply_correction(db_session, ready, test_user)
    db_session.refresh(tx)
    db_session.refresh(payment)
    assert tx.montant_total == Decimal('4') and tx.montant_paye == Decimal('5')
    assert tx.montant_restant == Decimal('-1') and tx.statut_paiement == 'surpaye'
    assert payment.montant == Decimal('5') and payment.statut == 'valide'
    assert db_session.query(Paiement).count() == 1
    assert db_session.query(Caisse).count() == 1
    assert cash.statut == 'active' and cash.montant == Decimal('5')
    replay = apply_correction(db_session, ready, test_user)
    assert replay['replayed'] and replay['record'] == result['record']
    assert db_session.query(CorrectionOperation).count() == 1
