import sqlite3
import os

db_path = "./data/career_copilot.db"
if not os.path.exists(db_path):
    print(f"Database not found at {db_path}. Assuming it will be created by main.py later.")
    exit(0)

conn = sqlite3.connect(db_path)
c = conn.cursor()

try:
    c.execute("ALTER TABLE users ADD COLUMN is_verified BOOLEAN DEFAULT 0")
    print("Added is_verified column")
except sqlite3.OperationalError as e:
    print(f"Error adding is_verified: {e}")

try:
    c.execute("ALTER TABLE users ADD COLUMN verification_token VARCHAR")
    print("Added verification_token column")
except sqlite3.OperationalError as e:
    print(f"Error adding verification_token: {e}")
    
try:
    c.execute("ALTER TABLE users ADD COLUMN reset_password_token VARCHAR")
    print("Added reset_password_token column")
except sqlite3.OperationalError as e:
    print(f"Error adding reset_password_token: {e}")
    
try:
    c.execute("ALTER TABLE users ADD COLUMN reset_password_expires DATETIME")
    print("Added reset_password_expires column")
except sqlite3.OperationalError as e:
    print(f"Error adding reset_password_expires: {e}")

conn.commit()
conn.close()
print("Database updated!")
