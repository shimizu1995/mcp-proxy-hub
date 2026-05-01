import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NO_TIMEOUT_MS, resolveTimeoutOptions } from './timeout-utils.js';

describe('timeout-utils', () => {
  describe('NO_TIMEOUT_MS', () => {
    it('should equal 2_147_483_647', () => {
      expect(NO_TIMEOUT_MS).toBe(2_147_483_647);
    });
  });

  describe('resolveTimeoutOptions', () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('should return undefined when both globalSec and perServerSec are undefined', () => {
      expect(resolveTimeoutOptions(undefined, undefined)).toBeUndefined();
    });

    it('should return { timeout: 30000 } when globalSec=30 and perServerSec=undefined', () => {
      expect(resolveTimeoutOptions(30, undefined)).toEqual({ timeout: 30000 });
    });

    it('should return { timeout: 5000 } when globalSec=undefined and perServerSec=5', () => {
      expect(resolveTimeoutOptions(undefined, 5)).toEqual({ timeout: 5000 });
    });

    it('should return { timeout: 5000 } (per-server wins) when globalSec=30 and perServerSec=5', () => {
      expect(resolveTimeoutOptions(30, 5)).toEqual({ timeout: 5000 });
    });

    it('should return { timeout: NO_TIMEOUT_MS } when globalSec=0 and perServerSec=undefined', () => {
      expect(resolveTimeoutOptions(0, undefined)).toEqual({ timeout: NO_TIMEOUT_MS });
    });

    it('should return { timeout: NO_TIMEOUT_MS } when globalSec=undefined and perServerSec=0', () => {
      expect(resolveTimeoutOptions(undefined, 0)).toEqual({ timeout: NO_TIMEOUT_MS });
    });

    it('should return { timeout: NO_TIMEOUT_MS } when globalSec=30 and perServerSec=0 (0 explicitly disables)', () => {
      expect(resolveTimeoutOptions(30, 0)).toEqual({ timeout: NO_TIMEOUT_MS });
    });

    it('should return undefined when globalSec=-1 and perServerSec=undefined (invalid global, no per-server)', () => {
      expect(resolveTimeoutOptions(-1, undefined)).toBeUndefined();
    });

    it('should return { timeout: 5000 } when globalSec=NaN and perServerSec=5 (invalid global, valid per-server)', () => {
      expect(resolveTimeoutOptions(NaN, 5)).toEqual({ timeout: 5000 });
    });

    it('should return { timeout: 30000 } when globalSec=30 and perServerSec=NaN (invalid per-server falls through to global)', () => {
      expect(resolveTimeoutOptions(30, NaN)).toEqual({ timeout: 30000 });
    });

    it('should support fractional seconds (e.g. 1.5 → 1500 ms)', () => {
      expect(resolveTimeoutOptions(undefined, 1.5)).toEqual({ timeout: 1500 });
    });

    it('should cap perServerSec values whose ms conversion exceeds NO_TIMEOUT_MS', () => {
      expect(resolveTimeoutOptions(undefined, NO_TIMEOUT_MS)).toEqual({
        timeout: NO_TIMEOUT_MS,
      });
    });

    it('should cap globalSec values whose ms conversion exceeds NO_TIMEOUT_MS', () => {
      expect(resolveTimeoutOptions(NO_TIMEOUT_MS, undefined)).toEqual({
        timeout: NO_TIMEOUT_MS,
      });
    });

    it('should truncate overly long invalid values in warn messages', () => {
      const longValue = 'a'.repeat(200) as unknown as number;
      resolveTimeoutOptions(longValue, undefined);
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
      const message = consoleWarnSpy.mock.calls[0][0] as string;
      // Full interpolated value would be 200 chars; we truncate to 64.
      expect(message).not.toContain('a'.repeat(100));
    });

    it('should emit console.warn for invalid perServerSec', () => {
      resolveTimeoutOptions(30, NaN);
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
    });

    it('should emit console.warn for invalid globalSec when perServerSec is also invalid or absent', () => {
      resolveTimeoutOptions(-1, undefined);
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
    });

    it('should NOT warn about invalid globalSec when perServerSec is valid (short-circuit)', () => {
      resolveTimeoutOptions(NaN, 5);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should NOT emit console.warn for valid values', () => {
      resolveTimeoutOptions(30, 5);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should NOT emit console.warn when both are undefined', () => {
      resolveTimeoutOptions(undefined, undefined);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle non-number perServerSec by falling through to global', () => {
      const result = resolveTimeoutOptions(30, 'invalid' as unknown as number);
      expect(result).toEqual({ timeout: 30000 });
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
    });

    it('should handle non-number globalSec with undefined perServerSec as invalid', () => {
      const result = resolveTimeoutOptions('invalid' as unknown as number, undefined);
      expect(result).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
    });
  });
});
