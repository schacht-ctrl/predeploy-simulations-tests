/* ==========================================================================
   charts.js — SVG-Diagramme (Punktdiagramm, Punktraster, Histogramm) + Tabellen
   Reine Vanilla-Implementierung, keine externen Bibliotheken.
   Marken-Konventionen: dünne Marken, 2px Flächenring auf Punkten,
   durchgezogene Haarlinien als Raster, Werte immer auch als Tabelle lesbar.
   ========================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';
const C = {
  ink: '#202020', ink2: '#646464', ink3: '#8D8D8D',
  line: '#EFEFEF', line2: '#E0E0E0', line3: '#CECECE',
  surface: '#FFFFFF', sunken: '#F9F9F9',
};

function el(tag, attrs, text) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
  if (text !== undefined) n.textContent = text; // Labels sind Fremddaten → textContent
  return n;
}

/* --- Zahlenformate ------------------------------------------------------ */
const nf = (d) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
function fmtPct(v, decimals = 0) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return nf(decimals).format(v * 100) + ' %';
}
function fmtNum(v, decimals = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return nf(decimals).format(v);
}
function fmtInt(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return new Intl.NumberFormat('de-DE').format(Math.round(v));
}

/* --- Zeichen-Warteschlange ----------------------------------------------
   Diagramme brauchen ihre gemessene Containerbreite, dürfen also erst
   gezeichnet werden, wenn der Container im Dokument hängt. Bewusst KEIN
   requestAnimationFrame: in einem Hintergrund-Tab feuert rAF nicht, die
   Diagramme blieben dann leer. Stattdessen wird nach dem Aufbau des DOM
   synchron gezeichnet; Container ohne Breite werden per ResizeObserver
   nachgezogen.                                                             */
const MIN_DRAW_WIDTH = 80;   // darunter ist der Container noch nicht ausgelegt
const REDRAW_DELTA = 8;      // erst ab dieser Breitenänderung neu zeichnen
const PENDING_DRAWS = [];

function scheduleDraw(container, fn) {
  PENDING_DRAWS.push([container, fn]);
}

function flushDraws() {
  const jobs = PENDING_DRAWS.splice(0, PENDING_DRAWS.length);
  jobs.forEach(([container, fn]) => {
    if (!container.isConnected) return;
    let drawnAt = -1;
    let ro = null;
    const attempt = () => {
      if (!container.isConnected) { if (ro) ro.disconnect(); return; }
      const w = innerWidth(container, 0);
      if (w < MIN_DRAW_WIDTH) return;                  // noch keine echte Breite
      if (Math.abs(w - drawnAt) < REDRAW_DELTA) return; // praktisch unverändert
      drawnAt = w;
      fn(container);
    };
    // Der Beobachter deckt alles ab: verstecktes Fenster, später aufgeklappte
    // Container und Größenänderungen des Browserfensters.
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(attempt);
      ro.observe(container);
    }
    attempt();
  });
}

/* Innenbreite eines Containers (ohne Padding) — clientWidth enthält Padding
   und würde das SVG über den Rand hinauslaufen lassen.                     */
function innerWidth(container, min = 260) {
  const cs = getComputedStyle(container);
  const w = container.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  return Math.max(min, Math.round(w || min));
}

/* --- Textmessung für Umbruch und Kürzung ------------------------------- */
let _ctx = null;
function measure(text, font) {
  if (!_ctx) _ctx = document.createElement('canvas').getContext('2d');
  _ctx.font = font;
  return _ctx.measureText(text).width;
}
function wrapLines(text, maxW, font, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (measure(test, font) <= maxW || !cur) cur = test;
    else { lines.push(cur); cur = w; }
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  // Letzte Zeile ggf. kürzen statt beschneiden
  if (lines.length === maxLines) {
    const used = lines.join(' ').split(/\s+/).length;
    const rest = words.length - used;
    let last = lines[maxLines - 1];
    if (rest > 0 || measure(last, font) > maxW) {
      while (last.length > 1 && measure(last + '…', font) > maxW) last = last.slice(0, -1);
      lines[maxLines - 1] = last.replace(/[\s,;:.]+$/, '') + '…';
    }
  }
  return lines;
}

/* Hinweiszeile platzsparend einpassen: erst hintere „·“-Segmente weglassen,
   erst danach kürzen. So bleibt die wichtigste Angabe (Zielrichtung) stehen. */
function fitHint(text, maxW, font) {
  if (!text) return '';
  if (measure(text, font) <= maxW) return text;
  const parts = String(text).split(' · ');
  for (let k = parts.length - 1; k >= 1; k--) {
    const t = parts.slice(0, k).join(' · ');
    if (measure(t, font) <= maxW) return t;
  }
  let t = parts[0];
  while (t.length > 1 && measure(t + '…', font) > maxW) t = t.slice(0, -1);
  return t.replace(/[\s,;:.]+$/, '') + '…';
}

/* --- Tooltip ----------------------------------------------------------- */
const Tip = (() => {
  let node = null;
  function ensure() {
    if (!node) {
      node = document.createElement('div');
      node.id = 'tip';
      node.setAttribute('role', 'tooltip');
      document.body.appendChild(node);
    }
    return node;
  }
  function show(x, y, parts) {
    const n = ensure();
    n.textContent = '';
    if (parts.value !== undefined) {
      const v = document.createElement('div');
      v.className = 'tip-val';
      v.textContent = parts.value;
      n.appendChild(v);
    }
    (parts.rows || []).forEach((r) => {
      const row = document.createElement('div');
      row.className = 'tip-row';
      if (r.color) {
        const k = document.createElement('span');
        k.className = 'tip-key';
        k.style.background = r.color;
        row.appendChild(k);
      }
      const t = document.createElement('span');
      t.className = 'tip-name';
      t.textContent = r.label;
      row.appendChild(t);
      n.appendChild(row);
    });
    if (parts.meta) {
      const m = document.createElement('div');
      m.className = 'tip-meta';
      m.textContent = parts.meta;
      n.appendChild(m);
    }
    n.dataset.show = 'true';
    place(x, y);
  }
  function place(x, y) {
    const n = ensure();
    const r = n.getBoundingClientRect();
    let left = x + 14, top = y - r.height - 10;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (left < 8) left = 8;
    if (top < 8) top = y + 18;
    n.style.left = left + 'px';
    n.style.top = top + 'px';
  }
  function hide() { if (node) node.dataset.show = 'false'; }
  return { show, hide, place };
})();

/* Hover/Focus-Verhalten für eine Marke (Trefferfläche > Marke) */
function attachHover(hit, mark, parts) {
  const on = (e) => {
    const p = e.touches ? e.touches[0] : e;
    Tip.show(p.clientX, p.clientY, parts);
    if (mark) mark.setAttribute('stroke-width', '3');
  };
  const off = () => { Tip.hide(); if (mark) mark.setAttribute('stroke-width', '2'); };
  hit.addEventListener('pointerenter', on);
  hit.addEventListener('pointermove', (e) => Tip.place(e.clientX, e.clientY));
  hit.addEventListener('pointerleave', off);
  hit.addEventListener('focus', () => {
    const r = hit.getBoundingClientRect();
    Tip.show(r.left + r.width / 2, r.top, parts);
    if (mark) mark.setAttribute('stroke-width', '3');
  });
  hit.addEventListener('blur', off);
}

/* ==========================================================================
   Punktdiagramm (Dot Plot)
   rows: [{kind:'group', label} | {label, hint, direction, target,
          points:[{version,value,n,color,label}]}]
   versions: [{id, color}] — bestimmt die Wertespalten rechts
   ========================================================================== */
function dotPlot(container, spec) {
  const {
    rows = [], versions = [], decimalsFor = () => 0,
    axisLabel = 'Anteil der Anrufe',
    domain = [0, 1],
    // Standard: Anteile als Prozent. Andere Einheiten übergeben eigenen Formatter.
    format = null,
    axisFormat = null,
    ticks = null,
  } = spec;
  const [dLo, dHi] = domain;
  const span = dHi - dLo || 1;
  const tickVals = ticks || [0, 0.25, 0.5, 0.75, 1].map((t) => dLo + t * span);
  // row ist null bei Achsenbeschriftungen
  const fmtVal = format || ((v, row) => fmtPct(v, row ? decimalsFor(row) : 0));
  const fmtAxis = axisFormat || ((v) => fmtVal(v, null));
  container.textContent = '';

  // Legende: ab zwei Serien immer vorhanden, mit vollständigen Namen
  if (versions.length > 1) {
    const leg = document.createElement('div');
    leg.className = 'chart-legend';
    versions.forEach((v) => {
      const item = document.createElement('span');
      item.className = 'legend-item';
      const dot = document.createElement('span');
      dot.className = 'legend-dot';
      dot.style.background = v.color;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(v.id));
      leg.appendChild(item);
    });
    container.appendChild(leg);
  }

  const W = innerWidth(container, 300);
  const FONT_LABEL_M = '600 13px system-ui, -apple-system, Helvetica, Arial, sans-serif';
  const FONT_HINT_M = '400 11px system-ui, -apple-system, Helvetica, Arial, sans-serif';

  // Spaltenbreite aus den gemessenen Versionsnamen (können lang sein, z. B.
  // „V1 SipgateAI“) – gedeckelt, damit die Zeilenbeschriftung Platz behält.
  const FONT_COL_M = '700 11px system-ui, -apple-system, Helvetica, Arial, sans-serif';
  const widestName = versions.reduce((a, v) => Math.max(a, measure(v.id, FONT_COL_M)), 0);
  const colW = Math.round(Math.max(52, Math.min(116, widestName + 22)));
  const valW = versions.length * colW;
  let labelW = Math.round(Math.min(300, Math.max(132, W * 0.31)));
  const gap = 12;
  let x0 = labelW + gap;
  let x1 = W - valW - 8;
  if (x1 - x0 < 110) { labelW = Math.max(96, W - valW - 8 - 110 - gap); x0 = labelW + gap; x1 = W - valW - 8; }
  const plotW = Math.max(60, x1 - x0);

  const headH = versions.length ? 24 : 8;
  const axisH = 30;
  const R = 6.5;

  // Zeilenhöhen vorab bestimmen (Label-Umbruch)
  const layout = [];
  let y = headH;
  rows.forEach((row) => {
    if (row.kind === 'group') {
      layout.push({ row, y, h: 28, type: 'group' });
      y += 28;
      return;
    }
    const lines = wrapLines(row.label, labelW - 16, FONT_LABEL_M, 2);
    const h = Math.max(36, lines.length * 16 + (row.hint ? 15 : 0) + 16);
    layout.push({ row, y, h, lines, type: 'row' });
    y += h;
  });
  const plotH = y - headH;
  const H = y + axisH;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'viz',
    role: 'img', 'aria-label': spec.ariaLabel || 'Punktdiagramm',
  });
  const sx = (v) => x0 + Math.max(0, Math.min(1, (v - dLo) / span)) * plotW;

  // Raster: durchgezogene Haarlinien. Beschriftungen nur, wenn sie nicht
  // kollidieren – erste und letzte Marke behalten immer ihr Label.
  const FONT_TICK_M = '400 11px system-ui, -apple-system, Helvetica, Arial, sans-serif';
  const lastIdx = tickVals.length - 1;
  const tickLabels = tickVals.map((tv) => fmtAxis(tv));
  const lastW = measure(tickLabels[lastIdx], FONT_TICK_M);
  let usedUntil = -Infinity;
  tickVals.forEach((tv, i) => {
    const last = i === lastIdx;
    svg.appendChild(el('line', {
      x1: sx(tv), x2: sx(tv), y1: headH, y2: headH + plotH,
      stroke: i === 0 ? C.line2 : C.line, 'stroke-width': 1,
    }));
    const label = tickLabels[i];
    const w = measure(label, FONT_TICK_M);
    const anchor = last ? 'end' : i === 0 ? 'start' : 'middle';
    const left = last ? sx(tv) - w : i === 0 ? sx(tv) : sx(tv) - w / 2;
    const right = left + w;
    const collidesLast = !last && right + 6 > sx(tickVals[lastIdx]) - lastW;
    if (left < usedUntil + 6 || collidesLast) return;   // Label auslassen
    usedUntil = right;
    svg.appendChild(el('text', {
      x: sx(tv), y: H - axisH + 18, 'text-anchor': anchor,
      fill: C.ink3, 'font-size': 11, 'font-family': 'inherit',
    }, label));
  });
  svg.appendChild(el('text', {
    x: x0, y: H - axisH + 33, fill: C.ink3, 'font-size': 10.5, 'font-family': 'inherit',
  }, axisLabel));

  // Kopfzeile der Wertespalten. Namen werden auf die Spaltenbreite gekürzt –
  // die vollständige Identität steht in der HTML-Legende über dem Diagramm.
  versions.forEach((v, i) => {
    const cx = x1 + 8 + i * colW + colW - 6;
    const maxTextW = colW - 20;
    let label = v.id;
    if (measure(label, FONT_COL_M) > maxTextW) {
      while (label.length > 1 && measure(label + '…', FONT_COL_M) > maxTextW) label = label.slice(0, -1);
      label = label.replace(/[\s·,;:.]+$/, '') + '…';
    }
    svg.appendChild(el('circle', { cx: cx - measure(label, FONT_COL_M) - 8, cy: 12, r: 4, fill: v.color }));
    const t = el('text', {
      x: cx, y: 16, 'text-anchor': 'end', fill: C.ink2,
      'font-size': 11, 'font-weight': 700, 'font-family': 'inherit',
    }, label);
    t.appendChild(el('title', {}, v.id));
    svg.appendChild(t);
  });

  layout.forEach((L) => {
    if (L.type === 'group') {
      svg.appendChild(el('text', {
        x: 0, y: L.y + 19, fill: C.ink3, 'font-size': 10.5, 'font-weight': 700,
        'letter-spacing': '.07em', 'font-family': 'inherit',
      }, L.row.label.toUpperCase()));
      return;
    }
    const row = L.row;
    const cy = L.y + (row.hint ? (L.lines.length * 16 + 14) / 2 + 1 : L.h / 2);

    // Zeilenlineal (Haarlinie)
    svg.appendChild(el('line', {
      x1: x0, x2: x1, y1: cy, y2: cy, stroke: C.line2, 'stroke-width': 1,
    }));

    // Zielmarke
    if (row.target !== undefined && row.target !== null) {
      svg.appendChild(el('line', {
        x1: sx(row.target), x2: sx(row.target), y1: cy - 9, y2: cy + 9,
        stroke: C.ink2, 'stroke-width': 1.5,
      }));
    }

    // Label (max. 2 Zeilen) + Hinweiszeile
    const glyph = row.glyph ? row.glyph + ' ' : '';
    L.lines.forEach((ln, i) => {
      svg.appendChild(el('text', {
        x: 0, y: L.y + 14 + i * 16, fill: C.ink, 'font-size': 13, 'font-weight': 600,
        'font-family': 'inherit',
      }, (i === 0 ? glyph : '') + ln));
    });
    if (row.hint) {
      svg.appendChild(el('text', {
        x: 0, y: L.y + 14 + L.lines.length * 16 + 1, fill: C.ink3, 'font-size': 11,
        'font-family': 'inherit',
      }, fitHint(row.hint, labelW - 8, FONT_HINT_M)));
    }
    const full = el('title', {}, row.label + (row.hint ? ' — ' + row.hint : ''));
    svg.appendChild(full);

    // Punkte: Kollisionsversatz, damit gleiche Werte lesbar bleiben
    const pts = row.points.filter((p) => p.value !== null && p.value !== undefined && !Number.isNaN(p.value));
    const sorted = pts.map((p, i) => ({ p, i, x: sx(p.value) })).sort((a, b) => a.x - b.x);
    const off = new Array(pts.length).fill(0);
    let cluster = [];
    const flush = () => {
      if (cluster.length > 1) {
        const step = 8;
        cluster.forEach((c, k) => {
          const half = (cluster.length - 1) / 2;
          off[c.i] = Math.round((k - half) * step);
        });
      }
      cluster = [];
    };
    sorted.forEach((s) => {
      if (cluster.length && s.x - cluster[cluster.length - 1].x > 2 * R + 2) flush();
      cluster.push(s);
    });
    flush();

    pts.forEach((p, i) => {
      const cxp = sx(p.value), cyp = cy + off[i];
      const g = el('g', {});
      const dot = el('circle', {
        cx: cxp, cy: cyp, r: R, fill: p.color,
        stroke: C.surface, 'stroke-width': 2,
      });
      const hit = el('circle', {
        cx: cxp, cy: cyp, r: 14, fill: 'transparent',
        tabindex: '0', role: 'img',
        'aria-label': `${row.label}, ${p.version}: ${fmtVal(p.value, row)}${p.n ? ', n = ' + fmtInt(p.n) : ''}`,
      });
      hit.style.cursor = 'pointer';
      attachHover(hit, dot, {
        value: fmtVal(p.value, row),
        rows: [{ color: p.color, label: `${p.version} · ${row.label}` }],
        meta: [p.n ? `${fmtInt(p.n)} Anrufe` : null, p.meta || null].filter(Boolean).join(' · ') || null,
      });
      g.appendChild(dot);
      g.appendChild(hit);
      svg.appendChild(g);
    });

    // Wertespalten (direkte Labels — auch als Kontrast-Absicherung nötig)
    versions.forEach((v, i) => {
      const p = row.points.find((q) => q.version === v.id);
      const cxv = x1 + 8 + i * colW + colW - 6;
      const txt = p && p.value !== null && p.value !== undefined && !Number.isNaN(p.value)
        ? fmtVal(p.value, row) : '–';
      svg.appendChild(el('text', {
        x: cxv, y: cy + 4.5, 'text-anchor': 'end',
        fill: txt === '–' ? C.line3 : C.ink, 'font-size': 12.5, 'font-weight': 700,
        'font-family': 'inherit', style: 'font-variant-numeric: tabular-nums',
      }, txt));
    });
  });

  container.appendChild(svg);
  return svg;
}

/* ==========================================================================
   Punktraster (Unit Chart): ein Punkt = ein Anruf
   ========================================================================== */
function waffle(container, { n, ones, color, cols = 10 }) {
  container.textContent = '';
  const total = Math.max(0, Math.round(n));
  const perDot = total <= 200 ? 1 : Math.ceil(total / 100);
  const dots = Math.round(total / perDot);
  const filled = Math.round(ones / perDot);
  const r = 4.3, step = 12.4;
  const rowsN = Math.ceil(dots / cols);
  const W = cols * step, H = rowsN * step;
  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', class: 'viz',
    'aria-label': `${fmtInt(ones)} von ${fmtInt(total)} Anrufen erfüllt`,
  });
  for (let i = 0; i < dots; i++) {
    const cx = (i % cols) * step + step / 2;
    const cy = Math.floor(i / cols) * step + step / 2;
    svg.appendChild(el('circle', {
      cx, cy, r, fill: i < filled ? color : C.line2,
    }));
  }
  container.appendChild(svg);
  return { perDot };
}

/* ==========================================================================
   Histogramm für kontinuierliche Metriken
   ========================================================================== */
function histogram(container, { values, color, bins = 12, domain = [0, 1], target = null, label = '' }) {
  container.textContent = '';
  const W = innerWidth(container, 240);
  const H = 168, padL = 30, padR = 10, padT = 12, padB = 40;
  const [d0, d1] = domain;
  const counts = new Array(bins).fill(0);
  values.forEach((v) => {
    let k = Math.floor(((v - d0) / (d1 - d0)) * bins);
    if (k >= bins) k = bins - 1;
    if (k < 0) k = 0;
    counts[k]++;
  });
  // y-Achse auf runde Werte bringen (Ticks sollen glatt sein)
  const rawMax = Math.max(1, ...counts);
  const step = rawMax <= 10 ? 2 : rawMax <= 30 ? 5 : rawMax <= 60 ? 10 : 20;
  const maxC = Math.ceil(rawMax / step) * step;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'viz', role: 'img', 'aria-label': label });

  // y-Raster
  const ticks = [0, maxC / 2, maxC];
  [...new Set(ticks)].forEach((t) => {
    const yy = padT + plotH - (t / maxC) * plotH;
    svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: yy, y2: yy, stroke: t === 0 ? C.line2 : C.line, 'stroke-width': 1 }));
    svg.appendChild(el('text', { x: padL - 6, y: yy + 4, 'text-anchor': 'end', fill: C.ink3, 'font-size': 10.5, 'font-family': 'inherit' }, fmtInt(t)));
  });

  const bw = plotW / bins;
  counts.forEach((c, i) => {
    const x = padL + i * bw + 1;
    const w = Math.max(1, bw - 2); // 2px Flächenabstand
    const h = (c / maxC) * plotH;
    const yy = padT + plotH - h;
    if (c > 0) {
      const rr = Math.min(4, w / 2, h);
      const p = el('path', {
        d: `M${x},${padT + plotH} L${x},${yy + rr} Q${x},${yy} ${x + rr},${yy} L${x + w - rr},${yy} Q${x + w},${yy} ${x + w},${yy + rr} L${x + w},${padT + plotH} Z`,
        fill: color,
      });
      svg.appendChild(p);
    }
    const lo = d0 + (i / bins) * (d1 - d0), hi = d0 + ((i + 1) / bins) * (d1 - d0);
    const hit = el('rect', { x: padL + i * bw, y: padT, width: bw, height: plotH, fill: 'transparent', tabindex: '0', role: 'img',
      'aria-label': `${fmtPct(lo, 0)} bis ${fmtPct(hi, 0)}: ${fmtInt(c)} Anrufe` });
    hit.style.cursor = 'pointer';
    attachHover(hit, null, {
      value: `${fmtInt(c)} ${c === 1 ? 'Anruf' : 'Anrufe'}`,
      rows: [{ color, label: `${fmtPct(lo, 0)} – ${fmtPct(hi, 0)}` }],
    });
    svg.appendChild(hit);
  });

  // x-Achse
  [0, 0.5, 1].forEach((t) => {
    const v = d0 + t * (d1 - d0);
    svg.appendChild(el('text', {
      x: padL + t * plotW, y: H - padB + 16, fill: C.ink3, 'font-size': 10.5, 'font-family': 'inherit',
      'text-anchor': t === 0 ? 'start' : t === 1 ? 'end' : 'middle',
    }, fmtPct(v, 0)));
  });
  svg.appendChild(el('text', { x: padL, y: H - padB + 31, fill: C.ink3, 'font-size': 10, 'font-family': 'inherit' }, 'Wert je Anruf'));

  // Zielmarke
  if (target !== null && target >= d0 && target <= d1) {
    const xt = padL + ((target - d0) / (d1 - d0)) * plotW;
    svg.appendChild(el('line', { x1: xt, x2: xt, y1: padT - 4, y2: padT + plotH, stroke: C.ink, 'stroke-width': 1.5 }));
    svg.appendChild(el('text', { x: Math.min(xt + 4, W - padR - 40), y: padT + 6, fill: C.ink2, 'font-size': 10, 'font-weight': 700, 'font-family': 'inherit' }, 'Ziel'));
  }
  container.appendChild(svg);
}

/* ==========================================================================
   Tabellen-Ansicht (WCAG-saubere Zwillingsansicht jedes Diagramms)
   ========================================================================== */
function renderTable(container, { columns, rows, caption }) {
  container.textContent = '';
  const scroll = document.createElement('div');
  scroll.className = 'tbl-scroll';
  const t = document.createElement('table');
  t.className = 'data';
  if (caption) {
    const cap = document.createElement('caption');
    cap.className = 'sr-only';
    cap.textContent = caption;
    t.appendChild(cap);
  }
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  columns.forEach((col) => {
    const th = document.createElement('th');
    th.scope = 'col';
    if (col.color) {
      const s = document.createElement('span');
      s.className = 'swatch';
      s.style.background = col.color;
      th.appendChild(s);
    }
    th.appendChild(document.createTextNode(col.label));
    trh.appendChild(th);
  });
  thead.appendChild(trh);
  t.appendChild(thead);
  const tb = document.createElement('tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    if (r.group) {
      tr.className = 'grp';
      const td = document.createElement('td');
      td.colSpan = columns.length;
      td.textContent = r.group;
      tr.appendChild(td);
    } else {
      r.cells.forEach((cell, i) => {
        const node = document.createElement(i === 0 ? 'th' : 'td');
        if (i === 0) node.scope = 'row';
        node.textContent = cell === null || cell === undefined ? '–' : String(cell);
        tr.appendChild(node);
      });
    }
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  scroll.appendChild(t);
  container.appendChild(scroll);
}

/* --- Statistikhelfer --------------------------------------------------- */
function stats(values) {
  const v = values.filter((x) => typeof x === 'number' && !Number.isNaN(x)).slice().sort((a, b) => a - b);
  const n = v.length;
  if (!n) return { n: 0 };
  const sum = v.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const median = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, median, sd, min: v[0], max: v[n - 1] };
}
