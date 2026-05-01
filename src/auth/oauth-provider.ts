import { randomBytes } from 'crypto';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { startLoopbackServer, LoopbackHandle } from './loopback-server.js';
import { openBrowser } from './browser.js';
import {
  loadClientInformation,
  loadTokens,
  saveClientInformation as persistClientInformation,
  saveTokens as persistTokens,
  clearForServer,
} from './token-store.js';

const CLIENT_NAME = 'mcp-proxy-hub';

export interface ProxyOAuthProviderOptions {
  serverName: string;
  serverUrl: string;
  /** Mutex to serialize browser-launching auth flows across servers. */
  serializeAuth?: <T>(fn: () => Promise<T>) => Promise<T>;
}

/**
 * OAuthClientProvider for upstream MCP servers using the loopback browser flow.
 *
 * Behavior:
 * - On first auth, performs RFC 7591 dynamic client registration.
 * - Spins up a one-shot http://127.0.0.1:<random>/callback listener.
 * - Opens the user's browser; falls back to logging the URL if it fails.
 * - Persists client info and tokens under ~/.mcp-proxy-hub/oauth/<sha16(serverUrl)>/.
 * - Refreshes tokens automatically via the SDK's refreshAuthorization helper.
 */
export class ProxyOAuthProvider implements OAuthClientProvider {
  private readonly serverName: string;
  private readonly serverUrl: string;
  private readonly serializeAuth: <T>(fn: () => Promise<T>) => Promise<T>;

  private currentLoopback?: LoopbackHandle;
  private currentRedirectUri?: string;
  private currentCodeVerifier?: string;
  private currentState?: string;
  private capturedAuthCode?: string;

  private cachedClientInfo?: OAuthClientInformationFull;
  private cachedTokens?: OAuthTokens;

  constructor(opts: ProxyOAuthProviderOptions) {
    this.serverName = opts.serverName;
    this.serverUrl = opts.serverUrl;
    this.serializeAuth = opts.serializeAuth ?? ((fn) => fn());
  }

  get redirectUrl(): string | URL | undefined {
    return this.currentRedirectUri;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: CLIENT_NAME,
      redirect_uris: this.currentRedirectUri ? [this.currentRedirectUri] : [],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    };
  }

  state(): string {
    if (!this.currentState) {
      this.currentState = randomBytes(32).toString('hex');
    }
    return this.currentState;
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    if (this.cachedClientInfo) return this.cachedClientInfo;
    const stored = await loadClientInformation(this.serverUrl);
    if (stored) {
      this.cachedClientInfo = stored;
    }
    return this.cachedClientInfo;
  }

  async saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    this.cachedClientInfo = info;
    await persistClientInformation(this.serverUrl, info);
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    if (this.cachedTokens) return this.cachedTokens;
    const stored = await loadTokens(this.serverUrl);
    if (stored) {
      this.cachedTokens = stored;
    }
    return this.cachedTokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    this.cachedTokens = tokens;
    await persistTokens(this.serverUrl, tokens);
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.currentCodeVerifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.currentCodeVerifier) {
      throw new Error('Code verifier not available; OAuth flow not initiated.');
    }
    return this.currentCodeVerifier;
  }

  async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'
  ): Promise<void> {
    if (scope === 'verifier') {
      this.currentCodeVerifier = undefined;
      return;
    }
    if (scope === 'tokens') {
      this.cachedTokens = undefined;
      // Can't selectively delete tokens.json without a separate API; refresh
      // path will persist the updated tokens. We leave the file alone.
      return;
    }
    if (scope === 'all' || scope === 'client') {
      this.cachedTokens = undefined;
      this.cachedClientInfo = undefined;
      await clearForServer(this.serverUrl);
    }
  }

  /**
   * Called by the SDK to start the user-agent authorization step. Blocks until
   * the loopback listener receives the redirect callback, then captures the
   * authorization code so the caller can pass it to transport.finishAuth().
   */
  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    if (!this.currentLoopback) {
      throw new Error('Loopback listener not initialized before redirectToAuthorization');
    }

    const expectedState = this.currentState;
    if (expectedState) {
      authorizationUrl.searchParams.set('state', expectedState);
    }

    await this.serializeAuth(async () => {
      const url = authorizationUrl.toString();
      console.log(`\n[OAuth] Authorization required for "${this.serverName}".`);
      const opened = await openBrowser(url);
      if (opened) {
        console.log(`[OAuth] Opened your browser. If it didn't open, visit:\n  ${url}\n`);
      } else {
        console.log(`[OAuth] Open this URL in your browser to authorize:\n  ${url}\n`);
      }

      const result = await this.currentLoopback!.waitForCode();
      if (expectedState && result.state !== expectedState) {
        throw new Error('OAuth callback state mismatch (possible CSRF).');
      }
      this.capturedAuthCode = result.code;
      console.log(`[OAuth] Received authorization code for "${this.serverName}".`);
    });
  }

  /** Pre-flight: bind a loopback listener so redirect_uri is known before auth(). */
  async beginAuthAttempt(): Promise<string> {
    this.currentLoopback?.close();
    this.currentLoopback = await startLoopbackServer();
    this.currentRedirectUri = this.currentLoopback.redirectUri;
    this.currentState = randomBytes(32).toString('hex');
    this.capturedAuthCode = undefined;
    return this.currentRedirectUri;
  }

  /** Cleanup the loopback listener after auth resolves or fails. */
  endAuthAttempt(): void {
    this.currentLoopback?.close();
    this.currentLoopback = undefined;
    this.currentRedirectUri = undefined;
    this.currentState = undefined;
  }

  consumeAuthCode(): string | undefined {
    const code = this.capturedAuthCode;
    this.capturedAuthCode = undefined;
    return code;
  }
}
