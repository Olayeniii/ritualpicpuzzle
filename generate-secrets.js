// Generate secrets for Vercel environment variables
import { hashSync } from 'bcryptjs';
import { randomBytes } from 'crypto';

console.log('='.repeat(60));
console.log('🔐 GENERATING SECRETS FOR VERCEL DEPLOYMENT');
console.log('='.repeat(60));
console.log();

// 1. Generate JWT Secret
const jwtSecret = randomBytes(64).toString('base64');
console.log('1️⃣  JWT_SECRET (copy this to Vercel):');
console.log('-'.repeat(60));
console.log(jwtSecret);
console.log();

// 2. Generate Password Hash
const password = process.argv[2] || 'change_this_password_123';
const passwordHash = hashSync(password, 10);

console.log('2️⃣  ADMIN_PASSWORD_HASH (copy this to Vercel):');
console.log('-'.repeat(60));
console.log(passwordHash);
console.log();

console.log('3️⃣  ADMIN_USERNAME (copy this to Vercel):');
console.log('-'.repeat(60));
console.log('admin');
console.log();

// 4. Summary
console.log('='.repeat(60));
console.log('📋 SUMMARY - Add these to Vercel Environment Variables:');
console.log('='.repeat(60));
console.log();
console.log('JWT_SECRET=');
console.log(jwtSecret);
console.log();
console.log('ADMIN_PASSWORD_HASH=');
console.log(passwordHash);
console.log();
console.log('ADMIN_USERNAME=admin');
console.log();
console.log('DATABASE_URL=<your_postgres_connection_string>');
console.log();

console.log('='.repeat(60));
console.log('⚠️  IMPORTANT NOTES:');
console.log('='.repeat(60));
console.log('1. The password used for this hash is:', password);
console.log('2. Change the password by running: node generate-secrets.js YOUR_PASSWORD');
console.log('3. Add all variables to Vercel: Settings → Environment Variables');
console.log('4. Redeploy after adding variables: vercel --prod');
console.log('='.repeat(60));

