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
  enable?: boolean;
  timeout?: number;
};

export type TransportConfigSSE = {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  exposedTools?: ExposedTool[];
  hiddenTools?: string[];
  envVars?: EnvVarConfig[];
  enable?: boolean;
  timeout?: number;
};

export type TransportConfigStreamableHTTP = {
  type: 'streamable-http';
  url: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  exposedTools?: ExposedTool[];
  hiddenTools?: string[];
  envVars?: EnvVarConfig[];
  enable?: boolean;
  timeout?: number;
};

export type ServerConfig =
  | TransportConfigSSE
  | TransportConfigStdio
  | TransportConfigStreamableHTTP;
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

export interface AuthConfig {
  type: 'bearer';
  token: string;
}

export interface ServerTransportConfig {
  type: 'stdio' | 'sse' | 'streamable-http';
  port?: number;
  host?: string;
  path?: string;
  auth?: AuthConfig;
}

export interface Config {
  mcpServers: ServerConfigs;
  tools?: Record<string, ToolConfig>;
  envVars?: EnvVarConfig[];
  serverTransport?: ServerTransportConfig;
  timeout?: number;
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
