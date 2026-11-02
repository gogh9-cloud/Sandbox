/* global process */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import handler from './api/chat.js'

// 로컬 개발 서버에서 /api/chat이 .env의 OPENAI_API_KEY를 읽을 수 있게 한다 (배포 환경은 Vercel 환경변수 사용)
const localEnv = loadEnv('development', process.cwd(), '')
process.env.OPENAI_API_KEY ??= localEnv.OPENAI_API_KEY

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
