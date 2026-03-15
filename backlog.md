Voici le backlog qu'on a créé, qu'en penses-tu ? et aurais-tu des suggestions et recommendations ? : # 📋 Backlog du Projet - Digitalisation du Processus de Comptabilité

> **Document de suivi de progression** - Mise à jour régulière recommandée  
> **Date de création** : 2024  
> **Statut global** : 🟡 En cours - Phase 1 Backend

---

## 📊 Vue d'Ensemble

| Phase | Statut | Progression | Durée Estimée | Détails Sprints |
|-------|--------|------------|---------------|-----------------|
| **Phase 0** : Préparation | ✅ Terminé | 100% | 2-3 jours | Sprint 0.1 (3 tâches) |
| **Phase 1** : Backend | 🟡 En cours | ~67% | 4-5 semaines | Sprints 1.1 à 1.12 (40+ tâches) |
| **Phase 2** : Frontend | 🟡 En cours | ~3% | 4-5 semaines | Sprints 2.1 à 2.11 (30+ tâches) |
| **Phase 2.4** : Responsive Mobile | ✅ Terminé | 100% | 2-3 jours | Sprint 2.14 (12 tâches) |
| **Phase 2.5** : Profils & Créances | ⚪ Non démarré | 0% | 2-3 jours | Sprints 2.12 à 2.13 (14 tâches) |
| **Phase 3** : Tests & Déploiement | ⚪ Non démarré | 0% | 3 semaines | Sprints 3.1 à 3.7 (25+ tâches) |
| **Phase 4** : Formation | ⚪ Non démarré | 0% | 1 semaine | Sprints 4.1 à 4.2 (3 tâches) |
| **TOTAL PROJET** | 🟡 | ~15% | **3-4 mois** | ~115 tâches |

**Légende des statuts :**
- ⚪ Non démarré
- 🟡 En cours
- ✅ Terminé
- 🔴 Bloqué
- ⚠️ À revoir

---

## 🔗 Dépendances Critiques

Cette section identifie les dépendances entre tâches pour optimiser le planning et éviter les blocages.

### Chemin Critique (ne peut pas être retardé)
Les tâches suivantes forment le chemin critique du projet. Tout retard sur ces tâches retardera l'ensemble du projet :

1. **Phase 0** → **Phase 1.1** → **Phase 1.2** (Bases techniques)
2. **Phase 1.2 (Tâche 1.2.2 - Alembic)** → Toutes les migrations suivantes (1.2.3 à 1.2.5)
3. **Phase 1.2** (Modèles) → Tous les endpoints CRUD (Sprints 1.5 à 1.10)
4. **Phase 1.4** (Authentification) → **Phase 2** (Frontend nécessite l'authentification)
5. **Phase 1** (Backend complet) → **Phase 3.1** (Tests backend)
6. **Sprint 1.6 (Clients)** + **Sprint 1.9 (Transactions)** → **Phase 2.5** (Profils nécessitent les endpoints existants)
7. **Phase 2** (Frontend complet) → **Phase 2.5** (Profils réutilisent composants)
8. **Phase 2.5** (Pages profil + Créances) → **Phase 3.2** (Tests frontend)
9. **Phase 3.3** (Dockerisation) → Déploiement
10. **Phase 3.6** (Migration données) → Formation utilisateurs

### Tâches Parallélisables (optimisation du temps)

**Sprint 1.6, 1.7, 1.8 - CRUD Simple**
- ✅ Sprint 1.6 (Clients) + Sprint 1.7 (Fournisseurs) + Sprint 1.8 (Produits)
  - **Peuvent être développés en parallèle** (structures similaires)
  - **Gain de temps potentiel** : 2-3 jours
  - **Pré-requis** : Sprint 1.2 terminé

**Sprint 2.5, 2.6, 2.7 - Pages Frontend Simple**
- ✅ Sprint 2.5 (Clients) + Sprint 2.6 (Fournisseurs) + Sprint 2.7 (Produits)
  - **Frontend parallélisable** (même pattern)
  - **Gain de temps potentiel** : 2 jours
  - **Pré-requis** : Sprint 2.2 (Composants) terminé

**Sprint 2.12, 2.13 - Phase 2.5 Profils**
- ✅ Sprint 2.12.1 (Backend Client) + Sprint 2.12.2 (Backend Fournisseur)
  - **Peuvent être développés en parallèle** (même logique)
  - **Gain de temps potentiel** : 1 jour
  - **Pré-requis** : Sprint 1.6 et 1.7 terminés
- ✅ Sprint 2.12.4 (Frontend Client) + Sprint 2.12.5 (Frontend Fournisseur)
  - **Frontend parallélisable** (réutilisation composants)
  - **Gain de temps potentiel** : 1 jour

**Tests Backend et Frontend**
- ✅ Sprint 3.1 (Tests Backend) peut commencer pendant Sprint 2.8-2.10
- ✅ Dockerisation (3.3) peut être préparée pendant les tests
- ✅ Sprint 2.13 (Créances) peut être développé en parallèle avec Phase 3.1

### Tâches Bloquantes (à surveiller de près)

| Tâche | Bloque | Impact si retard | Mitigation |
|-------|--------|------------------|------------|
| ⚠️ **Tâche 0.1.3** : PostgreSQL Docker | Toute la Phase 1 | Projet bloqué | Priorité absolue, POC dès J1 |
| ⚠️ **Tâche 1.2.2** : Alembic | Toutes les migrations | Retard Phase 1 | À faire en priorité après modèles |
| ⚠️ **Tâche 1.4.2** : Login Endpoint | Tout le Frontend | Retard Phase 2 | Tests approfondis, fallback token simple |
| ⚠️ **Tâche 1.11.1** : Trigger Audit | Tests audit, conformité | Fonctionnalité critique | POC avant implémentation |
| ⚠️ **Tâche 2.1.2** : API Service | Tous les appels API frontend | Frontend inutilisable | Template et tests unitaires |
| ⚠️ **Tâche 3.3.3** : Docker Compose | Déploiement | Pas de prod | Tests en continu |
| ⚠️ **Tâche 3.6.1** : Script Migration | Migration données | Pas de données historiques | Validation précoce du fichier Excel |

### Dépendances Externes

- **PostgreSQL** : Nécessaire dès Phase 0
- **Fichier Excel source** : Nécessaire pour Phase 3.6
- **Accès serveur/cloud** : Nécessaire pour déploiement (Phase 3.3)
- **Utilisateurs test** : Nécessaires pour Phase 4

---

## ✅ Definition of Done (DoD)

**Cette section définit quand une tâche est considérée comme TERMINÉE et peut être cochée.**

### Critères Généraux (toutes les tâches)

#### 💻 Développement
- [ ] Code écrit et fonctionnel
- [ ] Code respecte les conventions (PEP 8 pour Python, ESLint pour JS)
- [ ] Pas de code commenté/debug laissé dans le code
- [ ] Pas de `console.log()` ou `print()` en production
- [ ] Variables d'environnement externalisées (pas de valeurs hardcodées)
- [ ] Gestion d'erreurs implémentée

#### 🧪 Tests
- [ ] Testés manuellement (happy path + cas limites)
- [ ] Tests unitaires écrits (si applicable)
- [ ] Tests passent à 100%
- [ ] Cas d'erreur testés (validation, permissions, etc.)

#### 📝 Documentation
- [ ] Code documenté (docstrings Python, JSDoc si pertinent)
- [ ] Commentaires pour logique complexe
- [ ] README mis à jour si changement de configuration
- [ ] Variables d'environnement documentées dans `.env.example`

#### 🔄 Git
- [ ] Committé avec message clair et descriptif
  - Format : `[Type] Description courte`
  - Exemples : `[Feature] Add client CRUD endpoints`, `[Fix] Correct date validation`
- [ ] Code poussé sur le dépôt
- [ ] Pas de conflits
- [ ] Branche feature mergée (si applicable)

#### ✅ Critères d'Acceptation Spécifiques
- [ ] **TOUS** les critères d'acceptation de la tâche sont validés
- [ ] Démontrable/testable
- [ ] Fonctionne dans l'environnement cible (local/Docker)

### Critères Spécifiques par Type de Tâche

#### Pour les Endpoints API (Backend)
- [ ] Endpoint documenté dans Swagger
- [ ] Validation Pydantic implémentée
- [ ] Gestion des permissions (authentification/autorisation)
- [ ] Codes de retour HTTP appropriés (200, 201, 400, 401, 404, 500)
- [ ] Testé avec Postman/curl ou tests automatisés

#### Pour les Pages/Composants (Frontend)
- [ ] Responsive (fonctionne sur desktop minimum)
- [ ] Gestion des états de chargement (loading spinner)
- [ ] Gestion des erreurs (affichage messages utilisateur)
- [ ] Validation formulaires (côté client)
- [ ] Navigation fonctionnelle

#### Pour les Migrations Base de Données
- [ ] Migration testée (up et down)
- [ ] Pas de perte de données
- [ ] Index créés si nécessaire
- [ ] Script de rollback prévu

#### Pour les Tests
- [ ] Coverage minimum atteint (80% backend, 70% frontend)
- [ ] Tests passent en CI/CD (si applicable)
- [ ] Pas de tests flaky (intermittents)

### Checklist de Revue Avant de Cocher ✅

Avant de marquer une tâche comme terminée, posez-vous ces questions :

1. ❓ **Est-ce que ça fonctionne ?** → Testé manuellement
2. ❓ **Est-ce robuste ?** → Cas d'erreur gérés
3. ❓ **Est-ce maintenable ?** → Code clair, documenté
4. ❓ **Est-ce intégré ?** → Committé, pas de conflits
5. ❓ **Les autres peuvent-ils l'utiliser ?** → Documentation à jour

**Si NON à l'une de ces questions → La tâche n'est PAS terminée** ⚠️

---

## 🎯 Phase 0 : Préparation de l'Environnement

**Objectif** : Mettre en place l'environnement de développement et la structure du projet.

**Durée estimée** : 2-3 jours  
**Priorité** : 🔴 Critique

### Sprint 0.1 : Configuration de l'Environnement

#### Tâche 0.1.1 : Installation des Outils
- [x] Installer Python 3.10+ et vérifier la version
- [x] Installer Node.js (LTS) et vérifier la version

**Critères d'acceptation :**
- ✅ Toutes les commandes `python --version`, `node --version`, `docker --version` fonctionnent
- ✅ Docker peut lancer un conteneur de test

**Estimation** : 2h

---

#### Tâche 0.1.2 : Création du Dépôt Git
- [x] Créer un dépôt Git (local ou distant : GitHub/GitLab)
- [x] Initialiser la structure de dossiers :
  ```
  projet/
  ├── backend/
  ├── frontend/
  ├── docs/
  ├── .gitignore
  └── README.md
  ```
- [x] Créer un `.gitignore` approprié pour Python et Node.js
- [x] Créer un README.md avec description du projet

**Critères d'acceptation :**
- ✅ Structure de dossiers créée et commitée
- ✅ `.gitignore` exclut les fichiers sensibles (venv, node_modules, .env)

**Estimation** : 1h

---

#### Tâche 0.1.3 : Configuration PostgreSQL avec Docker
- [x] Créer un fichier `docker-compose.yml` à la racine pour PostgreSQL
- [x] Configurer PostgreSQL avec :
  - Port : 5432
  - Base de données : `comptabilite_db`
  - Utilisateur et mot de passe sécurisés
  - Volume persistant pour les données
- [x] Lancer le conteneur et vérifier la connexion
- [x] Créer un script de démarrage/arrêt

**Critères d'acceptation :**
- ✅ PostgreSQL accessible via `psql` ou un client GUI
- ✅ Les données persistent après redémarrage du conteneur
- ✅ Variables d'environnement dans `.env` (non commité)

**Estimation** : 2h

**Fichiers à créer :**
- `docker-compose.yml` ✅
- `.env.example` (template) ✅
- `scripts.ps1` (PowerShell) ✅
- `scripts.sh` (Bash/WSL) ✅

---

## 🔧 Phase 1 : Développement du Backend (FastAPI)

**Objectif** : Développer l'API REST complète avec authentification, sécurité et audit.

**Durée estimée** : 4-5 semaines *(augmentée avec nouveaux sprints)*  
**Priorité** : 🔴 Critique

**Sprints** : 1.1 à 1.12 (40+ tâches)  
**Points clés** : Modèles, migrations, CRUD, authentification, audit, logging

---

### Sprint 1.1 : Initialisation du Backend

#### Tâche 1.1.1 : Configuration de l'Environnement Python
- [x] Créer un environnement virtuel (`python -m venv venv`)
- [x] Activer l'environnement virtuel
- [x] Créer un fichier `requirements.txt` avec toutes les dépendances :
  ```
  fastapi==0.104.1
  uvicorn[standard]==0.24.0
  sqlalchemy==2.0.23
  alembic==1.12.1
  pydantic==2.5.0
  pydantic-settings==2.1.0
  psycopg2-binary==2.9.9
  python-dotenv==1.0.0
  passlib[bcrypt]==1.7.4
  python-jose[cryptography]==3.3.0
  slowapi==0.1.9
  python-multipart==0.0.6
  pytest==7.4.3
  pytest-cov==4.1.0
  pytest-asyncio==0.21.1
  ```
- [x] Installer les dépendances (`pip install -r requirements.txt`)
- [x] Créer un fichier `.env` avec les variables d'environnement

**Critères d'acceptation :**
- ✅ Environnement virtuel créé et activé (scripts de configuration fournis)
- ✅ Toutes les dépendances installées sans erreur (requirements.txt créé)
- ✅ Fichier `.env` configuré (non commité, avec .gitignore et .env.example)

**Estimation** : 1h

---

#### Tâche 1.1.2 : Structure du Projet Backend
- [x] Créer la structure de dossiers :
  ```
  backend/
  ├── app/
  │   ├── __init__.py
  │   ├── main.py
  │   ├── config.py
  │   ├── database.py
  │   ├── models/
  │   ├── schemas/
  │   ├── routers/
  │   ├── services/
  │   └── utils/
  ├── alembic/
  ├── tests/
  ├── .env
  ├── requirements.txt
  └── README.md
  ```
- [x] Créer `app/main.py` avec une route de test
- [x] Créer `app/config.py` pour la gestion de la configuration
- [x] Créer `app/database.py` pour la connexion SQLAlchemy

**Critères d'acceptation :**
- ✅ Structure créée et organisée
- ✅ Route de test fonctionne (`/health` ou `/`)
- ✅ Connexion à la base de données testée

**Estimation** : 2h

---

### Sprint 1.2 : Modélisation et Migrations

#### Tâche 1.2.1 : Création des Modèles SQLAlchemy
- [x] Créer `app/models/__init__.py`
- [x] Créer `app/models/user.py` (Utilisateurs)
- [x] Créer `app/models/client.py` (Clients)
- [x] Créer `app/models/fournisseur.py` (Fournisseurs)
- [x] Créer `app/models/produit.py` (Produits)
- [x] Créer `app/models/transaction.py` (Transactions)
- [x] Créer `app/models/ligne_transaction.py` (Lignes_Transaction)
- [x] Créer `app/models/caisse.py` (Caisse)
- [x] Créer `app/models/caisse_solde_historique.py` (Caisse_Solde_Historique)
- [x] Créer `app/models/audit.py` (Transactions_Audit, Audit_Connexions)
- [x] Définir toutes les relations entre les modèles

**Critères d'acceptation :**
- ✅ Tous les modèles créés avec les bonnes colonnes
- ✅ Relations définies correctement (Foreign Keys)
- ✅ Colonnes de traçabilité présentes (date_creation, date_modification, id_utilisateur_*)
- ✅ Soft delete implémenté (est_actif)

**Estimation** : 4h

---

#### Tâche 1.2.2 : Initialisation Alembic
- [x] Initialiser Alembic dans le projet (`alembic init alembic`)
- [x] Configurer `alembic/env.py` pour utiliser les modèles SQLAlchemy
- [x] Configurer `alembic.ini` avec l'URL de la base de données
- [x] Créer la première migration (`alembic revision --autogenerate -m "Initial migration"`)
- [x] Appliquer la migration (`alembic upgrade head`)

**Critères d'acceptation :**
- ✅ Alembic initialisé et configuré
- ✅ Première migration créée avec toutes les tables (51e530ae737a)
- ✅ Migration appliquée sans erreur
- ✅ Tables créées dans PostgreSQL (vérification via `alembic current`)

**Estimation** : 2h

---

#### Tâche 1.2.3 : Migration - Contraintes Métier
- [x] Créer une migration pour ajouter `check_montant_positif` sur Transactions
- [x] Créer une migration pour ajouter `check_client_ou_fournisseur` sur Transactions
- [x] Créer une migration pour ajouter `check_quantite_positive` sur Lignes_Transaction
- [x] Tester les contraintes (essayer d'insérer des données invalides)

**Critères d'acceptation :**
- ✅ Contraintes créées dans la base de données
- ✅ Tentative d'insertion de montant négatif échoue
- ✅ Tentative d'insertion avec client ET fournisseur échoue

**Estimation** : 1h

---

#### Tâche 1.2.4 : Migration - Index de Performance
- [x] Créer une migration pour ajouter les index :
  - `idx_transactions_date` sur `Transactions(date_transaction)`
  - `idx_transactions_client` sur `Transactions(id_client)`
  - `idx_transactions_fournisseur` sur `Transactions(id_fournisseur)`
  - `idx_transactions_actif` sur `Transactions(est_actif)`
  - `idx_audit_transaction` sur `Transactions_Audit(id_transaction)`
  - `idx_audit_date` sur `Transactions_Audit(date_changement)`
- [x] Vérifier la création des index dans PostgreSQL

**Critères d'acceptation :**
- ✅ Tous les index créés
- ✅ Vérification via `\d+ table_name` dans psql
- ✅ Script de vérification créé : `backend/scripts/verify_indexes.py`

**Estimation** : 1h

---

#### Tâche 1.2.5 : Migration - Colonne type_mouvement
- [x] Créer une migration pour ajouter `type_mouvement VARCHAR(10)` à la table Caisse
- [x] Ajouter la contrainte CHECK pour limiter aux valeurs 'ENTREE' et 'SORTIE'

**Critères d'acceptation :**
- ✅ Colonne ajoutée avec contrainte
- ✅ Insertion avec valeur invalide échoue

**Estimation** : 1h

---

#### Tâche 1.2.6 : Migration - Vue Matérialisée Solde Caisse
- [x] Créer la vue matérialisée `Vue_Solde_Caisse` pour calculer le solde en temps réel
- [x] Implémenter la requête SQL :
  ```sql
  CREATE MATERIALIZED VIEW Vue_Solde_Caisse AS
  SELECT 
    COALESCE(SUM(CASE WHEN type_mouvement = 'ENTREE' THEN montant ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN type_mouvement = 'SORTIE' THEN montant ELSE 0 END), 0) as solde_actuel,
    MAX(date_mouvement) as derniere_maj
  FROM Caisse;
  ```
- [x] Créer un trigger pour rafraîchir automatiquement la vue après chaque insertion dans Caisse
- [x] Créer une migration Alembic pour cette vue
- [x] Créer un index sur la vue pour optimiser les requêtes

**Critères d'acceptation :**
- ✅ Solde calculé instantanément via la vue
- ✅ Vue se rafraîchit automatiquement après chaque mouvement
- ✅ Performance : requête du solde < 50ms

**Estimation** : 2h

---

### Sprint 1.3 : Schémas Pydantic

#### Tâche 1.3.1 : Schémas Utilisateurs
- [x] Créer `app/schemas/user.py`
- [x] Définir `UserBase`, `UserCreate`, `UserRead`, `UserUpdate`
- [x] Ajouter validation email et règles de mot de passe

**Critères d'acceptation :**
- ✅ Schémas créés avec validation
- ✅ Test de validation avec données valides/invalides

**Estimation** : 1h

---

#### Tâche 1.3.2 : Schémas Clients et Fournisseurs
- [x] Créer `app/schemas/client.py` (ClientBase, ClientCreate, ClientRead, ClientUpdate)
- [x] Créer `app/schemas/fournisseur.py` (FournisseurBase, FournisseurCreate, FournisseurRead, FournisseurUpdate)

**Critères d'acceptation :**
- ✅ Schémas créés avec validation
- ✅ Champs obligatoires validés

**Estimation** : 1h

---

#### Tâche 1.3.3 : Schémas Produits
- [x] Créer `app/schemas/produit.py` (ProduitBase, ProduitCreate, ProduitRead, ProduitUpdate)
- [x] Validation : nom_produit unique et non vide

**Critères d'acceptation :**
- ✅ Schémas créés
- ✅ Validation de l'unicité

**Estimation** : 1h

---

#### Tâche 1.3.4 : Schémas Transactions
- [x] Créer `app/schemas/transaction.py`
- [x] Définir `TransactionBase`, `TransactionCreate`, `TransactionRead`, `TransactionUpdate`
- [x] Créer `LigneTransactionBase`, `LigneTransactionCreate`, `LigneTransactionRead`
- [x] Validation : montant > 0, client OU fournisseur (pas les deux)

**Critères d'acceptation :**
- ✅ Schémas créés avec validation complexe
- ✅ Validation de l'exclusion mutuelle client/fournisseur

**Estimation** : 2h

---

#### Tâche 1.3.5 : Schémas Caisse
- [ ] Créer `app/schemas/caisse.py`
- [ ] Définir `MouvementCaisseBase`, `MouvementCaisseCreate`, `MouvementCaisseRead`
- [ ] Validation : type_mouvement dans ['ENTREE', 'SORTIE'], montant > 0

**Critères d'acceptation :**
- ✅ Schémas créés avec validation

**Estimation** : 1h

---

### Sprint 1.4 : Authentification et Sécurité

#### Tâche 1.4.1 : Système d'Authentification JWT
- [x] Créer `app/utils/security.py` avec fonctions :
  - `hash_password(password: str) -> str`
  - `verify_password(plain_password: str, hashed_password: str) -> bool`
  - `create_access_token(data: dict, expires_delta: timedelta) -> str`
  - `create_refresh_token(data: dict) -> str`
  - `decode_token(token: str) -> dict`
- [x] Configurer les secrets JWT dans `.env`

**Critères d'acceptation :**
- ✅ Hashage bcrypt fonctionnel
- ✅ Génération et décodage de tokens JWT fonctionnels
- ✅ Tokens avec expiration configurée (15 min pour access, 7 jours pour refresh)

**Estimation** : 3h

---

#### Tâche 1.4.2 : Endpoint de Connexion
- [x] Créer `app/routers/auth.py`
- [x] Implémenter `POST /login` :
  - Prend email et mot de passe
  - Vérifie les identifiants
  - Retourne access_token et refresh_token
  - Enregistre la tentative dans `Audit_Connexions` (succès/échec)
- [x] Gérer les erreurs (identifiants invalides)

**Critères d'acceptation :**
- ✅ Connexion réussie retourne les tokens
- ✅ Connexion échouée retourne 401
- ✅ Tentative enregistrée dans Audit_Connexions

**Estimation** : 2h

---

#### Tâche 1.4.3 : Endpoint de Refresh Token
- [x] Implémenter `POST /refresh` dans `app/routers/auth.py`
- [x] Valider le refresh token
- [x] Retourner un nouveau access token

**Critères d'acceptation :**
- ✅ Refresh token valide génère un nouveau access token
- ✅ Refresh token invalide retourne 401

**Estimation** : 1h

---

#### Tâche 1.4.4 : Dépendance d'Authentification
- [x] Créer `app/utils/dependencies.py`
- [x] Implémenter `get_current_user(token: str = Depends(oauth2_scheme)) -> User`
- [x] Implémenter `get_current_active_user(current_user: User = Depends(get_current_user)) -> User`
- [x] Implémenter `get_current_admin_user(current_user: User = Depends(get_current_user)) -> User`
- [x] Créer `tests/test_dependencies.py` avec 12 tests complets

**Critères d'acceptation :**
- ✅ Route protégée nécessite un token valide
- ✅ Token invalide retourne 401
- ✅ Vérification du rôle admin fonctionne
- ✅ Tests unitaires complets (12 tests, tous passent)

**Estimation** : 2h

---

#### Tâche 1.4.5 : Rate Limiting
- [x] Configurer `slowapi` dans `app/main.py`
- [x] Créer `app/utils/rate_limit.py` avec le limiter
- [x] Appliquer rate limiting sur `/login` (5 tentatives/minute par IP)
- [x] Tester avec plusieurs requêtes rapides
- [x] Ajouter fixture de réinitialisation du rate limiter dans `tests/conftest.py`

**Critères d'acceptation :**
- ✅ Après 5 tentatives, la 6ème retourne 429 (Too Many Requests)
- ✅ Le compteur se réinitialise après 1 minute
- ✅ Tests unitaires complets (4 tests dans `test_auth.py`)

**Estimation** : 1h

---

### Sprint 1.5 : Endpoints CRUD - Utilisateurs

#### Tâche 1.5.1 : Router Utilisateurs
- [x] Créer `app/routers/users.py`
- [x] Implémenter `GET /users` (liste, admin uniquement)
- [x] Implémenter `GET /users/{id}` (détail, admin uniquement)
- [x] Implémenter `POST /users` (création, admin uniquement)
- [x] Implémenter `PUT /users/{id}` (modification, admin uniquement)
- [x] Implémenter `DELETE /users/{id}` (soft delete, admin uniquement)

**Critères d'acceptation :**
- ✅ Toutes les opérations CRUD fonctionnent
- ✅ Accès restreint aux admins
- ✅ Soft delete (est_actif = False)

**Estimation** : 3h

---

### Sprint 1.6 : Endpoints CRUD - Clients

#### Tâche 1.6.1 : Router Clients
- [x] Créer `app/routers/clients.py`
- [x] Implémenter `GET /clients` (liste avec filtres : est_actif, recherche)
- [x] Implémenter `GET /clients/{id}` (détail)
- [x] Implémenter `POST /clients` (création)
- [x] Implémenter `PUT /clients/{id}` (modification)
- [x] Implémenter `DELETE /clients/{id}` (soft delete)
- [x] Enregistrer id_utilisateur_creation et id_utilisateur_modification

**Critères d'acceptation :**
- ✅ CRUD complet fonctionnel
- ✅ Traçabilité des utilisateurs
- ✅ Filtres et recherche opérationnels

**Estimation** : 3h
**Statut** : ✅ Terminé

---

### Sprint 1.7 : Endpoints CRUD - Fournisseurs

#### Tâche 1.7.1 : Router Fournisseurs
- [x] Créer `app/routers/fournisseurs.py`
- [x] Implémenter les mêmes endpoints que pour Clients
- [x] Réutiliser la logique similaire
- [x] Créer `tests/test_fournisseurs.py` avec tests complets
- [x] Adapter les tests pour fonctionner sans authentification (ENABLE_AUTH=False)
- [x] Tous les tests passent (20/20)

**Critères d'acceptation :**
- ✅ CRUD complet identique aux Clients
- ✅ Traçabilité fonctionnelle
- ✅ Tests complets et fonctionnels
- ✅ Compatible avec authentification désactivée

**Estimation** : 2h
**Statut** : ✅ Terminé

---

### Sprint 1.8 : Endpoints CRUD - Produits

#### Tâche 1.8.1 : Router Produits
- [x] Créer `app/routers/produits.py`
- [x] Implémenter CRUD complet
- [x] Validation de l'unicité du nom_produit

**Critères d'acceptation :**
- ✅ CRUD complet
- ✅ Tentative de création avec nom existant échoue

**Estimation** : 2h
**Statut** : ✅ Terminé

---

### Sprint 1.9 : Endpoints CRUD - Transactions

#### Tâche 1.9.1 : Router Transactions
- [x] Créer `app/routers/transactions.py`
- [x] Implémenter `GET /transactions` (liste avec filtres : date, client, fournisseur, montant)
- [x] Implémenter `GET /transactions/{id}` (détail avec lignes)
- [x] Implémenter `POST /transactions` (création avec lignes)
- [x] Implémenter `PUT /transactions/{id}` (modification)
- [x] Implémenter `DELETE /transactions/{id}` (soft delete)
- [x] Calculer automatiquement `montant_total` à partir des lignes

**Critères d'acceptation :**
- ✅ CRUD complet
- ✅ Création d'une transaction avec plusieurs lignes
- ✅ Montant total calculé automatiquement
- ✅ Filtres multiples fonctionnels

**Estimation** : 5h

---

#### Tâche 1.9.2 : Endpoint Audit des Transactions
- [x] Implémenter `GET /transactions/{id}/audit` (historique des modifications)
- [x] Retourner la liste des changements depuis `Transactions_Audit`

**Critères d'acceptation :**
- ✅ Historique complet des modifications affiché
- ✅ Informations : qui, quand, quel champ, ancienne/nouvelle valeur

**Estimation** : 2h
**Statut** : ✅ Terminé

**Implémentation :**
- ✅ Endpoint `GET /transactions/{id}/audit` créé dans `app/routers/transactions.py` (ligne 103)
- ✅ Retourne la liste complète des modifications avec informations utilisateur (nom, email)
- ✅ Utilisé dans le frontend (`TransactionDetail.jsx`) pour afficher l'historique d'audit

---

### Sprint 1.10 : Endpoints Caisse

#### Tâche 1.10.1 : Router Caisse
- [x] Créer `app/routers/caisse.py`
- [x] Implémenter `GET /caisse/mouvements` (liste des mouvements)
- [x] Implémenter `GET /caisse/solde` (solde actuel calculé)
- [x] Implémenter `GET /caisse/historique` (historique du solde)
- [x] Créer automatiquement un mouvement lors de la création d'une transaction

**Critères d'acceptation :**
- ✅ Solde calculé correctement (entrées - sorties)
- ✅ Historique disponible
- ✅ Mouvement créé automatiquement avec transaction

**Estimation** : 3h

---

#### Tâche 1.10.2 : Middleware de Logging Structuré
- [x] Créer `app/middleware/logging_middleware.py`
- [x] Implémenter un middleware FastAPI pour logger toutes les requêtes
- [x] Configurer Python `logging` avec format JSON structuré :
  ```python
  {
    "timestamp": "2024-01-01T12:00:00Z",
    "user_id": 123,
    "endpoint": "/api/transactions",
    "method": "POST",
    "status_code": 201,
    "duration_ms": 45,
    "ip_address": "192.168.1.1"
  }
  ```
- [x] Configurer la rotation des logs (max 100MB par fichier, garder 30 jours)
- [x] Créer différents niveaux de logs (INFO pour requêtes, ERROR pour erreurs)
- [x] Logger les erreurs avec stack trace complet

**Critères d'acceptation :**
- ✅ Toutes les requêtes API loggées automatiquement
- ✅ Format JSON parsable pour analyse
- ✅ Rotation automatique des fichiers de log
- ✅ Pas d'impact performance (< 5ms par requête)

**Estimation** : 2h

**Fichiers créés :**
- ✅ `app/middleware/logging_middleware.py` - Middleware FastAPI pour logging structuré
- ✅ `app/logging/logging_config.py` - Configuration du logging avec format JSON et rotation
- ✅ `app/logging/__init__.py` - Module d'initialisation
- ✅ `app/middleware/__init__.py` - Module d'initialisation

---

### Sprint 1.11 : Trigger d'Audit PostgreSQL

#### Tâche 1.11.1 : Fonction et Trigger d'Audit
- [x] Créer une fonction PostgreSQL `audit_transaction_changes()`
- [x] Créer un trigger `trigger_audit_transactions` sur la table Transactions
- [x] Le trigger doit enregistrer :
  - id_transaction
  - id_utilisateur (depuis la session ou un paramètre)
  - date_changement
  - champ_modifie
  - ancienne_valeur
  - nouvelle_valeur
- [x] Créer une migration Alembic pour appliquer le trigger

**Critères d'acceptation :**
- ✅ Toute modification de transaction enregistrée automatiquement
- ✅ Test : modifier une transaction et vérifier l'entrée dans Transactions_Audit

**Estimation** : 3h

**Note** : Pour récupérer l'id_utilisateur dans le trigger, il faudra peut-être utiliser une variable de session PostgreSQL ou passer l'ID via l'application.

---

### Sprint 1.12 : Configuration CORS et Finalisation Backend

#### Tâche 1.12.1 : Configuration CORS
- [x] Configurer CORS dans `app/main.py`
- [x] Autoriser les origines du frontend (localhost:3000, localhost:5173, etc.)
- [x] Autoriser les credentials (cookies, headers)

**Critères d'acceptation :**
- ✅ Requêtes depuis le frontend acceptées
- ✅ Pas d'erreurs CORS dans la console

**Estimation** : 1h

---

#### Tâche 1.12.2 : Documentation API Automatique
- [ ] Vérifier que Swagger UI est accessible (`/docs`)
- [ ] Vérifier que ReDoc est accessible (`/redoc`)
- [ ] Ajouter des descriptions aux endpoints
- [ ] Ajouter des exemples dans les schémas

**Critères d'acceptation :**
- ✅ Documentation interactive accessible
- ✅ Tous les endpoints documentés

**Estimation** : 1h

---

## 🎨 Phase 2 : Développement du Frontend (React)

**Objectif** : Créer une interface utilisateur moderne, intuitive et fonctionnelle.

**Durée estimée** : 4-5 semaines *(augmentée avec nouveaux sprints)*  
**Priorité** : 🔴 Critique

**Sprints** : 2.1 à 2.11 (30+ tâches)  
**Points clés** : Composants, pages CRUD, dashboard, exports, gestion erreurs

---

### Sprint 2.1 : Initialisation du Frontend

#### Tâche 2.1.1 : Création du Projet React
- [x] Créer le projet avec Vite (`npm create vite@latest frontend -- --template react`)
- [x] Installer les dépendances de base :
  ```json
  {
    "axios": "^1.6.0",
    "react-router-dom": "^6.20.0",
    "@mui/material": "^5.14.0",
    "@mui/icons-material": "^5.14.0",
    "@emotion/react": "^11.11.0",
    "@emotion/styled": "^11.11.0",
    "recharts": "^2.10.0",
    "react-hook-form": "^7.48.0",
    "yup": "^1.3.0",
    "@hookform/resolvers": "^3.3.0",
    "xlsx": "^0.18.5",
    "jspdf": "^2.5.1",
    "date-fns": "^2.30.0",
    "zustand": "^4.4.0"
  }
  ```
- [x] Configurer la structure de dossiers :
  ```
  frontend/
  ├── src/
  │   ├── components/
  │   ├── pages/
  │   ├── services/
  │   ├── store/
  │   ├── utils/
  │   ├── hooks/
  │   └── App.jsx
  ├── .env
  └── package.json
  ```

**Critères d'acceptation :**
- ✅ Projet créé et fonctionne (`npm run dev`)
- ✅ Toutes les dépendances installées
- ✅ Structure de dossiers créée

**Estimation** : 1h

---

#### Tâche 2.1.2 : Configuration de l'API Service
- [x] Créer `src/services/api.js`
- [x] Configurer axios avec l'URL de base de l'API
- [x] Créer un intercepteur pour ajouter le token JWT automatiquement
- [x] Créer un intercepteur pour gérer les erreurs (401 → redirection login)
- [x] Créer des fonctions helper pour les requêtes (get, post, put, delete)

**Critères d'acceptation :**
- ✅ Token ajouté automatiquement aux requêtes
- ✅ Redirection vers login si token invalide
- ✅ Gestion des erreurs centralisée

**Estimation** : 2h

---

#### Tâche 2.1.3 : Configuration du Store (Zustand)
- [x] Créer `src/store/authStore.js` pour gérer :
  - Utilisateur connecté
  - Tokens (access + refresh)
  - Fonctions : login, logout, refreshToken
- [x] Persister le store dans localStorage

**Critères d'acceptation :**
- ✅ État d'authentification géré
- ✅ Persistance après rechargement de page

**Estimation** : 2h

---

#### Tâche 2.1.4 : Configuration des Routes
- [x] Installer et configurer `react-router-dom`
- [x] Créer un composant `ProtectedRoute` pour protéger les routes
- [x] Définir les routes :
  - `/login` (publique)
  - `/dashboard` (protégée)
  - `/transactions` (protégée)
  - `/clients` (protégée)
  - `/fournisseurs` (protégée)
  - `/produits` (protégée)
  - `/caisse` (protégée)
  - `/audit` (protégée, admin)

**Critères d'acceptation :**
- ✅ Routes configurées
- ✅ Redirection vers login si non authentifié
- ✅ Navigation fonctionnelle

**Estimation** : 2h

---

### Sprint 2.2 : Composants Réutilisables

#### Tâche 2.2.1 : Layout Principal
- [x] Créer `src/components/Layout/AppLayout.jsx` avec :
  - Sidebar de navigation
  - Header avec infos utilisateur
  - Zone de contenu principal
- [x] Utiliser Material-UI pour le design
- [x] Responsive (mobile-friendly)

**Critères d'acceptation :**
- ✅ Layout fonctionnel et responsive
- ✅ Navigation entre pages

**Estimation** : 3h

---

#### Tâche 2.2.2 : Composant DataGrid
- [x] Créer `src/components/DataGrid/DataGrid.jsx`
- [x] Fonctionnalités :
  - Affichage de données tabulaires
  - Pagination
  - Tri par colonnes
  - Filtres
  - Actions (éditer, supprimer)
- [x] Utiliser MUI DataGrid ou créer un composant custom

**Critères d'acceptation :**
- ✅ Tableau réutilisable
- ✅ Pagination, tri, filtres fonctionnels

**Estimation** : 4h

---

#### Tâche 2.2.3 : Composant ModalForm
- [x] Créer `src/components/ModalForm/ModalForm.jsx`
- [x] Support pour création et édition
- [x] Validation avec react-hook-form + yup
- [x] Gestion des erreurs

**Critères d'acceptation :**
- ✅ Modal réutilisable
- ✅ Validation en temps réel
- ✅ Soumission avec gestion d'erreurs

**Estimation** : 3h

---

#### Tâche 2.2.4 : Composant StatCard
- [x] Créer `src/components/StatCard/StatCard.jsx`
- [x] Afficher une statistique avec :
  - Titre
  - Valeur
  - Icône
  - Variation (optionnel)
- [x] Design moderne avec MUI

**Critères d'acceptation :**
- ✅ Carte de statistique réutilisable
- ✅ Design cohérent

**Estimation** : 1h

---

### Sprint 2.3 : Page de Connexion

#### Tâche 2.3.1 : Page Login
- [x] Créer `src/pages/Login/Login.jsx` (implémenté dans `src/pages/Login.jsx` - structure cohérente avec les autres pages)
- [x] Formulaire avec email et mot de passe
- [x] Validation avec react-hook-form
- [x] Appel API pour connexion
- [x] Gestion des erreurs (affichage message)
- [x] Redirection vers dashboard après connexion réussie

**Critères d'acceptation :**
- ✅ Connexion fonctionnelle
- ✅ Messages d'erreur affichés
- ✅ Redirection après succès

**Estimation** : 3h

---

### Sprint 2.4 : Dashboard

#### Tâche 2.4.1 : Page Dashboard
- [x] Créer `src/pages/Dashboard/Dashboard.jsx`
- [x] Afficher des statistiques clés :
  - Solde de la caisse
  - Nombre de transactions du mois
  - Total des ventes (clients)
  - Total des achats (fournisseurs)
- [x] Utiliser le composant StatCard
- [x] Graphique simple (évolution des transactions sur 30 jours)

**Critères d'acceptation :**
- ✅ Dashboard avec statistiques
- ✅ Graphique fonctionnel (recharts)
- ✅ Données réelles depuis l'API

**Estimation** : 4h

---

### Sprint 2.5 : Gestion des Clients

#### Tâche 2.5.1 : Page Liste Clients
- [x] Créer `src/pages/Clients/ClientsList.jsx`
- [x] Afficher la liste avec DataGrid
- [x] Filtres : recherche par nom, est_actif
- [x] Actions : créer, éditer, supprimer (soft delete)
- [x] Pagination

**Critères d'acceptation :**
- ✅ Liste fonctionnelle
- ✅ CRUD complet
- ✅ Filtres opérationnels

**Estimation** : 3h

---

#### Tâche 2.5.2 : Formulaire Client
- [x] Créer `src/pages/Clients/ClientForm.jsx`
- [x] Formulaire avec validation :
  - nom_client (requis)
  - est_actif (checkbox)
- [x] Utiliser ModalForm
- [x] Gestion création/édition

**Critères d'acceptation :**
- ✅ Formulaire fonctionnel
- ✅ Validation en temps réel
- ✅ Création et édition opérationnelles

**Estimation** : 2h

---

### Sprint 2.6 : Gestion des Fournisseurs

#### Tâche 2.6.1 : Pages Fournisseurs
- [x] Créer `src/pages/Fournisseurs/FournisseursList.jsx`
- [x] Créer `src/pages/Fournisseurs/FournisseurForm.jsx`
- [x] Réutiliser la logique similaire aux Clients

**Critères d'acceptation :**
- ✅ CRUD complet identique aux Clients

**Estimation** : 3h

---

### Sprint 2.7 : Gestion des Produits

#### Tâche 2.7.1 : Pages Produits
- [x] Créer `src/pages/Produits/ProduitsList.jsx`
- [x] Créer `src/pages/Produits/ProduitForm.jsx`
- [x] Formulaire : nom_produit (unique, requis)
- [x] Validation de l'unicité

**Critères d'acceptation :**
- ✅ CRUD complet
- ✅ Validation unicité fonctionnelle

**Estimation** : 2h

---

### Sprint 2.8 : Gestion des Transactions

#### Tâche 2.8.1 : Page Liste Transactions
- [x] Créer `src/pages/Transactions/TransactionsList.jsx`
- [x] Afficher la liste avec :
  - Date
  - Client ou Fournisseur
  - Montant total
  - Statut (est_actif)
- [x] Filtres avancés :
  - Par date (range)
  - Par client
  - Par fournisseur
  - Par montant (min/max)
- [x] Actions : créer, voir détails, éditer, supprimer

**Critères d'acceptation :**
- ✅ Liste avec tous les filtres
- ✅ Affichage correct client/fournisseur

**Estimation** : 4h

---

#### Tâche 2.8.2 : Formulaire Transaction
- [x] Créer `src/pages/Transactions/TransactionForm.jsx`
- [x] Formulaire complexe avec :
  - Date transaction
  - Sélection Client OU Fournisseur (radio buttons)
  - Liste de lignes (produit + quantité)
  - Calcul automatique du montant total
  - Bouton "Ajouter ligne"
- [x] Validation :
  - Au moins une ligne
  - Client OU Fournisseur (pas les deux)
  - Quantités > 0

**Critères d'acceptation :**
- ✅ Formulaire complexe fonctionnel
- ✅ Ajout/suppression de lignes dynamique
- ✅ Calcul automatique du montant

**Estimation** : 5h

---

#### Tâche 2.8.3 : Page Détail Transaction
- [x] Créer `src/pages/Transactions/TransactionDetail.jsx`
- [x] Afficher :
  - Informations transaction
  - Liste des lignes (produit, quantité)
  - Historique d'audit (qui a modifié quoi et quand)
- [x] Bouton pour voir l'audit complet

**Critères d'acceptation :**
- ✅ Détails complets affichés
- ✅ Historique d'audit visible

**Implémentation :**
- ✅ Composant TransactionDetail créé avec toutes les fonctionnalités
- ✅ Route `/transactions/:id` ajoutée dans App.jsx
- ✅ Navigation depuis TransactionsList vers la page de détails
- ✅ Affichage des informations transaction (date, montant, client/fournisseur, statut)
- ✅ Affichage des lignes de transaction avec noms de produits
- ✅ Historique d'audit affiché (5 derniers en résumé, complet dans modal)
- ✅ Modal pour voir l'audit complet avec chargement à la demande

**Estimation** : 3h

---

### Sprint 2.9 : Gestion de la Caisse

#### Tâche 2.9.1 : Page Caisse
- [x] Créer `src/pages/Caisse/Caisse.jsx`
- [x] Afficher :
  - Solde actuel (en évidence)
  - Liste des mouvements récents
  - Graphique d'évolution du solde (30 derniers jours)
- [x] Filtres par date

**Critères d'acceptation :**
- ✅ Solde affiché correctement
- ✅ Liste des mouvements
- ✅ Graphique fonctionnel

**Estimation** : 3h

---

### Sprint 2.10 : Fonctionnalités Avancées

#### Tâche 2.10.1 : Export Excel
- [x] Ajouter bouton "Exporter" sur les pages de liste
- [x] Utiliser `xlsx` pour générer le fichier
- [x] Exporter les données filtrées

**Critères d'acceptation :**
- ✅ Export Excel fonctionnel
- ✅ Données correctement formatées

**Estimation** : 2h

---

#### Tâche 2.10.2 : Export PDF
- [x] Ajouter fonctionnalité d'export PDF
- [x] Utiliser `jsPDF`
- [x] Générer des rapports (transactions, caisse)

**Critères d'acceptation :**
- ✅ Export PDF fonctionnel
- ✅ Formatage correct

**Estimation** : 3h

---

#### Tâche 2.10.3 : Recherche Full-Text
- [ ] Implémenter recherche avancée
- [ ] Recherche dans plusieurs champs simultanément
- [ ] Debounce pour optimiser les requêtes

**Critères d'acceptation :**
- ✅ Recherche performante
- ✅ Résultats pertinents

**Estimation** : 2h

---

#### Tâche 2.10.4 : Notifications
- [x] Créer un système de notifications (toast)
- [x] Afficher notifications pour :
  - Succès (création, modification)
  - Erreurs
  - Avertissements
- [x] Utiliser MUI Snackbar ou react-toastify

**Critères d'acceptation :**
- ✅ Notifications visibles et claires
- ✅ Auto-dismiss après quelques secondes

**Estimation** : 2h

---

### Sprint 2.11 : Gestion des Erreurs Frontend

#### Tâche 2.11.1 : Error Boundary React
- [x] Créer `src/components/ErrorBoundary/ErrorBoundary.jsx`
- [x] Implémenter le composant Error Boundary :
  - Capturer les erreurs React non gérées
  - Afficher une page d'erreur user-friendly
  - Logger l'erreur (console + optionnellement API backend)
- [x] Créer une page d'erreur avec :
  - Message clair pour l'utilisateur
  - Bouton "Recharger la page"
  - Bouton "Retour à l'accueil"
  - (Optionnel) Bouton "Signaler le problème"
- [x] Envelopper l'application avec l'Error Boundary dans `App.jsx`
- [x] Tester avec une erreur volontaire

**Critères d'acceptation :**
- ✅ Application ne crash pas complètement en cas d'erreur
- ✅ Page d'erreur conviviale affichée
- ✅ Erreurs loggées pour debugging
- ✅ Utilisateur peut récupérer (reload ou retour accueil)

**Estimation** : 2h

**Fichiers à créer :**
- `src/components/ErrorBoundary/ErrorBoundary.jsx`
- `src/pages/ErrorPage/ErrorPage.jsx`

---

#### Tâche 2.11.2 : Gestion Globale des Erreurs API
- [x] Créer un hook personnalisé `useApiError` pour gérer les erreurs API
- [x] Implémenter la gestion centralisée des erreurs dans l'intercepteur axios
- [x] Mapper les codes d'erreur HTTP vers des messages utilisateur :
  - 400 → "Données invalides"
  - 401 → Redirection login
  - 403 → "Accès refusé"
  - 404 → "Ressource non trouvée"
  - 500 → "Erreur serveur"
- [x] Afficher les erreurs via des notifications (toast)
- [x] Logger les erreurs dans la console (en dev)

**Critères d'acceptation :**
- ✅ Toutes les erreurs API gérées centralement
- ✅ Messages d'erreur clairs pour l'utilisateur
- ✅ Pas d'erreurs non gérées dans la console

**Estimation** : 2h

---

## 📱 Phase 2.4 : Adaptation Responsive Mobile

**Objectif** : Rendre l'application entièrement utilisable et optimisée pour les appareils mobiles (smartphones et tablettes).

**Durée estimée** : 2-3 jours  
**Priorité** : 🔴 Critique (MVP)  
**Statut** : 🟡 En cours (~60%)

**Sprints** : 2.14 (12 tâches)  
**Points clés** : Composants responsive, breakpoints MUI, navigation mobile, formulaires adaptés

---

### 🎯 Epics et User Stories

#### Epic 1 : Navigation Mobile Optimisée
**En tant qu'** utilisateur mobile  
**Je veux** pouvoir naviguer facilement dans l'application  
**Afin de** accéder rapidement aux fonctionnalités dont j'ai besoin

**User Stories :**
- US-M1.1 : En tant qu'utilisateur mobile, je veux un menu burger accessible pour voir toutes les pages
- US-M1.2 : En tant qu'utilisateur mobile, je veux pouvoir rétracter le menu latéral pour gagner de l'espace
- US-M1.3 : En tant qu'utilisateur mobile, je veux que le menu se ferme automatiquement après navigation

---

#### Epic 2 : Tableaux et Listes Adaptés
**En tant qu'** utilisateur mobile  
**Je veux** consulter les listes de données (transactions, clients, etc.)  
**Afin de** retrouver rapidement les informations importantes

**User Stories :**
- US-M2.1 : En tant qu'utilisateur mobile, je veux voir les colonnes les plus importantes dans les tableaux
- US-M2.2 : En tant qu'utilisateur mobile, je veux pouvoir scroller horizontalement si nécessaire
- US-M2.3 : En tant qu'utilisateur mobile, je veux des boutons d'action compacts et accessibles
- US-M2.4 : En tant qu'utilisateur mobile, je veux une pagination simplifiée et lisible

---

#### Epic 3 : Formulaires Mobiles Conviviaux
**En tant qu'** utilisateur mobile  
**Je veux** créer et modifier des données facilement  
**Afin de** travailler efficacement même en déplacement

**User Stories :**
- US-M3.1 : En tant qu'utilisateur mobile, je veux des formulaires en plein écran pour mieux voir les champs
- US-M3.2 : En tant qu'utilisateur mobile, je veux des boutons de soumission accessibles au doigt
- US-M3.3 : En tant qu'utilisateur mobile, je veux que le clavier virtuel ne cache pas les champs

---

#### Epic 4 : Dashboard et Visualisations Adaptés
**En tant qu'** utilisateur mobile  
**Je veux** consulter les statistiques et graphiques  
**Afin de** suivre l'activité de mon entreprise

**User Stories :**
- US-M4.1 : En tant qu'utilisateur mobile, je veux voir les cartes statistiques empilées verticalement
- US-M4.2 : En tant qu'utilisateur mobile, je veux des graphiques lisibles et interactifs
- US-M4.3 : En tant qu'utilisateur mobile, je veux des textes et icônes de taille appropriée

---

#### Epic 5 : Filtres et Recherche Mobile
**En tant qu'** utilisateur mobile  
**Je veux** filtrer et rechercher des données  
**Afin de** trouver rapidement ce que je cherche

**User Stories :**
- US-M5.1 : En tant qu'utilisateur mobile, je veux des filtres empilés verticalement
- US-M5.2 : En tant qu'utilisateur mobile, je veux des champs de filtre pleine largeur
- US-M5.3 : En tant qu'utilisateur mobile, je veux accéder aux filtres avancés facilement

---

### Sprint 2.14 : Implémentation Responsive Mobile

#### Tâche 2.14.1 : Création du Composant MobileCardList
- [x] Créer `MobileCardList.jsx` - Composant réutilisable pour affichage en cartes
- [x] Implémenter la pagination complète (boutons + sélecteur)
- [x] Ajouter scroll automatique vers le haut lors du changement de page
- [x] Intégrer les actions (Voir, Éditer, Supprimer, Réactiver)
- [x] Gérer les états (loading, empty, data)
- [x] Design cohérent avec Material-UI
- [x] Support de la fonction `renderCard` personnalisable

**User Stories couvertes** : US-M2.1, US-M2.2, US-M2.3, US-M2.4

**Critères d'acceptation :**
- ✅ Composant réutilisable créé
- ✅ Pagination fonctionnelle (5, 10, 25, 50 items/page)
- ✅ Pas de scroll horizontal
- ✅ Toutes les informations visibles verticalement
- ✅ Boutons d'action accessibles (min 44x44px)
- ✅ Performance optimale

**Estimation** : 3h  
**Statut** : ✅ Terminé

**Fichiers créés :**
- `frontend/src/components/MobileCardList/MobileCardList.jsx`
- `frontend/src/components/MobileCardList/index.js`

**Amélioration majeure** : Remplacement des tableaux par des cartes sur mobile pour éliminer complètement le scroll horizontal.

---

#### Tâche 2.14.2 : Adaptation du Composant ModalForm
- [x] Ajouter `useMediaQuery` pour détection mobile
- [x] Passer les modals en plein écran sur mobile (`fullScreen={isMobile}`)
- [x] Empiler les boutons verticalement sur mobile
- [x] Rendre les boutons pleine largeur sur mobile
- [x] Adapter les paddings selon la taille d'écran

**User Stories couvertes** : US-M3.1, US-M3.2, US-M3.3

**Critères d'acceptation :**
- ✅ Formulaires en plein écran sur mobile (< 600px)
- ✅ Boutons empilés verticalement et pleine largeur
- ✅ Champs de formulaire accessibles avec clavier virtuel
- ✅ Padding adapté pour confort tactile

**Estimation** : 2h  
**Statut** : ✅ Terminé

**Fichiers modifiés :**
- `frontend/src/components/ModalForm/ModalForm.jsx`

---

#### Tâche 2.14.3 : Adaptation du Dashboard
- [x] Rendre le titre responsive (font-size adaptatif)
- [x] Adapter le Grid des cartes statistiques (xs=12 pour empilage)
- [x] Réduire la hauteur du graphique sur mobile (300px)
- [x] Adapter les marges et paddings
- [x] Réduire la taille des polices dans le graphique
- [x] Optimiser les marges du graphique pour mobile

**User Stories couvertes** : US-M4.1, US-M4.2, US-M4.3

**Critères d'acceptation :**
- ✅ Cartes empilées verticalement sur mobile
- ✅ Graphique lisible et interactif
- ✅ Pas de débordement horizontal
- ✅ Textes et légendes lisibles

**Estimation** : 2h  
**Statut** : ✅ Terminé

**Fichiers modifiés :**
- `frontend/src/pages/Dashboard.jsx`

---

#### Tâche 2.14.4 : Adaptation du SmartFilterPanel
- [x] Empiler les filtres verticalement sur mobile
- [x] Masquer l'icône de filtre sur mobile (gain d'espace)
- [x] Rendre les boutons pleine largeur
- [x] Adapter les champs de filtre (fullWidth sur mobile)
- [x] Simplifier la grille des filtres avancés (1 colonne)
- [x] Réduire les paddings et gaps

**User Stories couvertes** : US-M5.1, US-M5.2, US-M5.3

**Critères d'acceptation :**
- ✅ Filtres empilés et pleine largeur
- ✅ Pas de scroll horizontal
- ✅ Boutons accessibles
- ✅ Interface épurée

**Estimation** : 2h  
**Statut** : ✅ Terminé

**Fichiers modifiés :**
- `frontend/src/components/Filters/SmartFilterPanel.jsx`

---

#### Tâche 2.14.5 : Intégration Vue Cartes - TransactionsList
- [x] Importer `MobileCardList` et `useMediaQuery`
- [x] Ajouter affichage conditionnel (cartes sur mobile, tableau sur desktop)
- [x] Créer la fonction `renderCard` personnalisée pour transactions
- [x] Afficher : ID, Date, Client/Fournisseur, Produit, Quantité, Montant
- [x] Colorier le montant (vert=client, rouge=fournisseur)
- [x] Adapter l'en-tête (boutons empilés sur mobile)
- [x] Masquer la légende sur mobile (< md)

**User Stories couvertes** : US-M2.1, US-M2.2, US-M2.3

**Critères d'acceptation :**
- ✅ Vue en cartes sur mobile (< 600px)
- ✅ Vue en tableau sur desktop (≥ 600px)
- ✅ Pas de scroll horizontal
- ✅ Toutes les informations visibles
- ✅ Actions accessibles
- ✅ Pagination fonctionnelle

**Estimation** : 2h  
**Statut** : ✅ Terminé

**Fichiers modifiés :**
- `frontend/src/pages/Transactions/TransactionsList.jsx`

---

#### Tâche 2.14.6 : Intégration Vue Cartes - Clients/Fournisseurs/Produits
- [x] **ClientsList** : Intégrer MobileCardList avec cartes personnalisées
  - Afficher : ID, Nom (cliquable), Statut, Date création
  - Actions : Voir profil, Éditer, Supprimer
- [x] **FournisseursList** : Intégrer MobileCardList
  - Afficher : ID, Nom (cliquable), Statut, Date création
  - Actions : Voir profil, Éditer, Supprimer
- [x] **ProduitsList** : Intégrer MobileCardList
  - Afficher : ID, Nom, Statut, Chips d'utilisation
  - Actions : Éditer, Supprimer
- [x] Vérifier la cohérence visuelle entre toutes les pages

**User Stories couvertes** : US-M2.1, US-M2.2, US-M2.3

**Critères d'acceptation :**
- ✅ Vue en cartes sur mobile pour les 3 pages
- ✅ Pas de scroll horizontal
- ✅ Toutes les informations visibles
- ✅ Navigation fluide
- ✅ Pagination fonctionnelle

**Estimation** : 2.5h  
**Statut** : ✅ Terminé

**Fichiers modifiés :**
- `frontend/src/pages/Clients/ClientsList.jsx`
- `frontend/src/pages/Fournisseurs/FournisseursList.jsx`
- `frontend/src/pages/Produits/ProduitsList.jsx`

---

#### Tâche 2.14.7 : Adaptation de la Page Login
- [x] Adapter le padding du container
- [x] Rendre le titre responsive (font-size)
- [x] Optimiser l'espacement pour mobile

**User Stories couvertes** : US-M3.1

**Critères d'acceptation :**
- ✅ Formulaire de login confortable sur mobile
- ✅ Champs accessibles
- ✅ Design cohérent

**Estimation** : 0.5h  
**Statut** : ✅ Terminé

**Fichiers modifiés :**
- `frontend/src/pages/Login.jsx`

---

#### Tâche 2.14.8 : Adaptation du StatCard (Optionnel)
- [ ] Réduire le padding sur mobile
- [ ] Adapter la taille de l'icône
- [ ] Optimiser la taille de police

**User Stories couvertes** : US-M4.3

**Critères d'acceptation :**
- ✅ Cartes compactes mais lisibles
- ✅ Icônes proportionnées
- ✅ Valeurs bien visibles

**Estimation** : 1h  
**Statut** : ⚪ À faire

**Fichiers à modifier :**
- `frontend/src/components/StatCard/StatCard.jsx`

---

#### Tâche 2.14.9 : Adaptation des Pages de Détail
- [x] Adapter `TransactionDetail.jsx` pour mobile
- [x] Adapter `ClientProfile.jsx` pour mobile
- [x] Adapter `FournisseurProfile.jsx` pour mobile
- [x] Empiler les sections verticalement
- [x] Adapter les graphiques et tableaux

**User Stories couvertes** : US-M2.1, US-M4.2

**Critères d'acceptation :**
- ✅ Pages de détail lisibles sur mobile
- ✅ Sections empilées logiquement
- ✅ Graphiques interactifs
- ✅ Tableaux scrollables

**Estimation** : 3h  
**Statut** : ✅ Terminé

**Fichiers modifiés :**
- `frontend/src/pages/Transactions/TransactionDetail.jsx`
- `frontend/src/pages/Clients/ClientProfile.jsx`
- `frontend/src/pages/Fournisseurs/FournisseurProfile.jsx`

---

#### Tâche 2.14.10 : Intégration Vue Cartes - Page Caisse
- [x] Adapter l'affichage du solde (taille responsive)
- [x] Empiler les sections sur mobile
- [x] Adapter le graphique d'évolution (300px sur mobile)
- [x] Intégrer MobileCardList pour les mouvements
- [x] Créer cartes personnalisées : Date, Type (Chip), Montant (coloré), Transaction ID
- [x] Affichage conditionnel (cartes mobile, tableau desktop)

**User Stories couvertes** : US-M4.1, US-M4.2

**Critères d'acceptation :**
- ✅ Solde bien visible
- ✅ Graphique lisible
- ✅ Liste des mouvements en cartes sur mobile
- ✅ Pas de scroll horizontal
- ✅ Pagination fonctionnelle

**Estimation** : 2.5h  
**Statut** : ✅ Terminé

**Fichiers modifiés :**
- `frontend/src/pages/Caisse/Caisse.jsx`

---

#### Tâche 2.14.11 : Adaptation de la Page Audit (Admin)
- [x] Vérification de la page (placeholder simple, pas besoin d'adaptation pour le moment)

**User Stories couvertes** : US-M2.1, US-M5.1

**Critères d'acceptation :**
- ✅ Page placeholder responsive par défaut

**Estimation** : 1.5h  
**Statut** : ✅ Terminé (page placeholder)

**Note :**
- La page Audit est actuellement un placeholder simple
- Sera adaptée lors de l'implémentation complète de la fonctionnalité d'audit

---

#### Tâche 2.14.12 : Tests et Validation Mobile
- [ ] Tester sur différentes tailles d'écran :
  - iPhone SE (375x667) - Mobile portrait
  - iPhone 12 Pro (390x844) - Mobile moderne
  - iPad (768x1024) - Tablette
  - iPad Pro (1024x1366) - Grande tablette
- [ ] Vérifier tous les parcours utilisateur
- [ ] Valider les interactions tactiles (taille des boutons)
- [ ] Tester la performance (pas de lag)
- [ ] Vérifier l'absence de scroll horizontal non désiré
- [ ] Documenter les problèmes trouvés
- [ ] Corriger les bugs identifiés

**User Stories couvertes** : Toutes

**Critères d'acceptation :**
- ✅ Toutes les pages testées sur 4 tailles d'écran
- ✅ Aucun scroll horizontal non voulu
- ✅ Tous les boutons cliquables (min 44x44px)
- ✅ Navigation fluide
- ✅ Performance acceptable (< 100ms interactions)
- ✅ Rapport de tests documenté

**Estimation** : 3h  
**Statut** : 🟡 En cours

**Livrables :**
- Rapport de tests mobile
- Liste des bugs et corrections
- Captures d'écran des différentes tailles

---

### 📊 Résumé Phase 2.4

**Total tâches** : 12  
**Tâches terminées** : 12 (100%) ✅  
**Tâches en cours** : 0 (0%)  
**Tâches à faire** : 0 (0%)

**Temps estimé total** : 25h  
**Temps réalisé** : ~22h  
**Statut** : ✅ **PHASE TERMINÉE**

**Breakpoints utilisés** :
- xs : 0-600px (Mobile portrait)
- sm : 600-900px (Mobile landscape)
- md : 900-1200px (Tablette)
- lg : 1200px+ (Desktop)

**Composants créés/adaptés** :
- ✅ **MobileCardList** (nouveau composant) - Vue en cartes avec pagination
- ✅ DataGrid (responsive avec colonnes prioritaires)
- ✅ ModalForm (plein écran sur mobile)
- ✅ Dashboard (graphiques et cartes adaptés)
- ✅ SmartFilterPanel (filtres empilés)
- ✅ TransactionsList (vue cartes mobile)
- ✅ ClientsList (vue cartes mobile)
- ✅ FournisseursList (vue cartes mobile)
- ✅ ProduitsList (vue cartes mobile)
- ✅ Login (responsive)
- ✅ Pages de détail (TransactionDetail, ClientProfile, FournisseurProfile)
- ✅ Page Caisse (graphique + cartes mouvements)
- ✅ Page Audit (placeholder)

**Innovation clé** : 🎯 **Vue en cartes sur mobile** - Élimine complètement le scroll horizontal

**Réalisations clés** :
1. ✅ Composant MobileCardList créé (vue en cartes)
2. ✅ Pagination complète sur mobile
3. ✅ Toutes les pages adaptées (11/11)
4. ✅ Zéro scroll horizontal
5. ✅ Fix warning React (helperText)
6. ✅ Documentation complète

**Phase 2.4 : ✅ TERMINÉE ET VALIDÉE**

---

## 🎨 Phase 2.5 : Fonctionnalités Avancées Clients/Fournisseurs

**Objectif** : Enrichir l'application avec des pages de profil détaillées et un système de suivi des paiements.

**Durée estimée** : 2-3 jours  
**Priorité** : 🟡 Haute (MVP+)

**Sprints** : 2.12 à 2.13 (8 tâches)  
**Points clés** : Pages profil, statistiques, suivi créances/dettes, analytics

---

### Sprint 2.12 : Pages de Profil Client/Fournisseur

#### Tâche 2.12.1 : Backend - Endpoint Profil Client
- [x] Créer `GET /clients/{id}/profile` dans `app/routers/clients.py`
- [x] Retourner les données enrichies :
  - Informations client complètes
  - Statistiques agrégées :
    - `total_transactions` (nombre)
    - `montant_total_ventes` (somme)
    - `montant_moyen_transaction`
    - `date_premiere_transaction`
    - `date_derniere_transaction`
  - Liste des transactions (avec pagination)
- [x] Optimiser la requête SQL (jointures, agrégations)

**Critères d'acceptation :**
- ✅ Endpoint retourne toutes les données nécessaires
- ✅ Performance : réponse < 200ms (requêtes SQL optimisées avec agrégations)
- ✅ Pagination fonctionnelle
- ✅ Gestion des clients sans transactions

**Estimation** : 2h

---

#### Tâche 2.12.2 : Backend - Endpoint Profil Fournisseur
- [x] Créer `GET /fournisseurs/{id}/profile` dans `app/routers/fournisseurs.py`
- [x] Retourner les mêmes données que pour les clients (achats au lieu de ventes)
- [x] Réutiliser la logique similaire

**Critères d'acceptation :**
- ✅ Endpoint fonctionnel avec toutes les statistiques
- ✅ Performance optimale

**Estimation** : 2h

---

#### Tâche 2.12.3 : Backend - Endpoint Statistiques Mensuelles
- [x] Créer `GET /clients/{id}/stats-mensuelles` 
- [x] Créer `GET /fournisseurs/{id}/stats-mensuelles`
- [x] Retourner les données pour graphique :
  ```json
  {
    "periode": "6_mois", // ou 12_mois
    "data": [
      {"mois": "2024-01", "montant": 15000, "nb_transactions": 5},
      {"mois": "2024-02", "montant": 18000, "nb_transactions": 7},
      ...
    ]
  }
  ```
- [x] Paramètre `periode` : 6 ou 12 mois

**Critères d'acceptation :**
- ✅ Données correctement agrégées par mois
- ✅ Gestion des mois sans transactions (0)
- ✅ Performance optimisée

**Estimation** : 2h
**Statut** : ✅ Terminé

---

#### Tâche 2.12.4 : Frontend - Page Profil Client
- [x] Créer `src/pages/Clients/ClientProfile.jsx`
- [x] Route : `/clients/:id/profile`
- [x] Sections de la page :
  - **Header** : Nom client, statut, boutons d'action (Éditer, Nouvelle transaction)
  - **Cartes statistiques** (StatCard) :
    - Total ventes
    - Nombre transactions
    - Montant moyen
  - **Graphique** : Évolution des ventes (6 derniers mois) avec recharts
  - **Tableau transactions** : Historique complet (DataGrid)
  - **Bouton Export** : Exporter l'historique (Excel)
- [x] Design cohérent avec Material-UI
- [x] Responsive

**Critères d'acceptation :**
- ✅ Toutes les sections affichées correctement
- ✅ Graphique interactif et lisible
- ✅ Navigation depuis la liste clients
- ✅ Export Excel fonctionnel
- ✅ Gestion du loading et des erreurs

**Estimation** : 4h
**Statut** : ✅ Terminé

---

#### Tâche 2.12.5 : Frontend - Page Profil Fournisseur
- [x] Créer `src/pages/Fournisseurs/FournisseurProfile.jsx`
- [x] Route : `/fournisseurs/:id/profile`
- [x] Même structure que ClientProfile (adapter labels : "Achats" au lieu de "Ventes")
- [x] Réutiliser les composants

**Critères d'acceptation :**
- ✅ Page fonctionnelle et cohérente
- ⚠️ Navigation depuis la liste fournisseurs (à faire dans tâche 2.12.6)

**Estimation** : 3h
**Statut** : ✅ Terminé

---

#### Tâche 2.12.6 : Frontend - Navigation et Liens
- [x] Ajouter un bouton "Voir profil" dans ClientsList (colonne actions)
- [x] Ajouter un bouton "Voir profil" dans FournisseursList
- [x] Ajouter les routes dans `App.jsx`
- [x] Rendre les noms clients/fournisseurs cliquables (redirection profil)

**Critères d'acceptation :**
- ✅ Navigation fluide
- ✅ Boutons visibles et accessibles

**Estimation** : 1h

---

### Sprint 2.13 : Gestion des Créances et Dettes

#### Tâche 2.13.1 : Backend - Migration Statut Paiement
- [ ] Créer une migration Alembic pour ajouter à la table `Transactions` :
  - `statut_paiement` VARCHAR(20) DEFAULT 'paye'
  - Contrainte CHECK : ('paye', 'partiel', 'impaye', 'en_retard')
  - `montant_paye` DECIMAL(10, 2) DEFAULT 0
  - `date_echeance` DATE (nullable)
- [ ] Créer un index sur `statut_paiement`
- [ ] Appliquer la migration

**Critères d'acceptation :**
- ✅ Colonnes ajoutées
- ✅ Contrainte fonctionnelle
- ✅ Migration réversible

**Estimation** : 1h

---

#### Tâche 2.13.2 : Backend - Mise à Jour Schémas
- [ ] Mettre à jour `app/schemas/transaction.py` :
  - Ajouter `statut_paiement` dans TransactionBase/Create/Update
  - Ajouter `montant_paye` et `date_echeance`
  - Ajouter validation : `montant_paye <= montant_total`
- [ ] Ajouter champ calculé `montant_restant` dans TransactionRead :
  ```python
  @property
  def montant_restant(self) -> float:
      return self.montant_total - self.montant_paye
  ```

**Critères d'acceptation :**
- ✅ Schémas mis à jour
- ✅ Validation fonctionnelle

**Estimation** : 1h

---

#### Tâche 2.13.3 : Backend - Endpoints Créances
- [ ] Créer `GET /transactions/creances` (transactions impayées clients)
- [ ] Créer `GET /transactions/dettes` (transactions impayées fournisseurs)
- [ ] Filtres : statut, date_echeance (passée = en retard)
- [ ] Retourner statistiques :
  ```json
  {
    "total_creances": 25000,
    "nb_factures_impayees": 8,
    "en_retard": 5,
    "transactions": [...]
  }
  ```
- [ ] Créer `PUT /transactions/{id}/paiement` pour mettre à jour le paiement

**Critères d'acceptation :**
- ✅ Endpoints fonctionnels
- ✅ Calcul automatique du statut (en_retard si date_echeance dépassée)
- ✅ Mise à jour du statut automatique

**Estimation** : 3h

---

#### Tâche 2.13.4 : Backend - Tâche Planifiée Statut Paiement
- [ ] Créer `app/tasks/payment_checker.py`
- [ ] Fonction pour vérifier quotidiennement les paiements en retard :
  ```python
  def update_overdue_payments():
      # Mettre à jour statut_paiement = 'en_retard'
      # si date_echeance < aujourd'hui et statut != 'paye'
  ```
- [ ] Documenter comment planifier (cron ou scheduler Python)
- [ ] Créer un script d'exécution manuelle

**Critères d'acceptation :**
- ✅ Fonction fonctionnelle
- ✅ Script testable manuellement
- ✅ Documentation de planification

**Estimation** : 2h

---

#### Tâche 2.13.5 : Frontend - Mise à Jour Formulaire Transaction
- [ ] Ajouter dans `TransactionForm.jsx` :
  - Champ `statut_paiement` (dropdown)
  - Champ `montant_paye` (nombre, max = montant_total)
  - Champ `date_echeance` (date picker, optionnel)
  - Affichage dynamique du `montant_restant`
- [ ] Validation : montant_paye <= montant_total
- [ ] Pré-remplir `statut_paiement = 'paye'` et `montant_paye = montant_total` par défaut

**Critères d'acceptation :**
- ✅ Champs visibles et fonctionnels
- ✅ Calcul montant_restant automatique
- ✅ Validation en temps réel

**Estimation** : 2h

---

#### Tâche 2.13.6 : Frontend - Page Créances/Dettes
- [ ] Créer `src/pages/Payments/Creances.jsx` (créances clients)
- [ ] Créer `src/pages/Payments/Dettes.jsx` (dettes fournisseurs)
- [ ] Afficher :
  - Cartes statistiques (total, nombre, en retard)
  - Tableau des transactions impayées
  - Filtres : statut, date
  - Badge "EN RETARD" si date_echeance dépassée
  - Action rapide : "Marquer comme payé"
- [ ] Routes : `/creances` et `/dettes`
- [ ] Ajouter dans la navigation (Sidebar)

**Critères d'acceptation :**
- ✅ Pages fonctionnelles
- ✅ Statistiques correctes
- ✅ Action "Marquer payé" fonctionne
- ✅ Alertes visuelles pour retards

**Estimation** : 4h

---

#### Tâche 2.13.7 : Frontend - Badge Statut Paiement
- [ ] Créer un composant `PaymentStatusBadge.jsx`
- [ ] Afficher un badge coloré selon le statut :
  - `paye` → Vert "Payé"
  - `partiel` → Orange "Partiel"
  - `impaye` → Gris "Impayé"
  - `en_retard` → Rouge "EN RETARD"
- [ ] Utiliser dans :
  - TransactionsList
  - TransactionDetail
  - ClientProfile / FournisseurProfile

**Critères d'acceptation :**
- ✅ Badge réutilisable
- ✅ Couleurs cohérentes
- ✅ Intégré dans toutes les pages

**Estimation** : 1h

---

#### Tâche 2.13.8 : Dashboard - Widget Créances
- [ ] Ajouter sur le Dashboard (`Dashboard.jsx`) :
  - StatCard "Créances en cours" (montant total)
  - StatCard "Factures en retard" (nombre + montant)
- [ ] Rendre les cartes cliquables (redirection vers `/creances`)
- [ ] Alerte visuelle si créances en retard

**Critères d'acceptation :**
- ✅ Widgets affichés
- ✅ Navigation fonctionnelle
- ✅ Alertes visuelles

**Estimation** : 2h

---

## 🧪 Phase 3 : Tests, Finalisation et Déploiement

**Objectif** : Assurer la qualité, tester l'application et la déployer en production.

**Durée estimée** : 3 semaines *(augmentée avec tests charge/sécurité + scripts)*  
**Priorité** : 🔴 Critique

**Sprints** : 3.1 à 3.7 (25+ tâches)  
**Points clés** : Tests unitaires, E2E, charge, sécurité, Docker, migration, scripts admin

---

### Sprint 3.1 : Tests Backend

#### Tâche 3.1.1 : Configuration Tests Backend
- [ ] Créer `tests/conftest.py` avec fixtures :
  - Session de base de données de test
  - Client de test FastAPI
  - Utilisateur de test
- [ ] Configurer pytest avec coverage

**Critères d'acceptation :**
- ✅ Tests peuvent s'exécuter
- ✅ Base de données de test isolée

**Estimation** : 2h

---

#### Tâche 3.1.2 : Tests Authentification
- [ ] Tests pour `/login` (succès, échec)
- [ ] Tests pour `/refresh` (succès, échec)
- [ ] Tests pour routes protégées (token valide, invalide, expiré)
- [ ] Tests pour rate limiting

**Critères d'acceptation :**
- ✅ Tous les tests passent
- ✅ Coverage > 80% pour auth

**Estimation** : 3h

---

#### Tâche 3.1.3 : Tests Endpoints CRUD
- [ ] Tests pour chaque ressource (Users, Clients, Fournisseurs, Produits, Transactions)
  - [x] Fournisseurs : Tests complets créés (`tests/test_fournisseurs.py`) - 20/20 tests passent
- [ ] Tester création, lecture, modification, suppression
  - [x] Fournisseurs : Tous les scénarios CRUD testés
- [ ] Tester les validations (contraintes métier)
  - [x] Fournisseurs : Validations testées (doublons, champs vides, etc.)
- [ ] Tester les permissions (admin vs user)
  - [x] Fournisseurs : Adapté pour fonctionner sans authentification (ENABLE_AUTH=False)

**Critères d'acceptation :**
- ✅ Tous les endpoints testés
- ✅ Coverage > 80% pour les routers

**Estimation** : 6h

---

#### Tâche 3.1.4 : Tests Trigger d'Audit
- [x] Test : modifier une transaction
- [x] Vérifier qu'une entrée est créée dans Transactions_Audit
- [x] Vérifier que les valeurs sont correctes

**Critères d'acceptation :**
- ✅ Trigger testé et fonctionnel

**Estimation** : 2h
**Statut** : ✅ Terminé

**Fichiers créés :**
- `backend/tests/test_audit_trigger.py` : Tests complets pour le trigger d'audit
  - Test d'existence du trigger
  - Test d'existence de la fonction d'audit
  - Test de modification de transaction avec vérification des entrées d'audit
  - Test de modification d'un seul champ
  - Test de modification du champ est_actif

**Note** : Les tests sont configurés pour fonctionner avec PostgreSQL. Ils seront automatiquement ignorés (skipped) si exécutés sur SQLite (base de test en mémoire). Une fois le trigger créé (Tâche 1.11.1), les tests pourront être exécutés contre une base PostgreSQL pour valider le fonctionnement.

---

#### Tâche 3.1.5 : Tests de Charge avec Locust
- [ ] Installer Locust (`pip install locust`)
- [ ] Créer `tests/load/locustfile.py` avec scénarios de charge :
  - **Scénario 1** : Lecture intensive
    - GET /transactions (liste)
    - GET /dashboard (statistiques)
    - GET /caisse/solde
  - **Scénario 2** : Écriture modérée
    - POST /transactions (création)
    - PUT /transactions (modification)
  - **Scénario 3** : Mixte (80% lecture, 20% écriture)
- [ ] Configurer les paramètres de charge :
  - 100 utilisateurs simultanés
  - Montée en charge progressive (spawn rate: 10/sec)
  - Durée : 5 minutes
- [ ] Exécuter les tests et analyser les résultats
- [ ] Identifier les goulots d'étranglement (requêtes lentes)
- [ ] Optimiser si nécessaire (ajout index, cache, pagination)

**Critères d'acceptation :**
- ✅ Application reste responsive sous charge (100 users)
- ✅ Temps de réponse P95 < 500ms
- ✅ Temps de réponse P99 < 1000ms
- ✅ Aucun crash ou timeout
- ✅ Taux d'erreur < 0.1%

**Estimation** : 4h

**Résultats attendus :**
- Rapport de performance documenté
- Liste des optimisations effectuées

---

#### Tâche 3.1.6 : Tests de Sécurité (OWASP)
- [x] Vérifier manuellement les vulnérabilités OWASP Top 10 :
  1. **Injection** : Tester injection SQL sur tous les endpoints avec paramètres ✅
  2. **Broken Authentication** : Tester tokens expirés, invalides, manipulation ✅
  3. **Sensitive Data Exposure** : Vérifier que les mots de passe ne sont jamais retournés ✅
  4. **XML External Entities (XXE)** : Non applicable (pas de XML) ✅
  5. **Broken Access Control** : Tester accès endpoints admin sans droits ✅
  6. **Security Misconfiguration** : Vérifier erreurs détaillées non exposées en prod ✅
  7. **XSS** : Tester injection script dans les champs texte ✅
  8. **Insecure Deserialization** : Vérifier validation des données JSON ✅
  9. **Using Components with Known Vulnerabilities** : Audit dépendances (`pip-audit`) ✅
  10. **Insufficient Logging & Monitoring** : Vérifier logs de sécurité ✅
- [ ] (Optionnel) Utiliser OWASP ZAP pour scan automatique
- [x] Documenter les vulnérabilités trouvées ✅
- [x] Corriger toutes les vulnérabilités critiques et hautes ✅
- [x] Créer un rapport de sécurité ✅

**Implémentation :**
- ✅ Fichier de tests OWASP créé : `backend/tests/test_owasp_security.py`
- ✅ Script d'audit des dépendances : `backend/scripts/audit_dependencies.py`
- ✅ Script de génération de rapport : `backend/scripts/generate_security_report.py`
- ✅ Documentation : `backend/tests/README_OWASP.md`
- ✅ Scripts d'exécution : `backend/scripts/run_security_tests.sh` et `.ps1`

**Critères d'acceptation :**
- ✅ Aucune vulnérabilité critique
- ✅ Vulnérabilités hautes corrigées ou justifiées
- ✅ Rapport de sécurité complet
- ✅ Dépendances à jour (pas de CVE connues)

**Estimation** : 4h

**Outils recommandés :**
```bash
# Backend
pip install pip-audit
pip-audit

# Scan dépendances
safety check

# Test injections SQL
sqlmap (si nécessaire)
```

---

### Sprint 3.2 : Tests Frontend

#### Tâche 3.2.1 : Configuration Tests Frontend
- [ ] Configurer Jest et React Testing Library
- [ ] Créer des helpers de test
- [ ] Configurer les mocks pour axios

**Critères d'acceptation :**
- ✅ Tests peuvent s'exécuter
- ✅ Configuration complète

**Estimation** : 2h

---

#### Tâche 3.2.2 : Tests Composants
- [ ] Tests pour les composants réutilisables :
  - DataGrid
  - ModalForm
  - StatCard
- [ ] Tests de rendu et d'interactions

**Critères d'acceptation :**
- ✅ Composants testés
- ✅ Coverage > 70%

**Estimation** : 4h

---

#### Tâche 3.2.3 : Tests Pages
- [ ] Tests pour les pages principales :
  - Login
  - Dashboard
  - Transactions (liste, formulaire)
- [ ] Tests d'intégration (appels API mockés)

**Critères d'acceptation :**
- ✅ Pages testées
- ✅ Scénarios utilisateur couverts

**Estimation** : 4h

---

#### Tâche 3.2.4 : Tests E2E (Optionnel mais Recommandé)
- [ ] Installer Playwright ou Cypress
- [ ] Créer des scénarios E2E :
  - Connexion
  - Création d'une transaction
  - Consultation du dashboard
- [ ] Automatiser dans CI/CD

**Critères d'acceptation :**
- ✅ Scénarios E2E passent
- ✅ Tests automatisés

**Estimation** : 4h

---

### Sprint 3.3 : Dockerisation et Déploiement Azure

#### Tâche 3.3.1 : Dockerfile Backend
- [x] Vérifier `backend/Dockerfile` existant
- [x] Optimiser pour la production
- [x] Exposer le port 8000
- [x] Configurer la commande de démarrage

**Critères d'acceptation :**
- ✅ Image Docker créée
- ✅ Backend démarre dans le conteneur
- ✅ Connexion à la base de données fonctionne

**Estimation** : 2h
**Statut** : ✅ Terminé

---

#### Tâche 3.3.2 : Dockerfile Frontend
- [x] Créer `frontend/Dockerfile` (multi-stage)
- [x] Stage 1 : Build avec Vite
- [x] Stage 2 : Serve avec Nginx
- [x] Créer `frontend/nginx.conf` pour SPA routing
- [x] Configurer gzip et cache
- [x] Ajouter healthcheck

**Critères d'acceptation :**
- ✅ Image Docker créée
- ✅ Frontend accessible
- ✅ Routing SPA fonctionne
- ✅ Assets optimisés (gzip, cache)

**Estimation** : 3h
**Statut** : ✅ Terminé

**Fichiers créés :**
- `frontend/Dockerfile`
- `frontend/nginx.conf`

---

#### Tâche 3.3.3 : Docker Compose Production
- [x] Mettre à jour `docker-compose.yml`
- [x] Ajouter le service frontend
- [x] Configurer les healthchecks
- [x] Optimiser pour la production (pas de volumes de dev)
- [x] Configurer les variables d'environnement
- [x] Créer script de déploiement `deploy.sh`

**Critères d'acceptation :**
- ✅ `docker-compose up` lance tout
- ✅ Tous les services communiquent
- ✅ Application fonctionnelle
- ✅ Healthchecks opérationnels

**Estimation** : 3h
**Statut** : ✅ Terminé

**Fichiers créés/modifiés :**
- `docker-compose.yml` (mis à jour)
- `deploy.sh`
- `.env.example` (mis à jour)
- `frontend/.env.example`

---

#### Tâche 3.3.4 : Documentation Déploiement Azure
- [x] Créer guide complet `DEPLOYMENT_AZURE_GUIDE.md`
- [x] Créer guide rapide `DEPLOYMENT_QUICKSTART.md`
- [x] Créer résumé `AZURE_DEPLOYMENT_SUMMARY.md`
- [x] Documenter la création de VM Azure
- [x] Documenter l'installation Docker
- [x] Documenter la configuration Nginx reverse proxy
- [x] Documenter HTTPS avec Let's Encrypt
- [x] Documenter les backups
- [x] Documenter la maintenance

**Critères d'acceptation :**
- ✅ Documentation complète et claire
- ✅ Commandes testables
- ✅ Troubleshooting inclus
- ✅ Estimation des coûts

**Estimation** : 2h  
**Statut** : ✅ Terminé

**Fichiers créés :**
- `DEPLOYMENT_AZURE_GUIDE.md`
- `DEPLOYMENT_QUICKSTART.md`
- `AZURE_DEPLOYMENT_SUMMARY.md`

---

#### Tâche 3.3.5 : Script de Déploiement Automatisé
- [x] Créer `deploy_to_azure.ps1` (PowerShell pour Windows)
- [x] Automatiser : archive, upload, déploiement
- [x] Gestion des erreurs
- [x] Préservation des fichiers .env existants
- [x] Application automatique des migrations

**Critères d'acceptation :**
- ✅ Déploiement en une commande
- ✅ Gestion des erreurs
- ✅ Logs clairs
- ✅ Rollback possible

**Estimation** : 2h  
**Statut** : ✅ Terminé

**Fichiers créés :**
- `deploy_to_azure.ps1`

---

### Sprint 3.4 : Configuration Production

#### Tâche 3.4.1 : Variables d'Environnement
- [ ] Créer `.env.example` pour backend et frontend
- [ ] Documenter toutes les variables nécessaires
- [ ] S'assurer qu'aucun `.env` n'est commité

**Critères d'acceptation :**
- ✅ Templates créés
- ✅ Documentation complète

**Estimation** : 1h

---

#### Tâche 3.4.2 : Système de Sauvegarde
- [ ] Créer un script de backup PostgreSQL
- [ ] Configurer un cron job (ou équivalent) pour backup quotidien
- [ ] Tester la restauration depuis un backup

**Critères d'acceptation :**
- ✅ Backup automatique fonctionnel
- ✅ Restauration testée

**Estimation** : 2h

---

#### Tâche 3.4.3 : Monitoring et Logs
- [ ] Configurer le logging structuré (backend)
- [ ] Configurer les logs frontend (erreurs)
- [ ] Mettre en place un système de monitoring basique (optionnel : Prometheus, Grafana)

**Critères d'acceptation :**
- ✅ Logs structurés
- ✅ Erreurs traçables

**Estimation** : 2h

---

### Sprint 3.5 : Documentation

#### Tâche 3.5.1 : Documentation Technique
- [ ] Mettre à jour le README.md avec :
  - Instructions d'installation
  - Configuration
  - Commandes utiles
  - Structure du projet
- [ ] Documenter les APIs (déjà fait via Swagger, mais compléter si besoin)

**Critères d'acceptation :**
- ✅ README complet et à jour

**Estimation** : 2h

---

#### Tâche 3.5.2 : Documentation Utilisateur
- [ ] Créer un guide utilisateur (PDF ou page web)
- [ ] Inclure :
  - Comment se connecter
  - Comment créer une transaction
  - Comment consulter les rapports
  - FAQ
- [ ] Ajouter des captures d'écran

**Critères d'acceptation :**
- ✅ Guide complet et illustré

**Estimation** : 4h

---

#### Tâche 3.5.3 : Runbooks
- [ ] Documenter les procédures :
  - En cas de base de données corrompue
  - En cas de perte de connexion
  - En cas d'erreur de déploiement
  - Procédure de restauration

**Critères d'acceptation :**
- ✅ Runbooks complets

**Estimation** : 2h

---

### Sprint 3.6 : Migration des Données

#### Tâche 3.6.1 : Script de Migration Excel → PostgreSQL
- [ ] Analyser la structure du fichier Excel existant
- [ ] Créer un script Python pour :
  - Lire le fichier Excel
  - Valider les données
  - Importer dans PostgreSQL
  - Gérer les erreurs
- [ ] Tester sur un échantillon

**Critères d'acceptation :**
- ✅ Script fonctionnel
- ✅ Données migrées correctement
- ✅ Validation des données

**Estimation** : 4h

---

#### Tâche 3.6.2 : Test de Migration Complète
- [ ] Exécuter la migration sur une copie de production
- [ ] Vérifier l'intégrité des données
- [ ] Comparer les totaux (Excel vs Base de données)
- [ ] Documenter les écarts éventuels

**Critères d'acceptation :**
- ✅ Migration validée
- ✅ Données cohérentes

**Estimation** : 3h

---

### Sprint 3.7 : Scripts d'Administration et Maintenance

**Objectif** : Créer des scripts utilitaires pour faciliter l'administration et la maintenance de l'application.

#### Tâche 3.7.1 : Script de Création d'Utilisateur Admin
- [ ] Créer `backend/scripts/create_admin.py`
- [ ] Script CLI interactif pour créer un utilisateur admin :
  ```bash
  python scripts/create_admin.py
  # Prompt: Email?
  # Prompt: Mot de passe?
  # Prompt: Nom?
  # → Création avec rôle 'admin'
  ```
- [ ] Validation : email valide, mot de passe fort
- [ ] Vérification : utilisateur n'existe pas déjà
- [ ] Hashage automatique du mot de passe
- [ ] Confirmation de création

**Critères d'acceptation :**
- ✅ Script fonctionnel en ligne de commande
- ✅ Utilisateur admin créé dans la base
- ✅ Gestion des erreurs (email existant, etc.)

**Estimation** : 1h

---

#### Tâche 3.7.2 : Script de Vérification d'Intégrité
- [ ] Créer `backend/scripts/check_integrity.py`
- [ ] Vérifications automatiques :
  - Orphelins : lignes de transaction sans transaction parent
  - Montants : cohérence montant_total vs somme des lignes
  - Caisse : mouvements sans transaction liée (si applicable)
  - Utilisateurs : références à des utilisateurs supprimés
  - Dates : date_modification < date_creation
- [ ] Rapport détaillé des incohérences trouvées
- [ ] Option `--fix` pour corriger automatiquement (si possible)

**Critères d'acceptation :**
- ✅ Script détecte les incohérences
- ✅ Rapport clair et exploitable
- ✅ Option de correction automatique

**Estimation** : 2h

---

#### Tâche 3.7.3 : Script de Nettoyage des Logs
- [ ] Créer `backend/scripts/cleanup_logs.py`
- [ ] Supprimer les logs de plus de X jours (paramétrable)
- [ ] Archiver les logs avant suppression (optionnel)
- [ ] Rapport : espace libéré, fichiers supprimés
- [ ] Protection : ne jamais supprimer les logs récents (< 7 jours)

**Critères d'acceptation :**
- ✅ Logs anciens supprimés
- ✅ Espace disque libéré
- ✅ Protection des logs récents

**Estimation** : 1h

---

#### Tâche 3.7.4 : Script de Génération de Rapports Mensuels
- [ ] Créer `backend/scripts/generate_monthly_report.py`
- [ ] Générer un rapport mensuel automatique :
  - Nombre de transactions
  - Total ventes (clients)
  - Total achats (fournisseurs)
  - Évolution du solde caisse
  - Top 5 clients
  - Top 5 fournisseurs
  - Top 5 produits
- [ ] Export en PDF et/ou Excel
- [ ] Paramètre : mois/année
- [ ] Envoi par email (optionnel)

**Critères d'acceptation :**
- ✅ Rapport généré avec toutes les statistiques
- ✅ Export PDF/Excel fonctionnel
- ✅ Données correctes et vérifiées

**Estimation** : 3h

---

#### Tâche 3.7.5 : Script de Reset Environnement de Test
- [ ] Créer `backend/scripts/reset_test_env.py`
- [ ] Réinitialiser complètement l'environnement de test :
  - Supprimer toutes les données (sauf utilisateurs admin)
  - Réinitialiser les séquences PostgreSQL
  - Créer des données de test (fixtures)
- [ ] Protection : ne fonctionne QUE si variable d'environnement `ENV=test`
- [ ] Confirmation obligatoire avant exécution

**Critères d'acceptation :**
- ✅ Environnement réinitialisé
- ✅ Données de test créées
- ✅ Protection contre exécution en prod

**Estimation** : 2h

---

#### Tâche 3.7.6 : Documentation des Scripts
- [ ] Créer `backend/scripts/README.md`
- [ ] Documenter chaque script :
  - Objectif
  - Usage / commande
  - Paramètres
  - Exemples
  - Précautions
- [ ] Ajouter les scripts dans le Makefile ou scripts/run.sh

**Critères d'acceptation :**
- ✅ Documentation complète
- ✅ Exemples d'utilisation
- ✅ Scripts facilement exécutables

**Estimation** : 1h

---

## 👥 Phase 4 : Formation et Accompagnement

**Objectif** : Former les utilisateurs et assurer une transition en douceur.

**Durée estimée** : 1 semaine  
**Priorité** : 🟡 Haute

---

### Sprint 4.1 : Préparation Formation

#### Tâche 4.1.1 : Plan de Formation
- [ ] Définir les sessions de formation
- [ ] Identifier les utilisateurs clés
- [ ] Préparer le matériel pédagogique

**Critères d'acceptation :**
- ✅ Plan détaillé créé

**Estimation** : 2h

---

#### Tâche 4.1.2 : Création de Vidéos Tutorielles
- [ ] Enregistrer des screencasts pour :
  - Connexion
  - Création d'une transaction
  - Consultation des rapports
  - Gestion de la caisse
- [ ] Monter et éditer les vidéos
- [ ] Mettre à disposition (YouTube, intranet, etc.)

**Critères d'acceptation :**
- ✅ Vidéos créées et accessibles

**Estimation** : 4h

---

### Sprint 4.2 : Sessions de Formation

#### Tâche 4.2.1 : Formation Utilisateurs
- [ ] Organiser les sessions de formation
- [ ] Former les utilisateurs sur :
  - Interface et navigation
  - Création de transactions
  - Consultation des données
  - Export de rapports
- [ ] Recueillir les retours

**Critères d'acceptation :**
- ✅ Utilisateurs formés
- ✅ Retours collectés

**Estimation** : 8h (réparties sur plusieurs jours)

---

#### Tâche 4.2.2 : Désignation Super-Utilisateur
- [ ] Identifier un super-utilisateur interne
- [ ] Former ce super-utilisateur en profondeur
- [ ] Lui donner les droits admin si nécessaire
- [ ] Le rendre disponible pour aider les autres

**Critères d'acceptation :**
- ✅ Super-utilisateur identifié et formé

**Estimation** : 2h

---

## 📈 Suivi de Progression

### Comment Utiliser ce Backlog

1. **Mise à jour régulière** : Cochez les cases `[ ]` au fur et à mesure de l'avancement
2. **Statut des sprints** : Mettez à jour le statut en haut du document
3. **Blocages** : Notez les blocages dans les commentaires des tâches
4. **Temps réel** : Notez le temps réel passé vs estimation pour améliorer les futures estimations

### Métriques de Succès

- **Vélocité** : Nombre de tâches complétées par sprint
- **Taux de complétion** : % de tâches terminées vs total
- **Qualité** : Nombre de bugs trouvés en production
- **Satisfaction utilisateurs** : Retours des utilisateurs après formation

---

## 📋 Résumé des Améliorations du Backlog

Ce backlog a été enrichi avec les sections suivantes pour garantir un projet robuste et professionnel :

### ✅ Sections Stratégiques Ajoutées

1. **🔗 Dépendances Critiques** (après Vue d'Ensemble)
   - Identification du chemin critique
   - Tâches parallélisables pour optimiser le temps
   - Tâches bloquantes à surveiller
   - Dépendances externes

2. **✅ Definition of Done** (après Vue d'Ensemble)
   - Critères généraux pour toutes les tâches
   - Critères spécifiques par type (API, Frontend, Migrations, Tests)
   - Checklist de revue avant validation

### 🔧 Tâches Techniques Ajoutées

#### Phase 1 - Backend (+3 tâches, +6h)
- **Tâche 1.2.6** : Vue Matérialisée Solde Caisse (2h)
  - Calcul en temps réel du solde
  - Optimisation performance
- **Tâche 1.10.2** : Middleware de Logging Structuré (2h)
  - Logs JSON structurés
  - Traçabilité complète des requêtes
  - Rotation automatique

#### Phase 2 - Frontend (+2 tâches, +4h)
- **Sprint 2.11** : Gestion des Erreurs Frontend
  - **Tâche 2.11.1** : Error Boundary React (2h)
  - **Tâche 2.11.2** : Gestion Globale Erreurs API (2h)

#### Phase 2.5 - Profils & Créances (NEW, +14 tâches, +24h)
- **Sprint 2.12** : Pages de Profil Client/Fournisseur (6 tâches, 14h)
  - Endpoints backend profil et statistiques (6h)
  - Pages frontend profil avec graphiques (7h)
  - Navigation et intégration (1h)
- **Sprint 2.13** : Gestion Créances/Dettes (8 tâches, 10h)
  - Migration et schémas statut paiement (2h)
  - Endpoints créances/dettes (5h)
  - Pages frontend et widgets dashboard (7h)
  - Tâche planifiée paiements en retard (2h)

#### Phase 3 - Tests & Déploiement (+8 tâches, +18h)
- **Tâche 3.1.5** : Tests de Charge avec Locust (4h)
  - 100 utilisateurs simultanés
  - Identification des goulots d'étranglement
- **Tâche 3.1.6** : Tests de Sécurité OWASP (4h)
  - Audit des 10 vulnérabilités principales
  - Scan dépendances
- **Sprint 3.7** : Scripts d'Administration (10h)
  - Création admin (1h)
  - Vérification intégrité (2h)
  - Nettoyage logs (1h)
  - Rapports mensuels (3h)
  - Reset environnement test (2h)
  - Documentation scripts (1h)

### 📊 Impact sur le Planning

| Aspect | Avant | Après | Différence |
|--------|-------|-------|------------|
| **Phase 1** | 3-4 semaines | 4-5 semaines | +1 semaine |
| **Phase 2** | 3-4 semaines | 4-5 semaines | +1 semaine |
| **Phase 2.5** | - | 2-3 jours | +2-3 jours (NEW) |
| **Phase 3** | 2 semaines | 3 semaines | +1 semaine |
| **Total Projet** | 2-3 mois | 3-4 mois | +1 mois |
| **Nombre Tâches** | ~87 | ~115 | +28 tâches |
| **Heures Ajoutées** | - | - | +52h |

### 🎯 Bénéfices des Ajouts

1. **🔒 Sécurité Renforcée**
   - Tests OWASP
   - Logs structurés
   - Audit complet

2. **⚡ Performance Garantie**
   - Tests de charge
   - Vue matérialisée pour le solde
   - Identification des goulots

3. **🛠️ Maintenabilité Améliorée**
   - Scripts d'administration
   - Gestion d'erreurs robuste
   - Documentation des dépendances

4. **✅ Qualité Assurée**
   - Definition of Done claire
   - Critères d'acceptation précis
   - Processus de validation

5. **📈 Visibilité du Projet**
   - Dépendances critiques identifiées
   - Tâches bloquantes surveillées
   - Planning réaliste

6. **💼 Valeur Métier Accrue (Phase 2.5)**
   - **Pages profil** : Vue 360° clients/fournisseurs
   - **Analytics** : Décisions éclairées sur relations commerciales
   - **Gestion créances** : Meilleur suivi trésorerie
   - **Alertes paiements** : Réduction des impayés
   - **UX améliorée** : Navigation intuitive et informative

### ⚠️ Points d'Attention

- **Buffer intégré** : Les nouvelles estimations incluent un buffer de ~20%
- **Approche itérative** : Possibilité de différer certaines tâches (tests charge, scripts avancés) en post-MVP
- **Priorisation flexible** : Les sprints 2.11 et 3.7 peuvent être adaptés selon les besoins

---

## 🎯 Priorisation des Fonctionnalités (MVP vs Futures)

### MVP (Version 1.0) - À Livrer en Premier
- ✅ Toutes les tâches des Phases 0, 1, 2 (sans les fonctionnalités avancées)
- ✅ Tests essentiels (Phase 3.1 et 3.2 partiels)
- ✅ Dockerisation basique
- ✅ Migration des données

### MVP+ (Version 1.5) - Fonctionnalités Métier Essentielles
- 👥 **Phase 2.5** : Pages profil clients/fournisseurs
- 💰 **Phase 2.5** : Gestion des créances et dettes
- 🔒 Refresh tokens (déjà dans Phase 1)
- 🔒 Rate limiting (déjà dans Phase 1)
- 🔒 Audit des connexions (déjà dans Phase 1)
- 🔒 Tests de sécurité approfondis

### Version 2.0 - Fonctionnalités Avancées
- 📊 Graphiques analytiques avancés
- 📄 Export PDF personnalisés
- 🔍 Recherche full-text avancée
- 📱 Notifications en temps réel (WebSocket)
- 🌐 Mode responsive optimisé
- 📦 Gestion de stock simplifiée
- 📄 Module devis et factures

### Version 2.5 - Optimisations & BI
- ⚡ Tests de charge (Locust/K6)
- 🔌 APIs pour intégration externe
- 💾 Système de backup automatisé avancé
- 📈 Dashboard BI avancé
- 🤖 Prédictions et analytics ML

---

**Dernière mise à jour** : [Date]  
**Prochaine révision** : [Date]

---

*Ce backlog est un document vivant. Il doit être mis à jour régulièrement pour refléter l'état réel du projet.*

