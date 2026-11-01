"use strict";
/* Vista previa: simula la API de la app con datos de ejemplo (no conecta con Intervals.icu). */
(function () {
  const pad = n => String(n).padStart(2, "0");
  const isoD = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const pD = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const add = (s, n) => { const d = pD(s); d.setDate(d.getDate() + n); return isoD(d); };
  const mon = s => { const d = pD(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoD(d); };
  const TODAY = isoD(new Date());
  function rng(seed) { let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }

  const ATHLETES = [
    {id: "i101", name: "Santiago Pérez", plan: "tri", skip: 0.10},
    {id: "i102", name: "Laura Gómez", plan: "run", skip: 0.30},
    {id: "i103", name: "Marta Ruiz", plan: "run", skip: 0.05},
    {id: "i104", name: "Javier Moreno", plan: "bike", skip: 0.20},
    {id: "i105", name: "Lucía Fernández", plan: "tri", skip: 0.15},
  ];
  const PLANS = {
    run: [
      [0, "Run", "Rodaje suave 45'", 2700, 9000, 40, "- 45m Z2 Pace"],
      [1, "Run", "Series 6x1000", 3600, 11000, 70, "Calentamiento\n- 15m Z2 Pace\n\nSeries 6x\n- 1km 3:50/km Pace\n- 90s Z1 Pace\n\nVuelta a la calma\n- 10m Z1 Pace"],
      [2, "WeightTraining", "Fuerza tren inferior", 2700, 0, 25, "Sentadilla 4x8\nPeso muerto rumano 3x10\nZancadas 3x12\n- 45m"],
      [3, "Run", "Tempo 3x10'", 3900, 12000, 65, "Calentamiento\n- 15m Z2 Pace\n\nTempo 3x\n- 10m Z3 Pace\n- 3m Z1 Pace\n\n- 10m Z1 Pace"],
      [5, "Run", "Tirada larga 1h30", 5400, 17000, 90, "- 90m Z2 Pace"],
    ],
    bike: [
      [0, "Ride", "Recuperación 1h", 3600, 28000, 35, "- 60m 55%"],
      [1, "VirtualRide", "Umbral 3x10'", 4500, 0, 80, "- 15m ramp 50-75%\n\nPrincipal 3x\n- 10m 95-100% 90rpm\n- 5m 55%\n\n- 10m 50%"],
      [3, "Ride", "Sweet spot 2x20'", 5400, 45000, 90, "- 15m ramp 50-75%\n\n2x\n- 20m 88-93%\n- 5m 55%\n\n- 10m 50%"],
      [5, "Ride", "Fondo 3h Z2", 10800, 90000, 150, "- 3h 65-75%"],
      [6, "Run", "Carrera suave 30'", 1800, 6000, 25, "- 30m Z2 Pace"],
    ],
    tri: [
      [0, "Swim", "Natación técnica", 2700, 2000, 35, "Calentamiento\n- 400mtr Z1 Pace\n\nTécnica 8x\n- 50mtr Z2 Pace\n- 15s\n\n- 1000mtr Z2 Pace\n- 200mtr Z1 Pace"],
      [1, "Run", "Series 6x1000", 3600, 11000, 70, "Calentamiento\n- 15m Z2 Pace\n\nSeries 6x\n- 1km 4:00/km Pace\n- 90s Z1 Pace\n\n- 10m Z1 Pace"],
      [2, "WeightTraining", "Fuerza general", 2700, 0, 25, "Circuito de fuerza y core\n- 45m"],
      [3, "Ride", "Bici 3x10' umbral", 5400, 40000, 85, "- 15m ramp 50-75%\n\n3x\n- 10m 95%\n- 5m 55%\n\n- 10m 50%"],
      [5, "Run", "Tirada larga 1h20", 4800, 15000, 80, "- 80m Z2 Pace"],
      [6, "Swim", "Natación continua", 3000, 2500, 40, "- 2500mtr Z2 Pace"],
    ],
  };

  function events(a, start) {
    return PLANS[a.plan].map(([d, type, name, mt, dist, load, desc], i) => ({
      id: `${a.id}-${start}-${i}`, start_date_local: add(start, d) + "T00:00:00", category: "WORKOUT",
      type, name, moving_time: mt, distance: dist || null, icu_training_load: load, description: desc,
    }));
  }
  const SPEED = {Run: 3.5, Ride: 8.3, VirtualRide: 9, Swim: 0.92, WeightTraining: 0};
  function activities(a, start) {
    const r = rng(a.id + start), out = [];
    events(a, start).forEach((e, i) => {
      const day = e.start_date_local.slice(0, 10);
      const roll = r();
      if (day > TODAY || (day === TODAY && roll < .5) || roll < a.skip) return;
      const f = .88 + r() * .17, isBike = /Ride/.test(e.type), mt = Math.round(e.moving_time * f);
      const sp = SPEED[e.type] * (.95 + r() * .1);
      out.push({
        id: `act-${e.id}`, start_date_local: day + "T07:30:00", type: e.type, name: {Run: "Carrera matinal", Ride: "Salida en bici", VirtualRide: "Zwift", Swim: "Piscina", WeightTraining: "Gimnasio"}[e.type],
        paired_event_id: e.id, moving_time: mt, elapsed_time: Math.round(mt * 1.08),
        distance: e.type === "WeightTraining" ? null : Math.round(sp * mt), average_speed: sp || null, gap: e.type === "Run" ? sp * 1.02 : null,
        total_elevation_gain: isBike ? Math.round(200 + r() * 600) : e.type === "Run" ? Math.round(30 + r() * 150) : null,
        average_heartrate: Math.round(135 + r() * 25), max_heartrate: Math.round(165 + r() * 20),
        icu_average_watts: isBike ? Math.round(180 + r() * 50) : null, icu_weighted_avg_watts: isBike ? Math.round(200 + r() * 50) : null,
        icu_intensity: Math.round(65 + r() * 30), icu_variability_index: isBike ? 1 + r() * .1 : null, icu_efficiency_factor: 1.2 + r() * .5,
        decoupling: Math.round(r() * 80) / 10, icu_training_load: Math.round(e.icu_training_load * f), trimp: Math.round(e.icu_training_load * 1.3 * f),
        calories: Math.round(mt / 60 * 11), average_cadence: isBike ? Math.round(85 + r() * 8) : e.type === "Run" ? Math.round(170 + r() * 12) : null,
        icu_rpe: Math.round(3 + r() * 5), feel: 1 + Math.floor(r() * 4), compliance: Math.round(72 + r() * 28),
        description: r() < .3 ? ["Muy buenas sensaciones", "Piernas cargadas al final", "Algo de viento, ritmo un poco más lento"][Math.floor(r() * 3)] : null,
        icu_hr_zone_times: [.15, .35, .25, .17, .08].map(x => Math.round(mt * x * (.8 + r() * .4))),
        icu_zone_times: isBike ? ["Z1", "Z2", "Z3", "Z4", "Z5"].map((id, k) => ({id, secs: Math.round(mt * [.2, .35, .2, .2, .05][k])})) : null,
        device_name: ["Garmin Forerunner 965", "Garmin Edge 840", "COROS PACE 3"][Math.floor(r() * 3)],
      });
    });
    if (r() < .5) {
      const d = add(start, 4);
      if (d <= TODAY) out.push({id: `extra-${a.id}-${start}`, start_date_local: d + "T18:00:00", type: "Ride", name: "Paseo en bici", moving_time: 3600, distance: 24000, average_speed: 6.7, average_heartrate: 118, icu_training_load: 28});
    }
    return out;
  }
  const family = t => /Swim/.test(t) ? "Swim" : /Run/.test(t) ? "Run" : /Ride/.test(t) ? "Ride" : (t || "Otro");
  function week(a, startIn) {
    const start = mon(startIn), end = add(start, 6);
    const evs = events(a, start), acts = activities(a, start);
    const byEv = Object.fromEntries(acts.filter(x => x.paired_event_id).map(x => [x.paired_event_id, x]));
    const used = new Set(Object.values(byEv).map(x => x.id));
    const planned = evs.map(e => {
      const date = e.start_date_local.slice(0, 10), act = byEv[e.id] || null;
      const status = act ? "done" : date < TODAY ? "missed" : date === TODAY ? "today" : "pending";
      return {event: e, date, status, activity: act};
    });
    const extra = acts.filter(x => !used.has(x.id)).map(x => ({date: x.start_date_local.slice(0, 10), activity: x}));
    const done = planned.filter(p => p.activity).map(p => p.activity).concat(extra.map(x => x.activity));
    const tot = (arr, k) => Math.round(arr.reduce((s, x) => s + (x[k] || 0), 0) * 10) / 10;
    const past = planned.filter(p => p.date <= TODAY);
    const by_sport = {};
    [["planned", evs], ["done", done]].forEach(([k, arr]) => arr.forEach(i => {
      const f = by_sport[family(i.type)] ||= {planned_time: 0, done_time: 0, planned_distance: 0, done_distance: 0};
      f[k + "_time"] += i.moving_time || 0; f[k + "_distance"] += i.distance || 0;
    }));
    return {
      athlete_id: a.id, week_start: start, week_end: end, today: TODAY, planned, extra,
      totals: {
        planned_count: planned.length, done_count: planned.filter(p => p.status === "done").length,
        missed_count: planned.filter(p => p.status === "missed").length, extra_count: extra.length,
        compliance_pct: past.length ? Math.round(100 * past.filter(p => p.status === "done").length / past.length) : null,
        planned_time: tot(evs, "moving_time"), done_time: tot(done, "moving_time"),
        planned_distance: tot(evs, "distance"), done_distance: tot(done, "distance"),
        planned_load: tot(evs, "icu_training_load"), done_load: tot(done, "icu_training_load"), by_sport,
      },
    };
  }
  function wellness(a, days) {
    const r = rng(a.id + "w"), out = [];
    let ctl = 40 + r() * 20, atl = ctl;
    const base = {i101: 62, i102: 48, i103: 71, i104: 55, i105: 66}[a.id];
    for (let i = 120; i >= 0; i--) {
      const date = add(TODAY, -i), dow = (pD(date).getDay() + 6) % 7;
      const load = [40, 70, 25, 80, 0, 90, 35][dow] * (.7 + r() * .6);
      ctl += (load - ctl) / 42; atl += (load - atl) / 7;
      if (i > days) continue;
      out.push({date, ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10, form: Math.round((ctl - atl) * 10) / 10,
        hrv: Math.round(base + (r() - .5) * 16), restingHR: Math.round(48 + (r() - .5) * 6), sleepSecs: Math.round(23000 + r() * 7000),
        weight: Math.round((68 + (a.id.charCodeAt(4) % 5) * 3 + (r() - .5)) * 10) / 10,
        soreness: r() < .5 ? 1 + Math.floor(r() * 3) : null, mood: r() < .5 ? 1 + Math.floor(r() * 3) : null});
    }
    return out;
  }
  const settings = {intervals_api_key: {configured: true, hint: "••••a1b2"}, anthropic_api_key: {configured: true, hint: "••••x9z8"}};

  async function handle(path, q, opts) {
    const find = id => ATHLETES.find(a => a.id === id);
    if (path === "/api/athletes") return ATHLETES.map(({id, name}) => ({id, name}));
    if (path === "/api/overview") {
      const start = mon(q.get("start") || TODAY);
      return {week_start: start, week_end: add(start, 6), today: TODAY, athletes: ATHLETES.map(a => {
        const w = week(a, start), well = wellness(a, 14), last = well[well.length - 1];
        return {id: a.id, name: a.name, totals: w.totals,
          week: w.planned.map(p => ({date: p.date, status: p.status, type: p.event.type}))
            .concat(w.extra.map(x => ({date: x.date, status: "extra", type: x.activity.type}))).sort((x, y) => x.date.localeCompare(y.date)),
          fitness: last.ctl, fatigue: last.atl, form: last.form, hrv: last.hrv};
      })};
    }
    let m = path.match(/^\/api\/athletes\/([^/]+)\/week$/);
    if (m) return week(find(decodeURIComponent(m[1])), q.get("start") || TODAY);
    m = path.match(/^\/api\/athletes\/([^/]+)\/wellness$/);
    if (m) return wellness(find(decodeURIComponent(m[1])), +(q.get("days") || 90));
    if (path === "/api/settings" && (!opts || !opts.method || opts.method === "GET")) return settings;
    if (path === "/api/settings") {
      const body = JSON.parse(opts.body);
      if (body.intervals_api_key) {
        if (body.intervals_api_key.length < 10) throw [400, "Intervals.icu no acepta esa clave. Comprueba que la has copiado entera desde intervals.icu/settings → Developer Settings."];
        settings.intervals_api_key = {configured: true, hint: "••••" + body.intervals_api_key.slice(-4)};
        return {...settings, athletes: ATHLETES.length};
      }
      if (body.anthropic_api_key) {
        if (!body.anthropic_api_key.startsWith("sk-ant-")) throw [400, "La clave de Anthropic debe empezar por «sk-ant-»."];
        settings.anthropic_api_key = {configured: true, hint: "••••" + body.anthropic_api_key.slice(-4)};
      }
      return settings;
    }
    if (path === "/api/settings/test") return {athletes: ATHLETES.length};
    if (path === "/api/parse") {
      await new Promise(r => setTimeout(r, 1500));
      const ws = opts.body.get("week_start"), fixedId = opts.body.get("athlete_id");
      if (fixedId) return {athletes: ATHLETES.map(({id, name}) => ({id, name})), general_warnings: ["Vista previa: estos entrenos son de ejemplo, no se han leído de tus archivos (Excel o fotos)."],
        workouts: [
          {athlete_id: fixedId, athlete_name_in_excel: "", date: add(ws, 0), sport: "Run", name: "Rodaje suave 50'", description: "- 50m Z2 Pace", warning: ""},
          {athlete_id: fixedId, athlete_name_in_excel: "", date: add(ws, 1), sport: "Run", name: "Series 8x400", description: "Calentamiento\n- 15m Z2 Pace\n\nSeries 8x\n- 400mtr 3:30/km Pace\n- 90s Z1 Pace\n\n- 10m Z1 Pace", warning: ""},
          {athlete_id: fixedId, athlete_name_in_excel: "", date: add(ws, 2), sport: "WeightTraining", name: "Fuerza 40'", description: "Circuito de fuerza\n- 40m", warning: ""},
          {athlete_id: fixedId, athlete_name_in_excel: "", date: add(ws, 3), sport: "Ride", name: "Bici 1h30 Z2", description: "- 90m 65-75%", warning: "En la foto ponía «bici 1h30» sin intensidad; he supuesto Z2."},
          {athlete_id: fixedId, athlete_name_in_excel: "", date: add(ws, 5), sport: "Run", name: "Tirada larga 1h40", description: "- 100m Z2 Pace", warning: ""},
        ]};
      return {athletes: ATHLETES.map(({id, name}) => ({id, name})), general_warnings: ["Vista previa: estos entrenos son de ejemplo, no se han leído de tus archivos (Excel o fotos)."],
        workouts: [
          {athlete_id: "i101", athlete_name_in_excel: "Santi", date: add(ws, 1), sport: "Run", name: "Series 6x1000", description: "Calentamiento\n- 15m Z2 Pace\n\nSeries 6x\n- 1km 3:50/km Pace\n- 90s Z1 Pace\n\nVuelta a la calma\n- 10m Z1 Pace", warning: ""},
          {athlete_id: "i101", athlete_name_in_excel: "Santi", date: add(ws, 3), sport: "WeightTraining", name: "Fuerza 45'", description: "Fuerza general\n- 45m", warning: ""},
          {athlete_id: "i102", athlete_name_in_excel: "Laura", date: add(ws, 0), sport: "Swim", name: "Natación técnica 2000", description: "- 2000mtr Z2 Pace", warning: "No se indicaba intensidad; he supuesto Z2."},
          {athlete_id: "i104", athlete_name_in_excel: "Javi", date: add(ws, 2), sport: "Ride", name: "Bici 3x10' al 90%", description: "- 15m ramp 50-75%\n\nPrincipal 3x\n- 10m 90%\n- 5m 55%\n\n- 10m 50%", warning: ""},
          {athlete_id: "", athlete_name_in_excel: "Pepe", date: add(ws, 4), sport: "Run", name: "Rodaje 40'", description: "- 40m Z2 Pace", warning: "No encuentro a «Pepe» entre tus atletas."},
        ]};
    }
    if (path === "/api/upload") {
      await new Promise(r => setTimeout(r, 800));
      const by = {};
      JSON.parse(opts.body).workouts.forEach(w => by[w.athlete_id] = (by[w.athlete_id] || 0) + 1);
      return {results: Object.entries(by).map(([athlete_id, count]) => ({athlete_id, ok: true, count}))};
    }
    throw [404, "No encontrado"];
  }
  window.fetch = async (url, opts) => {
    const u = new URL(url, "https://demo.local");
    try {
      const data = await handle(u.pathname, u.searchParams, opts);
      await new Promise(r => setTimeout(r, 150));
      return new Response(JSON.stringify(data), {status: 200, headers: {"Content-Type": "application/json"}});
    } catch (e) {
      const [st, msg] = Array.isArray(e) ? e : [500, String(e)];
      return new Response(JSON.stringify({detail: msg}), {status: st, headers: {"Content-Type": "application/json"}});
    }
  };
})();
