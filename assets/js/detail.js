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

  /* ---------- クチコミ(お風呂目線の定型文を宿情報から生成) ---------- */
  function buildReviews(h) {
    const r = [];
    if (h.type === 'business') {
      r.push({ who: '30代・出張', rating: 5, text: '出張で月2回利用。ユニットバスに戻れない体になりました。洗い場で体を洗ってから湯船に浸かれるだけで、翌朝の疲れの残り方が違います。' });
      if (h.tags.indexOf('daiyokujo') !== -1) {
        r.push({ who: '40代・出張', rating: 5, text: 'チェックイン後すぐ大浴場へ。' + (h.tags.indexOf('sauna') !== -1 ? 'サウナ→水風呂→湯船の流れで、' : '') + '移動の疲れがリセットされました。部屋のトイレが浴室と別なのも地味に大事。' });
      }
      if (h.kashikiri.length) {
        r.push({ who: '20代・ひとり旅', rating: 5, text: h.kashikiri[0].name + 'を利用。誰にも気を使わず、ひとりで静かにととのえる贅沢。予約してでも入る価値があります。' });
      }
      r.push({ who: '50代・出張', rating: 4, text: '深夜チェックインでも部屋の湯船にゆっくり浸かれるのがいい。浴室とトイレが別なので、朝の支度も同時進行できて助かります。' });
      return r.slice(0, 3);
    }
    if (h.tags.indexOf('room_roten') !== -1 || h.tags.indexOf('room_hanroten') !== -1) {
      r.push({ who: '40代・ご夫婦', rating: 5, text: '客室のお風呂が最高でした。夜と朝で景色が変わるので、滞在中に何度も入ってしまいました。洗い場も付いていて使いやすかったです。' });
    }
    if (h.kashikiri.length) {
      r.push({ who: '30代・子連れ旅', rating: 5, text: '貸切風呂(' + h.kashikiri[0].name + ')を利用。子どもがいても周りを気にせずゆっくり入れました。' + (h.hasFreeKashikiri ? '無料なのも嬉しい。' : '料金分の価値はあります。') });
    }
    if (h.tags.indexOf('gensen') !== -1) {
      r.push({ who: '50代・ひとり旅', rating: 4, text: 'かけ流しの湯は鮮度が違います。' + h.spring + 'らしい浴感で、湯上がりもポカポカ。トイレが浴室と別なのは、やはり快適でした。' });
    }
    if (r.length < 3) {
      r.push({ who: '20代・カップル', rating: 4, text: '「ユニットバスじゃない」を条件に探してここに決めました。正解でした。部屋のお風呂に洗い場があるだけで、こんなに快適だとは。' });
    }
    return r.slice(0, 3);
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
      '      <tr><th>浴室とトイレ</th><td class="ok">' + ui.icon('check') + ' 完全セパレート(独立トイレ・温水洗浄便座)</td></tr>' +
      '      <tr><th>洗い場</th><td>' + (room.bath.wash ? '<span class="ok">' + ui.icon('check') + ' あり</span>(浴室内で体を洗えます)' : 'なし') + '</td></tr>' +
      '      <tr><th>広さ・定員</th><td>' + ui.esc(room.size) + ' / ' + ui.esc(room.capacity) + '</td></tr>' +
      '      <tr><th>設備</th><td>' + room.features.map(ui.esc).join('・') + '</td></tr>' +
      '    </table>' +
      '    <div class="room-foot">' +
      '      <div class="meta"><span>' + ui.icon('person') + ' ' + ui.esc(room.capacity) + '</span><span>' + ui.icon('size') + ' ' + ui.esc(room.size) + '</span></div>' +
      '      <div class="room-price"><small>' + ui.priceLabel(h, true) + '</small><strong>' + ui.yen(room.price) + '</strong></div>' +
      '      <a class="btn" href="booking.html?hotel=' + ui.esc(h.id) + '&room=' + ui.esc(room.id) + '">この部屋を予約</a>' +
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
  const reviews = buildReviews(hotel);

  root.innerHTML =
    '<div class="detail-hero" style="background-image:url(&quot;' + heroImg + '&quot;)" role="img" aria-label="' + ui.esc(hotel.area) + 'の風景イメージ"></div>' +
    '<div class="wrap">' +
    '  <div class="detail-head">' +
    '    <p class="crumb"><a href="index.html">トップ</a> › <a href="search.html">宿をさがす</a> › ' + ui.esc(hotel.name) + '</p>' +
    '    <p class="onsen-line">' + ui.icon('pin') + ui.esc(hotel.pref) + ' ' + ui.esc(hotel.area) + (hotel.onsen ? '・' + ui.esc(hotel.onsen) : '') + ' ' + ui.typeChip(hotel) + '</p>' +
    '    <h1>' + ui.esc(hotel.name) + '</h1>' +
    '    <p class="kana">' + ui.esc(hotel.kana) + '</p>' +
    '    <div class="meta">' + ui.stars(hotel.rating) + '<span>クチコミ ' + hotel.reviews + '件</span><span>' + ui.esc(hotel.access) + '</span></div>' +
    '    <div class="badges">' + ui.badge('全室 風呂・トイレ別', 'sep') + ui.tagBadges(hotel) + '</div>' +
    '    <p class="detail-catch">' + ui.esc(hotel.catch) + '</p>' +
    '    <p class="detail-desc">' + ui.esc(hotel.description) + '</p>' +
    '  </div>' +

    '  <div class="detail-grid">' +
    '    <div class="detail-main">' +

    '      <section class="dsection" aria-labelledby="h-onsen">' +
    '        <h2 id="h-onsen">' + ui.icon('drop') + (hotel.spring ? '温泉・お湯のこと' : '大浴場・お風呂のこと') + '</h2>' +
    '        <div class="onsen-spec">' +
    (hotel.spring ? '          <div class="spec-card"><h4>泉質</h4><p>' + ui.esc(hotel.springDetail) + '</p></div>' : '') +
    '          <div class="spec-card"' + (hotel.spring ? '' : ' style="grid-column:1/-1"') + '><h4>' + (hotel.spring ? '湯づかい' : '浴場・サウナ') + '</h4><p>' + ui.esc(hotel.gensenNote) + '</p></div>' +
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

    '      <section class="dsection" aria-labelledby="h-review">' +
    '        <h2 id="h-review">' + ui.icon('person') + 'お風呂のクチコミ</h2>' +
    '        ' + reviews.map(function (r) {
      return '<div class="review-card"><div class="rhead">' + ui.stars(r.rating) + '<span>' + ui.esc(r.who) + '</span></div><p>' + ui.esc(r.text) + '</p></div>';
    }).join('') +
    '      </section>' +
    '    </div>' +

    '    <aside>' +
    '      <div class="side-panel">' +
    '        <p class="price-line"><small>' + ui.priceLabel(hotel, true) + '</small><strong>' + ui.yen(hotel.minPrice) + '</strong><small>〜</small></p>' +
    '        <ul class="side-facts">' +
    '          <li>' + ui.icon('check') + '全客室が風呂・トイレ別(セパレート)</li>' +
    '          <li>' + ui.icon('check') + '全浴室に洗い場あり</li>' +
    (hotel.kashikiri.length ? '          <li>' + ui.icon('check') + (hotel.type === 'business' ? '貸切風呂・サウナ ' : '貸切風呂 ') + hotel.kashikiri.length + 'つ' + (hotel.hasFreeKashikiri ? '(無料)' : '') + '</li>' : '') +
    (hotel.tags.indexOf('gensen') !== -1 ? '          <li>' + ui.icon('check') + '源泉かけ流し</li>' : '') +
    (hotel.type === 'business' && hotel.tags.indexOf('daiyokujo') !== -1 ? '          <li>' + ui.icon('check') + '大浴場あり' + (hotel.tags.indexOf('sauna') !== -1 ? '(サウナ併設)' : '') + '</li>' : '') +
    '          <li>' + ui.icon('pin') + ui.esc(hotel.access) + '</li>' +
    '        </ul>' +
    '        <a class="btn btn-lg btn-block" href="#h-rooms">客室を選んで予約する</a>' +
    '        <p class="side-note">※ デモサイトのため実際の予約はできません。日付を選んでも在庫は常に「空室」です。</p>' +
    '      </div>' +
    '    </aside>' +
    '  </div>' +
    '</div>';
})();
