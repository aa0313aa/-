require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs'); // 비밀번호 해시를 원하면 사용, 여기선 평문 저장(데모)
const app = express();
const db = new sqlite3.Database('./board.db');

// 간단한 RSS(뉴스) 자동 수집기 - Google News (대한민국) 예시
const https = require('https');
const { parseString } = require('xml2js');
const he = require('he');

function fetchAndInsertNews() {
  // 구글 뉴스 한국 헤드라인 RSS (예시)
  const rssUrl = 'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko';
  https.get(rssUrl, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      parseString(data, (err, result) => {
        if (err) return console.error('RSS parse error', err);
        try {
          const items = result.rss.channel[0].item || [];
          items.slice(0, 10).forEach(item => {
            const title = (item.title && item.title[0]) || '';
            const description = (item.description && item.description[0]) || '';
            // 중복 검사: 동일한 제목이 존재하면 건너뜀
            db.get('SELECT id FROM posts WHERE title = ?', [title], (dberr, row) => {
              if (dberr) return console.error('DB error checking duplicate news', dberr);
              if (row) return; // 이미 있음
              // 간단 HTML 태그 제거 및 엔티티 디코드 (he 라이브러리 사용)
              let content = description.replace(/<[^>]+>/g, '');
              // 일부 RSS는 이중 인코딩(&amp;nbsp; 같은)이 섞여 있으므로 2회 디코드
              content = he.decode(he.decode(content || ''));
              // HTML non-breaking space 등을 정상 공백으로 치환
              content = content.replace(/&nbsp;|&amp;nbsp;|\u00A0/g, ' ');
              // 공백 정리
              content = content.replace(/\s+/g, ' ').trim();
              // DB에 너무 긴 내용 저장을 피하기 위해 적당히 자르기(예: 2000자)
              if (content.length > 2000) content = content.substring(0, 2000) + '...';
              db.run('INSERT INTO posts (writer, writer_id, content, is_private, title) VALUES (?, ?, ?, ?, ?)',
                ['뉴스봇', 'newsbot', content, 0, title], function(insertErr) {
                  if (insertErr) return console.error('DB insert news error', insertErr);
                  console.log('Inserted news:', title);
                }
              );
            });
          });
        } catch (e) { console.error('RSS handling error', e); }
      });
    });
  }).on('error', (e) => { console.error('RSS fetch error', e); });
}

// posts 테이블에 title 컬럼이 없을 경우 추가 (마이그레이션)
db.serialize(() => {
  db.run(`ALTER TABLE posts ADD COLUMN title TEXT`, () => {});
});

// 서버 시작 시 한 번 실행 및 주기 실행 (30분마다)
setTimeout(fetchAndInsertNews, 2000);
setInterval(fetchAndInsertNews, 1000 * 60 * 30);

// CORS: credentials 허용 (세션 쿠키 전달용)
app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
// 간단한 세션 설정 (운영에서는 secret을 환경변수로 관리하세요)
app.use(session({
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// 관리자 닉네임을 환경변수로 지정 가능 (기본: aa0313)
let ADMIN_NICK = process.env.ADMIN_NICK || 'aa0313';
function isAdminReq(req) {
  return req && req.session && req.session.user && req.session.user.nickname === ADMIN_NICK;
}

if (process.env.ADMIN_NICK) {
  console.log('ADMIN_NICK set from env:', ADMIN_NICK);
} else {
  // DB에 realname='관리자'로 등록된 사용자가 있으면 그 닉네임을 기본 관리자 닉네임으로 사용
  db.serialize(() => {
    db.get("SELECT nickname FROM users WHERE realname = ? LIMIT 1", ['관리자'], (err, row) => {
      if (!err && row && row.nickname) {
        ADMIN_NICK = row.nickname;
        console.log('Detected admin nickname from DB:', ADMIN_NICK);
      }
    });
  });
}

// 테이블에 is_private, writer_id 컬럼 추가 (마이그레이션)
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    writer TEXT,
    writer_id TEXT,
    content TEXT,
    is_private INTEGER DEFAULT 0,
    created DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`ALTER TABLE posts ADD COLUMN is_private INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE posts ADD COLUMN writer_id TEXT`, () => {});
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT UNIQUE,
    password TEXT,
    realname TEXT,
    birth TEXT,
    contact TEXT,
    email TEXT
  )`);
  db.run(`ALTER TABLE users ADD COLUMN realname TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN birth TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN contact TEXT`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN email TEXT`, () => {});
  // [기프트샵 상품 관리] products 테이블 생성
  // id, name, image, price, link
  // 최초 1회만 생성됨
  // (이미 있으면 무시)
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    image TEXT,
    price TEXT,
    link TEXT
  )`);
});

// 서버 시작 시 기본 상품 자동 등록 (products 테이블이 비어 있을 때만)
db.serialize(() => {
  db.get('SELECT COUNT(*) AS cnt FROM products', (err, row) => {
    if (!err && row && row.cnt === 0) {
      const defaultProducts = [
        { name: '스타벅스 카드 5만원권', image: 'img/Starbucks.png', price: '50,000원', link: 'https://smartstore.naver.com/sk6070' },
        { name: '롯데상품권 5만원권', image: 'img/롯데5만원.JPG', price: '50,000원', link: 'https://mkt.shopping.naver.com/link/6812c23662fffc0a4a49fd08' },
        { name: '신세계상품권 5만원권', image: 'img/신세계상품.png', price: '50,000원', link: 'https://현금화.store' },
        { name: '틴캐시 5만원권', image: 'img/card__teen.png', price: '50,000원', link: 'https://smartstore.naver.com/4989z/products/11594192295' },
        { name: '도서문화상품권 1만원권', image: 'img/dosupng.png', price: '10,000원', link: '' },
        { name: '컬쳐랜드상품권 1만원권', image: 'img/cu.png', price: '10,000원', link: 'https://mkt.shopping.naver.com/link/683d9d1ad20fbf73c9d596bc' },
        { name: '컬쳐랜드상품권 2만원권', image: 'img/cu.png', price: '20,000원', link: 'https://mkt.shopping.naver.com/link/683d9d1ae625370ec15afd4b' }
      ];
      const stmt = db.prepare('INSERT INTO products (name, image, price, link) VALUES (?, ?, ?, ?)');
      defaultProducts.forEach(p => stmt.run(p.name, p.image, p.price, p.link));
      stmt.finalize();
      console.log('기본 상품 자동 등록 완료');
    }
  });
});
  // 기본 관리자 계정 자동 생성 (닉네임: aa0313, 비밀번호: admin)
  db.serialize(() => {
    db.get('SELECT * FROM users WHERE nickname = ?', ['aa0313'], (err, row) => {
      if (err) return console.error('DB error checking admin', err);
      if (!row) {
          try {
            const adminPass = process.env.ADMIN_PASS || 'admin';
            const hashed = bcrypt.hashSync(adminPass, 10);
            db.run('INSERT INTO users (nickname, password, realname, birth, contact, email) VALUES (?, ?, ?, ?, ?, ?)',
              ['aa0313', hashed, '관리자', '', '', 'admin@local'], (e) => {
                if (e) return console.error('Admin create error', e);
                console.log('관리자 계정(aa0313) 생성 완료 (비밀번호 해시 저장)');
              }
            );
          } catch (e) {
            console.error('Admin hash error', e);
          }
      }
    });
  });

          // 기존에 삽입된 RSS/뉴스 포스트의 내용에 남아있는 HTML 엔티티를 정리하는 일회성 스크립트
          function sanitizeExistingPosts() {
            db.all("SELECT id, content, writer_id FROM posts WHERE content LIKE '%&nbsp;%' OR writer_id = 'newsbot'", [], (err, rows) => {
              if (err) { console.error('Sanitize select error', err); return; }
              rows.forEach(r => {
                try {
                  let cleaned = (r.content || '').replace(/<[^>]+>/g, '');
                  cleaned = he.decode(he.decode(cleaned || ''));
                  cleaned = cleaned.replace(/&nbsp;|&amp;nbsp;|\u00A0/g, ' ');
                  cleaned = cleaned.replace(/\s+/g, ' ').trim();
                  if (cleaned !== (r.content || '')) {
                    db.run('UPDATE posts SET content = ? WHERE id = ?', [cleaned, r.id], (uErr) => {
                      if (uErr) return console.error('Sanitize update error', uErr);
                      console.log('Sanitized post', r.id);
                    });
                  }
                } catch (e) {
                  console.error('Sanitize error for id', r.id, e);
                }
              });
            });
          }

          // 서버 시작 후 짧은 지연 후 일회성 정리 수행
          setTimeout(() => { try { sanitizeExistingPosts(); } catch(e) { console.error('sanitizeExistingPosts failed', e); } }, 2000);

// --- 상품 복구 임시 코드 삭제(또는 주석 처리) 완료 ---
// db.serialize(() => {
//   db.run('DELETE FROM products', [], (err) => {
//     if (!err) {
//       const products = [
//         { name: '스타벅스 5만원권', image: 'img/Starbucks.png', price: '50,000원', link: 'https://smartstore.naver.com/sk6070/products/1234567890' },
//         { name: 'CU 모바일상품권 1만원', image: 'img/cu.png', price: '10,000원', link: 'https://smartstore.naver.com/sk6070/products/2345678901' },
//         { name: '신세계상품권 5만원', image: 'img/신세계상품.png', price: '50,000원', link: 'https://smartstore.naver.com/sk6070/products/3456789012' },
//         { name: '롯데상품권 5만원', image: 'img/롯데5만원.JPG', price: '50,000원', link: 'https://smartstore.naver.com/sk6070/products/4567890123' },
//         { name: '틴캐시 1만원', image: 'img/card__teen.png', price: '10,000원', link: 'https://smartstore.naver.com/sk6070/products/5678901234' }
//       ];
//       const stmt = db.prepare('INSERT INTO products (name, image, price, link) VALUES (?, ?, ?, ?)');
//       products.forEach(p => stmt.run(p.name, p.image, p.price, p.link));
//       stmt.finalize();
//       console.log('요청 상품 데이터로 복구 완료');
//     }
//   });
// });

// 글 목록 (비공개글은 본인 또는 관리자만 볼 수 있도록)
app.get('/api/posts', (req, res) => {
  // 세션 기반으로 현재 사용자 닉네임을 가져옴 (브라우저에서 credentials: 'include'로 요청할 것)
  const sessionUser = req.session && req.session.user ? req.session.user.nickname : '';
  const myId = sessionUser || req.query.my_id || '';
  const isAdmin = myId === 'aa0313';
  db.all('SELECT * FROM posts ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({error: 'DB error'});
    // 비공개글: 본인 또는 관리자만 볼 수 있음
    const filtered = rows.filter(row => !row.is_private || (myId && row.writer_id === myId) || (isAdmin && row.is_private));
    res.json(filtered.map(row => ({
      id: row.id,
      writer: row.writer,
      writer_id: row.writer_id,
      title: row.title || (row.content ? row.content.substring(0, 40) : ''),
      content: row.content,
      is_private: !!row.is_private,
      date: row.created
    })));
  });
});

// 글 등록
app.post('/api/posts', (req, res) => {
  const { writer, content, is_private } = req.body;
  const writer_id = writer; // 닉네임이 곧 writer_id
  db.run('INSERT INTO posts (writer, writer_id, content, is_private) VALUES (?, ?, ?, ?)',
    [writer, writer_id, content, is_private ? 1 : 0],
    function(err) {
      if (err) return res.status(500).json({error: 'DB error'});
      res.json({ id: this.lastID });
    }
  );
});

// 글 수정
app.put('/api/posts/:id', (req, res) => {
  const { content, is_private, my_id } = req.body;
  db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({error: '글을 찾을 수 없음'});
    if (!my_id || row.writer_id !== my_id) return res.status(403).json({error: '본인만 수정 가능'});
    db.run('UPDATE posts SET content = ?, is_private = ? WHERE id = ?',
      [content, is_private ? 1 : 0, req.params.id],
      function(err2) {
        if (err2) return res.status(500).json({error: 'DB error'});
        res.json({ success: true });
      }
    );
  });
});

// 글 삭제
app.delete('/api/posts/:id', (req, res) => {
  const my_id = (req.session && req.session.user) ? req.session.user.nickname : (req.query.my_id || '');
  const is_admin_delete = (req.session && req.session.user && req.session.user.nickname === 'aa0313') || req.query.is_admin_delete === 'true' || req.query.is_admin_delete === true;
  db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({error: '글을 찾을 수 없음'});
    // 관리자(admin)는 모든 글 삭제 가능
    if (is_admin_delete) {
      db.run('DELETE FROM posts WHERE id = ?', [req.params.id], function(err2) {
        if (err2) return res.status(500).json({error: 'DB error'});
        return res.json({ success: true });
      });
      return;
    }
    // 일반 사용자는 본인 글만 삭제 가능
    if (!my_id || row.writer_id !== my_id) return res.status(403).json({error: '본인만 삭제 가능'});
    db.run('DELETE FROM posts WHERE id = ?', [req.params.id], function(err2) {
      if (err2) return res.status(500).json({error: 'DB error'});
      res.json({ success: true });
    });
  });
});

// 관리자 전용 간단한 삭제 엔드포인트 (세션 기반 인증 필요)
app.post('/admin/delete-post/:id', (req, res) => {
  if (!isAdminReq(req)) return res.status(403).json({ error: '관리자 권한 필요' });
  db.run('DELETE FROM posts WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true });
  });
});

// 회원가입
app.post('/api/signup', (req, res) => {
  const { nickname, password, realname, birth, contact, email } = req.body;
  if (!nickname || !password || !realname || !birth || !contact || !email) {
    return res.json({ success: false, error: '모든 항목(닉네임, 비밀번호, 이름, 생년월일, 연락처, 이메일) 필수' });
  }
  db.get('SELECT * FROM users WHERE nickname = ?', [nickname], (err, row) => {
    if (err) { console.error('DB get error:', err); return res.json({ success: false, error: 'DB 오류' }); }
    if (row) return res.json({ success: false, error: '이미 존재하는 닉네임' });
    try {
      const hashed = bcrypt.hashSync(password, 10);
      db.run(
        'INSERT INTO users (nickname, password, realname, birth, contact, email) VALUES (?, ?, ?, ?, ?, ?)',
        [nickname, hashed, realname, birth, contact, email],
        function(err2) {
          if (err2) { console.error('DB insert error:', err2); return res.json({ success: false, error: 'DB 오류' }); }
          res.json({ success: true });
        }
      );
    } catch (e) {
      console.error('Hash error', e);
      return res.json({ success: false, error: '암호화 오류' });
    }
  });
});

// 로그인
app.post('/api/login', (req, res) => {
  const { nickname, password } = req.body;
  db.get('SELECT * FROM users WHERE nickname = ?', [nickname], (err, row) => {
    if (err) { console.error('DB get error:', err); return res.json({ success: false, error: 'DB 오류' }); }
    if (!row) return res.json({ success: false, error: '존재하지 않는 사용자' });
    // 비밀번호 확인: DB에 해시가 있으면 bcrypt 비교, 없으면 평문 비교 후 해시로 마이그레이션
    try {
      const stored = row.password || '';
      if (stored && (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$'))) {
        // bcrypt hash
        const ok = bcrypt.compareSync(password, stored);
        if (!ok) return res.json({ success: false, error: '비밀번호 불일치' });
      } else {
        // 기존 평문(legacy) 또는 비어있음
        if (stored !== password) return res.json({ success: false, error: '비밀번호 불일치' });
        // 평문이면 해시로 마이그레이션
        const newHash = bcrypt.hashSync(password, 10);
        db.run('UPDATE users SET password = ? WHERE id = ?', [newHash, row.id], () => {});
      }
      // 로그인 성공 시 세션에 사용자 정보 저장
      req.session.user = { id: row.id, nickname: row.nickname };
      res.json({ success: true, id: row.id, nickname: row.nickname });
    } catch (e) {
      console.error('Login error', e);
      return res.json({ success: false, error: '로그인 처리 오류' });
    }
  });
});

// 현재 로그인한 사용자 정보 반환 (세션 기반)
app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) return res.json({ success: true, user: req.session.user });
  return res.json({ success: true, user: null });
});

// 정적 파일 접근 제한: blog.html 만 공개, 나머지 .html은 관리자만 접근 허용
app.use((req, res, next) => {
  // only intercept requests for .html files or root
  const urlPath = req.path || '';
  if (urlPath === '/' ) return res.sendFile(path.join(__dirname, 'blog.html'));
  if (!urlPath.endsWith('.html')) return next();
  // allow blog.html publicly
  if (urlPath.endsWith('/blog.html') || urlPath === '/blog.html') return next();
  // allow admin if session user is admin
  if (isAdminReq(req)) return next();
  // otherwise deny
  return res.status(403).send('403 Forbidden - 로그인한 관리자만 접근할 수 있습니다.');
});

// 정적 파일 서비스 (프로젝트 루트)
app.use(express.static(path.join(__dirname)));
// img와 배너 폴더가 한글/특수문자일 수 있으므로 명시적 제공
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use('/배너', express.static(path.join(__dirname, '배너')));

// 사용자 정보 조회
app.get('/api/users/:id', (req, res) => {
  db.get('SELECT id, nickname, realname, birth, contact, email FROM users WHERE id = ?', [req.params.id], (err, row) => {
    if (err) { console.error('DB get error:', err); return res.json({ success: false, error: 'DB 오류' }); }
    if (!row) return res.json({ success: false, error: '존재하지 않는 사용자' });
    res.json({ success: true, user: row });
  });
});

// 비밀번호 변경
app.put('/api/users/:id/password', (req, res) => {
  const { old_password, new_password } = req.body;
  db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({error: '사용자를 찾을 수 없음'});
    // 비밀번호 확인 (해시 비교는 생략, 평문 그대로 비교)
    if (row.password !== old_password) return res.json({ success: false, error: '현재 비밀번호 불일치' });
    db.run('UPDATE users SET password = ? WHERE id = ?',
      [new_password, req.params.id],
      function(err2) {
        if (err2) return res.status(500).json({error: 'DB error'});
        res.json({ success: true });
      }
    );
  });
});

// 사용자 정보 수정
app.put('/api/users/:id', (req, res) => {
  const { realname, birth, contact, email } = req.body;
  db.run('UPDATE users SET realname = ?, birth = ?, contact = ?, email = ? WHERE id = ?',
    [realname, birth, contact, email, req.params.id],
    function(err) {
      if (err) return res.status(500).json({error: 'DB error'});
      res.json({ success: true });
    }
  );
});

// 포스트에 댓글 달기
app.post('/api/posts/:id/comments', (req, res) => {
  const { writer, content } = req.body;
  const post_id = req.params.id;
  db.run('INSERT INTO comments (post_id, writer, content) VALUES (?, ?, ?)',
    [post_id, writer, content],
    function(err) {
      if (err) return res.status(500).json({error: 'DB error'});
      res.json({ id: this.lastID });
    }
  );
});

// 댓글 수정
app.put('/api/comments/:id', (req, res) => {
  const { content } = req.body;
  db.run('UPDATE comments SET content = ? WHERE id = ?',
    [content, req.params.id],
    function(err) {
      if (err) return res.status(500).json({error: 'DB error'});
      res.json({ success: true });
    }
  );
});

// 댓글 삭제
app.delete('/api/comments/:id', (req, res) => {
  db.run('DELETE FROM comments WHERE id = ?',
    [req.params.id],
    function(err) {
      if (err) return res.status(500).json({error: 'DB error'});
      res.json({ success: true });
    }
  );
});

// 특정 포스트의 댓글 목록 조회
app.get('/api/posts/:id/comments', (req, res) => {
  const post_id = req.params.id;
  db.all('SELECT * FROM comments WHERE post_id = ? ORDER BY id DESC', [post_id], (err, rows) => {
    if (err) return res.status(500).json({error: 'DB error'});
    res.json(rows.map(row => ({
      id: row.id,
      post_id: row.post_id,
      writer: row.writer,
      content: row.content,
      date: row.created
    })));
  });
});

// 글 상세 조회
app.get('/api/posts/:id', (req, res) => {
  const myId = req.query.my_id || '';
  db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({error: '글을 찾을 수 없음'});
    // 비공개글은 본인만 볼 수 있음
    if (row.is_private && (!myId || row.writer_id !== myId)) {
      return res.status(403).json({error: '비공개 글은 본인만 볼 수 있습니다.'});
    }
    res.json({
      id: row.id,
      writer: row.writer,
      writer_id: row.writer_id,
      title: row.title || (row.content ? row.content.substring(0, 20) : ''),
      content: row.content,
      is_private: !!row.is_private,
      date: row.created
    });
  });
});

// SEO-friendly snapshot page for individual posts (for crawlers)
app.get('/p/:id', (req, res) => {
  db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).send('Not found');
    const title = row.title || (row.content ? row.content.substring(0, 60) : '게시글');
    const rawContent = (row.content || '').replace(/\s+/g, ' ').trim();
    const description = rawContent.substring(0, 160);
    const url = `${req.protocol}://${req.get('host')}/p/${row.id}`;
    // try to find a source/from hint (simple heuristic: last ' - 출처' or ' - 언론사' in title)
    let sourceName = '';
    const match = title.match(/-\s*([^\-]+)$/);
    if (match) sourceName = match[1].trim();
    // default og:image: site logo or a product image if available
    const ogImage = `${req.protocol}://${req.get('host')}/img/Starbucks.webp`;
    const html = `<!doctype html>
<html lang="ko"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(url)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:site_name" content="게시판 | 기프트샵 커뮤니티">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: title,
      description: description,
      url: url,
      author: { "@type": "Person", name: row.writer || '뉴스봇' },
      datePublished: row.created
    })}</script>
</head><body>
  <article>
    <h1>${escapeHtml(title)}</h1>
    <p>작성자: ${escapeHtml(row.writer || '뉴스봇')}</p>
    <div>${escapeHtml(row.content || '')}</div>
    ${sourceName ? (`<p>원문: ${escapeHtml(sourceName)}</p>`) : ''}
  </article>
</body></html>`;
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });
});

// dynamic sitemap including posts
app.get('/sitemap.xml', (req, res) => {
  db.all('SELECT id, created FROM posts ORDER BY id DESC LIMIT 1000', [], (err, rows) => {
    if (err) return res.status(500).send('error');
    const base = `${req.protocol}://${req.get('host')}`;
    const urls = [
      { loc: `${base}/blog.html`, lastmod: new Date().toISOString() },
      { loc: `${base}/`, lastmod: new Date().toISOString() }
    ];
    rows.forEach(r => urls.push({ loc: `${base}/p/${r.id}`, lastmod: (r.created || new Date()).toISOString() }));
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u=>`  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n  </url>`).join('\n')}\n</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  });
});

// helper to escape HTML in snapshot
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// [관리자] 회원 전체 목록 조회
app.get('/api/admin/users', (req, res) => {
  const adminId = req.query.admin_id || '';
  if (adminId !== 'admin') return res.status(403).json({ error: '관리자 권한 필요' });
  db.all('SELECT id, nickname, realname, birth, contact, email FROM users ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true, users: rows });
  });
});

// [관리자] 모든 포스트 조회 (세션 기반 권한 필요)
app.get('/api/admin/posts', (req, res) => {
  if (!isAdminReq(req)) return res.status(403).json({ error: '관리자 권한 필요' });
  db.all('SELECT * FROM posts ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true, posts: rows });
  });
});

// 로그아웃
app.post('/api/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(err => {
      if (err) return res.status(500).json({ success: false, error: 'Logout failed' });
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

// [관리자] 회원 상세 조회
app.get('/api/admin/users/:id', (req, res) => {
  const adminId = req.query.admin_id || '';
  if (adminId !== 'admin') return res.status(403).json({ error: '관리자 권한 필요' });
  db.get('SELECT id, nickname, realname, birth, contact, email FROM users WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (!row) return res.status(404).json({ error: '존재하지 않는 사용자' });
    res.json({ success: true, user: row });
  });
});

// [관리자] 회원 정보 수정
app.put('/api/admin/users/:id', (req, res) => {
  const adminId = req.body.admin_id || '';
  if (adminId !== 'admin') return res.status(403).json({ error: '관리자 권한 필요' });
  const { realname, birth, contact, email } = req.body;
  db.run('UPDATE users SET realname = ?, birth = ?, contact = ?, email = ? WHERE id = ?',
    [realname, birth, contact, email, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ success: true });
    }
  );
});

// [관리자] 회원 삭제
app.delete('/api/admin/users/:id', (req, res) => {
  const adminId = req.query.admin_id || '';
  if (adminId !== 'admin') return res.status(403).json({ error: '관리자 권한 필요' });
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true });
  });
});

// 상품 목록 조회
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(rows);
  });
});

// 상품 추가
app.post('/api/products', (req, res) => {
  const { name, image, price, link } = req.body;
  if (!name || !image || !price) return res.status(400).json({ error: '필수 항목 누락' });
  db.run('INSERT INTO products (name, image, price, link) VALUES (?, ?, ?, ?)',
    [name, image, price, link],
    function(err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ id: this.lastID });
    }
  );
});

// 상품 수정
app.put('/api/products/:id', (req, res) => {
  const { name, image, price, link } = req.body;
  db.run('UPDATE products SET name = ?, image = ?, price = ?, link = ? WHERE id = ?',
    [name, image, price, link, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ success: true });
    }
  );
});

// 상품 삭제
app.delete('/api/products/:id', (req, res) => {
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true });
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log('Server started on port', PORT);
});