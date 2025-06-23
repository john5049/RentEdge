const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'shuttle.proxy.rlwy.net',
  user: 'root',
  password: 'LjOHgARUvXlDzVwTPDdSGgoDKGFhLPFl',
  database: 'railway',
  port: 45386,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

console.log('✅ DB pool created with .promise()');

module.exports = pool.promise(); // ✅ This enables async/await