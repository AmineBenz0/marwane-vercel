"""
Script pour créer un utilisateur administrateur dans la base de données.

Usage:
    python create_admin.py
    ou
    python create_admin.py --email admin@example.com --password AdminPass123! --name "Admin User"
"""

import sys
import getpass
from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models.user import Utilisateur
from app.utils.security import hash_password


def create_admin_user(email: str = None, password: str = None, name: str = None):
    """
    Crée un utilisateur administrateur dans la base de données.
    
    Args:
        email: Email de l'administrateur (optionnel, sera demandé si non fourni)
        password: Mot de passe (optionnel, sera demandé si non fourni)
        name: Nom de l'administrateur (optionnel, sera demandé si non fourni)
    """
    db: Session = SessionLocal()
    
    try:
        # Demander les informations si non fournies
        if not email:
            email = input("Email de l'administrateur: ").strip()
        
        if not name:
            name = input("Nom de l'administrateur: ").strip()
        
        if not password:
            password = getpass.getpass("Mot de passe (min 8 caractères, majuscule, minuscule, chiffre, spécial): ")
            password_confirm = getpass.getpass("Confirmer le mot de passe: ")
            
            if password != password_confirm:
                print("❌ Les mots de passe ne correspondent pas!")
                sys.exit(1)
        
        # Vérifier si l'utilisateur existe déjà (gérer le cas où la colonne est_actif n'existe pas encore)
        try:
            existing_user = db.query(Utilisateur).filter(Utilisateur.email == email).first()
        except Exception as e:
            # Si la colonne est_actif n'existe pas, essayer sans cette colonne
            if "est_actif" in str(e):
                existing_user = db.query(Utilisateur).filter(Utilisateur.email == email).first()
            else:
                raise
        
        if existing_user:
            if existing_user.est_actif:
                print(f"❌ Un utilisateur avec l'email '{email}' existe déjà et est actif.")
                response = input("Voulez-vous le mettre à jour avec le rôle admin? (o/n): ").strip().lower()
                if response == 'o':
                    existing_user.role = 'admin'
                    if password:
                        existing_user.mot_de_passe_hash = hash_password(password)
                    db.commit()
                    print(f"✅ Utilisateur '{email}' mis à jour avec le rôle admin.")
                    return
                else:
                    sys.exit(1)
            else:
                print(f"⚠️  Un utilisateur avec l'email '{email}' existe mais est inactif.")
                response = input("Voulez-vous le réactiver avec le rôle admin? (o/n): ").strip().lower()
                if response == 'o':
                    existing_user.est_actif = True
                    existing_user.role = 'admin'
                    if password:
                        existing_user.mot_de_passe_hash = hash_password(password)
                    db.commit()
                    print(f"✅ Utilisateur '{email}' réactivé avec le rôle admin.")
                    return
                else:
                    sys.exit(1)
        
        # Valider le mot de passe (règles de sécurité)
        if len(password) < 8:
            print("❌ Le mot de passe doit contenir au moins 8 caractères!")
            sys.exit(1)
        
        has_upper = any(c.isupper() for c in password)
        has_lower = any(c.islower() for c in password)
        has_digit = any(c.isdigit() for c in password)
        has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password)
        
        if not has_upper:
            print("❌ Le mot de passe doit contenir au moins une lettre majuscule!")
            sys.exit(1)
        if not has_lower:
            print("❌ Le mot de passe doit contenir au moins une lettre minuscule!")
            sys.exit(1)
        if not has_digit:
            print("❌ Le mot de passe doit contenir au moins un chiffre!")
            sys.exit(1)
        if not has_special:
            print("❌ Le mot de passe doit contenir au moins un caractère spécial (!@#$%^&*()_+-=[]{}|;:,.<>?)!")
            sys.exit(1)
        
        # Créer le nouvel utilisateur admin
        hashed_password = hash_password(password)
        new_user = Utilisateur(
            nom_utilisateur=name,
            email=email,
            mot_de_passe_hash=hashed_password,
            role='admin',
            est_actif=True
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        print(f"\n✅ Utilisateur administrateur créé avec succès!")
        print(f"   Email: {email}")
        print(f"   Nom: {name}")
        print(f"   Rôle: admin")
        print(f"\n💡 Vous pouvez maintenant vous connecter avec ces identifiants.")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Erreur lors de la création de l'utilisateur: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Créer un utilisateur administrateur")
    parser.add_argument("--email", help="Email de l'administrateur")
    parser.add_argument("--password", help="Mot de passe (non recommandé en ligne de commande)")
    parser.add_argument("--name", help="Nom de l'administrateur")
    
    args = parser.parse_args()
    
    create_admin_user(
        email=args.email,
        password=args.password,
        name=args.name
    )

