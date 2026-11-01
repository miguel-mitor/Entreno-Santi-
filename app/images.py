"""Prepara fotos o capturas del Excel para enviarlas a la IA."""
from __future__ import annotations

import base64
import io

from PIL import Image, ImageOps

try:  # fotos HEIC de iPhone
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:  # pragma: no cover
    pass

IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic", ".heif", ".bmp", ".tif", ".tiff")
MAX_EDGE = 2576          # resolución máxima que aprovecha el modelo
MAX_TILE_WIDTH = 2000    # capturas muy altas: se trocean para no perder legibilidad
MAX_BYTES = 4_500_000    # límite por imagen de la API (5 MB) con margen
MAX_TILES = 12


def is_image(filename: str) -> bool:
    return filename.lower().endswith(IMAGE_EXT)


def _encode(img: Image.Image) -> dict:
    for quality in (92, 85, 75, 65):
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=True)
        if buf.tell() <= MAX_BYTES:
            break
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": "image/jpeg",
                   "data": base64.standard_b64encode(buf.getvalue()).decode()},
    }


def _trim_margins(img: Image.Image, pad: int = 12) -> Image.Image:
    """Quita los márgenes casi blancos alrededor de la tabla (típico en capturas de pantalla)."""
    mask = img.convert("L").point(lambda p: 255 if p < 235 else 0)
    box = mask.getbbox()
    if not box:
        return img
    l, t, r, b = box
    l, t = max(0, l - pad), max(0, t - pad)
    r, b = min(img.width, r + pad), min(img.height, b + pad)
    if (r - l) * (b - t) > 0.9 * img.width * img.height:
        return img
    return img.crop((l, t, r, b))


def image_blocks(data: bytes) -> list[dict]:
    """Devuelve uno o varios bloques de imagen listos para la API."""
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)  # endereza fotos hechas con el móvil
    except Exception as e:
        raise ValueError("No se pudo abrir la imagen. Prueba con una captura en PNG o JPG.") from e
    if img.mode not in ("RGB", "L"):
        bg = Image.new("RGB", img.size, "white")
        bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[-1])
        img = bg
    img = img.convert("RGB")
    img = _trim_margins(img)
    w, h = img.size

    # Captura muy alta (muchas filas): reducir el ancho y trocear en vertical con solape
    if h > MAX_EDGE and h > 1.6 * w:
        if w > MAX_TILE_WIDTH:
            img = img.resize((MAX_TILE_WIDTH, round(h * MAX_TILE_WIDTH / w)), Image.LANCZOS)
            w, h = img.size
        tile_h = MAX_EDGE
        step = int(tile_h * 0.88)
        tiles, top = [], 0
        while top < h and len(tiles) < MAX_TILES:
            tiles.append(_encode(img.crop((0, top, w, min(h, top + tile_h)))))
            if top + tile_h >= h:
                break
            top += step
        return tiles

    scale = min(1.0, MAX_EDGE / max(w, h))
    if scale < 1:
        img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    return [_encode(img)]
