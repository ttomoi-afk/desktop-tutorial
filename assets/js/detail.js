/* 湯船トラベル — 宿詳細ページ */
(function () {
  'use strict';
  const d = window.YUBUNE.data;
  const ui = window.YUBUNE.ui;

  ui.renderChrome('detail');

  const root = document.getElementById('detail-root');
  const hotel = d.findHotel(ui.qs('id'));

  if (!hotel) {
    root.innerHTML = '<div class="wrap"><div class="empty-box" style="margin:60px 0">' + ui.icon('search') +
      '<h3>宿が見つかりませんでした</h3><p><a href="search.html">宿の一覧</a>からお選びください。</p></div></div>';
    return;
  }

  document.title = hotel.name + '(' + hotel.onsen + ')| 湯船トラベル(デモ)';

  /* ---------- お風呂の見どころ(公開情報を基にした編集部メモ) ----------
     クチコミの捏造はしない。データの highlights(事実ベース)を表示する */
  function buildHighlights(h) {
    if (h.highlights && h.highlights.length) return h.highlights;
    // highlights 未設定の宿はタグから機械的に事実だけを列挙
    const r = [];
    if (h.kashikiri.length) r.push('貸切風呂が' + h.kashikiri.length + 'つ' + (h.hasFreeKashikiri ? '(無料)' : '') + '。');
    if (h.tags.indexOf('room_roten') !== -1) r.push('露天風呂付き客室あり。');
    if (h.tags.indexOf('gensen') !== -1) r.push('源泉かけ流しの浴槽あり。');
    return r;
  }

  /* ---------- 客室カード ---------- */
  function roomCard(h, room) {
    const img = d.bathTileSVG(h, room, 460, 380);
    const bathBadges =
      ui.badge('風呂・トイレ別', 'sep') +
      (room.bath.wash ? ui.badge('洗い場付き') : '') +
      (room.bath.onsenBath ? ui.badge('客室風呂も温泉', 'onsen') : '') +
      (room.bath.view ? ui.badge(ui.esc(room.bath.view) + 'ビュー', 'room') : '');
    return '<article class="room-card" id="' + ui.esc(room.id) + '">' +
      '  <div class="room-img" style="background-image:url(&quot;' + img + '&quot;)" role="img" aria-label="' + ui.esc(room.bath.type) + 'のイメージ"></div>' +
      '  <div class="room-body">' +
      '    <h3>' + ui.esc(room.name) + '</h3>' +
      '    <div class="room-badges">' + bathBadges + '</div>' +
      '    <table class="room-spec">' +
      '      <tr><th>浴室</th><td>' + ui.esc(room.bath.type) + (room.bath.note ? '<br><small style="color:var(--ink-soft)">' + ui.esc(room.bath.note) + '</small>' : '') + '</td></tr>' +
      '      <tr><th>浴室とトイレ</th><td class="ok">' + ui.icon('check') + ' 別々(セパレート)</td></tr>' +
      '      <tr><th>洗い場</th><td>' + (room.bath.wash === true ? '<span class="ok">' + ui.icon('check') + ' あり</span>(浴室内で体を洗えます)' : room.bath.wash === false ? 'なし' : '未確認(公式サイトでご確認ください)') + '</td></tr>' +
      '      <tr><th>広さ・定員</th><td>' + ui.esc(room.size) + ' / ' + ui.esc(room.capacity) + '</td></tr>' +
      (room.features && room.features.length ? '      <tr><th>設備</th><td>' + room.features.map(ui.esc).join('・') + '</td></tr>' : '') +
      '    </table>' +
      '    <div class="room-foot">' +
      '      <div class="meta"><span>' + ui.icon('person') + ' ' + ui.esc(room.capacity) + '</span><span>' + ui.icon('size') + ' ' + ui.esc(room.size) + '</span></div>' +
      '      <div class="room-price"><small>' + ui.priceLabel(h, true) + '</small><strong>' + ui.yen(room.price) + '</strong></div>' +
      '      ' + ui.bookingCtas(h, true) +
      '    </div>' +
      '  </div>' +
      '</article>';
  }

  /* ---------- 貸切風呂カード ---------- */
  function kashikiriCard(k) {
    const isFree = k.fee.indexOf('無料') === 0;
    return '<div class="kcard">' +
      ui.icon('steam') +
      '<div><h4>' + ui.esc(k.name) + (isFree ? ' <span class="badge badge-free">無料</span>' : '') + '</h4>' +
      '<p>' + ui.esc(k.type) + ' / 定員 ' + ui.esc(k.capacity) + ' / ' + ui.esc(k.how) + '</p></div>' +
      '<div class="fee"><strong>' + ui.esc(k.fee) + '</strong><small>1回あたり</small></div>' +
      '</div>';
  }

  /* ---------- 描画 ---------- */
  const heroImg = d.sceneURI(hotel, 1600, 560);
  const highlights = buildHighlights(hotel);

  root.innerHTML =
    '<div class="detail-hero" style="background-image:url(&quot;' + heroImg + '&quot;)" role="img" aria-label="' + ui.esc(hotel.area) + 'の風景イメージ"></div>' +
    '<div class="wrap">' +
    '  <div class="detail-head">' +
    '    <p class="crumb"><a href="index.html">トップ</a> › <a href="search.html">宿をさがす</a> › ' + ui.esc(hotel.name) + '</p>' +
    '    <p class="onsen-line">' + ui.icon('pin') + ui.esc(hotel.pref) + ' ' + ui.esc(hotel.area) + (hotel.onsen ? '・' + ui.esc(hotel.onsen) : '') + ' ' + ui.typeChip(hotel) + '</p>' +
    '    <h1>' + ui.esc(hotel.name) + '</h1>' +
    '    <p class="kana">' + ui.esc(hotel.kana) + '</p>' +
    '    <div class="meta">' + (hotel.rating ? ui.stars(hotel.rating) + '<span>クチコミ ' + hotel.reviews + '件</span>' : '') + '<span>' + ui.esc(hotel.access) + '</span></div>' +
    '    <div class="badges">' + ui.badge('全室 風呂・トイレ別', 'sep') + ui.tagBadges(hotel) + '</div>' +
    '    <p class="detail-catch">' + ui.esc(hotel.catch) + '</p>' +
    '    <p class="detail-desc">' + ui.esc(hotel.description) + '</p>' +
    '  </div>' +

    '  <div class="detail-grid">' +
    '    <div class="detail-main">' +

    '      <section class="dsection" aria-labelledby="h-onsen">' +
    '        <h2 id="h-onsen">' + ui.icon('drop') + (hotel.spring ? '温泉・お湯のこと' : hotel.tags.indexOf('daiyokujo') !== -1 ? '大浴場・お風呂のこと' : 'お風呂のこと') + '</h2>' +
    '        <div class="onsen-spec">' +
    (hotel.spring ? '          <div class="spec-card"><h4>泉質</h4><p>' + ui.esc(hotel.springDetail) + '</p></div>' : '') +
    '          <div class="spec-card"' + (hotel.spring ? '' : ' style="grid-column:1/-1"') + '><h4>' + (hotel.spring ? '湯づかい' : hotel.tags.indexOf('daiyokujo') !== -1 ? '浴場・サウナ' : '浴室について') + '</h4><p>' + ui.esc(hotel.gensenNote) + '</p></div>' +
    (hotel.roomBathNote ? '          <div class="spec-card" style="grid-column:1/-1"><h4>客室の浴室</h4><p>' + ui.esc(hotel.roomBathNote) + '</p></div>' : '') +
    (hotel.efficacy.length ? '          <div class="spec-card" style="grid-column:1/-1"><h4>あう症状(一般的適応症の例)</h4>' +
    '            <div class="efficacy-chips">' + hotel.efficacy.map(function (e) { return '<span>' + ui.esc(e) + '</span>'; }).join('') + '</div></div>' : '') +
    '        </div>' +
    '      </section>' +

    (hotel.kashikiri.length ?
      '      <section class="dsection" aria-labelledby="h-kashikiri">' +
      '        <h2 id="h-kashikiri">' + ui.icon('steam') + (hotel.type === 'business' ? '貸切風呂・サウナ' : '貸切風呂') + '(' + hotel.kashikiri.length + 'つ)</h2>' +
      '        <div class="kashikiri-list">' + hotel.kashikiri.map(kashikiriCard).join('') + '</div>' +
      '      </section>' : '') +

    '      <section class="dsection" aria-labelledby="h-rooms">' +
    '        <h2 id="h-rooms">' + ui.icon('bath') + '客室を選ぶ<small style="font-size:12px;color:var(--ink-soft);font-family:var(--sans);margin-left:6px">すべて風呂・トイレ別の客室です</small></h2>' +
    '        ' + hotel.rooms.map(function (r) { return roomCard(hotel, r); }).join('') +
    '      </section>' +

    (highlights.length ?
      '      <section class="dsection" aria-labelledby="h-review">' +
      '        <h2 id="h-review">' + ui.icon('view') + 'お風呂の見どころ<small style="font-size:12px;color:var(--ink-soft);font-family:var(--sans);margin-left:6px">公開情報を基にした編集部メモ</small></h2>' +
      highlights.map(function (t) {
        return '<div class="review-card"><p>' + ui.icon('check') + ' ' + ui.esc(t) + '</p></div>';
      }).join('') +
      '      </section>' : '') +

    (hotel.sources && hotel.sources.length ?
      '      <section class="dsection" aria-labelledby="h-sources">' +
      '        <details class="source-box"><summary>出典・参考情報(' + hotel.sources.length + '件)</summary><ul class="source-list">' +
      hotel.sources.map(function (s) {
        return '<li><a href="' + ui.esc(s) + '" target="_blank" rel="noopener noreferrer">' + ui.esc(s) + '</a></li>';
      }).join('') +
      '        </ul>' +
      (hotel.uncertain ? '<p><strong>確認できていない点:</strong> ' + ui.esc(hotel.uncertain) + '</p>' : '') +
      '        <p>掲載内容は上記の公開情報を基にした参考値です(調査時点)。最新情報は公式サイトをご確認ください。</p></details>' +
      '      </section>' : '') +
    '    </div>' +

    '    <aside>' +
    '      <div class="side-panel">' +
    '        <p class="price-line"><small>' + ui.priceLabel(hotel, true) + '</small><strong>' + ui.yen(hotel.minPrice) + '</strong><small>〜</small></p>' +
    '        <p class="rk-price" id="rk-price"></p>' +
    '        <ul class="side-facts">' +
    '          <li>' + ui.icon('check') + '全客室が風呂・トイレ別(セパレート)</li>' +
    '          <li>' + ui.icon('check') + '全浴室に洗い場あり</li>' +
    (hotel.kashikiri.length ? '          <li>' + ui.icon('check') + (hotel.type === 'business' ? '貸切風呂・サウナ ' : '貸切風呂 ') + hotel.kashikiri.length + 'つ' + (hotel.hasFreeKashikiri ? '(無料)' : '') + '</li>' : '') +
    (hotel.tags.indexOf('gensen') !== -1 ? '          <li>' + ui.icon('check') + '源泉かけ流し</li>' : '') +
    (hotel.type === 'business' && hotel.tags.indexOf('daiyokujo') !== -1 ? '          <li>' + ui.icon('check') + '大浴場あり' + (hotel.tags.indexOf('sauna') !== -1 ? '(サウナ併設)' : '') + '</li>' : '') +
    '          <li>' + ui.icon('pin') + ui.esc(hotel.access) + '</li>' +
    '        </ul>' +
    '        ' + ui.bookingCtas(hotel, false) +
    '        <a class="btn-ghost btn btn-block" style="margin-top:8px;border-color:var(--line);color:var(--ink-soft)" href="#h-rooms">風呂・トイレ別の客室を見る</a>' +
    '        <p class="side-note">※ ご予約は楽天トラベル・公式サイトなど外部サイトで行います(送客型β版)。掲載内容は公開情報を基にした参考値で、料金・設備は変動します。</p>' +
    '      </div>' +
    '    </aside>' +
    '  </div>' +
    '</div>';

  /* ---------- 楽天トラベルの空室最低価格(取れたときだけ表示) ---------- */
  if (hotel.rakutenHotelNo && window.YUBUNE.rakuten) {
    window.YUBUNE.rakuten.minCharge(hotel.rakutenHotelNo).then(function (r) {
      var el = document.getElementById('rk-price');
      if (!el || !r) return;
      var d = r.checkin.split('-');
      el.innerHTML = ui.icon('clock') + ' 楽天トラベルの空室最低価格(' +
        Number(d[1]) + '/' + Number(d[2]) + '泊・2名1室 合計): <strong>' + ui.yen(r.total) + '</strong>';
    });
  }
})();
