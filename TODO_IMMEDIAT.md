# ✅ Tâches Immédiates à Faire

## 🔴 URGENT - Production (À faire maintenant)

### 1. Corriger la Base de Données en Production

**Problème** : La base de données est vide après `docker compose down -v`, causant l'erreur `relation "utilisateurs" does not exist`.

**Actions** :

```bash
# Se connecter à la VM Azure
ssh azureuser@VOTRE_IP

# Appliquer les migrations Alembic
cd ~/marwane
docker compose exec backend alembic upgrade head

# Vérifier que les tables sont créées
docker compose exec postgres psql -U comptabilite_user -d comptabilite_db -c "\dt"

# Recréer l'utilisateur admin
docker compose exec backend python create_admin.py
# Email: marwane@email.com
# Nom: Marwane
# Mot de passe: (celui que tu veux)
```

**Vérification** :
- [ ] Les migrations sont appliquées
- [ ] Les tables existent dans la base de données
- [ ] L'utilisateur admin est créé
- [ ] Le login fonctionne sur `http://comptabilite.westeurope.cloudapp.azure.com`

---

## 🟡 IMPORTANT - Configuration Locale (À faire pour développer)

### 2. Créer les Fichiers `.env.local` pour le Développement

**Actions** :

```powershell
# Depuis la racine du projet
cp .env.example .env.local
cp backend/.env.example backend/.env.local
cp frontend/.env.example frontend/.env.local
```

**Puis éditer les fichiers** :

#### `.env.local` (racine)
```env
POSTGRES_DB=comptabilite_db
POSTGRES_USER=comptabilite_user
POSTGRES_PASSWORD=dev_password_123
POSTGRES_PORT=5432
SECRET_KEY=dev-secret-key-change-in-production
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
ENVIRONMENT=development
DEBUG=True
ENABLE_AUTH=True
ENABLE_RATE_LIMITING=False
VITE_API_URL=http://localhost:8000
```

#### `backend/.env.local`
```env
DATABASE_URL=postgresql://comptabilite_user:dev_password_123@localhost:5432/comptabilite_db
POSTGRES_DB=comptabilite_db
POSTGRES_USER=comptabilite_user
POSTGRES_PASSWORD=dev_password_123
SECRET_KEY=dev-secret-key-change-in-production
ENVIRONMENT=development
DEBUG=True
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

#### `frontend/.env.local`
```env
VITE_API_URL=http://localhost:8000
```

**Vérification** :
- [ ] Les fichiers `.env.local` sont créés
- [ ] Les valeurs sont configurées correctement
- [ ] Les fichiers sont dans `.gitignore` (déjà fait)

---

## 🟢 RECOMMANDÉ - Tests et Vérifications

### 3. Tester le Workflow de Développement Local

**Actions** :

```powershell
# 1. Démarrer PostgreSQL
.\scripts\dev-start.ps1

# 2. Dans un terminal WSL : Démarrer le backend
wsl bash -c "cd /mnt/c/Users/mbenzaarit/Desktop/marwane/backend && uvicorn app.main:app --reload"

# 3. Dans un autre terminal PowerShell : Démarrer le frontend
cd frontend
npm run dev

# 4. Tester l'application
# Ouvrir http://localhost:5173
```

**Vérification** :
- [ ] PostgreSQL démarre correctement
- [ ] Le backend démarre sans erreurs
- [ ] Le frontend démarre sans erreurs
- [ ] L'application se charge dans le navigateur
- [ ] Le login fonctionne
- [ ] Les pages principales fonctionnent

---

### 4. Tester le Script de Déploiement

**Actions** :

```powershell
# Tester le script de déploiement (sans vraiment déployer)
# Vérifier qu'il détecte correctement l'IP de la VM
.\scripts\deploy-to-production.ps1
```

**Vérification** :
- [ ] Le script détecte l'IP de la VM
- [ ] Le script vérifie les changements Git
- [ ] Le script propose de pousser vers Git

---

## 📋 Checklist Complète

### Production
- [ ] ✅ Migrations Alembic appliquées
- [ ] ✅ Tables créées dans la base de données
- [ ] ✅ Utilisateur admin créé
- [ ] ✅ Login fonctionne en production
- [ ] ✅ Application accessible sur `http://comptabilite.westeurope.cloudapp.azure.com`

### Développement Local
- [ ] ✅ Fichiers `.env.local` créés
- [ ] ✅ PostgreSQL démarre avec Docker
- [ ] ✅ Backend démarre en mode développement
- [ ] ✅ Frontend démarre en mode développement
- [ ] ✅ Application fonctionne localement
- [ ] ✅ Hot reload fonctionne (changements visibles immédiatement)

### Documentation
- [ ] ✅ `DEVELOPMENT_WORKFLOW.md` lu et compris
- [ ] ✅ `QUICK_DEV_GUIDE.md` consulté
- [ ] ✅ Scripts PowerShell testés

---

## 🎯 Prochaines Étapes (Après les Tâches Immédiates)

Une fois les tâches immédiates terminées, tu peux :

1. **Continuer le développement** selon le backlog
2. **Ajouter de nouvelles fonctionnalités** en suivant le workflow
3. **Tester les nouvelles fonctionnalités** localement avant de déployer
4. **Déployer régulièrement** avec le script automatique

---

## 🆘 Si tu rencontres des Problèmes

Consulte :
- **`DEVELOPMENT_WORKFLOW.md`** → Section "Dépannage"
- **`QUICK_DEV_GUIDE.md`** → Section "Problèmes Courants"

Ou vérifie les logs :
```bash
# Production
docker compose logs -f backend
docker compose logs -f frontend

# Local
# Voir les terminaux où tournent uvicorn et npm run dev
```

---

**💡 Astuce** : Commence par la tâche URGENT (corriger la base de données en production), puis configure ton environnement local pour développer.





