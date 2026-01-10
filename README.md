# D&D AI Telegram Bot

A highly immersive, personalized, and engaging D&D Telegram bot experience powered by DeepSeek AI.

## Features
- 🌍 **Multilingual**: Supports Russian and English.
- 🎭 **Dynamic Narratives**: AI-driven stories with deep emotional context and unpredictable events.
- 🎲 **Animated Dice**: Real-time animated d20 rolls for critical actions.
- 🧼 **Clean UI**: Persistent story history with automatic button cleanup for a focused experience.
- 🧙‍♂️ **Character Progression**: Dynamic background creation, stat tracking, and persistent spell list.

## Commands
- `/start` - Begin your adventure or resume game.
- `/stats` - View your character's current state.
- `/delete` - Reset all game progress (requires confirmation).
- `/version` - Check bot status and last update time.

## Deployment & Auto-Updates
The bot is configured for auto-deployment via GitHub Webhooks.

### Setting up Auto-Updates
1. Go to your GitHub repository -> **Settings** -> **Webhooks**.
2. Click **Add webhook**.
3. **Payload URL**: `http://agent.bothost.ru/api/webhooks/github`
4. **Content type**: `application/json`
5. **Event triggers**: Just the `push` event.
6. Click **Add webhook**.

Every time you push to the `main` branch, the bot will automatically pull the latest code and restart.
