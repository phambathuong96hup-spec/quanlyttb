import hashlib
import json
import os
import sys
import atexit
from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

import psycopg
from psycopg import OperationalError
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import env_loader

env_loader.load_all_env_files()

DATABASE_URL = os.getenv(
    "DEVICES_DATABASE_URL",
    "postgresql://postgres:postgres@127.0.0.1:5432/tbmedicare_devices",
)
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")

_pool = None

def _get_pool():
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            DATABASE_URL,
            min_size=0,
            max_size=10,
            open=False,
            timeout=15.0,
            reconnect_timeout=60.0,
            max_lifetime=600.0,
            kwargs={"row_factory": dict_row},
        )
        _pool.open(wait=True, timeout=15.0)
    return _pool

def close_pool():
    global _pool
    if _pool is not None:
        try:
            _pool.close()
        except Exception:
            pass
        _pool = None

atexit.register(close_pool)

@contextmanager
def get_connection():
    try:
        with _get_pool().connection() as conn:
            yield conn
    except OperationalError:
        # Reset pool once on database connection error
        global _pool
        if _pool is not None:
            try:
                _pool.close()
            except Exception:
                pass
            _pool = None
        import time
        time.sleep(2)
        with _get_pool().connection() as conn:
            yield conn

def init_db():
    if not os.path.exists(SCHEMA_PATH):
        return
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema_sql = f.read()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_lock(hashtext('tbmedicare_devices_init'))")
        try:
            with conn.cursor() as cur:
                statements = [stmt.strip() for stmt in schema_sql.split(";") if stmt.strip()]
                for stmt in statements:
                    cur.execute(stmt)
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            with conn.cursor() as cur:
                cur.execute("SELECT pg_advisory_unlock(hashtext('tbmedicare_devices_init'))")
            conn.commit()

# --- Helper functions ---

def _ensure_department(conn, code, name=None):
    if not code:
        code = "UNASSIGNED"
    dept_name = name or code
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO departments (code, name, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
            RETURNING id
            """,
            (code, dept_name),
        )
        return cur.fetchone()["id"]

def _ensure_patient(conn, patient_code, full_name, dob=None, gender=None):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO patients (patient_code, full_name, dob, gender, updated_at)
            VALUES (%s, %s, %s, %s, now())
            ON CONFLICT (patient_code) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                dob = COALESCE(EXCLUDED.dob, patients.dob),
                gender = COALESCE(EXCLUDED.gender, patients.gender),
                updated_at = now()
            RETURNING id
            """,
            (patient_code, full_name, dob, gender),
        )
        return cur.fetchone()["id"]

def _ensure_machine_category(conn, code, name):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO machine_categories (code, name, updated_at)
            VALUES (%s, %s, now())
            ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
            RETURNING id
            """,
            (code, name),
        )
        return cur.fetchone()["id"]

# --- Sync operations ---

def upsert_machine(conn, machine_code, machine_name, category_code, category_name, department_code=None, department_name=None, room_code=None, status="available", is_active=True):
    category_id = _ensure_machine_category(conn, category_code, category_name)
    dept_id = _ensure_department(conn, department_code, department_name) if department_code else None
    
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO machines (machine_code, machine_name, category_id, department_id, room_code, status, is_active, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (machine_code) DO UPDATE SET
                machine_name = EXCLUDED.machine_name,
                category_id = COALESCE(EXCLUDED.category_id, machines.category_id),
                department_id = COALESCE(EXCLUDED.department_id, machines.department_id),
                room_code = COALESCE(EXCLUDED.room_code, machines.room_code),
                status = EXCLUDED.status,
                is_active = EXCLUDED.is_active,
                updated_at = now()
            RETURNING id
            """,
            (machine_code, machine_name, category_id, dept_id, room_code, status, is_active),
        )
        return cur.fetchone()["id"]

def upsert_encounter(conn, his_treatment_code, patient_code, patient_name, dob=None, gender=None, department_code=None, department_name=None, status="active", diagnosis=None, admission_at=None, discharge_at=None):
    patient_id = _ensure_patient(conn, patient_code, patient_name, dob, gender)
    dept_id = _ensure_department(conn, department_code, department_name)
    
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO encounters (his_treatment_code, patient_id, department_id, admission_at, discharge_at, diagnosis, status, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (his_treatment_code) DO UPDATE SET
                patient_id = EXCLUDED.patient_id,
                department_id = COALESCE(EXCLUDED.department_id, encounters.department_id),
                admission_at = COALESCE(EXCLUDED.admission_at, encounters.admission_at),
                discharge_at = COALESCE(EXCLUDED.discharge_at, encounters.discharge_at),
                diagnosis = COALESCE(EXCLUDED.diagnosis, encounters.diagnosis),
                status = EXCLUDED.status,
                updated_at = now()
            RETURNING id
            """,
            (his_treatment_code, patient_id, dept_id, admission_at, discharge_at, diagnosis, status),
        )
        return cur.fetchone()["id"]

def replace_device_usages(conn, encounter_id, usages):
    """Sync usages for a patient by checking for changes and replacing them."""
    with conn.cursor() as cur:
        # First, mark existing usages that are not in the new list as completed/cancelled
        # or delete them if we want a complete replacement.
        # For simplicity and accurate tracking of active/inactive, we delete old in_use/completed
        # that matched the same encounter and recreate them to ensure correctness.
        cur.execute("DELETE FROM device_usages WHERE encounter_id = %s", (encounter_id,))
        
        for u in usages:
            cur.execute(
                """
                INSERT INTO device_usages (
                    encounter_id, machine_id, his_sere_serv_id, service_name,
                    started_at, ended_at, quantity, status, ordered_by_name,
                    department_code, note, source_hash, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                """,
                (
                    encounter_id,
                    u["machine_id"],
                    u.get("his_sere_serv_id"),
                    u.get("service_name"),
                    u.get("started_at"),
                    u.get("ended_at"),
                    u.get("quantity", 1.0),
                    u.get("status", "in_use"),
                    u.get("ordered_by_name"),
                    u.get("department_code"),
                    u.get("note"),
                    u.get("source_hash"),
                ),
            )

# --- Sync runs log ---

def start_sync_run():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sync_runs (started_at, status)
                VALUES (now(), 'running')
                RETURNING id
                """
            )
            row = cur.fetchone()
            conn.commit()
            return row["id"]

def finish_sync_run(run_id, status="success", total=0, changed=0, error=None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE sync_runs
                SET finished_at = now(), status = %s, total_records = %s, changed_records = %s, error_message = %s
                WHERE id = %s
                """,
                (status, total, changed, error, run_id)
            )
            conn.commit()

# --- Query functions for API ---

def get_dashboard_stats(dept_code=None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Stats: BN dung thiet bi, may hoat dong, may trong
            # 1. Total patients currently using devices
            q1 = "SELECT COUNT(DISTINCT encounter_id) as count FROM device_usages WHERE status = 'in_use'"
            p1 = []
            if dept_code:
                q1 += " AND department_code = %s"
                p1.append(dept_code)
            cur.execute(q1, tuple(p1))
            patients_using = cur.fetchone()["count"]
            
            # 2. Total active machines
            q2 = "SELECT COUNT(*) as count FROM machines WHERE is_active = TRUE"
            p2 = []
            if dept_code:
                # Get department id first
                cur.execute("SELECT id FROM departments WHERE code = %s", (dept_code,))
                row = cur.fetchone()
                if row:
                    q2 += " AND department_id = %s"
                    p2.append(row["id"])
            cur.execute(q2, tuple(p2))
            total_machines = cur.fetchone()["count"]
            
            # 3. Machines in use
            q3 = "SELECT COUNT(DISTINCT machine_id) as count FROM device_usages WHERE status = 'in_use'"
            p3 = []
            if dept_code:
                q3 += " AND department_code = %s"
                p3.append(dept_code)
            cur.execute(q3, tuple(p3))
            machines_in_use = cur.fetchone()["count"]
            
            # 4. Available machines
            machines_available = max(0, total_machines - machines_in_use)
            
            # 5. Stats by category
            q5 = """
                SELECT c.code, c.name, COUNT(DISTINCT u.id) as count 
                FROM device_usages u 
                JOIN machines m ON m.id = u.machine_id 
                JOIN machine_categories c ON c.id = m.category_id 
                WHERE u.status = 'in_use'
            """
            p5 = []
            if dept_code:
                q5 += " AND u.department_code = %s"
                p5.append(dept_code)
            q5 += " GROUP BY c.code, c.name"
            cur.execute(q5, tuple(p5))
            categories_stats = cur.fetchall()
            
            return {
                "patients_using": patients_using,
                "machines_total": total_machines,
                "machines_in_use": machines_in_use,
                "machines_available": machines_available,
                "categories": categories_stats
            }

def get_in_use_devices(dept_code=None, category_code=None, search=None, page=1, limit=50):
    offset = (page - 1) * limit
    with get_connection() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT 
                    u.id as usage_id,
                    u.started_at,
                    u.service_name,
                    u.ordered_by_name,
                    u.department_code,
                    m.machine_code,
                    m.machine_name,
                    c.name as category_name,
                    c.code as category_code,
                    e.his_treatment_code,
                    d.name as department_name
                FROM device_usages u
                JOIN machines m ON m.id = u.machine_id
                JOIN machine_categories c ON c.id = m.category_id
                JOIN encounters e ON e.id = u.encounter_id
                JOIN patients p ON p.id = e.patient_id
                LEFT JOIN departments d ON d.code = u.department_code
                WHERE u.status = 'in_use'
            """
            params = []
            if dept_code:
                query += " AND u.department_code = %s"
                params.append(dept_code)
            if category_code:
                query += " AND c.code = %s"
                params.append(category_code)
            if search:
                query += " AND (p.full_name ILIKE %s OR p.patient_code ILIKE %s OR e.his_treatment_code ILIKE %s OR m.machine_name ILIKE %s)"
                s_pat = f"%{search}%"
                params.extend([s_pat, s_pat, s_pat, s_pat])
                
            query += " ORDER BY u.started_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            
            cur.execute(query, tuple(params))
            return cur.fetchall()

def get_available_devices(dept_code=None, category_code=None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Get all machines that are NOT in active device_usages
            query = """
                SELECT m.id, m.machine_code, m.machine_name, m.room_code, c.name as category_name, c.code as category_code, d.name as department_name, d.code as department_code
                FROM machines m
                JOIN machine_categories c ON c.id = m.category_id
                LEFT JOIN departments d ON d.id = m.department_id
                WHERE m.is_active = TRUE 
                AND m.id NOT IN (
                    SELECT machine_id FROM device_usages WHERE status = 'in_use'
                )
            """
            params = []
            if dept_code:
                # Find department id
                cur.execute("SELECT id FROM departments WHERE code = %s", (dept_code,))
                row = cur.fetchone()
                if row:
                    query += " AND m.department_id = %s"
                    params.append(row["id"])
            if category_code:
                query += " AND c.code = %s"
                params.append(category_code)
                
            query += " ORDER BY c.name, m.machine_name"
            cur.execute(query, tuple(params))
            return cur.fetchall()

def get_all_machines(category_code=None, search=None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT m.id, m.machine_code, m.machine_name, m.room_code, m.status, m.is_active, 
                       c.name as category_name, c.code as category_code, d.name as department_name
                FROM machines m
                JOIN machine_categories c ON c.id = m.category_id
                LEFT JOIN departments d ON d.id = m.department_id
                WHERE 1=1
            """
            params = []
            if category_code:
                query += " AND c.code = %s"
                params.append(category_code)
            if search:
                query += " AND (m.machine_name ILIKE %s OR m.machine_code ILIKE %s)"
                s_pat = f"%{search}%"
                params.extend([s_pat, s_pat])
                
            query += " ORDER BY m.is_active DESC, m.machine_name"
            cur.execute(query, tuple(params))
            return cur.fetchall()

def get_patient_devices(treatment_code):
    with get_connection() as conn:
        with conn.cursor() as cur:
            # 1. Get patient and encounter details
            cur.execute(
                """
                SELECT e.id as encounter_id, e.his_treatment_code, e.admission_at, e.discharge_at, e.diagnosis, e.status as encounter_status,
                       p.full_name as patient_name, p.patient_code, p.dob, p.gender, p.insurance_code,
                       d.name as department_name, d.code as department_code
                FROM encounters e
                JOIN patients p ON p.id = e.patient_id
                LEFT JOIN departments d ON d.id = e.department_id
                WHERE e.his_treatment_code = %s
                """,
                (treatment_code,),
            )
            patient = cur.fetchone()
            if not patient:
                return None
                
            # 2. Get active and historical devices used by this patient
            cur.execute(
                """
                SELECT u.id as usage_id, u.service_name, u.started_at, u.ended_at, u.quantity, u.status as usage_status, u.ordered_by_name, u.note,
                       m.machine_code, m.machine_name, c.name as category_name, c.code as category_code
                FROM device_usages u
                JOIN machines m ON m.id = u.machine_id
                JOIN machine_categories c ON c.id = m.category_id
                WHERE u.encounter_id = %s
                ORDER BY u.started_at DESC
                """,
                (patient["encounter_id"],),
            )
            usages = cur.fetchall()
            patient["usages"] = usages
            return patient

def get_patients_with_devices(dept_code=None, category_code=None, search=None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT DISTINCT
                    e.his_treatment_code,
                    p.full_name as patient_name,
                    p.patient_code,
                    p.dob,
                    p.gender,
                    d.name as department_name,
                    d.code as department_code,
                    e.diagnosis
                FROM encounters e
                JOIN patients p ON p.id = e.patient_id
                LEFT JOIN departments d ON d.id = e.department_id
                JOIN device_usages u ON u.encounter_id = e.id
                JOIN machines m ON m.id = u.machine_id
                JOIN machine_categories c ON c.id = m.category_id
                WHERE u.status = 'in_use'
            """
            params = []
            if dept_code:
                query += " AND u.department_code = %s"
                params.append(dept_code)
            if category_code:
                query += " AND c.code = %s"
                params.append(category_code)
            if search:
                query += " AND (p.full_name ILIKE %s OR p.patient_code ILIKE %s OR e.his_treatment_code ILIKE %s)"
                s_pat = f"%{search}%"
                params.extend([s_pat, s_pat, s_pat])
                
            query += " ORDER BY p.full_name"
            cur.execute(query, tuple(params))
            return cur.fetchall()

def get_history(dept_code=None, category_code=None, search=None, start_date=None, end_date=None, page=1, limit=50):
    offset = (page - 1) * limit
    with get_connection() as conn:
        with conn.cursor() as cur:
            query = """
                SELECT 
                    u.id as usage_id,
                    u.started_at,
                    u.ended_at,
                    u.service_name,
                    u.quantity,
                    u.status as usage_status,
                    u.ordered_by_name,
                    u.department_code,
                    m.machine_code,
                    m.machine_name,
                    c.name as category_name,
                    c.code as category_code,
                    e.his_treatment_code,
                    p.full_name as patient_name,
                    p.patient_code,
                    d.name as department_name
                FROM device_usages u
                JOIN machines m ON m.id = u.machine_id
                JOIN machine_categories c ON c.id = m.category_id
                JOIN encounters e ON e.id = u.encounter_id
                JOIN patients p ON p.id = e.patient_id
                LEFT JOIN departments d ON d.code = u.department_code
                WHERE 1=1
            """
            params = []
            if dept_code:
                query += " AND u.department_code = %s"
                params.append(dept_code)
            if category_code:
                query += " AND c.code = %s"
                params.append(category_code)
            if search:
                query += " AND (p.full_name ILIKE %s OR p.patient_code ILIKE %s OR e.his_treatment_code ILIKE %s OR m.machine_name ILIKE %s)"
                s_pat = f"%{search}%"
                params.extend([s_pat, s_pat, s_pat, s_pat])
            if start_date:
                query += " AND u.started_at >= %s"
                params.append(start_date)
            if end_date:
                query += " AND u.started_at <= %s"
                params.append(end_date)
                
            query += " ORDER BY u.started_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])
            
            cur.execute(query, tuple(params))
            return cur.fetchall()

def get_sync_status():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT started_at, finished_at, status, total_records, changed_records, error_message
                FROM sync_runs
                ORDER BY started_at DESC
                LIMIT 1
                """
            )
            return cur.fetchone()

def get_categories():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT code, name, description FROM machine_categories ORDER BY name")
            return cur.fetchall()

def get_departments():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT code, name FROM departments WHERE is_active = TRUE ORDER BY name")
            return cur.fetchall()
