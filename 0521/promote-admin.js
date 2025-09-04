// promote-admin.js
// 사용: node promote-admin.js
// 목적: DB에서 다른 관리자(realname='관리자') 표시를 제거하고 지정한 계정을 realname='관리자'로 설정

const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./board.db');
const target = process.env.ADMIN_NICK || 'dksgytjd07@gmail.com';

db.serialize(() => {
  db.run("UPDATE users SET realname = '' WHERE realname = '관리자' AND nickname != ?", [target], function(err) {
    if (err) { console.error('Error clearing other admins', err); process.exit(1); }
    console.log('Cleared other 관리자 flags.');
    db.run("UPDATE users SET realname = '관리자' WHERE nickname = ?", [target], function(err2) {
      if (err2) { console.error('Error promoting target', err2); process.exit(1); }
      console.log('Promoted', target, 'to realname=관리자 (if existed).');
      db.all('SELECT id, nickname, realname, email FROM users ORDER BY id', [], (e, rows) => {
        if (e) { console.error('Select error', e); process.exit(1); }
        console.log('Current users:');
        console.table(rows);
        process.exit(0);
      });
    });
  });
});
