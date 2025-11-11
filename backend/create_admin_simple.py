"""
Script simple pour créer un utilisateur administrateur en utilisant SQL brut.
Utilise cette approche si les migrations n'ont pas encore été exécutées.
"""

import sys
import getpass
import psycopg2
from passlib.context import CryptContext
import bcrypt

# Configuration de la base de données
DB_CONFIG = {
    'host': '127.0.0.1',
    'port': 5432,
    'database': 'comptabilite_db',
    'user': 'comptabilite_user',
    'password': 'change_me_in_production'
}

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash un mot de passe."""
    try:
        return pwd_context.hash(password)
    except ValueError:
        # Fallback vers bcrypt direct
        password_bytes = password.encode('utf-8')
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password_bytes, salt).decode('utf-8')


def create_admin_user(email: str = None, password: str = None, name: str = None):
    """Crée un utilisateur administrateur en utilisant SQL brut."""
    
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
    
    # Valider le mot de passe
    if len(password) < 8:
        print("❌ Le mot de passe doit contenir au moins 8 caractères!")
        sys.exit(1)
    
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password)
    
    if not (has_upper and has_lower and has_digit and has_special):
        print("❌ Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial!")
        sys.exit(1)
    
    # Hasher le mot de passe
    hashed_password = hash_password(password)
    
    try:
        # Se connecter à la base de données
        conn = psycopg2.connect(**DB_CONFIG)
        cur = conn.cursor()
        
        # Vérifier si la table existe et quelles colonnes elle a
        cur.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'utilisateurs'
        """)
        columns = [row[0] for row in cur.fetchall()]
        
        if not columns:
            print("❌ La table 'utilisateurs' n'existe pas. Veuillez exécuter les migrations d'abord.")
            print("   Commande: alembic upgrade head")
            sys.exit(1)
        
        # Vérifier si l'utilisateur existe déjà
        cur.execute("SELECT id_utilisateur, email FROM utilisateurs WHERE email = %s", (email,))
        existing = cur.fetchone()
        
        if existing:
            print(f"⚠️  Un utilisateur avec l'email '{email}' existe déjà (ID: {existing[0]}).")
            response = input("Voulez-vous le mettre à jour avec le rôle admin? (o/n): ").strip().lower()
            if response == 'o':
                # Mettre à jour l'utilisateur existant
                if 'est_actif' in columns:
                    cur.execute("""
                        UPDATE utilisateurs 
                        SET nom_utilisateur = %s, 
                            mot_de_passe_hash = %s, 
                            role = 'admin',
                            est_actif = TRUE
                        WHERE email = %s
                    """, (name, hashed_password, email))
                else:
                    cur.execute("""
                        UPDATE utilisateurs 
                        SET nom_utilisateur = %s, 
                            mot_de_passe_hash = %s, 
                            role = 'admin'
                        WHERE email = %s
                    """, (name, hashed_password, email))
                conn.commit()
                print(f"✅ Utilisateur '{email}' mis à jour avec le rôle admin.")
            else:
                print("❌ Opération annulée.")
                sys.exit(1)
        else:
            # Créer le nouvel utilisateur
            if 'est_actif' in columns:
                cur.execute("""
                    INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe_hash, role, est_actif)
                    VALUES (%s, %s, %s, 'admin', TRUE)
                    RETURNING id_utilisateur
                """, (name, email, hashed_password))
            else:
                cur.execute("""
                    INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe_hash, role)
                    VALUES (%s, %s, %s, 'admin')
                    RETURNING id_utilisateur
                """, (name, email, hashed_password))
            
            user_id = cur.fetchone()[0]
            conn.commit()
            
            print(f"\n✅ Utilisateur administrateur créé avec succès!")
            print(f"   ID: {user_id}")
            print(f"   Email: {email}")
            print(f"   Nom: {name}")
            print(f"   Rôle: admin")
            print(f"\n💡 Vous pouvez maintenant vous connecter avec ces identifiants.")
        
        cur.close()
        conn.close()
        
    except psycopg2.OperationalError as e:
        print(f"❌ Erreur de connexion à la base de données: {e}")
        print("   Vérifiez que PostgreSQL est démarré et accessible.")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Erreur lors de la création de l'utilisateur: {e}")
        sys.exit(1)


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

