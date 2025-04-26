/**
 * Common JsonValue type used for environment variable substitution
 */

export type JsonValue = string | number | boolean | null | undefined | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];
