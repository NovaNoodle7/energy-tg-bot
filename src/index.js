require('dotenv').config();
const { Telegraf } = require('telegraf');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new Telegraf(token);

// Store user data in memory (for production, use a database)
const users = {};

// Welcome message with commands
const startMessage = `
Welcome to Energy Rent Bot! 🤖

Available commands:
/start - Show this message
/balance - Check your current balance
/rent - Record an energy rent payment
/history - View payment history
/help - Get help with commands
`;

// Handle /start command
bot.command('start', (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!users[chatId]) {
    users[chatId] = {
      chatId: chatId,
      username: ctx.from.username || ctx.from.first_name,
      balance: 0,
      payments: []
    };
  }
  
  ctx.reply(startMessage);
});

// Handle /balance command
bot.command('balance', (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!users[chatId]) {
    ctx.reply('Please use /start first to initialize your account.');
    return;
  }
  
  const userData = users[chatId];
  const message = `
💰 Your Current Balance: $${userData.balance.toFixed(2)}

Total Payments: ${userData.payments.length}
  `;
  
  ctx.reply(message);
});

// Handle /rent command
bot.command('rent', (ctx) => {
  const chatId = ctx.chat.id;
  const amount = parseFloat(ctx.args[0]);
  
  if (!users[chatId]) {
    ctx.reply('Please use /start first to initialize your account.');
    return;
  }
  
  if (!ctx.args.length || isNaN(amount) || amount <= 0) {
    ctx.reply('❌ Please provide a valid amount. Example: /rent 50');
    return;
  }
  
  users[chatId].balance += amount;
  users[chatId].payments.push({
    amount: amount,
    date: new Date().toISOString(),
    description: 'Energy rent payment'
  });
  
  ctx.reply(
    `✅ Payment recorded!\nAmount: $${amount.toFixed(2)}\nNew Balance: $${users[chatId].balance.toFixed(2)}`
  );
});

// Handle /history command
bot.command('history', (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!users[chatId] || users[chatId].payments.length === 0) {
    ctx.reply('No payment history yet.');
    return;
  }
  
  let historyMessage = '📊 Payment History:\n\n';
  users[chatId].payments.forEach((payment, index) => {
    const date = new Date(payment.date).toLocaleDateString();
    historyMessage += `${index + 1}. $${payment.amount.toFixed(2)} - ${date}\n`;
  });
  
  ctx.reply(historyMessage);
});

// Handle /help command
bot.command('help', (ctx) => {
  const helpMessage = `
📚 Command Help:

/start - Initialize your account
/balance - Check your current balance
/rent <amount> - Record a payment (e.g., /rent 50)
/history - View all your payments
/help - Show this help message

Example:
/rent 100
  `;
  
  ctx.reply(helpMessage);
});

// Handle any other text message
bot.on('text', (ctx) => {
  ctx.reply('I didn\'t understand that command. Use /help to see available commands.');
});

// Error handling
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start the bot
bot.launch();

console.log('🤖 Energy Rent Bot is running...');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
