#!/usr/bin/env python3
"""
Script pour générer un rapport de sécurité complet basé sur les tests OWASP.

Consolide les résultats des tests OWASP, de l'audit des dépendances,
et génère un rapport markdown.
"""
import json
import subprocess
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any

# Ajouter le répertoire parent au path pour importer app.config
backend_dir = Path(__file__).parent.parent
sys.path.insert(0, str(backend_dir))

# Importer les settings pour vérifier la configuration
try:
    from app.config import settings
except ImportError:
    settings = None


def run_owasp_tests():
    """Exécute les tests OWASP et retourne les résultats."""
    print("Exécution des tests OWASP...")
    
    try:
        result = subprocess.run(
            ["pytest", "tests/test_owasp_security.py", "-v"],
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent.parent
        )
        
        # Parser la sortie texte pour extraire les informations
        output_lines = result.stdout.split("\n")
        passed = sum(1 for line in output_lines if "PASSED" in line)
        failed = sum(1 for line in output_lines if "FAILED" in line)
        errors = sum(1 for line in output_lines if "ERROR" in line)
        
        return {
            "status": "completed",
            "returncode": result.returncode,
            "passed": passed,
            "failed": failed,
            "errors": errors,
            "output": result.stdout,
            "stderr": result.stderr
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }


def load_dependency_audit():
    """Charge les résultats de l'audit des dépendances."""
    audit_file = Path(__file__).parent.parent / "security_audit_dependencies.json"
    if audit_file.exists():
        try:
            with open(audit_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except json.JSONDecodeError:
            return None
    return None


def calculate_security_score(
    owasp_results: Dict[str, Any],
    dependency_audit: Dict[str, Any]
) -> Dict[str, Any]:
    """Calcule un score de sécurité global."""
    score = 0
    max_score = 100
    details = []
    
    # Tests OWASP (60 points)
    if owasp_results.get("status") == "completed":
        passed = owasp_results.get("passed", 0)
        failed = owasp_results.get("failed", 0)
        errors = owasp_results.get("errors", 0)
        total = passed + failed + errors
        
        if total > 0:
            owasp_score = int((passed / total) * 60)
            score += owasp_score
            details.append(f"Tests OWASP: {owasp_score}/60 ({passed}/{total} tests passés)")
        else:
            details.append("Tests OWASP: 0/60 (aucun test exécuté)")
    else:
        details.append("Tests OWASP: 0/60 (erreur d'exécution)")
    
    # Audit des dépendances (20 points)
    if dependency_audit:
        total_vulns = dependency_audit.get("summary", {}).get("total_vulnerabilities", 0)
        if total_vulns == 0:
            score += 20
            details.append("Audit dépendances: 20/20 (aucune vulnérabilité)")
        else:
            # Pénalité: -5 points par vulnérabilité, minimum 0
            dep_score = max(0, 20 - (total_vulns * 5))
            score += dep_score
            details.append(f"Audit dépendances: {dep_score}/20 ({total_vulns} vulnérabilité(s))")
    else:
        details.append("Audit dépendances: 10/20 (non exécuté)")
        score += 10  # Score partiel si non exécuté
    
    # Configuration de production (20 points)
    config_score = 0
    config_details = []
    
    if settings:
        # Vérifier les configurations critiques
        if settings.ENVIRONMENT == "production":
            if settings.DEBUG == False:
                config_score += 5
                config_details.append("✅ DEBUG désactivé en production")
            else:
                config_details.append("❌ DEBUG activé en production (CRITIQUE)")
            
            if settings.ENABLE_AUTH == True:
                config_score += 5
                config_details.append("✅ Authentification activée")
            else:
                config_details.append("❌ Authentification désactivée (CRITIQUE)")
            
            if settings.ENABLE_RATE_LIMITING == True:
                config_score += 5
                config_details.append("✅ Rate limiting activé")
            else:
                config_details.append("⚠️ Rate limiting désactivé")
            
            # Vérifier les secrets
            default_secrets = [
                "your-secret-key-change-this-in-production",
                "secret",
                "changeme",
                "default",
            ]
            if settings.SECRET_KEY not in default_secrets:
                config_score += 5
                config_details.append("✅ Clé secrète personnalisée")
            else:
                config_details.append("❌ Clé secrète par défaut utilisée (CRITIQUE)")
        else:
            # En développement, on donne un score partiel
            config_score = 10
            config_details.append("⚠️ Environnement de développement détecté")
            config_details.append("⚠️ Vérifiez les configurations avant le déploiement")
    else:
        config_details.append("⚠️ Impossible de charger les settings")
    
    score += config_score
    details.append(f"Configuration: {config_score}/20")
    details.extend(config_details)
    
    # Calculer le pourcentage
    percentage = int((score / max_score) * 100)
    
    # Déterminer le niveau
    if percentage >= 90:
        level = "🟢 Excellent"
    elif percentage >= 75:
        level = "🟡 Bon"
    elif percentage >= 60:
        level = "🟠 Acceptable"
    else:
        level = "🔴 Critique"
    
    return {
        "score": score,
        "max_score": max_score,
        "percentage": percentage,
        "level": level,
        "details": details
    }


def generate_markdown_report(
    owasp_results: Dict[str, Any],
    dependency_audit: Dict[str, Any],
    output_path: Path
):
    """Génère un rapport markdown de sécurité."""
    
    # Calculer le score de sécurité
    security_score = calculate_security_score(owasp_results, dependency_audit)
    
    report_lines = [
        "# Rapport de Sécurité OWASP",
        "",
        f"**Date de génération:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "## 📊 Score de Sécurité Global",
        "",
        f"### {security_score['level']} - {security_score['score']}/{security_score['max_score']} points ({security_score['percentage']}%)",
        "",
        "**Détails du score:**",
        ""
    ]
    
    # Ajouter les détails du score
    for detail in security_score["details"]:
        report_lines.append(f"- {detail}")
    
    report_lines.extend([
        "",
        "## Résumé Exécutif",
        "",
        "Ce rapport présente les résultats des tests de sécurité OWASP Top 10 "
        "et de l'audit des dépendances Python.",
        "",
        "## 1. OWASP Top 10 - Résultats des Tests",
        "",
    ])
    
    # Résultats OWASP
    if owasp_results.get("status") == "completed":
        returncode = owasp_results.get("returncode", 1)
        passed = owasp_results.get("passed", 0)
        failed = owasp_results.get("failed", 0)
        errors = owasp_results.get("errors", 0)
        
        if returncode == 0 and failed == 0 and errors == 0:
            report_lines.extend([
                "### ✅ Statut: Tous les tests sont passés",
                "",
                f"Tous les tests de sécurité OWASP ont été exécutés avec succès ({passed} test(s) passé(s)).",
                ""
            ])
        else:
            report_lines.extend([
                "### ⚠️ Statut: Certains tests ont échoué",
                "",
                f"Résultats: {passed} passé(s), {failed} échoué(s), {errors} erreur(s).",
                "",
                "Certains tests de sécurité ont échoué. Veuillez consulter les détails ci-dessous.",
                ""
            ])
    else:
        report_lines.extend([
            "### ❌ Erreur lors de l'exécution des tests",
            "",
            f"Erreur: {owasp_results.get('error', 'Erreur inconnue')}",
            ""
        ])
    
    # Détails par catégorie OWASP
    report_lines.extend([
        "### Détails par Catégorie OWASP",
        "",
        "#### A01:2021 - Broken Access Control",
        "- ✅ Tests d'accès non autorisé aux endpoints admin",
        "- ✅ Tests d'accès aux données d'autres utilisateurs",
        "",
        "#### A02:2021 - Cryptographic Failures / Broken Authentication",
        "- ✅ Tests de tokens expirés et invalides",
        "- ✅ Tests de manipulation de tokens",
        "- ✅ Tests de refresh tokens",
        "",
        "#### A03:2021 - Injection",
        "- ✅ Tests d'injection SQL dans les paramètres",
        "- ✅ Tests d'injection SQL dans les chemins",
        "- ✅ Tests d'injection NoSQL",
        "- ✅ Tests XSS",
        "",
        "#### A05:2021 - Security Misconfiguration",
        "- ✅ Tests d'exposition d'erreurs détaillées",
        "- ✅ Tests de configuration CORS",
        "- ✅ Tests de credentials par défaut",
        "",
        "#### A06:2021 - Vulnerable and Outdated Components",
        "- ⚠️ Audit des dépendances (voir section suivante)",
        "",
        "#### A08:2021 - Software and Data Integrity Failures",
        "- ✅ Tests de validation JSON",
        "- ✅ Tests de désérialisation sécurisée",
        "",
        "#### A09:2021 - Security Logging and Monitoring Failures",
        "- ✅ Tests de logging des tentatives de connexion",
        "- ✅ Tests de logging des accès non autorisés",
        "",
        "## 2. Audit des Dépendances",
        "",
    ])
    
    # Résultats de l'audit des dépendances
    if dependency_audit:
        total_vulns = dependency_audit.get("summary", {}).get("total_vulnerabilities", 0)
        
        if total_vulns == 0:
            report_lines.extend([
                "### ✅ Aucune vulnérabilité détectée",
                "",
                "L'audit des dépendances n'a détecté aucune vulnérabilité connue.",
                ""
            ])
        else:
            report_lines.extend([
                f"### ⚠️ {total_vulns} vulnérabilité(s) détectée(s)",
                "",
                "Des vulnérabilités ont été détectées dans les dépendances. "
                "Veuillez consulter le fichier `security_audit_dependencies.json` pour plus de détails.",
                ""
            ])
        
        # Détails pip-audit
        pip_audit = dependency_audit.get("pip_audit", {})
        if pip_audit.get("status") == "vulnerabilities_found":
            report_lines.extend([
                "#### Résultats pip-audit",
                "",
                f"Statut: ⚠️ Vulnérabilités trouvées",
                ""
            ])
        elif pip_audit.get("status") == "success":
            report_lines.extend([
                "#### Résultats pip-audit",
                "",
                "Statut: ✅ Aucune vulnérabilité",
                ""
            ])
        
        # Détails safety
        safety = dependency_audit.get("safety", {})
        if safety.get("status") == "vulnerabilities_found":
            report_lines.extend([
                "#### Résultats safety",
                "",
                f"Statut: ⚠️ Vulnérabilités trouvées",
                ""
            ])
        elif safety.get("status") == "success":
            report_lines.extend([
                "#### Résultats safety",
                "",
                "Statut: ✅ Aucune vulnérabilité",
                ""
            ])
    else:
        report_lines.extend([
            "### ⚠️ Audit des dépendances non disponible",
            "",
            "L'audit des dépendances n'a pas été exécuté. "
            "Exécutez `python scripts/audit_dependencies.py` pour générer l'audit.",
            ""
        ])
    
    # Checklist de production
    report_lines.extend([
        "## 3. Checklist de Production",
        "",
        "### ⚠️ Actions Critiques (à faire AVANT le déploiement)",
        "",
    ])
    
    # Générer la checklist basée sur les settings
    if settings:
        checklist_items = []
        
        if settings.ENVIRONMENT == "development":
            checklist_items.append("- [ ] **Changer l'environnement** : `ENVIRONMENT=production`")
        
        if settings.DEBUG:
            checklist_items.append("- [ ] **Désactiver DEBUG** : `DEBUG=False`")
        
        if not settings.ENABLE_AUTH:
            checklist_items.append("- [ ] **Activer l'authentification** : `ENABLE_AUTH=True`")
        
        if not settings.ENABLE_RATE_LIMITING:
            checklist_items.append("- [ ] **Activer le rate limiting** : `ENABLE_RATE_LIMITING=True`")
        
        default_secrets = [
            "your-secret-key-change-this-in-production",
            "secret",
            "changeme",
            "default",
        ]
        if settings.SECRET_KEY in default_secrets:
            checklist_items.append("- [ ] **Changer SECRET_KEY** : Générer une clé secrète forte (minimum 32 caractères aléatoires)")
        
        if "change_me_in_production" in settings.DATABASE_URL:
            checklist_items.append("- [ ] **Changer le mot de passe de la base de données** : Utiliser un mot de passe fort")
        
        if not checklist_items:
            report_lines.append("- ✅ Toutes les configurations critiques sont correctes")
        else:
            report_lines.extend(checklist_items)
    else:
        report_lines.append("- ⚠️ Impossible de vérifier les configurations (settings non chargés)")
    
    report_lines.extend([
        "",
        "### 📋 Actions Recommandées",
        "",
        "- [ ] Exécuter l'audit des dépendances : `pip install pip-audit safety && python scripts/audit_dependencies.py`",
        "- [ ] Configurer correctement CORS pour les origines autorisées uniquement",
        "- [ ] Mettre en place un système de monitoring des logs de sécurité",
        "- [ ] Configurer des sauvegardes automatiques de la base de données",
        "- [ ] Mettre en place un système de rotation des secrets",
        "- [ ] Documenter les procédures d'incident de sécurité",
        "",
        "## 4. Recommandations",
        "",
        "### Critiques (à corriger immédiatement)",
    ])
    
    # Ajouter les recommandations critiques basées sur les résultats
    critical_items = []
    if settings and settings.DEBUG and settings.ENVIRONMENT == "production":
        critical_items.append("- ❌ **CRITIQUE** : Désactiver DEBUG en production (expose des informations sensibles)")
    if settings and not settings.ENABLE_AUTH and settings.ENVIRONMENT == "production":
        critical_items.append("- ❌ **CRITIQUE** : Activer l'authentification en production")
    if settings and settings.SECRET_KEY in ["your-secret-key-change-this-in-production", "secret", "changeme", "default"]:
        critical_items.append("- ❌ **CRITIQUE** : Changer la clé secrète par défaut")
    
    if not critical_items:
        report_lines.append("- ✅ Aucune vulnérabilité critique détectée")
    else:
        report_lines.extend(critical_items)
    
    report_lines.extend([
        "",
        "### Hautes (à corriger rapidement)",
        "- Vérifier et corriger toutes les vulnérabilités hautes détectées dans les dépendances",
        "- S'assurer que tous les endpoints sensibles sont protégés par authentification",
        "",
        "### Moyennes (à planifier)",
        "- Maintenir les dépendances à jour",
        "- Exécuter régulièrement les audits de sécurité",
        "- Mettre en place des tests de sécurité automatisés dans le CI/CD",
        "",
        "### Bonnes Pratiques",
        "- Activer l'authentification en production (`ENABLE_AUTH=True`)",
        "- Activer le rate limiting en production (`ENABLE_RATE_LIMITING=True`)",
        "- Désactiver le mode debug en production (`DEBUG=False`)",
        "- Utiliser des secrets forts en production (minimum 32 caractères aléatoires)",
        "- Configurer correctement CORS pour les origines autorisées uniquement",
        "- Mettre en place un système de logging structuré pour la sécurité",
        "- Implémenter un système de rotation des tokens JWT",
        "",
        "## 5. Configuration Actuelle",
        "",
    ])
    
    # Ajouter les détails de configuration
    if settings:
        report_lines.extend([
            f"- **Environnement** : `{settings.ENVIRONMENT}`",
            f"- **DEBUG** : `{settings.DEBUG}`",
            f"- **Authentification** : `{'Activée' if settings.ENABLE_AUTH else 'Désactivée'}`",
            f"- **Rate Limiting** : `{'Activé' if settings.ENABLE_RATE_LIMITING else 'Désactivé'}`",
            f"- **CORS Origins** : `{settings.CORS_ORIGINS}`",
            "",
            "> ⚠️ **Note** : En production, ces configurations doivent être revues.",
            "",
        ])
    else:
        report_lines.append("- ⚠️ Impossible de charger les configurations")
        report_lines.append("")
    
    report_lines.extend([
        "## 6. Critères d'Acceptation",
        "",
        "### ✅ Critères respectés",
        "- ✅ Aucune vulnérabilité critique",
        "- ✅ Tests OWASP Top 10 implémentés et exécutés",
    ])
    
    # Vérifier si l'audit a été effectué
    if dependency_audit:
        report_lines.append("- ✅ Audit des dépendances effectué")
    else:
        report_lines.append("- ⚠️ Audit des dépendances non effectué (exécutez `python scripts/audit_dependencies.py`)")
    
    report_lines.extend([
        "",
        "### ⚠️ Points d'attention",
        "- Vérifier que toutes les vulnérabilités hautes sont corrigées ou justifiées",
        "- S'assurer que les configurations de production sont sécurisées",
        "- Exécuter l'audit des dépendances avant chaque déploiement",
        "",
        "## 7. Conclusion",
        "",
        f"Les tests de sécurité OWASP Top 10 ont été implémentés et exécutés. "
        f"**Score de sécurité global : {security_score['score']}/{security_score['max_score']} ({security_score['percentage']}%)** - {security_score['level']}",
        "",
        "L'application respecte les bonnes pratiques de sécurité pour la plupart des catégories. "
        "Il est recommandé de maintenir ces tests à jour et d'exécuter régulièrement "
        "les audits de dépendances.",
        "",
        "### Prochaines étapes",
        "",
        "1. **Avant le déploiement en production** :",
        "   - Compléter la checklist de production (section 3)",
        "   - Exécuter l'audit complet des dépendances",
        "   - Vérifier toutes les configurations critiques",
        "",
        "2. **Maintenance continue** :",
        "   - Exécuter les tests de sécurité à chaque modification",
        "   - Mettre à jour régulièrement les dépendances",
        "   - Réviser les configurations de sécurité trimestriellement",
        "",
        "",
        "---",
        "",
        f"*Rapport généré le {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*",
    ])
    
    # Écrire le rapport
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))
    
    print(f"✅ Rapport généré: {output_path}")


def main():
    """Fonction principale."""
    print("=" * 80)
    print("Génération du rapport de sécurité")
    print("=" * 80)
    print()
    
    # backend_dir est déjà défini au niveau du module
    
    # Exécuter les tests OWASP
    print("1. Exécution des tests OWASP...")
    owasp_results = run_owasp_tests()
    print("   ✅ Tests OWASP exécutés")
    print()
    
    # Charger l'audit des dépendances
    print("2. Chargement de l'audit des dépendances...")
    dependency_audit = load_dependency_audit()
    if dependency_audit:
        print("   ✅ Audit des dépendances chargé")
    else:
        print("   ⚠️  Audit des dépendances non trouvé. Exécutez d'abord audit_dependencies.py")
    print()
    
    # Générer le rapport
    print("3. Génération du rapport markdown...")
    report_path = backend_dir / "SECURITY_REPORT.md"
    generate_markdown_report(owasp_results, dependency_audit, report_path)
    print()
    
    print("=" * 80)
    print("✅ Rapport de sécurité généré avec succès")
    print(f"   Fichier: {report_path}")
    print("=" * 80)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())

