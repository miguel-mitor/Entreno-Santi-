# Panel del entrenador (Excel → Intervals.icu)

App web para entrenadores con dos partes:

- **Atletas**: lista de todas las personas que entrenas con su semana (qué se le ha programado,
  qué ha hecho y qué no), cumplimiento, tiempo, carga, forma física, fatiga, frescura y HRV.
  Al entrar en un atleta ves su calendario semanal, cada entreno con lo programado frente a lo
  realizado (ritmo, FC, potencia, carga, zonas, RPE, sensaciones, comentarios…) y la evolución
  de los últimos 90 días (forma física/fatiga, frescura, HRV, FC en reposo, sueño, peso).
- **Subir Excel**: sueltas un Excel con los entrenos de la semana (o una foto / captura de pantalla del Excel), la IA (Claude) lo interpreta
  y, tras revisarlo, se programa en el calendario de cada atleta en Intervals.icu como entreno
  estructurado (que el atleta puede mandar a su reloj).

Todos los datos se leen en directo de Intervals.icu; la app no guarda nada.

> Nota: si un atleta sincroniza sus actividades **solo a través de Strava**, Intervals.icu no
> puede compartir sus métricas por la API (restricción de Strava). Para ver todas las métricas,
> el atleta debe conectar su reloj (Garmin, Coros, Suunto, Polar, Wahoo…) directamente a Intervals.icu.

## Cómo funciona la subida del Excel

1. Subes el Excel (`.xlsx` o `.csv`) o fotos/capturas del Excel (`.png`, `.jpg`, `.heic`…; también se pueden pegar con Ctrl+V), uno o varios a la vez, y eliges el lunes de la semana.
   Las fotos se enderezan, se recortan los márgenes y, si la captura es muy larga, se trocea para que se lea bien.
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
# (opcional) cp .env.example .env  — también puedes poner las claves desde Configuración
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
- `app/images.py` — prepara las fotos y capturas para la IA.
- `app/ai.py` — instrucciones a Claude y formato de salida (sintaxis de entrenos de Intervals.icu).
- `app/intervals.py` — llamadas a la API de Intervals.icu.
- `app/tracking.py` — cruza lo programado con lo realizado y prepara las métricas.
- `app/static/` — interfaz (`index.html`, `app.js`, `styles.css`).

## Vista previa con datos de ejemplo

`python3 preview/build.py` genera `preview/preview.html`, una versión autocontenida de la interfaz
que funciona sin servidor ni claves, con atletas inventados (`preview/demo.js`).
