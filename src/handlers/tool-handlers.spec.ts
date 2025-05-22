import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListToolsRequest } from './tool-list-handler.js';
import { handleToolCall } from './tool-call-handler.js';
import { toolService } from '../services/tool-service.js';
import { customToolService } from '../services/custom-tool-service.js';
import { clientMaps } from '../mappers/client-maps.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ConnectedClient } from '../client.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Config, ServerName, ServerConfig } from '../config.js';

// Mock dependencies
vi.mock('../services/tool-service.js', () => ({
  toolService: {
    fetchToolsFromClient: vi.fn(),
    validateToolAccess: vi.fn(),
    executeToolCall: vi.fn(),
    filterTools: vi.fn(),
    applyToolNameMapping: vi.fn(),
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

vi.mock('../mappers/client-maps.js', () => ({
  clientMaps: {
    clearToolMap: vi.fn(),
    mapToolToClient: vi.fn(),
    mapCustomToolToClient: vi.fn(),
    getClientForTool: vi.fn(),
    getClientForCustomTool: vi.fn(),
  },
}));

describe('Tool Handlers', () => {
  let mockClient1: ConnectedClient;
  let mockClient2: ConnectedClient;
  let connectedClients: ConnectedClient[];
  let serverConfigs: Record<ServerName, ServerConfig>;
  let config: Config;

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

    config = {
      mcpServers: serverConfigs,
      envVars: [{ name: 'GLOBAL_VAR', value: 'global-value', expand: true, unexpand: true }],
    };
  });

  describe('handleListToolsRequest', () => {
    it('should clear the tool map and request tools from all clients', async () => {
      // Mock the service responses
      const client1Tools: Tool[] = [
        { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
      ];
      const client2Tools: Tool[] = [
        { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
      ];

      vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce(client1Tools);
      vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce(client2Tools);
      vi.mocked(toolService.filterTools).mockReturnValueOnce(client1Tools);
      vi.mocked(toolService.filterTools).mockReturnValueOnce(client2Tools);
      vi.mocked(toolService.applyToolNameMapping).mockReturnValueOnce(client1Tools);
      vi.mocked(toolService.applyToolNameMapping).mockReturnValueOnce(client2Tools);
      vi.mocked(customToolService.createCustomTools).mockReturnValueOnce([]);

      const request = {
        method: 'tools/list' as const,
        params: { _meta: { test: 'metadata' } },
      };

      const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

      // Verify map was cleared
      expect(clientMaps.clearToolMap).toHaveBeenCalledTimes(1);

      // Verify service calls with correct parameters
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

      // Verify result includes tools from both clients
      expect(result.tools).toHaveLength(2);
      expect(result.tools).toEqual([...client1Tools, ...client2Tools]);
    });

    it('should continue processing even if one client fails', async () => {
      // Mock console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // First client throws error, second succeeds
      vi.mocked(toolService.fetchToolsFromClient).mockImplementationOnce(() => {
        throw new Error('Client error');
      });

      const client2Tools: Tool[] = [
        { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
      ];
      vi.mocked(toolService.fetchToolsFromClient).mockResolvedValueOnce(client2Tools);
      vi.mocked(toolService.filterTools).mockReturnValueOnce(client2Tools);
      vi.mocked(toolService.applyToolNameMapping).mockReturnValueOnce(client2Tools);
      vi.mocked(customToolService.createCustomTools).mockReturnValueOnce([]);

      const request = {
        method: 'tools/list' as const,
        params: {},
      };

      const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Verify result only includes tools from successful client
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('tool2');

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });

    it('should include custom tools in the result', async () => {
      // Mock client tools
      const clientTools: Tool[] = [
        { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
      ];

      // Mock custom tools
      const customTools: Tool[] = [
        { name: 'customTool', description: 'Custom Tool', inputSchema: { type: 'object' } },
      ];

      vi.mocked(toolService.fetchToolsFromClient).mockResolvedValue(clientTools);
      vi.mocked(toolService.filterTools).mockReturnValue(clientTools);
      vi.mocked(toolService.applyToolNameMapping).mockReturnValue(clientTools);
      vi.mocked(customToolService.createCustomTools).mockReturnValueOnce(customTools);

      const request = {
        method: 'tools/list' as const,
        params: {},
      };

      const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

      // Verify result includes both client tools and custom tools
      expect(result.tools).toHaveLength(3); // 2 client tools + 1 custom tool
      expect(result.tools).toContainEqual(customTools[0]);
    });

    it('should handle errors when creating custom tools', async () => {
      // Mock console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock client tools
      const clientTools: Tool[] = [
        { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
      ];

      vi.mocked(toolService.fetchToolsFromClient).mockResolvedValue(clientTools);
      vi.mocked(toolService.filterTools).mockReturnValue(clientTools);
      vi.mocked(toolService.applyToolNameMapping).mockReturnValue(clientTools);
      vi.mocked(customToolService.createCustomTools).mockImplementationOnce(() => {
        throw new Error('Custom tool error');
      });

      const request = {
        method: 'tools/list' as const,
        params: {},
      };

      const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Verify result still includes client tools
      expect(result.tools).toHaveLength(2); // Only client tools, no custom tools

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });
  });

  describe('handleToolCall', () => {
    it('should throw an error when the tool is not found', async () => {
      // Mock clientMaps.getClientForTool to return undefined
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(undefined);

      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'unknown-tool',
          arguments: {},
        },
      };

      // Call the handler and expect it to throw
      await expect(handleToolCall(request, config)).rejects.toThrow('Unknown tool: unknown-tool');
    });

    it('should call the custom tool service for custom tools', async () => {
      // Create a mock custom client
      const mockCustomClient: ConnectedClient = {
        client: new Client({
          name: 'custom-client',
          version: '1.0.0',
        }),
        name: 'custom',
        cleanup: async () => {},
      };

      // Mock clientMaps.getClientForTool to return the custom client
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(mockCustomClient);

      // Mock customToolService.handleCustomToolCall
      const mockResult = { result: 'custom tool result' };
      vi.mocked(customToolService.handleCustomToolCall).mockResolvedValueOnce(mockResult);

      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'customTool',
          arguments: { param: 'value' },
          _meta: { progressToken: 'token123' },
        },
      };

      // Call the handler
      const result = await handleToolCall(request, config);

      // Verify customToolService.handleCustomToolCall was called
      expect(customToolService.handleCustomToolCall).toHaveBeenCalledWith(
        'customTool',
        { param: 'value' },
        { progressToken: 'token123' },
        config.mcpServers,
        config.envVars
      );

      // Verify result
      expect(result).toStrictEqual(mockResult);
    });

    it('should call executeToolCall with the correct parameters', async () => {
      // Mock clientMaps.getClientForTool
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(mockClient1);

      // Set up a mock mapping for the tool
      mockClient1.client.toolMappings = {
        'exposed-tool': 'original-tool',
      };

      // Mock executeToolCall to return a result
      const mockResult = { result: 'success' };
      vi.mocked(toolService.executeToolCall).mockResolvedValueOnce(mockResult);

      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'exposed-tool',
          arguments: { param1: 'value1' },
          _meta: { progressToken: 'token123' },
        },
      };

      // Call the handler
      const result = await handleToolCall(request, config);

      // Verify validateToolAccess was called
      expect(toolService.validateToolAccess).toHaveBeenCalledWith(
        'exposed-tool',
        'original-tool',
        serverConfigs.client1
      );

      // Verify executeToolCall was called with original tool name
      expect(toolService.executeToolCall).toHaveBeenCalledWith(
        'exposed-tool',
        { param1: 'value1' },
        mockClient1,
        { progressToken: 'token123' },
        'original-tool'
      );

      // Verify result
      expect(result).toStrictEqual(mockResult);
    });
  });
});
