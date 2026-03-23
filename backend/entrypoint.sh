#!/bin/bash
set -e

echo "========================================="
echo "  Comptabilité Backend - Entrypoint"
echo "========================================="

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until pg_isready -h postgres -U "${POSTGRES_USER:-comptabilite_user}" -d "${POSTGRES_DB:-comptabilite_db}" > /dev/null 2>&1; do
    echo "   PostgreSQL not ready yet, retrying in 2s..."
    sleep 2
done
echo "✅ PostgreSQL is ready!"

# Run Alembic migrations
echo ""
echo "🔄 Running database migrations..."
alembic upgrade head
echo "✅ Migrations applied successfully!"

# Create admin user if not exists
echo ""
echo "👤 Checking admin user..."
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@123}"

python -c "
import os
from sqlalchemy import text
from app.database import SessionLocal
from app.utils.security import hash_password

db = SessionLocal()
admin_email = os.environ.get('ADMIN_EMAIL', 'admin@example.com')
admin_password = os.environ.get('ADMIN_PASSWORD', 'Admin@123')

try:
    result = db.execute(text(\"SELECT COUNT(*) FROM utilisateurs WHERE email = :email\"), {'email': admin_email})
    count = result.scalar()
    if count == 0:
        print(f'   Admin user ({admin_email}) not found, creating...')
        pwd_hash = hash_password(admin_password)
        db.execute(text(\"\"\"
            INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe_hash, role, est_actif, date_creation, date_modification)
            VALUES ('Admin User', :email, :pwd, 'admin', TRUE, NOW(), NOW())
        \"\"\"), {'email': admin_email, 'pwd': pwd_hash})
        db.commit()
        print(f'   ✅ Admin user created ({admin_email})')
    else:
        print(f'   ✅ Admin user already exists ({admin_email})')
except Exception as e:
    print(f'   ⚠️  Could not check/create admin user: {e}')
    db.rollback()
finally:
    db.close()
"

echo ""
echo "========================================="
echo "  🚀 Starting Uvicorn server..."
echo "========================================="

# Start the application
if [ "$ENVIRONMENT" = "development" ]; then
    echo "🛠️ Starting in DEVELOPMENT mode with reload..."
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "🚀 Starting in PRODUCTION mode..."
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
