// Thin promise wrapper over IndexedDB. All data lives on this device.
const DB_NAME = 'workout-log';
const DB_VERSION = 1;
export const STORES = ['profiles', 'routines', 'sessions', 'meta'];

let dbPromise;

export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        db.createObjectStore('profiles', { keyPath: 'id' });
        const routines = db.createObjectStore('routines', { keyPath: 'id' });
        routines.createIndex('profileId', 'profileId');
        const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('profileId', 'profileId');
        sessions.createIndex('profileDate', ['profileId', 'date']);
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbPromise;
}

const req = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

const done = (t) => new Promise((resolve, reject) => {
  t.oncomplete = () => resolve();
  t.onerror = t.onabort = () => reject(t.error);
});

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export const get = async (s, key) => req((await store(s)).get(key));
export const getAll = async (s) => req((await store(s)).getAll());
export const byProfile = async (s, profileId) => req((await store(s)).index('profileId').getAll(profileId));
export const del = async (s, key) => req((await store(s, 'readwrite')).delete(key));
export async function put(s, value) {
  await req((await store(s, 'readwrite')).put(value));
  return value;
}

export async function getMeta(key) {
  return (await get('meta', key))?.value;
}
export const setMeta = (key, value) => put('meta', { key, value });

export async function deleteProfile(profileId) {
  const db = await openDB();
  const t = db.transaction(['profiles', 'routines', 'sessions'], 'readwrite');
  t.objectStore('profiles').delete(profileId);
  for (const name of ['routines', 'sessions']) {
    const os = t.objectStore(name);
    os.index('profileId').openKeyCursor(IDBKeyRange.only(profileId)).onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        os.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
  }
  return done(t);
}

export async function exportAll() {
  const out = { app: 'workout-log', version: DB_VERSION, exportedAt: new Date().toISOString() };
  for (const s of STORES) out[s] = await getAll(s);
  return out;
}

// Replaces everything on this device with the backup's contents.
export async function importAll(data) {
  if (!data || data.app !== 'workout-log' || !Array.isArray(data.profiles)) {
    throw new Error('This file is not a Workout Log backup.');
  }
  const db = await openDB();
  const t = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const os = t.objectStore(s);
    os.clear();
    for (const v of data[s] || []) os.put(v);
  }
  return done(t);
}
