import { ConnectedClient, restartClient } from '../client.js';
import { clientMaps } from '../mappers/client-maps.js';
import { loadConfig } from '../config.js';
import { GetPromptResultSchema, ListPromptsResultSchema } from '@modelcontextprotocol/sdk/types.js';

type PromptType = {
  description: string;
  name: string;
  arguments?:
    | Zod.objectOutputType<
        {
          name: Zod.ZodString;
          description: Zod.ZodOptional<Zod.ZodString>;
          required: Zod.ZodOptional<Zod.ZodBoolean>;
        },
        Zod.ZodTypeAny,
        'passthrough'
      >[]
    | undefined;
};

/**
 * Handles a request to get a prompt by name
 */
export async function handleGetPromptRequest(request: {
  params: {
    name: string;
    _meta?: {
      progressToken?: string | number;
    };
    arguments?: Record<string, unknown>;
  } & { [k: string]: unknown };
  method: 'prompts/get';
}) {
  const { name } = request.params;

  // Special case for restart_server prompt
  if (name === 'restart_server') {
    return handleRestartServerPrompt(request);
  }

  const clientForPrompt = clientMaps.getClientForPrompt(name);

  if (!clientForPrompt) {
    console.error(`No client found for prompt: ${name}`);
    throw new Error(`Unknown prompt: ${name}`);
  }

  try {
    // Match the exact structure from the example code
    const response = await clientForPrompt.client.request(
      {
        method: 'prompts/get' as const,
        params: {
          name,
          arguments: request.params.arguments || {},
          _meta: request.params._meta || {
            progressToken: undefined,
          },
        },
      },
      GetPromptResultSchema
    );
    console.log(`Received prompt response for '${name}':`, response);

    return response;
  } catch (error) {
    console.error(`Error getting prompt '${name}':`, error);
    console.error(`Error getting prompt '${name}':`, error);
    throw error;
  }
}

/**
 * Handles a request to list all available prompts
 */
export async function handleListPromptsRequest(
  request: {
    params?: {
      cursor?: string | number;
      _meta?: {
        progressToken?: string | number;
      };
    };
    method: 'prompts/list';
  },
  connectedClients: ConnectedClient[]
) {
  const allPrompts: Array<PromptType> = [];

  clientMaps.clearPromptMap();

  // Add the restart_server prompt
  allPrompts.push({
    name: 'restart_server',
    description: 'Restart a specified server or all servers',
    arguments: [
      {
        name: 'server',
        description: 'The name of the server to restart, or "all" to restart all servers',
        required: true,
      },
    ],
  });

  for (const connectedClient of connectedClients) {
    try {
      const result = await connectedClient.client.request(
        {
          method: 'prompts/list' as const,
          params: {
            cursor: request.params?.cursor,
            _meta: request.params?._meta || {
              progressToken: undefined,
            },
          },
        },
        ListPromptsResultSchema
      );

      // Add server name to description for clarity
      const serverPrompts = result.prompts.map((prompt) => ({
        ...prompt,
        description: `[${connectedClient.name}] ${prompt.description}`,
      }));

      // Register prompts in the client map
      for (const prompt of serverPrompts) {
        clientMaps.mapPromptToClient(prompt.name, connectedClient);
      }

      allPrompts.push(...serverPrompts);
    } catch (error) {
      const hasErrorCode = typeof error === 'object' && error !== null && 'code' in error;
      if (!hasErrorCode || error.code !== -32601) {
        // ignore -32601 Method not found error
        console.error(`Error fetching prompts from ${connectedClient.name}:`, error);
      }
    }
  }

  return {
    prompts: allPrompts,
    nextCursor: request.params?.cursor,
  };
}

/**
 * Handler function for the restart_server prompt
 */
export async function handleRestartServerPrompt(request: {
  params: {
    name: string;
    _meta?: {
      progressToken?: string | number;
    };
    arguments?: Record<string, unknown>;
  } & { [k: string]: unknown };
  method: 'prompts/get';
}) {
  console.log('Handling restart_server prompt', request);

  // Get the server name from the arguments
  const serverName = request.params.arguments?.server;

  if (typeof serverName !== 'string') {
    throw new Error('Server name is required to restart a server');
  }

  // Load the current configuration
  const config = await loadConfig();

  try {
    if (serverName.toLowerCase() === 'all') {
      // Restart all servers
      console.log('Restarting all servers');
      const allServerRestarts = await Promise.all(
        Object.entries(config.mcpServers).map(async ([name, serverConfig]) => {
          const client = await restartClient(name, serverConfig);
          return { name, success: !!client };
        })
      );

      const successCount = allServerRestarts.filter((r) => r.success).length;

      return {
        content: `Restarted ${successCount}/${allServerRestarts.length} servers.`,
        metadata: { restarted_servers: allServerRestarts },
      };
    } else {
      // Restart a specific server
      console.log(`Restarting server: ${serverName}`);

      // Check if the server exists in the config
      const serverConfig = config.mcpServers[serverName];
      if (!serverConfig) {
        throw new Error(`Server '${serverName}' not found in configuration`);
      }

      // Restart the server
      const client = await restartClient(serverName, serverConfig);

      if (client) {
        return {
          content: `Successfully restarted server: ${serverName}`,
          metadata: { success: true, server: serverName },
        };
      } else {
        return {
          content: `Failed to restart server: ${serverName}`,
          metadata: { success: false, server: serverName },
        };
      }
    }
  } catch (error) {
    console.error('Error restarting server:', error);
    return {
      content: `Error restarting server: ${error instanceof Error ? error.message : String(error)}`,
      metadata: { success: false, error: error instanceof Error ? error.message : String(error) },
    };
  }
}
