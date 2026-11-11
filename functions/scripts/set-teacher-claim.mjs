// 사용법 (한 번만 실행):
//   GCLOUD_PROJECT=<프로젝트ID> node scripts/set-teacher-claim.mjs 선생님@이메일 [--remove]
// 먼저 그 계정으로 앱에 한 번 로그인해 둬야 하고, 실행 후에는 앱에서 로그아웃했다가 다시 로그인한다.
// 인증은 GOOGLE_APPLICATION_CREDENTIALS(서비스 계정 JSON) 또는 `gcloud auth application-default login` 을 쓴다.
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const [, , email, flag] = process.argv;
if (!email || !process.env.GCLOUD_PROJECT) {
  console.error('사용법: GCLOUD_PROJECT=<프로젝트ID> node scripts/set-teacher-claim.mjs <이메일> [--remove]');
  process.exit(1);
}

initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const teacher = flag !== '--remove';
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims || {}), teacher });
console.log(`${email}: teacher = ${teacher}  (앱에서 로그아웃 후 다시 로그인하면 적용돼요)`);
