# Stage 1: Build
FROM node:18-alpine AS builder

# Argument de build pour l'URL de l'API
ARG VITE_API_URL=http://localhost:8000

WORKDIR /app

# Copier package.json et package-lock.json
COPY package*.json ./

# Installer TOUTES les dépendances (y compris devDependencies pour le build)
RUN npm ci

# Copier le code source
COPY . .

# Définir la variable d'environnement pour le build
ENV VITE_API_URL=$VITE_API_URL

# Build de production
RUN npm run build

# Stage 2: Production avec Nginx
FROM nginx:alpine

# Copier les fichiers buildés depuis le stage builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copier la configuration Nginx personnalisée
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Exposer le port 80
EXPOSE 80

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Démarrer Nginx
CMD ["nginx", "-g", "daemon off;"]

