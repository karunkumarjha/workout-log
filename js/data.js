// Domain helpers shared by the views.
import * as db from './db.js';

export const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export const exKey = (name) => name.trim().toLowerCase().replace(/\s+/g, ' ');

export const DEFAULT_SETS = 3;
export const DEFAULT_REPS = 8;

export function todayISO(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  parseISO(s).toLocaleDateString(undefined, opts);

// Entry shape: { id, exercise, sets: [{ reps, weightKg, done }] }.
// Older entries stored one sets/reps/weightKg for the whole exercise; expand them.
export function normalizeEntry(e) {
  if (Array.isArray(e.sets)) return e;
  const count = Math.max(1, Math.round(e.sets) || DEFAULT_SETS);
  return {
    id: e.id ?? uid(),
    exercise: e.exercise,
    sets: Array.from({ length: count }, () => ({ reps: e.reps ?? DEFAULT_REPS, weightKg: e.weightKg ?? 0, done: Boolean(e.done) })),
  };
}

export const normalizeSession = (s) => s && { ...s, entries: s.entries.map(normalizeEntry) };

export async function getSession(id) {
  return normalizeSession(await db.get('sessions', id));
}

export async function routinesFor(profileId) {
  // Reordered routines carry an `order` index; unordered (newer) ones sort after them by creation time.
  const rank = (r) => [r.order ?? Infinity, r.createdAt];
  return (await db.byProfile('routines', profileId)).sort((a, b) => {
    const [ao, ac] = rank(a);
    const [bo, bc] = rank(b);
    return ao === bo ? ac - bc : ao - bo;
  });
}

// Finished sessions, newest first.
export async function finishedSessions(profileId) {
  const all = await db.byProfile('sessions', profileId);
  return all
    .filter((s) => s.finishedAt)
    .map(normalizeSession)
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt);
}

export async function activeSession(profileId) {
  return normalizeSession((await db.byProfile('sessions', profileId)).find((s) => !s.finishedAt) || null);
}

// Most recent logged entry per exercise. Expects sessions newest first.
export function lastByExercise(sessions) {
  const map = new Map();
  for (const s of sessions) {
    for (const e of s.entries) {
      const k = exKey(e.exercise);
      if (!map.has(k)) map.set(k, { ...e, date: s.date, sessionId: s.id });
    }
  }
  return map;
}

// Known exercise names (latest spelling wins), from history then routines.
export function exerciseNames(sessions, routines = []) {
  const names = new Map();
  for (const s of sessions) for (const e of s.entries) if (!names.has(exKey(e.exercise))) names.set(exKey(e.exercise), e.exercise.trim());
  for (const r of routines) for (const e of r.exercises) if (!names.has(exKey(e.name))) names.set(exKey(e.name), e.name.trim());
  return names;
}

// Sets carry over from last time (same count, same reps/weight per set), else 3 blank-ish sets.
export function newEntry(name, last) {
  const count = last?.sets.length || DEFAULT_SETS;
  return {
    id: uid(),
    exercise: name.trim(),
    sets: Array.from({ length: count }, (_, i) => {
      const prev = last?.sets[i] ?? last?.sets.at(-1);
      return { reps: prev?.reps ?? DEFAULT_REPS, weightKg: prev?.weightKg ?? 0, done: false };
    }),
  };
}

export async function startSession(profile, routine) {
  const history = lastByExercise(await finishedSessions(profile.id));
  const session = {
    id: uid(),
    profileId: profile.id,
    routineId: routine?.id ?? null,
    routineName: routine?.name ?? 'Workout',
    date: todayISO(),
    startedAt: Date.now(),
    finishedAt: null,
    entries: (routine?.exercises ?? []).map((e) => newEntry(e.name, history.get(exKey(e.name)))),
  };
  return db.put('sessions', session);
}

export const setVolume = (sets) => sets.reduce((t, s) => t + s.reps * s.weightKg, 0);

const max = (a, b) => Math.max(a, b);
const sum = (a, b) => a + b;

// Each metric maps a set to a number and combines all sets of the exercise in one session.
export const METRICS = {
  weight: { label: 'Weight', title: 'Heaviest set', kind: 'weight', set: (s) => s.weightKg, combine: max },
  volume: { label: 'Volume', title: 'Volume (reps × weight, all sets)', kind: 'weight', set: (s) => s.reps * s.weightKg, combine: sum },
  e1rm: { label: '1RM', title: 'Estimated 1-rep max (best set, Epley)', kind: 'weight', set: (s) => (s.reps <= 1 ? s.weightKg : s.weightKg * (1 + s.reps / 30)), combine: max },
  reps: { label: 'Reps', title: 'Total reps', kind: 'count', set: (s) => s.reps, combine: sum },
};

// One point per session that includes the exercise, oldest first.
export function seriesFor(sessions, key, metric) {
  const m = METRICS[metric];
  const points = [];
  for (const s of sessions) {
    const entries = s.entries.filter((e) => exKey(e.exercise) === key);
    const sets = entries.flatMap((e) => e.sets);
    if (!sets.length) continue;
    points.push({ date: s.date, t: parseISO(s.date).getTime(), value: sets.map(m.set).reduce(m.combine), sets, sessionId: s.id });
  }
  return points.sort((a, b) => a.t - b.t);
}
