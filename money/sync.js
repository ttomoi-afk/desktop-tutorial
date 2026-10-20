// sync.js — 帳簿のリアルタイム同期（pms/sync.js と同じ設計）。
//   • FirebaseBackend — Firebase Realtime Database（端末をまたいで共有）
//   • LocalBackend    — localStorage + BroadcastChannel（未設定時のローカルモード）
// 帳簿は store.toBook() の形: { meta, settings, entries:{id:{…}} }
// 書き込みはパス単位（"entries/e1", "settings", "meta"）なので、別の明細を
// 同時に編集しても互いに消さない。同じ明細は後勝ち。
// Firebase 側のパスは money/<共有コード>（pms の boards/ とは分ける）。

const ROOT = 'money';
const count = (o) => (o ? Object.keys(o).length : 0);
const isEmptyBook = (b) => !b || !count(b.entries);

function applyPath(book, path, value) {
  const parts = path.split('/');
  if (parts.length === 1) { if (value === null) delete book[parts[0]]; else book[parts[0]] = value; return; }
  const [coll, id] = parts;
  if (!book[coll]) book[coll] = {};
  if (value === null) delete book[coll][id]; else book[coll][id] = value;
}

function LocalBackend() {
  let key, chan, onSnap, storageHandler;
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } };
  const write = (b) => { try { localStorage.setItem(key, JSON.stringify(b)); } catch (e) {} };
  return {
    name: 'local',
    async start(code, { onSnapshot, onStatus }) {
      key = 'money:cloud:' + code; onSnap = onSnapshot;
      try { chan = new BroadcastChannel('money:' + code); chan.onmessage = () => onSnap(read()); } catch (e) { chan = null; }
      storageHandler = (e) => { if (e.key === key) onSnap(read()); };
      window.addEventListener('storage', storageHandler);
      onStatus('synced');
      onSnap(read());
    },
    set(path, value) { const b = read() || {}; applyPath(b, path, value); write(b); if (chan) chan.postMessage(1); },
    setAll(book) { write(book); if (chan) chan.postMessage(1); },
    stop() { try { if (chan) chan.close(); } catch (e) {} window.removeEventListener('storage', storageHandler); },
  };
}

function FirebaseBackend(config) {
  let db, bookRef, unsub, mod, code;
  return {
    name: 'firebase',
    async start(c, { onSnapshot, onStatus }) {
      code = c;
      onStatus('connecting');
      const [{ initializeApp, getApps }, dbm, authm] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js'),
        import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
      ]);
      mod = dbm;
      const app = getApps().length ? getApps()[0] : initializeApp(config);
      try { const auth = authm.getAuth(app); if (!auth.currentUser) await authm.signInAnonymously(auth); }
      catch (e) { console.warn('[money] anonymous auth unavailable:', e && e.code); }
      db = dbm.getDatabase(app);
      bookRef = dbm.ref(db, ROOT + '/' + code);
      unsub = dbm.onValue(bookRef, (snap) => { onStatus('synced'); onSnapshot(snap.val()); },
        (err) => { console.error('[money] db error', err); onStatus('error', err); });
    },
    set(path, value) {
      const r = mod.ref(db, ROOT + '/' + code + '/' + path);
      return (value === null ? mod.remove(r) : mod.set(r, value)).catch((e) => console.error('[money] write failed', e));
    },
    setAll(book) { if (bookRef) mod.set(bookRef, book).catch((e) => console.error('[money] write failed', e)); },
    stop() { try { if (unsub) unsub(); } catch (e) {} },
  };
}

export function createSync({ store, onStatus }) {
  let backend = null, mode = null, code = null, seeded = false, status = 'idle';
  const setStatus = (s, extra) => { status = s; onStatus && onStatus(s, extra); };

  return {
    get mode() { return mode; },
    get code() { return code; },
    get status() { return status; },

    // 共有コードに接続。新しいコードが空ならローカルの帳簿を持ち込む（onFreshBook が true を返したとき）。
    async connect({ mode: m, code: c, config, onFreshBook }) {
      const prevCode = code, hadBook = mode !== null;
      await this.disconnect();
      const next = c || 'local';
      const switching = hadBook && prevCode !== next;
      const publishingLocal = !prevCode || prevCode === 'local';
      mode = m; code = next; seeded = false;
      // 離れる帳簿を退避しておく。新しいコードが空なら「持ち込むか」を聞ける。
      const parked = switching ? store.toBook() : null;
      const hadCache = store.useCache(code); // 帳簿ごとのローカルキャッシュ（オフライン再起動用）
      if (switching && !hadCache) store.clear();
      backend = (m === 'firebase') ? FirebaseBackend(config) : LocalBackend();
      await backend.start(code, {
        onSnapshot: (book) => {
          if (!seeded) {
            seeded = true;
            if (isEmptyBook(book)) {
              const migrate = parked && !isEmptyBook(parked) && onFreshBook && onFreshBook(next, publishingLocal);
              if (migrate) store.setFromBook(parked);
              else if (isEmptyBook(store.toBook())) { if (next === 'local') store.resetToSample(); else store.clear(); }
              backend.setAll(store.toBook());
              return;
            }
          }
          if (!isEmptyBook(book)) store.setFromBook(book);
          else if (book && (book.settings || book.meta)) store.setFromBook(book); // 明細を全消しした状態も反映
        },
        onStatus: setStatus,
      });
      return status;
    },

    push(patch) {
      if (!backend || !patch) return;
      try { backend.set(patch.path, patch.value); } catch (e) { console.error('[money] push failed', e); }
    },

    async disconnect() {
      if (backend) { try { backend.stop(); } catch (e) {} backend = null; }
      mode = null; seeded = false; setStatus('idle');
    },
  };
}
