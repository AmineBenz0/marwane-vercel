#!/usr/bin/env python3
"""
Script simple pour créer un utilisateur système avec id=0.
À exécuter dans le conteneur Docker.
"""
import sys
sys.path.insert(0, '/app')

from sqlalchemy import text
from app.database import SessionLocal
from app.utils.security import hash_password

def main():
    db = SessionLocal()
    try:
        # Vérifier si l'utilisateur système existe déjà
        result = db.execute(text("SELECT id_utilisateur FROM utilisateurs WHERE id_utilisateur = 0"))
        existing = result.fetchone()
        
        if existing:
            print("✅ Utilisateur système (id=0) existe déjà.")
            return
        
        # Hash du mot de passe
        password_hash = hash_password("system-user-no-login")
        
        # Créer l'utilisateur système avec id=0
        db.execute(text("""
            INSERT INTO utilisateurs (
                id_utilisateur, 
                email, 
                nom_utilisateur, 
                mot_de_passe_hash, 
                role, 
                est_actif, 
                date_creation, 
                date_modification
            ) VALUES (
                0, 
                'system@comptabilite.local', 
                'Système', 
                :password_hash, 
                'system', 
                FALSE, 
                NOW(), 
                NOW()
            )
        """), {"password_hash": password_hash})
        
        db.commit()
        print("✅ Utilisateur système créé avec succès!")
        print("   ID: 0")
        print("   Email: system@comptabilite.local")
        print("   Rôle: system")
        print("   Statut: Inactif (ne peut pas se connecter)")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Erreur: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    main()

