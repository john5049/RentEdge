// index.js
const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();

const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const PORT = process.env.PORT;

const client_id = 'JVa1jJ4an57MEsyxFhTZZ2uKCi22aElruLuMD9fqM8JpDhGg';
const client_secret = 'QsCXM36RhZ0KrjxuXtWfZ515KMqRRRtVM0FAZqmtnkJeSJGbw5UPT8U9CYiFhZto';

var token = null;

// DB connection
const db = mysql.createPool({
  host: 'shuttle.proxy.rlwy.net',
  user: 'root',
  password: 'LjOHgARUvXlDzVwTPDdSGgoDKGFhLPFl',
  database: 'railway',
  port: 45386,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

console.log('✅ MySQL connection pool created');

// Session store
let sessionStore;
try{
    sessionStore = new MySQLStore({
    host: 'shuttle.proxy.rlwy.net',
    port: 45386,
    user: 'root',
    password: 'LjOHgARUvXlDzVwTPDdSGgoDKGFhLPFl',
    database: 'railway',
});
console.log('✅ Session store connected');
}
catch (err) {
console.error('❌ Failed to set up session store:', err);
}


// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'supersecret',
  resave: false,
  saveUninitialized: false,
  store: sessionStore || undefined,
}))

app.use(express.json());

// Routes
app.post('/submit-user', async (req, res) => {
  const { username, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const sql = 'INSERT INTO USERS (username, email, password) VALUES (?, ?, ?)';
  db.query(sql, [username, email, hashedPassword], (err, result) => {
    if (err) {
      console.error('❌ DB Error:', err);
      return res.status(500).send('Error saving user');
    }
    //res.send('✅ User saved successfully!');

  });
});

// Login Route
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Server error' });
    if (results.length === 0) return res.status(401).json({ error: 'User not found' });

    const user = results[0];
    console.log("My user is:", user.id, user.username);
    const match = await bcrypt.compare(password, user.password);
    console.log(match);
    if (match) {  
      return res.json({ id: user.id, username: user.username});
    } else {
      return res.status(401).json({ error: 'Incorrect password' }); // ✅ FIXED
    }
  });
});

// USPS Token Route
app.post('/token', async (req,res) => {
      console.log('Attempt to access token');
      token = await getAccessToken();
      console.log('✅ USPS Access Token:', token);
})

// Logout Route
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.send('Error logging out');
    }
    res.redirect('/login.html'); // Or your login/landing page
  });
});

// Registration Route
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json('All fields are required');
  }

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into MySQL
    const sql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
    db.query(sql, [username, email, hashedPassword], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).json('Registration failed');
      }
      res.json('User registered successfully!');
    });
  } catch (err) {
    console.error(err);
    res.status(500).json('Server error');
  }
});

// Add properties route
app.post('/properties', async (req, res) => {
  const { propertyAddress, userId, zpid } = req.body;
  const [shortAddress] = propertyAddress.split(',');

  if (!propertyAddress || !userId || !zpid) {
    return res.status(400).json({ error: 'Missing property address or userId' });
  }

  try{
    const query = 'INSERT INTO properties (propertyAddress, userId, zpid) VALUES (?, ?, ?)';
    const values = [shortAddress.trim(), userId, zpid];
    
    // Execute the query to insert the property
    await db.promise().query(query, values);
    
    // Return a success response
    res.status(200).json({ message: 'Property added successfully' });
  } catch (error) {
    console.error('Error inserting property into the database:', error);
    res.status(500).json({ message: 'Error adding property to the database' });
  }
});

// Edit properties route
app.post('/update-property', async (req, res) => {
  const { id, userId, propertyAddress, zpid } = req.body;
  const [shortAddress] = propertyAddress.split(',');

  try {
    await db.promise().query(
      'UPDATE properties SET propertyAddress = ?, zpid = ? WHERE id = ? AND userId = ?',
      [shortAddress.trim(), zpid, id, userId]
    );
    res.status(200).json({ message: 'Property updated' });
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ error: 'Failed to update property' });
  }
});

// Get properties route
app.get('/properties', (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  const sql = 'SELECT * FROM properties WHERE userId = ?';
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching properties:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.json(results); // Send back the list of properties
  });
});

    app.delete('/delete-users', (req, res) => {
    const userIds = req.body.userIds; // array of IDs
  
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).send('No users selected');
    }
  
    const placeholders = userIds.map(() => '?').join(',');
    const sql = `DELETE FROM users WHERE id IN (${placeholders})`;
  
    db.query(sql, userIds, (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error deleting users');
      }
      res.send('Users deleted');
    });
  });

  app.post('/delete-property', async (req, res) => {
    try {
      let { propertyId, userId } = req.body;
      
      console.log('Deleting property with:', { propertyId, userId });
  
      // Convert to integers safely
      propertyId = Number(propertyId);
      userId = Number(userId);
  
      if (!propertyId || !userId) {
        return res.status(400).json({ error: 'Invalid propertyId or userId' });
      }
  
      const response = await db.promise().execute(
        'DELETE FROM properties WHERE id = ? AND userId = ?',
        [propertyId, userId]
      );
  
      console.log('Delete response:', response);
  
      const result = response[0]; // response is [result, fields]
  
      if (result.affectedRows === 0) {
        return res.status(404).send('Property not found');
      }
  
      res.status(200).json({ message: 'Property deleted successfully' });
  
    } catch (error) {
      console.error('Error deleting property:', error);
      res.status(500).json({ error: 'Failed to delete property' });
    }
  });

app.get('/', (req, res) => {
//res.send('✅ RentEdge server is running!');
res.redirect('/login.html'); // Or your login/landing page
});

async function getAccessToken() {
  const res = await fetch('https://apis.usps.com/oauth2/v3/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id,
      client_secret,
      grant_type: 'client_credentials'
    }).toString()
  });

  const data = await res.json();

  if (!res.ok || !data.access_token) {
    throw new Error(`Failed to get token: ${JSON.stringify(data)}`);
  }

  console.log('✅ Access token received');
  return data.access_token;
}

app.post('/validate-address', async (req, res) => {
  const { streetAddress, city, state } = req.body;
  console.log('street is: ' + streetAddress);
  console.log('city is: ' + city);
  console.log('state is: ' + state);

  if (!streetAddress || !city || !state) {
    return res.status(400).json({ error: 'Missing address fields' });
  }

  try {
    const token = await getAccessToken(); // or reuse token if you cache it
    const params = new URLSearchParams({ streetAddress, city, state });

    const uspsRes = await fetch(`https://apis.usps.com/addresses/v3/address?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await uspsRes.json();

    if (!uspsRes.ok) {
      return res.status(uspsRes.status).json({ error: data });
    }

    return res.json(data);
  } catch (err) {
    console.error('❌ USPS proxy error:', err);
    return res.status(500).json({ error: 'Failed to validate address' });
  }
});

app.get('/users', (req, res) => {
    const sql = 'SELECT * FROM users';
    db.query(sql, (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json('Database error');
      }
      res.json(results); // Send users as JSON
    });
  });

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});