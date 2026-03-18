const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SENSITIVE_PATTERN = /key|secret|token/i;

function isSensitiveKey(key) {
  return SENSITIVE_PATTERN.test(key);
}

function getEncryptionKey() {
  const hex = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!hex) return null;
  return Buffer.from(hex, 'hex');
}

function encrypt(value, key) {
  if (!key || !value) return value;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(value, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(ciphertext, key) {
  if (!key || !ciphertext) return ciphertext;
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return ciphertext; // not encrypted, return as-is
  try {
    const [ivB64, authTagB64, encB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const encrypted = Buffer.from(encB64, 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return ciphertext; // decryption failed, assume plaintext
  }
}

function encryptIfSensitive(key, value) {
  const encKey = getEncryptionKey();
  if (!encKey || !isSensitiveKey(key)) return value;
  return encrypt(value, encKey);
}

function decryptIfSensitive(key, value) {
  const encKey = getEncryptionKey();
  if (!encKey || !isSensitiveKey(key)) return value;
  return decrypt(value, encKey);
}

module.exports = { encryptIfSensitive, decryptIfSensitive, isSensitiveKey };
