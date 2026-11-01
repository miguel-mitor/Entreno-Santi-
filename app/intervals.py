"""Cliente mínimo de la API de Intervals.icu."""
from __future__ import annotations

import httpx2 as httpx

BASE = "https://intervals.icu/api/v1"


class IntervalsError(Exception):
    pass


class Intervals:
    def __init__(self, api_key: str):
        if not api_key:
            raise IntervalsError("Falta INTERVALS_API_KEY en el archivo .env")
        self.client = httpx.Client(
            base_url=BASE, auth=("API_KEY", api_key), timeout=60.0
        )

    def _check(self, r) -> None:
        if r.status_code == 401 or r.status_code == 403:
            raise IntervalsError(
                f"Intervals.icu rechazó la petición ({r.status_code}). "
                "Revisa la API key y que tengas permiso de entrenador sobre el atleta."
            )
        if r.status_code >= 400:
            raise IntervalsError(f"Intervals.icu devolvió {r.status_code}: {r.text[:300]}")

    def list_athletes(self) -> list[dict]:
        """Atletas que sigues o entrenas (incluido tú)."""
        r = self.client.get("/athletes")
        self._check(r)
        out = []
        for a in r.json():
            name = a.get("name") or " ".join(
                x for x in (a.get("firstname"), a.get("lastname")) if x
            )
            out.append({"id": a["id"], "name": name or a["id"]})
        return sorted(out, key=lambda a: a["name"].lower())

    def create_events(self, athlete_id: str, events: list[dict]) -> list[dict]:
        r = self.client.post(
            f"/athlete/{athlete_id}/events/bulk",
            params={"upsert": "true", "upsertOnUid": "false", "updatePlanApplied": "false"},
            json=events,
        )
        self._check(r)
        return r.json()
