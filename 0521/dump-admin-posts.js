// dump-admin-posts.js
// 사용: node dump-admin-posts.js
// 목적: DB에서 최근 200개 포스트를 admin-posts.json으로 덤프

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const db = new sqlite3.Database('./board.db');

db.all('SELECT id, writer, writer_id, title, content, is_private, created FROM posts ORDER BY id DESC LIMIT 200', [], (err, rows) => {
  if (err) { console.error('DB error', err); process.exit(1); }
  fs.writeFileSync('admin-posts.json', JSON.stringify(rows, null, 2), 'utf8');
  console.log('Wrote admin-posts.json with', rows.length, 'items');
  process.exit(0);
});
