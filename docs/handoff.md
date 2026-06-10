# TouringHub Handoff

更新日: 2026-06-10

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
