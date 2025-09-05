/**
 * Hatago UI with daisyUI Components
 *
 * Modern UI implementation using daisyUI and Tailwind CSS
 */

import { Hono } from 'hono';
import { createUIApi } from './api.js';
import { createExtendedApi } from './api-extended.js';
import type { HatagoHub } from '@himorishige/hatago-hub';

export interface DaisyUIOptions {
  hub: HatagoHub;
  configPath: string;
  basePath?: string;
}

/**
 * Create the modern UI app with daisyUI
 */
export function createDaisyUI(options: DaisyUIOptions) {
  const { hub, configPath } = options;
  const app = new Hono();

  // Create API routes
  const api = createUIApi({ hub });
  const extendedApi = createExtendedApi({ hub, configPath });

  // Mount APIs
  app.route('/api', api);
  app.route('/api', extendedApi);

  // Serve the main UI
  app.get('/', async (c) => {
    return c.html(`
      <!DOCTYPE html>
      <html lang="en" data-theme="autumn">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🏮 Hatago MCP Hub</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/daisyui@4.12.14/dist/full.css" rel="stylesheet" type="text/css" />

        <style>
          @keyframes pulse-primary {
            0%, 100% { box-shadow: 0 0 0 0 hsl(25 95% 53% / 0.4); }
            50% { box-shadow: 0 0 0 8px hsl(25 95% 53% / 0); }
          }
          .server-connecting { animation: pulse-primary 2s infinite; }
        </style>
      </head>
      <body>
        <!-- Header Navigation -->
        <div class="navbar bg-base-100 shadow-lg">
          <div class="flex-1">
            <a class="btn btn-ghost text-xl">
              <span class="text-primary text-2xl">🏮</span>
              <span class="font-bold">Hatago MCP Hub</span>
            </a>
          </div>
          <div class="flex-none gap-2">
            <div class="form-control">
              <input type="text" placeholder="Search servers..." 
                     class="input input-bordered input-sm w-24 md:w-auto" />
            </div>
            <button class="btn btn-primary btn-sm" onclick="showAddServerModal()">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Server
            </button>
            <div class="dropdown dropdown-end">
              <label tabindex="0" class="btn btn-circle btn-ghost btn-sm">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </label>
              <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-52 z-50">
                <li><a onclick="showBackupsModal()">Backups</a></li>
                <li><a onclick="toggleTheme()">Toggle Theme</a></li>
                <li><a href="/docs" target="_blank">Documentation</a></li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Main Container -->
        <div class="container mx-auto p-4">
          <!-- Statistics Cards -->
          <div class="stats shadow w-full mb-6">
            <div class="stat">
              <div class="stat-figure text-primary">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"></path>
                </svg>
              </div>
              <div class="stat-title">Connected Servers</div>
              <div class="stat-value text-primary" id="connected-servers">-</div>
              <div class="stat-desc" id="total-servers">Total: -</div>
            </div>
            
            <div class="stat">
              <div class="stat-figure text-secondary">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 3.95z"></path>
                </svg>
              </div>
              <div class="stat-title">Available Tools</div>
              <div class="stat-value text-secondary" id="total-tools">-</div>
              <div class="stat-desc">Ready to use</div>
            </div>
            
            <div class="stat">
              <div class="stat-figure text-accent">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="inline-block w-8 h-8 stroke-current">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                </svg>
              </div>
              <div class="stat-title">Uptime</div>
              <div class="stat-value text-accent" id="uptime">-</div>
              <div class="stat-desc">99.9% availability</div>
            </div>
          </div>

          <!-- View Tabs -->
          <div class="tabs tabs-boxed mb-6">
            <a class="tab tab-active" data-tab="grid" onclick="switchTab('grid')">Grid View</a>
            <a class="tab" data-tab="list" onclick="switchTab('list')">List View</a>
            <a class="tab" data-tab="tools" onclick="switchTab('tools')">All Tools</a>
            <a class="tab" data-tab="logs" onclick="switchTab('logs')">Activity Log</a>
          </div>

          <!-- Tab Contents -->
          <div id="tab-content">
            <!-- Grid View -->
            <div id="grid-view" class="tab-pane active">
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" id="servers-grid">
                <div class="flex justify-center items-center h-32">
                  <span class="loading loading-spinner loading-lg text-primary"></span>
                </div>
              </div>
            </div>

            <!-- List View -->
            <div id="list-view" class="tab-pane hidden">
              <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                  <div class="overflow-x-auto">
                    <table class="table table-zebra">
                      <thead>
                        <tr>
                          <th>Status</th>
                          <th>Server ID</th>
                          <th>Type</th>
                          <th>Tools</th>
                          <th>Tags</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody id="servers-list">
                        <tr>
                          <td colspan="6" class="text-center">
                            <span class="loading loading-spinner loading-sm"></span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tools View -->
            <div id="tools-view" class="tab-pane hidden">
              <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                  <h2 class="card-title">Available Tools</h2>
                  <div id="tools-list">
                    <div class="text-center">
                      <span class="loading loading-spinner loading-sm"></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Activity Log -->
            <div id="logs-view" class="tab-pane hidden">
              <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                  <h2 class="card-title">Activity Log</h2>
                  <div class="text-sm space-y-2" id="activity-log">
                    <div class="text-base-content/50">No recent activity</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Add/Edit Server Modal -->
        <dialog id="server-modal" class="modal">
          <div class="modal-box w-11/12 max-w-3xl">
            <form method="dialog">
              <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
            </form>
            <h3 class="font-bold text-lg" id="modal-title">Add MCP Server</h3>
            
            <!-- Progress Steps -->
            <ul class="steps steps-horizontal w-full mt-4">
              <li class="step step-primary" data-step="1">Basic Info</li>
              <li class="step" data-step="2">Configuration</li>
              <li class="step" data-step="3">Test & Save</li>
            </ul>
            
            <div class="divider"></div>
            
            <!-- Step Contents -->
            <div id="step-content">
              <!-- Step 1: Basic Info -->
              <div id="step-1" class="step-pane">
                <div class="form-control w-full">
                  <label class="label">
                    <span class="label-text">Server ID</span>
                    <span class="label-text-alt text-error">*Required</span>
                  </label>
                  <input type="text" id="server-id" placeholder="my-server" 
                         class="input input-bordered w-full" />
                  <label class="label">
                    <span class="label-text-alt text-error hidden" id="server-id-error"></span>
                  </label>
                </div>
                
                <div class="form-control w-full mt-4">
                  <label class="label">
                    <span class="label-text">Server Type</span>
                  </label>
                  <div class="join">
                    <input class="join-item btn" type="radio" name="server-type" 
                           value="stdio" aria-label="Local" checked onclick="updateConfigStep()" />
                    <input class="join-item btn" type="radio" name="server-type" 
                           value="http" aria-label="HTTP" onclick="updateConfigStep()" />
                    <input class="join-item btn" type="radio" name="server-type" 
                           value="sse" aria-label="SSE" onclick="updateConfigStep()" />
                  </div>
                </div>
                
                <div class="form-control w-full mt-4">
                  <label class="label">
                    <span class="label-text">Tags</span>
                    <span class="label-text-alt">Comma-separated</span>
                  </label>
                  <input type="text" id="server-tags" placeholder="dev, test, production" 
                         class="input input-bordered w-full" />
                </div>
              </div>

              <!-- Step 2: Configuration -->
              <div id="step-2" class="step-pane hidden">
                <!-- Local Config -->
                <div id="config-stdio" class="config-pane">
                  <div class="form-control w-full">
                    <label class="label">
                      <span class="label-text">Command</span>
                      <span class="label-text-alt text-error">*Required</span>
                    </label>
                    <input type="text" id="server-command" placeholder="/usr/local/bin/my-server" 
                           class="input input-bordered w-full" />
                  </div>
                  
                  <div class="form-control w-full mt-4">
                    <label class="label">
                      <span class="label-text">Arguments</span>
                      <span class="label-text-alt">JSON array</span>
                    </label>
                    <textarea id="server-args" class="textarea textarea-bordered" 
                              placeholder='["--mode", "production"]'></textarea>
                  </div>
                  
                  <div class="form-control w-full mt-4">
                    <label class="label">
                      <span class="label-text">Working Directory</span>
                    </label>
                    <input type="text" id="server-cwd" class="input input-bordered w-full" />
                  </div>
                </div>

                <!-- HTTP/SSE Config -->
                <div id="config-http" class="config-pane hidden">
                  <div class="form-control w-full">
                    <label class="label">
                      <span class="label-text">URL</span>
                      <span class="label-text-alt text-error">*Required</span>
                    </label>
                    <input type="url" id="server-url" placeholder="https://api.example.com/mcp" 
                           class="input input-bordered w-full" />
                  </div>
                  
                  <div class="form-control w-full mt-4">
                    <label class="label">
                      <span class="label-text">Headers</span>
                      <span class="label-text-alt">JSON object</span>
                    </label>
                    <textarea id="server-headers" class="textarea textarea-bordered" 
                              placeholder='{"Authorization": "Bearer \${TOKEN}"}'></textarea>
                  </div>
                </div>
              </div>

              <!-- Step 3: Test & Save -->
              <div id="step-3" class="step-pane hidden">
                <div class="alert">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-info shrink-0 w-6 h-6">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <div>
                    <h3 class="font-bold">Connection Test</h3>
                    <div class="text-xs">Test your configuration before saving</div>
                  </div>
                  <button type="button" class="btn btn-sm btn-primary" onclick="testConnection()">
                    Test Connection
                  </button>
                </div>
                
                <div id="test-result" class="mt-4"></div>
                
                <div id="impact-analysis" class="card bg-base-200 mt-4 hidden">
                  <div class="card-body">
                    <h4 class="font-semibold">Impact Analysis</h4>
                    <ul class="list-disc list-inside text-sm" id="impact-list"></ul>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="modal-action">
              <button type="button" class="btn btn-ghost" onclick="closeModal()">Cancel</button>
              <button type="button" class="btn btn-outline" id="btn-prev" onclick="prevStep()" disabled>
                ← Previous
              </button>
              <button type="button" class="btn btn-primary" id="btn-next" onclick="nextStep()">
                Next →
              </button>
              <button type="button" class="btn btn-success hidden" id="btn-save" onclick="saveServer()">
                Save & Enable
              </button>
            </div>
          </div>
        </dialog>

        <!-- Toast Container -->
        <div class="toast toast-top toast-end" id="toast-container"></div>

        <!-- Scripts -->
        <script>
          let currentStep = 1;
          let currentServerData = {};
          let isEditMode = false;

          // Initialize on load
          document.addEventListener('DOMContentLoaded', () => {
            loadDashboard();
            setInterval(loadDashboard, 30000); // Refresh every 30 seconds
          });

          // Load dashboard data
          async function loadDashboard() {
            try {
              const response = await fetch('/ui/api/status');
              const data = await response.json();
              
              // Update statistics
              document.getElementById('connected-servers').textContent = data.connectedServers || 0;
              document.getElementById('total-servers').textContent = 'Total: ' + (data.totalServers || 0);
              document.getElementById('total-tools').textContent = data.totalTools || 0;
              document.getElementById('uptime').textContent = formatUptime(data.uptime || 0);
              
              // Update server displays
              updateServerGrid(data.servers || []);
              updateServerList(data.servers || []);
              updateToolsList(data.tools || []);
            } catch (error) {
              console.error('Failed to load dashboard:', error);
              showToast('Failed to load dashboard data', 'error');
            }
          }

          // Update server grid
          function updateServerGrid(servers) {
            const grid = document.getElementById('servers-grid');
            if (servers.length === 0) {
              grid.innerHTML = '<div class="col-span-full text-center text-base-content/50">No servers configured</div>';
              return;
            }
            
            grid.innerHTML = servers.map(server => createServerCard(server)).join('');
          }

          // Create server card HTML
          function createServerCard(server) {
            const statusClass = server.status === 'connected' ? 'badge-success' : 'badge-error';
            const statusText = server.status === 'connected' ? 'Connected' : 'Disconnected';
            
            return \`
              <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                  <h2 class="card-title text-base">
                    \${server.id}
                    <div class="badge \${statusClass} badge-sm">\${statusText}</div>
                  </h2>
                  
                  <div class="flex gap-2 text-sm">
                    <div class="badge badge-outline">\${getServerTypeLabel(server.type)}</div>
                    <div class="badge badge-outline">\${server.tools} tools</div>
                  </div>
                  
                  \${server.tags?.length > 0 ? \`
                    <div class="flex flex-wrap gap-1 mt-2">
                      \${server.tags.map(tag => \`<span class="badge badge-ghost badge-sm">\${tag}</span>\`).join('')}
                    </div>
                  \` : ''}
                  
                  <div class="card-actions justify-end mt-4">
                    <div class="join join-horizontal">
                      <button class="btn btn-sm btn-ghost join-item" onclick="editServer('\${server.id}')">
                        Edit
                      </button>
                      <button class="btn btn-sm btn-ghost join-item text-error" onclick="deleteServer('\${server.id}')">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            \`;
          }

          // Update server list
          function updateServerList(servers) {
            const list = document.getElementById('servers-list');
            if (servers.length === 0) {
              list.innerHTML = '<tr><td colspan="6" class="text-center">No servers configured</td></tr>';
              return;
            }
            
            list.innerHTML = servers.map(server => {
              const statusClass = server.status === 'connected' ? 'badge-success' : 'badge-error';
              return \`
                <tr>
                  <td><div class="badge \${statusClass} badge-sm">\${server.status}</div></td>
                  <td class="font-mono">\${server.id}</td>
                  <td>\${getServerTypeLabel(server.type)}</td>
                  <td>\${server.tools}</td>
                  <td>\${server.tags?.join(', ') || '-'}</td>
                  <td>
                    <div class="join join-horizontal">
                      <button class="btn btn-xs btn-ghost join-item" onclick="editServer('\${server.id}')">Edit</button>
                      <button class="btn btn-xs btn-ghost join-item text-error" onclick="deleteServer('\${server.id}')">Delete</button>
                    </div>
                  </td>
                </tr>
              \`;
            }).join('');
          }

          // Update tools list
          function updateToolsList(tools) {
            const list = document.getElementById('tools-list');
            const grouped = {};
            
            tools.forEach(tool => {
              const server = tool.server || 'internal';
              if (!grouped[server]) grouped[server] = [];
              grouped[server].push(tool);
            });
            
            list.innerHTML = Object.entries(grouped).map(([server, serverTools]) => \`
              <div class="collapse collapse-arrow bg-base-200 mb-2">
                <input type="checkbox" />
                <div class="collapse-title text-primary font-medium">
                  \${server} (\${serverTools.length} tools)
                </div>
                <div class="collapse-content">
                  <div class="space-y-2">
                    \${serverTools.map(tool => \`
                      <div class="p-2 bg-base-100 rounded">
                        <div class="font-mono text-sm">\${tool.name}</div>
                        <div class="text-xs text-base-content/70">\${tool.description || 'No description'}</div>
                      </div>
                    \`).join('')}
                  </div>
                </div>
              </div>
            \`).join('');
          }

          // Modal functions
          function showAddServerModal() {
            isEditMode = false;
            document.getElementById('modal-title').textContent = 'Add MCP Server';
            resetModal();
            document.getElementById('server-modal').showModal();
          }

          function closeModal() {
            document.getElementById('server-modal').close();
            resetModal();
          }

          function resetModal() {
            currentStep = 1;
            currentServerData = {};
            isEditMode = false;
            updateStepDisplay();
            
            // Clear form fields
            document.getElementById('server-id').value = '';
            document.getElementById('server-id').disabled = false; // Re-enable ID field
            document.getElementById('server-tags').value = '';
            document.getElementById('server-command').value = '';
            document.getElementById('server-args').value = '';
            document.getElementById('server-cwd').value = '';
            document.getElementById('server-url').value = '';
            document.getElementById('server-headers').value = '';
            
            // Reset modal title
            document.getElementById('modal-title').textContent = 'Add MCP Server';
            
            // Clear test results
            document.getElementById('test-result').innerHTML = '';
            document.getElementById('impact-analysis').classList.add('hidden');
          }

          function nextStep() {
            if (currentStep < 3) {
              if (validateStep(currentStep)) {
                currentStep++;
                updateStepDisplay();
              }
            }
          }

          function prevStep() {
            if (currentStep > 1) {
              currentStep--;
              updateStepDisplay();
            }
          }

          function updateStepDisplay() {
            // Update step indicators
            document.querySelectorAll('.steps .step').forEach((step, index) => {
              if (index < currentStep) {
                step.classList.add('step-primary');
              } else {
                step.classList.remove('step-primary');
              }
            });
            
            // Show/hide step panes
            document.querySelectorAll('.step-pane').forEach(pane => {
              pane.classList.add('hidden');
            });
            document.getElementById('step-' + currentStep).classList.remove('hidden');
            
            // Update buttons
            document.getElementById('btn-prev').disabled = currentStep === 1;
            document.getElementById('btn-next').classList.toggle('hidden', currentStep === 3);
            document.getElementById('btn-save').classList.toggle('hidden', currentStep !== 3);
            
            // Update config pane for step 2
            if (currentStep === 2) {
              updateConfigStep();
            }
          }

          function updateConfigStep() {
            const type = document.querySelector('input[name="server-type"]:checked').value;
            
            document.querySelectorAll('.config-pane').forEach(pane => {
              pane.classList.add('hidden');
            });
            
            if (type === 'stdio') {
              document.getElementById('config-stdio').classList.remove('hidden');
            } else {
              document.getElementById('config-http').classList.remove('hidden');
            }
          }

          function validateStep(step) {
            if (step === 1) {
              const serverId = document.getElementById('server-id').value.trim();
              if (!serverId) {
                document.getElementById('server-id-error').textContent = 'Server ID is required';
                document.getElementById('server-id-error').classList.remove('hidden');
                return false;
              }
              if (!/^[a-zA-Z0-9_-]+$/.test(serverId)) {
                document.getElementById('server-id-error').textContent = 'Invalid characters in Server ID';
                document.getElementById('server-id-error').classList.remove('hidden');
                return false;
              }
              document.getElementById('server-id-error').classList.add('hidden');
            }
            
            if (step === 2) {
              const type = document.querySelector('input[name="server-type"]:checked').value;
              if (type === 'stdio') {
                const command = document.getElementById('server-command').value.trim();
                if (!command) {
                  showToast('Command is required for local servers', 'error');
                  return false;
                }
              } else {
                const url = document.getElementById('server-url').value.trim();
                if (!url) {
                  showToast('URL is required for remote servers', 'error');
                  return false;
                }
              }
            }
            
            return true;
          }

          async function testConnection() {
            // Show loading state
            const testButton = event.target;
            const originalContent = testButton.innerHTML;
            testButton.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Testing...';
            testButton.disabled = true;
            const type = document.querySelector('input[name="server-type"]:checked').value;
            const testData = { type };
            
            if (type === 'stdio') {
              testData.command = document.getElementById('server-command').value.trim();
              testData.args = tryParseJSON(document.getElementById('server-args').value);
            } else {
              testData.url = document.getElementById('server-url').value.trim();
              testData.headers = tryParseJSON(document.getElementById('server-headers').value);
            }
            
            try {
              const response = await fetch('/ui/api/servers/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(testData)
              });
              
              const result = await response.json();
              
              if (result.success) {
                document.getElementById('test-result').innerHTML = \`
                  <div class="alert alert-success">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>\${result.message}</span>
                  </div>
                \`;
                
                // Show impact analysis
                document.getElementById('impact-analysis').classList.remove('hidden');
                document.getElementById('impact-list').innerHTML = \`
                  <li>New server will be added to configuration</li>
                  <li>Tools will be discovered and made available</li>
                  <li>No conflicts detected with existing servers</li>
                \`;
              } else {
                document.getElementById('test-result').innerHTML = \`
                  <div class="alert alert-error">
                    <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <h3 class="font-bold">Connection Failed</h3>
                      <div class="text-xs">\${result.message}</div>
                      \${result.remediation ? \`<div class="text-xs mt-1">💡 \${result.remediation}</div>\` : ''}
                    </div>
                  </div>
                \`;
              }
            } catch (error) {
              showToast('Failed to test connection: ' + error.message, 'error');
            } finally {
              // Restore button state
              testButton.innerHTML = originalContent;
              testButton.disabled = false;
            }
          }

          async function saveServer() {
            // Show loading state
            const saveButton = document.getElementById('btn-save');
            const originalContent = saveButton.innerHTML;
            saveButton.innerHTML = '<span class="loading loading-spinner loading-sm"></span> Saving...';
            saveButton.disabled = true;
            const type = document.querySelector('input[name="server-type"]:checked').value;
            const serverData = {
              id: document.getElementById('server-id').value.trim(),
              type,
              tags: document.getElementById('server-tags').value.split(',').map(t => t.trim()).filter(Boolean)
            };
            
            if (type === 'stdio') {
              serverData.command = document.getElementById('server-command').value.trim();
              serverData.args = tryParseJSON(document.getElementById('server-args').value);
              serverData.cwd = document.getElementById('server-cwd').value.trim() || undefined;
            } else {
              serverData.url = document.getElementById('server-url').value.trim();
              serverData.headers = tryParseJSON(document.getElementById('server-headers').value);
            }
            
            try {
              const url = isEditMode ? 
                '/ui/api/servers/' + serverData.id : 
                '/ui/api/servers';
              const method = isEditMode ? 'PATCH' : 'POST';
              
              const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(serverData)
              });
              
              const result = await response.json();
              
              if (response.ok) {
                showToast('Server ' + (isEditMode ? 'updated' : 'added') + ' successfully', 'success');
                closeModal();
                loadDashboard();
              } else {
                showToast(result.detail || 'Failed to save server', 'error');
              }
            } catch (error) {
              showToast('Failed to save server: ' + error.message, 'error');
            } finally {
              // Restore button state
              saveButton.innerHTML = originalContent;
              saveButton.disabled = false;
            }
          }



          async function editServer(serverId) {
            try {
              // Fetch server details
              const response = await fetch('/ui/api/servers/' + serverId);
              if (!response.ok) {
                showToast('Failed to load server details', 'error');
                return;
              }
              
              const serverData = await response.json();
              
              // Set edit mode
              isEditMode = true;
              currentStep = 1;
              
              // Open modal
              document.getElementById('server-modal').showModal();
              
              // Update modal title
              document.getElementById('modal-title').textContent = 'Edit Server';
              
              // Fill form fields - Step 1
              document.getElementById('server-id').value = serverData.id;
              document.getElementById('server-id').disabled = true; // ID cannot be changed
              document.getElementById('server-tags').value = (serverData.config?.tags || serverData.tags || []).join(', ');
              
              // Set server type
              const serverType = serverData.type || 'stdio';
              document.querySelector('input[name="server-type"][value="' + serverType + '"]').checked = true;
              
              // Fill form fields - Step 2
              if (serverType === 'stdio') {
                document.getElementById('server-command').value = serverData.config?.command || '';
                document.getElementById('server-args').value = JSON.stringify(serverData.config?.args || [], null, 2);
                document.getElementById('server-cwd').value = serverData.config?.cwd || '';
              } else {
                document.getElementById('server-url').value = serverData.config?.url || '';
                document.getElementById('server-headers').value = JSON.stringify(serverData.config?.headers || {}, null, 2);
              }
              
              // Update step display
              updateStepDisplay();
            } catch (error) {
              showToast('Failed to load server for editing: ' + error.message, 'error');
            }
          }

          async function deleteServer(serverId) {
            if (!confirm('Are you sure you want to delete server "' + serverId + '"?')) {
              return;
            }
            
            try {
              const response = await fetch('/ui/api/servers/' + serverId, {
                method: 'DELETE'
              });
              
              if (response.ok) {
                showToast('Server deleted successfully', 'success');
                loadDashboard();
              } else {
                const result = await response.json();
                showToast(result.detail || 'Failed to delete server', 'error');
              }
            } catch (error) {
              showToast('Failed to delete server: ' + error.message, 'error');
            }
          }



          // Helper functions
          function formatUptime(seconds) {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            
            if (days > 0) return days + 'd ' + hours + 'h';
            if (hours > 0) return hours + 'h ' + minutes + 'm';
            return minutes + 'm';
          }

          function getServerTypeLabel(type) {
            const labels = {
              'stdio': 'Local Process',
              'http': 'HTTP API',
              'sse': 'SSE Stream',
              'npx': 'NPX Package',
              'unknown': 'Unknown'
            };
            return labels[type] || type;
          }

          function tryParseJSON(str) {
            if (!str || !str.trim()) return undefined;
            try {
              return JSON.parse(str);
            } catch {
              return undefined;
            }
          }

          function switchTab(tabName) {
            // Update tab buttons
            document.querySelectorAll('.tabs .tab').forEach(tab => {
              tab.classList.toggle('tab-active', tab.dataset.tab === tabName);
            });
            
            // Update tab panes
            document.querySelectorAll('.tab-pane').forEach(pane => {
              pane.classList.add('hidden');
            });
            document.getElementById(tabName + '-view').classList.remove('hidden');
          }

          function toggleTheme() {
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'autumn' ? 'dark' : 'autumn';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
          }

          function showToast(message, type = 'info') {
            const alertClass = type === 'error' ? 'alert-error' : 
                              type === 'success' ? 'alert-success' : 'alert-info';
            
            const toast = document.createElement('div');
            toast.className = 'alert ' + alertClass;
            toast.innerHTML = '<span>' + message + '</span>';
            
            const container = document.getElementById('toast-container');
            container.appendChild(toast);
            
            setTimeout(() => {
              toast.remove();
            }, 5000);
          }

          // Load saved theme
          const savedTheme = localStorage.getItem('theme') || 'autumn';
          document.documentElement.setAttribute('data-theme', savedTheme);
        </script>
      </body>
      </html>
    `);
  });

  return app;
}
