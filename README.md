# Discord Invite Redirector with OAuth2

This application allows users to create custom URLs that redirect to a specific Discord invite link. It uses Discord OAuth2 to authenticate users and automatically join them to a server using a bot.

## Requirements

- Node.js
- SQLite

## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/your-repo/discord-invite-redirector.git
    cd discord-invite-redirector
    ```

2. Install the required packages and dependencies:

    npm     
    ```sh
    npm install express sqlite3 body-parser axios dotenv
    ```
    
    pnpm
    ```sh
    pmpm add express sqlite3 body-parser axios dotenv
    ```
    
    yarn
    ```sh
    yarn add express sqlite3 body-parser axios dotenv
    ```

4. Create a `.env` file in the root directory and add your Discord application's credentials:
    ```env
    CLIENT_ID=your_discord_client_id
    CLIENT_SECRET=your_discord_client_secret
    BOT_TOKEN=your_discord_bot_token
    REDIRECT_URI=http://localhost:3000/callback/join
    LOGIN_REDIRECT_URI=http://localhost:3000/callback/login
    HCAPTCHA_SECRET=your_hcaptcha_secret
    SESSION_SECRET=your_session_secret
    ADMIN_USER_ID=your_discord_id
    ```

5. Start the server:
    ```sh
    node app.js
    ```

## Usage

1. Open your browser and navigate to `http://localhost:3000`.
2. Create a custom URL by entering a custom URL name and a Discord invite link.
3. Visit the generated URL (e.g., `http://localhost:3000/invite/custom-url`).
4. Authenticate via Discord OAuth2.
5. After authentication, the application will automatically add the user to the specified Discord server using the bot.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
