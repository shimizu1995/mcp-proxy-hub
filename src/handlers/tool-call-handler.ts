import { ServerConfig } from '../models/config.js';
import { clientMappingService } from '../services/client-mapping-service.js';
import { toolService } from '../services/tool-service.js';
import { customToolService } from '../services/custom-tool-service.js';

/**
 * Handles tool call requests
 */
export async function handleToolCall(
  request: {
    params: {
      name: string;
      _meta?: {
        progressToken?: string | number;
      };
      arguments?: Record<string, unknown>;
    } & { [k: string]: unknown };
    method: 'tools/call';
  },
  serverConfigs: Record<string, ServerConfig>
) {
  const { name: toolName, arguments: args } = request.params;

  // Get the client for this tool
  const clientForTool = clientMappingService.getClientForTool(toolName);

  if (!clientForTool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // Handle custom tool call
  if (clientForTool.name === 'custom') {
    return await customToolService.handleCustomToolCall(toolName, args, request.params._meta);
  }

  // Find the original name mapping from the client if it exists
  const originalToolName = clientForTool.client.toolMappings?.[toolName];

  // Validate tool access based on config
  const serverConfig = serverConfigs[clientForTool.name];
  if (serverConfig) {
    toolService.validateToolAccess(toolName, originalToolName, serverConfig);
  }

  // Execute the tool call
  return await toolService.executeToolCall(
    toolName,
    args || {},
    clientForTool,
    request.params._meta,
    originalToolName
  );
}
