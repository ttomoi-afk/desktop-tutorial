// sync.js — real-time sync with a pluggable backend behind one interface.
//   • FirebaseBackend  — real cross-device sync (Firebase Realtime Database)
//   • LocalBackend     — BroadcastChannel + localStorage; powers no-config
//     "local mode" and lets the same board sync across tabs on one device
//     (used to verify the reconciliation logic without a live Firebase project).
//
// A "board" is the id-keyed shape from store.toBoard():
//   { meta, members:{id:{…}}, projects:{id:{…}}, tasks:{id:{…}} }
// Writes are path-scoped ("tasks/t1", or "meta") so two people editing different
// tasks never clobber each other; editing the same task is last-write-wins.

const isEmptyBoard = (b) => !b || (!count(b.tasks) && !count(b.members) && !count(b.projects));
const count = (o) => (o ? Object.keys(o).length : 0);

function applyPath(board, path, value) {
  const parts = path.split('/');
  if (parts.length === 1) {
    if (value === null) delete board[parts[0]]; else board[parts[0]] = value;
    return;
  }
  const [coll, id] = parts;
  if (!board[coll]) board[coll] = {};
  if (value === null) delete board[coll][id]; else board[coll][id] = value;
}

// ── LocalBackend ───────────────────────────────────────────────────────────
function LocalBackend() {
  let key, chan, onSnap, storageHandler;
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } };
  const write = (b) => { try { localStorage.setItem(key, JSON.stringify(b)); } catch (e) {} };
  return {
    name: 'local',
    async start(code, { onSnapshot, onStatus }) {
      key = 'pms:cloud:' + code; onSnap = onSnapshot;
      try { chan = new BroadcastChannel('pms:' + code); chan.onmessage = () => onSnap(read()); } catch (e) { chan = null; }
      storageHandler = (e) => { if (e.key === key) onSnap(read()); };
      window.addEventListener('storage', storageHandler);
      onStatus('synced');
      onSnap(read());
    },
    set(path, value) { const b = read() || {}; applyPath(b, path, value); write(b); if (chan) chan.postMessage(1); },
    setAll(board) { write(board); if (chan) chan.postMessage(1); },
    stop() { try { if (chan) chan.close(); } catch (e) {} window.removeEventListener('storage', storageHandler); },
  };
}

// ── FirebaseBackend ────────────────────────────────────────────────────────
function FirebaseBackend(config) {
  let db, boardRef, unsub, mod;
  return {
    name: 'firebase',
    async start(code, { onSnapshot, onStatus }) {
      onStatus('connecting');
      const [{ initializeApp, getApps }, dbm, authm] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js'),
        import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
      ]);
      mod = dbm;
      const app = getApps().length ? getApps()[0] : initializeApp(config);
      // Anonymous auth so security rules can require `auth != null`. If the
      // provider isn't enabled, continue anyway (open rules still work).
      try { const auth = authm.getAuth(app); if (!auth.currentUser) await authm.signInAnonymously(auth); }
      catch (e) { console.warn('[pms] anonymous auth unavailable:', e && e.code); }
      db = dbm.getDatabase(app);
      boardRef = dbm.ref(db, 'boards/' + code);
      unsub = dbm.onValue(boardRef, (snap) => { onStatus('synced'); onSnapshot(snap.val()); },
        (err) => { console.error('[pms] db error', err); onStatus('error', err); });
    },
    setAll(board) { if (boardRef) mod.set(boardRef, board); },
    stop() { try { if (unsub) unsub(); } catch (e) {} },
    _child(code, path) { return mod.ref(db, 'boards/' + code + '/' + path); },
    _set(ref, value) { return value === null ? mod.remove(ref) : mod.set(ref, value); },
  };
}

// ── sync manager (what the app talks to) ───────────────────────────────────
export function createSync({ store, onStatus }) {
  let backend = null, mode = null, code = null, seeded = false, status = 'idle';

  function setStatus(s, extra) { status = s; onStatus && onStatus(s, extra); }

  const api = {
    get mode() { return mode; },
    get code() { return code; },
    get status() { return status; },

    async connect({ mode: m, code: c, config }) {
      await api.disconnect();
      mode = m; code = c || 'local'; seeded = false;
      store.useCache(code); // per-board local cache for offline reloads
      backend = (m === 'firebase') ? FirebaseBackend(config) : LocalBackend();
      await backend.start(code, {
        onSnapshot: (board) => {
          if (!seeded) {
            seeded = true;
            if (isEmptyBoard(board)) { backend.setAll(store.toBoard()); return; } // populate a fresh board
          }
          if (!isEmptyBoard(board)) store.setFromBoard(board);
        },
        onStatus: (s, extra) => setStatus(s, extra),
      });
      return status;
    },

    push(patch) {
      if (!backend || !patch) return;
      try {
        if (backend.name === 'firebase') backend._set(backend._child(code, patch.path), patch.value);
        else backend.set(patch.path, patch.value);
      } catch (e) { console.error('[pms] push failed', e); }
    },

    async disconnect() {
      if (backend) { try { backend.stop(); } catch (e) {} backend = null; }
      mode = null; seeded = false; setStatus('idle');
    },
  };
  return api;
}
