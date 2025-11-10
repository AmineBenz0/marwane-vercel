# 🚀 Guide de Démarrage Rapide

## Phase 0 : Configuration Initiale

### ✅ Étape 1 : Vérification des Outils

Vérifiez que les outils suivants sont installés :

```bash
# Python
python --version  # Doit être 3.10+

# Node.js
node --version    # Doit être LTS

# Docker (sur WSL)
docker --version
```

### ✅ Étape 2 : Configuration de l'Environnement

1. **Créer le fichier `.env`** à partir du template :
   ```bash
   cp .env.example .env
   ```

2. **Modifier le fichier `.env`** avec vos valeurs :
   - Changez `POSTGRES_PASSWORD` par un mot de passe sécurisé
   - Changez `SECRET_KEY` par une clé secrète aléatoire (minimum 32 caractères)

### ✅ Étape 3 : Démarrer PostgreSQL

**Sur Windows (PowerShell) :**
```powershell
.\scripts.ps1 start
```

**Sur WSL/Linux :**
```bash
chmod +x scripts.sh
./scripts.sh start
```

**Ou directement avec Docker Compose :**
```bash
docker-compose up -d postgres
```

### ✅ Étape 4 : Vérifier la Connexion

**Vérifier que PostgreSQL est démarré :**
```bash
docker-compose ps
```

**Tester la connexion (optionnel) :**
```bash
# Si vous avez psql installé
psql -h localhost -U comptabilite_user -d comptabilite_db
```

### 📝 Commandes Utiles

**Arrêter PostgreSQL :**
```bash
# PowerShell
.\scripts.ps1 stop

# WSL/Linux
./scripts.sh stop
```

**Voir les logs :**
```bash
# PowerShell
.\scripts.ps1 logs

# WSL/Linux
./scripts.sh logs
```

**Redémarrer PostgreSQL :**
```bash
# PowerShell
.\scripts.ps1 restart

# WSL/Linux
./scripts.sh restart
```

**Voir l'état :**
```bash
# PowerShell
.\scripts.ps1 status

# WSL/Linux
./scripts.sh status
```

## ⚠️ Notes Importantes

1. **Docker sur WSL** : Si vous utilisez Docker sur WSL, assurez-vous que Docker Desktop est démarré et que WSL 2 est activé.

2. **Port 5432** : Vérifiez que le port 5432 n'est pas déjà utilisé par une autre instance PostgreSQL.

3. **Variables d'environnement** : Le fichier `.env` ne doit **JAMAIS** être commité dans Git (déjà dans `.gitignore`).

4. **Persistance des données** : Les données PostgreSQL sont stockées dans un volume Docker nommé `postgres_data` et persistent même après l'arrêt du conteneur.

## 🔄 Prochaines Étapes

Une fois PostgreSQL démarré, vous pouvez passer à la **Phase 1** : Développement du Backend.

Consultez le [BACKLOG.md](./BACKLOG.md) pour la suite du développement.

