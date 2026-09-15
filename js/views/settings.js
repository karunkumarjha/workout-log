import * as db from '../db.js';
import { h, confirmDialog, promptDialog, toast } from '../ui.js';
import { exportBackup, readBackupFile } from '../backup.js';

export async function settingsView(el, ctx) {
  const { profile } = ctx;
  const [routines, sessions, persisted] = await Promise.all([
    db.byProfile('routines', profile.id),
    db.byProfile('sessions', profile.id),
    navigator.storage?.persisted?.() ?? false,
  ]);
  const workouts = sessions.filter((s) => s.finishedAt).length;
  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  const rename = async () => {
    const name = await promptDialog({ title: 'Rename profile', label: 'Name', value: profile.name, okText: 'Save' });
    if (!name) return;
    await db.put('profiles', { ...profile, name });
    await ctx.refresh();
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: `Delete ${profile.name}?`,
      message: `This permanently deletes ${profile.name}'s ${routines.length} routine${routines.length === 1 ? '' : 's'} and ${workouts} workout${workouts === 1 ? '' : 's'} from this device.`,
      okText: 'Delete profile', okClass: 'btn-danger',
    });
    if (!ok) return;
    await db.deleteProfile(profile.id);
    toast('Profile deleted');
    await ctx.refresh();
    ctx.go('#/routines');
  };

  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const data = await readBackupFile(file);
        const ok = await confirmDialog({
          title: 'Replace all data?',
          message: `Everything on this device will be replaced with the backup: ${data.profiles.length} profile${data.profiles.length === 1 ? '' : 's'} and ${(data.sessions || []).filter((s) => s.finishedAt).length} workouts.`,
          okText: 'Replace', okClass: 'btn-danger',
        });
        if (!ok) return;
        await db.importAll(data);
        toast('Backup restored');
        await ctx.refresh();
      } catch (err) {
        toast(err.message);
      }
    },
  });

  el.append(
    h('div', { class: 'view-head' }, h('h1', {}, 'Settings')),
    h('section', { class: 'card stack' },
      h('div', { class: 'setting-row' },
        h('div', {},
          h('div', { class: 'setting-label' }, profile.name),
          h('div', { class: 'muted small' }, `${routines.length} routine${routines.length === 1 ? '' : 's'} · ${workouts} workout${workouts === 1 ? '' : 's'}`)),
        h('button', { class: 'btn', onclick: rename }, 'Rename')),
      h('button', { class: 'btn btn-danger-ghost btn-block', onclick: remove }, 'Delete this profile')),
    h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, 'Backup'),
      h('p', { class: 'muted small' }, 'Your data is stored only on this device. Export a backup now and then, or to move to a new phone. The backup includes every profile.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-primary', onclick: () => exportBackup().catch((err) => toast(err.message)) }, 'Export backup'),
        h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Import backup')),
      fileInput),
    h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, 'Offline & storage'),
      h('p', { class: 'muted small' }, installed
        ? 'Installed. The app works without internet.'
        : 'Install the app to use it offline: on iPhone, tap Share → Add to Home Screen. On Android, open the ⋮ menu → Install app.'),
      h('p', { class: 'muted small' }, persisted
        ? 'Storage is protected. The browser won\'t clear your data on its own.'
        : 'Storage isn\'t marked as protected yet. Installing the app helps keep your data safe.')),
  );
}
