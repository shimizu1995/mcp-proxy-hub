import { readFile } from 'fs/promises';
import { resolve } from 'path';

// Define a type for tool mapping (original name -> exposed name)
export type ToolMapping = {
  original: string;
  exposed: string;
};

// Union type for exposedTools entries
export type ExposedTool = string | ToolMapping;

export type EnvVarConfig = {
  name: string;
  value: string;
  expand?: boolean;
  unexpand?: boolean;
};

export type TransportConfigStdio = {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  exposedTools?: ExposedTool[];
  hiddenTools?: string[];
  envVars?: EnvVarConfig[];
};

export type TransportConfigSSE = {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  exposedTools?: ExposedTool[];
  hiddenTools?: string[];
  envVars?: EnvVarConfig[];
};

export type ServerConfig = TransportConfigSSE | TransportConfigStdio;
export type ServerName = string;
export type ServerConfigs = Record<ServerName, ServerConfig>;

export type ToolDefinition = {
  name: string;
  description?: string;
  // Additional tool properties can be added here
};

export type SubtoolDefinition = {
  tools: ToolDefinition[];
};

export type ToolConfig = {
  description: string;
  subtools?: Record<ServerName, SubtoolDefinition>;
};

export interface Config {
  mcpServers: ServerConfigs;
  tools?: Record<string, ToolConfig>;
  envVars?: EnvVarConfig[];
}

export const loadConfig = async (): Promise<Config> => {
  try {
    const configPath = process.env.MCP_PROXY_CONFIG_PATH ?? resolve(process.cwd(), 'config.json');
    console.info('Loading config from:', configPath);
    const fileContents = await readFile(configPath, 'utf-8');
    return JSON.parse(fileContents);
  } catch (error) {
    console.error('Error loading config.json:', error);
    // Return empty config if file doesn't exist
    return { mcpServers: {} };
  }
};
