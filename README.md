# Workout Log

An offline workout tracker for your phone. No account, no server, no internet needed after install.

- **Profiles:** tap a name at the top to switch. Each profile has its own routines and history.
- **Routines:** a name and a list of exercise names.
- **Workouts:** start a routine and each exercise gets 3 sets of 12 reps by default. Every set has its own reps and weight (which must be above 0), and you can add or remove sets. Each exercise has its own kg/lbs toggle (kg by default), remembered for next time. Values carry over set-by-set from last time. Tick sets as you go; progress saves automatically.
- **Progress:** pick an exercise to see heaviest set, volume, estimated 1RM or total reps over time.
- **Sharing routines:** open a routine and tap Share to send a link. The routine is encoded in the link itself (after the `#`, which is never sent to a server). Opening the link shows a preview with an Import button. On iPhone, a link tapped in Messages opens in Safari, which keeps its data separate from the home-screen app, so tap the import button (tray with a down arrow, top of Routines) and paste the link inside the app instead.
- **Managing routines:** drag the ⠿ handle to reorder, long-press a routine to delete it. When adding a profile you can copy the current profile's routines (not its history).
- **Backup:** Settings → Export/Import a JSON file.

All data is stored in the browser's IndexedDB on the device. Plain HTML/CSS/JS with no build step and no dependencies.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Put it on your phone

A service worker (needed for offline use) only runs over HTTPS, so host the static files once. GitHub Pages is free:

1. Create a GitHub repo and push this folder to it.
2. Go to repo **Settings → Pages**, set Source to "Deploy from a branch", then pick `main` / root.
3. Open `https://<you>.github.io/<repo>/` on your phone.
   - **iPhone (Safari):** Share → **Add to Home Screen**.
   - **Android (Chrome):** ⋮ menu → **Install app**.
4. Launch it from the home screen. From then on it works in airplane mode.

The hosting only delivers the app files. Your workout data never leaves the phone.

**Keep backups.** Browser data is tied to the device, and deleting the app from the home screen can erase it. Use Settings → Export backup now and then.

## Updating the app

After changing files, bump `CACHE` in `sw.js` (e.g. `workout-log-v2`) and add any new files to `FILES`. Phones pick up the update on the next launch or two.
