import {
  collection, doc, setDoc, getDocs, updateDoc, deleteDoc, onSnapshot, query, where, orderBy,
} from 'firebase/firestore';
import { db } from './firebase';

const COLLECTION = 'student_sessions';

// Firestore 문서 한도는 1MiB. 여유를 두고 이 크기를 넘으면 오래된 메시지부터 덜어낸다.
const MAX_DOC_BYTES = 900_000;
// firestore.rules 의 html_code 한도(400000자)보다 작게 유지한다.
const MAX_HTML_CHARS = 390_000;

export const sessionDocId = (email, sessionId) => `${email}__${sessionId}`;

// 교사 화면에는 이미지(base64)와 fullText(코드가 중복된 원문)가 필요 없으므로 동기화본에서 제외한다.
export function compactMessages(messages) {
  return messages.map((m) => {
    if (m.sender === 'metadata') return m;
    const copy = { ...m };
    const hadImage = Boolean(copy.image);
    delete copy.image;
    delete copy.fullText;
    return hadImage ? { ...copy, hasImage: true } : copy;
  });
}

export function buildSessionDoc({ email, name, session, meta }) {
  const metadata = {
    id: 'metadata',
    sender: 'metadata',
    isBanned: Boolean(meta?.isBanned),
    violationCount: meta?.violationCount || 0,
    banmalCount: meta?.banmalCount || 0,
  };
  let htmlCode = typeof session.htmlCode === 'string' ? session.htmlCode : '';
  if (htmlCode.length > MAX_HTML_CHARS) {
    console.warn('코드가 너무 길어 교사 화면용 동기화에서 제외했어요.');
    htmlCode = '';
  }
  let messages = compactMessages(Array.isArray(session.messages) ? session.messages : []);
  const build = () => JSON.parse(JSON.stringify({
    session_id: String(session.id),
    student_email: email,
    student_name: name || email,
    title: session.title || '새 채팅',
    messages: [...messages, metadata],
    html_code: htmlCode,
    updated_at: new Date().toISOString(),
  }));
  let payload = build();
  while (new Blob([JSON.stringify(payload)]).size > MAX_DOC_BYTES && messages.length > 2) {
    messages = messages.slice(1);
    payload = build();
  }
  return payload;
}

export function upsertSession(args) {
  const payload = buildSessionDoc(args);
  return setDoc(doc(db, COLLECTION, sessionDocId(args.email, payload.session_id)), payload);
}

// 내 세션이 서버에 있는지 실시간으로 알려 준다.
// 내가 쓰는 중이거나(캐시) 서버 확인 전의 스냅샷은 건너뛰고, 서버가 확정한 목록만 전달한다.
export function subscribeOwnSessionIds(email, onIds, onError) {
  const q = query(collection(db, COLLECTION), where('student_email', '==', email));
  return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
    if (snap.metadata.fromCache || snap.metadata.hasPendingWrites) return;
    onIds(new Set(snap.docs.map((d) => d.data().session_id)));
  }, onError);
}

export async function fetchAllSessions() {
  const snap = await getDocs(query(collection(db, COLLECTION), orderBy('updated_at', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function updateSessionMessages(docId, messages) {
  return updateDoc(doc(db, COLLECTION, docId), { messages, updated_at: new Date().toISOString() });
}

export function removeSession(docId) {
  return deleteDoc(doc(db, COLLECTION, docId));
}
