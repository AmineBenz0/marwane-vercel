# 📊 Digitalisation du Processus de Comptabilité

> Application web interne pour la gestion comptable - Migration depuis Excel vers une solution sécurisée et évolutive

## 📋 Description du Projet

Ce projet vise à digitaliser et automatiser le processus comptable actuel basé sur Excel. L'application permet de gérer les transactions financières impliquant trois entités principales : les Fournisseurs (débit), les Clients (crédit) et la Caisse.

### Objectifs Principaux

- ✅ **Centraliser** les données dans une base de données relationnelle robuste (PostgreSQL)
- 🔒 **Sécuriser** l'accès et les modifications via authentification JWT et gestion des rôles
- ✅ **Garantir l'intégrité** des données grâce à des règles de validation strictes
- 📝 **Assurer une traçabilité inviolable** de toutes les modifications (piste d'audit)
- 🎨 **Offrir une interface utilisateur** administrative efficace et intuitive
- 🚀 **Construire une fondation technique** prête à s'interconnecter avec de futurs services

## 🛠️ Stack Technique

### Backend
- **Framework** : FastAPI (Python 3.10+)
- **Base de données** : PostgreSQL
- **ORM** : SQLAlchemy
- **Migrations** : Alembic
- **Authentification** : JWT (access + refresh tokens)
- **Validation** : Pydantic

### Frontend
- **Framework** : React (avec Vite)
- **UI Library** : Material-UI (MUI)
- **State Management** : Zustand
- **Routing** : React Router
- **Form Validation** : React Hook Form + Yup
- **Charts** : Recharts

### Infrastructure
- **Application** : Vercel (frontend and serverless API)
- **Base de données** : Supabase PostgreSQL
- **Migrations** : Alembic through the dedicated migration database role
- **Operations** : Vercel deployments, Supabase backups/PITR, GitHub Actions gates

## 📁 Structure du Projet

```
projet/
├── backend/          # API FastAPI
│   ├── app/
│   ├── alembic/
│   ├── tests/
│   └── requirements.txt
├── frontend/         # Application React
│   ├── src/
│   └── package.json
├── docs/             # Documentation
├── .github/workflows/     # CI and release gates
├── docker-compose.yml     # Optional legacy local PostgreSQL setup
├── .env.example
└── README.md
```

## 🚀 Démarrage Rapide

### Prérequis

- Python 3.12+
- Node.js 22.12+
- Git
- A Supabase project for preview/production verification

### Installation

1. **Cloner le dépôt**
   ```bash
   git clone <repository-url>
   cd marwane
   ```

2. **Configurer l'environnement**
   ```bash
   cp .env.example .env
   # Pour un environnement local, définir DATABASE_URL vers PostgreSQL ou SQLite.
   # Pour Vercel/Supabase, configurer les variables dans les environnements Vercel.
   ```

3. **Configurer le Backend**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # Sur Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. **Configurer le Frontend**
   ```bash
   cd frontend
   npm install
   ```

### Développement

**Backend** (port 8000)
```bash
cd backend
uvicorn app.main:app --reload
```

**Frontend** (port 5173)
```bash
cd frontend
npm run dev
```

Les migrations de staging et de production sont exécutées avec Alembic et une
variable `MIGRATION_DATABASE_URL` séparée de la connexion runtime.

## 📚 Documentation

- [Documentation Complète](./Documentation.md) - Architecture détaillée et spécifications
- [Backlog du Projet](./backlog.md) - Suivi historique et état des vagues
- [Guide de Développement historique](./DEVELOPMENT_WORKFLOW.md) - Ancien workflow Docker/Azure
- [Guide Rapide de Développement](./QUICK_DEV_GUIDE.md) - Démarrage rapide
- [Checklist opérationnelle Vercel/Supabase](./TODO_IMMEDIAT.md) - Déploiement, sécurité et exploitation
- [Checklist d'acceptation enterprise](./docs/enterprise-acceptance-checklist.md) - Gates avant promotion
- [Décisions d'architecture](./docs/adr/) - Ledger, stock, paiements et autorisation

## 🔐 Sécurité

- Authentification JWT avec refresh tokens
- Hashage des mots de passe (bcrypt)
- Rate limiting sur les endpoints sensibles
- Audit complet des modifications (triggers PostgreSQL)
- Logs structurés de toutes les actions

## 🧪 Tests

```bash
# Backend
cd backend
pytest -q --no-cov

# Frontend lint, unit coverage, and production build
cd frontend
npm run lint
npm run test:unit:coverage
npm run build

# Authenticated end-to-end smoke tests when credentials are configured
npm run test:e2e
```

## 📝 License

Projet interne - Tous droits réservés

## 👥 Équipe

Projet développé pour la digitalisation du processus comptable.

---

**Statut du projet** : 🟡 Remédiation enterprise en cours — promotion contrôlée
**Version** : 0.1.0

