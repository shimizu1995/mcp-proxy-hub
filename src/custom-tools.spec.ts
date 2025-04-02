import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCustomTools, handleCustomToolCall, customToolMaps } from './custom-tools.js';
import { clientMaps } from './mappers/client-maps.js';
import { ConnectedClient } from './client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('custom-tools', () => {
  beforeEach(() => {
    // Clear maps before each test
    customToolMaps.clear();
    vi.spyOn(clientMaps, 'mapToolToClient').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createCustomTools', () => {
    it('should return an empty array when no tools are defined', () => {
      const config = { mcpServers: {} };
      const connectedClients: ConnectedClient[] = [];

      const result = createCustomTools(config, connectedClients, []);

      expect(result).toEqual([]);
    });

    it('should create a custom tool when it is defined in config', () => {
      const mockClient: ConnectedClient = {
        name: 'Example Server 1',
        client: new Client({
          name: 'mock-client-1',
          version: '1.0.0',
        }),
        cleanup: async () => {
          // Perform any cleanup operations if needed
        },
      };

      const config = {
        mcpServers: {},
        tools: {
          develop: {
            description: 'Start the development server',
            subtools: {
              'Example Server 1': {
                tools: [
                  {
                    name: 'tool1',
                    description: 'Tool 1 description',
                  },
                ],
              },
            },
          },
        },
      };

      const connectedClients: ConnectedClient[] = [mockClient];

      const result = createCustomTools(config, connectedClients, []);

      expect(result.length).toBe(1);
      expect(result[0].name).toBe('develop');
      expect(result[0].description).toContain('Start the development server');
      expect(result[0].description).toContain('Example Server 1');
      expect(result[0].description).toContain('tool1');

      // Verify the tool was mapped
      expect(clientMaps.mapToolToClient).toHaveBeenCalledWith('develop', expect.anything());

      // Verify the custom subtool was mapped to its client
      const customToolKey = 'develop:Example Server 1:tool1';
      expect(customToolMaps.get(customToolKey)).toBe(mockClient);
    });

    it('should create multiple custom tools when defined in config', () => {
      const mockClient1: ConnectedClient = {
        name: 'Example Server 1',
        client: new Client({
          name: 'mock-client-1',
          version: '1.0.0',
        }),
        cleanup: async () => {
          // Perform any cleanup operations if needed
        },
      };

      const mockClient2: ConnectedClient = {
        name: 'Example Server 2',
        client: new Client({
          name: 'mock-client-2',
          version: '1.0.0',
        }),
        cleanup: async () => {
          // Perform any cleanup operations if needed
        },
      };

      const config = {
        mcpServers: {},
        tools: {
          develop: {
            description: 'Start the development server',
            subtools: {
              'Example Server 1': {
                tools: [
                  {
                    name: 'start',
                    description: 'Start the server',
                  },
                ],
              },
            },
          },
          deploy: {
            description: 'Deploy the application',
            subtools: {
              'Example Server 2': {
                tools: [
                  {
                    name: 'publish',
                    description: 'Publish to production',
                  },
                ],
              },
            },
          },
        },
      };

      const connectedClients = [mockClient1, mockClient2];

      const result = createCustomTools(config, connectedClients, []);

      expect(result.length).toBe(2);

      // Check first tool
      expect(result[0].name).toBe('develop');
      expect(result[0].description).toContain('Start the development server');

      // Check second tool
      expect(result[1].name).toBe('deploy');
      expect(result[1].description).toContain('Deploy the application');

      // Verify both tools were mapped to their clients
      expect(customToolMaps.get('develop:Example Server 1:start')).toBe(mockClient1);
      expect(customToolMaps.get('deploy:Example Server 2:publish')).toBe(mockClient2);
    });

    it('should handle missing clients gracefully', () => {
      const config = {
        mcpServers: {},
        tools: {
          develop: {
            description: 'Start the development server',
            subtools: {
              'Non-existent Server': {
                tools: [
                  {
                    name: 'tool1',
                    description: 'Tool 1 description',
                  },
                ],
              },
            },
          },
        },
      };

      const connectedClients: ConnectedClient[] = [];

      const result = createCustomTools(config, connectedClients, []);

      expect(result.length).toBe(1);
      expect(result[0].name).toBe('develop');
      // The non-existent server's tools should not be in the map
      expect(customToolMaps.size).toBe(0);
    });
  });

  describe('handleCustomToolCall', () => {
    it('should throw an error when server or tool is missing', async () => {
      await expect(handleCustomToolCall('testTool', {})).rejects.toThrow(
        'Invalid arguments: server must be a string'
      );
      await expect(handleCustomToolCall('testTool', { server: 'server1' })).rejects.toThrow(
        'Invalid arguments: tool must be a string'
      );
      await expect(handleCustomToolCall('testTool', { tool: 'tool1' })).rejects.toThrow(
        'Invalid arguments: server must be a string'
      );
    });

    it('should throw an error when subtool is not found', async () => {
      await expect(
        handleCustomToolCall('testTool', { server: 'server1', tool: 'tool1' })
      ).rejects.toThrow('Unknown subtool');
    });

    it('should forward the tool call to the correct client', async () => {
      // Mock client with request method
      const mockClient: ConnectedClient = {
        name: 'Example Server 1',
        client: new Client({
          name: 'mock-client-1',
          version: '1.0.0',
        }),
        cleanup: async () => {
          // Perform any cleanup operations if needed
        },
      };
      // mock the request method using spy
      vi.spyOn(mockClient.client, 'request').mockResolvedValue({
        result: 'success',
      });

      // Set up the tool map
      customToolMaps.set('testTool:server1:tool1', mockClient);

      // Call the custom tool
      const result = await handleCustomToolCall('testTool', {
        server: 'server1',
        tool: 'tool1',
        args: { param1: 'value1' },
      });

      // Verify the correct client method was called
      expect(mockClient.client.request).toHaveBeenCalledWith(
        {
          method: 'tools/call',
          params: {
            name: 'tool1',
            arguments: { param1: 'value1' },
            _meta: {
              progressToken: undefined,
            },
          },
        },
        expect.anything()
      );

      // Verify the result was passed through
      expect(result).toEqual({ result: 'success' });
    });

    it('should handle errors from the client', async () => {
      // Mock client that throws an error
      const mockClient: ConnectedClient = {
        name: 'Example Server 1',
        client: new Client({
          name: 'mock-client-1',
          version: '1.0.0',
        }),
        cleanup: async () => {
          // Perform any cleanup operations if needed
        },
      };

      vi.spyOn(console, 'error').mockImplementation(() => {});

      // Set up the tool map
      customToolMaps.set('testTool:server1:tool1', mockClient);

      // Call the custom tool and expect it to throw
      await expect(
        handleCustomToolCall('testTool', {
          server: 'server1',
          tool: 'tool1',
        })
      ).rejects.toThrow('Not connected');
    });
  });
});
