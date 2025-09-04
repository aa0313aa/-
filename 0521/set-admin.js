// set-admin.js
// 사용: node set-admin.js
// 목적: board.db에 관리자 계정을 삽입하거나 비밀번호를 업데이트합니다.

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./board.db');

// 변경할 관리자 정보 (사용자 입력값 반영)
const nickname = process.env.ADMIN_NICK || 'dksgytjd07@gmail.com';
const password = process.env.ADMIN_PASS || '090912aa';
const realname = '관리자';
const email = 'dksgytjd07@gmail.com';

(async () => {
  try {
    const hashed = bcrypt.hashSync(password, 10);
    db.serialize(() => {
      db.get('SELECT * FROM users WHERE nickname = ?', [nickname], (err, row) => {
        if (err) { console.error('DB select error', err); process.exit(1); }
        if (row) {
          db.run('UPDATE users SET password = ?, realname = ?, email = ? WHERE id = ?', [hashed, realname, email, row.id], function(err2) {
            if (err2) { console.error('DB update error', err2); process.exit(1); }
            console.log('관리자 계정 업데이트 완료:', nickname);
            process.exit(0);
          });
        } else {
          db.run('INSERT INTO users (nickname, password, realname, birth, contact, email) VALUES (?, ?, ?, ?, ?, ?)',
            [nickname, hashed, realname, '', '', email], function(err3) {
              if (err3) { console.error('DB insert error', err3); process.exit(1); }
              console.log('관리자 계정 생성 완료:', nickname);
              process.exit(0);
            }
          );
        }
      });
    });
  } catch (e) { console.error('Error', e); process.exit(1); }
})();
