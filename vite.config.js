/* global process */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleChat } from './functions/chatHandler.js'

// 로컬 개발 서버에서만 쓰는 챗 API. 배포 환경은 Cloud Function(functions/index.js)이 같은 핸들러를 사용한다.
// 키는 .env 의 OPENAI_API_KEY 에서 읽는다.
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
              } catch {
                req.body = {};
              }
              try {
                await handleChat(req, res, process.env.OPENAI_API_KEY);
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
