"""Genera una vista previa autocontenida (un solo HTML) con datos de ejemplo."""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
st = root / "app" / "static"
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / "preview" / "preview.html"
html = f"""<title>Panel del entrenador</title>
<style>
{(st / "styles.css").read_text()}
</style>
<div class="demo-banner">Vista previa con atletas y datos de ejemplo. Al publicarla se conectará a tu cuenta de Intervals.icu.</div>
<header class="top"><div class="in">
  <span class="brand">Panel del entrenador</span>
  <nav>
    <a href="#/" data-nav="atletas">Atletas</a>
    <a href="#/subir" data-nav="subir">Subir Excel</a>
    <a href="#/configuracion" data-nav="configuracion">Configuración</a>
  </nav>
</div></header>
<main id="view"></main>
<script>
{(root / "preview" / "demo.js").read_text()}
</script>
<script>
{(st / "app.js").read_text()}
</script>
"""
out.write_text(html)
print(out)
