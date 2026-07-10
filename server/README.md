# server/ — Phase 1 サーバレスAPI層(未接続の雛形)

GitHub Pages は静的配信のみのため、この層は **Vercel / Cloudflare Pages へ移行したときに有効化**します。
目的: 楽天トラベルAPIのキー秘匿・レートリミット・キャッシュ。

## 構成(予定)

```
server/
  api/
    vacancy.js   ... 空室・最低価格プロキシ(楽天 VacantHotelSearch)
```

## 有効化手順(Vercelの場合)

1. Vercelにこのリポジトリをインポート(Framework: Other、Output: リポジトリ直下)
2. `server/api/` を `api/` として認識させる か、`vercel.json` の `functions` 設定で指定
3. 環境変数を設定
   - `RAKUTEN_APP_ID` … 楽天ウェブサービスのアプリID
4. フロントの取得先を `/api/vacancy?hotelNo=...` に切替(assets/js/ 内は既に静的データと分離済み)

## 注意

- 楽天APIの利用規約・レート制限(1秒1リクエスト目安)を遵守し、CDN/エッジで15分程度キャッシュする
- アフィリエイト計測は `assets/js/ui.js` の `RAKUTEN_AFFILIATE_ID` で行う(この層とは独立)
