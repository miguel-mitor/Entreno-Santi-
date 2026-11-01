"""Acceso con contraseña (se activa al definir APP_PASSWORD)."""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time

from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

COOKIE = "panel_sesion"
MAX_AGE = 30 * 24 * 3600  # 30 días
PUBLIC_PATHS = {"/login", "/logout", "/healthz", "/static/styles.css"}


def password() -> str:
    return os.getenv("APP_PASSWORD", "")


def _secret() -> bytes:
    s = os.getenv("SESSION_SECRET") or ("pw:" + password())
    return hashlib.sha256(s.encode()).digest()


def make_token() -> str:
    exp = str(int(time.time()) + MAX_AGE)
    sig = hmac.new(_secret(), exp.encode(), hashlib.sha256).hexdigest()
    return f"{exp}.{sig}"


def valid_token(token: str | None) -> bool:
    if not token or "." not in token:
        return False
    exp, sig = token.split(".", 1)
    good = hmac.new(_secret(), exp.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, good) and exp.isdigit() and int(exp) > time.time()


def check_password(given: str) -> bool:
    return bool(password()) and secrets.compare_digest(given.encode(), password().encode())


async def middleware(request: Request, call_next):
    if not password() or request.url.path in PUBLIC_PATHS or valid_token(request.cookies.get(COOKIE)):
        return await call_next(request)
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "Tu sesión ha caducado. Recarga la página para entrar de nuevo."}, status_code=401)
    return RedirectResponse("/login", status_code=303)


def login_page(error: str = "") -> HTMLResponse:
    msg = f'<p class="status show err">{error}</p>' if error else ""
    return HTMLResponse(f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Entrar · Panel del entrenador</title>
<link rel="stylesheet" href="/static/styles.css"></head><body>
<main style="max-width:380px;padding-top:12vh">
  <h1>Panel del entrenador</h1>
  <p class="sub">Introduce la contraseña para entrar.</p>
  <form method="post" action="/login" class="card">
    <label for="pw">Contraseña</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required>
    <button type="submit" style="margin-top:14px;width:100%">Entrar</button>
    {msg}
  </form>
</main></body></html>""")
