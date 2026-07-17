import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), "backend", "medcrm.db")
print(f"Migrating {db_path}...")
try:
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("ALTER TABLE leads ADD COLUMN followup_date DATETIME;")
    conn.commit()
    conn.close()
    print("Migration successful.")
except Exception as e:
    print(f"Migration error: {e}")
