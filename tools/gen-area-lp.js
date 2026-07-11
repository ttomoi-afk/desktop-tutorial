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
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${url}">
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
