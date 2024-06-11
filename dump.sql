-- SQLite dump file for 'users' table

-- Drop the table if it already exists
DROP TABLE IF EXISTS users;

-- Create the table with the necessary schema
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    discord_id TEXT UNIQUE,
    invite_limit INTEGER DEFAULT 5
);

-- SQLite dump file for 'urls' table

-- Drop the table if it already exists
DROP TABLE IF EXISTS urls;

-- Create the table with the necessary schema
CREATE TABLE urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custom_url TEXT UNIQUE,
    discord_invite TEXT,
    user_id INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
