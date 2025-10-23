from app.db.utils import get_connection

conn=get_connection()
cur=conn.cursor()
cur.execute('SELECT id, user_id, title, completed FROM tasks ORDER BY id DESC LIMIT 50;')
rows = cur.fetchall()
for r in rows:
    try:
        print(dict(r))
    except Exception:
        print(r)
cur.close()
conn.close()
