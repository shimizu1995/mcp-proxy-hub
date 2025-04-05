import { ServerConfig } from '../models/config.js';
import { ConnectedClient } from '../client.js';
import { toolService } from '../services/tool-service.js';
import { customToolService } from '../services/custom-tool-service.js';
import { clientMappingService } from '../services/client-mapping-service.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Handles a request to list tools from all connected clients
 */
export async function handleListToolsRequest(
  request: {
    method: 'tools/list';
    params?: {
      _meta?: {
        progressToken?: string | number;
        [key: string]: unknown;
      };
      cursor?: string;
    };
  },
  connectedClients: ConnectedClient[],
  serverConfigs: Record<string, ServerConfig>,
  toolsConfig?: {
    mcpServers: Record<string, unknown>;
    tools?: Record<
      string,
      {
        description: string;
        subtools?: Record<
          string,
          {
            tools: Array<{
              name: string;
              description?: string;
            }>;
          }
        >;
      }
    >;
  }
): Promise<{ tools: Tool[] }> {
  const tools: Tool[] = [];
  const availableTools: (Tool & { serverName: string })[] = [];

  // Clear the existing tool map
  clientMappingService.clearToolMap();

  // First, collect tools from all connected MCP servers
  for (const connectedClient of connectedClients) {
    try {
      // Get server config for tool filtering
      const serverConfig = serverConfigs[connectedClient.name];

      // Fetch tools from the client
      const clientTools = await toolService.fetchToolsFromClient(
        connectedClient,
        serverConfig,
        request.params?._meta
      );

      // Add to the tools list
      tools.push(...clientTools);

      // Keep track of all available tools for custom tool creation
      if (clientTools.length > 0) {
        availableTools.push(
          ...clientTools.map((tool) => ({ ...tool, serverName: connectedClient.name }))
        );
      }
    } catch (error) {
      console.error(`Error fetching tools from client ${connectedClient.name}:`, error);
      // Continue with other clients even if one fails
    }
  }

  // Then, add custom tools from config
  try {
    const customTools = customToolService.createCustomTools(
      toolsConfig,
      connectedClients,
      availableTools
    );
    tools.push(...customTools);
  } catch (error) {
    console.error('Error creating custom tools:', error);
  }

  return { tools };
}
