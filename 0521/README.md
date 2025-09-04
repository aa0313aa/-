# 기프트샵 커뮤니티 (로컬 개발 안내)

간단한 Express + SQLite 서버입니다. 이 저장소를 로컬에서 실행하려면 아래 단계를 따르세요.

1. 의존성 설치

```powershell
cd "c:\Users\<you>\path\to\site\0521"
npm install
```

2. 환경 변수 설정

프로젝트 루트에 `.env` 파일을 만들고 `.env.example`를 참고해 값을 설정하세요.

3. 서버 시작

```powershell
npm start
```

포트는 기본 `4000`입니다. 사이트 접근: `http://localhost:4000/blog.html`

보안 권장사항
- `SESSION_SECRET`는 충분히 긴 랜덤 문자열로 설정하세요.
- 운영 환경에서는 `ADMIN_PASS`를 안전하게 관리하세요.
- DB 파일(`board.db`)은 백업 및 접근 권한 관리를 하세요.

SEO 및 색인 제출
- 서버는 각각의 게시글에 대해 검색엔진이 읽을 수 있는 스냅샷 페이지를 제공합니다: `/p/:id` (예: `/p/1`).
- 동적 sitemap은 `/sitemap.xml`에서 확인할 수 있습니다. 운영 도메인에 배포한 뒤 Google Search Console과 네이버 웹마스터도구에 sitemap URL을 제출하세요.

예: `https://your-domain.example/sitemap.xml`
