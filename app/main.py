"""App web: sube un Excel de entrenos y prográmalos en Intervals.icu."""
from __future__ import annotations

import datetime as dt
import os
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import ai
from .excel import workbook_to_text
from .intervals import Intervals, IntervalsError

load_dotenv()

app = FastAPI(title="Excel → Intervals.icu")
STATIC = Path(__file__).parent / "static"


def intervals() -> Intervals:
    try:
        return Intervals(os.getenv("INTERVALS_API_KEY", ""))
    except IntervalsError as e:
        raise HTTPException(400, str(e))


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/athletes")
def athletes():
    try:
        return intervals().list_athletes()
    except IntervalsError as e:
        raise HTTPException(502, str(e))


@app.post("/api/parse")
async def parse(file: UploadFile = File(...), week_start: str = Form(...)):
    try:
        dt.date.fromisoformat(week_start)
    except ValueError:
        raise HTTPException(400, "Fecha de inicio de semana no válida")
    name = file.filename or "archivo.xlsx"
    if not name.lower().endswith((".xlsx", ".xlsm", ".csv")):
        raise HTTPException(400, "Sube un archivo .xlsx o .csv (si es .xls antiguo, guárdalo como .xlsx)")
    try:
        text = workbook_to_text(await file.read(), name)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        raise HTTPException(400, "No se pudo leer el archivo. ¿Es un Excel válido?")
    try:
        athlete_list = intervals().list_athletes()
    except IntervalsError as e:
        raise HTTPException(502, str(e))
    try:
        result = ai.parse_workouts(text, athlete_list, week_start)
    except ai.AIError as e:
        raise HTTPException(502, str(e))
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
