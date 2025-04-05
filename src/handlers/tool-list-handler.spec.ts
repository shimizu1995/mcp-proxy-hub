import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListToolsRequest } from './tool-list-handler.js';
import { toolService } from '../services/tool-service.js';
import { customToolService } from '../services/custom-tool-service.js';
import { clientMappingService } from '../services/client-mapping-service.js';
import { ConnectedClient } from '../client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Mock dependencies
vi.mock('../services/tool-service.js', () => ({
  toolService: {
    fetchToolsFromClient: vi.fn(),
    validateToolAccess: vi.fn(),
    executeToolCall: vi.fn(),
    filterTools: vi.fn(),
    processToolName: vi.fn(),
    prefixToolDescription: vi.fn(),
    isToolAllowed: vi.fn(),
  },
}));

vi.mock('../services/custom-tool-service.js', () => ({
  customToolService: {
    createCustomTools: vi.fn(),
    handleCustomToolCall: vi.fn(),
  },
}));

vi.mock('../services/client-mapping-service.js', () => ({
  clientMappingService: {
    clearToolMap: vi.fn(),
    mapToolToClient: vi.fn(),
    mapCustomToolToClient: vi.fn(),
    getClientForTool: vi.fn(),
    getClientForCustomTool: vi.fn(),
  },
}));

describe('Tool List Handler', () => {
  let mockClient1: ConnectedClient;
  let mockClient2: ConnectedClient;
  let connectedClients: ConnectedClient[];
  let serverConfigs: Record<string, Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient1 = {
      client: new Client({
        name: 'client-1',
        version: '1.0.0',
      }),
      name: 'client1',
      cleanup: async () => {},
    };

    mockClient2 = {
      client: new Client({
        name: 'client-2',
        version: '1.0.0',
      }),
      name: 'client2',
      cleanup: async () => {},
    };

    connectedClients = [mockClient1, mockClient2];

    serverConfigs = {
      client1: {
        command: 'test-command',
      },
      client2: {
        command: 'test-command-2',
      },
    };
  });

  it('should clear tool map and aggregate tools from all clients', async () => {
    // Mock the service responses
    const client1Tools: Tool[] = [
      { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
    ];
    const client2Tools: Tool[] = [
      { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
    ];

    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce(client1Tools);
    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce(client2Tools);
    vi.mocked(customToolService.createCustomTools).mockReturnValueOnce([]);

    const request = {
      method: 'tools/list' as const,
      params: { _meta: { test: 'metadata' } },
    };

    const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

    // Verify map was cleared
    expect(clientMappingService.clearToolMap).toHaveBeenCalledTimes(1);

    // Verify service calls
    expect(toolService.fetchToolsFromClient).toHaveBeenCalledTimes(2);
    expect(toolService.fetchToolsFromClient).toHaveBeenNthCalledWith(
      1,
      mockClient1,
      serverConfigs.client1,
      { test: 'metadata' }
    );
    expect(toolService.fetchToolsFromClient).toHaveBeenNthCalledWith(
      2,
      mockClient2,
      serverConfigs.client2,
      { test: 'metadata' }
    );

    // Verify result
    expect(result).toEqual({
      tools: [...client1Tools, ...client2Tools],
    });
  });

  it('should add custom tools to the result', async () => {
    // Mock the service responses
    const client1Tools: Tool[] = [
      { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
    ];
    const client2Tools: Tool[] = [
      { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
    ];
    const customTools: Tool[] = [
      { name: 'customTool', description: 'Custom Tool', inputSchema: { type: 'object' } },
    ];

    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce(client1Tools);
    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce(client2Tools);
    vi.mocked(customToolService.createCustomTools).mockReturnValueOnce(customTools);

    const request = {
      method: 'tools/list' as const,
      params: {},
    };

    const toolsConfig = {
      mcpServers: {},
      tools: {
        customTool: {
          description: 'Custom Tool',
          subtools: {
            client1: {
              tools: [{ name: 'tool1' }],
            },
          },
        },
      },
    };

    const result = await handleListToolsRequest(
      request,
      connectedClients,
      serverConfigs,
      toolsConfig
    );

    // Verify createCustomTools was called with correct args
    expect(customToolService.createCustomTools).toHaveBeenCalledWith(
      toolsConfig,
      connectedClients,
      expect.arrayContaining([
        expect.objectContaining({ name: 'tool1', serverName: 'client1' }),
        expect.objectContaining({ name: 'tool2', serverName: 'client2' }),
      ])
    );

    // Verify result includes all tools
    expect(result).toEqual({
      tools: [...client1Tools, ...client2Tools, ...customTools],
    });
  });

  it('should handle errors in custom tool creation', async () => {
    // Mock services
    vi.mocked(toolService.fetchToolsFromClient).mockResolvedValue([]);
    vi.mocked(customToolService.createCustomTools).mockImplementationOnce(() => {
      throw new Error('Custom tool error');
    });

    // Mock console.error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = {
      method: 'tools/list' as const,
      params: {},
    };

    const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error creating custom tools:', expect.any(Error));

    // Verify result only includes tools from clients (empty in this case)
    expect(result).toEqual({ tools: [] });
  });
});
