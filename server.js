const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const path = require('path');
const app = express();

// Serve static files (like index.html) from "public" folder
app.use(express.static(path.join(__dirname, 'public')));

app.use(cors());

const db = mysql.createConnection({
  host: 'shuttle.proxy.rlwy.net',
  user: 'root',
  password: 'LjOHgARUvXlDzVwTPDdSGgoDKGFhLPFl',
  database: 'railway',
  port: 45386
});

//app.get('/', (req, res) => {
//  res.sendFile(path.join(__dirname, 'public'));
//});

// TODO: Add code for connecting to Database
db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Connected to MySQL database');
  }
});

app.get('/users', (req, res) => {
  db.query('SELECT * FROM users', (err, results) => {
    if (err) {
      res.status(500).send('Database query error');
    } else {
      res.json(results);
    }
  });
});

app.listen(3000, () => {
  console.log('Server is running at http://localhost:3000');
});