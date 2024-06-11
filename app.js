const express = require("express");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");
const querystring = require("querystring");
const dotenv = require("dotenv").config();
const session = require("express-session");
const app = express();
const port = 3000;

// Environment variables
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const LOGIN_REDIRECT_URI = process.env.LOGIN_REDIRECT_URI;
const BOT_TOKEN = process.env.BOT_TOKEN;
const HCAPTCHA_SECRET = process.env.HCAPTCHA_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
// Initialize file-based SQLite database
const db = new sqlite3.Database("./urls.db");

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE,
        discord_id TEXT UNIQUE,
        invite_limit INTEGER DEFAULT 5
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS urls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        custom_url TEXT UNIQUE,
        discord_invite TEXT,
        user_id INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
});

app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration
app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }, // Note: Set to true if using HTTPS
    })
);

// Home page - login with Discord
app.get("/", (req, res) => {
    if (req.session.userId) {
        return res.redirect("/manage");
    }
    res.send(`
  <html>
  <head>
      <style>
          body {
              font-family: Arial, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              background-color: #121212;
              color: #fff;
              text-align: center;
              padding: 0 20px;
          }
          a {
              color: #007bff;
              text-decoration: none;
              font-size: 20px;
              background: #1e1e1e;
              padding: 10px 20px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
              margin-top: 20px;
          }
          a:hover {
              text-decoration: underline;
          }
      </style>
  </head>
  <body>
      <h1>Welcome to the Discord Invite Link Security Service</h1>
      <p>Our service helps you create and manage secure custom invite links for your Discord server.</p>
      <p>To get started, please log in with your Discord account.</p>
      <a href="/login">Login with Discord</a>
  </body>
  </html>
  `);
});

// Start Discord OAuth2 authentication
app.get("/login", (req, res) => {
    const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
        LOGIN_REDIRECT_URI
    )}&response_type=code&scope=identify`;
    res.redirect(authorizeUrl);
});

// Handle Discord OAuth2 callback for login
app.get("/callback/login", (req, res) => {
    const code = req.query.code;

    axios
        .post(
            "https://discord.com/api/oauth2/token",
            querystring.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: "authorization_code",
                code: code,
                redirect_uri: LOGIN_REDIRECT_URI,
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        )
        .then((response) => {
            const accessToken = response.data.access_token;

            // Get Discord user info
            return axios
                .get("https://discord.com/api/users/@me", {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                })
                .then((userResponse) => {
                    const discordId = userResponse.data.id;
                    const email = userResponse.data.email;

                    // Save user info in the database
                    db.run(
                        `INSERT OR IGNORE INTO users (discord_id, email) VALUES (?, ?)`,
                        [discordId, email],
                        function (err) {
                            if (err) {
                                console.error(err);
                                return res.send("Error occurred");
                            }

                            req.session.userId = discordId;
                            // Redirect to manage URL form
                            res.redirect("/manage");
                        }
                    );
                });
        })
        .catch((err) => {
            console.error(err);
            res.send("Error during OAuth2 process.");
        });
});
// URL creation form
app.get("/create", (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/");
    }

    res.send(`
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          background-color: #121212;
          color: #fff;
        }
        form {
          background: #1e1e1e;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
        }
        input[type="text"] {
          width: 100%;
          padding: 10px;
          margin-bottom: 10px;
          border: 1px solid #333;
          border-radius: 4px;
          background-color: #2b2b2b;
          color: #fff;
        }
        input[type="submit"] {
          background: #007bff;
          color: #fff;
          padding: 10px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        input[type="submit"]:hover {
          background: #0056b3;
        }
        label {
          display: block;
          margin-bottom: 5px;
        }
      </style>
      <script src="https://hcaptcha.com/1/api.js" async defer></script>
    </head>
    <body>
      <form action="/create" method="post">
        <label>Custom URL:</label>
        <input type="text" name="custom_url" required>
        <label>Discord Invite Link:</label>
        <input type="text" name="discord_invite" required>
        <div class="h-captcha" data-sitekey="c9b5032f-0b16-4ec4-a6e8-6798483099b6"></div>
        <input type="submit" value="Create">
      </form>
    </body>
    </html>
  `);
});

// URL creation
app.post("/create", (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/");
    }

    const customUrl = req.body.custom_url;
    const discordInvite = req.body.discord_invite.replace(/\s+/g, "");
    const userId = req.session.userId;
    const hcaptchaResponse = req.body["h-captcha-response"];

    // Validate hCaptcha response
    axios
        .post(
            `https://hcaptcha.com/siteverify`,
            querystring.stringify({
                secret: HCAPTCHA_SECRET,
                response: hcaptchaResponse,
            })
        )
        .then((hcaptchaRes) => {
            if (!hcaptchaRes.data.success) {
                return res.send(`
              <html>
              <head>
                <style>
                  body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    background-color: #121212;
                    color: #fff;
                  }
                  .message {
                    background: #1e1e1e;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                    text-align: center;
                  }
                  .error {
                    color: #ff4d4d;
                  }
                </style>
              </head>
              <body>
                <div class="message error">hCaptcha verification failed. Please try again.</div>
              </body>
              </html>
               `);
            }

            // Validate URL format
            const urlPattern = /^[a-zA-Z0-9-_]+$/;
            if (!urlPattern.test(customUrl)) {
                return res.send(`
              <html>
              <head>
                <style>
                  body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    background-color: #121212;
                    color: #fff;
                  }
                  .message {
                    background: #1e1e1e;
                    padding: 20px;
                    border-radius: 8px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                    text-align: center;
                  }
                  .error {
                    color: #ff4d4d;
                  }
                </style>
              </head>
              <body>
                <div class="message error">Invalid URL. Only alphanumeric characters, dashes, and underscores are allowed.</div>
              </body>
              </html>
               `);
            }

            // Validate Discord invite link (e.g., https://discord.gg/abc123)
            const discordPattern = /^https:\/\/discord\.gg\/[a-zA-Z0-9]+$/;
            if (!discordPattern.test(discordInvite)) {
                return res.send(`
          <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                background-color: #121212;
                color: #fff;
              }
              .message {
                background: #1e1e1e;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                text-align: center;
              }
              .error {
                color: #ff4d4d;
              }
            </style>
          </head>
          <body>
            <div class="message error">Invalid Discord invite link.</div>
          </body>
          </html>
           `);
            }

            // Check the number of existing invite links for the user
            db.get(
                `SELECT invite_limit FROM users WHERE discord_id = ?`,
                [userId],
                (err, user) => {
                    if (err) {
                        console.error(err);
                        return res.send("Error occurred");
                    }
                    if (!user) {
                        console.error("User not found");
                        return res.send("Error occurred: User not found");
                    }
                    db.get(
                        `SELECT COUNT(*) as count FROM urls WHERE user_id = ?`,
                        [userId],
                        (err, row) => {
                            if (err) {
                                console.error(err);
                                return res.send("Error occurred");
                            }
                            if (row.count >= user.invite_limit) {
                                return res.send(`
                                  <html>
                                  <head>
                                    <style>
                                      body {
                                        font-family: Arial, sans-serif;
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        height: 100vh;
                                        background-color: #121212;
                                        color: #fff;
                                      }
                                      .message {
                                        background: #1e1e1e;
                                        padding: 20px;
                                        border-radius: 8px;
                                        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                                        text-align: center;
                                      }
                                      .error {
                                        color: #ff4d4d;
                                      }
                                    </style>
                                  </head>
                                  <body>
                                    <div class="message error">You have reached your invite limit. Please contact the admin to increase your limit.</div>
                                  </body>
                                  </html>
                              `);
                            }

                            const stmt = db.prepare(
                                `INSERT INTO urls (custom_url, discord_invite, user_id) VALUES (?, ?, ?)`
                            );
                            stmt.run(
                                customUrl,
                                discordInvite,
                                userId,
                                function (err) {
                                    if (err) {
                                        console.error(err);
                                        return res.send(`
                                      <html>
                                      <head>
                                        <style>
                                          body {
                                            font-family: Arial, sans-serif;
                                            display: flex;
                                            justify-content: center;
                                            align-items: center;
                                            height: 100vh;
                                            background-color: #121212;
                                            color: #fff;
                                          }
                                          .message {
                                            background: #1e1e1e;
                                            padding: 20px;
                                            border-radius: 8px;
                                            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                                            text-align: center;
                                          }
                                          .error {
                                            color: #ff4d4d;
                                          }
                                        </style>
                                      </head>
                                      <body>
                                        <div class="message">This custom URL already exists. Please choose another one.</div>
                                      </body>
                                      </html>
                                  `);
                                    }
                                    res.send(`
                                  <html>
                                  <head>
                                    <style>
                                      body {
                                        font-family: Arial, sans-serif;
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        height: 100vh;
                                        background-color: #121212;
                                        color: #fff;
                                      }
                                      a {
                                        color: #007bff;
                                        text-decoration: none;
                                      }
                                      a:hover {
                                        text-decoration: underline;
                                      }
                                    </style>
                                  </head>
                                  <body>
                                    URL created: <a href="/invite/${customUrl}">/invite/${customUrl}</a>
                                  </body>
                                  </html>
                              `);
                                }
                            );
                            stmt.finalize();
                        }
                    );
                }
            );
        })
        .catch((err) => {
            console.error(err);
            res.send(`
          <html>
          <head>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                background-color: #121212;
                color: #fff;
              }
              .message {
                background: #1e1e1e;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                text-align: center;
              }
              .error {
                color: #ff4d4d;
              }
            </style>
          </head>
          <body>
            <div class="message error">hCaptcha verification failed. Please try again.</div>
          </body>
          </html>
           `);
        });
});
// Manage URLs page
app.get("/manage", (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/");
    }

    db.get(
        `SELECT invite_limit FROM users WHERE discord_id = ?`,
        [req.session.userId],
        (err, user) => {
            if (err) {
                console.error(err);
                return res.send("Error occurred");
            }
            if (!user) {
                console.error("User not found");
                return res.send("Error occurred: User not found");
            }

            db.all(
                `SELECT custom_url, discord_invite FROM urls WHERE user_id = ?`,
                [req.session.userId],
                (err, rows) => {
                    if (err) {
                        console.error(err);
                        return res.send("Error occurred");
                    }
                    const links = rows
                        .map(
                            (row) => `
                      <li>
                          <a href="/invite/${row.custom_url}">${row.custom_url}</a> - ${row.discord_invite}
                          <form action="/delete" method="post" style="display:inline;">
                              <input type="hidden" name="custom_url" value="${row.custom_url}">
                              <input type="submit" value="Delete">
                          </form>
                      </li>`
                        )
                        .join("");

                    res.send(`
                      <html>
                      <head>
                          <style>
                              body {
                                  font-family: Arial, sans-serif;
                                  display: flex;
                                  flex-direction: column;
                                  align-items: center;
                                  height: 100vh;
                                  background-color: #121212;
                                  color: #fff;
                              }
                              ul {
                                  list-style: none;
                                  padding: 0;
                              }
                              li {
                                  margin: 10px 0;
                              }
                              a {
                                  color: #007bff;
                                  text-decoration: none;
                              }
                              a:hover {
                                  text-decoration: underline;
                              }
                              form {
                                  display: inline;
                              }
                              input[type="submit"] {
                                  background: #ff4d4d;
                                  color: #fff;
                                  padding: 5px 10px;
                                  border: none;
                                  border-radius: 4px;
                                  cursor: pointer;
                              }
                              input[type="submit"]:hover {
                                  background: #ff1a1a;
                              }
                              .logout {
                                  margin-top: 20px;
                                  background: #007bff;
                                  color: #fff;
                                  padding: 10px;
                                  border: none;
                                  border-radius: 4px;
                                  cursor: pointer;
                                  text-decoration: none;
                              }
                              .logout:hover {
                                  background: #0056b3;
                              }
                          </style>
                      </head>
                      <body>
                          <h1>Your Invite Links</h1>
                          <p>Invite Limit: ${user.invite_limit}</p>
                          <ul>${links}</ul>
                          <a href="/create">Create new invite link</a>
                          <form action="/logout" method="post">
                              <input type="submit" value="Logout" class="logout">
                          </form>
                      </body>
                      </html>
                  `);
                }
            );
        }
    );
});

// Delete URL
app.post("/delete", (req, res) => {
    if (!req.session.userId) {
        return res.redirect("/");
    }

    const customUrl = req.body.custom_url;

    db.run(
        `DELETE FROM urls WHERE custom_url = ? AND user_id = ?`,
        [customUrl, req.session.userId],
        (err) => {
            if (err) {
                console.error(err);
                return res.send("Error occurred");
            }
            res.redirect("/manage");
        }
    );
});

// Logout route
app.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.send("Error occurred while logging out");
        }
        res.redirect("/");
    });
});

// Admin page to increase invite limit and search user by ID
// Admin page to increase and decrease invite limit and search user by ID
app.get("/admin", (req, res) => {
    if (req.session.userId !== ADMIN_USER_ID) {
        return res.redirect("/");
    }

    const searchUserId = req.query.user_id || "";

    let query = `SELECT id, discord_id, email, invite_limit FROM users`;
    let params = [];

    if (searchUserId) {
        query += ` WHERE discord_id LIKE ?`;
        params.push(`%${searchUserId}%`);
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error(err);
            return res.send("Error occurred");
        }

        const users = rows
            .map(
                (row) => `
          <li>
              ID: ${row.discord_id} - Email: ${row.email} - Invite Limit: ${row.invite_limit}
              <form action="/admin/increase" method="post" style="display:inline;">
                  <input type="hidden" name="user_id" value="${row.id}">
                  <input type="submit" value="Increase Limit">
              </form>
              <form action="/admin/decrease" method="post" style="display:inline;">
                  <input type="hidden" name="user_id" value="${row.id}">
                  <input type="submit" value="Decrease Limit">
              </form>
          </li>`
            )
            .join("");

        res.send(`
          <html>
          <head>
              <style>
                  body {
                      font-family: Arial, sans-serif;
                      display: flex;
                      flex-direction: column;
                      align-items: center;
                      height: 100vh;
                      background-color: #121212;
                      color: #fff;
                  }
                  ul {
                      list-style: none;
                      padding: 0;
                  }
                  li {
                      margin: 10px 0;
                  }
                  form {
                      display: inline;
                  }
                  input[type="submit"] {
                      background: #007bff;
                      color: #fff;
                      padding: 5px 10px;
                      border: none;
                      border-radius: 4px;
                      cursor: pointer;
                  }
                  input[type="submit"]:hover {
                      background: #0056b3;
                  }
                  .logout {
                      margin-top: 20px;
                      background: #007bff;
                      color: #fff;
                      padding: 10px;
                      border: none;
                      border-radius: 4px;
                      cursor: pointer;
                      text-decoration: none;
                  }
                  .logout:hover {
                      background: #0056b3;
                  }
                  .search {
                      margin-bottom: 20px;
                  }
              </style>
          </head>
          <body>
              <h1>Admin Panel</h1>
              <p>Use this panel to manage users and adjust their invite limits. You can also search for users by their Discord ID.</p>
              <form action="/admin" method="get" class="search">
                  <label for="user_id">Search by User ID:</label>
                  <input type="text" name="user_id" id="user_id" value="${searchUserId}">
                  <input type="submit" value="Search">
              </form>
              <ul>${users}</ul>
              <form action="/logout" method="post">
                  <input type="submit" value="Logout" class="logout">
              </form>
          </body>
          </html>
      `);
    });
});

// Increase invite limit
app.post("/admin/increase", (req, res) => {
    if (req.session.userId !== ADMIN_USER_ID) {
        return res.redirect("/");
    }

    const userId = req.body.user_id;

    db.run(
        `UPDATE users SET invite_limit = invite_limit + 5 WHERE id = ?`,
        [userId],
        function (err) {
            if (err) {
                console.error(err);
                return res.send("Error occurred");
            }
            res.redirect("/admin");
        }
    );
});

// Decrease invite limit
app.post("/admin/decrease", (req, res) => {
    if (req.session.userId !== ADMIN_USER_ID) {
        return res.redirect("/");
    }

    const userId = req.body.user_id;

    db.get(
        `SELECT invite_limit FROM users WHERE id = ?`,
        [userId],
        (err, row) => {
            if (err) {
                console.error(err);
                return res.send("Error occurred");
            }

            if (row.invite_limit > 0) {
                db.run(
                    `UPDATE users SET invite_limit = invite_limit - 5 WHERE id = ?`,
                    [userId],
                    function (err) {
                        if (err) {
                            console.error(err);
                            return res.send("Error occurred");
                        }
                        res.redirect("/admin");
                    }
                );
            } else {
                res.send("Cannot decrease invite limit below 0");
            }
        }
    );
});

// Start Discord OAuth2 authentication for joining
app.get("/invite/:custom_url", (req, res) => {
    const customUrl = req.params.custom_url;
    db.get(
        `SELECT discord_invite FROM urls WHERE custom_url = ?`,
        [customUrl],
        (err, row) => {
            if (err) {
                console.error(err);
                return res.send("Error occurred");
            }
            if (row) {
                const state = customUrl;
                const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(
                    REDIRECT_URI
                )}&response_type=code&scope=identify%20guilds.join&state=${state}`;
                res.redirect(authorizeUrl);
            } else {
                res.status(404).send("URL not found");
            }
        }
    );
});

// Handle Discord OAuth2 callback for joining
app.get("/callback/join", (req, res) => {
    const code = req.query.code;
    const state = req.query.state;

    axios
        .post(
            "https://discord.com/api/oauth2/token",
            querystring.stringify({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: "authorization_code",
                code: code,
                redirect_uri: REDIRECT_URI,
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        )
        .then((response) => {
            const accessToken = response.data.access_token;

            // Get Discord user info
            return axios
                .get("https://discord.com/api/users/@me", {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                })
                .then((userResponse) => {
                    const userId = userResponse.data.id;

                    // Store user info and state in session or database
                    // Here we just pass it to the next step for simplicity
                    res.redirect(
                        `/verify/${state}?user_id=${userId}&access_token=${accessToken}`
                    );
                });
        })
        .catch((err) => {
            console.error(err);
            res.send("Error during OAuth2 process.");
        });
});

// Verify hCaptcha and add user to server
app.get("/verify/:custom_url", (req, res) => {
    const customUrl = req.params.custom_url;
    const userId = req.query.user_id;
    const accessToken = req.query.access_token;

    res.send(`
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          background-color: #121212;
          color: #fff;
        }
        form {
          background: #1e1e1e;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
        }
        input[type="submit"] {
          background: #007bff;
          color: #fff;
          padding: 10px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        input[type="submit"]:hover {
          background: #0056b3;
        }
      </style>
      <script src="https://hcaptcha.com/1/api.js" async defer></script>
    </head>
    <body>
      <form action="/verify/${customUrl}" method="post">
        <div class="h-captcha" data-sitekey="c9b5032f-0b16-4ec4-a6e8-6798483099b6"></div>
        <input type="hidden" name="user_id" value="${userId}">
        <input type="hidden" name="access_token" value="${accessToken}">
        <input type="submit" value="Verify and Join">
      </form>
    </body>
    </html>
  `);
});

app.post("/verify/:custom_url", (req, res) => {
    const customUrl = req.params.custom_url;
    const hcaptchaResponse = req.body["h-captcha-response"];
    const userId = req.body.user_id;
    const accessToken = req.body.access_token;

    // Verify hCaptcha response
    axios
        .post(
            `https://hcaptcha.com/siteverify`,
            querystring.stringify({
                secret: HCAPTCHA_SECRET,
                response: hcaptchaResponse,
            })
        )
        .then((captchaRes) => {
            if (captchaRes.data.success) {
                db.get(
                    `SELECT discord_invite FROM urls WHERE custom_url = ?`,
                    [customUrl],
                    (err, row) => {
                        if (err) {
                            console.error(err);
                            return res.send(`
                                <html>
                                <head>
                                  <style>
                                    body {
                                      font-family: Arial, sans-serif;
                                      display: flex;
                                      justify-content: center;
                                      align-items: center;
                                      height: 100vh;
                                      background-color: #121212;
                                      color: #fff;
                                    }
                                    .message {
                                      background: #1e1e1e;
                                      padding: 20px;
                                      border-radius: 8px;
                                      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                                      text-align: center;
                                    }
                                    .error {
                                      color: #ff4d4d;
                                    }
                                  </style>
                                </head>
                                <body>
                                  <div class="message error">An error occurred</div>
                                </body>
                                </html>
                            `);
                        }
                        if (row) {
                            const inviteCode = row.discord_invite
                                .split("/")
                                .pop();

                            // Fetch invite code information
                            axios
                                .get(
                                    `https://discord.com/api/v8/invites/${inviteCode}`,
                                    {
                                        headers: {
                                            Authorization: `Bot ${BOT_TOKEN}`,
                                        },
                                    }
                                )
                                .then((inviteResponse) => {
                                    const guildId =
                                        inviteResponse.data.guild.id;

                                    // Add user to the server
                                    axios
                                        .put(
                                            `https://discord.com/api/v8/guilds/${guildId}/members/${userId}`,
                                            {
                                                access_token: accessToken,
                                            },
                                            {
                                                headers: {
                                                    Authorization: `Bot ${BOT_TOKEN}`,
                                                    "Content-Type":
                                                        "application/json",
                                                },
                                            }
                                        )
                                        .then(() => {
                                            res.send(`
                            <html>
                            <head>
                              <style>
                                body {
                                  font-family: Arial, sans-serif;
                                  display: flex;
                                  justify-content: center;
                                  align-items: center;
                                  height: 100vh;
                                  background-color: #121212;
                                  color: #fff;
                                }
                                .message {
                                  background: #1e1e1e;
                                  padding: 20px;
                                  border-radius: 8px;
                                  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                                  text-align: center;
                                }
                              </style>
                            </head>
                            <body>
                              <div class="message">Successfully joined the server!</div>
                            </body>
                            </html>
                            `);
                                        })
                                        .catch((err) => {
                                            console.error(err);
                                            res.send(`
                            <html>
                            <head>
                              <style>
                                body {
                                  font-family: Arial, sans-serif;
                                  display: flex;
                                  justify-content: center;
                                  align-items: center;
                                  height: 100vh;
                                  background-color: #121212;
                                  color: #fff;
                                }
                                .message {
                                  background: #1e1e1e;
                                  padding: 20px;
                                  border-radius: 8px;
                                  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                                  text-align: center;
                                }
                                .error {
                                  color: #ff4d4d;
                                }
                              </style>
                            </head>
                            <body>
                              <div class="message error">Failed to join the server.</div>
                            </body>
                            </html>
                            `);
                                        });
                                })
                                .catch((err) => {
                                    console.error(err);
                                    res.send(`
                                <html>
                                <head>
                                  <style>
                                    body {
                                      font-family: Arial, sans-serif;
                                      display: flex;
                                      justify-content: center;
                                      align-items: center;
                                      height: 100vh;
                                      background-color: #121212;
                                      color: #fff;
                                    }
                                    .message {
                                      background: #1e1e1e;
                                      padding: 20px;
                                      border-radius: 8px;
                                      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                                      text-align: center;
                                    }
                                    .error {
                                      color: #ff4d4d;
                                    }
                                  </style>
                                </head>
                                <body>
                                  <div class="message error">Invalid invite link.</div>
                                </body>
                                </html>
                            `);
                                });
                        } else {
                            res.status(404).send(`
                                <html>
                                <head>
                                  <style>
                                    body {
                                      font-family: Arial, sans-serif;
                                      display: flex;
                                      justify-content: center;
                                      align-items: center;
                                      height: 100vh;
                                      background-color: #121212;
                                      color: #fff;
                                    }
                                    .message {
                                      background: #1e1e1e;
                                      padding: 20px;
                                      border-radius: 8px;
                                      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                                      text-align: center;
                                    }
                                    .error {
                                      color: #ff4d4d;
                                    }
                                  </style>
                                </head>
                                <body>
                                  <div class="message error">URL not found.</div>
                                </body>
                                </html>
                            `);
                        }
                    }
                );
            } else {
                res.send(`
                    <html>
                    <head>
                      <style>
                        body {
                          font-family: Arial, sans-serif;
                          display: flex;
                          justify-content: center;
                          align-items: center;
                          height: 100vh;
                          background-color: #121212;
                          color: #fff;
                        }
                        .message {
                          background: #1e1e1e;
                          padding: 20px;
                          border-radius: 8px;
                          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                          text-align: center;
                        }
                        .error {
                          color: #ff4d4d;
                        }
                      </style>
                    </head>
                    <body>
                      <div class="message error">hCaptcha verification failed. Please try again.</div>
                    </body>
                    </html>
                `);
            }
        })
        .catch((err) => {
            console.error("Error during hCaptcha verification:", err);
            res.send(`
                <html>
                <head>
                  <style>
                    body {
                      font-family: Arial, sans-serif;
                      display: flex;
                      justify-content: center;
                      align-items: center;
                      height: 100vh;
                      background-color: #121212;
                      color: #fff;
                    }
                    .message {
                      background: #1e1e1e;
                      padding: 20px;
                      border-radius: 8px;
                      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                      text-align: center;
                    }
                    .error {
                      color: #ff4d4d;
                    }
                  </style>
                </head>
                <body>
                  <div class="message error">An error occurred during hCaptcha verification.</div>
                </body>
                </html>
            `);
        });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
