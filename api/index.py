import os
import sys

# Ajouter le répertoire backend au sys.path pour permettre les imports
# Vercel exécute ce fichier depuis la racine du projet
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

# Import de l'application FastAPI depuis le module backend
# Dans backend/app/main.py, l'instance FastAPI est nommée 'app'
# Exposer l'application FastAPI pour Vercel
# Vercel détecte automatiquement l'objet 'app' exporté dans ce module
from app.main import app as fastapi_app
app = fastapi_app
