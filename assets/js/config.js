/* =========================================================
   湯船トラベル — 外部サービス設定
   RAKUTEN_APP_ID は楽天ウェブサービスのアプリID。
   「Allowed websites」(ttomoi-afk.github.io)からのリクエスト
   のみ許可されるリファラ保護付きのため、公開コードに含めてよい。
   ドメイン変更時は楽天ウェブサービス側の Allowed websites も更新すること。
   ========================================================= */
window.YUBUNE = window.YUBUNE || {};
window.YUBUNE.config = {
  RAKUTEN_APP_ID: '8a094ffa-dd01-4745-9a38-77e7503ee5c4',
};
