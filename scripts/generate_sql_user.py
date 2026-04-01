import bcrypt
import argparse
import sys

def generate_user_sql(email: str, password: str, name: str = "Admin User", role: str = "admin", is_active: bool = True):
    """
    Génère une requête SQL d'insertion pour la table 'utilisateurs' de la base de données.
    Utilise bcrypt pour le hashage du mot de passe (même algorithme que le backend).
    """
    # Hashage du mot de passe avec bcrypt
    # Le sel est généré automatiquement
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed_password = bcrypt.hashpw(password_bytes, salt).decode('utf-8')
    
    # Échappement des caractères spéciaux pour le SQL (basique)
    safe_name = name.replace("'", "''")
    safe_email = email.replace("'", "''")
    
    sql = f"""
-- Requête SQL pour insérer l'utilisateur dans Supabase (table 'utilisateurs')
-- À exécuter dans l'éditeur SQL de votre Dashboard Supabase

INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe_hash, role, est_actif)
VALUES ('{safe_name}', '{safe_email}', '{hashed_password}', '{role}', {str(is_active).lower()});

-- Vérification de l'insertion (optionnel)
-- SELECT * FROM utilisateurs WHERE email = '{safe_email}';
"""
    return sql

def main():
    parser = argparse.ArgumentParser(description="Générateur de requête SQL pour créer un utilisateur.")
    parser.add_argument("--email", help="Email de l'utilisateur")
    parser.add_argument("--password", help="Mot de passe de l'utilisateur")
    parser.add_argument("--name", default="Admin User", help="Nom complet (défaut: Admin User)")
    parser.add_argument("--role", default="admin", help="Rôle: 'admin' ou 'user' (défaut: admin)")
    
    args = parser.parse_args()
    
    email = args.email
    password = args.password
    name = args.name
    role = args.role
    
    # Si les arguments ne sont pas fournis, on les demande interactivement
    if not email:
        email = input("📧 Entrez l'email de l'utilisateur: ").strip()
    if not password:
        import getpass
        password = getpass.getpass("🔑 Entrez le mot de passe: ")
    
    if not email or not password:
        print("❌ L'email et le mot de passe sont obligatoires.")
        sys.exit(1)
        
    query = generate_user_sql(email, password, name, role)
    
    print("\n" + "="*60)
    print("🚀 VOTRE REQUÊTE SQL A ÉTÉ GÉNÉRÉE :")
    print("="*60)
    print(query)
    print("="*60)
    print("\n💡 Copiez et collez la requête ci-dessus dans l'éditeur SQL de Supabase.")

if __name__ == "__main__":
    main()
