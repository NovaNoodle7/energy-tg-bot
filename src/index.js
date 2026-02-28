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

// Cache for pricing configuration
let pricingCache = {
  energyPerTrx: 21466,
  minRentalTrx: 1,
  minEnergy: null, // Will be calculated from API
  cachedAt: 0
};
const PRICING_CACHE_MS = 3600000; // 1 hour

/**
 * Fetch pricing configuration from platform
 */
async function getPricingConfig() {
  try {
    const now = Date.now();
    // Return cached value if still fresh
    if (pricingCache.cachedAt && (now - pricingCache.cachedAt) < PRICING_CACHE_MS) {
      return pricingCache;
    }

    const response = await axios.get(`${API_BASE}/config/pricing`);
    pricingCache = {
      energyPerTrx: response.data.energy_per_trx,
      minRentalTrx: response.data.min_rental_trx,
      minEnergy: response.data.min_energy, // Use value from API
      cachedAt: now
    };
    return pricingCache;
  } catch (err) {
    console.error('Failed to fetch pricing config:', err.message);
    // Fallback: calculate minEnergy from defaults if API fails
    if (!pricingCache.minEnergy) {
      pricingCache.minEnergy = pricingCache.minRentalTrx * pricingCache.energyPerTrx;
    }
    return pricingCache;
  }
}

const startMessage = `
Welcome to Energy Rent Bot! ⚡

This bot connects to your Tron Energy platform account.

Available actions:
• 🔥 Rent Energy - Get energy from platform
• 💰 Balance Top-Up - Add TRX to your account
• 💳 Check Balance - View your current balance
• 📊 Transaction History - See your activity
• 🔐 APIKey(Docs) - API keys & documentation
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
    { text: '🔐 APIKey(Docs)', callback_data: 'api_key_docs' },
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
 * /start - Initialize user and show main menu.
 * If startPayload is present (deep link from web "Link Telegram"), complete account link first.
 */
bot.command('start', async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const telegramUsername = ctx.from.username || 'unknown';
    const linkToken = (ctx.startPayload || ctx.payload || '').trim();

    // Deep link from web: user clicked "Link Telegram" and opened t.me/Bot?start=TOKEN
    if (linkToken) {
      try {
        const resp = await axios.post(`${API_BASE}/auth/telegram/link`, {
          code: linkToken,
          telegram_id: telegramId,
          telegram_username: telegramUsername
        });

        if (resp.data && (resp.data.linked === true || resp.data.success === true)) {
          const walletInfo = await getUserWallet(telegramId);
          if (walletInfo) {
            userSessions[telegramId] = {
              state: 'idle',
              walletAddress: walletInfo.wallet_address,
              userId: walletInfo.user_id
            };
          } else {
            userSessions[telegramId] = { state: 'idle' };
          }
          await ctx.reply(
            '✅ Your Telegram is linked to your web account.\n\n' +
            'You’ll see the same balance, deposit wallet, and history here and on the website.',
            { reply_markup: { inline_keyboard: mainKeyboard } }
          );
          return;
        }
      } catch (e) {
        const status = e.response?.status;
        const data = e.response?.data;
        if (status === 400 || status === 404 || (data && (data.code === 'expired' || data.code === 'already_used'))) {
          await ctx.reply(
            '⚠️ This link has expired or was already used.\n\n' +
            'Open your account on the website and click “Link Telegram” again to get a new link.'
          );
          return;
        }
        if (status === 409 || (data && data.message && data.message.toLowerCase().includes('already linked'))) {
          await ctx.reply('✅ This Telegram account is already linked to a web account. Use the menu below.');
          const walletInfo = await getUserWallet(telegramId);
          if (walletInfo) {
            userSessions[telegramId] = {
              state: 'idle',
              walletAddress: walletInfo.wallet_address,
              userId: walletInfo.user_id
            };
            await ctx.reply(startMessage, { reply_markup: { inline_keyboard: mainKeyboard } });
          }
          return;
        }
        console.error('link-from-web error:', e.response?.data || e.message);
      }
      await ctx.reply(
        '❌ Could not link your account. Please try again from the website (Account → Link Telegram).'
      );
      return;
    }

    // Normal /start: get or create platform user and show main menu
    let walletInfo = await getUserWallet(telegramId);
    if (!walletInfo) {
      const registered = await registerOrGetUser(telegramId, telegramUsername);
      walletInfo = {
        wallet_address: registered.walletAddress,
        user_id: registered.userId
      };
    }

    userSessions[telegramId] = {
      state: 'idle',
      walletAddress: walletInfo.wallet_address,
      userId: walletInfo.user_id
    };

    await ctx.reply(startMessage, { reply_markup: { inline_keyboard: mainKeyboard } });
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
    
    // Fetch current pricing
    const pricing = await getPricingConfig();
    const costPerKwh = (1 / pricing.energyPerTrx).toFixed(6); // TRX per energy
    
    userSessions[telegramId].state = 'awaiting_wallet_address';
    userSessions[telegramId].pricing = pricing; // Store pricing in session
    
    await ctx.reply(
      `⚡ Current Balance: ${balance} TRX\n\n` +
      `📮 Enter destination wallet address:\n` +
      `(Minimum rent: ${pricing.minEnergy} kWh = ${pricing.minRentalTrx} TRX)`,
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
 * API Key & Docs button - Create API key and display like reference (success message, docs link, admin link, warning, key with copy hint)
 */
bot.action('api_key_docs', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const botApiKey = process.env.BOT_API_KEY;

    if (!botApiKey) {
      await ctx.reply('❌ API key service is not configured (BOT_API_KEY missing).');
      return;
    }

    const startTime = Date.now();
    let response;
    try {
      response = await axios.post(
        `${API_BASE}/auth/telegram/create-api-key`,
        { telegram_id: telegramId },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': botApiKey,
          },
        }
      );
    } catch (err) {
      const status = err.response?.status;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      if (status === 404) {
        await ctx.reply(
          `❌ User not found. Please use /start first to register, then try again.`
        );
        return;
      }
      if (status === 401) {
        await ctx.reply('❌ API key service authentication failed.');
        return;
      }
      if (status === 429) {
        await ctx.reply(
          `⏳ Too many requests. Please try again in a minute.`
        );
        return;
      }
      console.error('create-api-key error:', err.response?.data || err.message);
      await ctx.reply(`❌ Could not create API key. Please try again.`);
      return;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    const data = response.data || {};
    const secret = data.secret || '';
    const docsUrl = data.docs_url || (PLATFORM_URL ? `${PLATFORM_URL.replace(/\/$/, '')}/docs` : '');

    let text = '';
    text += `【API Key】 Professional Energy API sent successfully in ${elapsed} seconds\n\n`;
    if (docsUrl) {
      text += `📄 API documentation: ${docsUrl}\n`;
    }
    text += `⚠️ Your API Key is as follows, please keep it safe, and if it has been leaked, you can contact customer service to replace it.\n\n`;
    const escapedSecret = secret.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    text += `👉 Click to copy:\n<code>${escapedSecret}</code>`;

    await ctx.reply(text, {
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('API key/docs error:', err.message);
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
      
      const pricing = session.pricing || await getPricingConfig();
      const costPerKwh = (1 / pricing.energyPerTrx).toFixed(6);
      
      await ctx.reply(
        `⚡ How much energy do you want to rent? (in kWh)\n` +
        `✏️ Cost: ${costPerKwh} TRX per kWh\n` +
        `⚠️ Minimum: ${pricing.minEnergy} kWh`,
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
      
      const pricing = session.pricing || await getPricingConfig();
      
      if (energyAmount < pricing.minEnergy) {
        return ctx.reply(
          `❌ Minimum energy requirement not met!\n\n` +
          `You must rent at least ${pricing.minEnergy} kWh\n` +
          `(Due to Tron blockchain minimum delegation of ${pricing.minRentalTrx} TRX)\n\n` +
          `Please enter ${pricing.minEnergy} or more.`
        );
      }
      
      const destinationWallet = session.destinationWallet || session.walletAddress;
      
      // Reset state
      session.state = 'idle';
      
      // Process rental on platform
      const result = await rentEnergy(telegramId, energyAmount, destinationWallet);
      
      if (result.success) {
        const costPerKwh = (1 / pricing.energyPerTrx).toFixed(6);
        await ctx.reply(
          `✅ Energy Rental Successful!\n\n` +
          `⚡ Amount: ${result.energy_amount} kWh\n` +
          `💸 Cost: ${result.cost.toFixed(6)} TRX\n` +
          `💰 New Balance: ${result.new_balance.toFixed(8)} TRX\n` +
          `📮 Delegated to: <code>${result.wallet_address}</code>`,
          { parse_mode: 'HTML' }
        );
      } else {
        if (result.error === 'Insufficient balance') {
          await ctx.reply(
            `❌ Insufficient Balance\n\n` +
            `Current: ${result.details.current_balance.toFixed(6)} TRX\n` +
            `Needed: ${result.details.required_balance.toFixed(6)} TRX\n` +
            `Short by: ${result.details.short_by.toFixed(6)} TRX\n\n` +
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
