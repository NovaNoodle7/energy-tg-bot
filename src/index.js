require('dotenv').config();
const { Telegraf } = require('telegraf');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new Telegraf(token);

// Store user data in memory (for production, use a database)
const users = {};

// Energy pricing (per unit)
const ENERGY_PRICE = 0.50; // $0.50 per kWh

// Welcome message with commands
const startMessage = `
Welcome to Energy Rent Bot! ⚡

Available commands:
/start - Show this message
/credit - Check your credit balance
/topup <amount> - Add credit to account
/rentals - View energy rental options
/rent <amount> - Rent energy units
/myrentals - View your active rentals
/history - View transaction history
/help - Get help with commands
`;

// Handle /start command
bot.command('start', (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!users[chatId]) {
    users[chatId] = {
      chatId: chatId,
      username: ctx.from.username || ctx.from.first_name,
      credit: 0,
      activeRentals: [],
      transactions: []
    };
  }
  
  ctx.reply(startMessage);
});

// Handle /credit command
bot.command('credit', (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!users[chatId]) {
    ctx.reply('Please use /start first to initialize your account.');
    return;
  }
  
  const userData = users[chatId];
  const message = `
💳 Your Credit Balance: $${userData.credit.toFixed(2)}

Active Rentals: ${userData.activeRentals.length}
Total Transactions: ${userData.transactions.length}
  `;
  
  ctx.reply(message);
});

// Handle /topup command
bot.command('topup', (ctx) => {
  const chatId = ctx.chat.id;
  const amount = parseFloat(ctx.args[0]);
  
  if (!users[chatId]) {
    ctx.reply('Please use /start first to initialize your account.');
    return;
  }
  
  if (!ctx.args.length || isNaN(amount) || amount <= 0) {
    ctx.reply('❌ Please provide a valid amount. Example: /topup 50');
    return;
  }
  
  users[chatId].credit += amount;
  users[chatId].transactions.push({
    type: 'topup',
    amount: amount,
    date: new Date().toISOString(),
    description: 'Credit top-up'
  });
  
  ctx.reply(
    `✅ Credit added successfully!\n\nAdded: $${amount.toFixed(2)}\nNew Balance: $${users[chatId].credit.toFixed(2)}`
  );
});

// Handle /rentals command
bot.command('rentals', (ctx) => {
  const rentalOptions = `
⚡ Energy Rental Options:

Energy Price: $${ENERGY_PRICE.toFixed(2)} per kWh

Available Plans:
🔋 Small: 10 kWh - $${(10 * ENERGY_PRICE).toFixed(2)}
🔋 Medium: 25 kWh - $${(25 * ENERGY_PRICE).toFixed(2)}
🔋 Large: 50 kWh - $${(50 * ENERGY_PRICE).toFixed(2)}
🔋 Custom: /rent <amount> kWh

Usage: /rent 10 (for 10 kWh)
  `;
  
  ctx.reply(rentalOptions);
});

// Handle /rent command for energy rental
bot.command('rent', (ctx) => {
  const chatId = ctx.chat.id;
  const amount = parseFloat(ctx.args[0]);
  
  if (!users[chatId]) {
    ctx.reply('Please use /start first to initialize your account.');
    return;
  }
  
  if (!ctx.args.length || isNaN(amount) || amount <= 0) {
    ctx.reply('❌ Please provide a valid energy amount in kWh. Example: /rent 10');
    return;
  }
  
  const cost = amount * ENERGY_PRICE;
  
  if (users[chatId].credit < cost) {
    const needed = (cost - users[chatId].credit).toFixed(2);
    ctx.reply(
      `❌ Insufficient credit!\n\nNeeded: $${cost.toFixed(2)}\nYour Balance: $${users[chatId].credit.toFixed(2)}\nShortfall: $${needed}`
    );
    return;
  }
  
  // Deduct credit and add rental
  users[chatId].credit -= cost;
  const rentalId = `RENT-${Date.now()}`;
  
  users[chatId].activeRentals.push({
    id: rentalId,
    amount: amount,
    cost: cost,
    startDate: new Date().toISOString(),
    status: 'active'
  });
  
  users[chatId].transactions.push({
    type: 'rental',
    amount: amount,
    cost: cost,
    date: new Date().toISOString(),
    description: `Energy rental: ${amount} kWh`,
    rentalId: rentalId
  });
  
  ctx.reply(
    `⚡ Energy rental successful!\n\nRental ID: ${rentalId}\nAmount: ${amount} kWh\nCost: $${cost.toFixed(2)}\nRemaining Credit: $${users[chatId].credit.toFixed(2)}`
  );
});

// Handle /myrentals command
bot.command('myrentals', (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!users[chatId]) {
    ctx.reply('Please use /start first to initialize your account.');
    return;
  }
  
  if (users[chatId].activeRentals.length === 0) {
    ctx.reply('No active rentals.');
    return;
  }
  
  let rentalMessage = '⚡ Your Active Rentals:\n\n';
  users[chatId].activeRentals.forEach((rental, index) => {
    const startDate = new Date(rental.startDate).toLocaleDateString();
    rentalMessage += `${index + 1}. ${rental.amount} kWh\n   ID: ${rental.id}\n   Cost: $${rental.cost.toFixed(2)}\n   Started: ${startDate}\n\n`;
  });
  
  ctx.reply(rentalMessage);
});

// Handle /history command
bot.command('history', (ctx) => {
  const chatId = ctx.chat.id;
  
  if (!users[chatId] || users[chatId].transactions.length === 0) {
    ctx.reply('No transaction history yet.');
    return;
  }
  
  let historyMessage = '📊 Transaction History:\n\n';
  users[chatId].transactions.forEach((transaction, index) => {
    const date = new Date(transaction.date).toLocaleDateString();
    const icon = transaction.type === 'topup' ? '✅' : '⚡';
    
    if (transaction.type === 'topup') {
      historyMessage += `${icon} ${index + 1}. Credit Top-up: +$${transaction.amount.toFixed(2)} (${date})\n`;
    } else {
      historyMessage += `${icon} ${index + 1}. Energy Rental: ${transaction.amount} kWh, -$${transaction.cost.toFixed(2)} (${date})\n`;
    }
  });
  
  ctx.reply(historyMessage);
});

// Handle /help command
bot.command('help', (ctx) => {
  const helpMessage = `
📚 Command Help:

💳 CREDIT MANAGEMENT:
/credit - Check your credit balance
/topup <amount> - Add credit (e.g., /topup 50)

⚡ ENERGY RENTAL:
/rentals - View rental options & pricing
/rent <kWh> - Rent energy (e.g., /rent 10)
/myrentals - View your active rentals

📊 HISTORY & INFO:
/history - View all transactions
/help - Show this help message

Example Usage:
/topup 100     (Add $100 credit)
/rent 25       (Rent 25 kWh)
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
