"""Usa Claude para interpretar el Excel y convertirlo en entrenos de Intervals.icu."""
from __future__ import annotations

import json

import anthropic

MODEL = "claude-opus-5-5"

SPORTS = [
    "Run", "Ride", "VirtualRide", "Swim", "WeightTraining", "Walk", "Hike",
    "Rowing", "Yoga", "NordicSki", "Workout",
]

SCHEMA = {
    "type": "object",
    "properties": {
        "workouts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "athlete_id": {"type": "string"},
                    "athlete_name_in_excel": {"type": "string"},
                    "date": {"type": "string"},
                    "sport": {"type": "string", "enum": SPORTS},
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "warning": {"type": "string"},
                },
                "required": [
                    "athlete_id", "athlete_name_in_excel", "date", "sport",
                    "name", "description", "warning",
                ],
                "additionalProperties": False,
            },
        },
        "general_warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["workouts", "general_warnings"],
    "additionalProperties": False,
}

SYSTEM = """Eres el asistente de un entrenador de resistencia (running, ciclismo, natación, triatlón, fuerza).
El entrenador te pasa el contenido de un Excel con los entrenamientos de la semana de uno o varios atletas.
El formato del Excel puede ser cualquiera: tu trabajo es entenderlo y devolver un entreno por cada sesión
de cada atleta y día, listo para subir al calendario de Intervals.icu.

## Fotos y capturas
A veces el entrenador no sube el Excel sino una foto o captura de pantalla del Excel (o varias).
Tiene el mismo formato: lee la tabla de la imagen con cuidado, fila a fila y columna a columna,
respetando a qué atleta y a qué día pertenece cada celda (cabeceras de fila y de columna).
Si una captura larga llega troceada en varias imágenes consecutivas, las partes se solapan un poco:
no dupliques las filas repetidas. Si algo no se lee bien (borroso, cortado, reflejos), no lo inventes:
pon tu mejor lectura y explícalo en `warning`.

## Atletas
Te doy la lista de atletas de Intervals.icu (id y nombre). Asigna a cada sesión el `athlete_id` del atleta
correspondiente, emparejando por nombre aunque esté escrito distinto (apodos, solo nombre, sin tildes...).
Si no puedes emparejarlo con seguridad, deja `athlete_id` vacío y explícalo en `warning`.
Rellena siempre `athlete_name_in_excel` con el nombre tal cual aparece en el Excel.
Si llegan varios archivos o imágenes, cada uno puede ser el plan de un atleta distinto: el nombre del
archivo (p. ej. «Laura semana 45.xlsx») o un título dentro de la hoja suelen indicar de quién es.

## Fechas
`date` en formato YYYY-MM-DD. Si el Excel solo pone días de la semana (Lunes, Martes, L, M, X...),
usa la semana que empieza el lunes que te indico. Si hay fechas explícitas, respétalas.

## Qué NO es un entreno
Días de descanso, celdas vacías, totales semanales o comentarios generales no generan entreno
(si hay un comentario general importante para un atleta, menciónalo en `general_warnings`).
Si un día tiene dos sesiones (p. ej. mañana carrera y tarde fuerza), crea dos entrenos.

## Campo `name`
Un título corto en español, p. ej. "Series 6x1000", "Rodaje suave 45'", "Fuerza tren inferior".

## Campo `description` — sintaxis de entrenos estructurados de Intervals.icu
Escribe el entreno con la sintaxis de Intervals.icu para que se convierta en un entreno estructurado
(que el atleta pueda mandar a su reloj). Reglas:
- Cada paso es una línea que empieza por "- ".
- Duración: `30s`, `10m` (m = MINUTOS), `1h`, `1h30m`. Distancia: `400mtr` (metros), `1km`, `2.5km`. Nunca uses `m` para metros.
- Bloques con repeticiones: una línea de cabecera con `Nx` (p. ej. `Series 6x`) seguida de sus pasos y una línea en blanco al final.
- Secciones opcionales con título en su propia línea: `Calentamiento`, `Principal`, `Vuelta a la calma`. Deja una línea en blanco entre secciones.
- Intensidad:
  - Ritmo (carrera/natación): `Z2 Pace`, `85% Pace`, `4:30/km Pace`, `1:45/100m Pace`, rango `4:20-4:30/km Pace`.
  - Frecuencia cardiaca: `Z2 HR`, `75% HR`, `70-80% HR`, `75% LTHR`.
  - Potencia (ciclismo): `Z3`, `75%` (de FTP), `200w`, rango `88-94%`, rampa `ramp 50-75%`.
  - Cadencia opcional: `90rpm`.
- Si el entrenador indica la intensidad con zonas (Z1-Z5), ritmos, %FC o vatios, tradúcelo fielmente con la unidad adecuada.
  Si solo dice "suave"/"rodaje"/"regenerativo" usa Z1-Z2; "tempo" Z3; "umbral" Z4; "series cortas/VO2" Z5. Avísalo en `warning` si lo has supuesto.
- Recuperaciones: paso propio (p. ej. `- 90s Z1 Pace` o `- 200mtr Z1 Pace`). "Rec. andando/parado" → paso con la duración y sin intensidad o en Z1.
- Texto libre del entrenador (técnica, sensaciones, notas): puedes ponerlo como líneas normales SIN guion al principio de la descripción.
- Fuerza, movilidad, yoga o sesiones no estructurables: escribe la sesión en texto normal (sin guiones de pasos) y, si se sabe la duración, añade una línea `- 45m`.

Ejemplo (carrera):
Calentamiento
- 15m Z2 Pace

Series 6x
- 1km 4:00/km Pace
- 90s Z1 Pace

Vuelta a la calma
- 10m Z1 Pace

Ejemplo (bici):
- 15m ramp 50-75%

Principal 3x
- 10m 90-95% 90rpm
- 5m 55%

- 10m 50%

## Avisos
En `warning` (cadena vacía si todo está claro) explica cualquier suposición o ambigüedad de ESA sesión.
En `general_warnings` pon lo que el entrenador deba revisar a nivel general.
No inventes entrenos que no estén en el Excel."""


class AIError(Exception):
    pass


def parse_workouts(excel_text: str, athletes: list[dict], week_start: str, api_key: str = "",
                   images: list[tuple[str, list[dict]]] | None = None,
                   athlete: dict | None = None) -> dict:
    if not api_key:
        raise AIError("Falta la clave de Anthropic para interpretar el Excel. Añádela en Configuración.")
    client = anthropic.Anthropic(api_key=api_key)
    athletes_txt = "\n".join(f"- id={a['id']} · nombre={a['name']}" for a in athletes) or "(sin atletas)"
    content: list[dict] = []
    for name, blocks in images or []:
        label = f"Imagen «{name}»" + (f" (troceada en {len(blocks)} partes, de arriba abajo)" if len(blocks) > 1 else "")
        content.append({"type": "text", "text": label + ":"})
        content.extend(blocks)
    if athlete:
        text = (
            f"Lunes de la semana a programar: {week_start}\n\n"
            f"Este archivo es el plan de UN ÚNICO atleta: id={athlete['id']} · nombre={athlete['name']}.\n"
            "Asigna todas las sesiones a este atleta aunque su nombre no aparezca o esté escrito de otra forma. "
            "Si el archivo parece contener entrenos de otras personas, avísalo en `general_warnings`.\n\n"
        )
    else:
        text = (
            f"Lunes de la semana a programar: {week_start}\n\n"
            f"Atletas en Intervals.icu:\n{athletes_txt}\n\n"
        )
    if excel_text:
        text += f"Contenido del Excel:\n<excel>\n{excel_text}\n</excel>\n\n"
    if images:
        text += "Las imágenes de arriba son fotos o capturas del Excel con los entrenos."
    content.append({"type": "text", "text": text})
    try:
        with client.beta.messages.stream(
            model=MODEL,
            max_tokens=64000,
            system=SYSTEM,
            messages=[{"role": "user", "content": content}],
            output_config={
                "effort": "high",
                "format": {"type": "json_schema", "schema": SCHEMA},
            },
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        ) as stream:
            msg = stream.get_final_message()
    except anthropic.AuthenticationError as e:
        raise AIError("La clave de Anthropic no es válida. Revísala en Configuración.") from e
    except anthropic.RateLimitError as e:
        raise AIError("Límite de uso de la API de Anthropic alcanzado; prueba en un minuto.") from e
    except anthropic.APIStatusError as e:
        raise AIError(f"Error de la API de Anthropic ({e.status_code}): {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise AIError("No se pudo conectar con la API de Anthropic.") from e

    if msg.stop_reason == "refusal":
        raise AIError("El modelo no ha querido procesar este archivo.")
    if msg.stop_reason == "max_tokens":
        raise AIError("Hay demasiados entrenos para una sola pasada; súbelos en varias tandas.")
    text = next((b.text for b in msg.content if b.type == "text"), None)
    if not text:
        raise AIError("La IA no devolvió resultado.")
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise AIError("La IA devolvió un resultado no válido; vuelve a intentarlo.") from e
