"use strict";
/* ====================== Utilidades ====================== */
const $ = (s, el = document) => el.querySelector(s);
const view = () => $("#view");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const SPORTS = {Run:"Carrera", Ride:"Bici", VirtualRide:"Rodillo", Swim:"Natación", WeightTraining:"Fuerza", Walk:"Caminar", Hike:"Montaña", Rowing:"Remo", Yoga:"Yoga", NordicSki:"Esquí nórdico", Workout:"Otro", TrailRun:"Trail", VirtualRun:"Cinta", GravelRide:"Gravel", MountainBikeRide:"BTT", OpenWaterSwim:"Aguas abiertas"};
const sportName = t => SPORTS[t] || t || "—";
const STATUS = {done: ["✓", "Hecho"], missed: ["✕", "No realizado"], pending: ["", "Pendiente"], today: ["", "Hoy"], extra: ["+", "No programado"]};
const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

async function api(url, opts) {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && /sesión/.test(data.detail || "")) { location.reload(); }
  if (!r.ok) throw new Error(data.detail || `Error ${r.status}`);
  return data;
}
function status(el, kind, html) {
  el.classList.remove("err", "info", "ok");
  el.classList.add("status", "show", kind);
  el.innerHTML = html;
}
const loading = txt => `<div class="status show info"><span class="spinner"></span>${esc(txt)}</div>`;
const errorBox = e => {
  const msg = e.message || String(e);
  const cfg = /Configuración|API key|rechazó/i.test(msg) ? ` <a href="#/configuracion">Ir a Configuración →</a>` : "";
  return `<div class="status show err">${esc(msg)}${cfg}</div>`;
};

// Fechas (siempre en local, formato YYYY-MM-DD)
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseISO = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const monday = s => { const d = parseISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const fmtDay = (s, opts = {day: "numeric", month: "short"}) => parseISO(s).toLocaleDateString("es-ES", opts);
const weekLabel = (a, b) => `${fmtDay(a)} – ${fmtDay(b, {day: "numeric", month: "short", year: "numeric"})}`;

// Métricas
const isPaceSport = t => /Run|Walk|Hike|Swim/.test(t || "");
const isSwim = t => /Swim/.test(t || "");
function fmtDur(s) {
  if (!s) return "—";
  s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s % 60).padStart(2, "0")}s`;
}
const fmtDurShort = s => { if (!s) return "0h"; const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h}h${m ? " " + String(m).padStart(2, "0") + "m" : ""}` : `${m}m`; };
const fmtDist = (m, t) => !m ? "—" : isSwim(t) ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
function fmtSpeed(ms, t) {
  if (!ms) return "—";
  if (isSwim(t)) { const s = 100 / ms; return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")} /100m`; }
  if (isPaceSport(t)) { const s = 1000 / ms; return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")} /km`; }
  return `${(ms * 3.6).toFixed(1)} km/h`;
}
const n0 = v => v == null ? "—" : Math.round(v).toString();
const n1 = v => v == null ? "—" : (Math.round(v * 10) / 10).toString();
const FEEL = {1: "Fuerte", 2: "Bien", 3: "Normal", 4: "Mal", 5: "Muy mal"};

/* ====================== Router ====================== */
function route() {
  const [path, query] = location.hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query || "");
  const parts = (path || "/").split("/").filter(Boolean);
  const section = ["subir", "configuracion"].includes(parts[0]) ? parts[0] : "atletas";
  document.querySelectorAll("nav a").forEach(a => a.classList.toggle("on", a.dataset.nav === section));
  closeModal();
  if (parts[0] === "subir") return renderUpload();
  if (parts[0] === "configuracion") return renderSettings();
  if (parts[0] === "atleta" && parts[1]) return renderAthlete(decodeURIComponent(parts[1]), params.get("semana"));
  return renderOverview(params.get("semana"));
}
window.addEventListener("hashchange", route);

let athletesCache = null;
async function getAthletes() { return athletesCache ||= await api("/api/athletes"); }

function weekNav(start, end, hrefFor) {
  const thisWeek = monday(iso(new Date()));
  return `<div class="weeknav">
    <a class="btn ghost" href="${hrefFor(addDays(start, -7))}" aria-label="Semana anterior">←</a>
    <span class="label">${weekLabel(start, end)}</span>
    <a class="btn ghost" href="${hrefFor(addDays(start, 7))}" aria-label="Semana siguiente">→</a>
    ${start !== thisWeek ? `<a class="btn ghost" href="${hrefFor(thisWeek)}">Esta semana</a>` : ""}
  </div>`;
}

/* ====================== Lista de atletas ====================== */
async function renderOverview(semana) {
  const start = monday(semana || iso(new Date()));
  const href = s => `#/?semana=${s}`;
  view().innerHTML = `
    <div class="pagehead">
      <div><h1>Atletas</h1><p class="sub" style="margin:0">Lo programado y lo realizado esta semana por cada atleta.</p></div>
      ${weekNav(start, addDays(start, 6), href)}
    </div>
    <div class="row" style="margin-bottom:12px"><div style="flex:0 1 280px"><input id="q" placeholder="Buscar atleta…" aria-label="Buscar atleta"></div></div>
    <div id="ov">${loading("Cargando atletas desde Intervals.icu…")}</div>`;
  let data;
  try { data = await api(`/api/overview?start=${start}`); } catch (e) { $("#ov").innerHTML = errorBox(e); return; }
  athletesCache = data.athletes.map(a => ({id: a.id, name: a.name}));
  const days = [...Array(7)].map((_, i) => addDays(data.week_start, i));
  const rowHtml = a => {
    const t = a.totals || {};
    const byDay = d => (a.week || []).filter(x => x.date === d);
    const pct = t.compliance_pct;
    return `<tr data-id="${esc(a.id)}" data-name="${esc(a.name.toLowerCase())}">
      <td><div class="who">${esc(a.name)}</div>${a.error ? `<div class="muted" style="font-size:12px">⚠️ ${esc(a.error)}</div>` : ""}</td>
      <td><div class="days">${days.map((d, i) => `<div class="day"><div class="d">${DAYS[i][0]}</div><div class="dots">${
        byDay(d).map(x => `<span class="dot ${x.status}" title="${esc(sportName(x.type))} · ${STATUS[x.status][1]}">${STATUS[x.status][0]}</span>`).join("")
      }</div></div>`).join("")}</div></td>
      <td class="num">${t.planned_count != null ? `<span class="pct">${pct == null ? "—" : pct + "%"}</span><div class="muted" style="font-size:12px">${t.done_count}/${t.planned_count} hechos${t.extra_count ? ` · +${t.extra_count}` : ""}</div><div class="bar-mini"><i style="width:${pct || 0}%"></i></div>` : "—"}</td>
      <td class="num">${t.planned_count != null ? `${fmtDurShort(t.done_time)}<div class="muted" style="font-size:12px">de ${fmtDurShort(t.planned_time)}</div>` : "—"}</td>
      <td class="num">${t.planned_count != null ? `${n0(t.done_load)}<div class="muted" style="font-size:12px">de ${n0(t.planned_load)}</div>` : "—"}</td>
      <td class="num">${n0(a.fitness)}</td>
      <td class="num">${n0(a.fatigue)}</td>
      <td class="num">${a.form == null ? "—" : (a.form > 0 ? "+" : "") + n0(a.form)}</td>
      <td class="num">${n0(a.hrv)}</td>
    </tr>`;
  };
  $("#ov").innerHTML = data.athletes.length ? `
    <div class="tbl-wrap"><table class="list">
      <thead><tr><th>Atleta</th><th>Semana</th><th class="num">Cumplimiento</th><th class="num">Tiempo</th><th class="num">Carga</th>
      <th class="num" title="Fitness (CTL)">Forma física</th><th class="num" title="Fatiga (ATL)">Fatiga</th><th class="num" title="Forma (TSB) = forma física − fatiga">Frescura</th><th class="num">HRV</th></tr></thead>
      <tbody>${data.athletes.map(rowHtml).join("")}</tbody>
    </table></div>
    <div class="legend">
      <span><span class="dot done">✓</span> Hecho</span><span><span class="dot missed">✕</span> No realizado</span>
      <span><span class="dot pending"></span> Pendiente</span><span><span class="dot extra">+</span> Hecho sin programar</span>
      <span>Cumplimiento = entrenos hechos sobre los programados hasta hoy</span>
    </div>` : `<p class="muted">No hay atletas en tu cuenta de Intervals.icu.</p>`;
  $("#ov tbody")?.addEventListener("click", e => {
    const tr = e.target.closest("tr"); if (tr) location.hash = `#/atleta/${encodeURIComponent(tr.dataset.id)}?semana=${start}`;
  });
  $("#q").addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll("#ov tbody tr").forEach(tr => tr.hidden = q && !tr.dataset.name.includes(q));
  });
}

/* ====================== Ficha de atleta ====================== */
let currentWeek = null;

async function renderAthlete(id, semana) {
  const start = monday(semana || iso(new Date()));
  const href = s => `#/atleta/${encodeURIComponent(id)}?semana=${s}`;
  let name = id;
  try { name = (await getAthletes()).find(a => a.id === id)?.name || id; } catch {}
  view().innerHTML = `
    <p style="margin:0 0 8px"><a href="#/?semana=${start}" class="muted">← Todos los atletas</a></p>
    <div class="pagehead">
      <div><h1>${esc(name)}</h1><p class="sub" style="margin:0"><a href="https://intervals.icu/athlete/${esc(id)}/calendar" target="_blank" rel="noopener" class="muted">Abrir en Intervals.icu ↗</a></p></div>
      <div class="row" style="align-items:center">
        <button id="upToggle" aria-expanded="false">Subir entrenos</button>
        ${weekNav(start, addDays(start, 6), href)}
      </div>
    </div>
    <div id="athUpload" hidden style="margin-bottom:22px">
      <p class="muted" style="margin:0 0 10px">Sube el Excel o la foto con el plan de <b>${esc(name)}</b>. Todos los entrenos se le asignarán a este atleta.</p>
      <div id="athUploader"></div>
    </div>
    <div id="wk">${loading("Cargando semana…")}</div>
    <h2>Evolución (últimos 90 días)</h2>
    <div id="well">${loading("Cargando métricas…")}</div>`;
  const loadWeek = () => api(`/api/athletes/${encodeURIComponent(id)}/week?start=${start}`)
    .then(renderWeek).catch(e => $("#wk").innerHTML = errorBox(e));
  loadWeek();
  let mounted = false;
  const thisMon = monday(iso(new Date()));
  $("#upToggle").onclick = () => {
    const panel = $("#athUpload"), open = panel.hidden;
    panel.hidden = !open;
    $("#upToggle").setAttribute("aria-expanded", String(open));
    $("#upToggle").textContent = open ? "Cerrar subida" : "Subir entrenos";
    if (open && !mounted) {
      mounted = true;
      // por defecto: la semana que estás viendo si es futura; si no, la próxima
      const def = start > thisMon ? start : addDays(thisMon, 7);
      mountUploader($("#athUploader"), {athlete: {id, name}, week: def, onUploaded: wk => {
        if (wk === start) loadWeek();
        else {
          const st = $("#athUploader .st-up");
          st.insertAdjacentHTML("beforeend", `<br><a href="${href(wk)}">Ver la semana del ${fmtDay(wk)} →</a>`);
        }
      }});
    }
    if (open) panel.scrollIntoView({behavior: "smooth", block: "start"});
  };
  api(`/api/athletes/${encodeURIComponent(id)}/wellness?days=90`)
    .then(renderWellness).catch(e => $("#well").innerHTML = errorBox(e));
}

function renderWeek(w) {
  currentWeek = w;
  const t = w.totals;
  const tiles = `<div class="tiles">
    <div class="tile"><div class="k">Cumplimiento</div><div class="v">${t.compliance_pct == null ? "—" : t.compliance_pct + "%"}</div><div class="s">hasta hoy</div></div>
    <div class="tile"><div class="k">Entrenos</div><div class="v">${t.done_count}/${t.planned_count}</div><div class="s">${t.missed_count} no realizados${t.extra_count ? ` · ${t.extra_count} extra` : ""}</div></div>
    <div class="tile"><div class="k">Tiempo</div><div class="v">${fmtDurShort(t.done_time)}</div><div class="s">de ${fmtDurShort(t.planned_time)} programado</div></div>
    ${Object.entries(t.by_sport || {}).filter(([, v]) => v.planned_distance || v.done_distance).map(([sp, v]) =>
      `<div class="tile"><div class="k">${esc(sportName(sp))}</div><div class="v">${fmtDist(v.done_distance, sp)}</div><div class="s">${v.planned_distance ? `de ${fmtDist(v.planned_distance, sp)} programado` : "sin distancia programada"} · ${fmtDurShort(v.done_time)}</div></div>`).join("")}
    <div class="tile"><div class="k">Carga</div><div class="v">${n0(t.done_load)}</div><div class="s">de ${n0(t.planned_load)} programada</div></div>
  </div>`;
  const days = [...Array(7)].map((_, i) => addDays(w.week_start, i));
  const cols = days.map((d, i) => {
    const items = w.planned.map((p, idx) => ({...p, kind: "p", idx})).filter(p => p.date === d)
      .concat(w.extra.map((x, idx) => ({...x, kind: "x", idx, status: "extra"})).filter(x => x.date === d));
    return `<div class="col"><h4 class="${d === w.today ? "today" : ""}">${DAYS[i]} ${fmtDay(d, {day: "numeric"})}${d === w.today ? " · hoy" : ""}</h4>
      ${items.length ? items.map(workoutCard).join("") : `<div class="empty">Descanso</div>`}</div>`;
  }).join("");
  $("#wk").innerHTML = `${tiles}<h2>Calendario de la semana</h2><div class="cal">${cols}</div>`;
  $("#wk .cal").addEventListener("click", e => {
    const c = e.target.closest(".wk"); if (c) openDetail(c.dataset.kind, +c.dataset.idx);
  });
}

function workoutCard(it) {
  const ev = it.event, a = it.activity;
  const title = ev ? ev.name : (a.name || sportName(a.type));
  const type = ev ? ev.type : a.type;
  let body = "";
  if (a) {
    body = `<div class="kv">
      <span>Tiempo</span><b>${fmtDur(a.moving_time)}</b>
      ${a.distance ? `<span>Distancia</span><b>${fmtDist(a.distance, a.type)}</b>` : ""}
      ${a.icu_weighted_avg_watts ? `<span>NP</span><b>${n0(a.icu_weighted_avg_watts)} W</b>` : a.average_speed && a.distance ? `<span>${isPaceSport(a.type) ? "Ritmo" : "Vel."}</span><b>${fmtSpeed(a.average_speed, a.type)}</b>` : ""}
      ${a.average_heartrate ? `<span>FC media</span><b>${n0(a.average_heartrate)}</b>` : ""}
      ${a.icu_training_load ? `<span>Carga</span><b>${n0(a.icu_training_load)}</b>` : ""}
      ${a.compliance != null && ev ? `<span>Ajuste plan</span><b>${n0(a.compliance)}%</b>` : ""}
    </div>`;
  } else if (ev) {
    body = `<div class="kv">
      ${ev.moving_time ? `<span>Previsto</span><b>${fmtDur(ev.moving_time)}</b>` : ""}
      ${ev.distance ? `<span>Distancia</span><b>${fmtDist(ev.distance, ev.type)}</b>` : ""}
      ${ev.icu_training_load ? `<span>Carga</span><b>${n0(ev.icu_training_load)}</b>` : ""}
    </div>`;
  }
  return `<div class="wk ${it.status}" data-kind="${it.kind}" data-idx="${it.idx}" tabindex="0">
    <div class="sp">${esc(sportName(type))}</div>
    <div class="t">${esc(title)}</div>
    <span class="badge ${it.status}">${STATUS[it.status][0]} ${STATUS[it.status][1]}</span>
    ${body}
  </div>`;
}

function metric(k, v) { return v == null || v === "—" ? "" : `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`; }

function zonesHtml(title, secsArr, labels) {
  const total = secsArr.reduce((s, x) => s + x, 0);
  if (!total) return "";
  const max = Math.max(...secsArr);
  return `<h4>${title}</h4><div class="zones">${secsArr.map((s, i) => `
    <span>${esc(labels[i] || "Z" + (i + 1))}</span>
    <div class="b"><i style="width:${(s / max) * 100}%;background:var(--z${Math.min(i + 1, 7)})"></i></div>
    <span class="muted" style="text-align:right">${fmtDurShort(s)} · ${Math.round(100 * s / total)}%</span>`).join("")}</div>`;
}

function openDetail(kind, idx) {
  const it = kind === "p" ? currentWeek.planned[idx] : {...currentWeek.extra[idx], status: "extra"};
  const ev = it.event, a = it.activity;
  const type = (a || ev).type;
  let html = `<button class="ghost close" aria-label="Cerrar">✕</button>
    <div class="muted" style="font-size:13px">${esc(sportName(type))} · ${fmtDay(it.date, {weekday: "long", day: "numeric", month: "long"})}</div>
    <h3>${esc(ev ? ev.name : a.name)}</h3>
    <span class="badge ${it.status}">${STATUS[it.status][0]} ${STATUS[it.status][1]}</span>`;
  if (ev) {
    html += `<h4>Programado</h4>
      <div class="metrics">${metric("Duración prevista", ev.moving_time ? fmtDur(ev.moving_time) : null)}${metric("Distancia prevista", ev.distance ? fmtDist(ev.distance, ev.type) : null)}${metric("Carga prevista", ev.icu_training_load ? n0(ev.icu_training_load) : null)}${metric("Intensidad prevista", ev.icu_intensity ? n0(ev.icu_intensity) + "%" : null)}</div>
      ${ev.description ? `<pre style="margin-top:8px">${esc(ev.description)}</pre>` : ""}`;
  }
  if (a) {
    const pace = a.distance ? fmtSpeed(a.average_speed, a.type) : null;
    html += `<h4>Realizado${a.name && ev ? ` · <span class="muted" style="font-weight:400">${esc(a.name)}</span>` : ""}</h4>
      <div class="metrics">
        ${metric("Tiempo en movimiento", fmtDur(a.moving_time))}
        ${metric("Tiempo total", a.elapsed_time ? fmtDur(a.elapsed_time) : null)}
        ${metric("Distancia", a.distance ? fmtDist(a.distance, a.type) : null)}
        ${metric(isPaceSport(a.type) ? "Ritmo medio" : "Velocidad media", pace)}
        ${metric("Ritmo ajustado (GAP)", a.gap && isPaceSport(a.type) && !isSwim(a.type) ? fmtSpeed(a.gap, a.type) : null)}
        ${metric("Desnivel +", a.total_elevation_gain ? n0(a.total_elevation_gain) + " m" : null)}
        ${metric("FC media", a.average_heartrate ? n0(a.average_heartrate) + " ppm" : null)}
        ${metric("FC máxima", a.max_heartrate ? n0(a.max_heartrate) + " ppm" : null)}
        ${metric("Potencia media", a.icu_average_watts ? n0(a.icu_average_watts) + " W" : null)}
        ${metric("Potencia normalizada", a.icu_weighted_avg_watts ? n0(a.icu_weighted_avg_watts) + " W" : null)}
        ${metric("Intensidad (IF)", a.icu_intensity ? n0(a.icu_intensity) + "%" : null)}
        ${metric("Índice variabilidad", a.icu_variability_index ? a.icu_variability_index.toFixed(2) : null)}
        ${metric("Factor eficiencia", a.icu_efficiency_factor ? a.icu_efficiency_factor.toFixed(2) : null)}
        ${metric("Desacople", a.decoupling != null ? n1(a.decoupling) + "%" : null)}
        ${metric("Carga", a.icu_training_load ? n0(a.icu_training_load) : null)}
        ${metric("TRIMP", a.trimp ? n0(a.trimp) : null)}
        ${metric("Cadencia media", a.average_cadence ? n0(a.average_cadence) : null)}
        ${metric("Calorías", a.calories ? n0(a.calories) + " kcal" : null)}
        ${metric("RPE", a.icu_rpe ? a.icu_rpe + "/10" : null)}
        ${metric("Sensaciones", a.feel ? FEEL[a.feel] || a.feel : null)}
        ${metric("Ajuste al plan", a.compliance != null && ev ? n0(a.compliance) + "%" : null)}
        ${metric("Kg levantados", a.kg_lifted ? n0(a.kg_lifted) + " kg" : null)}
        ${metric("Temperatura", a.average_temp != null ? n0(a.average_temp) + " °C" : null)}
        ${metric("Dispositivo", a.device_name ? esc(a.device_name) : null)}
      </div>
      ${a.description ? `<h4>Comentario del atleta</h4><pre>${esc(a.description)}</pre>` : ""}
      ${Array.isArray(a.icu_hr_zone_times) ? zonesHtml("Tiempo por zonas de FC", a.icu_hr_zone_times, []) : ""}
      ${Array.isArray(a.icu_zone_times) && a.icu_zone_times.length ? zonesHtml("Tiempo por zonas de potencia", a.icu_zone_times.map(z => z.secs || 0), a.icu_zone_times.map(z => z.id)) : ""}
      ${Array.isArray(a.pace_zone_times) ? zonesHtml("Tiempo por zonas de ritmo", a.pace_zone_times, []) : ""}
      <p style="margin:16px 0 0"><a href="https://intervals.icu/activities/${esc(a.id)}" target="_blank" rel="noopener">Ver análisis completo en Intervals.icu ↗</a></p>`;
  } else if (it.status === "missed") {
    html += `<p class="muted" style="margin-top:14px">No hay ninguna actividad registrada para este entreno.</p>`;
  }
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  bg.addEventListener("click", e => { if (e.target === bg || e.target.closest(".close")) closeModal(); });
  document.body.appendChild(bg);
  $(".close", bg).focus();
}
function closeModal() { document.querySelectorAll(".modal-bg").forEach(m => m.remove()); }
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
  if (e.key === "Enter" && e.target.classList?.contains("wk")) e.target.click();
});

/* ====================== Gráficas (SVG) ====================== */
function niceTicks(min, max, n = 4) {
  if (min === max) { min -= 1; max += 1; }
  const step0 = (max - min) / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 5, 10].map(m => m * mag).find(s => s >= step0);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = []; for (let v = lo; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

/** Gráfica de líneas o barras con tooltip. series: [{key,label,color,type:'line'|'bar',fmt}] */
function chart(container, rows, series, {height = 220, zeroLine = false, fromZero = true} = {}) {
  const W = 900, H = height, m = {t: 10, r: 46, b: 24, l: 40};
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  const vals = rows.flatMap(r => series.map(s => r[s.key])).filter(v => v != null);
  if (!vals.length) { container.innerHTML += `<p class="muted">Sin datos en este periodo.</p>`; return; }
  const ticks = niceTicks(fromZero ? Math.min(0, ...vals) : Math.min(...vals), Math.max(...vals));
  const y0 = ticks[0], y1 = ticks[ticks.length - 1];
  const x = i => m.l + (rows.length === 1 ? pw / 2 : (i / (rows.length - 1)) * pw);
  const y = v => m.t + ph - ((v - y0) / (y1 - y0)) * ph;
  const bw = Math.max(2, pw / rows.length - 2);
  const endLabels = [];
  let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  ticks.forEach(t => { svg += `<line class="grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${m.l - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`; });
  if (zeroLine && y0 < 0) svg += `<line class="axis" x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  // etiquetas de fecha (aprox. 6)
  const every = Math.max(1, Math.ceil(rows.length / 6));
  rows.forEach((r, i) => { if (i % every === 0) svg += `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${fmtDay(r.date)}</text>`; });
  series.forEach(s => {
    if (s.type === "bar") {
      rows.forEach((r, i) => {
        const v = r[s.key]; if (v == null) return;
        const top = y(Math.max(v, 0)), bot = y(Math.min(v, 0));
        svg += `<rect x="${x(i) - bw / 2}" y="${top}" width="${bw}" height="${Math.max(1, bot - top)}" rx="1.5" fill="${typeof s.color === "function" ? s.color(v) : s.color}"/>`;
      });
    } else {
      let d = "", pen = false;
      rows.forEach((r, i) => { const v = r[s.key]; if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      const li = rows.map(r => r[s.key]).findLastIndex(v => v != null);
      if (li >= 0) endLabels.push({x: x(li) + 6, y: y(rows[li][s.key]) + 4, v: rows[li][s.key]});
    }
  });
  // etiquetas directas al final de cada línea, separadas para que no se pisen
  endLabels.sort((a, b) => a.y - b.y).forEach((l, i, arr) => { if (i && l.y - arr[i - 1].y < 13) l.y = arr[i - 1].y + 13; });
  endLabels.forEach(l => { svg += `<text x="${l.x}" y="${l.y}" style="fill:var(--text);font-weight:600">${n0(l.v)}</text>`; });
  svg += `<line class="cross" x1="0" x2="0" y1="${m.t}" y2="${m.t + ph}" style="display:none"/>`;
  series.filter(s => s.type !== "bar").forEach(s => { svg += `<circle data-k="${s.key}" r="4" fill="${s.color}" stroke="var(--card)" stroke-width="2" style="display:none"/>`; });
  svg += `<rect class="hit" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.innerHTML = svg + `<div class="tip"></div>`;
  container.appendChild(wrap);
  const el = $("svg", wrap), tip = $(".tip", wrap), cross = $(".cross", el);
  const move = e => {
    const r = el.getBoundingClientRect(), px = (e.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(rows.length - 1, Math.round(((px - m.l) / pw) * (rows.length - 1))));
    const row = rows[i];
    cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i)); cross.style.display = "";
    series.filter(s => s.type !== "bar").forEach(s => {
      const c = $(`circle[data-k="${s.key}"]`, el), v = row[s.key];
      if (v == null) c.style.display = "none"; else { c.setAttribute("cx", x(i)); c.setAttribute("cy", y(v)); c.style.display = ""; }
    });
    tip.innerHTML = `<div class="muted">${fmtDay(row.date, {weekday: "short", day: "numeric", month: "short"})}</div>` +
      series.map(s => `<div><i style="background:${typeof s.color === "function" ? s.color(row[s.key] ?? 0) : s.color}"></i>${s.label}: <b>${row[s.key] == null ? "—" : (s.fmt || n0)(row[s.key])}</b></div>`).join("");
    tip.style.display = "block";
    const left = (x(i) / W) * r.width;
    tip.style.left = Math.min(left + 12, r.width - tip.offsetWidth - 4) + "px";
    tip.style.top = "8px";
  };
  $(".hit", el).addEventListener("pointermove", move);
  $(".hit", el).addEventListener("pointerleave", () => { tip.style.display = "none"; cross.style.display = "none"; el.querySelectorAll("circle").forEach(c => c.style.display = "none"); });
}

function renderWellness(rows) {
  const box = $("#well");
  if (!rows.length) { box.innerHTML = `<p class="muted">No hay métricas de bienestar ni de carga en este periodo.</p>`; return; }
  box.innerHTML = `<div class="charts">
    <div class="chart-card" id="c-fit"><h3>Forma física y fatiga</h3><p class="note">Forma física (CTL) = carga media de 6 semanas · Fatiga (ATL) = carga media de 7 días</p>
      <div class="chart-legend"><span><i style="background:var(--s1)"></i>Forma física</span><span><i style="background:var(--s2)"></i>Fatiga</span></div></div>
    <div class="chart-card" id="c-form"><h3>Frescura (forma física − fatiga)</h3><p class="note">Por encima de 0: fresco · Por debajo de −30: riesgo de sobrecarga</p></div>
    <div class="chart-card" id="c-hrv"><h3>HRV</h3><p class="note">Variabilidad de la frecuencia cardiaca (rMSSD, ms) registrada por el reloj</p></div>
    <div class="chart-card" id="c-rhr"><h3>FC en reposo</h3><p class="note">Pulsaciones por minuto</p></div>
    <div class="chart-card" id="c-sleep"><h3>Sueño</h3><p class="note">Horas dormidas</p></div>
    <div class="chart-card"><h3>Últimos 14 días</h3><div style="overflow-x:auto;margin-top:8px" id="t-well"></div></div>
  </div>`;
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  chart($("#c-fit"), rows, [
    {key: "ctl", label: "Forma física", color: css("--s1")},
    {key: "atl", label: "Fatiga", color: css("--s2")},
  ]);
  chart($("#c-form"), rows, [{key: "form", label: "Frescura", type: "bar",
    color: v => v >= 0 ? css("--s1") : css("--critical"), fmt: v => (v > 0 ? "+" : "") + n0(v)}], {height: 160, zeroLine: true});
  const opt = (id, key, label, fmt) => {
    if (rows.some(r => r[key] != null)) chart($(id), rows, [{key, label, color: css("--s1"), fmt}], {height: 150, fromZero: false});
    else $(id).remove();
  };
  opt("#c-hrv", "hrv", "HRV", n0);
  opt("#c-rhr", "restingHR", "FC reposo", n0);
  const sleepRows = rows.map(r => ({...r, sleepH: r.sleepSecs ? Math.round(r.sleepSecs / 360) / 10 : null}));
  if (sleepRows.some(r => r.sleepH != null)) chart($("#c-sleep"), sleepRows, [{key: "sleepH", label: "Sueño", color: css("--s1"), type: "bar", fmt: v => v + " h"}], {height: 150});
  else $("#c-sleep").remove();
  const last = rows.slice(-14).reverse();
  const cols = [["Fecha", r => fmtDay(r.date, {weekday: "short", day: "numeric"})], ["Forma física", r => n0(r.ctl)], ["Fatiga", r => n0(r.atl)],
    ["Frescura", r => r.form == null ? "—" : (r.form > 0 ? "+" : "") + n0(r.form)], ["HRV", r => n0(r.hrv)], ["FC reposo", r => n0(r.restingHR)],
    ["Sueño", r => r.sleepSecs ? fmtDurShort(r.sleepSecs) : "—"], ["Peso", r => r.weight ? n1(r.weight) + " kg" : "—"],
    ["Fatiga subj.", r => n0(r.fatigue)], ["Dolor musc.", r => n0(r.soreness)], ["Ánimo", r => n0(r.mood)], ["Comentario", r => esc(r.comments || "")]];
  const used = cols.filter(([h, f], i) => i < 4 || last.some(r => f(r) !== "—" && f(r) !== ""));
  $("#t-well").innerHTML = `<table class="simple"><thead><tr>${used.map(([h]) => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>${last.map(r => `<tr>${used.map(([, f]) => `<td>${f(r)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

/* ====================== Subir Excel / fotos ====================== */
const IMG_RE = /\.(png|jpe?g|webp|gif|heic|heif|bmp|tiff?)$/i;
const DROP_HINT = `<strong>Elige el Excel o la foto</strong> o arrástralo aquí<br><small>Excel (.xlsx, .csv) o imagen (captura, foto del móvil). Puedes subir varios a la vez.</small>`;
let activeUploader = null; // recibe las capturas pegadas con Ctrl+V

document.addEventListener("paste", e => {
  if (!activeUploader || !activeUploader.root.isConnected) return;
  const imgs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith("image/"));
  if (imgs.length) activeUploader.add(imgs.map((f, i) => new File([f], f.name && f.name !== "image.png" ? f.name : `captura-${Date.now()}-${i}.png`, {type: f.type})));
});

/**
 * Componente de subida. opts.athlete = {id, name} fija el atleta (subida desde su ficha).
 * opts.week = lunes por defecto. opts.onUploaded(weekStart) tras subir.
 */
function mountUploader(root, {athlete = null, week, onUploaded} = {}) {
  const st = {athletes: [], workouts: [], files: []};
  const q = s => root.querySelector(s);
  root.innerHTML = `
    <section class="card">
      <div class="row">
        <div class="drop">
          <input type="file" class="file-in" accept=".xlsx,.xlsm,.csv,image/*,.heic,.heif" multiple hidden>
          <div class="drop-text">${DROP_HINT}</div>
        </div>
        <div style="flex: 0 1 200px"><label>Lunes de la semana<input type="date" class="week-in"></label></div>
        <div><button class="parse-btn" disabled>Interpretar entrenos</button></div>
      </div>
      <div class="files"></div>
      <div class="status st-parse"></div>
    </section>
    <section class="review" hidden>
      <h2>Revisa los entrenos${athlete ? ` de ${esc(athlete.name)}` : ""}</h2>
      <div class="gen-warn"></div>
      <div class="w-list"></div>
      <div class="bar"><span class="summary"></span><span class="row" style="gap:8px;align-items:center"><span class="confirm-q muted" hidden></span><button class="ghost cancel-btn" hidden>Cancelar</button><button class="upload-btn">Subir a Intervals.icu</button></span></div>
      <div class="status st-up"></div>
    </section>`;
  q(".week-in").value = week;
  const drop = q(".drop"), fileIn = q(".file-in");
  drop.onclick = () => fileIn.click();
  drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); add(e.dataTransfer.files); };
  fileIn.onchange = e => { add(e.target.files); e.target.value = ""; };
  q(".files").addEventListener("click", e => {
    const b = e.target.closest("[data-rm]"); if (!b) return;
    st.files.splice(+b.dataset.rm, 1); renderFiles();
  });

  function add(list) {
    const ok = [...list].filter(f => IMG_RE.test(f.name) || /\.(xlsx|xlsm|csv)$/i.test(f.name));
    const bad = [...list].length - ok.length;
    st.files.push(...ok);
    if (st.files.length > 10) st.files = st.files.slice(0, 10);
    renderFiles();
    if (bad) status(q(".st-parse"), "err", "Algún archivo no es un Excel (.xlsx, .csv) ni una imagen y no se ha añadido.");
    else q(".st-parse").classList.remove("show");
  }
  function renderFiles() {
    q(".files").innerHTML = st.files.map((f, i) => {
      const isImg = IMG_RE.test(f.name) && f.type.startsWith("image/") && !/heic|heif/i.test(f.type);
      const thumb = isImg ? `<img alt="" src="${URL.createObjectURL(f)}">` : `<span class="ficon">${IMG_RE.test(f.name) ? "IMG" : "XLS"}</span>`;
      return `<div class="file">${thumb}<span class="fname">${esc(f.name)}</span><button class="ghost" data-rm="${i}" aria-label="Quitar ${esc(f.name)}">✕</button></div>`;
    }).join("");
    q(".drop-text").innerHTML = st.files.length
      ? `<strong>Añadir más archivos</strong><br><small>${st.files.length} archivo(s) listos · también puedes pegar una captura con Ctrl+V</small>`
      : DROP_HINT;
    q(".parse-btn").disabled = !st.files.length;
  }

  q(".parse-btn").onclick = async () => {
    const btn = q(".parse-btn"); btn.disabled = true;
    q(".review").hidden = true;
    const hasImg = st.files.some(f => IMG_RE.test(f.name));
    status(q(".st-parse"), "info", `<span class="spinner"></span>${hasImg ? "Leyendo la imagen" : "Leyendo el Excel"} e interpretando los entrenos… puede tardar un minuto.`);
    try {
      const fd = new FormData();
      st.files.forEach(f => fd.append("files", f));
      fd.append("week_start", q(".week-in").value);
      if (athlete) fd.append("athlete_id", athlete.id);
      const data = await api("/api/parse", {method: "POST", body: fd});
      st.athletes = data.athletes;
      athletesCache = data.athletes;
      st.workouts = data.workouts.map(w => ({...w, include: true})).sort((a, b) => a.date.localeCompare(b.date));
      q(".gen-warn").innerHTML = data.general_warnings.length
        ? `<div class="warnings"><strong>A revisar:</strong><ul>${data.general_warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul></div>` : "";
      renderReview();
      q(".review").hidden = false;
      status(q(".st-parse"), "ok", `He encontrado ${st.workouts.length} entrenos. Revísalos abajo antes de subirlos.`);
    } catch (e) {
      status(q(".st-parse"), "err", errorBox(e).replace(/^<div[^>]*>|<\/div>$/g, ""));
    } finally { btn.disabled = false; }
  };

  const nameOf = id => st.athletes.find(a => a.id === id)?.name;
  function renderReview() {
    if (athlete) {
      q(".w-list").innerHTML = st.workouts.map((_, i) => card(i)).join("") || "<p>No se ha encontrado ningún entreno.</p>";
    } else {
      const groups = {};
      st.workouts.forEach((w, i) => { (groups[w.athlete_id || ""] ||= []).push(i); });
      const keys = Object.keys(groups).sort((a, b) => (a === "" ? -1 : b === "" ? 1 : (nameOf(a) || "").localeCompare(nameOf(b) || "")));
      q(".w-list").innerHTML = keys.map(k => `
        <div class="athlete-group">
          <h3>${k ? esc(nameOf(k)) : "⚠️ Sin atleta asignado"} · ${groups[k].length} entrenos</h3>
          ${groups[k].map(card).join("")}
        </div>`).join("") || "<p>No se ha encontrado ningún entreno.</p>";
    }
    summary();
  }
  function card(i) {
    const w = st.workouts[i];
    const plan = ["Run", "Ride", "VirtualRide", "Swim", "WeightTraining", "Walk", "Hike", "Rowing", "Yoga", "NordicSki", "Workout"];
    const sportOpts = plan.map(v => `<option value="${v}" ${v === w.sport ? "selected" : ""}>${sportName(v)}</option>`).join("");
    const day = w.date ? fmtDay(w.date, {weekday: "long"}) : "";
    const athField = athlete ? "" : `<div><label>Atleta${w.athlete_name_in_excel ? ` (Excel: ${esc(w.athlete_name_in_excel)})` : ""}<select data-f="athlete_id"><option value="">— Elige atleta —</option>${
      st.athletes.map(a => `<option value="${esc(a.id)}" ${a.id === w.athlete_id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select></label></div>`;
    return `<div class="w ${w.include ? "" : "off"}${athlete ? " fixed" : ""}" data-i="${i}">
      <div class="w-grid">
        ${athField}
        <div><label>Fecha · ${esc(day)}<input type="date" data-f="date" value="${esc(w.date)}"></label></div>
        <div><label>Deporte<select data-f="sport">${sportOpts}</select></label></div>
        <div class="name"><label>Nombre<input data-f="name" value="${esc(w.name)}"></label></div>
        <label class="inc"><input type="checkbox" data-f="include" ${w.include ? "checked" : ""}> Subir</label>
      </div>
      <textarea data-f="description" spellcheck="false" aria-label="Pasos del entreno">${esc(w.description)}</textarea>
      ${w.warning ? `<div class="w-warn">⚠️ ${esc(w.warning)}</div>` : ""}
    </div>`;
  }
  q(".w-list").addEventListener("change", e => {
    const el = e.target, box = el.closest(".w"); if (!box || !el.dataset.f) return;
    const w = st.workouts[+box.dataset.i];
    w[el.dataset.f] = el.type === "checkbox" ? el.checked : el.value;
    if (["athlete_id", "include", "date"].includes(el.dataset.f)) renderReview(); else summary();
  });
  q(".w-list").addEventListener("input", e => {
    const el = e.target, box = el.closest(".w"); if (!box || !el.dataset.f || el.type === "checkbox") return;
    st.workouts[+box.dataset.i][el.dataset.f] = el.value;
  });
  function summary() {
    const sel = st.workouts.filter(w => w.include);
    const missing = sel.filter(w => !w.athlete_id).length;
    const n = new Set(sel.map(w => w.athlete_id).filter(Boolean)).size;
    q(".summary").textContent = athlete ? `${sel.length} entrenos para ${athlete.name}`
      : `${sel.length} entrenos para ${n} atleta(s)` + (missing ? ` · ${missing} sin atleta` : "");
    q(".upload-btn").disabled = !sel.length || missing > 0;
    resetConfirm();
  }
  // Confirmación en la propia página (dos pasos) en lugar de un diálogo
  function resetConfirm() {
    q(".confirm-q").hidden = true; q(".cancel-btn").hidden = true;
    q(".upload-btn").textContent = "Subir a Intervals.icu"; q(".upload-btn").dataset.armed = "";
  }
  q(".cancel-btn").onclick = resetConfirm;
  q(".upload-btn").onclick = async () => {
    const sel = st.workouts.filter(w => w.include);
    const btn = q(".upload-btn");
    if (!btn.dataset.armed) {
      const n = new Set(sel.map(w => w.athlete_id)).size;
      q(".confirm-q").textContent = athlete ? `¿Programar ${sel.length} entrenos en el calendario de ${athlete.name}?`
        : `¿Programar ${sel.length} entrenos en ${n} calendario(s)?`;
      q(".confirm-q").hidden = false; q(".cancel-btn").hidden = false;
      btn.textContent = "Sí, subir"; btn.dataset.armed = "1";
      return;
    }
    resetConfirm();
    btn.disabled = true;
    status(q(".st-up"), "info", '<span class="spinner"></span>Subiendo a Intervals.icu…');
    const wk = monday(sel.map(w => w.date).sort()[0] || q(".week-in").value);
    try {
      const data = await api("/api/upload", {method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({workouts: sel.map(({athlete_id, date, sport, name, description}) => ({athlete_id, date, sport, name, description}))})});
      const ok = data.results.filter(r => r.ok), bad = data.results.filter(r => !r.ok);
      let html = ok.map(r => `✅ ${esc(nameOf(r.athlete_id))}: ${r.count} entrenos programados` +
        (athlete ? "" : ` · <a href="#/atleta/${encodeURIComponent(r.athlete_id)}?semana=${wk}">ver semana</a>`)).join("<br>");
      if (bad.length) html += (html ? "<br>" : "") + bad.map(r => `❌ ${esc(nameOf(r.athlete_id))}: ${esc(r.error)}`).join("<br>");
      if (ok.length && !athlete) html += `<br><a href="#/?semana=${wk}">Ver todos los atletas →</a>`;
      status(q(".st-up"), bad.length ? "err" : "ok", html);
      if (ok.length && onUploaded) onUploaded(wk);
    } catch (e) {
      status(q(".st-up"), "err", esc(e.message));
    } finally { btn.disabled = false; }
  };
  const api_ = {root, add};
  activeUploader = api_;
  return api_;
}

function renderUpload() {
  view().innerHTML = `
    <h1>Subir Excel</h1>
    <p class="sub">Sube el Excel con los entrenos de la semana, o una foto o captura de pantalla del Excel, de uno o varios atletas.
    Si haces un Excel distinto para cada atleta, también puedes subirlo desde la ficha del atleta.</p>
    <div id="uploader"></div>`;
  mountUploader($("#uploader"), {week: addDays(monday(iso(new Date())), 7)});
}

/* ====================== Configuración ====================== */
async function renderSettings() {
  view().innerHTML = `<h1>Configuración</h1>
    <p class="sub">Conecta la app con tu cuenta de Intervals.icu. Las claves se guardan en el servidor de la app, no en tu navegador.</p>
    <div id="cfg">${loading("Cargando…")}</div>`;
  let st;
  try { st = await api("/api/settings"); } catch (e) { $("#cfg").innerHTML = errorBox(e); return; }
  const state = k => st[k].configured
    ? `<span class="badge done">✓ Configurada (${esc(st[k].hint)})</span>`
    : `<span class="badge missed">✕ Sin configurar</span>`;
  $("#cfg").innerHTML = `
    <section class="card" style="max-width:720px">
      <h2 style="margin-top:0">Intervals.icu ${state("intervals_api_key")}</h2>
      <p class="muted" style="margin-top:0">Necesaria para ver a tus atletas y programarles entrenos. Usa la clave de <b>tu cuenta de entrenador</b>.</p>
      <ol class="muted" style="margin:0 0 14px;padding-left:20px;font-size:14px">
        <li>Entra en <a href="https://intervals.icu/settings" target="_blank" rel="noopener">intervals.icu/settings</a>.</li>
        <li>Baja hasta <b>Developer Settings</b> y pulsa <b>API Key</b> (créala si no tienes).</li>
        <li>Copia la clave y pégala aquí.</li>
      </ol>
      <label for="k-int">API key de Intervals.icu</label>
      <div class="row" style="align-items:center;flex-wrap:nowrap">
        <input id="k-int" type="password" autocomplete="off" placeholder="${st.intervals_api_key.configured ? "Déjalo vacío para mantener la actual" : "Pega aquí tu API key"}">
        <button class="ghost" type="button" data-show="k-int">Ver</button>
      </div>
      <div class="row" style="margin-top:12px">
        <button id="save-int">Guardar y comprobar</button>
        ${st.intervals_api_key.configured ? `<button class="ghost" id="test-int">Comprobar conexión</button>` : ""}
      </div>
      <div id="st-int" class="status"></div>
    </section>
    <section class="card" style="max-width:720px;margin-top:16px">
      <h2 style="margin-top:0">IA para leer los Excel ${state("anthropic_api_key")}</h2>
      <p class="muted" style="margin-top:0">Necesaria solo para <b>Subir Excel</b>. Consíguela en <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener">platform.claude.com</a> → API Keys. Empieza por <code>sk-ant-</code>.</p>
      <label for="k-ai">Clave de Anthropic</label>
      <div class="row" style="align-items:center;flex-wrap:nowrap">
        <input id="k-ai" type="password" autocomplete="off" placeholder="${st.anthropic_api_key.configured ? "Déjalo vacío para mantener la actual" : "sk-ant-…"}">
        <button class="ghost" type="button" data-show="k-ai">Ver</button>
      </div>
      <div class="row" style="margin-top:12px"><button id="save-ai">Guardar</button></div>
      <div id="st-ai" class="status"></div>
    </section>`;
  document.querySelectorAll("[data-show]").forEach(b => b.onclick = () => {
    const i = $("#" + b.dataset.show); i.type = i.type === "password" ? "text" : "password"; b.textContent = i.type === "password" ? "Ver" : "Ocultar";
  });
  const save = async (field, input, out, btn) => {
    const v = $(input).value.trim();
    if (!v) { status($(out), "err", "Pega la clave primero."); return; }
    $(btn).disabled = true;
    status($(out), "info", '<span class="spinner"></span>Comprobando…');
    try {
      const r = await api("/api/settings", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({[field]: v})});
      athletesCache = null;
      await renderSettings();
      status($(out), "ok", field === "intervals_api_key"
        ? `Conectado con Intervals.icu: ${r.athletes} atleta(s) encontrados. <a href="#/">Ver atletas →</a>`
        : "Clave guardada.");
    } catch (e) { status($(out), "err", esc(e.message)); $(btn).disabled = false; }
  };
  $("#save-int").onclick = () => save("intervals_api_key", "#k-int", "#st-int", "#save-int");
  $("#save-ai").onclick = () => save("anthropic_api_key", "#k-ai", "#st-ai", "#save-ai");
  $("#test-int")?.addEventListener("click", async () => {
    status($("#st-int"), "info", '<span class="spinner"></span>Comprobando…');
    try { const r = await api("/api/settings/test", {method: "POST"}); status($("#st-int"), "ok", `Conexión correcta: ${r.athletes} atleta(s).`); }
    catch (e) { status($("#st-int"), "err", esc(e.message)); }
  });
}

fetch("/api/session").then(r => r.json()).then(d => { if (d.auth) $("#logout").hidden = false; }).catch(() => {});
route();
