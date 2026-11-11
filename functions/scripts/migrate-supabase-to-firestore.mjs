// Supabase student_sessions -> Firestore student_sessions 이전 스크립트.
// 기본은 미리보기(dry-run)이고, --write 를 붙여야 실제로 Firestore에 쓴다. 여러 번 실행해도 같은 문서를 덮어쓸 뿐이다.
//
//   GCLOUD_PROJECT=<프로젝트ID> node scripts/migrate-supabase-to-firestore.mjs [--write]
//
// Supabase 주소/키는 환경변수 SUPABASE_URL, SUPABASE_ANON_KEY 또는 프로젝트 루트 .env 의
// VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 에서 읽는다.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const MAX_DOC_BYTES = 900_000;
const MAX_HTML_CHARS = 390_000;

// src/lib/sessionsDb.js 의 buildSessionDoc 과 같은 규칙으로 문서를 만든다.
export function transformRow(row) {
  let messages = (Array.isArray(row.messages) ? row.messages : [])
    .filter((m) => m && m.sender !== 'metadata')
    .map((m) => {
      const copy = { ...m };
      const hadImage = Boolean(copy.image);
      delete copy.image;
      delete copy.fullText;
      return hadImage ? { ...copy, hasImage: true } : copy;
    });
  const oldMeta = (Array.isArray(row.messages) ? row.messages : []).find((m) => m && m.sender === 'metadata');
  const metadata = {
    id: 'metadata',
    sender: 'metadata',
    isBanned: Boolean(oldMeta?.isBanned),
    violationCount: oldMeta?.violationCount || 0,
    banmalCount: oldMeta?.banmalCount || 0,
  };
  const htmlCode = typeof row.html_code === 'string' && row.html_code.length <= MAX_HTML_CHARS ? row.html_code : '';
  const build = () => JSON.parse(JSON.stringify({
    session_id: String(row.session_id),
    student_email: row.student_email,
    student_name: row.student_name || row.student_email,
    title: row.title || '새 채팅',
    messages: [...messages, metadata],
    html_code: htmlCode,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  }));
  let payload = build();
  while (Buffer.byteLength(JSON.stringify(payload)) > MAX_DOC_BYTES && messages.length > 2) {
    messages = messages.slice(1);
    payload = build();
  }
  return { docId: `${row.student_email}__${row.session_id}`, payload };
}

function readDotEnv() {
  const file = resolve(dirname(fileURLToPath(import.meta.url)), '../../.env');
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8').split(/\r?\n/)
      .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]),
  );
}

async function fetchAllRows(url, key) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${url}/rest/v1/student_sessions?select=*&order=updated_at.desc`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`Supabase 조회 실패 (${res.status}): ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function main() {
  const write = process.argv.includes('--write');
  const env = { ...readDotEnv(), ...process.env };
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase 주소/키를 찾을 수 없어요.');
  if (write && !env.GCLOUD_PROJECT) throw new Error('--write 에는 GCLOUD_PROJECT=<프로젝트ID> 가 필요해요.');

  const rows = await fetchAllRows(url, key);
  const docs = rows.filter((r) => r.student_email && r.session_id).map(transformRow);
  const students = new Set(docs.map((d) => d.payload.student_email));
  console.log(`Supabase 행 ${rows.length}개 -> Firestore 문서 ${docs.length}개 (학생 ${students.size}명)`);

  if (!write) {
    console.log('미리보기만 했어요. 실제로 옮기려면 --write 를 붙여 다시 실행하세요.');
    return;
  }
  const { initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  initializeApp({ projectId: env.GCLOUD_PROJECT });
  const writer = getFirestore().bulkWriter();
  let failed = 0;
  writer.onWriteError((err) => { failed++; console.error('쓰기 실패:', err.documentRef.path, err.message); return false; });
  for (const { docId, payload } of docs) writer.set(getFirestore().collection('student_sessions').doc(docId), payload);
  await writer.close();
  console.log(`완료: ${docs.length - failed}개 성공, ${failed}개 실패`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
