// store.js — 資金管理アプリのデータ層（純粋ロジック）。
//   state = { meta, settings, entries:[…] }
// 「帳簿（book）」はクラウド同期用の id キー形（entries を {id: entry} にしたもの）。
// 画面側（app.js）は derive* の結果だけを描画する。

export const GROUPS = {
  income: { key: 'income', label: '収入', color: 'g-income' },
  life:   { key: 'life',   label: '生活', color: 'g-life' },
  play:   { key: 'play',   label: '遊び', color: 'g-play' },
  gamble: { key: 'gamble', label: 'ギャンブル', color: 'g-gamble' },
};
export const GROUP_ORDER = ['life', 'play', 'gamble', 'income'];

export const CATEGORIES = {
  income: ['給料', 'ボーナス', '副収入', 'その他収入'],
  life:   ['家賃', '食費', '光熱費', '通信費', '日用品', '交通費', '保険・医療', 'サブスク', 'その他生活'],
  play:   ['外食・飲み会', '趣味', '旅行', '買い物', 'ゲーム課金', 'その他遊び'],
  gamble: ['ボートレース', '競馬', '競輪', 'オートレース', 'パチンコ・スロット', '宝くじ', 'ゲーム（賭け）', 'その他'],
};

export const DEFAULT_BUDGETS = { life: 120000, play: 30000, gamble: 20000 }; // 一人あたりの月予算（円）
export const DEFAULT_SETTINGS = {
  budgets: { ...DEFAULT_BUDGETS }, // 旧データ互換（メンバーに予算が無いときの既定）
  salaryDay: 25,
  allowGambleRebet: true,          // 残り資金に払戻を含める（ふたり共通）
};
export const MEMBER_COLORS = ['#0f766e', '#7c3aed', '#2563eb', '#db2777', '#d97706', '#059669'];
export const MAX_MEMBERS = 6;

// member = { id, name, color, order, budgets:{life,play,gamble}, salaryDay }
export function normalizeMember(m, i = 0) {
  return {
    id: m.id, name: (m.name || '').trim() || 'メンバー' + (i + 1),
    color: m.color || MEMBER_COLORS[i % MEMBER_COLORS.length],
    order: typeof m.order === 'number' ? m.order : i,
    budgets: { ...DEFAULT_BUDGETS, ...(m.budgets || {}) },
    salaryDay: Math.min(31, Math.max(1, Math.round(Number(m.salaryDay) || 25))),
  };
}
export const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
export function memberOf(state, id) { return state.members.find((m) => m.id === id) || null; }

export const MS_DAY = 86400000;
export function todayISO(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export function monthOf(iso) { return (iso || '').slice(0, 7); }
export function thisMonth(d = new Date()) { return todayISO(d).slice(0, 7); }
export function monthAdd(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
export function monthLabel(ym) { const [y, m] = ym.split('-'); return `${y}年${Number(m)}月`; }
export function fmtYen(n) {
  const v = Math.round(Number(n) || 0);
  const s = Math.abs(v).toLocaleString('ja-JP');
  return (v < 0 ? '−' : '') + '¥' + s;
}
export function fmtSigned(n) { const v = Math.round(Number(n) || 0); return (v > 0 ? '+' : '') + fmtYen(v); }
export function pct(part, whole) { return whole > 0 ? Math.round((part / whole) * 100) : 0; }

export function uid(prefix) {
  const rnd = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

// ── 1件の正規化 ─────────────────────────────────────────────────────────────
// entry = { id, date, group, category, amount, memo, memberId, author, updatedAt,
//           stake, payout (group==='gamble' のとき) }
// memberId = だれの明細か。author は表示用の名前（旧データ互換・読みやすさ用）。
export function normalizeEntry(e) {
  const group = GROUPS[e.group] ? e.group : 'life';
  const base = {
    id: e.id, date: e.date || todayISO(), group,
    category: e.category || CATEGORIES[group][0],
    memo: (e.memo || '').trim(), memberId: e.memberId || '', author: (e.author || '').trim(),
    updatedAt: e.updatedAt || Date.now(),
  };
  if (group === 'gamble') {
    const stake = Math.max(0, Math.round(Number(e.stake) || 0));
    const payout = Math.max(0, Math.round(Number(e.payout) || 0));
    return { ...base, stake, payout, amount: payout - stake };
  }
  return { ...base, amount: Math.max(0, Math.round(Number(e.amount) || 0)) };
}

// ── 月次集計 ────────────────────────────────────────────────────────────────
// 収入 = income + ギャンブル払戻 / 支出 = 生活 + 遊び + ギャンブル投入
// who = 'all'（ふたり合算）| memberId（その人だけ）
export function entriesOf(state, who = 'all') {
  return who === 'all' ? state.entries : state.entries.filter((e) => e.memberId === who);
}
// 予算：一人なら本人の予算、ふたりなら全員の合計（メンバーが無い旧データは settings.budgets）
export function budgetsFor(state, who = 'all') {
  const s = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  const members = who === 'all' ? state.members : state.members.filter((m) => m.id === who);
  if (!members.length) return { ...DEFAULT_BUDGETS, ...(s.budgets || {}) };
  const out = { life: 0, play: 0, gamble: 0 };
  members.forEach((m) => { Object.keys(out).forEach((k) => { out[k] += (m.budgets && m.budgets[k]) || 0; }); });
  return out;
}
export function deriveMonth(state, ym, who = 'all') {
  const s = { ...DEFAULT_SETTINGS, ...(state.settings || {}), budgets: budgetsFor(state, who) };
  const entries = entriesOf(state, who).filter((e) => monthOf(e.date) === ym).sort(byDateDesc);
  const sum = (arr, f) => arr.reduce((a, e) => a + f(e), 0);
  const inc = entries.filter((e) => e.group === 'income');
  const life = entries.filter((e) => e.group === 'life');
  const play = entries.filter((e) => e.group === 'play');
  const gam = entries.filter((e) => e.group === 'gamble');

  const salary = sum(inc.filter((e) => e.category === '給料' || e.category === 'ボーナス'), (e) => e.amount);
  const income = sum(inc, (e) => e.amount);
  const lifeTotal = sum(life, (e) => e.amount);
  const playTotal = sum(play, (e) => e.amount);
  const stake = sum(gam, (e) => e.stake);
  const payout = sum(gam, (e) => e.payout);
  const gambleNet = payout - stake;              // プラスなら勝ち
  const gambleLoss = Math.max(0, -gambleNet);     // 給料配分に使う「純損失」
  const expense = lifeTotal + playTotal + stake;
  const balance = income + payout - expense;

  // 給料に対する配分（給料がなければ総収入を母数に）
  const base = salary > 0 ? salary : income;
  const left = base - lifeTotal - playTotal - gambleLoss;
  const allocation = {
    base, baseLabel: salary > 0 ? '給料' : '収入',
    rows: [
      { key: 'life', label: '生活', amount: lifeTotal, pct: pct(lifeTotal, base) },
      { key: 'play', label: '遊び', amount: playTotal, pct: pct(playTotal, base) },
      { key: 'gamble', label: 'ギャンブル', amount: gambleLoss, pct: pct(gambleLoss, base), win: gambleNet > 0 ? gambleNet : 0 },
    ],
    left, leftPct: base > 0 ? Math.max(0, Math.round((left / base) * 100)) : 0,
    over: left < 0,
  };

  const budgets = GROUP_ORDER.filter((g) => g !== 'income').map((g) => {
    const used = g === 'life' ? lifeTotal : g === 'play' ? playTotal
      : (s.allowGambleRebet ? gambleLoss : stake);
    const budget = s.budgets[g] || 0;
    return { key: g, label: GROUPS[g].label, budget, used, left: budget - used, pct: pct(used, budget), over: budget > 0 && used > budget };
  });

  const byCategory = (list, f) => {
    const m = new Map();
    list.forEach((e) => m.set(e.category, (m.get(e.category) || 0) + f(e)));
    return [...m].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  };

  return {
    ym, who, entries, count: entries.length,
    salary, income, expense, balance, lifeTotal, playTotal,
    gamble: { stake, payout, net: gambleNet, loss: gambleLoss, count: gam.length, wins: gam.filter((e) => e.amount > 0).length },
    allocation, budgets, settings: s,
    categories: {
      life: byCategory(life, (e) => e.amount), play: byCategory(play, (e) => e.amount),
      gamble: byCategory(gam, (e) => e.stake), income: byCategory(inc, (e) => e.amount),
    },
  };
}

// ── ギャンブル資金管理 ───────────────────────────────────────────────────────
export function deriveGamble(state, ym, who = 'all') {
  const m = deriveMonth(state, ym, who);
  const list = m.entries.filter((e) => e.group === 'gamble');
  const budget = m.settings.budgets.gamble || 0;
  const rebet = m.settings.allowGambleRebet;
  const remaining = budget - (rebet ? m.gamble.loss : m.gamble.stake);
  const kinds = new Map();
  list.forEach((e) => {
    const k = kinds.get(e.category) || { category: e.category, stake: 0, payout: 0, count: 0, wins: 0 };
    k.stake += e.stake; k.payout += e.payout; k.count++; if (e.amount > 0) k.wins++;
    kinds.set(e.category, k);
  });
  const byKind = [...kinds.values()].map((k) => ({ ...k, net: k.payout - k.stake, roi: pct(k.payout, k.stake) })).sort((a, b) => b.stake - a.stake);
  // 日別の累積損益（グラフ用）
  const byDay = new Map();
  list.slice().sort(byDateAsc).forEach((e) => byDay.set(e.date, (byDay.get(e.date) || 0) + e.amount));
  let acc = 0;
  const curve = [...byDay].map(([date, net]) => { acc += net; return { date, net, acc }; });
  return {
    ym, budget, remaining, remainingPct: budget > 0 ? Math.max(0, Math.min(100, Math.round((remaining / budget) * 100))) : 0,
    over: budget > 0 && remaining < 0, rebet,
    stake: m.gamble.stake, payout: m.gamble.payout, net: m.gamble.net,
    roi: pct(m.gamble.payout, m.gamble.stake), count: list.length, wins: m.gamble.wins,
    winRate: pct(m.gamble.wins, list.length), byKind, curve, entries: list,
  };
}

// 直近 n ヶ月の推移（履歴画面のグラフ）
export function deriveTrend(state, endYm, n = 6, who = 'all') {
  const months = [];
  for (let i = n - 1; i >= 0; i--) months.push(monthAdd(endYm, -i));
  return months.map((ym) => {
    const m = deriveMonth(state, ym, who);
    return { ym, label: Number(ym.slice(5)) + '月', income: m.income + m.gamble.payout, expense: m.expense, balance: m.balance,
      life: m.lifeTotal, play: m.playTotal, gambleLoss: m.gamble.loss, gambleNet: m.gamble.net };
  });
}

// ふたりの比較（ホームの「ふたりの今月」カード用）
export function deriveMembers(state, ym) {
  return state.members.slice().sort(byOrder).map((mem) => {
    const m = deriveMonth(state, ym, mem.id);
    return { member: mem, count: m.count, income: m.income + m.gamble.payout, expense: m.expense, balance: m.balance,
      salary: m.salary, left: m.allocation.left, leftPct: m.allocation.leftPct, over: m.allocation.over,
      lifeTotal: m.lifeTotal, playTotal: m.playTotal, gambleNet: m.gamble.net };
  });
}

// 帳簿にある月の一覧（新しい順）。今月は常に含める。
export function listMonths(state, today = todayISO()) {
  const set = new Set(state.entries.map((e) => monthOf(e.date)).filter(Boolean));
  set.add(monthOf(today));
  return [...set].sort().reverse();
}

export const byDateDesc = (a, b) => (b.date.localeCompare(a.date)) || ((b.updatedAt || 0) - (a.updatedAt || 0));
export const byDateAsc = (a, b) => (a.date.localeCompare(b.date)) || ((a.updatedAt || 0) - (b.updatedAt || 0));

// ── 帳簿（同期用の形） ⇄ state ───────────────────────────────────────────────
export function toBook(state) {
  const entries = {}, members = {};
  state.entries.forEach((e) => { entries[e.id] = e; });
  state.members.forEach((m) => { members[m.id] = m; });
  return { meta: state.meta, settings: state.settings, members, entries };
}
export function fromBook(book) {
  const b = book || {};
  const settings = { ...DEFAULT_SETTINGS, ...(b.settings || {}), budgets: { ...DEFAULT_BUDGETS, ...((b.settings || {}).budgets || {}) } };
  const members = Object.values(b.members || {}).filter((m) => m && m.id).sort(byOrder).map(normalizeMember);
  let entries = Object.values(b.entries || {}).filter((e) => e && e.id).map(normalizeEntry);
  // 旧データ互換：memberId の無い明細は author（表示名）からメンバーを起こして紐づける。
  // メンバーも author も無い明細は、唯一のメンバーがいればその人に、いなければ未割当のまま。
  const byName = new Map(members.map((m) => [m.name, m]));
  entries = entries.map((e) => {
    if (e.memberId && members.some((m) => m.id === e.memberId)) return e;
    if (e.author) {
      let m = byName.get(e.author);
      if (!m) { m = normalizeMember({ id: uid('m'), name: e.author, budgets: settings.budgets, salaryDay: settings.salaryDay }, members.length); members.push(m); byName.set(m.name, m); }
      return { ...e, memberId: m.id };
    }
    return members.length === 1 ? { ...e, memberId: members[0].id } : { ...e, memberId: '' };
  });
  return { meta: { name: 'ふたりの家計簿', ...(b.meta || {}) }, settings, members, entries };
}
export function emptyState() { return fromBook(null); }
export function isEmptyBook(b) { return !b || ((!b.entries || !Object.keys(b.entries).length) && (!b.members || !Object.keys(b.members).length)); }

// サンプルデータ（初回起動・「サンプルに戻す」用）
export function sampleState(today = todayISO()) {
  const ym = monthOf(today);
  const d = (day) => ym + '-' + String(day).padStart(2, '0');
  const prev = monthAdd(ym, -1);
  const pd = (day) => prev + '-' + String(day).padStart(2, '0');
  const A = normalizeMember({ id: uid('m'), name: 'ユウ', budgets: { life: 120000, play: 30000, gamble: 20000 }, salaryDay: 25 }, 0);
  const B = normalizeMember({ id: uid('m'), name: 'ハル', budgets: { life: 100000, play: 25000, gamble: 10000 }, salaryDay: 20 }, 1);
  const mk = (who, o) => normalizeEntry({ id: uid('e'), memberId: who.id, author: who.name, ...o });
  const entries = [
    mk(A, { date: pd(25), group: 'income', category: '給料', amount: 280000 }),
    mk(A, { date: d(25), group: 'income', category: '給料', amount: 280000 }),
    mk(A, { date: pd(1), group: 'life', category: '家賃', amount: 72000 }),
    mk(A, { date: pd(10), group: 'life', category: '食費', amount: 31200 }),
    mk(A, { date: pd(14), group: 'play', category: '外食・飲み会', amount: 8600 }),
    mk(A, { date: pd(20), group: 'gamble', category: 'ボートレース', stake: 6000, payout: 11200, memo: '住之江 12R' }),
    mk(A, { date: d(1), group: 'life', category: '家賃', amount: 72000 }),
    mk(A, { date: d(3), group: 'life', category: '食費', amount: 6400, memo: 'スーパーまとめ買い' }),
    mk(A, { date: d(5), group: 'life', category: '通信費', amount: 4980 }),
    mk(A, { date: d(6), group: 'play', category: '外食・飲み会', amount: 5200, memo: '同僚と' }),
    mk(A, { date: d(7), group: 'gamble', category: 'ボートレース', stake: 5000, payout: 3400, memo: '平和島' }),
    mk(A, { date: d(9), group: 'play', category: 'ゲーム課金', amount: 3000 }),
    mk(A, { date: d(13), group: 'gamble', category: '競馬', stake: 3000, payout: 0 }),
    mk(A, { date: d(15), group: 'gamble', category: 'ボートレース', stake: 4000, payout: 9800, memo: '3連単的中' }),
    mk(B, { date: pd(20), group: 'income', category: '給料', amount: 230000 }),
    mk(B, { date: d(20), group: 'income', category: '給料', amount: 230000 }),
    mk(B, { date: d(2), group: 'life', category: '食費', amount: 8200, memo: 'ドラッグストア・スーパー' }),
    mk(B, { date: d(4), group: 'life', category: '日用品', amount: 3600 }),
    mk(B, { date: d(8), group: 'play', category: '趣味', amount: 4500, memo: '本・雑貨' }),
    mk(B, { date: d(11), group: 'gamble', category: 'ゲーム（賭け）', stake: 2000, payout: 1200 }),
    mk(B, { date: d(12), group: 'life', category: '光熱費', amount: 9800 }),
    mk(B, { date: d(14), group: 'life', category: '食費', amount: 7300 }),
    mk(B, { date: d(16), group: 'play', category: '外食・飲み会', amount: 6800, memo: 'ふたりで外食' }),
  ];
  return { meta: { name: 'ふたりの家計簿' }, settings: { ...DEFAULT_SETTINGS, budgets: { ...DEFAULT_BUDGETS } }, members: [A, B], entries };
}

// ── store（変更 → 購読者へ通知、戻り値は同期用パッチ） ─────────────────────────
// 各メソッドは { path, value } を返す。value===null は削除。
export function createStore({ onChange } = {}) {
  let state = emptyState();
  let cacheKey = null;
  const subs = new Set();
  const notify = () => { subs.forEach((f) => f(state)); onChange && onChange(state); persist(); };
  const persist = () => { if (!cacheKey) return; try { localStorage.setItem(cacheKey, JSON.stringify(toBook(state))); } catch (e) {} };
  const set = (next) => { state = next; notify(); };

  return {
    get state() { return state; },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },

    // 帳簿ごとのローカルキャッシュ（オフライン再起動用）。キャッシュがあれば読み込み true。
    useCache(code) {
      cacheKey = 'money:cache:' + code;
      try {
        const raw = localStorage.getItem(cacheKey);
        if (raw) { state = fromBook(JSON.parse(raw)); subs.forEach((f) => f(state)); return true; }
      } catch (e) {}
      return false;
    },
    clear() { set(emptyState()); },
    resetToSample() { set(sampleState()); },
    setFromBook(book) { set(fromBook(book)); },
    toBook() { return toBook(state); },

    upsertEntry(e) {
      const saved = normalizeEntry({ ...e, id: e.id || uid('e'), updatedAt: Date.now() });
      const list = state.entries.filter((x) => x.id !== saved.id).concat([saved]);
      set({ ...state, entries: list });
      return { path: 'entries/' + saved.id, value: saved };
    },
    deleteEntry(id) { set({ ...state, entries: state.entries.filter((x) => x.id !== id) }); return { path: 'entries/' + id, value: null }; },
    clearEntries() { set({ ...state, entries: [] }); return { path: 'entries', value: null }; },
    setSettings(patch) {
      const budgets = { ...state.settings.budgets, ...((patch || {}).budgets || {}) };
      set({ ...state, settings: { ...state.settings, ...patch, budgets } });
      return { path: 'settings', value: state.settings };
    },
    setMeta(patch) { set({ ...state, meta: { ...state.meta, ...patch } }); return { path: 'meta', value: state.meta }; },

    upsertMember(m) {
      const list = state.members.slice();
      const i = list.findIndex((x) => x.id === m.id);
      const saved = i >= 0
        ? normalizeMember({ ...list[i], ...m, budgets: { ...list[i].budgets, ...(m.budgets || {}) } }, i)
        : normalizeMember({ order: list.reduce((mx, x) => Math.max(mx, (x.order ?? 0) + 1), 0), ...m, id: m.id || uid('m') }, list.length);
      if (i >= 0) list[i] = saved; else list.push(saved);
      set({ ...state, members: list });
      return { path: 'members/' + saved.id, value: saved };
    },
    // 明細が残っている人は消せない（先に付け替えるか削除する）
    deleteMember(id) {
      if (state.entries.some((e) => e.memberId === id)) return null;
      set({ ...state, members: state.members.filter((x) => x.id !== id) });
      return { path: 'members/' + id, value: null };
    },
  };
}
