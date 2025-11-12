"""
Tests pour les endpoints CRUD des clients.
"""
import pytest
from fastapi import status
from datetime import date, timedelta
from decimal import Decimal
from app.models.client import Client
from app.models.transaction import Transaction
from app.models.user import Utilisateur
from app.utils.security import hash_password
import bcrypt


class TestClientsEndpoints:
    """Tests pour les endpoints CRUD des clients."""
    
    def test_get_clients_requires_auth(self, client):
        """Test que GET /clients nécessite une authentification."""
        response = client.get("/api/v1/clients")
        assert response.status_code == status.HTTP_401_UNAUTHORIZED
    
    def test_get_clients_success(self, client, test_user, db_session):
        """Test de récupération de la liste des clients."""
        # Se connecter
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        assert login_response.status_code == status.HTTP_200_OK
        token = login_response.json()["access_token"]
        
        # Créer quelques clients de test
        client1 = Client(
            nom_client="Client Test 1",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        client2 = Client(
            nom_client="Client Test 2",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([client1, client2])
        db_session.commit()
        
        # Récupérer la liste des clients
        response = client.get(
            "/api/v1/clients",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 2
    
    def test_get_clients_with_est_actif_filter(self, client, test_user, db_session):
        """Test du filtre est_actif sur GET /clients."""
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        token = login_response.json()["access_token"]
        
        # Créer des clients actifs et inactifs
        active_client = Client(
            nom_client="Client Actif",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        inactive_client = Client(
            nom_client="Client Inactif",
            est_actif=False,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([active_client, inactive_client])
        db_session.commit()
        
        # Tester le filtre est_actif=True
        response = client.get(
            "/api/v1/clients?est_actif=true",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(c["est_actif"] is True for c in data)
        
        # Tester le filtre est_actif=False
        response = client.get(
            "/api/v1/clients?est_actif=false",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert all(c["est_actif"] is False for c in data)
    
    def test_get_clients_with_recherche_filter(self, client, test_user, db_session):
        """Test du filtre recherche sur GET /clients."""
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        token = login_response.json()["access_token"]
        
        # Créer des clients avec des noms différents
        client1 = Client(
            nom_client="Client Alpha",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        client2 = Client(
            nom_client="Client Beta",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        client3 = Client(
            nom_client="Alpha Company",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([client1, client2, client3])
        db_session.commit()
        
        # Rechercher "Alpha"
        response = client.get(
            "/api/v1/clients?recherche=Alpha",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 2
        assert all("Alpha" in c["nom_client"] for c in data)
        
        # Rechercher "Beta"
        response = client.get(
            "/api/v1/clients?recherche=Beta",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["nom_client"] == "Client Beta"
    
    def test_get_clients_with_combined_filters(self, client, test_user, db_session):
        """Test des filtres combinés est_actif et recherche."""
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        token = login_response.json()["access_token"]
        
        # Créer des clients
        active_alpha = Client(
            nom_client="Alpha Actif",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        inactive_alpha = Client(
            nom_client="Alpha Inactif",
            est_actif=False,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        active_beta = Client(
            nom_client="Beta Actif",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([active_alpha, inactive_alpha, active_beta])
        db_session.commit()
        
        # Rechercher "Alpha" et est_actif=True
        response = client.get(
            "/api/v1/clients?recherche=Alpha&est_actif=true",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["nom_client"] == "Alpha Actif"
        assert data[0]["est_actif"] is True
    
    def test_get_client_by_id_success(self, client, test_user, db_session):
        """Test de récupération d'un client par ID."""
        login_response = client.post(
            "/api/v1/auth/login",
            json={
                "email": "test@example.com",
                "mot_de_passe": "TestPass123!"
            }
        )
        token = login_response.json()["access_token"]
        
        # Créer un client
        test_client = Client(
            nom_client="Client Test",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        
        # Récupérer le client par ID
        response = client.get(
            f"/api/v1/clients/{test_client.id_client}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["id_client"] == test_client.id_client
        assert data["nom_client"] == "Client Test"
        assert data["est_actif"] is True
        assert "date_creation" in data
        assert "date_modification" in data
    
    def test_get_client_by_id_not_found(self, client, admin_token):
        """Test de récupération d'un client inexistant."""
        token = admin_token
        
        # Essayer de récupérer un client inexistant
        response = client.get(
            "/api/v1/clients/99999",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "introuvable" in response.json()["detail"].lower()
    
    def test_create_client_success(self, client, test_user, db_session, admin_token):
        """Test de création d'un client."""
        token = admin_token
        
        # Créer un nouveau client
        response = client.post(
            "/api/v1/clients",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nom_client": "Nouveau Client",
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["nom_client"] == "Nouveau Client"
        assert data["est_actif"] is True
        assert "id_client" in data
        assert "date_creation" in data
        
        # Vérifier que le client a été créé en base
        client_db = db_session.query(Client).filter(
            Client.id_client == data["id_client"]
        ).first()
        assert client_db is not None
        assert client_db.nom_client == "Nouveau Client"
        assert client_db.id_utilisateur_creation == test_user.id_utilisateur
    
    def test_create_client_duplicate_name(self, client, test_user, db_session, admin_token):
        """Test qu'on ne peut pas créer deux clients avec le même nom."""
        token = admin_token
        
        # Créer un premier client
        client1 = Client(
            nom_client="Client Unique",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(client1)
        db_session.commit()
        
        # Essayer de créer un deuxième client avec le même nom
        response = client.post(
            "/api/v1/clients",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nom_client": "Client Unique",
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "existe déjà" in response.json()["detail"].lower()
    
    def test_create_client_validation_error(self, client, admin_token):
        """Test de validation des données lors de la création."""
        token = admin_token
        
        # Essayer de créer un client sans nom
        response = client.post(
            "/api/v1/clients",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        
        # Essayer de créer un client avec un nom vide
        response = client.post(
            "/api/v1/clients",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nom_client": "   ",
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    
    def test_update_client_success(self, client, test_user, db_session, admin_token):
        """Test de mise à jour d'un client."""
        token = admin_token
        
        # Créer un client
        test_client = Client(
            nom_client="Client Original",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        
        # Mettre à jour le client
        response = client.put(
            f"/api/v1/clients/{test_client.id_client}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nom_client": "Client Modifié",
                "est_actif": False
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["nom_client"] == "Client Modifié"
        assert data["est_actif"] is False
        
        # Vérifier en base
        db_session.refresh(test_client)
        assert test_client.nom_client == "Client Modifié"
        assert test_client.est_actif is False
        assert test_client.id_utilisateur_modification == test_user.id_utilisateur
    
    def test_update_client_partial(self, client, test_user, db_session, admin_token):
        """Test de mise à jour partielle d'un client."""
        token = admin_token
        
        # Créer un client
        test_client = Client(
            nom_client="Client Original",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        original_name = test_client.nom_client
        
        # Mettre à jour uniquement est_actif
        response = client.put(
            f"/api/v1/clients/{test_client.id_client}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "est_actif": False
            }
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["nom_client"] == original_name  # Nom inchangé
        assert data["est_actif"] is False  # Seul est_actif modifié
    
    def test_update_client_not_found(self, client, admin_token):
        """Test de mise à jour d'un client inexistant."""
        token = admin_token
        
        # Essayer de mettre à jour un client inexistant
        response = client.put(
            "/api/v1/clients/99999",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nom_client": "Client Inexistant"
            }
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_update_client_duplicate_name(self, client, test_user, db_session, admin_token):
        """Test qu'on ne peut pas mettre à jour un client avec un nom déjà utilisé."""
        token = admin_token
        
        # Créer deux clients
        client1 = Client(
            nom_client="Client 1",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        client2 = Client(
            nom_client="Client 2",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add_all([client1, client2])
        db_session.commit()
        db_session.refresh(client2)
        
        # Essayer de renommer client2 avec le nom de client1
        response = client.put(
            f"/api/v1/clients/{client2.id_client}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nom_client": "Client 1"
            }
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "existe déjà" in response.json()["detail"].lower()
    
    def test_delete_client_success(self, client, test_user, db_session, admin_token):
        """Test de suppression (soft delete) d'un client."""
        token = admin_token
        
        # Créer un client
        test_client = Client(
            nom_client="Client à Supprimer",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        client_id = test_client.id_client
        
        # Supprimer le client
        response = client.delete(
            f"/api/v1/clients/{client_id}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_204_NO_CONTENT
        
        # Vérifier que le client existe toujours mais est inactif
        db_session.refresh(test_client)
        assert test_client.est_actif is False
        assert test_client.id_utilisateur_modification == test_user.id_utilisateur
        
        # Vérifier qu'il n'apparaît plus dans la liste des clients actifs
        response = client.get(
            "/api/v1/clients?est_actif=true",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        client_ids = [c["id_client"] for c in data]
        assert client_id not in client_ids
    
    def test_delete_client_not_found(self, client, admin_token):
        """Test de suppression d'un client inexistant."""
        token = admin_token
        
        # Essayer de supprimer un client inexistant
        response = client.delete(
            "/api/v1/clients/99999",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
    
    def test_delete_client_already_inactive(self, client, test_user, db_session, admin_token):
        """Test qu'on ne peut pas supprimer un client déjà inactif."""
        token = admin_token
        
        # Créer un client inactif
        test_client = Client(
            nom_client="Client Inactif",
            est_actif=False,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        
        # Essayer de supprimer le client déjà inactif
        response = client.delete(
            f"/api/v1/clients/{test_client.id_client}",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "déjà inactif" in response.json()["detail"].lower()
    
    def test_client_tracks_user_creation(self, client, test_user, db_session, admin_token):
        """Test que l'ID de l'utilisateur créateur est enregistré."""
        token = admin_token
        
        # Créer un client
        response = client.post(
            "/api/v1/clients",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nom_client": "Client avec Traçabilité",
                "est_actif": True
            }
        )
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        
        # Vérifier en base
        client_db = db_session.query(Client).filter(
            Client.id_client == data["id_client"]
        ).first()
        assert client_db.id_utilisateur_creation == test_user.id_utilisateur
    
    def test_client_tracks_user_modification(self, client, test_user, db_session, admin_token):
        """Test que l'ID de l'utilisateur modificateur est enregistré."""
        token = admin_token
        
        # Créer un client
        test_client = Client(
            nom_client="Client à Modifier",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        
        # Modifier le client
        response = client.put(
            f"/api/v1/clients/{test_client.id_client}",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "nom_client": "Client Modifié"
            }
        )
        assert response.status_code == status.HTTP_200_OK
        
        # Vérifier en base
        db_session.refresh(test_client)
        assert test_client.id_utilisateur_modification == test_user.id_utilisateur
    
    def test_get_clients_pagination(self, client, test_user, db_session, admin_token):
        """Test de la pagination sur GET /clients."""
        token = admin_token
        
        # Créer plusieurs clients
        clients = [
            Client(
                nom_client=f"Client {i}",
                est_actif=True,
                id_utilisateur_creation=test_user.id_utilisateur
            )
            for i in range(10)
        ]
        db_session.add_all(clients)
        db_session.commit()
        
        # Récupérer la première page (5 clients)
        response = client.get(
            "/api/v1/clients?skip=0&limit=5",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 5
        
        # Récupérer la deuxième page
        response = client.get(
            "/api/v1/clients?skip=5&limit=5",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 5

    def test_get_client_profile_success(self, client, test_user, db_session, admin_token):
        """Test de récupération du profil d'un client avec transactions."""
        token = admin_token
        
        # Créer un client
        test_client = Client(
            nom_client="Client avec Transactions",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        
        # Créer plusieurs transactions pour ce client
        today = date.today()
        transactions = [
            Transaction(
                date_transaction=today - timedelta(days=i),
                montant_total=Decimal(f"{100 + i * 10}.00"),
                est_actif=True,
                id_client=test_client.id_client,
                id_utilisateur_creation=test_user.id_utilisateur
            )
            for i in range(5)
        ]
        db_session.add_all(transactions)
        db_session.commit()
        
        # Récupérer le profil du client
        response = client.get(
            f"/api/v1/clients/{test_client.id_client}/profile",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        # Vérifier la structure de la réponse
        assert "client" in data
        assert "statistiques" in data
        assert "transactions" in data
        
        # Vérifier les informations du client
        assert data["client"]["id_client"] == test_client.id_client
        assert data["client"]["nom_client"] == "Client avec Transactions"
        
        # Vérifier les statistiques
        stats = data["statistiques"]
        assert stats["total_transactions"] == 5
        assert Decimal(str(stats["montant_total_ventes"])) == Decimal("600.00")  # 100+110+120+130+140
        assert stats["montant_moyen_transaction"] is not None
        assert Decimal(str(stats["montant_moyen_transaction"])) == Decimal("120.00")
        assert stats["date_premiere_transaction"] is not None
        assert stats["date_derniere_transaction"] is not None
        
        # Vérifier les transactions (paginées, triées par date décroissante)
        assert len(data["transactions"]) == 5
        # Vérifier que les transactions sont triées par date décroissante
        transaction_dates = [t["date_transaction"] for t in data["transactions"]]
        assert transaction_dates == sorted(transaction_dates, reverse=True)
    
    def test_get_client_profile_without_transactions(self, client, test_user, db_session, admin_token):
        """Test de récupération du profil d'un client sans transactions."""
        token = admin_token
        
        # Créer un client sans transactions
        test_client = Client(
            nom_client="Client sans Transactions",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        
        # Récupérer le profil du client
        response = client.get(
            f"/api/v1/clients/{test_client.id_client}/profile",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        # Vérifier les statistiques pour un client sans transactions
        stats = data["statistiques"]
        assert stats["total_transactions"] == 0
        assert Decimal(str(stats["montant_total_ventes"])) == Decimal("0")
        assert stats["montant_moyen_transaction"] is None
        assert stats["date_premiere_transaction"] is None
        assert stats["date_derniere_transaction"] is None
        
        # Vérifier que la liste des transactions est vide
        assert len(data["transactions"]) == 0
    
    def test_get_client_profile_not_found(self, client, admin_token):
        """Test de récupération du profil d'un client inexistant."""
        token = admin_token
        
        # Essayer de récupérer le profil d'un client inexistant
        response = client.get(
            "/api/v1/clients/99999/profile",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert "introuvable" in response.json()["detail"].lower()
    
    def test_get_client_profile_pagination(self, client, test_user, db_session, admin_token):
        """Test de la pagination des transactions dans le profil client."""
        token = admin_token
        
        # Créer un client
        test_client = Client(
            nom_client="Client avec Beaucoup de Transactions",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        
        # Créer 10 transactions
        today = date.today()
        transactions = [
            Transaction(
                date_transaction=today - timedelta(days=i),
                montant_total=Decimal("100.00"),
                est_actif=True,
                id_client=test_client.id_client,
                id_utilisateur_creation=test_user.id_utilisateur
            )
            for i in range(10)
        ]
        db_session.add_all(transactions)
        db_session.commit()
        
        # Récupérer la première page (5 transactions)
        response = client.get(
            f"/api/v1/clients/{test_client.id_client}/profile?skip=0&limit=5",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["transactions"]) == 5
        assert data["statistiques"]["total_transactions"] == 10  # Toutes les transactions comptées
        
        # Récupérer la deuxième page
        response = client.get(
            f"/api/v1/clients/{test_client.id_client}/profile?skip=5&limit=5",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["transactions"]) == 5
        
        # Récupérer la troisième page (devrait être vide)
        response = client.get(
            f"/api/v1/clients/{test_client.id_client}/profile?skip=10&limit=5",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data["transactions"]) == 0
    
    def test_get_client_profile_only_active_transactions(self, client, test_user, db_session, admin_token):
        """Test que seules les transactions actives sont comptées dans les statistiques."""
        token = admin_token
        
        # Créer un client
        test_client = Client(
            nom_client="Client avec Transactions Actives/Inactives",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        
        today = date.today()
        
        # Créer 3 transactions actives
        active_transactions = [
            Transaction(
                date_transaction=today - timedelta(days=i),
                montant_total=Decimal("100.00"),
                est_actif=True,
                id_client=test_client.id_client,
                id_utilisateur_creation=test_user.id_utilisateur
            )
            for i in range(3)
        ]
        
        # Créer 2 transactions inactives
        inactive_transactions = [
            Transaction(
                date_transaction=today - timedelta(days=i),
                montant_total=Decimal("200.00"),
                est_actif=False,
                id_client=test_client.id_client,
                id_utilisateur_creation=test_user.id_utilisateur
            )
            for i in range(3, 5)
        ]
        
        db_session.add_all(active_transactions + inactive_transactions)
        db_session.commit()
        
        # Récupérer le profil du client
        response = client.get(
            f"/api/v1/clients/{test_client.id_client}/profile",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        
        # Vérifier que seules les transactions actives sont comptées
        stats = data["statistiques"]
        assert stats["total_transactions"] == 3  # Seulement les 3 actives
        assert Decimal(str(stats["montant_total_ventes"])) == Decimal("300.00")  # 3 * 100
        assert len(data["transactions"]) == 3  # Seulement les 3 actives dans la liste
        
        # Vérifier qu'aucune transaction inactive n'est dans la liste
        for transaction in data["transactions"]:
            assert transaction["est_actif"] is True
    
    def test_get_client_profile_requires_auth(self, client):
        """Test que GET /clients/{id}/profile nécessite une authentification."""
        from app.config import settings
        response = client.get("/api/v1/clients/1/profile")
        # Si l'authentification est activée, on devrait avoir 401, sinon 404 (client inexistant)
        if settings.ENABLE_AUTH:
            assert response.status_code == status.HTTP_401_UNAUTHORIZED
        else:
            # Si l'auth est désactivée, on obtient 404 car le client n'existe pas
            assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_client_stats_mensuelles_success(self, client, test_user, db_session, admin_token):
        """Test de récupération des statistiques mensuelles d'un client."""
        token = admin_token
        
        # Créer un client
        test_client = Client(
            nom_client="Client Stats Test",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        
        # Créer des transactions sur plusieurs mois
        today = date.today()
        from dateutil.relativedelta import relativedelta
        
        # Transaction il y a 2 mois
        transaction1 = Transaction(
            date_transaction=today.replace(day=1) - relativedelta(months=2),
            montant_total=Decimal("1000.00"),
            est_actif=True,
            id_client=test_client.id_client
        )
        # Transaction il y a 1 mois
        transaction2 = Transaction(
            date_transaction=today.replace(day=1) - relativedelta(months=1),
            montant_total=Decimal("2000.00"),
            est_actif=True,
            id_client=test_client.id_client
        )
        # Transaction ce mois
        transaction3 = Transaction(
            date_transaction=today.replace(day=1),
            montant_total=Decimal("3000.00"),
            est_actif=True,
            id_client=test_client.id_client
        )
        
        db_session.add_all([transaction1, transaction2, transaction3])
        db_session.commit()
        
        # Tester avec période de 6 mois
        response = client.get(
            f"/api/v1/clients/{test_client.id_client}/stats-mensuelles?periode=6",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["periode"] == "6_mois"
        assert len(data["data"]) == 6  # 6 mois de données
        
        # Vérifier que les mois sont présents (même ceux sans transactions)
        mois_keys = [item["mois"] for item in data["data"]]
        assert len(set(mois_keys)) == len(mois_keys)  # Pas de doublons
        
        # Vérifier que les transactions sont comptabilisées
        montants = {item["mois"]: Decimal(str(item["montant"])) for item in data["data"]}
        assert sum(montants.values()) == Decimal("6000.00")
        
        # Tester avec période de 12 mois
        response = client.get(
            f"/api/v1/clients/{test_client.id_client}/stats-mensuelles?periode=12",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["periode"] == "12_mois"
        assert len(data["data"]) == 12  # 12 mois de données

    def test_get_client_stats_mensuelles_not_found(self, client, admin_token):
        """Test que GET /clients/{id}/stats-mensuelles retourne 404 si le client n'existe pas."""
        token = admin_token
        response = client.get(
            "/api/v1/clients/99999/stats-mensuelles",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND

    def test_get_client_stats_mensuelles_invalid_periode(self, client, test_user, db_session, admin_token):
        """Test que GET /clients/{id}/stats-mensuelles valide la période."""
        token = admin_token
        
        # Créer un client
        test_client = Client(
            nom_client="Client Test",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        
        # Tester avec une période invalide (FastAPI valide automatiquement et retourne 422)
        response = client.get(
            f"/api/v1/clients/{test_client.id_client}/stats-mensuelles?periode=3",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY

    def test_get_client_stats_mensuelles_no_transactions(self, client, test_user, db_session, admin_token):
        """Test des statistiques mensuelles pour un client sans transactions."""
        token = admin_token
        
        # Créer un client sans transactions
        test_client = Client(
            nom_client="Client Sans Transactions",
            est_actif=True,
            id_utilisateur_creation=test_user.id_utilisateur
        )
        db_session.add(test_client)
        db_session.commit()
        db_session.refresh(test_client)
        
        # Tester les statistiques
        response = client.get(
            f"/api/v1/clients/{test_client.id_client}/stats-mensuelles?periode=6",
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["periode"] == "6_mois"
        assert len(data["data"]) == 6
        
        # Tous les montants et nb_transactions doivent être à 0
        for item in data["data"]:
            assert Decimal(str(item["montant"])) == Decimal('0')
            assert item["nb_transactions"] == 0

