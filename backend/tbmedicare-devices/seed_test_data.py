import os
import sys
import psycopg
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import env_loader
import db_manager

# Reconfigure stdout for Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

env_loader.load_all_env_files()

DEPARMENTS = [
    ("HSCC", "Khoa Cấp cứu - Hồi sức tích cực - Chống độc"),
    ("NOI_TM", "Khoa Nội tim mạch"),
    ("NGOAI", "Khoa Ngoại - Phẫu thuật - Gây mê hồi sức"),
    ("SAN", "Khoa Chăm sóc sức khỏe sinh sản và Phụ sản"),
    ("NHI", "Khoa Nhi - Sơ sinh")
]

PATIENTS = [
    ("000000111222", "NGUYỄN VĂN AN", "1965-08-15", "Nam", "Chẩn đoán: Suy hô hấp cấp / Viêm phổi nặng"),
    ("000000111223", "TRẦN THỊ BÌNH", "1978-11-20", "Nữ", "Chẩn đoán: Sốc tim / Nhồi máu cơ tim cấp"),
    ("000000111224", "ĐINH VĂN CHIẾN", "1954-03-12", "Nam", "Chẩn đoán: Hậu phẫu ngày thứ 2 cắt dạ dày"),
    ("000000111225", "LÊ THỊ DIỆU", "2026-05-20", "Nữ", "Chẩn đoán: Trẻ sơ sinh non tháng suy hô hấp nhẹ"),
    ("000000111226", "HOÀNG VĂN HẢI", "1990-09-05", "Nam", "Chẩn đoán: Đa chấn thương do tai nạn giao thông")
]

def seed():
    print("Connecting to tbmedicare_devices to seed test data...")
    db_manager.init_db()
    
    with db_manager.get_connection() as conn:
        with conn.cursor() as cur:
            # Clear old usages and machines
            cur.execute("DELETE FROM device_usages")
            cur.execute("DELETE FROM machines")
            cur.execute("DELETE FROM encounters")
            cur.execute("DELETE FROM patients")
            cur.execute("DELETE FROM departments")
            cur.execute("DELETE FROM sync_runs")
            
            # 1. Insert departments
            print("Seeding departments...")
            dept_ids = {}
            for code, name in DEPARMENTS:
                cur.execute(
                    "INSERT INTO departments (code, name, updated_at) VALUES (%s, %s, now()) RETURNING id",
                    (code, name)
                )
                dept_ids[code] = cur.fetchone()["id"]
                
            # 2. Insert patients & encounters
            print("Seeding patients and encounters...")
            enc_ids = {}
            for code, name, dob, gender, diagnosis in PATIENTS:
                cur.execute(
                    "INSERT INTO patients (patient_code, full_name, dob, gender, updated_at) VALUES (%s, %s, %s, %s, now()) RETURNING id",
                    (code, name, dob, gender)
                )
                p_id = cur.fetchone()["id"]
                
                # Assign dept based on code
                dept_code = "HSCC"
                if "Hậu phẫu" in diagnosis:
                    dept_code = "NGOAI"
                elif "Sơ sinh" in diagnosis:
                    dept_code = "NHI"
                elif "tim mạch" in diagnosis:
                    dept_code = "NOI_TM"
                    
                d_id = dept_ids[dept_code]
                adm_time = datetime.now() - timedelta(days=3)
                
                cur.execute(
                    "INSERT INTO encounters (his_treatment_code, patient_id, department_id, admission_at, diagnosis, status, updated_at) VALUES (%s, %s, %s, %s, %s, 'active', now()) RETURNING id",
                    (code, p_id, d_id, adm_time, diagnosis)
                )
                enc_ids[code] = cur.fetchone()["id"]
                
            # 3. Seed some machines
            print("Seeding machines...")
            
            # Map categories to their category IDs from DB
            cur.execute("SELECT id, code FROM machine_categories")
            cat_rows = cur.fetchall()
            cat_ids = {r["code"]: r["id"] for r in cat_rows}
            
            machines = [
                ("VENT-01", "Hệ thống oxy lưu lượng dòng cao HFNC HF8", "MAY_THO", "HSCC", "Buồng HSCC 1"),
                ("VENT-02", "Hệ thống oxy lưu lượng dòng cao HFNC AIRVO2", "MAY_THO", "HSCC", "Buồng HSCC 2"),
                ("VENT-03", "Máy giúp thở Puritan Bennett 840", "MAY_THO", "HSCC", "Buồng HSCC 3"),
                ("PUMP-01", "Bơm tiêm điện Terumo TE-SS730(1)", "BOM_TIEM_DIEN", "HSCC", "Buồng HSCC 1"),
                ("PUMP-02", "Bơm tiêm điện Terumo TE-SS730(2)", "BOM_TIEM_DIEN", "HSCC", "Buồng HSCC 2"),
                ("PUMP-03", "Bơm tiêm điện Fresenius Kabi Agilia", "BOM_TIEM_DIEN", "NOI_TM", "Buồng Cấp cứu"),
                ("INF-01", "Máy truyền dịch Terumo TE-112(1)", "MAY_TRUYEN_DICH", "HSCC", "Buồng HSCC 1"),
                ("INF-02", "Máy truyền dịch Mindray BeneFusion VP1", "MAY_TRUYEN_DICH", "NGOAI", "Phòng Hồi tỉnh"),
                ("MON-01", "Monitor theo dõi bệnh nhân Bionet BM5", "MONITOR", "HSCC", "Buồng HSCC 1"),
                ("MON-02", "Monitor theo dõi bệnh nhân Philips Goldway", "MONITOR", "NOI_TM", "Buồng Cấp cứu"),
                ("MON-03", "Monitor theo dõi sản khoa Biston BT-350", "MONITOR", "SAN", "Phòng Đẻ"),
                ("NEB-01", "Máy xông khí dung siêu âm Comfort 2000", "MAY_KHI_DUNG", "NHI", "Phòng Cấp cứu Nhi")
            ]
            
            mach_ids = {}
            for code, name, cat, dept, room in machines:
                c_id = cat_ids[cat]
                d_id = dept_ids[dept]
                cur.execute(
                    "INSERT INTO machines (machine_code, machine_name, category_id, department_id, room_code, status, is_active, updated_at) VALUES (%s, %s, %s, %s, %s, 'available', TRUE, now()) RETURNING id",
                    (code, name, c_id, d_id, room)
                )
                mach_ids[code] = cur.fetchone()["id"]
                
            # 4. Insert active device usages
            print("Seeding device usages...")
            now = datetime.now()
            
            usages = [
                # Nguyễn Văn An (000000111222) - HSCC
                ("000000111222", "VENT-01", "Hệ thống oxy dòng cao HFNC", now - timedelta(days=2), None, "in_use", "BS. Nguyễn Văn Hùng", "HSCC"),
                ("000000111222", "PUMP-01", "Bơm tiêm điện định lượng", now - timedelta(days=1), None, "in_use", "BS. Nguyễn Văn Hùng", "HSCC"),
                ("000000111222", "MON-01", "Monitor theo dõi 5 thông số", now - timedelta(days=2), None, "in_use", "BS. Nguyễn Văn Hùng", "HSCC"),
                
                # Trần Thị Bình (000000111223) - NOI_TM
                ("000000111223", "PUMP-03", "Bơm tiêm điện định lượng", now - timedelta(hours=12), None, "in_use", "BS. Trần Thanh Hải", "NOI_TM"),
                ("000000111223", "MON-02", "Monitor theo dõi 5 thông số", now - timedelta(hours=18), None, "in_use", "BS. Trần Thanh Hải", "NOI_TM"),
                
                # Đinh Văn Chiến (000000111224) - NGOAI
                ("000000111224", "INF-02", "Máy truyền dịch tự động", now - timedelta(hours=6), now - timedelta(hours=2), "completed", "BS. Lê Quang Minh", "NGOAI"),
                
                # Lê Thị Diệu (000000111225) - NHI
                ("000000111225", "NEB-01", "Xông khí dung mũi họng", now - timedelta(hours=4), None, "in_use", "BS. Phạm Thị Hương", "NHI")
            ]
            
            for p_code, m_code, service, start, end, status, doctor, dept in usages:
                e_id = enc_ids[p_code]
                m_id = mach_ids[m_code]
                
                cur.execute(
                    """
                    INSERT INTO device_usages (encounter_id, machine_id, service_name, started_at, ended_at, quantity, status, ordered_by_name, department_code, updated_at)
                    VALUES (%s, %s, %s, %s, %s, 1.0, %s, %s, %s, now())
                    """,
                    (e_id, m_id, service, start, end, status, doctor, dept)
                )
                
                # Update machine status if in use
                if status == "in_use":
                    cur.execute("UPDATE machines SET status = 'in_use' WHERE id = %s", (m_id,))
            
            # 5. Insert a successful sync run using correct interval SQL
            cur.execute(
                "INSERT INTO sync_runs (started_at, finished_at, status, total_records, changed_records) VALUES (now() - interval '5 minutes', now() - interval '4 minutes', 'success', 24, 6)"
            )
            
        conn.commit()
    print("Test data seeded successfully!")

if __name__ == "__main__":
    seed()
