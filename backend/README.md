# Backend - API FastAPI

## Configuration de l'environnement

### Méthode rapide (recommandée)

**Sur Windows (PowerShell) :**
```powershell
cd backend
.\setup.ps1
```

**Sur Linux/Mac :**
```bash
cd backend
./setup.sh
```

Le script va automatiquement :
- ✅ Créer l'environnement virtuel Python
- ✅ Activer l'environnement virtuel
- ✅ Installer toutes les dépendances
- ✅ Créer le fichier `.env` depuis `.env.example` si nécessaire

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
```

#### 3. Configurer les variables d'environnement

Le fichier `.env` est déjà créé avec des valeurs par défaut. Pour la production, modifiez les valeurs suivantes :

- `SECRET_KEY` : Générez une clé secrète forte pour JWT
- `POSTGRES_PASSWORD` : Changez le mot de passe de la base de données
- `DATABASE_URL` : Ajustez selon votre configuration

**Note :** Le fichier `.env` n'est pas versionné dans Git pour des raisons de sécurité. Utilisez `.env.example` comme référence.

#### 4. Démarrer la base de données PostgreSQL

Depuis la racine du projet :
```bash
docker-compose up -d postgres
```

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

## Routes de test

- `GET /` : Route principale de test
- `GET /health` : Vérification de santé de l'API

