import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ConnectedClient } from '../client.js';
import * as eventsource from 'eventsource';

/**
 * Sets up the global EventSource for SSE communication
 */
export function setupEventSource(): void {
  global.EventSource = eventsource.EventSource;
}

/**
 * Creates a new MCP server instance
 * @returns The server instance
 */
export function createMCPServer(): Server {
  return new Server(
    {
      name: 'mcp-proxy-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        prompts: {},
        resources: { subscribe: true },
        tools: {},
      },
    }
  );
}

/**
 * Performs cleanup operations when shutting down
 * @param connectedClients The list of connected clients
 * @returns Cleanup function
 */
export function createCleanupFunction(connectedClients: ConnectedClient[]): () => Promise<void> {
  return async () => {
    await Promise.all(connectedClients.map(({ cleanup }) => cleanup()));
  };
}
