/* 湯船トラベル — 予約ページ(デモ) */
(function () {
  'use strict';
  const d = window.YUBUNE.data;
  const ui = window.YUBUNE.ui;

  ui.renderChrome('booking');

  const root = document.getElementById('booking-root');
  const hotel = d.findHotel(ui.qs('hotel'));
  const room = hotel ? hotel.rooms.filter(function (r) { return r.id === ui.qs('room'); })[0] : null;

  if (!hotel || !room) {
    root.innerHTML = '<div class="wrap"><div class="empty-box" style="margin:60px 0">' + ui.icon('search') +
      '<h3>予約対象の部屋が見つかりませんでした</h3><p><a href="search.html">宿の一覧</a>からお選びください。</p></div></div>';
    return;
  }

  document.title = 'ご予約:' + hotel.name + ' | 湯船トラベル(デモ)';

  const today = new Date();
  const defIn = new Date(today); defIn.setDate(defIn.getDate() + 14);
  function iso(dt) { return dt.toISOString().slice(0, 10); }

  /* 食事プラン(基準料金が温泉宿=2食付き、ビジネス=素泊まり) */
  const MEALS = hotel.type === 'business'
    ? [
      { v: 'sudomari', label: '素泊まり(基本)', adj: 0 },
      { v: 'breakfast', label: '朝食付き(+¥1,650/名)', adj: 1650 },
    ]
    : [
      { v: '2shoku', label: '1泊2食付き(基本)', adj: 0 },
      { v: 'breakfast', label: '朝食のみ(−¥3,000/名)', adj: -3000 },
      { v: 'sudomari', label: '素泊まり(−¥6,000/名)', adj: -6000 },
    ];
  const defGuests = hotel.type === 'business' ? '1' : '2';

  /* 貸切風呂オプション(有料のものだけ枠として選択可能に) */
  const paidKashikiri = hotel.kashikiri.filter(function (k) { return k.fee.indexOf('無料') !== 0; });
  function feeYen(k) {
    const m = k.fee.match(/([0-9,]+)円/);
    return m ? Number(m[1].replace(/,/g, '')) : 0;
  }

  root.innerHTML =
    '<div class="wrap">' +
    '  <div class="page-head">' +
    '    <p class="crumb"><a href="index.html">トップ</a> › <a href="detail.html?id=' + ui.esc(hotel.id) + '">' + ui.esc(hotel.name) + '</a> › ご予約</p>' +
    '    <h1>ご予約手続き(デモ)</h1>' +
    '    <p>本サイトは非公式のデモのため、実際の予約・決済は行われません。' +
    (hotel.official ? '実際のご予約は <a href="' + ui.esc(hotel.official) + '" target="_blank" rel="noopener noreferrer">公式サイト</a> をご利用ください。' : '') + '</p>' +
    '  </div>' +
    '  <div class="booking-layout">' +

    '    <form class="bform" id="bform" novalidate>' +
    '      <h2>宿泊内容</h2>' +
    '      <p class="sub">' + ui.esc(hotel.name) + ' / ' + ui.esc(room.name) + '</p>' +

    '      <fieldset>' +
    '        <legend>日程と人数</legend>' +
    '        <div class="form-row">' +
    '          <div class="field"><label for="b-checkin">チェックイン<span class="req">必須</span></label>' +
    '            <input type="date" id="b-checkin" value="' + iso(defIn) + '" min="' + iso(today) + '" required>' +
    '            <p class="error-msg">本日以降の日付を選んでください</p></div>' +
    '          <div class="field"><label for="b-nights">泊数</label>' +
    '            <select id="b-nights"><option value="1">1泊</option><option value="2">2泊</option><option value="3">3泊</option></select></div>' +
    '        </div>' +
    '        <div class="form-row">' +
    '          <div class="field"><label for="b-guests">人数(大人)</label>' +
    '            <select id="b-guests">' + [1, 2, 3, 4].map(function (n) {
      return '<option value="' + n + '"' + (String(n) === defGuests ? ' selected' : '') + '>' + n + '名</option>';
    }).join('') + '</select></div>' +
    '          <div class="field"><label for="b-meal">お食事</label>' +
    '            <select id="b-meal">' + MEALS.map(function (m, i) {
      return '<option value="' + m.v + '"' + (i === 0 ? ' selected' : '') + '>' + ui.esc(m.label) + '</option>';
    }).join('') + '</select></div>' +
    '        </div>' +
    '      </fieldset>' +

    (paidKashikiri.length ?
      '      <fieldset>' +
      '        <legend>貸切風呂の事前予約(任意)</legend>' +
      '        <div class="radio-cards" id="kashikiri-opts">' +
      '          <label class="radio-card"><input type="radio" name="kashikiri" value="" checked>' +
      '            <span><span class="rc-main">予約しない</span><br><span class="rc-sub">当日フロントでも空きがあれば利用できます</span></span></label>' +
      paidKashikiri.map(function (k, i) {
        return '<label class="radio-card"><input type="radio" name="kashikiri" value="' + i + '">' +
          '<span><span class="rc-main">' + ui.esc(k.name) + '</span><br><span class="rc-sub">' + ui.esc(k.type) + ' / 定員' + ui.esc(k.capacity) + '</span></span>' +
          '<span class="rc-fee">+' + ui.yen(feeYen(k)) + '</span></label>';
      }).join('') +
      '        </div>' +
      '      </fieldset>' : '') +

    '      <fieldset>' +
    '        <legend>代表者情報</legend>' +
    '        <div class="form-row">' +
    '          <div class="field"><label for="b-name">お名前<span class="req">必須</span></label>' +
    '            <input type="text" id="b-name" placeholder="湯船 太郎" autocomplete="name" required>' +
    '            <p class="error-msg">お名前を入力してください</p></div>' +
    '          <div class="field"><label for="b-kana">フリガナ<span class="req">必須</span></label>' +
    '            <input type="text" id="b-kana" placeholder="ユブネ タロウ" required>' +
    '            <p class="error-msg">フリガナを入力してください</p></div>' +
    '        </div>' +
    '        <div class="form-row">' +
    '          <div class="field"><label for="b-email">メールアドレス<span class="req">必須</span></label>' +
    '            <input type="email" id="b-email" placeholder="taro@example.com" autocomplete="email" required>' +
    '            <p class="error-msg">メールアドレスの形式が正しくありません</p></div>' +
    '          <div class="field"><label for="b-tel">電話番号<span class="req">必須</span></label>' +
    '            <input type="tel" id="b-tel" placeholder="090-1234-5678" autocomplete="tel" required>' +
    '            <p class="error-msg">電話番号を入力してください</p></div>' +
    '        </div>' +
    '        <div class="form-row single">' +
    '          <div class="field"><label for="b-note">宿への連絡事項(任意)</label>' +
    '            <textarea id="b-note" placeholder="到着が遅くなる、アレルギーがある、貸切風呂の希望時間帯 など"></textarea></div>' +
    '        </div>' +
    '      </fieldset>' +

    '      <label class="agree-row"><input type="checkbox" id="b-agree">' +
    '        <span>これはデモサイトであり、実際の予約・決済・個人情報の送信は行われないことを理解しました。<span class="req">必須</span></span></label>' +
    '      <p class="error-msg" id="agree-error" style="margin:-8px 0 12px">チェックを入れてください</p>' +
    '      <button type="submit" class="btn btn-lg btn-block">この内容で予約する(デモ)</button>' +
    '    </form>' +

    '    <aside class="bsummary">' +
    '      <div class="bsummary-img" style="background-image:url(&quot;' + d.sceneURI(hotel, 800, 300) + '&quot;)"></div>' +
    '      <div class="bsummary-body">' +
    '        <p class="hname">' + ui.esc(hotel.name) + '</p>' +
    '        <p class="rname">' + ui.esc(room.name) + '</p>' +
    '        <div class="bsummary-badges">' + ui.badge('風呂・トイレ別', 'sep') + (room.bath.wash ? ui.badge('洗い場付き') : '') + ui.badge(room.bath.type.split('・')[0], 'room') + '</div>' +
    '        <table class="price-table" id="price-table"></table>' +
    '        <p class="side-note">※ 表示は「1名あたり単価 × 人数 × 泊数」の概算です(税・入湯税込みの想定)。</p>' +
    '      </div>' +
    '    </aside>' +
    '  </div>' +
    '</div>';

  /* ---------- 料金計算 ---------- */
  function calc() {
    const nights = Number(document.getElementById('b-nights').value);
    const guests = Number(document.getElementById('b-guests').value);
    const mealVal = document.getElementById('b-meal').value;
    const meal = MEALS.filter(function (m) { return m.v === mealVal; })[0] || MEALS[0];
    const unit = room.price + meal.adj;
    const stay = unit * guests * nights;
    const kSel = document.querySelector('input[name="kashikiri"]:checked');
    const kIdx = kSel && kSel.value !== '' ? Number(kSel.value) : -1;
    const kFee = kIdx >= 0 ? feeYen(paidKashikiri[kIdx]) : 0;
    return { nights: nights, guests: guests, unit: unit, stay: stay, kIdx: kIdx, kFee: kFee, total: stay + kFee };
  }
  function renderPrice() {
    const c = calc();
    let rows =
      '<tr><td>' + ui.yen(c.unit) + ' × ' + c.guests + '名 × ' + c.nights + '泊</td><td>' + ui.yen(c.stay) + '</td></tr>';
    if (c.kIdx >= 0) {
      rows += '<tr><td>' + ui.esc(paidKashikiri[c.kIdx].name) + '</td><td>' + ui.yen(c.kFee) + '</td></tr>';
    }
    rows += '<tr class="total"><td>合計(税込)</td><td>' + ui.yen(c.total) + '</td></tr>';
    document.getElementById('price-table').innerHTML = rows;
  }
  ['b-nights', 'b-guests', 'b-meal'].forEach(function (id) {
    document.getElementById(id).addEventListener('change', renderPrice);
  });
  document.querySelectorAll('input[name="kashikiri"]').forEach(function (r) {
    r.addEventListener('change', renderPrice);
  });
  renderPrice();

  /* ---------- バリデーションと完了画面 ---------- */
  function invalid(id, bad) {
    const field = document.getElementById(id).closest('.field');
    if (field) field.classList.toggle('invalid', bad);
    return bad;
  }
  document.getElementById('bform').addEventListener('submit', function (e) {
    e.preventDefault();
    const checkin = document.getElementById('b-checkin');
    let bad = false;
    bad = invalid('b-checkin', !checkin.value || checkin.value < iso(today)) || bad;
    bad = invalid('b-name', !document.getElementById('b-name').value.trim()) || bad;
    bad = invalid('b-kana', !document.getElementById('b-kana').value.trim()) || bad;
    bad = invalid('b-email', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(document.getElementById('b-email').value)) || bad;
    bad = invalid('b-tel', !/^[0-9+\-() ]{10,}$/.test(document.getElementById('b-tel').value)) || bad;
    const agree = document.getElementById('b-agree').checked;
    document.getElementById('agree-error').style.display = agree ? 'none' : 'block';
    if (bad || !agree) {
      const firstBad = document.querySelector('.field.invalid, #agree-error[style*="block"]');
      if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const c = calc();
    const refNo = 'YU-' + String(Math.floor(100000 + Math.random() * 900000));
    const checkinDate = new Date(checkin.value + 'T00:00:00');
    const dateLabel = checkinDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

    root.innerHTML =
      '<div class="wrap"><div class="done-box">' +
      '  <div class="done-ic">' + ui.icon('check') + '</div>' +
      '  <h2>ご予約を承りました(デモ)</h2>' +
      '  <p class="refno">予約番号 <strong>' + refNo + '</strong></p>' +
      '  <p>これはデモです。実際の予約は行われていません。' +
      (hotel.official ? '実際のご予約は <a href="' + ui.esc(hotel.official) + '" target="_blank" rel="noopener noreferrer">公式サイト</a> からどうぞ。' : '') + '</p>' +
      '  <dl class="done-summary">' +
      '    <dt>お宿</dt><dd>' + ui.esc(hotel.name) + '(' + ui.esc(hotel.onsen || hotel.area) + ')</dd>' +
      '    <dt>お部屋</dt><dd>' + ui.esc(room.name) + ' — 風呂・トイレ別/' + ui.esc(room.bath.type) + '</dd>' +
      '    <dt>日程</dt><dd>' + dateLabel + ' から ' + c.nights + '泊・' + c.guests + '名</dd>' +
      (c.kIdx >= 0 ? '    <dt>貸切風呂</dt><dd>' + ui.esc(paidKashikiri[c.kIdx].name) + '(現地で時間帯を確定)</dd>' : '') +
      '    <dt>合計(税込)</dt><dd style="font-weight:700;color:var(--accent)">' + ui.yen(c.total) + '</dd>' +
      '  </dl>' +
      '  <a class="btn" href="index.html">トップへ戻る</a>' +
      '</div></div>';
    window.scrollTo({ top: 0 });
  });
})();
