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
from app.models.lettre_credit_utilisation import LettreCreditUtilisation
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
    revision_trigger(db_session, 'paiements', 'date_paiement,date_encaissement_effective,statut_cheque,statut,notes')
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
        date_reception=tx.date_transaction, id_client_origine=tx.id_client,
        statut_cycle='detenue', id_client=tx.id_client, type_detenteur='client',
        statut='active', version_utilisation=0,
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


def used_lc_supplier_payment(db, lc, tx, actor, *, payment_date):
    """Build a reconciled outgoing, non-cash LC usage for correction tests."""
    lc.statut = 'utilisee'
    lc.statut_cycle = 'transferee'
    lc.type_detenteur = 'fournisseur'
    lc.id_client = None
    lc.id_fournisseur = tx.id_fournisseur
    lc.version_utilisation = 1
    payment = Paiement(
        id_transaction=tx.id_transaction, type_paiement='lc', role_lc='utilisation',
        id_lc=lc.id_lc, montant=lc.montant, date_paiement=payment_date,
        statut='valide', id_utilisateur_creation=actor.id_utilisateur,
    )
    db.add(payment)
    db.flush()
    db.add(LettreCreditUtilisation(
        id_lc=lc.id_lc, type_utilisation='fournisseur',
        date_utilisation=payment.date_paiement, id_fournisseur=tx.id_fournisseur,
        id_paiement=payment.id_paiement,
        id_utilisateur_creation=actor.id_utilisateur,
    ))
    sync_payment_cash_movement(db, payment, tx, current_user=actor)
    db.commit()
    return payment


def test_lc_payment_amount_and_date_replace_effect(
    db_session, letter, test_user, correction_transaction
):
    lc, receipt_tx = letter
    supplier_tx = correction_transaction
    supplier_tx.date_transaction = date.today() - timedelta(days=2)
    db_session.commit()
    p = used_lc_supplier_payment(
        db_session, lc, supplier_tx, test_user,
        payment_date=date.today() - timedelta(days=1),
    )
    revision_trigger(db_session, 'paiements', 'montant,date_paiement,statut')
    apply_lc(db_session, lc_cmd(lc, {'montant': '6.00', 'date_effet': date.today()}), test_user)
    assert p.montant == lc.montant == 6
    assert p.date_paiement == date.today()
    usage = db_session.query(LettreCreditUtilisation).filter_by(id_paiement=p.id_paiement).one()
    assert usage.date_utilisation == date.today() and usage.statut == 'active'
    # The transfer settles the supplier liability but never touches cash.
    assert db_session.query(Caisse).filter(Caisse.statut == 'active').count() == 0
    apply_lc(db_session, lc_cmd(lc, action='cancel_usage'), test_user)
    assert p.statut == 'annule' and lc.statut == 'active'
    assert lc.statut_cycle == 'detenue'
    assert lc.id_client == receipt_tx.id_client and lc.id_fournisseur is None
    assert usage.statut == 'annulee'


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


def test_lc_dependent_refund_blocks_amount_edit_and_cancellation(
    db_session, letter, test_user, correction_transaction
):
    from app.schemas.refund import RefundCommand, RefundApplyCommand
    from app.services.refunds import preview_refund, apply_refund
    lc, _ = letter
    tx = correction_transaction
    tx.montant_total = Decimal('1.00')
    db_session.commit()
    p = used_lc_supplier_payment(db_session, lc, tx, test_user, payment_date=date.today())
    cmd = RefundCommand(operation_id=uuid4(), id_transaction=tx.id_transaction, date_paiement=date.today(), montant='2.00', type_paiement='cash', reason='Remboursement LC')
    preview = preview_refund(db_session, cmd)
    apply_refund(db_session, RefundApplyCommand(**cmd.model_dump(), dependency_fingerprint=preview['dependency_fingerprint']), test_user)
    for command in [lc_cmd(lc, {'montant':'4.00'}), lc_cmd(lc, action='cancel_usage')]:
        with pytest.raises(HTTPException):
            preview_lc_correction(db_session, command)
    before = (p.montant, p.date_paiement, p.row_version, db_session.query(Caisse).count())
    apply_lc(db_session, lc_cmd(lc, {'numero_reference': 'LC-REF-CORRECTED', 'banque_emettrice': 'Banque corrigée'}), test_user)
    assert before == (p.montant, p.date_paiement, p.row_version, db_session.query(Caisse).count())


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


@pytest.mark.parametrize('inactive_transaction', [False, True])
def test_cheque_notes_on_cancelled_records_preserve_financial_state(db_session, cheque, test_user, inactive_transaction):
    from app.services.financial_ledger import void_payment
    tx, p = cheque
    if inactive_transaction:
        tx.est_actif = False
    else:
        void_payment(db_session, p, current_user=test_user, reason='Annulation pour test de notes')
    db_session.commit()
    state = (p.statut, p.statut_cheque, p.date_paiement, p.date_encaissement_effective, p.montant, tx.est_actif)
    movements = [(m.id_mouvement, m.statut, m.montant, m.date_mouvement) for m in db_session.query(Caisse).all()]
    command = prepared(db_session, cheque_cmd(p, {'notes': 'Précision conservée après annulation'}))
    result = apply_correction(db_session, command, test_user)
    assert result['record']['notes'] == 'Précision conservée après annulation'
    assert state == (p.statut, p.statut_cheque, p.date_paiement, p.date_encaissement_effective, p.montant, tx.est_actif)
    assert movements == [(m.id_mouvement, m.statut, m.montant, m.date_mouvement) for m in db_session.query(Caisse).all()]
    assert apply_correction(db_session, command, test_user)['replayed']
    with pytest.raises(HTTPException) as error:
        preview_correction(db_session, cheque_cmd(p, {'statut_cheque': 'rejete'}))
    assert error.value.status_code == 409


def test_unused_lc_metadata_is_audited_replayable_and_optional_values_clear(db_session, letter, test_user):
    lc, tx = letter
    changes = {'numero_reference': 'LC-CORRECTED', 'numero_serie': 'SERIE-123', 'banque_emettrice': 'Banque corrigée'}
    command = lc_cmd(lc, changes)
    result = apply_lc(db_session, command, test_user)
    assert {k: result['record'][k] for k in changes} == changes
    assert lc.montant == 5 and lc.version_utilisation == 1
    assert db_session.get(CorrectionOperation, command.operation_id).request_payload['changes'] == changes
    assert apply_lc_correction(db_session, command, 'a'*64, test_user)['replayed']
    result = apply_lc(db_session, lc_cmd(lc, {'numero_serie': None, 'banque_emettrice': None}), test_user)
    assert result['record']['numero_serie'] is None and result['record']['banque_emettrice'] is None
    assert db_session.query(Caisse).count() == db_session.query(MouvementBancaire).count() == 0


def test_deposited_lc_reference_replaces_only_reference_and_keeps_legacy_cancel_working(db_session, letter, test_user):
    from app.services.letter_credit_cancellation import cancel_letter_credit
    lc, tx = letter
    account = deposit(db_session, lc, test_user)
    old = db_session.query(MouvementBancaire).one()
    day = old.date_mouvement
    result = apply_lc(db_session, lc_cmd(lc, {'numero_reference': 'LC-DEPOSIT-CORRECTED'}), test_user)
    active = db_session.query(MouvementBancaire).filter(MouvementBancaire.statut == 'active').one()
    assert old.statut == 'annule' and active.id_mouvement != old.id_mouvement
    assert active.reference == lc.numero_reference == 'LC-DEPOSIT-CORRECTED'
    assert active.montant == lc.montant == account.solde_actuel == 5
    assert active.date_mouvement == day and active.id_compte == old.id_compte
    assert result['impact']['bank_balances'][0]['before'] == result['impact']['bank_balances'][0]['after']
    movement_count = db_session.query(MouvementBancaire).count()
    apply_lc(db_session, lc_cmd(lc, {'banque_emettrice': 'Nouvelle banque', 'numero_serie': 'SERIE-456'}), test_user)
    assert db_session.query(MouvementBancaire).count() == movement_count
    assert db_session.query(MouvementBancaire).filter(MouvementBancaire.statut == 'active').one().id_mouvement == active.id_mouvement
    cancel_letter_credit(db_session, lc.id_lc, current_user=test_user, reason='Fin du test', version_utilisation=lc.version_utilisation)
    assert account.solde_actuel == 0


def test_duplicate_lc_reference_is_rejected_before_writing(db_session, letter, test_user):
    lc, tx = letter
    other = LettreDeCredit(numero_reference='LC-EXISTING', montant=5, date_emission=lc.date_emission,
        date_disponibilite=lc.date_disponibilite, id_client=lc.id_client)
    db_session.add(other)
    db_session.commit()
    with pytest.raises(HTTPException) as error:
        preview_lc_correction(db_session, lc_cmd(lc, {'numero_reference': other.numero_reference}))
    assert error.value.status_code == 422
    assert lc.numero_reference == 'TEST-LC-INSTRUMENT' and lc.version_utilisation == 0
    assert db_session.query(CorrectionOperation).count() == 0


def test_lc_metadata_is_available_through_preview_and_apply_api(client, auth_headers, letter, test_user):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    lc, tx = letter
    command = lc_cmd(lc, {'banque_emettrice': 'Banque via aperçu', 'numero_serie': 'SERIE-API'}).model_dump(mode='json', exclude_unset=True)
    preview = client.post('/api/v1/lettres-credit/corrections/preview', headers=auth_headers, json=command)
    assert preview.status_code == 200, preview.json()
    response = client.post('/api/v1/lettres-credit/corrections/apply', headers=auth_headers,
        json={'command': command, 'dependency_fingerprint': preview.json()['dependency_fingerprint']})
    assert response.status_code == 200, response.json()
    assert response.json()['record']['banque_emettrice'] == 'Banque via aperçu'
    assert response.json()['record']['numero_serie'] == 'SERIE-API'


@pytest.mark.parametrize('reference', [None, '', ' ', 'R' * 51])
def test_lc_correction_requires_a_nonempty_bounded_reference(reference):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        LCCorrectionCommand(operation_id=uuid4(), id_lc=1, expected_version=0,
            reason='Référence corrigée', changes={'numero_reference': reference})
