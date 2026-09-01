// app.js — NDA管理シート。企業名と締結日を軸に、有効期限の状態まで一覧で追える。
// データはこの端末の localStorage にのみ保存し、CSV / JSON で持ち出す。

const KEY = 'nda-sheet.v1';
const SOON_DAYS = 90;          // 「期限間近」とみなす残日数
const $ = (id) => document.getElementById(id);

const TYPES = {
  mutual: '相互',
  ours: '当社開示',
  theirs: '先方開示',
};

// ── 日付ユーティリティ ────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => isoOf(new Date());

/** 「2025-04-01」「2025/4/1」「2025.4.1」「2025年4月1日」を YYYY-MM-DD に。読めなければ ''。 */
function parseDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/);
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';
  return isoOf(dt);
}

/** 締結日から n 年後の前日を有効期限にする（例: 2025-04-01 + 1年 → 2026-03-31）。 */
function addYears(iso, years) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y + years, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return isoOf(dt);
}

/** 今日から iso までの残日数（過去ならマイナス）。 */
function daysUntil(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - base) / 86400000);
}

const fmtJp = (iso) => (iso ? iso.replace(/-/g, '/') : '—');

// ── データ ────────────────────────────────────────────────
/** @typedef {{id:string,company:string,signedOn:string,expiresOn:string,autoRenew:boolean,
 *   type:string,purpose:string,owner:string,counterpart:string,docUrl:string,note:string,updatedAt:string}} Nda */

const newId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function normalize(raw) {
  const rec = raw && typeof raw === 'object' ? raw : {};
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  return {
    id: str(rec.id, 40) || newId(),
    company: str(rec.company, 120),
    signedOn: parseDate(rec.signedOn),
    expiresOn: parseDate(rec.expiresOn),
    autoRenew: rec.autoRenew === true,
    type: Object.hasOwn(TYPES, rec.type) ? rec.type : 'mutual',
    purpose: str(rec.purpose, 120),
    owner: str(rec.owner, 60),
    counterpart: str(rec.counterpart, 60),
    docUrl: str(rec.docUrl, 300),
    note: str(rec.note, 500),
    updatedAt: str(rec.updatedAt, 30) || new Date().toISOString(),
  };
}

/** @type {Nda[]} */
let items = load();
const view = { q: '', filter: 'all', sort: 'signed-desc' };

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalize).filter((r) => r.company);
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    toast('保存できませんでした（ブラウザの保存容量を確認してください）', true);
  }
}

// ── 状態の判定 ────────────────────────────────────────────
/** 有効期限と自動更新から、表示用の状態を決める。 */
function statusOf(rec) {
  if (rec.autoRenew) return { key: 'auto', label: '自動更新' };
  if (!rec.expiresOn) return { key: 'none', label: '期限未設定' };
  const left = daysUntil(rec.expiresOn);
  if (left < 0) return { key: 'over', label: '期限切れ', left };
  if (left <= SOON_DAYS) return { key: 'soon', label: '期限間近', left };
  return { key: 'live', label: '有効', left };
}

function remainText(rec) {
  if (!rec.expiresOn) return rec.autoRenew ? '解約の申し出まで有効' : '';
  const left = daysUntil(rec.expiresOn);
  if (left < 0) return `${-left}日超過`;
  if (left === 0) return '本日まで';
  return `あと${left}日`;
}

// ── 絞り込み・並び替え ────────────────────────────────────
function visibleItems() {
  const q = view.q.trim().toLowerCase();
  let list = items.filter((rec) => {
    if (view.filter !== 'all' && statusOf(rec).key !== view.filter) return false;
    if (!q) return true;
    return [rec.company, rec.purpose, rec.owner, rec.counterpart, rec.note]
      .join('\n').toLowerCase().includes(q);
  });

  const byCompany = (a, b) => a.company.localeCompare(b.company, 'ja');
  const cmp = {
    'signed-desc': (a, b) => b.signedOn.localeCompare(a.signedOn) || byCompany(a, b),
    'signed-asc': (a, b) => a.signedOn.localeCompare(b.signedOn) || byCompany(a, b),
    // 期限なしは末尾に置く
    'expire-asc': (a, b) => (a.expiresOn || '9999').localeCompare(b.expiresOn || '9999') || byCompany(a, b),
    'company-asc': (a, b) => byCompany(a, b) || a.signedOn.localeCompare(b.signedOn),
  }[view.sort];

  list = list.slice().sort(cmp);
  return list;
}

// ── 描画 ──────────────────────────────────────────────────
function render() {
  renderStats();
  renderSheet();
  renderCompanies();
}

function renderStats() {
  const counts = { over: 0, soon: 0 };
  for (const rec of items) {
    const key = statusOf(rec).key;
    if (key === 'over' || key === 'soon') counts[key] += 1;
  }
  const companies = new Set(items.map((r) => r.company)).size;
  const cards = [
    { cls: '', num: items.length, label: 'NDA 件数' },
    { cls: 'live', num: companies, label: '取引先（社数）' },
    { cls: 'soon', num: counts.soon, label: `${SOON_DAYS}日以内に期限` },
    { cls: 'over', num: counts.over, label: '期限切れ' },
  ];
  $('stats').innerHTML = cards
    .map((c) => `<div class="stat ${c.cls}"><b>${c.num}</b><span>${c.label}</span></div>`)
    .join('');
}

function renderSheet() {
  const list = visibleItems();
  const sheet = $('sheet');

  if (!items.length) {
    sheet.innerHTML = `<div class="empty">
      <p>まだNDAが登録されていません。<br>「＋ NDAを追加」から企業名と締結日を登録してください。</p>
      <button class="btn" id="emptyAdd" type="button">最初のNDAを追加</button></div>`;
    $('emptyAdd').addEventListener('click', () => openEditor(null));
    return;
  }
  if (!list.length) {
    sheet.innerHTML = '<div class="empty"><p>条件に合うNDAがありません。</p></div>';
    return;
  }

  const rows = list.map((rec) => {
    const st = statusOf(rec);
    const remain = remainText(rec);
    return `<tr data-id="${rec.id}" tabindex="0">
      <td class="c-main" data-label="企業名">
        <div class="c-company">${esc(rec.company)}</div>
        ${rec.purpose ? `<div class="c-purpose">${esc(rec.purpose)}</div>` : ''}
      </td>
      <td class="date" data-label="締結日">${fmtJp(rec.signedOn)}</td>
      <td class="date" data-label="有効期限">${fmtJp(rec.expiresOn)}
        ${remain ? `<div class="sub">${esc(remain)}</div>` : ''}</td>
      <td data-label="状態"><span class="badge ${st.key}">${st.label}</span></td>
      <td data-label="種別">${TYPES[rec.type]}</td>
      <td data-label="自社担当">${esc(rec.owner) || '<span class="sub">—</span>'}</td>
      <td class="c-act"><button class="edit" type="button" data-edit="${rec.id}">編集</button></td>
    </tr>`;
  }).join('');

  sheet.innerHTML = `<table>
    <thead><tr>
      <th>企業名 / 目的</th><th>締結日</th><th>有効期限</th><th>状態</th><th>種別</th><th>自社担当</th><th></th>
    </tr></thead>
    <tbody>${rows}</tbody></table>`;
}

function renderCompanies() {
  const names = [...new Set(items.map((r) => r.company))].sort((a, b) => a.localeCompare(b, 'ja'));
  $('companies').innerHTML = names.map((n) => `<option value="${esc(n)}"></option>`).join('');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── 追加・編集 ────────────────────────────────────────────
let editingId = null;

function openEditor(id) {
  editingId = id;
  const rec = id ? items.find((r) => r.id === id) : null;
  $('editorTitle').textContent = rec ? 'NDAを編集' : 'NDAを追加';
  $('f-company').value = rec?.company ?? '';
  $('f-signed').value = rec?.signedOn ?? todayIso();
  $('f-expires').value = rec?.expiresOn ?? '';
  $('f-auto').checked = rec?.autoRenew ?? false;
  $('f-type').value = rec?.type ?? 'mutual';
  $('f-owner').value = rec?.owner ?? '';
  $('f-purpose').value = rec?.purpose ?? '';
  $('f-counterpart').value = rec?.counterpart ?? '';
  $('f-doc').value = rec?.docUrl ?? '';
  $('f-note').value = rec?.note ?? '';
  $('f-expires').min = $('f-signed').value;
  $('btnDelete').hidden = !rec;
  $('editor').showModal();
  $('f-company').focus();
}

function commitEditor() {
  const draft = normalize({
    id: editingId ?? undefined,
    company: $('f-company').value,
    signedOn: $('f-signed').value,
    expiresOn: $('f-expires').value,
    autoRenew: $('f-auto').checked,
    type: $('f-type').value,
    owner: $('f-owner').value,
    purpose: $('f-purpose').value,
    counterpart: $('f-counterpart').value,
    docUrl: $('f-doc').value,
    note: $('f-note').value,
    updatedAt: new Date().toISOString(),
  });
  if (!draft.company || !draft.signedOn) {
    toast('企業名と締結日は必須です', true);
    return;
  }
  const at = items.findIndex((r) => r.id === draft.id);
  if (at >= 0) items[at] = draft; else items.push(draft);
  save();
  render();
  toast(at >= 0 ? '更新しました' : `${draft.company} のNDAを追加しました`);
}

function removeEditing() {
  const rec = items.find((r) => r.id === editingId);
  if (!rec) return;
  if (!confirm(`${rec.company}（締結日 ${fmtJp(rec.signedOn)}）を削除します。よろしいですか？`)) return;
  items = items.filter((r) => r.id !== rec.id);
  save();
  render();
  toast('削除しました');
}

// ── CSV ───────────────────────────────────────────────────
const CSV_HEADERS = ['企業名', '締結日', '有効期限', '自動更新', '種別', '目的・案件名', '自社担当', '先方窓口', '原本の保管先', '備考', '状態'];

const HEADER_ALIASES = {
  company: ['企業名', '会社名', '相手方', '取引先', 'company'],
  signedOn: ['締結日', '契約日', '締結年月日', '日付', 'signedon', 'date'],
  expiresOn: ['有効期限', '満了日', '終了日', '期限', 'expireson', 'expiry'],
  autoRenew: ['自動更新', 'autorenew'],
  type: ['種別', '区分', 'type'],
  purpose: ['目的・案件名', '目的', '案件名', '案件', 'purpose'],
  owner: ['自社担当', '担当', '担当者', 'owner'],
  counterpart: ['先方窓口', '先方担当', 'counterpart'],
  docUrl: ['原本の保管先', '保管先', '原本', 'url', 'docurl'],
  note: ['備考', 'メモ', 'note'],
};

/** RFC4180 相当の最小CSVパーサ。戻り値は行×列の二次元配列。 */
function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const csvCell = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function exportCsv() {
  // いま画面に出ている（絞り込み後の）内容をそのまま書き出す。
  const list = visibleItems();
  if (!list.length) { toast('書き出すデータがありません', true); return; }
  const lines = [CSV_HEADERS.join(',')];
  for (const rec of list) {
    lines.push([
      rec.company, rec.signedOn, rec.expiresOn, rec.autoRenew ? '○' : '',
      TYPES[rec.type], rec.purpose, rec.owner, rec.counterpart, rec.docUrl,
      rec.note.replace(/\n/g, ' '), statusOf(rec).label,
    ].map((v) => csvCell(String(v ?? ''))).join(','));
  }
  // Excel でそのまま開けるよう BOM 付き UTF-8。
  download(`nda-${todayIso()}.csv`, `﻿${lines.join('\r\n')}`, 'text/csv');
  toast(`${list.length}件をCSVに書き出しました`);
}

function importCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) { toast('読み込める行がありませんでした', true); return; }

  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/\s/g, ''));
  const col = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    col[field] = head.findIndex((h) => aliases.includes(h));
  }
  if (col.company < 0 || col.signedOn < 0) {
    toast('「企業名」と「締結日」の列が見つかりません', true);
    return;
  }

  const typeOf = (v) => {
    const s = String(v ?? '').trim();
    if (/相互|双方|mutual/i.test(s)) return 'mutual';
    if (/当社|自社|ours/i.test(s)) return 'ours';
    if (/先方|相手|theirs/i.test(s)) return 'theirs';
    return 'mutual';
  };
  const truthy = (v) => /^(○|◯|o|yes|true|はい|あり|1)$/i.test(String(v ?? '').trim());
  const cell = (row, idx) => (idx >= 0 ? row[idx] ?? '' : '');

  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const rec = normalize({
      company: cell(row, col.company),
      signedOn: cell(row, col.signedOn),
      expiresOn: cell(row, col.expiresOn),
      autoRenew: truthy(cell(row, col.autoRenew)),
      type: typeOf(cell(row, col.type)),
      purpose: cell(row, col.purpose),
      owner: cell(row, col.owner),
      counterpart: cell(row, col.counterpart),
      docUrl: cell(row, col.docUrl),
      note: cell(row, col.note),
    });
    if (!rec.company || !rec.signedOn) { skipped += 1; continue; }
    // 企業名＋締結日が同じ行は同一のNDAとみなして上書きする。
    const at = items.findIndex((r) => r.company === rec.company && r.signedOn === rec.signedOn);
    if (at >= 0) { rec.id = items[at].id; items[at] = rec; updated += 1; } else { items.push(rec); added += 1; }
  }
  save();
  render();
  toast(`追加 ${added}件 / 更新 ${updated}件${skipped ? ` / 取り込めず ${skipped}件` : ''}`);
}

// ── JSON ──────────────────────────────────────────────────
function exportJson() {
  download(`nda-backup-${todayIso()}.json`, JSON.stringify(items, null, 2), 'application/json');
  toast('JSONを書き出しました');
}

function importJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    toast('JSONを読み取れませんでした', true);
    return;
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(list)) { toast('NDAの配列が入っていません', true); return; }
  if (items.length && !confirm(`いまの ${items.length} 件を、読み込んだ内容で置き換えます。よろしいですか？`)) return;
  items = list.map(normalize).filter((r) => r.company && r.signedOn);
  save();
  render();
  toast(`${items.length}件を読み込みました`);
}

function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFile(input, onText) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => onText(String(reader.result ?? ''));
  reader.onerror = () => toast('ファイルを読めませんでした', true);
  reader.readAsText(file, 'utf-8');
  input.value = '';
}

// ── サンプル ──────────────────────────────────────────────
function loadSample() {
  if (items.length && !confirm('いまのデータをサンプルで置き換えます。よろしいですか？')) return;
  const y = new Date().getFullYear();
  items = [
    { company: '株式会社あおば商事', signedOn: `${y - 1}-04-10`, expiresOn: `${y + 1}-04-09`, type: 'mutual', purpose: '共同キャンペーンの検討', owner: '営業部 山田', counterpart: '経営企画室 佐藤様' },
    { company: 'みなとテクノロジー株式会社', signedOn: `${y}-01-22`, autoRenew: true, type: 'ours', purpose: '受発注システムの改修', owner: '情報システム部 鈴木' },
    { company: '合同会社ひなたデザイン', signedOn: `${y - 2}-09-01`, expiresOn: `${y - 1}-08-31`, type: 'theirs', purpose: 'ロゴ制作の見積依頼', owner: '広報 田中', note: '期限切れ。継続取引なら再締結が必要。' },
    { company: '北山物流株式会社', signedOn: `${y}-06-15`, expiresOn: isoOf(new Date(Date.now() + 45 * 86400000)), type: 'mutual', purpose: '倉庫の共同利用', owner: '購買部 高橋' },
  ].map(normalize);
  save();
  render();
  toast('サンプルを読み込みました');
}

// ── トースト ──────────────────────────────────────────────
let toastTimer = 0;
function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('err', isError);
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
}

// ── イベント ──────────────────────────────────────────────
$('btnAdd').addEventListener('click', () => openEditor(null));

$('btnMenu').addEventListener('click', () => {
  const menu = $('menu');
  menu.hidden = !menu.hidden;
  $('btnMenu').setAttribute('aria-expanded', String(!menu.hidden));
});

$('sheet').addEventListener('click', (ev) => {
  const row = ev.target.closest('tr[data-id]');
  if (row) openEditor(row.dataset.id);
});
$('sheet').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  const row = ev.target.closest?.('tr[data-id]');
  if (row) { ev.preventDefault(); openEditor(row.dataset.id); }
});

$('q').addEventListener('input', (ev) => { view.q = ev.target.value; renderSheet(); });
$('sort').addEventListener('change', (ev) => { view.sort = ev.target.value; renderSheet(); });
$('chips').addEventListener('click', (ev) => {
  const chip = ev.target.closest('.chip');
  if (!chip) return;
  view.filter = chip.dataset.filter;
  for (const c of $('chips').children) {
    const on = c === chip;
    c.classList.toggle('is-on', on);
    c.setAttribute('aria-selected', String(on));
  }
  renderSheet();
});

$('f-signed').addEventListener('change', () => { $('f-expires').min = $('f-signed').value; });

// 有効期限が締結日より前なら保存させない（dialog を閉じずに差し戻す）。
$('form').addEventListener('submit', (ev) => {
  if (ev.submitter?.value !== 'save') return;
  const signed = $('f-signed').value;
  const expires = $('f-expires').value;
  if (expires && signed && expires < signed) {
    ev.preventDefault();
    toast('有効期限が締結日より前になっています', true);
  }
});

$('quickTerm').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-years]');
  if (!btn) return;
  const years = Number(btn.dataset.years);
  if (!years) { $('f-expires').value = ''; return; }
  const signed = $('f-signed').value || todayIso();
  $('f-expires').value = addYears(signed, years);
});

// dialog の submit ボタンは値で処理を分ける（キャンセル・削除は入力検証を通さない）。
for (const btn of $('form').querySelectorAll('button[value="cancel"], button[value="delete"]')) {
  btn.formNoValidate = true;
}
$('editor').addEventListener('close', () => {
  const action = $('editor').returnValue;
  if (action === 'save') commitEditor();
  if (action === 'delete') removeEditing();
  editingId = null;
});

$('btnExportCsv').addEventListener('click', exportCsv);
$('btnExportJson').addEventListener('click', exportJson);
$('btnImportCsv').addEventListener('click', () => $('fileCsv').click());
$('btnImportJson').addEventListener('click', () => $('fileJson').click());
$('fileCsv').addEventListener('change', (ev) => readFile(ev.target, importCsv));
$('fileJson').addEventListener('change', (ev) => readFile(ev.target, importJson));
$('btnPrint').addEventListener('click', () => window.print());
$('btnSample').addEventListener('click', loadSample);
$('btnClear').addEventListener('click', () => {
  if (!items.length) { toast('データはありません'); return; }
  if (!confirm(`登録されている ${items.length} 件すべてを削除します。よろしいですか？`)) return;
  items = [];
  save();
  render();
  toast('すべて削除しました');
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'n' && !ev.metaKey && !ev.ctrlKey && !ev.altKey
      && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    ev.preventDefault();
    openEditor(null);
  }
});

render();
