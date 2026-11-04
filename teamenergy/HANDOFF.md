# Team Energy コーポレートサイト 引き継ぎ資料（エンジニア向け）

最終更新: 2026-11-05　／　作成: Claude Code（Team Energy 友井との作業セッション）

## 1. 何を渡すか

- `site/` … 公開用ファイル一式。ドメイン直下（https://teamenergy.co.jp/）に置く前提で作ってあります。ビルド不要の静的 HTML です。
- `HANDOFF.md`（この文書）、`DEPLOY.md`（公開手順と DNS の注意）、`README.md`（編集のしかた）
- `tools/build-dist.sh` … ソースから `site/` 相当の一式を作り直し、リンク切れを検査するスクリプト
- 元データと変更履歴は GitHub にあります: https://github.com/ttomoi-afk/desktop-tutorial の `teamenergy/` フォルダ、ブランチ `claude/team-energy-homepage-ceqpym`
- **サーバー・WordPress・FTP の認証情報はこの zip に含めていません。** 友井から別途受け取ってください。

## 2. 構成

```
site/
  index.html             トップ（Concept / Group / Portfolio / People / News / M&A導線）
  sourcing.html          M&A・事業承継ページ（問い合わせ窓口を含む）
  cases/teshikaga.html   事例ページ（弟子屈チャレンジ）
  404.html               Not Found（パスはドメイン直下からの絶対パス）
  robots.txt / sitemap.xml
  assets/style.css       全ページ共通のスタイル（約950行、変数は :root）
  assets/main.js         共通スクリプト（ナビ、ヒーロー、アコーディオン、カウントアップ、News/Stories の描画）
  assets/hero-magma.js   ヒーロー動画の制御
  assets/logo-mark.svg   ロゴマーク単体（ファビコン用）
  assets/img/            写真・事業領域ロゴ（logos/）・OGP画像（ogp.jpg）・apple-touch-icon.png
  assets/movie/          ヒーロー動画 PC/SP の mp4・webm とポスター画像（約12MB）
  data/news.json         News の内容（JSON を書き換えるだけで更新できる）
  data/stories.json      Stories の内容
```

技術要件:
- フレームワーク・ビルドツールなし。HTML / CSS / JavaScript（ES5 相当）のみ。
- 外部依存は Google Fonts（Cormorant Garamond / Jost / Shippori Mincho）だけ。
- `data/*.json` を `fetch` で読むため、**HTTP サーバー経由で表示する必要があります**（`file://` では News が空になります）。ローカル確認は `site/` で `python3 -m http.server 8000`。
- 対応ブラウザは現行の Chrome / Safari / Edge / Firefox。`aspect-ratio`、`grid-template-rows: 0fr` のアニメーション、`mix-blend-mode` を使っています。

## 3. ページの部品と、どこを触ると何が変わるか

| 部品 | 場所 | メモ |
| --- | --- | --- |
| ロゴ | 各 HTML の `<body>` 直後にある `<symbol id="te-logo">`、ヘッダー・フッターの `<svg class="logo-h"><use href="#te-logo"/></svg>` | 公式の Illustrator データ（8LOGO_OL TE横字.AI）をベクター変換したもの。文字は `currentColor`。大きさは `.logo-h` の height だけで変える（比率は固定） |
| ヘッダー | `.header` | ヒーロー動画の上では `body.on-dark-hero` が付いて白抜きになる（main.js がスクロールで付け外し） |
| ヒーロー | `.hero-dark` | 動画は PC/SP で切替。3つの数字（4社／2社／18社）は `data-count` でカウントアップ |
| Concept | `#concept` | 宣言文・説明・目標の3段。文章は HTML 直書き |
| Group | `#group` の `#biz-acc` | 6つの事業領域ロゴ（`assets/img/logos/te-*.png`）＋「＋」で傘下各社のリンク一覧が開くアコーディオン。URL 未確認の Team Glocal・ANY は `span.is-plain` でリンクなし |
| Portfolio | `#results` | 数字3枠、棒グラフ（`<svg class="chart">` に直書き。棒の高さは目安で数値連動なし）、「表で見る」、4社のカード（社名が各社サイトへのリンク） |
| People | `#people` | 代表（写真 4:3、略歴、年表）と役員2名。杉野氏は写真待ちで `.member-photo-none` のまま |
| News | `#news` | `data/news.json` を main.js が描画（最新5件）。`date` / `category` / `title` / `url`。`verify` キーは社内メモで表示されない |
| Stories | `#stories` | `data/stories.json`。事例ページとインタビュー記事（現行サイトの `/magazine/` へのリンク） |
| M&A 導線 | `.join` | sourcing.html へのボタン |
| フッター | `.footer` | 会社情報（住所など）。トップと sourcing.html の両方にあるので、住所変更時は2か所 |

よくある更新:
- ニュース追加 → `data/news.json` の先頭に追加
- 住所・会社情報 → `index.html` と `sourcing.html` のフッター、`404.html` は会社情報なし
- 杉野氏の写真が届いたら → `assets/img/` に置き、`index.html` の `.member-photo-none` ブロックを服部氏と同じ `<img>` 構造に
- 事業領域ロゴの高解像度版が届いたら → `assets/img/logos/te-*.png` を同じファイル名で差し替え（白地は透過にする）
- 文言 → 該当の HTML を直接編集。`PLAN.md`（GitHub 側）に変更履歴あり

## 4. WordPress への組み込み方針

テストサイト（studiogvoice-test.com）は WordPress で動いています。2通りあります。

**A. 静的ファイルのまま同居させる（最短）**
1. まず `site/` の中身をサブディレクトリ（例 `/new/`）にアップロードして表示確認。
2. 本番化するときはドキュメントルートに置く。Apache では `index.html` が `index.php` より優先される設定が一般的で、トップは新サイト、`/magazine/` などの既存ページは WordPress のまま残せる（`DirectoryIndex` の順序で変わるので要確認）。
3. 404 は `.htaccess` に `ErrorDocument 404 /404.html`。WordPress 側の 404 が優先される場合はそのままでも可。
4. 既存の WordPress テーマのヘッダー・フッターとは独立。見た目の統一は不要。

**B. WordPress テーマ化する（更新を管理画面に寄せる）**
- `header.php` にロゴ `<symbol>` とヘッダー、`footer.php` にフッターと `main.js`。`front-page.php` がトップ、`page-sourcing.php` が M&A、事例は固定ページまたはカスタム投稿 `case`。
- CSS/JS は `wp_enqueue_style` / `wp_enqueue_script` で読み込み、画像パスは `get_template_directory_uri()` に置換。
- News は WordPress の投稿（カテゴリ info / group）に移し、`main.js` の `loadJSON('data/news.json', …)` を REST API（`/wp-json/wp/v2/posts`）か、PHP でレンダリングする形に変更。`category` の表示名は小文字英字をそのまま表示している。
- Stories も同様。画像は `stories.json` の `image` を参照。
- `assets/main.js` の fetch パスは相対（`data/news.json`）なので、テーマ化するときは絶対 URL にする。
- 動画は 12MB あるので、メディアライブラリではなくテーマ内かサーバー直置きが無難。
- OGP・canonical は各 HTML の `<head>` に固定 URL で書いてある。テーマ化するときは `wp_head()` と SEO プラグインに置き換える。

いずれの場合も `robots.txt` / `sitemap.xml` は WordPress 側が生成するものと重複しないよう、どちらかに寄せてください。

## 5. 公開時のチェック

- DNS を変える場合は MX / SPF / DKIM / DMARC を残す（メールが止まる）。詳細は `DEPLOY.md`
- 現行サイトの主要 URL（`/magazine/…` など）を残すか、新サイトへ 301 リダイレクトするか決める
- `https://teamenergy.co.jp/sitemap.xml` を Google Search Console に登録
- OGP 画像 `assets/img/ogp.jpg`（1200×630）、apple-touch-icon（180×180）あり
- スマホ（390px）とPC（1440px）で全ページ表示確認済み。横スクロールなし

## 6. 未確定・要確認（友井に確認）

- 杉野氏の写真（現在「写真準備中」）
- 事業領域ロゴ（te-*.png）の高解像度版。今は約35px 高の画像を拡大しているため高精細画面でややぼやける
- 東京オフィスの住所（Web 検索ベース）
- Team Glocal、ANY の公式サイト URL（現在リンクなし）
- News 1件目（2025.04 事業運営体制の変更）の掲載日と、GeoDreams の SBI 出資の発表日・引受先の正式社名（報道ベース: 2026年9月8日）
- ふるさと熱電の公式サイト URL（furusato-nd.co.jp。Web 検索で確認）
- Adobe Fonts を使うかどうか（index.html の `<head>` にコメントアウトした読み込み行あり。使う場合は style.css の `--en` / `--jp` を差し替え）

## 7. 掲載してはいけない情報（必ず守る）

- ふるさと熱電の売却金額、バイウィル・GeoDreams の企業価値は **非公開**。グラフの棒の高さも金額を示さない前提で統一してある
- レジルの TOB は「500億円規模」までの表記
- M&A の投資基準・重点業種・担当者の経歴など、以前の M&A ページにあった詳細はトップにも M&A ページにも載せない（経営判断で削除済み）
- `sourcing@teamenergy.co.jp` は M&A ページの窓口としてのみ掲載

## 8. 元データの所在

- GitHub: https://github.com/ttomoi-afk/desktop-tutorial `teamenergy/`（ブランチ `claude/team-energy-homepage-ceqpym`）。`PLAN.md` に全変更履歴
- ロゴ原本: Google Drive「8LOGO_TeamEnergy」（8LOGO_OL TE横字.AI、TE_LOGO_PNG.png ほか）
- 会社紹介資料（PowerPoint/PDF）: GitHub の `teamenergy/docs/`。生成スクリプトは `teamenergy/tools/deck/`
- 事例ページの写真: NUPPUKOTTE 公式サイトの画像を使用。権利の確認は友井経由で
