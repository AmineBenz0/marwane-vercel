"""
Tests de charge avec Locust pour l'API Comptabilité.

Scénarios de test :
- Scénario 1 : Lecture intensive (GET /transactions, GET /caisse/solde)
- Scénario 2 : Écriture modérée (POST /transactions, PUT /transactions)
- Scénario 3 : Mixte (80% lecture, 20% écriture)

Configuration :
- 100 utilisateurs simultanés
- Montée en charge progressive (spawn rate: 10/sec)
- Durée : 5 minutes

Critères d'acceptation :
- Application reste responsive sous charge (100 users)
- Temps de réponse P95 < 500ms
- Temps de réponse P99 < 1000ms
- Aucun crash ou timeout
- Taux d'erreur < 0.1%
"""
from locust import HttpUser, task, between, events
from datetime import date, timedelta
import random
import json
import logging

import threading

# Configuration
API_BASE_URL = "/api/v1"
API_HOST = "http://localhost:8000"  # Modifier selon votre configuration

# Variables globales pour stocker les données de test
test_data = {
    "access_token": None,
    "client_ids": [],
    "fournisseur_ids": [],
    "produit_ids": [],
    "transaction_ids": []
}

# Verrou pour la sécurité des threads lors de la mise à jour de test_data
test_data_lock = threading.Lock()

logger = logging.getLogger(__name__)


def get_auth_token(client):
    """
    Obtient un token d'authentification pour les tests.
    Si ENABLE_AUTH est False, retourne None.
    """
    if test_data["access_token"]:
        return test_data["access_token"]
    
    try:
        # Essayer de se connecter avec un utilisateur de test
        # Note: Vous devrez créer un utilisateur de test dans votre base de données
        login_data = {
            "email": "test@example.com",
            "mot_de_passe": "TestPass123!"
        }
        
        response = client.post(
            f"{API_BASE_URL}/auth/login",
            json=login_data,
            name="Auth - Login"
        )
        
        if response.status_code == 200:
            test_data["access_token"] = response.json()["access_token"]
            return test_data["access_token"]
        else:
            # Si l'auth est désactivée ou l'utilisateur n'existe pas, continuer sans token
            logger.warning(f"Impossible de se connecter: {response.status_code}")
            return None
    except Exception as e:
        logger.warning(f"Erreur lors de la connexion: {e}")
        return None


def get_headers(client):
    """Retourne les headers avec authentification si disponible."""
    token = get_auth_token(client)
    if token:
        return {"Authorization": f"Bearer {token}"}
    return {}


def load_test_data(client):
    """
    Charge les données de test nécessaires (clients, fournisseurs, produits).
    Cette fonction est appelée une fois au démarrage.
    """
    headers = get_headers(client)
    
    # Charger les clients
    try:
        response = client.get(
            f"{API_BASE_URL}/clients",
            headers=headers,
            name="Setup - Load Clients"
        )
        if response.status_code == 200:
            clients = response.json()
            test_data["client_ids"] = [c["id_client"] for c in clients if c.get("id_client")]
            logger.info(f"Chargé {len(test_data['client_ids'])} clients")
    except Exception as e:
        logger.warning(f"Erreur lors du chargement des clients: {e}")
    
    # Charger les fournisseurs
    try:
        response = client.get(
            f"{API_BASE_URL}/fournisseurs",
            headers=headers,
            name="Setup - Load Fournisseurs"
        )
        if response.status_code == 200:
            fournisseurs = response.json()
            test_data["fournisseur_ids"] = [f["id_fournisseur"] for f in fournisseurs if f.get("id_fournisseur")]
            logger.info(f"Chargé {len(test_data['fournisseur_ids'])} fournisseurs")
    except Exception as e:
        logger.warning(f"Erreur lors du chargement des fournisseurs: {e}")
    
    # Charger les produits
    try:
        response = client.get(
            f"{API_BASE_URL}/produits",
            headers=headers,
            name="Setup - Load Produits"
        )
        if response.status_code == 200:
            produits = response.json()
            test_data["produit_ids"] = [p["id_produit"] for p in produits if p.get("id_produit")]
            logger.info(f"Chargé {len(test_data['produit_ids'])} produits")
    except Exception as e:
        logger.warning(f"Erreur lors du chargement des produits: {e}")
    
    # Charger quelques transactions existantes pour les mises à jour
    try:
        response = client.get(
            f"{API_BASE_URL}/transactions?limit=50",
            headers=headers,
            name="Setup - Load Transactions"
        )
        if response.status_code == 200:
            transactions = response.json()
            test_data["transaction_ids"] = [t["id_transaction"] for t in transactions if t.get("id_transaction")]
            logger.info(f"Chargé {len(test_data['transaction_ids'])} transactions")
    except Exception as e:
        logger.warning(f"Erreur lors du chargement des transactions: {e}")


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Appelé au démarrage des tests pour charger les données de test."""
    logger.info("Démarrage des tests de charge - Chargement des données de test...")
    # Créer un client temporaire pour charger les données de test
    from locust.clients import HttpSession
    client = HttpSession(
        base_url=environment.host or "http://localhost:8000",
        request_event=environment.events.request,
        user=environment.runner,
    )
    load_test_data(client)
    logger.info("Données de test chargées")


class ReadIntensiveUser(HttpUser):
    """
    Scénario 1 : Lecture intensive
    - GET /transactions (liste)
    - GET /caisse/solde
    """
    wait_time = between(1, 3)  # Attente entre 1 et 3 secondes
    
    @task(3)
    def get_transactions_list(self):
        """Récupère la liste des transactions avec différents filtres."""
        headers = get_headers(self.client)
        
        # Varier les paramètres de requête pour simuler un usage réel
        params = {
            "limit": random.choice([10, 20, 50, 100]),
            "skip": random.randint(0, 100)
        }
        
        # Ajouter des filtres aléatoires
        if random.random() < 0.3:  # 30% des requêtes avec filtre date
            today = date.today()
            params["date_debut"] = str(today - timedelta(days=random.randint(1, 30)))
            params["date_fin"] = str(today)
        
        if random.random() < 0.2:  # 20% des requêtes avec filtre est_actif
            params["est_actif"] = random.choice([True, False])
        
        self.client.get(
            f"{API_BASE_URL}/transactions",
            headers=headers,
            params=params,
            name="GET /transactions (liste)"
        )
    
    @task(2)
    def get_caisse_solde(self):
        """Récupère le solde de la caisse."""
        headers = get_headers(self.client)
        self.client.get(
            f"{API_BASE_URL}/caisse/solde",
            headers=headers,
            name="GET /caisse/solde"
        )
    
    @task(1)
    def get_dashboard_data(self):
        """
        Simule les appels du dashboard (GET /dashboard).
        Le dashboard fait plusieurs appels API pour obtenir les statistiques.
        """
        headers = get_headers(self.client)
        today = date.today()
        start_of_month = today.replace(day=1)
        
        # Simuler les appels du dashboard : solde + transactions du mois
        self.client.get(
            f"{API_BASE_URL}/caisse/solde",
            headers=headers,
            name="GET /dashboard (solde)"
        )
        
        # Transactions du mois en cours
        params = {
            "date_debut": str(start_of_month),
            "date_fin": str(today),
            "est_actif": True,
            "limit": 1000
        }
        self.client.get(
            f"{API_BASE_URL}/transactions",
            headers=headers,
            params=params,
            name="GET /dashboard (transactions mois)"
        )
    
    @task(1)
    def get_transaction_by_id(self):
        """Récupère une transaction spécifique par ID."""
        if not test_data["transaction_ids"]:
            return
        
        headers = get_headers(self.client)
        transaction_id = random.choice(test_data["transaction_ids"])
        self.client.get(
            f"{API_BASE_URL}/transactions/{transaction_id}",
            headers=headers,
            name="GET /transactions/{id}"
        )


class WriteModerateUser(HttpUser):
    """
    Scénario 2 : Écriture modérée
    - POST /transactions (création)
    - PUT /transactions (modification)
    """
    wait_time = between(2, 5)  # Attente entre 2 et 5 secondes
    
    @task(3)
    def create_transaction(self):
        """Crée une nouvelle transaction."""
        if not test_data["client_ids"] and not test_data["fournisseur_ids"]:
            return
        
        headers = get_headers(self.client)
        
        # Choisir un produit aléatoire
        if not test_data["produit_ids"]:
            return
        
        id_produit = random.choice(test_data["produit_ids"])
        quantite = random.randint(1, 100)
        prix_unitaire = round(random.uniform(5.0, 50.0), 2)
        montant_total = round(quantite * prix_unitaire, 2)
        
        transaction_data = {
            "date_transaction": str(date.today() - timedelta(days=random.randint(0, 30))),
            "id_produit": id_produit,
            "quantite": quantite,
            "prix_unitaire": str(prix_unitaire),
            "montant_total": str(montant_total),
            "est_actif": True
        }
        
        if use_client and test_data["client_ids"]:
            transaction_data["id_client"] = random.choice(test_data["client_ids"])
        elif test_data["fournisseur_ids"]:
            transaction_data["id_fournisseur"] = random.choice(test_data["fournisseur_ids"])
        else:
            return
        
        response = self.client.post(
            f"{API_BASE_URL}/transactions",
            headers=headers,
            json=transaction_data,
            name="POST /transactions (création)"
        )
        
        # Stocker l'ID de la transaction créée pour les mises à jour
        if response.status_code == 201:
            transaction_id = response.json().get("id_transaction")
            if transaction_id:
                with test_data_lock:
                    # Limiter la taille de la liste pour éviter une consommation excessive de mémoire
                    if len(test_data["transaction_ids"]) < 1000:
                        test_data["transaction_ids"].append(transaction_id)
    
    @task(1)
    def update_transaction(self):
        """Met à jour une transaction existante."""
        if not test_data["transaction_ids"]:
            return
        
        headers = get_headers(self.client)
        transaction_id = random.choice(test_data["transaction_ids"])
        
        update_data = {
            "montant_total": str(round(random.uniform(10.0, 1000.0), 2))
        }
        
        # Parfois modifier la date
        if random.random() < 0.5:
            update_data["date_transaction"] = str(date.today() - timedelta(days=random.randint(0, 30)))
        
        self.client.put(
            f"{API_BASE_URL}/transactions/{transaction_id}",
            headers=headers,
            json=update_data,
            name="PUT /transactions/{id} (modification)"
        )


class MixedUser(HttpUser):
    """
    Scénario 3 : Mixte (80% lecture, 20% écriture)
    """
    wait_time = between(1, 4)  # Attente entre 1 et 4 secondes
    
    @task(8)  # 80% de lecture
    def read_operations(self):
        """Opérations de lecture."""
        headers = get_headers(self.client)
        
        # Choisir aléatoirement entre différentes opérations de lecture
        operation = random.choice([
            "get_transactions_list",
            "get_caisse_solde",
            "get_transaction_by_id"
        ])
        
        if operation == "get_transactions_list":
            params = {
                "limit": random.choice([10, 20, 50]),
                "skip": random.randint(0, 50)
            }
            self.client.get(
                f"{API_BASE_URL}/transactions",
                headers=headers,
                params=params,
                name="GET /transactions (liste) - Mixte"
            )
        elif operation == "get_caisse_solde":
            self.client.get(
                f"{API_BASE_URL}/caisse/solde",
                headers=headers,
                name="GET /caisse/solde - Mixte"
            )
        elif operation == "get_transaction_by_id" and test_data["transaction_ids"]:
            transaction_id = random.choice(test_data["transaction_ids"])
            self.client.get(
                f"{API_BASE_URL}/transactions/{transaction_id}",
                headers=headers,
                name="GET /transactions/{id} - Mixte"
            )
    
    @task(2)  # 20% d'écriture
    def write_operations(self):
        """Opérations d'écriture."""
        if not test_data["client_ids"] and not test_data["fournisseur_ids"]:
            return
        
        headers = get_headers(self.client)
        
        # Choisir entre création et modification
        if random.random() < 0.7 or not test_data["transaction_ids"]:
            # 70% création ou si pas de transactions existantes
            use_client = random.choice([True, False]) if test_data["client_ids"] and test_data["fournisseur_ids"] else (
                bool(test_data["client_ids"])
            )
            
            transaction_data = {
                "date_transaction": str(date.today() - timedelta(days=random.randint(0, 30))),
                "montant_total": str(round(random.uniform(10.0, 1000.0), 2)),
                "est_actif": True
            }
            
            if use_client and test_data["client_ids"]:
                transaction_data["id_client"] = random.choice(test_data["client_ids"])
            elif test_data["fournisseur_ids"]:
                transaction_data["id_fournisseur"] = random.choice(test_data["fournisseur_ids"])
            else:
                return
            
            response = self.client.post(
                f"{API_BASE_URL}/transactions",
                headers=headers,
                json=transaction_data,
                name="POST /transactions (création) - Mixte"
            )
            
            if response.status_code == 201:
                transaction_id = response.json().get("id_transaction")
                if transaction_id:
                    with test_data_lock:
                        if len(test_data["transaction_ids"]) < 1000:
                            test_data["transaction_ids"].append(transaction_id)
        else:
            # 30% modification
            if test_data["transaction_ids"]:
                transaction_id = random.choice(test_data["transaction_ids"])
                update_data = {
                    "montant_total": str(round(random.uniform(10.0, 1000.0), 2))
                }
                self.client.put(
                    f"{API_BASE_URL}/transactions/{transaction_id}",
                    headers=headers,
                    json=update_data,
                    name="PUT /transactions/{id} (modification) - Mixte"
                )

