// Production-safe logger utility
// Only logs in development, silent in production

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = {
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  error: (...args) => {
    // Always log errors, but can be disabled in production if needed
    console.error(...args);
  },
  
  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },
  
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args);
    }
  }
};

// Filter out noisy extension console logs
// Works in BOTH development and production
export const suppressExtensionLogs = () => {
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalInfo = console.info;

  // List of patterns to suppress
  const suppressPatterns = [
    /UserData loaded/,
    /Loading extension data/,
    /Loading signatures DB/,
    /Loading settings/,
    /received injected\.js_completed/,
    /Signatures DB loaded/,
    /Storage data loaded/,
    /Settings loaded successfully/,
    /Extension data loaded/,
    /Access token found/,
    /Adding.*Wallet to window/,
    /Waiting for injector/,
    /Injector and settings ready/,
    /sending activateProtection/,
    /activateProtection signal sent/,
    /Backpack couldn't override/,
    /ethereum/i,
    /wallet/i,
    /inpage\.js/,
    /injected\.js/,
    /evmAsk\.js/,
    /seedProtector\.js/,
    /addToWindow\.js/
  ];

  const shouldSuppress = (args) => {
    const message = args.join(' ');
    return suppressPatterns.some(pattern => pattern.test(message));
  };

  console.log = function(...args) {
    if (!shouldSuppress(args)) {
      originalLog.apply(console, args);
    }
  };

  console.warn = function(...args) {
    if (!shouldSuppress(args)) {
      originalWarn.apply(console, args);
    }
  };

  console.info = function(...args) {
    if (!shouldSuppress(args)) {
      originalInfo.apply(console, args);
    }
  };
};

