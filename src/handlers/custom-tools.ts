// This file is a wrapper for backward compatibility
import { customToolService } from '../services/custom-tool-service.js';
import { clientMappingService } from '../services/client-mapping-service.js';

// Re-export the types for backward compatibility
export type ServerName = string;

export type ToolDefinition = {
  name: string;
  description?: string;
};

export type SubtoolDefinition = {
  tools: ToolDefinition[];
};

export type ToolConfig = {
  description: string;
  subtools?: Record<ServerName, SubtoolDefinition>;
};

export interface ConfigForCustomTools {
  mcpServers: Record<string, Record<string, unknown>>;
  tools?: Record<string, ToolConfig>;
}

// Re-export functions for backward compatibility
export const createCustomTools = customToolService.createCustomTools.bind(customToolService);
export const handleCustomToolCall = customToolService.handleCustomToolCall.bind(customToolService);

// Re-export the map for backward compatibility
export const customToolMaps = {
  get: clientMappingService.getClientForCustomTool.bind(clientMappingService),
  set: clientMappingService.mapCustomToolToClient.bind(clientMappingService),
  clear: clientMappingService.clearCustomToolMap.bind(clientMappingService),
  // Add other Map methods as needed
};
