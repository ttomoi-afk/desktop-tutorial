// store.js — data model, persistence and derivations for プロジェクト管理シート.
// Framework-free ES module. State is a plain object of ordered arrays; the sync
// layer (sync.js) mirrors it to/from an id-keyed "board" shape (Firebase-style).

export const STATUS = {
  none: { key: 'none', label: '未着手',    tag: 'tag tag-neutral',  fill: 'var(--color-neutral-400)', ganttTrack: null,                     square: 'dashed' },
  run:  { key: 'run',  label: '進行中',    tag: 'tag tag-accent',   fill: 'var(--color-accent)',      ganttTrack: 'var(--color-accent-200)',   square: 'var(--color-accent)' },
  rev:  { key: 'rev',  label: 'レビュー中', tag: 'tag tag-accent-2', fill: 'var(--color-accent-2)',    ganttTrack: 'var(--color-accent-2-200)', square: 'var(--color-accent-2)' },
  done: { key: 'done', label: '完了',      tag: 'tag tag-ink',      fill: 'var(--color-text)',        ganttTrack: 'var(--color-neutral-300)',  square: 'var(--color-text)' },
};
export const STATUS_KEYS = ['none', 'run', 'rev', 'done'];

// ── date helpers (all in UTC day-numbers to stay timezone-safe) ────────────
const MS_DAY = 86400000;
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function pad2(n) { return String(n).padStart(2, '0'); }
export function dayNum(iso) { const [y, m, d] = iso.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / MS_DAY); }
export function isoFromDay(n) { const d = new Date(n * MS_DAY); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }
export function jpDate(iso) { if (!iso) return ''; const [, m, d] = iso.split('-').map(Number); return `${m}月${d}日`; }
export function jpFull(iso) { const [y, m, d] = iso.split('-').map(Number); const w = '日月火水木金土'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; return `${y}年${m}月${d}日（${w}）`; }
export function isoWeek(iso) { const [y, m, d] = iso.split('-').map(Number); const t = Date.UTC(y, m - 1, d); const day = new Date(t).getUTCDay() || 7; const th = t + (4 - day) * MS_DAY; const y0 = Date.UTC(new Date(th).getUTCFullYear(), 0, 1); return 1 + Math.round((th - y0) / MS_DAY / 7); }

// ── seed board (the current team snapshot; dummy data) ─────────────────────
export function sampleState() {
  return {
    meta: { title: 'プロジェクト管理シート', team: 'チーム進行管理' },
    members: [
      { id: 'm1', name: '竹田由佳',   ini: '由', email: '', order: 0 },
      { id: 'm2', name: '岡野百合乃', ini: '百', email: '', order: 1 },
      { id: 'm3', name: '滝川智春',   ini: '智', email: '', order: 2 },
      { id: 'm4', name: '滝川共香',   ini: '共', email: '', order: 3 },
      { id: 'm5', name: '友井大勢',   ini: '大', email: '', order: 4 },
    ],
    projects: [
      { id: 'p1', name: 'A案件', goal: '9月末 現地イベント開催', members: ['m1', 'm2', 'm4', 'm5'], order: 0 },
      { id: 'p2', name: 'B案件', goal: '10月 β版リリース',       members: ['m1', 'm3', 'm4', 'm5'], order: 1 },
      { id: 'p3', name: 'C案件', goal: '8月末 投資可否の判断',   members: ['m1', 'm2', 'm3', 'm5'], order: 2 },
    ],
    tasks: [
      { id: 't1',  projectId: 'p1', memberId: 'm1', title: '現地視察レポート作成',       start: '2026-07-01', end: '2026-07-10', status: 'done', pct: 100, order: 0 },
      { id: 't2',  projectId: 'p1', memberId: 'm5', title: '地域パートナー打診',         start: '2026-07-06', end: '2026-07-24', status: 'run',  pct: 65,  order: 1 },
      { id: 't3',  projectId: 'p1', memberId: 'm2', title: '体験プログラム企画書',       start: '2026-07-13', end: '2026-07-31', status: 'run',  pct: 40,  order: 2 },
      { id: 't4',  projectId: 'p1', memberId: 'm4', title: 'SNS発信計画',               start: '2026-07-20', end: '2026-08-07', status: 'none', pct: 0,   order: 3 },
      { id: 't5',  projectId: 'p2', memberId: 'm3', title: 'ユーザーヒアリング（10件）', start: '2026-07-01', end: '2026-07-17', status: 'run',  pct: 80,  order: 4 },
      { id: 't6',  projectId: 'p2', memberId: 'm1', title: '試作モック v2',             start: '2026-07-08', end: '2026-07-22', status: 'rev',  pct: 70,  order: 5 },
      { id: 't7',  projectId: 'p2', memberId: 'm4', title: 'ロゴ・ネーミング検討',       start: '2026-07-13', end: '2026-07-29', status: 'run',  pct: 30,  order: 6 },
      { id: 't8',  projectId: 'p2', memberId: 'm5', title: '価格プラン草案',             start: '2026-07-27', end: '2026-08-14', status: 'none', pct: 0,   order: 7 },
      { id: 't9',  projectId: 'p3', memberId: 'm3', title: '財務モデル精査',             start: '2026-07-06', end: '2026-07-21', status: 'run',  pct: 60,  order: 8 },
      { id: 't10', projectId: 'p3', memberId: 'm2', title: '市場調査メモ',               start: '2026-07-01', end: '2026-07-15', status: 'rev',  pct: 90,  order: 9 },
      { id: 't11', projectId: 'p3', memberId: 'm1', title: 'DD資料リスト整備',           start: '2026-07-15', end: '2026-07-31', status: 'run',  pct: 15,  order: 10 },
      { id: 't12', projectId: 'p3', memberId: 'm5', title: '投資委員会プレゼン',         start: '2026-08-03', end: '2026-08-21', status: 'none', pct: 0,   order: 11 },
    ],
  };
}

// ── array <-> id-keyed board conversion (board = what sync mirrors) ─────────
export function toBoard(state) {
  const keyed = (arr) => arr.reduce((o, x) => (o[x.id] = x, o), {});
  return { meta: state.meta || {}, members: keyed(state.members), projects: keyed(state.projects), tasks: keyed(state.tasks) };
}
export function fromBoard(board) {
  const arr = (obj) => Object.values(obj || {}).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return { meta: board.meta || { title: 'プロジェクト管理シート', team: 'チーム進行管理' }, members: arr(board.members), projects: arr(board.projects), tasks: arr(board.tasks) };
}

// ── store: state container with pub/sub + local persistence ────────────────
export function createStore() {
  let state = sampleState();
  let cacheKey = 'pms:board:local';
  const listeners = new Set();

  function persist() { try { localStorage.setItem(cacheKey, JSON.stringify(state)); } catch (e) {} }
  function emit() { listeners.forEach((fn) => fn(state)); }
  function set(next, { persist: p = true } = {}) { state = next; if (p) persist(); emit(); }

  return {
    get() { return state; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // choose which board this device caches locally (e.g. per team code)
    useCache(key) {
      cacheKey = 'pms:board:' + key;
      try { const raw = localStorage.getItem(cacheKey); if (raw) { state = JSON.parse(raw); emit(); return true; } } catch (e) {}
      return false;
    },
    loadLocal() { return this.useCache('local'); },

    // replace whole state from a remote snapshot (does not echo back to sync)
    setFromBoard(board) {
      if (!board || (!board.tasks && !board.members && !board.projects)) return;
      set(fromBoard(board), { persist: true });
    },
    resetToSample() { set(sampleState()); return { members: state.members, projects: state.projects, tasks: state.tasks }; },
    replaceAll(next) { set(next); },

    // ── mutations. Each returns a patch { path, value|null } for the sync layer.
    upsertTask(t) {
      const list = state.tasks.slice();
      const i = list.findIndex((x) => x.id === t.id);
      if (i >= 0) list[i] = { ...list[i], ...t };
      else list.push({ order: nextOrder(list), ...t });
      set({ ...state, tasks: list });
      const saved = list.find((x) => x.id === t.id);
      return { path: 'tasks/' + t.id, value: saved };
    },
    deleteTask(id) { set({ ...state, tasks: state.tasks.filter((x) => x.id !== id) }); return { path: 'tasks/' + id, value: null }; },

    upsertMember(m) {
      const list = state.members.slice();
      const i = list.findIndex((x) => x.id === m.id);
      if (i >= 0) list[i] = { ...list[i], ...m }; else list.push({ order: nextOrder(list), ...m });
      set({ ...state, members: list });
      return { path: 'members/' + m.id, value: list.find((x) => x.id === m.id) };
    },
    deleteMember(id) { set({ ...state, members: state.members.filter((x) => x.id !== id) }); return { path: 'members/' + id, value: null }; },

    upsertProject(p) {
      const list = state.projects.slice();
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) list[i] = { ...list[i], ...p }; else list.push({ order: nextOrder(list), ...p });
      set({ ...state, projects: list });
      return { path: 'projects/' + p.id, value: list.find((x) => x.id === p.id) };
    },
    deleteProject(id) { set({ ...state, projects: state.projects.filter((x) => x.id !== id) }); return { path: 'projects/' + id, value: null }; },

    toBoard() { return toBoard(state); },
  };
}

function nextOrder(list) { return list.reduce((m, x) => Math.max(m, (x.order ?? 0) + 1), 0); }
export function uid(prefix) {
  const rnd = (crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

// ── derivations (pure; app.js renders from these) ──────────────────────────
export function round(n) { return Math.round(n); }
export function avg(nums) { return nums.length ? Math.round(nums.reduce((s, n) => s + n, 0) / nums.length) : 0; }

export function deriveSummary(state) {
  const tasks = state.tasks;
  const counts = { none: 0, run: 0, rev: 0, done: 0 };
  tasks.forEach((t) => { counts[t.status] = (counts[t.status] || 0) + 1; });
  const overall = avg(tasks.map((t) => t.pct));
  const projects = state.projects.map((p) => {
    const pts = tasks.filter((t) => t.projectId === p.id);
    return { ...p, pct: avg(pts.map((t) => t.pct)), total: pts.length, done: pts.filter((t) => t.status === 'done').length };
  });
  const members = state.members.map((m) => {
    const mts = tasks.filter((t) => t.memberId === m.id).sort((a, b) => a.order - b.order);
    return { ...m, tasks: mts, count: mts.length, avg: avg(mts.map((t) => t.pct)) };
  });
  return { overall, total: tasks.length, counts, projects, members };
}

export function memberNextDue(tasks, today = todayISO()) {
  const t0 = dayNum(today);
  let best = null, bestK = Infinity;
  tasks.forEach((t) => { const k = dayNum(t.end); if (k >= t0 && k < bestK) { bestK = k; best = t.end; } });
  if (best === null) tasks.forEach((t) => { const k = dayNum(t.end); if (k < bestK) { bestK = k; best = t.end; } });
  return best;
}

// Gantt model: window snapped to whole months, weekly Monday gridlines, and each
// task's bar positioned from its start/end dates. Positions are % of the window.
export function deriveGantt(state, today = todayISO()) {
  const tasks = state.tasks;
  if (!tasks.length) return { rows: [], months: [], weeks: [], todayPct: null, winStart: today, winEnd: today };
  const days = tasks.flatMap((t) => [dayNum(t.start), dayNum(t.end)]).concat([dayNum(today)]);
  let min = Math.min(...days), max = Math.max(...days);
  const winStart = monthStart(min);
  const winEnd = monthStart(monthAdd(max, 1));
  const span = Math.max(1, winEnd - winStart);
  const pct = (d) => ((d - winStart) / span) * 100;

  const months = [];
  for (let ms = winStart; ms < winEnd;) {
    const left = pct(ms);
    if (left < 98) months.push({ label: (new Date(ms * MS_DAY).getUTCMonth() + 1) + '月', left });
    ms = monthAdd(ms, 1);
  }
  const weeks = [];
  let mon = min; const d0 = new Date(winStart * MS_DAY).getUTCDay();
  let firstMon = winStart + ((8 - (d0 === 0 ? 7 : d0)) % 7);
  for (let w = firstMon; w < winEnd; w += 7) if (pct(w) > 1 && pct(w) < 99) weeks.push(pct(w));

  const byProject = state.projects.map((p) => {
    const pts = tasks.filter((t) => t.projectId === p.id).sort((a, b) => a.order - b.order);
    return {
      project: p,
      pct: avg(pts.map((t) => t.pct)),
      bars: pts.map((t) => {
        const s = dayNum(t.start), e = Math.max(dayNum(t.end), dayNum(t.start) + 1);
        const m = state.members.find((x) => x.id === t.memberId);
        return { task: t, ini: m ? m.ini : '?', left: pct(s), width: Math.max(1.5, pct(e) - pct(s)), st: STATUS[t.status] };
      }),
    };
  }).filter((g) => g.bars.length);

  return { rows: byProject, months, weeks, todayPct: pct(dayNum(today)), winStart: isoFromDay(winStart), winEnd: isoFromDay(winEnd) };
}
function monthStart(day) { const d = new Date(day * MS_DAY); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / MS_DAY); }
function monthAdd(day, n) { const d = new Date(day * MS_DAY); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1) / MS_DAY); }
