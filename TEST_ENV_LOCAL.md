# ✅ Test de l'Environnement Local

## 🔍 Vérification Rapide

### 1. Vérifier les Fichiers `.env.local`

Tes fichiers `.env.local` sont **✅ créés** et semblent corrects :

- ✅ `.env.local` (racine) - Configuré
- ✅ `backend/.env.local` - Configuré  
- ✅ `frontend/.env.local` - Configuré

### 2. Points à Vérifier

#### ⚠️ Problème Potentiel : `docker-compose.yml` n'utilise pas `.env.local`

Le fichier `docker-compose.yml` utilise les variables d'environnement, mais il faut lui dire d'utiliser `.env.local` en développement.

**Solution** : Utiliser `--env-file .env.local` ou créer un `docker-compose.override.yml`

---

## 🧪 Test Rapide

### Option 1 : Test Manuel (Recommandé pour développement)

```powershell
# 1. Démarrer PostgreSQL
docker compose -f docker-compose.yml --env-file .env.local up -d postgres

# 2. Attendre 10 secondes
Start-Sleep -Seconds 10

# 3. Vérifier que PostgreSQL tourne
docker ps

# 4. Démarrer le backend (dans un terminal WSL)
wsl bash -c "cd /mnt/c/Users/mbenzaarit/Desktop/marwane/backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

# 5. Démarrer le frontend (dans un autre terminal PowerShell)
cd frontend
npm run dev
```

**Résultat attendu** :
- ✅ PostgreSQL accessible sur `localhost:5432`
- ✅ Backend accessible sur `http://localhost:8000`
- ✅ Frontend accessible sur `http://localhost:5173`
- ✅ Pas d'erreurs CORS
- ✅ Le frontend peut se connecter au backend

---

### Option 2 : Test avec Docker (Simulation Production)

```powershell
# Démarrer tous les services avec Docker
docker compose -f docker-compose.yml --env-file .env.local up --build

# Tester sur http://localhost:3000
```

**Résultat attendu** :
- ✅ Tous les conteneurs démarrent
- ✅ Application accessible sur `http://localhost:3000`
- ✅ Pas d'erreurs dans les logs

---

## 🔧 Corrections Nécessaires

### Si le Backend ne peut pas se connecter à PostgreSQL

**Problème** : Le backend en mode dev (uvicorn) essaie de se connecter à `localhost:5432`, mais PostgreSQL est dans Docker.

**Solution** : Vérifier que le port 5432 est bien exposé :

```powershell
# Vérifier que PostgreSQL écoute sur le port 5432
docker compose -f docker-compose.yml --env-file .env.local ps postgres
```

Si le port n'est pas exposé, vérifier `docker-compose.yml` ligne 11 :
```yaml
ports:
  - "${POSTGRES_PORT:-5432}:5432"
```

### Si le Frontend ne peut pas se connecter au Backend

**Vérifier** :
1. Le backend tourne sur `http://localhost:8000`
2. `frontend/.env.local` contient : `VITE_API_URL=http://localhost:8000`
3. Pas d'erreurs CORS (vérifier `backend/.env.local` contient `http://localhost:5173`)

### Si les Migrations ne sont pas appliquées

```powershell
# Appliquer les migrations
docker compose -f docker-compose.yml --env-file .env.local exec backend alembic upgrade head

# Ou si backend est en local (WSL)
wsl bash -c "cd /mnt/c/Users/mbenzaarit/Desktop/marwane/backend && alembic upgrade head"
```

---

## ✅ Checklist de Vérification

- [ ] Docker Desktop est démarré
- [ ] PostgreSQL démarre avec `docker compose up -d postgres`
- [ ] Le backend démarre avec `uvicorn app.main:app --reload`
- [ ] Le frontend démarre avec `npm run dev`
- [ ] Pas d'erreurs dans les terminaux
- [ ] `http://localhost:5173` s'ouvre dans le navigateur
- [ ] `http://localhost:8000/docs` s'ouvre (API Swagger)
- [ ] Le login fonctionne (si admin créé)

---

## 🆘 Si ça ne marche pas

1. **Vérifier les logs** :
   ```powershell
   # Backend (dans le terminal uvicorn)
   # Frontend (dans le terminal npm run dev)
   # PostgreSQL
   docker compose logs postgres
   ```

2. **Vérifier les ports** :
   ```powershell
   # Vérifier quels ports sont utilisés
   netstat -ano | findstr :8000
   netstat -ano | findstr :5173
   netstat -ano | findstr :5432
   ```

3. **Redémarrer Docker Desktop** si nécessaire

---

## 💡 Configuration Recommandée

Pour éviter les problèmes, utilise cette configuration :

### `.env.local` (racine)
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

### `backend/.env.local`
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

### `frontend/.env.local`
```env
VITE_API_URL=http://localhost:8000
```

---

**🎯 Teste maintenant et dis-moi ce qui ne fonctionne pas !**





