"""App web: sube un Excel de entrenos y prográmalos en Intervals.icu."""
from __future__ import annotations

import datetime as dt
import re
import unicodedata
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import asyncio

from fastapi import Request
from fastapi.responses import RedirectResponse

from . import ai, auth, config, tracking
from .excel import workbook_to_text
from .images import image_blocks, is_image
from .intervals import Intervals, IntervalsError

load_dotenv()

app = FastAPI(title="Excel → Intervals.icu")
STATIC = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC), name="static")
app.middleware("http")(auth.middleware)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/login")
def login_form(request: Request):
    if not auth.password() or auth.valid_token(request.cookies.get(auth.COOKIE)):
        return RedirectResponse("/", status_code=303)
    return auth.login_page()


@app.post("/login")
async def login(request: Request, password: str = Form("")):
    if not auth.check_password(password):
        await asyncio.sleep(1.5)  # frena intentos de adivinar la contraseña
        page = auth.login_page("Contraseña incorrecta.")
        page.status_code = 401
        return page
    resp = RedirectResponse("/", status_code=303)
    resp.set_cookie(auth.COOKIE, auth.make_token(), max_age=auth.MAX_AGE, httponly=True,
                    samesite="lax", secure=request.url.scheme == "https")
    return resp


@app.get("/logout")
def logout():
    resp = RedirectResponse("/login" if auth.password() else "/", status_code=303)
    resp.delete_cookie(auth.COOKIE)
    return resp


@app.get("/api/session")
def session_info():
    return {"auth": bool(auth.password())}


def intervals() -> Intervals:
    try:
        return Intervals(config.get("intervals_api_key"))
    except IntervalsError as e:
        raise HTTPException(400, str(e))


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


# ---------- Configuración ----------

class SettingsIn(BaseModel):
    intervals_api_key: str | None = None
    anthropic_api_key: str | None = None


@app.get("/api/settings")
def get_settings():
    return config.status()


@app.post("/api/settings")
def save_settings(body: SettingsIn):
    result: dict = {}
    if body.intervals_api_key:
        try:
            athletes_found = Intervals(body.intervals_api_key.strip()).list_athletes()
        except IntervalsError:
            raise HTTPException(400, "Intervals.icu no acepta esa clave. Comprueba que la has copiado entera "
                                     "desde intervals.icu/settings → Developer Settings.")
        except Exception:
            raise HTTPException(502, "No se ha podido contactar con Intervals.icu. Inténtalo de nuevo.")
        result["athletes"] = len(athletes_found)
    if body.anthropic_api_key and not body.anthropic_api_key.strip().startswith("sk-ant-"):
        raise HTTPException(400, "La clave de Anthropic debe empezar por «sk-ant-».")
    config.save({k: v for k, v in body.model_dump().items() if v})
    return {**config.status(), **result}


@app.post("/api/settings/test")
def test_settings():
    try:
        return {"athletes": len(intervals().list_athletes())}
    except IntervalsError as e:
        raise HTTPException(400, str(e))


@app.get("/api/athletes")
def athletes():
    try:
        return intervals().list_athletes()
    except IntervalsError as e:
        raise HTTPException(502, str(e))


MAX_FILES = 10


@app.post("/api/parse")
async def parse(files: list[UploadFile] = File(...), week_start: str = Form(...),
                athlete_id: str | None = Form(None)):
    try:
        dt.date.fromisoformat(week_start)
    except ValueError:
        raise HTTPException(400, "Fecha de inicio de semana no válida")
    if len(files) > MAX_FILES:
        raise HTTPException(400, f"Sube como máximo {MAX_FILES} archivos a la vez.")
    texts, images = [], []
    for f in files:
        name = f.filename or "archivo"
        data = await f.read()
        if is_image(name):
            try:
                images.append((name, image_blocks(data)))
            except ValueError as e:
                raise HTTPException(400, f"{name}: {e}")
        elif name.lower().endswith((".xlsx", ".xlsm", ".csv")):
            try:
                texts.append(f"## Archivo: {name}\n" + workbook_to_text(data, name))
            except ValueError as e:
                raise HTTPException(400, f"{name}: {e}")
            except Exception:
                raise HTTPException(400, f"No se pudo leer «{name}». ¿Es un Excel válido?")
        else:
            raise HTTPException(400, f"«{name}»: sube un Excel (.xlsx, .csv) o una foto/captura (.png, .jpg, .heic…). "
                                     "Si es un .xls antiguo, guárdalo como .xlsx.")
    text = "\n\n".join(texts)
    try:
        athlete_list = intervals().list_athletes()
    except IntervalsError as e:
        raise HTTPException(502, str(e))
    fixed = None
    if athlete_id:
        fixed = next((a for a in athlete_list if a["id"] == athlete_id), None)
        if not fixed:
            raise HTTPException(400, "Ese atleta no está entre los que entrenas en Intervals.icu.")
    try:
        result = ai.parse_workouts(text, athlete_list, week_start, config.get("anthropic_api_key"), images, fixed)
    except ai.AIError as e:
        raise HTTPException(502, str(e))
    if fixed:
        for w in result["workouts"]:
            w["athlete_id"] = fixed["id"]
    valid_ids = {a["id"] for a in athlete_list}
    for w in result["workouts"]:
        if w["athlete_id"] not in valid_ids:
            if w["athlete_id"]:
                w["warning"] = (w["warning"] + " " if w["warning"] else "") + "Atleta no reconocido."
            w["athlete_id"] = ""
    return {"athletes": athlete_list, **result}


class Workout(BaseModel):
    athlete_id: str
    date: str
    sport: str
    name: str
    description: str


class UploadRequest(BaseModel):
    workouts: list[Workout]


def _slug(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


@app.post("/api/upload")
def upload(req: UploadRequest):
    by_athlete: dict[str, list[dict]] = defaultdict(list)
    seen: dict[str, int] = defaultdict(int)
    for w in req.workouts:
        if not w.athlete_id:
            raise HTTPException(400, f"El entreno «{w.name}» del {w.date} no tiene atleta asignado")
        try:
            dt.date.fromisoformat(w.date)
        except ValueError:
            raise HTTPException(400, f"Fecha no válida en «{w.name}»: {w.date}")
        key = f"excel-{w.date}-{_slug(w.sport)}-{_slug(w.name)}"
        seen[w.athlete_id + key] += 1
        if seen[w.athlete_id + key] > 1:
            key += f"-{seen[w.athlete_id + key]}"
        by_athlete[w.athlete_id].append({
            "category": "WORKOUT",
            "start_date_local": f"{w.date}T00:00:00",
            "type": w.sport,
            "name": w.name,
            "description": w.description,
            "external_id": key,
        })
    client = intervals()
    results = []
    for athlete_id, events in by_athlete.items():
        try:
            created = client.create_events(athlete_id, events)
            results.append({"athlete_id": athlete_id, "ok": True, "count": len(created)})
        except IntervalsError as e:
            results.append({"athlete_id": athlete_id, "ok": False, "error": str(e), "count": 0})
    return {"results": results}


# ---------- Seguimiento de atletas ----------

def _week_param(start: str | None) -> str:
    if not start:
        return dt.date.today().isoformat()
    try:
        dt.date.fromisoformat(start)
    except ValueError:
        raise HTTPException(400, "Fecha no válida")
    return start


@app.get("/api/overview")
def overview(start: str | None = None):
    start = _week_param(start)
    client = intervals()
    try:
        athlete_list = client.list_athletes()
    except IntervalsError as e:
        raise HTTPException(502, str(e))
    with ThreadPoolExecutor(max_workers=8) as pool:
        rows = list(pool.map(lambda a: tracking.build_overview_row(client, a, start), athlete_list))
    mon, sun = tracking.week_bounds(start)
    return {"week_start": mon.isoformat(), "week_end": sun.isoformat(),
            "today": dt.date.today().isoformat(), "athletes": rows}


@app.get("/api/athletes/{athlete_id}/week")
def athlete_week(athlete_id: str, start: str | None = None):
    try:
        return tracking.build_week(intervals(), athlete_id, _week_param(start))
    except IntervalsError as e:
        raise HTTPException(502, str(e))


@app.get("/api/athletes/{athlete_id}/wellness")
def athlete_wellness(athlete_id: str, days: int = 90):
    try:
        return tracking.build_wellness(intervals(), athlete_id, max(7, min(days, 365)))
    except IntervalsError as e:
        raise HTTPException(502, str(e))
