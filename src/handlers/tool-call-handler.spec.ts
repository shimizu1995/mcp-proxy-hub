import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleToolCall } from './tool-call-handler.js';
import { toolService } from '../services/tool-service.js';
import { customToolService } from '../services/custom-tool-service.js';
import { clientMappingService } from '../services/client-mapping-service.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ConnectedClient } from '../client.js';

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

describe('Tool Call Handler', () => {
  let mockClient: ConnectedClient;
  let mockCustomClient: ConnectedClient;
  let serverConfigs: Record<string, Record<string, unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = {
      client: {
        toolMappings: {},
        request: vi.fn(),
      } as unknown as Client,
      name: 'client1',
      cleanup: async () => {},
    };

    mockCustomClient = {
      client: {} as Client,
      name: 'custom',
      cleanup: async () => {},
    };

    serverConfigs = {
      client1: {
        command: 'test-command',
      },
    };
  });

  it('should throw error when tool is not found', async () => {
    // Mock getClientForTool to return undefined
    vi.mocked(clientMappingService.getClientForTool).mockReturnValueOnce(undefined);

    const request = {
      method: 'tools/call' as const,
      params: {
        name: 'unknownTool',
        arguments: {},
      },
    };

    await expect(handleToolCall(request, serverConfigs)).rejects.toThrow(
      'Unknown tool: unknownTool'
    );
  });

  it('should handle custom tool call', async () => {
    // Mock getClientForTool to return the custom client
    vi.mocked(clientMappingService.getClientForTool).mockReturnValueOnce(mockCustomClient);

    // Mock handleCustomToolCall to return a result
    const mockResult = { result: 'custom-success' };
    vi.mocked(customToolService.handleCustomToolCall).mockResolvedValueOnce(mockResult);

    const request = {
      method: 'tools/call' as const,
      params: {
        name: 'customTool',
        arguments: { server: 'server1', tool: 'tool1' },
        _meta: { progressToken: 'token123' },
      },
    };

    const result = await handleToolCall(request, serverConfigs);

    // Verify handleCustomToolCall was called
    expect(customToolService.handleCustomToolCall).toHaveBeenCalledWith(
      'customTool',
      { server: 'server1', tool: 'tool1' },
      { progressToken: 'token123' }
    );

    // Verify validateToolAccess was not called
    expect(toolService.validateToolAccess).not.toHaveBeenCalled();

    // Verify result
    expect(result).toBe(mockResult);
  });

  it('should handle regular tool call', async () => {
    // Mock getClientForTool to return a client
    vi.mocked(clientMappingService.getClientForTool).mockReturnValueOnce(mockClient);

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
      mockClient,
      { progressToken: 'token123' },
      undefined
    );

    // Verify result
    expect(result).toBe(mockResult);
  });

  it('should handle tool with original name mapping', async () => {
    // Setup client with tool mapping
    mockClient.client.toolMappings = {
      renamedTool: 'originalTool',
    };

    // Mock getClientForTool to return the client
    vi.mocked(clientMappingService.getClientForTool).mockReturnValueOnce(mockClient);

    // Mock executeToolCall to return a result
    const mockResult = { result: 'success' };
    vi.mocked(toolService.executeToolCall).mockResolvedValueOnce(mockResult);

    const request = {
      method: 'tools/call' as const,
      params: {
        name: 'renamedTool',
        arguments: {},
      },
    };

    await handleToolCall(request, serverConfigs);

    // Verify validateToolAccess and executeToolCall were called with the original name
    expect(toolService.validateToolAccess).toHaveBeenCalledWith(
      'renamedTool',
      'originalTool',
      serverConfigs.client1
    );

    expect(toolService.executeToolCall).toHaveBeenCalledWith(
      'renamedTool',
      {},
      mockClient,
      undefined,
      'originalTool'
    );
  });

  it('should handle tool call with undefined arguments', async () => {
    // Mock getClientForTool to return a client
    vi.mocked(clientMappingService.getClientForTool).mockReturnValueOnce(mockClient);

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

    const result = await handleToolCall(request, serverConfigs);

    // Verify executeToolCall was called with undefined arguments
    expect(toolService.executeToolCall).toHaveBeenCalledWith(
      'tool1',
      {}, // Empty object instead of undefined
      mockClient,
      undefined,
      undefined
    );

    // Verify result
    expect(result).toBe(mockResult);
  });

  it('should pass additional properties in params to executeToolCall', async () => {
    // Mock getClientForTool to return a client
    vi.mocked(clientMappingService.getClientForTool).mockReturnValueOnce(mockClient);

    // Mock executeToolCall to return a result
    vi.mocked(toolService.executeToolCall).mockResolvedValueOnce({ result: 'success' });

    const request = {
      method: 'tools/call' as const,
      params: {
        name: 'tool1',
        arguments: { param1: 'value1' },
        _meta: { progressToken: 'token123' },
        additionalProp: 'some-value',
      },
    };

    await handleToolCall(request, serverConfigs);

    // Verify executeToolCall was called with the correct parameters
    expect(toolService.executeToolCall).toHaveBeenCalledWith(
      'tool1',
      { param1: 'value1' },
      mockClient,
      { progressToken: 'token123' },
      undefined
    );
  });
});
