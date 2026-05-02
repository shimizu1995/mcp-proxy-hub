import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProxyOAuthProvider } from './oauth-provider.js';

vi.mock('./browser.js', () => ({
  openBrowser: vi.fn(async () => true),
}));

describe('ProxyOAuthProvider', () => {
  let originalDir: string | undefined;
  let testDir: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    originalDir = process.env.MCP_PROXY_OAUTH_DIR;
    testDir = await fs.mkdtemp(join(tmpdir(), 'mcp-proxy-provider-'));
    process.env.MCP_PROXY_OAUTH_DIR = testDir;
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    if (originalDir === undefined) {
      delete process.env.MCP_PROXY_OAUTH_DIR;
    } else {
      process.env.MCP_PROXY_OAUTH_DIR = originalDir;
    }
    await fs.rm(testDir, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
  });

  it('beginAuthAttempt binds a loopback and exposes a redirect URI', async () => {
    const provider = new ProxyOAuthProvider({
      serverName: 'test',
      serverUrl: 'https://example.com/mcp',
    });
    const redirectUri = await provider.beginAuthAttempt();
    try {
      expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
      expect(provider.redirectUrl).toBe(redirectUri);
      expect(provider.clientMetadata.redirect_uris).toEqual([redirectUri]);
      expect(provider.clientMetadata.grant_types).toContain('authorization_code');
      expect(provider.clientMetadata.response_types).toContain('code');
    } finally {
      provider.endAuthAttempt();
    }
  });

  it('persists and reloads tokens across instances', async () => {
    const a = new ProxyOAuthProvider({
      serverName: 'a',
      serverUrl: 'https://example.com/mcp',
    });
    await a.saveTokens({ access_token: 'token1', token_type: 'Bearer' });

    const b = new ProxyOAuthProvider({
      serverName: 'a',
      serverUrl: 'https://example.com/mcp',
    });
    expect(await b.tokens()).toEqual({ access_token: 'token1', token_type: 'Bearer' });
  });

  it('persists and reloads client information across instances', async () => {
    const a = new ProxyOAuthProvider({
      serverName: 'a',
      serverUrl: 'https://example.com/mcp',
    });
    await a.saveClientInformation({
      client_id: 'cid',
      redirect_uris: ['http://127.0.0.1:1/callback'],
    });

    const b = new ProxyOAuthProvider({
      serverName: 'a',
      serverUrl: 'https://example.com/mcp',
    });
    const info = await b.clientInformation();
    expect(info?.client_id).toBe('cid');
  });

  it('codeVerifier round-trips via saveCodeVerifier', () => {
    const provider = new ProxyOAuthProvider({
      serverName: 'a',
      serverUrl: 'https://example.com/mcp',
    });
    provider.saveCodeVerifier('verifier-123');
    expect(provider.codeVerifier()).toBe('verifier-123');
  });

  it('throws if codeVerifier is requested before being saved', () => {
    const provider = new ProxyOAuthProvider({
      serverName: 'a',
      serverUrl: 'https://example.com/mcp',
    });
    expect(() => provider.codeVerifier()).toThrow(/Code verifier/);
  });

  it('redirectToAuthorization captures the code from the loopback', async () => {
    const provider = new ProxyOAuthProvider({
      serverName: 'test',
      serverUrl: 'https://example.com/mcp',
    });
    const redirectUri = await provider.beginAuthAttempt();
    try {
      const authUrl = new URL('https://auth.example.com/authorize');
      const flow = provider.redirectToAuthorization(authUrl);

      // SDK appends state via saveTokens flow; provider augments with state too.
      // Wait a tick so the listener is ready, then post the callback.
      await new Promise((r) => setImmediate(r));

      const expectedState = authUrl.searchParams.get('state');
      expect(expectedState).toBeTruthy();

      await fetch(`${redirectUri}?code=AUTHCODE&state=${expectedState}`);
      await flow;

      expect(provider.consumeAuthCode()).toBe('AUTHCODE');
      // consumeAuthCode is single-use
      expect(provider.consumeAuthCode()).toBeUndefined();
    } finally {
      provider.endAuthAttempt();
    }
  });

  it('redirectToAuthorization rejects on state mismatch', async () => {
    const provider = new ProxyOAuthProvider({
      serverName: 'test',
      serverUrl: 'https://example.com/mcp',
    });
    const redirectUri = await provider.beginAuthAttempt();
    try {
      const authUrl = new URL('https://auth.example.com/authorize');
      const flow = provider.redirectToAuthorization(authUrl);
      flow.catch(() => {});
      await new Promise((r) => setImmediate(r));

      await fetch(`${redirectUri}?code=AUTHCODE&state=wrong`);
      await expect(flow).rejects.toThrow(/state mismatch/i);
    } finally {
      provider.endAuthAttempt();
    }
  });

  it('invalidateCredentials("all") clears persisted state', async () => {
    const provider = new ProxyOAuthProvider({
      serverName: 'test',
      serverUrl: 'https://example.com/mcp',
    });
    await provider.saveTokens({ access_token: 'a', token_type: 'Bearer' });
    await provider.saveClientInformation({
      client_id: 'cid',
      redirect_uris: ['http://127.0.0.1:1/callback'],
    });

    await provider.invalidateCredentials('all');

    const fresh = new ProxyOAuthProvider({
      serverName: 'test',
      serverUrl: 'https://example.com/mcp',
    });
    expect(await fresh.tokens()).toBeUndefined();
    expect(await fresh.clientInformation()).toBeUndefined();
  });
});
