/* =========================================================
   湯船トラベル — 楽天トラベルAPI クライアント(ブラウザ用)
   GitHub Pages(静的)で動かすため JSONP を使用。
   CORS 不要・リファラは通常どおり送信されるため、
   楽天側の「Allowed websites」保護がそのまま機能する。
   取得失敗時は静かに諦める(表示しない)設計。
   ========================================================= */
(function () {
  'use strict';

  window.YUBUNE = window.YUBUNE || {};
  var API_BASE = 'https://app.rakuten.co.jp/services/api/Travel/';

  function jsonp(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var cb = '__rk_cb_' + Math.random().toString(36).slice(2);
      var script = document.createElement('script');
      var timer = setTimeout(function () { cleanup(); reject(new Error('timeout')); }, timeoutMs || 8000);
      function cleanup() {
        clearTimeout(timer);
        try { delete window[cb]; } catch (e) { window[cb] = undefined; }
        if (script.parentNode) script.parentNode.removeChild(script);
      }
      window[cb] = function (data) { cleanup(); resolve(data); };
      script.onerror = function () { cleanup(); reject(new Error('load_error')); };
      script.src = url + (url.indexOf('?') === -1 ? '?' : '&') + 'callback=' + cb;
      document.head.appendChild(script);
    });
  }

  function buildUrl(endpoint, params) {
    var appId = (window.YUBUNE.config || {}).RAKUTEN_APP_ID;
    var q = new URLSearchParams(Object.assign({ applicationId: appId, format: 'json', formatVersion: '2' }, params));
    return API_BASE + endpoint + '?' + q.toString();
  }

  // dailyCharge.total を再帰的に集めて最小値を返す
  function collectMinTotal(node, current) {
    if (node == null || typeof node !== 'object') return current;
    if (node.dailyCharge && typeof node.dailyCharge.total === 'number') {
      var t = node.dailyCharge.total;
      current = (current === null || t < current) ? t : current;
    }
    var keys = Object.keys(node);
    for (var i = 0; i < keys.length; i++) {
      current = collectMinTotal(node[keys[i]], current);
    }
    return current;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /**
   * 指定ホテルの「2週間後・1泊・2名」の楽天最低価格(合計)を取得。
   * 失敗・空室なしは null を返す(例外は投げない)。
   */
  function minCharge(hotelNo) {
    var appId = (window.YUBUNE.config || {}).RAKUTEN_APP_ID;
    if (!appId || !hotelNo) return Promise.resolve(null);
    var checkin = new Date(); checkin.setDate(checkin.getDate() + 14);
    var checkout = new Date(checkin); checkout.setDate(checkout.getDate() + 1);
    var url = buildUrl('VacantHotelSearch/20170426', {
      hotelNo: String(hotelNo),
      checkinDate: fmtDate(checkin),
      checkoutDate: fmtDate(checkout),
      adultNum: '2',
      hits: '10',
    });
    return jsonp(url).then(function (data) {
      if (!data || data.error) return null;
      var min = collectMinTotal(data, null);
      return min === null ? null : { total: min, checkin: fmtDate(checkin) };
    }).catch(function () { return null; });
  }

  /** 疎通テスト用: 施設基本情報の取得 */
  function hotelInfo(hotelNo) {
    return jsonp(buildUrl('SimpleHotelSearch/20170426', { hotelNo: String(hotelNo) }));
  }

  window.YUBUNE.rakuten = { minCharge: minCharge, hotelInfo: hotelInfo, _jsonp: jsonp, _buildUrl: buildUrl };
})();
