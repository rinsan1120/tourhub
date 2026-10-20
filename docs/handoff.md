# TouringHub Handoff

更新日: 2026-10-15

次回作業者/Codex向けの短い引き継ぎです。

## 1. 最初に読むもの

1. `AGENTS.md`
2. `docs/current-status.md`
3. `docs/handoff.md`
4. `docs/architecture.md`
5. `docs/map-behavior.md`
6. `docs/data-formats.md`
7. `docs/verification.md`
8. `docs/decisions.md`

また、機能・UI/UX・操作フロー・文言の設計や優先順位の判断では、承認済みの `docs/Owner_Intent.md` を参照してください。これはオーナーの目的・価値判断をまとめた正本であり、個別仕様や実装ルールを上書きするものではありません。

ドキュメントは必ずUTF-8指定で読んでください。

```powershell
Get-Content -Raw -Encoding UTF8 docs\<file>.md
```

## 2. プロジェクト概要

TouringHub は、ツーリング・ドライブ向けの静的Web地図サイトです。GitHub Pages公開前提で、サーバーサイド処理はありません。

主な機能:

- Leaflet地図
- uMap由来レイヤー
- 道の駅GeoJSON
- 高速道路IC
- 現在地/仮ピン/座標移動
- Google Maps連携
- Open-Meteo天気
- 周辺検索/リンク集/ドロワー/更新ログ

## 3. 重要ファイル

- `index.html`: エントリーポイント、画面構造、設定txt描画の一部
- `style.css`: UI全体のスタイル
- `conf/map-engine.js`: 地図ロジック
- `conf/michi-no-eki.js`: 道の駅読み込み
- `conf/weather-engine.js`: 天気ロジック
- `conf/*.txt`: 表示設定データ
- `umap_backup_map.umap`: uMap由来地図データ
- `P35-18_Roadside_Station.geojson`: 道の駅データ

## 4. ローカル確認

`fetch()` を使うため、HTTPサーバー経由で確認します。

```powershell
python -m http.server 8000
```

```text
http://localhost:8000/
```

## 5. 作業時の注意

- 明示依頼なしにUI文言を変更しない。
- 明示依頼なしにUIレイアウトを大きく変更しない。
- 地図の初期位置/初期ズームを不用意に変更しない。
- `conf/map-engine.js` は影響範囲が広いので慎重に扱う。
- `layerGroups` は複数ファイルから共有される。
- `umap_backup_map.umap` と `P35-18_Roadside_Station.geojson` は置換更新される原本データであり、通常の改修では直接編集しない。
- 両マスタへの許可された更新は、正規マスタによるファイル全体の置換のみとする。
- 地図データに関する機能・性能要件は、原本を加工せず読み込み処理側で対応する。
- 設定txtの形式変更時は読み込みJSとドキュメントも更新する。
- 外部API/ライブラリ追加時は事前承認を取る。
- GitHub Pagesで動かない構成にしない。

## 6. 直近のドキュメント整備状況

`docs/architecture.md` にあった逆引き仕様案から、以下の文書へ分割済みです。

- `docs/current-status.md`
- `docs/architecture.md`
- `docs/data-formats.md`
- `docs/map-behavior.md`
- `docs/verification.md`
- `docs/decisions.md`
- `docs/handoff.md`

`AGENTS.md` の Source of Truth も、この構成に同期済みです。

## 7. 要確認事項

- uMapデータの更新手順をどうするか。
- 高速道路ICデータの由来と更新方法。
- OSMタイル利用ポリシーの確認要否。
- Cloudflare Web Analytics の扱い。
- インラインJS/CSSを今後分離するか。

## 8. 場所検索の追加（2026-10-03）

座標移動パネルを「場所を検索」に拡張しました。OpenPOI `/v1/suggest` は `conf/poi-search.js` に分離し、既存座標移動・一時ピン・地図中核処理を再利用します。結果は永続保存しません。検索パネルとフッターの出典リンクは公式の出典・ライセンスページを参照します。

同日の追加修正で、地図範囲・中心・radiusを検索条件から除去しました。入力補完は全国suggest、右側の検索ボタン・入力欄Enterは全国searchです。Enterによるサジェスト先頭の即選択は廃止し、「小作」等の2文字語も本検索できる構成にしました。

通常・全画面のPC/スマホ表示、実API、通信競合・失敗、タッチ再現の確認結果は `docs/verification.md` を参照してください。実機GPS、Wake Lock、ソフトウェアキーボード、長押し、GitHub Pages公開後の確認は別途必要です。

## iPhone Safari全画面対応（2026-10-15）

Fullscreen API優先＋非対応時だけ疑似全画面を追加しました。全画面を参照する機能はisMapFullscreen()/mapfullscreenchangeを使います。標準fullscreenchangeはmap-engine.jsが受けます。疑似全画面中のVisualViewport寸法変更後はmapfullscreenresizeで検索高さを同期します。

ネイティブ経路、追従・ジェスチャ・雨雲通信・レイヤー生成、原本2ファイルを保護しています。実機iPhone / AndroidとGitHub Pages公開後は未確認です。検証の詳細・既存のネイティブ全画面凡例の制約は docs/verification.md と docs/map-behavior.md を参照してください。

## スマホ全画面UI（2026-10-15、Issue #1）

スマホ全画面では検索を閉じて非表示にし、操作ガイドだけを維持します。Issue #7の全画面列は雨雲・ロック・画面ON・追従・解除、右下に現在地。56→52→48→44pxと列スクロールは維持しています。Issue #10で通常表示は案内/検索を左上、雨雲だけを右上、全画面化→現在地を右下へ変更し、追従・ロック・画面ONを非表示にしました。通常/PCの列ラッパーはdisplay:contentsです。Zoom数値バッジは全環境で削除。通常表示へ戻っても追従は保持し、画面ONは従来どおり全画面終了でOFFにします。

既存の全画面遷移・地図サイズ更新・元スクロール復元・Wake Lock・ズーム配置・雨雲通信は保護しています。最新配置はmap-behavior.mdの第16節、ロック仕様は第17節、検証範囲と実機未確認事項はverification.mdのIssue #6/#7の節を参照してください。操作ロックはmap-interaction-lock.jsで独立管理し、3秒以内の3回操作または非表示/復帰/全画面終了等で解除します。GPSの自動追従は停止しません。Issue #7はCommit・Push後にCloseする明示指示があります。
