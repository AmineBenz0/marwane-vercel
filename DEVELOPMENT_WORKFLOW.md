# 🔄 Workflow de Développement Local et Production

Ce guide explique comment développer localement, tester vos changements, et les déployer en production de manière cohérente.

---

## 📋 Table des Matières

1. [Configuration des Environnements](#configuration-des-environnements)
2. [Développement Local](#développement-local)
3. [Test des Changements](#test-des-changements)
4. [Déploiement en Production](#déploiement-en-production)
5. [Workflow Complet](#workflow-complet)
6. [Dépannage](#dépannage)

---

## 🔧 Configuration des Environnements

### 1. Fichiers `.env` à Créer

#### **Racine du projet** (`.env.local` - **NE PAS COMMITER**)

```bash
# Copier depuis .env.example
cp .env.example .env.local
```

Contenu pour **développement local** :

```env
# PostgreSQL Configuration (pour Docker Compose)
POSTGRES_DB=comptabilite_db
POSTGRES_USER=comptabilite_user
POSTGRES_PASSWORD=dev_password_123
POSTGRES_PORT=5432

# Backend Configuration
SECRET_KEY=dev-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS Origins (développement local)
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Environment
ENVIRONMENT=development
DEBUG=True
ENABLE_AUTH=True
ENABLE_RATE_LIMITING=False

# Frontend Configuration (pour le build Docker en local)
VITE_API_URL=http://localhost:8000
```

#### **Backend** (`backend/.env.local` - **NE PAS COMMITER**)

```bash
cd backend
cp .env.example .env.local
```

Contenu pour **développement local** :

```env
# Database Configuration
DATABASE_URL=postgresql://comptabilite_user:dev_password_123@localhost:5432/comptabilite_db

# PostgreSQL Connection (for docker-compose)
POSTGRES_DB=comptabilite_db
POSTGRES_USER=comptabilite_user
POSTGRES_PASSWORD=dev_password_123
POSTGRES_PORT=5432

# JWT Configuration
SECRET_KEY=dev-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Application Configuration
ENVIRONMENT=development
DEBUG=True
API_V1_PREFIX=/api/v1

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60
```

#### **Frontend** (`frontend/.env.local` - **NE PAS COMMITER**)

```bash
cd frontend
cp .env.example .env.local
```

Contenu pour **développement local** :

```env
# URL de l'API Backend (développement local)
VITE_API_URL=http://localhost:8000
```

---

## 💻 Développement Local

### Option 1 : Mode Développement (Recommandé pour le développement actif)

**Avantages** :
- ✅ Hot reload automatique (frontend et backend)
- ✅ Débogage facile avec les DevTools
- ✅ Logs détaillés en temps réel
- ✅ Pas besoin de rebuild Docker

**Inconvénients** :
- ⚠️ Nécessite Node.js et Python installés localement
- ⚠️ Configuration manuelle de l'environnement

#### **Étape 1 : Démarrer PostgreSQL avec Docker**

```powershell
# Depuis la racine du projet
docker compose -f docker-compose.yml --env-file .env.local up -d postgres
```

Attendre 5-10 secondes que la base de données soit prête.

#### **Étape 2 : Appliquer les Migrations**

```powershell
# Option A : Via Docker (si backend est en Docker)
docker compose exec backend alembic upgrade head

# Option B : Via Python local (si backend est en local)
cd backend
python -m alembic upgrade head
```

#### **Étape 3 : Démarrer le Backend en Mode Développement**

**Depuis WSL** (recommandé) :

```bash
cd /mnt/c/Users/mbenzaarit/Desktop/marwane/backend

# Activer l'environnement virtuel (si vous en avez un)
# source venv/bin/activate

# Installer les dépendances (si nécessaire)
# pip install -r requirements.txt

# Démarrer avec hot reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Depuis PowerShell** (si Python est installé sur Windows) :

```powershell
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Le backend sera accessible à : **`http://localhost:8000`**

#### **Étape 4 : Démarrer le Frontend en Mode Développement**

```powershell
cd frontend

# Installer les dépendances (si nécessaire)
# npm install

# Démarrer avec hot reload
npm run dev
```

Le frontend sera accessible à : **`http://localhost:5173`** (ou `http://localhost:3000` selon votre config Vite)

---

### Option 2 : Mode Docker (Similaire à la Production)

**Avantages** :
- ✅ Environnement identique à la production
- ✅ Pas besoin d'installer Node.js/Python localement
- ✅ Teste la configuration Docker

**Inconvénients** :
- ⚠️ Pas de hot reload (nécessite rebuild)
- ⚠️ Plus lent pour le développement itératif

#### **Démarrer tous les services**

```powershell
# Depuis la racine du projet
docker compose -f docker-compose.yml --env-file .env.local up --build
```

---

## 🧪 Test des Changements

### Checklist de Test Local

Avant de déployer en production, testez :

1. **✅ Fonctionnalités de base**
   - [ ] Connexion/Déconnexion
   - [ ] Navigation entre les pages
   - [ ] CRUD des entités (Clients, Fournisseurs, Produits, Transactions)

2. **✅ Responsive Mobile**
   - [ ] Ouvrir les DevTools (F12) → Mode mobile
   - [ ] Tester sur différentes tailles d'écran
   - [ ] Vérifier que les cartes mobiles s'affichent correctement
   - [ ] Vérifier qu'il n'y a pas de scroll horizontal

3. **✅ API et CORS**
   - [ ] Vérifier que les requêtes API fonctionnent
   - [ ] Vérifier la console du navigateur (pas d'erreurs CORS)
   - [ ] Tester avec différents navigateurs

4. **✅ Performance**
   - [ ] Vérifier les temps de chargement
   - [ ] Vérifier la pagination
   - [ ] Vérifier les filtres

### Test avec Docker (Simulation Production)

Pour tester exactement comme en production :

```powershell
# Arrêter les services locaux
# Ctrl+C dans les terminaux frontend/backend

# Démarrer avec Docker
docker compose -f docker-compose.yml --env-file .env.local up --build

# Tester sur http://localhost:3000
```

---

## 🚀 Déploiement en Production

### Prérequis

- ✅ Tous les tests locaux passent
- ✅ Code commité et pushé sur Git
- ✅ Accès SSH à la VM Azure

### Workflow de Déploiement

#### **Étape 1 : Commiter et Pousser les Changements**

```powershell
# Vérifier les changements
git status

# Ajouter les fichiers modifiés
git add .

# Commiter avec un message descriptif
git commit -m "feat: Ajout de la fonctionnalité X"

# Pousser vers le dépôt distant
git push origin main
```

#### **Étape 2 : Se Connecter à la VM Azure**

```powershell
# Récupérer l'IP publique
az vm show -d -g comptabilite-rg -n comptabilite-vm --query publicIps -o tsv

# Se connecter (remplacer VOTRE_IP)
ssh azureuser@VOTRE_IP
```

#### **Étape 3 : Mettre à Jour le Code sur la VM**

```bash
cd ~/marwane

# Récupérer les derniers changements
git pull origin main
```

#### **Étape 4 : Vérifier la Configuration Production**

```bash
# Vérifier que .env est configuré pour la production
cat .env | grep VITE_API_URL
# Doit afficher: VITE_API_URL=  (vide pour Nginx reverse proxy)

cat .env | grep CORS_ORIGINS
# Doit contenir votre domaine Azure: http://comptabilite.westeurope.cloudapp.azure.com
```

#### **Étape 5 : Rebuild et Redémarrer**

```bash
# Arrêter les conteneurs
docker compose down

# Rebuild les images (si nécessaire)
docker compose build --no-cache frontend
# ou rebuild tout: docker compose build --no-cache

# Démarrer les services
docker compose up -d

# Vérifier les logs
docker compose logs -f backend
docker compose logs -f frontend
```

#### **Étape 6 : Appliquer les Migrations (si nécessaire)**

```bash
# Si vous avez ajouté de nouvelles migrations
docker compose exec backend alembic upgrade head
```

#### **Étape 7 : Tester en Production**

Ouvrir : **`http://comptabilite.westeurope.cloudapp.azure.com`**

Vérifier :
- ✅ La page se charge
- ✅ Le login fonctionne
- ✅ Les fonctionnalités principales fonctionnent
- ✅ Pas d'erreurs dans la console du navigateur

---

## 🔄 Workflow Complet

### Scénario Typique : Ajouter une Nouvelle Fonctionnalité

```mermaid
graph TD
    A[Créer une branche Git] --> B[Développer localement]
    B --> C[Tester en local]
    C --> D{Les tests passent?}
    D -->|Non| B
    D -->|Oui| E[Commiter et pousser]
    E --> F[Se connecter à la VM]
    F --> G[Git pull sur la VM]
    G --> H[Rebuild Docker]
    H --> I[Tester en production]
    I --> J{Fonctionne?}
    J -->|Non| K[Debugger]
    K --> B
    J -->|Oui| L[✅ Terminé]
```

### Exemple Concret

**1. Créer une branche**

```powershell
git checkout -b feature/nouvelle-fonctionnalite
```

**2. Développer localement**

```powershell
# Démarrer PostgreSQL
docker compose up -d postgres

# Démarrer backend (WSL)
wsl bash -c "cd /mnt/c/Users/mbenzaarit/Desktop/marwane/backend && uvicorn app.main:app --reload"

# Démarrer frontend (PowerShell)
cd frontend
npm run dev
```

**3. Tester**

- Ouvrir `http://localhost:5173`
- Tester la nouvelle fonctionnalité
- Vérifier la console (pas d'erreurs)

**4. Commiter**

```powershell
git add .
git commit -m "feat: Ajout de la nouvelle fonctionnalité"
git push origin feature/nouvelle-fonctionnalite
```

**5. Merger dans main** (après review si nécessaire)

```powershell
git checkout main
git merge feature/nouvelle-fonctionnalite
git push origin main
```

**6. Déployer en production**

```bash
# Sur la VM
cd ~/marwane
git pull origin main
docker compose down
docker compose build --no-cache frontend
docker compose up -d
docker compose exec backend alembic upgrade head
```

**7. Tester en production**

Ouvrir `http://comptabilite.westeurope.cloudapp.azure.com` et vérifier.

---

## 🐛 Dépannage

### Problème : Les changements ne s'affichent pas en production

**Solutions** :

1. **Vérifier que le code est bien pushé**
   ```bash
   # Sur la VM
   git log -1  # Vérifier le dernier commit
   ```

2. **Forcer le rebuild du frontend**
   ```bash
   docker compose build --no-cache frontend
   docker compose up -d frontend
   ```

3. **Vider le cache du navigateur**
   - Ouvrir DevTools (F12)
   - Clic droit sur le bouton Refresh → "Vider le cache et actualiser"

### Problème : Erreurs CORS en production

**Solutions** :

1. **Vérifier CORS_ORIGINS dans .env**
   ```bash
   cat .env | grep CORS_ORIGINS
   # Doit contenir votre domaine Azure
   ```

2. **Redémarrer le backend**
   ```bash
   docker compose restart backend
   ```

3. **Vérifier les logs**
   ```bash
   docker compose logs backend | grep CORS
   ```

### Problème : La base de données est vide après déploiement

**Solutions** :

1. **Appliquer les migrations**
   ```bash
   docker compose exec backend alembic upgrade head
   ```

2. **Recréer l'utilisateur admin**
   ```bash
   docker compose exec backend python create_admin.py
   ```

### Problème : Le frontend utilise toujours localhost:8000

**Solutions** :

1. **Vérifier VITE_API_URL dans .env**
   ```bash
   cat .env | grep VITE_API_URL
   # Doit être vide pour la production: VITE_API_URL=
   ```

2. **Rebuild le frontend**
   ```bash
   docker compose build --no-cache frontend --build-arg VITE_API_URL=""
   docker compose up -d frontend
   ```

3. **Vérifier le code buildé**
   ```bash
   docker compose exec frontend cat /usr/share/nginx/html/assets/index-*.js | grep -o "baseURL:\"[^\"]*\""
   # Doit afficher: baseURL:"/api/v1"
   ```

---

## 📝 Notes Importantes

### Fichiers à NE JAMAIS Commiter

- `.env.local`
- `.env` (sauf `.env.example`)
- `backend/.env.local`
- `frontend/.env.local`
- `node_modules/`
- `__pycache__/`
- `.venv/`

### Variables d'Environnement Clés

| Variable | Local | Production |
|----------|-------|------------|
| `VITE_API_URL` | `http://localhost:8000` | `` (vide) |
| `CORS_ORIGINS` | `http://localhost:3000,http://localhost:5173` | `http://comptabilite.westeurope.cloudapp.azure.com` |
| `ENVIRONMENT` | `development` | `production` |
| `DEBUG` | `True` | `False` |

### Commandes Utiles

```powershell
# Voir les conteneurs en cours
docker ps

# Voir les logs
docker compose logs -f backend
docker compose logs -f frontend

# Arrêter tout
docker compose down

# Redémarrer un service
docker compose restart backend

# Entrer dans un conteneur
docker compose exec backend bash
docker compose exec frontend sh
```

---

## ✅ Checklist de Déploiement

Avant chaque déploiement en production :

- [ ] Tous les tests locaux passent
- [ ] Code commité et pushé
- [ ] `.env` configuré correctement pour la production
- [ ] Migrations à jour (si nécessaire)
- [ ] Documentation mise à jour (si nécessaire)
- [ ] Backup de la base de données (optionnel mais recommandé)

---

**🎉 Bon développement !**


