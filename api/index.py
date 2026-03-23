import os
import sys

# Ajouter le répertoire backend au sys.path pour permettre les imports
# Vercel exécute ce fichier depuis la racine du projet
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

# Import de l'application FastAPI depuis le module backend
# Dans backend/app/main.py, l'instance FastAPI est nommée 'app'
try:
    from app.main import app
except ImportError as e:
    # Fallback pour d'autres structures possibles si nécessaire
    print(f"Erreur d'import : {e}")
    raise e

# Vercel s'attend à ce que l'objet application soit exposé
# Si on veut que l'app soit accessible directement sous l'objet app
# on peut l'assigner explicitement si besoin, mais l'import suffit généralement
# si Vercel est configuré pour pointer vers ce fichier.
