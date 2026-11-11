import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

const app = isFirebaseConfigured ? initializeApp(config) : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// 개발 서버는 Vite 미들웨어(/api/chat)를, 배포 환경은 Cloud Function을 직접 호출한다.
// (Hosting rewrite는 요청 60초 제한이 있어서 긴 코드 생성이 끊길 수 있다.)
export const CHAT_URL = import.meta.env.DEV
  ? '/api/chat'
  : import.meta.env.VITE_CHAT_URL
    || `https://asia-northeast3-${config.projectId}.cloudfunctions.net/chat`;
