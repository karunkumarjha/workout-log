import { h } from '../ui.js';
import { fmtDate, finishedSessions, activeSession, setVolume } from '../data.js';
import { fmtWeight } from '../units.js';
import { activeBanner } from './routines.js';

export async function historyView(el, ctx) {
  const { profile } = ctx;
  const [sessions, active] = await Promise.all([finishedSessions(profile.id), activeSession(profile.id)]);

  el.append(h('div', { class: 'view-head' }, h('h1', {}, 'History')));
  if (active) el.append(activeBanner(active));

  if (!sessions.length) {
    el.append(h('div', { class: 'empty' },
      h('p', {}, h('strong', {}, 'No workouts logged yet')),
      h('p', { class: 'muted small' }, 'Start a routine and tap Finish to save it here.'),
      h('a', { class: 'btn btn-primary', href: '#/routines' }, 'Go to routines')));
    return;
  }

  const list = h('div', { class: 'history' });
  let month = null;
  for (const s of sessions) {
    const m = fmtDate(s.date, { month: 'long', year: 'numeric' });
    if (m !== month) {
      month = m;
      list.append(h('h2', { class: 'section-title' }, m));
    }
    const n = s.entries.length;
    const volume = setVolume(s.entries.flatMap((e) => e.sets));
    list.append(h('a', { class: 'card history-item', href: `#/workout/${s.id}` },
      h('div', { class: 'history-date', 'aria-hidden': 'true' },
        h('span', { class: 'dow' }, fmtDate(s.date, { weekday: 'short' })),
        h('span', { class: 'day' }, fmtDate(s.date, { day: 'numeric' }))),
      h('div', { class: 'history-body' },
        h('h3', {}, s.routineName),
        h('p', { class: 'muted small' }, `${fmtDate(s.date)} · ${n} exercise${n === 1 ? '' : 's'}${volume ? ` · ${fmtWeight(volume, profile.unit)} lifted` : ''}`),
        h('p', { class: 'muted small ellipsis' }, s.entries.map((e) => e.exercise).join(', '))),
      h('span', { class: 'chev', 'aria-hidden': 'true' }, '›')));
  }
  el.append(list);
}
