import requests
import sqlite3

conn = sqlite3.connect('data/career_copilot.db')
c = conn.cursor()
c.execute("SELECT id, email FROM users LIMIT 1")
user = c.fetchone()
conn.close()

if not user:
    print("No users found")
    exit()

print(f"User: {user[1]}")

# Since we don't know the plain password, we can generate a new token by bypassing the password check, or we can just send a query directly to the app without passing through HTTP
