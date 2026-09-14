# Backend - API FastAPI

## Configuration de l'environnement

### Méthode rapide

Installez les dépendances dans un environnement virtuel local, puis copiez
`.env.example` vers `.env`. La production utilise Supabase et Vercel; les
scripts Docker présents dans le dépôt sont uniquement un secours pour un
PostgreSQL local et ne font pas partie du chemin de déploiement.

### Méthode manuelle

#### 1. Créer l'environnement virtuel

**Sur Windows (PowerShell) :**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**Sur Linux/Mac :**
```bash
python -m venv venv
source venv/bin/activate
```

#### 2. Installer les dépendances

```bash
pip install -r requirements.txt
# For local quality gates, also install the pinned developer tooling:
pip install -r requirements-dev.txt
```

#### 3. Configurer les variables d'environnement

Le fichier `.env` est déjà créé avec des valeurs par défaut. Pour la production, modifiez les valeurs suivantes :

- `SECRET_KEY` : Générez une clé secrète forte pour JWT
- `DATABASE_URL` : Connexion runtime Supabase avec pooler adapté à Vercel
- `MIGRATION_DATABASE_URL` : Connexion de migration séparée et privilégiée,
  réservée au job Alembic et non requise par les fonctions Vercel
- `DATABASE_URL` doit utiliser le rôle runtime dédié `app_runtime`, jamais
  `postgres`, `service_role` ou un autre rôle administrateur.
  `MIGRATION_DATABASE_URL` doit utiliser le rôle distinct `app_migrator`.
- `SECRET_KEY`, `CRON_SECRET` : secrets longs, distincts par environnement
- `CORS_ORIGINS` : origines HTTPS explicites de l'application déployée; les
  origines localhost seules sont refusées en preview et en production.

**Note :** Le fichier `.env` n'est pas versionné dans Git pour des raisons de sécurité. Utilisez `.env.example` comme référence.

#### 4. Vérifier la base de données

Les migrations de preview/staging sont appliquées avec Alembic depuis un job
contrôlé. Ne lancez jamais `Base.metadata.create_all()` contre Supabase.

## Structure du projet

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # Point d'entrée FastAPI avec routes de test
│   ├── config.py             # Gestion de la configuration
│   ├── database.py           # Connexion SQLAlchemy
│   ├── models/               # Modèles SQLAlchemy
│   ├── schemas/              # Schémas Pydantic
│   ├── routers/              # Routers FastAPI
│   ├── services/             # Services métier
│   └── utils/                # Utilitaires
├── alembic/                  # Migrations de base de données
├── tests/                    # Tests de l'application
├── .env                      # Variables d'environnement (non versionné)
├── .env.example              # Exemple de configuration
├── requirements.txt          # Dépendances Python
└── README.md                 # Ce fichier
```

## Démarrage de l'application

Une fois l'environnement configuré et la base de données démarrée :

```bash
# Activer l'environnement virtuel
.\venv\Scripts\Activate.ps1  # Windows
# ou
source venv/bin/activate     # Linux/Mac

# Démarrer le serveur de développement
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

L'API sera accessible à :
- **API** : http://localhost:8000
- **Documentation Swagger** : http://localhost:8000/docs
- **Documentation ReDoc** : http://localhost:8000/redoc

## Vérification locale et Vercel

- `GET /api/v1/health/live` : la fonction est chargée, sans accès DB
- `GET /api/v1/health/ready` : la base de données est joignable
- `GET /docs` : documentation OpenAPI (à protéger ou désactiver selon la politique de production)

Pour une instance Vercel, utilisez les endpoints suivants :

- `GET /api/v1/health/live` : vérifie que la fonction est chargée, sans accès à la base
- `GET /api/v1/health/ready` : vérifie que la base de données est joignable

Les variables `DATABASE_URL`, `SECRET_KEY`, `CRON_SECRET`, `DEBUG`,
`ENABLE_AUTH` et `ENABLE_RATE_LIMITING` doivent être configurées dans
l'environnement Vercel. `MIGRATION_DATABASE_URL` doit rester dans le job de
migration contrôlé.
L'application refuse automatiquement les valeurs locales ou dangereuses en
preview et en production, notamment l'absence du rôle runtime dédié,
l'utilisation d'un rôle PostgreSQL privilégié par le runtime, ou une
configuration CORS locale uniquement. Le job Alembic refuse séparément toute
connexion de migration absente ou configurée avec un mauvais rôle.

## Tests et exploitation

Depuis la racine du dépôt, le gate backend utilisé par CI est :

```powershell
cd backend
pytest --override-ini addopts='' --cov=app.services --cov-report=term-missing --cov-fail-under=70 -q
```

Avant une promotion, exécutez aussi le
[runbook de sauvegarde/restauration](../docs/backup-restore-runbook.md) et
conservez les rapports JSON de réconciliation et de sécurité avec le ticket
de release.

