import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { handleChat } from './chatHandler.js';

initializeApp();

const openaiKey = defineSecret('OPENAI_API_KEY');

// Hosting 경유(rewrite)는 요청 60초 제한이 있어 긴 코드 생성이 끊길 수 있으므로
// 프론트엔드가 이 함수 주소를 직접 호출한다. (CORS 허용 + 로그인 토큰 검증)
export const chat = onRequest(
  {
    region: 'asia-northeast3',
    secrets: [openaiKey],
    timeoutSeconds: 300,
    memory: '512MiB',
    concurrency: 40,
    maxInstances: 10,
    cors: true,
  },
  async (req, res) => {
    const header = req.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      res.status(401).json({ error: '로그인이 필요해요.' });
      return;
    }
    try {
      await getAuth().verifyIdToken(token);
    } catch {
      res.status(401).json({ error: '로그인 정보가 만료됐어요. 다시 로그인해 주세요.' });
      return;
    }
    await handleChat(req, res, openaiKey.value());
  },
);
