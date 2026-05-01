/**
 * Sentinel value used as the "no timeout" (infinite) duration in milliseconds.
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

function secondsToMs(seconds: number): number {
  if (seconds === 0) return NO_TIMEOUT_MS;
  const ms = seconds * 1000;
  if (ms > NO_TIMEOUT_MS) return NO_TIMEOUT_MS;
  return ms;
}

function describeInvalid(value: unknown): string {
  return String(value).slice(0, 64);
}

/**
 * Resolves the timeout options to pass to the MCP SDK's `client.request()`.
 *
 * Inputs are in **seconds**; the returned `timeout` is in milliseconds so it
 * can be passed directly to the SDK.
 *
 * Resolution order (first valid value wins):
 *   1. perServerSec — per-server config
 *   2. globalSec    — global config
 *   3. undefined    — fall back to SDK default (60 s)
 *
 * Special cases:
 *   - `0` at any level maps to `{ timeout: NO_TIMEOUT_MS }` (infinite).
 *   - Values whose millisecond conversion exceeds `NO_TIMEOUT_MS` are capped to
 *     `NO_TIMEOUT_MS` to avoid Node.js's `setTimeout` clamping them to 1 ms.
 *   - Negative numbers, NaN, and non-numbers are invalid; a `console.warn` is
 *     emitted once per invalid value, and resolution falls through to the next level.
 */
export function resolveTimeoutOptions(
  globalSec?: number,
  perServerSec?: number
): { timeout: number } | undefined {
  if (perServerSec !== undefined) {
    if (isValidTimeout(perServerSec)) {
      return { timeout: secondsToMs(perServerSec) };
    }
    console.warn(
      `[mcp-proxy-hub] Invalid per-server timeout value: ${describeInvalid(perServerSec)}. ` +
        `Falling through to global timeout.`
    );
  }

  if (globalSec !== undefined) {
    if (isValidTimeout(globalSec)) {
      return { timeout: secondsToMs(globalSec) };
    }
    console.warn(
      `[mcp-proxy-hub] Invalid global timeout value: ${describeInvalid(globalSec)}. ` +
        `Falling through to SDK default.`
    );
  }

  return undefined;
}
