---
name: pms-release
description: プロジェクト管理シート（pms/ 配下のチーム用タスクPWA）を変更したときに確認すべき手順とチェックリスト。過去に実際に起きた不具合（Service Workerのキャッシュで更新が反映されない、チームコード切替で前のボードが残る、合言葉変更でデータが消える、スマホ用とPC用の描画が片方だけ直っている、ローカルモードで壊れる）を再発させないための確認と、通知系を触ったときの dry_run 検証方法。「PMSを直した」「タスク管理アプリに機能を追加して」「pms/ を変更」「ガントチャートを直す」「通知を変えた」「マージ前に確認したい」など pms/ 配下に手を入れる作業では必ずこのスキルを使うこと。
---

# プロジェクト管理シートの変更時チェック

## このスキルが必要な理由

このアプリはテストが無く、**同じ種類の不具合を過去に繰り返し踏んでいる**。
履歴に残っている修正コミットがそのままチェックリストになる:

- 「Service Worker を network-first 化して更新が反映されない問題を修正」
- 「チームコード切り替え時に前のボードが残る不具合を修正」
- 「合言葉を変えるときにデータを引き継げるようにした」
- 「PC（横）画面レイアウトを追加（レスポンシブ対応）」

どれも「動いているように見えるが、別のモード・別の端末・2回目の操作で壊れる」類のもの。
1回開いて動いたことを確認するだけでは足りない、というのがこのアプリの性質。

## 変更箇所ごとに見る場所

責務が4層に分かれている。**足す場所を間違えるとテストできない形になる**ので、まず置き場所を決める。

| 層 | ファイル | 責務 |
| --- | --- | --- |
| 状態と導出 | `pms/store.js` | `STATUS` 定義、`createStore()`、`deriveSummary()`、`deriveGantt()`、`toBoard()`/`fromBoard()`。**DOMに触らない** |
| 描画とイベント | `pms/app.js` | 全ての描画。**スマホ縦（`render*`）とPC横（`renderDt*`）の2系統がある** |
| 同期 | `pms/sync.js` | `LocalBackend`（localStorage + BroadcastChannel）と `FirebaseBackend`（RTDB + 匿名認証） |
| 通知文面 | `pms/notify/chat.mjs` | Google Chat の文面。**ブラウザと GitHub Actions の両方から import される** |

計算ロジックを `app.js` に書くと、状態だけ切り出して確かめられなくなる。
導出は `store.js` の純粋関数として書くと、描画を経由せずに検証できる。

## 必ず確認すること

### 1. スマホ用とPC用の両方を直したか

`app.js` はレイアウトを2系統の別関数で描いている（`renderOverview` / `renderGantt` / `renderMember`
に対して `renderDtSidebar` / `renderDtMain` / `dtOverviewHTML` / `dtMemberHTML`）。
UIを変えたのに片方しか直っていないのが最も多い漏れ。

ブラウザの幅を狭める／広げるで両方に切り替えて確認する。

### 2. ローカルモードとクラウドモードの両方で動くか

既定は**ローカルモード**（この端末の localStorage だけ）。Firebase 接続は任意機能。
`decideMode()` が接続情報の有無で切り替える。

- **ローカルモードで開いて動くか**（未接続のユーザーが壊れないこと）
- **クラウド接続してもう一度同じ操作をして動くか**
- 2つのタブで開いて、片方の変更がもう片方に伝わるか（ローカルは BroadcastChannel、クラウドは RTDB）

新しい状態を足したなら、`toBoard()` / `fromBoard()` の両方に通す必要がある。
片方だけだとローカルでは動くのにクラウドで消える。

### 3. チームコード（合言葉）の切り替えで壊れないか

チームコードが**そのまま RTDB のボードキー**になる設計。ここは実際に2回不具合が出ている。

- コードAで作業 → コードBに切り替え → **Aのボードが残って見えていないか**
- コードを変えたとき、それまでのデータを引き継げるか（引き継ぎ動作を壊していないか）
- 接続を解除したとき、表示中のデータが端末に残り、チームの共有ボードは消えないか
- `.` `#` `$` `[` `]` `/` や空白を含むコードを入れても `sanitizeCode()` が正規化するか

### 4. Service Worker のキャッシュ

`pms/sw.js` は同一オリジンのアプリファイルを **network-first** で扱う。
以前 cache-first にしていたため「デプロイしても更新が反映されない」という
分かりにくい不具合が起きた。**cache-first に戻してはいけない。**

- `pms/` にファイルを**追加**したなら、`sw.js` の `CORE` 配列にも追加する（オフライン時に欠ける）
- `CACHE`（現在 `'pms-v2'`）を上げる意味は**全消しのみ**で、鮮度はもう依存していない。
  キャッシュ構成を変えて古いキャッシュを捨てたいときだけ上げる
- 確認するときは DevTools の Application → Service Workers で
  「Update on reload」を有効にするか、一度 unregister する

### 5. 通知を触ったなら dry_run で確認する

通知は**2経路**あり、片方だけ直すと挙動が食い違う。

| 経路 | 実行元 | 用途 |
| --- | --- | --- |
| ブラウザ直送 | `app.js` → Google Chat Webhook | タスク追加・完了の即時通知 |
| Actions（15分ごと） | `.github/workflows/task-add-notify.yml` → `notify-queue.mjs` | RTDBに積まれた通知予約をメール送信 |
| Actions（08:00 JST） | `.github/workflows/task-reminders.yml` → `reminders.mjs` | 期限が本日・超過のタスクをメール（`.ics` 同梱） |

文面を変えるときは `notify/chat.mjs` を直すと両方に効く（共有されているため）。

**送信せずに内容だけ確認する方法**が用意されている。実データにメールを飛ばす前に必ず使う。

```bash
# ローカルで
cd pms/notify && npm install
DRY_RUN=true PMS_TEAM_CODE=<code> FIREBASE_API_KEY=<key> FIREBASE_DB_URL=<url> node reminders.mjs
DRY_RUN=true PMS_TEAM_CODE=<code> FIREBASE_API_KEY=<key> FIREBASE_DB_URL=<url> node notify-queue.mjs
```

GitHub 上からは、対象ワークフローの **Run workflow** で `dry_run` に `true` を入れると
送信せずログ出力だけになる。

Actions 側が使う Secrets: `PMS_TEAM_CODE` / `FIREBASE_API_KEY` / `FIREBASE_DB_URL` /
`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM`。
新しい環境変数を増やしたら、**ワークフローの `env:` にも足す**（ローカルだけ通って本番で落ちる典型）。

### 6. データの移行を考えたか

既存タスクの形を変える変更（フィールド追加・意味変更）では、**すでに保存されている
データが読めるか**を確認する。担当者を単数 `memberId` から複数 `memberIds` に変えたときのように、
`reminders.mjs` の `taskMembers()` は両方の形を受けられるように書かれている。
同じ配慮が必要かを検討する。

localStorage に古い形が残っている状態でも開けるか、実際に古いデータで試す。

## 動かして確認する

```bash
python3 -m http.server 8000
# → http://localhost:8000/pms/
```

`store.js` の導出関数だけを確かめたいときは Node から直接 import できる（ES modules なので）。

## チェックリスト

- [ ] スマホ縦・PC横の**両方**のレイアウトで確認した
- [ ] ローカルモードとクラウドモードの**両方**で動いた
- [ ] 状態を足したなら `toBoard()` / `fromBoard()` の両方を通した
- [ ] チームコードの切り替え・接続解除で前のボードが残らない
- [ ] `pms/` にファイルを追加したなら `sw.js` の `CORE` にも追加した
- [ ] Service Worker を cache-first に戻していない
- [ ] 通知を変えたなら `DRY_RUN=true` で文面を確認した
- [ ] 環境変数を増やしたならワークフローの `env:` にも追加した
- [ ] 古い形のデータでも開けることを確認した
- [ ] 機能を変えたなら `pms/README.md` を更新した
