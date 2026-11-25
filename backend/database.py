import sqlite3
import json
import os
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "backtest_history.db")

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            scenario_id TEXT NOT NULL,
            scenario_name TEXT NOT NULL,
            algorithm TEXT NOT NULL,
            status TEXT NOT NULL,
            safety_score REAL NOT NULL,
            collision_count INTEGER NOT NULL,
            avg_latency_ms REAL NOT NULL,
            max_deviation_m REAL NOT NULL,
            avg_deviation_m REAL NOT NULL,
            max_jerk REAL NOT NULL,
            duration_sec REAL NOT NULL,
            parameters_json TEXT NOT NULL,
            telemetry_summary_json TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()

def save_run(run_data: Dict[str, Any]) -> str:
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    run_id = run_data.get("id") or str(uuid.uuid4())
    timestamp = run_data.get("timestamp") or datetime.utcnow().isoformat() + "Z"

    cursor.execute("""
        INSERT INTO runs (
            id, timestamp, scenario_id, scenario_name, algorithm,
            status, safety_score, collision_count, avg_latency_ms,
            max_deviation_m, avg_deviation_m, max_jerk, duration_sec,
            parameters_json, telemetry_summary_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        run_id,
        timestamp,
        run_data["scenario_id"],
        run_data["scenario_name"],
        run_data["algorithm"],
        run_data["status"],
        float(run_data["safety_score"]),
        int(run_data["collision_count"]),
        float(run_data["avg_latency_ms"]),
        float(run_data["max_deviation_m"]),
        float(run_data["avg_deviation_m"]),
        float(run_data["max_jerk"]),
        float(run_data["duration_sec"]),
        json.dumps(run_data.get("parameters", {})),
        json.dumps(run_data.get("telemetry_summary", {}))
    ))
    conn.commit()
    conn.close()
    return run_id

def list_runs(limit: int = 50) -> List[Dict[str, Any]]:
    init_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM runs ORDER BY timestamp DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    results = []
    for row in rows:
        item = dict(row)
        try:
            item["parameters"] = json.loads(item["parameters_json"])
        except Exception:
            item["parameters"] = {}
        try:
            item["telemetry_summary"] = json.loads(item["telemetry_summary_json"])
        except Exception:
            item["telemetry_summary"] = {}
        results.append(item)
    conn.close()
    return results

def get_run(run_id: str) -> Optional[Dict[str, Any]]:
    init_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM runs WHERE id = ?", (run_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    item = dict(row)
    try:
        item["parameters"] = json.loads(item["parameters_json"])
    except Exception:
        item["parameters"] = {}
    try:
        item["telemetry_summary"] = json.loads(item["telemetry_summary_json"])
    except Exception:
        item["telemetry_summary"] = {}
    return item

def delete_run(run_id: str) -> bool:
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM runs WHERE id = ?", (run_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    return deleted
