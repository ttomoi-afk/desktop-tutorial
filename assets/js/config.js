/* =========================================================
   湯船トラベル — 外部サービス設定(すべてここに集約)

   楽天API(2026年新基盤)は applicationId と accessKey の両方が必須。
   いずれも「Allowed websites」(ttomoi-afk.github.io)からのリクエスト
   のみ許可されるリファラ/Origin保護付きのため、公開コードに置いてよい。
   ドメイン変更時は楽天側の Allowed websites も更新すること。
   ========================================================= */
window.YUBUNE = window.YUBUNE || {};
window.YUBUNE.config = {
  // 楽天ウェブサービス(新基盤)のアプリID(UUID形式)
  RAKUTEN_APP_ID: '8a094ffa-dd01-4745-9a38-77e7503ee5c4',
  // 楽天ウェブサービス(新基盤)のアクセスキー(pk_ で始まる)。取得したら設定
  RAKUTEN_ACCESS_KEY: '',
  // 楽天アフィリエイトID(送客リンクの計測用)
  RAKUTEN_AFFILIATE_ID: '55a5744e.ac0d6e79.55a5744f.28b59c5c',
};
