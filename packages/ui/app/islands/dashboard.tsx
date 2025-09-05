export default function Dashboard() {
  let eventSource: EventSource | null = null;

  // Initialize dashboard
  const init = () => {
    fetchStatus();
    initEventSource();
    initReloadButton();
  };

  // Fetch initial status
  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/status');
      const data = (await response.json()) as {
        servers?: Array<{ id: string; status: string; tools: number }>;
        tools?: unknown[];
        uptime?: number;
      };

      // Update stats
      updateElement('server-count', data.servers?.length || 0);
      updateElement('tool-count', data.tools?.length || 0);
      updateElement('uptime', formatUptime(data.uptime || 0));

      // Update server list
      updateServerList(data.servers || []);
    } catch (error) {
      console.error('Failed to fetch status:', error);
      updateElement('server-list', '<div class="loading">Failed to load server information</div>');
    }
  };

  // Initialize SSE connection
  const initEventSource = () => {
    if (eventSource) return;

    eventSource = new EventSource('/sse');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle different notification types
        if (data.method === 'notifications/tools/list_changed') {
          fetchStatus(); // Refresh all data when tools change
        } else if (data.method === 'notifications/progress') {
          // Show progress updates if needed
          console.log('Progress:', data.params);
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = () => {
      console.warn('SSE connection error, will retry...');
      eventSource = null;
      setTimeout(initEventSource, 5000); // Retry after 5 seconds
    };
  };

  // Initialize reload button
  const initReloadButton = () => {
    if (typeof document === 'undefined') return;

    const reloadBtn = document.getElementById('reload-btn');
    if (!reloadBtn) return;

    reloadBtn.addEventListener('click', async () => {
      const btn = reloadBtn as HTMLButtonElement;
      const originalText = btn.textContent;

      btn.disabled = true;
      btn.textContent = 'Reloading...';

      try {
        const response = await fetch('/api/reload', { method: 'POST' });
        if (response.ok) {
          // Refresh status after reload
          setTimeout(fetchStatus, 1000);
        } else {
          console.error('Reload failed:', response.statusText);
        }
      } catch (error) {
        console.error('Reload error:', error);
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  };

  // Helper: Update element content
  const updateElement = (id: string, content: string | number) => {
    if (typeof document !== 'undefined') {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = String(content);
      }
    }
  };

  // Helper: Format uptime
  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Helper: Update server list
  const updateServerList = (servers: Array<{ id: string; status: string; tools: number }>) => {
    if (typeof document === 'undefined') return;

    const serverListElement = document.getElementById('server-list');
    if (!serverListElement) return;

    if (servers.length === 0) {
      serverListElement.innerHTML = '<div class="loading">No servers configured</div>';
      return;
    }

    const tableHTML = `
      <table>
        <thead>
          <tr>
            <th>Server ID</th>
            <th>Status</th>
            <th>Tools</th>
          </tr>
        </thead>
        <tbody>
          ${servers
            .map(
              (server) => `
            <tr>
              <td>${server.id}</td>
              <td>
                <span class="status-badge ${server.status === 'connected' ? 'status-online' : 'status-offline'}">
                  ${server.status}
                </span>
              </td>
              <td>${server.tools}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;

    serverListElement.innerHTML = tableHTML;
  };

  // Auto-start when DOM is loaded (client-side only)
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // Cleanup on page unload (client-side only)
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (eventSource) {
        eventSource.close();
      }
    });
  }

  return null; // Islands don't render anything server-side
}
