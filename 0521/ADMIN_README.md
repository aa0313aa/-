관리자 접근 체크 (간단 가이드)

목적
- 로컬에서 관리자 계정으로 로그인하고 `/admin.html`과 관리자 엔드포인트(`/api/admin/posts`)에 접근 가능한지 빠르게 검사합니다.

요구사항
- 서버가 `http://localhost:4000`에서 실행 중이어야 합니다.
- Node.js가 설치되어 있으면 `admin-check.js`를 사용할 수 있습니다.
- PowerShell(Windows)이면 `admin-check.ps1`을 사용합니다.

기본 관리자 계정
- 닉네임: aa0313
- 비밀번호: 환경변수 `ADMIN_PASS`가 설정되어 있지 않으면 기본 `admin`입니다.

PowerShell 사용 예
1. PowerShell에서 환경변수 설정(옵션):
   $env:ADMIN_PASS = 'your_admin_password'
2. 서버 실행 후 스크립트 실행:
   .\admin-check.ps1

Node.js 사용 예
1. (옵션) 환경변수 설정(Windows PowerShell):
   $env:ADMIN_PASS = 'your_admin_password'
2. 스크립트 실행:
   node admin-check.js

주의
- `admin-check.js`는 쿠키 유지가 기본적으로 처리되지 않으므로 브라우저에서의 완전한 세션 검증은 `admin-check.ps1` 또는 직접 브라우저 사용을 권장합니다.
- 운영환경에서는 `SESSION_SECRET`과 `ADMIN_PASS`를 반드시 안전하게 설정하세요.
