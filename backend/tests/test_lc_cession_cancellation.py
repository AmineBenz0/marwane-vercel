from datetime import date, timedelta

from app.models.cession_lc import CessionLC
from app.models.client import Client
from app.models.financial_correction import CorrectionFinanciere
from app.models.fournisseur import Fournisseur
from app.models.lettre_credit import LettreDeCredit


def test_cancelling_supplier_paid_lc_reverses_cession_and_restores_holder(
    client, db_session, auth_headers, test_user
):
    from app.main import app
    from app.utils.dependencies import get_current_active_user

    app.dependency_overrides[get_current_active_user] = lambda: test_user

    original_holder = Client(nom_client="Client LC � annuler")
    supplier = Fournisseur(nom_fournisseur="Fournisseur LC � annuler")
    db_session.add_all([original_holder, supplier])
    db_session.flush()
    lc = LettreDeCredit(
        numero_reference="LC-CANCEL-CESSION-001",
        montant=1000,
        date_emission=date.today() - timedelta(days=10),
        date_disponibilite=date.today() - timedelta(days=1),
        type_detenteur="client",
        id_client=original_holder.id_client,
        statut="active",
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(lc)
    db_session.commit()

    paid = client.post(
        f"/api/v1/lettres-credit/{lc.id_lc}/payer-fournisseur",
        json={"id_fournisseur": supplier.id_fournisseur, "date_cession": date.today().isoformat()},
        headers=auth_headers,
    )
    assert paid.status_code == 200, paid.text
    original_cession = db_session.query(CessionLC).filter_by(id_lc=lc.id_lc).one()

    cancelled = client.post(
        f"/api/v1/lettres-credit/{lc.id_lc}/annuler",
        json={"raison": "Annulation confirm�e par l'utilisateur depuis l'application"},
        headers=auth_headers,
    )
    assert cancelled.status_code == 200, cancelled.text
    db_session.expire_all()

    stored_lc = db_session.query(LettreDeCredit).filter_by(id_lc=lc.id_lc).one()
    original_cession = db_session.query(CessionLC).filter_by(
        id_cession=original_cession.id_cession,
    ).one()
    reversal = db_session.query(CessionLC).filter_by(
        id_cession=original_cession.id_cession_inverse,
    ).one()

    assert stored_lc.statut == "annulee"
    assert stored_lc.type_detenteur == "client"
    assert stored_lc.id_client == original_holder.id_client
    assert stored_lc.id_fournisseur is None
    assert original_cession.statut == "annulee"
    assert original_cession.date_annulation is not None
    assert original_cession.id_utilisateur_annulation == test_user.id_utilisateur
    assert original_cession.id_cession_inverse == reversal.id_cession
    assert reversal.id_cession_inverse == original_cession.id_cession
    assert reversal.type_cedant == "fournisseur"
    assert reversal.id_cedant_fournisseur == supplier.id_fournisseur
    assert reversal.type_cessionnaire == "client"
    assert reversal.id_cessionnaire_client == original_holder.id_client
    correction = db_session.query(CorrectionFinanciere).filter_by(
        type_entite="cession_lc",
        id_entite=original_cession.id_cession,
        action="annulation",
    ).one()
    assert correction.id_utilisateur == test_user.id_utilisateur
