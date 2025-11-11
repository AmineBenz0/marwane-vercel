#!/usr/bin/env python3
"""Script pour détecter l'IP de WSL et configurer la connexion PostgreSQL."""

import subprocess
import sys
import os

def get_wsl_ip():
    """Détecte l'IP de WSL."""
    try:
        # Essayer de récupérer l'IP via hostname -I dans WSL
        result = subprocess.run(
            ["wsl", "hostname", "-I"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            ips = result.stdout.strip().split()
            # Prendre la première IP (généralement l'IP principale)
            if ips:
                return ips[0]
    except Exception:
        pass
    
    # Essayer de récupérer l'IP via ipconfig sur Windows
    try:
        result = subprocess.run(
            ["ipconfig"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # Chercher l'IP WSL dans la sortie
            for line in result.stdout.split('\n'):
                if 'WSL' in line or 'vEthernet (WSL)' in line:
                    # La ligne suivante devrait contenir l'IP
                    continue
                if 'IPv4' in line and '192.168' in line:
                    # Extraire l'IP
                    parts = line.split(':')
                    if len(parts) > 1:
                        ip = parts[1].strip()
                        return ip
    except Exception:
        pass
    
    return None

def test_connection(host):
    """Teste la connexion à PostgreSQL sur un hôte donné."""
    try:
        import psycopg2
        conn = psycopg2.connect(
            f"postgresql://comptabilite_user:change_me_in_production@{host}:5432/comptabilite_db",
            connect_timeout=3
        )
        conn.close()
        return True
    except Exception:
        return False

def main():
    """Fonction principale."""
    print("Détection de la configuration PostgreSQL optimale...")
    print()
    
    # Test 1: localhost
    print("1. Test de localhost...")
    if test_connection("localhost"):
        print("   ✅ localhost fonctionne")
        return "localhost"
    print("   ❌ localhost ne fonctionne pas")
    
    # Test 2: IP de WSL
    print("\n2. Détection de l'IP WSL...")
    wsl_ip = get_wsl_ip()
    if wsl_ip:
        print(f"   📍 IP WSL détectée: {wsl_ip}")
        if test_connection(wsl_ip):
            print(f"   ✅ {wsl_ip} fonctionne")
            return wsl_ip
        print(f"   ❌ {wsl_ip} ne fonctionne pas")
    else:
        print("   ⚠️  Impossible de détecter l'IP WSL")
    
    # Test 3: 127.0.0.1
    print("\n3. Test de 127.0.0.1...")
    if test_connection("127.0.0.1"):
        print("   ✅ 127.0.0.1 fonctionne")
        return "127.0.0.1"
    print("   ❌ 127.0.0.1 ne fonctionne pas")
    
    print("\n❌ Aucune connexion fonctionnelle trouvée")
    return None

if __name__ == "__main__":
    result = main()
    if result:
        print(f"\n✅ Hôte recommandé: {result}")
        print(f"\nPour utiliser cette configuration, définissez:")
        print(f"  DATABASE_URL=postgresql://comptabilite_user:change_me_in_production@{result}:5432/comptabilite_db")
        sys.exit(0)
    else:
        print("\n❌ Aucune configuration fonctionnelle trouvée")
        sys.exit(1)

