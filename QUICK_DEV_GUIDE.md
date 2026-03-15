# ⚡ Guide Rapide de Développement

## 🎯 Développement Local (Recommandé)

### 1. Configuration Initiale (Une seule fois)

```powershell
# Créer les fichiers .env.local
cp .env.example .env.local
cp backend/.env.example backend/.env.local
cp frontend/.env.example frontend/.env.local
```

### 2. Démarrer l'Environnement

**Option A : Script Automatique**
```powershell
.\scripts\dev-start.ps1
```

**Option B : Manuel**

```powershell
# Terminal 1 : PostgreSQL
docker compose up -d postgres

# Terminal 2 : Backend (WSL)
wsl bash -c "cd /mnt/c/Users/mbenzaarit/Desktop/marwane/backend && uvicorn app.main:app --reload"

# Terminal 3 : Frontend (PowerShell)
cd frontend
npm run dev
```

### 3. Accéder à l'Application

- **Frontend** : http://localhost:5173
- **Backend API** : http://localhost:8000
- **API Docs** : http://localhost:8000/docs

---

## 🚀 Déploiement en Production

### Méthode 1 : Script Automatique

```powershell
.\scripts\deploy-to-production.ps1
```

### Méthode 2 : Manuel

```powershell
# 1. Commiter et pousser
git add .
git commit -m "feat: Ma nouvelle fonctionnalité"
git push origin main

# 2. Se connecter à la VM
ssh azureuser@VOTRE_IP

# 3. Sur la VM
cd ~/marwane
git pull origin main
docker compose down
docker compose build --no-cache frontend
docker compose up -d
docker compose exec backend alembic upgrade head
```

---

## 📋 Checklist Avant Déploiement

- [ ] Tests locaux passent
- [ ] Code commité et pushé
- [ ] `.env` configuré pour production (sur la VM)
- [ ] Migrations à jour

---

## 🔍 Vérifications Rapides

### Local
```powershell
# Vérifier que PostgreSQL tourne
docker ps

# Vérifier les logs backend
# (dans le terminal où uvicorn tourne)

# Vérifier les logs frontend
# (dans le terminal où npm run dev tourne)
```

### Production
```bash
# Vérifier les conteneurs
docker ps

# Voir les logs
docker compose logs -f backend
docker compose logs -f frontend

# Vérifier la base de données
docker compose exec backend alembic current
```

---

## 📚 Documentation Complète

Pour plus de détails, voir : **[DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)**

---

## 🆘 Problèmes Courants

### Le frontend ne se connecte pas au backend

**Solution** : Vérifier que `VITE_API_URL=http://localhost:8000` dans `frontend/.env.local`

### Erreurs CORS

**Solution** : Vérifier que `CORS_ORIGINS` dans `backend/.env.local` contient `http://localhost:5173`

### La base de données est vide

**Solution** :
```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python create_admin.py
```

---

**💡 Astuce** : Utilisez les scripts dans `scripts/` pour automatiser les tâches répétitives !


