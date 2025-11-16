# 🚀 Guide de Déploiement sur Azure VM

## 📋 Vue d'ensemble

Ce guide explique comment déployer l'application de comptabilité sur une machine virtuelle Azure.

---

## 🎯 Architecture de Déploiement

```
Azure VM (Ubuntu 22.04)
├── Docker & Docker Compose
├── PostgreSQL (conteneur)
├── Backend FastAPI (conteneur)
├── Frontend React (conteneur Nginx)
└── Nginx Reverse Proxy (hôte)
```

---

## 📝 Prérequis

### 1. Compte Azure
- [ ] Compte Azure actif
- [ ] Accès au portail Azure
- [ ] Crédits disponibles

### 2. Outils Locaux
- [ ] Azure CLI installé
- [ ] SSH client (intégré Windows/Linux)
- [ ] Git

---

## 🔧 Étape 1 : Créer la VM Azure

### Option A : Via le Portail Azure (Interface Web)

1. **Se connecter au portail Azure**
   - Aller sur https://portal.azure.com
   - Se connecter avec vos identifiants

2. **Créer une Machine Virtuelle**
   - Cliquer sur "Créer une ressource"
   - Chercher "Machine virtuelle"
   - Cliquer sur "Créer"

3. **Configuration de base**
   ```
   Groupe de ressources : comptabilite-rg (créer nouveau)
   Nom de la VM : comptabilite-vm
   Région : France Central (ou proche de vous)
   Image : Ubuntu Server 22.04 LTS
   Taille : Standard_B2s (2 vCPU, 4 GB RAM) - Minimum recommandé
          Standard_B2ms (2 vCPU, 8 GB RAM) - Recommandé
   ```

4. **Compte administrateur**
   ```
   Type d'authentification : Clé publique SSH
   Nom d'utilisateur : azureuser
   Source de clé publique SSH : Générer une nouvelle paire de clés
   Nom de la paire de clés : comptabilite-vm-key
   ```
   ⚠️ **IMPORTANT** : Télécharger et sauvegarder la clé privée !

5. **Ports entrants**
   - Cocher : SSH (22), HTTP (80), HTTPS (443)
   - Ajouter manuellement : 8000 (API Backend - temporaire pour tests)

6. **Disques**
   - Type de disque OS : SSD Standard (ou Premium pour meilleures performances)
   - Taille : 30 GB minimum

7. **Réseau**
   - Réseau virtuel : (par défaut)
   - IP publique : Créer nouveau
   - Groupe de sécurité réseau : Créer nouveau

8. **Vérifier et créer**
   - Vérifier la configuration
   - Cliquer sur "Créer"
   - ⏱️ Attendre 2-3 minutes

### Option B : Via Azure CLI (Ligne de commande)

```bash
# 1. Se connecter à Azure
az login

# 2. Créer un groupe de ressources
az group create \
  --name comptabilite-rg \
  --location francecentral

# 3. Créer la VM
az vm create \
  --resource-group comptabilite-rg \
  --name comptabilite-vm \
  --image Ubuntu2204 \
  --size Standard_B2ms \
  --admin-username azureuser \
  --generate-ssh-keys \
  --public-ip-sku Standard

# 4. Ouvrir les ports
az vm open-port --port 80 --resource-group comptabilite-rg --name comptabilite-vm --priority 1001
az vm open-port --port 443 --resource-group comptabilite-rg --name comptabilite-vm --priority 1002
az vm open-port --port 8000 --resource-group comptabilite-rg --name comptabilite-vm --priority 1003

# 5. Récupérer l'IP publique
az vm show \
  --resource-group comptabilite-rg \
  --name comptabilite-vm \
  --show-details \
  --query publicIps \
  --output tsv
```

---

## 🔐 Étape 2 : Se Connecter à la VM

### Récupérer l'IP Publique

**Portail Azure** :
- Aller dans "Machines virtuelles"
- Cliquer sur "comptabilite-vm"
- Copier l'adresse IP publique

**Azure CLI** :
```bash
az vm list-ip-addresses \
  --resource-group comptabilite-rg \
  --name comptabilite-vm \
  --output table
```

### Se Connecter en SSH

**Windows (PowerShell)** :
```powershell
# Si clé téléchargée depuis le portail
ssh -i C:\Users\VotreNom\Downloads\comptabilite-vm-key.pem azureuser@VOTRE_IP_PUBLIQUE

# Si clé générée par Azure CLI
ssh azureuser@VOTRE_IP_PUBLIQUE
```

**Linux/Mac** :
```bash
# Donner les bonnes permissions à la clé
chmod 400 ~/Downloads/comptabilite-vm-key.pem

# Se connecter
ssh -i ~/Downloads/comptabilite-vm-key.pem azureuser@VOTRE_IP_PUBLIQUE
```

---

## 📦 Étape 3 : Préparer la VM

### 1. Mettre à jour le système

```bash
sudo apt update
sudo apt upgrade -y
```

### 2. Installer Docker

```bash
# Installer les dépendances
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# Ajouter la clé GPG Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# Ajouter le repository Docker
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Installer Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# Vérifier l'installation
sudo docker --version

# Ajouter l'utilisateur au groupe docker (pour éviter sudo)
sudo usermod -aG docker $USER

# Appliquer les changements (ou se déconnecter/reconnecter)
newgrp docker
```

### 3. Installer Docker Compose

```bash
# Télécharger Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Donner les permissions d'exécution
sudo chmod +x /usr/local/bin/docker-compose

# Vérifier l'installation
docker-compose --version
```

### 4. Installer Git

```bash
sudo apt install -y git
git --version
```

### 5. Installer Nginx (Reverse Proxy)

```bash
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl status nginx
```

---

## 📂 Étape 4 : Déployer l'Application

### 1. Cloner le Projet

```bash
# Créer un dossier pour l'application
mkdir -p ~/apps
cd ~/apps

# Cloner le repository (remplacer par votre URL)
git clone https://github.com/VOTRE_USERNAME/comptabilite.git
# OU si repository privé avec token
git clone https://VOTRE_TOKEN@github.com/VOTRE_USERNAME/comptabilite.git

cd comptabilite
```

### 2. Créer les Fichiers de Configuration

#### a) Créer `.env` pour le backend

```bash
cd backend
nano .env
```

Contenu du fichier `.env` :
```env
# Base de données
DATABASE_URL=postgresql://comptabilite_user:VotreMotDePasseSecurise@postgres:5432/comptabilite_db

# JWT
SECRET_KEY=VotreCleSuperSecreteAleatoire64Caracteres
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# CORS (remplacer par votre domaine)
CORS_ORIGINS=http://VOTRE_IP_PUBLIQUE,http://VOTRE_DOMAINE.com,https://VOTRE_DOMAINE.com

# Environnement
ENVIRONMENT=production
DEBUG=False

# Authentification
ENABLE_AUTH=True
```

**Générer une clé secrète** :
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

#### b) Créer `.env` pour le frontend

```bash
cd ../frontend
nano .env
```

Contenu :
```env
VITE_API_URL=http://VOTRE_IP_PUBLIQUE/api
```

#### c) Créer `.env` à la racine (pour Docker Compose)

```bash
cd ..
nano .env
```

Contenu :
```env
# PostgreSQL
POSTGRES_USER=comptabilite_user
POSTGRES_PASSWORD=VotreMotDePasseSecurise
POSTGRES_DB=comptabilite_db

# Ports
BACKEND_PORT=8000
FRONTEND_PORT=80
```

### 3. Créer les Dockerfiles

#### a) Backend Dockerfile

```bash
nano backend/Dockerfile
```

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Installer les dépendances système
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copier les requirements
COPY requirements.txt .

# Installer les dépendances Python
RUN pip install --no-cache-dir -r requirements.txt

# Copier le code
COPY . .

# Exposer le port
EXPOSE 8000

# Commande de démarrage
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

#### b) Frontend Dockerfile (Multi-stage)

```bash
nano frontend/Dockerfile
```

```dockerfile
# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copier package.json et package-lock.json
COPY package*.json ./

# Installer les dépendances
RUN npm ci

# Copier le code source
COPY . .

# Build de production
RUN npm run build

# Stage 2: Production avec Nginx
FROM nginx:alpine

# Copier les fichiers buildés
COPY --from=builder /app/dist /usr/share/nginx/html

# Copier la configuration Nginx personnalisée
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exposer le port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

#### c) Configuration Nginx pour le Frontend

```bash
nano frontend/nginx.conf
```

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # SPA routing - toutes les routes vers index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache des assets statiques
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 4. Créer/Mettre à Jour docker-compose.yml

```bash
nano docker-compose.yml
```

```yaml
version: '3.8'

services:
  # Base de données PostgreSQL
  postgres:
    image: postgres:15-alpine
    container_name: comptabilite_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - comptabilite_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Backend FastAPI
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: comptabilite_backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    env_file:
      - ./backend/.env
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - comptabilite_network
    volumes:
      - ./backend/logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Frontend React + Nginx
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: comptabilite_frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - backend
    networks:
      - comptabilite_network

volumes:
  postgres_data:
    driver: local

networks:
  comptabilite_network:
    driver: bridge
```

### 5. Créer un Script de Déploiement

```bash
nano deploy.sh
```

```bash
#!/bin/bash

echo "🚀 Déploiement de l'application Comptabilité..."

# Arrêter les conteneurs existants
echo "📦 Arrêt des conteneurs existants..."
docker-compose down

# Supprimer les anciennes images
echo "🗑️ Nettoyage des anciennes images..."
docker system prune -f

# Construire les nouvelles images
echo "🔨 Construction des images Docker..."
docker-compose build --no-cache

# Démarrer les conteneurs
echo "▶️ Démarrage des conteneurs..."
docker-compose up -d

# Attendre que les services soient prêts
echo "⏳ Attente du démarrage des services..."
sleep 10

# Vérifier le statut
echo "✅ Vérification du statut..."
docker-compose ps

# Afficher les logs
echo "📋 Logs récents..."
docker-compose logs --tail=50

echo "✅ Déploiement terminé !"
echo "🌐 Frontend : http://$(curl -s ifconfig.me):3000"
echo "🔧 Backend : http://$(curl -s ifconfig.me):8000"
echo "📚 API Docs : http://$(curl -s ifconfig.me):8000/docs"
```

```bash
chmod +x deploy.sh
```

---

## 🚀 Étape 5 : Déployer

### 1. Exécuter le Déploiement

```bash
cd ~/apps/comptabilite
./deploy.sh
```

### 2. Appliquer les Migrations de Base de Données

```bash
# Entrer dans le conteneur backend
docker exec -it comptabilite_backend bash

# Appliquer les migrations Alembic
alembic upgrade head

# Sortir du conteneur
exit
```

### 3. Créer un Utilisateur Admin

```bash
# Entrer dans le conteneur backend
docker exec -it comptabilite_backend bash

# Exécuter le script de création d'admin (si vous l'avez)
python scripts/create_admin.py
# OU créer manuellement via Python
python -c "
from app.database import SessionLocal
from app.models.user import User
from app.utils.security import hash_password

db = SessionLocal()
admin = User(
    email='admin@comptabilite.com',
    nom='Admin',
    hashed_password=hash_password('VotreMotDePasse123!'),
    role='admin',
    est_actif=True
)
db.add(admin)
db.commit()
print('Admin créé avec succès!')
"

exit
```

---

## 🌐 Étape 6 : Configurer Nginx Reverse Proxy (Optionnel mais Recommandé)

### Pourquoi un Reverse Proxy ?
- URL unifiée (tout sur le port 80/443)
- SSL/HTTPS facile à configurer
- Load balancing si besoin
- Meilleure sécurité

### Configuration

```bash
sudo nano /etc/nginx/sites-available/comptabilite
```

```nginx
server {
    listen 80;
    server_name VOTRE_IP_PUBLIQUE;  # Ou votre domaine

    # Logs
    access_log /var/log/nginx/comptabilite_access.log;
    error_log /var/log/nginx/comptabilite_error.log;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeout pour les requêtes longues
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # API Docs (Swagger)
    location /docs {
        proxy_pass http://localhost:8000/docs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location /openapi.json {
        proxy_pass http://localhost:8000/openapi.json;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

### Activer la Configuration

```bash
# Créer un lien symbolique
sudo ln -s /etc/nginx/sites-available/comptabilite /etc/nginx/sites-enabled/

# Supprimer la config par défaut
sudo rm /etc/nginx/sites-enabled/default

# Tester la configuration
sudo nginx -t

# Recharger Nginx
sudo systemctl reload nginx
```

### Mettre à Jour le Frontend .env

```bash
nano frontend/.env
```

```env
# Avec Nginx reverse proxy
VITE_API_URL=/api
```

Puis rebuild le frontend :
```bash
docker-compose build frontend
docker-compose up -d frontend
```

---

## 🔒 Étape 7 : Configurer HTTPS (Optionnel mais Recommandé)

### Avec Let's Encrypt (Gratuit)

#### 1. Installer Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

#### 2. Obtenir un Certificat SSL

⚠️ **Prérequis** : Avoir un nom de domaine pointant vers votre IP publique

```bash
# Remplacer par votre domaine
sudo certbot --nginx -d votre-domaine.com -d www.votre-domaine.com
```

Suivre les instructions :
- Entrer votre email
- Accepter les termes
- Choisir "2" pour rediriger HTTP → HTTPS

#### 3. Renouvellement Automatique

```bash
# Tester le renouvellement
sudo certbot renew --dry-run

# Le renouvellement automatique est déjà configuré via cron
```

---

## 🔍 Étape 8 : Vérification et Tests

### 1. Vérifier les Conteneurs

```bash
docker-compose ps

# Devrait afficher :
# comptabilite_postgres   running
# comptabilite_backend    running
# comptabilite_frontend   running
```

### 2. Vérifier les Logs

```bash
# Tous les logs
docker-compose logs

# Logs d'un service spécifique
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres

# Suivre les logs en temps réel
docker-compose logs -f
```

### 3. Tester l'Application

**Sans Nginx Reverse Proxy** :
- Frontend : `http://VOTRE_IP:3000`
- Backend : `http://VOTRE_IP:8000`
- API Docs : `http://VOTRE_IP:8000/docs`

**Avec Nginx Reverse Proxy** :
- Application : `http://VOTRE_IP` ou `http://VOTRE_DOMAINE.com`
- API Docs : `http://VOTRE_IP/docs`

### 4. Tester la Connexion

- [ ] Ouvrir l'application dans un navigateur
- [ ] Se connecter avec l'utilisateur admin
- [ ] Créer une transaction de test
- [ ] Vérifier que les données persistent après redémarrage

---

## 🔄 Étape 9 : Maintenance et Mises à Jour

### Mettre à Jour l'Application

```bash
cd ~/apps/comptabilite

# Récupérer les dernières modifications
git pull origin main

# Redéployer
./deploy.sh
```

### Sauvegarder la Base de Données

```bash
# Créer un script de backup
nano ~/backup_db.sh
```

```bash
#!/bin/bash

BACKUP_DIR=~/backups
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="comptabilite_backup_$DATE.sql"

mkdir -p $BACKUP_DIR

docker exec comptabilite_postgres pg_dump -U comptabilite_user comptabilite_db > $BACKUP_DIR/$BACKUP_FILE

# Compresser
gzip $BACKUP_DIR/$BACKUP_FILE

echo "✅ Backup créé : $BACKUP_DIR/$BACKUP_FILE.gz"

# Garder seulement les 7 derniers backups
find $BACKUP_DIR -name "*.gz" -mtime +7 -delete
```

```bash
chmod +x ~/backup_db.sh

# Tester le backup
~/backup_db.sh
```

### Automatiser les Backups (Cron)

```bash
crontab -e
```

Ajouter :
```cron
# Backup quotidien à 2h du matin
0 2 * * * /home/azureuser/backup_db.sh >> /home/azureuser/backup.log 2>&1
```

### Restaurer une Sauvegarde

```bash
# Décompresser
gunzip ~/backups/comptabilite_backup_YYYYMMDD_HHMMSS.sql.gz

# Restaurer
docker exec -i comptabilite_postgres psql -U comptabilite_user comptabilite_db < ~/backups/comptabilite_backup_YYYYMMDD_HHMMSS.sql
```

---

## 📊 Étape 10 : Monitoring

### Vérifier l'Utilisation des Ressources

```bash
# CPU et Mémoire
docker stats

# Espace disque
df -h

# Logs Nginx
sudo tail -f /var/log/nginx/comptabilite_access.log
sudo tail -f /var/log/nginx/comptabilite_error.log
```

### Redémarrer les Services

```bash
# Redémarrer tous les conteneurs
docker-compose restart

# Redémarrer un service spécifique
docker-compose restart backend

# Redémarrer Nginx
sudo systemctl restart nginx
```

---

## 🔒 Étape 11 : Sécurité

### 1. Configurer le Firewall

```bash
# Installer UFW
sudo apt install -y ufw

# Autoriser SSH
sudo ufw allow 22/tcp

# Autoriser HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Activer le firewall
sudo ufw enable

# Vérifier le statut
sudo ufw status
```

### 2. Sécuriser SSH

```bash
sudo nano /etc/ssh/sshd_config
```

Modifier :
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Redémarrer SSH :
```bash
sudo systemctl restart sshd
```

### 3. Mettre à Jour Régulièrement

```bash
# Créer un script de mise à jour
nano ~/update_system.sh
```

```bash
#!/bin/bash
sudo apt update
sudo apt upgrade -y
sudo apt autoremove -y
docker system prune -f
```

```bash
chmod +x ~/update_system.sh

# Automatiser (cron hebdomadaire)
crontab -e
```

Ajouter :
```cron
# Mise à jour système tous les dimanches à 3h
0 3 * * 0 /home/azureuser/update_system.sh >> /home/azureuser/update.log 2>&1
```

---

## 🎯 Checklist de Déploiement

### Avant le Déploiement
- [ ] VM Azure créée et accessible
- [ ] Docker et Docker Compose installés
- [ ] Nginx installé
- [ ] Fichiers `.env` configurés
- [ ] Dockerfiles créés
- [ ] docker-compose.yml configuré

### Pendant le Déploiement
- [ ] Code cloné sur la VM
- [ ] Images Docker buildées
- [ ] Conteneurs démarrés
- [ ] Migrations appliquées
- [ ] Utilisateur admin créé

### Après le Déploiement
- [ ] Application accessible via IP publique
- [ ] Connexion fonctionnelle
- [ ] Données persistantes (test redémarrage)
- [ ] Backups configurés
- [ ] Monitoring en place
- [ ] HTTPS configuré (si domaine)

---

## 🐛 Dépannage

### Problème : Conteneur ne démarre pas

```bash
# Voir les logs détaillés
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres

# Redémarrer un conteneur
docker-compose restart backend
```

### Problème : Base de données inaccessible

```bash
# Vérifier que PostgreSQL est démarré
docker-compose ps postgres

# Tester la connexion
docker exec -it comptabilite_postgres psql -U comptabilite_user -d comptabilite_db

# Vérifier les variables d'environnement
docker exec comptabilite_backend env | grep DATABASE
```

### Problème : Frontend ne charge pas

```bash
# Vérifier les logs Nginx
docker-compose logs frontend

# Vérifier la configuration
docker exec comptabilite_frontend cat /etc/nginx/conf.d/default.conf

# Rebuild le frontend
docker-compose build --no-cache frontend
docker-compose up -d frontend
```

### Problème : CORS errors

Vérifier le fichier `backend/.env` :
```env
CORS_ORIGINS=http://VOTRE_IP,http://VOTRE_DOMAINE
```

Redémarrer le backend :
```bash
docker-compose restart backend
```

---

## 💰 Estimation des Coûts Azure

### VM Standard_B2s (2 vCPU, 4 GB RAM)
- **Prix** : ~30-40€/mois
- **Adapté pour** : 10-50 utilisateurs simultanés

### VM Standard_B2ms (2 vCPU, 8 GB RAM)
- **Prix** : ~60-80€/mois
- **Adapté pour** : 50-100 utilisateurs simultanés

### Stockage
- **SSD 30 GB** : ~5€/mois
- **Backup** : ~2€/mois

### Bande Passante
- **Sortie** : Premiers 100 GB gratuits, puis ~0.08€/GB

**Total estimé** : 40-90€/mois selon la taille de VM

---

## 📚 Ressources Utiles

### Documentation
- [Azure VM Docs](https://learn.microsoft.com/azure/virtual-machines/)
- [Docker Docs](https://docs.docker.com/)
- [Nginx Docs](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/)

### Commandes Utiles

```bash
# Voir l'utilisation des ressources
htop  # (installer avec: sudo apt install htop)

# Voir l'espace disque
df -h

# Voir les processus Docker
docker ps -a

# Nettoyer Docker
docker system prune -a

# Redémarrer tous les services
docker-compose restart

# Voir les logs en temps réel
docker-compose logs -f --tail=100
```

---

## 🎉 Félicitations !

Votre application est maintenant déployée sur Azure et accessible depuis n'importe où ! 🚀

**Prochaines étapes recommandées** :
1. Configurer un nom de domaine
2. Activer HTTPS avec Let's Encrypt
3. Configurer les backups automatiques
4. Mettre en place le monitoring
5. Former les utilisateurs

