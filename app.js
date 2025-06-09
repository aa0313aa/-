const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // 비밀번호 해시를 원하면 사용, 여기선 평문 저장(데모)
const app = express();
const db = new sqlite3.Database('./board.db');

app.use(cors());
app.use(bodyParser.json());

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
  // writer_id(닉네임) 쿼리 파라미터로 받음
  const myId = req.query.my_id || '';
  const isAdmin = myId === 'admin';
  db.all('SELECT * FROM posts ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({error: 'DB error'});
    // 비공개글: 본인 또는 관리자만 볼 수 있음
    const filtered = rows.filter(row => !row.is_private || (myId && row.writer_id === myId) || (isAdmin && row.is_private));
    res.json(filtered.map(row => ({
      id: row.id,
      writer: row.writer,
      writer_id: row.writer_id,
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
  const my_id = req.query.my_id || '';
  const is_admin_delete = req.query.is_admin_delete === 'true' || req.query.is_admin_delete === true;
  db.get('SELECT * FROM posts WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({error: '글을 찾을 수 없음'});
    // 관리자(admin)는 모든 글 삭제 가능
    if (is_admin_delete && my_id === 'admin') {
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

// 회원가입
app.post('/api/signup', (req, res) => {
  const { nickname, password, realname, birth, contact, email } = req.body;
  if (!nickname || !password || !realname || !birth || !contact || !email) {
    return res.json({ success: false, error: '모든 항목(닉네임, 비밀번호, 이름, 생년월일, 연락처, 이메일) 필수' });
  }
  db.get('SELECT * FROM users WHERE nickname = ?', [nickname], (err, row) => {
    if (err) { console.error('DB get error:', err); return res.json({ success: false, error: 'DB 오류' }); }
    if (row) return res.json({ success: false, error: '이미 존재하는 닉네임' });
    db.run(
      'INSERT INTO users (nickname, password, realname, birth, contact, email) VALUES (?, ?, ?, ?, ?, ?)',
      [nickname, password, realname, birth, contact, email],
      function(err2) {
        if (err2) { console.error('DB insert error:', err2); return res.json({ success: false, error: 'DB 오류' }); }
        res.json({ success: true });
      }
    );
  });
});

// 로그인
app.post('/api/login', (req, res) => {
  const { nickname, password } = req.body;
  db.get('SELECT * FROM users WHERE nickname = ?', [nickname], (err, row) => {
    if (err) { console.error('DB get error:', err); return res.json({ success: false, error: 'DB 오류' }); }
    if (!row) return res.json({ success: false, error: '존재하지 않는 사용자' });
    // 비밀번호 확인 (해시 비교는 생략, 평문 그대로 비교)
    if (row.password !== password) return res.json({ success: false, error: '비밀번호 불일치' });
    // 로그인 성공 시 token 필드 추가
    res.json({ success: true, id: row.id, nickname: row.nickname, token: `token_${row.nickname}` });
  });
});

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

// [관리자] 회원 전체 목록 조회
app.get('/api/admin/users', (req, res) => {
  const adminId = req.query.admin_id || '';
  if (adminId !== 'admin') return res.status(403).json({ error: '관리자 권한 필요' });
  db.all('SELECT id, nickname, realname, birth, contact, email FROM users ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ success: true, users: rows });
  });
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