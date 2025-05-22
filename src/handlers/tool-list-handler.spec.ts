import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleListToolsRequest } from './tool-list-handler.js';
import { ConnectedClient } from '../client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { ServerConfigs } from '../config.js';

describe('Tool List Handler', () => {
  let mockClient1: ConnectedClient;
  let mockClient2: ConnectedClient;
  let connectedClients: ConnectedClient[];
  let serverConfigs: ServerConfigs;

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

    // Mock client.request for each connected client
    vi.spyOn(mockClient1.client, 'request').mockImplementation(() =>
      Promise.resolve({
        tools: [{ name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } }],
      })
    );

    vi.spyOn(mockClient2.client, 'request').mockImplementation(() =>
      Promise.resolve({
        tools: [{ name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } }],
      })
    );
  });

  it('should clear tool map and aggregate tools from all clients', async () => {
    const request = {
      method: 'tools/list' as const,
      params: { _meta: { test: 'metadata' } },
    };

    const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

    // Verify client.request was called with correct parameters
    expect(mockClient1.client.request).toHaveBeenCalledWith(
      {
        method: 'tools/list',
        params: { _meta: { test: 'metadata' } },
      },
      ListToolsResultSchema
    );
    expect(mockClient2.client.request).toHaveBeenCalledWith(
      {
        method: 'tools/list',
        params: { _meta: { test: 'metadata' } },
      },
      ListToolsResultSchema
    );

    // Verify the result contains tools from both clients (with prefixed descriptions)
    expect(result.tools).toEqual([
      { name: 'tool1', description: '[client1] Tool 1', inputSchema: { type: 'object' } },
      { name: 'tool2', description: '[client2] Tool 2', inputSchema: { type: 'object' } },
    ]);
  });

  it('should add custom tools to the result', async () => {
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

    // The result will include both client tools and custom tools
    expect(result.tools).toHaveLength(3);
    expect(result.tools).toEqual(
      expect.arrayContaining([
        { name: 'tool1', description: '[client1] Tool 1', inputSchema: { type: 'object' } },
        { name: 'tool2', description: '[client2] Tool 2', inputSchema: { type: 'object' } },
        expect.objectContaining({
          name: 'customTool',
          description: expect.stringContaining('Available subtools'),
        }),
      ])
    );
  });

  it('should handle empty tool lists', async () => {
    // Mock clients to return empty tools
    vi.mocked(mockClient1.client.request).mockResolvedValue({ tools: [] });
    vi.mocked(mockClient2.client.request).mockResolvedValue({ tools: [] });

    const request = {
      method: 'tools/list' as const,
      params: {},
    };

    const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

    // Verify result is empty when no tools are available
    expect(result).toEqual({ tools: [] });
  });

  it('should map tools to their respective clients through client.request', async () => {
    const request = {
      method: 'tools/list' as const,
      params: {},
    };

    await handleListToolsRequest(request, connectedClients, serverConfigs);

    // Verify that client.request was called for each client
    expect(mockClient1.client.request).toHaveBeenCalledWith(
      {
        method: 'tools/list',
        params: {},
      },

      ListToolsResultSchema
    );
    expect(mockClient2.client.request).toHaveBeenCalledWith(
      {
        method: 'tools/list',
        params: {},
      },
      ListToolsResultSchema
    );
  });

  it('should handle tool name mappings from server config', async () => {
    // Mock client1 to return a tool that should be mapped
    vi.mocked(mockClient1.client.request).mockResolvedValue({
      tools: [
        { name: 'originalTool', description: 'Original Tool', inputSchema: { type: 'object' } },
      ],
    });

    // Add exposedTools with mapping to server config
    serverConfigs.client1 = {
      ...serverConfigs.client1,
      exposedTools: [{ original: 'originalTool', exposed: 'exposedTool' }],
    };

    const request = {
      method: 'tools/list' as const,
      params: {},
    };

    const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

    // Verify client.request was called
    expect(mockClient1.client.request).toHaveBeenCalledWith(
      {
        method: 'tools/list',
        params: {},
      },
      expect.any(Object)
    );

    // The result should contain the mapped tool (actual mapping behavior depends on implementation)
    expect(result.tools).toBeDefined();
    expect(Array.isArray(result.tools)).toBe(true);
  });

  it('should return tools with exposed names when mapping is configured', async () => {
    // Mock client1 to return original tool
    vi.mocked(mockClient1.client.request).mockResolvedValue({
      tools: [
        { name: 'originalTool', description: 'Original Tool', inputSchema: { type: 'object' } },
      ],
    });

    // Mock client2 to return empty tools
    vi.mocked(mockClient2.client.request).mockResolvedValue({ tools: [] });

    // Configure serverConfigs for client1 with tool name mapping
    serverConfigs.client1 = {
      ...serverConfigs.client1,
      exposedTools: [{ original: 'originalTool', exposed: 'exposedTool' }],
    };
    // Reset client2 config to avoid interference
    serverConfigs.client2 = {
      ...serverConfigs.client2,
      exposedTools: undefined,
      hiddenTools: undefined,
    };

    const request = {
      method: 'tools/list' as const,
      params: {},
    };

    const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

    // The tool should be exposed with the mapped name 'exposedTool', not the original name 'originalTool'
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe('exposedTool'); // This should fail with current implementation
    expect(result.tools[0].description).toBe('[client1] Original Tool');
  });

  it('should expose tools only with mapped names when original/exposed configuration is provided', async () => {
    // Mock client1 to return multiple tools including ones with mappings
    vi.mocked(mockClient1.client.request).mockResolvedValue({
      tools: [
        { name: 'tool_a', description: 'Tool A', inputSchema: { type: 'object' } },
        { name: 'tool_b', description: 'Tool B', inputSchema: { type: 'object' } },
        { name: 'tool_c', description: 'Tool C', inputSchema: { type: 'object' } },
      ],
    });

    // Mock client2 to return empty tools
    vi.mocked(mockClient2.client.request).mockResolvedValue({ tools: [] });

    // Configure serverConfigs for client1 with selective tool exposure and name mapping
    serverConfigs.client1 = {
      ...serverConfigs.client1,
      exposedTools: [
        { original: 'tool_a', exposed: 'mapped_tool_a' },
        'tool_b', // exposed as-is
        // tool_c is not exposed
      ],
    };

    const request = {
      method: 'tools/list' as const,
      params: {},
    };

    const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

    // Should only expose 2 tools: mapped_tool_a and tool_b
    expect(result.tools).toHaveLength(2);

    // Find the mapped tool
    const mappedTool = result.tools.find((t) => t.name === 'mapped_tool_a');
    expect(mappedTool).toBeDefined();
    expect(mappedTool!.name).toBe('mapped_tool_a'); // Should be exposed name
    expect(mappedTool!.description).toBe('[client1] Tool A');

    // Find the non-mapped tool
    const nonMappedTool = result.tools.find((t) => t.name === 'tool_b');
    expect(nonMappedTool).toBeDefined();
    expect(nonMappedTool!.name).toBe('tool_b');
    expect(nonMappedTool!.description).toBe('[client1] Tool B');

    // tool_c should not be exposed at all
    const hiddenTool = result.tools.find((t) => t.name === 'tool_c');
    expect(hiddenTool).toBeUndefined();

    // originalTool names should not appear in the results
    const originalTool = result.tools.find((t) => t.name === 'tool_a');
    expect(originalTool).toBeUndefined();
  });

  it('should handle client.request errors gracefully', async () => {
    // Mock one client to throw an error
    vi.mocked(mockClient1.client.request).mockRejectedValue(new Error('Client error'));

    // Mock the other client to return normal response
    vi.mocked(mockClient2.client.request).mockResolvedValue({
      tools: [{ name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } }],
    });

    const request = {
      method: 'tools/list' as const,
      params: {},
    };

    const result = await handleListToolsRequest(request, connectedClients, serverConfigs);

    // Verify that the successful client's tools are still returned
    expect(result.tools).toEqual([
      { name: 'tool2', description: '[client2] Tool 2', inputSchema: { type: 'object' } },
    ]);
  });
});
