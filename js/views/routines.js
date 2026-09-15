import * as db from '../db.js';
import { h, confirmDialog, openDialog, promptDialog, toast } from '../ui.js';
import { uid, routinesFor, activeSession, startSession, finishedSessions, exerciseNames } from '../data.js';
import { extractCode, shareRoutine } from '../share.js';

// Icon glyphs (static markup, no user data).
const SHARE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7.5 7.5 12 3l4.5 4.5"/><path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6a.8.8 0 0 0 1.23.67l10.2-6.8a.8.8 0 0 0 0-1.34L9.23 4.53A.8.8 0 0 0 8 5.2z"/></svg>';
const GRIP_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';

function iconButton(props, svg) {
  const btn = h('button', props);
  btn.innerHTML = svg;
  return btn;
}

const shareButton = (routine) => iconButton({
  class: 'btn btn-icon', 'aria-label': `Share ${routine.name}`, title: 'Share',
  disabled: !routine.exercises.length, onclick: () => shareRoutine(routine),
}, SHARE_ICON);

const LIST_GAP = 10; // keep in sync with .list gap in styles.css

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

  const listWrap = h('div');

  const moveTo = async (from, to) => {
    const [r] = routines.splice(from, 1);
    routines.splice(to, 0, r);
    routines.forEach((x, idx) => { x.order = idx; });
    draw();
    await Promise.all(routines.map((x) => db.put('routines', x)));
  };

  // Press-and-drag on the grip. Other cards slide aside to preview the drop position.
  const startDrag = (ev, handle, from) => {
    if (ev.button !== 0) return;
    // preventDefault stops text selection and scrolling, but also the default focus, so focus explicitly
    // (lets arrow keys reorder right after a tap).
    ev.preventDefault();
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(ev.pointerId);
    const items = [...listWrap.querySelectorAll('.routine-card')];
    const rects = items.map((item) => item.getBoundingClientRect());
    const card = items[from];
    const shift = rects[from].height + LIST_GAP;
    const startY = ev.clientY;
    let to = from;
    card.classList.add('dragging');

    const onMove = (e) => {
      const dy = e.clientY - startY;
      card.style.transform = `translateY(${dy}px)`;
      const center = rects[from].top + rects[from].height / 2 + dy;
      to = from;
      rects.forEach((r, j) => {
        const mid = r.top + r.height / 2;
        if (j < from && center < mid) to = Math.min(to, j);
        if (j > from && center > mid) to = Math.max(to, j);
      });
      items.forEach((item, j) => {
        if (j === from) return;
        const offset = from < j && j <= to ? -shift : to <= j && j < from ? shift : 0;
        item.style.transform = offset ? `translateY(${offset}px)` : '';
      });
    };
    const onEnd = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onEnd);
      handle.removeEventListener('pointercancel', onEnd);
      items.forEach((item) => { item.style.transform = ''; });
      card.classList.remove('dragging');
      if (to !== from) moveTo(from, to);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onEnd);
    handle.addEventListener('pointercancel', onEnd);
  };

  const draw = () => {
    const canReorder = routines.length > 1;
    listWrap.replaceChildren(routines.length === 0
      ? h('div', { class: 'empty' },
        h('p', {}, h('strong', {}, 'No routines yet')),
        h('p', { class: 'muted small' }, 'A routine is a list of exercises you do together, like "Push day" or "Legs".'),
        h('a', { class: 'btn btn-primary', href: '#/routine/new' }, 'Create your first routine'))
      : h('ul', { class: 'list' }, routines.map((r, i) => {
        const grip = canReorder && iconButton({
          class: 'drag-handle', 'aria-label': `Reorder ${r.name}. Drag, or use the up and down arrow keys.`, title: 'Drag to reorder',
          onkeydown: (e) => {
            const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
            if (to < 0 || to >= routines.length) return;
            e.preventDefault();
            moveTo(i, to);
            listWrap.querySelectorAll('.drag-handle')[to]?.focus();
          },
        }, GRIP_ICON);
        if (grip) grip.addEventListener('pointerdown', (e) => startDrag(e, grip, i));
        return h('li', { class: `card routine-card${canReorder ? ' has-handle' : ''}` },
          grip,
          h('a', { class: 'routine-info', href: `#/routine/${r.id}`, 'aria-label': `Edit ${r.name}` },
            h('h3', {}, r.name),
            h('p', { class: 'muted small' }, r.exercises.map((e) => e.name).join(' · ') || 'No exercises')),
          h('div', { class: 'routine-actions' },
            shareButton(r),
            iconButton({
              class: 'btn btn-primary btn-icon', 'aria-label': `Start ${r.name}`, title: 'Start workout',
              disabled: !r.exercises.length, onclick: () => start(r),
            }, PLAY_ICON)));
      })));
  };
  draw();

  el.append(...[
    h('div', { class: 'view-head' }, h('h1', {}, 'Routines'),
      h('a', { class: 'btn btn-primary', href: '#/routine/new' }, '+ New')),
    active && activeBanner(active),
    listWrap,
    h('button', { class: 'btn btn-ghost btn-block', onclick: () => start(null) }, 'Start an empty workout'),
    h('button', {
      class: 'btn btn-ghost btn-block',
      onclick: async () => {
        const text = await promptDialog({ title: 'Import a shared routine', label: 'Paste the link', okText: 'Continue' });
        if (!text) return;
        const code = extractCode(text);
        if (code) ctx.go(`#/import/${code}`);
        else toast('That doesn\'t look like a routine link');
      },
    }, 'Import a shared routine'),
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
    ...(isNew ? [] : [h('button', { class: 'btn btn-text-danger btn-block danger-zone', onclick: remove }, 'Delete routine')]),
    h('div', { class: 'footer-actions' },
      h('button', { class: 'btn btn-primary', onclick: save }, 'Save routine')),
  );
}
