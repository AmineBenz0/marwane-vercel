# Tests de Charge avec Locust

Ce répertoire contient les tests de charge pour l'API Comptabilité utilisant Locust.

## Installation

Installer Locust (déjà ajouté aux requirements.txt) :

```bash
cd backend
pip install -r requirements.txt
```

## Configuration

Avant d'exécuter les tests, assurez-vous que :

1. **L'API backend est démarrée** sur `http://localhost:8000` (ou modifiez `API_HOST` dans `locustfile.py`)
2. **La base de données contient des données de test** :
   - Au moins un client ou un fournisseur
   - Au moins un produit (optionnel, pour les transactions avec lignes)
   - Un utilisateur de test avec email `test@example.com` et mot de passe `TestPass123!` (si l'authentification est activée)

### Créer des données de test

Si vous n'avez pas encore de données de test, vous pouvez les créer via l'interface web ou via des scripts SQL.

## Exécution des Tests

### Scripts d'Exécution (Recommandé)

#### Windows (PowerShell)

```powershell
cd backend
.\tests\load\run_load_test.ps1
```

#### Linux/Mac (Bash)

```bash
cd backend
chmod +x tests/load/run_load_test.sh
./tests/load/run_load_test.sh
```

Les scripts vérifient automatiquement que l'API est accessible et exécutent les tests avec les paramètres recommandés.

**Variables d'environnement optionnelles :**
- `LOCUST_HOST` : URL de l'API (défaut: http://localhost:8000)
- `LOCUST_USERS` : Nombre d'utilisateurs (défaut: 100)
- `LOCUST_SPAWN_RATE` : Taux de montée en charge (défaut: 10)
- `LOCUST_RUN_TIME` : Durée des tests (défaut: 5m)
- `LOCUST_REPORT` : Nom du fichier de rapport (défaut: load_test_report.html)

Exemple avec variables d'environnement :
```bash
LOCUST_USERS=50 LOCUST_SPAWN_RATE=5 ./tests/load/run_load_test.sh
```

### Interface Web

Lancer Locust avec l'interface web :

```bash
cd backend
locust -f tests/load/locustfile.py --host=http://localhost:8000
```

Puis ouvrir votre navigateur sur `http://localhost:8089` pour configurer et lancer les tests.

**Paramètres recommandés :**
- **Number of users** : 100
- **Spawn rate** : 10 (utilisateurs par seconde)
- **Host** : http://localhost:8000

### Ligne de Commande

Exécuter les tests directement en ligne de commande (sans interface web) :

```bash
cd backend
locust -f tests/load/locustfile.py \
  --host=http://localhost:8000 \
  --users=100 \
  --spawn-rate=10 \
  --run-time=5m \
  --headless \
  --html=load_test_report.html
```

### Exécuter un Scénario Spécifique

Pour tester un seul scénario, vous pouvez modifier temporairement `locustfile.py` ou utiliser des classes spécifiques.

## Scénarios de Test

### Scénario 1 : Lecture Intensive (`ReadIntensiveUser`)
- **GET /transactions** (liste avec filtres variés) - 43%
- **GET /caisse/solde** - 29%
- **GET /dashboard** (simule les appels du dashboard) - 14%
- **GET /transactions/{id}** - 14%

### Scénario 2 : Écriture Modérée (`WriteModerateUser`)
- **POST /transactions** (création) - 75%
- **PUT /transactions/{id}** (modification) - 25%

### Scénario 3 : Mixte (`MixedUser`)
- **80% lecture** : GET /transactions, GET /caisse/solde, GET /transactions/{id}
- **20% écriture** : POST /transactions, PUT /transactions/{id}

## Critères d'Acceptation

Les tests doivent valider que :

- ✅ Application reste responsive sous charge (100 users)
- ✅ Temps de réponse P95 < 500ms
- ✅ Temps de réponse P99 < 1000ms
- ✅ Aucun crash ou timeout
- ✅ Taux d'erreur < 0.1%

## Analyse des Résultats

### Rapport HTML

Si vous utilisez `--html=load_test_report.html`, un rapport détaillé sera généré avec :
- Statistiques par endpoint
- Temps de réponse (moyen, min, max, P50, P95, P99)
- Taux d'erreur
- Graphiques de performance

### Métriques Clés à Surveiller

1. **Temps de réponse moyen** : Doit rester raisonnable (< 200ms idéalement)
2. **Temps de réponse P95** : 95% des requêtes doivent répondre en moins de 500ms
3. **Temps de réponse P99** : 99% des requêtes doivent répondre en moins de 1000ms
4. **Taux d'erreur** : Doit être < 0.1%
5. **Requêtes par seconde (RPS)** : Indique le débit de l'application

## Optimisations Possibles

Si les tests révèlent des goulots d'étranglement :

1. **Ajouter des index** sur les colonnes fréquemment filtrées (date_transaction, id_client, id_fournisseur)
2. **Implémenter un cache** pour les endpoints de lecture fréquents (ex: /caisse/solde)
3. **Optimiser les requêtes** avec pagination appropriée
4. **Ajouter de la pagination** si elle n'est pas déjà présente
5. **Optimiser les jointures** dans les requêtes complexes

## Dépannage

### Erreur : "No clients or fournisseurs found"
- Assurez-vous que la base de données contient au moins un client ou un fournisseur
- Vérifiez que l'API est accessible et que les endpoints `/api/v1/clients` et `/api/v1/fournisseurs` retournent des données

### Erreur : "Authentication failed"
- Si `ENABLE_AUTH=True`, créez un utilisateur de test avec email `test@example.com` et mot de passe `TestPass123!`
- Ou modifiez les credentials dans `locustfile.py` (fonction `get_auth_token`)

### L'API ne répond pas
- Vérifiez que le backend est démarré : `uvicorn app.main:app --reload`
- Vérifiez l'URL dans `locustfile.py` (variable `API_HOST`)

## Notes

- Les tests créent des transactions réelles dans la base de données. Assurez-vous d'utiliser une base de données de test.
- Pour des tests plus réalistes, vous pouvez ajuster les poids des tâches (`@task`) dans chaque classe.
- Les temps d'attente entre les requêtes (`wait_time`) peuvent être ajustés pour simuler un comportement utilisateur plus réaliste.

