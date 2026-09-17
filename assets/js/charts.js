/* ===========================================================
   SVG chart renderers.

   Rules held to here (see the data-viz method):
     • one axis, never two y-scales
     • one hue per single-series chart; categorical only where
       identity is the encoding, in fixed slot order
     • 2px lines, >=8px hover targets, recessive grid
     • every chart ships a hover layer and a table view
   =========================================================== */

import { el, clear, esc, num, tip, tipOff, shortDate } from './util.js';

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined) continue;
    n.setAttribute(k, String(v));
  }
  return n;
}

/* Pick a round tick step first, then the axis max from it, so tick
   labels are whole numbers instead of 62.5 / 187.5. */
function niceScale(maxV, wantTicks = 4) {
  const rough = Math.max(maxV, 1) / wantTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  const max = Math.max(step, Math.ceil(Math.max(maxV, 1) / step) * step);
  return { max, step, ticks: Math.round(max / step) };
}

/* -----------------------------------------------------------
   Sparkline — one series, no axes, sits inside a table row.
   ----------------------------------------------------------- */

export function sparkline(host, values, opts = {}) {
  clear(host);
  const w = opts.width ?? 76;
  const h = opts.height ?? 26;
  const color = opts.color ?? 'var(--seq-400)';
  const labels = opts.labels ?? [];

  if (!values.length || values.every(v => v === 0)) {
    const flat = svgEl('svg', { class: 'chart', viewBox: `0 0 ${w} ${h}`, width: w, height: h, 'aria-hidden': 'true' });
    flat.appendChild(svgEl('line', { x1: 0, y1: h - 3, x2: w, y2: h - 3, stroke: 'var(--grid)', 'stroke-width': 2, 'stroke-linecap': 'round' }));
    host.appendChild(flat);
    return;
  }

  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? w / (values.length - 1) : w;
  const y = v => h - 3 - (v / max) * (h - 6);
  const pts = values.map((v, i) => [i * stepX, y(v)]);

  const svg = svgEl('svg', {
    class: 'chart', viewBox: `0 0 ${w} ${h}`, width: w, height: h,
    role: 'img', 'aria-label': opts.ariaLabel ?? 'trend',
  });

  const area = svgEl('path', {
    d: `M0,${h} ${pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} L${w},${h} Z`,
    fill: color, opacity: 0.14,
  });
  svg.appendChild(area);

  svg.appendChild(svgEl('path', {
    class: 'series-line',
    d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
    stroke: color,
  }));

  const last = pts[pts.length - 1];
  svg.appendChild(svgEl('circle', { class: 'dot', cx: last[0], cy: last[1], r: 2.6, fill: color }));

  /* hover band per point — hit target is the full column height */
  const band = Math.max(6, stepX);
  values.forEach((v, i) => {
    const hit = svgEl('rect', {
      class: 'hit', x: Math.max(0, i * stepX - band / 2), y: 0,
      width: band, height: h,
    });
    hit.addEventListener('pointerenter', e => tip(
      `<div class="t-title">${esc(labels[i] ?? `point ${i + 1}`)}</div>
       <div class="t-row"><span>${esc(opts.unit ?? 'points')}</span><b>${num(v)}</b></div>`, e));
    hit.addEventListener('pointermove', e => tip(
      `<div class="t-title">${esc(labels[i] ?? `point ${i + 1}`)}</div>
       <div class="t-row"><span>${esc(opts.unit ?? 'points')}</span><b>${num(v)}</b></div>`, e));
    hit.addEventListener('pointerleave', tipOff);
    svg.appendChild(hit);
  });

  host.appendChild(svg);
}

/* -----------------------------------------------------------
   Line chart — team momentum. One series, crosshair + tooltip.
   ----------------------------------------------------------- */

export function lineChart(host, { labels, values, color = 'var(--seq-400)', unit = 'points', height = 220 }) {
  clear(host);
  if (!labels.length) { host.appendChild(emptyBox('No activity in this range yet.')); return; }

  const W = 900, H = height;
  const m = { top: 16, right: 16, bottom: 30, left: 44 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const { max, step, ticks } = niceScale(Math.max(...values, 1));
  const x = i => m.left + (values.length > 1 ? (i / (values.length - 1)) * iw : iw / 2);
  const y = v => m.top + ih - (v / max) * ih;

  const svg = svgEl('svg', {
    class: 'chart', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none',
    style: `height:${H}px`, role: 'img',
    'aria-label': `Team points per day, ${labels[0]} to ${labels[labels.length - 1]}`,
  });

  /* gridlines + y ticks */
  for (let i = 0; i <= ticks; i++) {
    const v = step * i;
    const yy = y(v);
    svg.appendChild(svgEl('line', { class: 'gridline', x1: m.left, y1: yy, x2: W - m.right, y2: yy }));
    const t = svgEl('text', { class: 'tick', x: m.left - 9, y: yy + 4, 'text-anchor': 'end' });
    t.textContent = num(v);
    svg.appendChild(t);
  }
  svg.appendChild(svgEl('line', { class: 'axisline', x1: m.left, y1: m.top + ih, x2: W - m.right, y2: m.top + ih }));

  /* x ticks — thinned so labels never collide */
  const every = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((lab, i) => {
    if (i % every !== 0 && i !== labels.length - 1) return;
    const t = svgEl('text', { class: 'tick', x: x(i), y: H - 9, 'text-anchor': 'middle' });
    t.textContent = lab;
    svg.appendChild(t);
  });

  const pts = values.map((v, i) => [x(i), y(v)]);

  svg.appendChild(svgEl('path', {
    d: `M${m.left},${m.top + ih} ${pts.map(p => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} L${x(values.length - 1)},${m.top + ih} Z`,
    fill: color, opacity: 0.13,
  }));
  svg.appendChild(svgEl('path', {
    class: 'series-line', stroke: color,
    d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
  }));

  /* hover layer */
  const cross = svgEl('line', { class: 'crosshair', y1: m.top, y2: m.top + ih, opacity: 0 });
  const marker = svgEl('circle', { class: 'dot', r: 4.5, fill: color, opacity: 0 });
  svg.appendChild(cross);
  svg.appendChild(marker);

  const overlay = svgEl('rect', { class: 'hit', x: m.left, y: m.top, width: iw, height: ih });
  const locate = evt => {
    const box = svg.getBoundingClientRect();
    const px = ((evt.clientX - box.left) / box.width) * W;
    const ratio = (px - m.left) / iw;
    return Math.max(0, Math.min(values.length - 1, Math.round(ratio * (values.length - 1))));
  };
  const show = evt => {
    const i = locate(evt);
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 1);
    marker.setAttribute('cx', x(i)); marker.setAttribute('cy', y(values[i])); marker.setAttribute('opacity', 1);
    tip(`<div class="t-title">${esc(labels[i])}</div>
         <div class="t-row"><span>${esc(unit)}</span><b>${num(values[i])}</b></div>`, evt);
  };
  overlay.addEventListener('pointerenter', show);
  overlay.addEventListener('pointermove', show);
  overlay.addEventListener('pointerleave', () => {
    cross.setAttribute('opacity', 0); marker.setAttribute('opacity', 0); tipOff();
  });
  svg.appendChild(overlay);

  host.appendChild(svg);
  host.appendChild(tableView(['Day', unit], labels.map((l, i) => [l, num(values[i])]), [false, true]));
}

/* -----------------------------------------------------------
   Heatmap — power hours. Sequential single hue, light -> dark.
   ----------------------------------------------------------- */

/* Low -> high. On light the ramp darkens away from the surface; on dark it
   lightens away from it. Both stop at the step that still clears the
   ordinal contrast floor against their own surface. */
const SEQ_LIGHT = ['--seq-250', '--seq-400', '--seq-500', '--seq-600', '--seq-700'];
const SEQ_DARK  = ['--seq-600', '--seq-500', '--seq-400', '--seq-250', '--seq-100'];

function seqRamp() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? SEQ_LIGHT : SEQ_DARK;
}

export function heatmap(host, { rows, cols, matrix, unit = 'points' }) {
  clear(host);
  const max = Math.max(...matrix.flat(), 0);
  if (max === 0) { host.appendChild(emptyBox('Not enough activity logged yet to find your power hours.')); return; }

  const RAMP = seqRamp();
  const cellW = 78, cellH = 40, padL = 44, padT = 26;
  const W = padL + cols.length * cellW;
  const H = padT + rows.length * cellH + 6;

  const svg = svgEl('svg', {
    class: 'chart', viewBox: `0 0 ${W} ${H}`, style: `max-width:${W}px;width:100%`,
    role: 'img', 'aria-label': 'Activity by weekday and hour',
  });

  cols.forEach((c, j) => {
    const t = svgEl('text', { class: 'tick', x: padL + j * cellW + cellW / 2, y: padT - 9, 'text-anchor': 'middle' });
    t.textContent = c;
    svg.appendChild(t);
  });

  rows.forEach((r, i) => {
    const t = svgEl('text', { class: 'tick', x: padL - 10, y: padT + i * cellH + cellH / 2 + 4, 'text-anchor': 'end' });
    t.textContent = r;
    svg.appendChild(t);

    cols.forEach((c, j) => {
      const v = matrix[i][j] || 0;
      const s = v === 0 ? null : RAMP[Math.min(RAMP.length - 1, Math.floor((v / max) * RAMP.length))];
      const rect = svgEl('rect', {
        class: 'hm-cell',
        x: padL + j * cellW, y: padT + i * cellH,
        width: cellW - 3, height: cellH - 3, rx: 4,
        fill: s ? `var(${s})` : 'var(--surface-3)',
      });
      const html = `<div class="t-title">${esc(r)} · ${esc(c)}</div>
                    <div class="t-row"><span>${esc(unit)}</span><b>${num(v)}</b></div>`;
      rect.addEventListener('pointerenter', e => tip(html, e));
      rect.addEventListener('pointermove', e => tip(html, e));
      rect.addEventListener('pointerleave', tipOff);
      svg.appendChild(rect);
    });
  });

  const wrap = el('div', { style: { overflowX: 'auto' } }, [svg]);
  host.appendChild(wrap);

  /* sequential legend */
  const legend = el('div', { class: 'legend' }, [
    el('span', { class: 'legend-item', text: 'quiet' }),
    ...RAMP.map(s => el('span', { class: 'legend-swatch', style: { background: `var(${s})` } })),
    el('span', { class: 'legend-item', text: `busy (${num(max)} ${unit})` }),
  ]);
  host.appendChild(legend);

  host.appendChild(tableView(
    ['Day', ...cols],
    rows.map((r, i) => [r, ...matrix[i].map(v => num(v))]),
    [false, ...cols.map(() => true)],
  ));
}

/* -----------------------------------------------------------
   Shared bits
   ----------------------------------------------------------- */

export function tableView(headers, rows, numeric = []) {
  const table = el('table', { class: 'data' }, [
    el('thead', {}, [el('tr', {}, headers.map((h, i) =>
      el('th', { class: numeric[i] ? 'num' : '', text: h })))]),
    el('tbody', {}, rows.map(r => el('tr', {}, r.map((c, i) =>
      el('td', { class: numeric[i] ? 'num' : '', text: String(c) }))))),
  ]);
  return el('details', { class: 'tableview' }, [
    el('summary', { text: 'Show the numbers' }),
    table,
  ]);
}

export function emptyBox(msg, title) {
  return el('div', { class: 'empty' }, [
    title ? el('strong', { text: title }) : null,
    document.createTextNode(msg),
  ]);
}
