import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { customToolService, ToolWithServerName } from './custom-tool-service.js';
import { clientMappingService } from './client-mapping-service.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ConnectedClient } from '../client.js';

// Mock dependencies
vi.mock('./client-mapping-service.js', () => ({
  clientMappingService: {
    mapToolToClient: vi.fn(),
    mapCustomToolToClient: vi.fn(),
    getClientForCustomTool: vi.fn(),
  },
}));

// Properly mock console methods
const consoleMock = {
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
};

// Replace console methods with mocks
vi.stubGlobal('console', {
  ...console,
  warn: consoleMock.warn,
  error: consoleMock.error,
  log: consoleMock.log,
});

describe('CustomToolService', () => {
  let mockClient1: ConnectedClient;
  let mockClient2: ConnectedClient;
  let connectedClients: ConnectedClient[];
  let availableTools: ToolWithServerName[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient1 = {
      client: new Client({
        name: 'client-1',
        version: '1.0.0',
      }),
      name: 'server1',
      cleanup: async () => {},
    };

    mockClient2 = {
      client: new Client({
        name: 'client-2',
        version: '1.0.0',
      }),
      name: 'server2',
      cleanup: async () => {},
    };

    connectedClients = [mockClient1, mockClient2];

    availableTools = [
      {
        name: 'tool1',
        description: 'Tool 1 description',
        inputSchema: { type: 'object' },
        serverName: 'server1',
      },
      {
        name: 'tool2',
        description: 'Tool 2 description',
        inputSchema: { type: 'object' },
        serverName: 'server2',
      },
    ];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createCustomTools', () => {
    it('should return empty array if toolsConfig is undefined', () => {
      const result = customToolService.createCustomTools(
        undefined,
        connectedClients,
        availableTools
      );
      expect(result).toEqual([]);
    });

    it('should create custom tools from config', () => {
      const toolsConfig = {
        customTool1: {
          description: 'Custom tool 1',
          subtools: {
            server1: {
              tools: [
                {
                  name: 'tool1',
                  description: 'Custom description for tool1',
                },
              ],
            },
          },
        },
      };

      const result = customToolService.createCustomTools(
        { tools: toolsConfig },
        connectedClients,
        availableTools
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('customTool1');
      expect(result[0].description).toContain('Custom tool 1');
      expect(result[0].description).toContain('server1');
      expect(result[0].description).toContain('tool1');

      // Check that tools were mapped correctly
      expect(clientMappingService.mapCustomToolToClient).toHaveBeenCalledWith(
        'customTool1:server1:tool1',
        mockClient1
      );
      expect(clientMappingService.mapToolToClient).toHaveBeenCalledWith(
        'customTool1',
        expect.anything()
      );
    });

    it('should handle missing clients gracefully', () => {
      const toolsConfig = {
        customTool1: {
          description: 'Custom tool 1',
          subtools: {
            nonExistentServer: {
              tools: [
                {
                  name: 'tool1',
                  description: 'Custom description for tool1',
                },
              ],
            },
          },
        },
      };

      const result = customToolService.createCustomTools(
        { tools: toolsConfig },
        connectedClients,
        availableTools
      );

      expect(result).toHaveLength(1);
      expect(consoleMock.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Server nonExistentServer referenced in customTool1 tool config not found'
        )
      );
    });

    it('should include inputSchema from available tools', () => {
      const toolsConfig = {
        customTool1: {
          description: 'Custom tool 1',
          subtools: {
            server1: {
              tools: [
                {
                  name: 'tool1',
                },
              ],
            },
          },
        },
      };

      const result = customToolService.createCustomTools(
        { tools: toolsConfig },
        connectedClients,
        availableTools
      );

      expect(result).toHaveLength(1);
      expect(result[0].description).toContain('inputSchema');
      expect(result[0].description).toContain(JSON.stringify({ type: 'object' }));
    });
  });

  describe('handleCustomToolCall', () => {
    beforeEach(() => {
      // Mock the getClientForCustomTool method
      vi.mocked(clientMappingService.getClientForCustomTool).mockReturnValue(mockClient1);
    });

    it('should throw error if args is undefined', async () => {
      await expect(customToolService.handleCustomToolCall('customTool', undefined)).rejects.toThrow(
        'Missing required parameters'
      );
    });

    it('should throw error if args is not an object', async () => {
      await expect(
        // @ts-expect-error Testing invalid type
        customToolService.handleCustomToolCall('customTool', 'invalid')
      ).rejects.toThrow('Invalid arguments: arguments must be an object');
    });

    it('should throw error if server is missing', async () => {
      await expect(
        customToolService.handleCustomToolCall('customTool', { tool: 'tool1' })
      ).rejects.toThrow('Invalid arguments: server must be a string');
    });

    it('should throw error if tool is missing', async () => {
      await expect(
        customToolService.handleCustomToolCall('customTool', { server: 'server1' })
      ).rejects.toThrow('Invalid arguments: tool must be a string');
    });

    it('should throw error if client is not found', async () => {
      vi.mocked(clientMappingService.getClientForCustomTool).mockReturnValue(undefined);

      await expect(
        customToolService.handleCustomToolCall('customTool', {
          server: 'server1',
          tool: 'tool1',
        })
      ).rejects.toThrow('Unknown subtool');
    });

    it('should forward call to the appropriate client', async () => {
      // Setup mock client request
      const requestSpy = vi
        .spyOn(mockClient1.client, 'request')
        .mockResolvedValue({ result: 'success' });

      const result = await customToolService.handleCustomToolCall(
        'customTool',
        {
          server: 'server1',
          tool: 'tool1',
          args: { param1: 'value1' },
        },
        { progressToken: 'token123' }
      );

      // Check client lookup
      expect(clientMappingService.getClientForCustomTool).toHaveBeenCalledWith(
        'customTool:server1:tool1'
      );

      // Check request
      expect(requestSpy).toHaveBeenCalledWith(
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
        expect.anything()
      );

      // Check result
      expect(result).toEqual({ result: 'success' });
    });

    it('should handle client errors', async () => {
      // Setup mock client request to throw
      vi.spyOn(mockClient1.client, 'request').mockRejectedValue(new Error('Client error'));

      await expect(
        customToolService.handleCustomToolCall('customTool', {
          server: 'server1',
          tool: 'tool1',
        })
      ).rejects.toThrow('Client error');

      expect(consoleMock.error).toHaveBeenCalledWith(
        expect.stringContaining('Error calling customTool subtool server1/tool1'),
        expect.any(Error)
      );
    });
  });
});
