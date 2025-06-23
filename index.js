// index.js
const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcrypt');


const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const PORT = process.env.PORT;

const client_id = 'JVa1jJ4an57MEsyxFhTZZ2uKCi22aElruLuMD9fqM8JpDhGg';
const client_secret = 'QsCXM36RhZ0KrjxuXtWfZ515KMqRRRtVM0FAZqmtnkJeSJGbw5UPT8U9CYiFhZto';

const nodemailer = require('nodemailer');
const cron = require('node-cron');
const moment = require('moment-timezone');


const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: 'john@akridgeenterprises.com',
    pass: 'kdigndhcupbaazpb'
  }
});

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

const ZILLOW_API_KEY = '449866bf79a548efd5cfc5bc544a19e0'; // Replace with your actual token

async function getScheduledUsers() {
  const [rows] = await db.promise().query(`
    SELECT u.id, u.email, rs.frequency, rs.day_of_week, rs.day_of_month, rs.time_of_day
    FROM users u
    JOIN report_schedules rs ON u.id = rs.user_id
  `);
  return rows;
}

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
app.use(cors());
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
      req.session.userId = user.id;
      return res.json({ id: user.id, username: user.username});
    } else {
      return res.status(401).json({ error: 'Incorrect password' }); // ✅ FIXED
    }
  });
});

// POST /api/feature-request
app.post('/api/feature-request', async (req, res) => {
  const { user, message } = req.body;

  const mailOptions = {
    from: 'john@akridgeenterprises.com',
    to: 'john@akridgeenterprises.com',
    subject: `New Feature Request from ${user}`,
    text: message,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending feature request email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
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

  console.log('Full req.body:', req.body);

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

async function fetchZillowEstimates(address) {
  const endpoint = `https://api.bridgedataoutput.com/property/v2/zestimate?address=${encodeURIComponent(address)}&access_token=${ZILLOW_API_KEY}`;

  try {
    const response = await fetch(endpoint);
    const data = await response.json();

    const z = data.bundle?.zestimate?.amount;
    const rent = data.bundle?.rentZestimate?.amount;

    return {
      zestimate: z ? Math.round(z) : 'N/A',
      rentZestimate: rent ? Math.round(rent) : 'N/A'
    };
  } catch (err) {
    console.error(`❌ Zillow fetch error for ${address}:`, err);
    return { zestimate: 'N/A', rentZestimate: 'N/A' };
  }
}

async function sendReportEmail(to, properties) {
  const rows = properties.map(p => `
    <tr>
      <td style="padding:10px;border:1px solid #ddd;">${p.address}</td>
      <td style="padding:10px;border:1px solid #ddd;">$${p.zestimate}</td>
      <td style="padding:10px;border:1px solid #ddd;">$${p.rentZestimate}</td>
    </tr>
  `).join('');

  const html = `
    <h2>Your RentEdge Property Report</h2>
    <table style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif;">
      <thead>
        <tr style="background-color: #4CAF50; color: white;">
          <th style="padding: 10px; border: 1px solid #ddd;">Address</th>
          <th style="padding: 10px; border: 1px solid #ddd;">Zestimate</th>
          <th style="padding: 10px; border: 1px solid #ddd;">Rent Zestimate</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  await transporter.sendMail({
    from: '"RentEdge Reports" <your-email@example.com>',
    to,
    subject: "Your Property Report",
    html,
  });
}

app.post('/api/reporting/schedule', async (req, res) => {
  const { frequency, day_of_week, day_of_month, time_of_day } = req.body;
  const userId = req.session?.userId || req.user?.id;

  console.log("Incoming request:");
  console.log("userId:", userId);
  console.log("frequency:", frequency);
  console.log("time_of_day:", time_of_day);
  console.log("day_of_week:", day_of_week);
  console.log("day_of_month:", day_of_month);

  if (!userId || !frequency || !time_of_day) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Optional: delete any existing schedule for the user to avoid duplicates
    // await db.query('DELETE FROM report_schedules WHERE user_id = ?', [userId]);

    // Insert new schedule
    await db.promise().query(
      `INSERT INTO report_schedules (user_id, frequency, day_of_week, day_of_month, time_of_day)
   VALUES (?, ?, ?, ?, ?)
   ON DUPLICATE KEY UPDATE 
     frequency = VALUES(frequency),
     day_of_week = VALUES(day_of_week),
     day_of_month = VALUES(day_of_month),
     time_of_day = VALUES(time_of_day)`,
  [userId, frequency, day_of_week, day_of_month, time_of_day]
    );

    res.status(200).json({ message: 'Schedule saved successfully' });
  } catch (err) {
    console.error('Error saving report schedule:', err);
    res.status(500).json({ error: 'Internal server error' });
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

// Cron job: runs every minute
cron.schedule('* * * * *', async () => {
  console.log(`⏰ Cron job running at ${new Date().toLocaleString()}`);

  try {
    // 1. Get all active report schedules with associated emails
    const [schedules] = await db.promise().query(`
      SELECT rs.*, u.email 
      FROM report_schedules rs
      JOIN users u ON rs.user_id = u.id
    `);

    const now = moment();
    const currentTime = now.format('HH:mm');
    const currentDay = now.format('dddd'); // e.g. "Monday"
    const currentDate = now.date(); // 1–31

    for (const schedule of schedules) {
      const { frequency, day_of_week, day_of_month, time_of_day, user_id, email } = schedule;

      const timeMatch = time_of_day === currentTime;
      let freqMatch = false;

      if (frequency === 'daily') {
        freqMatch = true;
      } else if (frequency === 'weekly' && day_of_week === currentDay) {
        freqMatch = true;
      } else if (frequency === 'monthly' && parseInt(day_of_month) === currentDate) {
        freqMatch = true;
      }

      console.log('Frequency match is: ', freqMatch);
      console.log('Time match is: ', timeMatch);

      console.log(`Checking ${email}: ${frequency} @ ${time_of_day}`);
      if (!(freqMatch && timeMatch)) continue;

      // 2. Fetch properties for this user
      const [properties] = await db.promise().query(
        'SELECT propertyAddress FROM properties WHERE userId = ?', [user_id]
      );

      if (!properties.length) {
        console.log(`ℹ️ No properties found for user ${email}`);
        continue;
      }

      // 3. Query Zillow API for each property
      const reportData = [];
      for (const p of properties) {
        const address = p.propertyAddress;

        try {
          const zillowRes = await fetch(`https://api.bridgedataoutput.com/api/v2/zestimates_v2/zestimates`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${ZILLOW_API_KEY}`
            },
            body: JSON.stringify({ address })
          });

          const data = await zillowRes.json();
          const zestimate = data.zestimate?.amount || 'N/A';
          const rentZestimate = data.rentZestimate?.amount || 'N/A';

          reportData.push({
            address,
            zestimate,
            rentZestimate
          });
        } catch (err) {
          console.error(`❌ Zillow API error for ${address}:`, err);
          reportData.push({ address, zestimate: 'Error', rentZestimate: 'Error' });
        }
      }

      // 4. Send the email
      await sendReportEmail(email, reportData);
      console.log(`📬 Report sent to ${email}`);
    }

  } catch (err) {
    console.error('❌ Error running report job:', err);
  }
});