# Team Energy コーポレートサイト 編集用一式

## 中身
- `index.html` トップ、`sourcing.html` M&A、`cases/teshikaga.html` 事例、`404.html`
- `assets/` CSS（style.css）・JavaScript（main.js）・画像・動画
- `data/news.json` ニュース、`data/stories.json` ストーリーズ（JSONを書き換えるだけで更新できます）
- `docs/` 会社紹介資料（PowerPoint・PDF）
- `tools/build-dist.sh` 公開用 zip を作るスクリプト、`tools/deck/` 会社紹介資料の生成スクリプト
- `PLAN.md` これまでの変更履歴と、未確認事項のメモ
- `DEPLOY.md` teamenergy.co.jp への公開手順

## 編集のしかた
特別なソフトは不要です。HTML・CSS・JSON をテキストエディタ（VS Code など）で直接編集してください。
表示確認はフォルダ内で `python3 -m http.server 8000` を実行し、ブラウザで http://localhost:8000/ を開きます（JSON の読み込みにサーバーが必要です。ファイルを直接開くとニュース欄が空になります）。

## 公開
`bash tools/build-dist.sh` で `dist/teamenergy-site.zip` ができます。手順は DEPLOY.md。

## 元データ
GitHub: https://github.com/ttomoi-afk/desktop-tutorial の `teamenergy/` フォルダ（ブランチ claude/team-energy-homepage-ceqpym）
