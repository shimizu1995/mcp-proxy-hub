import { describe, it, expect } from 'vitest';
import { startLoopbackServer } from './loopback-server.js';

describe('loopback-server', () => {
  it('binds to a random port and exposes a redirectUri', async () => {
    const handle = await startLoopbackServer();
    try {
      expect(handle.port).toBeGreaterThan(0);
      expect(handle.redirectUri).toBe(`http://127.0.0.1:${handle.port}/callback`);
    } finally {
      handle.close();
    }
  });

  it('captures code and state from the callback', async () => {
    const handle = await startLoopbackServer();
    const codePromise = handle.waitForCode();

    await fetch(`${handle.redirectUri}?code=abc123&state=xyz`);
    const result = await codePromise;
    expect(result.code).toBe('abc123');
    expect(result.state).toBe('xyz');
  });

  it('rejects when the auth server returns an error', async () => {
    const handle = await startLoopbackServer();
    const codePromise = handle.waitForCode();
    codePromise.catch(() => {});

    await fetch(`${handle.redirectUri}?error=access_denied&error_description=user+declined`);
    await expect(codePromise).rejects.toThrow(/access_denied|user declined/);
  });

  it('rejects when callback path is hit without a code', async () => {
    const handle = await startLoopbackServer();
    const codePromise = handle.waitForCode();
    codePromise.catch(() => {});

    await fetch(`${handle.redirectUri}?foo=bar`);
    await expect(codePromise).rejects.toThrow(/missing code/i);
  });

  it('returns 404 for unknown paths and keeps waiting', async () => {
    const handle = await startLoopbackServer();
    const codePromise = handle.waitForCode();

    const res = await fetch(`http://127.0.0.1:${handle.port}/somewhere-else`);
    expect(res.status).toBe(404);

    await fetch(`${handle.redirectUri}?code=ok`);
    const result = await codePromise;
    expect(result.code).toBe('ok');
  });
});
