#!/usr/bin/env node

import migrateDatabase from './api/migrate-database.js';

console.log('🚀 Setting up Ritual Puzzle database...');
console.log('📊 Running database migrations...');

try {
  await migrateDatabase();
  console.log('✅ Database migration completed!');
  
  console.log('🎮 Your Ritual Puzzle game is ready to go!');
  console.log('');
  console.log('🔐 IMPORTANT: Set up admin environment variables!');
  console.log('');
  console.log('In your .env file or hosting platform, add:');
  console.log('ADMIN_USERNAME=ritual-admin');
  console.log('ADMIN_KEY=your-strong-secret-key-here');
  console.log('');
  console.log('🎯 Admin Access:');
  console.log('- Long press logo for 3 seconds OR press Ctrl+Shift+A');
  console.log('- Enter your username and admin key');
  console.log('- No visible admin button = more secure!');
  console.log('');
  console.log('🆕 New features available:');
  console.log('- Weekly tournament mode (starts Wed 3pm UTC+1)');
  console.log('- 30-minute countdown before tournaments');
  console.log('- 5 tournament rounds with 15-minute breaks');
  console.log('- Automatic tournament mode switching');
  console.log('- Hidden admin panel for tournament management');
  console.log('- Enhanced timeout handling');
  console.log('- Weekly leaderboard resets');
  console.log('- Environment-based admin security');
  console.log('- All historical data is preserved');
  
} catch (error) {
  console.error('❌ Database setup failed:', error.message);
  process.exit(1);
}
