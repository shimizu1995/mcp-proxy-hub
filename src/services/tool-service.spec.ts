import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ToolService } from './tool-service.js';
import { ServerConfig } from '../models/config.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';

// Mock the clientMappingService
vi.mock('./client-mapping-service.js', () => ({
  clientMappingService: {
    mapToolToClient: vi.fn(),
    getClientForTool: vi.fn(),
    clearToolMap: vi.fn(),
  },
}));

// Mock console.error to avoid noise in tests
vi.spyOn(console, 'error').mockImplementation(() => {});

describe('ToolService', () => {
  let toolService: ToolService;

  beforeEach(() => {
    vi.clearAllMocks();
    toolService = new ToolService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('filterTools', () => {
    const tools: Tool[] = [
      { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object' } },
      { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object' } },
      { name: 'tool3', description: 'Tool 3', inputSchema: { type: 'object' } },
    ];

    it('should return empty array if tools is falsy', () => {
      const result = toolService.filterTools(null, {});
      expect(result).toEqual([]);
    });

    it('should return all tools when serverConfig is empty', () => {
      const result = toolService.filterTools(tools, {});
      expect(result).toEqual(tools);
    });

    it('should filter tools based on exposedTools', () => {
      const serverConfig: ServerConfig = { exposedTools: ['tool1', 'tool3'] };
      const result = toolService.filterTools(tools, serverConfig);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('tool1');
      expect(result[1].name).toBe('tool3');
    });

    it('should filter tools based on exposedTools with object config', () => {
      const serverConfig: ServerConfig = {
        exposedTools: ['tool1', { original: 'tool2', exposed: 'renamedTool2' }],
      };
      const result = toolService.filterTools(tools, serverConfig);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('tool1');
      expect(result[1].name).toBe('tool2');
    });

    it('should filter tools based on hiddenTools', () => {
      const serverConfig: ServerConfig = { hiddenTools: ['tool2'] };
      const result = toolService.filterTools(tools, serverConfig);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('tool1');
      expect(result[1].name).toBe('tool3');
    });

    it('should prioritize exposedTools over hiddenTools', () => {
      const serverConfig: ServerConfig = {
        exposedTools: ['tool1', 'tool2'],
        hiddenTools: ['tool2', 'tool3'],
      };
      const result = toolService.filterTools(tools, serverConfig);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('tool1');
      expect(result[1].name).toBe('tool2');
    });
  });

  describe('processToolName', () => {
    it('should return the original name if serverConfig.exposedTools is undefined', () => {
      const result = toolService.processToolName('tool1', {});
      expect(result).toBe('tool1');
    });

    it('should return the original name if tool is not configured for renaming', () => {
      const serverConfig: ServerConfig = {
        exposedTools: ['tool1', 'tool2'],
      };
      const result = toolService.processToolName('tool1', serverConfig);
      expect(result).toBe('tool1');
    });

    it('should return the exposed name if tool is configured for renaming', () => {
      const serverConfig: ServerConfig = {
        exposedTools: ['tool1', { original: 'tool2', exposed: 'renamedTool2' }],
      };
      const result = toolService.processToolName('tool2', serverConfig);
      expect(result).toBe('renamedTool2');
    });

    it('should handle multiple tools configured for renaming', () => {
      const serverConfig: ServerConfig = {
        exposedTools: [
          { original: 'tool1', exposed: 'renamedTool1' },
          { original: 'tool2', exposed: 'renamedTool2' },
        ],
      };
      const result1 = toolService.processToolName('tool1', serverConfig);
      const result2 = toolService.processToolName('tool2', serverConfig);
      expect(result1).toBe('renamedTool1');
      expect(result2).toBe('renamedTool2');
    });
  });

  describe('prefixToolDescription', () => {
    it('should prefix the tool description with client name', () => {
      const tool: Tool = {
        name: 'tool1',
        description: 'Tool 1 description',
        inputSchema: { type: 'object' },
      };
      const result = toolService.prefixToolDescription(tool, 'client1');
      expect(result.description).toBe('[client1] Tool 1 description');
    });

    it('should preserve all other tool properties', () => {
      const tool: Tool = {
        name: 'tool1',
        description: 'Tool 1 description',
        inputSchema: { type: 'object' },
        originalName: 'originalTool1',
      };
      const result = toolService.prefixToolDescription(tool, 'client1');
      expect(result).toEqual({
        name: 'tool1',
        description: '[client1] Tool 1 description',
        inputSchema: { type: 'object' },
        originalName: 'originalTool1',
      });
    });
  });

  describe('isToolAllowed', () => {
    it('should return true if no server config exists', () => {
      const result = toolService.isToolAllowed('tool1', 'client1', {});
      expect(result).toBe(true);
    });

    it('should return true if server config exists but has no tool filters', () => {
      const serverConfigs = {
        client1: {},
      };
      const result = toolService.isToolAllowed('tool1', 'client1', serverConfigs);
      expect(result).toBe(true);
    });

    it('should return false if tool is not in exposedTools', () => {
      const serverConfigs = {
        client1: { exposedTools: ['tool2', 'tool3'] },
      };
      const result = toolService.isToolAllowed('tool1', 'client1', serverConfigs);
      expect(result).toBe(false);
    });

    it('should return true if tool is in exposedTools', () => {
      const serverConfigs = {
        client1: { exposedTools: ['tool1', 'tool2'] },
      };
      const result = toolService.isToolAllowed('tool1', 'client1', serverConfigs);
      expect(result).toBe(true);
    });

    it('should check original tool name in exposedTools object configs', () => {
      const serverConfigs = {
        client1: {
          exposedTools: [{ original: 'tool1', exposed: 'renamedTool1' }, 'tool2'],
        },
      };
      const result = toolService.isToolAllowed('tool1', 'client1', serverConfigs);
      expect(result).toBe(true);
    });

    it('should return false if tool is in hiddenTools', () => {
      const serverConfigs = {
        client1: { hiddenTools: ['tool1', 'tool3'] },
      };
      const result = toolService.isToolAllowed('tool1', 'client1', serverConfigs);
      expect(result).toBe(false);
    });

    it('should prioritize exposedTools over hiddenTools', () => {
      const serverConfigs = {
        client1: {
          exposedTools: ['tool1', 'tool2'],
          hiddenTools: ['tool1', 'tool3'],
        },
      };
      const result = toolService.isToolAllowed('tool1', 'client1', serverConfigs);
      // The tool is exposed, so it should be allowed despite being in hiddenTools
      expect(result).toBe(true);
    });
  });
});
