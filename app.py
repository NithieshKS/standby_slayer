
from flask import Flask, render_template, request, jsonify
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

app = Flask(__name__)
DB_PATH = Path(__file__).with_name("standby_slayer.db")

DEFAULT_DEVICES = [
    ("TV / Streaming Setup", "Living Room", 4.0),
    ("Gaming Console", "Living Room", 10.0),
    ("Desk Monitor", "Study Area", 3.0),
    ("Air-conditioner", "Bedroom", 2.0),
    ("Chargers & Adapters", "Bedroom", 2.5),
    ("Kitchen Counter Appliances", "Kitchen", 4.5),
]

OVERNIGHT_HOURS = 8

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            room TEXT NOT NULL,
            standby_watts REAL NOT NULL DEFAULT 2,
            active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS logs (
            day TEXT NOT NULL,
            device_id INTEGER NOT NULL,
            done INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (day, device_id),
            FOREIGN KEY(device_id) REFERENCES devices(id)
        );

        CREATE TABLE IF NOT EXISTS missions (
            day TEXT PRIMARY KEY,
            completed_at TEXT NOT NULL,
            kwh_saved REAL NOT NULL DEFAULT 0,
            device_count_at_completion INTEGER NOT NULL DEFAULT 0
        );
    """)
    # Migration for users upgrading from older versions.
    mission_columns = {
        row["name"] for row in conn.execute("PRAGMA table_info(missions)").fetchall()
    }
    if "device_count_at_completion" not in mission_columns:
        conn.execute(
            "ALTER TABLE missions ADD COLUMN device_count_at_completion INTEGER NOT NULL DEFAULT 0"
        )
        # Backfill existing completed missions using the number of devices that were
        # checked off on that date, where possible. This keeps old history sensible.
        conn.execute("""
            UPDATE missions
            SET device_count_at_completion = (
                SELECT COUNT(*)
                FROM logs
                WHERE logs.day = missions.day
                  AND logs.done = 1
            )
            WHERE device_count_at_completion = 0
        """)
        conn.commit()

    count = conn.execute("SELECT COUNT(*) FROM devices").fetchone()[0]
    if count == 0:
        conn.executemany(
            "INSERT INTO devices (name, room, standby_watts) VALUES (?, ?, ?)",
            DEFAULT_DEVICES
        )
    conn.commit()
    conn.close()

def today_str():
    return date.today().isoformat()

def ensure_today_logs(conn):
    day = today_str()
    devices = conn.execute("SELECT id FROM devices WHERE active = 1").fetchall()
    for d in devices:
        conn.execute(
            "INSERT OR IGNORE INTO logs(day, device_id, done) VALUES (?, ?, 0)",
            (day, d["id"])
        )
    conn.commit()

def streak(conn):
    completed = {
        row["day"] for row in conn.execute(
            "SELECT day FROM missions ORDER BY day DESC"
        ).fetchall()
    }
    cursor = date.today()
    if cursor.isoformat() not in completed:
        cursor -= timedelta(days=1)

    count = 0
    while cursor.isoformat() in completed:
        count += 1
        cursor -= timedelta(days=1)
    return count

def best_streak(conn):
    days = [
        datetime.strptime(row["day"], "%Y-%m-%d").date()
        for row in conn.execute("SELECT day FROM missions ORDER BY day ASC").fetchall()
    ]
    if not days:
        return 0
    best = current = 1
    for i in range(1, len(days)):
        if days[i] == days[i-1] + timedelta(days=1):
            current += 1
            best = max(best, current)
        else:
            current = 1
    return best

def stats(conn):
    total = conn.execute("SELECT COUNT(*) FROM missions").fetchone()[0]
    kwh = conn.execute("SELECT COALESCE(SUM(kwh_saved),0) FROM missions").fetchone()[0]
    total_defeated = conn.execute(
        "SELECT COALESCE(SUM(device_count_at_completion),0) FROM missions"
    ).fetchone()[0]
    xp = total * 120
    level = (xp // 500) + 1
    return {
        "streak": streak(conn),
        "best_streak": best_streak(conn),
        "missions_completed": total,
        "estimated_kwh_saved": round(kwh, 2),
        "vampires_defeated": int(total_defeated),
        "xp": xp,
        "level": level,
        "xp_into_level": xp % 500,
        "xp_to_next": 500,
    }

def weekly_history(conn):
    rows = {
        row["day"]: dict(row)
        for row in conn.execute("""
            SELECT day, completed_at, ROUND(kwh_saved, 3) AS kwh_saved
            FROM missions
            WHERE day >= ?
            ORDER BY day ASC
        """, ((date.today() - timedelta(days=6)).isoformat(),)).fetchall()
    }

    result = []
    for offset in range(6, -1, -1):
        d = date.today() - timedelta(days=offset)
        key = d.isoformat()
        if key in rows:
            result.append({
                "day": key,
                "completed": True,
                "kwh_saved": rows[key]["kwh_saved"],
            })
        else:
            result.append({
                "day": key,
                "completed": False,
                "kwh_saved": 0,
            })
    return result

@app.route("/")
def index():
    return render_template("index.html")

@app.get("/api/state")
def api_state():
    conn = get_db()
    ensure_today_logs(conn)
    rows = conn.execute("""
        SELECT d.id, d.name, d.room, d.standby_watts, l.done
        FROM devices d
        LEFT JOIN logs l ON l.device_id = d.id AND l.day = ?
        WHERE d.active = 1
        ORDER BY d.id
    """, (today_str(),)).fetchall()

    mission = conn.execute(
        "SELECT * FROM missions WHERE day = ?", (today_str(),)
    ).fetchone()

    payload = {
        "day": today_str(),
        "devices": [dict(r) for r in rows],
        "completed": mission is not None,
        "stats": stats(conn),
        "weekly": weekly_history(conn),
        "overnight_hours": OVERNIGHT_HOURS,
    }
    conn.close()
    return jsonify(payload)

@app.post("/api/toggle/<int:device_id>")
def api_toggle(device_id):
    data = request.get_json(force=True)
    done = 1 if data.get("done") else 0
    conn = get_db()
    ensure_today_logs(conn)
    conn.execute(
        "UPDATE logs SET done = ? WHERE day = ? AND device_id = ?",
        (done, today_str(), device_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.post("/api/complete")
def api_complete():
    conn = get_db()
    ensure_today_logs(conn)

    counts = conn.execute("""
        SELECT COUNT(*) AS total,
               SUM(CASE WHEN l.done = 1 THEN 1 ELSE 0 END) AS done_count
        FROM devices d
        JOIN logs l ON l.device_id = d.id
        WHERE d.active = 1 AND l.day = ?
    """, (today_str(),)).fetchone()

    if counts["total"] == 0 or counts["done_count"] != counts["total"]:
        conn.close()
        return jsonify({"ok": False, "error": "Finish every active item first."}), 400

    watts = conn.execute(
        "SELECT COALESCE(SUM(standby_watts),0) FROM devices WHERE active = 1"
    ).fetchone()[0]
    kwh_saved = (watts * OVERNIGHT_HOURS) / 1000

    completed_devices = int(counts["done_count"] or 0)

    conn.execute("""
        INSERT INTO missions(day, completed_at, kwh_saved, device_count_at_completion)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(day) DO UPDATE SET
            completed_at = excluded.completed_at,
            kwh_saved = excluded.kwh_saved,
            device_count_at_completion = excluded.device_count_at_completion
    """, (
        today_str(),
        datetime.now().isoformat(timespec="seconds"),
        kwh_saved,
        completed_devices
    ))
    conn.commit()
    payload = {
        "ok": True,
        "stats": stats(conn),
        "kwh_saved_today": round(kwh_saved, 3),
        "weekly": weekly_history(conn),
    }
    conn.close()
    return jsonify(payload)

@app.post("/api/device")
def api_add_device():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()
    room = (data.get("room") or "Other").strip()
    try:
        watts = float(data.get("standby_watts") or 2)
    except ValueError:
        watts = 2.0

    if not name:
        return jsonify({"ok": False, "error": "Device name is required."}), 400

    watts = max(0.1, min(watts, 100.0))
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO devices(name, room, standby_watts) VALUES (?, ?, ?)",
        (name, room, watts)
    )
    conn.commit()
    device_id = cur.lastrowid
    conn.execute(
        "INSERT OR IGNORE INTO logs(day, device_id, done) VALUES (?, ?, 0)",
        (today_str(), device_id)
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.delete("/api/device/<int:device_id>")
def api_delete_device(device_id):
    conn = get_db()
    conn.execute("UPDATE devices SET active = 0 WHERE id = ?", (device_id,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.get("/api/history")
def api_history():
    conn = get_db()
    rows = conn.execute("""
        SELECT day, completed_at, ROUND(kwh_saved, 3) AS kwh_saved
        FROM missions
        ORDER BY day DESC
        LIMIT 14
    """).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.post("/api/reset-today")
def api_reset_today():
    conn = get_db()
    conn.execute("DELETE FROM missions WHERE day = ?", (today_str(),))
    conn.execute("UPDATE logs SET done = 0 WHERE day = ?", (today_str(),))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

if __name__ == "__main__":
    init_db()
    app.run(debug=True)
