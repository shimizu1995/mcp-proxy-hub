import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectedClient, restartClient } from '../client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { loadConfig } from '../config.js';
import { clientMaps } from '../mappers/client-maps.js';
import {
  handleGetPromptRequest,
  handleListPromptsRequest,
  handleRestartServerPrompt,
} from './prompt-handlers.js';

// Mock dependencies
vi.mock('../client.js', () => ({
  restartClient: vi.fn(),
}));

vi.mock('../mappers/client-maps.js', () => ({
  clientMaps: {
    getClientForPrompt: vi.fn(),
    clearPromptMap: vi.fn(),
    mapPromptToClient: vi.fn(),
    registerPrompt: vi.fn(),
  },
}));

vi.mock('../config.js', () => ({
  loadConfig: vi.fn(),
}));

describe('Prompt Handlers', () => {
  let mockClient1: ConnectedClient;
  let mockClient2: ConnectedClient;
  let connectedClients: ConnectedClient[];

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock clients
    const mockClientObj1 = {
      request: vi.fn(),
    } as unknown as Client;

    mockClient1 = {
      client: mockClientObj1,
      name: 'client1',
      cleanup: async () => {},
    };

    const mockClientObj2 = {
      request: vi.fn(),
    } as unknown as Client;

    mockClient2 = {
      client: mockClientObj2,
      name: 'client2',
      cleanup: async () => {},
    };

    connectedClients = [mockClient1, mockClient2];
  });

  describe('handleGetPromptRequest', () => {
    it('should handle regular prompt requests', async () => {
      // Mock getClientForPrompt to return a client
      vi.mocked(clientMaps.getClientForPrompt).mockReturnValueOnce(mockClient1);

      // Mock client.request to return a response
      const mockResponse = { content: 'Test content' };
      (mockClient1.client.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

      // Create a request object
      const request = {
        params: {
          name: 'test_prompt',
          arguments: { param1: 'value1' },
        },
        method: 'prompts/get' as const,
      };

      // Call the handler with the request
      const result = await handleGetPromptRequest(request);

      // Verify client.request was called with correct params
      expect(mockClient1.client.request).toHaveBeenCalledWith(
        {
          method: 'prompts/get',
          params: {
            name: 'test_prompt',
            arguments: { param1: 'value1' },
            _meta: {
              progressToken: undefined,
            },
          },
        },
        expect.anything()
      );

      // Verify result
      expect(result).toEqual(mockResponse);
    });

    it('should handle restart_server prompt with specific server', async () => {
      // Mock loadConfig
      const mockConfig = {
        mcpServers: {
          server1: { command: 'cmd1' },
        },
      };
      vi.mocked(loadConfig).mockResolvedValueOnce(mockConfig);

      // Mock restartClient to return a client
      vi.mocked(restartClient).mockResolvedValueOnce({
        name: 'server1',
        client: {} as unknown as Client,
        cleanup: async () => {},
      });

      // Create a request object
      const request = {
        params: {
          name: 'restart_server',
          arguments: { server: 'server1' },
        },
        method: 'prompts/get' as const,
      };

      // Call the handler with the request
      const result = await handleGetPromptRequest(request);

      // Verify config was loaded
      expect(loadConfig).toHaveBeenCalledTimes(1);

      // Verify client restart was attempted
      expect(restartClient).toHaveBeenCalledTimes(1);
      expect(restartClient).toHaveBeenCalledWith('server1', { command: 'cmd1' });

      // Verify result
      expect(result).toEqual({
        content: 'Successfully restarted server: server1',
        metadata: { success: true, server: 'server1' },
      });
    });

    it('should handle restart_server prompt with all servers', async () => {
      // Mock loadConfig
      const mockConfig = {
        mcpServers: {
          server1: { command: 'cmd1' },
          server2: { command: 'cmd2' },
        },
      };
      vi.mocked(loadConfig).mockResolvedValueOnce(mockConfig);

      // Mock restartClient to return success for server1 and failure for server2
      vi.mocked(restartClient).mockResolvedValueOnce({
        name: 'server1',
        client: {} as unknown as Client,
        cleanup: async () => {},
      });
      vi.mocked(restartClient).mockResolvedValueOnce(null);

      // Create a request object
      const request = {
        params: {
          name: 'restart_server',
          arguments: { server: 'all' },
        },
        method: 'prompts/get' as const,
      };

      // Call the handler with the request
      const result = await handleGetPromptRequest(request);

      // Verify config was loaded
      expect(loadConfig).toHaveBeenCalledTimes(1);

      // Verify client restart was attempted for both servers
      expect(restartClient).toHaveBeenCalledTimes(2);
      expect(restartClient).toHaveBeenCalledWith('server1', { command: 'cmd1' });
      expect(restartClient).toHaveBeenCalledWith('server2', { command: 'cmd2' });

      // Verify result
      expect(result).toEqual({
        content: 'Restarted 1/2 servers.',
        metadata: {
          restarted_servers: [
            { name: 'server1', success: true },
            { name: 'server2', success: false },
          ],
        },
      });
    });

    it('should handle restart_server prompt with non-existent server', async () => {
      // Mock loadConfig
      const mockConfig = {
        mcpServers: {
          server1: { command: 'cmd1' },
        },
      };
      vi.mocked(loadConfig).mockResolvedValueOnce(mockConfig);

      // Create a request object with a non-existent server
      const request = {
        params: {
          name: 'restart_server',
          arguments: { server: 'non-existent-server' },
        },
        method: 'prompts/get' as const,
      };

      // Call the handler with the request
      const result = await handleGetPromptRequest(request);

      // Verify config was loaded
      expect(loadConfig).toHaveBeenCalledTimes(1);

      // Verify no client restart was attempted
      expect(restartClient).not.toHaveBeenCalled();

      // Verify error result
      expect(result).toEqual({
        content: "Error restarting server: Server 'non-existent-server' not found in configuration",
        metadata: {
          success: false,
          error: "Server 'non-existent-server' not found in configuration",
        },
      });
    });

    it('should handle restart_server prompt with missing server argument', async () => {
      // Create a request object without a server argument
      const request = {
        params: {
          name: 'restart_server',
          arguments: {}, // Empty arguments
        },
        method: 'prompts/get' as const,
      };

      try {
        // Call the handler with the request
        await handleGetPromptRequest(request);
        // If it doesn't throw, the test should fail
        expect(true).toBe(false);
      } catch (error: unknown) {
        // Verify error message
        if (error instanceof Error) {
          expect(error.message).toBe('Server name is required to restart a server');
        } else {
          // If it's not an Error instance, the test should fail
          expect(true).toBe(false);
        }
      }
    });

    it('should handle restart_server prompt with server restart error', async () => {
      // Mock loadConfig
      const mockConfig = {
        mcpServers: {
          server1: { command: 'cmd1' },
        },
      };
      vi.mocked(loadConfig).mockResolvedValueOnce(mockConfig);

      // Mock restartClient to throw an error
      const errorMessage = 'Failed to start process';
      vi.mocked(restartClient).mockRejectedValueOnce(new Error(errorMessage));

      // Create a request object
      const request = {
        params: {
          name: 'restart_server',
          arguments: { server: 'server1' },
        },
        method: 'prompts/get' as const,
      };

      // Call the handler with the request
      const result = await handleGetPromptRequest(request);

      // Verify error handling
      expect(result).toEqual({
        content: `Error restarting server: ${errorMessage}`,
        metadata: {
          success: false,
          error: errorMessage,
        },
      });
    });
  });

  describe('handleListPromptsRequest', () => {
    it('should include restart_server prompt in the list', async () => {
      // Mock client.request for both clients to return empty prompt arrays
      (mockClient1.client.request as ReturnType<typeof vi.fn>).mockResolvedValue({ prompts: [] });
      (mockClient2.client.request as ReturnType<typeof vi.fn>).mockResolvedValue({ prompts: [] });

      // Create a request object
      const request = {
        params: {},
        method: 'prompts/list' as const,
      };

      // Call the handler with the request
      const result = await handleListPromptsRequest(request, connectedClients);

      // Verify that restart_server prompt is included
      expect(result.prompts).toContainEqual({
        arguments: [
          {
            description: 'The name of the server to restart, or "all" to restart all servers',
            name: 'server',
            required: true,
          },
        ],
        description: 'Restart a specified server or all servers',
        name: 'restart_server',
      });
    });

    it('should aggregate prompts from multiple clients', async () => {
      // Mock client.request to return different prompt arrays
      (mockClient1.client.request as ReturnType<typeof vi.fn>).mockResolvedValue({
        prompts: [
          {
            name: 'prompt1',
            description: 'Prompt 1 description',
          },
        ],
      });

      (mockClient2.client.request as ReturnType<typeof vi.fn>).mockResolvedValue({
        prompts: [
          {
            name: 'prompt2',
            description: 'Prompt 2 description',
          },
        ],
      });

      // Create a request object
      const request = {
        params: {},
        method: 'prompts/list' as const,
      };

      // Call the handler with the request
      const result = await handleListPromptsRequest(request, connectedClients);

      // Verify that all prompts are included with server names in descriptions
      expect(result.prompts).toContainEqual({
        name: 'prompt1',
        description: '[client1] Prompt 1 description',
      });

      expect(result.prompts).toContainEqual({
        name: 'prompt2',
        description: '[client2] Prompt 2 description',
      });

      // Verify that mapPromptToClient was called for each prompt
      expect(clientMaps.mapPromptToClient).toHaveBeenCalledWith('prompt1', mockClient1);
      expect(clientMaps.mapPromptToClient).toHaveBeenCalledWith('prompt2', mockClient2);
    });

    it('should handle errors from client request', async () => {
      // Mock client1.request to throw an error
      const errorMessage = 'Failed to fetch prompts';
      (mockClient1.client.request as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error(errorMessage)
      );

      // Mock client2.request to return prompts normally
      (mockClient2.client.request as ReturnType<typeof vi.fn>).mockResolvedValue({
        prompts: [
          {
            name: 'prompt2',
            description: 'Prompt 2 description',
          },
        ],
      });

      // Create a request object
      const request = {
        params: {},
        method: 'prompts/list' as const,
      };

      // Call the handler with the request
      const result = await handleListPromptsRequest(request, connectedClients);

      // Verify that we still get the prompts from client2
      expect(result.prompts).toContainEqual({
        name: 'prompt2',
        description: '[client2] Prompt 2 description',
      });

      // Verify that restart_server prompt is still included
      expect(result.prompts).toContainEqual({
        arguments: [
          {
            description: 'The name of the server to restart, or "all" to restart all servers',
            name: 'server',
            required: true,
          },
        ],
        description: 'Restart a specified server or all servers',
        name: 'restart_server',
      });
    });
  });

  describe('handleRestartServerPrompt', () => {
    it('should restart a specific server', async () => {
      // Mock loadConfig
      const mockConfig = {
        mcpServers: {
          server1: { command: 'cmd1' },
        },
      };
      vi.mocked(loadConfig).mockResolvedValueOnce(mockConfig);

      // Mock restartClient to return a client
      vi.mocked(restartClient).mockResolvedValueOnce({
        name: 'server1',
        client: {} as unknown as Client,
        cleanup: async () => {},
      });

      // Create a request object
      const request = {
        params: {
          name: 'restart_server',
          arguments: { server: 'server1' },
        },
        method: 'prompts/get' as const,
      };

      // Call the handler with the request
      const result = await handleRestartServerPrompt(request);

      // Verify result
      expect(result).toEqual({
        content: 'Successfully restarted server: server1',
        metadata: { success: true, server: 'server1' },
      });
    });
  });
});
