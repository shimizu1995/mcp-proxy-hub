import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ServerConfig, isStreamableHttpConfig } from './config.js';
import { clientMaps } from './mappers/client-maps.js';
import { ProxyOAuthProvider } from './auth/oauth-provider.js';
import { FetchLike } from 'eventsource';

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(() => resolve(), time));
export interface ConnectedClient {
  client: Client & {
    toolMappings?: Record<string, string>;
  };
  cleanup: () => Promise<void>;
  name: string;
}

// Connection retry configuration
const CONNECTION_RETRY_CONFIG = {
  waitFor: 2500,
  retries: 3,
};

// Serializes browser-launching OAuth flows so users only see one auth tab at a time.
let authMutex: Promise<void> = Promise.resolve();
const serializeAuth = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = authMutex.then(fn, fn);
  authMutex = next.then(
    () => undefined,
    () => undefined
  );
  return next;
};

const safeClose = async (
  client: Client | undefined,
  transport: Transport | undefined
): Promise<void> => {
  try {
    await client?.close();
  } catch {
    /* empty */
  }
  try {
    await transport?.close();
  } catch {
    /* empty */
  }
};

const createClient = (
  serverName: string,
  config: ServerConfig,
  authProvider?: ProxyOAuthProvider
): { client: Client | undefined; transport: Transport | undefined } => {
  let transport: Transport | null = null;
  try {
    if (config.type === 'sse') {
      const customFetch: FetchLike = (url: string | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (config.headers) {
          Object.entries(config.headers).forEach(([key, value]) => {
            headers.set(key, value);
          });
        }
        return fetch(url, {
          ...init,
          headers: Object.fromEntries(headers.entries()),
        });
      };
      transport = new SSEClientTransport(new URL(config.url), {
        eventSourceInit: { fetch: customFetch },
      });
    } else if (isStreamableHttpConfig(config)) {
      const configHeaders = config.headers;
      const customFetch = configHeaders
        ? (url: string | URL | Request, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            Object.entries(configHeaders).forEach(([key, value]) => {
              headers.set(key, value);
            });
            return fetch(url, {
              ...init,
              headers: Object.fromEntries(headers.entries()),
            });
          }
        : undefined;
      const opts: ConstructorParameters<typeof StreamableHTTPClientTransport>[1] = {};
      if (customFetch) opts.fetch = customFetch;
      if (authProvider) opts.authProvider = authProvider;
      transport = new StreamableHTTPClientTransport(new URL(config.url), opts);
    } else {
      console.debug(`${serverName} config: ${JSON.stringify(config, null, 2)}`);
      console.debug(`cwd is ${process.cwd()}`);
      console.debug(`command:${config.command}`);
      console.debug(`args: `, config.args);

      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      const env = {
        ...process.env,
        ...(config.env ?? {}),
      } as Record<string, string>;

      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env,
      });
    }
  } catch (error) {
    console.error(error);
    console.error(`Failed to create transport ${config.type || 'stdio'} to ${serverName}:`, error);
  }

  if (!transport) {
    console.warn(`Transport ${serverName} not available.`);
    return { transport: undefined, client: undefined };
  }

  const client = new Client(
    {
      name: 'mcp-proxy-client',
      version: '1.0.0',
    },
    {
      capabilities: {
        roots: {},
        sampling: {},
      },
    }
  );

  return { client, transport };
};

/**
 * Attempts to connect to an MCP server with retry logic.
 *
 * For streamable-http transports an OAuth provider is attached. If the upstream
 * requires OAuth, the SDK triggers a browser-based authorization-code flow on
 * the loopback interface; we catch the resulting UnauthorizedError, exchange
 * the captured code for tokens via transport.finishAuth(), and re-attempt the
 * connection once without consuming a retry slot.
 */
const connectWithRetry = async (
  serverName: string,
  config: ServerConfig,
  onConnect: (client: Client, transport: Transport) => Promise<ConnectedClient>
): Promise<ConnectedClient | null> => {
  const { waitFor, retries } = CONNECTION_RETRY_CONFIG;
  const useOAuth = isStreamableHttpConfig(config);

  let count = 0;
  let oauthRetried = false;

  while (count <= retries) {
    let authProvider: ProxyOAuthProvider | undefined;
    if (useOAuth) {
      authProvider = new ProxyOAuthProvider({
        serverName,
        serverUrl: config.url,
        serializeAuth,
      });
      await authProvider.beginAuthAttempt();
    }

    const { client, transport } = createClient(serverName, config, authProvider);
    if (!client || !transport) {
      authProvider?.endAuthAttempt();
      return null;
    }

    try {
      await client.connect(transport);
      console.log(`Connected to server: ${serverName}`);
      authProvider?.endAuthAttempt();
      return await onConnect(client, transport);
    } catch (error) {
      if (
        error instanceof UnauthorizedError &&
        authProvider &&
        !oauthRetried &&
        transport instanceof StreamableHTTPClientTransport
      ) {
        const code = authProvider.consumeAuthCode();
        if (code) {
          try {
            await transport.finishAuth(code);
            oauthRetried = true;
            authProvider.endAuthAttempt();
            await safeClose(client, transport);
            // Re-attempt immediately with the freshly persisted tokens.
            continue;
          } catch (finishErr) {
            console.error(`OAuth token exchange failed for ${serverName}:`, finishErr);
          }
        } else {
          console.error(`OAuth authorization required for ${serverName} but no code was captured.`);
        }
      }

      const errInfo =
        error instanceof Error
          ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
          : String(error);
      console.error(`Failed to connect to ${serverName}: ${errInfo}`);
      authProvider?.endAuthAttempt();
      await safeClose(client, transport);
      count++;
      if (count <= retries) {
        console.log(`Retry connect to ${serverName} in ${waitFor}ms (${count}/${retries})`);
        await sleep(waitFor);
      }
    }
  }

  return null;
};

export const getConnectedClient = (): ConnectedClient[] => {
  const clients = clientMaps.getAllClients();
  if (!clients) {
    console.warn('No connected clients found');
    return [];
  }
  return Array.from(clients);
};

export const createClients = async (
  mcpServers: Record<string, ServerConfig>
): Promise<ConnectedClient[]> => {
  const connectToServer = async (
    serverName: string,
    config: ServerConfig
  ): Promise<ConnectedClient | null> => {
    // Check if server is enabled (default to true if not specified)
    if (config.enable === false) {
      console.log(`Server ${serverName} is disabled, skipping connection`);
      return null;
    }

    console.log(`Connecting to server: ${serverName}`);

    return connectWithRetry(serverName, config, async (client, transport) => {
      const connectedClient = {
        client,
        name: serverName,
        cleanup: async () => {
          await transport.close();
        },
      };

      // Register the client in the clientMaps
      clientMaps.addConnectedClient(connectedClient);

      return connectedClient;
    });
  };

  // 並列で各サーバーへの接続を実行
  const connectionPromises = Object.entries(mcpServers).map(([serverName, config]) =>
    connectToServer(serverName, config)
  );

  // すべての接続を待機し、nullを除外
  const results = await Promise.all(connectionPromises);
  const clients = results.filter((client): client is ConnectedClient => client !== null);

  return clients;
};

/**
 * Restarts a specific client by disconnecting and reconnecting
 * @param serverName The name of the server to restart
 * @param config Server transport configuration
 * @returns The reconnected client or null if reconnection failed
 */
export const restartClient = async (
  serverName: string,
  config: ServerConfig
): Promise<ConnectedClient | null> => {
  // Check if server is enabled (default to true if not specified)
  if (config.enable === false) {
    console.log(`Server ${serverName} is disabled, skipping restart`);
    return null;
  }

  console.log(`Restarting server: ${serverName}`);

  // Find the client to restart
  const oldClient = clientMaps.getClientByName(serverName);
  if (!oldClient) {
    console.error(`Cannot find client with name: ${serverName}`);
    return null;
  }

  // Close the existing connection
  try {
    await oldClient.cleanup();
    console.log(`Disconnected from server: ${serverName}`);
  } catch (error) {
    console.error(`Error closing connection to ${serverName}:`, error);
    // Continue with reconnection attempt even if cleanup fails
  }

  // Try to reconnect
  return connectWithRetry(serverName, config, async (client, transport) => {
    const newConnectedClient: ConnectedClient = {
      client,
      name: serverName,
      cleanup: async () => {
        await transport.close();
      },
    };

    // Update the client in clientMaps
    clientMaps.updateConnectedClient(serverName, newConnectedClient);

    return newConnectedClient;
  });
};
