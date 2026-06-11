# TouringHub Data Formats

更新日: 2026-06-11

TouringHub が読み込む設定データ、地図データ、外部データの形式をまとめます。

## 1. 共通ルール

`conf/*.txt` の多くは、`conf/common.js` の `cleanLine(line)` を通して読み込まれます。

共通仕様:

- `//` 以降はコメントとして無視されます。
- URL中の `://` はコメント判定から保護されます。
- 前後空白は除去されます。
- 空行は無視されます。
- `※` で始まる行はカテゴリ/エリア見出しとして扱われます。

## 2. `conf/weather.txt`

全国エリア別天気の地点設定です。

形式:

```text
※エリア名
拠点名, 緯度, 経度, 都道府県名 // 任意コメント
```

例:

```text
※関東・甲
東京,35.68,139.69,東京都
```

使用箇所:

- `conf/weather-engine.js`
- `loadWeatherConfig()`

仕様:

- `※` 行が天気タブ名になります。
- 地点行はカンマ区切りで、地点名、緯度、経度、都道府県名を持ちます。
- 読み込み後、Open-Meteo APIへエリア単位でまとめて問い合わせます。

調査時点:

- 9エリア
- 85地点

## 3. `conf/nearby.txt`

周辺施設検索ボタンの設定です。

形式:

```text
表示名, 検索キーワード, FontAwesomeアイコン名 // 任意コメント
```

例:

```text
ガソスタ,ガソリンスタンド,fa-gas-pump
```

使用箇所:

- `index.html`
- `loadNearbyConfig()`

仕様:

- Google Maps検索URLを生成します。
- アイコンはFont Awesome Free版のクラス名を指定します。
- 表示名はボタン文言になります。

調査時点:

- 6件

## 4. `conf/link.txt`

「旅の計画」リンク集の設定です。

形式:

```text
※カテゴリ名
リンク名,URL
```

例:

```text
※ルート作成・交通情報関連
Google マップ,https://www.google.co.jp/maps/
```

使用箇所:

- `index.html`
- `loadLinks()`

仕様:

- `※` 行がカテゴリ見出しになります。
- 最初のカンマより前がリンク名、後ろがURLです。
- リンク名には `<br>` を含める運用があります。
- URL内のカンマは現状考慮されていません。最初のカンマ以降をURLとして扱います。

調査時点:

- 4カテゴリ
- 19リンク

## 5. `conf/drawer-links.txt`

右側ドロワーメニューのリンク設定です。

形式:

```text
※カテゴリ名
リンク名,URL
```

使用箇所:

- `index.html`
- `loadDrawerLinks()`

仕様:

- `※` 行はドロワー内見出しになります。
- リンク行はドロワー内カードとして生成されます。
- URLが非常に長い場合も1行で保持されています。

調査時点:

- 2カテゴリ
- 5リンク

## 6. `conf/updates.txt`

Update Log表示用データです。

形式:

```text
YYYY.MM.DD | 内容
```

例:

```text
2026.06.09 | ダブルタップでのズームを復活。
```

使用箇所:

- `index.html`
- `loadUpdateLog()`

仕様:

- `|` で日付と内容を分割します。
- 表示時はファイル末尾側が上に来るよう `reverse()` されます。

調査時点:

- 20件

## 7. `umap_backup_map.umap`

uMap由来の地図データです。

主なトップレベルキー:

- `type`
- `geometry`
- `properties`
- `uri`
- `layers`

使用箇所:

- `conf/map-engine.js`
- `loadUmapData()`

主なレイヤー:

- 名道
- グルメ
- 温泉
- 観光
- キャンプ場
- 宿
- 景勝地
- 高速道路IC

Feature geometry:

- `Point`
- `LineString`

主なFeature properties:

- `name`
- `description`
- `_umap_options`
- OSM由来と思われる各種属性

更新・編集方針:

- マスタ更新時にファイル全体が置き換えられる原本データです。
- 機能追加、性能改善、不具合修正のための直接編集は禁止します。
- Feature、座標、プロパティ、レイヤー、並び順、書式をアプリ都合で変更してはいけません。
- アプリ側の対応は `conf/map-engine.js` などの読み込み処理で行います。
- 許可される更新は、正規マスタによるファイル全体の置換のみです。

## 8. `P35-18_Roadside_Station.geojson`

道の駅レイヤー用GeoJSONです。

使用箇所:

- `conf/michi-no-eki.js`
- `loadMichiNoEki()`

仕様:

- `FeatureCollection` 相当のGeoJSONとして読み込まれます。
- geometry は Point です。
- 座標は `[経度, 緯度]` の順です。

使用プロパティ:

- `P35_006`: 道の駅名
- `P35_007`: 公式URL

調査時点:

- 1145件

更新・編集方針:

- マスタ更新時にファイル全体が置き換えられる原本データです。
- 機能追加、性能改善、不具合修正のための直接編集は禁止します。
- Feature、座標、プロパティ、並び順、書式をアプリ都合で変更してはいけません。
- アプリ側の対応は `conf/michi-no-eki.js` などの読み込み処理で行います。
- 許可される更新は、正規マスタによるファイル全体の置換のみです。

## 9. 外部APIデータ

### Open-Meteo

URL:

```text
https://api.open-meteo.com/v1/forecast
```

取得項目:

- `weather_code`
- `temperature_2m_max`
- `temperature_2m_min`
- `precipitation_probability_max`

タイムゾーン:

- `Asia/Tokyo`

## 10. 変更時の注意

- `conf/*.txt` の形式変更は、対応する読み込み関数の変更が必要です。
- レイヤー名変更は `layerGroups`、凡例、ポップアップ、表示制御に影響します。
- `link.txt` と `drawer-links.txt` はリンク名にHTMLを許容しているため、表示上の影響を確認してください。
- `umap_backup_map.umap` と `P35-18_Roadside_Station.geojson` は手作業編集禁止です。正規マスタによるファイル全体の置換後に形式検証を行ってください。
