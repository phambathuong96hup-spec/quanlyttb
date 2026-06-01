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

    print("Fetching all services from catalog...")
    # Try HisService/Get
    url_srv = f"http://{HIS_SERVER}:1508/api/HisService/Get"
    
    # We will fetch up to 3000 services by paginating
    all_services = []
    limit = 1000
    for start in [0, 1000, 2000]:
        srvs = client._call(url_srv, {
            "CommonParam": {"Start": start, "Limit": limit, "LanguageCode": "VI"},
            "ApiData": {"IS_ACTIVE": 1}
        })
        if srvs:
            all_services.extend(srvs)
        else:
            break
            
    # If empty, try GetView
    if not all_services:
        url_view = f"http://{HIS_SERVER}:1508/api/HisService/GetView"
        for start in [0, 1000, 2000]:
            srvs = client._call(url_view, {
                "CommonParam": {"Start": start, "Limit": limit, "LanguageCode": "VI"},
                "ApiData": {"IS_ACTIVE": 1}
            })
            if srvs:
                all_services.extend(srvs)
            else:
                break

    print(f"Retrieved {len(all_services)} services.")

    keywords = ["thở máy", "bơm tiêm", "truyền dịch", "monitor", "khí dung", "hfnc", "oxy cao"]
    matches = []
    for s in all_services:
        name = s.get("SERVICE_NAME", "")
        code = s.get("SERVICE_CODE", "")
        if not name:
            continue
            
        match = any(kw in name.lower() for kw in keywords)
        if match:
            matches.append(s)

    print(f"\nFound {len(matches)} service definitions matching medical devices:")
    for idx, m in enumerate(matches):
        print(f"{idx+1}. [{m.get('SERVICE_CODE')}] {m.get('SERVICE_NAME')} (ID: {m.get('ID')})")

if __name__ == "__main__":
    search()
