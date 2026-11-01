"""Convierte un Excel/CSV en texto legible para que la IA lo interprete."""
from __future__ import annotations

import csv
import datetime as dt
import io

from openpyxl import load_workbook

MAX_CHARS = 400_000


def _fmt(value) -> str:
    if value is None:
        return ""
    if isinstance(value, dt.datetime):
        if value.time() == dt.time(0, 0):
            return value.strftime("%Y-%m-%d (%A)")
        return value.strftime("%Y-%m-%d %H:%M")
    if isinstance(value, dt.date):
        return value.strftime("%Y-%m-%d (%A)")
    if isinstance(value, dt.time):
        return value.strftime("%H:%M:%S")
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).replace("\r", " ").replace("\n", " / ").replace("|", "/").strip()


def _rows_to_text(rows: list[list[str]]) -> str:
    rows = [r for r in rows if any(c for c in r)]
    if not rows:
        return "(vacía)"
    width = max(len(r) for r in rows)
    # quita columnas totalmente vacías
    keep = [i for i in range(width) if any(i < len(r) and r[i] for r in rows)]
    lines = []
    for n, r in enumerate(rows, 1):
        cells = [r[i] if i < len(r) else "" for i in keep]
        lines.append(f"F{n}: | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def workbook_to_text(data: bytes, filename: str) -> str:
    name = filename.lower()
    if name.endswith(".csv"):
        text = data.decode("utf-8-sig", errors="replace")
        try:
            dialect = csv.Sniffer().sniff(text[:5000], delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        rows = [[c.strip() for c in r] for r in csv.reader(io.StringIO(text), dialect)]
        out = "### Hoja: CSV\n" + _rows_to_text(rows)
    else:
        wb = load_workbook(io.BytesIO(data), data_only=True)
        parts = []
        for ws in wb.worksheets:
            if ws.sheet_state != "visible":
                continue
            # celdas combinadas en vertical (p. ej. el nombre del atleta ocupando
            # varias filas): repite el valor en cada fila de la primera columna
            merged = {}
            for rng in ws.merged_cells.ranges:
                v = ws.cell(rng.min_row, rng.min_col).value
                for r in range(rng.min_row, rng.max_row + 1):
                    merged[(r, rng.min_col)] = v
            rows = []
            for r_idx, row in enumerate(ws.iter_rows(), 1):
                rows.append([
                    _fmt(merged.get((r_idx, c_idx), cell.value))
                    for c_idx, cell in enumerate(row, 1)
                ])
            parts.append(f"### Hoja: {ws.title}\n" + _rows_to_text(rows))
        out = "\n\n".join(parts)
    if len(out) > MAX_CHARS:
        raise ValueError(
            "El Excel es demasiado grande para procesarlo de una vez. "
            "Divídelo en varios archivos (por ejemplo, uno por atleta)."
        )
    return out
