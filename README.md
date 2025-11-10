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
- **Containerisation** : Docker & Docker Compose
- **Base de données** : PostgreSQL (via Docker)

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
├── docker-compose.yml
├── .env.example
└── README.md
```

## 🚀 Démarrage Rapide

### Prérequis

- Python 3.10+
- Node.js (LTS)
- Docker & Docker Compose
- Git

### Installation

1. **Cloner le dépôt**
   ```bash
   git clone <repository-url>
   cd marwane
   ```

2. **Configurer PostgreSQL avec Docker**
   ```bash
   # Copier le fichier d'environnement
   cp .env.example .env
   
   # Lancer PostgreSQL
   docker-compose up -d postgres
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

**Base de données**
```bash
docker-compose up -d postgres
```

## 📚 Documentation

- [Documentation Complète](./Documentation.md) - Architecture détaillée et spécifications
- [Backlog du Projet](./BACKLOG.md) - Suivi des tâches et progression

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
pytest

# Frontend
cd frontend
npm test
```

## 📝 License

Projet interne - Tous droits réservés

## 👥 Équipe

Projet développé pour la digitalisation du processus comptable.

---

**Statut du projet** : 🟡 En développement  
**Version** : 0.1.0 (Phase 0 - Préparation)

