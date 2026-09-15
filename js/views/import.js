import * as db from '../db.js';
import { h, toast } from '../ui.js';
import { uid, exKey, routinesFor } from '../data.js';
import { decodeRoutine } from '../share.js';

export async function importView(el, ctx, code) {
  const { profile } = ctx;
  const shared = decodeRoutine(code);

  el.append(
    h('a', { class: 'back-link', href: '#/routines' }, '‹ Routines'),
    h('h1', {}, 'Shared routine'),
  );

  if (!shared) {
    el.append(h('div', { class: 'empty' },
      h('p', {}, h('strong', {}, 'This link doesn\'t work')),
      h('p', { class: 'muted small' }, 'It may have been cut off when it was copied. Ask for the link again.'),
      h('a', { class: 'btn btn-primary', href: '#/routines' }, 'Go to routines')));
    return;
  }

  const save = async () => {
    const taken = new Set((await routinesFor(profile.id)).map((r) => exKey(r.name)));
    let name = shared.name;
    for (let n = 2; taken.has(exKey(name)); n++) name = `${shared.name} (${n})`;
    await db.put('routines', {
      id: uid(),
      profileId: profile.id,
      name,
      exercises: shared.exercises.map((e) => ({ name: e })),
      createdAt: Date.now(),
    });
    toast(`Added "${name}"`);
    ctx.go('#/routines');
  };

  el.append(
    h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, shared.name),
      h('ol', { class: 'shared-exercises' }, shared.exercises.map((e) => h('li', {}, e)))),
    h('p', { class: 'muted small' },
      `This will be added to ${profile.name}'s routines. To add it for someone else, switch profile at the top first.`),
    h('div', { class: 'footer-actions' },
      h('a', { class: 'btn btn-ghost', href: '#/routines' }, 'Cancel'),
      h('button', { class: 'btn btn-primary', onclick: save }, `Import to ${profile.name}`)),
  );
}
