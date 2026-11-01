# Excel → Intervals.icu

App web para entrenadores: sueltas un Excel con los entrenos de la semana de tus atletas,
la IA (Claude) lo interpreta y, tras revisarlo, se programa en el calendario de cada atleta
en Intervals.icu como entreno estructurado (que el atleta puede mandar a su reloj).

## Cómo funciona

1. Subes el Excel (`.xlsx` o `.csv`) y eliges el lunes de la semana.
2. La app lee todas las hojas y se las pasa a Claude junto con la lista de tus atletas de Intervals.icu.
   El Excel puede tener cualquier formato (atletas en filas o en columnas, una hoja por atleta, texto libre...).
3. Ves cada entreno con atleta, fecha, deporte, nombre y pasos, con avisos donde la IA tuvo que suponer algo.
   Puedes corregir cualquier cosa o desmarcar entrenos.
4. Pulsas **Subir a Intervals.icu** y se crean en el calendario de cada atleta.
   Si vuelves a subir el mismo entreno (misma fecha, deporte y nombre) se intenta actualizar en lugar de duplicarlo.

## Puesta en marcha

Necesitas Python 3.10 o superior.

```bash
pip install -r requirements.txt
cp .env.example .env      # y rellena las dos claves
uvicorn app.main:app --port 8000
```

Abre http://localhost:8000

### Claves

- **INTERVALS_API_KEY**: en Intervals.icu → Settings → Developer Settings → API Key.
  Usa la de tu cuenta de entrenador: la app lista los atletas que entrenas y escribe en sus calendarios
  (los atletas deben haberte dado acceso de entrenador).
- **ANTHROPIC_API_KEY**: en https://platform.claude.com (API Keys).

## Estructura

- `app/main.py` — servidor web (FastAPI) y endpoints.
- `app/excel.py` — convierte el Excel en texto para la IA.
- `app/ai.py` — instrucciones a Claude y formato de salida (sintaxis de entrenos de Intervals.icu).
- `app/intervals.py` — llamadas a la API de Intervals.icu.
- `app/static/index.html` — interfaz.
