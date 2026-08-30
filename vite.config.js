import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import handler from './api/chat.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-chat-middleware',
      configureServer(server) {
        server.middlewares.use('/api/chat', async (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk;
            });
            req.on('end', async () => {
              try {
                req.body = JSON.parse(body || '{}');
              } catch (e) {
                req.body = {};
              }
              try {
                await handler(req, res);
              } catch (err) {
                console.error("API handler error:", err);
                if (!res.headersSent) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err.message }));
                }
              }
            });
          } else {
            res.statusCode = 405;
            res.end('Method Not Allowed');
          }
        });
      }
    }
  ],
})
