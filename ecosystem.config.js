module.exports = {
  apps: [
    {
      name: 'telegram',
      script: 'src/telegram-index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        TELEGRAM_HEALTH_PORT: 3002,
      },
      error_file: 'logs/telegram-err.log',
      out_file: 'logs/telegram-out.log',
      time: true,
    },
  ],
};
