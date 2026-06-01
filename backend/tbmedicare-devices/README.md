# TBMediCare Devices HIS Backend

FastAPI/PostgreSQL module dong bo danh muc may va luot su dung thiet bi tu HIS.

## Chay rieng backend

```bash
cd backend/tbmedicare-devices
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env.local
python init_db.py
python api_server.py
```

Frontend React goi backend nay qua bien:

```bash
VITE_HIS_DEVICES_API_URL=http://127.0.0.1:8997
```

Khong commit `.env.local` vi file do chua thong tin ket noi PostgreSQL va HIS.

Mac dinh `DEVICES_START_BOT=0` de API dashboard phan hoi nhanh. Chay sync HIS bang
`python sync_devices.py` trong mot terminal rieng, hoac dat `DEVICES_START_BOT=1`
neu muon API server tu khoi dong sync bot.
