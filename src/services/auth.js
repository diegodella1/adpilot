const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const supabase = require('../db/supabase');

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRY = '24h';

async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: JWT_EXPIRY }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

async function createUser({ email, password, name, role = 'user' }) {
  const password_hash = await hashPassword(password);
  const { data, error } = await supabase
    .from('adpilot_users')
    .insert({ email, password_hash, name, role })
    .select('id, email, name, role, enabled, llm_monthly_limit_usd, created_at')
    .single();
  if (error) throw error;
  return data;
}

async function getUserById(id) {
  const { data, error } = await supabase
    .from('adpilot_users')
    .select('id, email, name, role, enabled, llm_monthly_limit_usd, created_at')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from('adpilot_users')
    .select('*')
    .eq('email', email)
    .single();
  if (error) return null;
  return data;
}

async function listUsers() {
  const { data, error } = await supabase
    .from('adpilot_users')
    .select('id, email, name, role, enabled, llm_monthly_limit_usd, created_at')
    .order('created_at');
  if (error) throw error;
  return data || [];
}

async function toggleUser(id, enabled) {
  const { error } = await supabase
    .from('adpilot_users')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function updateUser(id, updates) {
  const allowed = {};
  if (updates.name !== undefined) allowed.name = updates.name;
  if (updates.enabled !== undefined) allowed.enabled = updates.enabled;
  if (updates.llm_monthly_limit_usd !== undefined) allowed.llm_monthly_limit_usd = updates.llm_monthly_limit_usd;
  allowed.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('adpilot_users')
    .update(allowed)
    .eq('id', id);
  if (error) throw error;
}

async function changePassword(id, newPassword) {
  const password_hash = await hashPassword(newPassword);
  const { error } = await supabase
    .from('adpilot_users')
    .update({ password_hash, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

async function hasAnyUser() {
  const { data } = await supabase
    .from('adpilot_users')
    .select('id')
    .limit(1);
  return data && data.length > 0;
}

module.exports = {
  hashPassword, verifyPassword, generateToken, verifyToken,
  createUser, getUserById, getUserByEmail, listUsers,
  toggleUser, updateUser, changePassword, hasAnyUser,
};
