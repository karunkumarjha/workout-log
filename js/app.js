import * as db from './db.js';
import { h, openDialog } from './ui.js';
import { uid, routinesFor } from './data.js';
import { routinesList, routineEditor } from './views/routines.js';
import { workoutView } from './views/workout.js';
import { historyView } from './views/history.js';
import { progressView } from './views/progress.js';
import { settingsView } from './views/settings.js';
import { importView } from './views/import.js';

const main = document.getElementById('main');
const bar = document.getElementById('profile-bar');
const tabs = document.getElementById('tabs');

const TABS = [
  { hash: '#/routines', label: 'Routines', icon: '📋' },
  { hash: '#/history', label: 'History', icon: '🗓️' },
  { hash: '#/progress', label: 'Progress', icon: '📈' },
  { hash: '#/settings', label: 'Settings', icon: '⚙️' },
];

// [pattern, view, highlighted tab]
const ROUTES = [
  [/^#\/routines$/, routinesList, '#/routines'],
  [/^#\/routine\/([\w-]+)$/, routineEditor, '#/routines'],
  // No trailing $: tolerate text glued onto shared links; decodeRoutine trims it.
  [/^#\/import\/([A-Za-z0-9_-]+)/, importView, '#/routines'],
  [/^#\/workout\/([\w-]+)$/, workoutView, '#/routines'],
  [/^#\/history$/, historyView, '#/history'],
  [/^#\/progress(?:\/(.+))?$/, progressView, '#/progress'],
  [/^#\/settings$/, settingsView, '#/settings'],
];

const ctx = {
  profile: null,
  profiles: [],
  go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  async refresh() {
    await loadProfiles();
    await render();
  },
  async switchProfile(id) {
    await db.setMeta('activeProfileId', id);
    await ctx.refresh();
  },
  async addProfile() {
    const source = ctx.profile;
    const routines = source ? await routinesFor(source.id) : [];
    const input = h('input', { class: 'input', placeholder: 'Name', 'aria-label': 'Name', required: true, autocomplete: 'off' });
    const copy = h('input', { type: 'checkbox', class: 'checkbox' });
    const body = h('div', { class: 'dialog-body stack' },
      input,
      routines.length > 0 && h('label', { class: 'check-row' },
        copy,
        h('span', {}, `Copy ${source.name}'s routines (${routines.length})`)));
    const result = openDialog({ title: 'New profile', body, okText: 'Create' });
    input.focus();
    if ((await result) !== 'ok') return;
    const name = input.value.trim();
    if (name) await createProfile(name, source?.unit ?? 'kg', copy.checked ? routines : []);
  },
};

// Copied routines get new ids and keep their order; workout history is never copied.
async function createProfile(name, unit, routinesToCopy = []) {
  const profile = { id: uid(), name, unit, createdAt: Date.now() };
  await db.put('profiles', profile);
  await Promise.all(routinesToCopy.map((r, i) => db.put('routines', {
    id: uid(),
    profileId: profile.id,
    name: r.name,
    exercises: r.exercises.map((e) => ({ name: e.name })),
    order: i,
    createdAt: Date.now(),
  })));
  await ctx.switchProfile(profile.id);
}

async function loadProfiles() {
  ctx.profiles = (await db.getAll('profiles')).sort((a, b) => a.createdAt - b.createdAt);
  const activeId = await db.getMeta('activeProfileId');
  ctx.profile = ctx.profiles.find((p) => p.id === activeId) || ctx.profiles[0] || null;
}

const initial = (name) => [...name.trim()][0]?.toUpperCase() ?? '?';

function renderProfileBar() {
  bar.replaceChildren(h('div', { class: 'chips', role: 'group', 'aria-label': 'Profiles' },
    ctx.profiles.map((p) => {
      const active = p.id === ctx.profile.id;
      return h('button', {
        class: `chip${active ? ' active' : ''}`,
        'aria-pressed': String(active),
        onclick: () => !active && ctx.switchProfile(p.id),
      }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, initial(p.name)), p.name);
    }),
    h('button', { class: 'chip chip-add', 'aria-label': 'Add profile', onclick: ctx.addProfile }, '+')));
}

function renderTabs(active) {
  tabs.replaceChildren(...TABS.map((t) => h('a', {
    href: t.hash,
    class: `tab${t.hash === active ? ' active' : ''}`,
    'aria-current': t.hash === active ? 'page' : null,
  }, h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, t.icon), h('span', {}, t.label))));
}

function onboarding() {
  const input = h('input', { class: 'input input-lg', placeholder: 'Your name', 'aria-label': 'Your name', required: true, autocomplete: 'off' });
  return h('div', { class: 'view onboarding' },
    h('h1', {}, 'Workout Log'),
    h('p', { class: 'muted' }, 'Create a profile to get started. Everything is saved on this device. No account needed.'),
    h('form', {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        const name = input.value.trim();
        if (name) await createProfile(name, 'kg');
      },
    },
    input,
    h('button', { class: 'btn btn-primary btn-block' }, 'Create profile')));
}

let renderToken = 0;
let lastHash = null;

async function render() {
  const token = ++renderToken;
  if (!ctx.profile) {
    bar.hidden = true;
    tabs.hidden = true;
    main.replaceChildren(onboarding());
    return;
  }
  bar.hidden = false;
  tabs.hidden = false;
  renderProfileBar();

  const hash = location.hash || '#/routines';
  const route = ROUTES.find(([re]) => re.test(hash));
  if (!route) {
    location.replace('#/routines');
    return;
  }
  const [re, view, tab] = route;
  const params = hash.match(re).slice(1).map((p) => p && decodeURIComponent(p));
  renderTabs(tab);

  const el = h('div', { class: 'view' });
  try {
    await view(el, ctx, ...params);
  } catch (err) {
    console.error(err);
    el.replaceChildren(h('p', { class: 'error' }, `Something went wrong: ${err.message}`));
  }
  if (token !== renderToken) return;
  main.replaceChildren(el);
  if (hash !== lastHash) window.scrollTo(0, 0);
  lastHash = hash;
}

async function boot() {
  if ('serviceWorker' in navigator) {
    // A new service worker claims the page as soon as it installs; reload once so the
    // update applies on this launch instead of the next one.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  navigator.storage?.persist?.().catch(() => {});
  await loadProfiles();
  window.addEventListener('hashchange', render);
  await render();
}

boot();
