import http from 'http';

export interface CallbackResult {
  code: string;
  state?: string;
}

export interface LoopbackHandle {
  port: number;
  redirectUri: string;
  waitForCode(): Promise<CallbackResult>;
  close(): void;
}

const SUCCESS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Authorized</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#222}
h1{font-size:1.4rem}p{color:#555}</style></head>
<body><h1>Authorization complete</h1>
<p>You can close this tab and return to the terminal.</p>
</body></html>`;

const errorHtml = (msg: string): string => `<!doctype html>
<html><head><meta charset="utf-8"><title>Authorization failed</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#222}
h1{font-size:1.4rem;color:#b00}p{color:#555}</style></head>
<body><h1>Authorization failed</h1><p>${msg}</p></body></html>`;

export interface StartLoopbackOptions {
  /** Path component the auth server will redirect to (default: "/callback") */
  callbackPath?: string;
  /** Timeout in ms before rejecting (default: 5 minutes) */
  timeoutMs?: number;
}

export const startLoopbackServer = (opts: StartLoopbackOptions = {}): Promise<LoopbackHandle> => {
  const callbackPath = opts.callbackPath ?? '/callback';
  const timeoutMs = opts.timeoutMs ?? 5 * 60_000;

  return new Promise<LoopbackHandle>((resolveStart, rejectStart) => {
    let resolveCode: (r: CallbackResult) => void;
    let rejectCode: (e: Error) => void;
    const codePromise = new Promise<CallbackResult>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });
    // Suppress "unhandled rejection" warnings when consumers attach via
    // waitForCode() asynchronously; the rejection still propagates through
    // the .finally-derived promise that waitForCode returns.
    codePromise.catch(() => {});

    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        if (url.pathname !== callbackPath) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const error = url.searchParams.get('error');
        if (error) {
          const desc = url.searchParams.get('error_description') ?? error;
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(errorHtml(desc));
          rejectCode(new Error(`OAuth error: ${desc}`));
          return;
        }
        const code = url.searchParams.get('code');
        if (!code) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(errorHtml('Missing authorization code'));
          rejectCode(new Error('OAuth callback missing code'));
          return;
        }
        const state = url.searchParams.get('state') ?? undefined;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(SUCCESS_HTML);
        resolveCode({ code, state });
      } catch (err) {
        res.statusCode = 500;
        res.end('Internal error');
        rejectCode(err instanceof Error ? err : new Error(String(err)));
      }
    });

    server.on('error', (err) => {
      rejectStart(err);
      rejectCode?.(err);
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        rejectStart(new Error('Loopback server failed to bind a port'));
        server.close();
        return;
      }
      const { port } = addr;
      const redirectUri = `http://127.0.0.1:${port}${callbackPath}`;

      const timer = setTimeout(() => {
        rejectCode(new Error(`OAuth callback timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref();

      const close = (): void => {
        clearTimeout(timer);
        server.close();
      };

      resolveStart({
        port,
        redirectUri,
        waitForCode: () => codePromise.finally(close),
        close,
      });
    });
  });
};
