import {
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListPromptsResultSchema,
  GetPromptResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ConnectedClient } from '../client.js';
import { clientMaps } from '../mappers/client-maps.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { registerGetPromptHandler, registerListPromptsHandler } from './prompt-handlers.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../mappers/client-maps.js', () => {
  const originalModule = vi.importActual('../mappers/client-maps.js');
  return {
    ...originalModule,
    clientMaps: {
      clearPromptMap: vi.fn(),
      mapPromptToClient: vi.fn(),
      getClientForPrompt: vi.fn(),
    },
  };
});

describe('Prompt Handlers', () => {
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
  });

  describe('registerListPromptsHandler', () => {
    it('should register handler for prompts/list', () => {
      registerListPromptsHandler(server, connectedClients);

      expect(mockRequestHandler).toHaveBeenCalledTimes(1);
      expect(mockRequestHandler).toHaveBeenCalledWith(
        ListPromptsRequestSchema,
        expect.any(Function)
      );
    });

    it('should aggregate prompts from all connected clients', async () => {
      registerListPromptsHandler(server, connectedClients);

      // Extract the list prompts handler function
      const listPromptsHandler = mockRequestHandler.mock.calls[0][1];

      // Mock client responses
      const clientPrompts1 = [
        { name: 'prompt1', description: 'Test Prompt 1', inputSchema: { type: 'object' } },
        { name: 'prompt2', description: 'Test Prompt 2', inputSchema: { type: 'object' } },
      ];

      const clientPrompts2 = [
        { name: 'prompt3', description: 'Test Prompt 3', inputSchema: { type: 'object' } },
      ];

      client1RequestMock.mockResolvedValueOnce({ prompts: clientPrompts1 });
      client2RequestMock.mockResolvedValueOnce({ prompts: clientPrompts2 });

      // Create a request object
      const request = { params: { _meta: { test: 'metadata' } } };

      // Call the handler with the request
      const result = await listPromptsHandler(request);

      // Verify clientMaps calls
      expect(clientMaps.clearPromptMap).toHaveBeenCalledTimes(1);
      expect(clientMaps.mapPromptToClient).toHaveBeenCalledTimes(3);
      expect(clientMaps.mapPromptToClient).toHaveBeenCalledWith('prompt1', connectedClients[0]);
      expect(clientMaps.mapPromptToClient).toHaveBeenCalledWith('prompt2', connectedClients[0]);
      expect(clientMaps.mapPromptToClient).toHaveBeenCalledWith('prompt3', connectedClients[1]);

      // Verify client request calls
      expect(mockClient1.request).toHaveBeenCalledWith(
        {
          method: 'prompts/list',
          params: {
            cursor: undefined,
            _meta: { test: 'metadata' },
          },
        },
        ListPromptsResultSchema
      );

      expect(mockClient2.request).toHaveBeenCalledWith(
        {
          method: 'prompts/list',
          params: {
            cursor: undefined,
            _meta: { test: 'metadata' },
          },
        },
        ListPromptsResultSchema
      );

      // Verify result
      expect(result).toEqual({
        prompts: [
          {
            name: 'prompt1',
            description: '[client1] Test Prompt 1',
            inputSchema: { type: 'object' },
          },
          {
            name: 'prompt2',
            description: '[client1] Test Prompt 2',
            inputSchema: { type: 'object' },
          },
          {
            name: 'prompt3',
            description: '[client2] Test Prompt 3',
            inputSchema: { type: 'object' },
          },
        ],
        nextCursor: undefined,
      });
    });

    it('should handle errors from client requests', async () => {
      registerListPromptsHandler(server, connectedClients);

      // Extract the list prompts handler function
      const listPromptsHandler = mockRequestHandler.mock.calls[0][1];

      // Mock console.error
      console.error = vi.fn();

      // Mock client responses
      client1RequestMock.mockRejectedValueOnce(new Error('Client 1 error'));
      client2RequestMock.mockResolvedValueOnce({
        prompts: [
          { name: 'prompt3', description: 'Test Prompt 3', inputSchema: { type: 'object' } },
        ],
      });

      // Create a request object
      const request = { params: {} };

      // Call the handler with the request
      const result = await listPromptsHandler(request);

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching prompts from client1:',
        expect.any(Error)
      );

      // Verify result only includes prompts from successful client
      expect(result).toEqual({
        prompts: [
          {
            name: 'prompt3',
            description: '[client2] Test Prompt 3',
            inputSchema: { type: 'object' },
          },
        ],
        nextCursor: undefined,
      });
    });

    it('should handle empty prompts array from clients', async () => {
      registerListPromptsHandler(server, connectedClients);

      // Extract the list prompts handler function
      const listPromptsHandler = mockRequestHandler.mock.calls[0][1];

      // Mock client responses
      client1RequestMock.mockResolvedValueOnce({ prompts: [] });
      client2RequestMock.mockResolvedValueOnce({ prompts: null });

      // Create a request object
      const request = { params: {} };

      // Call the handler with the request
      const result = await listPromptsHandler(request);

      // Verify result is an empty array
      expect(result).toEqual({ prompts: [], nextCursor: undefined });
    });
  });

  describe('registerGetPromptHandler', () => {
    it('should register handler for prompts/get', () => {
      registerGetPromptHandler(server);

      expect(mockRequestHandler).toHaveBeenCalledTimes(1);
      expect(mockRequestHandler).toHaveBeenCalledWith(GetPromptRequestSchema, expect.any(Function));
    });

    it('should forward prompt request to the appropriate client', async () => {
      registerGetPromptHandler(server);

      // Extract the get prompt handler function
      const getPromptHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForPrompt
      vi.mocked(clientMaps.getClientForPrompt).mockReturnValueOnce(connectedClients[0]);

      // Mock client response
      const mockPromptResult = { result: 'This is prompt content' };
      client1RequestMock.mockResolvedValueOnce(mockPromptResult);

      // Create a request object
      const request = {
        params: {
          name: 'prompt1',
          arguments: { param1: 'value1' },
          _meta: { progressToken: 'token123' },
        },
      };

      // Call the handler with the request
      const result = await getPromptHandler(request);

      // Verify clientMaps.getClientForPrompt call
      expect(clientMaps.getClientForPrompt).toHaveBeenCalledWith('prompt1');

      // Verify client request call
      expect(mockClient1.request).toHaveBeenCalledWith(
        {
          method: 'prompts/get',
          params: {
            name: 'prompt1',
            arguments: { param1: 'value1' },
            _meta: {
              progressToken: 'token123',
            },
          },
        },
        GetPromptResultSchema
      );

      // Verify result
      expect(result).toEqual(mockPromptResult);
    });

    it('should throw an error when the prompt is not found', async () => {
      registerGetPromptHandler(server);

      // Extract the get prompt handler function
      const getPromptHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForPrompt to return undefined
      vi.mocked(clientMaps.getClientForPrompt).mockReturnValueOnce(undefined);

      // Create a request object
      const request = {
        params: {
          name: 'unknown-prompt',
          arguments: {},
        },
      };

      // Call the handler with the request and expect it to throw
      await expect(getPromptHandler(request)).rejects.toThrow('Unknown prompt: unknown-prompt');
    });

    it('should handle and propagate errors from the client', async () => {
      registerGetPromptHandler(server);

      // Extract the get prompt handler function
      const getPromptHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForPrompt
      vi.mocked(clientMaps.getClientForPrompt).mockReturnValueOnce(connectedClients[0]);

      // Mock console.error
      console.error = vi.fn();

      // Mock client to throw an error
      const mockError = new Error('Client error');
      client1RequestMock.mockRejectedValueOnce(mockError);

      // Create a request object
      const request = {
        params: {
          name: 'prompt1',
          arguments: {},
        },
      };

      // Call the handler with the request and expect it to throw
      await expect(getPromptHandler(request)).rejects.toThrow('Client error');

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith('Error getting prompt from client1:', mockError);
    });

    it('should handle empty arguments in the request', async () => {
      registerGetPromptHandler(server);

      // Extract the get prompt handler function
      const getPromptHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForPrompt
      vi.mocked(clientMaps.getClientForPrompt).mockReturnValueOnce(connectedClients[0]);

      // Mock client response
      const mockPromptResult = { result: 'This is prompt content' };
      client1RequestMock.mockResolvedValueOnce(mockPromptResult);

      // Create a request object with no arguments
      const request = {
        params: {
          name: 'prompt1',
        },
      };

      // Call the handler with the request
      await getPromptHandler(request);

      // Verify client request uses empty object for arguments
      expect(mockClient1.request).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            arguments: {},
          }),
        }),
        GetPromptResultSchema
      );
    });
  });
});
