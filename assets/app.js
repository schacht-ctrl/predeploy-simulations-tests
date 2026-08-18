/* ==========================================================================
   app.js — Datenladen, Zustand und Rendering des Dashboards
   Die Ergebnisdaten werden zur Laufzeit aus dem GitHub-Repository gelesen.
   Versionen ergeben sich ausschliesslich aus der Ordnerstruktur.
   ========================================================================== */

const CONFIG = {
  owner: 'schacht-ctrl',
  repo: 'predeploy-simulations-tests',
  branch: 'main',
  // Jeder Ordner im Repo-Root ist eine Agenten-Version; sein vollständiger
  // Name ist die Versionsbezeichnung (z. B. „V1 OpenAI“). Nur die
  // Infrastrukturordner des Dashboards sind ausgenommen.
  ignoreDirs: ['assets', 'scripts', 'node_modules', '.github', '.git', '.netlify'],
};

const GH_API = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents`;
const GH_RAW = `https://raw.githubusercontent.com/${CONFIG.owner}/${CONFIG.repo}/${CONFIG.branch}`;
const REPO_URL = `https://github.com/${CONFIG.owner}/${CONFIG.repo}`;

/* Mit „?source=local“ werden manifest.json und die CSV-Dateien relativ zur
   Seite geladen statt aus dem GitHub-Repository. Gedacht zum Entwickeln und
   Prüfen neuer Daten, bevor sie gepusht sind. Standard ist immer GitHub.    */
const LOCAL_SOURCE = new URLSearchParams(location.search).get('source') === 'local';
const DATA_BASE = LOCAL_SOURCE ? '.' : GH_RAW;

/* ==========================================================================
   1 — Parser
   ========================================================================== */

/* CSV nach RFC 4180 (Trennzeichen Komma, Anführungszeichen verdoppelt) */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', i = 0, inQ = false;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvToObjects(text) {
  const rows = parseCSV(text).filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i] !== undefined ? r[i] : ''; });
    return o;
  });
}

/* Trajektorien liegen als Python-Literal vor (einfache Anführungszeichen).
   Getesteter Tokenizer: Werte enden an einem Anführungszeichen, dem
   (nach Whitespace) ein Komma oder eine schliessende Klammer folgt.        */
const ESCAPES = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' };
function unescapePy(v) {
  if (v.indexOf('\\') === -1) return v;
  let out = '', i = 0;
  while (i < v.length) {
    if (v[i] === '\\' && ESCAPES[v[i + 1]] !== undefined) { out += ESCAPES[v[i + 1]]; i += 2; }
    else { out += v[i]; i++; }
  }
  return out;
}
function parseTrajectory(s) {
  if (!s) return [];
  const out = [];
  let i = 0;
  const n = s.length;
  const ws = () => { while (i < n && (s[i] === ' ' || s[i] === '\n' || s[i] === '\t')) i++; };
  ws();
  if (s[i] !== '[') return [];
  i++;
  while (i < n) {
    ws();
    if (s[i] === ']') break;
    if (s[i] !== '{') break;
    i++;
    const obj = {};
    while (i < n) {
      ws();
      if (s[i] === '}') { i++; break; }
      if (s[i] !== "'") return out;
      let j = s.indexOf("'", i + 1);
      if (j < 0) return out;
      const key = s.slice(i + 1, j);
      i = j + 1;
      ws();
      if (s[i] === ':') i++;
      ws();
      if (s[i] !== "'") { // unerwarteter Werttyp: bis Komma/Klammer überspringen
        while (i < n && s[i] !== ',' && s[i] !== '}') i++;
        if (s[i] === ',') i++;
        continue;
      }
      let k = i + 1;
      for (;;) {
        k = s.indexOf("'", k);
        if (k < 0) return out;
        if (s[k - 1] === '\\') { k++; continue; }
        let m = k + 1;
        while (m < n && (s[m] === ' ' || s[m] === '\n' || s[m] === '\t')) m++;
        if (m < n && (s[m] === ',' || s[m] === '}')) break;
        k++;
      }
      obj[key] = unescapePy(s.slice(i + 1, k));
      i = k + 1;
      ws();
      if (s[i] === ',') i++;
    }
    out.push(obj);
    ws();
    if (s[i] === ',') i++;
  }
  return out;
}

/* "0 days 00:00:37.914000" → Sekunden */
function parseDuration(v) {
  if (!v) return null;
  const m = /(?:(\d+)\s*days?\s*)?(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(v);
  if (!m) { const f = parseFloat(v); return Number.isNaN(f) ? null : f; }
  return (+(m[1] || 0)) * 86400 + (+m[2]) * 3600 + (+m[3]) * 60 + parseFloat(m[4]);
}
function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const f = parseFloat(v);
  return Number.isNaN(f) ? null : f;
}

/* ==========================================================================
   2 — Laden aus GitHub
   ========================================================================== */
async function ghList(path = '') {
  const url = `${GH_API}/${path}?ref=${CONFIG.branch}`;
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' } });
  if (res.status === 403 || res.status === 429) {
    throw new Error('RATE_LIMIT');
  }
  if (res.status === 404) throw new Error(`NOT_FOUND:${path || '/'}`);
  if (!res.ok) throw new Error(`GITHUB_${res.status}`);
  return res.json();
}

const textCache = new Map();
async function fetchCSV(file) {
  const key = file.sha || file.path;
  if (textCache.has(key)) return textCache.get(key);
  // Cache-Buster über den Blob-SHA: neuer Inhalt ⇒ neue URL ⇒ sofort aktuell
  const url = `${file.url}?v=${encodeURIComponent(file.sha || Date.now())}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`DOWNLOAD_${res.status}`);
  const txt = await res.text();
  textCache.set(key, txt);
  return txt;
}

const DATA = { versions: [], byVersion: new Map(), source: null, generated: null };

/* Bevorzugt: manifest.json aus dem Repo (kein API-Limit, funktioniert auch
   dort, wo api.github.com blockiert ist). Fallback: Contents-API.          */
async function loadManifestIndex() {
  const res = await fetch(`${DATA_BASE}/manifest.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`MANIFEST_${res.status}`);
  const m = await res.json();
  if (!m || !Array.isArray(m.versions) || !m.versions.length) throw new Error('MANIFEST_EMPTY');
  DATA.generated = m.generated || null;
  return m.versions.map((v) => {
    const files = (v.files || []).map((f) => ({
      name: f.name, path: f.path, sha: f.sha, url: `${DATA_BASE}/${f.path.split('/').map(encodeURIComponent).join('/')}`,
    }));
    return {
      // Versionsbezeichnung = Ordnername, unverändert
      id: v.id || v.folder || '',
      folder: v.folder || v.id,
      summary: files.find((f) => /summary/i.test(f.name)),
      runsFiles: files.filter((f) => /runs/i.test(f.name)),
      datasets: [],
    };
  });
}

async function loadApiIndex() {
  const root = await ghList('');
  const dirs = root
    .filter((e) => e.type === 'dir'
      && CONFIG.ignoreDirs.indexOf(e.name) === -1
      && e.name.charAt(0) !== '.')
    .sort((a, b) => compareVersions(a.name, b.name));
  if (!dirs.length) throw new Error('NO_VERSIONS');
  const versions = [];
  for (const dir of dirs) {
    const files = (await ghList(encodeURIComponent(dir.name)))
      .filter((f) => f.type === 'file' && /\.csv$/i.test(f.name))
      .map((f) => ({ name: f.name, path: f.path, sha: f.sha, url: f.download_url }));
    if (!files.length) continue;
    versions.push({
      id: dir.name, folder: dir.name,
      summary: files.find((f) => /summary/i.test(f.name)),
      runsFiles: files.filter((f) => /runs/i.test(f.name)),
      datasets: [],
    });
  }
  return versions;
}

/* Farbzuordnung: fest über die sortierte Reihenfolge der Versionsordner */
const VERSION_COLORS = new Map();
function assignVersionColors(versions) {
  VERSION_COLORS.clear();
  versions.forEach((v, i) => {
    const override = VERSION_COLOR_OVERRIDES[v.id];
    VERSION_COLORS.set(v.id, override || VERSION_SLOTS[i] || VERSION_FALLBACK);
  });
}
function versionColor(id) {
  return VERSION_COLORS.get(id) || VERSION_FALLBACK;
}

async function loadIndex() {
  let versions;
  if (LOCAL_SOURCE) {
    versions = await loadManifestIndex();
    DATA.source = 'local';
  } else {
    try {
      versions = await loadManifestIndex();
      DATA.source = 'manifest';
    } catch (e) {
      versions = await loadApiIndex();
      DATA.source = 'api';
    }
  }
  const seen = new Set();
  versions = versions.filter((v) => v.id && !seen.has(v.id) && seen.add(v.id));
  versions.sort((a, b) => compareVersions(a.id, b.id));
  if (!versions.length) throw new Error('NO_VERSIONS');
  assignVersionColors(versions);
  DATA.versions = versions;

  for (const v of versions) {
    if (!v.summary) { v.error = `Im Ordner „${v.folder}“ liegt keine Summary-Datei (Dateiname muss „summary“ enthalten).`; continue; }
    try {
      const rows = csvToObjects(await fetchCSV(v.summary));
      v.datasets = rows.filter((r) => r.dataset).map((r) => buildDataset(r, v));
    } catch (e) {
      v.error = `Die Summary-Datei in „${v.folder}“ konnte nicht gelesen werden (${e.message}).`;
    }
  }
  DATA.byVersion = new Map(versions.map((v) => [v.id, v]));
}

function buildDataset(row, version) {
  const scores = {};
  Object.keys(row).forEach((k) => {
    const m = /^score\.(.+)\.(avg|n)$/.exec(k);
    if (!m) return;
    const key = m[1];
    scores[key] = scores[key] || { avg: null, n: null };
    scores[key][m[2]] = num(row[k]);
  });
  Object.keys(scores).forEach((k) => {
    if (scores[k].avg === null) delete scores[k];
  });
  const info = datasetInfo(row.dataset);
  // Nicht auswertbare Metriken dieses Datensatzes gar nicht übernehmen
  Object.keys(scores).forEach((k) => {
    if (!metricApplies(k, row.dataset, info)) delete scores[k];
  });
  const runsFile = version.runsFiles.find((f) => row.experiment && f.name.indexOf(row.experiment) !== -1);
  return {
    version: version.id,
    key: version.id + '::' + row.dataset,
    dataset: row.dataset,
    experiment: row.experiment || '',
    experimentId: row.experiment_id || '',
    startTime: row.start_time || '',
    runCount: num(row.run_count) || 0,
    errorRate: num(row.error_rate),
    latencyP50: parseDuration(row.latency_p50),
    latencyP99: parseDuration(row.latency_p99),
    tokens: num(row.total_tokens),
    cost: num(row.total_cost),
    datasetVersion: row.dataset_version || '',
    scores,
    info,
    scenario: info.scenario,
    runsFile,
    hasRuns: !!runsFile,   // Runs-Datei können nachgeliefert werden
    runs: null,
    turnStats: null,
  };
}

/* Runs-Datei eines Datensatzes nachladen (nur bei Bedarf) */
async function loadRuns(ds) {
  if (ds.runs) return ds.runs;
  if (!ds.runsFile) throw new Error(`Für „${ds.info.name}“ (${ds.version}) liegt keine Runs-Datei im Repository.`);
  const rows = csvToObjects(await fetchCSV(ds.runsFile));
  ds.runs = rows.map((r) => {
    const feedback = {};
    Object.keys(r).forEach((k) => {
      const m = /^feedback\.(.+)$/.exec(k);
      if (m) feedback[m[1]] = num(r[k]);
    });
    const inputs = {};
    Object.keys(r).forEach((k) => {
      const m = /^input\.(.+)$/.exec(k);
      if (m) inputs[m[1]] = r[k];
    });
    return {
      id: r.id || '',
      inputs,
      feedback,
      executionTime: num(r.execution_time),
      // Turn-Kennzahlen (in älteren Exporten nicht enthalten)
      assistantTurns: num(r.assistant_turns),
      totalTurns: num(r.total_turns),
      avgTurnDuration: num(r.avg_turn_duration),
      error: r.error || '',
      trajectoryRaw: r['outputs.trajectory'] || '',
    };
  });
  ds.turnStats = {
    assistantTurns: stats(ds.runs.map((r) => r.assistantTurns)),
    totalTurns: stats(ds.runs.map((r) => r.totalTurns)),
    avgTurnDuration: stats(ds.runs.map((r) => r.avgTurnDuration)),
    executionTime: stats(ds.runs.map((r) => r.executionTime)),
  };
  return ds.runs;
}

/* ==========================================================================
   3 — Auswertung
   ========================================================================== */
function selectedVersions() {
  return DATA.versions.filter((v) => STATE.selected.has(v.id) && !v.error);
}
function datasetsOf(version, scenarioId) {
  return version.datasets.filter((d) => !scenarioId || d.scenario === scenarioId);
}
/* Vereinigung der Datensätze über die ausgewählten Versionen: eine neue
   Version kann Sub-Szenarien ergänzen, die es in der älteren nicht gab.     */
function unionDatasets(versions, scenarioId) {
  const seen = new Map();
  versions.forEach((v) => datasetsOf(v, scenarioId).forEach((d) => {
    if (!seen.has(d.dataset)) seen.set(d.dataset, d);
  }));
  return [...seen.values()];
}
/* Gewichtetes Mittel über Datensätze (Gewicht = Anzahl bewerteter Anrufe).
   Nicht auswertbare Kombinationen sind in d.scores bereits entfernt.        */
function pooled(datasets, metricKey) {
  let sum = 0, n = 0, used = 0;
  datasets.forEach((d) => {
    const s = d.scores[metricKey];
    if (!s || s.avg === null) return;
    const w = s.n || d.runCount || 0;
    sum += s.avg * w; n += w; used++;
  });
  return n ? { avg: sum / n, n, datasets: used } : null;
}
/* Datensätze, in denen die Metrik erhoben und auswertbar ist */
function datasetsWithMetric(datasets, metricKey) {
  return datasets.filter((d) => d.scores[metricKey] && d.scores[metricKey].avg !== null);
}
function metricsIn(datasets) {
  const set = new Set();
  datasets.forEach((d) => Object.keys(d.scores).forEach((k) => set.add(k)));
  return [...set].sort((a, b) => (metricInfo(a).order || 999) - (metricInfo(b).order || 999) || a.localeCompare(b));
}
function decimalsForMetric(key) {
  return metricInfo(key).typ === 'regelbasiert' ? 1 : 0;
}
/* Ein einzelner Anruf hat bei Judge-Metriken die Bewertung 0 oder 1 – ein
   Prozentwert wäre hier irreführend. Regelbasierte Metriken sind Anteile.   */
function isBinaryMetric(key) {
  return metricInfo(key).typ !== 'regelbasiert';
}
function fmtRunValue(key, v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return isBinaryMetric(key) ? fmtNum(v, 0) : fmtPct(v, 1);
}
function scenarioOf(id) { return SCENARIOS.find((s) => s.id === id); }

/* ==========================================================================
   4 — Zustand
   ========================================================================== */
const STATE = {
  selected: new Set(),
  openKpi: null,           // Kennzahl-ID der geöffneten Aufschlüsselung
  openScenario: null,
  openMetric: {},          // scenarioId → metricKey
  tables: new Set(),       // Chart-IDs mit Tabellenansicht
  exampleDataset: {},      // "scenario::metric" → dataset-Key
};

/* ==========================================================================
   5 — Rendering: Grundgerüst
   ========================================================================== */
const $ = (sel) => document.querySelector(sel);

function renderAll() {
  renderFilterbar();
  renderKpis();
  renderKpiDetail();
  renderAggregate();
  renderScenarios();
  renderScenarioDetail();
  renderFooter();
  flushDraws(); // erst jetzt hängt alles im Dokument und ist messbar
}

function renderFilterbar() {
  const box = $('#version-chips');
  box.textContent = '';
  DATA.versions.forEach((v) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.setAttribute('aria-pressed', STATE.selected.has(v.id) ? 'true' : 'false');
    b.style.setProperty('--chip-color', versionColor(v.id));
    const sw = document.createElement('span');
    sw.className = 'swatch';
    b.appendChild(sw);
    b.appendChild(document.createTextNode(v.id));
    if (v.error) { b.disabled = true; b.title = v.error; }
    b.addEventListener('click', () => {
      if (STATE.selected.has(v.id)) {
        if (STATE.selected.size > 1) STATE.selected.delete(v.id);
      } else {
        if (STATE.selected.size >= MAX_COMPARE) return;
        STATE.selected.add(v.id);
      }
      renderAll();
    });
    box.appendChild(b);
  });
  const note = $('#filter-note');
  note.textContent = DATA.versions.length > 1
    ? `${STATE.selected.size} von ${DATA.versions.length} Versionen ausgewählt · max. ${MAX_COMPARE} gleichzeitig`
    : 'Weitere Versionen erscheinen automatisch, sobald ein neuer Versionsordner im Datenrepository liegt.';
}

/* --- Kennzahlen: Werte je Datensatzmenge ------------------------------- */
function measureValue(field, datasets) {
  const calls = datasets.reduce((a, d) => a + (d.runCount || 0), 0);
  const wmean = (get) => {
    let s = 0, w = 0;
    datasets.forEach((d) => {
      const v = get(d);
      if (v === null || v === undefined || Number.isNaN(v)) return;
      const k = d.runCount || 0;
      s += v * k; w += k;
    });
    return w ? s / w : null;
  };
  switch (field) {
    case 'calls': return calls;
    case 'datasets': return datasets.length;
    case 'metrics': return metricsIn(datasets).length;
    case 'errorRate': return wmean((d) => d.errorRate);
    case 'latencyP50': return wmean((d) => d.latencyP50);
    case 'cost': return datasets.reduce((a, d) => a + (d.cost || 0), 0);
    case 'tokens': return datasets.reduce((a, d) => a + (d.tokens || 0), 0);
    case 'costPerCall': return calls ? datasets.reduce((a, d) => a + (d.cost || 0), 0) / calls : null;
    case 'tokensPerCall': return calls ? datasets.reduce((a, d) => a + (d.tokens || 0), 0) / calls : null;
    // Turn-Kennzahlen: nur aus Datensätzen mit geladener Runs-Datei
    case 'assistantTurns': return wmean((d) => d.turnStats && d.turnStats.assistantTurns.mean);
    case 'totalTurns': return wmean((d) => d.turnStats && d.turnStats.totalTurns.mean);
    case 'avgTurnDuration': return wmean((d) => d.turnStats && d.turnStats.avgTurnDuration.mean);
    default: return null;
  }
}

const MEASURE_FORMATS = {
  int: (v) => fmtInt(v),
  pct: (v) => fmtPct(v, 1),
  sec: (v) => (v === null || v === undefined || Number.isNaN(v) ? '–' : fmtNum(v, 1) + ' s'),
  sec2: (v) => (v === null || v === undefined || Number.isNaN(v) ? '–' : fmtNum(v, 2) + ' s'),
  num1: (v) => fmtNum(v, 1),
  usd: (v) => (v === null || v === undefined || Number.isNaN(v) ? '–' : fmtNum(v, 2) + ' $'),
  usd4: (v) => (v === null || v === undefined || Number.isNaN(v) ? '–' : fmtNum(v, 4) + ' $'),
};
/* Kompakte Variante für Achsenbeschriftungen. Die Nachkommastellen richten
   sich nach der Achsenobergrenze, damit alle Marken gleich formatiert sind.  */
const MEASURE_AXIS_FORMATS = {
  int: (v) => fmtInt(v),
  pct: (v) => fmtPct(v, 0),
  sec: (v, max) => fmtNum(v, max >= 10 ? 0 : 1) + ' s',
  sec2: (v, max) => fmtNum(v, max >= 10 ? 0 : 1) + ' s',
  num1: (v, max) => fmtNum(v, max >= 10 ? 0 : 1),
  usd: (v, max) => fmtNum(v, max >= 10 ? 0 : max >= 1 ? 1 : 2) + ' $',
  usd4: (v, max) => fmtNum(v, max >= 1 ? 2 : max >= 0.1 ? 2 : 3) + ' $',
};
const fmtMeasure = (kind, v) => (MEASURE_FORMATS[kind] || MEASURE_FORMATS.int)(v);
const fmtMeasureAxis = (kind, v, max) => (MEASURE_AXIS_FORMATS[kind] || MEASURE_AXIS_FORMATS.int)(v, max || 0);

function kpiTile(measure, value, hint) {
  const d = document.createElement('button');
  d.className = 'kpi kpi-clickable';
  d.type = 'button';
  const isOpen = STATE.openKpi === measure.id;
  d.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (isOpen) d.dataset.open = 'true';
  const l = document.createElement('div'); l.className = 'k-label'; l.textContent = measure.label;
  const v = document.createElement('div'); v.className = 'k-value'; v.textContent = value;
  d.appendChild(l); d.appendChild(v);
  if (hint) { const h = document.createElement('div'); h.className = 'k-hint'; h.textContent = hint; d.appendChild(h); }
  const more = document.createElement('span');
  more.className = 'k-more';
  more.textContent = isOpen ? 'Aufschlüsselung schliessen' : 'nach Szenario';
  const caret = document.createElement('span');
  caret.className = 'caret';
  more.appendChild(caret);
  d.appendChild(more);
  d.addEventListener('click', () => {
    STATE.openKpi = isOpen ? null : measure.id;
    renderAll();
    if (!isOpen) requestAnimationFrame(() => {
      const k = $('#kpi-detail');
      if (k) k.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  return d;
}

function renderKpis() {
  const box = $('#kpis');
  box.textContent = '';
  const versions = selectedVersions();
  versions.forEach((v) => {
    const ds = v.datasets;
    const scen = new Set(ds.map((d) => d.scenario));
    const block = document.createElement('div');
    block.className = 'kpi-block';
    if (versions.length > 1 || DATA.versions.length > 1) {
      const head = document.createElement('div');
      head.className = 'kpi-version';
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = versionColor(v.id);
      head.appendChild(sw);
      head.appendChild(document.createTextNode(v.id));
      block.appendChild(head);
    }
    const row = document.createElement('div');
    row.className = 'kpi-row';
    const hints = {
      calls: `${ds.length} Datensätze · ${scen.size} ${scen.size === 1 ? 'Szenario' : 'Szenarien'}`,
      datasets: 'je 100 simulierte Anrufe',
      metrics: 'szenarioabhängig angewendet',
      errors: 'technische Fehler im Lauf',
      duration: 'Median je Anruf, über Datensätze gemittelt',
      cost: `${fmtInt(measureValue('tokens', ds))} Tokens gesamt`,
    };
    KPI_MEASURES.forEach((m) => {
      const chart = m.charts[0];
      const val = fmtMeasure(chart.fmt, measureValue(chart.field, ds));
      row.appendChild(kpiTile(m, val, hints[m.id]));
    });
    block.appendChild(row);
    box.appendChild(block);
  });
  if (!versions.length) {
    const p = document.createElement('p');
    p.className = 'state';
    p.textContent = 'Keine Version ausgewählt.';
    box.appendChild(p);
  }
}

/* --- Kennzahl-Detail: Aufschlüsselung nach Szenario und Version --------- */
function scenariosPresent(versions) {
  return SCENARIOS.filter((sc) => versions.some((v) => datasetsOf(v, sc.id).length));
}

function renderKpiDetail() {
  const box = $('#kpi-detail');
  box.textContent = '';
  const measure = KPI_MEASURES.find((m) => m.id === STATE.openKpi);
  if (!measure) return;
  const versions = selectedVersions();
  if (!versions.length) return;

  const panel = document.createElement('div');
  panel.className = 'detail';
  const head = document.createElement('div');
  head.className = 'detail-head';
  const hrow = document.createElement('div');
  hrow.style.display = 'flex';
  hrow.style.alignItems = 'flex-start';
  hrow.style.gap = '14px';
  const htxt = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Kennzahl im Detail';
  const h3 = document.createElement('h3');
  h3.textContent = measure.label;
  const p = document.createElement('p');
  p.textContent = measure.desc;
  htxt.appendChild(eyebrow); htxt.appendChild(h3); htxt.appendChild(p);
  hrow.appendChild(htxt);
  const close = document.createElement('button');
  close.className = 'close-x';
  close.type = 'button';
  close.setAttribute('aria-label', 'Aufschlüsselung schliessen');
  close.textContent = '✕';
  close.addEventListener('click', () => { STATE.openKpi = null; renderAll(); });
  hrow.appendChild(close);
  head.appendChild(hrow);
  panel.appendChild(head);

  const body = document.createElement('div');
  body.className = 'detail-body';
  panel.appendChild(body);
  box.appendChild(panel);

  const scen = scenariosPresent(versions);

  /* Gesamtwerte je Version als Kacheln */
  const totals = document.createElement('div');
  totals.className = 'kpi-row';
  totals.style.marginBottom = '20px';
  versions.forEach((v) => {
    const chart = measure.charts[0];
    const d = document.createElement('div');
    d.className = 'kpi';
    const l = document.createElement('div');
    l.className = 'k-label';
    const sw = document.createElement('span');
    sw.className = 'swatch-inline';
    sw.style.background = versionColor(v.id);
    l.appendChild(sw);
    l.appendChild(document.createTextNode(v.id));
    const val = document.createElement('div');
    val.className = 'k-value';
    val.textContent = fmtMeasure(chart.fmt, measureValue(chart.field, v.datasets));
    const hint = document.createElement('div');
    hint.className = 'k-hint';
    hint.textContent = (measure.agg === 'mean' ? 'gewichtetes Mittel' : 'Summe') + ' über alle Szenarien';
    d.appendChild(l); d.appendChild(val); d.appendChild(hint);
    totals.appendChild(d);
  });
  body.appendChild(totals);

  if (measure.runs) {
    const status = document.createElement('div');
    status.id = 'kpi-runs-status';
    body.appendChild(status);
  }

  /* Ein Diagramm je Teilkennzahl */
  measure.charts.forEach((chart, idx) => {
    const wrapC = document.createElement('div');
    wrapC.style.marginBottom = '18px';
    body.appendChild(wrapC);
    const id = `kpi-${measure.id}-${idx}`;
    wrapC.appendChild(chartCard({
      id,
      title: chart.label,
      subtitle: chart.hint || (chart.runs
        ? 'Mittelwert je Anruf, aus den Runs-Dateien berechnet'
        : 'Werte aus der Summary-Datei'),
      footnote: `Zeilen sind Szenarien${(chart.agg || measure.agg) === 'mean' ? ', zuletzt der gewichtete Gesamtwert' : ''}. Ein Punkt ist eine Version.`,
      build: (el2) => buildKpiChart(el2, measure, chart, versions, scen),
      buildTable: (el2) => buildKpiTable(el2, measure, chart, versions, scen),
    }));
  });

  /* Bei der Metriken-Kachel zusätzlich: welche Metrik in welchem Szenario */
  if (measure.table === 'metrics') {
    const h = document.createElement('h5');
    h.className = 'eyebrow';
    h.style.margin = '4px 0 10px';
    h.textContent = 'Angewendete Metriken je Szenario';
    body.appendChild(h);
    const tbl = document.createElement('div');
    const cols = [{ label: 'Metrik' }, { label: 'Messverfahren' }];
    scen.forEach((sc) => cols.push({ label: sc.name }));
    const allKeys = metricsIn(versions.flatMap((v) => v.datasets));
    renderTable(tbl, {
      columns: cols,
      rows: allKeys.map((k) => {
        const mi = metricInfo(k);
        const cells = [mi.name, mi.typ];
        scen.forEach((sc) => {
          const ds = versions.flatMap((v) => datasetsOf(v, sc.id));
          const n = datasetsWithMetric(ds, k).length;
          cells.push(n ? '✓' : '–');
        });
        return { cells };
      }),
      caption: 'Angewendete Metriken je Szenario',
    });
    body.appendChild(tbl);
  }

  /* Turn-Kennzahlen brauchen die Runs-Dateien */
  if (measure.runs) {
    const targets = versions.flatMap((v) => v.datasets).filter((d) => d.hasRuns && !d.turnStats);
    const status = $('#kpi-runs-status');
    if (targets.length) {
      status.appendChild(loadingBox(`Turn-Kennzahlen werden aus ${targets.length} Runs-Dateien berechnet …`));
      Promise.all(targets.map((d) => loadRuns(d).catch(() => null))).then(() => {
        if (STATE.openKpi === measure.id) renderAll();
      });
    } else {
      const missing = versions.flatMap((v) => v.datasets.filter((d) => !d.hasRuns)
        .map((d) => `${v.id}: ${d.info.name}`));
      if (missing.length) {
        const note = document.createElement('div');
        note.className = 'note';
        note.textContent = `Ohne Turn-Kennzahlen (keine Runs-Datei im Repository): ${missing.join(' · ')}. `
          + 'Die Latenz stammt aus der Summary-Datei und ist deshalb überall vorhanden.';
        status.appendChild(note);
      }
    }
  }
}

function kpiRows(measure, chart, versions, scen) {
  const agg = chart.agg || measure.agg;
  const rows = scen.map((sc) => ({
    label: sc.name,
    hint: null,
    points: versions.map((v) => {
      const ds = datasetsOf(v, sc.id);
      const usable = chart.runs ? ds.filter((d) => d.turnStats) : ds;
      return {
        version: v.id, color: versionColor(v.id),
        value: usable.length ? measureValue(chart.field, usable) : null,
        n: usable.reduce((a, d) => a + (d.runCount || 0), 0) || null,
        meta: chart.runs && usable.length < ds.length
          ? `${ds.length - usable.length} Datensätze ohne Runs-Datei` : null,
      };
    }),
  }));
  if (agg === 'mean' && scen.length > 1) {
    rows.push({ kind: 'group', label: 'Über alle Szenarien' });
    rows.push({
      label: 'Gewichtetes Mittel',
      hint: 'nach Anzahl Anrufe gewichtet',
      points: versions.map((v) => {
        const ds = chart.runs ? v.datasets.filter((d) => d.turnStats) : v.datasets;
        return {
          version: v.id, color: versionColor(v.id),
          value: ds.length ? measureValue(chart.field, ds) : null,
          n: ds.reduce((a, d) => a + (d.runCount || 0), 0) || null,
        };
      }),
    });
  }
  return rows;
}

function buildKpiChart(container, measure, chart, versions, scen) {
  const rows = kpiRows(measure, chart, versions, scen);
  const values = rows.filter((r) => r.points)
    .flatMap((r) => r.points.map((p) => p.value))
    .filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  const max = values.length ? Math.max(...values) : 1;
  const nice = niceCeil(max);
  dotPlot(container, {
    rows,
    versions: versions.map((v) => ({ id: v.id, color: versionColor(v.id) })),
    domain: [0, nice],
    format: (v) => fmtMeasure(chart.fmt, v),
    axisFormat: (v) => fmtMeasureAxis(chart.fmt, v, nice),
    ticks: [0, nice / 4, nice / 2, (nice * 3) / 4, nice],
    axisLabel: chart.label + (chart.unit ? ` in ${chart.unit}` : ''),
    ariaLabel: `${chart.label} je Szenario und Version`,
  });
}

function buildKpiTable(container, measure, chart, versions, scen) {
  const rows = kpiRows(measure, chart, versions, scen);
  const cols = [{ label: 'Szenario' }];
  versions.forEach((v) => cols.push({ label: v.id, color: versionColor(v.id) }));
  renderTable(container, {
    columns: cols,
    rows: rows.map((r) => {
      if (r.kind === 'group') return { group: r.label };
      return { cells: [r.label].concat(r.points.map((p) => fmtMeasure(chart.fmt, p.value))) };
    }),
    caption: `${chart.label} je Szenario und Version`,
  });
}

/* Runde Obergrenze für die Achse */
function niceCeil(v) {
  if (!v || !isFinite(v) || v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 1.5 ? 1.5 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * mag;
}

/* --- Diagrammkarte mit Diagramm-/Tabellen-Umschalter -------------------- */
function chartCard({ id, title, subtitle, build, buildTable, footnote }) {
  const card = document.createElement('div');
  card.className = 'card';
  const head = document.createElement('div');
  head.className = 'card-head';
  const wrapT = document.createElement('div');
  const h = document.createElement('h3'); h.textContent = title;
  wrapT.appendChild(h);
  if (subtitle) { const p = document.createElement('p'); p.textContent = subtitle; wrapT.appendChild(p); }
  head.appendChild(wrapT);

  const toggle = document.createElement('div');
  toggle.className = 'toggle-row';
  const mk = (label, mode) => {
    const b = document.createElement('button');
    b.className = 'tbtn'; b.type = 'button'; b.textContent = label;
    const active = (mode === 'table') === STATE.tables.has(id);
    b.setAttribute('aria-pressed', active ? 'true' : 'false');
    b.addEventListener('click', () => {
      if (mode === 'table') STATE.tables.add(id); else STATE.tables.delete(id);
      renderAll();
    });
    return b;
  };
  toggle.appendChild(mk('Diagramm', 'chart'));
  toggle.appendChild(mk('Tabelle', 'table'));
  head.appendChild(toggle);
  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'card-body';
  card.appendChild(body);
  if (footnote) {
    const f = document.createElement('div');
    f.className = 'card-foot';
    f.textContent = footnote;
    card.appendChild(f);
  }
  // Nach dem Einfügen zeichnen (Breite muss messbar sein)
  scheduleDraw(body, () => {
    if (STATE.tables.has(id)) buildTable(body); else build(body);
  });
  return card;
}

/* --- Zeilen für das Punktdiagramm aufbauen ----------------------------- */
function metricRows(metricKeys, valueFor, hintFor) {
  const rows = [];
  METRIC_GROUPS.forEach((g) => {
    const keys = metricKeys.filter((k) => metricInfo(k).group === g.id);
    if (!keys.length) return;
    rows.push({ kind: 'group', label: g.name });
    keys.forEach((k) => {
      const mi = metricInfo(k);
      rows.push({
        label: mi.name,
        glyph: DIRECTION_GLYPH[mi.direction] || '',
        hint: hintFor ? hintFor(k) : null,
        target: mi.direction === 'ziel' ? mi.target : null,
        decimals: decimalsForMetric(k),
        metricKey: k,
        points: valueFor(k),
      });
    });
  });
  return rows;
}

function versionLegend() {
  return selectedVersions().map((v) => ({ id: v.id, color: versionColor(v.id) }));
}

/* --- Sektion: aggregiert über alle Szenarien --------------------------- */
function renderAggregate() {
  const box = $('#aggregate');
  box.textContent = '';
  const versions = selectedVersions();
  if (!versions.length) return;
  const allKeys = metricsIn(versions.flatMap((v) => v.datasets));

  const valueFor = (k) => versions.map((v) => {
    const p = pooled(v.datasets, k);
    return {
      version: v.id, color: versionColor(v.id),
      value: p ? p.avg : null, n: p ? p.n : null,
      meta: p ? `${p.datasets} ${p.datasets === 1 ? 'Datensatz' : 'Datensätze'}` : null,
    };
  });
  const hintFor = (k) => {
    const p = pooled(versions[0].datasets, k);
    const mi = metricInfo(k);
    const ziel = mi.direction === 'ziel' ? ' ' + fmtPct(mi.target, 0) : '';
    const scope = p ? `${p.datasets}/${versions[0].datasets.length} Datensätze · ${fmtInt(p.n)} Anrufe` : 'nicht erhoben';
    return `${DIRECTION_TEXT[mi.direction]}${ziel} · ${scope}`;
  };

  box.appendChild(chartCard({
    id: 'agg',
    title: 'Alle Szenarien zusammengefasst',
    subtitle: TEXTS.aggHinweis,
    footnote: 'Ein Punkt ist ein Metrikwert einer Version. Die Zielrichtung steht in jeder Zeile: ↑ hoch ist gut, ↓ niedrig ist gut, ◎ Idealwert (senkrechte Marke im Diagramm).',
    build: (el2) => {
      dotPlot(el2, {
        rows: metricRows(allKeys, valueFor, hintFor),
        versions: versionLegend(),
        decimalsFor: (row) => row.decimals,
        ariaLabel: 'Metrikwerte aggregiert über alle Szenarien',
        axisLabel: 'Anteil der Anrufe · Score-Metriken auf 0–100 % skaliert',
      });
    },
    buildTable: (el2) => {
      const cols = [{ label: 'Metrik' }, { label: 'Typ' }, { label: 'Zielrichtung' }];
      versions.forEach((v) => cols.push({ label: v.id, color: versionColor(v.id) }));
      cols.push({ label: 'Anrufe' });
      const rows = [];
      METRIC_GROUPS.forEach((g) => {
        const keys = allKeys.filter((k) => metricInfo(k).group === g.id);
        if (!keys.length) return;
        rows.push({ group: g.name });
        keys.forEach((k) => {
          const mi = metricInfo(k);
          const cells = [mi.name, mi.typ,
            (DIRECTION_GLYPH[mi.direction] || '') + ' ' + DIRECTION_TEXT[mi.direction] + (mi.direction === 'ziel' ? ' ' + fmtPct(mi.target, 0) : '')];
          let nn = null;
          versions.forEach((v) => {
            const p = pooled(v.datasets, k);
            cells.push(p ? fmtPct(p.avg, decimalsForMetric(k)) : null);
            if (p) nn = p.n;
          });
          cells.push(nn ? fmtInt(nn) : null);
          rows.push({ cells });
        });
      });
      renderTable(el2, { columns: cols, rows, caption: 'Metrikwerte aggregiert über alle Szenarien' });
    },
  }));
}

/* --- Sektion: nach Szenario ------------------------------------------- */
function renderScenarios() {
  const box = $('#scenarios');
  box.textContent = '';
  const versions = selectedVersions();
  if (!versions.length) return;

  const grid = document.createElement('div');
  grid.className = 'scenario-grid';
  // Im Versionsvergleich beanspruchen die Wertespalten Platz – das Layout
  // schaltet dann per CSS auf breitere Karten um
  grid.dataset.multi = versions.length > 1 ? 'true' : 'false';

  SCENARIOS.forEach((sc) => {
    const dsAll = versions.flatMap((v) => datasetsOf(v, sc.id));
    if (!dsAll.length) return;
    const keys = metricsIn(dsAll);
    const isOpen = STATE.openScenario === sc.id;

    const card = document.createElement('div');
    card.className = 'card scenario-card';
    card.dataset.open = isOpen ? 'true' : 'false';

    const head = document.createElement('div');
    head.className = 'card-head';
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    const wrapT = document.createElement('div');
    const h = document.createElement('h3');
    h.textContent = sc.name;
    wrapT.appendChild(h);
    const p = document.createElement('p');
    const nCalls = datasetsOf(versions[0], sc.id).reduce((a, d) => a + d.runCount, 0);
    const nSub = unionDatasets(versions, sc.id).length;
    p.textContent = `${sc.kurz} — ${nSub} ${nSub === 1 ? 'Sub-Szenario' : 'Sub-Szenarien'}, ${fmtInt(nCalls)} Anrufe je Version`;
    wrapT.appendChild(p);
    head.appendChild(wrapT);
    const open = document.createElement('span');
    open.className = 'sc-open';
    open.appendChild(document.createTextNode(isOpen ? 'Details schliessen' : 'Sub-Szenarien'));
    const caret = document.createElement('span');
    caret.className = 'caret';
    open.appendChild(caret);
    head.appendChild(open);
    const toggle = () => {
      STATE.openScenario = isOpen ? null : sc.id;
      renderAll();
      if (!isOpen) requestAnimationFrame(() => {
        const d = $('#scenario-detail');
        if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'card-body';
    card.appendChild(body);
    const valueFor = (k) => versions.map((v) => {
      const pp = pooled(datasetsOf(v, sc.id), k);
      return { version: v.id, color: versionColor(v.id), value: pp ? pp.avg : null, n: pp ? pp.n : null };
    });
    const hintFor = (k) => {
      const pp = pooled(datasetsOf(versions[0], sc.id), k);
      const mi = metricInfo(k);
      const ziel = mi.direction === 'ziel' ? ' ' + fmtPct(mi.target, 0) : '';
      // Umfang nur nennen, wenn die Metrik nicht in allen Sub-Szenarien erhoben wurde
      const scope = pp && pp.datasets < nSub ? ` · nur ${pp.datasets} von ${nSub} Sub-Szenarien` : '';
      return `${DIRECTION_TEXT[mi.direction]}${ziel}${scope} · ${mi.typ}`;
    };
    scheduleDraw(body, () => {
      dotPlot(body, {
        rows: metricRows(keys, valueFor, hintFor),
        versions: versionLegend(),
        decimalsFor: (row) => row.decimals,
        ariaLabel: `Metrikwerte im Szenario ${sc.name}`,
        axisLabel: 'Anteil der Anrufe · über Sub-Szenarien gewichtet',
      });
    });

    const foot = document.createElement('div');
    foot.className = 'card-foot';
    foot.textContent = 'Karte anklicken für die Sub-Szenarien und die Verteilungen der Metriken.';
    card.appendChild(foot);

    grid.appendChild(card);
  });
  box.appendChild(grid);
}

/* --- Szenario-Detail --------------------------------------------------- */
function renderScenarioDetail() {
  const box = $('#scenario-detail');
  box.textContent = '';
  const sc = scenarioOf(STATE.openScenario);
  if (!sc) return;
  const versions = selectedVersions();
  if (!versions.length) return;
  const subs = unionDatasets(versions, sc.id);
  const keys = metricsIn(versions.flatMap((v) => datasetsOf(v, sc.id)));

  const panel = document.createElement('div');
  panel.className = 'detail';

  const head = document.createElement('div');
  head.className = 'detail-head';
  const hrow = document.createElement('div');
  hrow.style.display = 'flex';
  hrow.style.alignItems = 'flex-start';
  hrow.style.gap = '14px';
  const htxt = document.createElement('div');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = 'Szenario-Detail';
  const h3 = document.createElement('h3');
  h3.textContent = sc.name;
  htxt.appendChild(eyebrow);
  htxt.appendChild(h3);
  const desc = document.createElement('p');
  desc.textContent = sc.desc;
  htxt.appendChild(desc);
  hrow.appendChild(htxt);
  const close = document.createElement('button');
  close.className = 'close-x';
  close.type = 'button';
  close.setAttribute('aria-label', 'Szenario-Detail schliessen');
  close.textContent = '✕';
  close.addEventListener('click', () => { STATE.openScenario = null; renderAll(); });
  hrow.appendChild(close);
  head.appendChild(hrow);
  panel.appendChild(head);

  const body = document.createElement('div');
  body.className = 'detail-body';

  /* Sub-Szenarien */
  const h5a = document.createElement('h5');
  h5a.className = 'eyebrow';
  h5a.style.marginBottom = '10px';
  h5a.textContent = `Sub-Szenarien (${subs.length})`;
  body.appendChild(h5a);
  const list = document.createElement('div');
  list.className = 'subscenario-list';
  subs.forEach((d) => {
    const c = document.createElement('div');
    c.className = 'subsc';
    const t = document.createElement('h5');
    t.appendChild(document.createTextNode(d.info.name));
    if (d.info.variante === 'Multiinfo') {
      const tg = document.createElement('span'); tg.className = 'tag multi'; tg.textContent = 'Multiinfo'; t.appendChild(tg);
    }
    if (d.info.kalender === true) {
      const tg = document.createElement('span'); tg.className = 'tag cal'; tg.textContent = 'Kalender aktiv'; t.appendChild(tg);
    } else if (d.info.kalender === false) {
      const tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = 'ohne Kalender'; t.appendChild(tg);
    }
    c.appendChild(t);
    const pp = document.createElement('p');
    pp.textContent = d.info.desc;
    c.appendChild(pp);
    // Fehlende Runs-Dateien je Version ausweisen
    const ohne = versions.filter((v) => {
      const dd = v.datasets.find((x) => x.dataset === d.dataset);
      return dd && !dd.hasRuns;
    }).map((v) => v.id);
    if (ohne.length) {
      const tg = document.createElement('span');
      tg.className = 'tag pending';
      tg.textContent = TEXTS.noRunsShort + ': ' + ohne.join(', ');
      t.appendChild(tg);
    }
    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.style.fontSize = '11.5px';
    meta.style.color = 'var(--ink-3)';
    const inV = versions.filter((v) => v.datasets.some((x) => x.dataset === d.dataset)).map((v) => v.id);
    meta.textContent = `Datensatz: ${d.dataset} · ${fmtInt(d.runCount)} Anrufe · Kontaktdaten: ${d.info.kontakt}`
      + (d.info.prompt ? ` · Rollen-Prompt: ${d.info.prompt.replace(/^prompts\//, '')}` : '')
      + (versions.length > 1 ? ` · vorhanden in: ${inV.join(', ')}` : '');
    c.appendChild(meta);
    list.appendChild(c);
  });
  body.appendChild(list);

  if (subs.some((d) => d.info.variante === 'Multiinfo')) {
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = TEXTS.multiinfo;
    body.appendChild(note);
  }

  /* Metrik-Panels */
  const h5b = document.createElement('h5');
  h5b.className = 'eyebrow';
  h5b.style.margin = '26px 0 10px';
  h5b.textContent = 'Metriken je Sub-Szenario';
  body.appendChild(h5b);

  const grid = document.createElement('div');
  grid.className = 'metric-grid';
  grid.dataset.multi = versions.length > 1 ? 'true' : 'false';
  keys.forEach((k) => grid.appendChild(metricPanel(sc, k, versions)));
  body.appendChild(grid);

  panel.appendChild(body);
  box.appendChild(panel);
}

/* --- Ein Metrik-Panel (Punktdiagramm über Sub-Szenarien) --------------- */
function metricPanel(sc, metricKey, versions) {
  const mi = metricInfo(metricKey);
  const isOpen = STATE.openMetric[sc.id] === metricKey;
  const panel = document.createElement('div');
  panel.className = 'metric-panel';
  panel.dataset.open = isOpen ? 'true' : 'false';

  const head = document.createElement('div');
  head.className = 'mp-head';
  head.setAttribute('role', 'button');
  head.setAttribute('tabindex', '0');
  head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  const txt = document.createElement('div');
  const h4 = document.createElement('h4');
  h4.textContent = (DIRECTION_GLYPH[mi.direction] || '') + ' ' + mi.name;
  txt.appendChild(h4);
  const sub = document.createElement('div');
  sub.className = 'mp-sub';
  sub.textContent = `${mi.typ} · ${DIRECTION_TEXT[mi.direction]}${mi.direction === 'ziel' ? ' ' + fmtPct(mi.target, 0) : ''}`;
  txt.appendChild(sub);
  head.appendChild(txt);
  const open = document.createElement('span');
  open.className = 'mp-open';
  open.appendChild(document.createTextNode(isOpen ? 'schliessen' : 'Verteilung'));
  const caret = document.createElement('span');
  caret.className = 'caret';
  open.appendChild(caret);
  head.appendChild(open);
  const toggle = () => {
    STATE.openMetric[sc.id] = isOpen ? null : metricKey;
    renderAll();
  };
  head.addEventListener('click', toggle);
  head.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  panel.appendChild(head);

  const body = document.createElement('div');
  body.className = 'mp-body';
  panel.appendChild(body);

  // Nur Sub-Szenarien, in denen diese Metrik überhaupt erhoben wird
  const rows = unionDatasets(versions, sc.id)
    .filter((d0) => versions.some((v) => {
      const d = v.datasets.find((x) => x.dataset === d0.dataset);
      return d && d.scores[metricKey];
    }))
    .map((d0) => {
      const points = versions.map((v) => {
        const d = v.datasets.find((x) => x.dataset === d0.dataset);
        const s = d && d.scores[metricKey];
        return {
          version: v.id, color: versionColor(v.id),
          value: s ? s.avg : null, n: s ? s.n : null,
          meta: d && !d.hasRuns ? TEXTS.noRunsShort : null,
        };
      });
      return {
        label: d0.info.name,
        hint: d0.info.variante === 'Multiinfo' ? 'Multiinfo-Variante' : null,
        target: mi.direction === 'ziel' ? mi.target : null,
        decimals: decimalsForMetric(metricKey),
        points,
      };
    });
  scheduleDraw(body, () => {
    dotPlot(body, {
      rows,
      versions: versions.map((v) => ({ id: v.id, color: versionColor(v.id) })),
      decimalsFor: (row) => row.decimals,
      ariaLabel: `${mi.name} je Sub-Szenario`,
      axisLabel: 'Anteil der Anrufe je Sub-Szenario',
    });
  });

  if (isOpen) panel.appendChild(metricDetail(sc, metricKey, versions));
  return panel;
}

/* --- Metrik-Detail: Steckbrief, Verteilung, Beispiele ------------------ */
function metricDetail(sc, metricKey, versions) {
  const mi = metricInfo(metricKey);
  const wrap = document.createElement('div');
  wrap.className = 'metric-detail';

  /* Steckbrief */
  const h1 = document.createElement('h5');
  h1.textContent = 'Steckbrief der Metrik';
  wrap.appendChild(h1);
  const sb = document.createElement('div');
  sb.className = 'steckbrief';
  const add = (k, v) => {
    const d = document.createElement('div');
    d.className = 'sb';
    const kk = document.createElement('div'); kk.className = 'sb-k'; kk.textContent = k;
    const vv = document.createElement('div'); vv.className = 'sb-v'; vv.textContent = v;
    d.appendChild(kk); d.appendChild(vv);
    sb.appendChild(d);
  };
  add('Spaltenname in den Daten', metricKey);
  add('Messverfahren', mi.typ);
  add('Skala', mi.scale);
  add('Zielrichtung', (DIRECTION_GLYPH[mi.direction] || '') + ' ' + DIRECTION_TEXT[mi.direction]
    + (mi.direction === 'ziel' ? ' ' + fmtPct(mi.target, 0) : ''));
  wrap.appendChild(sb);

  if (mi.frage) {
    const q = document.createElement('p');
    q.style.fontSize = '13.5px';
    q.style.margin = '12px 0 0';
    const b = document.createElement('strong');
    b.textContent = 'Bewertungsfrage: ';
    q.appendChild(b);
    q.appendChild(document.createTextNode(mi.frage));
    wrap.appendChild(q);
  }
  const dsc = document.createElement('p');
  dsc.style.fontSize = '13px';
  dsc.style.color = 'var(--ink-2)';
  dsc.style.margin = '8px 0 0';
  dsc.textContent = mi.desc;
  wrap.appendChild(dsc);
  if (mi.hinweis) {
    const n = document.createElement('div');
    n.className = 'note';
    n.textContent = mi.hinweis;
    wrap.appendChild(n);
  }
  if (metricKey === 'danke_score') {
    const n = document.createElement('div');
    n.className = 'note';
    n.textContent = 'Darstellung: Der Score liegt zwischen 0 und 1 und wird im Dashboard einheitlich als Prozentwert der Skala gezeigt (0,50 entspricht 50 %), damit alle Metriken auf einer Achse vergleichbar bleiben.';
    wrap.appendChild(n);
  }

  /* Verteilung — braucht die Runs-Dateien */
  const h2 = document.createElement('h5');
  h2.textContent = 'Verteilung über die einzelnen Anrufe';
  wrap.appendChild(h2);
  const distBox = document.createElement('div');
  distBox.innerHTML = '<div class="state"><span class="loading"><span class="spinner"></span>Einzelergebnisse werden aus dem Datenrepository geladen …</span></div>';
  wrap.appendChild(distBox);

  const h3 = document.createElement('h5');
  h3.textContent = 'Beispielgespräche';
  wrap.appendChild(h3);
  const exBox = document.createElement('div');
  exBox.innerHTML = '<div class="state"><span class="loading"><span class="spinner"></span>Transkripte werden geladen …</span></div>';
  wrap.appendChild(exBox);

  // Datensätze mit dieser Metrik – getrennt nach „Runs-Datei vorhanden“
  const withMetric = [];
  versions.forEach((v) => datasetsOf(v, sc.id).forEach((d) => {
    if (d.scores[metricKey]) withMetric.push(d);
  }));
  const needed = withMetric.filter((d) => d.hasRuns);
  const pending = withMetric.filter((d) => !d.hasRuns);

  const pendingNote = () => {
    if (!pending.length) return null;
    const n = document.createElement('div');
    n.className = 'note';
    const namen = pending.map((d) => `${d.version} – ${d.info.name}`).join(' · ');
    n.textContent = `${TEXTS.noRuns} Betroffen: ${namen}.`;
    return n;
  };

  if (!needed.length) {
    distBox.textContent = '';
    const note = pendingNote();
    if (note) distBox.appendChild(note);
    else distBox.appendChild(errorBox('Keine Einzelergebnisse verfügbar.',
      'Für die betroffenen Datensätze liegt keine Runs-Datei im Repository.'));
    exBox.textContent = '';
    const n2 = pendingNote();
    if (n2) exBox.appendChild(n2);
    return wrap;
  }

  Promise.all(needed.map((d) => loadRuns(d).then(() => d).catch((e) => ({ error: e, ds: d }))))
    .then(() => {
      renderDistribution(distBox, needed, metricKey, versions, pendingNote());
      renderExamples(exBox, sc, needed, metricKey, pendingNote());
      flushDraws();
    })
    .catch((e) => {
      distBox.textContent = '';
      distBox.appendChild(errorBox('Einzelergebnisse konnten nicht geladen werden.', e.message));
      exBox.textContent = '';
    });

  return wrap;
}

function renderDistribution(box, datasets, metricKey, versions, pendingNote) {
  box.textContent = '';
  if (pendingNote) box.appendChild(pendingNote);
  const usable = datasets.filter((d) => Array.isArray(d.runs));
  if (!usable.length) {
    box.appendChild(errorBox('Keine Einzelergebnisse verfügbar.',
      'Für die betroffenen Datensätze liegt keine Runs-Datei im Repository.'));
    return;
  }
  const mi = metricInfo(metricKey);
  const allValues = usable.flatMap((d) => d.runs.map((r) => r.feedback[metricKey]).filter((x) => x !== null && x !== undefined));
  // Die Skala steht im Metrik-Register. Auf die Daten zu schauen wäre falsch:
  // eine anteilige Metrik kann in einem Szenario zufällig überall 0 sein.
  const binaer = mi.unbekannt
    ? allValues.every((v) => v === 0 || v === 1)
    : isBinaryMetric(metricKey);

  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  const li = document.createElement('span');
  li.className = 'legend-item';
  if (binaer) {
    const d1 = document.createElement('span'); d1.className = 'legend-dot'; d1.style.background = versionColor(usable[0].version);
    li.appendChild(d1);
    li.appendChild(document.createTextNode('ein Punkt = ein Anruf mit Bewertung 1'));
    legend.appendChild(li);
    const li2 = document.createElement('span'); li2.className = 'legend-item';
    const d2 = document.createElement('span'); d2.className = 'legend-dot'; d2.style.background = '#E0E0E0';
    li2.appendChild(d2);
    li2.appendChild(document.createTextNode('Bewertung 0'));
    legend.appendChild(li2);
  } else {
    li.appendChild(document.createTextNode('Histogramm: Anzahl Anrufe je Wertebereich'));
    legend.appendChild(li);
  }
  box.appendChild(legend);

  if (binaer) {
    const grid = document.createElement('div');
    grid.className = 'waffle-grid';
    usable.forEach((d) => {
      const vals = d.runs.map((r) => r.feedback[metricKey]).filter((x) => x !== null && x !== undefined);
      const ones = vals.filter((x) => x === 1).length;
      const card = document.createElement('div');
      card.className = 'waffle-card';
      const t = document.createElement('div'); t.className = 'w-title'; t.textContent = d.info.name;
      card.appendChild(t);
      if (versions.length > 1) {
        const s = document.createElement('div'); s.className = 'w-sub';
        s.textContent = 'Version ' + d.version;
        card.appendChild(s);
      }
      const val = document.createElement('div'); val.className = 'w-value';
      val.textContent = fmtPct(vals.length ? ones / vals.length : null, 0);
      const sp = document.createElement('span');
      sp.textContent = `${fmtInt(ones)} von ${fmtInt(vals.length)} Anrufen`;
      val.appendChild(sp);
      card.appendChild(val);
      const w = document.createElement('div');
      card.appendChild(w);
      waffle(w, { n: vals.length, ones, color: versionColor(d.version) });
      grid.appendChild(card);
    });
    box.appendChild(grid);
  } else {
    const domainMax = Math.max(0.2, Math.min(1, Math.ceil(Math.max(...allValues) * 10) / 10));
    const grid = document.createElement('div');
    grid.className = 'hist-grid';
    usable.forEach((d) => {
      const vals = d.runs.map((r) => r.feedback[metricKey]).filter((x) => x !== null && x !== undefined);
      const st = stats(vals);
      const card = document.createElement('div');
      card.className = 'waffle-card';
      const t = document.createElement('div'); t.className = 'w-title'; t.textContent = d.info.name;
      card.appendChild(t);
      const s = document.createElement('div'); s.className = 'w-sub';
      s.textContent = `${versions.length > 1 ? 'Version ' + d.version + ' · ' : ''}Ø ${fmtPct(st.mean, 1)} · Median ${fmtPct(st.median, 1)}`;
      card.appendChild(s);
      const hbox = document.createElement('div');
      card.appendChild(hbox);
      grid.appendChild(card);
      scheduleDraw(hbox, () => {
        histogram(hbox, {
          values: vals, color: versionColor(d.version), bins: 12,
          domain: [0, domainMax],
          target: mi.direction === 'ziel' ? mi.target : null,
          label: `${mi.name} — Verteilung in ${d.info.name}`,
        });
      });
    });
    box.appendChild(grid);
  }

  /* Statistiktabelle (Tabellen-Zwilling der Verteilung).
     Bei binären Bewertungen sind Median, Streuung und Extremwerte ohne
     Aussagekraft – dort werden Auszählungen gezeigt.                        */
  const h = document.createElement('h5');
  h.textContent = binaer ? 'Auszählung je Sub-Szenario' : 'Kennzahlen der Verteilung';
  box.appendChild(h);
  const tblBox = document.createElement('div');
  if (binaer) {
    renderTable(tblBox, {
      columns: [{ label: 'Sub-Szenario' }, { label: 'Version' }, { label: 'Anrufe' },
        { label: 'Bewertung 1' }, { label: 'Bewertung 0' }, { label: 'Anteil' }],
      rows: usable.map((d) => {
        const vals = d.runs.map((r) => r.feedback[metricKey]).filter((x) => x !== null && x !== undefined);
        const ones = vals.filter((x) => x === 1).length;
        return {
          cells: [d.info.name, d.version, fmtInt(vals.length), fmtInt(ones), fmtInt(vals.length - ones),
            fmtPct(vals.length ? ones / vals.length : null, 0)],
        };
      }),
      caption: 'Auszählung der Bewertungen je Sub-Szenario',
    });
  } else {
    renderTable(tblBox, {
      columns: [{ label: 'Sub-Szenario' }, { label: 'Version' }, { label: 'Anrufe' }, { label: 'Mittelwert' },
        { label: 'Median' }, { label: 'Std.abw.' }, { label: 'Minimum' }, { label: 'Maximum' }],
      rows: usable.map((d) => {
        const vals = d.runs.map((r) => r.feedback[metricKey]).filter((x) => x !== null && x !== undefined);
        const st = stats(vals);
        return {
          cells: [d.info.name, d.version, fmtInt(st.n), fmtPct(st.mean, 1),
            fmtPct(st.median, 1), fmtPct(st.sd, 1), fmtPct(st.min, 1), fmtPct(st.max, 1)],
        };
      }),
      caption: 'Kennzahlen der Verteilung je Sub-Szenario',
    });
  }
  box.appendChild(tblBox);
}

/* --- Beispielgespräche ------------------------------------------------- */
const ROLE_LABEL = { assistant: 'Digitale Assistenz', user: 'Simulierte anrufende Person' };
const INPUT_LABEL = {
  Name: 'Name', Telefon: 'Telefonnummer', email: 'E-Mail-Adresse',
  Kundennummer: 'Kundennummer', availability: 'Erreichbarkeit', call_intent: 'Anrufgrund',
};

function renderExamples(box, sc, datasets, metricKey, pendingNote) {
  box.textContent = '';
  if (pendingNote) box.appendChild(pendingNote);
  const usable = datasets.filter((d) => Array.isArray(d.runs));
  if (!usable.length) return;
  const stateKey = sc.id + '::' + metricKey;
  const chosenName = STATE.exampleDataset[stateKey] || usable[0].key;
  const ds = usable.find((d) => d.key === chosenName) || usable[0];

  const controls = document.createElement('div');
  controls.className = 'example-controls';
  const lab = document.createElement('label');
  lab.textContent = 'Sub-Szenario: ';
  lab.style.fontSize = '12.5px';
  lab.style.color = 'var(--ink-2)';
  const sel = document.createElement('select');
  sel.className = 'sel';
  usable.forEach((d) => {
    const o = document.createElement('option');
    o.value = d.key;
    o.textContent = d.info.name + (selectedVersions().length > 1 ? ` (${d.version})` : '');
    if (d.key === ds.key) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    STATE.exampleDataset[stateKey] = sel.value;
    renderExamples(box, sc, datasets, metricKey, pendingNote);
  });
  lab.appendChild(sel);
  controls.appendChild(lab);
  const hint = document.createElement('span');
  hint.style.fontSize = '12px';
  hint.style.color = 'var(--ink-3)';
  hint.textContent = 'Gegenüberstellung: ein Anruf mit dem niedrigsten und einer mit dem höchsten Metrikwert.';
  controls.appendChild(hint);
  box.appendChild(controls);

  const scored = ds.runs
    .map((r) => ({ r, v: r.feedback[metricKey] }))
    .filter((x) => x.v !== null && x.v !== undefined)
    .sort((a, b) => a.v - b.v);
  if (!scored.length) return;
  const lowest = scored[0], highest = scored[scored.length - 1];
  const picks = lowest.r === highest.r || lowest.v === highest.v ? [lowest] : [lowest, highest];
  const binaer = isBinaryMetric(metricKey);
  const tagFor = (idx) => picks.length === 1 ? (binaer ? `alle Anrufe mit Bewertung ${fmtNum(picks[0].v, 0)}` : 'Beispielanruf')
    : binaer ? (idx === 0 ? 'Bewertung 0' : 'Bewertung 1')
      : (idx === 0 ? 'Niedrigster Wert' : 'Höchster Wert');

  const grid = document.createElement('div');
  grid.className = 'transcript-grid';
  picks.forEach((p, idx) => grid.appendChild(transcriptCard(p, metricKey, ds, tagFor(idx))));
  box.appendChild(grid);
}

function transcriptCard(pick, metricKey, ds, tag) {
  const card = document.createElement('div');
  card.className = 'transcript';
  const head = document.createElement('div');
  head.className = 't-head';
  const score = document.createElement('div');
  score.className = 't-score';
  score.textContent = `${metricInfo(metricKey).short}: ${fmtRunValue(metricKey, pick.v)}${tag ? ' · ' + tag : ''}`;
  head.appendChild(score);
  const vars = document.createElement('div');
  vars.className = 't-vars';
  const parts = [];
  Object.keys(pick.r.inputs).forEach((k) => {
    const v = pick.r.inputs[k];
    if (!v) return;
    parts.push(`${INPUT_LABEL[k] || k}: ${v}`);
  });
  vars.textContent = parts.join(' · ');
  head.appendChild(vars);
  const meta = document.createElement('div');
  meta.className = 't-vars';
  meta.style.color = 'var(--ink-3)';
  const others = Object.keys(pick.r.feedback)
    .filter((k) => k !== metricKey && pick.r.feedback[k] !== null
      && metricApplies(k, ds.dataset, ds.info))
    .sort((a, b) => (metricInfo(a).order || 999) - (metricInfo(b).order || 999))
    .map((k) => `${metricInfo(k).short} ${fmtRunValue(k, pick.r.feedback[k])}`);
  const turnInfo = pick.r.totalTurns !== null && pick.r.totalTurns !== undefined
    ? `${fmtInt(pick.r.totalTurns)} Turns (davon ${fmtInt(pick.r.assistantTurns)} der Assistenz)` : null;
  meta.textContent = [`Dauer ${fmtNum(pick.r.executionTime, 1)} s`, turnInfo, ...others]
    .filter(Boolean).join(' · ');
  head.appendChild(meta);
  card.appendChild(head);

  const turns = document.createElement('div');
  turns.className = 'turns';
  const traj = parseTrajectory(pick.r.trajectoryRaw);
  if (!traj.length) {
    const p = document.createElement('div');
    p.className = 'turn hangup';
    p.textContent = 'Der Gesprächsverlauf konnte nicht gelesen werden.';
    turns.appendChild(p);
  }
  traj.forEach((t) => {
    const d = document.createElement('div');
    const content = (t.content || '').trim();
    if (!content) {
      d.className = 'turn hangup';
      d.textContent = `(kein Beitrag – ${ROLE_LABEL[t.role] || t.role} legt auf bzw. schweigt)`;
      turns.appendChild(d);
      return;
    }
    d.className = 'turn ' + (t.role === 'assistant' ? 'assistant' : 'user');
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = ROLE_LABEL[t.role] || t.role;
    d.appendChild(who);
    d.appendChild(document.createTextNode(content));
    turns.appendChild(d);
  });
  card.appendChild(turns);
  return card;
}

/* --- Fehleranzeige ----------------------------------------------------- */
function errorBox(title, detail, withRetry) {
  const d = document.createElement('div');
  d.className = 'state error';
  const s = document.createElement('strong');
  s.textContent = title;
  d.appendChild(s);
  if (detail) {
    const c = document.createElement('code');
    c.textContent = detail;
    d.appendChild(c);
  }
  if (withRetry) {
    const row = document.createElement('div');
    row.style.marginTop = '12px';
    const b = document.createElement('button');
    b.className = 'tbtn';
    b.type = 'button';
    b.textContent = 'Erneut versuchen';
    b.addEventListener('click', () => {
      textCache.clear();
      d.replaceWith(loadingBox('Ergebnisdaten werden erneut geladen …'));
      init();
    });
    row.appendChild(b);
    d.appendChild(row);
  }
  return d;
}

function loadingBox(text) {
  const d = document.createElement('div');
  d.className = 'state';
  const w = document.createElement('span');
  w.className = 'loading';
  const sp = document.createElement('span');
  sp.className = 'spinner';
  w.appendChild(sp);
  w.appendChild(document.createTextNode(text));
  d.appendChild(w);
  return d;
}

/* --- Intro-Karten und Fussbereich ------------------------------------- */
function renderIntro() {
  const box = $('#intro');
  box.textContent = '';
  const grid = document.createElement('div');
  grid.className = 'intro-grid';
  TEXTS.intro.forEach((sec, i) => {
    const det = document.createElement('details');
    det.className = 'info';
    if (i === 0) det.open = true;
    const sum = document.createElement('summary');
    sum.textContent = sec.titel;
    det.appendChild(sum);
    const b = document.createElement('div');
    b.className = 'info-body';
    b.innerHTML = sec.body; // feste, im Dashboard hinterlegte Texte
    det.appendChild(b);
    grid.appendChild(det);
  });
  box.appendChild(grid);
}

function renderFooter() {
  const box = $('#foot');
  box.textContent = '';
  const versions = DATA.versions.map((v) => v.id).join(', ');
  const dsCount = DATA.versions.reduce((a, v) => a + v.datasets.length, 0);
  const stamp = DATA.generated ? ` (erzeugt ${new Date(DATA.generated).toLocaleString('de-DE')})` : '';
  const via = DATA.source === 'local'
    ? `lokale Dateien neben dem Dashboard, nicht aus GitHub${stamp} — Entwicklungsmodus „?source=local“`
    : DATA.source === 'manifest'
      ? `Verzeichnis aus manifest.json${stamp}`
      : 'Verzeichnis über die GitHub-Contents-API';
  const lines = [
    `Datenquelle: GitHub-Repository ${CONFIG.owner}/${CONFIG.repo} (Branch ${CONFIG.branch}) · ${via} · gefundene Versionen: ${versions || '–'} · ${dsCount} Datensätze`,
    'Die Ergebnisdateien werden bei jedem Laden direkt aus dem Repository gelesen. Neue Daten oder eine neue Version erscheinen ohne erneutes Deployment des Dashboards.',
    'Alle Anrufe sind simuliert. Surfers Immobilien ist eine fiktive Wohnungsgenossenschaft, die als Testumgebung dient.',
  ];
  lines.forEach((t) => {
    const p = document.createElement('div');
    p.textContent = t;
    box.appendChild(p);
  });
  const p = document.createElement('div');
  const a = document.createElement('a');
  a.href = REPO_URL;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = 'Datenrepository auf GitHub öffnen';
  p.appendChild(a);
  box.appendChild(p);
}

/* ==========================================================================
   6 — Start
   ========================================================================== */
function fatal(err) {
  let title = 'Die Daten konnten nicht geladen werden.';
  let detail = `${err.message} — versucht wurden manifest.json und die GitHub-Contents-API `
    + `im Repository ${CONFIG.owner}/${CONFIG.repo} (Branch ${CONFIG.branch}). `
    + 'Bei „Failed to fetch“ ist meist die Netzverbindung oder ein Firewall-/Proxy-Filter die Ursache.';
  if (err.message === 'RATE_LIMIT') {
    title = 'GitHub-Zugriffslimit erreicht.';
    detail = 'Die GitHub-API erlaubt ohne Anmeldung 60 Anfragen pro Stunde und IP-Adresse. Bitte in einigen Minuten erneut laden.';
  } else if (err.message === 'NO_VERSIONS') {
    title = 'Keine Versionsordner gefunden.';
    detail = `Im Repository ${CONFIG.owner}/${CONFIG.repo} liegt kein Ordner, dessen Name mit V und einer Zahl beginnt (z. B. „V1“).`;
  } else if (err.message.startsWith('NOT_FOUND')) {
    title = 'Repository oder Ordner nicht gefunden.';
    detail = `Nicht gefunden: ${err.message.split(':')[1]} in ${CONFIG.owner}/${CONFIG.repo}. Ist das Repository öffentlich?`;
  }
  // Grundgerüst stehen lassen, damit „Erneut versuchen“ funktioniert
  $('#main').dataset.ready = 'false';
  $('#kpis').textContent = '';
  const box = $('#warnings');
  box.textContent = '';
  box.appendChild(errorBox(title, detail, true));
}

async function init() {
  renderIntro();
  const main = $('#main');
  try {
    await loadIndex();
    const usable = DATA.versions.filter((v) => !v.error && v.datasets.length);
    if (!usable.length) throw new Error(DATA.versions[0] && DATA.versions[0].error ? DATA.versions[0].error : 'NO_VERSIONS');
    // Voreinstellung: die neueste Version ist ausgewählt
    STATE.selected = new Set([usable[usable.length - 1].id]);
    main.dataset.ready = 'true';
    $('#warnings').textContent = '';
    renderAll();
    const errs = DATA.versions.filter((v) => v.error);
    if (errs.length) {
      const box = $('#warnings');
      errs.forEach((v) => box.appendChild(errorBox(`Version ${v.id} übersprungen`, v.error)));
    }
  } catch (e) {
    fatal(e);
  }
}

/* Diagramme zeichnen sich über ihren ResizeObserver selbst neu – ein
   Resize-Listener auf dem Fenster ist dafür nicht nötig. */
document.addEventListener('DOMContentLoaded', init);
