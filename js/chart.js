// Single-series SVG line chart with crosshair + tooltip (pointer, touch and keyboard).
const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

function niceTicks(min, max, count = 4) {
  const nonNegative = min >= 0;
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  let lo = Math.floor(min / step) * step;
  if (nonNegative) lo = Math.max(0, lo);
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let i = 0; lo + i * step <= hi + step / 2; i++) ticks.push(lo + i * step);
  return ticks;
}

/**
 * points: [{ t (ms), value, label, detail }] sorted by t, at least one.
 * format: value -> display string.
 */
export function lineChart({ points, format, ariaLabel, height = 220 }) {
  const root = document.createElement('div');
  root.className = 'chart';
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;

  let geom = null;
  let active = -1;
  let lastWidth = 0;

  function draw(width) {
    const values = points.map((p) => p.value);
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const yMin = ticks[0];
    const yMax = ticks.at(-1);
    const tickText = ticks.map(format);
    const pad = { top: 20, right: 16, bottom: 28, left: Math.max(...tickText.map((t) => t.length)) * 6.5 + 12 };
    const w = Math.max(10, width - pad.left - pad.right);
    const ph = height - pad.top - pad.bottom;
    const t0 = points[0].t;
    const t1 = points.at(-1).t;
    const x = (t) => (t1 === t0 ? pad.left + w / 2 : pad.left + ((t - t0) / (t1 - t0)) * w);
    const y = (v) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * ph;

    const svg = svgEl('svg', { width, height, viewBox: `0 0 ${width} ${height}`, class: 'chart-svg', role: 'img', 'aria-label': ariaLabel, tabindex: '0' });

    ticks.forEach((v, i) => {
      const yy = Math.round(y(v)) + 0.5;
      svg.append(
        svgEl('line', { x1: pad.left, x2: width - pad.right, y1: yy, y2: yy, class: i === 0 ? 'chart-axis' : 'chart-grid' }),
        svgEl('text', { x: pad.left - 8, y: yy, 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'chart-tick' }, tickText[i]),
      );
    });

    const span = t1 - t0;
    const dateOpts = span > 200 * 864e5 ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' };
    const n = span === 0 ? 1 : Math.min(points.length, Math.max(2, Math.floor(w / 90)));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? t0 : t0 + (span * i) / (n - 1);
      const anchor = n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      svg.append(svgEl('text', { x: x(t), y: height - 8, 'text-anchor': anchor, class: 'chart-tick' },
        new Date(t).toLocaleDateString(undefined, dateOpts)));
    }

    const cross = svgEl('line', { y1: pad.top, y2: pad.top + ph, class: 'chart-cross', visibility: 'hidden' });
    svg.append(cross);
    svg.append(svgEl('path', {
      class: 'chart-line',
      d: points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.value).toFixed(1)}`).join(''),
    }));
    const showAllDots = points.length <= 40;
    points.forEach((p, i) => {
      if (showAllDots || i === points.length - 1) svg.append(svgEl('circle', { cx: x(p.t), cy: y(p.value), r: 4, class: 'chart-dot' }));
    });

    // Direct label on the latest value only; placed away from the incoming line.
    const lp = points.at(-1);
    const prev = points.at(-2);
    const ly = y(lp.value);
    const above = (!prev || prev.value <= lp.value) && ly - 12 > 8;
    svg.append(svgEl('text', {
      x: points.length === 1 ? x(lp.t) : x(lp.t) - 6,
      y: above ? ly - 12 : ly + 20,
      'text-anchor': points.length === 1 ? 'middle' : 'end',
      class: 'chart-endlabel',
    }, format(lp.value)));

    const focusDot = svgEl('circle', { r: 6, class: 'chart-dot', visibility: 'hidden' });
    svg.append(focusDot);
    svg.append(svgEl('rect', { x: 0, y: 0, width, height, class: 'chart-hit' }));

    geom = { svg, x, y, cross, focusDot, width };
    root.replaceChildren(svg, tip);
  }

  function show(i) {
    if (!geom) return;
    active = i;
    const p = points[i];
    const px = geom.x(p.t);
    const py = geom.y(p.value);
    for (const [k, v] of [['x1', px], ['x2', px], ['visibility', 'visible']]) geom.cross.setAttribute(k, v);
    for (const [k, v] of [['cx', px], ['cy', py], ['visibility', 'visible']]) geom.focusDot.setAttribute(k, v);
    const line = (tag, text) => Object.assign(document.createElement(tag), { textContent: text });
    tip.replaceChildren(line('strong', format(p.value)), line('span', p.label));
    if (p.detail) tip.append(line('span', p.detail));
    tip.hidden = false;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    tip.style.left = `${Math.min(Math.max(px - tw / 2, 0), Math.max(0, geom.width - tw))}px`;
    tip.style.top = `${py - th - 14 < 0 ? py + 14 : py - th - 14}px`;
  }

  function hide() {
    active = -1;
    tip.hidden = true;
    geom?.cross.setAttribute('visibility', 'hidden');
    geom?.focusDot.setAttribute('visibility', 'hidden');
  }

  function nearest(clientX) {
    const mx = clientX - geom.svg.getBoundingClientRect().left;
    let best = 0;
    let bestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(geom.x(p.t) - mx);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  root.addEventListener('pointermove', (e) => geom && show(nearest(e.clientX)));
  root.addEventListener('pointerdown', (e) => geom && show(nearest(e.clientX)));
  root.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && hide());
  root.addEventListener('focusin', () => show(active >= 0 ? active : points.length - 1));
  root.addEventListener('focusout', hide);
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = (active < 0 ? points.length - 1 : active) + (e.key === 'ArrowRight' ? 1 : -1);
    show(Math.min(points.length - 1, Math.max(0, next)));
  });

  new ResizeObserver((entries) => {
    const width = Math.floor(entries[0].contentRect.width);
    if (width > 0 && width !== lastWidth) {
      lastWidth = width;
      draw(width);
      if (active >= 0) show(active);
    }
  }).observe(root);

  return root;
}
