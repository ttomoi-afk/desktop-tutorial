// app.js — UI for プロジェクト管理シート. Renders the three BROADSHEET screens
// from the editable store, drives the editors, and bridges store <-> sync.
import {
  createStore, deriveSummary, deriveGantt, memberNextDue, STATUS, STATUS_KEYS,
  todayISO, jpFull, jpDate, isoWeek, uid,
} from './store.js';
import { createSync } from './sync.js';
import { firebaseConfig, isConfigured } from './firebase-config.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const TODAY = todayISO();

const store = createStore();
let opts = Object.assign({ goals: true, due: true, pct: true, status: true }, LS.get('pms:opts', {}));
let selMember = LS.get('pms:sel', null);
let connState = 'idle';
const params = new URLSearchParams(location.search);

// ── sync wiring ────────────────────────────────────────────────────────────
const sync = createSync({
  store,
  onStatus(s) { connState = s; renderConnBadge(); },
});
function pushPatch(patch) { sync.push(patch); }

function currentConn() { return LS.get('pms:conn', { code: '', name: '' }); }
function decideMode() {
  const forced = params.get('sync');
  if (forced === 'firebase' || forced === 'local') return forced;
  return (isConfigured(firebaseConfig) && currentConn().code) ? 'firebase' : 'local';
}
async function startSync() {
  const conn = currentConn();
  const code = sanitizeCode(params.get('code') || conn.code || 'local');
  const mode = decideMode();
  await sync.connect({ mode, code, config: firebaseConfig });
}
// RTDB keys may not contain . # $ [ ] / — normalize team codes so any input is safe.
function sanitizeCode(s) { return (String(s || '').trim().replace(/[.#$\[\]\/\s]+/g, '-').replace(/^-+|-+$/g, '')) || 'local'; }

// ── boot ───────────────────────────────────────────────────────────────────
store.subscribe(() => render());
applyOptClasses();
render();
startSync();
registerSW();

// ═══ rendering ═══════════════════════════════════════════════════════════════
function render() {
  const active = document.querySelector('.screen.is-active');
  const sc = active ? active.scrollTop : 0;
  const st = store.get();
  renderOverview(st);
  renderGantt(st);
  renderMember(st);
  renderConnBadge();
  if (active && document.querySelector('.screen.is-active') === active) active.scrollTop = sc;
}

function masthead(face, title, sub) {
  return `<div class="mast-kick"><div class="kick">チーム進行管理</div><div class="face">${face}</div></div>
  <div class="mast-title">${esc(title)}</div>
  <div class="mast-sub">${sub}</div>
  <div class="rule-thick"></div><div class="rule-thin"></div>`;
}

// ── 01 概要 ──
function renderOverview(st) {
  const s = deriveSummary(st);
  const week = isoWeek(TODAY);
  const sub = `${jpFull(TODAY)} ・ 第${week}週 ・ ${s.projects.length}案件 / 全${s.total}タスク ・ メンバー${s.members.length}名`;
  const segOrder = ['done', 'rev', 'run', 'none'];
  const total = Math.max(1, s.total);
  const seg = segOrder.map((k) => `<div style="width:${(s.counts[k] / total) * 100}%;background:${STATUS[k].fill}"></div>`).join('');
  const legend = segOrder.map((k) => `<span class="leg"><i style="background:${STATUS[k].fill}"></i>${STATUS[k].label} ${s.counts[k]}</span>`).join('');
  const n = s.overall;

  const projects = s.projects.map((p) => `
    <div class="proj" data-action="open-project" data-id="${p.id}">
      <div class="proj-head"><div class="proj-name">${esc(p.name)}</div>
        <div class="proj-figs"><span class="proj-pct">${p.pct}%</span><span class="proj-done">完了 ${p.done}/${p.total}</span></div></div>
      ${p.goal ? `<div class="goal opt-goals"><b>最終目標</b>　${esc(p.goal)}</div>` : ''}
      <div class="pbar"><i style="width:${p.pct}%"></i></div>
    </div>`).join('') || emptyHint('案件がありません。設定から追加できます。');

  const load = s.members.map((m) => {
    const sq = m.tasks.map((t) => STATUS[t.status].square === 'dashed'
      ? '<i class="tbd"></i>' : `<i style="background:${STATUS[t.status].square}"></i>`).join('');
    return `<div class="load-row" data-action="pick-member-go" data-id="${m.id}">
      <div class="ava">${esc(m.ini)}</div><div class="load-name">${esc(m.name)}</div>
      <div class="load-sq">${sq}</div>
      <div class="load-count">${m.count}件</div>
      <div class="load-avg">${m.count ? '平均 ' + m.avg + '%' : '—'}</div></div>`;
  }).join('');

  $('#ov-body').innerHTML = masthead('第一面', st.meta.title || 'プロジェクト管理シート', sub) + `
    <div class="sec-1"><div class="sec-label">全体進捗</div>
      <div class="overall">
        <div class="num-wrap"><div class="cmyk-num big-num"><span class="paper">${n}</span>
          <span class="plate plate-c" aria-hidden="true">${n}</span><span class="plate plate-m" aria-hidden="true">${n}</span><span class="plate plate-y" aria-hidden="true">${n}</span></div>
          <span class="pct-sign">%</span></div>
        <div class="overall-right"><div class="seg">${seg}</div><div class="seg-legend">${legend}</div></div>
      </div>
      <div class="overall-note">全${s.total}タスクの平均進捗（${jpDate(TODAY)}時点）</div>
    </div>
    <div class="sec"><div class="sec-label">案件別進捗</div>${projects}</div>
    <div class="sec"><div class="sec-head"><div class="sec-label">メンバー負荷</div>
      <div class="muted" style="font-size:9px">■＝タスク1件（色はステータス）</div></div>
      <div class="load">${load}</div>
      <button class="row-add" data-action="add-member">＋ メンバーを追加</button>
    </div>`;
}

// ── 02 工程表 ──
function renderGantt(st) {
  const g = deriveGantt(st, TODAY);
  const total = st.tasks.length;
  const [sy, sm] = g.winStart.split('-').map(Number);
  const endD = new Date(Date.parse(g.winEnd) - 86400000);
  const range = `${sy}年${sm}月 — ${endD.getUTCMonth() + 1}月`;
  const months = g.months.map((m) => `<div class="g-month" style="left:${m.left}%">${m.label}</div>`).join('');
  const weeks = g.weeks.map((w) => `<div class="g-line" style="left:${w}%"></div>`).join('');
  const monthLines = g.months.filter((m) => m.left > 1).map((m) => `<div class="g-line mid" style="left:${m.left}%"></div>`).join('');

  const rows = g.rows.map((grp) => {
    const bars = grp.bars.map((b) => {
      const inner = b.st.ganttTrack
        ? `<div class="bar" style="left:${b.left}%;width:${b.width}%;background:${b.st.ganttTrack}"><i style="width:${b.task.pct}%;background:${b.st.fill}"></i></div>`
        : `<div class="bar-none" style="left:${b.left}%;width:${b.width}%"></div>`;
      return `<div class="g-row" data-action="open-task" data-id="${b.task.id}">
        <div class="g-label"><span class="ava-sm">${esc(b.ini)}</span><span class="g-title">${esc(b.task.title)}</span></div>
        <div class="g-track">${inner}</div></div>`;
    }).join('');
    return `<div class="g-proj"><div class="g-proj-name">${esc(grp.project.name)}</div><div class="g-proj-pct">進捗 ${grp.pct}%</div></div>
      ${grp.project.goal ? `<div class="g-goal opt-goals">最終目標　${esc(grp.project.goal)}</div>` : ''}${bars}`;
  }).join('') || emptyHint('タスクがありません。＋ボタンから追加できます。');

  const today = (g.todayPct != null && g.todayPct >= 0 && g.todayPct <= 100)
    ? `<div class="g-today"><div class="g-today-line" style="left:${g.todayPct}%"></div>
       <div class="g-today-tag" style="left:${g.todayPct}%">今日 ${(new Date()).getMonth() + 1}/${(new Date()).getDate()}</div></div>` : '';

  $('#ga-body').innerHTML = masthead('第二面', '工程表', `${range} ・ 全${total}タスク ・ 週区切り（月曜）`) + `
    <div class="g-legend">
      <span><i class="none"></i>未着手</span><span><i style="background:var(--color-accent)"></i>進行中</span>
      <span><i style="background:var(--color-accent-2)"></i>レビュー中</span><span><i style="background:var(--color-text)"></i>完了</span></div>
    <div class="gantt">
      <div class="g-overlay">${months}${weeks}${monthLines}</div>
      <div class="g-rows">${rows}</div>${today}
    </div>
    <div class="g-foot">帯の濃い部分＝進捗率 ・ 行頭の丸＝担当者 ・ 行をタップで編集</div>`;
}

// ── 03 メンバー別 ──
function renderMember(st) {
  const s = deriveSummary(st);
  const members = s.members;
  if (!members.length) { $('#me-body').innerHTML = masthead('第三面', 'メンバー別タスク', 'メンバー0名') + emptyHint('メンバーがいません。'); return; }
  if (!members.find((m) => m.id === selMember)) selMember = members[0].id;
  LS.set('pms:sel', selMember);
  const m = members.find((x) => x.id === selMember);
  const next = m.tasks.length ? memberNextDue(m.tasks, TODAY) : null;
  const meta = m.tasks.length
    ? `担当 ${m.count}件 ・ 平均進捗 ${m.avg}% ・ 直近の期限 ${jpDate(next)}` : '担当タスクなし';

  const chips = members.map((x) => `<button class="chip" data-action="pick-member" data-id="${x.id}" aria-pressed="${x.id === selMember}">${esc(x.name)}</button>`).join('');
  const tasks = m.tasks.length ? m.tasks.map((t, i) => {
    const stx = STATUS[t.status];
    const proj = st.projects.find((p) => p.id === t.projectId);
    return `<div class="mv-task" data-action="open-task" data-id="${t.id}">
      <div class="mv-no">${String(i + 1).padStart(2, '0')}</div>
      <div class="mv-main"><div class="mv-proj">${esc(proj ? proj.name : '—')}</div>
        <div class="mv-title">${esc(t.title)}</div>
        <div class="mv-line">
          <span class="${stx.tag} opt-status">${stx.label}</span>
          <span class="mv-due opt-due">期限 ${jpDate(t.end)}</span>
          <span class="mv-spacer"></span>
          <span class="mv-pctnum opt-pct">${t.pct}%</span></div>
        <div class="mv-bar opt-pct"><i style="width:${t.pct}%;background:${stx.fill}"></i></div>
      </div></div>`;
  }).join('') : emptyHint('担当タスクはありません。');

  $('#me-body').innerHTML = masthead('第三面', 'メンバー別タスク', `メンバー${members.length}名 ・ 選択中：${esc(m.name)}`) + `
    <div class="chips">${chips}<button class="chip chip-add" data-action="add-member">＋ 追加</button></div>
    <div class="mv-id"><div class="mv-ava">${esc(m.ini)}</div>
      <div style="min-width:0"><div class="mv-name">${esc(m.name)}</div><div class="mv-meta">${meta}</div></div>
      <button class="mini-btn" data-action="edit-member" data-id="${m.id}">編集</button></div>
    <div class="sec-label" style="margin-top:24px">担当タスク</div>
    <div class="mv-tasks">${tasks}</div>`;
}

function emptyHint(msg) { return `<div class="empty">${esc(msg)}</div>`; }

// ── connection badge ──
function renderConnBadge() {
  const badge = $('#connBadge'); if (!badge) return;
  const cloud = decideMode() === 'firebase';
  let label = 'ローカル', cls = 'c-local';
  if (cloud && connState === 'connecting') { label = '接続中…'; cls = 'c-wait'; }
  else if (cloud && connState === 'synced') { label = 'クラウド同期'; cls = 'c-ok'; }
  else if (cloud && connState === 'error') { label = '接続エラー'; cls = 'c-err'; }
  else { label = 'ローカル'; cls = 'c-local'; }
  badge.className = 'conn-badge ' + cls;
  badge.innerHTML = `<span class="dot"></span>${label}`;
}

// ═══ options (display toggles) ═══════════════════════════════════════════════
function applyOptClasses() {
  const app = $('#app');
  app.classList.toggle('hide-goals', !opts.goals);
  app.classList.toggle('hide-due', !opts.due);
  app.classList.toggle('hide-pct', !opts.pct);
  app.classList.toggle('hide-status', !opts.status);
}

// ═══ navigation ══════════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => { const on = s.id === id; s.classList.toggle('is-active', on); s.hidden = !on; if (on) s.scrollTop = 0; });
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.target === id ? 'true' : 'false'));
}

// ═══ sheets ══════════════════════════════════════════════════════════════════
function openSheet(id) { $('#' + id).classList.add('open'); $('#' + id + 'Back').classList.add('open'); }
function closeSheet(id) { $('#' + id).classList.remove('open'); $('#' + id + 'Back').classList.remove('open'); }

// ── task editor ──
let editingTaskId = null;
function openTaskEditor(task) {
  const st = store.get();
  editingTaskId = task ? task.id : null;
  $('#te-heading').textContent = task ? 'タスクを編集' : '新規タスク';
  $('#te-title').value = task ? task.title : '';
  fillSelect($('#te-project'), st.projects, task ? task.projectId : (st.projects[0] && st.projects[0].id), '案件');
  fillSelect($('#te-member'), st.members, task ? task.memberId : (activeMemberDefault() || (st.members[0] && st.members[0].id)), '担当');
  $('#te-newproj').value = ''; $('#te-newproj').hidden = true;
  $('#te-newmember').value = ''; $('#te-newmember').hidden = true;
  $('#te-start').value = task ? task.start : TODAY;
  $('#te-end').value = task ? task.end : addDays(TODAY, 7);
  setSeg($('#te-status'), task ? task.status : 'none');
  setPct(task ? task.pct : 0);
  $('#te-delete').hidden = !task;
  openSheet('teSheet');
  setTimeout(() => $('#te-title').focus(), 60);
}
function activeMemberDefault() { const active = document.querySelector('.screen.is-active'); return (active && active.id === 's-member') ? selMember : null; }

function fillSelect(sel, items, selected, label) {
  sel.innerHTML = items.map((x) => `<option value="${x.id}" ${x.id === selected ? 'selected' : ''}>${esc(x.name)}</option>`).join('')
    + `<option value="__new">＋ 新規${label}…</option>`;
  if (!items.length) sel.value = '__new';
}
function setSeg(seg, status) { seg.querySelectorAll('.seg-opt').forEach((b) => b.setAttribute('aria-pressed', b.dataset.status === status ? 'true' : 'false')); seg.dataset.value = status; }
function getSeg(seg) { return seg.dataset.value || 'none'; }
function setPct(v) { $('#te-pct').value = v; $('#te-pctlabel').textContent = v + '%'; }

function saveTask() {
  const st = store.get();
  const title = $('#te-title').value.trim();
  if (!title) { $('#te-title').focus(); return; }
  let projectId = $('#te-project').value;
  if (projectId === '__new') {
    const name = $('#te-newproj').value.trim(); if (!name) { $('#te-newproj').hidden = false; $('#te-newproj').focus(); return; }
    projectId = uid('p'); pushPatch(store.upsertProject({ id: projectId, name, goal: '' }));
  }
  let memberId = $('#te-member').value;
  if (memberId === '__new') {
    const name = $('#te-newmember').value.trim(); if (!name) { $('#te-newmember').hidden = false; $('#te-newmember').focus(); return; }
    memberId = uid('m'); pushPatch(store.upsertMember({ id: memberId, name, ini: firstChar(name) }));
  }
  let start = $('#te-start').value || TODAY, end = $('#te-end').value || start;
  if (Date.parse(end) < Date.parse(start)) end = start;
  const status = getSeg($('#te-status'));
  const pct = clampPct(+$('#te-pct').value);
  const t = { id: editingTaskId || uid('t'), projectId, memberId, title, start, end, status, pct };
  pushPatch(store.upsertTask(t));
  closeSheet('teSheet');
}
function deleteTask() {
  if (!editingTaskId) return;
  if (!confirm('このタスクを削除しますか？')) return;
  pushPatch(store.deleteTask(editingTaskId));
  closeSheet('teSheet');
}

// ── entity editor (member / project) ──
function openEntityEditor(kind, entity) {
  const isMember = kind === 'member';
  const title = (entity ? '編集' : '追加') + '：' + (isMember ? 'メンバー' : '案件');
  const body = isMember ? `
    <div class="field"><label>名前</label><input class="input" id="en-name" value="${esc(entity ? entity.name : '')}" placeholder="山田太郎"></div>
    <div class="field"><label>イニシャル（丸に表示・1〜2文字）</label><input class="input" id="en-ini" maxlength="2" value="${esc(entity ? entity.ini : '')}" placeholder="山"></div>
    <div class="field"><label>メールアドレス（期限通知の宛先・任意）</label><input class="input" id="en-email" type="email" value="${esc(entity ? (entity.email || '') : '')}" placeholder="taro@example.com" autocomplete="off"></div>`
    : `
    <div class="field"><label>案件名</label><input class="input" id="en-name" value="${esc(entity ? entity.name : '')}" placeholder="新規プロジェクト"></div>
    <div class="field"><label>最終目標（任意）</label><input class="input" id="en-goal" value="${esc(entity ? entity.goal : '')}" placeholder="例）9月末 リリース"></div>`;
  $('#enSheet').querySelector('.sheet-content').innerHTML = `
    <div class="sheet-grip"></div>
    <div class="sheet-head"><div class="sheet-title">${title}</div><button class="sheet-close" data-action="close-ent">閉じる</button></div>
    ${body}
    <div class="sheet-actions">
      ${entity ? `<button class="btn btn-danger" data-action="del-ent">削除</button>` : '<span></span>'}
      <button class="btn btn-primary" data-action="save-ent">保存</button>
    </div>`;
  $('#enSheet').dataset.kind = kind;
  $('#enSheet').dataset.id = entity ? entity.id : '';
  openSheet('enSheet');
  setTimeout(() => $('#en-name').focus(), 60);
}
function saveEntity() {
  const sheet = $('#enSheet'), kind = sheet.dataset.kind, id = sheet.dataset.id;
  const name = $('#en-name').value.trim(); if (!name) { $('#en-name').focus(); return; }
  if (kind === 'member') {
    const ini = ($('#en-ini').value.trim() || firstChar(name)).slice(0, 2);
    const email = ($('#en-email').value || '').trim();
    pushPatch(store.upsertMember({ id: id || uid('m'), name, ini, email }));
  } else {
    pushPatch(store.upsertProject({ id: id || uid('p'), name, goal: $('#en-goal').value.trim() }));
  }
  closeSheet('enSheet');
}
function deleteEntity() {
  const sheet = $('#enSheet'), kind = sheet.dataset.kind, id = sheet.dataset.id;
  const st = store.get();
  if (kind === 'member') {
    const n = st.tasks.filter((t) => t.memberId === id).length;
    if (!confirm(n ? `このメンバーの担当タスク${n}件は「担当なし」になります。削除しますか？` : '削除しますか？')) return;
    st.tasks.filter((t) => t.memberId === id).forEach((t) => pushPatch(store.upsertTask({ id: t.id, memberId: '' })));
    pushPatch(store.deleteMember(id));
  } else {
    const n = st.tasks.filter((t) => t.projectId === id).length;
    if (n) { alert(`この案件にはタスクが${n}件あります。先にタスクを移動/削除してください。`); return; }
    pushPatch(store.deleteProject(id));
  }
  closeSheet('enSheet');
}

// ── settings ──
function openSettings() { renderSettings(); openSheet('setSheet'); }
function renderSettings() {
  const st = store.get();
  const conn = currentConn();
  const cloud = isConfigured(firebaseConfig);
  const memberList = st.members.map((m) => `<div class="mgr-row"><span class="ava">${esc(m.ini)}</span><span class="mgr-name">${esc(m.name)}</span>
    <button class="mini-btn" data-action="edit-member" data-id="${m.id}">編集</button></div>`).join('') || '<div class="empty">なし</div>';
  const projList = st.projects.map((p) => `<div class="mgr-row"><span class="mgr-name">${esc(p.name)}</span>
    <button class="mini-btn" data-action="edit-project" data-id="${p.id}">編集</button></div>`).join('') || '<div class="empty">なし</div>';
  const optRow = (key, name, desc) => `<div class="opt-row"><div class="opt-row-text"><div class="opt-row-name">${name}</div><div class="opt-row-desc">${desc}</div></div>
    <label class="sw"><input type="checkbox" data-opt="${key}" ${opts[key] ? 'checked' : ''}><span class="track"></span><span class="knob"></span></label></div>`;

  $('#setSheet').querySelector('.sheet-content').innerHTML = `
    <div class="sheet-grip"></div>
    <div class="sheet-head"><div class="sheet-title">設定</div><button class="sheet-close" data-action="close-set">閉じる</button></div>

    <div class="opt-group"><div class="opt-group-label">チーム接続</div>
      <div class="conn-box">
        <div class="conn-line"><span class="conn-badge ${connBadgeClass()}"><span class="dot"></span>${connLabelText()}</span></div>
        <div class="field"><label>チームコード（合言葉・全員で共有）</label>
          <div class="conn-row"><input class="input" id="set-code" value="${esc(conn.code)}" placeholder="${cloud ? '例）nyokki-2026' : 'クラウド未設定'}" ${cloud ? '' : 'disabled'}>
          <button class="btn btn-secondary" data-action="join" ${cloud ? '' : 'disabled'}>接続</button></div></div>
        ${cloud ? `<div class="conn-note">同じコードを入れた人どうしで、同じボードをリアルタイム共有します。</div>`
      : `<div class="conn-note">クラウド未設定のためこの端末内のみで動作。<b>README.md「クラウド同期のセットアップ」</b>の手順でFirebaseを設定すると、チームで共有できます。</div>`}
      </div></div>

    <div class="opt-group"><div class="opt-group-label">表示項目</div>
      ${optRow('goals', '最終目標', '案件ごとのゴールを表示')}
      ${optRow('due', '期限', 'メンバー別ビューの期限')}
      ${optRow('pct', '進捗率', 'メンバー別ビューの進捗バー')}
      ${optRow('status', 'ステータス', 'メンバー別ビューの状態タグ')}
    </div>

    <div class="opt-group"><div class="opt-group-label mgr-head">メンバー<button class="mini-btn" data-action="add-member">＋ 追加</button></div>${memberList}</div>
    <div class="opt-group"><div class="opt-group-label mgr-head">案件<button class="mini-btn" data-action="add-project">＋ 追加</button></div>${projList}</div>

    <div class="opt-group"><div class="opt-group-label">データ</div>
      <div class="data-row">
        <button class="btn btn-secondary" data-action="export">エクスポート</button>
        <button class="btn btn-secondary" data-action="import">インポート</button>
        <button class="btn btn-secondary" data-action="reset">サンプルに戻す</button>
      </div>
      <input type="file" id="importFile" accept="application/json" hidden>
    </div>
    <p class="sheet-note">静的モックを実データ化したチーム用アプリ。ステータス色 — 進行中＝シアン / レビュー中＝マゼンタ / 完了＝墨 / 未着手＝破線。</p>`;
}
function connBadgeClass() { const cloud = decideMode() === 'firebase'; if (!cloud) return 'c-local'; return connState === 'synced' ? 'c-ok' : connState === 'connecting' ? 'c-wait' : connState === 'error' ? 'c-err' : 'c-local'; }
function connLabelText() { const cloud = decideMode() === 'firebase'; if (!cloud) return 'ローカル（この端末）'; return connState === 'synced' ? 'クラウド同期中' : connState === 'connecting' ? '接続中…' : connState === 'error' ? '接続エラー（ローカル継続）' : '未接続'; }

async function joinTeam() {
  const raw = $('#set-code').value.trim(); if (!raw) return;
  const code = sanitizeCode(raw); $('#set-code').value = code;
  const conn = currentConn(); conn.code = code; LS.set('pms:conn', conn);
  await sync.connect({ mode: decideMode(), code, config: firebaseConfig });
  renderSettings();
}

// ── data export / import / reset ──
function exportData() {
  const blob = new Blob([JSON.stringify(store.get(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `project-sheet-${TODAY}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function importData(file) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const data = JSON.parse(rd.result);
      if (!data || !Array.isArray(data.tasks)) throw new Error('bad');
      store.replaceAll(data);
      // propagate to team board if connected
      const b = store.toBoard(); Object.entries(b.tasks).forEach(([id, v]) => pushPatch({ path: 'tasks/' + id, value: v }));
      Object.entries(b.members).forEach(([id, v]) => pushPatch({ path: 'members/' + id, value: v }));
      Object.entries(b.projects).forEach(([id, v]) => pushPatch({ path: 'projects/' + id, value: v }));
      renderSettings();
    } catch (e) { alert('読み込めませんでした（JSON形式を確認してください）。'); }
  };
  rd.readAsText(file);
}
function resetSample() {
  if (!confirm('サンプルデータに戻します。よろしいですか？')) return;
  store.resetToSample();
  const b = store.toBoard();
  ['members', 'projects', 'tasks'].forEach((c) => Object.entries(b[c]).forEach(([id, v]) => pushPatch({ path: c + '/' + id, value: v })));
  renderSettings();
}

// ═══ event delegation ═════════════════════════════════════════════════════════
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action, id = el.dataset.id, st = store.get();
  switch (a) {
    case 'tab': showScreen(el.dataset.target); break;
    case 'add-task': openTaskEditor(null); break;
    case 'open-task': openTaskEditor(st.tasks.find((t) => t.id === id)); break;
    case 'pick-member': selMember = id; LS.set('pms:sel', selMember); renderMember(store.get()); break;
    case 'pick-member-go': selMember = id; LS.set('pms:sel', selMember); renderMember(store.get()); showScreen('s-member'); break;
    case 'open-project': openEntityEditor('project', st.projects.find((p) => p.id === id)); break;
    case 'open-settings': openSettings(); break;
    case 'close-set': closeSheet('setSheet'); break;
    case 'close-task': closeSheet('teSheet'); break;
    case 'close-ent': closeSheet('enSheet'); break;
    case 'save-task': saveTask(); break;
    case 'delete-task': deleteTask(); break;
    case 'add-member': openEntityEditor('member', null); break;
    case 'edit-member': openEntityEditor('member', st.members.find((m) => m.id === id)); break;
    case 'add-project': openEntityEditor('project', null); break;
    case 'edit-project': openEntityEditor('project', st.projects.find((p) => p.id === id)); break;
    case 'save-ent': saveEntity(); break;
    case 'del-ent': deleteEntity(); break;
    case 'join': joinTeam(); break;
    case 'export': exportData(); break;
    case 'import': $('#importFile').click(); break;
    case 'reset': resetSample(); break;
  }
});

// status segmented + pct + inline-new inside task editor
$('#te-status').addEventListener('click', (e) => { const b = e.target.closest('.seg-opt'); if (!b) return; setSeg($('#te-status'), b.dataset.status); if (b.dataset.status === 'done') setPct(100); });
$('#te-pct').addEventListener('input', (e) => setPct(clampPct(+e.target.value)));
$('#te-project').addEventListener('change', (e) => { $('#te-newproj').hidden = e.target.value !== '__new'; if (e.target.value === '__new') $('#te-newproj').focus(); });
$('#te-member').addEventListener('change', (e) => { $('#te-newmember').hidden = e.target.value !== '__new'; if (e.target.value === '__new') $('#te-newmember').focus(); });
$('#importFile').addEventListener('change', (e) => { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; });

// settings toggles (delegated change)
document.addEventListener('change', (e) => {
  const inp = e.target.closest('input[data-opt]'); if (!inp) return;
  opts[inp.dataset.opt] = inp.checked; LS.set('pms:opts', opts); applyOptClasses();
});

// backdrops + esc
['te', 'set', 'en'].forEach((k) => $('#' + k + 'SheetBack').addEventListener('click', () => closeSheet(k + 'Sheet')));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ['teSheet', 'setSheet', 'enSheet'].forEach(closeSheet); });

// ═══ helpers ═════════════════════════════════════════════════════════════════
function firstChar(s) { return Array.from(s.trim())[0] || '？'; }
function clampPct(n) { return Math.max(0, Math.min(100, Math.round(n / 5) * 5)); }
function addDays(iso, n) { const d = new Date(Date.parse(iso) + n * 86400000); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }

function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
