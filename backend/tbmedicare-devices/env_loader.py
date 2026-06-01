"""Shared environment-file loader for TBMediCare-Devices.

All modules that need to read .env / .env.local should import from here
instead of duplicating the parsing logic.
"""

import os
import sys

APP_DIR = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = (
    os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else APP_DIR
)

TRUTHY = {"1", "true", "yes", "y", "on"}


def load_env_file(filename, base_dir=None):
    """Load KEY=VALUE pairs from *filename* without overriding existing env vars."""
    base = base_dir or RUNTIME_DIR
    path = os.path.join(base, filename)
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


def load_all_env_files(base_dir=None):
    """Convenience: load both ``.env`` and ``.env.local``."""
    load_env_file(".env", base_dir=base_dir)
    load_env_file(".env.local", base_dir=base_dir)


def is_truthy(value):
    """Return True if *value* looks like a truthy toggle string."""
    return str(value or "").lower().strip() in TRUTHY
