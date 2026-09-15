import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { Resend } from 'resend';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@northstar.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin12345';
const EMAIL_FROM = process.env.EMAIL_FROM;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });

const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Add your Neon connection string to .env.');
if (!JWT_SECRET) throw new Error('JWT_SECRET is required. Add a long random value to .env.');

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS deposits (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), user_name TEXT NOT NULL,
      email TEXT NOT NULL, amount NUMERIC NOT NULL, asset TEXT NOT NULL, network TEXT NOT NULL,
      status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, confirmed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), amount NUMERIC NOT NULL,
      address TEXT NOT NULL, asset TEXT NOT NULL, network TEXT NOT NULL, status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS emails (
      id TEXT PRIMARY KEY, recipient TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL, delivered BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);
}

async function ensureAdmin() {
  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
  if (!existing.rowCount) await pool.query('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5, NOW())', [id(), 'Northstar Admin', ADMIN_EMAIL, await bcrypt.hash(ADMIN_PASSWORD, 12), 'admin']);
}
await initializeDatabase();
await ensureAdmin();

const app = express();
app.use(cors());
app.use(express.json());
const clientDist = path.join(__dirname, 'dist');
app.use(express.static(clientDist));

function tokenFor(user) { return jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '2h' }); }
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: user.role }; }
function auth(requiredRole) { return (req, res, next) => { try { const header = req.headers.authorization || ''; const payload = jwt.verify(header.replace('Bearer ', ''), JWT_SECRET); if (requiredRole && payload.role !== requiredRole) return res.status(403).json({ error: 'Admin access required.' }); req.auth = payload; next(); } catch { res.status(401).json({ error: 'Please sign in again.' }); } }; }
async function queueEmail(to, subject, text) {
  const emailId = id();
  await pool.query('INSERT INTO emails (id, recipient, subject, body, created_at) VALUES ($1, $2, $3, $4, NOW())', [emailId, to, subject, text]);
  if (!resend || !EMAIL_FROM) return;
  try {
    const { error } = await resend.emails.send({ from: EMAIL_FROM, to, subject, text });
    if (error) throw new Error(error.message);
    await pool.query('UPDATE emails SET delivered = TRUE WHERE id = $1', [emailId]);
  } catch (error) {
    console.error(`Email delivery failed for ${to}: ${error.message}`);
  }
}

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.post('/api/auth/register', async (req, res) => { const { name, email, password } = req.body; if (!name || !email || !password || password.length < 8) return res.status(400).json({ error: 'Name, email, and an 8-character password are required.' }); const normalized = email.trim().toLowerCase(); const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalized]); if (existing.rowCount) return res.status(409).json({ error: 'An account with that email already exists.' }); const user = { id: id(), name: name.trim(), email: normalized, passwordHash: await bcrypt.hash(password, 12), role: 'user' }; await pool.query('INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5, NOW())', [user.id, user.name, user.email, user.passwordHash, user.role]); await queueEmail(user.email, 'Welcome to Northstar', 'Your workspace is ready.'); res.status(201).json({ token: tokenFor(user), user: publicUser(user) }); });
app.post('/api/auth/login', async (req, res) => { const result = await pool.query('SELECT id, name, email, password_hash, role FROM users WHERE email = $1', [String(req.body.email || '').trim().toLowerCase()]); const user = result.rows[0]; if (!user || !(await bcrypt.compare(req.body.password || '', user.password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' }); res.json({ token: tokenFor(user), user: publicUser(user) }); });
app.get('/api/auth/me', auth(), async (req, res) => { const result = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.auth.id]); if (!result.rowCount) return res.status(401).json({ error: 'Please sign in again.' }); res.json(publicUser(result.rows[0])); });
app.post('/api/deposits', auth('user'), async (req, res) => { const amount = Number(req.body.amount); if (!Number.isFinite(amount) || amount < 10) return res.status(400).json({ error: 'Deposit must be at least $10.' }); const userResult = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [req.auth.id]); const user = userResult.rows[0]; const deposit = { id: id(), userId: user.id, userName: user.name, email: user.email, amount, asset: 'USDC', network: 'Ethereum', status: 'pending' }; await pool.query('INSERT INTO deposits (id, user_id, user_name, email, amount, asset, network, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())', [deposit.id, deposit.userId, deposit.userName, deposit.email, deposit.amount, deposit.asset, deposit.network, deposit.status]); await queueEmail(ADMIN_EMAIL, 'Deposit awaiting review', `${user.name} submitted a $${amount} USDC deposit.`); res.status(201).json({ deposit }); });
app.post('/api/withdrawals', auth('user'), async (req, res) => { const amount = Number(req.body.amount); const address = String(req.body.address || '').trim(); if (!Number.isFinite(amount) || amount < 10 || address.length < 12) return res.status(400).json({ error: 'Enter a valid amount and wallet address.' }); const userResult = await pool.query('SELECT id, name FROM users WHERE id = $1', [req.auth.id]); const user = userResult.rows[0]; const withdrawal = { id: id(), userId: user.id, amount, address, asset: 'USDC', network: 'Ethereum', status: 'pending' }; await pool.query('INSERT INTO withdrawals (id, user_id, amount, address, asset, network, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())', [withdrawal.id, withdrawal.userId, withdrawal.amount, withdrawal.address, withdrawal.asset, withdrawal.network, withdrawal.status]); await queueEmail(ADMIN_EMAIL, 'Withdrawal awaiting review', `${user.name} requested a $${amount} withdrawal.`); res.status(201).json({ withdrawal }); });
app.get('/api/admin/deposits', auth('admin'), async (req, res) => { const result = await pool.query('SELECT id, user_id AS "userId", user_name AS "userName", email, amount, asset, network, status, created_at AS "createdAt", confirmed_at AS "confirmedAt" FROM deposits ORDER BY created_at DESC'); res.json({ deposits: result.rows }); });
app.post('/api/admin/deposits/:depositId/confirm', auth('admin'), async (req, res) => { const result = await pool.query('SELECT id, user_id AS "userId", user_name AS "userName", email, amount, asset, network, status, created_at AS "createdAt", confirmed_at AS "confirmedAt" FROM deposits WHERE id = $1', [req.params.depositId]); const deposit = result.rows[0]; if (!deposit) return res.status(404).json({ error: 'Deposit not found.' }); if (deposit.status !== 'pending') return res.status(409).json({ error: 'Deposit was already reviewed.' }); deposit.status = 'confirmed'; deposit.confirmedAt = new Date().toISOString(); await pool.query('UPDATE deposits SET status = $1, confirmed_at = NOW() WHERE id = $2', [deposit.status, deposit.id]); await queueEmail(deposit.email, 'Deposit confirmed', `Your $${deposit.amount} USDC deposit has been confirmed and added to your wallet.`); res.json({ deposit }); });

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(clientDist, 'index.html'), (error) => error && next(error));
  }
  next();
});

app.listen(PORT, () => console.log(`Northstar API listening on http://localhost:${PORT}`));
