import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_manager
from bot_runtime import start_his_bot_if_enabled

# Reconfigure stdout for Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PORT = int(os.getenv("DEVICES_PORT", "8997"))
DEFAULT_CORS_ORIGINS = (
    "http://127.0.0.1:5173,"
    "http://localhost:5173,"
    "http://127.0.0.1:4173,"
    "http://localhost:4173"
)


def _parse_cors_origins():
    raw_origins = os.getenv("DEVICES_CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[API] Starting API Server, initializing database schema...")
    db_manager.init_db()
    print("[API] Starting background HIS Sync Bot thread...")
    app.state.bot_runtime = start_his_bot_if_enabled(source="api")
    yield
    print("[API] Shutting down API Server...")
    db_manager.close_pool()

app = FastAPI(title="TBMediCare-Devices API", lifespan=lifespan)

# Allow CORS for hospital LAN browsers
app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static folder if it exists
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Helper to check JSON status code
def success_response(data):
    return JSONResponse({"success": True, "data": jsonable_encoder(data)})

def error_response(message, status_code=400):
    return JSONResponse({"success": False, "message": message}, status_code=status_code)

# --- Routes ---

@app.get("/", response_class=HTMLResponse)
def index_page():
    index_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    return HTMLResponse("<h1>TBMediCare-Devices Dashboard</h1><p>index.html not found.</p>", status_code=404)

@app.get("/api/dashboard/stats")
def api_stats(dept: str = None):
    try:
        stats = db_manager.get_dashboard_stats(dept)
        return success_response(stats)
    except Exception as e:
        return error_response(f"Lỗi: {e}")

@app.get("/api/dashboard/departments")
def api_department_dashboard(dept: str = Query(None), category: str = Query(None)):
    try:
        stats = db_manager.get_department_device_dashboard(
            dept_code=dept,
            category_code=category,
        )
        return success_response(stats)
    except Exception as e:
        return error_response(f"Lỗi: {e}")

@app.get("/api/devices/in-use")
def api_devices_in_use(
    dept: str = Query(None),
    category: str = Query(None),
    search: str = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200)
):
    try:
        usages = db_manager.get_in_use_devices(
            dept_code=dept,
            category_code=category,
            search=search,
            page=page,
            limit=limit
        )
        return success_response(usages)
    except Exception as e:
        return error_response(f"Lỗi: {e}")

@app.get("/api/devices/available")
def api_devices_available(dept: str = Query(None), category: str = Query(None)):
    try:
        available = db_manager.get_available_devices(dept_code=dept, category_code=category)
        return success_response(available)
    except Exception as e:
        return error_response(f"Lỗi: {e}")

@app.get("/api/devices/all")
def api_devices_all(category: str = Query(None), search: str = Query(None)):
    try:
        all_m = db_manager.get_all_machines(category_code=category, search=search)
        return success_response(all_m)
    except Exception as e:
        return error_response(f"Lỗi: {e}")

@app.get("/api/patients/with-devices")
def api_patients_with_devices(dept: str = Query(None), category: str = Query(None), search: str = Query(None)):
    try:
        patients = db_manager.get_patients_with_devices(dept_code=dept, category_code=category, search=search)
        return success_response(patients)
    except Exception as e:
        return error_response(f"Lỗi: {e}")

@app.get("/api/patients/{treatment_code}/devices")
def api_patient_detail(treatment_code: str):
    try:
        detail = db_manager.get_patient_devices(treatment_code)
        if not detail:
            raise HTTPException(status_code=404, detail="Không tìm thấy bệnh nhân")
        return success_response(detail)
    except HTTPException as he:
        raise he
    except Exception as e:
        return error_response(f"Lỗi: {e}")

@app.get("/api/history")
def api_history(
    dept: str = Query(None),
    category: str = Query(None),
    search: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200)
):
    try:
        # Parse dates if present
        start_dt = datetime.fromisoformat(start_date) if start_date else None
        end_dt = datetime.fromisoformat(end_date) if end_date else None
        
        history = db_manager.get_history(
            dept_code=dept,
            category_code=category,
            search=search,
            start_date=start_dt,
            end_date=end_dt,
            page=page,
            limit=limit
        )
        return success_response(history)
    except Exception as e:
        return error_response(f"Lỗi: {e}")

@app.get("/api/sync/status")
def api_sync_status():
    try:
        status = db_manager.get_sync_status()
        return success_response(status)
    except Exception as e:
        return error_response(f"Lỗi: {e}")

@app.get("/api/categories")
def api_categories():
    try:
        categories = db_manager.get_categories()
        return success_response(categories)
    except Exception as e:
        return error_response(f"Lỗi: {e}")

@app.get("/api/departments")
def api_departments():
    try:
        depts = db_manager.get_departments()
        return success_response(depts)
    except Exception as e:
        return error_response(f"Lỗi: {e}")

if __name__ == "__main__":
    import uvicorn
    print(f"Starting server on port {PORT}...")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
