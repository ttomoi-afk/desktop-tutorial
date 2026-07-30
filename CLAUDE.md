# CLAUDE.md

このリポジトリで作業するときの前提と手順。

## このリポジトリの性質

**ビルドツールなしの静的サイトを2つ同居させたリポジトリ**です。ルートに `package.json` はなく、
テストランナーもありません（`pms/notify/` だけが Node の依存を持ちます）。

| プロジェクト | 場所 | 内容 |
| --- | --- | --- |
| **湯船トラベル** | ルート直下（`index.html` / `assets/` / `api/` / `tools/` / `server/`） | お風呂・温泉に特化した宿検索サイト（送客型メタサーチのデモ）。詳細は `README.md` |
| **プロジェクト管理シート（PMS）** | `pms/` | 6人チーム用のタスク管理 PWA。Firebase Realtime Database で共有。詳細は `pms/README.md` |

両者はコードを共有していません。**触る側だけを読めば足ります。**

## ⚠️ 公開範囲（作業前に必ず確認）

- このリポジトリは **public** です。
- `.github/workflows/deploy-pages.yml` は `path: .`（**リポジトリ全体**）を GitHub Pages に
  アップロードします。`main` に入ったファイルは
  `https://ttomoi-afk.github.io/desktop-tutorial/<パス>` で誰でも取得できます。

したがって **`main` に入れてよいのは「公開して差し支えないもの」だけ**です。
秘密情報・社外秘の事業資料・原価や価格戦略・個人情報などは、たとえ HTML から参照されない
`docs/` や `*.md` であっても、このリポジトリに置かないこと。

例外的に公開してよい既存の鍵（設計上クライアントに埋め込む前提のもの）：

- `assets/js/config.js` の楽天アプリID・アクセスキー（`pk_` 接頭辞）・アフィリエイトID
  — 楽天側の「Allowed websites」でリファラ保護。**ドメインを変えたら楽天側の設定も更新**
- `pms/firebase-config.js` の Firebase web 構成 — アクセス制御は Realtime Database の
  セキュリティルール側で行う（`pms/README.md` 参照）

SMTP 認証情報とチームコードは GitHub Actions Secrets（`SMTP_*` / `MAIL_FROM` / `PMS_TEAM_CODE`）にあり、
リポジトリには入っていません。

## 動かし方

```bash
# どちらのプロジェクトも静的配信で動く（ビルド不要）
python3 -m http.server 8000
#   湯船トラベル → http://localhost:8000/
#   PMS         → http://localhost:8000/pms/
```

PMS は `?sync=local` / `?sync=firebase` で同期モードを、`?code=<チームコード>` でボードを強制指定できます。
`sync=local` は BroadcastChannel + localStorage で**同一端末のタブ間**だけ同期するので、
Firebase なしで同期ロジックを検証できます。

### 生成スクリプト（湯船トラベル）

```bash
node tools/gen-area-lp.js tokyo   # エリアLP（tokyo/osaka/kyoto/okinawa/hokkaido）と sitemap.xml を再生成
node tools/gen-ogp.js             # OGP画像を assets/img/ogp*.png に出力（playwright が必要）
```

- **`assets/js/data.js` の宿データを更新したら `gen-area-lp.js` を必ず再実行**すること。
  エリアLPは本文を静的HTMLに焼き込んでいるため、再生成しないと表示が古いままになります。
- 両スクリプトは `assets/js/data.js` を `eval` で読み込む前提（`global.window` を用意している）。
- `tools/gen-ogp.js` は `ROOT` をリポジトリの絶対パスでハードコードしているので、
  別の場所にクローンしたら書き換えが必要。
- `tools/fetch-images.html` は**本番ドメインで開いて**実行する（楽天APIのリファラ保護のため）。

### メール／Chat 通知の確認（PMS）

送信せずに内容だけ見るには `DRY_RUN=true`：

```bash
cd pms/notify && npm install
PMS_TEAM_CODE=<コード> DRY_RUN=true node reminders.mjs    # 毎朝の期限通知＋.ics
PMS_TEAM_CODE=<コード> DRY_RUN=true node notify-queue.mjs # タスク追加通知キュー
```

GitHub 上からは Actions → *Task deadline reminders* / *Task-add notifications* を
`dry_run=true` で手動実行しても同じ確認ができます。

## 湯船トラベル — 構造

グローバル名前空間 `window.YUBUNE` に IIFE で載せる素の JS（ES modules ではない）。
`<script>` の読み込み順に依存するので、順序を変えないこと。

```
config.js → data.js → ui.js → (home|search).js          # index.html / search.html
config.js → rakuten.js → data.js → ui.js → detail.js    # detail.html（APIを使うのは詳細だけ）
```

| ファイル | 役割 |
| --- | --- |
| `assets/js/config.js` | 外部サービス設定（楽天のID類）を**ここに集約** |
| `assets/js/data.js` | 宿データ（実在71軒）＋ 風景SVGジェネレータ。公開API＝`YUBUNE.data`（`HOTELS` / `TAGS` / `TYPES` / `REGIONS` / `SPRING_TYPES` / `sceneURI` / `bathTileSVG` / `findHotel`） |
| `assets/js/ui.js` | 共通UI。ヘッダー・フッター・宿カード・バッジ・**送客CTA（`bookingCtas`）** |
| `assets/js/rakuten.js` | 楽天トラベルAPI（新基盤 `openapi.rakuten.co.jp`）。fetch→JSONP フォールバック、429 は1.6秒待って1回再試行。**失敗しても例外を投げず null を返す** |
| `assets/js/home.js` / `search.js` / `detail.js` | 各ページの描画 |
| `api/hotels.json` | 全掲載データの静的API |
| `docs/hotel-research.json` | 調査・検証の全記録（出典と反証チェック） |
| `server/api/vacancy.js` | 空室・最低価格プロキシの**雛形**。GitHub Pages では動かない（Vercel移行時に有効化） |

`data.js` の読み込み時に派生値を後付けしている点に注意：`minPrice`（`rooms[].price` の最小）、
`hasFreeKashikiri`、`noRoomBath` / `someNoRoomBath`（`bath.type` の「浴室なし」判定）。

### 掲載ルール（データを触るとき必ず守る）

このサイトの存在理由そのものなので、勝手に緩めないこと。

- **風呂・トイレ別の客室だけを掲載**。ユニットバスの客室はデータモデル上も存在させない
- 一部客室のみセパレートなら `sepScope: "partial"`、客室に浴室がない宿は `bath.type` に「浴室なし」
- **評価・クチコミは掲載しない**（捏造を避けるため）。事実ベースの「お風呂の見どころ」で代替
- 各宿に `sources`（出典URL）と `uncertain`（未確認事項）を必ず記録する。
  料金は「参考」表記（温泉宿＝1泊2食・1名／ビジネスホテル＝素泊まり・1名）
- 宿の画像は楽天APIの施設画像のホットリンク（送客リンクとセット・フッターにクレジット）。
  `assets/img/` に写真を置くときは**掲載権利のある画像のみ**（`assets/img/README.md`）

## PMS — 構造

`pms/` は ES modules。3層に分かれています。

| ファイル | 役割 |
| --- | --- |
| `store.js` | データモデル・localStorage 保存・集計（全体進捗、ガント位置）。**純関数の導出は全部ここ** |
| `sync.js` | 同期層。`FirebaseBackend`（本番）/ `LocalBackend`（タブ間・設定不要） |
| `app.js` | 画面描画・エディタ・store と sync の橋渡し。`data-action` によるイベント委譲 |
| `notify/chat.mjs` | Google Chat の文面生成（アプリと Actions ジョブで共用） |
| `notify/reminders.mjs` | 毎朝8:00 JST の期限通知＋`.ics`。Chat 日次ダイジェストもここ |
| `notify/notify-queue.mjs` | タスク追加通知キューの処理（約15分ごと） |

### 同期の約束事

- 状態は**順序付き配列**（`members` / `projects` / `tasks`）。同期は **id キーの「board」形**
  （`{ meta, members:{id:…}, projects:{id:…}, tasks:{id:…} }`）。変換は `toBoard` / `fromBoard`
- **mutation は必ずパッチを返す**（`{ path: 'tasks/t1', value }`、削除は `value: null`）。
  呼び出し側は `pushPatch()` に渡す。パス単位で書くので、別のタスクを編集しても衝突しない
  （同じタスクは last-write-wins）
- 保存先は Firebase の `boards/<チームコード>`。RTDB のキーに使えない文字があるため
  `sanitizeCode()` で `. # $ [ ] /` と空白を `-` に正規化する
- 予約データは `boards/<code>/_notify/<id>`、`.ics` の送信済みハッシュは `boards/<code>/_calsync/<memberId>`
- **担当者は `memberIds`（配列）**。旧データの単一 `memberId` も残っているので、
  参照は必ず `taskMembers(t)` 経由（`notify/*.mjs` にも同等のヘルパーがある）
- クラウド接続に失敗してもアプリはローカルモードで動き続ける設計。この性質を壊さないこと

### 触るときの注意

- **`sw.js` は同一オリジンのアプリファイルを network-first** にしている（cache-first だと
  デプロイしても更新が反映されないバグになった）。Firebase の auth/database 通信は素通し。
  キャッシュ名 `pms-v2` はキャッシュを全消しする時だけ上げる
- チームコードを切り替えると**前のボードは画面から消える**（`store.clear()`）。
  接続先が空のボードだったときだけ「引き継ぎますか？」と確認して移行する（`askMigrate`）。
  データが入っているボードは絶対に上書きしない
- Google Chat の即時通知は `mode: 'no-cors'` の投げっぱなし POST。**成功判定はできない**
- Webhook URL とチームコードは `meta` に入り、エクスポートJSONにも含まれる（機微情報の扱いに注意）

## 慣習

- **コメント・UI文言・コミットメッセージは日本語**（既存の書き方に合わせる）
- HTML/CSS/Vanilla JS のみ。フレームワーク・ビルドステップを持ち込まない
- HTML を文字列で組み立てるので、**外部由来の値は必ず `esc()` を通す**
- 日付は `YYYY-MM-DD` 文字列で持ち、比較・加算は UTC の日番号に変換して行う（`store.js` の
  `dayNum` / `isoFromDay`）。タイムゾーンずれを避けるための約束
