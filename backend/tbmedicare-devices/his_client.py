import base64
import json
import os
import sys
import requests
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import env_loader

env_loader.load_all_env_files()

HIS_SERVER = os.getenv("HIS_SERVER", "192.168.0.3")
USERNAME = os.getenv("HIS_USERNAME", "")
PASSWORD = os.getenv("HIS_PASSWORD", "")
CLIENT_VERSION = os.getenv("HIS_CLIENT_VERSION", "2.396.0")
MACHINE_NAME = os.getenv("HIS_MACHINE_NAME", "TBMEDICARE-DEVICES-BOT")
CLIENT_IP = os.getenv("HIS_CLIENT_IP", "127.0.0.1")
SYNC_PAGE_LIMIT = int(os.getenv("DEVICES_SYNC_PAGE_LIMIT", "500"))

class HisClient:
    def __init__(self):
        self.token = None
        self.session = requests.Session()
        self.session.proxies = {"http": None, "https": None}
        self.common_param = {
            "Messages": [],
            "BugCodes": [],
            "MessageCodes": [],
            "LanguageCode": "VI",
            "Start": 0,
            "Limit": 5000,
            "Now": 0,
            "HasException": False,
        }

    def login(self):
        if not USERNAME or not PASSWORD:
            raise RuntimeError("Missing HIS_USERNAME or HIS_PASSWORD environment variables")
        url = f"http://{HIS_SERVER}:1501/api/Token/Login"
        auth_string = f"HIS:{USERNAME}:{PASSWORD}:{CLIENT_VERSION}:{MACHINE_NAME}"
        auth_base64 = base64.b64encode(auth_string.encode("utf-8")).decode("utf-8")
        headers = {"Authorization": f"Basic {auth_base64}", "ClientIpAddress": CLIENT_IP}

        print(f"[{datetime.now().strftime('%H:%M:%S')}] Dang nhap HIS...")
        try:
            resp = self.session.get(url, headers=headers, timeout=10)
            if resp.status_code == 200 and resp.json().get("Success"):
                self.token = resp.json().get("Data", {}).get("TokenCode")
                print("  => Login OK.")
                return True
            else:
                print(f"  => Login that bai. Response: {resp.text}")
        except Exception as exc:
            print(f"  => Loi login HIS: {exc}")
        return False

    def get_headers(self):
        return {"TokenCode": self.token, "ApplicationCode": "HIS", "ClientIpAddress": CLIENT_IP}

    def _call(self, url, param_dict, timeout=15):
        if not self.token:
            if not self.login():
                raise RuntimeError("Khong the login vao HIS")
                
        param_b64 = base64.b64encode(json.dumps(param_dict).encode("utf-8")).decode("utf-8")
        try:
            resp = self.session.get(f"{url}?param={param_b64}", headers=self.get_headers(), timeout=timeout)
            if resp.status_code == 401:
                print(f"  => Token HIS het han, dang nhap lai va thu lai...")
                self.token = None
                if self.login():
                    resp = self.session.get(f"{url}?param={param_b64}", headers=self.get_headers(), timeout=timeout)
                    if resp.status_code == 200 and resp.json().get("Success"):
                        return resp.json().get("Data", [])
                    raise RuntimeError(f"HIS API loi sau khi relogin. Status: {resp.status_code}")
                raise RuntimeError("Khong the dang nhap lai HIS.")
            
            if resp.status_code == 200:
                body = resp.json()
                if body.get("Success"):
                    return body.get("Data", [])
                else:
                    # Tra ve thanh cong nhung Success = False
                    print(f"  => HIS API bao loi: {body.get('Messages') or body.get('Message')}")
                    return []
            else:
                print(f"  => HIS API loi HTTP {resp.status_code}: {resp.text}")
                return []
        except Exception as exc:
            print(f"  => Loi goi HIS {url}: {exc}")
            return []

    # API: Lay toan bo danh muc may moc (HisMachine)
    def get_machines(self, start=0, limit=1000):
        url = f"http://{HIS_SERVER}:1508/api/HisMachine/GetView"
        return self._call(url, {
            "CommonParam": {"Start": start, "Limit": limit, "LanguageCode": "VI"},
            "ApiData": {"IS_ACTIVE": 1}
        })

    # API: Lay lien ket dich vu voi may moc
    def get_service_machines(self, start=0, limit=2000):
        url = f"http://{HIS_SERVER}:1508/api/HisServiceMachine/GetView"
        return self._call(url, {
            "CommonParam": {"Start": start, "Limit": limit, "LanguageCode": "VI"},
            "ApiData": {}
        })

    # API: Lay danh sach cac dot dieu tri hien tai
    def get_active_treatments(self, start=0, limit=500):
        url = f"http://{HIS_SERVER}:1515/api/EmrTreatment/GetView"
        return self._call(url, {
            "CommonParam": {"Start": start, "Limit": limit, "LanguageCode": "VI"},
            "ApiData": {
                "IS_PAUSE": 0,
                "IS_PAUSE__EXACT": 0
            }
        })

    # API: Lay chi tiet ca lam sang cho 1 dot dieu tri
    def get_treatment_clinical_detail(self, treatment_code):
        url = f"http://{HIS_SERVER}:1508/api/HisTreatment/GetView"
        data = self._call(url, {
            "CommonParam": {"Start": 0, "Limit": 1, "LanguageCode": "VI"},
            "ApiData": {"TREATMENT_CODE__EXACT": treatment_code}
        })
        return data[0] if data else {}

    # API: Lay cac chi dinh dich vu ky thuat cua benh nhan
    def get_service_requests(self, treatment_code):
        url = f"http://{HIS_SERVER}:1508/api/HisServiceReq/Get"
        return self._call(url, {
            "CommonParam": self.common_param,
            "ApiData": {"TREATMENT_CODE__EXACT": treatment_code}
        })

    # API: Lay chi tiet thuc hien cac dich vu ky thuat
    def get_sere_servs(self, service_req_ids):
        if not service_req_ids:
            return []
        url = f"http://{HIS_SERVER}:1508/api/HisSereServ/GetView"
        return self._call(url, {
            "CommonParam": self.common_param,
            "ApiData": {"SERVICE_REQ_IDs": service_req_ids}
        })

    # Dinh dang ngay thang
    def normalize_his_datetime(self, value):
        if value in (None, "", 0):
            return None
        text = str(value).strip()
        if "." in text:
            text = text.split(".", 1)[0]
        digits = "".join(ch for ch in text if ch.isdigit())
        try:
            if len(digits) == 14:
                dt = datetime.strptime(digits, "%Y%m%d%H%M%S")
                return dt.strftime("%Y-%m-%dT%H:%M:%S+07:00")
            if len(digits) == 8:
                dt = datetime.strptime(digits, "%Y%m%d")
                return dt.strftime("%Y-%m-%dT00:00:00+07:00")
        except ValueError:
            return None
        return None

    def normalize_his_date(self, value):
        dt = self.normalize_his_datetime(value)
        return dt[:10] if dt else None
