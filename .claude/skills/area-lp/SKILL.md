---
name: area-lp
description: 湯船トラベルのエリアLP（tokyo.html / osaka.html / kyoto.html / okinawa.html / hokkaido.html）と sitemap.xml・OGP画像を生成・更新する手順。これらのHTMLは tools/gen-area-lp.js の生成物なので直接編集してはいけない。「エリアLPを追加したい」「新しいエリアのページを作って」「SEOページの文章を直したい」「LPのFAQを変えて」「sitemapを更新して」「OGP画像を作り直して」など、エリア別ランディングページ・SEO・構造化データ・sitemap・OGPの話が出たら必ずこのスキルを使うこと。tokyo.html などのエリアLPファイルを編集しようとしていることに気づいた時点でも使う。
---

# エリアLP・sitemap・OGPの生成

## 最初に知っておくこと

**`tokyo.html` `osaka.html` `kyoto.html` `okinawa.html` `hokkaido.html` は生成物。直接編集してはいけない。**
`tools/gen-area-lp.js` を再実行した瞬間に上書きされて消える。
内容を変えるときは必ず生成スクリプト側の `AREAS` 定義を直す。

**`sitemap.xml` も生成物。** しかも `gen-area-lp.js` は末尾で `buildSitemap()` を呼ぶため、
1エリア分を実行するだけで sitemap 全体（トップ・検索・全エリアLP・全宿の詳細URL）が書き換わる。
これは意図された挙動なので、sitemap だけ別に更新する必要はない。

LPが存在する理由は SEO で、検索エンジンに読ませるため**本文を静的HTMLに焼き込んでいる**
（通常ページは JS で描画するので検索エンジンに拾われにくい）。
だから宿データが変わったら再生成が必要になる。

## コマンド

```bash
# 1エリア分のLPを生成 + sitemap.xml 全体を更新
node tools/gen-area-lp.js tokyo      # tokyo | osaka | kyoto | okinawa | hokkaido

# OGP画像(1200×630)を全エリア分まとめて生成（引数なし。Playwright を使う）
node tools/gen-ogp.js
```

`gen-area-lp.js` は `config.js` と `data.js` を `eval` で読み込んでから動く。
つまり**LPは常に `data.js` の現在の内容から作られる**。手で書いた古い内容は残らない。

## ケース別の手順

### 既存エリアのLPの文章・FAQ・タイトルを変えたい

1. `tools/gen-area-lp.js` の `AREAS` からエリアを見つける（`tokyo` は23行目付近、以降 `osaka` `kyoto` `okinawa` `hokkaido`）
2. 該当フィールドを編集する（下の「AREAS の中身」参照）
3. `node tools/gen-area-lp.js <slug>` を実行
4. 生成された `<slug>.html` をブラウザで開いて確認

### 宿データを足した／直したので LP を作り直したい

軒数（`{N}`）と最低価格（`{MIN}`）がタイトル・meta descriptionに埋め込まれているので、
**宿を触ったら必ず該当エリアを再生成する。**
複数エリアに宿を足したなら、**エリアごとに1回ずつ**実行する（1回の実行で更新されるLPは1つだけ）。

宿データ側の作業手順は add-hotels スキルを参照。

### 新しいエリアを増やしたい

1. `tools/gen-area-lp.js` の `AREAS` に新しいキーを追加する。既存エントリ（`osaka` など）をコピーして埋めるのが早い
2. `node tools/gen-area-lp.js <新slug>` を実行 → `<新slug>.html` と更新された sitemap ができる
3. `tools/gen-ogp.js` の生成対象リストにも新エリアを追加し、実行して `assets/img/ogp-<slug>.png` を作る
4. `index.html` のエリア導線からリンクする（自動では貼られない）
5. README の「ページ構成」表に追記する

`buildSitemap()` は `AREAS` を走査するので、2の実行で新エリアのURLも sitemap に入る。

### OGP画像を作り直したい

```bash
node tools/gen-ogp.js
```

引数を取らず、全エリア分をまとめて `assets/img/ogp-*.png` に出力する。
Playwright（Chromium）でHTMLをスクリーンショットする方式で、背景にはサイト本体と同じ
`sceneURI()` の生成風景を使っている。軒数を表示するので、宿を足したら作り直す価値がある。

このリポジトリの実行環境では Chromium と Playwright が用意済み。`playwright install` は実行しないこと。
なお `tools/gen-ogp.js` は `ROOT` をリポジトリの絶対パスで持っているため、
別の場所にクローンした環境で動かすときはそこを直す必要がある。

## AREAS の中身

1エリアの定義に入る主なフィールド。`{N}` は該当エリアの掲載軒数、`{MIN}` は最低価格に
置換される**プレースホルダなので、消さないこと**。

| フィールド | 内容 |
| --- | --- |
| `slug` | 出力ファイル名（`<slug>.html`）とURL |
| `pref` | 絞り込みに使う都道府県名。`data.js` の `pref` と一致していないと0軒になる |
| `name` | 表示用のエリア名 |
| `title` | `<title>`。検索結果に出る。`{N}選` の形 |
| `h1` | ページ見出し |
| `metaDesc` | meta description。検索結果のスニペットになる |
| `intro` | 導入文の配列。1要素＝1段落。HTMLタグを含められる |
| `faq` | FAQ の配列。**構造化データ（FAQPage）にもそのまま使われる**ので、質問文は検索されそうな自然な言い方にする |

生成されるHTMLには FAQPage / ItemList / BreadcrumbList の構造化データが入る。
FAQ を編集すると構造化データも一緒に変わるため、`faq` は空にしないこと。

## 確認

```bash
python3 -m http.server 8000
# → http://localhost:8000/tokyo.html
```

- 軒数（タイトル・見出し・本文）が実データと合っているか
- 比較表に宿が並び、詳細ページへのリンクが生きているか
- FAQ が意図した内容になっているか
- `sitemap.xml` のURL件数が増えているか（実行時に `sitemap.xml generated (N urls)` と出る）

## チェックリスト

- [ ] `<slug>.html` を直接編集していない（`AREAS` を直した）
- [ ] 宿データを変えたなら、影響する**すべての**エリアを再生成した
- [ ] `{N}` `{MIN}` のプレースホルダを消していない
- [ ] 新エリアなら OGP・`index.html` の導線・README を更新した
- [ ] ローカルで表示を確認した
