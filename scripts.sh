#!/bin/bash
# Script bash pour gérer Docker Compose (WSL/Linux)
# Usage: ./scripts.sh [start|stop|restart|status|logs]

ACTION=${1:-start}

case $ACTION in
    start)
        echo "🚀 Démarrage de PostgreSQL..."
        docker-compose up -d postgres
        if [ $? -eq 0 ]; then
            echo "✅ PostgreSQL démarré avec succès!"
            echo "📊 Vérification de l'état..."
            sleep 3
            docker-compose ps
        else
            echo "❌ Erreur lors du démarrage de PostgreSQL"
            exit 1
        fi
        ;;
    stop)
        echo "🛑 Arrêt de PostgreSQL..."
        docker-compose stop postgres
        if [ $? -eq 0 ]; then
            echo "✅ PostgreSQL arrêté avec succès!"
        else
            echo "❌ Erreur lors de l'arrêt de PostgreSQL"
            exit 1
        fi
        ;;
    restart)
        echo "🔄 Redémarrage de PostgreSQL..."
        docker-compose stop postgres
        sleep 2
        docker-compose up -d postgres
        ;;
    status)
        echo "📊 État des conteneurs:"
        docker-compose ps
        ;;
    logs)
        echo "📋 Logs PostgreSQL (Ctrl+C pour quitter):"
        docker-compose logs -f postgres
        ;;
    *)
        echo "Usage: ./scripts.sh [start|stop|restart|status|logs]"
        exit 1
        ;;
esac

