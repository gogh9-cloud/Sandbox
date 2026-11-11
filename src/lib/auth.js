import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { auth, googleProvider } from './firebase';

const SIGNED_OUT = { user: null, profile: null, isTeacher: false };

// 로그인 상태, 프로필(이름/사진/이메일), 교사 권한(custom claim teacher)을 돌려준다.
export function useAuth() {
  const [state, setState] = useState({ ...SIGNED_OUT, loading: Boolean(auth) });

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ ...SIGNED_OUT, loading: false });
        return;
      }
      let isTeacher = false;
      try {
        isTeacher = (await user.getIdTokenResult()).claims.teacher === true;
      } catch (e) {
        console.error('Failed to read auth claims:', e);
      }
      setState({
        user,
        profile: {
          name: user.displayName || user.email.split('@')[0],
          picture: user.photoURL || '',
          email: user.email,
        },
        isTeacher,
        loading: false,
      });
    });
  }, []);

  return state;
}

export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (e) {
    // 학교 기기에서 팝업이 막힌 경우 전체 화면 이동 방식으로 다시 시도한다.
    if (e.code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, googleProvider);
      return;
    }
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    throw e;
  }
}

export function signOutUser() {
  return signOut(auth);
}
