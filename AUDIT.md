# CodeStage / SlideCode 監査メモ

作成日: 2026-03-06

このメモは、`/home/tetsuya/dev/codestage` の監査結果のうち、未完了の修正項目・追加機能・設定改善を整理したものです。

## 前提

- 監査時点での未完了タスクのみを残しています。
- P0 の local-only 化、terminal local-only 化、SVG 制限、quarantine、atomic save 系は対応済みです。
- 直近の P1（route race / dirty guard / stable file ID / markdown-only editor / print export 契約 / config API trim）も対応済みのため、このメモから外しています。
- `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` / `pnpm build` は実行済みです。

## 優先順位サマリ

### P1: 次に直すべき

- エクスポートの markdown 表現がアプリ内プレビューと大きく違い、KaTeX / Mermaid / callout が再現されない。`server/export-service.js:53`, `server/export-service.js:85`, `src/panes/markdown.js:116`
- プレゼンの pane toggle がスライド移動ごとに自動上書きされ、発表中の手動設定が保持されない。`src/views/presentation.js:83`
- Markdown の asset / KaTeX / callout 処理が regex ベースで、code fence や inline code 内まで誤変換しやすい。`src/panes/markdown.js:96`, `src/panes/markdown.js:137`, `src/panes/markdown.js:166`
- `listDecksMeta()` が壊れた deck を黙って隠すため、障害が UI 上で見えにくい。`server/deck-storage.js:223`
- highlight.js の HTML を `\n` 分割しており、複数行 token で markup が壊れうる。`src/panes/code.js:31`
- `localStorage` が使えない環境で theme / layout / editor setting 初期化が落ちうる。`src/main.js:21`, `src/core/theme.js:11`, `src/core/layout.js:247`, `src/views/editor-layout-controls.js:57`
- 起動時に body を隠しており、bundle 読み込み失敗時は真っ白画面のままになりうる。`index.html:20`, `src/main.js:15`, `src/main.js:126`
- ZIP export は HTML 側で base64 埋め込みしたアセットと raw asset を両方入れており、無駄に重い。`server/export-service.js:70`, `server/export-service.js:245`
- dashboard 側に `confirm()` と inline `onclick` が残り、UI 実装方針が不統一。`src/views/dashboard.js:229`, `src/views/dashboard.js:280`

### P2: 中期で進めたい

- README、CI、preview 説明、公開条件の明文化など、運用と DX の整備
- presentation / dashboard / assets の利便性向上
- editor 設定、履歴、最近開いた deck 復元などの継続改善

## フロントエンドの修正点

各リストは、上ほど着手優先度が高い順です。

### エディタ

- 同名ファイル禁止または自動重複解決を入れる
- 保存成功後に server 正規化結果で `renderFileTabs()` / `loadFile()` / fileRef UI を同期し直す
- invalid filename や duplicate filename をクライアント側でも即時バリデーションする
- undo/redo、履歴、復元ポイント、自動バックアップを追加する
- editor 設定として font size / tab size / word wrap / line numbers / minimap / autosave 間隔を持てるようにする

### プレゼンテーション

- pane 表示設定を slide change で強制リセットしない
- terminal 切断時の reconnect / reset / clear を追加する
- layout picker に `aria-expanded`、キーボード操作、ショートカット一覧を追加する
- drag and drop だけでなく pane 並び替えの非 DnD UI を追加する
- fullscreen、presenter mode、speaker notes、start slide 指定、last slide 復元を追加する

### ダッシュボード

- import 時のエラー理由を出す
- export 時に JSON / HTML / PDF / ZIP の違いを UI 上で説明する
- JSON export の filename を sanitize する。`src/views/dashboard-export-modal.js:31`
- Blob URL の revoke を click 直後ではなく安全側にずらす。`src/views/dashboard-export-modal.js:5`
- deck 検索、並び替え、絞り込み、最近使った順、アーカイブを追加する
- delete を confirm ダイアログではなく既存モーダル系に統一する

### アセット

- broken refs の自動修復支援を追加する
- upload を base64 JSON ではなく multipart / streaming に寄せる
- `kind: 'image'` 固定をやめ、画像以外の素材も正しく扱う。`src/views/editor-assets-modal.js:175`
- preview、rename、replace、folder 管理、drag and drop、容量表示を追加する
- 既存 SVG 資産をどう扱うか（download-only / 移行 / 警告表示）を決める

## バックエンド / API の修正点

### セキュリティ

- WebSocket / PTY のレート制限と操作監査を追加する
- asset file 配信の `Content-Disposition` 方針をさらに整理し、必要なら download 強制へ寄せる
- local-only 前提をドキュメント化し、将来 LAN 公開するなら REST 側の認証方針を追加する

### データ整合性 / 耐障害性

- read error / schema mismatch を UI から見える形で出す
- 壊れた deck の検出結果を一覧 UI から追えるようにする

### API 契約

- deck list で壊れた deck を隠すだけでなく、警告メタを返せるようにする

## 追加すべき機能

### ユーザー向け機能

- 最近開いた deck、最後に見た slide / file の復元
- deck diff / version history / restore
- presentation の bookmarks / chapter / agenda
- speaker notes と audience view 分離
- slide テンプレート、theme presets、brand presets
- 共有用 read-only export、埋め込み用 export
- keyboard shortcut cheat sheet

### 管理機能

- storage health check と破損 deck 通知
- asset usage report
- template preview と template metadata
- app config の「設定の妥当性チェック」

## 追加すべき設定

### アプリ設定

- remember last route / deck / slide / file
- autosave on/off と autosave delay
- editor font size
- editor word wrap
- editor tab size
- terminal font size / theme
- terminal reconnect policy
- default visible panes
- default layout
- reduced motion

### サーバー設定

- max upload size
- backup / snapshot path
- rate limit / audit log 設定

## ドキュメント / 運用 / DX の修正点

- `README.md` が無く、セットアップ・用途・環境変数・配布方法が不足している
- CI がなく、lint / typecheck / unit / e2e が自動で担保されない
- `AGENTS.md` と `CLAUDE.md` が「lint/test/typecheck 未設定」と書いたままで、現状の `package.json` と食い違っている。`AGENTS.md:37`, `CLAUDE.md:19`, `package.json:12`, `package.json:18`
- `pnpm preview` でどこまで動くかの説明が必要
- terminal の安全な公開条件を明文化すべき
- 一方で `typecheck` は utility の一部しか見ておらず、設定名から期待されるほど広くない。`tsconfig.src.json:9`, `tsconfig.server.json:9`
- `pnpm` 前提なのに `package-lock.json` が同居しており、lockfile 運用が曖昧
- branding / naming が `CodeStage`, `SlideCode`, `codestage-*`, `slidecode-*` で混在している。`server/runtime-config.js:5`, `server/runtime-config.js:6`, `AGENTS.md:91`, `src/core/theme.js:12`

## テスト追加候補

### unit / integration

- route race と stale response 上書き
- duplicate file names conflict handling
- markdown-only slide で editor が stale file を保持しないこと
- CORS / auth / origin validation
- terminal idle timeout / session upper bound

### e2e

- file rename with duplicate conflict
- deck rename
- import / export flows
- app config save / invalid path
- terminal disabled / enabled
- assets upload / delete / broken refs
- accessibility smoke checks for keyboard-only flow

## 実装順の提案

### Phase 1: 防御

- REST 認証方針の整理（将来公開時）
- WS のレート制限 / 監査ログ

### Phase 2: データ整合性

- 壊れた deck の UI 通知

### Phase 3: UX 改善

- presentation pane state 改善
- dashboard / export / assets UI 改善

### Phase 4: 設定と仕上げ

- README / CI / docs 整備
- preferences 追加
- naming 統一

## 補足

- 次に着手するなら、export markdown の再現性、presentation の pane state、壊れた deck の可視化を優先するのが妥当です。
- 追加機能は多いですが、現時点では「機能不足」より「安全性・整合性・運用性」の改善が先です。
