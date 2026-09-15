import * as db from './db.js';
import { h, promptDialog, segmented } from './ui.js';
import { uid } from './data.js';
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
    const name = await promptDialog({ title: 'New profile', label: 'Name', okText: 'Create' });
    if (name) await createProfile(name, ctx.profile?.unit ?? 'kg');
  },
};

async function createProfile(name, unit) {
  const profile = { id: uid(), name, unit, createdAt: Date.now() };
  await db.put('profiles', profile);
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
  let unit = 'kg';
  const input = h('input', { class: 'input input-lg', placeholder: 'Your name', 'aria-label': 'Your name', required: true, autocomplete: 'off' });
  return h('div', { class: 'view onboarding' },
    h('h1', {}, 'Workout Log'),
    h('p', { class: 'muted' }, 'Create a profile to get started. Everything is saved on this device. No account needed.'),
    h('form', {
      class: 'stack',
      onsubmit: async (e) => {
        e.preventDefault();
        const name = input.value.trim();
        if (name) await createProfile(name, unit);
      },
    },
    input,
    h('div', { class: 'setting-row' }, h('span', { class: 'setting-label' }, 'Weight unit'),
      segmented([['kg', 'kg'], ['lb', 'lb']], unit, (v) => { unit = v; }, 'Weight unit')),
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
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  navigator.storage?.persist?.().catch(() => {});
  await loadProfiles();
  window.addEventListener('hashchange', render);
  await render();
}

boot();
