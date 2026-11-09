"""Read-only, paginated view of the existing transaction change audit."""
from datetime import date, datetime, timezone
from decimal import Decimal

from app.models.audit import TransactionAudit
from app.models.client import Client
from app.models.produit import Produit
from app.models.transaction import Transaction


def test_existing_audit_endpoint_preserves_default_and_supports_paging(
    client, db_session, test_user, auth_headers,
):
    customer = Client(nom_client='Client historique', est_actif=True)
    product = Produit(nom_produit='Produit historique', est_actif=True,
                      pour_clients=True, pour_fournisseurs=True)
    db_session.add_all([customer, product])
    db_session.flush()
    transaction = Transaction(
        date_transaction=date.today(), id_produit=product.id_produit,
        id_client=customer.id_client, quantite=10,
        prix_unitaire=Decimal('1.50'), montant_total=Decimal('15.00'),
        est_actif=True, id_utilisateur_creation=test_user.id_utilisateur,
    )
    db_session.add(transaction)
    db_session.flush()
    # Identical timestamps exercise the deterministic id tie breaker.
    timestamp = datetime(2026, 11, 9, 14, 0, tzinfo=timezone.utc)
    db_session.add_all([
        TransactionAudit(
            id_transaction=transaction.id_transaction,
            id_utilisateur=test_user.id_utilisateur,
            date_changement=timestamp, champ_modifie='montant_total',
            ancienne_valeur=str(10 + index), nouvelle_valeur=str(11 + index),
        ) for index in range(3)
    ])
    db_session.commit()

    base = f'/api/v1/transactions/{transaction.id_transaction}/audit'
    first = client.get(base, params={'skip': 0, 'limit': 2}, headers=auth_headers)
    second = client.get(base, params={'skip': 2, 'limit': 2}, headers=auth_headers)
    complete = client.get(base, headers=auth_headers)
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert complete.status_code == 200, complete.text
    first_ids = [entry['id_audit'] for entry in first.json()]
    second_ids = [entry['id_audit'] for entry in second.json()]
    assert len(first_ids) == 2 and len(second_ids) == 1
    assert first_ids + second_ids == [entry['id_audit'] for entry in complete.json()]
    assert first_ids == sorted(first_ids, reverse=True)
    assert all(item['nom_utilisateur'] == test_user.nom_utilisateur for item in complete.json())
    assert db_session.query(TransactionAudit).filter(
        TransactionAudit.id_transaction == transaction.id_transaction
    ).count() == 3  # Reading audit history cannot write to audit or transactions.

    assert client.get(base, params={'skip': -1, 'limit': 10}, headers=auth_headers).status_code == 422
    assert client.get(base, params={'limit': 51}, headers=auth_headers).status_code == 422
    assert client.get('/api/v1/transactions/999999/audit', headers=auth_headers).status_code == 404
