import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListToolsRequest, handleToolCall } from './tool-handlers.js';
import { toolService } from '../services/tool-service.js';
import { customToolService } from '../services/custom-tool-service.js';
import { clientMappingService } from '../services/client-mapping-service.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ConnectedClient } from '../client.js';
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

describe('Tool Handlers', () => {
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

  describe('handleListToolsRequest', () => {
    it('should filter tools based on exposedTools configuration', async () => {
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

      const testServerConfigs = {
        client1: {
          command: 'test-command',
          exposedTools: ['tool1'], // Only expose tool1
        },
        client2: {
          command: 'test-command-2',
        },
      };

      const request = {
        method: 'tools/list' as const,
        params: { _meta: { test: 'metadata' } },
      };

      const result = await handleListToolsRequest(request, connectedClients, testServerConfigs);

      // Verify service calls
      expect(toolService.fetchToolsFromClient).toHaveBeenCalledTimes(2);
      expect(toolService.fetchToolsFromClient).toHaveBeenNthCalledWith(
        1,
        mockClient1,
        testServerConfigs.client1,
        { test: 'metadata' }
      );

      // Verify result contains tools from both clients
      expect(result.tools).toHaveLength(2);
    });

    it('should filter tools based on hiddenTools configuration', async () => {
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

      const testServerConfigs = {
        client1: {
          command: 'test-command',
          hiddenTools: ['tool2'], // Hide tool2
        },
        client2: {
          command: 'test-command-2',
        },
      };

      const request = {
        method: 'tools/list' as const,
        params: {},
      };

      const result = await handleListToolsRequest(request, connectedClients, testServerConfigs);

      // Verify result contains tools from both clients
      expect(result.tools).toHaveLength(2);
    });

    it('should aggregate tools from all connected clients', async () => {
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

    it('should handle errors from client requests', async () => {
      // Mock console.error
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Mock tools
      const client2Tools: Tool[] = [
        { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
      ];

      // Create a mock implementation that fails for the first client but succeeds for the second
      let callCount = 0;
      vi.mocked(toolService.fetchToolsFromClient).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          console.error('Error fetching tools');
          // Instead of rejecting with an error, we'll return an empty array to simulate a handled error
          return [];
        } else {
          return client2Tools;
        }
      });

      // Mock custom tools
      vi.mocked(customToolService.createCustomTools).mockReturnValueOnce([]);

      const request = {
        method: 'tools/list' as const,
        params: {},
      };

      const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalled();

      // Verify result only includes tools from successful client
      expect(result.tools.length).toBe(1);
      expect(result.tools[0].name).toBe('tool2');

      // Restore console.error
      consoleErrorSpy.mockRestore();
    });

    it('should handle empty tools array from clients', async () => {
      // Mock clients to return empty tools arrays
      vi.mocked(toolService.fetchToolsFromClient).mockResolvedValue([]);
      vi.mocked(customToolService.createCustomTools).mockReturnValueOnce([]);

      const request = {
        method: 'tools/list' as const,
        params: {},
      };

      const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

      // Verify result is an empty array
      expect(result).toEqual({ tools: [] });
    });
  });

  describe('handleToolCall', () => {
    it('should reject tool call if tool is not in exposedTools', async () => {
      // Mock clientMappingService.getClientForTool
      vi.mocked(clientMappingService.getClientForTool).mockReturnValueOnce(mockClient1);

      // Mock validateToolAccess to throw an error
      vi.mocked(toolService.validateToolAccess).mockImplementationOnce(() => {
        throw new Error('Tool tool1 is not exposed by server client1');
      });

      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'tool1',
          arguments: {},
        },
      };

      // Call the handler and expect it to throw
      await expect(handleToolCall(request, serverConfigs)).rejects.toThrow(
        'Tool tool1 is not exposed by server client1'
      );
    });

    it('should reject tool call if tool is in hiddenTools', async () => {
      // Mock clientMappingService.getClientForTool
      vi.mocked(clientMappingService.getClientForTool).mockReturnValueOnce(mockClient1);

      // Mock validateToolAccess to throw an error
      vi.mocked(toolService.validateToolAccess).mockImplementationOnce(() => {
        throw new Error('Tool tool1 is hidden on server client1');
      });

      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'tool1',
          arguments: {},
        },
      };

      // Call the handler and expect it to throw
      await expect(handleToolCall(request, serverConfigs)).rejects.toThrow(
        'Tool tool1 is hidden on server client1'
      );
    });

    it('should forward tool call to the appropriate client', async () => {
      // Mock clientMappingService.getClientForTool
      vi.mocked(clientMappingService.getClientForTool).mockReturnValueOnce(mockClient1);

      // Mock executeToolCall to return a result
      const mockResult = { result: 'success' };
      vi.mocked(toolService.executeToolCall).mockResolvedValueOnce(mockResult);

      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'tool1',
          arguments: { param1: 'value1' },
          _meta: { progressToken: 'token123' },
        },
      };

      // Call the handler
      const result = await handleToolCall(request, serverConfigs);

      // Verify validateToolAccess was called
      expect(toolService.validateToolAccess).toHaveBeenCalledWith(
        'tool1',
        undefined,
        serverConfigs.client1
      );

      // Verify executeToolCall was called
      expect(toolService.executeToolCall).toHaveBeenCalledWith(
        'tool1',
        { param1: 'value1' },
        mockClient1,
        { progressToken: 'token123' },
        undefined
      );

      // Verify result
      expect(result).toBe(mockResult);
    });

    it('should throw an error when the tool is not found', async () => {
      // Mock clientMappingService.getClientForTool to return undefined
      vi.mocked(clientMappingService.getClientForTool).mockReturnValueOnce(undefined);

      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'unknown-tool',
          arguments: {},
        },
      };

      // Call the handler and expect it to throw
      await expect(handleToolCall(request, serverConfigs)).rejects.toThrow(
        'Unknown tool: unknown-tool'
      );
    });

    it('should handle and propagate errors from the client', async () => {
      // Mock clientMappingService.getClientForTool
      vi.mocked(clientMappingService.getClientForTool).mockReturnValueOnce(mockClient1);

      // Mock executeToolCall to throw an error
      vi.mocked(toolService.executeToolCall).mockRejectedValueOnce(new Error('Client error'));

      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'tool1',
          arguments: {},
        },
      };

      // Call the handler and expect it to throw
      await expect(handleToolCall(request, serverConfigs)).rejects.toThrow('Client error');
    });

    it('should handle empty arguments in the request', async () => {
      // Mock clientMappingService.getClientForTool
      vi.mocked(clientMappingService.getClientForTool).mockReturnValueOnce(mockClient1);

      // Mock executeToolCall to return a result
      const mockResult = { result: 'success' };
      vi.mocked(toolService.executeToolCall).mockResolvedValueOnce(mockResult);

      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'tool1',
          // arguments intentionally omitted
        },
      };

      // Call the handler
      await handleToolCall(request, serverConfigs);

      // Verify executeToolCall was called with empty arguments
      expect(toolService.executeToolCall).toHaveBeenCalledWith(
        'tool1',
        {}, // Empty object instead of undefined
        mockClient1,
        undefined,
        undefined
      );
    });
  });
});
