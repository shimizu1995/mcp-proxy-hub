import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { expandEnvVars, unexpandEnvVars } from './env-var-utils.js';
import { EnvVarConfig } from '../models/config.js';

describe('env-var-utils', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      TEST_VAR: 'test-value',
      API_KEY: 'secret-api-key',
      USER_ID: '12345',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('expandEnvVars', () => {
    it('should return the original object if no env var configs provided', () => {
      const obj = { key: 'value', nested: { key: '${TEST_VAR}' } };
      expect(expandEnvVars(obj, undefined)).toEqual(obj);
      expect(expandEnvVars(obj, [])).toEqual(obj);
    });

    it('should return the original object if not an object, array, or string', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', expand: true },
      ];
      expect(expandEnvVars(123, envVarConfigs)).toBe(123);
      expect(expandEnvVars(null, envVarConfigs)).toBe(null);
      expect(expandEnvVars(undefined, envVarConfigs)).toBe(undefined);
      expect(expandEnvVars(true, envVarConfigs)).toBe(true);
    });

    it('should expand environment variables in a string', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', expand: true },
      ];
      expect(expandEnvVars('this is a ${TEST_VAR}', envVarConfigs)).toBe('this is a test-value');
    });

    it('should not expand environment variables if expand is false', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', expand: false },
      ];
      expect(expandEnvVars('this is a ${TEST_VAR}', envVarConfigs)).toBe('this is a ${TEST_VAR}');
    });

    it('should expand multiple environment variables in a string', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', expand: true },
        { name: 'API_KEY', value: 'secret-api-key', expand: true },
      ];
      expect(expandEnvVars('${TEST_VAR} with ${API_KEY}', envVarConfigs)).toBe(
        'test-value with secret-api-key'
      );
    });

    it('should recursively expand environment variables in arrays', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', expand: true },
      ];
      const input = ['${TEST_VAR}', 'normal value', ['nested ${TEST_VAR}']];
      const expected = ['test-value', 'normal value', ['nested test-value']];
      expect(expandEnvVars(input, envVarConfigs)).toEqual(expected);
    });

    it('should recursively expand environment variables in objects', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', expand: true },
      ];
      const input = {
        key1: '${TEST_VAR}',
        key2: 'normal value',
        nested: {
          key3: 'nested ${TEST_VAR}',
        },
      };
      const expected = {
        key1: 'test-value',
        key2: 'normal value',
        nested: {
          key3: 'nested test-value',
        },
      };
      expect(expandEnvVars(input, envVarConfigs)).toEqual(expected);
    });

    it('should handle complex nested structures', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', expand: true },
        { name: 'API_KEY', value: 'secret-api-key', expand: true },
      ];
      const input = {
        string: '${TEST_VAR}',
        array: ['${API_KEY}', { nestedObj: '${TEST_VAR}' }],
        object: {
          key: '${API_KEY}',
          nestedArray: ['${TEST_VAR}'],
        },
      };
      const expected = {
        string: 'test-value',
        array: ['secret-api-key', { nestedObj: 'test-value' }],
        object: {
          key: 'secret-api-key',
          nestedArray: ['test-value'],
        },
      };
      expect(expandEnvVars(input, envVarConfigs)).toEqual(expected);
    });
  });

  describe('unexpandEnvVars', () => {
    it('should return the original object if no env var configs provided', () => {
      const obj = { key: 'value', nested: { key: 'test-value' } };
      expect(unexpandEnvVars(obj, undefined)).toEqual(obj);
      expect(unexpandEnvVars(obj, [])).toEqual(obj);
    });

    it('should return the original object if not an object, array, or string', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', unexpand: true },
      ];
      expect(unexpandEnvVars(123, envVarConfigs)).toBe(123);
      expect(unexpandEnvVars(null, envVarConfigs)).toBe(null);
      expect(unexpandEnvVars(undefined, envVarConfigs)).toBe(undefined);
      expect(unexpandEnvVars(true, envVarConfigs)).toBe(true);
    });

    it('should replace values with environment variable references in a string', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', unexpand: true },
      ];
      expect(unexpandEnvVars('this is a test-value', envVarConfigs)).toBe('this is a ${TEST_VAR}');
    });

    it('should not replace values if unexpand is false', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', unexpand: false },
      ];
      expect(unexpandEnvVars('this is a test-value', envVarConfigs)).toBe('this is a test-value');
    });

    it('should replace multiple values in a string', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', unexpand: true },
        { name: 'API_KEY', value: 'secret-api-key', unexpand: true },
      ];
      expect(unexpandEnvVars('test-value with secret-api-key', envVarConfigs)).toBe(
        '${TEST_VAR} with ${API_KEY}'
      );
    });

    it('should recursively replace values in arrays', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', unexpand: true },
      ];
      const input = ['test-value', 'normal value', ['nested test-value']];
      const expected = ['${TEST_VAR}', 'normal value', ['nested ${TEST_VAR}']];
      expect(unexpandEnvVars(input, envVarConfigs)).toEqual(expected);
    });

    it('should recursively replace values in objects', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', unexpand: true },
      ];
      const input = {
        key1: 'test-value',
        key2: 'normal value',
        nested: {
          key3: 'nested test-value',
        },
      };
      const expected = {
        key1: '${TEST_VAR}',
        key2: 'normal value',
        nested: {
          key3: 'nested ${TEST_VAR}',
        },
      };
      expect(unexpandEnvVars(input, envVarConfigs)).toEqual(expected);
    });

    it('should handle complex nested structures', () => {
      const envVarConfigs: EnvVarConfig[] = [
        { name: 'TEST_VAR', value: 'test-value', unexpand: true },
        { name: 'API_KEY', value: 'secret-api-key', unexpand: true },
      ];
      const input = {
        string: 'test-value',
        array: ['secret-api-key', { nestedObj: 'test-value' }],
        object: {
          key: 'secret-api-key',
          nestedArray: ['test-value'],
        },
      };
      const expected = {
        string: '${TEST_VAR}',
        array: ['${API_KEY}', { nestedObj: '${TEST_VAR}' }],
        object: {
          key: '${API_KEY}',
          nestedArray: ['${TEST_VAR}'],
        },
      };
      expect(unexpandEnvVars(input, envVarConfigs)).toEqual(expected);
    });
  });
});
