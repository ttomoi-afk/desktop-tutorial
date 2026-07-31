---
name: rakuten-api
description: 湯船トラベルの楽天トラベルAPI連携と送客導線を触るときの手順。APIキーの意味と保護方式（config.js に一元化）、レート制限（約1リクエスト/秒・429は1.6秒待って1回だけ再試行）、失敗を握りつぶす設計、アフィリエイト計測リンクとPR表記、施設画像のホットリンク、疎通確認の方法を扱う。「楽天APIを直したい」「空室価格が出ない」「アフィリエイトIDを変えたい」「施設画像が表示されない」「予約ボタンの送客先を変えて」「APIキーを更新したい」「レート制限に引っかかる」「独自ドメインに移したい」など、楽天API・送客リンク・アフィリエイト・施設画像の話が出たら必ずこのスキルを使うこと。assets/js/rakuten.js・assets/js/config.js・ui.js の bookingCtas を編集しようとしている時点でも使う。
---

# 楽天トラベルAPI連携と送客導線

## このスキルが必要な理由

この層は**壊れても画面上は何も起きない**。`rakuten.js` は取得に失敗したら静かに諦めて
`null` を返す設計（例外を投げない）なので、キーの設定ミスもレート制限超過も
「価格が表示されないだけ」に見える。原因の切り分けができないと延々ハマる。

さらにアフィリエイトIDは**生成済みのエリアLPに焼き込まれている**（現在50か所）。
`config.js` を書き換えただけでは反映されず、古いIDのまま送客し続ける。
報酬が入らないのに画面上は正常に見えるという、最も気づきにくい壊れ方をする。

## キーは3種類ある（すべて `assets/js/config.js` に集約）

| キー | 形式 | 用途 |
| --- | --- | --- |
| `RAKUTEN_APP_ID` | UUID | 楽天ウェブサービス（2026年新基盤）のアプリID。API呼び出しに必須 |
| `RAKUTEN_ACCESS_KEY` | `pk_` 始まり | 新基盤のアクセスキー。`pk_` は公開可能キーの意味 |
| `RAKUTEN_AFFILIATE_ID` | `.` 区切り4分割 | 送客リンクの計測用。API呼び出しにも `affiliateId` として付く |

**これらは意図的にコミットされている。** 秘密にすることで守っているのではなく、
楽天側の「Allowed websites」（`ttomoi-afk.github.io`）によるリファラ/Origin保護で守っている。
うっかり「漏れている」と判断して隠そうとしないこと。隠すなら `server/` のサーバレス層に移す必要がある。

**ドメインを変えるときは、楽天の管理画面の Allowed websites も必ず更新する。**
これを忘れるとAPIが全滅するが、画面上は「価格が出ないだけ」になる。

## レート制限の作法

新基盤は**約1リクエスト/秒**。`rakuten.js` の `request()` が 429 を検出したら
**1.6秒待って1回だけ**再試行する。それ以上は諦める。

呼び出しを増やすときは**直列にして間隔を空ける**。`detail.js` が実例になっている。

```js
// 画像 → 1.2秒待ち → 価格 の順に直列実行（並列にすると429が出る）
imageStep
  .then(() => new Promise((r) => setTimeout(r, hotel.img ? 0 : 1200)))
  .then(() => rk.minCharge(hotel.rakutenHotelNo));
```

`data.js` に `img` が焼き込み済みなら画像APIを呼ばずに待ち時間も0にしている。
**APIを呼ばずに済ませられるならそれが最善**、という判断がすでに入っている。
一覧ページで全宿分を呼ぶような実装は、この制限のもとでは成立しない。

## 失敗を握りつぶす設計を壊さない

`minCharge()` と `hotelImages()` は、失敗・空室なし・APIエラーのいずれでも
**例外を投げず `null` を返す**。呼び出し側は「取れたときだけ表示する」。

これは意図的な設計。楽天APIが落ちてもサイトは通常どおり見えるべきで、
掲載情報（`data.js`）は静的に持っているので価格が無くても成立する。
エラーを表面化させたくなったら、UIに出すのではなく `api-test.html` で確認する。

`rakuten.js` の公開API:

| 関数 | 返り値 | 用途 |
| --- | --- | --- |
| `minCharge(hotelNo)` | `{ total, checkin }` または `null` | 2週間後・1泊・2名の最低価格（合計） |
| `hotelImages(hotelNo)` | `{ image, room, thumb }` または `null` | 施設画像URL |
| `hotelInfo(hotelNo)` | 生のレスポンス | 疎通テスト用 |
| `isApiError(data)` | boolean | エラー判定 |

通信は **fetch(CORS)優先 → 失敗したらJSONPにフォールバック**する。
どちらで通ったかはレスポンスの `__transport` に入るので、切り分けに使える。

## アフィリエイト送客

リンクの生成は `ui.js` の2関数に集約されている。**手でURLを組み立てないこと。**

- `affiliateUrl(url)` — `hb.afl.rakuten.co.jp/hgc/<ID>/?pc=...&m=...` に包む。IDが未設定なら素のURLを返す
- `bookingCtas(h, small)` — 予約ボタン＋公式サイトリンク＋PR表記をまとめて生成

**外してはいけない要素が2つある。**

1. `rel="noopener noreferrer sponsored"` — `sponsored` は広告リンクの明示
2. PR表記（`cta-note`）— 「PR:楽天トラベルへのリンクはアフィリエイトです」。
   ステマ規制上、広告であることの明示が要る。`small` 表示では省略されるが、
   詳細ページなど主要な導線には必ず出す

### アフィリエイトIDを変更するときは、必ずLPを全部作り直す

`tools/gen-area-lp.js` は生成時にアフィリエイトURLを**HTMLに焼き込む**（同ファイル19行目の `aff()`）。
現在の焼き込み数:

| ファイル | 焼き込まれたリンク数 |
| --- | --- |
| `hokkaido.html` | 12 |
| `kyoto.html` | 11 |
| `okinawa.html` | 10 |
| `tokyo.html` | 9 |
| `osaka.html` | 8 |

`config.js` を書き換えたら、**5エリアすべて**を再生成する。

```bash
for a in tokyo osaka kyoto okinawa hokkaido; do node tools/gen-area-lp.js $a; done
grep -c "hgc/<新しいID>" tokyo.html osaka.html kyoto.html okinawa.html hokkaido.html
```

再生成の手順そのものは area-lp スキルを参照。

## 施設画像のホットリンク

楽天API利用規約の範囲内で、**送客リンクとセットで**施設画像を直リンク表示している。
画像を自前に保存し直すのは規約上の前提が変わるので、勝手に切り替えないこと。

取得の優先順は `ui.js` の `hotelPhoto()` にある。

1. `data.js` の `img`（焼き込み済み。**APIを呼ばない**）
2. `localStorage` のキャッシュ（`yubune_img_<hotelNo>`）
3. どちらも無ければ `sceneURI()` の生成SVG風景にフォールバック

画像が出ないという相談は、たいてい「`rakutenHotelNo` が未設定」か
「Allowed websites の対象外ドメインで開いている」のどちらか。

## 疎通確認

`api-test.html` が疎通テストページ（`noindex`）。

**このページはローカルでは失敗するのが正常。** 楽天側の Allowed websites が
`ttomoi-afk.github.io` に限定されているため、`localhost` や他ドメインからは弾かれる。
ローカルで失敗したことをもってキーが壊れたと判断しないこと。

本番で確認する手順:

1. `main` にマージしてデプロイを待つ
2. `https://ttomoi-afk.github.io/desktop-tutorial/api-test.html` を開く
3. 失敗する場合は、レスポンスの `__transport`（fetch か jsonp か）とエラー内容を見る

ローカルで確かめられるのはリンクの組み立てまで。`affiliateUrl()` の出力が
正しいIDを含んでいるかは `python3 -m http.server 8000` で確認できる。

## サーバレス層への移行（未接続）

`server/api/vacancy.js` は楽天 VacantHotelSearch をキー秘匿つきで中継する
Vercel Functions の**雛形で、まだ繋がっていない**。GitHub Pages は静的配信のみのため。

移行すると得られるもの: キーをクライアントから隠せる、15分キャッシュでレート制限を回避できる。
手順は `server/README.md` にある。移行するまでは `config.js` の公開キー方式が正しい形なので、
中途半端に隠そうとしないこと。

## チェックリスト

- [ ] キーの変更は `config.js` だけで完結させた（他所にハードコードしていない）
- [ ] アフィリエイトIDを変えたなら、5エリアのLPをすべて再生成して焼き込みを確認した
- [ ] ドメインを変えたなら、楽天の Allowed websites も更新した
- [ ] API呼び出しを増やしたなら直列にして1秒以上の間隔を空けた
- [ ] 失敗時に `null` を返す（例外を投げない）設計を壊していない
- [ ] 送客リンクの `rel="... sponsored"` とPR表記を外していない
- [ ] 画像はホットリンクのまま、`data.js` の `img` 優先の順序を変えていない
- [ ] 疎通は本番ドメインの `api-test.html` で確認した（ローカルの失敗は正常）
