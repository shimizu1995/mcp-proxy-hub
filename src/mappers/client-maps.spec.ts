import { describe, it, expect, beforeEach } from 'vitest';
import { ClientMaps } from './client-maps.js';
import { ConnectedClient } from '../client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('ClientMaps', () => {
  let clientMaps: ClientMaps;
  let mockClient1: ConnectedClient;
  let mockClient2: ConnectedClient;

  beforeEach(() => {
    clientMaps = new ClientMaps();

    // Create mock clients
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
  });

  describe('Tool mappings', () => {
    it('should map a tool to a client', () => {
      clientMaps.mapToolToClient('tool1', mockClient1);
      expect(clientMaps.getClientForTool('tool1')).toBe(mockClient1);
    });

    it('should clear tool mappings', () => {
      clientMaps.mapToolToClient('tool1', mockClient1);
      clientMaps.mapToolToClient('tool2', mockClient2);

      clientMaps.clearToolMap();

      expect(clientMaps.getClientForTool('tool1')).toBeUndefined();
      expect(clientMaps.getClientForTool('tool2')).toBeUndefined();
    });

    it('should update tool mapping when mapping same tool to different client', () => {
      clientMaps.mapToolToClient('tool1', mockClient1);
      clientMaps.mapToolToClient('tool1', mockClient2);

      expect(clientMaps.getClientForTool('tool1')).toBe(mockClient2);
    });
  });

  describe('Custom tool mappings', () => {
    it('should map a custom tool to a client', () => {
      clientMaps.mapCustomToolToClient('customTool:client1:tool1', mockClient1);
      expect(clientMaps.getClientForCustomTool('customTool:client1:tool1')).toBe(mockClient1);
    });

    it('should clear custom tool mappings', () => {
      clientMaps.mapCustomToolToClient('customTool:client1:tool1', mockClient1);
      clientMaps.mapCustomToolToClient('customTool:client2:tool2', mockClient2);

      clientMaps.clearCustomToolMap();

      expect(clientMaps.getClientForCustomTool('customTool:client1:tool1')).toBeUndefined();
      expect(clientMaps.getClientForCustomTool('customTool:client2:tool2')).toBeUndefined();
    });

    it('should update custom tool mapping when mapping same key to different client', () => {
      clientMaps.mapCustomToolToClient('customTool:client:tool', mockClient1);
      clientMaps.mapCustomToolToClient('customTool:client:tool', mockClient2);

      expect(clientMaps.getClientForCustomTool('customTool:client:tool')).toBe(mockClient2);
    });
  });

  describe('Resource mappings', () => {
    it('should map a resource to a client', () => {
      clientMaps.mapResourceToClient('resource:uri', mockClient1);
      expect(clientMaps.getClientForResource('resource:uri')).toBe(mockClient1);
    });

    it('should clear resource mappings', () => {
      clientMaps.mapResourceToClient('resource1:uri', mockClient1);
      clientMaps.mapResourceToClient('resource2:uri', mockClient2);

      clientMaps.clearResourceMap();

      expect(clientMaps.getClientForResource('resource1:uri')).toBeUndefined();
      expect(clientMaps.getClientForResource('resource2:uri')).toBeUndefined();
    });
  });

  describe('Prompt mappings', () => {
    it('should map a prompt to a client', () => {
      clientMaps.mapPromptToClient('prompt1', mockClient1);
      expect(clientMaps.getClientForPrompt('prompt1')).toBe(mockClient1);
    });

    it('should clear prompt mappings', () => {
      clientMaps.mapPromptToClient('prompt1', mockClient1);
      clientMaps.mapPromptToClient('prompt2', mockClient2);

      clientMaps.clearPromptMap();

      expect(clientMaps.getClientForPrompt('prompt1')).toBeUndefined();
      expect(clientMaps.getClientForPrompt('prompt2')).toBeUndefined();
    });
  });

  describe('Connected clients', () => {
    it('should add a connected client', () => {
      clientMaps.addConnectedClient(mockClient1);
      expect(clientMaps.getAllClients().has(mockClient1)).toBe(true);
    });

    it('should get a client by name', () => {
      clientMaps.addConnectedClient(mockClient1);
      clientMaps.addConnectedClient(mockClient2);

      expect(clientMaps.getClientByName('client1')).toBe(mockClient1);
      expect(clientMaps.getClientByName('client2')).toBe(mockClient2);
      expect(clientMaps.getClientByName('nonexistent')).toBeUndefined();
    });

    it('should update a connected client', () => {
      // Add original clients
      clientMaps.addConnectedClient(mockClient1);
      clientMaps.addConnectedClient(mockClient2);

      // Map tools, resources, and prompts to clients
      clientMaps.mapToolToClient('tool1', mockClient1);
      clientMaps.mapCustomToolToClient('customTool:client1:tool1', mockClient1);
      clientMaps.mapResourceToClient('resource:uri', mockClient1);
      clientMaps.mapPromptToClient('prompt1', mockClient1);

      // Create a new client with same name
      const newClient: ConnectedClient = {
        client: new Client({
          name: 'client-1-new',
          version: '1.1.0',
        }),
        name: 'client1',
        cleanup: async () => {},
      };

      // Update the client
      clientMaps.updateConnectedClient('client1', newClient);

      // Check client was replaced in the set
      expect(clientMaps.getAllClients().has(mockClient1)).toBe(false);
      expect(clientMaps.getAllClients().has(newClient)).toBe(true);
      expect(clientMaps.getClientByName('client1')).toBe(newClient);

      // Check mappings were updated
      expect(clientMaps.getClientForTool('tool1')).toBe(newClient);
      expect(clientMaps.getClientForCustomTool('customTool:client1:tool1')).toBe(newClient);
      expect(clientMaps.getClientForResource('resource:uri')).toBe(newClient);
      expect(clientMaps.getClientForPrompt('prompt1')).toBe(newClient);
    });
  });
});
