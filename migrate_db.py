import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))
from backend.database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE employees ADD COLUMN shift_start VARCHAR(5) DEFAULT '09:00';"))
        conn.execute(text("ALTER TABLE employees ADD COLUMN shift_end VARCHAR(5) DEFAULT '17:00';"))
        conn.commit()
        print("Columns added successfully.")
    except Exception as e:
        print(f"Error: {e}")
