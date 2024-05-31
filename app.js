const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const querystring = require('querystring');
const dotenv = require('dotenv');

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3000;

// Environment variables
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;

// Initialize file-based SQLite database
const db = new sqlite3.Database('./urls.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custom_url TEXT UNIQUE,
    discord_invite TEXT
  )`);
});

app.use(bodyParser.urlencoded({ extended: true }));

// Home page form
app.get('/', (req, res) => {
  res.send(`
    <form action="/create" method="post">
      Custom URL: <input type="text" name="custom_url">
      Discord Invite Link: <input type="text" name="discord_invite">
      <input type="submit" value="Create">
    </form>
  `);
});

// URL creation
app.post('/create', (req, res) => {
  const customUrl = req.body.custom_url;
  const discordInvite = req.body.discord_invite;
  
  // Validate URL format
  const urlPattern = /^[a-zA-Z0-9-_]+$/;
  if (!urlPattern.test(customUrl)) {
    return res.send("Invalid URL. Only alphanumeric characters, dashes, and underscores are allowed.");
  }

  // Validate Discord invite link (e.g., https://discord.gg/abc123)
  const discordPattern = /^https:\/\/discord\.gg\/[a-zA-Z0-9]+$/;
  if (!discordPattern.test(discordInvite)) {
    return res.send("Invalid Discord invite link.");
  }

  const stmt = db.prepare(`INSERT INTO urls (custom_url, discord_invite) VALUES (?, ?)`);
  stmt.run(customUrl, discordInvite, function(err) {
    if (err) {
      return res.send("This custom URL already exists. Please choose another one.");
    }
    res.send(`URL created: <a href="/invite/${customUrl}">/invite/${customUrl}</a>`);
  });
  stmt.finalize();
});

// Start Discord OAuth2 authentication
app.get('/invite/:custom_url', (req, res) => {
  const customUrl = req.params.custom_url;
  db.get(`SELECT discord_invite FROM urls WHERE custom_url = ?`, [customUrl], (err, row) => {
    if (err) {
      return res.send("Error occurred");
    }
    if (row) {
      const state = customUrl;
      const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${state}`;
      res.redirect(authorizeUrl);
    } else {
      res.status(404).send("URL not found");
    }
  });
});

// Handle Discord OAuth2 callback
app.get('/callback', (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  axios.post('https://discord.com/api/oauth2/token', querystring.stringify({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: REDIRECT_URI,
  }), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  }).then(response => {
    const accessToken = response.data.access_token;

    // Get Discord user info
    return axios.get('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }).then(userResponse => {
      const userId = userResponse.data.id;
      
      // Join user to server
      db.get(`SELECT discord_invite FROM urls WHERE custom_url = ?`, [state], (err, row) => {
        if (err) {
          return res.send("Error occurred");
        }
        if (row) {
          const inviteCode = row.discord_invite.split('/').pop();
          
          // Get invite code information
          axios.get(`https://discord.com/api/v8/invites/${inviteCode}`, {
            headers: {
              Authorization: `Bot ${BOT_TOKEN}`
            }
          }).then(inviteResponse => {
            const guildId = inviteResponse.data.guild.id;

            // Join the server on behalf of the user
            axios.put(`https://discord.com/api/v8/guilds/${guildId}/members/${userId}`, {
              access_token: accessToken
            }, {
              headers: {
                Authorization: `Bot ${BOT_TOKEN}`,
                'Content-Type': 'application/json'
              }
            }).then(() => {
              res.send('Successfully joined the server!');
            }).catch(err => {
              console.error(err);
              res.send('Failed to join the server.');
            });
          }).catch(err => {
            console.error(err);
            res.send('Invalid invite link.');
          });
        } else {
          res.status(404).send("URL not found");
        }
      });
    });
  }).catch(err => {
    console.error(err);
    res.send('Error during OAuth2 process.');
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
