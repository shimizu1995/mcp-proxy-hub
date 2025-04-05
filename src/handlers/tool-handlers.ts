// This file is a wrapper for backward compatibility
import { handleListToolsRequest as listTools } from './tool-list-handler.js';
import { handleToolCall as callTool } from './tool-call-handler.js';
import { ServerConfig } from '../models/config.js';

// Re-exporting the types for backward compatibility
export type ToolMapping = {
  original: string;
  exposed: string;
};

export type ExposedTool = string | ToolMapping;

export interface ServerConfigs {
  [serverName: string]: ServerConfig;
}

// Re-exporting the functions
export const handleListToolsRequest = listTools;
export const handleToolCall = callTool;
