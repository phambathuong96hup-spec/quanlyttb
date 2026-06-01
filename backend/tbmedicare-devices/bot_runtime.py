import os
import tempfile
import threading
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from env_loader import load_all_env_files, is_truthy

_BOT_THREAD = None

def bot_autostart_enabled():
    load_all_env_files()
    # Keep the dashboard API responsive by default. Run sync_devices.py separately
    # or set DEVICES_START_BOT=1 only when API-hosted sync is intentional.
    return is_truthy(os.getenv("DEVICES_START_BOT", "0"))

def bot_config_ready():
    return bool(os.getenv("HIS_USERNAME", "").strip() and os.getenv("HIS_PASSWORD", "").strip())

def _pid_exists(pid):
    if not pid or pid <= 0:
        return False
    if os.name == "nt":
        try:
            import ctypes
            handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, int(pid))
            if handle:
                ctypes.windll.kernel32.CloseHandle(handle)
                return True
            return False
        except Exception:
            return False
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except OSError:
        return False

class BotProcessLock:
    def __init__(self, name="tbmedicare_devices_bot.lock"):
        self.path = os.path.join(tempfile.gettempdir(), name)
        self.fd = None

    def acquire(self):
        try:
            self.fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_RDWR)
            os.write(self.fd, str(os.getpid()).encode("ascii"))
            return True
        except FileExistsError:
            try:
                with open(self.path, "r", encoding="ascii") as f:
                    pid = int((f.read() or "0").strip() or "0")
            except Exception:
                pid = 0
            if _pid_exists(pid):
                return False
            try:
                os.remove(self.path)
            except OSError:
                return False
            return self.acquire()

    def release(self):
        if self.fd is not None:
            try:
                os.close(self.fd)
            finally:
                self.fd = None
        try:
            os.remove(self.path)
        except FileNotFoundError:
            pass

def start_his_bot_if_enabled(source="app", bot_factory=None):
    global _BOT_THREAD
    if _BOT_THREAD and _BOT_THREAD.is_alive():
        return {"enabled": True, "started": False, "reason": "already_started_in_process"}
    if not bot_autostart_enabled():
        return {"enabled": False, "started": False, "reason": "disabled"}
    if not bot_config_ready():
        return {"enabled": True, "started": False, "reason": "missing_his_credentials"}

    def run_bot():
        retry_seconds = max(5, int(os.getenv("DEVICES_BOT_LOCK_RETRY_SECONDS", "15") or "15"))
        while True:
            lock = BotProcessLock()
            if not lock.acquire():
                print(f"[BOT] Devices sync bot already running elsewhere; {source} is on standby.")
                threading.Event().wait(retry_seconds)
                continue
            try:
                print(f"[BOT] Starting Devices sync bot from {source}.")
                if bot_factory is None:
                    from sync_devices import start_sync_loop
                    start_sync_loop()
                else:
                    bot_factory()
                return
            except Exception as exc:
                print(f"[BOT] Stopped from {source}: {exc}")
                threading.Event().wait(retry_seconds)
            finally:
                lock.release()

    _BOT_THREAD = threading.Thread(target=run_bot, name="tbmedicare-devices-bot", daemon=True)
    _BOT_THREAD.start()
    return {"enabled": True, "started": True, "reason": "started"}
