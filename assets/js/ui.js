/* =========================================================
   湯船トラベル — 共通UI(ヘッダー/フッター/カード/ヘルパー)
   ========================================================= */

(function () {
  'use strict';

  const D = function () { return window.YUBUNE.data; };

  /* =========================================================
     送客(Phase 1)
     楽天アフィリエイトID等の設定は assets/js/config.js に集約。
     IDが設定されていれば計測付きリンクに切り替わる。
     ========================================================= */
  function affiliateUrl(url) {
    const id = (window.YUBUNE.config || {}).RAKUTEN_AFFILIATE_ID;
    if (!id) return url;
    return 'https://hb.afl.rakuten.co.jp/hgc/' + id + '/?pc=' +
      encodeURIComponent(url) + '&m=' + encodeURIComponent(url);
  }

  /* 送客CTA(楽天トラベル+公式サイト)。small=trueで客室カード用の小型ボタン */
  function bookingCtas(h, small) {
    const smallStyle = ' style="height:40px;padding:0 16px;font-size:13.5px"';
    let html = '';
    if (h.rakutenUrl) {
      html += '<a class="btn' + (small ? '' : ' btn-lg btn-block') + '"' + (small ? smallStyle : '') +
        ' href="' + esc(affiliateUrl(h.rakutenUrl)) + '" target="_blank" rel="noopener noreferrer sponsored">' +
        (small ? '楽天トラベル' : '楽天トラベルで空室・料金を見る') + '</a>';
    }
    if (h.official) {
      html += '<a class="btn btn-ghost' + (small ? '' : ' btn-block') + '"' +
        (small ? smallStyle : ' style="margin-top:8px"') +
        ' href="' + esc(h.official) + '" target="_blank" rel="noopener noreferrer">' +
        (small ? '公式サイト' : '公式サイトで予約') + '</a>';
    }
    return html;
  }

  /* ---------- ヘルパー ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function yen(n) { return '¥' + Number(n).toLocaleString('ja-JP'); }
  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }
  function qsAll(name) {
    return new URLSearchParams(location.search).getAll(name);
  }

  /* ---------- アイコン(inline SVG) ---------- */
  const IC = {
    bath: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-2z"/><path d="M5 12V5.5A2.5 2.5 0 0 1 7.5 3c1.2 0 2.2.8 2.5 2"/><path d="M6 21l-1 1.5M18 21l1 1.5" stroke-width="1.6"/></svg>',
    steam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M7 3c-1.5 2 1.5 3 0 5M12 3c-1.5 2 1.5 3 0 5M17 3c-1.5 2 1.5 3 0 5"/><path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2z"/></svg>',
    separate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="8.5" height="16" rx="1.5"/><rect x="13" y="4" width="8.5" height="16" rx="1.5"/><path d="M8.5 12h.01M16 12h.01"/></svg>',
    drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3s6.5 7 6.5 11.5a6.5 6.5 0 1 1-13 0C5.5 10 12 3 12 3z"/></svg>',
    view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="1.5"/><path d="M3 13l4.5-4 4 3.5L16 9l5 4.5"/><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none"/></svg>',
    person: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="7.5" r="3.5"/><path d="M5 20.5c.8-4 3.5-6 7-6s6.2 2 7 6"/></svg>',
    size: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M9 15l6-6M9 9h6v6"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.8 5.9 6.4.8-4.7 4.4 1.2 6.3L12 17l-5.7 3 1.2-6.3L2.8 9.3l6.4-.8L12 2.6z"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.4-7-11a7 7 0 0 1 14 0c0 4.6-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
    no: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/></svg>',
  };
  function icon(name, cls) {
    return '<span class="ic ' + (cls || '') + '" aria-hidden="true">' + (IC[name] || '') + '</span>';
  }

  /* ---------- ロゴ ---------- */
  const LOGO_SVG = '<svg viewBox="0 0 40 40" fill="none" aria-hidden="true">' +
    '<circle cx="20" cy="20" r="19" fill="#1d4965"/>' +
    '<path d="M9 24h22v2.2a6 6 0 0 1-6 5.8H15a6 6 0 0 1-6-5.8V24z" fill="#f6efe3"/>' +
    '<path d="M14 20.5c-2-2.6 2-3.6 0-6.5M20 21c-2-2.6 2-3.6 0-6.5M26 20.5c-2-2.6 2-3.6 0-6.5" stroke="#f6efe3" stroke-width="2.2" stroke-linecap="round"/>' +
    '</svg>';

  /* ---------- ヘッダー / フッター ---------- */
  function renderChrome(active) {
    const header = document.getElementById('site-header');
    if (header) {
      header.innerHTML =
        '<div class="wrap header-in">' +
        '  <a class="brand" href="index.html">' +
        '    <span class="brand-mark">' + LOGO_SVG + '</span>' +
        '    <span class="brand-text"><strong>湯船トラベル</strong><small>お風呂で選ぶ、日本の宿。</small></span>' +
        '  </a>' +
        '  <nav class="gnav" aria-label="グローバルナビゲーション">' +
        '    <a href="search.html"' + (active === 'search' ? ' class="on"' : '') + '>宿をさがす</a>' +
        '    <a href="search.html?type=onsen">温泉宿</a>' +
        '    <a href="search.html?type=business">ビジネス・シティホテル</a>' +
        '    <a href="index.html#policy">掲載基準</a>' +
        '  </nav>' +
        '  <span class="demo-chip" title="送客型のβ版です。掲載情報は公開情報を基にした参考値で、予約は楽天トラベル・公式サイトなど外部サイトで行います。">β版</span>' +
        '</div>';
    }
    const footer = document.getElementById('site-footer');
    if (footer) {
      footer.innerHTML =
        '<div class="wrap foot-in">' +
        '  <div class="foot-brand">' +
        '    <span class="brand-mark">' + LOGO_SVG + '</span>' +
        '    <div><strong>湯船トラベル</strong><p>風呂・トイレ別の客室と、貸切露天風呂・大浴場の宿を集めた温泉・お風呂特化の宿検索サイト(β)。</p></div>' +
        '  </div>' +
        '  <div class="foot-links">' +
        '    <a href="search.html">宿をさがす</a>' +
        '    <a href="search.html?tag=kashikiri_roten">貸切露天風呂の宿</a>' +
        '    <a href="search.html?tag=room_roten">客室露天風呂の宿</a>' +
        '    <a href="search.html?tag=gensen">源泉かけ流しの宿</a>' +
        '    <a href="search.html?type=business">風呂・トイレ別のビジネス・シティホテル</a>' +
        '    <a href="index.html#policy">掲載基準について</a>' +
        '  </div>' +
        '  <p class="foot-note">※ 本サイトは送客型のβ版です。掲載施設は実在しますが、当サイトは各施設と提携・関係はありません。掲載内容は公式サイト等の公開情報を基にした参考情報で、料金・設備・泉質等は変更される場合があります。最新情報・ご予約は楽天トラベルまたは各施設の公式サイトでご確認ください。楽天トラベルへのリンクには楽天アフィリエイトを利用しています(リンク経由のご予約で当サイトに紹介料が入る場合があります)。</p>' +
        '</div>';
    }
  }

  /* ---------- バッジ ---------- */
  function badge(label, kind) {
    return '<span class="badge' + (kind ? ' badge-' + kind : '') + '">' + esc(label) + '</span>';
  }
  function tagBadges(hotel, max) {
    const TAGS = D().TAGS;
    const prio = ['kashikiri_roten', 'room_roten', 'gensen', 'nigori', 'free_kashikiri', 'kashikiri_uchi', 'room_hanroten', 'view_bath', 'daiyokujo', 'hinoki', 'iwaburo', 'sauna', 'roten', 'yumeguri'];
    const sorted = hotel.tags.slice().sort(function (a, b) { return prio.indexOf(a) - prio.indexOf(b); });
    const shown = max ? sorted.slice(0, max) : sorted;
    let html = shown.map(function (t) {
      const def = TAGS[t];
      if (!def) return '';
      const kind = (t === 'gensen' || t === 'nigori') ? 'onsen' : (t.indexOf('kashikiri') === 0 || t === 'free_kashikiri') ? 'kashikiri' : (t.indexOf('room_') === 0) ? 'room' : '';
      return badge(def.label, kind);
    }).join('');
    if (max && sorted.length > max) html += '<span class="badge badge-more">+' + (sorted.length - max) + '</span>';
    return html;
  }

  function stars(rating) {
    return '<span class="stars" aria-label="評価 ' + rating + '">' + icon('star', 'ic-star') +
      '<strong>' + rating.toFixed(1) + '</strong></span>';
  }

  /* ---------- 宿タイプ・料金ラベル ---------- */
  function typeChip(h) {
    const t = D().TYPES[h.type];
    return t ? '<span class="chip-type chip-type-' + h.type + '">' + esc(t.short) + '</span>' : '';
  }
  // 温泉宿は1泊2食、ビジネスホテルは素泊まりが基準の「参考料金」
  function priceLabel(h, forRoom) {
    if (h.type === 'business') return forRoom ? '参考 素泊まり・1名利用' : '参考 素泊まり・1名';
    return forRoom ? '参考 1泊2食・1名(2名1室)' : '参考 1泊2食・1名';
  }

  /* ---------- 宿カード ---------- */
  function hotelCard(h) {
    const d = D();
    const img = d.sceneURI(h, 640, 400);
    let bathBits = [];
    if (h.type === 'business') {
      bathBits = [h.bathLine || '全室 洗い場付き浴室・トイレ別'];
    } else {
      if (h.kashikiri.length) bathBits.push('貸切風呂 ' + h.kashikiri.length + 'つ' + (h.hasFreeKashikiri ? '(無料)' : ''));
      if (h.tags.indexOf('room_roten') !== -1) bathBits.push('客室露天あり');
      if (h.tags.indexOf('gensen') !== -1) bathBits.push('源泉かけ流し');
    }
    return '' +
      '<article class="hcard">' +
      '  <a class="hcard-link" href="detail.html?id=' + esc(h.id) + '" aria-label="' + esc(h.name) + ' の詳細">' +
      '    <div class="hcard-img" style="background-image:url(&quot;' + img + '&quot;)">' +
      '      <span class="hcard-area">' + icon('pin') + esc(h.area) + '・' + esc(h.onsen || h.pref) + '</span>' +
      '    </div>' +
      '    <div class="hcard-body">' +
      '      <p class="hcard-catch">' + esc(h.catch) + '</p>' +
      '      <h3 class="hcard-name">' + esc(h.name) + '</h3>' +
      '      <p class="hcard-meta">' + (h.rating ? stars(h.rating) + '<span class="rev">(' + h.reviews + '件)</span>' : '') + typeChip(h) +
      (h.spring ? '<span class="spring">' + esc(h.spring) + '</span>' : '') + '</p>' +
      '      <div class="hcard-badges">' + badge('全室 風呂・トイレ別', 'sep') + tagBadges(h, 3) + '</div>' +
      '      <p class="hcard-bath">' + icon('steam') + esc(bathBits.join(' / ')) + '</p>' +
      '      <p class="hcard-price"><small>' + priceLabel(h) + '</small><strong>' + yen(h.minPrice) + '</strong><small>〜</small></p>' +
      '    </div>' +
      '  </a>' +
      '</article>';
  }

  /* ---------- 公開 ---------- */
  window.YUBUNE.ui = {
    esc: esc, yen: yen, qs: qs, qsAll: qsAll,
    icon: icon, badge: badge, tagBadges: tagBadges, stars: stars,
    typeChip: typeChip, priceLabel: priceLabel,
    affiliateUrl: affiliateUrl, bookingCtas: bookingCtas,
    hotelCard: hotelCard, renderChrome: renderChrome,
  };
})();
