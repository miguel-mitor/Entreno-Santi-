"""Cruza lo programado con lo realizado y prepara las métricas para la web."""
from __future__ import annotations

import datetime as dt

from .intervals import Intervals

# Métricas de actividad que se envían a la web (nombre en Intervals.icu)
ACTIVITY_FIELDS = [
    "id", "start_date_local", "type", "name", "description", "paired_event_id",
    "moving_time", "elapsed_time", "distance", "total_elevation_gain",
    "average_speed", "max_speed", "pace", "gap",
    "average_heartrate", "max_heartrate", "athlete_max_hr", "lthr",
    "icu_average_watts", "icu_weighted_avg_watts", "icu_ftp", "icu_intensity",
    "icu_variability_index", "icu_efficiency_factor", "decoupling",
    "icu_training_load", "trimp", "strain_score", "calories",
    "average_cadence", "icu_rpe", "session_rpe", "feel", "compliance",
    "kg_lifted", "average_temp", "icu_zone_times", "icu_hr_zone_times",
    "pace_zone_times", "icu_ctl", "icu_atl", "device_name", "source",
    "trainer", "race", "pool_length",
]

EVENT_FIELDS = [
    "id", "start_date_local", "type", "name", "description", "category",
    "moving_time", "distance", "icu_training_load", "icu_intensity",
]

WELLNESS_FIELDS = [
    "id", "ctl", "atl", "rampRate", "weight", "restingHR", "hrv", "sleepSecs",
    "sleepScore", "sleepQuality", "soreness", "fatigue", "stress", "mood",
    "motivation", "readiness", "spO2", "vo2max", "steps", "comments",
]


def _pick(d: dict, fields: list[str]) -> dict:
    return {k: d.get(k) for k in fields if d.get(k) is not None}


def _day(s: str | None) -> str:
    return (s or "")[:10]


def week_bounds(start: str) -> tuple[dt.date, dt.date]:
    d = dt.date.fromisoformat(start)
    d -= dt.timedelta(days=d.weekday())  # lunes
    return d, d + dt.timedelta(days=6)


def build_week(client: Intervals, athlete_id: str, start: str, today: dt.date | None = None) -> dict:
    today = today or dt.date.today()
    mon, sun = week_bounds(start)
    oldest, newest = mon.isoformat(), sun.isoformat()

    events = [e for e in client.events(athlete_id, oldest, newest)
              if e.get("category") in ("WORKOUT", "RACE_A", "RACE_B", "RACE_C")]
    acts = client.activities(athlete_id, oldest, newest)
    acts = [_pick(a, ACTIVITY_FIELDS) for a in acts if a.get("id")]

    by_event = {a["paired_event_id"]: a for a in acts if a.get("paired_event_id")}
    used: set = {a["id"] for a in by_event.values()}

    planned = []
    for e in sorted(events, key=lambda e: e.get("start_date_local", "")):
        ev = _pick(e, EVENT_FIELDS)
        day = _day(e.get("start_date_local"))
        act = by_event.get(e.get("id"))
        if act is None:
            # sin emparejar en Intervals: busca una actividad del mismo día y deporte
            act = next((a for a in acts if a["id"] not in used
                        and _day(a.get("start_date_local")) == day
                        and a.get("type") == e.get("type")), None)
            if act:
                used.add(act["id"])
        if act:
            status = "done"
        elif day < today.isoformat():
            status = "missed"
        elif day == today.isoformat():
            status = "today"
        else:
            status = "pending"
        planned.append({"event": ev, "date": day, "status": status, "activity": act})

    extra = [{"date": _day(a.get("start_date_local")), "activity": a}
             for a in acts if a["id"] not in used]

    done_acts = [p["activity"] for p in planned if p["activity"]] + [x["activity"] for x in extra]

    def tot(items, key):
        return round(sum((i.get(key) or 0) for i in items), 1)

    past_planned = [p for p in planned if p["date"] <= today.isoformat()]
    totals = {
        "planned_count": len(planned),
        "done_count": sum(p["status"] == "done" for p in planned),
        "missed_count": sum(p["status"] == "missed" for p in planned),
        "extra_count": len(extra),
        "compliance_pct": (round(100 * sum(p["status"] == "done" for p in past_planned) / len(past_planned))
                           if past_planned else None),
        "planned_time": tot([p["event"] for p in planned], "moving_time"),
        "done_time": tot(done_acts, "moving_time"),
        "planned_distance": tot([p["event"] for p in planned], "distance"),
        "done_distance": tot(done_acts, "distance"),
        "planned_load": tot([p["event"] for p in planned], "icu_training_load"),
        "done_load": tot(done_acts, "icu_training_load"),
        "by_sport": _by_sport([p["event"] for p in planned], done_acts),
    }
    return {
        "athlete_id": athlete_id,
        "week_start": oldest,
        "week_end": newest,
        "today": today.isoformat(),
        "planned": planned,
        "extra": extra,
        "totals": totals,
    }


def _family(t: str | None) -> str:
    t = t or "Otro"
    if "Swim" in t:
        return "Swim"
    if "Run" in t:
        return "Run"
    if "Ride" in t:
        return "Ride"
    return t


def _by_sport(planned: list[dict], done: list[dict]) -> dict:
    out: dict[str, dict] = {}
    for key, items in (("planned", planned), ("done", done)):
        for i in items:
            f = out.setdefault(_family(i.get("type")), {
                "planned_time": 0, "done_time": 0, "planned_distance": 0, "done_distance": 0})
            f[f"{key}_time"] += i.get("moving_time") or 0
            f[f"{key}_distance"] += i.get("distance") or 0
    return out


def build_wellness(client: Intervals, athlete_id: str, days: int = 90) -> list[dict]:
    newest = dt.date.today()
    oldest = newest - dt.timedelta(days=days)
    rows = client.wellness(athlete_id, oldest.isoformat(), newest.isoformat())
    out = []
    for w in rows:
        r = _pick(w, WELLNESS_FIELDS)
        r["date"] = w.get("id")
        if r.get("ctl") is not None and r.get("atl") is not None:
            r["form"] = round(r["ctl"] - r["atl"], 1)
        out.append(r)
    return sorted(out, key=lambda r: r["date"] or "")


def build_overview_row(client: Intervals, athlete: dict, start: str) -> dict:
    row = {"id": athlete["id"], "name": athlete["name"]}
    try:
        wk = build_week(client, athlete["id"], start)
        row["totals"] = wk["totals"]
        row["week"] = [
            {"date": p["date"], "status": p["status"], "type": p["event"].get("type")}
            for p in wk["planned"]
        ] + [{"date": x["date"], "status": "extra", "type": x["activity"].get("type")} for x in wk["extra"]]
        row["week"].sort(key=lambda d: d["date"])
        well = build_wellness(client, athlete["id"], days=14)
        last = next((w for w in reversed(well) if w.get("ctl") is not None), None)
        if last:
            row["fitness"] = round(last["ctl"], 1)
            row["fatigue"] = round(last["atl"], 1)
            row["form"] = last.get("form")
        latest_hrv = next((w for w in reversed(well) if w.get("hrv")), None)
        if latest_hrv:
            row["hrv"] = latest_hrv["hrv"]
    except Exception as e:  # un atleta con error no debe tumbar la lista
        row["error"] = str(e)
    return row
