import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
  Tool,
  CompatibilityCallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ConnectedClient } from '../client.js';
import { clientMaps } from '../mappers/client-maps.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { loadConfig } from '../config.js';
import { createCustomTools, handleCustomToolCall } from '../custom-tools.js';

/**
 * Registers list tools handler on the server
 */
export function registerListToolsHandler(
  server: Server,
  connectedClients: ConnectedClient[]
): void {
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const allTools: Tool[] = [];
    clientMaps.clearToolMap();

    // First, collect tools from all connected MCP servers
    for (const connectedClient of connectedClients) {
      try {
        const result = await connectedClient.client.request(
          {
            method: 'tools/list',
            params: {
              _meta: request.params?._meta,
            },
          },
          ListToolsResultSchema
        );

        if (result.tools) {
          const toolsWithSource = result.tools.map((tool) => {
            clientMaps.mapToolToClient(tool.name, connectedClient);
            return {
              ...tool,
              description: `[${connectedClient.name}] ${tool.description || ''}`,
            };
          });
          allTools.push(...toolsWithSource);
        }
      } catch (error) {
        console.error(`Error fetching tools from ${connectedClient.name}:`, error);
      }
    }

    // Then, add custom tools from config
    try {
      // TODO Don't load config here
      const config = await loadConfig();
      const customTools = createCustomTools(config, connectedClients, allTools);
      console.log('Custom tools created:', customTools);
      allTools.push(...customTools);
    } catch (error) {
      console.error('Error creating custom tools:', error);
    }

    return { tools: allTools };
  });
}

/**
 * Registers call tool handler on the server
 */
export function registerCallToolHandler(server: Server): void {
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Check if this is a custom tool
    const clientForTool = clientMaps.getClientForTool(name);

    if (clientForTool && clientForTool.name === 'custom') {
      try {
        console.log(`Handling custom tool call: ${name}`);
        return await handleCustomToolCall(name, args, request.params._meta);
      } catch (error) {
        console.error(`Error handling custom tool call for ${name}:`, error);
        throw error;
      }
    }

    // Standard tool handling for all other tools
    if (!clientForTool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      console.log('Forwarding tool call:', name);

      // Use the correct schema for tool calls
      return await clientForTool.client.request(
        {
          method: 'tools/call',
          params: {
            name,
            arguments: args || {},
            _meta: {
              progressToken: request.params._meta?.progressToken,
            },
          },
        },
        CompatibilityCallToolResultSchema
      );
    } catch (error) {
      console.error(`Error calling tool through ${clientForTool.name}:`, error);
      throw error;
    }
  });
}
