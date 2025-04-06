import { ConnectedClient } from '../client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { clientMaps } from '../mappers/client-maps.js';
import { CompatibilityCallToolResultSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  logCustomToolRequest,
  logCustomToolResponse,
  logCustomToolError,
} from '../utils/debug-utils.js';
import { ToolConfig } from '../config.js';

// Custom client for handling custom tools
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

export type ToolWithServerName = Tool & {
  serverName: string;
};

export class CustomToolService {
  /**
   * Creates custom tools based on configuration
   */
  public createCustomTools(
    config:
      | { mcpServers?: Record<string, unknown>; tools?: Record<string, ToolConfig> }
      | undefined,
    connectedClients: ConnectedClient[],
    allTools: ToolWithServerName[]
  ): Tool[] {
    const customTools: Tool[] = [];

    if (!config || !config.tools) {
      return customTools;
    }

    Object.entries(config.tools).forEach(([toolName, toolConfig]) => {
      try {
        const tool = this.createCustomTool(toolName, toolConfig, connectedClients, allTools);
        if (tool) {
          customTools.push(tool);
        }
      } catch (error) {
        console.error(`Error creating custom tool ${toolName}:`, error);
        // Continue processing other tools even if one fails
      }
    });

    return customTools;
  }

  /**
   * Creates a single custom tool
   */
  private createCustomTool(
    customToolName: string,
    toolConfig: ToolConfig,
    connectedClients: ConnectedClient[],
    allTools: ToolWithServerName[]
  ): Tool | null {
    try {
      // Default description template
      let description = toolConfig.description ?? this.getDefaultDescription();

      // Add subtools information if available
      if (toolConfig.subtools) {
        description += '\n\n# Available subtools';

        Object.entries(toolConfig.subtools).forEach(([serverName, subtool]) => {
          const client = connectedClients.find((c) => c.name === serverName);
          if (!client) {
            console.warn(
              `Server ${serverName} referenced in ${customToolName} tool config not found in connected clients`
            );
            // Continue processing instead of returning, adding the warning to the description
            description += `\n*Warning: Server ${serverName} not found in connected clients*`;
          }

          // Add server to description
          description += `\n## ${serverName}`;

          // Add each tool from this server
          subtool.tools.forEach((tool) => {
            const toolName = tool.name;

            description += `\n### ${toolName}`;

            // Add tool description
            description += `\n#### description`;
            description += this.getToolDescription(tool, serverName, toolName, allTools);

            // Add inputSchema if available
            const sameTool = allTools.find(
              (t) => t.serverName === serverName && t.name === toolName
            );
            if (sameTool) {
              description += `\n#### inputSchema`;
              description += `\n${JSON.stringify(sameTool.inputSchema)}\n`;
            }

            // Map the custom tool subtool to its client if client exists
            if (client) {
              const customToolKey = `${customToolName}:${serverName}:${toolName}`;
              clientMaps.mapCustomToolToClient(customToolKey, client);
            }
          });
        });
      }

      // Create the tool object
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

      // Map the custom tool name to the custom client
      // First check if we already have this tool registered to avoid duplicate errors
      try {
        clientMaps.mapToolToClient(customToolName, customClient);
      } catch (error) {
        console.warn(`Tool ${customToolName} registration error:`, error);
        // Continue anyway as we've updated the mapToolToClient method to handle duplicates
      }

      return tool;
    } catch (error) {
      console.error(`Error creating custom tool ${customToolName}:`, error);
      return null;
    }
  }

  /**
   * Gets the default description for a custom tool
   */
  private getDefaultDescription(): string {
    return `Use the following tools for development. Each tool has a server name (listed after '##') and a tool name (listed after '###'). 
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
  }

  /**
   * Gets the description for a tool
   */
  private getToolDescription(
    tool: { name: string; description?: string },
    serverName: string,
    toolName: string,
    allTools: ToolWithServerName[]
  ): string {
    if (tool.description && tool.description.length > 0) {
      return `\n${tool.description}`;
    }

    const sameTool = allTools.find((t) => t.serverName === serverName && t.name === toolName);
    if (sameTool) {
      return `\n${sameTool.description}`;
    }

    console.warn(
      `Tool ${toolName} not found in server ${serverName} tools, using default description`
    );
    return `\n`;
  }

  /**
   * Handles a custom tool call
   */
  public async handleCustomToolCall(
    customToolName: string,
    requestArgs: Record<string, unknown> | undefined,
    meta?: { progressToken?: string | number }
  ) {
    if (!requestArgs) {
      throw new Error('Missing required parameters');
    }

    if (typeof requestArgs !== 'object') {
      throw new Error('Invalid arguments: arguments must be an object');
    }

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const args = requestArgs as {
      server: string;
      tool: string;
      args?: Record<string, unknown>;
    };

    this.validateCustomToolArgs(args);

    const { server, tool, args: toolArgs = {} } = args;

    // Look up the client for this custom tool subtool
    const customToolKey = `${customToolName}:${server}:${tool}`;
    const client = clientMaps.getClientForCustomTool(customToolKey);

    if (!client) {
      throw new Error(`Unknown subtool: ${server}/${tool} for tool ${customToolName}`);
    }

    try {
      logCustomToolRequest(customToolName, args);

      console.log(`Forwarding ${customToolName} tool call to server ${server}, tool ${tool}`);

      // Call the actual tool on the target server
      const result = await client.client.request(
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

      logCustomToolResponse(result);

      return result;
    } catch (error) {
      logCustomToolError(customToolName, error);
      console.error(`Error calling ${customToolName} subtool ${server}/${tool}:`, error);
      throw error;
    }
  }

  /**
   * Validates custom tool arguments
   */
  private validateCustomToolArgs(args: {
    server?: string;
    tool?: string;
    args?: Record<string, unknown>;
  }): void {
    if (typeof args.server !== 'string') {
      throw new Error('Invalid arguments: server must be a string');
    }
    if (typeof args.tool !== 'string') {
      throw new Error('Invalid arguments: tool must be a string');
    }
  }

  /**
   * Gets the custom client
   */
  public getCustomClient(): ConnectedClient {
    return customClient;
  }
}

// Export a singleton instance
export const customToolService = new CustomToolService();
