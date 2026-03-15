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
python -c "
from sqlalchemy import text
from app.database import SessionLocal
db = SessionLocal()
try:
    result = db.execute(text(\"SELECT COUNT(*) FROM utilisateurs WHERE email = 'admin@example.com'\"))
    count = result.scalar()
    if count == 0:
        print('   Admin user not found, creating...')
        from app.utils.security import hash_password
        password_hash = hash_password('Admin@123')
        db.execute(text(\"\"\"
            INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe_hash, role, est_actif, date_creation, date_modification)
            VALUES ('Admin User', 'admin@example.com', :pwd, 'admin', TRUE, NOW(), NOW())
        \"\"\"), {'pwd': password_hash})
        db.commit()
        print('   ✅ Admin user created (admin@example.com / Admin@123)')
    else:
        print('   ✅ Admin user already exists')
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
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
