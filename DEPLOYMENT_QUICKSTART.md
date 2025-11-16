# ⚡ Déploiement Azure - Guide Rapide

## 🎯 Déploiement en 30 Minutes

Ce guide vous permet de déployer rapidement l'application sur Azure.

---

## 📋 Checklist Rapide

### Étape 1 : Créer la VM Azure (5 min)

```bash
# Via Azure CLI
az login
az group create --name comptabilite-rg --location francecentral
az vm create \
  --resource-group comptabilite-rg \
  --name comptabilite-vm \
  --image Ubuntu2204 \
  --size Standard_B2ms \
  --admin-username azureuser \
  --generate-ssh-keys

# Ouvrir les ports
az vm open-port --port 80 --resource-group comptabilite-rg --name comptabilite-vm --priority 1001
az vm open-port --port 443 --resource-group comptabilite-rg --name comptabilite-vm --priority 1002
az vm open-port --port 8000 --resource-group comptabilite-rg --name comptabilite-vm --priority 1003
az vm open-port --port 3000 --resource-group comptabilite-rg --name comptabilite-vm --priority 1004

# Récupérer l'IP
az vm show -d -g comptabilite-rg -n comptabilite-vm --query publicIps -o tsv
```

---

### Étape 2 : Se Connecter et Préparer (10 min)

```bash
# Se connecter (remplacer VOTRE_IP)
ssh azureuser@VOTRE_IP

# Mettre à jour le système
sudo apt update && sudo apt upgrade -y

# Installer Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Installer Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Vérifier
docker --version
docker-compose --version
```

---

### Étape 3 : Cloner et Configurer (5 min)

```bash
# Cloner le projet
mkdir -p ~/apps && cd ~/apps
git clone VOTRE_REPO_URL comptabilite
cd comptabilite

# Créer les fichiers .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp .env.example .env

# Éditer backend/.env
nano backend/.env
```

**Configuration minimale backend/.env** :
```env
DATABASE_URL=postgresql://comptabilite_user:MotDePasseSecurise123@postgres:5432/comptabilite_db
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_urlsafe(64))")
CORS_ORIGINS=http://VOTRE_IP:3000,http://VOTRE_IP
ENVIRONMENT=production
ENABLE_AUTH=True
```

**Configuration frontend/.env** :
```env
VITE_API_URL=http://VOTRE_IP:8000
```

**Configuration .env (racine)** :
```env
POSTGRES_USER=comptabilite_user
POSTGRES_PASSWORD=MotDePasseSecurise123
POSTGRES_DB=comptabilite_db
```

---

### Étape 4 : Déployer (10 min)

```bash
# Rendre le script exécutable
chmod +x deploy.sh

# Déployer
./deploy.sh

# Vérifier que tout fonctionne
docker-compose ps

# Appliquer les migrations
docker exec -it comptabilite_backend alembic upgrade head

# Créer un admin
docker exec -it comptabilite_backend python -c "
from app.database import SessionLocal
from app.models.user import User
from app.utils.security import hash_password

db = SessionLocal()
admin = User(
    email='admin@comptabilite.com',
    nom='Admin',
    hashed_password=hash_password('Admin123!'),
    role='admin',
    est_actif=True
)
db.add(admin)
db.commit()
print('✅ Admin créé : admin@comptabilite.com / Admin123!')
db.close()
"
```

---

## 🌐 Accéder à l'Application

**Frontend** : `http://VOTRE_IP:3000`  
**Backend** : `http://VOTRE_IP:8000`  
**API Docs** : `http://VOTRE_IP:8000/docs`

**Identifiants par défaut** :
- Email : `admin@comptabilite.com`
- Mot de passe : `Admin123!`

⚠️ **Changez le mot de passe immédiatement après la première connexion !**

---

## 🔧 Commandes Utiles

```bash
# Voir les logs
docker-compose logs -f

# Redémarrer
docker-compose restart

# Arrêter
docker-compose down

# Mettre à jour
git pull origin main
./deploy.sh

# Backup DB
docker exec comptabilite_postgres pg_dump -U comptabilite_user comptabilite_db > backup_$(date +%Y%m%d).sql

# Restaurer DB
docker exec -i comptabilite_postgres psql -U comptabilite_user comptabilite_db < backup_20241116.sql
```

---

## 🎯 Prochaines Étapes

### Immédiat
- [ ] Tester l'application
- [ ] Créer des utilisateurs
- [ ] Importer les données existantes

### Court Terme
- [ ] Configurer un nom de domaine
- [ ] Activer HTTPS
- [ ] Configurer les backups automatiques

### Moyen Terme
- [ ] Monitoring (Prometheus/Grafana)
- [ ] Alertes
- [ ] Scaling si nécessaire

---

## 🐛 Problèmes Courants

### "Cannot connect to Docker daemon"
```bash
sudo systemctl start docker
sudo usermod -aG docker $USER
newgrp docker
```

### "Port already in use"
```bash
# Voir ce qui utilise le port
sudo lsof -i :8000
sudo lsof -i :3000

# Arrêter Docker Compose
docker-compose down
```

### "Database connection failed"
```bash
# Vérifier PostgreSQL
docker-compose logs postgres

# Redémarrer PostgreSQL
docker-compose restart postgres
```

---

## 📞 Support

Pour plus de détails, voir :
- **DEPLOYMENT_AZURE_GUIDE.md** - Guide complet
- **docker-compose.yml** - Configuration Docker
- **BACKLOG.md** - Suivi du projet

---

**Temps total estimé : 30 minutes** ⏱️  
**Difficulté : Moyenne** 🟡  
**Coût Azure : ~40-80€/mois** 💰

