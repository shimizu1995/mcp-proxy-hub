import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ServerTransportConfig } from './config.js';

const sleep = (time: number) => new Promise<void>((resolve) => setTimeout(() => resolve(), time));
export interface ConnectedClient {
  client: Client;
  cleanup: () => Promise<void>;
  name: string;
}

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
      console.debug(`env: `, config.env);

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

export const createClients = async (
  mcpServers: Record<string, ServerTransportConfig>
): Promise<ConnectedClient[]> => {
  const connectToServer = async (
    serverName: string,
    config: ServerTransportConfig
  ): Promise<ConnectedClient | null> => {
    console.log(`Connecting to server: ${serverName}`);

    const waitFor = 2500;
    const retries = 3;
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

        return {
          client,
          name: serverName,
          cleanup: async () => {
            await transport.close();
          },
        };
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
          console.log(`Retry connection to ${serverName} in ${waitFor}ms (${count}/${retries})`);
          await sleep(waitFor);
        }
      }
    }

    return null;
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
