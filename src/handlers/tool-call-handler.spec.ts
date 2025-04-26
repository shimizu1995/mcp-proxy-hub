import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleToolCall } from './tool-call-handler.js';
import { toolService } from '../services/tool-service.js';
import { customToolService } from '../services/custom-tool-service.js';
import { clientMaps } from '../mappers/client-maps.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ConnectedClient } from '../client.js';
import { Config, ServerName, ServerConfig } from '../config.js';

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

vi.mock('../mappers/client-maps.js', () => ({
  clientMaps: {
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
  let serverConfigs: Record<ServerName, ServerConfig>;
  const originalEnv = process.env;

  let config: Config;

  beforeEach(() => {
    vi.clearAllMocks();

    process.env = {
      ...originalEnv,
      TEST_VAR: 'test-value',
      API_KEY: 'secret-api-key',
      USER_ID: '12345',
    };

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
        envVars: [
          { name: 'TEST_VAR', value: 'test-value', expand: true, unexpand: true },
          { name: 'API_KEY', value: 'secret-api-key', expand: true, unexpand: false },
        ],
      },
    };

    config = {
      mcpServers: serverConfigs,
      envVars: [{ name: 'GLOBAL_VAR', value: 'global-value', expand: true, unexpand: true }],
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw error when tool is not found', async () => {
    // Mock getClientForTool to return undefined
    vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(undefined);

    const request = {
      method: 'tools/call' as const,
      params: {
        name: 'unknownTool',
        arguments: {},
      },
    };

    await expect(handleToolCall(request, config)).rejects.toThrow('Unknown tool: unknownTool');
  });

  it('should handle custom tool call', async () => {
    // Mock getClientForTool to return the custom client
    vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(mockCustomClient);

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

    const result = await handleToolCall(request, config);

    // Verify handleCustomToolCall was called
    expect(customToolService.handleCustomToolCall).toHaveBeenCalledWith(
      'customTool',
      { server: 'server1', tool: 'tool1' },
      { progressToken: 'token123' },
      config.mcpServers,
      config.envVars
    );

    // Verify validateToolAccess was not called
    expect(toolService.validateToolAccess).not.toHaveBeenCalled();

    // Verify result
    expect(result).toBe(mockResult);
  });

  it('should handle regular tool call with environment variable expansion', async () => {
    // Mock getClientForTool to return a client
    vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(mockClient);

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

    const result = await handleToolCall(request, config);

    // Verify executeToolCall was called
    expect(toolService.executeToolCall).toHaveBeenCalledWith(
      'tool1',
      { param1: 'value1' }, // Mocked expandEnvVars just returns the input
      mockClient,
      { progressToken: 'token123' },
      undefined
    );

    // Verify result
    expect(result).toStrictEqual(mockResult);
  });

  it('should handle tool with original name mapping', async () => {
    // Setup client with tool mapping
    mockClient.client.toolMappings = {
      renamedTool: 'originalTool',
    };

    // Mock getClientForTool to return the client
    vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(mockClient);

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

    await handleToolCall(request, config);

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
    vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(mockClient);

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

    const result = await handleToolCall(request, config);

    // Verify executeToolCall was called with undefined arguments
    expect(toolService.executeToolCall).toHaveBeenCalledWith(
      'tool1',
      {}, // Empty object instead of undefined
      mockClient,
      undefined,
      undefined
    );

    // Verify result
    expect(result).toStrictEqual(mockResult);
  });

  it('should handle tool call with sensitive information in arguments and response', async () => {
    // Mock getClientForTool to return a client
    vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(mockClient);

    // Mock executeToolCall to return a result with sensitive data
    const mockResult = {
      success: true,
      data: 'Response contains test-value token',
    };
    vi.mocked(toolService.executeToolCall).mockResolvedValueOnce(mockResult);

    const request = {
      method: 'tools/call' as const,
      params: {
        name: 'sensitiveDataTool',
        arguments: { apiKey: '${API_KEY}', userId: 'user123' },
      },
    };

    const result = await handleToolCall(request, config);

    // Verify executeToolCall was called with expanded variables
    expect(toolService.executeToolCall).toHaveBeenCalledWith(
      'sensitiveDataTool',
      { apiKey: 'secret-api-key', userId: 'user123' },
      mockClient,
      undefined,
      undefined
    );

    // Check the result has unexpanded values
    expect(result).toEqual({
      success: true,
      data: 'Response contains ${TEST_VAR} token',
    });
  });

  it('should pass additional properties in params to executeToolCall', async () => {
    // Mock getClientForTool to return a client
    vi.mocked(clientMaps.getClientForTool).mockReturnValueOnce(mockClient);

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

    await handleToolCall(request, config);

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
