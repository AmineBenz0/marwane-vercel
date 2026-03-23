from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models.batiment import Batiment
from app.models.user import Utilisateur

def seed_batiments():
    db = SessionLocal()
    try:
        # Check if batiments exist
        count = db.query(Batiment).count()
        if count == 0:
            print("Seeding batiments...")
            batiments = [
                Batiment(nom="Bâtiment 1", description="Premier bâtiment de production"),
                Batiment(nom="Bâtiment 2", description="Deuxième bâtiment de production"),
                Batiment(nom="Bâtiment 3", description="Troisième bâtiment de production"),
            ]
            db.add_all(batiments)
            db.commit()
            print("Batiments seeded successfully.")
        else:
            print(f"{count} batiments already exist.")
    except Exception as e:
        print(f"Error seeding batiments: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_batiments()
