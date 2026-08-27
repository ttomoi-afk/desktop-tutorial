/**
 * Config.gs — 設定・メンバー名簿・共通ユーティリティ
 *
 * このスクリプトは「everyタスク管理表」に直付け（コンテナバインド）で動かす前提です。
 * 秘密情報（APIキー・LINEトークン等）はコードに書かず、すべてスクリプトプロパティに入れます。
 *   ファイル > プロジェクトの設定 > スクリプト プロパティ
 */

/** 受信箱（機械が書く正規化タブ）。人が触るタブとは別に必ずここへ全件残す。 */
var SHEET_INBOX = '受信箱';

/** 個人タブのテンプレートになるタブ名（新メンバーのタブはここからコピーして作る） */
var SHEET_TEMPLATE = '原本';

/** 個人タブの見出し行で探す列名。表記ゆれは normalizeHeader_() で吸収する。 */
var COL_KEYS = {
  project: ['プロジェクト', '案件'],
  title:   ['タスク', 'やること', '内容'],
  detail:  ['タスク詳細', '詳細', 'メモ'],
  due:     ['期限', '締切', '納期'],
  status:  ['状況', 'ステータス', '進捗']
};

/** 転記対象外のタブ（旧シート・集計用など） */
var SKIP_SHEETS = ['旧シート', '友井(旧)', SHEET_INBOX, '設定'];

/**
 * メンバー名簿の初期値。実際の運用値はスクリプトプロパティ MEMBERS（JSON）が優先。
 * sheet は実際のタブ名。「友井 」のように末尾に空白が入っていても matchSheetName_() が吸収する。
 */
var DEFAULT_MEMBERS = [
  { key: '智春', full: '滝川智春',   sheet: '智春', aliases: ['滝川智春', '智春さん', 'ともはる', 'トモハル', '滝川智'], lineUserId: '', email: '' },
  { key: '共香', full: '滝川共香',   sheet: '共香', aliases: ['滝川共香', '共香さん', 'ともか', 'トモカ'],              lineUserId: '', email: '' },
  { key: '友井', full: '友井大勢',   sheet: '友井', aliases: ['友井大勢', '友井さん', 'ともい', 'トモイ', '大勢'],       lineUserId: '', email: '' },
  { key: '岡野', full: '岡野百合乃', sheet: '岡野', aliases: ['岡野百合乃', '岡野さん', 'おかの', 'ゆりの', '百合乃'],   lineUserId: '', email: '' },
  { key: '竹田', full: '竹田',       sheet: '竹田', aliases: ['竹田さん', 'たけだ', 'タケダ'],                          lineUserId: '', email: '' }
];

var TZ = 'Asia/Tokyo';

function props_() {
  return PropertiesService.getScriptProperties();
}

function prop_(name, fallback) {
  var v = props_().getProperty(name);
  return (v === null || v === '') ? (fallback === undefined ? '' : fallback) : v;
}

/** 対象スプレッドシート。SPREADSHEET_ID を設定すれば単独スクリプトでも動く。 */
function ss_() {
  var id = prop_('SPREADSHEET_ID', '');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActive();
}

/** 名簿の取得（プロパティ優先、無ければ既定値） */
function getMembers_() {
  var raw = prop_('MEMBERS', '');
  if (raw) {
    try {
      var arr = JSON.parse(raw);
      if (arr && arr.length) return arr;
    } catch (err) {
      console.warn('MEMBERS のJSONが壊れています。既定値を使います: ' + err);
    }
  }
  return DEFAULT_MEMBERS;
}

function setMembers_(arr) {
  props_().setProperty('MEMBERS', JSON.stringify(arr));
}

/** 全角/半角・空白・記号のゆれを潰した比較用キー */
function norm_(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/[！-～]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/[\s　_\-・､、,.。]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * 表記ゆれを許して名簿から1人を引く。
 * 「友井さんへ」「トモイ」「友井大勢」いずれでも当たるよう、別名・部分一致まで見る。
 */
function findMember_(nameLike) {
  var q = norm_(nameLike);
  if (!q) return null;
  var members = getMembers_();
  var i, m, j;

  // 1) キー・氏名・別名の完全一致
  for (i = 0; i < members.length; i++) {
    m = members[i];
    if (norm_(m.key) === q || norm_(m.full) === q) return m;
    for (j = 0; j < (m.aliases || []).length; j++) {
      if (norm_(m.aliases[j]) === q) return m;
    }
  }
  // 2) 部分一致（「友井大勢さん」→ 友井 など）
  for (i = 0; i < members.length; i++) {
    m = members[i];
    var cands = [m.key, m.full].concat(m.aliases || []);
    for (j = 0; j < cands.length; j++) {
      var c = norm_(cands[j]);
      if (c && (q.indexOf(c) >= 0 || c.indexOf(q) >= 0)) return m;
    }
  }
  return null;
}

/** LINE の userId から送信者を特定する（設定 → メンバーの lineUserId） */
function findMemberByLineId_(userId) {
  if (!userId) return null;
  var members = getMembers_();
  for (var i = 0; i < members.length; i++) {
    if (members[i].lineUserId && members[i].lineUserId === userId) return members[i];
  }
  return null;
}

function findMemberByEmail_(email) {
  if (!email) return null;
  var members = getMembers_();
  var q = String(email).toLowerCase().trim();
  for (var i = 0; i < members.length; i++) {
    if ((members[i].email || '').toLowerCase().trim() === q) return members[i];
  }
  return null;
}

function todayStr_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function nowStr_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
}

/** 'YYYY-MM-DD' を Date に。空や不正値は null。 */
function toDate_(ymd) {
  if (!ymd) return null;
  var m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}
