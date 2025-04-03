import {
  ListToolsResultSchema,
  Tool,
  CompatibilityCallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ConnectedClient } from '../client.js';
import { clientMaps } from '../mappers/client-maps.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { handleToolCall, handleListToolsRequest } from './tool-handlers.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as configModule from '../config.js';

// Mock dependencies
vi.mock('../mappers/client-maps.js', () => {
  const originalModule = vi.importActual('../mappers/client-maps.js');
  return {
    ...originalModule,
    clientMaps: {
      clearToolMap: vi.fn(),
      mapToolToClient: vi.fn(),
      getClientForTool: vi.fn(),
    },
  };
});

describe('Tool Handlers', () => {
  const server: Server = new Server({
    name: 'test-server',
    version: '1.0.0',
  });
  let mockRequestHandler = vi.fn();

  let connectedClients: ConnectedClient[];

  const mockClient1 = new Client({
    name: 'mock-client-1',
    version: '1.0.0',
  });
  let client1RequestMock = vi.fn();
  mockClient1.request = client1RequestMock;

  const mockClient2 = new Client({
    name: 'mock-client-2',
    version: '1.0.0',
  });
  let client2RequestMock = vi.fn();
  mockClient2.request = client2RequestMock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock Server
    mockRequestHandler = vi.fn();
    server.setRequestHandler = mockRequestHandler;

    // Mock Clients
    client1RequestMock = vi.fn();
    mockClient1.request = client1RequestMock;

    client2RequestMock = vi.fn();
    mockClient2.request = client2RequestMock;

    connectedClients = [
      {
        client: mockClient1,
        name: 'client1',
        cleanup: vi.fn(),
      },
      {
        client: mockClient2,
        name: 'client2',
        cleanup: vi.fn(),
      },
    ];

    // Mock config
    vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
      mcpServers: {
        client1: {
          command: 'test-command',
        },
        client2: {
          command: 'test-command-2',
        },
      },
    });
  });

  describe('handleListToolsRequest', () => {
    it('should filter tools based on exposedTools configuration', async () => {
      // Mock config with exposedTools
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
        mcpServers: {
          client1: {
            command: 'test-command',
            exposedTools: ['tool1'], // Only expose tool1, not tool2
          },
          client2: {
            command: 'test-command-2',
          },
        },
      });

      // テストで直接ハンドラー関数を呼び出す

      // Mock client responses
      const clientTools1: Tool[] = [
        { name: 'tool1', description: 'Test Tool 1', inputSchema: { type: 'object' } },
        { name: 'tool2', description: 'Test Tool 2', inputSchema: { type: 'object' } }, // Should be filtered out
      ];

      const clientTools2: Tool[] = [
        { name: 'tool3', description: 'Test Tool 3', inputSchema: { type: 'object' } },
      ];

      client1RequestMock.mockResolvedValueOnce({ tools: clientTools1 });
      client2RequestMock.mockResolvedValueOnce({ tools: clientTools2 });

      // Create a request object
      const request = {
        method: 'tools/list' as const,
        params: {},
      };

      // Call the handler directly
      const result = await handleListToolsRequest(request, connectedClients);

      // Verify that tool2 was filtered out because it's not in the exposedTools list
      expect(result).toEqual({
        tools: [
          { name: 'tool1', description: '[client1] Test Tool 1', inputSchema: { type: 'object' } },
          { name: 'tool3', description: '[client2] Test Tool 3', inputSchema: { type: 'object' } },
        ],
      });
    });

    it('should filter tools based on hiddenTools configuration', async () => {
      // Mock config with hiddenTools
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
        mcpServers: {
          client1: {
            command: 'test-command',
            hiddenTools: ['tool2'], // Hide tool2
          },
          client2: {
            command: 'test-command-2',
          },
        },
      });

      // テストで直接ハンドラー関数を呼び出す

      // Mock client responses
      const clientTools1: Tool[] = [
        { name: 'tool1', description: 'Test Tool 1', inputSchema: { type: 'object' } },
        { name: 'tool2', description: 'Test Tool 2', inputSchema: { type: 'object' } }, // Should be filtered out
      ];

      const clientTools2: Tool[] = [
        { name: 'tool3', description: 'Test Tool 3', inputSchema: { type: 'object' } },
      ];

      client1RequestMock.mockResolvedValueOnce({ tools: clientTools1 });
      client2RequestMock.mockResolvedValueOnce({ tools: clientTools2 });

      // Create a request object
      const request = {
        method: 'tools/list' as const,
        params: {},
      };

      // Call the handler directly
      const result = await handleListToolsRequest(request, connectedClients);

      // Verify that tool2 was hidden
      expect(result).toEqual({
        tools: [
          { name: 'tool1', description: '[client1] Test Tool 1', inputSchema: { type: 'object' } },
          { name: 'tool3', description: '[client2] Test Tool 3', inputSchema: { type: 'object' } },
        ],
      });
    });

    it('should aggregate tools from all connected clients', async () => {
      // テストで直接ハンドラー関数を呼び出す

      // Mock client responses
      const clientTools1: Tool[] = [
        { name: 'tool1', description: 'Test Tool 1', inputSchema: { type: 'object' } },
        { name: 'tool2', description: 'Test Tool 2', inputSchema: { type: 'object' } },
      ];

      const clientTools2: Tool[] = [
        { name: 'tool3', description: 'Test Tool 3', inputSchema: { type: 'object' } },
      ];

      client1RequestMock.mockResolvedValueOnce({ tools: clientTools1 });
      client2RequestMock.mockResolvedValueOnce({ tools: clientTools2 });

      // Create a request object
      const request = {
        method: 'tools/list' as const,
        params: { _meta: { test: 'metadata' } },
      };

      // Call the handler directly
      const result = await handleListToolsRequest(request, connectedClients);

      // Verify clientMaps calls
      expect(clientMaps.clearToolMap).toHaveBeenCalledTimes(1);
      expect(clientMaps.mapToolToClient).toHaveBeenCalledTimes(3);
      expect(clientMaps.mapToolToClient).toHaveBeenCalledWith('tool1', connectedClients[0]);
      expect(clientMaps.mapToolToClient).toHaveBeenCalledWith('tool2', connectedClients[0]);
      expect(clientMaps.mapToolToClient).toHaveBeenCalledWith('tool3', connectedClients[1]);

      // Verify client request calls
      expect(mockClient1.request).toHaveBeenCalledWith(
        {
          method: 'tools/list',
          params: {
            _meta: { test: 'metadata' },
          },
        },
        ListToolsResultSchema
      );

      expect(mockClient2.request).toHaveBeenCalledWith(
        {
          method: 'tools/list',
          params: {
            _meta: { test: 'metadata' },
          },
        },
        ListToolsResultSchema
      );

      // Verify result
      expect(result).toEqual({
        tools: [
          { name: 'tool1', description: '[client1] Test Tool 1', inputSchema: { type: 'object' } },
          { name: 'tool2', description: '[client1] Test Tool 2', inputSchema: { type: 'object' } },
          { name: 'tool3', description: '[client2] Test Tool 3', inputSchema: { type: 'object' } },
        ],
      });
    });

    it('should handle errors from client requests', async () => {
      // テストで直接ハンドラー関数を呼び出す

      // Mock console.error
      console.error = vi.fn();

      // Mock client responses
      client1RequestMock.mockRejectedValueOnce(new Error('Client 1 error'));
      client2RequestMock.mockResolvedValueOnce({
        tools: [{ name: 'tool3', description: 'Test Tool 3', inputSchema: { type: 'object' } }],
      });

      // Create a request object
      const request = {
        method: 'tools/list' as const,
        params: {},
      };

      // Call the handler directly
      const result = await handleListToolsRequest(request, connectedClients);

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching tools from client1:',
        expect.any(Error)
      );

      // Verify result only includes tools from successful client
      expect(result).toEqual({
        tools: [
          { name: 'tool3', description: '[client2] Test Tool 3', inputSchema: { type: 'object' } },
        ],
      });
    });

    it('should handle empty tools array from clients', async () => {
      // テストで直接ハンドラー関数を呼び出す

      // Mock client responses
      client1RequestMock.mockResolvedValueOnce({ tools: [] });
      client2RequestMock.mockResolvedValueOnce({ tools: null });

      // Create a request object
      const request = {
        method: 'tools/list' as const,
        params: {},
      };

      // Call the handler directly
      const result = await handleListToolsRequest(request, connectedClients);

      // Verify result is an empty array
      expect(result).toEqual({ tools: [] });
    });
  });

  describe('handleToolCall', () => {
    it('should reject tool call if tool is not in exposedTools', async () => {
      // Mock config with exposedTools
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
        mcpServers: {
          client1: {
            command: 'test-command',
            exposedTools: ['tool2'], // Only expose tool2, not tool1
          },
          client2: {
            command: 'test-command-2',
          },
        },
      });

      // Mock clientMaps.getClientForTool
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(connectedClients[0]);

      // Create a request object for tool1, which is not exposed
      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'tool1',
          arguments: {},
        },
      };

      // Call the handler with the request and expect it to throw
      await expect(handleToolCall(request)).rejects.toThrow(
        'Tool tool1 is not exposed by server client1'
      );
    });

    it('should reject tool call if tool is in hiddenTools', async () => {
      // Mock config with hiddenTools
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
        mcpServers: {
          client1: {
            command: 'test-command',
            hiddenTools: ['tool1'], // Hide tool1
          },
          client2: {
            command: 'test-command-2',
          },
        },
      });

      // Mock clientMaps.getClientForTool
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(connectedClients[0]);

      // Create a request object for tool1, which is hidden
      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'tool1',
          arguments: {},
        },
      };

      // Call the handler with the request and expect it to throw
      await expect(handleToolCall(request)).rejects.toThrow(
        'Tool tool1 is hidden on server client1'
      );
    });

    it('should forward tool call to the appropriate client', async () => {
      // Mock config
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
        mcpServers: {
          client1: {
            command: 'test-command',
          },
          client2: {
            command: 'test-command-2',
          },
        },
      });

      // Mock clientMaps.getClientForTool
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(connectedClients[0]);

      // Mock client response
      const mockToolResult = { result: 'success' };
      client1RequestMock.mockResolvedValueOnce(mockToolResult);

      // Create a request object
      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'tool1',
          arguments: { param1: 'value1' },
          _meta: { progressToken: 'token123' },
        },
      };

      // Call the handler directly with the request
      const result = await handleToolCall(request);

      // Verify clientMaps.getClientForTool call
      expect(clientMaps.getClientForTool).toHaveBeenCalledWith('tool1');

      // Verify client request call
      expect(mockClient1.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'tool1',
            arguments: { param1: 'value1' },
            _meta: {
              progressToken: 'token123',
            },
          },
        },
        CompatibilityCallToolResultSchema
      );

      // Verify result
      expect(result).toEqual(mockToolResult);
    });

    it('should throw an error when the tool is not found', async () => {
      // Mock clientMaps.getClientForTool to return undefined
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(undefined);

      // Create a request object
      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'unknown-tool',
          arguments: {},
        },
      };

      // Call the handler directly with the request and expect it to throw
      await expect(handleToolCall(request)).rejects.toThrow('Unknown tool: unknown-tool');
    });

    it('should handle and propagate errors from the client', async () => {
      // Mock config
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
        mcpServers: {
          client1: {
            command: 'test-command',
          },
        },
      });

      // Mock clientMaps.getClientForTool
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(connectedClients[0]);

      // Mock console.error
      console.error = vi.fn();

      // Mock client to throw an error
      const mockError = new Error('Client error');
      client1RequestMock.mockRejectedValueOnce(mockError);

      // Create a request object
      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'tool1',
          arguments: {},
        },
      };

      // Call the handler directly with the request and expect it to throw
      await expect(handleToolCall(request)).rejects.toThrow('Client error');
    });

    it('should handle empty arguments in the request', async () => {
      // Mock config
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
        mcpServers: {
          client1: {
            command: 'test-command',
          },
        },
      });

      // Mock clientMaps.getClientForTool
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(connectedClients[0]);

      // Mock client response
      const mockToolResult = { result: 'success' };
      client1RequestMock.mockResolvedValueOnce(mockToolResult);

      // Create a request object with no arguments
      const request = {
        method: 'tools/call' as const,
        params: {
          name: 'tool1',
        },
      };

      // Call the handler directly with the request
      await handleToolCall(request);

      // Verify client request uses empty object for arguments
      expect(mockClient1.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            arguments: {},
          }),
        }),
        CompatibilityCallToolResultSchema
      );
    });
  });

  // registerCallToolHandlerのテストは不要になったため削除

  describe('handleListToolsRequest', () => {
    it('should aggregate tools from all connected clients', async () => {
      // Mock client responses
      const clientTools1: Tool[] = [
        { name: 'tool1', description: 'Test Tool 1', inputSchema: { type: 'object' } },
        { name: 'tool2', description: 'Test Tool 2', inputSchema: { type: 'object' } },
      ];

      const clientTools2: Tool[] = [
        { name: 'tool3', description: 'Test Tool 3', inputSchema: { type: 'object' } },
      ];

      client1RequestMock.mockResolvedValueOnce({ tools: clientTools1 });
      client2RequestMock.mockResolvedValueOnce({ tools: clientTools2 });

      // Create a request object
      const request = {
        method: 'tools/list' as const,
        params: { _meta: { test: 'metadata' } },
      };

      // Call the handler directly
      const result = await handleListToolsRequest(request, connectedClients);

      // Verify clientMaps calls
      expect(clientMaps.clearToolMap).toHaveBeenCalledTimes(1);
      expect(clientMaps.mapToolToClient).toHaveBeenCalledTimes(3);
      expect(clientMaps.mapToolToClient).toHaveBeenCalledWith('tool1', connectedClients[0]);
      expect(clientMaps.mapToolToClient).toHaveBeenCalledWith('tool2', connectedClients[0]);
      expect(clientMaps.mapToolToClient).toHaveBeenCalledWith('tool3', connectedClients[1]);

      // Verify client request calls
      expect(mockClient1.request).toHaveBeenCalledWith(
        {
          method: 'tools/list',
          params: {
            _meta: { test: 'metadata' },
          },
        },
        ListToolsResultSchema
      );

      expect(mockClient2.request).toHaveBeenCalledWith(
        {
          method: 'tools/list',
          params: {
            _meta: { test: 'metadata' },
          },
        },
        ListToolsResultSchema
      );

      // Verify result
      expect(result).toEqual({
        tools: [
          { name: 'tool1', description: '[client1] Test Tool 1', inputSchema: { type: 'object' } },
          { name: 'tool2', description: '[client1] Test Tool 2', inputSchema: { type: 'object' } },
          { name: 'tool3', description: '[client2] Test Tool 3', inputSchema: { type: 'object' } },
        ],
      });
    });

    it('should filter tools based on exposedTools configuration', async () => {
      // Mock config with exposedTools
      vi.spyOn(configModule, 'loadConfig').mockResolvedValue({
        mcpServers: {
          client1: {
            command: 'test-command',
            exposedTools: ['tool1'], // Only expose tool1, not tool2
          },
          client2: {
            command: 'test-command-2',
          },
        },
      });

      // Mock client responses
      const clientTools1: Tool[] = [
        { name: 'tool1', description: 'Test Tool 1', inputSchema: { type: 'object' } },
        { name: 'tool2', description: 'Test Tool 2', inputSchema: { type: 'object' } }, // Should be filtered out
      ];

      const clientTools2: Tool[] = [
        { name: 'tool3', description: 'Test Tool 3', inputSchema: { type: 'object' } },
      ];

      client1RequestMock.mockResolvedValueOnce({ tools: clientTools1 });
      client2RequestMock.mockResolvedValueOnce({ tools: clientTools2 });

      // Create a request object
      const request = {
        method: 'tools/list' as const,
        params: {},
      };

      // Call the handler directly
      const result = await handleListToolsRequest(request, connectedClients);

      // Verify that tool2 was filtered out because it's not in the exposedTools list
      expect(result).toEqual({
        tools: [
          { name: 'tool1', description: '[client1] Test Tool 1', inputSchema: { type: 'object' } },
          { name: 'tool3', description: '[client2] Test Tool 3', inputSchema: { type: 'object' } },
        ],
      });
    });

    it('should handle errors from client requests', async () => {
      // Mock console.error
      console.error = vi.fn();

      // Mock client responses
      client1RequestMock.mockRejectedValueOnce(new Error('Client 1 error'));
      client2RequestMock.mockResolvedValueOnce({
        tools: [{ name: 'tool3', description: 'Test Tool 3', inputSchema: { type: 'object' } }],
      });

      // Create a request object
      const request = {
        method: 'tools/list' as const,
        params: {},
      };

      // Call the handler directly
      const result = await handleListToolsRequest(request, connectedClients);

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching tools from client1:',
        expect.any(Error)
      );

      // Verify result only includes tools from successful client
      expect(result).toEqual({
        tools: [
          { name: 'tool3', description: '[client2] Test Tool 3', inputSchema: { type: 'object' } },
        ],
      });
    });
  });
});
