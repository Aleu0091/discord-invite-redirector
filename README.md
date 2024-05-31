# Discord Invite Redirector with OAuth2

This application allows users to create custom URLs that redirect to a specific Discord invite link. It uses Discord OAuth2 to authenticate users and automatically join them to a server using a bot.

## Requirements

- Node.js
- SQLite
## Installation

1. Clone the repository:
    ```sh
    git clone https://github.com/Aleu0091/discord-invite-redirector.git
    cd discord-invite-redirector
    ```

2. Install dependencies:
    ```sh
    npm install
    ```

3. Create a `.env` file in the root directory and add your Discord application's credentials:
    ```
    CLIENT_ID=your_discord_client_id
    CLIENT_SECRET=your_discord_client_secret
    BOT_TOKEN=your_discord_bot_token
    REDIRECT_URI=http://localhost:3000/callback
    ```

4. Start the server:
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
