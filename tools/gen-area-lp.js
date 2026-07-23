/* エリアLP(SEOページ)と sitemap.xml の生成スクリプト
   使い方: node tools/gen-area-lp.js tokyo
   data.js / config.js を読み、静的HTML(検索エンジン向けに本文を焼き込み)を出力する。
   宿データを更新したら再実行して LP を作り直すこと。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BASE = 'https://ttomoi-afk.github.io/desktop-tutorial/';

global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'assets/js/config.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'assets/js/data.js'), 'utf8'));
const D = global.window.YUBUNE.data;
const CFG = global.window.YUBUNE.config;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yen = (n) => '¥' + Number(n).toLocaleString('ja-JP');
const aff = (url) => 'https://hb.afl.rakuten.co.jp/hgc/' + CFG.RAKUTEN_AFFILIATE_ID + '/?pc=' + encodeURIComponent(url) + '&m=' + encodeURIComponent(url);

/* ---------- エリア定義(LPを増やすときはここに追加) ---------- */
const AREAS = {
  tokyo: {
    slug: 'tokyo',
    pref: '東京都',
    name: '東京',
    title: '東京のバストイレ別ホテルおすすめ{N}選【風呂・トイレ別を確認済み】',
    h1: '東京のバストイレ別ホテル おすすめ{N}選',
    metaDesc: '東京で「バストイレ別(風呂・トイレ別)」の客室があるホテルだけを{N}軒厳選。ユニットバスなしで湯船にゆっくり浸かれる、洗い場付き・セパレート浴室のビジネスホテル・シティホテルを公式情報ベースで検証して掲載。大浴場つき・都心の温泉も。素泊まり参考{MIN}円〜。',
    intro: [
      '東京のホテルは浴槽・トイレ・洗面が一体の「ユニットバス」が主流。出張や旅行の夜に「湯船にゆっくり浸かりたい」「トイレとお風呂は分かれていてほしい」と思っても、予約サイトの検索条件では意外と絞り込めません。',
      'このページでは、<strong>浴室とトイレが別々(バストイレ別・セパレート)の客室がある東京のホテルだけを{N}軒</strong>紹介します。掲載にあたっては各ホテルの公式サイト・大手予約サイトの公開情報を照合し、別エージェントによる反証チェック(ユニットバスの証拠探し)まで行ったうえで、「全室セパレート」なのか「一部タイプのみ」なのかも明記しています。',
      '大浴場・サウナつきのビジネスホテルや、都心で温泉の露天風呂に入れる宿も含めています。料金はすべて素泊まり・1名あたりの参考値(変動します)。',
    ],
    faq: [
      { q: '「バストイレ別」と「ユニットバス」の違いは?',
        a: 'ユニットバスは浴槽・トイレ(・洗面)が一体成形の同じ部屋にある構造で、シャワーカーテン越しに床が濡れやすく、湯船にお湯を張って浸かるのに向きません。バストイレ別(セパレート)は浴室とトイレが別の空間に分かれた構造で、洗い場付きなら自宅のお風呂のように「体を洗ってから湯船に浸かる」入り方ができます。' },
      { q: '東京のバストイレ別ホテルの料金相場は?',
        a: 'このページの掲載{N}軒の参考料金は、素泊まり・1名あたり約{MIN}円〜{MAX}円です(時期・プランで大きく変動)。リッチモンドホテルプレミア浅草・ドーミーインPREMIUM神田・由縁新宿などは1万円前後から狙えます。' },
      { q: '大浴場や温泉があるホテルはありますか?',
        a: 'あります。ONSEN RYOKAN 由縁 新宿は最上階の露天風呂で箱根から運んだ温泉に入れます。明神の湯 ドーミーインPREMIUM神田は超軟水の大浴場+露天風呂+高温サウナ、三井ガーデンホテル日本橋プレミアと神宮外苑の杜プレミアにも大浴場があります。' },
      { q: '「全室バストイレ別」のホテルはどれですか?',
        a: 'ホテル八重の翠東京、ホテルミュッセ銀座名鉄、ミレニアム三井ガーデンホテル東京などは(ほぼ)全室が洗い場付きバス・トイレ別です。一方、リッチモンドホテルプレミア浅草はビュー系・コーナー系の客室タイプのみセパレートのため、予約時に客室タイプの確認が必要です。各ホテルの詳細ページに客室ごとの浴室構成を載せています。' },
      { q: 'このサイトから予約できますか?',
        a: '当サイトは送客型の比較サイト(β版)です。予約は楽天トラベルまたは各ホテルの公式サイトで行います。楽天トラベルへのリンクにはアフィリエイト(PR)を利用しており、リンク経由のご予約で当サイトに紹介料が入る場合があります。掲載施設と当サイトに提携・関係はありません。' },
    ],
  },

  osaka: {
    slug: 'osaka',
    pref: '大阪府',
    name: '大阪',
    title: '大阪のバストイレ別ホテルおすすめ{N}選【風呂・トイレ別・大浴場つきも】',
    h1: '大阪のバストイレ別ホテル おすすめ{N}選',
    metaDesc: '大阪で「バストイレ別(風呂・トイレ別)」の客室があるホテルを{N}軒厳選。ユニットバスなしで湯船に浸かれる、洗い場付き・セパレート浴室のホテルを公式情報ベースで検証して掲載。天然温泉の大浴場つき・なんば・梅田・新大阪も。素泊まり参考{MIN}円〜。',
    intro: [
      '大阪で「湯船にゆっくり浸かりたい」「トイレとお風呂は分かれていてほしい」——でも都心のビジネスホテルはユニットバスが多く、予約サイトの条件では絞りにくいもの。',
      'このページでは、<strong>浴室とトイレが別々(バストイレ別・セパレート)の客室がある大阪のホテルだけを{N}軒</strong>紹介します。各ホテルの公式・大手予約サイトを照合し、反証チェック(ユニットバスの証拠探し)まで行い、「全室セパレート」か「一部客室のみ」かも明記しています。',
      '天然温泉の大浴場つき(御宿 野乃なんば、ドーミーインなんばANNEX、リーベルホテル大阪)や、隣接の空庭温泉を優待利用できるアートホテル大阪ベイタワーも。料金は素泊まり・1名あたりの参考値(変動します)。',
    ],
    faq: [
      { q: '「バストイレ別」と「ユニットバス」の違いは?',
        a: 'ユニットバスは浴槽・トイレ(・洗面)が同じ部屋にある一体構造で、湯船にお湯を張ってくつろぐのに向きません。バストイレ別(セパレート)は浴室とトイレが別の空間に分かれ、洗い場付きなら体を洗ってから湯船に浸かる日本式の入浴ができます。' },
      { q: '大阪で天然温泉の大浴場があるホテルは?',
        a: '御宿 野乃なんば(花風の湯)、ドーミーインPREMIUMなんばANNEX(朝霧の湯)、リーベルホテル大阪(大阪桜島温泉)などが天然温泉の大浴場を備えます。アートホテル大阪ベイタワーは隣接の関西最大級「空庭温泉」を優待利用できます。' },
      { q: '大阪のバストイレ別ホテルの料金相場は?',
        a: 'このページ掲載{N}軒の参考料金は、素泊まり・1名あたり約{MIN}円〜{MAX}円です(時期・プランで変動)。からくさホテルグランデ新大阪タワーや三井ガーデンホテル大阪プレミアは比較的手頃な価格帯から狙えます。' },
      { q: '「全室バストイレ別」のホテルはどれ?',
        a: 'ホテルロイヤルクラシック大阪(全室 洗い場付きバスルーム)、センタラグランドホテル大阪(全室 浴室と独立トイレ)、御宿 野乃/ドーミーイン系(全室 シャワーブース+独立トイレ)などが該当します。各ホテルの詳細ページに客室ごとの浴室構成を載せています。' },
      { q: 'このサイトから予約できますか?',
        a: '当サイトは送客型の比較サイト(β版)です。予約は楽天トラベルまたは各ホテルの公式サイトで行います。楽天トラベルへのリンクにはアフィリエイト(PR)を利用しており、リンク経由のご予約で当サイトに紹介料が入る場合があります。掲載施設と当サイトに提携・関係はありません。' },
    ],
  },

  kyoto: {
    slug: 'kyoto',
    pref: '京都府',
    name: '京都',
    title: '京都のバストイレ別ホテル・温泉宿おすすめ{N}選【風呂・トイレ別】',
    h1: '京都のバストイレ別ホテル・宿 おすすめ{N}選',
    metaDesc: '京都で「バストイレ別(風呂・トイレ別)」の客室がある宿を{N}軒厳選。天然温泉の大浴場つきホテルから、嵐山・湯の花温泉の露天風呂付き客室、町家の宿まで、ユニットバスなしの宿を公式情報ベースで検証して掲載。京都駅・四条・嵐山。',
    intro: [
      '京都旅行で「湯船にゆっくり浸かりたい」「トイレとお風呂は別がいい」という方へ。都心のホテルはユニットバスが多い一方、京都には天然温泉の大浴場つきホテルや、露天風呂付き客室の温泉宿もあります。',
      'このページでは、<strong>浴室とトイレが別々(バストイレ別・セパレート)、または露天風呂付き客室のある京都の宿を{N}軒</strong>紹介します。公式・大手予約サイトを照合し反証チェックまで行い、「全室セパレート」か「一部客室のみ」かも明記しています。',
      '天然温泉の大浴場(御宿 野乃 京都七条、ドーミーインPREMIUM京都駅前)、嵐山・湯の花温泉の露天風呂付き客室、二条城前のHOTEL THE MITSUI KYOTOの自家源泉まで。料金は参考値で、温泉旅館は1泊2食・ホテルは素泊まりの1名あたり(変動します)。',
    ],
    faq: [
      { q: '京都で天然温泉に入れるホテル・宿は?',
        a: '御宿 野乃 京都七条(蓮花の湯)とドーミーインPREMIUM京都駅前(花蛍の湯)は天然温泉の大浴場を備えます。嵐山温泉 花伝抄・渡月亭、湯の花温泉のすみや亀峰菴・京都烟河は温泉旅館で、HOTEL THE MITSUI KYOTOは二条城前の自家源泉を楽しめます。' },
      { q: '「バストイレ別」と「ユニットバス」の違いは?',
        a: 'ユニットバスは浴槽・トイレ・洗面が同じ部屋にある一体構造で、湯船でくつろぐのに向きません。バストイレ別(セパレート)は浴室とトイレが別の空間に分かれ、洗い場付きなら体を洗ってから湯船に浸かれます。' },
      { q: '京都の宿の料金相場は?',
        a: 'このページ掲載{N}軒の参考料金は1名あたり約{MIN}円〜{MAX}円(温泉旅館は1泊2食、ホテルは素泊まりの基準・時期で大きく変動)。三井ガーデン系やドーミーイン系のホテルは1万円前後から、温泉旅館は3万円前後からが目安です。' },
      { q: '露天風呂付き客室のある宿は?',
        a: '嵐山温泉 花伝抄・渡月亭、湯の花温泉のすみや亀峰菴・京都烟河などに露天風呂付き客室があります。HOTEL THE MITSUI KYOTOの温泉スイートは専用の天然温泉露天風呂付きです。各宿の詳細ページで客室ごとの浴室を確認できます。' },
      { q: 'このサイトから予約できますか?',
        a: '当サイトは送客型の比較サイト(β版)です。予約は楽天トラベルまたは各宿の公式サイトで行います。楽天トラベルへのリンクにはアフィリエイト(PR)を利用しており、リンク経由のご予約で当サイトに紹介料が入る場合があります。掲載施設と当サイトに提携・関係はありません。' },
    ],
  },

  okinawa: {
    slug: 'okinawa',
    pref: '沖縄県',
    name: '沖縄',
    title: '沖縄のバストイレ別ホテルおすすめ{N}選【天然温泉・風呂トイレ別】',
    h1: '沖縄のバストイレ別ホテル おすすめ{N}選',
    metaDesc: '沖縄で「バストイレ別(風呂・トイレ別)」の客室があるホテルを{N}軒厳選。天然温泉の大浴場つきリゾートから那覇のシティホテルまで、ユニットバスなし・洗い場付きの宿を公式情報ベースで検証して掲載。那覇・恩納・本部(美ら海)。素泊まり参考{MIN}円〜。',
    intro: [
      '沖縄のホテル選びで「湯船に浸かりたい」「トイレとお風呂は別がいい」という方へ。実は沖縄本島には天然温泉が複数あり、バス・トイレ別のリゾート・シティホテルも揃っています。',
      'このページでは、<strong>浴室とトイレが別々(バストイレ別・セパレート)の客室がある沖縄のホテルだけを{N}軒</strong>紹介します。公式・大手予約サイトを照合し反証チェックまで行い、「全室セパレート」か「一部客室のみ」かも明記しています。',
      '天然温泉の展望大浴場(琉球温泉 瀬長島ホテルの龍神の湯、ロワジールホテル那覇の三重城温泉、オリオンホテル モトブのジュラ紀温泉)や、那覇の「りっかりっか湯」も。料金は素泊まり・1名あたりの参考値(変動します)。',
    ],
    faq: [
      { q: '沖縄で天然温泉に入れるホテルは?',
        a: '琉球温泉 瀬長島ホテル(龍神の湯・展望大露天)、ロワジールホテル那覇(那覇市内唯一の源泉掛け流し「三重城温泉 島人の湯」)、オリオンホテル モトブ(ジュラ紀温泉 美ら海の湯)、那覇のCOMMUNITY&SPA 那覇セントラルホテル(りっかりっか湯)などがあります。' },
      { q: '「バストイレ別」と「ユニットバス」の違いは?',
        a: 'ユニットバスは浴槽・トイレ・洗面が同じ部屋にある一体構造で、湯船でくつろぐのに向きません。バストイレ別(セパレート)は浴室とトイレが別の空間に分かれ、洗い場付きなら体を洗ってから湯船に浸かれます。' },
      { q: '沖縄のバストイレ別ホテルの料金相場は?',
        a: 'このページ掲載{N}軒の参考料金は、素泊まり・1名あたり約{MIN}円〜{MAX}円です(時期・プランで大きく変動)。那覇のシティホテルは手頃な価格帯、リゾートやスイートは高めが目安です。' },
      { q: 'リゾートホテルはバス・トイレ別が多い?',
        a: '沖縄のリゾートは浴室とトイレが分かれた客室が比較的多く、ハイアット リージェンシー 瀬良垣やオリオンホテル モトブは全室バス・トイレ別。一方、那覇のシティホテルは一部客室のみセパレートの場合もあるため、各詳細ページで客室タイプをご確認ください。' },
      { q: 'このサイトから予約できますか?',
        a: '当サイトは送客型の比較サイト(β版)です。予約は楽天トラベルまたは各ホテルの公式サイトで行います。楽天トラベルへのリンクにはアフィリエイト(PR)を利用しており、リンク経由のご予約で当サイトに紹介料が入る場合があります。掲載施設と当サイトに提携・関係はありません。' },
    ],
  },

  hokkaido: {
    slug: 'hokkaido',
    pref: '北海道',
    name: '北海道',
    title: '北海道のバストイレ別ホテル・温泉宿おすすめ{N}選【風呂トイレ別】',
    h1: '北海道のバストイレ別ホテル・宿 おすすめ{N}選',
    metaDesc: '北海道で「バストイレ別(風呂・トイレ別)」の客室がある宿を{N}軒厳選。天然温泉の展望大浴場つきホテルから登別の温泉旅館まで、ユニットバスなし・洗い場付きの宿を公式情報ベースで検証して掲載。札幌・函館・帯広・登別。',
    intro: [
      '北海道旅行・出張で「湯船にゆっくり浸かりたい」「トイレとお風呂は別がいい」という方へ。札幌・函館の都市ホテルは天然温泉の大浴場を備える宿が多く、バス・トイレ別の客室も選べます。',
      'このページでは、<strong>浴室とトイレが別々(バストイレ別・セパレート)の客室がある北海道の宿を{N}軒</strong>紹介します。公式・大手予約サイトを照合し反証チェックまで行い、「全室セパレート」か「一部客室のみ」かも明記しています(札幌の都市ホテルは上位客室のみセパレートの場合が多いです)。',
      '天然温泉の展望大浴場(函館のラビスタ函館ベイ・センチュリーマリーナ、札幌のモントレ エーデルホフ・JRタワー日航)、帯広の植物性モール温泉、登別の望楼NOGUCHIまで。料金は参考値で、温泉旅館は1泊2食・ホテルは素泊まりの1名あたり(変動します)。',
    ],
    faq: [
      { q: '北海道で天然温泉の大浴場があるホテルは?',
        a: '函館のラビスタ函館ベイ(海峡の湯・自家源泉かけ流し)、HOTEL&SPA センチュリーマリーナ函館(函館最大級の天然温泉)、函館国際ホテル(汐見の湯)、札幌のモントレ エーデルホフ(カルロビ・バリ・スパ)・マイステイズプレミア札幌パーク・JRタワー日航札幌、帯広の森のスパリゾート 北海道ホテル(モール温泉)などがあります。' },
      { q: '札幌のホテルは全室バス・トイレ別?',
        a: 'いいえ。札幌の都市ホテル(京王プラザ・モントレ エーデルホフ・マイステイズ・JRタワー・京王プレリア・クロスホテル等)は標準客室がユニットバスで、上位客室のみバス・トイレ別のことが多いです。このページでは各ホテルで「どの客室タイプがセパレートか」を明記し、掲載する客室情報もセパレート確認済みタイプに限定しています。' },
      { q: '北海道の宿の料金相場は?',
        a: 'このページ掲載{N}軒の参考料金は1名あたり約{MIN}円〜{MAX}円(温泉旅館は1泊2食、ホテルは素泊まりの基準・時期で大きく変動)。札幌・函館のホテルは1万円台から、登別の温泉旅館は上位価格帯が目安です。' },
      { q: '「バストイレ別」と「ユニットバス」の違いは?',
        a: 'ユニットバスは浴槽・トイレ・洗面が同じ部屋にある一体構造で、湯船でくつろぐのに向きません。バストイレ別(セパレート)は浴室とトイレが別の空間に分かれ、洗い場付きなら体を洗ってから湯船に浸かれます。' },
      { q: 'このサイトから予約できますか?',
        a: '当サイトは送客型の比較サイト(β版)です。予約は楽天トラベルまたは各宿の公式サイトで行います。楽天トラベルへのリンクにはアフィリエイト(PR)を利用しており、リンク経由のご予約で当サイトに紹介料が入る場合があります。掲載施設と当サイトに提携・関係はありません。' },
    ],
  },
};

/* ---------- LP生成 ---------- */
function buildLP(area) {
  const hotels = D.HOTELS.filter((h) => h.pref === area.pref);
  if (!hotels.length) throw new Error('no hotels for ' + area.pref);
  const N = hotels.length;
  const MIN = Math.min(...hotels.map((h) => h.minPrice));
  const MAX = Math.max(...hotels.map((h) => h.minPrice));
  const fill = (s) => s.replace(/\{N\}/g, String(N)).replace(/\{MIN\}/g, MIN.toLocaleString('ja-JP')).replace(/\{MAX\}/g, MAX.toLocaleString('ja-JP'));

  const title = fill(area.title);
  const h1 = fill(area.h1);
  const metaDesc = fill(area.metaDesc);
  const url = BASE + area.slug + '.html';

  // 比較表
  const rows = hotels.map((h) => {
    const parts = (h.bathLine || '').split('/');
    const roomBath = esc(parts[parts.length - 1].trim());
    const dai = h.tags.indexOf('daiyokujo') !== -1 ? (h.onsen ? '○(温泉)' : '○') : '－';
    return '<tr><td><a href="#' + esc(h.id) + '">' + esc(h.name) + '</a></td><td>' + esc(h.area.replace(/^東京・/, '')) + '</td><td>' + roomBath + '</td><td>' + dai + '</td><td class="num">' + yen(h.minPrice) + '〜</td></tr>';
  }).join('\n        ');

  // 各ホテル
  const sections = hotels.map((h, i) => {
    const accessFirst = esc(String(h.access).split('/')[0].split('。')[0]);
    return [
      '<section class="lp-hotel" id="' + esc(h.id) + '">',
      '  <h3><span class="lp-num">' + (i + 1) + '</span>' + esc(h.name) + (h.onsen ? ' <span class="badge badge-onsen">温泉</span>' : '') + (h.tags.indexOf('daiyokujo') !== -1 ? ' <span class="badge">大浴場</span>' : '') + '</h3>',
      '  <div class="lp-hotel-grid">',
      '    <a href="detail.html?id=' + esc(h.id) + '" class="lp-photo"><img src="' + esc(h.img) + '" data-hid="' + esc(h.id) + '" alt="' + esc(h.name) + '(' + esc(h.area) + ')のイメージ" loading="lazy"></a>',
      '    <div>',
      '      <p class="lp-area">' + esc(h.area) + ' | ' + accessFirst + '</p>',
      '      <p class="lp-catch">' + esc(h.catch) + '</p>',
      '      <p class="lp-bath"><strong>お風呂:</strong> ' + esc(h.bathLine || '') + '</p>',
      '      <p class="lp-note">' + esc(h.roomBathNote) + '</p>',
      '      <p class="lp-price">参考 素泊まり・1名 <strong>' + yen(h.minPrice) + '</strong>〜 <small>(時期により変動)</small></p>',
      '      <div class="lp-cta">',
      '        <a class="btn btn-rakuten" href="' + esc(aff(h.rakutenUrl)) + '" target="_blank" rel="noopener noreferrer sponsored" title="楽天トラベルの予約ページへ移動します">予約</a>',
      '        <span class="pr-tag" title="楽天アフィリエイトのリンクです">PR</span>',
      '        <a class="btn btn-ghost" href="detail.html?id=' + esc(h.id) + '">客室と浴室の詳細</a>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</section>',
    ].join('\n');
  }).join('\n\n');

  // FAQ
  const faqs = area.faq.map((f) => ({ q: fill(f.q), a: fill(f.a) }));
  const faqHtml = faqs.map((f) =>
    '<div class="lp-faq"><h3>Q. ' + esc(f.q) + '</h3><p>A. ' + esc(f.a) + '</p></div>'
  ).join('\n      ');

  // JSON-LD
  const ldFaq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
  const ldList = { '@context': 'https://schema.org', '@type': 'ItemList', name: h1, itemListElement: hotels.map((h, i) => ({ '@type': 'ListItem', position: i + 1, name: h.name, url: BASE + 'detail.html?id=' + h.id })) };
  const ldCrumb = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [ { '@type': 'ListItem', position: 1, name: 'トップ', item: BASE }, { '@type': 'ListItem', position: 2, name: h1, item: url } ] };

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} | 湯船トラベル</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${url}">
<meta property="og:site_name" content="湯船トラベル">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}assets/img/ogp-${area.slug}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(metaDesc)}">
<meta name="twitter:image" content="${BASE}assets/img/ogp-${area.slug}.png">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%99%A8%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&family=Noto+Serif+JP:wght@500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/style.css">
<script type="application/ld+json">${JSON.stringify(ldFaq)}</script>
<script type="application/ld+json">${JSON.stringify(ldList)}</script>
<script type="application/ld+json">${JSON.stringify(ldCrumb)}</script>
</head>
<body>

<header id="site-header"></header>

<main>
  <div class="wrap">
    <div class="page-head lp-head">
      <p class="crumb"><a href="index.html">トップ</a> › ${esc(h1)}</p>
      <h1>${esc(h1)}</h1>
      <p class="lp-pr-note">本ページはアフィリエイト広告(楽天トラベル)を利用しています。</p>
${area.intro.map((p) => '      <p class="lp-lead">' + fill(p) + '</p>').join('\n')}
    </div>

    <section class="dsection" aria-labelledby="lp-table-h">
      <h2 id="lp-table-h">掲載${N}軒の早見表</h2>
      <div class="lp-table-wrap">
      <table class="lp-table">
        <thead><tr><th>ホテル</th><th>エリア</th><th>客室の浴室</th><th>大浴場</th><th>参考料金</th></tr></thead>
        <tbody>
        ${rows}
        </tbody>
      </table>
      </div>
      <p class="lp-small">※料金は素泊まり・1名あたりの参考値(2名1室利用時は1名換算)。時期・プランにより大きく変動します。掲載基準は<a href="index.html#policy">こちら</a>。</p>
    </section>

    <section class="dsection" aria-labelledby="lp-hotels-h">
      <h2 id="lp-hotels-h">各ホテルの浴室とおすすめポイント</h2>
${sections}
    </section>

    <section class="dsection" aria-labelledby="lp-faq-h">
      <h2 id="lp-faq-h">よくある質問</h2>
      ${faqHtml}
    </section>

    <section class="dsection">
      <h2>条件を変えて探す</h2>
      <p class="lp-links">
        <a class="qtag" href="search.html?type=business">ビジネス・シティホテル一覧</a>
        <a class="qtag" href="search.html?type=business&tag=daiyokujo">大浴場つきビジネスホテル</a>
        <a class="qtag" href="search.html?tag=gensen">源泉かけ流しの宿</a>
        <a class="qtag" href="search.html">全国から探す</a>
      </p>
    </section>
  </div>
</main>

<footer id="site-footer"></footer>

<script src="assets/js/config.js"></script>
<script src="assets/js/data.js"></script>
<script src="assets/js/ui.js"></script>
<script>
window.YUBUNE.ui.renderChrome('lp');
// 楽天画像が読み込めない場合は生成風景に差し替え(壊れ画像を出さない)
document.querySelectorAll('.lp-photo img[data-hid]').forEach(function (im) {
  function fb() {
    var h = window.YUBUNE.data.findHotel(im.getAttribute('data-hid'));
    if (h) im.src = window.YUBUNE.data.sceneURI(h, 640, 480);
  }
  if (im.complete && im.naturalWidth === 0) fb();
  else im.addEventListener('error', fb, { once: true });
});
</script>
</body>
</html>
`;
  fs.writeFileSync(path.join(ROOT, area.slug + '.html'), html);
  console.log(area.slug + '.html generated (' + N + ' hotels, min ' + MIN + ')');
}

/* ---------- sitemap.xml ---------- */
function buildSitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [BASE, BASE + 'search.html'];
  Object.values(AREAS).forEach((a) => urls.push(BASE + a.slug + '.html'));
  D.HOTELS.forEach((h) => urls.push(BASE + 'detail.html?id=' + h.id));
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => '  <url><loc>' + u.replace(/&/g, '&amp;') + '</loc><lastmod>' + today + '</lastmod></url>').join('\n') +
    '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  console.log('sitemap.xml generated (' + urls.length + ' urls)');
}

const key = process.argv[2] || 'tokyo';
if (!AREAS[key]) throw new Error('unknown area: ' + key + ' (available: ' + Object.keys(AREAS).join(', ') + ')');
buildLP(AREAS[key]);
buildSitemap();
