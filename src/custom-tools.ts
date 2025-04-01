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

export type ToolWithServerName = Tool & {
  serverName: string;
};

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
  allTools: ToolWithServerName[]
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
 * @param customToolName Name of the tool
 * @param toolConfig Configuration for the tool
 * @param connectedClients Array of connected MCP clients
 * @returns Tool object or null if creation failed
 */
function createCustomTool(
  customToolName: string,
  toolConfig: ToolConfig,
  connectedClients: ConnectedClient[],
  allTools: ToolWithServerName[]
): Tool | null {
  try {
    // Create combined description from all subtools
    let description =
      toolConfig.description ??
      `Use the following tools for development. Each tool has a server name (listed after '##') and a tool name (listed after '###'). 
To execute a tool, use the following format:
{
  "server": "server_name",
  "tool": "tool_name",
  "args": {
    // Tool-specific arguments go here
  }
}
For example, to use the Edit tool from claude_code, your request would look like:
{
  "server": "claude_code",
  "tool": "Edit",
  "args": {
    "file_path": "/path/to/file",
    "old_string": "text to replace",
    "new_string": "replacement text"
  }
}`;

    // Store a map of all subtool tools for reference during tool call
    if (toolConfig.subtools) {
      description += '\n\n# Available subtools';

      // Loop through each server in subtools
      Object.entries(toolConfig.subtools).forEach(([serverName, subtool]) => {
        // Find the connected client for this server
        const client = connectedClients.find((c) => c.name === serverName);
        if (!client) {
          console.warn(
            `Server ${serverName} referenced in ${customToolName} tool config not found in connected clients`
          );
          return;
        }

        // Add server to description
        description += `\n## ${serverName}`;

        // Add each tool from this server
        subtool.tools.forEach((tool) => {
          const toolName = tool.name;

          description += `\n### ${toolName}`;

          const sameTool = allTools.find((t) => t.serverName == serverName && t.name == toolName);
          description += `\n#### description`;
          description += (() => {
            if (tool.description && tool.description.length > 0) {
              return `\n${tool.description}`;
            }

            if (sameTool) {
              return `\n${sameTool.description}`;
            }
            console.warn(
              `Tool ${toolName} not found in server ${serverName} tools, using default description`
            );
            return `\n`;
          })();

          if (sameTool) {
            // add inputSchema info
            description += `\n#### inputSchema`;
            description += `\n${JSON.stringify(sameTool.inputSchema)}\n`;
          }

          // Map the custom tool subtool to its client
          const customToolKey = `${customToolName}:${serverName}:${tool.name}`;
          customToolMaps.set(customToolKey, client);
        });
      });
    }
    // console.debug(`Custom tool ${customToolName} description:\n${description}`);

    // Add schema for tool parameters
    const tool: Tool = {
      name: customToolName,
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
    clientMaps.mapToolToClient(customToolName, customClient);

    return tool;
  } catch (error) {
    console.error(`Error creating custom tool ${customToolName}:`, error);
    return null;
  }
}

/**
 * Handles calls to a custom tool
 *
 * @param customToolName Name of the custom tool
 * @param args Arguments passed to the tool
 * @returns Result of calling the subtool
 */
export async function handleCustomToolCall(
  customToolName: string,
  requestArgs: Record<string, unknown> | undefined,
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
  if (!requestArgs) {
    throw new Error('Missing required parameters');
  }
  if (typeof requestArgs !== 'object') {
    throw new Error('Invalid arguments: arguments must be an object');
  }
  const args = requestArgs as {
    server: string;
    tool: string;
    args?: Record<string, unknown>;
  };
  if (typeof args.server !== 'string') {
    throw new Error('Invalid arguments: server must be a string');
  }
  if (typeof args.tool !== 'string') {
    throw new Error('Invalid arguments: tool must be a string');
  }

  const { server, tool, args: toolArgs = {} } = args;

  // Look up the client for this custom tool subtool
  const customToolKey = `${customToolName}:${server}:${tool}`;
  const client = customToolMaps.get(customToolKey);

  if (!client) {
    throw new Error(`Unknown subtool: ${server}/${tool} for tool ${customToolName}`);
  }

  try {
    console.log(`Forwarding ${customToolName} tool call to server ${server}, tool ${tool}`);

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
    console.error(`Error calling ${customToolName} subtool ${server}/${tool}:`, error);
    throw error;
  }
}
