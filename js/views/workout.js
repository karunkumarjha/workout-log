import * as db from '../db.js';
import { h, confirmDialog, openDialog, promptDialog, segmented, toast } from '../ui.js';
import { exKey, fmtDate, todayISO, getSession, finishedSessions, lastByExercise, exerciseNames, routinesFor, newEntry, DEFAULT_REPS } from '../data.js';
import { fmtSets, fromKg, toKg, round1, weightStep, unitLabel } from '../units.js';

function stepper({ label, value, step, onchange }) {
  const input = h('input', {
    class: 'stepper-input', type: 'number', inputmode: 'decimal', min: '0', step: 'any', value, 'aria-label': label,
    oninput: () => {
      const v = Number(input.value);
      if (input.value !== '' && Number.isFinite(v) && v >= 0) {
        value = v;
        onchange(v);
      }
    },
    onchange: () => { input.value = value; },
    onfocus: () => input.select(),
  });
  const bump = (d) => {
    value = Math.max(0, round1(value + d));
    input.value = value;
    onchange(value);
  };
  return h('div', { class: 'stepper-row' },
    h('button', { type: 'button', class: 'step-btn', 'aria-label': `Less: ${label}`, onclick: () => bump(-step) }, '−'),
    input,
    h('button', { type: 'button', class: 'step-btn', 'aria-label': `More: ${label}`, onclick: () => bump(step) }, '+'));
}

const hasWeight = (s) => s.weightKg > 0;

export async function workoutView(el, ctx, id) {
  const { profile } = ctx;
  const session = await getSession(id);
  if (!session || session.profileId !== profile.id) return ctx.go('#/routines');

  const finished = Boolean(session.finishedAt);
  const [history, routines] = await Promise.all([finishedSessions(profile.id), routinesFor(profile.id)]);
  const earlier = history.filter((s) => s.id !== session.id
    && (!finished || s.date < session.date || (s.date === session.date && s.startedAt < session.startedAt)));
  const last = lastByExercise(earlier);
  const suggestions = [...exerciseNames(history, routines).values()];
  const save = () => db.put('sessions', session);

  const progress = h('p', { class: 'muted' });
  const updateProgress = () => {
    const sets = session.entries.flatMap((e) => e.sets);
    const n = session.entries.length;
    progress.textContent = finished
      ? `${n} exercise${n === 1 ? '' : 's'} · ${sets.length} set${sets.length === 1 ? '' : 's'}`
      : `${sets.filter((s) => s.done).length} of ${sets.length} sets done`;
  };

  // Highlight sets whose weight is still 0 and bring the first into view.
  const rowFor = new WeakMap();
  const flagMissing = (sets) => {
    let first = null;
    for (const s of sets) {
      const row = rowFor.get(s);
      if (!row) continue;
      row.classList.add('invalid');
      first ??= row;
    }
    first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(sets.length === 1
      ? 'Enter a weight above 0 for the highlighted set'
      : `Enter a weight above 0 for the ${sets.length} highlighted sets`);
  };

  const list = h('div', { class: 'ex-list' });

  const card = (e) => {
    const prev = last.get(exKey(e.exercise));
    const setHead = h('div', { class: 'set-head', 'aria-hidden': 'true' });
    const rows = h('div', { class: 'set-rows' });
    const actions = h('div', { class: 'set-actions' });

    const setRow = (s, i) => {
      const { unit } = e;
      const row = h('div', { class: `set-row${s.done && !finished ? ' done' : ''}` },
        h('span', { class: 'set-num' }, i + 1),
        stepper({ label: `${e.exercise} set ${i + 1} reps`, value: s.reps, step: 1, onchange: (v) => { s.reps = v; save(); } }),
        stepper({
          label: `${e.exercise} set ${i + 1} weight (${unitLabel(unit)})`, value: round1(fromKg(s.weightKg, unit)), step: weightStep(unit),
          onchange: (v) => {
            s.weightKg = toKg(v, unit);
            if (hasWeight(s)) row.classList.remove('invalid');
            save();
          },
        }));
      rowFor.set(s, row);
      if (!finished) {
        const check = h('button', {
          class: 'set-check', 'aria-label': `${e.exercise} set ${i + 1} done`, 'aria-pressed': String(Boolean(s.done)),
          onclick: () => {
            if (!s.done && !hasWeight(s)) {
              flagMissing([s]);
              return;
            }
            s.done = !s.done;
            row.classList.toggle('done', s.done);
            check.setAttribute('aria-pressed', String(s.done));
            updateProgress();
            save();
          },
        }, '✓');
        row.append(check);
      }
      return row;
    };

    const drawSets = () => {
      setHead.replaceChildren(...[
        h('span', {}, 'Set'), h('span', {}, 'Reps'), h('span', {}, `Weight (${unitLabel(e.unit)})`), !finished && h('span', {}),
      ].filter(Boolean));
      rows.replaceChildren(...e.sets.map(setRow));
      actions.replaceChildren(
        h('button', {
          class: 'btn',
          onclick: () => {
            const p = e.sets.at(-1);
            e.sets.push({ reps: p?.reps ?? DEFAULT_REPS, weightKg: p?.weightKg ?? 0, done: finished });
            drawSets();
            updateProgress();
            save();
          },
        }, '+ Add set'),
        h('button', {
          class: 'btn btn-ghost', disabled: e.sets.length <= 1,
          onclick: () => {
            e.sets.pop();
            drawSets();
            updateProgress();
            save();
          },
        }, 'Remove last set'));
    };
    drawSets();

    // Switching unit keeps the numbers as typed (a "25" dumbbell stays 25) and changes what they mean.
    const unitToggle = segmented([['kg', 'kg'], ['lb', 'lbs']], e.unit, (next) => {
      for (const s of e.sets) s.weightKg = toKg(round1(fromKg(s.weightKg, e.unit)), next);
      e.unit = next;
      drawSets();
      save();
    }, `${e.exercise} weight unit`);
    unitToggle.classList.add('unit-toggle');

    return h('section', { class: `card ex-card${finished ? ' finished' : ''}` },
      h('div', { class: 'ex-card-head' },
        h('div', { class: 'ex-title' },
          h('div', { class: 'ex-name-row' }, h('h3', {}, e.exercise), unitToggle),
          h('p', { class: 'muted small' }, prev ? `Last (${fmtDate(prev.date)}): ${fmtSets(prev.sets, prev.unit)}` : 'First time logging this')),
        h('button', {
          class: 'icon-btn', 'aria-label': `Remove ${e.exercise}`,
          onclick: async () => {
            const ok = await confirmDialog({ title: `Remove ${e.exercise}?`, message: 'It will be left out of this workout.', okText: 'Remove', okClass: 'btn-danger' });
            if (!ok) return;
            session.entries.splice(session.entries.indexOf(e), 1);
            await save();
            draw();
          },
        }, '✕')),
      setHead,
      rows,
      actions);
  };

  const draw = () => {
    list.replaceChildren(...session.entries.map(card));
    updateProgress();
  };
  draw();

  const addExercise = async () => {
    const name = await promptDialog({ title: 'Add exercise', label: 'Exercise name', okText: 'Add', suggestions });
    if (!name) return;
    const entry = newEntry(name, last.get(exKey(name)));
    if (finished) entry.sets.forEach((s) => { s.done = true; });
    session.entries.push(entry);
    await save();
    draw();
    list.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const finish = async () => {
    const sets = session.entries.flatMap((e) => e.sets);
    if (!sets.length) {
      toast('Add an exercise first');
      return;
    }
    const done = sets.filter((s) => s.done).length;
    let onlyDone = false;
    if (done < sets.length) {
      const left = sets.length - done;
      const choice = await openDialog({
        title: 'Finish workout?',
        message: done
          ? `${left} set${left === 1 ? ' is' : 's are'} not ticked.`
          : 'No sets are ticked yet.',
        okText: 'Log all sets',
        extra: done ? [{ value: 'done', label: 'Only ticked sets' }] : [],
        cancelText: 'Keep going',
      });
      if (!choice) return;
      onlyDone = choice === 'done';
    }
    const missing = (onlyDone ? sets.filter((s) => s.done) : sets).filter((s) => !hasWeight(s));
    if (missing.length) {
      flagMissing(missing);
      return;
    }
    if (onlyDone) {
      session.entries = session.entries
        .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) }))
        .filter((e) => e.sets.length);
    } else {
      sets.forEach((s) => { s.done = true; });
    }
    session.finishedAt = Date.now();
    await save();
    toast('Workout saved 💪');
    ctx.go('#/history');
  };

  const doneEditing = () => {
    const missing = session.entries.flatMap((e) => e.sets).filter((s) => !hasWeight(s));
    if (missing.length) {
      flagMissing(missing);
      return;
    }
    toast('Changes saved');
    ctx.go('#/history');
  };

  const discard = async () => {
    const ok = await confirmDialog({
      title: finished ? 'Delete this workout?' : 'Discard this workout?',
      message: 'This cannot be undone.',
      okText: finished ? 'Delete' : 'Discard', okClass: 'btn-danger',
    });
    if (!ok) return;
    await db.del('sessions', session.id);
    toast(finished ? 'Workout deleted' : 'Workout discarded');
    ctx.go(finished ? '#/history' : '#/routines');
  };

  el.append(...[
    h('div', { class: 'workout-head' },
      h('a', { class: 'back-link', href: finished ? '#/history' : '#/routines' }, finished ? '‹ History' : '‹ Routines'),
      h('h1', {}, session.routineName),
      h('div', { class: 'workout-meta' },
        h('label', { class: 'field' },
          h('span', { class: 'field-label' }, 'Date'),
          h('input', {
            class: 'input', type: 'date', value: session.date, max: todayISO(),
            onchange: async (e) => {
              if (!e.target.value) return;
              session.date = e.target.value;
              await save();
            },
          })),
        !finished && h('p', { class: 'muted small' },
          `Started ${new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`)),
      progress),
    session.entries.length === 0 && h('p', { class: 'muted' }, 'No exercises yet. Add one below.'),
    list,
    h('button', { class: 'btn btn-block', onclick: addExercise }, '+ Add exercise'),
    h('div', { class: 'footer-actions' },
      h('button', { class: 'btn btn-danger-ghost', onclick: discard }, finished ? 'Delete' : 'Discard'),
      finished
        ? h('button', { class: 'btn btn-primary', onclick: doneEditing }, 'Done')
        : h('button', { class: 'btn btn-primary', onclick: finish }, 'Finish workout')),
  ].filter(Boolean));
}
