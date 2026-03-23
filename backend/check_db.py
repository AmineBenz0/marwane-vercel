from sqlalchemy import create_engine, inspect
from app.config import settings

try:
    engine = create_engine(settings.DATABASE_URL)
    inspector = inspect(engine)

    print("Tables in DB:", inspector.get_table_names())
    if 'caisse' in inspector.get_table_names():
        columns = [c['name'] for c in inspector.get_columns('caisse')]
        print("Columns in 'caisse':", columns)
        if 'id_charge' in columns:
            print("SUCCESS: id_charge exists")
        else:
            print("ERROR: id_charge is MISSING")
    else:
        print("ERROR: caisse table not found")
except Exception as e:
    print(f"FAILED to connect: {e}")
