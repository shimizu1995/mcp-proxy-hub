import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ServerTransportConfig } from './config.js';
import { clientMaps } from './mappers/client-maps.js';

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

const createClient = (
  serverName: string,
  config: ServerTransportConfig
): { client: Client | undefined; transport: Transport | undefined } => {
  let transport: Transport | null = null;
  try {
    if (config.type === 'sse') {
      transport = new SSEClientTransport(new URL(config.url));
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
        prompts: {},
        resources: { subscribe: true },
        tools: {},
      },
    }
  );

  return { client, transport };
};

/**
 * Attempts to connect to an MCP server with retry logic
 * @param serverName The name of the server to connect to
 * @param config Server transport configuration
 * @param onConnect Callback function to execute on successful connection
 * @returns The connected client or null if connection failed
 */
const connectWithRetry = async (
  serverName: string,
  config: ServerTransportConfig,
  onConnect: (client: Client, transport: Transport) => Promise<ConnectedClient>
): Promise<ConnectedClient | null> => {
  const { waitFor, retries } = CONNECTION_RETRY_CONFIG;
  let count = 0;
  let retry = true;

  while (retry) {
    const { client, transport } = createClient(serverName, config);
    if (!client || !transport) {
      return null;
    }

    try {
      await client.connect(transport);
      console.log(`Connected to server: ${serverName}`);

      return await onConnect(client, transport);
    } catch (error) {
      console.error(`Failed to connect to ${serverName}:`, error);
      count++;
      retry = count < retries;
      if (retry) {
        try {
          await client.close();
        } catch {
          /* empty */
        }
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
  mcpServers: Record<string, ServerTransportConfig>
): Promise<ConnectedClient[]> => {
  const connectToServer = async (
    serverName: string,
    config: ServerTransportConfig
  ): Promise<ConnectedClient | null> => {
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
  config: ServerTransportConfig
): Promise<ConnectedClient | null> => {
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
