# 会社紹介資料の生成

`build.js` は pptxgenjs でHPの内容から会社紹介資料（docs/TeamEnergy_会社紹介資料.pptx）を生成する。

- `img/` に次を揃える: te-logo.png / te-logo-white.png（本フォルダ）、assets/img/ceo-nakamura.jpg、coo-hattori.jpg、assets/movie/magma-poster.jpg、assets/img/cases/teshikaga-mashu.jpg、assets/img/logos/te-*.png
- `npm install pptxgenjs@3` 後、`NODE_PATH=./node_modules node build.js`（テーマ色の適用に pptx スキルの apply_theme.js を使用）
- 書体は 游明朝（見出し）／游ゴシック（本文）。Windows・Mac の Office で表示できる
