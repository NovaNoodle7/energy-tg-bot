# Energy Rent Telegram Bot

A Telegram bot for managing energy rent payments and tracking balances.

## Features

- 💰 Track your energy rent balance
- 📊 View payment history
- ➕ Record new payments
- 📱 Simple command-based interface

## Setup Instructions

### 1. Get Your Bot Token

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the prompts to create your bot
4. Copy the token provided

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and add your bot token:

```bash
cp .env.example .env
```

Edit `.env` and replace `your_bot_token_here` with your actual token:

```
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklmnoPQRstuvWXYZ
BOT_MODE=polling
PORT=3000
```

### 4. Run the Bot

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

## Available Commands

- `/start` - Initialize your account and show welcome message
- `/balance` - Check your current balance and payment count
- `/rent <amount>` - Record a new payment (e.g., `/rent 50`)
- `/history` - View all your previous payments
- `/help` - Display help and command information

## Example Usage

```
User: /start
Bot: Welcome to Energy Rent Bot! 🤖 ...

User: /rent 100
Bot: ✅ Payment recorded! Amount: $100.00, New Balance: $100.00

User: /balance
Bot: 💰 Your Current Balance: $100.00 ...

User: /history
Bot: 📊 Payment History:
     1. $100.00 - 2/20/2026
```

## Link Telegram (web account linking)

Users can link their web platform account to the bot so that the same deposit wallet, balance, and rental history are used on both. The bot handles the deep link (`/start <token>`) and calls your backend to complete the link. To add the “Link Telegram” button and backend APIs on your web platform, see **[docs/LINK_TELEGRAM_WEB.md](docs/LINK_TELEGRAM_WEB.md)** for the API contract and a sample account page.

## Project Structure

```
energy-tg-bot/
├── src/
│   └── index.js          # Main bot logic
├── docs/
│   ├── LINK_TELEGRAM_WEB.md   # Web platform API + UI guide
│   └── sample-account-link-telegram.html  # Sample account page
├── .env.example          # Environment variables template
├── .env                  # Environmental variables (not in git)
├── package.json          # Project dependencies
└── README.md             # This file
```

## Future Enhancements

- Database integration (MongoDB, PostgreSQL)
- User authentication
- Payment notifications
- Monthly/yearly reports
- Multi-user support
- Admin dashboard
- Payment reminders

## License

MIT

## Support

For issues or questions, contact the bot creator.
