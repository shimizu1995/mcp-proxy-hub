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
import { loadConfig, ServerTransportConfig } from '../config.js';
import { createCustomTools, handleCustomToolCall, ToolWithServerName } from '../custom-tools.js';

/**
 * Filters tools based on exposedTools and hiddenTools configuration
 *
 * @param tools Array of tools to filter
 * @param serverConfig Configuration for the server
 * @returns Filtered array of tools
 */
function filterTools(tools: Tool[], serverConfig?: ServerTransportConfig): Tool[] {
  if (!serverConfig) {
    return tools;
  }

  const { exposedTools, hiddenTools } = serverConfig;

  // If exposedTools is defined, only include tools in that list
  if (exposedTools != null) {
    return tools.filter((tool) => exposedTools.includes(tool.name));
  }

  // If hiddenTools is defined, exclude tools in that list
  if (hiddenTools != null) {
    return tools.filter((tool) => !hiddenTools.includes(tool.name));
  }

  // No filtering if neither exposedTools nor hiddenTools is defined
  return tools;
}

/**
 * Registers list tools handler on the server
 */
export function registerListToolsHandler(
  server: Server,
  connectedClients: ConnectedClient[]
): void {
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const tools: Tool[] = [];
    const availableTools: ToolWithServerName[] = [];
    clientMaps.clearToolMap();

    // Load config to access exposedTools and hiddenTools settings
    const config = await loadConfig();

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
          // Get server config for tool filtering
          const serverConfig = config.mcpServers[connectedClient.name];
          availableTools.push(
            ...result.tools.map((tool) => ({ ...tool, serverName: connectedClient.name }))
          );

          // Filter tools based on exposedTools and hiddenTools
          const filteredTools = filterTools(result.tools, serverConfig);

          const toolsWithSource = filteredTools.map((tool) => {
            clientMaps.mapToolToClient(tool.name, connectedClient);
            return {
              ...tool,
              description: `[${connectedClient.name}] ${tool.description || ''}`,
            };
          });
          tools.push(...toolsWithSource);
        }
      } catch (error) {
        console.error(`Error fetching tools from ${connectedClient.name}:`, error);
      }
    }

    // for (const tool of availableTools) {
    //   console.debug(
    //     `Tool: ${tool.name}, Server: ${tool.serverName}`,
    //     JSON.stringify(tool, null, 2)
    //   );
    // }

    // Then, add custom tools from config
    try {
      // We've already loaded the config above, so reuse it
      const customTools = createCustomTools(config, connectedClients, availableTools);
      // console.debug('Custom tools created:', customTools);
      tools.push(...customTools);
    } catch (error) {
      console.error('Error creating custom tools:', error);
    }

    return { tools };
  });
}

/**
 * Registers call tool handler on the server
 */
export function registerCallToolHandler(server: Server): void {
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const config = await loadConfig();

    // Check if this is a custom tool
    const clientForTool = clientMaps.getClientForTool(name);

    if (clientForTool && clientForTool.name === 'custom') {
      try {
        console.log(`Handling custom tool call: ${name}`);
        console.log('Arguments:', args);
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

    // Validate tool access based on exposedTools and hiddenTools
    const serverConfig = config.mcpServers[clientForTool.name];
    if (serverConfig) {
      // If exposedTools is defined, check if the tool is in the list
      if (serverConfig.exposedTools && serverConfig.exposedTools.length > 0) {
        if (!serverConfig.exposedTools.includes(name)) {
          throw new Error(`Tool ${name} is not exposed by server ${clientForTool.name}`);
        }
      }

      // If hiddenTools is defined, check if the tool is not in the list
      if (serverConfig.hiddenTools && serverConfig.hiddenTools.length > 0) {
        if (serverConfig.hiddenTools.includes(name)) {
          throw new Error(`Tool ${name} is hidden on server ${clientForTool.name}`);
        }
      }
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
