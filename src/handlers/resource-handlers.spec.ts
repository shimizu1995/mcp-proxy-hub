import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourcesResultSchema,
  ReadResourceResultSchema,
  ListResourceTemplatesRequestSchema,
  ListResourceTemplatesResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ConnectedClient } from '../client.js';
import { clientMaps } from '../mappers/client-maps.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  registerListResourcesHandler,
  registerReadResourceHandler,
  registerListResourceTemplatesHandler,
} from './resource-handlers.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../mappers/client-maps.js', () => {
  const originalModule = vi.importActual('../mappers/client-maps.js');
  return {
    ...originalModule,
    clientMaps: {
      clearResourceMap: vi.fn(),
      mapResourceToClient: vi.fn(),
      getClientForResource: vi.fn(),
    },
  };
});

describe('Resource Handlers', () => {
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

  describe('registerListResourcesHandler', () => {
    it('should register handler for resources/list', () => {
      registerListResourcesHandler(server, connectedClients);

      expect(mockRequestHandler).toHaveBeenCalledTimes(1);
      expect(mockRequestHandler).toHaveBeenCalledWith(
        ListResourcesRequestSchema,
        expect.any(Function)
      );
    });

    it('should aggregate resources from all connected clients', async () => {
      registerListResourcesHandler(server, connectedClients);

      // Extract the list resources handler function
      const listResourcesHandler = mockRequestHandler.mock.calls[0][1];

      // Mock client responses
      const clientResources1 = [
        { uri: 'res:client1/resource1', name: 'Resource 1', mimeType: 'text/plain' },
        { uri: 'res:client1/resource2', name: 'Resource 2', mimeType: 'text/plain' },
      ];

      const clientResources2 = [
        { uri: 'res:client2/resource3', name: 'Resource 3', mimeType: 'text/plain' },
      ];

      client1RequestMock.mockResolvedValueOnce({ resources: clientResources1 });
      client2RequestMock.mockResolvedValueOnce({ resources: clientResources2 });

      // Create a request object
      const request = { params: { _meta: { test: 'metadata' } } };

      // Call the handler with the request
      const result = await listResourcesHandler(request);

      // Verify clientMaps calls
      expect(clientMaps.clearResourceMap).toHaveBeenCalledTimes(1);
      expect(clientMaps.mapResourceToClient).toHaveBeenCalledTimes(3);
      expect(clientMaps.mapResourceToClient).toHaveBeenCalledWith(
        'res:client1/resource1',
        connectedClients[0]
      );
      expect(clientMaps.mapResourceToClient).toHaveBeenCalledWith(
        'res:client1/resource2',
        connectedClients[0]
      );
      expect(clientMaps.mapResourceToClient).toHaveBeenCalledWith(
        'res:client2/resource3',
        connectedClients[1]
      );

      // Verify client request calls
      expect(mockClient1.request).toHaveBeenCalledWith(
        {
          method: 'resources/list',
          params: {
            cursor: undefined,
            _meta: { test: 'metadata' },
          },
        },
        ListResourcesResultSchema
      );

      expect(mockClient2.request).toHaveBeenCalledWith(
        {
          method: 'resources/list',
          params: {
            cursor: undefined,
            _meta: { test: 'metadata' },
          },
        },
        ListResourcesResultSchema
      );

      // Verify result
      expect(result).toEqual({
        resources: [
          { uri: 'res:client1/resource1', name: '[client1] Resource 1', mimeType: 'text/plain' },
          { uri: 'res:client1/resource2', name: '[client1] Resource 2', mimeType: 'text/plain' },
          { uri: 'res:client2/resource3', name: '[client2] Resource 3', mimeType: 'text/plain' },
        ],
        nextCursor: undefined,
      });
    });

    it('should handle errors from client requests', async () => {
      registerListResourcesHandler(server, connectedClients);

      // Extract the list resources handler function
      const listResourcesHandler = mockRequestHandler.mock.calls[0][1];

      // Mock console.error
      console.error = vi.fn();

      // Mock client responses
      client1RequestMock.mockRejectedValueOnce(new Error('Client 1 error'));
      client2RequestMock.mockResolvedValueOnce({
        resources: [{ uri: 'res:client2/resource3', name: 'Resource 3', mimeType: 'text/plain' }],
      });

      // Create a request object
      const request = { params: {} };

      // Call the handler with the request
      const result = await listResourcesHandler(request);

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching resources from client1:',
        expect.any(Error)
      );

      // Verify result only includes resources from successful client
      expect(result).toEqual({
        resources: [
          { uri: 'res:client2/resource3', name: '[client2] Resource 3', mimeType: 'text/plain' },
        ],
        nextCursor: undefined,
      });
    });

    it('should handle empty resources array from clients', async () => {
      registerListResourcesHandler(server, connectedClients);

      // Extract the list resources handler function
      const listResourcesHandler = mockRequestHandler.mock.calls[0][1];

      // Mock client responses
      client1RequestMock.mockResolvedValueOnce({ resources: [] });
      client2RequestMock.mockResolvedValueOnce({ resources: null });

      // Create a request object
      const request = { params: {} };

      // Call the handler with the request
      const result = await listResourcesHandler(request);

      // Verify result is an empty array
      expect(result).toEqual({ resources: [], nextCursor: undefined });
    });
  });

  describe('registerReadResourceHandler', () => {
    it('should register handler for resources/read', () => {
      registerReadResourceHandler(server);

      expect(mockRequestHandler).toHaveBeenCalledTimes(1);
      expect(mockRequestHandler).toHaveBeenCalledWith(
        ReadResourceRequestSchema,
        expect.any(Function)
      );
    });

    it('should forward resource read request to the appropriate client', async () => {
      registerReadResourceHandler(server);

      // Extract the read resource handler function
      const readResourceHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForResource
      vi.mocked(clientMaps.getClientForResource).mockReturnValueOnce(connectedClients[0]);

      // Mock client response
      const mockResourceResult = {
        content: 'Resource content',
        mimeType: 'text/plain',
      };
      client1RequestMock.mockResolvedValueOnce(mockResourceResult);

      // Create a request object
      const request = {
        params: {
          uri: 'res:client1/resource1',
          _meta: { progressToken: 'token123' },
        },
      };

      // Call the handler with the request
      const result = await readResourceHandler(request);

      // Verify clientMaps.getClientForResource call
      expect(clientMaps.getClientForResource).toHaveBeenCalledWith('res:client1/resource1');

      // Verify client request call
      expect(mockClient1.request).toHaveBeenCalledWith(
        {
          method: 'resources/read',
          params: {
            uri: 'res:client1/resource1',
            _meta: {
              progressToken: 'token123',
            },
          },
        },
        ReadResourceResultSchema
      );

      // Verify result
      expect(result).toEqual(mockResourceResult);
    });

    it('should throw an error when the resource is not found', async () => {
      registerReadResourceHandler(server);

      // Extract the read resource handler function
      const readResourceHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForResource to return undefined
      vi.mocked(clientMaps.getClientForResource).mockReturnValueOnce(undefined);

      // Create a request object
      const request = {
        params: {
          uri: 'res:unknown/resource',
          _meta: {},
        },
      };

      // Call the handler with the request and expect it to throw
      await expect(readResourceHandler(request)).rejects.toThrow(
        'Unknown resource: res:unknown/resource'
      );
    });

    it('should handle and propagate errors from the client', async () => {
      registerReadResourceHandler(server);

      // Extract the read resource handler function
      const readResourceHandler = mockRequestHandler.mock.calls[0][1];

      // Mock clientMaps.getClientForResource
      vi.mocked(clientMaps.getClientForResource).mockReturnValueOnce(connectedClients[0]);

      // Mock console.error
      console.error = vi.fn();

      // Mock client to throw an error
      const mockError = new Error('Client error');
      client1RequestMock.mockRejectedValueOnce(mockError);

      // Create a request object
      const request = {
        params: {
          uri: 'res:client1/resource1',
          _meta: {},
        },
      };

      // Call the handler with the request and expect it to throw
      await expect(readResourceHandler(request)).rejects.toThrow('Client error');

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith('Error reading resource from client1:', mockError);
    });
  });

  describe('registerListResourceTemplatesHandler', () => {
    it('should register handler for resources/templates/list', () => {
      registerListResourceTemplatesHandler(server, connectedClients);

      expect(mockRequestHandler).toHaveBeenCalledTimes(1);
      expect(mockRequestHandler).toHaveBeenCalledWith(
        ListResourceTemplatesRequestSchema,
        expect.any(Function)
      );
    });

    it('should aggregate resource templates from all connected clients', async () => {
      registerListResourceTemplatesHandler(server, connectedClients);

      // Extract the list resource templates handler function
      const listResourceTemplatesHandler = mockRequestHandler.mock.calls[0][1];

      // Mock client responses
      const clientTemplates1 = [
        { name: 'template1', description: 'Template 1', schema: { type: 'object' } },
        { name: 'template2', description: 'Template 2', schema: { type: 'object' } },
      ];

      const clientTemplates2 = [
        { name: 'template3', description: 'Template 3', schema: { type: 'object' } },
      ];

      client1RequestMock.mockResolvedValueOnce({ resourceTemplates: clientTemplates1 });
      client2RequestMock.mockResolvedValueOnce({ resourceTemplates: clientTemplates2 });

      // Create a request object
      const request = { params: { _meta: { test: 'metadata' } } };

      // Call the handler with the request
      const result = await listResourceTemplatesHandler(request);

      // Verify client request calls
      expect(mockClient1.request).toHaveBeenCalledWith(
        {
          method: 'resources/templates/list',
          params: {
            cursor: undefined,
            _meta: { test: 'metadata' },
          },
        },
        ListResourceTemplatesResultSchema
      );

      expect(mockClient2.request).toHaveBeenCalledWith(
        {
          method: 'resources/templates/list',
          params: {
            cursor: undefined,
            _meta: { test: 'metadata' },
          },
        },
        ListResourceTemplatesResultSchema
      );

      // Verify result
      expect(result).toEqual({
        resourceTemplates: [
          {
            name: '[client1] template1',
            description: '[client1] Template 1',
            schema: { type: 'object' },
          },
          {
            name: '[client1] template2',
            description: '[client1] Template 2',
            schema: { type: 'object' },
          },
          {
            name: '[client2] template3',
            description: '[client2] Template 3',
            schema: { type: 'object' },
          },
        ],
        nextCursor: undefined,
      });
    });

    it('should handle templates with no description', async () => {
      registerListResourceTemplatesHandler(server, connectedClients);

      // Extract the list resource templates handler function
      const listResourceTemplatesHandler = mockRequestHandler.mock.calls[0][1];

      // Mock client responses
      const clientTemplates1 = [
        { name: 'template1', schema: { type: 'object' } }, // No description
      ];

      client1RequestMock.mockResolvedValueOnce({ resourceTemplates: clientTemplates1 });
      client2RequestMock.mockResolvedValueOnce({ resourceTemplates: [] });

      // Create a request object
      const request = { params: {} };

      // Call the handler with the request
      const result = await listResourceTemplatesHandler(request);

      // Verify result has the template with undefined description prefixed
      expect(result.resourceTemplates[0]).toEqual({
        name: '[client1] template1',
        description: undefined,
        schema: { type: 'object' },
      });
    });

    it('should handle errors from client requests', async () => {
      registerListResourceTemplatesHandler(server, connectedClients);

      // Extract the list resource templates handler function
      const listResourceTemplatesHandler = mockRequestHandler.mock.calls[0][1];

      // Mock console.error
      console.error = vi.fn();

      // Mock client responses
      client1RequestMock.mockRejectedValueOnce(new Error('Client 1 error'));
      client2RequestMock.mockResolvedValueOnce({
        resourceTemplates: [
          { name: 'template3', description: 'Template 3', schema: { type: 'object' } },
        ],
      });

      // Create a request object
      const request = { params: {} };

      // Call the handler with the request
      const result = await listResourceTemplatesHandler(request);

      // Verify error logging
      expect(console.error).toHaveBeenCalledWith(
        'Error fetching resource templates from client1:',
        expect.any(Error)
      );

      // Verify result only includes templates from successful client
      expect(result).toEqual({
        resourceTemplates: [
          {
            name: '[client2] template3',
            description: '[client2] Template 3',
            schema: { type: 'object' },
          },
        ],
        nextCursor: undefined,
      });
    });

    it('should handle empty resourceTemplates array from clients', async () => {
      registerListResourceTemplatesHandler(server, connectedClients);

      // Extract the list resource templates handler function
      const listResourceTemplatesHandler = mockRequestHandler.mock.calls[0][1];

      // Mock client responses
      client1RequestMock.mockResolvedValueOnce({ resourceTemplates: [] });
      client2RequestMock.mockResolvedValueOnce({ resourceTemplates: null });

      // Create a request object
      const request = { params: {} };

      // Call the handler with the request
      const result = await listResourceTemplatesHandler(request);

      // Verify result is an empty array
      expect(result).toEqual({ resourceTemplates: [], nextCursor: undefined });
    });
  });
});
