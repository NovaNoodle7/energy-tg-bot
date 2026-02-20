// Configuration file for the bot
module.exports = {
  // Bot settings
  bot: {
    polling: {
      interval: 300,
      autoStart: true,
      params: {
        timeout: 10
      }
    }
  },

  // Default messages
  messages: {
    welcome: 'Welcome to Energy Rent Bot! 🤖',
    commandNotFound: 'Command not recognized. Use /help for available commands.',
    notInitialized: 'Please use /start first to initialize your account.'
  },

  // Commands configuration
  commands: {
    start: '/start',
    balance: '/balance',
    rent: '/rent',
    history: '/history',
    help: '/help'
  }
};
