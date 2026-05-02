import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { homedir, tmpdir } from 'os';
import { join, dirname } from 'path';
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';

export interface PersistedDiscovery {
  authorizationServerUrl: string;
  resourceMetadataUrl?: string;
  authorizationServerMetadata?: unknown;
  resourceMetadata?: unknown;
}

const safeHomedir = (): string => {
  try {
    const home = homedir();
    if (typeof home === 'string' && home.length > 0) return home;
  } catch {
    /* fall through */
  }
  // Sandboxed environments (some MCP host launchers) may strip $HOME and
  // leave getpwuid_r() with no entry, making os.homedir() unusable. Fall
  // back to tmpdir so token persistence still works for the session.
  return tmpdir();
};

const baseDir = (): string => {
  const override = process.env.MCP_PROXY_OAUTH_DIR;
  if (typeof override === 'string' && override.length > 0) return override;
  return join(safeHomedir(), '.mcp-proxy-hub', 'oauth');
};

export const serverKey = (serverUrl: string): string =>
  createHash('sha256').update(serverUrl).digest('hex').slice(0, 16);

const serverDir = (serverUrl: string): string => join(baseDir(), serverKey(serverUrl));

const filePaths = (serverUrl: string) => {
  const dir = serverDir(serverUrl);
  return {
    dir,
    client: join(dir, 'client.json'),
    tokens: join(dir, 'tokens.json'),
    discovery: join(dir, 'discovery.json'),
  };
};

const isErrnoException = (err: unknown): err is NodeJS.ErrnoException =>
  err instanceof Error && 'code' in err;

const readJson = async <T>(path: string): Promise<T | undefined> => {
  try {
    const data = await fs.readFile(path, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return undefined;
    // Any other failure (corrupt JSON, permission denied, missing home) must
    // not crash the connect path: behave as if no state has been persisted.
    console.warn(`Failed to read ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
};

const writeJsonSecure = async (path: string, value: unknown): Promise<void> => {
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(tmp, path);
};

export const loadClientInformation = (
  serverUrl: string
): Promise<OAuthClientInformationFull | undefined> =>
  readJson<OAuthClientInformationFull>(filePaths(serverUrl).client);

export const saveClientInformation = (
  serverUrl: string,
  info: OAuthClientInformationFull
): Promise<void> => writeJsonSecure(filePaths(serverUrl).client, info);

export const loadTokens = (serverUrl: string): Promise<OAuthTokens | undefined> =>
  readJson<OAuthTokens>(filePaths(serverUrl).tokens);

export const saveTokens = (serverUrl: string, tokens: OAuthTokens): Promise<void> =>
  writeJsonSecure(filePaths(serverUrl).tokens, tokens);

export const loadDiscovery = (serverUrl: string): Promise<PersistedDiscovery | undefined> =>
  readJson<PersistedDiscovery>(filePaths(serverUrl).discovery);

export const saveDiscovery = (serverUrl: string, state: PersistedDiscovery): Promise<void> =>
  writeJsonSecure(filePaths(serverUrl).discovery, state);

export const clearForServer = async (serverUrl: string): Promise<boolean> => {
  const { dir } = filePaths(serverUrl);
  try {
    await fs.rm(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
};

export const clearAll = async (): Promise<void> => {
  await fs.rm(baseDir(), { recursive: true, force: true });
};

export const listCachedServers = async (): Promise<string[]> => {
  try {
    const entries = await fs.readdir(baseDir(), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') return [];
    throw err;
  }
};
