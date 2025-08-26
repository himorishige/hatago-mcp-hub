/**
 * Parse headers from string or object
 */
export function parseHeaders(
  headers?: string | Record<string, string>,
): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (typeof headers === 'string') {
    // Parse JSON string
    try {
      return JSON.parse(headers);
    } catch {
      // Try to parse as key=value pairs
      const result: Record<string, string> = {};
      const lines = headers.split(/[\r\n]+/);
      for (const line of lines) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key.trim()] = value.trim();
        }
      }
      return result;
    }
  }

  return headers;
}
