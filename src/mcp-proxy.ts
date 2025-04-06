import { createClients, getConnectedClient } from './client.js';
import { loadConfig } from './config.js';
import {
  handleListToolsRequest,
  handleToolCall,
  handleGetPromptRequest,
  handleListPromptsRequest,
  registerListResourcesHandler,
  registerListResourceTemplatesHandler,
  registerReadResourceHandler,
} from './handlers/index.js';
import { setupEventSource, createMCPServer, createCleanupFunction } from './core/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Creates an MCP proxy server that forwards requests to connected client servers
 * @returns The server and cleanup function
 */
export const createServer = async () => {
  // Setup SSE EventSource for server-side events
  setupEventSource();

  // Load configuration and connect to servers
  const config = await loadConfig();
  await createClients(config.mcpServers);

  // Create the MCP server
  const server = createMCPServer();

  // Register all handlers
  server.setRequestHandler(ListToolsRequestSchema, (request) => {
    const connectedClients = getConnectedClient();
    return handleListToolsRequest(request, connectedClients, config.mcpServers || {}, {
      mcpServers: config.mcpServers || {},
      tools: config.tools,
    });
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return await handleToolCall(request, config.mcpServers);
  });

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    return handleGetPromptRequest(request);
  });

  server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
    const connectedClients = getConnectedClient();
    return handleListPromptsRequest(request, connectedClients);
  });

  registerListResourcesHandler(server);
  registerReadResourceHandler(server);
  registerListResourceTemplatesHandler(server);

  // Create cleanup function
  const cleanup = createCleanupFunction();

  return { server, cleanup };
};
