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

    print("Fetching service-machine mappings...")
    url_sm = f"http://{HIS_SERVER}:1508/api/HisServiceMachine/Get"
    mappings = client._call(url_sm, {
        "CommonParam": {"Start": 0, "Limit": 5000, "LanguageCode": "VI"},
        "ApiData": {}
    })
    print(f"Retrieved {len(mappings)} mappings.")

    print("Fetching machine catalog to map IDs...")
    url_m = f"http://{HIS_SERVER}:1508/api/HisMachine/Get"
    machines = client._call(url_m, {
        "CommonParam": {"Start": 0, "Limit": 1000, "LanguageCode": "VI"},
        "ApiData": {}
    })
    machine_dict = {m.get("ID"): m for m in machines}

    # Group mappings by machine name
    print("\n--- SAMPLE MAPPINGS WITH SERVICE NAMES ---")
    
    # We will try to fetch details of some services mapped to machines
    service_ids = list(set([m.get("SERVICE_ID") for m in mappings if m.get("SERVICE_ID")]))
    print(f"Total distinct mapped services: {len(service_ids)}")
    
    # Let's query HisService/Get for some of these IDs to see the service names!
    # Try HisService/Get or HisService/GetView
    url_srv = f"http://{HIS_SERVER}:1508/api/HisService/Get"
    services_details = []
    
    # Query in chunks of 100
    chunk_size = 100
    for i in range(0, min(len(service_ids), 300), chunk_size):
        chunk = service_ids[i:i+chunk_size]
        srvs = client._call(url_srv, {
            "CommonParam": {"Start": 0, "Limit": chunk_size, "LanguageCode": "VI"},
            "ApiData": {"IDs": chunk}
        })
        if srvs:
            services_details.extend(srvs)
            
    # If HisService/Get fails or is empty, try HisService/GetView
    if not services_details:
        url_srv_view = f"http://{HIS_SERVER}:1508/api/HisService/GetView"
        for i in range(0, min(len(service_ids), 300), chunk_size):
            chunk = service_ids[i:i+chunk_size]
            srvs = client._call(url_srv_view, {
                "CommonParam": {"Start": 0, "Limit": chunk_size, "LanguageCode": "VI"},
                "ApiData": {"IDs": chunk}
            })
            if srvs:
                services_details.extend(srvs)

    service_dict = {s.get("ID"): s for s in services_details}
    print(f"Fetched {len(services_details)} service details.")

    # Match and print mappings
    matched_count = 0
    for sm in mappings[:100]:  # Show first 100
        m_id = sm.get("MACHINE_ID")
        s_id = sm.get("SERVICE_ID")
        m_info = machine_dict.get(m_id)
        s_info = service_dict.get(s_id)
        
        m_name = m_info.get("MACHINE_NAME") if m_info else f"Machine #{m_id}"
        s_name = s_info.get("SERVICE_NAME") if s_info else f"Service #{s_id}"
        
        # Check if the service name has machine indicators
        print(f"- {m_name} <---> {s_name}")
        matched_count += 1

if __name__ == "__main__":
    search()
