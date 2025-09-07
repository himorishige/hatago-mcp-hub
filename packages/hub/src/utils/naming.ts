export type ParsedQualifiedName = {
  serverId?: string;
  name: string;
};

/**
 * Parse a qualified name that may be in either form:
 * - serverId/name (slash-separated)
 * - serverId{sep}name (configurable separator)
 * Falls back to the input as name if no serverId is present. [SF]
 */
export function parseQualifiedName(input: string, separator: string): ParsedQualifiedName {
  if (input.includes('/')) {
    const parts = input.split('/');
    return { serverId: parts[0], name: parts.slice(1).join('/') };
  }
  if (input.includes(separator)) {
    const parts = input.split(separator);
    return { serverId: parts[0], name: parts.slice(1).join(separator) };
  }
  return { name: input };
}

/**
 * Build public tool name according to naming strategy. Mirrors ToolRegistry behavior. [ISA]
 */
export function buildPublicToolName(
  serverId: string | undefined,
  toolName: string,
  strategy: 'none' | 'namespace' | 'prefix',
  separator: string
): string {
  if (!serverId || strategy === 'none') return toolName;
  return `${serverId}${separator}${toolName}`;
}

/** Build a generic qualified name without strategy logic (serverId + sep + name). */
export function buildQualifiedName(serverId: string, name: string, separator: string): string {
  return `${serverId}${separator}${name}`;
}
