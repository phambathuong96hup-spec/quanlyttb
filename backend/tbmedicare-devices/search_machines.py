import sys
import os

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

    url = f"http://{HIS_SERVER}:1508/api/HisMachine/Get"
    machines = client._call(url, {
        "CommonParam": {"Start": 0, "Limit": 1000, "LanguageCode": "VI"},
        "ApiData": {}
    })
    print(f"Retrieved {len(machines)} machines.")
    
    # Sort machines by active status and name
    machines.sort(key=lambda x: (x.get("IS_ACTIVE", 0), x.get("MACHINE_NAME", "")), reverse=True)
    
    print("\n--- MACHINE CATALOG LIST ---")
    active_count = 0
    for idx, m in enumerate(machines):
        active = "🟢" if m.get("IS_ACTIVE") == 1 else "⚪"
        if m.get("IS_ACTIVE") == 1:
            active_count += 1
        print(f"{idx+1}. {active} [{m.get('MACHINE_CODE')}] {m.get('MACHINE_NAME')} (Group: {m.get('MACHINE_GROUP_CODE')}, ID: {m.get('ID')})")
        
    print(f"\nTotal: {len(machines)} machines ({active_count} active).")

if __name__ == "__main__":
    search()
