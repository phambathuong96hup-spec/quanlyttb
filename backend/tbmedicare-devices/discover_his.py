import json
import os
import sys

# Reconfigure stdout for Vietnamese characters
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from his_client import HisClient, HIS_SERVER

def discover():
    client = HisClient()
    print("Initializing discovery client...")
    if not client.login():
        print("Failed to login to HIS. Check credentials and server connection.")
        return

    print("\n--- 1. Testing HisMachine Endpoints ---")
    
    # Try GetView
    machines_view = client.get_machines(limit=5)
    print(f"HisMachine/GetView count: {len(machines_view)}")
    if machines_view:
        print("HisMachine/GetView sample:")
        print(json.dumps(machines_view[0], indent=2, ensure_ascii=False))
        
    # Try Get (No View)
    url_get = f"http://{HIS_SERVER}:1508/api/HisMachine/Get"
    machines_get = client._call(url_get, {
        "CommonParam": {"Start": 0, "Limit": 5, "LanguageCode": "VI"},
        "ApiData": {}
    })
    print(f"HisMachine/Get count: {len(machines_get)}")
    if machines_get:
        print("HisMachine/Get sample:")
        print(json.dumps(machines_get[0], indent=2, ensure_ascii=False))

    print("\n--- 2. Testing Alternative Machine Endpoints ---")
    endpoints = [
        "HisServiceMachine/Get",
        "HisRoomMachine/Get",
        "HisRoomMachine/GetView",
        "HisEquipmentSet/Get",
        "HisEquipmentSet/GetView"
    ]
    for ep in endpoints:
        url = f"http://{HIS_SERVER}:1508/api/{ep}"
        res = client._call(url, {
            "CommonParam": {"Start": 0, "Limit": 5, "LanguageCode": "VI"},
            "ApiData": {}
        })
        print(f"Endpoint '{ep}' count: {len(res)}")
        if res:
            print(f"Sample from '{ep}':")
            print(json.dumps(res[0], indent=2, ensure_ascii=False))

    print("\n--- 3. Testing Active Patient Census ---")
    patients = client.get_active_treatments(limit=5)
    print(f"Active patients count: {len(patients)}")
    if patients:
        for idx, pat in enumerate(patients):
            t_code = pat.get("TREATMENT_CODE")
            t_name = pat.get("VIR_PATIENT_NAME")
            print(f"Patient {idx+1}: {t_code} - {t_name}")
            
            # Test getting service requests for this patient
            reqs = client.get_service_requests(t_code)
            print(f"  Service requests count: {len(reqs)}")
            if reqs:
                # Find requests that might be related to services/procedures (not just medicine or lab)
                tech_reqs = [r for r in reqs if r.get("SERVICE_REQ_TYPE_CODE") in ["KH", "PT", "TT", "CDHA", "TDCN"]]
                print(f"  Technical service requests (PT/TT/CDHA...): {len(tech_reqs)}")
                
                req_ids = [r.get("ID") for r in reqs if r.get("ID")]
                print(f"  Fetching SereServs for request IDs: {req_ids[:5]}...")
                sere_servs = client.get_sere_servs(req_ids)
                print(f"  SereServs count: {len(sere_servs)}")
                if sere_servs:
                    print("  Sample SereServ record:")
                    print(json.dumps(sere_servs[0], indent=2, ensure_ascii=False))
                    
                    # Print all keys that look like machine or device related
                    machine_keys = {}
                    for ss in sere_servs:
                        for k, v in ss.items():
                            if any(x in k.upper() for x in ["MACH", "DEV", "EQUIP", "MAY"]):
                                if k not in machine_keys:
                                    machine_keys[k] = v
                    if machine_keys:
                        print(f"  Machine-related keys found in SereServs: {machine_keys}")
                    break

if __name__ == "__main__":
    discover()
