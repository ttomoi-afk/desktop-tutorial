/* 湯船トラベル — 検索結果ページ */
(function () {
  'use strict';
  const d = window.YUBUNE.data;
  const ui = window.YUBUNE.ui;

  ui.renderChrome('search');

  /* ---------- フィルターUI構築 ---------- */
  const regionSel = document.getElementById('f-region');
  d.REGIONS.forEach(function (r) {
    const o = document.createElement('option');
    o.value = r; o.textContent = r;
    regionSel.appendChild(o);
  });

  const springSel = document.getElementById('f-spring');
  d.SPRING_TYPES.forEach(function (s) {
    const o = document.createElement('option');
    o.value = s; o.textContent = s;
    springSel.appendChild(o);
  });

  function countByTag(tag) {
    return d.HOTELS.filter(function (h) { return h.tags.indexOf(tag) !== -1; }).length;
  }
  function buildChecks(containerId, group) {
    const el = document.getElementById(containerId);
    el.innerHTML = Object.keys(d.TAGS).filter(function (k) { return d.TAGS[k].group === group; })
      .map(function (k) {
        return '<label class="fcheck"><input type="checkbox" name="tag" value="' + k + '">' +
          '<span>' + ui.esc(d.TAGS[k].label) + '</span><span class="cnt">' + countByTag(k) + '</span></label>';
      }).join('');
  }
  buildChecks('fg-bath', 'bath');
  buildChecks('fg-komori', 'komori');

  /* ---------- URLパラメータから初期状態を復元 ---------- */
  const params = new URLSearchParams(location.search);
  (params.getAll('tag') || []).forEach(function (t) {
    const cb = document.querySelector('input[name="tag"][value="' + t + '"]');
    if (cb) cb.checked = true;
  });
  if (params.get('type')) {
    const tr = document.querySelector('input[name="htype"][value="' + params.get('type') + '"]');
    if (tr) tr.checked = true;
  }
  if (params.get('region')) regionSel.value = params.get('region');
  if (params.get('spring')) springSel.value = params.get('spring');
  if (params.get('kw')) document.getElementById('kw').value = params.get('kw');
  if (params.get('price')) document.getElementById('f-price').value = params.get('price');

  /* ---------- 状態の取得 ---------- */
  function currentFilters() {
    const typeSel = document.querySelector('input[name="htype"]:checked');
    return {
      type: typeSel ? typeSel.value : '',
      tags: Array.prototype.slice.call(document.querySelectorAll('input[name="tag"]:checked')).map(function (c) { return c.value; }),
      region: regionSel.value,
      spring: springSel.value,
      kw: document.getElementById('kw').value.trim(),
      price: document.getElementById('f-price').value,
      sort: document.getElementById('f-sort').value,
    };
  }

  /* ---------- 絞り込み ---------- */
  function applyFilters(f) {
    let list = d.HOTELS.slice();
    if (f.type) list = list.filter(function (h) { return h.type === f.type; });
    if (f.region) list = list.filter(function (h) { return h.region === f.region; });
    if (f.spring) list = list.filter(function (h) { return h.spring === f.spring; });
    if (f.price) list = list.filter(function (h) { return h.minPrice <= Number(f.price); });
    if (f.kw) {
      const kw = f.kw.toLowerCase();
      list = list.filter(function (h) {
        return (h.name + h.kana + h.area + h.pref + h.onsen).toLowerCase().indexOf(kw) !== -1;
      });
    }
    // タグはAND条件(チェックした条件をすべて満たす)
    f.tags.forEach(function (t) {
      list = list.filter(function (h) { return h.tags.indexOf(t) !== -1; });
    });

    switch (f.sort) {
      case 'price_asc': list.sort(function (a, b) { return a.minPrice - b.minPrice; }); break;
      case 'price_desc': list.sort(function (a, b) { return b.minPrice - a.minPrice; }); break;
      default: // おすすめ順: 編集部の掲載順(データ定義順)
        break;
    }
    return list;
  }

  /* ---------- 横型カード ---------- */
  function resultCard(h) {
    const kashikiriText = h.kashikiri.length
      ? '貸切風呂 ' + h.kashikiri.length + 'つ' + (h.hasFreeKashikiri ? '(無料)' : '')
      : null;
    const bathLine = h.springDetail ? h.springDetail.split('(')[0] : (h.bathLine || '洗い場付き浴室・トイレ別');
    const meta = [
      ui.icon('steam') + ' ' + ui.esc(bathLine),
      kashikiriText ? ui.icon('clock') + ' ' + kashikiriText : '',
      ui.icon('pin') + ' ' + ui.esc(h.access.split('/')[0]),
    ].filter(Boolean).map(function (m) { return '<span>' + m + '</span>'; }).join('');
    return '<article class="rcard-shell">' +
      '<a class="rcard" href="detail.html?id=' + ui.esc(h.id) + '">' +
      '  <div class="rcard-img" style="background-image:' + ui.hotelBgAttr(h, 600, 420) + '">' +
      '    <span class="hcard-area">' + ui.icon('pin') + ui.esc(h.area) + '・' + ui.esc(h.onsen || h.pref) + '</span>' +
      '  </div>' +
      '  <div class="rcard-body">' +
      '    <div class="rcard-top">' + (h.rating ? ui.stars(h.rating) + '<span class="rev" style="font-size:12px;color:var(--ink-faint)">(' + h.reviews + '件)</span>' : '') +
      '      <span class="hcard-meta">' + ui.typeChip(h) + (h.spring ? '<span class="spring">' + ui.esc(h.spring) + '</span>' : '') + '</span></div>' +
      '    <h3 class="rcard-name">' + ui.esc(h.name) + '</h3>' +
      '    <p class="rcard-catch">' + ui.esc(h.catch) + '</p>' +
      '    <div class="rcard-badges">' + ui.sepBadge(h) + ui.tagBadges(h, 5) + '</div>' +
      '    <p class="rcard-desc">' + ui.esc(h.description) + '</p>' +
      '    <div class="rcard-foot">' +
      '      <div class="meta">' + meta + '</div>' +
      '      <div class="rcard-price"><small>' + ui.priceLabel(h) + '</small><strong>' + ui.yen(h.minPrice) + '</strong><small>〜</small></div>' +
      '    </div>' +
      '  </div>' +
      '</a>' +
      '<div class="rcard-cta">' +
      (h.rakutenUrl
        ? '<span class="pr-tag" title="楽天アフィリエイトのリンクです">PR</span>' +
          '<span class="rcard-cta-note">空室・最新料金は楽天トラベルで確認できます</span>' +
          '<a class="btn btn-rakuten" href="' + ui.esc(ui.affiliateUrl(h.rakutenUrl)) + '" target="_blank" rel="noopener noreferrer sponsored" title="楽天トラベルの予約ページへ移動します">予約</a>'
        : '<a class="btn btn-ghost" href="detail.html?id=' + ui.esc(h.id) + '">詳細を見る</a>') +
      '</div>' +
      '</article>';
  }

  /* ---------- 描画 ---------- */
  const resultsEl = document.getElementById('results');
  const countEl = document.getElementById('result-count');
  const activeEl = document.getElementById('active-filters');

  function activeFilterChips(f) {
    const chips = [];
    if (f.type) chips.push({ label: d.TYPES[f.type] ? d.TYPES[f.type].label : f.type, kind: 'type' });
    f.tags.forEach(function (t) {
      chips.push({ label: d.TAGS[t] ? d.TAGS[t].label : t, kind: 'tag', value: t });
    });
    if (f.region) chips.push({ label: f.region, kind: 'region' });
    if (f.spring) chips.push({ label: f.spring, kind: 'spring' });
    if (f.kw) chips.push({ label: '「' + f.kw + '」', kind: 'kw' });
    if (f.price) chips.push({ label: '〜' + ui.yen(Number(f.price)), kind: 'price' });
    return chips;
  }

  function render() {
    const f = currentFilters();
    const list = applyFilters(f);
    countEl.textContent = list.length;

    activeEl.innerHTML = activeFilterChips(f).map(function (c) {
      return '<button type="button" class="afilter" data-kind="' + c.kind + '" data-value="' + (c.value || '') + '">' + ui.esc(c.label) + '</button>';
    }).join('');

    if (!list.length) {
      resultsEl.innerHTML = '<div class="empty-box">' + ui.icon('search') +
        '<h3>条件に合う宿が見つかりませんでした</h3>' +
        '<p>条件を減らすか、エリアを「全国」に戻してみてください。<br>掲載宿はすべて風呂・トイレ別なので、その条件は外しても大丈夫です。</p></div>';
    } else {
      resultsEl.innerHTML = list.map(resultCard).join('');
    }

    // URLを現在の条件で置き換え(共有できるように)
    const p = new URLSearchParams();
    if (f.type) p.set('type', f.type);
    f.tags.forEach(function (t) { p.append('tag', t); });
    if (f.region) p.set('region', f.region);
    if (f.spring) p.set('spring', f.spring);
    if (f.kw) p.set('kw', f.kw);
    if (f.price) p.set('price', f.price);
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
  }

  /* ---------- イベント ---------- */
  document.querySelectorAll('input[name="tag"]').forEach(function (cb) {
    cb.addEventListener('change', render);
  });
  document.querySelectorAll('input[name="htype"]').forEach(function (r) {
    r.addEventListener('change', render);
  });
  regionSel.addEventListener('change', render);
  springSel.addEventListener('change', render);
  document.getElementById('f-price').addEventListener('change', render);
  document.getElementById('f-sort').addEventListener('change', render);
  let kwTimer;
  document.getElementById('kw').addEventListener('input', function () {
    clearTimeout(kwTimer);
    kwTimer = setTimeout(render, 250);
  });

  document.getElementById('clear-filters').addEventListener('click', function () {
    document.querySelectorAll('input[name="tag"]:checked').forEach(function (c) { c.checked = false; });
    document.querySelector('input[name="htype"][value=""]').checked = true;
    regionSel.value = '';
    springSel.value = '';
    document.getElementById('kw').value = '';
    document.getElementById('f-price').value = '';
    render();
  });

  activeEl.addEventListener('click', function (e) {
    const btn = e.target.closest('.afilter');
    if (!btn) return;
    const kind = btn.getAttribute('data-kind');
    if (kind === 'tag') {
      const cb = document.querySelector('input[name="tag"][value="' + btn.getAttribute('data-value') + '"]');
      if (cb) cb.checked = false;
    } else if (kind === 'type') document.querySelector('input[name="htype"][value=""]').checked = true;
    else if (kind === 'region') regionSel.value = '';
    else if (kind === 'spring') springSel.value = '';
    else if (kind === 'kw') document.getElementById('kw').value = '';
    else if (kind === 'price') document.getElementById('f-price').value = '';
    render();
  });

  const toggle = document.getElementById('filters-toggle');
  toggle.addEventListener('click', function () {
    const panel = document.getElementById('filters');
    const open = panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '絞り込み条件を閉じる' : '絞り込み条件を開く';
  });

  render();
})();
