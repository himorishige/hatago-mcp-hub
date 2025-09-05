import { css } from 'hono/css';
import { createRoute } from 'honox/factory';

const dashboardStyle = css`
  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }

  .stat-card {
    text-align: center;
  }

  .stat-number {
    font-size: 2rem;
    font-weight: bold;
    color: #d97706;
    display: block;
  }

  .stat-label {
    font-size: 0.875rem;
    color: #6b7280;
  }
`;

export default createRoute((c) => {
  return c.render(
    <div class={dashboardStyle}>
      <div class="card">
        <h2>Dashboard</h2>
        <p>Welcome to Hatago MCP Hub Web Interface</p>
      </div>

      <div class="dashboard-grid">
        <div class="card stat-card">
          <span class="stat-number" id="server-count">
            -
          </span>
          <span class="stat-label">Connected Servers</span>
        </div>

        <div class="card stat-card">
          <span class="stat-number" id="tool-count">
            -
          </span>
          <span class="stat-label">Available Tools</span>
        </div>

        <div class="card stat-card">
          <span class="stat-number" id="uptime">
            -
          </span>
          <span class="stat-label">Uptime</span>
        </div>
      </div>

      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3>Server Status</h3>
          <button class="button" id="reload-btn">
            Reload Configuration
          </button>
        </div>
        <div id="server-list">
          <div class="loading">Loading server information...</div>
        </div>
      </div>
    </div>,
    { title: 'Dashboard' }
  );
});
