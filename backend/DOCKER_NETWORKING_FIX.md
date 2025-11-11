# Fix pour les problèmes réseau Docker Desktop sur Windows

## Problème

Sur Windows avec Docker Desktop (WSL2), la connexion depuis Windows vers les conteneurs PostgreSQL peut être instable :
- Le conteneur redémarre fréquemment
- La connexion via `127.0.0.1` ou `localhost` est refusée
- Le port 5432 semble exposé mais n'est pas accessible

## Solutions

### Solution 1 : Exécuter depuis WSL (Recommandé)

C'est la méthode la plus fiable car WSL a un accès réseau direct aux conteneurs Docker.

```bash
# Ouvrir WSL
wsl

# Aller dans le répertoire du projet
cd /mnt/c/Users/mbenzaarit/Desktop/marwane/backend

# Vérifier/démarrer PostgreSQL
cd ..
docker compose up -d postgres
cd backend

# Attendre que PostgreSQL soit prêt
sleep 5

# Démarrer le serveur
uvicorn app.main:app --reload --host 0.0.0.0
```

Avantages :
- ✅ Connexion stable et rapide
- ✅ Pas de problèmes de port forwarding
- ✅ Meilleure performance

### Solution 2 : Utiliser le script PowerShell

Le script `start_server.ps1` a été créé pour simplifier le démarrage depuis Windows.

```powershell
cd backend
.\start_server.ps1
```

Ce script :
- Vérifie si PostgreSQL est actif
- Propose de le démarrer si nécessaire
- Lance le serveur FastAPI avec des messages informatifs

### Solution 3 : Démarrage manuel avec gestion d'erreur

```powershell
# Depuis le répertoire backend
cd backend

# Démarrer PostgreSQL (depuis le répertoire parent)
cd ..; wsl docker compose up -d postgres; cd backend

# Attendre que PostgreSQL soit prêt
Start-Sleep -Seconds 10

# Démarrer le serveur
uvicorn app.main:app --reload
```

Le serveur démarrera même si PostgreSQL n'est pas disponible grâce à la gestion d'erreur implémentée dans `app/main.py`.

## Diagnostic

### Vérifier le statut de PostgreSQL

```powershell
wsl docker ps --filter "name=comptabilite_postgres"
```

Le statut devrait être `Up XX seconds (healthy)` et **PAS** `health: starting`.

### Vérifier les logs PostgreSQL

```powershell
wsl docker logs comptabilite_postgres --tail 20
```

Recherchez :
- ✅ `database system is ready to accept connections` (bon)
- ❌ `database system was not properly shut down` (problème)

### Tester la connexion

```powershell
cd backend
python test_connection.py
```

Cela teste :
1. Connexion directe via psycopg2
2. Connexion via SQLAlchemy (comme l'app)
3. Health check de l'API FastAPI

## Redémarrage propre de PostgreSQL

Si PostgreSQL est dans un état instable :

```powershell
# Arrêter complètement
wsl docker stop comptabilite_postgres

# Optionnel : Supprimer et recréer (⚠️ perd les données)
# wsl docker rm comptabilite_postgres
# cd ..
# wsl docker compose up -d postgres
# cd backend

# Ou simplement redémarrer
wsl docker start comptabilite_postgres

# Attendre 10 secondes
Start-Sleep -Seconds 10
```

## Comportement actuel de l'application

L'application a été modifiée pour démarrer **même si PostgreSQL n'est pas disponible** :

- ✅ Le serveur FastAPI démarre toujours
- ⚠️ Un warning est affiché si la DB n'est pas accessible
- ❌ Les routes utilisant la DB échoueront jusqu'à ce que PostgreSQL soit disponible
- 🔄 Une fois PostgreSQL démarré, l'application peut s'y connecter automatiquement (grâce à `pool_pre_ping=True`)

Vous verrez ce message au démarrage si PostgreSQL n'est pas disponible :

```
WARNING - Failed to connect to database during startup: ...
The application will start, but database operations will fail until the database is available.
Make sure PostgreSQL is running (e.g., 'docker-compose up -d postgres').
```

## Alternatives

Si les problèmes persistent :

1. **Redémarrer Docker Desktop** : Souvent résout les problèmes de port forwarding
2. **Utiliser un PostgreSQL natif Windows** : Installer PostgreSQL directement sur Windows au lieu de Docker
3. **Configurer des ports alternatifs** : Utiliser un autre port que 5432 si conflit

## Fichiers modifiés pour la résilience

- `backend/app/main.py` : Startup event avec try/except
- `backend/test_connection.py` : Test multi-hôtes (127.0.0.1, localhost)
- `backend/start_server.ps1` : Script de démarrage simplifié (nouveau)

