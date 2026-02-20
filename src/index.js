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

// Inline keyboard grid (menu)
// Build labels programmatically and pad them with non-breaking spaces to increase visual width
const rawInline = [
  [ ['🔥 Rent Energy','rent'], ['💰 Balance Top-Up','topup'] ],
  [ ['🚀 Transfer Pack','transfer_pack'], ['🪄 Smart Transfer','smart_transfer'] ],
  [ ['🏠 Smart Hosting','smart_hosting'], ['🧭 Shortcuts','shortcuts'] ],
  [ ['📦 Bulk purchase','bulk'], ['🎁 Premium','premium'] ],
  [ ['🛠 Manual Rental','manual_rental'], ['🔁 TRX Exchange','trx_exchange'] ],
  [ ['🔑 APIKey(Docs)','apikey'], ['🏷 Support','support'] ]
];

// Compute padding target based on longest label, scaled by 1.7
const allLabels = rawInline.flat().map(([t]) => t);
const maxLen = Math.max(...allLabels.map(s => s.length));
const targetLen = Math.ceil(maxLen * 1.7);
const NBSP = '\u00A0';
function padLabel(s){
  const pad = Math.max(0, targetLen - s.length);
  return s + NBSP.repeat(pad);
}

const inlineKeyboard = rawInline.map(row => row.map(([text, cb]) => ({ text: padLabel(text), callback_data: cb })));

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
  
  ctx.reply(startMessage, {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  });
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
// Inline button handlers (callback_data)
bot.action('rent', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('To rent energy, view plans with /rentals or rent directly: /rent <kWh>');
});

bot.action('topup', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Add credit with /topup <amount>. Example: /topup 100');
});

bot.action('transfer_pack', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Transfer Pack feature coming soon.');
});

bot.action('smart_transfer', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Smart Transfer feature coming soon.');
});

bot.action('smart_hosting', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Smart Hosting feature coming soon.');
});

bot.action('shortcuts', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Shortcuts: use commands like /rent, /topup, /history');
});

bot.action('bulk', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Bulk purchase feature coming soon.');
});

bot.action('premium', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Premium plans info: contact Support.');
});

bot.action('manual_rental', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Manual Rental: use /rent <kWh> or contact Support.');
});

bot.action('trx_exchange', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('TRX Exchange: feature coming soon.');
});

bot.action('apikey', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('API docs: https://apitrx.com (or contact Support)');
});

bot.action('support', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Contact support: @apitrOn or reply here and we will assist you.');
});

// Fallback for unknown text
bot.on('text', (ctx) => {
  ctx.reply('I didn\'t understand that. Use the menu or /help to see available commands.');
});

// Error handling
bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start the bot
// Set bot profile: commands, description and short description
(async () => {
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Initialize your account' },
      { command: 'credit', description: 'Check your credit balance' },
      { command: 'topup', description: 'Add credit to your account' },
      { command: 'rentals', description: 'View rental options & pricing' },
      { command: 'rent', description: 'Rent energy (e.g., /rent 10)' },
      { command: 'myrentals', description: 'View your active rentals' },
      { command: 'history', description: 'View all transactions' },
      { command: 'help', description: 'Show help and examples' }
    ]);

    await bot.telegram.setMyDescription({
      description: 'Tron Energy Rent Bot — rent energy units, top up credit, and track transactions. Use /help for commands.'
    });

    await bot.telegram.setMyShortDescription({
      short_description: 'Rent energy & manage credit easily.'
    });

    console.log('✅ Bot profile (commands/description) configured.');
  } catch (err) {
    console.error('Failed to set bot profile info:', err && err.description ? err.description : err);
  }
})();

bot.launch();

console.log('🤖 Energy Rent Bot is running...');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
