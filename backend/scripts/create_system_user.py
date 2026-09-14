"""
Script pour créer un utilisateur système avec id=0.
Cet utilisateur est utilisé par le trigger d'audit lorsque aucun utilisateur n'est authentifié.
"""
from sqlalchemy import text
from app.database import SessionLocal
from app.models.user import Utilisateur
from app.utils.security import hash_password

def create_system_user():
    """
    Crée un utilisateur système avec id=0 pour le trigger d'audit.
    """
    db = SessionLocal()
    try:
        # Vérifier si l'utilisateur système existe déjà
        existing_user = db.query(Utilisateur).filter(Utilisateur.id_utilisateur == 0).first()
        
        if existing_user:
            print("✅ Utilisateur système (id=0) existe déjà.")
            return
        
        # Créer l'utilisateur système
        system_user = Utilisateur(
            email="system@comptabilite.local",
            nom_utilisateur="Système",
            mot_de_passe_hash=hash_password("system-user-no-login"),
            role="system",
            est_actif=False  # Inactif pour empêcher la connexion
        )
        
        db.add(system_user)
        db.flush()  # Pour obtenir l'ID généré
        
        # Forcer l'ID à 0 avec une requête SQL brute
        # Cela nécessite de supprimer l'utilisateur et de le recréer avec id=0
        db.execute(text("DELETE FROM utilisateurs WHERE email = 'system@comptabilite.local'"))
        db.execute(text("""
            INSERT INTO utilisateurs (id_utilisateur, email, nom_utilisateur, mot_de_passe_hash, role, est_actif, date_creation, date_modification)
            VALUES (0, 'system@comptabilite.local', 'Système', :password_hash, 'system', FALSE, NOW(), NOW())
        """), {"password_hash": hash_password("system-user-no-login")})
        
        # Réinitialiser la séquence pour qu'elle ne crée pas de conflit
        db.execute(text("""
            SELECT setval('utilisateurs_id_utilisateur_seq', 
                COALESCE((SELECT MAX(id_utilisateur) FROM utilisateurs WHERE id_utilisateur > 0), 0) + 1, 
                false)
        """))
        
        db.commit()
        print("✅ Utilisateur système (id=0) créé avec succès.")
        print("   Email: system@comptabilite.local")
        print("   Rôle: system")
        print("   Statut: Inactif (ne peut pas se connecter)")
        
    except Exception as e:
        db.rollback()
        print(f"❌ Erreur lors de la création de l'utilisateur système: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("🔧 Création de l'utilisateur système pour le trigger d'audit...")
    create_system_user()

