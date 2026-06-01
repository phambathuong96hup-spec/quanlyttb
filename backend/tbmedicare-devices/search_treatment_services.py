import sys
import os
import json

# Reconfigure stdout for Vietnamese characters
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from his_client import HisClient, HIS_SERVER

def search():
    client = HisClient()
    print("Connecting to HIS...")
    if not client.login():
        print("Failed to login")
        return

    print("Fetching active treatments...")
    patients = client.get_active_treatments(limit=100)
    print(f"Found {len(patients)} active treatments.")
    
    keywords = ["thở", "bơm", "truyền", "theo dõi", "monitor", "oxy", "oxi", "dung", "hút"]
    
    print("\nScanning patients for device-related services...")
    found_services = []
    
    for idx, pat in enumerate(patients):
        t_code = pat.get("TREATMENT_CODE")
        t_name = pat.get("VIR_PATIENT_NAME")
        dept = pat.get("END_DEPARTMENT_NAME") or pat.get("IN_DEPARTMENT_NAME") or "Khoa"
        
        # Get all services
        reqs = client.get_service_requests(t_code)
        if not reqs:
            continue
            
        req_ids = [r.get("ID") for r in reqs if r.get("ID")]
        sere_servs = client.get_sere_servs(req_ids)
        if not sere_servs:
            continue
            
        patient_matches = []
        for ss in sere_servs:
            name = ss.get("TDL_SERVICE_NAME", "")
            if not name:
                continue
                
            # Check if any keyword matches
            match = any(kw in name.lower() for kw in keywords)
            # Skip lab tests (XN) and medications
            is_lab_or_med = ss.get("SERVICE_TYPE_CODE") in ["XN", "THUOC", "VT"] or "xét nghiệm" in name.lower()
            
            if match and not is_lab_or_med:
                item = {
                    "service_id": ss.get("SERVICE_ID"),
                    "service_code": ss.get("TDL_SERVICE_CODE"),
                    "service_name": name,
                    "service_type": ss.get("SERVICE_TYPE_NAME"),
                    "amount": ss.get("AMOUNT"),
                    "execute_room": ss.get("EXECUTE_ROOM_NAME"),
                    "execute_dept": ss.get("EXECUTE_DEPARTMENT_NAME"),
                    "intruction_time": ss.get("TDL_INTRUCTION_TIME")
                }
                patient_matches.append(item)
                found_services.append(item)
                
        if patient_matches:
            print(f"\n=> Patient: {t_name} ({t_code}) - {dept}")
            for m in patient_matches:
                print(f"  * {m['service_name']} (Qty: {m['amount']}, Dept: {m['execute_dept']})")

    # Aggregate distinct services found
    print("\n=== AGGREGATED DISTINCT DEVICE SERVICES ===")
    distinct = {}
    for s in found_services:
        code = s["service_code"]
        if code not in distinct:
            distinct[code] = {
                "name": s["service_name"],
                "type": s["service_type"],
                "count": 0
            }
        distinct[code]["count"] += 1
        
    for code, info in sorted(distinct.items(), key=lambda x: x[1]["count"], reverse=True):
        print(f"- [{code}] {info['name']} (Type: {info['type']}, Count: {info['count']})")

if __name__ == "__main__":
    search()
