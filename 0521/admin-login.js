// admin-login.js
// 브라우저 콘솔에서 실행하여 관리자 계정으로 로그인
// 사용: 콘솔에 붙여넣고 실행

(async ()=>{
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'dksgytjd07@gmail.com', password: '090912aa' })
    });
    console.log('login status', res.status);
    console.log(await res.json());
  } catch(e) { console.error(e); }
})();
