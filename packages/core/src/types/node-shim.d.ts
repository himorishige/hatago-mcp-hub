// Minimal Node.js type shims to satisfy eslint type-aware rules within @himorishige/hatago-core.
// This avoids adding @types/node as a dependency here. [DM]

declare module 'node:os' {
  export function homedir(): string;
}

declare module 'node:path' {
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function relative(from: string, to: string): string;
}

declare module 'node:fs' {
  export function realpathSync(path: string): string;
}

declare const process: {
  cwd(): string;
};
