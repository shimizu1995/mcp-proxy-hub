import { CompatibilityCallToolResultSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import { ConnectedClient } from './client.js';
import { z } from 'zod';
import { Config, ToolConfig } from './config.js';
import { clientMaps } from './mappers/client-maps.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const customClient: ConnectedClient = {
  client: new Client({
    name: 'custom-client',
    version: '1.0.0',
  }),
  name: 'custom',
  cleanup: async () => {
    // Perform any cleanup operations if needed
  },
};

// Maps custom tool subtool names to their clients
// Format: "toolName:serverName:toolName" -> ConnectedClient
export const customToolMaps = new Map<string, ConnectedClient>();

/**
 * Creates custom tools defined in the config file
 *
 * @param config Config object containing tools definitions
 * @param connectedClients Array of connected MCP clients
 * @returns Array of Tool objects for the custom tools
 */
export function createCustomTools(
  config: Config,
  connectedClients: ConnectedClient[],
  allTools: Tool[]
): Tool[] {
  const customTools: Tool[] = [];

  // Return early if no tools are defined in config
  if (!config.tools) {
    return customTools;
  }

  // Process all tools defined in config
  Object.entries(config.tools).forEach(([toolName, toolConfig]) => {
    // Create the custom tool
    const tool = createCustomTool(toolName, toolConfig, connectedClients, allTools);
    if (tool) {
      customTools.push(tool);
    }
  });

  return customTools;
}

/**
 * Creates a single custom tool based on its config
 *
 * @param toolName Name of the tool
 * @param toolConfig Configuration for the tool
 * @param connectedClients Array of connected MCP clients
 * @returns Tool object or null if creation failed
 */
function createCustomTool(
  toolName: string,
  toolConfig: ToolConfig,
  connectedClients: ConnectedClient[],
  allTools: Tool[]
): Tool | null {
  try {
    // Create combined description from all subtools
    let description = toolConfig.description || `Execute ${toolName} commands`;

    // Store a map of all subtool tools for reference during tool call
    if (toolConfig.subtools) {
      description += '\n\n## Available subtools';

      // Loop through each server in subtools
      Object.entries(toolConfig.subtools).forEach(([serverName, subtool]) => {
        // Find the connected client for this server
        const client = connectedClients.find((c) => c.name === serverName);
        if (!client) {
          console.warn(
            `Server ${serverName} referenced in ${toolName} tool config not found in connected clients`
          );
          return;
        }

        // Add server to description
        description += `\n### ${serverName} server`;

        // Add each tool from this server
        subtool.tools.forEach((tool) => {
          const toolName = tool.name;

          description += (() => {
            if (tool.description && tool.description.length > 0) {
              return `\n- ${tool.name}: ${tool.description}`;
            }

            const sameTool = allTools.find((t) => t.name === toolName);
            if (sameTool) {
              return `\n- ${tool.name}: ${sameTool.description}`;
            }
            return `\n- ${tool.name}`;
          })();

          // Map the custom tool subtool to its client
          const customToolKey = `${toolName}:${serverName}:${tool.name}`;
          customToolMaps.set(customToolKey, client);
        });
      });
    }

    // Add schema for tool parameters
    const tool: Tool = {
      name: toolName,
      description,
      inputSchema: {
        type: 'object',
        properties: {
          server: {
            type: 'string',
            description: 'The server name to execute the tool on',
          },
          tool: {
            type: 'string',
            description: 'The tool name to execute',
          },
          args: {
            type: 'object',
            description: 'Arguments to pass to the tool',
            additionalProperties: true,
          },
        },
        required: ['server', 'tool'],
      },
    };

    // Map tool name to itself (custom tool is handled specially)
    clientMaps.mapToolToClient(toolName, customClient);

    return tool;
  } catch (error) {
    console.error(`Error creating custom tool ${toolName}:`, error);
    return null;
  }
}

/**
 * Handles calls to a custom tool
 *
 * @param toolName Name of the custom tool
 * @param args Arguments passed to the tool
 * @returns Result of calling the subtool
 */
export async function handleCustomToolCall(
  toolName: string,
  args: Record<string, unknown> | undefined,
  meta?:
    | z.objectOutputType<
        {
          progressToken: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodNumber]>>;
        },
        z.ZodTypeAny,
        'passthrough'
      >
    | undefined
) {
  const {
    server,
    tool,
    args: toolArgs = {},
  } = args as {
    server: string;
    tool: string;
    args?: Record<string, unknown>;
  };

  if (!server || !tool) {
    throw new Error('Missing required parameters: server and tool must be specified');
  }

  // Look up the client for this custom tool subtool
  const customToolKey = `${toolName}:${server}:${tool}`;
  const client = customToolMaps.get(customToolKey);

  if (!client) {
    throw new Error(`Unknown subtool: ${server}/${tool} for tool ${toolName}`);
  }

  try {
    console.log(`Forwarding ${toolName} tool call to server ${server}, tool ${tool}`);

    // Call the actual tool on the target server
    return await client.client.request(
      {
        method: 'tools/call',
        params: {
          name: tool,
          arguments: toolArgs,
          _meta: {
            progressToken: meta?.progressToken,
          },
        },
      },
      CompatibilityCallToolResultSchema
    );
  } catch (error) {
    console.error(`Error calling ${toolName} subtool ${server}/${tool}:`, error);
    throw error;
  }
}
