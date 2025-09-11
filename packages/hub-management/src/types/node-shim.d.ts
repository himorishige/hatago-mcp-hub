// Minimal Node type shims for local typecheck without @types/node [DM]
declare module 'node:fs' {
  export function existsSync(path: string): boolean;
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(path: string, data: string, encoding: string): void;
  export function appendFileSync(path: string, data: string, encoding: string): void;
  export function statSync(path: string): { size: number };
  export function unlinkSync(path: string): void;
  export function renameSync(oldPath: string, newPath: string): void;
}
declare module 'node:path' {
  export function resolve(p: string): string;
}
declare module 'node:crypto' {
  type HashShim = { update: (data: string) => HashShim; digest: (enc: string) => string };
  export function createHash(alg: string): HashShim;
}
declare namespace NodeJS {
  type Timeout = unknown;
}
declare const console: { error: (...args: unknown[]) => void };
declare function setTimeout(
  handler: (...args: unknown[]) => void,
  timeout?: number
): NodeJS.Timeout;
declare function clearTimeout(handle: NodeJS.Timeout): void;
