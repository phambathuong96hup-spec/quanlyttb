import hashlib
import json
import os
import sys
import time
import traceback
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import env_loader
from his_client import HisClient
import db_manager

# Reconfigure stdout for Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

env_loader.load_all_env_files()

POLL_INTERVAL = int(os.getenv("DEVICES_POLL_INTERVAL", "120"))

# Keywords to detect bedside medical machines in services rendered
DEVICE_KEYWORDS = {
    "MAY_THO": ["thở máy", "máy thở", "hfnc", "oxy dòng cao", "airvo", "ventilator", "giúp thở"],
    "BOM_TIEM_DIEN": ["bơm tiêm điện", "bơm tiêm", "te ss730", "agilia", "top 5300", "sy5000", "te-ss730", "ip22"],
    "MAY_TRUYEN_DICH": ["truyền dịch", "te-112", "te lf603", "benefusion vp1", "top 2300", "top 3300", "infusia vp7s"],
    "MONITOR": ["monitor theo dõi", "máy theo dõi bệnh nhân", "máy theo dõi", "monitor sản khoa", "fc700", "fc-700", "fm20"],
    "MAY_KHI_DUNG": ["khí dung", "xông khí dung", "ne-c900", "ne-c28", "ne-c29", "ne c900"]
}

# Mapping of HIS Machine groups to our categories
MACHINE_GROUP_MAPPING = {
    "XQ": "KHAC",      # Xquang
    "MXQ": "KHAC",
    "SA": "KHAC",      # Siêu âm
    "NS": "KHAC",      # Nội soi
    "HH": "KHAC",      # Huyết học
    "SH": "KHAC",      # Sinh hóa
    "ĐT": "KHAC",      # Điện tim
    "MĐT": "KHAC",
    "KM": "KHAC",      # Khí máu
    "ĐN": "KHAC",      # Điện não
    "ĐM": "KHAC",      # Đông máu
    "CN": "KHAC"       # Chức năng hô hấp
}

def get_device_category_from_name(service_name):
    """Determine the machine category based on the service name."""
    name_lower = str(service_name or "").lower()
    for cat, keywords in DEVICE_KEYWORDS.items():
        if any(kw in name_lower for kw in keywords):
            # Special check to avoid matching disposable syringes (bơm tiêm nhựa sử dụng 1 lần)
            if cat == "BOM_TIEM_DIEN" and any(x in name_lower for x in ["sử dụng một lần", "sử dụng 1 lần", "nhựa", "kim tiêm", "dây nối", "giấy"]):
                continue
            # Special check to avoid matching disposable tubing or paper
            if cat == "MONITOR" and any(x in name_lower for x in ["giấy in", "băng đo", "bao đo", "cảm biến", "dây nối"]):
                continue
            return cat
    return None

def parse_his_datetime(value):
    if not value:
        return None
    raw = str(value).strip()
    if len(raw) >= 14 and raw[:14].isdigit():
        try:
            return datetime.strptime(raw[:14], "%Y%m%d%H%M%S")
        except ValueError:
            return None
    return None

def hash_dict(d):
    return hashlib.sha256(
        json.dumps(d, ensure_ascii=True, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()

def sync_job():
    print(f"\n=======================================================")
    print(f"BẮT ĐẦU ĐỒNG BỘ: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}")
    print(f"=======================================================")
    
    run_id = db_manager.start_sync_run()
    client = HisClient()
    
    total_records = 0
    changed_records = 0
    
    try:
        # 1. Login to HIS
        if not client.login():
            raise RuntimeError("Không thể đăng nhập vào HIS server")

        # 2. Sync machines from HIS catalog (HisMachine)
        print("\n[1/4] Đồng bộ danh mục máy từ HIS (HisMachine)...")
        machines_raw = client.get_machines(limit=1000)
        print(f"  Tìm thấy {len(machines_raw)} máy trong danh mục HIS.")
        
        with db_manager.get_connection() as conn:
            for m in machines_raw:
                code = m.get("MACHINE_CODE")
                name = m.get("MACHINE_NAME")
                if not code or not name:
                    continue
                    
                group = m.get("MACHINE_GROUP_CODE")
                cat_code = MACHINE_GROUP_MAPPING.get(group, "KHAC")
                
                # Check active status
                is_active = m.get("IS_ACTIVE") == 1
                status = "available" if is_active else "maintenance"
                
                db_manager.upsert_machine(
                    conn=conn,
                    machine_code=code,
                    machine_name=name,
                    category_code=cat_code,
                    category_name="Thiết bị khác" if cat_code == "KHAC" else cat_code.replace("_", " ").title(),
                    department_code=None,
                    department_name=None,
                    room_code=m.get("ROOM_IDS"),
                    status=status,
                    is_active=is_active
                )
                total_records += 1
            conn.commit()
        print("  => Hoàn thành đồng bộ danh mục máy HIS.")

        # 3. Sync active treatments (patients census)
        print("\n[2/4] Đồng bộ danh sách bệnh nhân đang điều trị...")
        active_treatments = client.get_active_treatments(limit=500)
        print(f"  Tìm thấy {len(active_treatments)} bệnh nhân đang điều trị.")
        
        # We will keep track of active encounter IDs to map later
        active_encounter_ids = []
        
        with db_manager.get_connection() as conn:
            for t in active_treatments:
                t_code = t.get("TREATMENT_CODE")
                if not t_code:
                    continue
                    
                p_code = t.get("TDL_PATIENT_CODE") or t.get("PATIENT_CODE") or t_code
                p_name = t.get("VIR_PATIENT_NAME") or t.get("PATIENT_NAME") or "Bệnh nhân ẩn danh"
                
                # Department info
                dept_code = t.get("CURRENT_DEPARTMENT_CODE") or t.get("LAST_DEPARTMENT_CODE") or t.get("DEPARTMENT_CODE") or "UNASSIGNED"
                dept_name = t.get("CURRENT_DEPARTMENT_NAME") or t.get("LAST_DEPARTMENT_NAME") or t.get("DEPARTMENT_NAME") or "Chưa gán khoa"
                
                # Dates
                adm_time = client.normalize_his_datetime(t.get("IN_TIME") or t.get("IN_DATE"))
                
                # Gender and DOB
                gender = t.get("TDL_PATIENT_GENDER_NAME") or t.get("GENDER_NAME") or "Không rõ"
                dob_raw = t.get("TDL_PATIENT_DOB") or t.get("DOB")
                dob = client.normalize_his_date(dob_raw)
                
                diagnosis = t.get("ICD_NAME") or t.get("ICD_TEXT")
                
                # Fetch full clinical details if needed (optional, best-effort)
                try:
                    detail = client.get_treatment_clinical_detail(t_code)
                    if detail:
                        diagnosis = detail.get("ICD_NAME") or detail.get("ICD_TEXT") or diagnosis
                except Exception:
                    pass
                
                encounter_id = db_manager.upsert_encounter(
                    conn=conn,
                    his_treatment_code=t_code,
                    patient_code=p_code,
                    patient_name=p_name,
                    dob=dob,
                    gender=gender,
                    department_code=dept_code,
                    department_name=dept_name,
                    status="active",
                    diagnosis=diagnosis,
                    admission_at=adm_time,
                    discharge_at=None
                )
                active_encounter_ids.append(encounter_id)
                total_records += 1
            conn.commit()
        print(f"  => Hoàn thành đồng bộ {len(active_encounter_ids)} đợt điều trị.")

        # 4. Sync device usages for active patients
        print("\n[3/4] Đồng bộ lịch sử sử dụng thiết bị của bệnh nhân...")
        usages_added_count = 0
        
        with db_manager.get_connection() as conn:
            for idx, t in enumerate(active_treatments):
                t_code = t.get("TREATMENT_CODE")
                p_name = t.get("VIR_PATIENT_NAME")
                dept_code = t.get("CURRENT_DEPARTMENT_CODE") or t.get("LAST_DEPARTMENT_CODE") or t.get("DEPARTMENT_CODE") or "UNASSIGNED"
                dept_name = t.get("CURRENT_DEPARTMENT_NAME") or t.get("LAST_DEPARTMENT_NAME") or t.get("DEPARTMENT_NAME") or "Chưa gán khoa"
                
                # Find encounter_id
                cur = conn.cursor()
                cur.execute("SELECT id FROM encounters WHERE his_treatment_code = %s", (t_code,))
                enc_row = cur.fetchone()
                if not enc_row:
                    continue
                enc_id = enc_row["id"]
                
                # Get service requests
                reqs = client.get_service_requests(t_code)
                if not reqs:
                    continue
                    
                req_ids = [r.get("ID") for r in reqs if r.get("ID")]
                if not req_ids:
                    continue
                    
                sere_servs = client.get_sere_servs(req_ids)
                if not sere_servs:
                    continue
                
                # Filter device usages
                patient_usages = []
                for ss in sere_servs:
                    service_name = ss.get("TDL_SERVICE_NAME", "")
                    service_code = ss.get("TDL_SERVICE_CODE", "")
                    sere_serv_id = ss.get("ID")
                    
                    if not service_name or not sere_serv_id:
                        continue
                        
                    # Skip basic lab/medicines
                    type_code = ss.get("SERVICE_TYPE_CODE")
                    if type_code in ["XN", "THUOC", "VT"] or "xét nghiệm" in service_name.lower():
                        continue
                        
                    cat_code = get_device_category_from_name(service_name)
                    if not cat_code:
                        continue
                        
                    # We found a bedside medical machine service!
                    # Parse specific machine code/name from the service name if possible
                    # e.g., "[TE SS730(1)] Bơm tiêm điện" -> code "TE SS730(1)"
                    m_code = service_code
                    m_name = service_name
                    
                    if "[" in service_name and "]" in service_name:
                        parts = service_name.split("]", 1)
                        m_code = parts[0].replace("[", "").strip()
                        m_name = parts[1].strip()
                    else:
                        # Fallback: make a code based on category and room/department
                        m_code = f"VM-{cat_code}-{dept_code}-{sere_serv_id % 100:02d}"
                        # Clean up name: e.g. "Sử dụng Bơm tiêm điện"
                        m_name = service_name
                        
                    # Ensure this virtual machine exists in our machines catalog!
                    m_id = db_manager.upsert_machine(
                        conn=conn,
                        machine_code=m_code,
                        machine_name=m_name,
                        category_code=cat_code,
                        category_name=cat_code.replace("_", " ").title(),
                        department_code=dept_code,
                        department_name=dept_name,
                        status="in_use",
                        is_active=True
                    )
                    
                    # Dates
                    start_time = client.normalize_his_datetime(ss.get("TDL_INTRUCTION_TIME") or ss.get("CREATE_TIME"))
                    end_time = client.normalize_his_datetime(ss.get("USE_TIME_TO"))
                    
                    # Quantity
                    qty = ss.get("AMOUNT", 1.0)
                    
                    # Status: if end_time is in the past, completed; otherwise in_use
                    status = "in_use"
                    if end_time:
                        try:
                            end_dt = datetime.fromisoformat(end_time.replace("+07:00", "+0700"))
                            if end_dt < datetime.now(timezone(timedelta(hours=7))):
                                status = "completed"
                        except Exception:
                            pass
                            
                    # Ordered by Doctor
                    doctor = ss.get("TDL_REQUEST_USERNAME") or ss.get("TDL_REQUEST_LOGINNAME") or "Bác sĩ điều trị"
                    
                    # Create usage snapshot dict
                    usage_payload = {
                        "machine_id": m_id,
                        "his_sere_serv_id": sere_serv_id,
                        "service_name": service_name,
                        "started_at": start_time,
                        "ended_at": end_time,
                        "quantity": qty,
                        "status": status,
                        "ordered_by_name": doctor,
                        "department_code": dept_code,
                        "note": f"Mã dịch vụ: {service_code}",
                    }
                    usage_payload["source_hash"] = hash_dict(usage_payload)
                    patient_usages.append(usage_payload)
                
                if patient_usages:
                    # Sync to database
                    db_manager.replace_device_usages(conn, enc_id, patient_usages)
                    usages_added_count += len(patient_usages)
                    changed_records += len(patient_usages)
                    total_records += len(patient_usages)
                    
                # Progress logging every 10 patients
                if (idx + 1) % 10 == 0 or (idx + 1) == len(active_treatments):
                    print(f"  Processed {idx + 1}/{len(active_treatments)} patients...")
                    
            conn.commit()
        print(f"  => Đồng bộ xong {usages_added_count} lượt sử dụng thiết bị.")

        # 5. Post-sync step: Mark discharged patients and update machine statuses
        print("\n[4/4] Cập nhật trạng thái máy móc và xử lý bệnh nhân xuất viện...")
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            
            # A. Mark encounters as discharged if they are no longer in the active_encounter_ids census list
            if active_encounter_ids:
                placeholders = ",".join(["%s"] * len(active_encounter_ids))
                
                # First, find encounters that are active in our DB but not in HIS active census
                cur.execute(
                    f"SELECT id, his_treatment_code FROM encounters WHERE status = 'active' AND id NOT IN ({placeholders})",
                    tuple(active_encounter_ids)
                )
                discharged_rows = cur.fetchall()
                
                for r in discharged_rows:
                    print(f"  - Phát hiện BN ra viện hoặc chuyển khoa: {r['his_treatment_code']}. Đang cập nhật trạng thái...")
                    # Update encounter to discharged
                    cur.execute(
                        "UPDATE encounters SET status = 'discharged', discharge_at = now(), updated_at = now() WHERE id = %s",
                        (r["id"],)
                    )
                    # Mark all active device usages under this encounter as completed!
                    cur.execute(
                        "UPDATE device_usages SET status = 'completed', ended_at = now(), updated_at = now() WHERE encounter_id = %s AND status = 'in_use'",
                        (r["id"],)
                    )
                    changed_records += 1
            
            # B. Refresh all machine statuses based on current active usages
            # First, set all machines to available
            cur.execute("UPDATE machines SET status = 'available', updated_at = now() WHERE is_active = TRUE")
            # Then, set machines that have active 'in_use' usages to 'in_use'
            cur.execute(
                """
                UPDATE machines 
                SET status = 'in_use', updated_at = now() 
                WHERE id IN (
                    SELECT DISTINCT machine_id FROM device_usages WHERE status = 'in_use'
                )
                """
            )
            conn.commit()
        print("  => Cập nhật trạng thái máy móc thành công.")
        
        # Finish sync run successfully!
        db_manager.finish_sync_run(run_id, status="success", total=total_records, changed=changed_records)
        print(f"\n=======================================================")
        print(f"ĐỒNG BỘ THÀNH CÔNG! Đã xử lý {total_records} records ({changed_records} thay đổi).")
        print(f"=======================================================")
        
    except Exception as exc:
        print(f"\n[ERROR] Lỗi trong quá trình đồng bộ: {exc}")
        traceback.print_exc()
        db_manager.finish_sync_run(run_id, status="failed", error=str(exc))

def start_sync_loop():
    print(f"Khởi động Sync Engine với chu kỳ {POLL_INTERVAL} giây...")
    # Initialize DB tables/seed
    db_manager.init_db()
    
    while True:
        try:
            sync_job()
        except Exception as e:
            print(f"Critical error in sync loop: {e}")
        print(f"Sleeping for {POLL_INTERVAL} seconds...")
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    start_sync_loop()
