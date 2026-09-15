import * as db from '../db.js';
import { h, confirmDialog, openDialog, toast } from '../ui.js';
import { uid, routinesFor, activeSession, startSession, finishedSessions, exerciseNames } from '../data.js';

export function activeBanner(session) {
  const sets = session.entries.flatMap((e) => e.sets);
  const done = sets.filter((s) => s.done).length;
  return h('a', { class: 'banner', href: `#/workout/${session.id}` },
    h('div', {},
      h('strong', {}, 'Workout in progress'),
      h('div', { class: 'muted small' }, `${session.routineName} · ${done} of ${sets.length} sets done`)),
    h('span', { class: 'btn btn-primary' }, 'Resume'));
}

export async function routinesList(el, ctx) {
  const { profile } = ctx;
  const [routines, active] = await Promise.all([routinesFor(profile.id), activeSession(profile.id)]);

  const start = async (routine) => {
    const current = await activeSession(profile.id);
    if (current) {
      const choice = await openDialog({
        title: 'Workout in progress',
        message: `You already started "${current.routineName}". Resume it, or discard it and start ${routine ? `"${routine.name}"` : 'a new workout'}?`,
        okText: 'Resume',
        extra: [{ value: 'discard', label: 'Discard & start new', class: 'btn-danger-ghost' }],
      });
      if (choice === 'ok') return ctx.go(`#/workout/${current.id}`);
      if (choice !== 'discard') return;
      await db.del('sessions', current.id);
    }
    const session = await startSession(profile, routine);
    ctx.go(`#/workout/${session.id}`);
  };

  let reordering = false;
  const headActions = h('div', { class: 'head-actions' });
  const listWrap = h('div');

  const move = async (i, d) => {
    const [r] = routines.splice(i, 1);
    routines.splice(i + d, 0, r);
    routines.forEach((x, idx) => { x.order = idx; });
    draw();
    await Promise.all(routines.map((x) => db.put('routines', x)));
  };

  const draw = () => {
    headActions.replaceChildren(...[
      routines.length > 1 && h('button', {
        class: 'btn', 'aria-pressed': String(reordering),
        onclick: () => { reordering = !reordering; draw(); },
      }, reordering ? 'Done' : 'Reorder'),
      !reordering && h('a', { class: 'btn btn-primary', href: '#/routine/new' }, '+ New'),
    ].filter(Boolean));

    listWrap.replaceChildren(routines.length === 0
      ? h('div', { class: 'empty' },
        h('p', {}, h('strong', {}, 'No routines yet')),
        h('p', { class: 'muted small' }, 'A routine is a list of exercises you do together, like "Push day" or "Legs".'),
        h('a', { class: 'btn btn-primary', href: '#/routine/new' }, 'Create your first routine'))
      : h('ul', { class: `list${reordering ? ' reordering' : ''}` }, routines.map((r, i) => {
        const summary = [
          h('h3', {}, r.name),
          h('p', { class: 'muted small' }, r.exercises.map((e) => e.name).join(' · ') || 'No exercises'),
        ];
        return h('li', { class: 'card routine-card' },
          reordering
            ? h('div', { class: 'routine-info' }, summary)
            : h('a', { class: 'routine-info', href: `#/routine/${r.id}`, 'aria-label': `Edit ${r.name}` }, summary),
          reordering
            ? h('div', { class: 'row-actions' },
              h('button', { class: 'icon-btn', 'aria-label': `Move ${r.name} up`, disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
              h('button', { class: 'icon-btn', 'aria-label': `Move ${r.name} down`, disabled: i === routines.length - 1, onclick: () => move(i, 1) }, '↓'))
            : h('button', { class: 'btn btn-primary', disabled: !r.exercises.length, onclick: () => start(r) }, 'Start'));
      })));
  };
  draw();

  el.append(...[
    h('div', { class: 'view-head' }, h('h1', {}, 'Routines'), headActions),
    active && activeBanner(active),
    listWrap,
    h('button', { class: 'btn btn-ghost btn-block', onclick: () => start(null) }, 'Start an empty workout'),
  ].filter(Boolean));
}

export async function routineEditor(el, ctx, id) {
  const { profile } = ctx;
  const isNew = id === 'new';
  const existing = isNew ? null : await db.get('routines', id);
  if (!isNew && (!existing || existing.profileId !== profile.id)) return ctx.go('#/routines');

  const routine = existing
    ? { ...existing, exercises: existing.exercises.map((e) => ({ name: e.name })) }
    : { id: uid(), profileId: profile.id, name: '', exercises: [], createdAt: Date.now() };
  if (!routine.exercises.length) routine.exercises.push({ name: '' });

  const [sessions, routines] = await Promise.all([finishedSessions(profile.id), routinesFor(profile.id)]);
  const suggestions = [...exerciseNames(sessions, routines).values()];

  const nameInput = h('input', {
    class: 'input input-lg', placeholder: 'Routine name, e.g. Leg day', 'aria-label': 'Routine name',
    value: routine.name, autocomplete: 'off', oninput: (e) => { routine.name = e.target.value; },
  });
  const rows = h('ol', { class: 'ex-edit-list' });

  const move = (i, d) => {
    const [ex] = routine.exercises.splice(i, 1);
    routine.exercises.splice(i + d, 0, ex);
    drawRows();
  };

  const drawRows = () => rows.replaceChildren(...routine.exercises.map((ex, i) => h('li', { class: 'card ex-edit' },
    h('span', { class: 'ex-edit-num', 'aria-hidden': 'true' }, i + 1),
    h('input', {
      class: 'input', placeholder: 'Exercise, e.g. Barbell Squats', 'aria-label': `Exercise ${i + 1}`,
      list: 'exercise-suggestions', autocomplete: 'off', value: ex.name,
      oninput: (e) => { ex.name = e.target.value; },
      onkeydown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addExercise();
        }
      },
    }),
    h('div', { class: 'row-actions' },
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move up', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Move down', disabled: i === routine.exercises.length - 1, onclick: () => move(i, 1) }, '↓'),
      h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': 'Remove exercise',
        onclick: () => { routine.exercises.splice(i, 1); drawRows(); },
      }, '✕')))));
  drawRows();

  function addExercise() {
    routine.exercises.push({ name: '' });
    drawRows();
    rows.lastElementChild.querySelector('input').focus();
  }

  const save = async () => {
    routine.name = routine.name.trim();
    if (!routine.name) {
      toast('Give the routine a name');
      nameInput.focus();
      return;
    }
    routine.exercises = routine.exercises
      .map((e) => ({ name: e.name.trim() }))
      .filter((e) => e.name);
    await db.put('routines', routine);
    toast('Routine saved');
    ctx.go('#/routines');
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete "${existing.name}"?`,
      message: 'Workouts you already logged with this routine stay in your history.',
      okText: 'Delete', okClass: 'btn-danger',
    });
    if (!ok) return;
    await db.del('routines', routine.id);
    toast('Routine deleted');
    ctx.go('#/routines');
  };

  el.append(
    h('a', { class: 'back-link', href: '#/routines' }, '‹ Routines'),
    h('h1', {}, isNew ? 'New routine' : 'Edit routine'),
    nameInput,
    h('h2', { class: 'section-title' }, 'Exercises'),
    h('p', { class: 'muted small' }, 'Just the exercise names. You log sets, reps and weight when you start the routine.'),
    rows,
    h('button', { type: 'button', class: 'btn btn-block', onclick: addExercise }, '+ Add exercise'),
    h('datalist', { id: 'exercise-suggestions' }, suggestions.map((s) => h('option', { value: s }))),
    h('div', { class: 'footer-actions' },
      !isNew && h('button', { class: 'btn btn-danger-ghost', onclick: remove }, 'Delete'),
      h('button', { class: 'btn btn-primary', onclick: save }, 'Save routine')),
  );
}
