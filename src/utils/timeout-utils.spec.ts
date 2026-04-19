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

    it('should return undefined when both globalMs and perServerMs are undefined', () => {
      expect(resolveTimeoutOptions(undefined, undefined)).toBeUndefined();
    });

    it('should return { timeout: 30000 } when globalMs=30000 and perServerMs=undefined', () => {
      expect(resolveTimeoutOptions(30000, undefined)).toEqual({ timeout: 30000 });
    });

    it('should return { timeout: 5000 } when globalMs=undefined and perServerMs=5000', () => {
      expect(resolveTimeoutOptions(undefined, 5000)).toEqual({ timeout: 5000 });
    });

    it('should return { timeout: 5000 } (per-server wins) when globalMs=30000 and perServerMs=5000', () => {
      expect(resolveTimeoutOptions(30000, 5000)).toEqual({ timeout: 5000 });
    });

    it('should return { timeout: NO_TIMEOUT_MS } when globalMs=0 and perServerMs=undefined', () => {
      expect(resolveTimeoutOptions(0, undefined)).toEqual({ timeout: NO_TIMEOUT_MS });
    });

    it('should return { timeout: NO_TIMEOUT_MS } when globalMs=undefined and perServerMs=0', () => {
      expect(resolveTimeoutOptions(undefined, 0)).toEqual({ timeout: NO_TIMEOUT_MS });
    });

    it('should return { timeout: NO_TIMEOUT_MS } when globalMs=30000 and perServerMs=0 (0 explicitly disables)', () => {
      expect(resolveTimeoutOptions(30000, 0)).toEqual({ timeout: NO_TIMEOUT_MS });
    });

    it('should return undefined when globalMs=-1 and perServerMs=undefined (invalid global, no per-server)', () => {
      expect(resolveTimeoutOptions(-1, undefined)).toBeUndefined();
    });

    it('should return { timeout: 5000 } when globalMs=NaN and perServerMs=5000 (invalid global, valid per-server)', () => {
      expect(resolveTimeoutOptions(NaN, 5000)).toEqual({ timeout: 5000 });
    });

    it('should return { timeout: 30000 } when globalMs=30000 and perServerMs=NaN (invalid per-server falls through to global)', () => {
      expect(resolveTimeoutOptions(30000, NaN)).toEqual({ timeout: 30000 });
    });

    it('should cap perServerMs values above NO_TIMEOUT_MS to NO_TIMEOUT_MS (avoids Node setTimeout clamp to 1ms)', () => {
      expect(resolveTimeoutOptions(undefined, NO_TIMEOUT_MS + 1)).toEqual({
        timeout: NO_TIMEOUT_MS,
      });
    });

    it('should cap globalMs values above NO_TIMEOUT_MS to NO_TIMEOUT_MS', () => {
      expect(resolveTimeoutOptions(NO_TIMEOUT_MS + 10_000, undefined)).toEqual({
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

    it('should emit console.warn for invalid perServerMs', () => {
      resolveTimeoutOptions(30000, NaN);
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
    });

    it('should emit console.warn for invalid globalMs when perServerMs is also invalid or absent', () => {
      resolveTimeoutOptions(-1, undefined);
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
    });

    it('should NOT warn about invalid globalMs when perServerMs is valid (short-circuit)', () => {
      resolveTimeoutOptions(NaN, 5000);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should NOT emit console.warn for valid values', () => {
      resolveTimeoutOptions(30000, 5000);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should NOT emit console.warn when both are undefined', () => {
      resolveTimeoutOptions(undefined, undefined);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle non-number perServerMs by falling through to global', () => {
      const result = resolveTimeoutOptions(30000, 'invalid' as unknown as number);
      expect(result).toEqual({ timeout: 30000 });
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
    });

    it('should handle non-number globalMs with undefined perServerMs as invalid', () => {
      const result = resolveTimeoutOptions('invalid' as unknown as number, undefined);
      expect(result).toBeUndefined();
      expect(consoleWarnSpy).toHaveBeenCalledOnce();
    });
  });
});
