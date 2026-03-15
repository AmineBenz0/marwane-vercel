#!/bin/bash
#
# start.sh — Single entry point to start the Comptabilité application.
#
# Usage:
#   ./start.sh              Start all services (default)
#   ./start.sh --build      Force rebuild Docker images before starting
#   ./start.sh --stop       Stop all services
#   ./start.sh --restart    Restart all services
#   ./start.sh --status     Show status of all services
#   ./start.sh --logs       Follow logs from all services
#   ./start.sh --reset      Stop, remove volumes, and start fresh
#

set -e

# ─── Configuration ───────────────────────────────────────────────────
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.local"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# ─── Helper Functions ────────────────────────────────────────────────

print_banner() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${WHITE}   📊 Comptabilité — Application Startup     ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
    echo ""
}

print_urls() {
    echo ""
    echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${WHITE}   Application URLs                           ${CYAN}║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  Frontend:    ${GREEN}http://localhost:3000${NC}           ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  Backend API: ${GREEN}http://localhost:8000${NC}           ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  API Docs:    ${GREEN}http://localhost:8000/docs${NC}      ${CYAN}║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${WHITE}   Login Credentials                           ${CYAN}║${NC}"
    echo -e "${CYAN}╠══════════════════════════════════════════════╣${NC}"
    echo -e "${CYAN}║${NC}  Email:    ${YELLOW}admin@example.com${NC}                ${CYAN}║${NC}"
    echo -e "${CYAN}║${NC}  Password: ${YELLOW}Admin@123${NC}                        ${CYAN}║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
    echo ""
}

compose_cmd() {
    if [ -f "$ENV_FILE" ]; then
        docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
    else
        docker compose -f "$COMPOSE_FILE" "$@"
    fi
}

wait_for_healthy() {
    local service="$1"
    local max_wait="${2:-120}"
    local elapsed=0

    echo -ne "   ⏳ Waiting for ${service} to be healthy..."
    while [ $elapsed -lt $max_wait ]; do
        local health
        health=$(docker inspect --format='{{.State.Health.Status}}' "comptabilite_${service}" 2>/dev/null || echo "not_found")

        if [ "$health" = "healthy" ]; then
            echo -e " ${GREEN}✅${NC}"
            return 0
        fi

        sleep 3
        elapsed=$((elapsed + 3))
        echo -ne "."
    done

    echo -e " ${RED}❌ Timeout after ${max_wait}s${NC}"
    return 1
}

# ─── Commands ────────────────────────────────────────────────────────

do_start() {
    local build_flag="$1"

    print_banner

    # Check Docker is running
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}❌ Docker is not running. Please start Docker Desktop first.${NC}"
        exit 1
    fi

    # Check for .env.local
    if [ ! -f "$ENV_FILE" ]; then
        echo -e "${YELLOW}⚠️  No ${ENV_FILE} found. Using defaults from docker-compose.yml.${NC}"
        echo -e "${YELLOW}   To customize, run: cp .env.example .env.local${NC}"
        echo ""
    fi

    # Step 1: Build & Start
    echo -e "${CYAN}[1/4]${NC} 🐳 Starting Docker services..."
    if [ "$build_flag" = "--build" ]; then
        echo -e "       ${YELLOW}(Rebuilding images...)${NC}"
        compose_cmd up -d --build
    else
        compose_cmd up -d
    fi

    # Step 2: Wait for PostgreSQL
    echo -e "${CYAN}[2/4]${NC} 🗄️  Waiting for PostgreSQL..."
    wait_for_healthy "postgres" 60

    # Step 3: Wait for Backend (entrypoint handles migrations + admin creation)
    echo -e "${CYAN}[3/4]${NC} 🔧 Waiting for Backend (migrations + admin setup)..."
    wait_for_healthy "backend" 120

    # Step 4: Show status
    echo -e "${CYAN}[4/4]${NC} 📊 Service Status:"
    echo ""
    compose_cmd ps
    print_urls

    echo -e "${GREEN}🎉 Application is ready!${NC}"
    echo ""
    echo -e "Useful commands:"
    echo -e "  ${WHITE}./start.sh --logs${NC}      Follow live logs"
    echo -e "  ${WHITE}./start.sh --status${NC}    Check service status"
    echo -e "  ${WHITE}./start.sh --stop${NC}      Stop all services"
    echo -e "  ${WHITE}./start.sh --restart${NC}   Restart all services"
    echo ""
}

do_stop() {
    echo -e "${YELLOW}🛑 Stopping all services...${NC}"
    compose_cmd down
    echo -e "${GREEN}✅ All services stopped.${NC}"
}

do_restart() {
    echo -e "${CYAN}🔄 Restarting all services...${NC}"
    do_stop
    echo ""
    do_start
}

do_status() {
    echo -e "${CYAN}📊 Service Status:${NC}"
    echo ""
    compose_cmd ps
}

do_logs() {
    echo -e "${CYAN}📋 Following logs (Ctrl+C to exit)...${NC}"
    compose_cmd logs -f
}

do_reset() {
    echo -e "${RED}⚠️  WARNING: This will delete all data (database volumes) and start fresh.${NC}"
    read -p "Are you sure? (y/N): " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        echo -e "${YELLOW}🧹 Removing all containers and volumes...${NC}"
        compose_cmd down -v
        echo -e "${GREEN}✅ Cleaned up. Starting fresh...${NC}"
        echo ""
        do_start "--build"
    else
        echo -e "${YELLOW}Cancelled.${NC}"
    fi
}

# ─── Main ────────────────────────────────────────────────────────────

case "${1:-}" in
    --stop)     do_stop ;;
    --restart)  do_restart ;;
    --status)   do_status ;;
    --logs)     do_logs ;;
    --reset)    do_reset ;;
    --build)    do_start "--build" ;;
    --help|-h)
        echo "Usage: ./start.sh [OPTION]"
        echo ""
        echo "Options:"
        echo "  (none)       Start all services"
        echo "  --build      Start with forced image rebuild"
        echo "  --stop       Stop all services"
        echo "  --restart    Restart all services"
        echo "  --status     Show service status"
        echo "  --logs       Follow live logs"
        echo "  --reset      Full reset (removes data!)"
        echo "  --help       Show this help"
        ;;
    "")         do_start ;;
    *)
        echo -e "${RED}Unknown option: $1${NC}"
        echo "Run './start.sh --help' for usage."
        exit 1
        ;;
esac
