"""Configuración guardada por el entrenador desde el panel (claves de API)."""
from __future__ import annotations

import json
import os
from pathlib import Path

CONFIG_PATH = Path(os.getenv("CONFIG_PATH", Path(__file__).resolve().parent.parent / "data" / "config.json"))

KEYS = {
    "intervals_api_key": "INTERVALS_API_KEY",
    "anthropic_api_key": "ANTHROPIC_API_KEY",
}


def _load() -> dict:
    try:
        return json.loads(CONFIG_PATH.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def get(key: str) -> str:
    """Valor guardado en el panel; si no hay, el de las variables de entorno / .env."""
    return (_load().get(key) or os.getenv(KEYS[key], "")).strip()


def save(values: dict) -> None:
    data = _load()
    for k, v in values.items():
        if k in KEYS and v is not None:
            data[k] = v.strip()
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = CONFIG_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.chmod(tmp, 0o600)
    tmp.replace(CONFIG_PATH)


def hint(value: str) -> str:
    return f"••••{value[-4:]}" if len(value) >= 8 else ("••••" if value else "")


def status() -> dict:
    out = {}
    for k in KEYS:
        v = get(k)
        out[k] = {"configured": bool(v), "hint": hint(v)}
    return out
