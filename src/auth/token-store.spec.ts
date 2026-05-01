import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  serverKey,
  loadClientInformation,
  loadTokens,
  saveClientInformation,
  saveTokens,
  clearForServer,
  loadDiscovery,
  saveDiscovery,
} from './token-store.js';

describe('token-store', () => {
  const url = 'https://example.com/mcp';
  let originalDir: string | undefined;
  let testDir: string;

  beforeEach(async () => {
    originalDir = process.env.MCP_PROXY_OAUTH_DIR;
    testDir = await fs.mkdtemp(join(tmpdir(), 'mcp-proxy-token-store-'));
    process.env.MCP_PROXY_OAUTH_DIR = testDir;
  });

  afterEach(async () => {
    if (originalDir === undefined) {
      delete process.env.MCP_PROXY_OAUTH_DIR;
    } else {
      process.env.MCP_PROXY_OAUTH_DIR = originalDir;
    }
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('produces a stable 16-char hex key for a URL', () => {
    const key = serverKey(url);
    expect(key).toMatch(/^[a-f0-9]{16}$/);
    expect(serverKey(url)).toBe(key);
    expect(serverKey('https://other.example/')).not.toBe(key);
  });

  it('returns undefined when no client info has been saved', async () => {
    expect(await loadClientInformation(url)).toBeUndefined();
  });

  it('persists and loads client information', async () => {
    const info = {
      client_id: 'cid',
      client_secret: 'sec',
      redirect_uris: ['http://127.0.0.1:1234/callback'],
    };
    await saveClientInformation(url, info);
    expect(await loadClientInformation(url)).toEqual(info);
  });

  it('persists and loads tokens', async () => {
    const tokens = { access_token: 'a', token_type: 'Bearer', refresh_token: 'r' };
    await saveTokens(url, tokens);
    expect(await loadTokens(url)).toEqual(tokens);
  });

  it('persists and loads discovery state', async () => {
    const discovery = {
      authorizationServerUrl: 'https://auth.example.com',
      resourceMetadataUrl: 'https://example.com/.well-known/oauth-protected-resource',
    };
    await saveDiscovery(url, discovery);
    expect(await loadDiscovery(url)).toEqual(discovery);
  });

  it('clearForServer removes only the targeted server directory', async () => {
    await saveTokens(url, { access_token: 'a', token_type: 'Bearer' });
    const otherUrl = 'https://other.example.com/mcp';
    await saveTokens(otherUrl, { access_token: 'b', token_type: 'Bearer' });

    expect(await clearForServer(url)).toBe(true);
    expect(await loadTokens(url)).toBeUndefined();
    expect(await loadTokens(otherUrl)).toBeDefined();
  });
});
