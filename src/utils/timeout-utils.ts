/**
 * Sentinel value used as the "no timeout" (infinite) duration.
 * Node's setTimeout clamps values > 2^31 - 1 to 1 ms, so we use
 * 2_147_483_647 (~24.8 days) as the practical maximum.
 */
export const NO_TIMEOUT_MS = 2_147_483_647;

/**
 * Returns true when the value is a valid, usable timeout: a finite number >= 0.
 * Negative numbers, NaN, Infinity, and non-numbers are considered invalid.
 */
function isValidTimeout(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value) && value >= 0;
}

function normalizeTimeout(value: number): number {
  if (value === 0 || value > NO_TIMEOUT_MS) return NO_TIMEOUT_MS;
  return value;
}

function describeInvalid(value: unknown): string {
  return String(value).slice(0, 64);
}

/**
 * Resolves the timeout options to pass to the MCP SDK's `client.request()`.
 *
 * Resolution order (first valid value wins):
 *   1. perServerMs — per-server config
 *   2. globalMs    — global config
 *   3. undefined   — fall back to SDK default (60 s)
 *
 * Special cases:
 *   - `0` at any level maps to `{ timeout: NO_TIMEOUT_MS }` (infinite).
 *   - Values greater than `NO_TIMEOUT_MS` are capped to `NO_TIMEOUT_MS` to
 *     avoid Node.js's `setTimeout` clamping them to 1 ms.
 *   - Negative numbers, NaN, and non-numbers are invalid; a `console.warn` is
 *     emitted once per invalid value, and resolution falls through to the next level.
 */
export function resolveTimeoutOptions(
  globalMs?: number,
  perServerMs?: number
): { timeout: number } | undefined {
  if (perServerMs !== undefined) {
    if (isValidTimeout(perServerMs)) {
      return { timeout: normalizeTimeout(perServerMs) };
    }
    console.warn(
      `[mcp-proxy-hub] Invalid per-server timeout value: ${describeInvalid(perServerMs)}. ` +
        `Falling through to global timeout.`
    );
  }

  if (globalMs !== undefined) {
    if (isValidTimeout(globalMs)) {
      return { timeout: normalizeTimeout(globalMs) };
    }
    console.warn(
      `[mcp-proxy-hub] Invalid global timeout value: ${describeInvalid(globalMs)}. ` +
        `Falling through to SDK default.`
    );
  }

  return undefined;
}
