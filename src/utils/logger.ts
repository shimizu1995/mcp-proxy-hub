import fs from 'node:fs';
import path from 'node:path';

/**
 * ログレベルを定義する列挙型
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

/**
 * 設定可能なロガークラス
 */
export class Logger {
  private logStream: fs.WriteStream;
  private logLevel: LogLevel;
  private logFilePath: string;

  /**
   * ロガーを初期化する
   * @param options ロガーの設定オプション
   */
  constructor(options: { dirPath: string; fileName?: string; level?: LogLevel }) {
    const { dirPath, fileName = 'console.log', level = LogLevel.INFO } = options;

    // ディレクトリが存在しない場合は作成
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    this.logFilePath = path.join(dirPath, fileName);
    this.logStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
    this.logLevel = level;

    // 最初のログエントリ - サーバー起動時のメッセージ
    this.info(`Logger initialized. Log file: ${this.logFilePath}`);
  }

  /**
   * タイムスタンプを生成する
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * ログメッセージを書き込む
   * @param level ログレベル
   * @param prefix ログのプレフィックス
   * @param args ログメッセージの引数
   */
  private log(level: LogLevel, prefix: string, ...args: unknown[]): void {
    if (level > this.logLevel) return;

    const timestamp = this.getTimestamp();
    const message = args
      .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
      .join(' ');

    this.logStream.write(`[${timestamp}] ${prefix}: ${message}\n`);
  }

  /**
   * デバッグレベルのログを出力
   */
  debug(...args: unknown[]): void {
    this.log(LogLevel.DEBUG, 'DEBUG', ...args);
  }

  /**
   * 情報レベルのログを出力
   */
  info(...args: unknown[]): void {
    this.log(LogLevel.INFO, 'INFO', ...args);
  }

  /**
   * 警告レベルのログを出力
   */
  warn(...args: unknown[]): void {
    this.log(LogLevel.WARN, 'WARN', ...args);
  }

  /**
   * エラーレベルのログを出力
   */
  error(...args: unknown[]): void {
    this.log(LogLevel.ERROR, 'ERROR', ...args);
  }

  /**
   * ログを閉じる
   */
  close(): void {
    this.logStream.end();
  }

  /**
   * consoleオブジェクトのメソッドをこのロガーにリダイレクト
   */
  redirectConsole(): void {
    console.log = this.info.bind(this);
    console.info = this.info.bind(this);
    console.warn = this.warn.bind(this);
    console.error = this.error.bind(this);
  }

  /**
   * ログファイルのパスを取得
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }
}

/**
 * デフォルトのロガーインスタンスを作成する
 * @param options ロガーの設定オプション
 */
export function createDefaultLogger(options?: {
  dirPath?: string;
  fileName?: string;
  level?: LogLevel;
}): Logger {
  const defaultDir = '/tmp/mcp-coordinator';

  return new Logger({
    dirPath: options?.dirPath ?? defaultDir,
    fileName: options?.fileName,
    level: options?.level,
  });
}
