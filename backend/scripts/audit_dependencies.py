#!/usr/bin/env python3
"""
Script pour auditer les dépendances Python et détecter les vulnérabilités connues.

Utilise pip-audit et safety pour scanner les dépendances.
"""
import subprocess
import sys
import json
from pathlib import Path
from datetime import datetime


def run_pip_audit():
    """Exécute pip-audit et retourne les résultats."""
    print("=" * 80)
    print("Exécution de pip-audit...")
    print("=" * 80)
    
    try:
        result = subprocess.run(
            ["pip-audit", "--format", "json", "--desc"],
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode == 0:
            print("✅ pip-audit: Aucune vulnérabilité trouvée")
            return {"status": "success", "vulnerabilities": []}
        else:
            try:
                vulnerabilities = json.loads(result.stdout)
                print(f"⚠️  pip-audit: {len(vulnerabilities.get('vulnerabilities', []))} vulnérabilité(s) trouvée(s)")
                return {"status": "vulnerabilities_found", "vulnerabilities": vulnerabilities}
            except json.JSONDecodeError:
                print("❌ pip-audit: Erreur lors du parsing des résultats")
                print(result.stderr)
                return {"status": "error", "error": result.stderr}
    except FileNotFoundError:
        print("❌ pip-audit n'est pas installé. Installez-le avec: pip install pip-audit")
        return {"status": "not_installed"}
    except Exception as e:
        print(f"❌ Erreur lors de l'exécution de pip-audit: {e}")
        return {"status": "error", "error": str(e)}


def run_safety_check():
    """Exécute safety check et retourne les résultats."""
    print("\n" + "=" * 80)
    print("Exécution de safety check...")
    print("=" * 80)
    
    try:
        result = subprocess.run(
            ["safety", "check", "--json"],
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode == 0:
            print("✅ safety: Aucune vulnérabilité trouvée")
            return {"status": "success", "vulnerabilities": []}
        else:
            try:
                vulnerabilities = json.loads(result.stdout)
                print(f"⚠️  safety: {len(vulnerabilities)} vulnérabilité(s) trouvée(s)")
                return {"status": "vulnerabilities_found", "vulnerabilities": vulnerabilities}
            except json.JSONDecodeError:
                # Safety peut retourner du texte au lieu de JSON
                if "No known security vulnerabilities found" in result.stdout:
                    print("✅ safety: Aucune vulnérabilité trouvée")
                    return {"status": "success", "vulnerabilities": []}
                else:
                    print("⚠️  safety: Vulnérabilités trouvées (format texte)")
                    print(result.stdout)
                    return {"status": "vulnerabilities_found", "output": result.stdout}
    except FileNotFoundError:
        print("❌ safety n'est pas installé. Installez-le avec: pip install safety")
        return {"status": "not_installed"}
    except Exception as e:
        print(f"❌ Erreur lors de l'exécution de safety: {e}")
        return {"status": "error", "error": str(e)}


def generate_report(pip_audit_result, safety_result):
    """Génère un rapport d'audit des dépendances."""
    report = {
        "timestamp": datetime.now().isoformat(),
        "pip_audit": pip_audit_result,
        "safety": safety_result,
        "summary": {
            "critical_vulnerabilities": 0,
            "high_vulnerabilities": 0,
            "medium_vulnerabilities": 0,
            "low_vulnerabilities": 0,
            "total_vulnerabilities": 0
        }
    }
    
    # Analyser les vulnérabilités de pip-audit
    if pip_audit_result.get("status") == "vulnerabilities_found":
        vulns = pip_audit_result.get("vulnerabilities", {}).get("vulnerabilities", [])
        for vuln in vulns:
            # pip-audit ne fournit pas toujours de sévérité, on compte toutes
            report["summary"]["total_vulnerabilities"] += len(vuln.get("aliases", []))
    
    # Analyser les vulnérabilités de safety
    if safety_result.get("status") == "vulnerabilities_found":
        vulns = safety_result.get("vulnerabilities", [])
        if isinstance(vulns, list):
            report["summary"]["total_vulnerabilities"] += len(vulns)
        elif isinstance(vulns, dict):
            # Format différent
            report["summary"]["total_vulnerabilities"] += len(vulns.get("vulnerabilities", []))
    
    return report


def main():
    """Fonction principale."""
    print("Audit des dépendances Python")
    print("=" * 80)
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Exécuter les audits
    pip_audit_result = run_pip_audit()
    safety_result = run_safety_check()
    
    # Générer le rapport
    report = generate_report(pip_audit_result, safety_result)
    
    # Sauvegarder le rapport
    report_path = Path(__file__).parent.parent / "security_audit_dependencies.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    
    print("\n" + "=" * 80)
    print("Résumé")
    print("=" * 80)
    print(f"Total de vulnérabilités trouvées: {report['summary']['total_vulnerabilities']}")
    print(f"Rapport sauvegardé dans: {report_path}")
    print()
    
    # Retourner un code d'erreur si des vulnérabilités sont trouvées
    if report["summary"]["total_vulnerabilities"] > 0:
        print("⚠️  Des vulnérabilités ont été détectées. Veuillez les corriger.")
        return 1
    else:
        print("✅ Aucune vulnérabilité détectée.")
        return 0


if __name__ == "__main__":
    sys.exit(main())

