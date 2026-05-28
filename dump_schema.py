import sys
import os
from sqlalchemy.schema import CreateTable
from sqlalchemy import create_mock_engine

# Path setup to find app
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.database import Base
# Import models to register them with Base
import app.models

def dump(sql, *multiparams, **params):
    print(str(sql.compile(dialect=engine.dialect)) + ";")

# Use a mock engine to get the Postgres DDL
engine = create_mock_engine("postgresql://", dump)

print("BEGIN;")
for table in Base.metadata.sorted_tables:
    print(f"-- Table: {table.name}")
    print(str(CreateTable(table).compile(dialect=engine.dialect)) + ";")

# Inject initial admin user (Admin123!)
print("\n-- Initial Admin User")
print("INSERT INTO utilisateurs (nom_utilisateur, email, mot_de_passe_hash, role, est_actif)")
print("VALUES ('Admin User', 'your-email@example.com', '$2b$12$O451vUQSekbPkMlSmHt.feS4.mhcYcOujPR41uAY2v.UZAoDfoqEy', 'admin', true);")

print("COMMIT;")
