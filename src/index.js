require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new Telegraf(token);

// Store user JWTs in memory (for production, use a database)
const userJWTs = {};

const API_BASE = process.env.PLATFORM_API_BASE || 'https://your-platform-url/api';

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

const inlineKeyboard = [
  [
    { text: '🔥 Rent Energy', callback_data: 'rent' },
    { text: '💰 Balance Top-Up', callback_data: 'topup' }
  ],
  [
    { text: '🚀 Transfer Pack', callback_data: 'transfer_pack' },
    { text: '🪄 Smart Transfer', callback_data: 'smart_transfer' }
  ],
  [
    { text: '🏠 Smart Hosting', callback_data: 'smart_hosting' },
    { text: '🧭 Shortcuts', callback_data: 'shortcuts' }
  ],
  [
    { text: '📦 Bulk purchase', callback_data: 'bulk' },
    { text: '🎁 Premium', callback_data: 'premium' }
  ],
  [
    { text: '🛠 Manual Rental', callback_data: 'manual_rental' },
    { text: '🔁 TRX Exchange', callback_data: 'trx_exchange' }
  ],
  [
    { text: '🔑 APIKey(Docs)', callback_data: 'apikey' },
    { text: '🏷 Support', callback_data: 'support' }
  ]
];

// Handle /start command
bot.command('start', async (ctx) => {
  ctx.reply(startMessage, {
    reply_markup: { inline_keyboard: inlineKeyboard }
  });
});

// ...removed Telegram linking logic...

// Handle /credit command
bot.command('credit', async (ctx) => {
  const chatId = ctx.chat.id;
  const jwt = userJWTs[chatId];
  
  if (!jwt) {
    ctx.reply('Please link your Telegram account first with /start.');
    return;
  }
  
  try {
    const res = await axios.get(`${API_BASE}/wallet`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    
    const { trxBalance, address } = res.data;
    ctx.reply(`💳 Your Credit Balance: ${trxBalance} TRX\nDeposit Address: ${address}`);
  } catch (err) {
    ctx.reply('❌ Failed to fetch wallet info.');
    console.error('Wallet fetch error:', err.message);
  }
});

// Handle /topup command
bot.command('topup', async (ctx) => {
  const chatId = ctx.chat.id;
  const jwt = userJWTs[chatId];
  
  if (!jwt) {
    ctx.reply('Please link your Telegram account first with /start.');
    return;
  }
  
  try {
    const res = await axios.get(`${API_BASE}/wallet`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    
    const { trxBalance, address } = res.data;
    const message = `💳 Account Balance: ${trxBalance} TRX\n\n⚠️ Please transfer TRX to the address below from any wallet.\nMinimum deposit is 1 TRX per transaction.\n\n🔗 Click the address to copy (The activation fee for your address has been gifted to your account balance with your first deposit)\n\n${address}`;
    
    ctx.reply(message);
  } catch (err) {
    ctx.reply('❌ Failed to fetch wallet info.');
    console.error('Topup error:', err.message);
  }
});

// Handle /rentals command
bot.command('rentals', (ctx) => {
  const rentalOptions = `
⚡ Energy Rental Options:

Available Plans:
🔋 Small: 10 kWh
🔋 Medium: 25 kWh
🔋 Large: 50 kWh
🔋 Custom: /rent <amount> kWh

Usage: /rent 10 (for 10 kWh)
  `;
  
  ctx.reply(rentalOptions);
});

// Handle /rent command for energy rental
bot.command('rent', async (ctx) => {
  const chatId = ctx.chat.id;
  const jwt = userJWTs[chatId];
  const amount = parseFloat(ctx.args[0]);
  
  if (!jwt) {
    ctx.reply('Please link your Telegram account first with /start.');
    return;
  }
  
  if (!ctx.args.length || isNaN(amount) || amount <= 0) {
    ctx.reply('❌ Please provide a valid energy amount in kWh. Example: /rent 10');
    return;
  }
  
  try {
    const res = await axios.post(`${API_BASE}/energy/rent`, {
      receiverAddress: '',
      energyAmount: amount,
      duration: 1
    }, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    
    if (res.data && res.data.success) {
      ctx.reply(`⚡ Energy rental successful! Amount: ${amount} kWh`);
    } else {
      ctx.reply('❌ Energy rental failed.');
    }
  } catch (err) {
    ctx.reply('❌ Error renting energy.');
    console.error('Energy rent error:', err.message);
  }
});

// Handle /myrentals command
bot.command('myrentals', async (ctx) => {
  const chatId = ctx.chat.id;
  const jwt = userJWTs[chatId];
  
  if (!jwt) {
    ctx.reply('Please link your Telegram account first with /start.');
    return;
  }
  
  try {
    const res = await axios.get(`${API_BASE}/seller/rentals`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    
    const rentals = res.data.rentals || [];
    if (rentals.length === 0) {
      ctx.reply('No active rentals.');
      return;
    }
    
    let rentalMessage = '⚡ Your Active Rentals:\n\n';
    rentals.forEach((rental, index) => {
      rentalMessage += `${index + 1}. ${rental.amount} kWh\n   ID: ${rental.id}\n   Cost: ${rental.cost} TRX\n   Started: ${rental.rental_created_at}\n\n`;
    });
    
    ctx.reply(rentalMessage);
  } catch (err) {
    ctx.reply('❌ Failed to fetch rentals.');
    console.error('Rentals fetch error:', err.message);
  }
});

// Handle /history command
bot.command('history', async (ctx) => {
  const chatId = ctx.chat.id;
  const jwt = userJWTs[chatId];
  
  if (!jwt) {
    ctx.reply('Please link your Telegram account first with /start.');
    return;
  }
  
  try {
    const res = await axios.get(`${API_BASE}/transactions`, {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    
    const transactions = res.data.transactions || [];
    if (transactions.length === 0) {
      ctx.reply('No transaction history yet.');
      return;
    }
    
    let historyMessage = '📊 Transaction History:\n\n';
    transactions.forEach((tx, index) => {
      const date = tx.transaction_created_at || tx.date;
      const icon = tx.transaction_type === 'deposit' ? '✅' : '⚡';
      
      if (tx.transaction_type === 'deposit') {
        historyMessage += `${icon} ${index + 1}. Credit Top-up: +${tx.transaction_amount} TRX (${date})\n`;
      } else {
        historyMessage += `${icon} ${index + 1}. Energy Rental: ${tx.transaction_amount} kWh, -${tx.transaction_amount} TRX (${date})\n`;
      }
    });
    
    ctx.reply(historyMessage);
  } catch (err) {
    ctx.reply('❌ Failed to fetch transaction history.');
    console.error('Transaction fetch error:', err.message);
  }
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
/topup 100     (Add 100 TRX credit)
/rent 25       (Rent 25 kWh)
  `;
  
  ctx.reply(helpMessage);
});

// Inline button handlers (callback_data)
bot.action('rent', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('To rent energy, view plans with /rentals or rent directly: /rent <kWh>');
});

bot.action('topup', async (ctx) => {
  await ctx.answerCbQuery();

  const address = process.env.PLATFORM_WALLET_ADDRESS || 'TW3EzLiPVi3MGoUqBfzLkwddbCXeBJ4ayp';
  const trxBalance = '1.100 TRX';

  const message = `💰 Account Balance: ${trxBalance}\n\n⚠️ Please transfer TRX to the address below from any wallet.\nMinimum deposit is 1 TRX per transaction.\n\n👇 Click the address to copy (The activation fee for your address has been gifted to your account balance with your first deposit)\n\n`;

  const keyboard = Markup.inlineKeyboard([
    Markup.button.callback('💸 Top up USDT (Click me)', 'topup_usdt'),
    Markup.button.callback('💰 Balance Top-Up', 'topup'),
    Markup.button.callback('📞 Support', 'support')
  ], { columns: 1 });

  await ctx.replyWithHTML(message + `<code>${address}</code>`, keyboard);
});

bot.action('transfer_pack', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Transfer Pack feature coming soon.');
});

// Handle Top up USDT callback: reply with a valid deposit URL or instructions
bot.action('topup_usdt', async (ctx) => {
  await ctx.answerCbQuery();
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.API_BASE || null;
  const depositUrl = base ? `${base.replace(/\/$/, '')}/deposit` : null;
  if (depositUrl && /^https?:\/\//.test(depositUrl)) {
    return ctx.reply(`Open this link to top up: ${depositUrl}`);
  }
  return ctx.reply('Please visit the platform website to deposit, or contact Support.');
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

// Ensure no webhook is set (prevents 409 conflict when using polling)
(async () => {
  try {
    await bot.telegram.deleteWebhook();
  } catch (err) {
    // non-fatal
    console.warn('deleteWebhook error (non-fatal):', err && err.description ? err.description : err.message || err);
  }
  try {
    await bot.launch();
    console.log('Bot launched (polling).');
  } catch (err) {
    console.error('Failed to launch bot:', err && err.description ? err.description : err);
  }
})();

console.log('🤖 Energy Rent Bot is running...');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
