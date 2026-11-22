#!/usr/bin/env node
/**
 * ServicePro OS — Production Secret Key Generator
 * Generates cryptographically secure, high-entropy secrets for .env configuration
 */

const crypto = require('crypto');

function generateSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function generatePassword(length = 32) {
  // URL-safe high-entropy alphabet so POSTGRES_PASSWORD never breaks DATABASE_URL URI parsing (BUG-DEVOPS-001)
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
  let res = '';
  for (let i = 0; i < length; i++) {
    res += chars[crypto.randomInt(0, chars.length)];
  }
  return res;
}

console.log('--- ServicePro OS Production Secrets ---');
console.log('POSTGRES_PASSWORD=' + generatePassword(24));
console.log('JWT_SECRET=' + generateSecret(32));
console.log('JWT_REFRESH_SECRET=' + generateSecret(32));
console.log('BOOTSTRAP_TOKEN=' + generateSecret(24));
console.log('APP_ENCRYPTION_KEY=' + generateSecret(32));
console.log('----------------------------------------');
