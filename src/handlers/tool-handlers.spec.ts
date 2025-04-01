import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
  Tool,
  CompatibilityCallToolResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ConnectedClient } from '../client.js';
import { clientMaps } from '../mappers/client-maps.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerListToolsHandler, registerCallToolHandler } from './tool-handlers.js';
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

  describe('registerListToolsHandler', () => {
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

      registerListToolsHandler(server, connectedClients);

      // Extract the list tools handler function
      const listToolsHandler = mockRequestHandler.mock.calls[0][1];

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
      const request = { params: {} };

      // Call the handler with the request
      const result = await listToolsHandler(request);

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

      registerListToolsHandler(server, connectedClients);

      // Extract the list tools handler function
      const listToolsHandler = mockRequestHandler.mock.calls[0][1];

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
      const request = { params: {} };

      // Call the handler with the request
      const result = await listToolsHandler(request);

      // Verify that tool2 was hidden
      expect(result).toEqual({
        tools: [
          { name: 'tool1', description: '[client1] Test Tool 1', inputSchema: { type: 'object' } },
          { name: 'tool3', description: '[client2] Test Tool 3', inputSchema: { type: 'object' } },
        ],
      });
    });
    it('should register handler for tools/list', () => {
      registerListToolsHandler(server, connectedClients);

      expect(mockRequestHandler).toHaveBeenCalledTimes(1);
      expect(mockRequestHandler).toHaveBeenCalledWith(ListToolsRequestSchema, expect.any(Function));
    });

    it('should aggregate tools from all connected clients', async () => {
      registerListToolsHandler(server, connectedClients);

      // Extract the list tools handler function
      const listToolsHandler = mockRequestHandler.mock.calls[0][1];

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
      const request = { params: { _meta: { test: 'metadata' } } };

      // Call the handler with the request
      const result = await listToolsHandler(request);

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
      registerListToolsHandler(server, connectedClients);

      // Extract the list tools handler function
      const listToolsHandler = mockRequestHandler.mock.calls[0][1];

      // Mock console.error
      console.error = vi.fn();

      // Mock client responses
      client1RequestMock.mockRejectedValueOnce(new Error('Client 1 error'));
      client2RequestMock.mockResolvedValueOnce({
        tools: [{ name: 'tool3', description: 'Test Tool 3', inputSchema: { type: 'object' } }],
      });

      // Create a request object
      const request = { params: {} };

      // Call the handler with the request
      const result = await listToolsHandler(request);

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
      registerListToolsHandler(server, connectedClients);

      // Extract the list tools handler function
      const listToolsHandler = mockRequestHandler.mock.calls[0][1];

      // Mock client responses
      client1RequestMock.mockResolvedValueOnce({ tools: [] });
      client2RequestMock.mockResolvedValueOnce({ tools: null });

      // Create a request object
      const request = { params: {} };

      // Call the handler with the request
      const result = await listToolsHandler(request);

      // Verify result is an empty array
      expect(result).toEqual({ tools: [] });
    });
  });

  describe('registerCallToolHandler', () => {
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

      registerCallToolHandler(server);

      // Extract the call tool handler function
      const callToolHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForTool
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(connectedClients[0]);

      // Create a request object for tool1, which is not exposed
      const request = {
        params: {
          name: 'tool1',
          arguments: {},
        },
      };

      // Call the handler with the request and expect it to throw
      await expect(callToolHandler(request)).rejects.toThrow(
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

      registerCallToolHandler(server);

      // Extract the call tool handler function
      const callToolHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForTool
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(connectedClients[0]);

      // Create a request object for tool1, which is hidden
      const request = {
        params: {
          name: 'tool1',
          arguments: {},
        },
      };

      // Call the handler with the request and expect it to throw
      await expect(callToolHandler(request)).rejects.toThrow(
        'Tool tool1 is hidden on server client1'
      );
    });
    it('should register handler for tools/call', () => {
      registerCallToolHandler(server);

      expect(mockRequestHandler).toHaveBeenCalledTimes(1);
      expect(mockRequestHandler).toHaveBeenCalledWith(CallToolRequestSchema, expect.any(Function));
    });

    it('should forward tool call to the appropriate client', async () => {
      registerCallToolHandler(server);

      // Extract the call tool handler function
      const callToolHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForTool
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(connectedClients[0]);

      // Mock client response
      const mockToolResult = { result: 'success' };
      client1RequestMock.mockResolvedValueOnce(mockToolResult);

      // Create a request object
      const request = {
        params: {
          name: 'tool1',
          arguments: { param1: 'value1' },
          _meta: { progressToken: 'token123' },
        },
      };

      // Call the handler with the request
      const result = await callToolHandler(request);

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
      registerCallToolHandler(server);

      // Extract the call tool handler function
      const callToolHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForTool to return undefined
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(undefined);

      // Create a request object
      const request = {
        params: {
          name: 'unknown-tool',
          arguments: {},
        },
      };

      // Call the handler with the request and expect it to throw
      await expect(callToolHandler(request)).rejects.toThrow('Unknown tool: unknown-tool');
    });

    it('should handle and propagate errors from the client', async () => {
      registerCallToolHandler(server);

      // Extract the call tool handler function
      const callToolHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForTool
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(connectedClients[0]);

      // Mock console.error
      console.error = vi.fn();

      // Mock client to throw an error
      const mockError = new Error('Client error');
      client1RequestMock.mockRejectedValueOnce(mockError);

      // Create a request object
      const request = {
        params: {
          name: 'tool1',
          arguments: {},
        },
      };

      // Call the handler with the request and expect it to throw
      await expect(callToolHandler(request)).rejects.toThrow('Client error');

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith('Error calling tool through client1:', mockError);
    });

    it('should handle empty arguments in the request', async () => {
      registerCallToolHandler(server);

      // Extract the call tool handler function
      const callToolHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForTool
      vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(connectedClients[0]);

      // Mock client response
      const mockToolResult = { result: 'success' };
      client1RequestMock.mockResolvedValueOnce(mockToolResult);

      // Create a request object with no arguments
      const request = {
        params: {
          name: 'tool1',
        },
      };

      // Call the handler with the request
      await callToolHandler(request);

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
});
