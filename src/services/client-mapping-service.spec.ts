import { describe, it, expect, beforeEach } from 'vitest';
import { ClientMappingService } from './client-mapping-service.js';
import { ConnectedClient } from '../client.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

describe('ClientMappingService', () => {
  let clientMappingService: ClientMappingService;
  let mockClient1: ConnectedClient;
  let mockClient2: ConnectedClient;

  beforeEach(() => {
    clientMappingService = new ClientMappingService();

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
      clientMappingService.mapToolToClient('tool1', mockClient1);
      expect(clientMappingService.getClientForTool('tool1')).toBe(mockClient1);
    });

    it('should clear tool mappings', () => {
      clientMappingService.mapToolToClient('tool1', mockClient1);
      clientMappingService.mapToolToClient('tool2', mockClient2);

      clientMappingService.clearToolMap();

      expect(clientMappingService.getClientForTool('tool1')).toBeUndefined();
      expect(clientMappingService.getClientForTool('tool2')).toBeUndefined();
    });

    it('should update tool mapping when mapping same tool to different client', () => {
      clientMappingService.mapToolToClient('tool1', mockClient1);
      clientMappingService.mapToolToClient('tool1', mockClient2);

      expect(clientMappingService.getClientForTool('tool1')).toBe(mockClient2);
    });
  });

  describe('Custom tool mappings', () => {
    it('should map a custom tool to a client', () => {
      clientMappingService.mapCustomToolToClient('customTool:client1:tool1', mockClient1);
      expect(clientMappingService.getClientForCustomTool('customTool:client1:tool1')).toBe(
        mockClient1
      );
    });

    it('should clear custom tool mappings', () => {
      clientMappingService.mapCustomToolToClient('customTool:client1:tool1', mockClient1);
      clientMappingService.mapCustomToolToClient('customTool:client2:tool2', mockClient2);

      clientMappingService.clearCustomToolMap();

      expect(
        clientMappingService.getClientForCustomTool('customTool:client1:tool1')
      ).toBeUndefined();
      expect(
        clientMappingService.getClientForCustomTool('customTool:client2:tool2')
      ).toBeUndefined();
    });

    it('should update custom tool mapping when mapping same key to different client', () => {
      clientMappingService.mapCustomToolToClient('customTool:client:tool', mockClient1);
      clientMappingService.mapCustomToolToClient('customTool:client:tool', mockClient2);

      expect(clientMappingService.getClientForCustomTool('customTool:client:tool')).toBe(
        mockClient2
      );
    });
  });
});
