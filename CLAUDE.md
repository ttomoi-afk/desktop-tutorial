# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## このリポジトリの構成

**独立した2つの静的アプリが1つのリポジトリに同居している。**ビルド工程・テスト・Lint は一切なく、
どちらも HTML / CSS / Vanilla JS のみで動く。

| アプリ | 場所 | 公開URL | 技術 |
| --- | --- | --- | --- |
| 湯船トラベル（お風呂特化の宿メタサーチ） | リポジトリ直下 | `/desktop-tutorial/` | グローバル名前空間 `window.YUBUNE`、クラシックscript |
| プロジェクト管理シート（チーム用タスクPWA） | `pms/` | `/desktop-tutorial/pms/` | ES modules、Firebase Realtime Database |

`main` に push すると `.github/workflows/deploy-pages.yml` が GitHub Pages へ自動デプロイする。

## コマンド

```bash
# ローカルで動かす（リポジトリ直下。ビルド不要）
python3 -m http.server 8000

# エリアLPを再生成する（1エリア分のLP + sitemap.xml 全体が書き換わる）
node tools/gen-area-lp.js tokyo      # tokyo | osaka | kyoto | okinawa | hokkaido

# OGP画像(1200×630)を全エリア分再生成する（Playwright を使用）
node tools/gen-ogp.js

# 通知スクリプトの動作確認（メールを送らずに内容だけ出力）
cd pms/notify && npm install
DRY_RUN=true PMS_TEAM_CODE=<code> FIREBASE_API_KEY=<key> FIREBASE_DB_URL=<url> node reminders.mjs
DRY_RUN=true PMS_TEAM_CODE=<code> FIREBASE_API_KEY=<key> FIREBASE_DB_URL=<url> node notify-queue.mjs
```

テストランナーは存在しない。検証は「ローカルサーバで実際に開く」か「通知スクリプトの `DRY_RUN`」で行う。

## 湯船トラベル（直下）のアーキテクチャ

### 読み込み順が前提になっている

`config.js` → `data.js` → その他（`ui.js` / `search.js` / `detail.js` / `home.js` / `rakuten.js`）の順で
読む必要がある。各ファイルは `window.YUBUNE.*` に自分の公開APIを足していく方式。

- **`assets/js/config.js`** — 楽天APIのキーを一元管理。`RAKUTEN_APP_ID` / `RAKUTEN_ACCESS_KEY`（`pk_`＝公開可能キー）/ `RAKUTEN_AFFILIATE_ID`。**これらは意図的にコミットされている**（楽天側の「Allowed websites」でリファラ保護されているため）。ドメインを変えるときは楽天の設定も更新すること。
- **`assets/js/data.js`（6,300行超）** — 単一の巨大な `HOTELS` 配列と、宿ごとの風景SVGジェネレータ（シード付き乱数なので毎回同じ絵になる）。ファイル末尾の `forEach` で**派生フラグを実行時に計算している**: `hasFreeKashikiri` / `noRoomBath`（全室が客室浴室なし）/ `someNoRoomBath`（一部が浴室なし）。宿データを読むコードはこの派生フラグに依存している。
- **`assets/js/ui.js`** — `bookingCtas()` が楽天アフィリエイト計測付きの送客CTAを生成する。サイト内で予約は完結せず、楽天トラベル・公式サイトへ送客する設計（Phase 1）。
- **`assets/js/rakuten.js`** — 2026年新基盤のエンドポイント。約1リクエスト/秒の制限があり、429 は1.6秒待って1回だけ再試行する。

### 生成物と手書きを混同しないこと

- **`tokyo.html` / `osaka.html` / `kyoto.html` / `okinawa.html` / `hokkaido.html` は生成物。直接編集してはいけない。** 内容を変えるときは `tools/gen-area-lp.js` の `AREAS` 定義（タイトル・intro・FAQ など）を直し、再生成する。
- **`sitemap.xml` も生成物。** `gen-area-lp.js` を1エリア分実行すると、末尾で `buildSitemap()` が走り、全エリアLP＋全宿の詳細URLを含む sitemap 全体が書き換わる。
- **`api/hotels.json` には生成スクリプトが無い**（`HOTELS` の内容を手で写した静的API）。派生フラグ（`someNoRoomBath` など）まで焼き込まれているため、`data.js` を変えたらここも手で更新する必要があり、放置すると実データとズレる。
- `docs/hotel-research.json` は掲載前の調査・検証の全記録（出典と未確認事項）。`data.js` の `sources` / `uncertain` の裏付けにあたる。

### 掲載基準（データを触るときの制約）

- **ユニットバスの客室は一室も載せない。** 掲載するのは風呂・トイレが別で、洗い場付きの浴室がある客室。
- 「全室セパレート」なのか「一部の客室タイプのみ」なのかを必ず区別する（`sepScope`）。城崎の外湯文化のように**客室に浴室が無い**宿は `noRoomBath` / `someNoRoomBath` で表し、「全室 風呂・トイレ別」とは言い切らない。
- 料金・設備は変動する参考値。各宿に `sources`（出典URL）と `uncertain`（未確認事項）を必ず残す。

`server/api/vacancy.js` は楽天 VacantHotelSearch をキー秘匿付きで中継する Vercel Functions の**雛形で、未接続**。

## プロジェクト管理シート（`pms/`）のアーキテクチャ

責務が4層に分かれている。ロジックを足す場所を間違えないこと。

- **`store.js`** — 純粋な状態とその導出のみ（DOM に触らない）。`STATUS` 定義、`createStore()`（localStorage への永続化＋リスナ通知）、`deriveSummary()`、`deriveGantt()`、`toBoard()` / `fromBoard()`（アプリ内部形式 ⇄ RTDB形式の変換）。
- **`app.js`（750行超）** — 描画とイベントの全部。**スマホ縦レイアウトとPC横（サイドバー）レイアウトの2系統を別関数で描いている**（`render*` と `renderDt*`）。UIを変えるときは両方直す必要がある。
- **`sync.js`** — バックエンドを差し替える層。`LocalBackend`（localStorage ＋ BroadcastChannel で同一端末のタブ間同期）と `FirebaseBackend`（RTDB ＋ 匿名認証）。**チームコード（合言葉）がそのまま RTDB のボードキー**になる。`app.js` の `sanitizeCode()` が RTDB で使えない文字（`. # $ [ ] /` 空白）を除去する。
- **`notify/chat.mjs`** — Google Chat 向けの文面ビルダー。**ブラウザと GitHub Actions の両方から import される**（PWAからの即時通知と、Actions からの定期通知で文面を共有するため）。

`firebase-config.js` の値も**意図的にコミットされている**（クライアント埋め込み前提の公開情報）。実際の保護は
RTDB のルール（`auth != null`）＋匿名ログイン＋合言葉を知っているかどうかで行う。

### Service Worker の注意点

`pms/sw.js` は同一オリジンのアプリファイルを **network-first** で扱う。
以前 cache-first にしていたため「デプロイしても更新が反映されない」不具合が起きた経緯があるので、戻してはいけない。
`CACHE`（現在 `'pms-v2'`）を上げる意味は**全消しのみ**で、鮮度はもう依存していない。
`pms/` にファイルを追加したら `CORE` 配列にも追加する。

### 通知の経路（2系統ある）

| 経路 | 実行 | 用途 |
| --- | --- | --- |
| ブラウザから直接 | `app.js` → Google Chat Webhook | タスク追加・完了の即時通知 |
| GitHub Actions | `task-add-notify.yml`（15分ごと） | アプリが RTDB に積んだ通知予約キューを処理し、案件の参加メンバーへメール送信 |
| GitHub Actions | `task-reminders.yml`（23:00 UTC＝08:00 JST） | 期限が本日・超過のタスクを担当者へメール（Googleカレンダー用 `.ics` 同梱） |

Actions 側は RTDB の REST API からボードを読み、`nodemailer` で送る。
どちらのワークフローも `workflow_dispatch` の `dry_run=true` で送信せずログ出力だけできる。
必要な Secrets: `PMS_TEAM_CODE` / `FIREBASE_API_KEY` / `FIREBASE_DB_URL` / `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM`。

## 慣習

- **コミットメッセージ・UI文言・コード内コメントは日本語**（例:「チームコード切り替え時に前のボードが残る不具合を修正」）。
- 作業は `claude/<機能名>-<id>` ブランチで行い、PR経由で `main` にマージする。`main` への直接 push はデプロイを走らせる。
- README は利用者向けドキュメントとして手厚く維持されている（掲載軒数、セットアップ手順など）。データや機能を変えたら README の該当箇所も更新する。
