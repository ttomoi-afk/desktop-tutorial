/* 湯船トラベル — トップページ */
(function () {
  'use strict';
  const d = window.YUBUNE.data;
  const ui = window.YUBUNE.ui;

  ui.renderChrome('home');

  /* ヒーロー背景(温泉街の夕景) */
  const hero = document.getElementById('hero');
  if (hero) {
    const heroScene = { id: 'hero-onsen-town', scene: 'mountain', pal: 'dusk' };
    hero.style.backgroundImage = 'url("' + d.sceneURI(heroScene, 1600, 720) + '")';
  }

  /* エリアセレクト */
  const areaSel = document.getElementById('f-area');
  d.REGIONS.forEach(function (r) {
    const o = document.createElement('option');
    o.value = r; o.textContent = r;
    areaSel.appendChild(o);
  });

  /* チェックイン初期値: 2週間後 */
  const dateInput = document.getElementById('f-date');
  if (dateInput) {
    const dt = new Date();
    dt.setDate(dt.getDate() + 14);
    dateInput.value = dt.toISOString().slice(0, 10);
    dateInput.min = new Date().toISOString().slice(0, 10);
  }

  /* お風呂タイプタイル */
  function countByTag(tag) {
    return d.HOTELS.filter(function (h) { return h.tags.indexOf(tag) !== -1; }).length;
  }
  const types = [
    { tag: 'kashikiri_roten', icon: 'steam', title: '貸切露天風呂', desc: '家族や二人だけで、外の湯を独占。無料の宿も。' },
    { tag: 'room_roten', icon: 'bath', title: '客室露天風呂', desc: '部屋を出ずに、いつでも露天。チェックアウトまで湯三昧。' },
    { tag: 'kashikiri_uchi', icon: 'separate', title: '貸切内風呂', desc: '檜や陶器の湯船を貸切で。小さなお子さま連れにも。' },
    { tag: 'gensen', icon: 'drop', title: '源泉かけ流し', desc: '注がれ続ける新しいお湯。循環なしの本物の温泉。' },
    { tag: 'nigori', icon: 'clock', title: 'にごり湯', desc: '乳白色・鉄色。成分の濃さが目に見えるお湯。' },
    { tag: 'view_bath', icon: 'view', title: '絶景風呂', desc: '海、渓流、湯畑。湯船から眺める特等席。' },
  ];
  const typeGrid = document.getElementById('type-grid');
  typeGrid.innerHTML = types.map(function (t) {
    return '<a class="type-tile" href="search.html?tag=' + t.tag + '">' +
      ui.icon(t.icon) +
      '<h3>' + t.title + '</h3><p>' + t.desc + '</p>' +
      '<span class="count">' + countByTag(t.tag) + '軒</span></a>';
  }).join('');

  /* おすすめ6軒(評価順) */
  const pickup = d.HOTELS.slice().sort(function (a, b) { return b.rating - a.rating; }).slice(0, 6);
  document.getElementById('pickup-grid').innerHTML = pickup.map(ui.hotelCard).join('');

  /* 温泉地チップ */
  const areaMap = {};
  d.HOTELS.forEach(function (h) {
    if (!areaMap[h.area]) areaMap[h.area] = { onsen: h.onsen, pref: h.pref, count: 0 };
    areaMap[h.area].count++;
  });
  document.getElementById('area-chips').innerHTML = Object.keys(areaMap).map(function (a) {
    const m = areaMap[a];
    return '<a class="area-chip" href="search.html?kw=' + encodeURIComponent(a) + '">' +
      '<strong>' + ui.esc(a) + '</strong><small>' + ui.esc(m.pref) + '・' + m.count + '軒</small></a>';
  }).join('');
})();
