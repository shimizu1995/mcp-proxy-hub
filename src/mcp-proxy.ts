import { createClients } from './client.js';
import { loadConfig } from './config.js';
import {
  registerListToolsHandler,
  registerCallToolHandler,
  registerGetPromptHandler,
  registerListPromptsHandler,
  registerListResourcesHandler,
  registerListResourceTemplatesHandler,
  registerReadResourceHandler,
} from './handlers/index.js';
import { setupEventSource, createMCPServer, createCleanupFunction } from './core/index.js';

/**
 * Creates an MCP proxy server that forwards requests to connected client servers
 * @returns The server and cleanup function
 */
export const createServer = async () => {
  // Setup SSE EventSource for server-side events
  setupEventSource();

  // Load configuration and connect to servers
  const config = await loadConfig();
  const connectedClients = await createClients(config.mcpServers);
  console.log(`Connected to ${connectedClients.length} servers`);

  // Create the MCP server
  const server = createMCPServer();

  // Register all handlers
  registerListToolsHandler(server, connectedClients);
  registerCallToolHandler(server);

  registerGetPromptHandler(server);
  registerListPromptsHandler(server, connectedClients);

  registerListResourcesHandler(server, connectedClients);
  registerReadResourceHandler(server);
  registerListResourceTemplatesHandler(server, connectedClients);

  // Create cleanup function
  const cleanup = createCleanupFunction(connectedClients);

  return { server, cleanup };
};
