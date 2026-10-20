// app.js — マネーノート（ふたりの資金管理）の画面。
// データは store.js（純粋ロジック）、同期は sync.js。ここは描画とイベントだけ。
import {
  GROUPS, GROUP_ORDER, CATEGORIES, MEMBER_COLORS, MAX_MEMBERS, DEFAULT_BUDGETS,
  createStore, deriveMonth, deriveGamble, deriveTrend, deriveMembers, memberOf, byOrder,
  todayISO, thisMonth, monthAdd, monthLabel, monthOf, fmtYen, fmtSigned, byDateDesc,
} from './store.js';
import { createSync } from './sync.js';
import { firebaseConfig, isConfigured } from './firebase-config.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { life: '🏠', play: '🎉', gamble: '🎲', income: '💴' };

// ── アプリ状態（画面側） ────────────────────────────────────────────────────
const ui = {
  ym: thisMonth(),
  tab: 's-home',
  who: 'all',             // 'all'（ふたり）| memberId
  filter: 'all',          // 履歴のフィルタ
  readOnly: false,        // ?view=1 で開いたとき
  editingId: null,
  group: 'life',          // 明細シートで選択中の種類
  entryMember: '',        // 明細シートで選択中の「だれの」
  editingMember: null,    // メンバー編集シート
  askedWho: false,        // 「あなたはどちら？」を出したか（セッション内1回）
};
const PREFS_KEY = 'money:prefs';
const prefs = loadJSON(PREFS_KEY) || {};
function loadJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

// この端末の「わたし」は帳簿（共有コード）ごとに覚える
const bookKey = () => sync.code || 'local';
const getMe = () => localStorage.getItem('money:me:' + bookKey()) || '';
const setMe = (id) => { try { if (id) localStorage.setItem('money:me:' + bookKey(), id); else localStorage.removeItem('money:me:' + bookKey()); } catch (e) {} };
const members = () => store.state.members.slice().sort(byOrder);
const meMember = () => memberOf(store.state, getMe());

const store = createStore();
const sync = createSync({ store, onStatus: renderBadge });
store.subscribe(() => { ensureWho(); renderAll(); maybeAskWho(); });

// ── 起動 ─────────────────────────────────────────────────────────────────────
(async function boot() {
  if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register('./sw.js'); } catch (e) {} }
  const q = new URLSearchParams(location.search);
  const urlCode = (q.get('code') || '').trim();
  ui.readOnly = q.get('view') === '1';
  if (ui.readOnly) { $('#roBanner').hidden = false; $('#fab').hidden = true; }
  if (urlCode) { prefs.code = urlCode; if (!ui.readOnly) saveJSON(PREFS_KEY, prefs); }
  document.addEventListener('click', onClick);
  bindSheets();
  renderAll();
  await connect(prefs.code || '');
})();

async function connect(code) {
  const cloud = !!code && isConfigured();
  ui.askedWho = false;
  await sync.connect({
    mode: cloud ? 'firebase' : 'local', code: cloud ? code : '', config: firebaseConfig,
    onFreshBook: (c, fromLocal) => fromLocal
      ? confirm(`共有コード「${c}」はまだ空です。この端末の帳簿をそこへ持ち込みますか？\n（キャンセルすると空の帳簿から始めます）`)
      : confirm(`共有コード「${c}」はまだ空です。いま開いている帳簿をそこへ移しますか？`),
  });
  ui.who = localStorage.getItem('money:who:' + bookKey()) || 'all';
  ensureWho(); renderAll(); maybeAskWho();
}

// 選択中の人が帳簿から消えていたら「ふたり」に戻す
function ensureWho() { if (ui.who !== 'all' && !memberOf(store.state, ui.who)) ui.who = 'all'; }

// メンバーがいて、この端末の「わたし」が未設定なら一度だけ聞く
function maybeAskWho() {
  if (ui.readOnly || ui.askedWho || !members().length || meMember()) return;
  if ($('#enSheet').classList.contains('is-open')) return;
  ui.askedWho = true;
  openWhoAmI();
}

// ── 描画 ─────────────────────────────────────────────────────────────────────
function renderAll() {
  renderMonthLabel(); renderWhoBar(); renderHome(); renderHistory(); renderGamble();
  if ($('#setSheet').classList.contains('is-open')) renderSettings();
}
function renderMonthLabel() { $('#monthLabel').textContent = monthLabel(ui.ym); }

function renderBadge(status) {
  const b = $('#connBadge');
  const label = sync.mode === 'firebase'
    ? ({ connecting: '接続中…', synced: '共有中', error: 'エラー' }[status] || '共有')
    : 'ローカル';
  const cls = sync.mode === 'firebase' ? ({ connecting: 'c-wait', synced: 'c-ok', error: 'c-err' }[status] || 'c-wait') : 'c-local';
  b.className = 'conn-badge ' + cls;
  b.innerHTML = '<span class="dot"></span>' + esc(label) + (sync.mode === 'firebase' && sync.code ? ' · ' + esc(sync.code) : '');
}

function renderWhoBar() {
  const ms = members();
  const me = getMe();
  const chips = ms.length
    ? [`<button class="who ${ui.who === 'all' ? 'is-on' : ''}" data-action="who" data-who="all" role="tab" aria-selected="${ui.who === 'all'}">${ms.length >= 2 ? 'ふたり' : 'ぜんぶ'}</button>`]
      .concat(ms.map((m) => `<button class="who ${ui.who === m.id ? 'is-on' : ''}" data-action="who" data-who="${esc(m.id)}" role="tab" aria-selected="${ui.who === m.id}"><span class="dot" style="background:${esc(m.color)}"></span>${esc(m.name)}${m.id === me ? '（わたし）' : ''}</button>`))
    : [];
  if (!ui.readOnly && ms.length < MAX_MEMBERS && ms.length < 2) chips.push(`<button class="who add" data-action="edit-member" data-id="">＋ ${ms.length ? '相手を追加' : 'メンバーを追加'}</button>`);
  $('#whoBar').innerHTML = chips.join('');
}

function whoLabel() { const m = ui.who === 'all' ? null : memberOf(store.state, ui.who); return m ? m.name : (members().length >= 2 ? 'ふたり' : ''); }

function renderHome() {
  const m = deriveMonth(store.state, ui.ym, ui.who);
  const a = m.allocation;
  const recent = m.entries.slice(0, 5);
  const ms = members();
  const stackParts = a.base > 0
    ? a.rows.map((r) => `<span class="b-${r.key}" style="width:${Math.min(100, r.pct)}%" title="${esc(r.label)} ${r.pct}%"></span>`).join('')
      + `<span class="b-left" style="width:${a.leftPct}%"></span>`
    : '';
  const wl = whoLabel();
  const cmp = (ui.who === 'all' && ms.length >= 2) ? deriveMembers(store.state, ui.ym) : null;
  $('#home-body').innerHTML = `
    <div class="hero">
      <div class="kick">${esc(monthLabel(m.ym))}の収支${wl ? ' · ' + esc(wl) : ''}</div>
      <div class="big num ${m.balance < 0 ? 'neg' : ''}">${fmtSigned(m.balance)}</div>
      <div class="hero-row">
        <div class="hero-cell"><div class="l">収入</div><div class="v num">${fmtYen(m.income + m.gamble.payout)}</div></div>
        <div class="hero-cell"><div class="l">支出</div><div class="v num">${fmtYen(m.expense)}</div></div>
        <div class="hero-cell"><div class="l">明細</div><div class="v num">${m.count}件</div></div>
      </div>
    </div>

    ${cmp ? `<div class="sec">
      <div class="card">
        <div class="card-title">ふたりの今月 <span class="sub">タップでその人の画面へ</span></div>
        <div class="cmp">
          ${cmp.map((c) => `<button class="cmp-cell" style="border-top-color:${esc(c.member.color)}" data-action="who" data-who="${esc(c.member.id)}">
            <div class="nm"><span class="dot" style="background:${esc(c.member.color)}"></span>${esc(c.member.name)}</div>
            <div class="l">使えるお金の残り</div>
            <div class="big num ${c.over ? 'neg' : ''}">${c.salary > 0 || c.income > 0 ? fmtSigned(c.left) : '—'}</div>
            <div class="mini-bar"><span style="width:${c.leftPct}%;background:${esc(c.member.color)}"></span></div>
            <div class="sm num">収入 <b>${fmtYen(c.income)}</b><br>支出 <b>${fmtYen(c.expense)}</b>${c.gambleNet ? `<br>ギャンブル <b>${fmtSigned(c.gambleNet)}</b>` : ''}</div>
          </button>`).join('')}
        </div>
      </div>
    </div>` : ''}

    <div class="sec">
      <div class="card">
        <div class="card-title">${esc(a.baseLabel)}の使いみち${wl ? '（' + esc(wl) + '）' : ''} <span class="sub num">${a.base > 0 ? esc(a.baseLabel) + ' ' + fmtYen(a.base) : 'まだ給料の記録がありません'}</span></div>
        ${a.base > 0 ? `
        <div class="stack ${a.over ? 'over' : ''}">${stackParts}</div>
        <ul class="legend">
          ${a.rows.map((r) => `<li><span class="sw ${r.key}"></span><span class="nm">${esc(r.label)}${r.win ? ` <span class="win">勝ち ${fmtSigned(r.win)}</span>` : ''}</span><span class="pc num">${r.pct}%</span><span class="am num">${fmtYen(r.amount)}</span></li>`).join('')}
          <li><span class="sw left"></span><span class="nm">残り（貯蓄に回せる）</span><span class="pc num">${a.leftPct}%</span><span class="am num">${fmtYen(Math.max(0, a.left))}</span></li>
        </ul>
        <div class="left-line"><span class="lbl">${a.over ? esc(a.baseLabel) + 'を超えて使っています' : '使えるお金の残り'}</span><span class="val num ${a.over ? 'neg' : ''}">${fmtSigned(a.left)}</span></div>
        ` : `<div class="empty">「収入 › 給料」を記録すると、給料のうち生活・遊び・ギャンブルにいくら使ったかが表示されます。</div>`}
      </div>

      <div class="card">
        <div class="card-title">今月の予算${wl ? '（' + esc(wl) + '）' : ''} <button class="link-btn" data-action="${ui.who === 'all' ? 'open-settings' : 'edit-member'}" data-id="${esc(ui.who === 'all' ? '' : ui.who)}">予算を変更</button></div>
        <div class="budget">
          ${m.budgets.map((b) => `
          <div class="budget-row">
            <div class="bl"><b>${esc(b.label)}</b><span class="rest num ${b.over ? 'over' : ''}">${b.budget > 0 ? (b.over ? fmtYen(-b.left) + ' オーバー' : 'あと ' + fmtYen(b.left)) : '予算未設定'} <span class="muted">/ ${fmtYen(b.used)} 使用</span></span></div>
            <div class="bar ${b.key} ${b.over ? 'over' : ''}"><span style="width:${Math.min(100, b.pct)}%"></span></div>
          </div>`).join('')}
        </div>
        <p class="set-note">${ui.who === 'all' && ms.length >= 2 ? 'ふたりの予算の合計です。' : ''}${m.settings.allowGambleRebet ? 'ギャンブルは「投入 − 払戻」の純損失を予算から差し引いています。' : ''}</p>
      </div>
    </div>

    <div class="sec">
      <div class="sec-head"><span class="sec-label">最近の明細</span><button class="link-btn" data-action="tab" data-target="s-history">すべて見る</button></div>
      ${recent.length ? recent.map(entryRow).join('') : `<div class="empty">まだ明細がありません。右下の＋から追加できます。</div>`}
    </div>`;
}

function entryRow(e) {
  let amt, cls, sub = '';
  if (e.group === 'gamble') { amt = fmtSigned(e.amount); cls = e.amount >= 0 ? 'gwin' : 'glose'; sub = `<small class="num">投入 ${fmtYen(e.stake)} / 払戻 ${fmtYen(e.payout)}</small>`; }
  else if (e.group === 'income') { amt = '+' + fmtYen(e.amount); cls = 'plus'; }
  else { amt = '−' + fmtYen(e.amount); cls = 'minus'; }
  const mem = memberOf(store.state, e.memberId);
  const name = mem ? mem.name : e.author;
  const who = name ? `<span class="who-tag" style="${mem ? `background:${esc(mem.color)}1f;color:${esc(mem.color)}` : ''}">${esc(name)}</span>` : '';
  return `<button class="entry" data-action="edit-entry" data-id="${esc(e.id)}">
    <span class="ic ${e.group}">${ICON[e.group]}</span>
    <span class="tx"><span class="cat">${esc(e.category)}</span><span class="memo">${who}${esc(e.memo || GROUPS[e.group].label)}</span></span>
    <span class="amt num ${cls}">${amt}${sub}</span>
  </button>`;
}

function groupedByDay(list) {
  const days = new Map();
  list.slice().sort(byDateDesc).forEach((e) => { if (!days.has(e.date)) days.set(e.date, []); days.get(e.date).push(e); });
  return [...days].map(([date, es]) => {
    const net = es.reduce((s, e) => s + (e.group === 'income' ? e.amount : e.group === 'gamble' ? e.amount : -e.amount), 0);
    return `<div class="day-head"><span>${esc(dayLabel(date))}</span><span class="num">${fmtSigned(net)}</span></div>${es.map(entryRow).join('')}`;
  }).join('');
}
function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const w = ['日', '月', '火', '水', '木', '金', '土'][new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日（${w}）`;
}

function renderHistory() {
  const m = deriveMonth(store.state, ui.ym, ui.who);
  const list = ui.filter === 'all' ? m.entries : m.entries.filter((e) => e.group === ui.filter);
  const chips = [['all', 'すべて'], ...GROUP_ORDER.map((g) => [g, GROUPS[g].label])];
  const trend = deriveTrend(store.state, ui.ym, 6, ui.who);
  const wl = whoLabel();
  $('#history-body').innerHTML = `
    <div class="sec" style="margin-top:8px">
      <div class="card">
        <div class="card-title">6か月の推移${wl ? '（' + esc(wl) + '）' : ''} <span class="sub">収入 vs 支出</span></div>
        ${trendChart(trend)}
        <div class="chart-legend"><span><i class="sw" style="background:var(--c-income)"></i>収入</span><span><i class="sw" style="background:var(--c-gamble)"></i>支出</span></div>
      </div>
    </div>
    <div class="sec">
      <div class="sec-head"><span class="sec-label">${esc(monthLabel(m.ym))}の明細${wl ? '（' + esc(wl) + '）' : ''}</span><span class="muted" style="font-size:11.5px">${list.length}件</span></div>
      <div class="chips">${chips.map(([k, l]) => `<button class="chip ${ui.filter === k ? 'is-on' : ''}" data-action="filter" data-filter="${k}">${l}</button>`).join('')}</div>
      ${list.length ? groupedByDay(list) : `<div class="empty">この月の明細はありません。</div>`}
    </div>
    ${catBreakdown(m)}`;
}

function catBreakdown(m) {
  const blocks = ['life', 'play', 'gamble'].map((g) => {
    const rows = m.categories[g];
    if (!rows.length) return '';
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return `<div class="card"><div class="card-title">${esc(GROUPS[g].label)}の内訳 <span class="sub num">${fmtYen(total)}${g === 'gamble' ? '（投入）' : ''}</span></div>
      <table class="tbl"><tbody>${rows.map((r) => `<tr><td>${esc(r.category)}</td><td class="num muted">${Math.round((r.amount / total) * 100)}%</td><td class="num">${fmtYen(r.amount)}</td></tr>`).join('')}</tbody></table></div>`;
  }).filter(Boolean).join('');
  return blocks ? `<div class="sec"><div class="sec-head"><span class="sec-label">カテゴリ別</span></div>${blocks}</div>` : '';
}

function trendChart(rows) {
  const W = 320, H = 120, padL = 8, padR = 8, padT = 10, padB = 20;
  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.expense]));
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const slot = innerW / rows.length, bw = Math.min(16, slot * 0.3);
  const y = (v) => padT + innerH - (v / max) * innerH;
  const bars = rows.map((r, i) => {
    const cx = padL + slot * i + slot / 2;
    return `<rect class="inc" x="${(cx - bw - 1).toFixed(1)}" y="${y(r.income).toFixed(1)}" width="${bw}" height="${(innerH - (y(r.income) - padT)).toFixed(1)}" rx="3"/>
      <rect class="exp" x="${(cx + 1).toFixed(1)}" y="${y(r.expense).toFixed(1)}" width="${bw}" height="${(innerH - (y(r.expense) - padT)).toFixed(1)}" rx="3"/>
      <text x="${cx.toFixed(1)}" y="${H - 5}" font-size="10" text-anchor="middle">${r.label}</text>`;
  }).join('');
  const grid = [0.5, 1].map((f) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(max * f).toFixed(1)}" y2="${y(max * f).toFixed(1)}"/>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="6か月の収入と支出">${grid}<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(0)}" y2="${y(0)}"/>${bars}</svg>`;
}

function renderGamble() {
  const g = deriveGamble(store.state, ui.ym, ui.who);
  const wl = whoLabel();
  const ms = members();
  $('#gamble-body').innerHTML = `
    <div class="sec" style="margin-top:8px">
      <div class="card">
        <div class="card-title">${esc(monthLabel(g.ym))}の資金${wl ? '（' + esc(wl) + '）' : ''} <button class="link-btn" data-action="${ui.who === 'all' ? 'open-settings' : 'edit-member'}" data-id="${esc(ui.who === 'all' ? '' : ui.who)}">枠を変更</button></div>
        <div class="bank">
          <div><div class="l">残り資金</div><div class="v num ${g.over ? '' : 'ok'}">${fmtYen(g.remaining)}</div></div>
          <div class="r num">枠 ${fmtYen(g.budget)}${ui.who === 'all' && ms.length >= 2 ? '（合計）' : ''}<br>${g.rebet ? '純損失' : '投入'}ベース</div>
        </div>
        <div class="bar left ${g.over ? 'over' : ''}"><span style="width:${g.remainingPct}%"></span></div>
        ${g.over ? '<p class="set-note" style="color:var(--c-gamble-700)">今月の枠を使い切っています。これ以上は来月の枠から。</p>' : g.budget === 0 ? '<p class="set-note">メンバーの設定で「ギャンブルの月予算」を入れると、残り資金が表示されます。</p>' : ''}
      </div>
      <div class="card">
        <div class="card-title">成績</div>
        <div class="stats">
          <div class="stat"><div class="l">投入</div><div class="v num">${fmtYen(g.stake)}</div></div>
          <div class="stat"><div class="l">払戻</div><div class="v num">${fmtYen(g.payout)}</div></div>
          <div class="stat"><div class="l">損益</div><div class="v num ${g.net > 0 ? 'plus' : g.net < 0 ? 'minus' : ''}">${fmtSigned(g.net)}</div></div>
          <div class="stat"><div class="l">回収率</div><div class="v num">${g.stake ? g.roi + '%' : '—'}</div></div>
          <div class="stat"><div class="l">勝率</div><div class="v num">${g.count ? g.winRate + '%' : '—'}</div></div>
          <div class="stat"><div class="l">回数</div><div class="v num">${g.count}回</div></div>
        </div>
      </div>
      ${g.curve.length ? `<div class="card"><div class="card-title">累積損益 <span class="sub">月初からの推移</span></div>${curveChart(g.curve)}</div>` : ''}
      ${g.byKind.length ? `<div class="card"><div class="card-title">種目別</div>
        <table class="tbl"><thead><tr><th>種目</th><th>回</th><th>投入</th><th>損益</th><th>回収率</th></tr></thead><tbody>
        ${g.byKind.map((k) => `<tr><td>${esc(k.category)}</td><td class="num">${k.count}</td><td class="num">${fmtYen(k.stake)}</td><td class="num ${k.net > 0 ? 'plus' : k.net < 0 ? 'minus' : ''}">${fmtSigned(k.net)}</td><td class="num">${k.roi}%</td></tr>`).join('')}
        </tbody></table></div>` : ''}
    </div>
    <div class="sec">
      <div class="sec-head"><span class="sec-label">ギャンブルの明細</span><span class="muted" style="font-size:11.5px">${g.entries.length}件</span></div>
      ${g.entries.length ? groupedByDay(g.entries) : `<div class="empty">この月のギャンブルの記録はありません。＋ → 種類「ギャンブル」で、投入と払戻を記録します。</div>`}
    </div>`;
}

function curveChart(curve) {
  const W = 320, H = 110, padL = 8, padR = 8, padT = 10, padB = 20;
  const vals = [0, ...curve.map((c) => c.acc)];
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = (i) => padL + (curve.length === 1 ? innerW / 2 : (i / (curve.length - 1)) * innerW);
  const y = (v) => padT + innerH - ((v - min) / span) * innerH;
  const pts = curve.map((c, i) => [x(i), y(c.acc)]);
  const path = pts.map(([px, py], i) => (i ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1)).join(' ');
  const last = curve[curve.length - 1].acc;
  const up = last >= 0 ? 'up' : '';
  const area = `${path} L${pts[pts.length - 1][0].toFixed(1)} ${y(0).toFixed(1)} L${pts[0][0].toFixed(1)} ${y(0).toFixed(1)} Z`;
  const anchor = (i) => (curve.length > 1 && i === 0) ? 'start' : (curve.length > 1 && i === curve.length - 1) ? 'end' : 'middle';
  const labels = curve.map((c, i) => (i === 0 || i === curve.length - 1 || curve.length <= 6)
    ? `<text x="${x(i).toFixed(1)}" y="${H - 5}" font-size="10" text-anchor="${anchor(i)}">${Number(c.date.slice(8))}日</text>` : '').join('');
  const lp = pts[pts.length - 1]; // 最終値のラベルは点の左横に（上端・ゼロ線と重ならない）
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="累積損益の推移">
    <line class="zero" x1="${padL}" x2="${W - padR}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>
    <path class="area ${up}" d="${area}"/><path class="curve ${up}" d="${path}"/>
    ${pts.map(([px, py]) => `<circle class="dot ${up}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3"/>`).join('')}
    <text x="${(lp[0] - 8).toFixed(1)}" y="${(lp[1] + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="${last >= 0 ? 'var(--color-accent-700)' : 'var(--c-gamble-700)'}">${fmtSigned(last)}</text>
    ${labels}</svg>`;
}

// ── 設定シート ──────────────────────────────────────────────────────────────
function renderSettings() {
  const s = store.state.settings, meta = store.state.meta;
  const ms = members(), me = getMe();
  const cloud = sync.mode === 'firebase';
  const shareUrl = cloud ? location.origin + location.pathname + '?code=' + encodeURIComponent(sync.code) : '';
  const ro = ui.readOnly;
  $('#setSheet .sheet-content').innerHTML = `
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head"><div class="sheet-title">設定</div><button class="sheet-close" data-action="close-settings">閉じる</button></div>
    ${ro ? '<p class="set-note" style="color:var(--c-play-700)">閲覧専用モードです。編集するには、URL の「&amp;view=1」を外して開き直してください。</p>' : ''}

    <div class="set-group"><h3>メンバー（ふたり）</h3>
      ${ms.length ? ms.map((m) => `<div class="mem-row">
        <span class="dot" style="background:${esc(m.color)}"></span>
        <span class="tx"><span class="nm">${esc(m.name)}${m.id === me ? '<span class="me">この端末のわたし</span>' : ''}</span>
          <span class="sub num">生活 ${fmtYen(m.budgets.life)} · 遊び ${fmtYen(m.budgets.play)} · ギャンブル ${fmtYen(m.budgets.gamble)} · 給料日 ${m.salaryDay}日</span></span>
        ${ro ? '' : `<button class="btn btn-ghost btn-sm" data-action="edit-member" data-id="${esc(m.id)}">編集</button>`}
      </div>`).join('') : '<p class="set-note">まだメンバーがいません。ふたりの名前を登録すると、明細を「だれの」で分けて記録できます。</p>'}
      <div class="set-actions">
        ${!ro && ms.length < MAX_MEMBERS ? `<button class="btn btn-primary btn-sm" data-action="edit-member" data-id="">＋ ${ms.length === 1 ? '相手を追加' : 'メンバーを追加'}</button>` : ''}
        ${!ro && ms.length ? `<button class="btn btn-ghost btn-sm" data-action="who-am-i">この端末の「わたし」を選ぶ</button>` : ''}
      </div>
      <p class="set-note">「わたし」を選ぶと、明細を追加するとき最初からその人が選ばれます。予算（生活・遊び・ギャンブル）と給料日は、メンバーごとに「編集」から設定します。</p>
    </div>

    <div class="set-group"><h3>帳簿</h3>
      <div class="set-row"><span class="lb">帳簿の名前</span><input class="input wide" id="set-name" value="${esc(meta.name || '')}" ${ro ? 'disabled' : ''}></div>
      <div class="set-row"><span class="lb">払戻を再投入できる<small>オン：純損失を枠から引く / オフ：投入額を引く</small></span><button class="switch ${s.allowGambleRebet ? 'is-on' : ''}" data-action="toggle-rebet" role="switch" aria-checked="${!!s.allowGambleRebet}" ${ro ? 'disabled' : ''}></button></div>
      ${ro ? '' : '<div class="set-actions"><button class="btn btn-primary btn-sm" data-action="save-settings">保存</button></div>'}
    </div>

    <div class="set-group"><h3>共有（ふたりで同じ帳簿を使う）</h3>
      ${isConfigured() ? `
      <p class="set-note">同じ<b>共有コード</b>を入れた端末同士で、同じ帳簿をリアルタイムに使えます。相手には下の「共有リンク」を送ってください。コードは合言葉のようなもので、知っている人は誰でも見たり書いたりできます。</p>
      <div class="code-box"><input class="input" id="set-code" value="${esc(cloud ? sync.code : (prefs.code || ''))}" placeholder="例: tomo-ai-2026" autocomplete="off" autocapitalize="off"><button class="btn btn-primary btn-sm" data-action="connect">接続</button></div>
      ${cloud ? `
      <div class="set-actions">
        <button class="btn btn-ghost btn-sm" data-action="copy-link" data-link="${esc(shareUrl)}">共有リンクをコピー</button>
        <button class="btn btn-ghost btn-sm" data-action="copy-link" data-link="${esc(shareUrl + '&view=1')}">閲覧専用リンクをコピー</button>
        <button class="btn btn-ghost btn-sm" data-action="disconnect">共有を解除</button>
      </div>
      <p class="set-note">閲覧専用リンクは「編集ボタンを隠す」だけで、コードを知っていれば編集できます。見せたいだけの相手にはそちらを送ってください。</p>` : ''}
      ` : `<p class="set-note">Firebase が未設定のため、この端末内だけに保存しています。<code>money/firebase-config.js</code> を設定すると共有できます（README 参照）。</p>`}
    </div>

    <div class="set-group"><h3>データ</h3>
      <div class="set-actions">
        <button class="btn btn-ghost btn-sm" data-action="export">エクスポート（JSON）</button>
        ${ro ? '' : `<button class="btn btn-ghost btn-sm" data-action="import">インポート</button>
        <button class="btn btn-ghost btn-sm" data-action="reset-sample">サンプルに戻す</button>
        <button class="btn btn-danger btn-sm" data-action="clear-all">すべて削除</button>`}
      </div>
      <p class="set-note">明細 ${store.state.entries.length}件 · ${cloud ? 'クラウドに保存（共有コード ' + esc(sync.code) + '）' : 'この端末のみに保存'}</p>
    </div>`;
}

function openSettings() { renderSettings(); $('#setSheet').classList.add('is-open'); $('#setSheetBack').classList.add('is-open'); }
function closeSettings() { $('#setSheet').classList.remove('is-open'); $('#setSheetBack').classList.remove('is-open'); }

function saveSettings() {
  const name = ($('#set-name').value || '').trim() || 'ふたりの家計簿';
  if (name !== store.state.meta.name) sync.push(store.setMeta({ name }));
  toast('保存しました');
}

// ── メンバー編集シート / 「あなたはどちら？」 ─────────────────────────────────
function openMember(id) {
  if (ui.readOnly) return;
  const m = id ? memberOf(store.state, id) : null;
  if (!m && members().length >= MAX_MEMBERS) { toast('メンバーは' + MAX_MEMBERS + '人までです'); return; }
  ui.editingMember = m ? m.id : null;
  const used = new Set(members().map((x) => x.color));
  const color = m ? m.color : (MEMBER_COLORS.find((c) => !used.has(c)) || MEMBER_COLORS[members().length % MEMBER_COLORS.length]);
  const b = m ? m.budgets : DEFAULT_BUDGETS;
  const hasEntries = m ? store.state.entries.some((e) => e.memberId === m.id) : false;
  $('#enSheet .sheet-content').innerHTML = `
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head"><div class="sheet-title">${m ? 'メンバーを編集' : (members().length === 1 ? '相手を追加' : 'メンバーを追加')}</div><button class="sheet-close" data-action="close-en">閉じる</button></div>
    <div class="field"><label for="mem-name">名前</label><input class="input" id="mem-name" value="${esc(m ? m.name : '')}" placeholder="例: とも" autocomplete="off"></div>
    <div class="field"><label>色</label><div class="swatches" id="mem-colors">${MEMBER_COLORS.map((c) => `<button type="button" class="swatch ${c === color ? 'is-on' : ''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div>
    <div class="field"><label>月の予算（円）</label>
      <div class="set-row"><span class="lb">生活</span><input class="input input-num num" type="number" inputmode="numeric" min="0" step="1000" id="mem-b-life" value="${b.life}"></div>
      <div class="set-row"><span class="lb">遊び</span><input class="input input-num num" type="number" inputmode="numeric" min="0" step="1000" id="mem-b-play" value="${b.play}"></div>
      <div class="set-row"><span class="lb">ギャンブル<small>その月に負けてもよい上限（資金枠）</small></span><input class="input input-num num" type="number" inputmode="numeric" min="0" step="1000" id="mem-b-gamble" value="${b.gamble}"></div>
      <div class="set-row"><span class="lb">給料日</span><input class="input num" type="number" min="1" max="31" id="mem-salaryday" value="${m ? m.salaryDay : 25}"></div>
    </div>
    ${m && !hasEntries ? '' : (m ? '<p class="set-note">明細が残っている人は削除できません（先に明細を付け替えるか削除してください）。</p>' : '')}
    <div class="sheet-actions">
      ${m && !hasEntries ? `<button class="btn btn-danger" data-action="delete-member">削除</button>` : ''}
      <button class="btn btn-primary" style="margin-left:auto" data-action="save-member">保存</button>
    </div>`;
  $('#mem-colors').addEventListener('click', (e) => { const b2 = e.target.closest('[data-color]'); if (!b2) return; document.querySelectorAll('#mem-colors .swatch').forEach((x) => x.classList.toggle('is-on', x === b2)); });
  openEn();
  setTimeout(() => { if (!m) $('#mem-name').focus(); }, 250);
}
function saveMember() {
  const name = ($('#mem-name').value || '').trim();
  if (!name) { toast('名前を入れてください'); return; }
  const color = ($('.swatch.is-on') || {}).dataset?.color;
  const budgets = {}; ['life', 'play', 'gamble'].forEach((g) => { budgets[g] = Math.max(0, Math.round(Number($('#mem-b-' + g).value) || 0)); });
  const salaryDay = Math.min(31, Math.max(1, Math.round(Number($('#mem-salaryday').value) || 25)));
  const wasNew = !ui.editingMember;
  const patch = store.upsertMember({ id: ui.editingMember || undefined, name, color, budgets, salaryDay });
  sync.push(patch);
  // 最初のメンバーを自分が作ったなら、それがこの端末の「わたし」
  if (wasNew && !meMember() && members().length === 1) setMe(patch.value.id);
  closeEn(); renderAll(); if ($('#setSheet').classList.contains('is-open')) renderSettings();
  toast(wasNew ? '追加しました' : '保存しました');
}
function deleteMember() {
  const id = ui.editingMember; if (!id) return;
  if (!confirm('このメンバーを削除しますか？')) return;
  const patch = store.deleteMember(id);
  if (!patch) { toast('明細が残っているため削除できません'); return; }
  sync.push(patch); if (getMe() === id) setMe('');
  closeEn(); renderAll(); if ($('#setSheet').classList.contains('is-open')) renderSettings(); toast('削除しました');
}
function openWhoAmI() {
  const ms = members(); if (!ms.length) { openMember(''); return; }
  $('#enSheet .sheet-content').innerHTML = `
    <div class="sheet-grip" aria-hidden="true"></div>
    <div class="sheet-head"><div class="sheet-title">あなたはどちら？</div><button class="sheet-close" data-action="close-en">あとで</button></div>
    <p class="set-note">この端末で明細を付けるときに、最初から選ばれる人です（あとで設定から変えられます）。</p>
    <div class="pick-list">
      ${ms.map((m) => `<button class="pick" data-action="pick-me" data-id="${esc(m.id)}"><span class="dot" style="background:${esc(m.color)}"></span>${esc(m.name)}${m.id === getMe() ? '<small>いまの設定</small>' : ''}</button>`).join('')}
      ${ms.length < MAX_MEMBERS ? `<button class="pick" data-action="edit-member" data-id="">＋ どちらでもない（新しく追加）</button>` : ''}
    </div>`;
  openEn();
}
function openEn() { $('#enSheet').classList.add('is-open'); $('#enSheetBack').classList.add('is-open'); }
function closeEn() { $('#enSheet').classList.remove('is-open'); $('#enSheetBack').classList.remove('is-open'); }

// ── 明細シート ──────────────────────────────────────────────────────────────
function bindSheets() {
  $('#ee-group').addEventListener('click', (e) => { const b = e.target.closest('[data-group]'); if (b) setGroup(b.dataset.group); });
  $('#ee-member').addEventListener('click', (e) => { const b = e.target.closest('[data-member]'); if (b) setEntryMember(b.dataset.member); });
  ['#ee-stake', '#ee-payout'].forEach((sel) => $(sel).addEventListener('input', updateNet));
  $('#eeSheetBack').addEventListener('click', closeEntry);
  $('#setSheetBack').addEventListener('click', closeSettings);
  $('#enSheetBack').addEventListener('click', closeEn);
  $('#importFile').addEventListener('change', onImportFile);
}
function setGroup(g) {
  ui.group = g;
  document.querySelectorAll('#ee-group .seg-opt').forEach((b) => b.classList.toggle('is-on', b.dataset.group === g));
  const sel = $('#ee-category'); const cur = sel.value;
  sel.innerHTML = CATEGORIES[g].map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (CATEGORIES[g].includes(cur)) sel.value = cur;
  const isG = g === 'gamble';
  $('#ee-amount-field').hidden = isG; $('#ee-gamble-fields').hidden = !isG; $('#ee-net').hidden = !isG;
  updateNet();
}
function setEntryMember(id) {
  ui.entryMember = id;
  document.querySelectorAll('#ee-member .mem-opt').forEach((b) => {
    const on = b.dataset.member === id; b.classList.toggle('is-on', on);
    b.style.background = on ? b.dataset.color : ''; b.style.borderColor = on ? b.dataset.color : '';
  });
}
function renderEntryMembers(selected) {
  const ms = members();
  $('#ee-member-field').hidden = !ms.length;
  $('#ee-member').innerHTML = ms.map((m) => `<button type="button" class="seg-opt mem-opt" data-member="${esc(m.id)}" data-color="${esc(m.color)}"><span class="dot" style="background:${esc(m.color)}"></span>${esc(m.name)}</button>`).join('');
  setEntryMember(selected);
}
function updateNet() {
  const n = (Number($('#ee-payout').value) || 0) - (Number($('#ee-stake').value) || 0);
  const el = $('#ee-net'); el.textContent = '損益 ' + fmtSigned(n); el.className = 'gamble-net ' + (n > 0 ? 'plus' : n < 0 ? 'minus' : '');
}
function openEntry(id) {
  if (ui.readOnly) return;
  const e = id ? store.state.entries.find((x) => x.id === id) : null;
  ui.editingId = e ? e.id : null;
  $('#ee-heading').textContent = e ? '明細を編集' : '明細を追加';
  $('#ee-delete').hidden = !e;
  const defaultDate = ui.ym === thisMonth() ? todayISO() : ui.ym + '-01';
  setGroup(e ? e.group : (ui.tab === 's-gamble' ? 'gamble' : ui.group));
  // だれの：編集中はその人 / 新規は「見ている人」→「わたし」→ 先頭
  const ms = members();
  const def = e ? e.memberId : (ui.who !== 'all' ? ui.who : (getMe() || (ms[0] ? ms[0].id : '')));
  renderEntryMembers(memberOf(store.state, def) ? def : (ms[0] ? ms[0].id : ''));
  $('#ee-category').value = e ? e.category : CATEGORIES[ui.group][0];
  $('#ee-date').value = e ? e.date : defaultDate;
  $('#ee-amount').value = e && e.group !== 'gamble' ? e.amount : '';
  $('#ee-stake').value = e && e.group === 'gamble' ? e.stake : '';
  $('#ee-payout').value = e && e.group === 'gamble' ? e.payout : '';
  $('#ee-memo').value = e ? e.memo : '';
  updateNet();
  $('#eeSheet').classList.add('is-open'); $('#eeSheetBack').classList.add('is-open');
  setTimeout(() => { const f = ui.group === 'gamble' ? $('#ee-stake') : $('#ee-amount'); if (!e) f.focus(); }, 250);
}
function closeEntry() { $('#eeSheet').classList.remove('is-open'); $('#eeSheetBack').classList.remove('is-open'); }
function saveEntry() {
  const date = $('#ee-date').value;
  if (!date) { toast('日付を入れてください'); return; }
  const ms = members();
  if (ms.length && !memberOf(store.state, ui.entryMember)) { toast('「だれの」を選んでください'); return; }
  const mem = memberOf(store.state, ui.entryMember);
  const base = { id: ui.editingId, date, group: ui.group, category: $('#ee-category').value, memo: $('#ee-memo').value, memberId: mem ? mem.id : '', author: mem ? mem.name : '' };
  if (ui.group === 'gamble') {
    const stake = Number($('#ee-stake').value) || 0, payout = Number($('#ee-payout').value) || 0;
    if (!stake && !payout) { toast('投入か払戻を入れてください'); return; }
    sync.push(store.upsertEntry({ ...base, stake, payout }));
  } else {
    const amount = Number($('#ee-amount').value) || 0;
    if (!amount) { toast('金額を入れてください'); return; }
    sync.push(store.upsertEntry({ ...base, amount }));
  }
  const prevId = ui.editingId;
  if (!prevId && monthOf(date) !== ui.ym) { ui.ym = monthOf(date); renderAll(); }
  closeEntry(); toast(prevId ? '更新しました' : '追加しました');
}
function deleteEntry() {
  if (!ui.editingId || !confirm('この明細を削除しますか？')) return;
  sync.push(store.deleteEntry(ui.editingId)); closeEntry(); toast('削除しました');
}

// ── 共有 ────────────────────────────────────────────────────────────────────
async function connectFromSettings() {
  const code = ($('#set-code').value || '').trim().replace(/\s+/g, '-');
  if (!code) { toast('共有コードを入れてください'); return; }
  if (!/^[\w\-]{3,40}$/.test(code)) { toast('コードは英数字・-・_ で3〜40文字'); return; }
  prefs.code = code; saveJSON(PREFS_KEY, prefs);
  closeSettings();
  await connect(code); toast('共有コード「' + code + '」に接続しました');
}
async function disconnectCloud() {
  if (!confirm('共有を解除して、この端末だけの帳簿に戻しますか？（クラウド上のデータは残ります）')) return;
  delete prefs.code; saveJSON(PREFS_KEY, prefs);
  closeSettings();
  await connect(''); toast('共有を解除しました');
}
async function copyLink(url) {
  try { await navigator.clipboard.writeText(url); toast('リンクをコピーしました'); }
  catch (e) { prompt('このリンクをコピーしてください', url); }
}

// ── データ ──────────────────────────────────────────────────────────────────
function exportJSON() {
  const blob = new Blob([JSON.stringify(store.toBook(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `money-${sync.code || 'local'}-${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function onImportFile(ev) {
  const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const book = JSON.parse(r.result);
      if (!book || typeof book !== 'object' || !book.entries) throw new Error('bad');
      if (!confirm('いまの帳簿を、このファイルの内容で置き換えます。よろしいですか？')) return;
      store.setFromBook(book); pushAll(); renderSettings(); toast('インポートしました');
    } catch (e) { toast('読み込めないファイルです'); }
  };
  r.readAsText(f);
}
function pushAll() {
  const b = store.toBook();
  sync.push({ path: 'meta', value: b.meta }); sync.push({ path: 'settings', value: b.settings });
  sync.push({ path: 'members', value: b.members }); sync.push({ path: 'entries', value: b.entries });
}

// ── イベント ────────────────────────────────────────────────────────────────
function onClick(e) {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action;
  switch (a) {
    case 'tab': selectTab(el.dataset.target); break;
    case 'who': ui.who = el.dataset.who; try { localStorage.setItem('money:who:' + bookKey(), ui.who); } catch (x) {} renderAll(); break;
    case 'month-prev': ui.ym = monthAdd(ui.ym, -1); renderAll(); break;
    case 'month-next': ui.ym = monthAdd(ui.ym, 1); renderAll(); break;
    case 'month-today': ui.ym = thisMonth(); renderAll(); break;
    case 'filter': ui.filter = el.dataset.filter; renderHistory(); break;
    case 'add-entry': openEntry(null); break;
    case 'edit-entry': openEntry(el.dataset.id); break;
    case 'close-entry': closeEntry(); break;
    case 'save-entry': saveEntry(); break;
    case 'delete-entry': deleteEntry(); break;
    case 'open-settings': openSettings(); break;
    case 'close-settings': closeSettings(); break;
    case 'save-settings': saveSettings(); break;
    case 'toggle-rebet': if (!ui.readOnly) { sync.push(store.setSettings({ allowGambleRebet: !store.state.settings.allowGambleRebet })); renderSettings(); } break;
    case 'edit-member': openMember(el.dataset.id || ''); break;
    case 'save-member': saveMember(); break;
    case 'delete-member': deleteMember(); break;
    case 'who-am-i': openWhoAmI(); break;
    case 'pick-me': setMe(el.dataset.id); closeEn(); renderAll(); if ($('#setSheet').classList.contains('is-open')) renderSettings(); toast('「' + (memberOf(store.state, el.dataset.id) || {}).name + '」をこの端末のわたしにしました'); break;
    case 'close-en': closeEn(); break;
    case 'connect': connectFromSettings(); break;
    case 'disconnect': disconnectCloud(); break;
    case 'copy-link': copyLink(el.dataset.link); break;
    case 'export': exportJSON(); break;
    case 'import': $('#importFile').click(); break;
    case 'reset-sample': if (confirm('いまの帳簿を消して、サンプルデータに戻しますか？')) { setMe(''); store.resetToSample(); pushAll(); renderSettings(); toast('サンプルに戻しました'); } break;
    case 'clear-all': if (confirm('すべての明細を削除します（メンバーは残ります）。よろしいですか？')) { clearEntries(); renderSettings(); toast('削除しました'); } break;
  }
}
function clearEntries() { sync.push(store.clearEntries()); }
function selectTab(id) {
  ui.tab = id;
  document.querySelectorAll('.screen').forEach((s) => { const on = s.id === id; s.classList.toggle('is-active', on); s.hidden = !on; });
  document.querySelectorAll('.tab').forEach((t) => { const on = t.dataset.target === id; t.classList.toggle('is-active', on); t.setAttribute('aria-selected', on); });
}

let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('is-on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('is-on'), 1800); }
