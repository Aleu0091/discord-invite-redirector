import 'dotenv/config';
import axios from 'axios';
import express from 'express';
import * as sqlite3 from 'sqlite3';

const app = express();
const port = process.env.PORT || 3000;

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

app.use(express.urlencoded({ extended: true }));

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
  stmt.run(customUrl, discordInvite, function(err: any) {
    if (err) return res.send("This custom URL already exists. Please choose another one.");
    res.send(`URL created: <a href="/invite/${customUrl}">/invite/${customUrl}</a>`);
  });
  stmt.finalize();
});

// Start Discord OAuth2 authentication
app.get('/invite/:custom_url', (req, res) => {
  const customUrl = req.params.custom_url;
  db.get(`SELECT discord_invite FROM urls WHERE custom_url = ?`, [customUrl], (err, row) => {
    if (err) return res.send("Error occurred");
    if (!row) return res.status(404).send("URL not found");
    if (!REDIRECT_URI) return res.send("Redirect URI is not defined.");
  
    const state = customUrl;
    const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join&state=${state}`;
    res.redirect(authorizeUrl);
  });
});

// Handle Discord OAuth2 callback
app.get('/callback', async(req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  const response = await axios.post('https://discord.com/api/oauth2/token',
    new URLSearchParams({
      client_id: String(CLIENT_ID),
      client_secret: String(CLIENT_SECRET),
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: String(REDIRECT_URI),
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
    }
  )

  if (!response || response.status !== 200) return res.send('Error during OAuth2 process.');
  const accessToken = response.data.access_token;
  const userResponse = await axios.get('https://discord.com/api/users/@me', {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  const userId = userResponse.data.id;
  try {
    db.get(`SELECT discord_invite FROM urls WHERE custom_url = ?`, [state], async (err, row) => {
      if (err) return res.send("Error occurred");
      if (!row) return res.status(404).send("URL not found").end();
      const inviteCode = (row as any).discord_invite.split('/').pop();
      if (!inviteCode) return res.send("Invalid Discord invite link.");
    
      const inviteResponse = await axios.get(`https://discord.com/api/v8/invites/${inviteCode}`, {
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`
        }
      });
      
      // Join the server
      const guildId = inviteResponse.data.guild.id;
      await axios.put(`https://discord.com/api/v8/guilds/${guildId}/members/${userId}`, {
        access_token: accessToken
      }, {
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }).catch(err => {
        return res.send('Failed to join the server.');
      })

      res.send('Successfully joined the server!');
    })
  } catch (err) {
    console.error(err);
    return res.send("Error occurred");
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
