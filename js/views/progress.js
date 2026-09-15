import { h, segmented } from '../ui.js';
import { fmtDate, finishedSessions, exerciseNames, seriesFor, METRICS } from '../data.js';
import { fmtNumber, fmtSets, fromKg } from '../units.js';
import { lineChart } from '../chart.js';

let metric = 'weight';

const stat = (label, value) => h('div', { class: 'card stat' },
  h('div', { class: 'stat-label' }, label),
  h('div', { class: 'stat-value' }, value));

export async function progressView(el, ctx, key) {
  const { profile } = ctx;
  const { unit } = profile;
  const sessions = await finishedSessions(profile.id);
  const names = exerciseNames(sessions); // most recently done first

  el.append(h('div', { class: 'view-head' }, h('h1', {}, 'Progress')));
  if (!names.size) {
    el.append(h('div', { class: 'empty' },
      h('p', {}, h('strong', {}, 'Nothing to chart yet')),
      h('p', { class: 'muted small' }, 'Finish a workout and your exercises will show up here.')));
    return;
  }
  if (!key || !names.has(key)) key = names.keys().next().value;

  const select = h('select', {
    class: 'input input-lg', 'aria-label': 'Exercise', value: key,
    onchange: (e) => ctx.go(`#/progress/${encodeURIComponent(e.target.value)}`),
  }, [...names].sort((a, b) => a[1].localeCompare(b[1])).map(([k, n]) => h('option', { value: k }, n)));

  const body = h('div', { class: 'view' });

  const draw = () => {
    const m = METRICS[metric];
    const isWeight = m.kind === 'weight';
    const display = (v) => (isWeight ? fromKg(v, unit) : v);
    const fmt = (v) => (isWeight ? `${fmtNumber(v)} ${unit}` : fmtNumber(v));
    const points = seriesFor(sessions, key, metric);
    const values = points.map((p) => display(p.value));
    const latest = values.at(-1);
    const change = latest - values[0];
    const sign = change > 0 ? '+' : change < 0 ? '−' : '±';

    body.replaceChildren(
      segmented(Object.entries(METRICS).map(([k, mm]) => [k, mm.label]), metric, (v) => { metric = v; draw(); }, 'Metric'),
      h('div', { class: 'stats' },
        stat('Best', fmt(Math.max(...values))),
        stat('Latest', fmt(latest)),
        stat('Change', points.length > 1 ? `${sign}${fmt(Math.abs(change))}` : '—')),
      h('section', { class: 'card chart-card' },
        h('h2', { class: 'card-title' }, m.title),
        h('p', { class: 'muted small' }, `${names.get(key)} · ${points.length} session${points.length === 1 ? '' : 's'}`),
        lineChart({
          points: points.map((p) => ({
            t: p.t,
            value: display(p.value),
            label: fmtDate(p.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
            detail: fmtSets(p.sets, unit),
          })),
          format: fmt,
          ariaLabel: `${m.title} for ${names.get(key)} over time. Latest ${fmt(latest)}.`,
        })),
      h('h2', { class: 'section-title' }, 'Sessions'),
      h('div', { class: 'card table-wrap' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Logged'), h('th', { class: 'num' }, m.label))),
          h('tbody', {}, [...points].reverse().map((p) => h('tr', {},
            h('td', {}, h('a', { href: `#/workout/${p.sessionId}` }, fmtDate(p.date, { day: 'numeric', month: 'short', year: 'numeric' }))),
            h('td', {}, fmtSets(p.sets, unit)),
            h('td', { class: 'num' }, fmt(display(p.value)))))))),
    );
  };
  draw();

  el.append(select, body);
}
