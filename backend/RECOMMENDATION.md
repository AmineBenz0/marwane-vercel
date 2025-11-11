# Recommandation pour la configuration des tests

## Situation actuelle

Problème de connexion réseau entre Windows et PostgreSQL dans Docker/WSL. Les tests ne peuvent pas se connecter de manière fiable.

## Solution recommandée : SQLite pour les tests, PostgreSQL pour l'application

### Avantages

1. ✅ **Tests instantanés** - Pas de dépendance Docker/réseau
2. ✅ **Portabilité** - Fonctionne sur toute machine sans configuration
3. ✅ **CI/CD simple** - Standard de l'industrie
4. ✅ **Développement rapide** - Pas de problèmes réseau à déboguer
5. ✅ **L'application utilise PostgreSQL** - Production avec toutes les fonctionnalités

### Implémentation

#### 1. Revenir à SQLite pour les tests

Restaurer `tests/conftest.py` à la version SQLite (déjà existante avant nos modifications).

#### 2. Marquer les tests spécifiques PostgreSQL

Pour les tests qui nécessitent PostgreSQL (vues matérialisées, triggers) :

```python
import pytest

# Marquer les tests PostgreSQL
@pytest.mark.postgresql
@pytest.mark.skipif(
    "sqlite" in str(engine.url),
    reason="Nécessite PostgreSQL"
)
def test_vue_materializee():
    # Test spécifique PostgreSQL
    pass
```

#### 3. Exécuter les tests

```bash
# Tests quotidiens (SQLite, rapides)
pytest tests/

# Tests PostgreSQL complets (quand nécessaire)
pytest tests/ -m postgresql --postgresql
```

### Configuration requise

- **Développement quotidien** : SQLite (aucune configuration)
- **Tests d'intégration complets** : Script WSL (`run_tests.ps1`)
- **Production** : PostgreSQL (déjà configuré)

## Alternatives

### Option 2 : Docker Desktop pour Windows

Si vous avez Docker Desktop :
1. Désinstaller PostgreSQL de WSL Docker
2. Installer avec Docker Desktop
3. Les ports sont automatiquement forwardés
4. Tout fonctionne sans configuration

**Coût** : Licence Docker Desktop (entreprise)

### Option 3 : PostgreSQL natif Windows

Installer PostgreSQL directement sur Windows :
1. Télécharger depuis postgresql.org
2. Installer sur port 5432
3. Créer la base `comptabilite_db`
4. Les tests fonctionnent immédiatement

**Coût** : ~200MB d'espace disque

## Décision

| Critère | SQLite (recommandé) | Docker Desktop | PostgreSQL Windows |
|---------|---------------------|----------------|-------------------|
| Vitesse développement | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Simplicité | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Tests PostgreSQL | ⭐⭐ (séparés) | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Portabilité | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Coût | Gratuit | Licence | Gratuit |

## Action immédiate recommandée

1. **Revenir à SQLite pour les tests** (configuration précédente)
2. **Garder PostgreSQL pour l'application** (production)
3. **Continuer le développement** sans bloquer sur les tests
4. **Marquer les tests PostgreSQL** pour les exécuter séparément si besoin

Cette approche suit les meilleures pratiques de l'industrie où la plupart des projets utilisent SQLite pour les tests unitaires et PostgreSQL en production.

