import { readFile } from 'fs/promises';
import { resolve } from 'path';

export type TransportConfigStdio = {
  type?: 'stdio';
  command: string;
  args?: string[];
  env?: string[];
};

export type TransportConfigSSE = {
  type: 'sse';
  url: string;
};

export type ServerTransportConfig = TransportConfigSSE | TransportConfigStdio;

export type ServerName = string;

export interface Config {
  mcpServers: Record<ServerName, ServerTransportConfig>;
}

export const loadConfig = async (): Promise<Config> => {
  try {
    const configPath = process.env.MCP_CONFIG_PATH ?? resolve(process.cwd(), 'config.json');
    console.info('Loading config from:', configPath);
    const fileContents = await readFile(configPath, 'utf-8');
    return JSON.parse(fileContents);
  } catch (error) {
    console.error('Error loading config.json:', error);
    // Return empty config if file doesn't exist
    return { mcpServers: {} };
  }
};
