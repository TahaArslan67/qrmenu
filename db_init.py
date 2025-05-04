import sqlite3

conn = sqlite3.connect('menu.db')
c = conn.cursor()
c.execute('''CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
)''')
c.execute('''CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL,
    image TEXT,
    category_id INTEGER,
    FOREIGN KEY(category_id) REFERENCES categories(id)
)''')
conn.commit()
conn.close()
