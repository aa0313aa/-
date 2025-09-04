// 관리자 로그인 및 /api/admin/posts 검증 (Node.js)
// 사용: node admin-check.js
// 서버가 http://localhost:4000 에서 실행 중이어야 함

const fetch = require('node-fetch');
const base = process.env.BASE_URL || 'http://localhost:4000';
const nickname = 'aa0313';
const password = process.env.ADMIN_PASS || 'admin';

(async () => {
  try {
    console.log('로그인 시도:', nickname, '@', base);
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname, password }),
      credentials: 'include'
    });
    const body = await res.text();
    console.log('응답 status:', res.status);
    console.log('응답 body:', body);
    if (res.ok) {
      console.log('로그인 성공 — 관리자 posts 조회 시도');
      // node-fetch는 기본적으로 쿠키를 저장하지 않으므로 간단 검증으로 브라우저에서 확인 권장
      // 대신 server-side에서 간단히 fetch로 결과 조회
      const posts = await fetch(`${base}/api/admin/posts`, { headers: { 'Content-Type': 'application/json' } });
      console.log('/api/admin/posts status:', posts.status);
      console.log(await posts.text());
    } else {
      console.log('로그인 실패 — 브라우저에서 로그인 후 admin.html 접속 권장');
    }
  } catch (e) { console.error('오류', e); }
})();
