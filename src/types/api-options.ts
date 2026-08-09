/**
 * Widens `= {}` defaults on fetch helpers so TypeScript accepts `signal`, `headers`, etc.
 */
export type ApiOptions = Record<string, unknown> & {
  signal?: AbortSignal;
};
