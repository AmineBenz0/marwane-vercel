# Tests de Sécurité OWASP Top 10

Ce document décrit les tests de sécurité OWASP Top 10 implémentés pour l'application.

## Vue d'ensemble

Les tests de sécurité OWASP Top 10 vérifient que l'application est protégée contre les vulnérabilités les plus courantes selon l'OWASP Top 10 2021.

## Installation des dépendances

Pour exécuter tous les tests de sécurité, installez les outils d'audit suivants :

```bash
# Installer pip-audit pour l'audit des dépendances Python
pip install pip-audit

# Installer safety pour un audit supplémentaire
pip install safety
```

## Exécution des tests

### Configuration requise

**Important :** Pour que les tests d'authentification fonctionnent correctement, l'authentification doit être activée. 

Vous pouvez soit :
1. Configurer `ENABLE_AUTH=True` dans votre fichier `.env` ou variables d'environnement
2. Ou modifier temporairement `app/config.py` pour les tests

Les tests utilisent les endpoints admin (`/api/v1/users`) qui nécessitent toujours l'authentification via `get_current_user`, même si `ENABLE_AUTH=False` pour les autres endpoints.

### Tests OWASP uniquement

```bash
# Exécuter tous les tests OWASP
pytest tests/test_owasp_security.py -v

# Exécuter un test spécifique
pytest tests/test_owasp_security.py::TestOWASP1_Injection -v
```

### Audit des dépendances

```bash
# Exécuter l'audit des dépendances
python scripts/audit_dependencies.py
```

Cela génère un fichier `security_audit_dependencies.json` avec les résultats.

### Génération du rapport complet

```bash
# 1. Exécuter l'audit des dépendances
python scripts/audit_dependencies.py

# 2. Générer le rapport de sécurité complet
python scripts/generate_security_report.py
```

Le rapport sera généré dans `SECURITY_REPORT.md`.

## Catégories de tests

### 1. A03:2021 - Injection (SQL, NoSQL, Command, etc.)

- **Test SQL Injection dans les paramètres de requête**
  - Vérifie que les paramètres de requête sont protégés contre l'injection SQL
  - Teste plusieurs payloads d'injection SQL courants

- **Test SQL Injection dans les paramètres de chemin**
  - Vérifie que les paramètres de chemin sont protégés contre l'injection SQL

- **Test NoSQL Injection dans le body JSON**
  - Vérifie que les données JSON sont protégées contre l'injection NoSQL

### 2. A02:2021 - Broken Authentication

- **Test de tokens expirés**
  - Vérifie qu'un token expiré est rejeté

- **Test de tokens invalides**
  - Vérifie que les tokens invalides sont rejetés

- **Test de manipulation de tokens**
  - Vérifie qu'un token manipulé est rejeté

- **Test de refresh tokens**
  - Vérifie qu'un refresh token ne peut pas être utilisé comme access token

- **Test de mots de passe faibles**
  - Vérifie que les mots de passe faibles sont rejetés (si validation implémentée)

### 3. A01:2021 - Sensitive Data Exposure

- **Test d'exposition de mots de passe**
  - Vérifie que les mots de passe ne sont jamais retournés dans les réponses

- **Test d'exposition de hash de mots de passe**
  - Vérifie que les hash de mots de passe ne sont pas retournés dans les listes

- **Test d'exposition de clé secrète**
  - Vérifie que la clé secrète JWT n'est pas exposée dans les erreurs

### 4. A01:2021 - Broken Access Control

- **Test d'accès non-admin aux endpoints admin**
  - Vérifie qu'un utilisateur non-admin ne peut pas accéder aux endpoints admin

- **Test d'accès aux données d'autres utilisateurs**
  - Vérifie qu'un utilisateur ne peut pas accéder aux données d'un autre utilisateur

### 5. A05:2021 - Security Misconfiguration

- **Test d'exposition d'erreurs détaillées**
  - Vérifie que les erreurs détaillées ne sont pas exposées en production

- **Test de configuration CORS**
  - Vérifie que CORS est correctement configuré

- **Test de credentials par défaut**
  - Vérifie que les credentials par défaut ne sont pas utilisés

### 6. A03:2021 - XSS (Cross-Site Scripting)

- **Test XSS dans les champs texte**
  - Vérifie que les champs texte sont protégés contre XSS
  - Teste plusieurs payloads XSS courants

### 7. A08:2021 - Insecure Deserialization

- **Test de validation JSON**
  - Vérifie que la validation JSON est appliquée

- **Test de JSON malformés**
  - Vérifie que les JSON malformés sont rejetés

### 8. A06:2021 - Vulnerable and Outdated Components

- **Audit des dépendances**
  - Utilise pip-audit et safety pour détecter les vulnérabilités connues
  - Voir `scripts/audit_dependencies.py`

### 9. A09:2021 - Security Logging and Monitoring Failures

- **Test de logging des tentatives de connexion échouées**
  - Vérifie que les tentatives de connexion échouées sont enregistrées

- **Test de logging des tentatives de connexion réussies**
  - Vérifie que les tentatives de connexion réussies sont enregistrées

- **Test de logging des accès non autorisés**
  - Vérifie que les tentatives d'accès non autorisées sont détectées

### 10. A03:2021 - XXE (XML External Entities)

- **Test XXE non applicable**
  - Vérifie que XXE n'est pas applicable (pas de traitement XML)

## Critères d'acceptation

- ✅ Aucune vulnérabilité critique
- ✅ Vulnérabilités hautes corrigées ou justifiées
- ✅ Rapport de sécurité complet
- ✅ Dépendances à jour (pas de CVE connues)

## Notes importantes

1. **Environnement de développement vs production**
   - Certains tests peuvent se comporter différemment selon l'environnement
   - En développement, `DEBUG=True` peut exposer plus d'informations
   - En production, `DEBUG=False` et `ENABLE_AUTH=True` doivent être configurés

2. **Authentification**
   - Les tests supposent que l'authentification est activée (`ENABLE_AUTH=True`)
   - En développement, l'authentification peut être désactivée pour faciliter les tests

3. **Rate Limiting**
   - Le rate limiting peut affecter certains tests
   - Il est recommandé de désactiver le rate limiting en développement (`ENABLE_RATE_LIMITING=False`)

## Maintenance

- Exécuter les tests régulièrement (idéalement dans CI/CD)
- Mettre à jour les payloads de test selon les nouvelles vulnérabilités découvertes
- Maintenir les dépendances à jour
- Exécuter l'audit des dépendances avant chaque déploiement

## Références

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [pip-audit Documentation](https://pypi.org/project/pip-audit/)
- [safety Documentation](https://pypi.org/project/safety/)

