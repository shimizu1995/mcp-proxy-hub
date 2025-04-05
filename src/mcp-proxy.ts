import { createClients } from './client.js';
import { loadConfig } from './config.js';
import {
  handleListToolsRequest,
  handleToolCall,
  registerGetPromptHandler,
  registerListPromptsHandler,
  registerListResourcesHandler,
  registerListResourceTemplatesHandler,
  registerReadResourceHandler,
} from './handlers/index.js';
import { setupEventSource, createMCPServer, createCleanupFunction } from './core/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

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
  server.setRequestHandler(ListToolsRequestSchema, (request) => {
    return handleListToolsRequest(request, connectedClients, config.mcpServers || {}, {
      mcpServers: config.mcpServers || {},
      tools: config.tools,
    });
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await handleToolCall(request, config.mcpServers);
    return result as { [key: string]: unknown }; // Cast to expected return type
  });

  registerGetPromptHandler(server);
  registerListPromptsHandler(server, connectedClients);

  registerListResourcesHandler(server, connectedClients);
  registerReadResourceHandler(server);
  registerListResourceTemplatesHandler(server, connectedClients);

  // Create cleanup function
  const cleanup = createCleanupFunction(connectedClients);

  return { server, cleanup };
};
