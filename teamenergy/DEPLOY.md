# teamenergy.co.jp への公開手順

作成したサイトを teamenergy.co.jp で公開するための手順です。
サーバーや DNS を管理している方（社内の担当者または制作会社）にそのまま渡せるように書いています。

## 1. 公開するファイル

`teamenergy-site.zip` の中身が、ドメイン直下（https://teamenergy.co.jp/ ）に置くファイル一式です。

```
index.html            トップページ
sourcing.html         M&A ページ
cases/teshikaga.html  事例ページ
404.html              ページが見つからないときの表示
robots.txt / sitemap.xml
assets/  data/        画像・動画・CSS・JavaScript・ニュースの中身
```

- 作り直すときは `teamenergy/` で `bash tools/build-dist.sh` を実行すると、`dist/teamenergy-site.zip` ができます（リンク切れの確認も自動で行います）。
- PLAN.md、会社紹介資料（docs/）、生成スクリプト（tools/）は含めていません。
- 特別なサーバー機能は不要です。HTML・画像・動画を置けるサーバーならどこでも動きます。

## 2. 先に決めること

1. **今の teamenergy.co.jp をどこで管理しているか。** サーバー（レンタルサーバーや WordPress など）と DNS の管理者を確認します。
2. **現行サイトのページを残すか。** 現行サイトには `/magazine/` のインタビュー記事などがあります。新サイトのトップの「Stories」も `https://teamenergy.co.jp/magazine/interview/298/` にリンクしています。全部置き換える場合はこのリンクが切れるので、Stories から外すか記事を移します。
3. **メールを止めないこと。** `@teamenergy.co.jp` のメールは DNS の MX レコードで動いています。DNS を変更する場合も、MX と TXT（SPF・DKIM・DMARC）は消さずに残します。

## 3. 方法A：今のサーバーにアップロードする（DNS の変更なし・おすすめ）

1. 今のサーバーのファイルを丸ごとバックアップします。
2. zip を展開し、中身をドキュメントルート（`public_html` など、今のトップページがある場所）にアップロードします（FTP・SFTP・サーバーの管理画面など）。
3. 今のサイトが **WordPress** の場合は、WordPress のファイルを消さないでください。多くのサーバーでは `index.html` が `index.php` より優先されるため、トップは新サイトになり、`/magazine/` などの既存ページは WordPress のまま残ります。優先順位はサーバー設定によるので、アップロード後に必ず表示を確認します。
4. WordPress を使わない場合は、404.html をエラーページに設定します（Apache なら `.htaccess` に `ErrorDocument 404 /404.html`）。
5. https://teamenergy.co.jp/ とスマホ表示、M&A・事例ページ、動画の再生を確認します。

## 4. 方法B：GitHub Pages で公開する（DNS の変更が必要）

このリポジトリ（desktop-tutorial）は旅行サイトのデモやタスク管理アプリも GitHub Pages で公開しているため、ここに独自ドメインを設定すると別のページが teamenergy.co.jp に出てしまいます。**サイト専用の新しいリポジトリ**を使います。

1. 会社の GitHub Organization に、サイト専用のリポジトリを作ります（無料プランでは Public が必要）。
2. zip の中身をリポジトリ直下に置き、`CNAME` というファイルに `teamenergy.co.jp` と1行書いて追加します。
3. Settings → Pages で公開元を main ブランチに設定し、Custom domain に `teamenergy.co.jp` を入力します。
4. DNS に次のレコードを設定します（MX・TXT はそのまま）。

| 名前 | 種類 | 値 |
| --- | --- | --- |
| teamenergy.co.jp | A | 185.199.108.153 / 185.199.109.153 / 185.199.110.153 / 185.199.111.153 |
| teamenergy.co.jp | AAAA | 2606:50c0:8000::153 / 2606:50c0:8001::153 / 2606:50c0:8002::153 / 2606:50c0:8003::153 |
| www | CNAME | （Organization 名）.github.io |

5. 反映後（数分〜最大48時間）、Pages 設定で「Enforce HTTPS」をオンにします。
6. Organization の設定でドメインを verify します（第三者による乗っ取り防止）。

この方法では現行サイトのページ（`/magazine/` を含む）はすべて表示されなくなります。

## 5. 公開前に確認したいこと

- [ ] 杉野さんの写真（現在「写真準備中」の表示）
- [ ] 本社・東京オフィスの住所（Web 検索で調べたもの）
- [ ] 事業領域ロゴの高解像度版（今は小さい画像のため、高精細画面で少しぼやける）
- [ ] ヘッダーのロゴマーク（PowerPoint 内の画像から作った近似の SVG。正式データがあれば差し替え）
- [ ] News の1件目の日付（PR TIMES の掲載日と照合）
- [ ] Team Glocal・ANY の公式サイト URL（今はリンクなし）
- [ ] 現行サイトの主な URL から新サイトへの転送（検索結果に旧ページが残るため）
- [ ] 公開後、Google Search Console に `https://teamenergy.co.jp/sitemap.xml` を登録

## 6. 公開後の更新

文章や画像を直したら `bash tools/build-dist.sh` で zip を作り直し、変わったファイルを同じ場所に上書きします。
