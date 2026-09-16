import * as db from '../db.js';
import { h, confirmDialog, promptDialog, toast } from '../ui.js';
import { exportBackup, readBackupFile } from '../backup.js';
import { shareApp } from '../share.js';

export async function settingsView(el, ctx) {
  const { profile } = ctx;
  const [routines, sessions] = await Promise.all([
    db.byProfile('routines', profile.id),
    db.byProfile('sessions', profile.id),
  ]);
  const workouts = sessions.filter((s) => s.finishedAt).length;

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

  // Throws away the offline copy and re-registers, so the next load comes from the server.
  // Workouts live in IndexedDB and are untouched.
  const update = async () => {
    toast('Updating…');
    try {
      await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      await (await navigator.serviceWorker?.getRegistration())?.unregister();
    } catch {
      // fall through to the reload either way
    }
    setTimeout(() => location.reload(), 600);
  };

  const checkForUpdates = async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (!reg) {
      toast('Offline mode is not set up on this device');
      return;
    }
    toast('Checking…');
    try {
      await reg.update();
    } catch {
      toast('Could not reach the server');
      return;
    }
    setTimeout(() => {
      // A new version takes over on its own; the app reloads when it does.
      toast(reg.installing || reg.waiting ? 'Update found, installing…' : 'You have the latest version');
    }, 1200);
  };

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
      h('button', { class: 'btn btn-primary btn-block', onclick: update }, 'Update'),
      h('button', { class: 'btn btn-block', onclick: checkForUpdates }, 'Check for updates'),
      h('button', { class: 'btn btn-block', onclick: () => shareApp() }, 'Share')),
  );
}
