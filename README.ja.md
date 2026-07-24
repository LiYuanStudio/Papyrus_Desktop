# 📜 Papyrus(パピルス)

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語**

> Papyrus Desktop **v2.0.0-beta.12** — TypeScript / Fastify バックエンド、React 19 フロントエンド、Electron 41 デスクトップシェル。

![Version](https://img.shields.io/badge/version-v2.0.0--beta.12-blue)
![Node.js](https://img.shields.io/badge/Node.js-24-339933)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6)
![Fastify](https://img.shields.io/badge/Fastify-5-000000)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Electron](https://img.shields.io/badge/Electron-41-47848F)
![License](https://img.shields.io/badge/License-MIT-yellow)
![AI-Assisted](https://img.shields.io/badge/Dev-AI--Assisted-blueviolet)
![Accessibility](https://img.shields.io/badge/a11y-WCAG%202.1%20AA%2FAAA-green)

**Papyrus** は、高強度の記憶トレーニングに特化した、ミニマル・フルキーボード操作・AI エージェント駆動の間隔反復(SRS)復習エンジンです。

> 「大道は至簡なり。」

---

## ✨ 主な特徴

- 🚀 **フローモード** — 全操作キーボード駆動。復習中、マウスに触れる必要なし。
- 🧠 **実証済みのスケジューリング** — SM-2 間隔反復アルゴリズムで、カードごとに次回復習間隔を自動調整。
- 🤖 **AI エージェント** — OpenAI / Anthropic / Ollama に対応。ツール呼び出し承認フロー(手動 / 自動)と呼び出し履歴付き。
- 📝 **ノート + Obsidian インポート** — 既存 Vault をそのまま取り込み、フォルダツリー・タグ・関係グラフで操作。
- 🕘 **バージョン履歴とロールバック** — ノート/カードの編集ごとに内容ハッシュ付きバージョンを自動保存。ロールバックは新規バージョンを生成(履歴は破壊しない)。
- 🔐 **API キーは暗号化保存** — AES-GCM、インストールごとに独立したマスターキー・ソルト・認証タグ。
- 🛡️ **安全なデフォルト** — 書き込み API は auth token 必須、クラウド AI ベース URL に SSRF ガード、公開 API に rate limiting、パストラバーサルは `dev`+`ino` 包含チェックで防御。
- ♿ **アクセシビリティ** — 全画面 WCAG 2.1 AA 準拠。AAA レベルのコントラスト、スクリーンリーダー最適化、モーション低減モードを提供。
- 🌐 **モダンスタック** — バックエンド: Node.js + TypeScript(Fastify)、フロントエンド: React 19 + Vite + Arco Design、デスクトップシェル: Electron 41。
- 📦 **ローカルファースト** — クラウド AI プロバイダーを指定しない限り、データはマシンから出ない。

---

## 📥 ダウンロード

ビルド済みインストーラーは [Releases](https://github.com/PapyrusOR/Papyrus_Desktop/releases) ページに公開しています。

| プラットフォーム | アーキテクチャ | 形式 |
| :--- | :--- | :--- |
| Windows | x64 | NSIS インストーラー(`.exe`)、ポータブル版(`.exe`) |
| macOS | arm64 | DMG(`.dmg`)、ZIP(`.zip`) |
| Linux | x64 | AppImage、DEB(`.deb`)、TAR.GZ |

> ⚠️ `v2.0.0-beta.12` はベータ版です。データスキーマは安定していますが、UI と API は `v2.0.0` 正式版までに変更される可能性があります。

---

## ⌨️ キーボードショートカット(フローモード)

| キー | 動作 | 効果 |
| :--- | :--- | :--- |
| **Space** | **答えを表示** | 巻物を広げて、巻末の内容を表示 |
| **1** | **忘却** | 不慣れとしてマーク。短期間で再出題 |
| **2** | **曖昧** | 不確かとしてマーク。後ほど再復習 |
| **3** | **瞬殺** | 記憶が確立。復習間隔を線形に倍増 |
| **Tab** | **ナビゲーション** | 操作可能要素間でフォーカス切替 |
| **Ctrl + K** | **検索** | グローバル検索を開く |

---

## 🚀 クイックスタート(ソースから実行)

### 必要環境

- **Node.js** 24 以上
- **npm** 11 以上

### 依存関係のインストール

```bash
# postinstall が frontend/ と backend/ にカスケード
npm install
```

### 開発モードで起動

```bash
# backend(Fastify, tsx watch)+ frontend(Vite)を並行起動
npm run dev

# Electron シェルも一緒に起動する場合
npm run electron:dev
```

- フロントエンド: <http://localhost:5173>
- バックエンド API: <http://127.0.0.1:8000>
- ヘルスチェック: <http://127.0.0.1:8000/api/health>

### インストーラーのビルド

```bash
npm run electron:build          # 現在のプラットフォーム
npm run electron:build:win      # Windows のみ
npm run electron:build:mac      # macOS のみ
npm run electron:build:linux    # Linux のみ
```

成果物は `dist-electron/` に出力されます。

---

## 📥 カードの一括インポート

UTF-8 エンコードの `.txt` ファイルを以下の形式で用意します:

```text
問題またはシナリオ A === トリガーまたは答え A

問題またはシナリオ B === トリガーまたは答え B
```

> 各カードは `===` で区切ります。グループ間に空行を入れると見やすくなります。

---

## 🤖 AI 設定

### 1. プロバイダーの設定

サイドバーの **⚙️ 設定** から API キーを追加:

- **OpenAI** — <https://platform.openai.com/api-keys> でキーを取得
- **Anthropic** — <https://console.anthropic.com/> でキーを取得
- **Ollama** — ローカル実行。API キー不要
  ```bash
  # インストール: https://ollama.ai
  ollama pull llama2
  ```

API キーは **暗号化して保存**(AES-GCM、インストールごとのマスターキー)されます。

### 2. モードの選択

- **エージェントモード** — モデルがツール呼び出し承認フローの下でツール(カードの追加 / 編集 / 削除、ノート検索など)を使用可能。
- **チャットモード** — 純粋な会話。副作用なし。

### 3. パラメータ調整

- **Temperature** — 0~2、高いほどランダム。
- **Max Tokens** — 1 回の応答長の上限。
- **ツール承認** — `manual`(キューでレビュー)または `auto`(許可リスト駆動)。

---

## ♿ アクセシビリティ

Papyrus はすべての方が使えるよう設計しています:

- **キーボードナビゲーション** — 全ページで Tab による完全なトラバーサル。
- **スクリーンリーダー** — セマンティックな ARIA ラベル、状態変化を伝える live region。
- **コントラスト** — **設定 → アクセシビリティ** で AAA レベルのカラーパレットを利用可能。
- **モーション** — OS の設定に追従する「モーション低減」モード。

---

## 🛠️ アーキテクチャ

```
Papyrus/
├── backend/                  # Node.js + TypeScript(Fastify)
│   └── src/
│       ├── api/              # Fastify ルートとサーバーエントリ(server.ts)
│       ├── core/             # カード、ノート、SM-2、バージョン管理、暗号化
│       ├── db/               # SQLite（node:sqlite、WAL）と schema 初期化
│       ├── ai/               # プロバイダー抽象化、ツールマネージャー、LLM キャッシュ
│       ├── cli/              # Desktop CLI 管理ヘルパー
│       ├── mcp/              # MCP REST エンドポイント(ノート / Vault CRUD)
│       ├── integrations/     # Obsidian インポート、ファイル監視(chokidar)
│       └── utils/            # 共通ユーティリティ
├── frontend/                 # React 19 + TypeScript(Vite)
│   └── src/
│       ├── StartPage/        # ホーム(最近のノート、復習キュー、二十四節気テーマ)
│       ├── ScrollPage/       # フラッシュカード学習(「巻物」)
│       ├── NotesPage/        # ノート管理とグラフビュー
│       ├── FilesPage/        # ファイルライブラリ
│       ├── ExtensionsPage/   # 拡張機能管理
│       ├── SettingsPage/     # 設定、AI、アクセシビリティ
│       ├── ChartsPage/       # 統計と進捗グラフ
│       └── ChatPanel/        # AI チャットパネル
├── electron/                 # メインプロセス + preload(Electron 41)
├── scripts/                  # build-electron.js、extract-changelog.js
├── e2e/                      # Playwright E2E テスト
└── docs/                     # プロジェクトドキュメント
```

### スタック

- **バックエンド** — Node.js 24、TypeScript 5、Fastify 5、Jest
- **フロントエンド** — React 19、TypeScript 5、Vite、Arco Design、Tailwind CSS
- **デスクトップ** — Electron 41 + electron-builder
- **アルゴリズム** — SM-2 間隔反復
- **ストレージ** — SQLite（`node:sqlite`、WAL）、内容ハッシュ付きバージョン
- **CI/CD** — GitHub Actions マトリックス(Windows x64、macOS arm64、Linux x64)

---

## 🔧 開発

### バックエンド

```bash
cd backend
npm run dev         # tsx watch で Fastify をホットリロード
npm run build       # TypeScript を dist/ にコンパイル
npm run typecheck   # tsc --noEmit
npm test            # Jest ユニット + 統合テスト
npm start           # コンパイル後の dist/api/server.js を実行
```

バックエンドはデフォルトで `127.0.0.1:8000` を listen します。`PAPYRUS_PORT` で上書き可能。

### フロントエンド

```bash
cd frontend
npm run dev         # Vite 開発サーバー(http://localhost:5173)
npm run build       # 本番ビルドを dist/ へ
npm run typecheck   # TypeScript 型チェック
```

### リリースフロー

```bash
# 1. CHANGELOG.md の [Unreleased] を新しいバージョン番号下にアーカイブ

# 2. (任意)GitHub Release に載るセクションをプレビュー
node scripts/extract-changelog.js v2.0.0

# 3. コミット
git add CHANGELOG.md
git commit -m "chore: release v2.0.0"

# 4. タグ付けして push — GitHub Actions が 3 プラットフォームをビルドし、
#    対応する CHANGELOG セクションを抽出してインストーラーをアップロード。
git tag v2.0.0
git push origin main --tags
```

---

## 📁 データファイル

デフォルトでは、ユーザーデータは `paths.dataDir`(初期値 `$HOME/PapyrusData`、`PAPYRUS_DATA_DIR` で上書き可)以下に保存されます:

- `papyrus.db` — SQLite データベース（WAL）：カード、ノート、プロバイダー、チャット、バージョン、ファイル、関係、拡張、進捗、UI 設定
- `backups/` — `POST /api/backup` によるオンデマンドバックアップ
- `logs/` — アプリケーションログ
- レガシー JSON（`data.json`、`ai_config.json`）は互換用。AI 設定は起動時に DB へ移行
- Electron モードの書き込み API は `PAPYRUS_AUTH_TOKEN` / ローカル生成 token を使用

---

## ⚠️ 注意事項

1. **API 料金** — OpenAI と Anthropic は使用量課金。プロバイダー側で予算を設定することを推奨。
2. **ローカルモデル** — Ollama は無料ですが、それなりのハードウェアが必要。
3. **ネットワーク** — クラウドプロバイダーは安定した接続が必要。
4. **プライバシー** — ローカルモデルはローカル完結。クラウドプロバイダーには送信内容が見えます。
5. **同時実行** — 同一データディレクトリでは単一インスタンスを推奨。SQLite WAL は複数読取を許可しますが、複数プロセスからの同時書き込みはサポートしません。

---

## 📚 ドキュメント

### ユーザーガイド
- [クイックスタート](docs/guides/QUICKSTART.md) — 5 分で開始
- [アクセシビリティ設定](docs/guides/A11Y_SETTINGS.md)
- [バージョン情報](docs/guides/VERSION.md)
- [変更履歴](CHANGELOG.md) — GitHub Release に自動連携

### 開発者ガイド
- [プロジェクト構造](docs/PROJECT_STRUCTURE.md)
- [環境要件](docs/guides/ENVIRONMENT_REQUIREMENTS.md)
- [アクセシビリティ開発ガイド](docs/guides/ACCESSIBILITY_GUIDE.md)
- [UI デザイントークン](docs/guides/UI_TOKENS.md)
- [REST API リファレンス](docs/API.md)
- [拡張機能の開発](docs/EXTENSIONS.md) と [拡張機能テンプレート](examples/extension-template/)
- [Electron パッケージング](ELECTRON.md)
- [開発環境](README-DEV.md)

### AI 機能
- [AI 概要](docs/AI_README.md)

---

## 💡 作者の言葉

正直に言うと、この作品の誕生はそんなに理想的でも壮大でもありません。

なぜ作ったかって?ある日、AI 学習をやっていて、知識ポイントを暗記するために Anki をダウンロードしたんです。インストールしたら、アップデートをチェックしたいと言う。アップデートはサーバーに繋ぎたい。そしてどうしても繋がらない。

ふと隣を見ると Gemini がいる。じゃあ書いてもらおう、と。書いては直し、直しては書き、そのまま使い始めた。

公開するつもりは元々なかったんです。じゃあなぜ出したかって?

昨日、ずっと放置していたアカウントで彼女のリポジトリに star を付けようとしたら、GitHub にボット判定されてアクティビティを全部消されました。腹が立った。AI を「使っている」だけで、自分自身が AI じゃない。AI じゃないことを証明するために、ちょうど手元にあったこいつを少し直して、ここに上げたわけです。

小話はおしまい。今日はもう旧暦正月 6 日。じきに夜が明ける。苦学生、ため息をついて愚痴をこぼすしかない、そんな夜です。

好きな言葉があります:**Veritas vos liberabit**(知識は人を自由にする)。皆さんと共に。これは私の初めてのオープンソースプロジェクトです。どうかお手柔らかに。

これを遅ればせながらの新年の挨拶ということで。
**新しい年、知識という刃を手に、夜の闇を切り裂き、まっすぐ夜明けへ向かわんことを。**

---

## 📄 ライセンス

[MIT](LICENSE)

---

**Papyrus** — 学びをよりスマートに、記憶をより科学的に。
