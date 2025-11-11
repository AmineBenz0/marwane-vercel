# Guide d'exécution des tests

## Prérequis

1. **PostgreSQL doit être démarré** via Docker :
   ```bash
   # Depuis Windows PowerShell
   wsl docker-compose up -d postgres
   
   # Ou depuis WSL directement
   docker-compose up -d postgres
   ```

2. **Les migrations Alembic doivent être appliquées** :
   ```bash
   # Depuis WSL
   cd /mnt/c/users/mbenzaarit/desktop/marwane/backend
   alembic upgrade head
   ```

## Exécution des tests

### Option 1 : Depuis Windows PowerShell (recommandé)

```powershell
cd backend
.\run_tests.ps1
```

Ce script :
- Vérifie que PostgreSQL est démarré
- Applique les migrations si nécessaire
- Lance tous les tests

### Option 2 : Depuis WSL directement

```bash
# Se connecter à WSL
wsl

# Aller dans le répertoire backend
cd /mnt/c/users/mbenzaarit/desktop/marwane/backend

# Exécuter le script
chmod +x run_tests_wsl.sh
./run_tests_wsl.sh
```

### Option 3 : Exécution manuelle

```bash
# Depuis WSL
cd /mnt/c/users/mbenzaarit/desktop/marwane/backend

# Vérifier que PostgreSQL est accessible
python -c "import psycopg2; conn = psycopg2.connect('postgresql://comptabilite_user:change_me_in_production@localhost:5432/comptabilite_db'); conn.close(); print('OK')"

# Appliquer les migrations
alembic upgrade head

# Lancer les tests
python -m pytest tests/ -v
```

## Dépannage

### Problème : "Connection refused"

Si vous obtenez une erreur de connexion :

1. **Vérifier que le conteneur est démarré** :
   ```bash
   wsl docker ps | grep postgres
   ```

2. **Vérifier que le port est exposé** :
   ```bash
   wsl docker port comptabilite_postgres
   ```
   Devrait afficher : `5432/tcp -> 0.0.0.0:5432`

3. **Redémarrer le conteneur** :
   ```bash
   wsl docker restart comptabilite_postgres
   ```

4. **Vérifier les logs du conteneur** :
   ```bash
   wsl docker logs comptabilite_postgres
   ```

### Problème : "Multiple head revisions"

Si Alembic signale plusieurs branches :

```bash
# Appliquer les deux branches
alembic upgrade 002_add_est_actif
alembic upgrade 476f961e2737
```

### Problème : Tests échouent avec des erreurs de base de données

Assurez-vous que :
- Les migrations sont appliquées : `alembic current`
- La base de données existe : `psql -h localhost -U comptabilite_user -d comptabilite_db -c "\dt"`

## Configuration

Les tests utilisent PostgreSQL directement (pas SQLite) pour supporter toutes les fonctionnalités PostgreSQL :
- Vues matérialisées
- Triggers
- Contraintes CHECK
- Fonctions PostgreSQL

La configuration se trouve dans `tests/conftest.py`.

