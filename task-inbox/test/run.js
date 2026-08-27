/**
 * task-inbox のロジック検証（Apps Script をモックして Node で実行）
 *
 *   node task-inbox/test/run.js
 *
 * ネットワークにも実際のスプレッドシートにも触らないので、いつでも安全に流せる。
 * Claude API は呼ばず、簡易パーサ／シート書き込み側の経路を検証する。
 */
require('./gasmock.js');
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..');
for (const f of ['Config', 'Parse', 'SheetIO', 'WebApp', 'Chatbots']) {
  eval(fs.readFileSync(path.join(SRC, f + '.gs'), 'utf8'));
}

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + '  ' + m); if (!c) fail++; };
const E = '';

// 「今日」を 2026-08-27(木) に固定して日付まわりを決定的にする
const RealDate = Date;
const FIXED = new RealDate(2026, 7, 27, 10, 0, 0);
global.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FIXED.getTime()])); }
  static now() { return FIXED.getTime(); }
};

console.log('\n[1] メンバー名の表記ゆれ');
[['友井さん', '友井'], ['トモイ', '友井'], ['友井大勢', '友井'], ['滝川共香', '共香'],
 ['ともか', '共香'], ['岡野百合乃', '岡野'], ['たけだ', '竹田'], ['山田', '']].forEach(([q, exp]) => {
  const m = findMember_(q);
  ok((m ? m.key : '') === exp, `"${q}" → ${m ? m.key : '(なし)'}　期待:${exp || '(なし)'}`);
});

console.log('\n[2] 日本語の期限表現 → 実日付');
[['今月中までに', '2026-08-31'], ['月末まで', '2026-08-31'], ['明日中', '2026-08-28'],
 ['来週', '2026-09-04'], ['9/4まで', '2026-09-04'], ['9月末', '2026-09-30'],
 ['3日後', '2026-08-30'], ['来月末', '2026-09-30'], ['特になし', '']].forEach(([q, exp]) => {
  const r = ruleDue_(q);
  ok(r.date === exp, `"${q}" → ${r.date || '(なし)'}　期待:${exp || '(なし)'}`);
});

console.log('\n[3] 簡易パーサ（実例）');
const EXAMPLE = '友井さんへ。今月中までに、弟子屈で使えそうな補助金を全部洗い出して欲しい。' +
                '特に新しい車を買うための助成金や補助金は急いで探して欲しい。';
{
  const t = ruleParse_(EXAMPLE, '智春').tasks[0];
  console.log('    →', JSON.stringify(t));
  ok(t.assignee === '友井', '担当者 = 友井');
  ok(t.due === '2026-08-31', '期限 = 2026-08-31（今月中）');
  ok(t.priority === '高', '優先度 = 高（「特に」「急いで」）');
  ok(t.requester === '智春', '依頼者 = 智春（既定値）');
  ok(!/さんへ|今月中/.test(t.title), `タスク名から宛先・期限が除かれている: "${t.title}"`);
}

/* ---- 実シートのレイアウトを再現して、列検出と追記位置を確かめる ---- */
const header = ['プロジェクト', 'タスク', 'タスク詳細', '期限', '状況'];
const tomo = __mkSheet('智春', [
  ['滝川智春さん タスク一覧（プロジェクト別）'],
  ['※プロジェクト分類は…', E, E, E, E, '竹田', '岡野', '智春', '共香', '友井'],
  [], header,
  ['予算・経営管理', '予算最終計画完成', E, '8月末'],
  ['', 'システム・財務関連の整備', E, '8月末'],
  ['冬季対策', '冬対策', E, '9月中旬'],
], [{ r: 5, c: 1, nr: 2, nc: 1 }]);            // A5:A6 が結合セル
const tomoka = __mkSheet('共香', [             // 表が B 列から始まる（1列ずれ）
  [E, '滝川共香さん タスク一覧（プロジェクト別）'],
  [E, '※…', E, E, E, E, '竹田', '岡野', '智春', '共香', '友井'],
  [], [E].concat(header),
  ['弟子屈', '施設・設備整備', '・トビラフォンの開通'],
  [E, '広報・PR', '・veryの更新', E, '9/4'],
  [], [],
  ['不動産', '開田高原', '母屋　建築確認台帳取得', E, '9/4'],   // 下部の別ブロック
  ['BASE', 'BASE施設', 'リロの会議室への掲載'],
]);
const tomoi = __mkSheet('友井 ', [             // タブ名の末尾に空白（実物どおり）
  ['友井大勢さん タスク一覧（プロジェクト別）'],
  ['※…', E, E, E, E, '竹田', '岡野', '智春', '共香', '友井'],
  [], header,
  ['nuppukotte', 'nuppukotte棚卸と統計情報システム', E, new Date(2026, 8, 4)],
]);
const okano = __mkSheet('岡野', [['岡野百合乃 タスク一覧'], ['※…'], [], header]);
const genpon = __mkSheet('原本', [['　さん タスク一覧（プロジェクト別）'], ['※…'], [], header]);
__setSS([tomo, tomoka, tomoi, okano, genpon]);

console.log('\n[4] 見出し行と列の自動検出');
[[tomo, 4, 1, '智春（A列start）'], [tomoka, 4, 2, '共香（B列start＝1列ずれ）'], [tomoi, 4, 1, '友井']]
  .forEach(([sh, hr, pc, label]) => {
    const m = mapColumns_(sh);
    ok(!!m && m.headerRow === hr && m.cols.project === pc,
       `${label}: 見出し行=${m && m.headerRow} プロジェクト列=${m && m.cols.project} 期限列=${m && m.cols.due}`);
  });

console.log('\n[5] 末尾に空白のあるタブ名を引ける');
ok(matchSheetName_('友井') === tomoi, '"友井" → 実タブ "友井 " に解決');

console.log('\n[6] 追記先の行（結合セル・下部ブロックを避ける）');
ok(findAppendRow_(tomo, mapColumns_(tomo)) === 8, `智春: ${findAppendRow_(tomo, mapColumns_(tomo))}行目（データ末尾7の次）`);
ok(findAppendRow_(tomoka, mapColumns_(tomoka)) === 11, `共香: ${findAppendRow_(tomoka, mapColumns_(tomoka))}行目（下部ブロック10の次）`);

console.log('\n[7] 個人タブへの転記内容');
{
  const r = appendToPersonSheet_(findMember_('友井'), {
    assignee: '友井', requester: '智春', project: '補助金', title: '弟子屈で使える補助金の洗い出し',
    detail: '新車購入向けの助成金を優先', due: '2026-08-31', dueText: '今月中', priority: '高'
  });
  ok(r.ok && r.sheet === '友井', `転記先: ${r.sheet} ${r.row}行目`);
  ok(tomoi.getRange(r.row, 1).getValue() === '補助金', 'A列 = プロジェクト');
  ok(tomoi.getRange(r.row, 2).getValue() === '弟子屈で使える補助金の洗い出し', 'B列 = タスク名');
  const det = tomoi.getRange(r.row, 3).getValue();
  ok(det.includes('【急ぎ】') && det.includes('智春さん依頼'), `C列 = 詳細 → "${det}"`);
  const due = tomoi.getRange(r.row, 4).getValue();
  ok(due instanceof RealDate && due.getMonth() === 7 && due.getDate() === 31, `D列 = 期限（日付型） → ${due}`);
  ok(tomoi.getRange(r.row, 5).getValue() === '', 'E列 = 状況は空のまま（＝未着手）');
}

console.log('\n[8] タブが無いメンバーは「原本」から自動生成');
{
  const before = SpreadsheetApp.getActive().getSheets().length;
  const r = appendToPersonSheet_(findMember_('竹田'),
    { assignee: '竹田', title: 'テスト', project: '', detail: '', due: '', dueText: '', priority: '中' });
  ok(r.ok && SpreadsheetApp.getActive().getSheets().length === before + 1, `新タブ作成: ${r.sheet} ${r.row}行目`);
}

console.log('\n[9] 投稿 → 解析 → 転記 のエンドツーエンド');
const r9 = ingest_(EXAMPLE, '智春', 'LINE');
ok(r9.results.length === 1 && r9.results[0].wrote, `${r9.results.length}件を ${r9.results[0].sheet} タブへ転記`);
const inbox = SpreadsheetApp.getActive().getSheetByName('受信箱');
ok(!!inbox, '「受信箱」タブが自動生成された');
{
  const hdr = inbox.getRange(1, 1, 1, INBOX_HEADERS.length).getDisplayValues()[0];
  ok(hdr[0] === 'ID' && hdr[14] === '元メッセージ', '受信箱の見出し: ' + hdr.slice(0, 8).join(' / ') + ' …');
  const row = inbox.getRange(2, 1, 1, INBOX_HEADERS.length).getDisplayValues()[0];
  ok(row[2] === 'LINE' && row[3] === '智春' && row[4] === '友井', `経路=${row[2]} 依頼者=${row[3]} 担当=${row[4]}`);
  ok(row[11] === '転記済' && row[12].startsWith('友井'), `状況=${row[11]} 転記先=${row[12]}`);
  ok(row[14] === EXAMPLE, '元メッセージが原文のまま保存されている');
}

console.log('\n[10] チャットに返る文面');
console.log('  ----------------------------------------');
console.log(formatResultText_(r9).split('\n').map(l => '  ' + l).join('\n'));
console.log('  ----------------------------------------');

console.log('\n[11] 宛先が無い投稿は保留し、担当者を勝手に決めない');
{
  const r = ingest_('来週までに新しい名刺のデザイン案を用意する', '', 'web');
  ok(r.results.length === 1 && !r.results[0].wrote, '個人タブには書かず保留: ' + (r.results[0].reason || ''));
  ok(inbox.getRange(inbox.getLastRow(), 12).getDisplayValue() === '要確認', '受信箱の状況 = 要確認');
}

console.log('\n[12] 依頼が無い投稿');
ok(formatResultText_({ results: [], note: '' }).indexOf('読み取れませんでした') > 0, '案内文を返す');

global.Date = RealDate;
console.log(fail ? `\n${fail} 件が失敗しました` : '\nすべて成功しました');
process.exitCode = fail ? 1 : 0;
