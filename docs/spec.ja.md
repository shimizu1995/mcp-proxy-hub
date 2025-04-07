# MCP Proxy Hub 仕様書

## 概要

MCP Proxy Hub（MCPプロキシハブ）は、複数のMCP（Model Context Protocol）リソースサーバーを集約し、単一のインターフェースを通して提供するプロキシサーバーです。このサーバーは中央ハブとして機能し、以下のような機能を提供します：

- 複数のMCPリソースサーバーへの接続と管理
- それらの組み合わせた機能を統一されたインターフェースを通して公開
- リクエストの適切なバックエンドサーバーへのルーティング
- 複数のソースからのレスポンスの集約

## アーキテクチャ

### 主要コンポーネント

1. **プロキシサーバー** (`mcp-proxy.ts`)：

   - メインの調整役として機能し、クライアントからの要求を適切なバックエンドサーバーにルーティング
   - MCPサーバーのインスタンスを作成し、各種ハンドラーを登録

2. **クライアント管理** (`client.ts`)：

   - 設定ファイルに基づいて複数のMCPサーバーへの接続を確立・管理
   - StdioとSSEの両方のトランスポート方式をサポート

3. **リソース/ツール/プロンプトハンドラー** (`handlers/`)：

   - 各種MCP要求（リソース、ツール、プロンプト）を処理するハンドラー群
   - 適切なバックエンドサーバーへの要求のルーティングを担当

4. **マッピング機能** (`mappers/`)：

   - ツール、リソース、プロンプトとそれらを提供するクライアントとの関連付けを管理

5. **カスタムツール機能** (`custom-tools.ts`)：
   - 複数のサーバーからのツールを組み合わせた独自のツールを作成する機能

### 通信方式

- **標準入出力（stdio）**：

  - コマンドライン経由で起動されるMCPサーバーとの通信に使用
  - `StdioClientTransport`と`StdioServerTransport`クラスを使用

- **Server-Sent Events（SSE）**：
  - HTTP接続を利用したサーバーとの通信に使用
  - `SSEClientTransport`と`SSEServerTransport`クラスを使用
  - 複数クライアント接続のサポート

## Project Structure

```
.
├── README.md
├── config.example.json
├── doc
│   └── spec.md
├── eslint.config.js
├── package.json
├── src
│   ├── client.ts
│   ├── config.ts
│   ├── core
│   │   └── server.ts
│   ├── handlers
│   │   ├── tool-handlers.ts
│   │   └── tool-handlers.spec.ts
│   ├── index.ts
│   ├── mappers
│   │   └── client-maps.ts
│   ├── mcp-proxy.ts
│   ├── sse.ts
│   └── utils
│       └── logger.ts
├── tsconfig.json
└── vitest.config.ts
```

## 機能詳細

### リソース管理

- **リソース検出と集約**：

  - 接続された全サーバーからリソースを取得し、統合リスト提供
  - リソース名にサーバー名のプレフィックスを追加（例：`[ServerName] ResourceName`）
  - URIスキームの一貫性維持

- **リソースルーティング**：

  - リソースURIからそれを提供するサーバーへのマッピング管理
  - リソース読み取りリクエストを適切なサーバーに転送

- **リソーステンプレート**：
  - 各サーバーのリソーステンプレートを集約して提供

### ツール集約

- **ツール検出と公開**：

  - 接続された全サーバーからツールを取得し、統合リスト提供
  - ツール名にサーバー名の情報を追加
  - 設定による露出/非表示ツールのフィルタリング機能

- **ツール名リマッピング**：

  - 設定ファイルによるツール名の変更サポート（例：`tool2`→`renamed_tool2`）
  - 元のツール名と公開名のマッピング管理

- **ツールコール処理**：
  - ツール呼び出しを適切なサーバーにルーティング
  - カスタムツールの場合は特別な処理を実行

### カスタムツール機能

- **設定ベースのツール定義**：

  - `config.json`内で独自の複合ツールを定義可能
  - 複数サーバーのツールを1つのカスタムツールとして統合

- **サブツール管理**：
  - サーバー名とツール名の組み合わせによるサブツール指定
  - `{ "server": "server_name", "tool": "tool_name", "args": {...} }`形式での実行

### プロンプト処理

- **プロンプト集約**：

  - 接続された全サーバーからプロンプトを取得し、統合リスト提供
  - プロンプト説明にサーバー名の情報を追加

- **プロンプトルーティング**：
  - プロンプト名からそれを提供するサーバーへのマッピング管理
  - プロンプト呼び出しを適切なサーバーに転送

## 設定

### 設定ファイル構造

```json
{
  "mcpServers": {
    "ServerName1": {
      "command": "/path/to/server1/build/index.js",
      "exposedTools": ["tool1", { "original": "tool2", "exposed": "renamed_tool2" }]
    },
    "ServerName2": {
      "command": "npx",
      "args": ["@example/mcp-server", "--option", "value"],
      "hiddenTools": ["tool3"]
    },
    "ServerName3": {
      "type": "sse",
      "url": "http://example.com/mcp"
    }
  },
  "tools": {
    "CustomToolName": {
      "description": "カスタムツールの説明",
      "subtools": {
        "ServerName1": {
          "tools": [
            {
              "name": "toolA",
              "description": "ツールAの説明"
            }
          ]
        },
        "ServerName2": {
          "tools": [
            {
              "name": "toolB",
              "description": "ツールBの説明"
            }
          ]
        }
      }
    }
  }
}
```

### 設定オプション

#### MCPサーバー設定

- **stdio型サーバー**:

  - `command`: 実行するコマンド（必須）
  - `args`: コマンドライン引数（オプション）
  - `env`: 環境変数（オプション）
  - `exposedTools`: 公開するツールの配列（オプション）
  - `hiddenTools`: 非表示にするツールの配列（オプション）

- **SSE型サーバー**:
  - `type`: 「sse」（必須）
  - `url`: SSEサーバーのURL（必須）
  - `exposedTools`: 公開するツールの配列（オプション）
  - `hiddenTools`: 非表示にするツールの配列（オプション）

#### ツールフィルタリング設定

- **exposedTools**:

  - 指定されたツールのみを公開
  - 文字列（元のツール名）または{original, exposed}オブジェクト（リネーム時）を含む配列

- **hiddenTools**:
  - 指定されたツールを非表示
  - 非表示にするツール名の文字列配列

#### カスタムツール設定

- **tools**:
  - カスタムツール名をキーとするオブジェクト
  - 各ツールは`description`と`subtools`を持つ
  - `subtools`はサーバー名をキーとし、各サーバーのツールリストを含む

## 環境変数

- `MCP_PROXY_CONFIG_PATH`: 設定ファイルへのパス
- `MCP_PROXY_LOG_DIRECTORY_PATH`: ログディレクトリへのパス
- `MCP_PROXY_LOG_LEVEL`: ログレベル（"debug"または"info"）
- `KEEP_SERVER_OPEN`: SSEモードでクライアント切断後もサーバーを開いておくかどうか（"1"に設定で有効）
- `PORT`: SSEサーバーのポート（デフォルト：3006）

## 運用

### Claudeデスクトップとの統合

設定ファイル（MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`、Windows: `%APPDATA%/Claude/claude_desktop_config.json`）に以下を追加：

```json
{
  "mcpServers": {
    "mcp-proxy-hub": {
      "command": "/path/to/mcp-proxy-hub/build/index.js",
      "env": {
        "MCP_PROXY_CONFIG_PATH": "/absolute/path/to/your/config.json",
        "KEEP_SERVER_OPEN": "1"
      }
    }
  }
}
```

### デバッグ

MCPサーバーは標準入出力を介して通信するため、デバッグが困難な場合があります。MCPインスペクターを使用することが推奨されます：

```bash
npm run inspector
```

これにより、ブラウザでデバッグツールにアクセスするためのURLが提供されます。

## インストールと実行

### インストール

```bash
npm install
```

### ビルド

```bash
npm run build
```

### 開発モード

```bash
# 自動リビルドモード
npm run watch

# 連続実行モード（Stdio）
npm run dev

# 連続実行モード（SSE）
npm run dev:sse
```

### 本番実行

```bash
MCP_PROXY_CONFIG_PATH=./config.json mcp-proxy-server
```
