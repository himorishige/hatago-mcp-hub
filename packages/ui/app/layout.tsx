import { Style } from 'hono/css';

export default function Layout({ children, title }: { children?: any; title?: string }) {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ? `${title} - ` : ''}🏮 Hatago Hub</title>
        <Style />
        <style>{`
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
          }
          
          .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
          }
          
          .header {
            background: white;
            border-bottom: 1px solid #e0e0e0;
            margin-bottom: 20px;
            padding: 20px 0;
          }
          
          .header h1 {
            font-size: 1.5rem;
            font-weight: 600;
            color: #d97706;
          }
          
          .card {
            background: white;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          }
          
          .button {
            background: #d97706;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.875rem;
            transition: background-color 0.2s;
          }
          
          .button:hover {
            background: #b45309;
          }
          
          .button:disabled {
            background: #9ca3af;
            cursor: not-allowed;
          }
          
          .status-badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 0.75rem;
            font-weight: 500;
          }
          
          .status-online {
            background: #dcfce7;
            color: #166534;
          }
          
          .status-offline {
            background: #fecaca;
            color: #991b1b;
          }
          
          .loading {
            text-align: center;
            padding: 40px;
            color: #6b7280;
          }
          
          table {
            width: 100%;
            border-collapse: collapse;
          }
          
          th, td {
            text-align: left;
            padding: 12px;
            border-bottom: 1px solid #e5e7eb;
          }
          
          th {
            font-weight: 600;
            background: #f9fafb;
          }
        `}</style>
      </head>
      <body>
        <div class="header">
          <div class="container">
            <h1>🏮 Hatago MCP Hub</h1>
          </div>
        </div>
        <div class="container">{children}</div>
        <script type="module" src="/static/client.js"></script>
      </body>
    </html>
  );
}
