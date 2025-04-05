import { ServerConfig } from '../models/config.js';
import { ConnectedClient } from '../client.js';
import { clientMappingService } from './client-mapping-service.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

export class ToolService {
  /**
   * Fetch tools from a client
   */
  async fetchToolsFromClient(
    connectedClient: ConnectedClient,
    serverConfig?: ServerConfig,
    meta?: Record<string, unknown>
  ): Promise<Tool[]> {
    try {
      // Request tools from the client
      // @ts-expect-error - SDK request typing issues
      const response = await connectedClient.client.request({
        method: 'tools/list',
        params: {
          _meta: meta,
        },
      });

      // Check if tools were returned and ensure it's an array
      // @ts-expect-error - SDK response typing issues
      const toolsResponse = Array.isArray(response.tools) ? response.tools : [];
      if (toolsResponse.length === 0) {
        return [];
      }

      // Filter and process tools
      const filteredTools = this.filterTools(toolsResponse, serverConfig);

      // Process each tool
      const processedTools = filteredTools.map((tool) => {
        // Get the original or exposed name
        const exposedName = tool.originalName ? tool.name : tool.name;

        // Map the tool to the client for routing
        clientMappingService.mapToolToClient(exposedName, connectedClient);

        // Add server name prefix to description
        return this.prefixToolDescription(tool, connectedClient.name);
      });

      return processedTools;
    } catch (error) {
      console.error(`Error fetching tools from ${connectedClient.name}:`, error);
      return [];
    }
  }

  /**
   * Execute a tool call
   */
  async executeToolCall(
    toolName: string,
    args: Record<string, unknown>,
    client: ConnectedClient,
    meta?: Record<string, unknown>,
    originalToolName?: string
  ) {
    try {
      // The name to use when calling the tool (may be different from what the user specified)
      const callName = originalToolName || toolName;

      // Call the tool
      // @ts-expect-error - SDK request typing issues
      return await client.client.request({
        method: 'tools/call',
        params: {
          name: callName,
          arguments: args,
          _meta: meta,
        },
      });
    } catch (error) {
      console.error(`Error calling tool ${toolName} on ${client.name}:`, error);
      throw error;
    }
  }

  /**
   * Validate that a tool is allowed to be called based on server configuration
   */
  validateToolAccess(
    toolName: string,
    originalToolName: string | undefined,
    serverConfig: ServerConfig
  ): void {
    if (!serverConfig) return;

    const nameToCheck = originalToolName || toolName;

    // Check exposedTools
    if (serverConfig.exposedTools) {
      const exposedTools = serverConfig.exposedTools.map((tool) =>
        typeof tool === 'string' ? tool : tool.original
      );

      if (!exposedTools.includes(nameToCheck)) {
        throw new Error(`Tool ${toolName} is not exposed by server`);
      }
    }

    // Check hiddenTools
    if (serverConfig.hiddenTools && serverConfig.hiddenTools.includes(nameToCheck)) {
      throw new Error(`Tool ${toolName} is hidden`);
    }
  }
  /**
   * Filter tools based on server configuration
   */
  filterTools(tools: Tool[] | null | undefined, serverConfig?: ServerConfig): Tool[] {
    if (!tools) return [];
    if (!serverConfig) return tools;

    // If exposedTools is defined, only include tools in that list
    if (serverConfig.exposedTools) {
      const exposedToolNames = serverConfig.exposedTools.map((tool) =>
        typeof tool === 'string' ? tool : tool.original
      );
      return tools.filter((tool) => exposedToolNames.includes(tool.name));
    }

    // If hiddenTools is defined, exclude tools in that list
    if (serverConfig.hiddenTools) {
      return tools.filter((tool) => !serverConfig.hiddenTools?.includes(tool.name));
    }

    // If neither filter is applied, return all tools
    return tools;
  }

  /**
   * Process tool name based on server configuration
   */
  processToolName(toolName: string, serverConfig: ServerConfig): string {
    if (!serverConfig.exposedTools) return toolName;

    // Check if this tool is configured for renaming
    const toolConfig = serverConfig.exposedTools.find(
      (tool) => typeof tool !== 'string' && tool.original === toolName
    );

    // If found and has an 'exposed' property, return the exposed name
    if (toolConfig && typeof toolConfig !== 'string') {
      return toolConfig.exposed;
    }

    // Otherwise return the original name
    return toolName;
  }

  /**
   * Prefix tool description with client name
   */
  prefixToolDescription(tool: Tool, clientName: string): Tool {
    return {
      ...tool,
      description: `[${clientName}] ${tool.description}`,
    };
  }

  /**
   * Check if a tool is allowed based on server configuration
   */
  isToolAllowed(
    toolName: string,
    clientName: string,
    serverConfigs: Record<string, ServerConfig>
  ): boolean {
    const serverConfig = serverConfigs[clientName];
    if (!serverConfig) return true; // If no config, allow by default

    // Check exposed tools
    if (serverConfig.exposedTools) {
      const exposedToolNames = serverConfig.exposedTools.map((tool) =>
        typeof tool === 'string' ? tool : tool.original
      );
      // If tool is specifically exposed, allow it regardless of hiddenTools
      if (exposedToolNames.includes(toolName)) {
        return true;
      }
      // If exposedTools is defined but tool is not in it, deny access
      return false;
    }

    // Check hidden tools (only if exposedTools is not defined)
    if (serverConfig.hiddenTools && serverConfig.hiddenTools.includes(toolName)) {
      return false;
    }

    return true;
  }
}

// Export a singleton instance
export const toolService = new ToolService();
