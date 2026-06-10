# TouringHub Architecture

更新日: 2026-06-11

TouringHub の画面構成、JavaScript責務、データ読み込み、地図初期化、主要イベントフローをまとめる設計メモです。

## 1. システム概要

TouringHub は、ツーリング・ドライブ向けの静的Webサイトです。GitHub Pages 上で公開される前提で、サーバーサイド処理を持ちません。

主な機能は以下です。

- Leaflet + OpenStreetMap による地図表示
- uMap由来のルート/スポット表示
- 道の駅GeoJSON表示
- 高速道路IC表示
- レイヤー切り替え
- 現在地表示
- 仮ピン設置
- Google Maps連携
- Open-Meteo による天気表示
- 周辺検索、リンク集、ドロワー、更新ログ表示

## 2. フォルダ構成

```text
/
├─ index.html
├─ style.css
├─ conf/
│  ├─ common.js
│  ├─ map-engine.js
│  ├─ michi-no-eki.js
│  ├─ weather-engine.js
│  ├─ weather.txt
│  ├─ nearby.txt
│  ├─ link.txt
│  ├─ drawer-links.txt
│  └─ updates.txt
├─ docs/
├─ images/
│  ├─ logo.jpg
│  └─ ic_logo.png
├─ old/
├─ P35-18_Roadside_Station.geojson
└─ umap_backup_map.umap
```

## 3. エントリーポイント

エントリーポイントは `index.html` です。

読み込み順の概要:

1. Font Awesome CSS
2. Leaflet CSS
3. `style.css`
4. Leaflet JS
5. Leaflet.markercluster
6. `conf/common.js`
7. `conf/map-engine.js`
8. `conf/michi-no-eki.js`
9. `conf/weather-engine.js`
10. `index.html` 内インラインJS

`window.load` 時に以下が実行されます。

```text
initMap()
loadWeatherConfig()
loadNearbyConfig()
loadLinks()
loadUpdateLog()
loadDrawerLinks()
```

## 4. HTMLの責務

`index.html` は画面の骨格と一部の設定データ描画を担当します。

主なDOM:

- ヘッダー
- ドロワー
- 地図エリア
- レイヤー凡例
- スポット追加協力リンク
- 天気カード
- 周辺施設検索
- 地名で天気検索
- 旅の計画リンク集
- Update Log
- フッター

HTML内インラインJSの主な責務:

- `conf/nearby.txt` の読み込みと周辺検索ボタン生成
- `conf/link.txt` の読み込みとリンク集生成
- `conf/updates.txt` の読み込みと更新ログ生成
- `conf/drawer-links.txt` の読み込みとドロワーリンク生成
- ドロワー開閉
- 全体初期化の起点

## 5. JavaScriptの責務

### `conf/common.js`

設定txtの共通整形関数 `cleanLine(line)` を提供します。URL中の `://` を保護しつつ、`//` 以降をコメントとして除去します。

### `conf/map-engine.js`

地図機能全般を担当します。

- Leaflet地図生成
- OSMタイル設定
- 現在地監視
- 現在地マーカー表示
- 仮ピン設置
- ポップアップ生成
- 座標コピー
- 座標移動
- 全画面表示
- 長押しピン
- モバイル向けダブルタップ/片指ズーム
- uMapデータ読み込み
- レイヤー生成
- レイヤー表示/非表示
- 高速道路ICのズーム制限
- Zoomバッジ更新
- 表示範囲に応じたFeature生成
- Featureの優先度付き段階生成
- 地図データ読み込み状態の集約

### `conf/michi-no-eki.js`

`P35-18_Roadside_Station.geojson` を読み込み、道の駅レイヤーをクラスタ付きで生成します。

### `conf/weather-engine.js`

天気機能を担当します。

- `conf/weather.txt` 読み込み
- エリア/地点データ生成
- 天気タブ生成
- Open-Meteo API取得
- 3日分の予報表示
- 再取得
- Google天気検索

## 6. CSSの責務

`style.css` は全体の見た目とレイアウトを担当します。

主な対象:

- ページ全体
- ヘッダー
- 地図コンテナ
- 現在地/全画面ボタン
- Zoomバッジ
- 操作ガイド/座標移動
- レイヤー凡例
- 天気カード/天気表
- 周辺検索ボタン
- リンクカード
- 更新ログ
- ドロワー

一部スタイルは `index.html` やJS生成HTML内のインラインスタイルにも分散しています。

## 7. データ読み込みフロー

```text
index.html
├─ conf/nearby.txt        -> 周辺施設検索
├─ conf/link.txt          -> 旅の計画リンク
├─ conf/updates.txt       -> Update Log
└─ conf/drawer-links.txt  -> ドロワーリンク

conf/map-engine.js
└─ umap_backup_map.umap   -> 名道/スポット/高速道路IC

conf/michi-no-eki.js
└─ P35-18_Roadside_Station.geojson -> 道の駅

conf/weather-engine.js
└─ conf/weather.txt       -> 天気地点
   └─ Open-Meteo API      -> 予報データ
```

## 8. 地図初期化フロー

1. `conf/map-engine.js` 読み込み時点で `map` が作成されます。
2. `L.tileLayer()` でOSMタイルを追加します。
3. `window.load` から `initMap()` が呼ばれます。
4. `initMap()` は二重初期化を防ぎます。
5. 操作ガイド、Zoomバッジ、タッチ操作、座標移動、現在地監視、uMap読み込みを初期化します。
6. `conf/michi-no-eki.js` は `DOMContentLoaded` または即時で道の駅読み込みを開始します。
7. uMapと道の駅のFeatureを生成元として登録し、初期表示範囲を即時生成します。
8. 地図移動後は1.5秒停止した時点の表示範囲を1.4倍した先読み範囲だけを生成対象にします。
9. 対象Featureは40件単位で生成し、チャンク間でブラウザへ制御を返します。
10. レイヤーは優先度ごとに処理し、同一優先度内ではチャンクを交互に生成します。
11. 移動再開時は待機タイマーと実行中の世代を無効化し、生成済みFeatureは削除しません。

### Feature生成優先度

1. 名道、景勝地、グルメ
2. その他のuMapレイヤー
3. 高速道路IC

道の駅も同じ表示範囲判定、優先度2、40件単位のチャンク生成を利用します。

### 読み込み状態

- uMap、道の駅、表示範囲内Featureの処理状況をタスクとして集約します。
- 現在の生成対象Feature数に対する完了件数を地図上へ表示します。
- 対象範囲の生成完了後に完了表示を出し、自動的に非表示にします。
- いずれかの読み込みに失敗した場合はエラー表示を維持します。

## 9. 主要イベントフロー

### 地図ズーム

- `zoomend` でZoomバッジを更新します。
- 高速道路ICは `zoomend` と `resize` で表示条件を再評価します。
- `movestart` で待機中または実行中のFeature生成を中断します。
- `moveend` から1.5秒後に、その時点の先読み範囲を生成します。

### レイヤー切り替え

凡例チェックボックスから `toggleLayer(name, checked)` を呼び、`layerGroups[name]` を `map` に追加/削除します。

### ポップアップ

`popupopen` で座標コピー用ボタンにクリックハンドラを付与します。

### モバイル操作

地図コンテナに `touchstart`、`touchmove`、`touchend`、`touchcancel` を登録し、独自のダブルタップ/片指ズームを処理します。

## 10. 注意点

- `map` と `layerGroups` はグローバル共有され、複数ファイルから参照されます。
- `michi-no-eki.js` と `map-engine.js` は同じ `layerGroups` にレイヤーを登録します。
- `道の駅` は `map-engine.js` の設定にも存在するため、将来uMap側に同名レイヤーが追加される場合は重複に注意が必要です。
- `index.html` 内インラインJSは設定txtの描画を持っており、責務が完全には分離されていません。
- ローカル確認はHTTPサーバー経由で行う必要があります。
