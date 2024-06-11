-- SQLite dump file for 'urls' table

-- Drop the table if it already exists
DROP TABLE IF EXISTS urls;

-- Create the table with the necessary schema
CREATE TABLE urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custom_url TEXT UNIQUE,
    discord_invite TEXT
);