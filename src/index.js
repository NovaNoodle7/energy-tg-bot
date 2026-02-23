require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new Telegraf(token);

// Platform API configuration (uses same database as web platform)
const PLATFORM_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const API_BASE = PLATFORM_URL + '/api';

// In-memory cache for telegram_id <-> wallet_address mapping
// This is ephemeral - just for session context during conversation
const userSessions = {}; // { telegramId: { state: 'idle|awaiting_energy', walletAddress: '...' } }

const startMessage = `
Welcome to Energy Rent Bot! ⚡

This bot connects to your Tron Energy platform account.

Available actions:
• 🔥 Rent Energy - Get energy from platform
• 💰 Balance Top-Up - Add TRX to your account
• 💳 Check Balance - View your current balance
• 📊 Transaction History - See your activity
`;

const mainKeyboard = [
  [
    { text: '🔥 Rent Energy', callback_data: 'rent_energy' }
  ],
  [
    { text: '💰 Balance Top-Up', callback_data: 'topup' }
  ],
  [
    { text: '💳 Check Balance', callback_data: 'check_balance' },
    { text: '📊 History', callback_data: 'history' }
  ],
  [
    { text: '📞 Support', callback_data: 'support' }
  ]
];

// ============ HELPER FUNCTIONS ============

/**
 * Register or get Telegram user from platform
 */
async function registerOrGetUser(telegramId, telegramUsername) {
  try {
    // Try to register new user
    const response = await axios.post(`${API_BASE}/auth/telegram/register`, {
      telegram_id: telegramId,
      telegram_username: telegramUsername
    });
    
    return {
      userId: response.data.user_id,
      walletAddress: response.data.wallet_address,
      isNew: true
    };
  } catch (err) {
    if (err.response?.status === 409 || err.response?.data?.message?.includes('already')) {
      // User already exists, get their info
      try {
        const response = await axios.get(`${API_BASE}/wallet/info`, {
          params: { telegram_id: telegramId }
        });
        return {
          userId: response.data.user_id,
          walletAddress: response.data.wallet_address,
          isNew: false
        };
      } catch (getErr) {
        throw getErr;
      }
    }
    throw err;
  }
}

/**
 * Get user wallet info
 */
async function getUserWallet(telegramId) {
  try {
    const response = await axios.get(`${API_BASE}/wallet/info`, {
      params: { telegram_id: telegramId }
    });
    return response.data;
  } catch (err) {
    if (err.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Get user balance
 */
async function getUserBalance(telegramId) {
  try {
    const response = await axios.get(`${API_BASE}/wallet/info`, {
      params: { telegram_id: telegramId }
    });
    return response.data.balance;
  } catch (err) {
    console.error('Failed to get balance:', err.message);
    return null;
  }
}

/**
 * Rent energy for user to a destination wallet
 */
async function rentEnergy(telegramId, energyAmount, destinationWallet) {
  try {
    const response = await axios.post(`${API_BASE}/energy/telegram-rent`, {
      telegram_id: telegramId,
      energy_amount: energyAmount,
      destination_wallet: destinationWallet,
      duration: 1
    });
    return response.data;
  } catch (err) {
    if (err.response?.status === 402) {
      return {
        success: false,
        error: 'Insufficient balance',
        details: err.response.data
      };
    }
    throw err;
  }
}

// ============ BOT COMMANDS ============

/**
 * /start - Initialize user and show main menu
 */
bot.command('start', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const telegramUsername = ctx.from.username || 'unknown';
    
    // Register user on platform (or get existing)
    const user = await registerOrGetUser(telegramId, telegramUsername);
    
    // Store in session
    userSessions[telegramId] = {
      state: 'idle',
      walletAddress: user.walletAddress,
      userId: user.userId
    };
    
    const welcomeMsg = user.isNew
      ? `👋 Welcome! Your wallet has been created:\n\n<code>${user.walletAddress}</code>`
      : `👋 Welcome back! Your wallet:\n\n<code>${user.walletAddress}</code>`;
    
    await ctx.reply(welcomeMsg, { parse_mode: 'HTML' });
    await ctx.reply(startMessage, {
      reply_markup: { inline_keyboard: mainKeyboard }
    });
  } catch (err) {
    console.error('Start error:', err.message);
    await ctx.reply('❌ Error initializing bot. Please try again.');
  }
});

/**
 * Rent Energy button
 */
bot.action('rent_energy', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    
    // Check if user exists in session
    if (!userSessions[telegramId]) {
      return ctx.reply('❌ Please use /start first to initialize your account.');
    }
    
    // Get current balance
    const balance = await getUserBalance(telegramId);
    
    if (balance === null) {
      return ctx.reply('❌ Failed to fetch balance. Please try again.');
    }
    
    userSessions[telegramId].state = 'awaiting_wallet_address';
    
    await ctx.reply(
      `⚡ Current Balance: ${balance} TRX\n\n` +
      `📮 Enter destination wallet address:`,
      {
        reply_markup: {
          force_reply: true,
          selective: true
        }
      }
    );
  } catch (err) {
    console.error('Rent energy error:', err.message);
    await ctx.reply('❌ Error. Please try again.');
  }
});

/**
 * Top-Up button - Show deposit address
 */
bot.action('topup', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    
    const wallet = await getUserWallet(telegramId);
    
    if (!wallet) {
      return ctx.reply('❌ Wallet not found. Please use /start first.');
    }
    
    await ctx.reply(
      `💰 Your Deposit Address:\n\n` +
      `<code>${wallet.wallet_address}</code>\n\n` +
      `📌 Send TRX from any wallet to this address.\n` +
      `✅ Your balance will be credited automatically when the transaction is confirmed.`,
      { 
        parse_mode: 'HTML'
      }
    );
  } catch (err) {
    console.error('Top-up error:', err.message);
    await ctx.reply('❌ Error. Please try again.');
  }
});

/**
 * Check Balance button
 */
bot.action('check_balance', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    
    const wallet = await getUserWallet(telegramId);
    
    if (!wallet) {
      return ctx.reply('❌ Wallet not found. Please use /start first.');
    }
    
    await ctx.reply(
      `💳 Account Balance\n\n` +
      `Balance: <b>${wallet.balance} TRX</b>\n` +
      `Wallet: <code>${wallet.wallet_address}</code>`,
      { 
        parse_mode: 'HTML'
      }
    );
  } catch (err) {
    console.error('Check balance error:', err.message);
    await ctx.reply('❌ Error fetching balance. Please try again.');
  }
});

/**
 * History button - Show transaction history
 */
bot.action('history', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('📊 Transaction history feature coming soon.');
  } catch (err) {
    console.error('History error:', err.message);
    await ctx.reply('❌ Error. Please try again.');
  }
});

/**
 * Support button
 */
bot.action('support', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('📞 Support: Contact @support or visit https://your-platform.com/support');
  } catch (err) {
    console.error('Support error:', err.message);
    await ctx.reply('❌ Error. Please try again.');
  }
});

// ============ TEXT MESSAGE HANDLER ============

/**
 * Handle text input (energy amount, etc.)
 */
bot.on('text', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const userInput = ctx.message.text?.trim();
    const session = userSessions[telegramId];
    
    if (!session) {
      return ctx.reply('❌ Please use /start first to initialize your account.');
    }
    
    // Handle awaiting wallet address
    if (session.state === 'awaiting_wallet_address') {
      const destinationWallet = userInput.trim();
      
      // Validate Tron address format (starts with T and is 34 chars)
      if (!/^T[a-zA-Z0-9]{33}$/.test(destinationWallet)) {
        return ctx.reply(
          `❌ Invalid wallet address!\n\n` +
          `A valid Tron address:\n` +
          `• Starts with 'T'\n` +
          `• Has exactly 34 characters\n` +
          `• Example: T8xQfnkVeB...`
        );
      }
      
      // Store wallet and ask for energy amount
      session.state = 'awaiting_energy_amount';
      session.destinationWallet = destinationWallet;
      
      await ctx.reply(
        `⚡ How much energy do you want to rent? (in kWh)\n` +
        `✏️ Cost: 1 TRX per kWh`,
        {
          reply_markup: {
            force_reply: true,
            selective: true
          }
        }
      );
    }
    // Handle awaiting energy amount
    else if (session.state === 'awaiting_energy_amount') {
      const energyAmount = parseFloat(userInput);
      
      if (isNaN(energyAmount) || energyAmount <= 0) {
        return ctx.reply('❌ Please enter a valid positive number.');
      }
      
      const destinationWallet = session.destinationWallet || session.walletAddress;
      
      // Reset state
      session.state = 'idle';
      
      // Process rental on platform
      const result = await rentEnergy(telegramId, energyAmount, destinationWallet);
      
      if (result.success) {
        await ctx.reply(
          `✅ Energy Rental Successful!\n\n` +
          `⚡ Amount: ${result.energy_amount} kWh\n` +
          `💸 Cost: ${result.cost} TRX\n` +
          `💰 New Balance: ${result.new_balance} TRX\n` +
          `📮 Delegated to: <code>${result.wallet_address}</code>`,
          { parse_mode: 'HTML' }
        );
      } else {
        if (result.error === 'Insufficient balance') {
          await ctx.reply(
            `❌ Insufficient Balance\n\n` +
            `Current: ${result.details.current_balance} TRX\n` +
            `Needed: ${result.details.required_balance} TRX\n` +
            `Short by: ${result.details.short_by} TRX\n\n` +
            `💰 Please top-up your account first.`
          );
        } else {
          await ctx.reply(`❌ Rental failed: ${result.error}`);
        }
      }
    } else {
      ctx.reply('I didn\'t understand that. Use the menu buttons or /start to get started.');
    }
  } catch (err) {
    console.error('Text handler error:', err.message);
    await ctx.reply('❌ An error occurred. Please try again.');
  }
});

// ============ ERROR HANDLING & STARTUP ============

bot.catch((err) => {
  console.error('Bot error:', err);
});

// Start the bot
(async () => {
  try {
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Initialize your Telegram account' },
      { command: 'help', description: 'Show help message' }
    ]);

    await bot.telegram.setMyDescription({
      description: 'Tron Energy Rent Bot - Rent energy and manage your account via Telegram'
    });

    console.log('✅ Bot profile configured');
  } catch (err) {
    console.error('Failed to configure bot profile:', err.message);
  }
})();

// Ensure no webhook conflicts
(async () => {
  try {
    await bot.telegram.deleteWebhook();
  } catch (err) {
    console.warn('deleteWebhook warning (non-fatal):', err.message);
  }

  try {
    await bot.launch();
    console.log('🤖 Energy Rent Bot is running (polling mode)...');
  } catch (err) {
    console.error('Failed to launch bot:', err.message);
  }
})();

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
