# TouringHub Architecture

更新日: 2026-10-15

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
│  ├─ poi-search.js
│  ├─ rain-engine.js
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
8. `conf/poi-search.js`
9. `conf/rain-engine.js`
10. `conf/michi-no-eki.js`
11. `conf/weather-engine.js`
12. `index.html` 内インラインJS

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

### `conf/poi-search.js`（2026-10-03追加）

`map-engine.js` の直後に読み込み、「場所を検索」内のOpenPOI通信、300ms debounce、日本語変換、候補描画・選択を担当します。共有 `map`、`COORD_JUMP_ZOOM`、`placeTempPin()`、`toggleCoordJumpPanel()` を再利用します。全画面UIの表示判定はmap-engine.jsの共通関数を参照します。

入力中は全国対象の `/v1/suggest`、検索ボタン・入力欄のEnterは `/v1/search` へ分けます。通信のmodeと応答配列（suggestions / results）、検索結果見出し・0件文言を分離し、中断・世代番号・候補描画・選択処理は共有します。地図範囲や中心は検索条件へ取得・送信しません。suggestは最大5件、本検索は15件取得して有効な座標を持つ施設を最大15件表示します。本検索一覧は最大320px・画面高さ40%に制限し、通常の高さの画面では一覧を主なスクロール領域にします。小さい画面では既存パネルの高さ制限も維持します。

入力変更・パネルを閉じる操作でAbortControllerと世代番号により古い通信を無効化します。10秒でタイムアウトし、検索だけにエラーを表示します。APIの文字列はtextContentで描画し、結果はメモリだけで使用します。全画面中だけ同じ操作ガイドを `map-wrapper` 内へ移し、解除時に元の位置へ戻します。VisualViewportに応じてパネルのスクロール高さを調整します。

### `conf/rain-engine.js`（2026-10-01追加）

`map-engine.js` の直後に読み込み、既存の共有 `map` へ独立した雨雲タイルレイヤーを追加します。雨雲の時刻取得、5分キャッシュ、画面ON＋雨雲ON時の10分更新、時間選択、最終成功取得時刻、エラー表示を担当します。画面ONボタンの `aria-pressed` をMutationObserverで監視し、既存の追従・全画面・Wake Lock処理は変更しません。

自動更新時は旧雨雲を残し、新レイヤーを不透明度0で読み込んで成功時のみ置き換えます。失敗・中断時は新レイヤーだけを破棄します。JSON取得の成功時刻で鮮度を判定し、更新表示は選択中のデータの反映成功時に進めます。

スマホ通常表示では雨雲パネルを地図直下の `rain-compact-host` へ移し、左右切替と中央タップの小型時刻一覧を表示します。PC/スマホ全画面では元の `map-wrapper` へ戻します。選択状態と既存の時刻ボタンを共有し、実際の時刻描画を監視して中央表示を同期します。地図上の既存ボタン配置・データ取得・自動更新処理は変更しません。

専用 `rainPane` はz-index 350で、背景タイル(200)とルート(400)の間に配置し、ポインターイベントを透過します。気象庁公式設定の偶数ズーム配信に合わせ、Leaflet 1.9.4の `_clampZoom` を小さなサブクラスで拡張しています。Leaflet更新時はこの部分とON/OFF後のズーム操作を再確認してください。

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

### 名道の連携座標（2026-10-15、Issue #4）

`map-engine.js` のisValidScenicRouteCoordinate()で名道の数値・座標範囲を検証し、getNearestScenicRouteLatLng()が現在のLeaflet投影上でクリック地点から対象座標列への最近接点を返します。欠損頂点では隣接関係を切り、線分がない場合だけ有効頂点へフォールバックします。原本を変更せず、描画用の名道座標からは不正頂点を除外します。前段のgetFeatureExtent()でもLineStringの無効頂点を読み飛ばし、混在時の例外やNaNによる範囲判定失敗を防ぎます。範囲の最小/最大計算とFeature生成の制御は維持します。

名道の透明ポリラインへ一度だけclickリスナーを登録し、計算結果で既存createPopupContent()のHTMLを用意します。その後に登録するbindPopup()の内容関数は最新HTMLを返すだけです。計算はクリック時に限定し、Leaflet標準の位置更新・開閉・レイヤー削除時の閉鎖を維持します。クリックごとのPopup生成・ハンドラ追加・独自openPopup呼び出しはありません。名道以外の線・点の登録処理は従来どおりです。

標準処理の順序は [Leaflet 1.9.4 Popup](https://github.com/Leaflet/Leaflet/blob/v1.9.4/src/layer/Popup.js) と [DivOverlay](https://github.com/Leaflet/Leaflet/blob/v1.9.4/src/layer/DivOverlay.js) を確認しています。

### モバイル操作

地図コンテナに `touchstart`、`touchmove`、`touchend`、`touchcancel` を登録し、独自のダブルタップ/片指ズームを処理します。

## 10. 注意点

- `map` と `layerGroups` はグローバル共有され、複数ファイルから参照されます。
- `michi-no-eki.js` と `map-engine.js` は同じ `layerGroups` にレイヤーを登録します。
- `道の駅` は `map-engine.js` の設定にも存在するため、将来uMap側に同名レイヤーが追加される場合は重複に注意が必要です。
- `index.html` 内インラインJSは設定txtの描画を持っており、責務が完全には分離されていません。
- ローカル確認はHTTPサーバー経由で行う必要があります。

## 全画面状態の共通参照（2026-10-15）

`conf/map-engine.js` の `getMapFullscreenMode()` は `native` / `pseudo` / `none`、`isMapFullscreen()` は全画面相当かを返します。標準 `fullscreenchange` を起点とする従来のネイティブ全画面経路は維持し、両方式の同期後に `mapfullscreenchange`（detail.mode）を通知します。画面ON、雨雲配置、検索ガイドがこの共通イベントを受けます。

`resizeFullscreenMap()` はrequestAnimationFrameで集約し、疑似全画面のVisualViewport寸法をCSS変数へ反映してからLeafletをinvalidateSizeします。非アニメーションpanで中心を維持し、`mapfullscreenresize` で検索パネルの高さを再計算します。resize・orientationchange・pageshow・visible復帰を処理し、疑似全画面ではVisualViewportのresize/scrollも監視します。

疑似全画面は既存 `map-wrapper` と地図インスタンスを再利用します。bodyのインラインスタイル、ルートのoverflow、スクロール座標、凡例のDOM位置を保存・復元します。レイヤー凡例だけを既存文言のdetailsへ一時移動し、解除で元の位置へ戻します。雨雲通信・キャッシュ・自動更新、検索通信、現在地追従、ジェスチャ、レイヤー生成は変更していません。

## スマホ全画面の表示調整（2026-10-15、Issue #1）

全画面の状態管理は既存実装を維持し、map-engine.jsの `isMobileFullscreenMapUI()` を検索と操作列が共有します。Issue #6で表示条件を `isMobileMapUI()` に共通化し、通常スマホの操作列にも適用しました。`map-action-buttons` は雨雲・画面ON・追従・全画面の4ボタンの親で、スマホ通常/全画面は縦flex、PCはdisplay:contentsです。現在地は同じDOMを列の外のmap-wrapper直下へ移し、スマホでは右下に絶対配置します。ボタンの複製・イベント再登録はありません。

map-engine.jsの表示用IIFEはmapfullscreenchange/mapfullscreenresize、resize/orientationchange、VisualViewport、既存の幅query・coarse/hover query、hidden/aria-pressed/open属性の変化を監視します。requestAnimationFrameで集約して可用高さ・列内の実表示数と独立現在地の予約領域から段階を選び、`--map-ui-*` CSS変数へボタン寸法・間隔・列の高さ・現在地の位置・パネル制限を反映します。通常表示は地図全体、全画面はVisualViewportとの交差範囲を使います。新しい全画面状態遷移は追加せず、既存のLeaflet invalidateSizeやWake Lock取得/解除も変更しません。

poi-search.jsは同じ表示判定で検索終了・非表示を同期し、既存closePanel/cancelSearchのAbortController・世代番号・debounceを再利用します。全画面解除後は検索だけを閉じた状態で復元します。OpenPOIの通信仕様に変更はありません。rain-engine.js、地図データ、レイヤー生成、GPS・ジェスチャの処理は変更していません。
