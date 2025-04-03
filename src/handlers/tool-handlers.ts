import {
  ListToolsResultSchema,
  Tool,
  CompatibilityCallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ConnectedClient } from '../client.js';
import { clientMaps } from '../mappers/client-maps.js';
import { loadConfig, ServerTransportConfig, ToolMapping } from '../config.js';
import { createCustomTools, handleCustomToolCall, ToolWithServerName } from './custom-tools.js';
import {
  isDebugMode,
  logCustomToolRequest,
  logCustomToolResponse,
  logCustomToolError,
  logServerToolRequest,
  logServerToolResponse,
  logServerToolError,
} from '../utils/debug-utils.js';

/**
 * Helper function to check if a tool is in the exposedTools list
 * and get its exposed name if it's remapped
 *
 * @param toolName Original tool name to check
 * @param exposedTools List of exposed tools (strings or mappings)
 * @returns Object with isExposed flag and exposedName if it's renamed
 */
function getExposedToolInfo(
  toolName: string,
  exposedTools?: (string | ToolMapping)[]
): { isExposed: boolean; exposedName?: string } {
  if (!exposedTools || exposedTools.length === 0) {
    return { isExposed: false };
  }

  // Check if tool exists in exposedTools list
  for (const entry of exposedTools) {
    // Case 1: Simple string entry
    if (typeof entry === 'string') {
      if (entry === toolName) {
        return { isExposed: true }; // Use original name
      }
    }
    // Case 2: Tool mapping object
    else if (entry.original === toolName) {
      return { isExposed: true, exposedName: entry.exposed };
    }
  }

  return { isExposed: false };
}

/**
 * Filters tools based on exposedTools and hiddenTools configuration
 * and applies name remapping if configured
 *
 * @param tools Array of tools to filter
 * @param serverConfig Configuration for the server
 * @returns Filtered and potentially renamed array of tools
 */
function filterTools(
  tools: Tool[],
  serverConfig?: ServerTransportConfig
): (Tool & {
  originalName?: string;
})[] {
  if (!serverConfig) {
    return tools;
  }

  const { exposedTools, hiddenTools } = serverConfig;

  // If exposedTools is defined, filter and potentially rename tools
  if (exposedTools != null) {
    return tools
      .map((tool) => {
        const { isExposed, exposedName } = getExposedToolInfo(tool.name, exposedTools);

        if (!isExposed) return null; // Tool not exposed

        // If tool has a new name, create a copy with the new name
        if (exposedName) {
          return {
            ...tool,
            name: exposedName,
            originalName: tool.name, // Store original name for internal use
          };
        }

        return tool; // Keep original tool
      })
      .filter((tool): tool is Tool => tool !== null); // Remove null entries
  }

  // If hiddenTools is defined, exclude tools in that list
  if (hiddenTools != null) {
    return tools.filter((tool) => !hiddenTools.includes(tool.name));
  }

  // No filtering if neither exposedTools nor hiddenTools is defined
  return tools;
}

/**
 * Handles a request to list tools from all connected clients
 *
 * @param request The list tools request object
 * @param connectedClients Array of connected clients to fetch tools from
 * @returns An object containing the list of aggregated tools
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
  connectedClients: ConnectedClient[]
): Promise<{ tools: Tool[] }> {
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
          // Map the tool to client
          clientMaps.mapToolToClient(tool.name, connectedClient);

          // Store the original name mapping in the client if needed
          if (tool.originalName) {
            if (!connectedClient.client.toolMappings) {
              connectedClient.client.toolMappings = {};
            }
            connectedClient.client.toolMappings[tool.name] = tool.originalName;
          }

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

  // Then, add custom tools from config
  try {
    // We've already loaded the config above, so reuse it
    const customTools = createCustomTools(config, connectedClients, availableTools);
    tools.push(...customTools);
  } catch (error) {
    console.error('Error creating custom tools:', error);
  }

  return { tools };
}

/**
 * Handles tool call requests
 *
 * @param request The tool call request
 * @returns The result of the tool call
 */
export async function handleToolCall(request: {
  params: {
    name: string;
    _meta?: {
      progressToken?: string | number;
    };
    arguments?: Record<string, unknown>;
  } & { [k: string]: unknown };
  method: 'tools/call';
}) {
  const { name: toolName, arguments: args } = request.params;
  const config = await loadConfig();

  // Get the client for this tool
  const clientForTool = clientMaps.getClientForTool(toolName);

  // Find the original name mapping from the client if it exists
  let originalToolName: string | undefined;
  if (clientForTool?.client.toolMappings) {
    originalToolName = clientForTool.client.toolMappings[toolName];

    if (isDebugMode()) {
      if (originalToolName) {
        console.debug(`Tool ${toolName} is remapped to original name ${originalToolName}`);
      } else {
        console.debug(`Tool ${toolName} has no remapping`);
      }
    }
  } else if (isDebugMode()) {
    console.debug(`Tool ${toolName} has no remapping`);
  }

  if (clientForTool && clientForTool.name === 'custom') {
    // TODO: nameで判定しないようにする
    try {
      logCustomToolRequest(toolName, args);

      const result = await handleCustomToolCall(toolName, args, request.params._meta);

      logCustomToolResponse(result);

      return result;
    } catch (error) {
      logCustomToolError(toolName, error);
      throw error;
    }
  }

  // Standard tool handling for all other tools
  if (!clientForTool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // Validate tool access based on exposedTools and hiddenTools
  const serverConfig = config.mcpServers[clientForTool.name];
  if (serverConfig) {
    // If exposedTools is defined, check if the tool is in the list
    if (serverConfig.exposedTools && serverConfig.exposedTools.length > 0) {
      // First check if name is directly exposed
      const toolInfo = getExposedToolInfo(originalToolName ?? toolName, serverConfig.exposedTools);
      if (!toolInfo.isExposed) {
        throw new Error(`Tool ${toolName} is not exposed by server ${clientForTool.name}`);
      }
    }

    // If hiddenTools is defined, check if the tool is not in the list
    if (serverConfig.hiddenTools && serverConfig.hiddenTools.length > 0) {
      if (serverConfig.hiddenTools.includes(originalToolName ?? toolName)) {
        throw new Error(`Tool ${toolName} is hidden on server ${clientForTool.name}`);
      }
    }
  }

  try {
    // Prepare the request object for better visibility
    const requestObj = {
      method: 'tools/call',
      params: {
        name: originalToolName ?? toolName,
        arguments: args || {},
        _meta: {
          progressToken: request.params._meta?.progressToken,
        },
      },
    };

    logServerToolRequest(toolName, clientForTool.name, requestObj);

    // Use the correct schema for tool calls
    const result = await clientForTool.client.request(
      requestObj,
      CompatibilityCallToolResultSchema
    );

    logServerToolResponse(toolName, result);

    return result;
  } catch (error) {
    logServerToolError(toolName, clientForTool.name, error);
    throw error;
  }
}
