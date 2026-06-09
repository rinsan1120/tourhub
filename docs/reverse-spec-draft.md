# TouringHub Reverse Spec Draft

作成日: 2026-06-09

この文書は、現在のリポジトリ実体からリバースエンジニアリングした仕様書案です。実装変更のための確定仕様ではなく、今後の安全な改修・ドキュメント整備の土台として扱います。

## 1. 調査対象と前提

### 確定情報

- TouringHub は、ツーリング・ドライブ向けの静的Webサイトです。
- GitHub Pages 上で公開される前提です。
- 主要画面は `index.html` で構成され、地図・天気・リンク集・更新ログ・ドロワーを同一ページに表示します。
- ローカル確認は `fetch()` を使うため、`index.html` を直接開くのではなくHTTPサーバー経由で行う必要があります。
- ドキュメントは UTF-8 として扱うルールがあります。

### 推測情報

- サイトの主目的は、ツーリング計画時に「地図上のスポット/ルート確認」「周辺検索」「天気確認」「関連リンク参照」を1画面で行えるようにすることです。
- `old/` 配下は過去バージョンの退避であり、通常動作には使われていないと考えられます。

## 2. フォルダ階層・主要ファイル一覧

### 確定情報

```text
/
├─ AGENTS.md
├─ README.md
├─ index.html
├─ style.css
├─ favicon.ico
├─ toAI.txt
├─ P35-18_Roadside_Station.geojson
├─ umap_backup_map.umap
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
└─ old/
   ├─ index.html_20260514
   ├─ index_20260515.html
   └─ index_20260515-2.html
```

### 補足

- `docs/` ディレクトリは存在しますが、調査時点では中身はありません。
- `css/`、`js/`、`data/` ディレクトリは存在しません。

## 3. 各ファイル/フォルダの役割

### ルート

- `AGENTS.md`: Codex/エージェント向け作業ルール。UTF-8指定、改修前確認、UI文言保護、GitHub Pages前提などを定義します。
- `README.md`: ローカルプレビュー方法を記載します。`python -m http.server 8000` で起動し、`http://localhost:8000/` を開く案内があります。
- `index.html`: アプリのエントリーポイントです。画面構造、外部ライブラリ読み込み、`conf/*.js` 読み込み、設定txtの描画処理を担当します。
- `style.css`: 全体レイアウト、地図、凡例、天気カード、リンクカード、ドロワー、レスポンシブ表示を担当します。
- `favicon.ico`: ブラウザタブ用アイコンです。
- `toAI.txt`: AIへの引き継ぎ用メモです。データとロジックを分離する方針、主要ファイルの役割、txtファイルのコメント仕様が記載されています。
- `P35-18_Roadside_Station.geojson`: 国土数値情報由来と思われる道の駅データです。Point Feature が 1145 件あります。
- `umap_backup_map.umap`: uMap由来の地図データです。レイヤー、ルート、スポット、高速道路ICを含みます。

### `conf/`

- `common.js`: `cleanLine(line)` を提供します。URL中の `://` を一時退避した上で `//` 以降をコメントとして除去し、前後空白を削ります。
- `map-engine.js`: Leaflet地図の中心的ロジックです。地図初期化、OSMタイル、現在地、仮ピン、ポップアップ、座標移動、uMapデータ読み込み、レイヤー表示、ズーム制限、モバイル操作を担当します。
- `michi-no-eki.js`: `P35-18_Roadside_Station.geojson` を読み込み、道の駅レイヤーをクラスタ付きで表示します。
- `weather-engine.js`: `weather.txt` の読み込み、Open-Meteo API取得、天気タブ/表の描画、天気検索を担当します。
- `weather.txt`: 天気表示対象のエリアと地点定義です。9エリア、85地点があります。
- `nearby.txt`: 周辺施設検索ボタン設定です。6件あります。
- `link.txt`: 「旅の計画」リンク集設定です。4カテゴリ、19リンクがあります。
- `drawer-links.txt`: 右側ドロワーメニューのリンク設定です。2カテゴリ、5リンクがあります。
- `updates.txt`: Update Log 表示用データです。20件あります。

### `images/`

- `logo.jpg`: ヘッダーのロゴ画像です。
- `ic_logo.png`: 高速道路ICレイヤーの地図アイコンとして使われます。

### `old/`

- 過去の `index.html` バックアップとみられるファイル群です。現行 `index.html` からは参照されていません。

## 4. 画面構成

### 確定情報

画面は上から以下の順で構成されます。

1. ヘッダー
   - ロゴ画像
   - タイトル `Rin’s Touring Hub`
   - ハンバーガーアイコン
2. 右側ドロワーメニュー
   - オーバーレイ
   - 閉じるボタン
   - `conf/drawer-links.txt` から生成されるリンク
3. 地図エリア
   - Leaflet地図 `#map`
   - 全画面ボタン
   - 現在地ボタン
   - Zoom表示バッジ
   - 操作ガイド
   - 座標移動パネル
   - レイヤー切り替え凡例
4. Googleフォームへのスポット追加協力リンク
5. 全国エリア別天気カード
   - 折りたたみヘッダー
   - 再取得ボタン
   - エリアタブ
   - 3日分の天気表
6. ツールグリッド
   - 周辺施設検索
   - 地名で天気検索
7. 旅の計画リンク集
8. Update Log
9. フッター
   - 出典表示
   - 作成者表示
   - Xへのリンク
10. Cloudflare Web Analytics

### CSS上の主な表示仕様

- `main` は最大幅 1200px で中央寄せです。
- 地図は高さ `65vh` です。
- PC幅相当では凡例が地図左下に絶対配置されます。
- 現在地ボタンと全画面ボタンは地図右下側に縦並びで配置されます。
- 天気表は `110px 1fr 1fr 1fr` の4列グリッドです。
- ドロワーは右からスライドインします。

## 5. 地図表示まわりの仕様

### 確定情報

- 地図ライブラリは Leaflet 1.9.4 です。
- 地図生成は `L.map('map', { tap: false, doubleClickZoom: true })` です。
- 初期表示は緯度経度 `[35.6895, 139.6917]`、ズーム `8` です。
- タイルは OpenStreetMap の `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` を使用します。
- `initMap()` は二重初期化防止フラグ `mapInitialized` を持ちます。
- `window.load` 時に `initMap()` が呼ばれます。

### 現在地

- `navigator.geolocation.watchPosition()` で現在地を監視します。
- 現在地マーカーは `L.divIcon` と `.my-location-marker` で表示します。
- 現在地ボタン押下時、現在地マーカーがある場合は `map.flyTo(..., 14)` を実行します。

### 仮ピン

- PCでは地図の `contextmenu`、つまり右クリックで仮ピンを設置します。
- モバイルでは `touchstart` 後 800ms の長押しで仮ピンを設置します。
- `touchend`、`dblclick`、`touchmove` で長押しタイマーを解除します。
- 仮ピンは既存の `tempMarker` があれば位置更新し、なければ新規作成します。

### ポップアップ

`createPopupContent()` が共通ポップアップHTMLを生成します。

主な内容:

- スポット名
- カテゴリ表示
- 説明文
- Googleマップで開く
- ルート検索（高速）
- ルート検索（下道）
- 緯度・経度をコピー

ただし、カテゴリが `名道` の場合、既定では座標コピーを表示しません。

### 座標移動

- 右上の操作ガイド内に「座標移動」パネルがあります。
- 入力形式は `緯度,経度` です。
- 緯度は -90 から 90、経度は -180 から 180 の範囲チェックがあります。
- 移動時は `map.setView([lat, lng], 16)` し、その地点に仮ピンを置きます。

### 全画面

- 全画面ボタン押下時、`document.getElementById('map').requestFullscreen()` を実行します。
- 既に全画面の場合は `document.exitFullscreen()` を実行します。

### モバイル操作

- タッチ端末/スマホ幅判定は `isMobileMapView()` で行います。
- 判定条件は `max-width: 767px`、`pointer: coarse`、`ontouchstart`、`navigator.maxTouchPoints > 0` のいずれかです。
- 片指ズーム制御は地図コンテナの `touchstart`、`touchmove`、`touchend`、`touchcancel` に独自ハンドラを登録します。
- ダブルタップ相当の判定は以下です。
  - 前回タップから 350ms 以内
  - 前回タップ位置から 40px 以内
- 2回目タップ後に指を動かさず離した場合、1段階ズームインします。
- 2回目タップ後に指を動かした場合、縦移動量 70px ごとにズーム段階を変えます。
- 現在の実装では、2回目タップ後に指を下へ動かすとズームイン、上へ動かすとズームアウトします。

## 6. レイヤー/スポット表示の仕様

### uMap由来レイヤー

`map-engine.js` の `loadUmapData()` が `umap_backup_map.umap` を読み込みます。

調査時点のレイヤー件数:

| レイヤー | Feature数 | Point | LineString |
| --- | ---: | ---: | ---: |
| 名道 | 213 | 0 | 213 |
| グルメ | 93 | 93 | 0 |
| 温泉 | 28 | 28 | 0 |
| 観光 | 116 | 115 | 1 |
| キャンプ場 | 24 | 24 | 0 |
| 宿 | 8 | 8 | 0 |
| 景勝地 | 120 | 120 | 0 |
| 高速道路IC | 2123 | 2123 | 0 |

### レイヤー設定

`loadUmapData()` 内で以下の表示設定が定義されています。

| レイヤー | 色 | 種別 | 備考 |
| --- | --- | --- | --- |
| 名道 | `#ff0000` | line | 凡例表示あり、線はクリック用透明ラインを別途持つ |
| グルメ | `#ff7f00` | point | クラスタリングあり |
| 温泉 | `#00ffff` | point | クラスタリングあり |
| 観光 | `#ff23ff` | point | クラスタリングあり |
| キャンプ場 | `#00ff00` | point | クラスタリングあり |
| 宿 | `#808080` | point | クラスタリングあり |
| 景勝地 | `#0000ff` | point | クラスタリングあり |
| 道の駅 | `#8c6450` | point | uMap側にも設定はあるが、実際は別JSからも読み込まれる |
| 高速道路IC | `#2f3640` | point | クラスタリングなし、凡例非表示、ズーム制限あり、専用アイコン |

### Point表示

- 通常Pointは `L.circleMarker` で表示します。
- 半径は 9、枠線は白、枠線幅は 2、透明度は 0.9 です。
- Point系レイヤーは原則 `L.markerClusterGroup()` でクラスタリングします。
- クラスタはレイヤー色の丸バッジで件数を表示します。
- クラスタ解除ズームは 10 です。

### LineString表示

- 通常ラインは `L.polyline` で表示します。
- 線幅は 4、透明度は 0.8 です。
- ライン本体は `interactive: false` です。
- タップ/クリック用に、透明で線幅 24 の `touchLine` を重ね、そこへポップアップを紐づけます。

### 高速道路IC

- レイヤー名は `高速道路IC` です。
- アイコンは `images/ic_logo.png` です。
- アイコンサイズは 18x18、アンカーは 9x9 です。
- PCではズーム 11 以上、モバイルではズーム 10 以上で表示されます。
- 凡例には表示されません。
- ポップアップ名は `name + "IC"` の形式です。

### 道の駅

- `conf/michi-no-eki.js` が `P35-18_Roadside_Station.geojson` を読み込みます。
- 1145件の Point Feature を表示します。
- レイヤー名は `道の駅` です。
- 色は `#8c6450` です。
- クラスタリングあり、クラスタ解除ズームは 10 です。
- プロパティ `P35_006` を名称、`P35_007` を公式URLとして使います。

### 注意点

- `loadUmapData()` 内の `layerSettings` にも `道の駅` が存在します。
- 一方で `michi-no-eki.js` も同名 `道の駅` レイヤーを `layerGroups` に登録します。
- 現在のデータでは `umap_backup_map.umap` のレイヤー一覧に `道の駅` は含まれていないため、実害はないように見えます。
- 将来 uMap側に `道の駅` レイヤーが復活/追加された場合、同名 `layerGroups["道の駅"]` の上書きや凡例重複回避の挙動に注意が必要です。

## 7. 外部データ・外部サービス・ライブラリ

### 外部ライブラリ

- Font Awesome 6.6.0
  - CDN: `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.6.0/css/all.min.css`
  - ボタンや天気アイコンに使用します。
- Leaflet 1.9.4
  - CDN: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css`
  - CDN: `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`
  - 地図表示に使用します。
- Leaflet.markercluster 1.5.3
  - CDN: `https://unpkg.com/leaflet.markercluster@1.5.3/...`
  - Pointレイヤーのクラスタリングに使用します。
- Cloudflare Web Analytics
  - `https://static.cloudflareinsights.com/beacon.min.js`
  - アクセス解析に使用します。

### 外部サービス/API

- OpenStreetMap タイル
  - `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- Open-Meteo API
  - `https://api.open-meteo.com/v1/forecast`
  - 3日間の天気コード、最高/最低気温、降水確率を取得します。
- Google Maps
  - スポット検索、座標検索、ルート検索、周辺施設検索リンクに使用します。
- Google検索
  - 地点名の天気検索に使用します。
- Googleフォーム
  - 地図へのスポット追加協力リンクとして使用します。
- 国土交通省 国土数値情報
  - フッターに出典URLが記載されています。
- X
  - 作者アカウントへのリンクがあります。
- その他リンク集
  - NEXCO、旅行予約、駐車場、キャンプ場、買い物、Google系サービス、STARLINK等への外部リンクがあります。

### ローカル/リポジトリ内データ

- `umap_backup_map.umap`: uMap由来の地図レイヤーデータ。
- `P35-18_Roadside_Station.geojson`: 道の駅データ。
- `conf/*.txt`: 天気地点、周辺検索、リンク集、ドロワー、更新ログの設定データ。

## 8. JavaScript/CSS/HTMLの責務分担

### HTML

- 画面の骨格を定義します。
- 外部CSS/JSとローカルJSを読み込みます。
- 一部の設定txt読み込み関数をインラインで持ちます。
- `window.load` で全体初期化を開始します。

HTML内の主な関数:

- `loadNearbyConfig()`
- `loadLinks()`
- `loadUpdateLog()`
- `toggleDrawer()`
- `loadDrawerLinks()`

### JavaScript

- `conf/common.js`: txt設定読み込み時の共通整形。
- `conf/map-engine.js`: 地図機能全般。
- `conf/michi-no-eki.js`: 道の駅専用データ読み込み。
- `conf/weather-engine.js`: 天気機能全般。

### CSS

- サイト全体の見た目とレイアウトを担当します。
- 地図自体のサイズ、地図上ボタン、凡例、天気表、カード、リンクグリッド、ドロワーを定義します。
- 一部スタイルはHTML/JS内のインラインスタイルにも分散しています。

## 9. エントリーポイントからの処理フロー

### 確定情報

1. ブラウザが `index.html` を読み込みます。
2. Font Awesome、Leaflet CSS、`style.css` を読み込みます。
3. HTML本文でヘッダー、地図、天気、リンク、ログ、フッターのDOMを構成します。
4. Leaflet JS、MarkerCluster、`conf/common.js`、`conf/map-engine.js`、`conf/michi-no-eki.js`、`conf/weather-engine.js` を読み込みます。
5. `conf/map-engine.js` 読み込み時点で `map` とOSMタイルが生成されます。
6. `conf/michi-no-eki.js` は DOMContentLoaded または即時に `loadMichiNoEki()` を実行します。
7. `window.load` で以下を順番に実行します。
   - `initMap()`
   - `loadWeatherConfig()`
   - `loadNearbyConfig()`
   - `loadLinks()`
   - `loadUpdateLog()`
   - `loadDrawerLinks()`
8. `initMap()` は以下を実行します。
   - 操作ガイド文言更新
   - Zoomバッジ初期表示
   - `zoomend` イベント登録
   - 片指ズーム制御初期化
   - 座標移動UI初期化
   - 現在地監視開始
   - uMapデータ読み込み開始
9. `loadWeatherConfig()` は `weather.txt` を読み込み、天気UIを構築し、最初のエリアの天気を取得します。

### 注意点

- `michi-no-eki.js` の読み込みタイミングは `initMap()` より前後する可能性がありますが、`map` と `layerGroups` は `map-engine.js` 読み込み時点で既に存在します。
- `loadMichiNoEki()` と `loadUmapData()` は非同期で独立して動くため、凡例表示順は読み込み完了順の影響を受ける可能性があります。

## 10. 主要なユーザー操作と処理フロー

### 地図を見る

1. ページ表示時にLeaflet地図が表示されます。
2. uMapデータ、道の駅データ、高速道路ICなどが読み込まれます。
3. ユーザーは地図のズーム/パンでスポットやルートを確認します。

### レイヤー切り替え

1. 凡例のチェックボックスを操作します。
2. `toggleLayer(layerName, checked)` が呼ばれます。
3. `checked` が真なら `map.addLayer(layerGroups[layerName])`、偽なら `map.removeLayer(...)` を実行します。

### スポット/ルートのポップアップ

1. PointまたはLineStringのクリック/タップ用透明ラインを選択します。
2. `createPopupContent()` で生成されたポップアップを表示します。
3. ユーザーはGoogleマップ表示、ルート検索、座標コピーを実行できます。

### 仮ピン設置

1. PCでは右クリック、モバイルでは長押しします。
2. `placeTempPin()` が呼ばれます。
3. 指定地点のポップアップを開きます。

### 現在地へ移動

1. 現在地ボタンを押します。
2. 現在地マーカーがあれば、ズーム14で `flyTo` します。

### 座標移動

1. 「座標移動」を開きます。
2. `緯度,経度` を入力します。
3. 「移動」またはEnterで `jumpToInputCoordinates()` が実行されます。
4. 入力チェック後、ズーム16で移動し、仮ピンを置きます。

### モバイル片指ズーム/ダブルタップズーム

1. 地図をタップします。
2. 350ms以内、40px以内でもう一度タップすると片指ズーム候補になります。
3. 動かさず離すと1段階ズームインします。
4. 指を上下に動かすと、70pxごとにズームが変わります。
5. 下方向でズームイン、上方向でズームアウトします。

### 天気を見る

1. 天気カードヘッダーを押して展開します。
2. エリアタブを選びます。
3. 未取得エリアの場合、Open-Meteo APIから天気を取得します。
4. 3日分の天気アイコン、降水確率、最低/最高気温を表示します。

### 天気再取得

1. 「再取得」ボタンを押します。
2. 現在アクティブなエリアを `loadedRegions` から削除します。
3. 再度 Open-Meteo API から取得します。

### 地名で天気検索

1. テキストボックスに地点名を入力します。
2. 「天気を検索」を押します。
3. Google検索で `地点名 + 天気` を新規タブで開きます。

### 周辺施設検索

1. `nearby.txt` 由来のボタンを押します。
2. Google Maps の検索URLを新規タブで開きます。

### 旅の計画リンク

1. `link.txt` 由来のリンクカードを押します。
2. 登録URLを新規タブで開きます。

### ドロワー

1. ハンバーガーを押します。
2. 右側ドロワーとオーバーレイが開きます。
3. オーバーレイ、閉じるボタン、ハンバーガー再押下で閉じます。

## 11. 現在実装済みの機能一覧

### 地図

- Leaflet + OpenStreetMap による地図表示
- uMapデータ読み込み
- 名道ルート表示
- グルメ/温泉/観光/キャンプ場/宿/景勝地/高速道路IC表示
- 道の駅GeoJSON表示
- Pointレイヤーのクラスタリング
- レイヤー凡例と表示/非表示切り替え
- 高速道路ICのズーム制限表示
- 現在地表示
- 現在地へ移動
- 仮ピン設置
- ポップアップからGoogle Mapsを開く
- ポップアップから高速/下道ルート検索
- 座標コピー
- 座標移動
- 全画面表示
- Zoomバッジ表示
- モバイル向け長押しピン
- モバイル向けダブルタップズーム
- モバイル向け2回目タップ保持からの片指ズーム

### 天気

- エリア別天気設定読み込み
- エリアタブ表示
- 3日分の天気表示
- Open-Meteo API連携
- 降水確率表示
- 最高/最低気温表示
- 天気再取得
- 地点名のGoogle天気検索
- 精度注意メッセージ表示

### リンク/補助UI

- 周辺施設検索ボタン
- 旅の計画リンク集
- 右側ドロワーリンク
- Update Log表示
- Googleフォームへのスポット追加協力リンク
- フッター出典/作者リンク

## 12. 未実装・途中実装・不明瞭な箇所

### 確定情報

- `docs/` は存在しますが、調査時点で仕様書や設計書はありません。
- `AGENTS.md` の `Source of Truth` に列挙されている `docs/current-status.md`、`docs/handoff.md`、`docs/project-memory.md`、`docs/decisions.md`、`docs/architecture.md`、`docs/roadmap.md`、`docs/requirements.md` は存在しません。
- `michi-no-eki.js` は `loadMichiNoEki()` を自動実行しますが、`index.html` の `window.load` では明示的に呼ばれていません。
- `style.css` にはインラインコメントや一部整形崩れが残っています。例: `.update-list` の閉じ波括弧と `.update-list li` が同一行に続いています。ただしCSSとしては読み取れる可能性があります。
- `map-engine.js` 冒頭に「聖域：ロジック改変厳禁」というコメントがあります。

### 推測情報

- `old/` は参照されていないため、リリース運用上のバックアップと推測されます。
- `toAI.txt` は過去のAI作業用メモであり、現行仕様の完全な正ではない可能性があります。
- `umap_backup_map.umap` はuMapエクスポートをリポジトリ内に固定化したデータと推測されます。

### 要確認

- `docs/` 配下に今後どのドキュメントを正式配置するか。
- `AGENTS.md` がGit上で未追跡に見える状態をどう扱うか。
- `michi-no-eki.js` による道の駅読み込みと `map-engine.js` 内の `layerSettings["道の駅"]` の関係を今後どう整理するか。
- `index.html` 内に残るインラインJSを将来的に `conf/*.js` へ分離する方針があるか。
- `style.css` とHTML/JS内インラインスタイルの責務分担を整理する予定があるか。
- 天気APIの精度注意はUIに表示されているが、仕様としてどの程度信頼する前提か。
- OpenStreetMapタイルの利用ポリシー/負荷対策を正式に確認する必要があるか。
- Cloudflare Web Analytics のトークン管理方針。
- 高速道路ICデータの由来と更新方法。
- `umap_backup_map.umap` の更新手順、uMap側との同期ルール。

## 13. 今後Codexが安全に改修するための注意点

### 全体方針

- ドキュメントは必ずUTF-8指定で読むこと。
- GitHub Pagesで動作する静的構成を維持すること。
- 実装前に対象ファイル、方針、影響範囲、確認方法を提示すること。
- ユーザーに見える文言は明示依頼なしに変更しないこと。
- UIレイアウトを広範囲に変更しないこと。
- 外部API/外部ライブラリを追加する場合は事前説明と承認を得ること。

### 地図改修

- `conf/map-engine.js` は地図ロジックの中心であり、影響範囲が広いです。
- 初期中心座標、初期ズーム、既存レイヤー名、色、表示条件は不用意に変更しないこと。
- `layerGroups` は複数ファイルから共有されます。
- 凡例IDは `legend-item-レイヤー名` 形式で重複回避されます。レイヤー名変更はUIと挙動の両方に影響します。
- モバイル操作は長押しピン、Leaflet標準操作、独自片指ズームが絡むため、変更時は実機またはタッチ相当環境で確認すること。
- `tap: false` と `doubleClickZoom: true` の組み合わせ、および独自 `touch*` ハンドラの干渉に注意すること。

### データ改修

- `conf/*.txt` は `//` コメントを許容しますが、URL内の `://` は `cleanLine()` で保護されています。
- `※` でカテゴリ/エリア見出しを表す設定ファイルがあります。
- `link.txt` と `drawer-links.txt` はリンク名に `<br>` を含める運用があります。
- `weather.txt` は `拠点名, 緯度, 経度, 都道府県名` 形式です。
- `nearby.txt` は `表示名, 検索キーワード, FontAwesomeアイコン名` 形式です。
- `updates.txt` は `日付 | 内容` 形式です。

### 確認方法

- ローカルでは `python -m http.server 8000` を使い、`http://localhost:8000/` で確認すること。
- `fetch()` を使うため、ファイル直開きでは正しく確認できません。
- JavaScript変更時は可能なら `node --check` で構文確認すること。
- 地図変更時は最低限、地図表示、レイヤー表示、凡例切替、ポップアップ、スマホ幅表示を確認すること。
- 天気変更時は初期エリア取得、タブ切替、再取得、地名検索を確認すること。

## 14. 確定情報と推測情報の整理

### 確定情報

- エントリーポイントは `index.html` です。
- 地図は Leaflet + OpenStreetMap タイルです。
- Pointクラスタリングは Leaflet.markercluster です。
- 天気は Open-Meteo API から取得します。
- 設定データは主に `conf/*.txt` として分離されています。
- 地図データは `umap_backup_map.umap` と `P35-18_Roadside_Station.geojson` から読み込まれます。
- ローカル確認はHTTPサーバー経由が必要です。

### 推測情報

- `umap_backup_map.umap` はuMapからエクスポートされたバックアップを、GitHub Pagesで直接読ませるために置いていると考えられます。
- `old/` は実運用参照ではなく、過去版退避用です。
- `toAI.txt` は現在の仕様書ではなく、AI改修時の簡易引き継ぎメモです。

## 15. 次に作るべきドキュメント案

1. `docs/architecture.md`
   - 画面、JS責務、データ読み込み、地図初期化、イベントフローを整理する設計書。
2. `docs/current-status.md`
   - 現在の実装済み機能、既知の課題、確認済み動作を短くまとめる現況メモ。
3. `docs/data-formats.md`
   - `weather.txt`、`nearby.txt`、`link.txt`、`drawer-links.txt`、`updates.txt`、`umap_backup_map.umap`、GeoJSONの形式仕様。
4. `docs/map-behavior.md`
   - 地図操作、モバイルジェスチャ、レイヤー表示条件、ポップアップ仕様に特化した仕様書。
5. `docs/verification.md`
   - 変更種別ごとの確認手順。PC/スマホ幅、地図、天気、設定txt、GitHub Pages確認を含める。
6. `docs/decisions.md`
   - Leaflet採用、Open-Meteo利用、Google Mapsリンク利用、uMapデータ固定化などの設計判断記録。
7. `docs/handoff.md`
   - 次回Codexや別担当者が作業を始めるための短い引き継ぎ。

