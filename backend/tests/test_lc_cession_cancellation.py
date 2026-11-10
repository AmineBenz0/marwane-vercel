from datetime import date, timedelta

import pytest

from app.models.cession_lc import CessionLC
from app.models.caisse import Caisse
from app.models.client import Client
from app.models.compte_bancaire import CompteBancaire, MouvementBancaire
from app.models.financial_correction import CorrectionFinanciere
from app.models.fournisseur import Fournisseur
from app.models.lettre_credit import LettreDeCredit
from app.models.lettre_credit_utilisation import LettreCreditUtilisation
from app.models.paiement import Paiement
from app.models.produit import Produit
from app.models.transaction import Transaction


def test_supplier_use_can_be_undone_reused_and_undone_again(
    client, db_session, auth_headers, test_user
):
    from app.main import app
    from app.utils.dependencies import get_current_active_user

    app.dependency_overrides[get_current_active_user] = lambda: test_user

    original_holder = Client(nom_client="LC reuse holder")
    supplier = Fournisseur(nom_fournisseur="LC reuse supplier")
    db_session.add_all([original_holder, supplier])
    db_session.flush()
    lc = LettreDeCredit(
        numero_reference="LC-USE-UNDO-REUSE-001",
        montant=1000,
        date_emission=date.today() - timedelta(days=10),
        date_disponibilite=date.today() - timedelta(days=1),
        date_reception=date.today() - timedelta(days=2),
        id_client_origine=original_holder.id_client,
        type_detenteur="client",
        id_client=original_holder.id_client,
        statut="active",
        version_utilisation=0,
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(lc)
    db_session.commit()

    def use(version: int):
        return client.post(
            f"/api/v1/lettres-credit/{lc.id_lc}/payer-fournisseur",
            json={
                "id_fournisseur": supplier.id_fournisseur,
                "date_cession": date.today().isoformat(),
                "version_utilisation": version,
            },
            headers=auth_headers,
        )

    def cancel(version: int):
        return client.post(
            f"/api/v1/lettres-credit/{lc.id_lc}/annuler",
            json={
                "raison": "Confirmed cancellation of this specific use",
                "version_utilisation": version,
            },
            headers=auth_headers,
        )

    first_use = use(0)
    assert first_use.status_code == 200, first_use.text
    assert first_use.json()["statut"] == "utilisee"
    assert first_use.json()["version_utilisation"] == 1
    original_cession_1 = db_session.query(CessionLC).filter_by(id_lc=lc.id_lc).one()
    original_usage = db_session.query(LettreCreditUtilisation).filter_by(
        id_lc=lc.id_lc, id_cession=original_cession_1.id_cession,
        statut="active",
    ).one()
    assert original_usage.type_utilisation == "fournisseur"
    assert original_usage.id_fournisseur == supplier.id_fournisseur
    # A transfer consumes the LC instrument, not physical cash.
    assert db_session.query(Caisse).filter_by(id_cession=original_cession_1.id_cession).count() == 0
    cash_response = client.get("/api/v1/caisse/mouvements", headers=auth_headers)
    assert cash_response.status_code == 200, cash_response.text
    assert all(row["id_cession"] is None for row in cash_response.json())

    first_cancel = cancel(1)
    assert first_cancel.status_code == 200, first_cancel.text
    assert first_cancel.json()["statut"] == "active"
    assert first_cancel.json()["version_utilisation"] == 1
    db_session.expire_all()
    assert db_session.get(LettreCreditUtilisation, original_usage.id_utilisation).statut == "annulee"

    stored_lc = db_session.query(LettreDeCredit).filter_by(id_lc=lc.id_lc).one()
    assert stored_lc.est_disponible
    assert stored_lc.type_detenteur == "client"
    assert stored_lc.id_client == original_holder.id_client
    assert stored_lc.id_fournisseur is None

    first_reversal = db_session.query(CessionLC).filter_by(
        id_cession_origine=original_cession_1.id_cession,
    ).one()
    assert first_reversal.type_cedant == "fournisseur"
    assert first_reversal.id_cedant_fournisseur == supplier.id_fournisseur
    assert first_reversal.type_cessionnaire == "entreprise"
    assert first_reversal.id_cessionnaire_client is None
    assert original_cession_1.motif is not None
    assert "Contrepassation" in first_reversal.motif

    # A confirmation opened for version 1 cannot cancel the subsequent use.
    second_use = use(1)
    assert second_use.status_code == 200, second_use.text
    assert second_use.json()["statut"] == "utilisee"
    assert second_use.json()["version_utilisation"] == 2
    stale_cancel = cancel(1)
    assert stale_cancel.status_code == 409, stale_cancel.text

    stale_cancel = cancel(1)
    assert stale_cancel.status_code == 409, stale_cancel.text

    second_cancel = cancel(2)
    assert second_cancel.status_code == 200, second_cancel.text
    assert second_cancel.json()["statut"] == "active"
    assert second_cancel.json()["version_utilisation"] == 2
    db_session.expire_all()

    stored_lc = db_session.query(LettreDeCredit).filter_by(id_lc=lc.id_lc).one()
    assert stored_lc.statut == "active"
    assert stored_lc.est_disponible
    assert stored_lc.type_detenteur == "client"
    assert stored_lc.id_client == original_holder.id_client
    assert stored_lc.id_fournisseur is None

    cessions = db_session.query(CessionLC).filter_by(id_lc=lc.id_lc).order_by(CessionLC.id_cession).all()
    assert len(cessions) == 4
    assert [row.id_cession_origine for row in cessions] == [None, cessions[0].id_cession, None, cessions[2].id_cession]
    assert db_session.query(LettreCreditUtilisation).filter_by(id_lc=lc.id_lc, statut="active").count() == 0
    assert db_session.query(LettreCreditUtilisation).filter_by(id_lc=lc.id_lc, statut="annulee").count() == 2
    assert db_session.query(CorrectionFinanciere).filter_by(
        type_entite="cession_lc", action="annulation"
    ).count() == 2
    assert db_session.query(CorrectionFinanciere).filter_by(
        type_entite="lettre_credit", id_entite=lc.id_lc, action="annulation"
    ).count() == 2


def test_payment_use_reversal_restores_amount_due_across_reuse_cycles(
    client, db_session, auth_headers, test_user
):
    from app.main import app
    from app.utils.dependencies import get_current_active_user

    app.dependency_overrides[get_current_active_user] = lambda: test_user

    holder = Client(nom_client="LC payment holder")
    supplier = Fournisseur(nom_fournisseur="LC payment supplier")
    product = Produit(nom_produit="LC payment product", type_produit="service")
    db_session.add_all([holder, supplier, product])
    db_session.flush()
    transaction = Transaction(
        date_transaction=date.today(),
        id_produit=product.id_produit,
        quantite=1,
        prix_unitaire=1000,
        montant_total=1000,
        est_actif=True,
        id_fournisseur=supplier.id_fournisseur,
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    lc = LettreDeCredit(
        numero_reference="LC-PAYMENT-UNDO-REUSE-001",
        montant=1000,
        date_emission=date.today() - timedelta(days=10),
        date_disponibilite=date.today() - timedelta(days=1),
        date_reception=date.today() - timedelta(days=2),
        id_client_origine=holder.id_client,
        type_detenteur="client",
        id_client=holder.id_client,
        statut="active",
        version_utilisation=0,
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add_all([transaction, lc])
    db_session.commit()

    def pay():
        return client.post(
            "/api/v1/paiements",
            json={
                "id_transaction": transaction.id_transaction,
                "date_paiement": date.today().isoformat(),
                "montant": "1000.00",
                "type_paiement": "lc",
                "id_lc": lc.id_lc,
            },
            headers=auth_headers,
        )

    def cancel(version: int):
        return client.post(
            f"/api/v1/lettres-credit/{lc.id_lc}/annuler",
            json={"raison": "Undo this LC payment", "version_utilisation": version},
            headers=auth_headers,
        )

    first_payment = pay()
    assert first_payment.status_code == 201, first_payment.text
    db_session.expire_all()
    stored_transaction = db_session.query(Transaction).filter_by(
        id_transaction=transaction.id_transaction
    ).one()
    assert stored_transaction.montant_restant == 0

    first_cancel = cancel(1)
    assert first_cancel.status_code == 200, first_cancel.text
    db_session.expire_all()
    stored_transaction = db_session.query(Transaction).filter_by(
        id_transaction=transaction.id_transaction
    ).one()
    assert stored_transaction.montant_restant == 1000
    assert db_session.query(Paiement).filter_by(id_lc=lc.id_lc, statut="annule").count() == 1

    second_payment = pay()
    assert second_payment.status_code == 201, second_payment.text
    db_session.expire_all()
    stored_transaction = db_session.query(Transaction).filter_by(
        id_transaction=transaction.id_transaction
    ).one()
    assert stored_transaction.montant_restant == 0

    second_cancel = cancel(2)
    assert second_cancel.status_code == 200, second_cancel.text
    db_session.expire_all()
    stored_transaction = db_session.query(Transaction).filter_by(
        id_transaction=transaction.id_transaction
    ).one()
    stored_lc = db_session.query(LettreDeCredit).filter_by(id_lc=lc.id_lc).one()
    assert stored_transaction.montant_restant == 1000
    assert stored_lc.statut == "active"
    assert stored_lc.version_utilisation == 2
    assert db_session.query(Paiement).filter_by(id_lc=lc.id_lc, statut="annule").count() == 2
    assert db_session.query(CorrectionFinanciere).filter_by(
        type_entite="paiement", action="annulation"
    ).count() == 2


def test_bank_deposit_uses_a_new_idempotency_key_after_each_cancellation(
    client, db_session, auth_headers, test_user
):
    from app.main import app
    from app.utils.dependencies import get_current_active_user

    app.dependency_overrides[get_current_active_user] = lambda: test_user

    holder = Client(nom_client="LC bank holder")
    account = CompteBancaire(
        nom_banque="LC reuse bank",
        numero_compte="LC-REUSE-ACCOUNT-001",
        solde_actuel=250,
    )
    db_session.add_all([holder, account])
    db_session.flush()
    lc = LettreDeCredit(
        numero_reference="LC-BANK-UNDO-REUSE-001",
        montant=1000,
        date_emission=date.today() - timedelta(days=10),
        date_disponibilite=date.today() - timedelta(days=1),
        date_reception=date.today() - timedelta(days=2),
        id_client_origine=holder.id_client,
        type_detenteur="client",
        id_client=holder.id_client,
        statut="active",
        version_utilisation=0,
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(lc)
    db_session.commit()

    def deposit(version: int):
        return client.post(
            f"/api/v1/lettres-credit/{lc.id_lc}/verser-banque",
            json={"id_compte": account.id_compte, "version_utilisation": version},
            headers=auth_headers,
        )

    def cancel(version: int):
        return client.post(
            f"/api/v1/lettres-credit/{lc.id_lc}/annuler",
            json={"raison": "Undo this LC bank deposit", "version_utilisation": version},
            headers=auth_headers,
        )

    for expected_version in (0, 1):
        use_response = deposit(expected_version)
        assert use_response.status_code == 200, use_response.text
        db_session.expire_all()
        stored_account = db_session.query(CompteBancaire).filter_by(
            id_compte=account.id_compte
        ).one()
        assert stored_account.solde_actuel == 1250

        undo_response = cancel(expected_version + 1)
        assert undo_response.status_code == 200, undo_response.text
        db_session.expire_all()
        stored_account = db_session.query(CompteBancaire).filter_by(
            id_compte=account.id_compte
        ).one()
        assert stored_account.solde_actuel == 250
        stored_lc = db_session.get(LettreDeCredit, lc.id_lc)
        assert stored_lc.statut_cycle == "detenue"
        assert stored_lc.id_client == holder.id_client
        assert db_session.query(LettreCreditUtilisation).filter_by(id_lc=lc.id_lc, statut="active").count() == 0
        assert db_session.query(MouvementBancaire).filter_by(
            cle_idempotence=f"lc-bank-deposit-{lc.id_lc}-{expected_version + 1}",
            statut="annule",
        ).count() == 1

    assert db_session.query(MouvementBancaire).filter(
        MouvementBancaire.cle_idempotence.like(f"lc-bank-deposit-{lc.id_lc}-%")
    ).count() == 2
    stored_lc = db_session.query(LettreDeCredit).filter_by(id_lc=lc.id_lc).one()
    assert stored_lc.statut == "active"
    assert stored_lc.version_utilisation == 2


@pytest.mark.parametrize("provenance", ["missing_origin", "missing_receipt", "future_receipt"])
def test_unverified_lc_cannot_be_transferred_or_deposited(
    client, db_session, auth_headers, test_user, provenance,
):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: test_user

    holder = Client(nom_client="Unverified LC origin")
    supplier = Fournisseur(nom_fournisseur="Unverified LC supplier")
    account = CompteBancaire(nom_banque="Unverified LC account", numero_compte="UNVERIFIED-001", solde_actuel=0)
    db_session.add_all([holder, supplier, account])
    db_session.flush()
    lc = LettreDeCredit(
        numero_reference=f"LC-UNVERIFIED-{provenance}",
        montant=100,
        date_emission=date.today() - timedelta(days=10),
        date_disponibilite=date.today() - timedelta(days=1),
        date_reception=None if provenance == "missing_receipt" else (
            date.today() + timedelta(days=1) if provenance == "future_receipt"
            else date.today() - timedelta(days=2)),
        id_client_origine=None if provenance == "missing_origin" else holder.id_client,
        statut_cycle="detenue",
        type_detenteur="client", id_client=holder.id_client,
        statut="active", version_utilisation=0,
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(lc)
    db_session.commit()

    transfer = client.post(f"/api/v1/lettres-credit/{lc.id_lc}/payer-fournisseur", json={
        "id_fournisseur": supplier.id_fournisseur,
        "date_cession": date.today().isoformat(),
        "version_utilisation": 0,
    }, headers=auth_headers)
    deposit = client.post(f"/api/v1/lettres-credit/{lc.id_lc}/verser-banque", json={
        "id_compte": account.id_compte, "version_utilisation": 0,
    }, headers=auth_headers)
    assert transfer.status_code == 409, transfer.text
    assert deposit.status_code == 409, deposit.text
    db_session.refresh(lc)
    assert lc.statut == "active" and lc.version_utilisation == 0
    assert db_session.query(CessionLC).filter_by(id_lc=lc.id_lc).count() == 0
    assert db_session.query(LettreCreditUtilisation).filter_by(id_lc=lc.id_lc).count() == 0
    assert db_session.query(MouvementBancaire).filter_by(source="lc").count() == 0


def test_supplier_lc_transfer_cannot_be_backdated_before_receipt(
    client, db_session, auth_headers, test_user,
):
    from app.main import app
    from app.utils.dependencies import get_current_active_user
    app.dependency_overrides[get_current_active_user] = lambda: test_user
    holder = Client(nom_client="Transfer-date holder")
    supplier = Fournisseur(nom_fournisseur="Transfer-date supplier")
    db_session.add_all([holder, supplier])
    db_session.flush()
    lc = LettreDeCredit(
        numero_reference="LC-TRANSFER-DATE-VALIDATION",
        montant=100,
        date_emission=date.today() - timedelta(days=10),
        date_disponibilite=date.today() - timedelta(days=5),
        date_reception=date.today() - timedelta(days=1),
        id_client_origine=holder.id_client, statut_cycle="detenue",
        type_detenteur="client", id_client=holder.id_client,
        statut="active", version_utilisation=0,
        id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(lc)
    db_session.commit()
    response = client.post(f"/api/v1/lettres-credit/{lc.id_lc}/payer-fournisseur", json={
        "id_fournisseur": supplier.id_fournisseur,
        "date_cession": (date.today() - timedelta(days=2)).isoformat(),
        "version_utilisation": 0,
    }, headers=auth_headers)
    assert response.status_code == 422, response.text
    db_session.refresh(lc)
    assert lc.statut == "active" and lc.version_utilisation == 0
    assert db_session.query(CessionLC).filter_by(id_lc=lc.id_lc).count() == 0
