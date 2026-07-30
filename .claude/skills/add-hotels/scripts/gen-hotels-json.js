/* api/hotels.json（静的API）を assets/js/data.js から生成する。
   使い方: node .claude/skills/add-hotels/scripts/gen-hotels-json.js

   なぜスクリプト化するか:
   data.js は末尾の forEach で派生フラグ（hasFreeKashikiri / noRoomBath /
   someNoRoomBath）を実行時に計算する。hotels.json を手で writeしていた頃は
   この派生分が中途半端に焼き込まれ、data.js に派生フラグが増えても
   hotels.json 側は古いまま、という形でズレていた。
   data.js を読み込んで実際の HOTELS をそのまま書き出せばズレようがない。

   外部consumer は data.js の forEach を実行できないので、派生フラグは
   意図的に含めている（hotels.json 単体で客室浴室の有無が判断できる）。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');

global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'assets/js/config.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'assets/js/data.js'), 'utf8'));
const HOTELS = global.window.YUBUNE.data.HOTELS;

/* data.js が持つ風景SVGジェネレータは関数なのでJSONに載らない。
   HOTELS の各レコードは素のデータなので、そのまま出せる。 */
const out = {
  meta: {
    service: '湯船トラベル',
    note: '風呂・トイレ別の客室に特化した宿データ(公開情報を基にした参考値)。最新情報は各施設の公式サイトを確認してください。',
    license: '出典は各ホテルの sources を参照',
    count: HOTELS.length,
  },
  hotels: HOTELS,
};

const dest = path.join(ROOT, 'api/hotels.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
console.log('api/hotels.json generated (' + HOTELS.length + ' hotels)');

/* 掲載基準の自己点検。ユニットバスの客室を載せないのがこのサイトの前提なので、
   洗い場が無い・浴室タイプが空のレコードは出力後に警告する。 */
const warn = [];
HOTELS.forEach((h) => {
  if (!h.sources || !h.sources.length) warn.push(h.id + ': sources が空');
  if (h.uncertain == null) warn.push(h.id + ': uncertain が未設定');
  (h.rooms || []).forEach((r) => {
    if (!r.bath || !r.bath.type) warn.push(h.id + '/' + r.id + ': bath.type が空');
  });
});
if (warn.length) {
  console.log('\n[要確認] ' + warn.length + '件:');
  warn.forEach((w) => console.log('  - ' + w));
}
