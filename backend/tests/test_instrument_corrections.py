from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import uuid4
import pytest
from fastapi import HTTPException
from app.models.caisse import Caisse
from app.models.cession_lc import CessionLC
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.correction_operation import CorrectionOperation
from app.models.lettre_credit import LettreDeCredit
from app.models.paiement import Paiement
from app.schemas.correction import CorrectionCommand
from app.schemas.lc_correction import LCCorrectionCommand
from app.services.correction_commands import apply_correction, preview_correction
from app.services.financial_ledger import record_bank_movement, sync_payment_cash_movement
from app.services.lc_corrections import apply_lc_correction, preview_lc_correction
from tests.test_correction_contract import correction_sale, correction_transaction, prepared, revision_trigger


@pytest.fixture
def cheque(db_session, correction_sale, test_user):
    tx, p = correction_sale
    tx.date_transaction = date.today() - timedelta(days=10)
    p.type_paiement, p.date_paiement = 'cheque', tx.date_transaction
    p.statut_cheque, p.date_encaissement_effective = 'encaisse', date.today() - timedelta(days=2)
    sync_payment_cash_movement(db_session, p, tx, current_user=test_user)
    db_session.commit()
    revision_trigger(db_session, 'paiements', 'date_paiement,date_encaissement_effective,statut_cheque,statut')
    return tx, p


def cheque_cmd(p, changes):
    return CorrectionCommand(operation_id=uuid4(), reason='Correction du relevé bancaire',
        target={'entity_type': 'paiement', 'entity_id': p.id_paiement, 'expected_version': p.row_version}, changes=changes)


def test_cleared_date_replaces_movement_and_replays(db_session, cheque, test_user):
    tx, p = cheque
    original = db_session.query(Caisse).filter(Caisse.statut == 'active').one()
    cmd = prepared(db_session, cheque_cmd(p, {'date_encaissement_effective': date.today() - timedelta(days=1)}))
    result = apply_correction(db_session, cmd, test_user)
    db_session.refresh(original)
    assert original.statut == 'annule'
    active = db_session.query(Caisse).filter(Caisse.statut == 'active').one()
    assert active.date_mouvement.date() == date.today() - timedelta(days=1)
    assert active.montant == p.montant
    assert result['impact']['balance']['paid'] == '5.00'
    assert apply_correction(db_session, cmd, test_user)['replayed']


@pytest.mark.parametrize('status', ['a_encaisser', 'emis', 'rejete', 'annule'])
def test_cleared_status_removes_effect_without_deleting_payment(db_session, cheque, test_user, status):
    tx, p = cheque
    cmd = prepared(db_session, cheque_cmd(p, {'statut_cheque': status}))
    assert cmd.changes.statut_cheque == status
    result = apply_correction(db_session, cmd, test_user)
    assert result['impact']['balance']['paid'] == '0.00'
    assert result['record']['date_encaissement_effective'] is None
    assert db_session.query(Caisse).filter(Caisse.statut == 'active').count() == 0
    assert db_session.get(Paiement, p.id_paiement) is not None
    restore = prepared(db_session, cheque_cmd(p, {'statut_cheque': 'encaisse', 'date_encaissement_effective': date.today()}))
    apply_correction(db_session, restore, test_user)
    assert db_session.query(Caisse).filter(Caisse.statut == 'active').one().montant == p.montant


@pytest.mark.parametrize('delta', [-11, 1])
def test_invalid_clearing_date_is_rejected(db_session, cheque, delta):
    with pytest.raises(HTTPException):
        preview_correction(db_session, cheque_cmd(cheque[1], {'date_encaissement_effective': date.today() + timedelta(days=delta)}))


@pytest.fixture
def letter(db_session, correction_sale, test_user):
    tx, old_payment = correction_sale
    old_payment.statut = 'annule'
    tx.date_transaction = date.today() - timedelta(days=10)
    lc = LettreDeCredit(numero_reference='TEST-LC-INSTRUMENT', montant=Decimal('5.00'),
        date_emission=tx.date_transaction, date_disponibilite=tx.date_transaction,
        id_client=tx.id_client, type_detenteur='client', statut='active', version_utilisation=0,
        id_utilisateur_creation=test_user.id_utilisateur)
    db_session.add(lc)
    db_session.commit()
    return lc, tx


def lc_cmd(lc, changes=None, action='correct'):
    return LCCorrectionCommand(operation_id=uuid4(), id_lc=lc.id_lc, expected_version=lc.version_utilisation,
        reason='Correction de la lettre de crédit', action=action, changes=changes or {})


def apply_lc(db, cmd, actor):
    preview = preview_lc_correction(db, cmd)
    return apply_lc_correction(db, cmd, preview['dependency_fingerprint'], actor)


def deposit(db, lc, actor):
    account = CompteBancaire(nom_banque='Instrument', numero_compte='INSTRUMENT', solde_actuel=0)
    db.add(account)
    db.flush()
    record_bank_movement(db, id_compte=account.id_compte, montant=lc.montant, type_mouvement='ENTREE',
        source='lc', reference=lc.numero_reference, cle_idempotence=f'lc-bank-deposit-{lc.id_lc}-1',
        date_mouvement=datetime.combine(date.today() - timedelta(days=1), time.min, tzinfo=timezone.utc), current_user=actor)
    lc.statut, lc.version_utilisation = 'utilisee', 1
    db.commit()
    return account


def test_unused_lc_corrects_values_and_notes_without_money(db_session, letter, test_user):
    lc, tx = letter
    cmd = lc_cmd(lc, {'montant': '6.50', 'notes': 'Corrigée'})
    result = apply_lc(db_session, cmd, test_user)
    assert Decimal(result['record']['montant']) == Decimal('6.50')
    assert lc.version_utilisation == 1
    assert db_session.query(Caisse).count() == 0
    assert apply_lc_correction(db_session, cmd, 'a'*64, test_user)['replayed']


def test_deposit_amount_date_account_and_cancel_are_atomic(db_session, letter, test_user):
    lc, tx = letter
    first = deposit(db_session, lc, test_user)
    second = CompteBancaire(nom_banque='Destination', numero_compte='DEST', solde_actuel=0)
    db_session.add(second)
    db_session.commit()
    result = apply_lc(db_session, lc_cmd(lc, {'montant': '6.50', 'id_compte': second.id_compte, 'date_effet': date.today()}), test_user)
    assert first.solde_actuel == 0
    assert second.solde_actuel == Decimal('6.50')
    active = db_session.query(MouvementBancaire).filter(MouvementBancaire.statut == 'active').one()
    assert active.date_mouvement.date() == date.today()
    assert active.cle_idempotence.endswith('-2')
    apply_lc(db_session, lc_cmd(lc, action='cancel_usage'), test_user)
    assert second.solde_actuel == 0 and lc.statut == 'active'
    assert db_session.query(MouvementBancaire).filter(MouvementBancaire.statut == 'active').count() == 0


def test_lc_notes_do_not_move_money_and_legacy_cancel_finds_corrected_version(db_session, letter, test_user):
    from app.services.letter_credit_cancellation import cancel_letter_credit
    lc, tx = letter
    account = deposit(db_session, lc, test_user)
    apply_lc(db_session, lc_cmd(lc, {'notes': 'Note uniquement'}), test_user)
    assert db_session.query(MouvementBancaire).count() == 1
    cancel_letter_credit(db_session, lc.id_lc, current_user=test_user, reason='Erreur test', version_utilisation=lc.version_utilisation)
    assert account.solde_actuel == 0


def test_stale_lc_preview_and_uuid_reuse_do_not_write(db_session, letter, test_user):
    lc, tx = letter
    account = deposit(db_session, lc, test_user)
    cmd = lc_cmd(lc, {'montant': '6.00'})
    preview = preview_lc_correction(db_session, cmd)
    lc.notes = 'Autre onglet'
    db_session.commit()
    with pytest.raises(HTTPException) as error:
        apply_lc_correction(db_session, cmd, preview['dependency_fingerprint'], test_user)
    assert error.value.status_code == 409
    assert account.solde_actuel == 5
    assert db_session.query(CorrectionOperation).count() == 0


def test_failure_rolls_back_lc_payment_and_ledger(db_session, letter, test_user, monkeypatch):
    import app.services.lc_corrections as service
    lc, tx = letter
    account = deposit(db_session, lc, test_user)
    original = service.record_bank_movement
    def fail(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError('Injected failure after replacement')
    monkeypatch.setattr(service, 'record_bank_movement', fail)
    cmd = lc_cmd(lc, {'montant': '6.00'})
    with pytest.raises(RuntimeError):
        apply_lc(db_session, cmd, test_user)
    db_session.refresh(account); db_session.refresh(lc)
    assert lc.montant == 5 and account.solde_actuel == 5
    assert db_session.query(CorrectionOperation).count() == 0
    assert db_session.query(MouvementBancaire).count() == 1


def test_lc_payment_amount_and_date_replace_effect(db_session, letter, test_user):
    lc, tx = letter
    p = Paiement(id_transaction=tx.id_transaction, type_paiement='lc', id_lc=lc.id_lc,
        montant=lc.montant, date_paiement=date.today() - timedelta(days=1), statut='valide',
        id_utilisateur_creation=test_user.id_utilisateur)
    db_session.add(p); db_session.flush()
    lc.statut, lc.version_utilisation = 'utilisee', 1
    sync_payment_cash_movement(db_session, p, tx, current_user=test_user)
    db_session.commit()
    revision_trigger(db_session, 'paiements', 'montant,date_paiement,statut')
    apply_lc(db_session, lc_cmd(lc, {'montant': '6.00', 'date_effet': date.today()}), test_user)
    assert p.montant == lc.montant == 6
    assert db_session.query(Caisse).filter(Caisse.statut == 'active').one().montant == 6
    apply_lc(db_session, lc_cmd(lc, action='cancel_usage'), test_user)
    assert p.statut == 'annule' and lc.statut == 'active'


def test_cession_replacement_preserves_original_and_restores_owner(db_session, letter, test_user, correction_transaction):
    lc, tx = letter
    supplier_id = correction_transaction.id_fournisseur
    origin = tx.id_client
    c = CessionLC(id_lc=lc.id_lc, type_cedant='client', id_cedant_client=origin,
        type_cessionnaire='fournisseur', id_cessionnaire_fournisseur=supplier_id,
        date_cession=date.today() - timedelta(days=1), motif='Original')
    db_session.add(c); db_session.flush()
    db_session.add(Caisse(id_cession=c.id_cession, montant=lc.montant, type_mouvement='SORTIE'))
    lc.type_detenteur, lc.id_client, lc.id_fournisseur, lc.statut, lc.version_utilisation = 'fournisseur', None, supplier_id, 'utilisee', 1
    db_session.commit()
    apply_lc(db_session, lc_cmd(lc, {'date_effet': date.today(), 'montant': '6.00'}), test_user)
    assert db_session.query(CessionLC).count() == 3
    assert c.motif == 'Original'
    assert db_session.query(Caisse).filter(Caisse.statut == 'active').one().montant == 6
    apply_lc(db_session, lc_cmd(lc, action='cancel_usage'), test_user)
    assert lc.type_detenteur == 'client' and lc.id_client == origin and lc.id_fournisseur is None
    assert db_session.query(Caisse).filter(Caisse.statut == 'active').count() == 0


def test_cleared_cheque_credit_uses_clearing_date_and_blocks_dependent_correction(db_session, cheque, test_user):
    from app.schemas.refund import RefundCommand, RefundApplyCommand
    from app.services.refunds import preview_refund, apply_refund
    from app.services.financial_ledger import void_payment
    tx, p = cheque
    tx.montant_total = Decimal('1.00')
    p.date_encaissement_effective = date.today()
    sync_payment_cash_movement(db_session, p, tx, current_user=test_user)
    db_session.commit()
    base = dict(operation_id=uuid4(), id_transaction=tx.id_transaction, montant='2.00', type_paiement='cash', reason='Remboursement du crédit')
    with pytest.raises(HTTPException):
        preview_refund(db_session, RefundCommand(**base, date_paiement=date.today()-timedelta(days=1)))
    cmd = RefundCommand(**base, date_paiement=date.today())
    preview = preview_refund(db_session, cmd)
    apply_refund(db_session, RefundApplyCommand(**cmd.model_dump(), dependency_fingerprint=preview['dependency_fingerprint']), test_user)
    with pytest.raises(HTTPException):
        preview_correction(db_session, cheque_cmd(p, {'statut_cheque': 'rejete'}))
    with pytest.raises(HTTPException):
        void_payment(db_session, p, current_user=test_user, reason='Ne doit pas annuler un crédit remboursé')


def test_supplier_bank_cheque_status_reversal_restores_account(db_session, correction_transaction, test_user):
    tx = correction_transaction
    tx.date_transaction = date.today()-timedelta(days=2)
    account = CompteBancaire(nom_banque='Chèque', numero_compte='CHEQUE', solde_actuel=0)
    db_session.add(account); db_session.flush()
    p = Paiement(id_transaction=tx.id_transaction, montant=5, date_paiement=tx.date_transaction,
        type_paiement='cheque', numero_cheque='TEST', statut_cheque='encaisse', date_encaissement_effective=date.today(),
        statut='valide', source_reglement='banque', id_compte=account.id_compte, id_utilisateur_creation=test_user.id_utilisateur)
    db_session.add(p); db_session.flush()
    sync_payment_cash_movement(db_session, p, tx, current_user=test_user)
    db_session.commit()
    revision_trigger(db_session, 'paiements', 'date_paiement,date_encaissement_effective,statut_cheque,statut')
    assert account.solde_actuel == -5
    apply_correction(db_session, prepared(db_session, cheque_cmd(p, {'statut_cheque':'rejete'})), test_user)
    db_session.refresh(account)
    assert account.solde_actuel == 0


def test_lc_dependent_refund_blocks_amount_edit_and_cancellation(db_session, letter, test_user):
    from app.schemas.refund import RefundCommand, RefundApplyCommand
    from app.services.refunds import preview_refund, apply_refund
    lc, tx = letter
    tx.montant_total = Decimal('1.00')
    p = Paiement(id_transaction=tx.id_transaction, type_paiement='lc', id_lc=lc.id_lc,
        montant=lc.montant, date_paiement=date.today(), statut='valide', id_utilisateur_creation=test_user.id_utilisateur)
    db_session.add(p); db_session.flush()
    lc.statut, lc.version_utilisation = 'utilisee', 1
    sync_payment_cash_movement(db_session, p, tx, current_user=test_user)
    db_session.commit()
    cmd = RefundCommand(operation_id=uuid4(), id_transaction=tx.id_transaction, date_paiement=date.today(), montant='2.00', type_paiement='cash', reason='Remboursement LC')
    preview = preview_refund(db_session, cmd)
    apply_refund(db_session, RefundApplyCommand(**cmd.model_dump(), dependency_fingerprint=preview['dependency_fingerprint']), test_user)
    for command in [lc_cmd(lc, {'montant':'4.00'}), lc_cmd(lc, action='cancel_usage')]:
        with pytest.raises(HTTPException):
            preview_lc_correction(db_session, command)


def test_lc_correction_preserves_values_on_wrong_owner_or_date(db_session, letter, test_user):
    lc, tx = letter
    account = deposit(db_session, lc, test_user)
    for changes in [{'id_client': tx.id_client}, {'date_effet': date.today()-timedelta(days=11)}, {'date_emission': date.today()+timedelta(days=1)}]:
        with pytest.raises(HTTPException):
            preview_lc_correction(db_session, lc_cmd(lc, changes))
    assert account.solde_actuel == lc.montant == 5


def test_lc_amount_limit_is_rejected_at_api(client, auth_headers, letter):
    lc, tx = letter
    response = client.post('/api/v1/lettres-credit/corrections/preview', headers=auth_headers, json={
        'operation_id': str(uuid4()), 'id_lc': lc.id_lc, 'expected_version': 0,
        'reason': 'Trop grand', 'changes': {'montant': '10000000000000.00'}})
    assert response.status_code == 422


def test_long_bank_correction_reason_is_preserved_in_history(db_session, letter, test_user):
    lc, tx = letter
    deposit(db_session, lc, test_user)
    command = lc_cmd(lc, {'montant': '6.00'}).model_copy(update={'reason': 'Motif détaillé ' * 50})
    result = apply_lc(db_session, command, test_user)
    active = db_session.query(MouvementBancaire).filter(MouvementBancaire.statut == 'active').one()
    assert len(active.notes) == 255
    assert db_session.get(CorrectionOperation, command.operation_id).reason == command.reason


@pytest.mark.parametrize('amount', ['6', '6.0', '6.00'])
def test_lc_numeric_formats_save_and_retry_with_cent_precision(db_session, letter, test_user, amount):
    lc, tx = letter
    command = lc_cmd(lc, {'montant': amount})
    result = apply_lc(db_session, command, test_user)
    assert result['record']['montant'] == '6.00'
    equivalent = command.model_copy(update={'changes': command.changes.__class__(montant=Decimal('6.00'))})
    assert apply_lc_correction(db_session, equivalent, 'a'*64, test_user)['replayed']
