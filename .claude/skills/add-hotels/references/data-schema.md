# 宿レコードのフィールド定義

`assets/js/data.js` の `HOTELS` 配列に入る1件の構造。既存レコードをコピーして埋めるのが早い。

## 目次

- [基本情報](#基本情報)
- [温泉・お風呂の情報](#温泉お風呂の情報)
- [紹介文・見せ方](#紹介文見せ方)
- [rooms[]（客室）](#rooms客室)
- [kashikiri[]（貸切風呂）](#kashikiri貸切風呂)
- [出典・検証](#出典検証)
- [楽天連携](#楽天連携)
- [派生フラグ（手で書かない）](#派生フラグ手で書かない)
- [enum 一覧](#enum-一覧)

## 基本情報

| フィールド | 型 | 内容 |
| --- | --- | --- |
| `id` | string | URL に出る識別子。半角英小文字とハイフン（例 `gora-hanaougi`）。`detail.html?id=` で使う |
| `name` | string | 施設名 |
| `kana` | string | ひらがな読み（検索用） |
| `area` | string | 地域名。表示用の自由記述（例 `箱根・強羅`、`札幌`） |
| `pref` | string | 都道府県（例 `神奈川県`）。エリアLPの絞り込みキー |
| `region` | enum | `REGIONS` のいずれか。下の enum 一覧を参照 |
| `type` | enum | `onsen`（温泉宿・旅館）または `business`（ビジネス・シティホテル） |
| `access` | string | 最寄駅からの経路、送迎の有無 |
| `official` | string | 公式サイトURL |

## 温泉・お風呂の情報

| フィールド | 型 | 内容 |
| --- | --- | --- |
| `onsen` | string | 温泉地名（例 `箱根強羅温泉`）。温泉が無いホテルは空文字 |
| `spring` | enum | `SPRING_TYPES` のいずれか（検索の絞り込みに使う代表泉質） |
| `springDetail` | string | 正式な泉質名。旧泉質名や液性・浸透圧・温度も括弧で補足する |
| `efficacy` | string[] | 適応症。公式・温泉分析書の記載に沿って列挙 |
| `gensenNote` | string | 給湯方式の説明。かけ流し／循環、加水・加温、どの浴槽にどう給湯しているか。**サウナの有無が確認できない場合もここに書く** |
| `bathLine` | string | 任意。カード表示用の一行要約（主にビジネスホテル）。省略時は `全室 洗い場付き浴室・トイレ別` が使われる |
| `roomBathNote` | string | **掲載基準の根拠になる最重要フィールド。** 客室浴室とトイレがどう分かれているか、洗い場の有無、ユニットバス構造の客室が無いことを具体的に書く |
| `sepScope` | `"partial"` | 一部の客室タイプのみ風呂・トイレ別のときだけ付ける。全室セパレートなら**付けない** |

## 紹介文・見せ方

| フィールド | 型 | 内容 |
| --- | --- | --- |
| `catch` | string | 一覧カードに出る1文のキャッチ |
| `description` | string | 詳細ページの紹介文（数文） |
| `highlights` | string[] | 詳細ページの箇条書き。お風呂の要点を先に置く |
| `tags` | string[] | `TAGS` のキー。下の enum 一覧を参照 |
| `scene` | enum | 風景SVGの構図。`mountain` `sea` `lake` `river` `forest` `city` `town` `snowtown` |
| `pal` | enum | 風景SVGの配色。`dawn` `dusk` `night` `mist` `snow` `forest` `sea` `indigo` |

`scene` / `pal` は宿ごとにシード付き乱数で同じ絵を生成するための指定。写真が無い宿の
プレースホルダとして使われるので、立地の印象に合うものを選ぶ。

## rooms[]（客室）

セパレートを確認できた客室タイプだけを載せる。

```json
{
  "id": "r1",
  "name": "1階 ベッドタイプ(テラス付き)",
  "capacity": "2名(3名まで相談可)",
  "size": "36平米",
  "price": 43000,
  "bath": {
    "type": "客室露天風呂(自家源泉かけ流し)・洗い場付き",
    "wash": true,
    "view": "箱根の山々・強羅の森(テラス約12平米)",
    "onsenBath": true,
    "note": ""
  },
  "features": []
}
```

| フィールド | 内容 |
| --- | --- |
| `price` | `type: "onsen"` は1泊2食・2名1室の1名あたり、`type: "business"` は素泊まり1名の参考料金 |
| `bath.type` | 浴室の形式。**「浴室なし」を含めると `noRoomBath` / `someNoRoomBath` が自動で立つ**（入浴が大浴場・外湯の宿） |
| `bath.wash` | 洗い場があるか。掲載基準の中核 |
| `bath.onsenBath` | 客室浴室に温泉が給湯されているか |
| `bath.note` | 補足（加水・時間帯制限など） |

## kashikiri[]（貸切風呂）

無い場合は空配列。

```json
{
  "name": "貸切内風呂「ひ」「ふ」「み」(3室)",
  "type": "内湯(陶器の浴槽・白旗源泉かけ流し)",
  "capacity": "2〜3名程度(要確認)",
  "fee": "45分 3,300円",
  "how": "宿泊者は24時間利用可。予約方法はフロントにて確認"
}
```

`fee` に「無料」と入れるだけでは検索に反映されない。無料貸切風呂は `tags` に
`free_kashikiri` を付けること（派生フラグ `hasFreeKashikiri` がそれを見ている）。

## 出典・検証

| フィールド | 型 | 内容 |
| --- | --- | --- |
| `sources` | string[] | 確認したURLを**すべて**。公式の該当ページ（客室・風呂）まで含めると後の検証が楽になる |
| `uncertain` | string | 未確認事項・確認方法の限界・料金の前提。**空にしない。**「公式サイトへ直接アクセスできずスニペットで確認した」なども正直に書く |
| `verified` | boolean | 反証チェックまで済んだら `true` |

## 楽天連携

| フィールド | 内容 |
| --- | --- |
| `rakutenUrl` | 楽天トラベルの施設ページURL。`ui.js` の `bookingCtas()` がアフィリエイト計測付きリンクに変換する |
| `rakutenHotelNo` | 楽天の施設番号（数値）。空室・最低価格の取得に使う |
| `img` | 楽天トラベルの施設画像URL（規約準拠のホットリンク）。未設定なら風景SVGにフォールバックする |

## 派生フラグ（手で書かない）

`data.js` 末尾の `forEach` が実行時に計算する。手で書くと二重管理になる。

| フラグ | 計算元 |
| --- | --- |
| `minPrice` | `rooms[].price` の最小値 |
| `hasFreeKashikiri` | `tags` に `free_kashikiri` があるか |
| `noRoomBath` | **全**客室の `bath.type` が「浴室なし」を含むか |
| `someNoRoomBath` | **いずれか**の客室が「浴室なし」か |

`api/hotels.json` にはこれらを含めて書き出す（外部consumerは forEach を実行できないため）。
生成は `scripts/gen-hotels-json.js` が行う。

## enum 一覧

**`region`**（`REGIONS`）
`北海道・東北` / `関東` / `中部・北陸` / `関西` / `中国・四国` / `九州` / `沖縄`

**`spring`**（`SPRING_TYPES`）
`単純温泉` / `塩化物泉` / `炭酸水素塩泉` / `硫酸塩泉` / `硫黄泉` / `酸性泉` / `含鉄泉` / `放射能泉`

**`tags`**（`TAGS`）

| グループ | キー |
| --- | --- |
| お風呂タイプ（`bath`） | `kashikiri_roten` 貸切露天風呂 / `kashikiri_uchi` 貸切内風呂 / `room_roten` 客室露天風呂 / `room_hanroten` 客室半露天 / `daiyokujo` 大浴場 / `roten` 露天風呂 / `sauna` サウナ |
| こだわり（`komori`） | `gensen` 源泉かけ流し / `nigori` にごり湯 / `view_bath` 眺望風呂 / `hinoki` 檜風呂 / `iwaburo` 岩風呂 / `yumeguri` 湯めぐり / `free_kashikiri` 貸切風呂 無料 |

タグは検索の絞り込みに直結する。公式情報で確認できないものは付けない
（`gensenNote` に「サウナの記載は公式情報では確認できない」と書く運用になっている）。
