from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.batiment import Batiment
from app.models.caisse import Caisse
from app.models.charge import Charge
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.production import Production
from app.models.vaccin import Vaccin


@pytest.fixture
def vaccine_day(db_session):
    building = Batiment(nom="Vaccines", est_actif=True)
    vaccine = Vaccin(nom="MA5", prix_defaut=Decimal("45.00"))
    bank = CompteBancaire(nom_banque="Vaccines bank", numero_compte="vaccines-test", solde_actuel=1000)
    db_session.add_all([building, vaccine, bank])
    db_session.commit()
    return {
        "id_batiment": building.id_batiment, "date_production": str(date.today()),
        "quantites": {"normal": 10}, "grammage": "60",
        "depenses_vaccins": [{"id_vaccin": vaccine.id_vaccin, "quantite": "2", "prix_unitaire": "50.25", "id_compte": bank.id_compte}],
    }


def create(client, headers, payload):
    response = client.post('/api/v1/productions/daily', json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def correction(payload, day, **kwargs):
    return {**payload, "versions": day['versions'], "charge_versions": day['charge_versions'], **kwargs}


def test_custom_price_snapshot_catalogue_and_single_bank_debit(client, db_session, auth_headers, vaccine_day):
    result = create(client, auth_headers, vaccine_day)
    line = result['depenses_vaccins'][0]
    assert Decimal(line['prix_unitaire']) == Decimal('50.25')
    assert Decimal(line['montant']) == Decimal('100.50')
    assert line['nom_vaccin'] == 'MA5'
    assert line['id_batiment'] == vaccine_day['id_batiment']
    assert db_session.query(CompteBancaire).one().solde_actuel == Decimal('899.50')
    catalogue = client.get('/api/v1/vaccins', headers=auth_headers).json()
    assert Decimal(catalogue[0]['prix_defaut']) == Decimal('45')
    read = client.get('/api/v1/productions/daily', params={k: vaccine_day[k] for k in ('id_batiment', 'date_production')}, headers=auth_headers).json()
    assert read['depenses_vaccins'] == result['depenses_vaccins']


def test_price_correction_replaces_debit_and_rejects_stale_versions(client, db_session, auth_headers, vaccine_day):
    day = create(client, auth_headers, vaccine_day)
    line = {**vaccine_day['depenses_vaccins'][0], 'id_charge': day['depenses_vaccins'][0]['id_charge'], 'prix_unitaire': '60'}
    response = client.put('/api/v1/productions/daily', json=correction(vaccine_day, day, depenses_vaccins=[line]), headers=auth_headers)
    assert response.status_code == 200, response.text
    assert db_session.query(CompteBancaire).one().solde_actuel == Decimal('880')
    assert db_session.query(MouvementBancaire).filter_by(statut='active').count() == 1
    # A stale expense token alone must block a write even with fresh production tokens.
    stale = correction(vaccine_day, response.json(), depenses_vaccins=[line], charge_versions=day['charge_versions'])
    assert client.put('/api/v1/productions/daily', json=stale, headers=auth_headers).status_code == 409
    assert db_session.query(CompteBancaire).one().solde_actuel == Decimal('880')


def test_multiple_lines_cash_rounding_removal_and_daily_cancellation(client, db_session, auth_headers, vaccine_day):
    vaccine_day['depenses_vaccins'].append({
        'id_vaccin': vaccine_day['depenses_vaccins'][0]['id_vaccin'], 'quantite': '1.005', 'prix_unitaire': '1',
    })
    day = create(client, auth_headers, vaccine_day)
    cash = next(line for line in day['depenses_vaccins'] if line['id_compte'] is None)
    assert Decimal(cash['montant']) == Decimal('1.01')
    assert db_session.query(Caisse).filter_by(statut='active').count() == 1
    remaining = {**vaccine_day['depenses_vaccins'][1], 'id_charge': cash['id_charge']}
    response = client.put('/api/v1/productions/daily', json=correction(vaccine_day, day, depenses_vaccins=[remaining]), headers=auth_headers)
    assert response.status_code == 200, response.text
    assert db_session.query(CompteBancaire).one().solde_actuel == Decimal('1000')
    current = response.json()
    cancel = {k: vaccine_day[k] for k in ('id_batiment', 'date_production')}
    cancel.update(versions=current['versions'], charge_versions=current['charge_versions'])
    assert client.request('DELETE', '/api/v1/productions/daily', json=cancel, headers=auth_headers).status_code == 204
    assert db_session.query(Charge).filter_by(statut='active').count() == 0
    assert db_session.query(Production).filter_by(est_actif=True).count() == 0
    # Reversal records balance the original outflows when cancellation succeeds.
    net = sum((row.montant if row.type_mouvement == 'ENTREE' else -row.montant) for row in db_session.query(Caisse))
    assert net == 0


@pytest.mark.parametrize('field', ['id_vaccin', 'id_compte'])
def test_invalid_catalogue_or_bank_rolls_back_whole_day(client, db_session, auth_headers, vaccine_day, field):
    vaccine_day['depenses_vaccins'][0][field] = 999999
    response = client.post('/api/v1/productions/daily', json=vaccine_day, headers=auth_headers)
    assert response.status_code == 400, response.text
    assert db_session.query(Production).count() == 0
    assert db_session.query(Charge).count() == 0
    assert db_session.query(MouvementBancaire).count() == 0


def test_expense_only_day_and_catalogue_changes_do_not_rewrite_history(client, db_session, auth_headers, vaccine_day):
    vaccine_day['quantites'] = {}
    vaccine_day['grammage'] = '0'
    day = create(client, auth_headers, vaccine_day)
    assert sum(row['nombre_oeufs'] for row in day['records']) == 0
    vaccine = db_session.query(Vaccin).one()
    vaccine.nom = 'New name'
    vaccine.prix_defaut = 999
    db_session.commit()
    read = client.get('/api/v1/charges', params={'id_batiment': vaccine_day['id_batiment'], 'source_journaliere': True}, headers=auth_headers).json()
    assert len(read) == 1
    assert read[0]['nom_vaccin'] == 'MA5'
    assert Decimal(read[0]['prix_unitaire']) == Decimal('50.25')
    charge_id = read[0]['id_charge']
    assert client.put(f'/api/v1/charges/{charge_id}', json={'montant': '1'}, headers=auth_headers).status_code == 409
    assert client.delete(f'/api/v1/charges/{charge_id}', headers=auth_headers).status_code == 409
    production_id = day['records'][0]['id_production']
    assert client.delete(f'/api/v1/productions/{production_id}', headers=auth_headers).status_code == 409
    assert client.put(f'/api/v1/productions/{production_id}', json={'nombre_oeufs': 1}, headers=auth_headers).status_code == 409


def test_switch_bank_to_cash_and_rollback_cancellation_failure(client, db_session, auth_headers, vaccine_day, monkeypatch):
    day = create(client, auth_headers, vaccine_day)
    line = {**vaccine_day['depenses_vaccins'][0], 'id_charge': day['depenses_vaccins'][0]['id_charge'], 'id_compte': None}
    response = client.put('/api/v1/productions/daily', json=correction(vaccine_day, day, depenses_vaccins=[line]), headers=auth_headers)
    assert response.status_code == 200, response.text
    assert db_session.query(CompteBancaire).one().solde_actuel == 1000
    assert db_session.query(Caisse).filter_by(statut='active').count() == 1
    from app.routers import productions
    monkeypatch.setattr(productions, 'cancel_charge', lambda *a: (_ for _ in ()).throw(RuntimeError('cancel failure')))
    current = response.json()
    cancel = {k: vaccine_day[k] for k in ('id_batiment', 'date_production')}
    cancel.update(versions=current['versions'], charge_versions=current['charge_versions'])
    assert client.request('DELETE', '/api/v1/productions/daily', json=cancel, headers=auth_headers).status_code == 500
    assert db_session.query(Charge).filter_by(statut='active').count() == 1
    assert db_session.query(Production).filter_by(est_actif=True).count() == 1
    assert db_session.query(Caisse).filter_by(statut='active').count() == 1


def test_financial_failure_after_first_expense_is_atomic(client, db_session, auth_headers, vaccine_day, monkeypatch):
    from app.services import vaccine_expenses
    original = vaccine_expenses.apply_charge_impact
    calls = []

    def fail_second(*args, **kwargs):
        calls.append(1)
        if len(calls) == 2:
            raise RuntimeError('simulated write failure')
        return original(*args, **kwargs)

    monkeypatch.setattr(vaccine_expenses, 'apply_charge_impact', fail_second)
    vaccine_day['depenses_vaccins'] *= 2
    with TestClient(app, raise_server_exceptions=False) as http:
        response = http.post('/api/v1/productions/daily', json=vaccine_day, headers=auth_headers)
    assert response.status_code == 500
    assert db_session.query(Production).count() == 0
    assert db_session.query(Charge).count() == 0
    assert db_session.query(MouvementBancaire).count() == 0
    assert db_session.query(CompteBancaire).one().solde_actuel == 1000

