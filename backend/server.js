import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'crypto';
import { read, write } from './db.js';
import { treks, estimateBudget, runPlanner } from './planner.js';

const app = express();
app.use(cors());
app.use(express.json());

const SECRET = process.env.JWT_SECRET || 'dev-only-secret';
const hashPw = pw => { const s = randomBytes(16).toString('hex'); return `${s}:${scryptSync(pw, s, 32).toString('hex')}`; };
const checkPw = (pw, stored) => {
  const [salt, h] = stored.split(':');
  return timingSafeEqual(Buffer.from(h, 'hex'), scryptSync(pw, salt, 32));
};
const sign = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
const session = u => ({ token: sign(u), user: { id: u.id, name: u.name, email: u.email } });

function auth(req, res, next) {
  try { req.uid = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET).id; next(); }
  catch { res.status(401).json({ error: 'Please log in first' }); }
}

// ---- Auth
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and a password of 6+ characters are required' });
  const db = read();
  const mail = String(email).toLowerCase();
  if (db.users.some(u => u.email === mail)) return res.status(409).json({ error: 'That email is already registered' });
  const user = { id: randomUUID(), name, email: mail, password: hashPw(password) };
  db.users.push(user);
  write(db);
  res.status(201).json(session(user));
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = read().users.find(u => u.email === String(email || '').toLowerCase());
  if (!user || !checkPw(String(password || ''), user.password))
    return res.status(401).json({ error: 'Wrong email or password' });
  res.json(session(user));
});

// ---- Treks
app.get('/api/treks', (req, res) => {
  const { difficulty, maxDays, month } = req.query;
  const m = Number(month);
  res.json(treks.filter(t =>
    (!difficulty || t.difficulty === difficulty) &&
    (!maxDays || t.days <= Number(maxDays)) &&
    (!m || !t.avoidMonths.includes(m))
  ));
});

app.get('/api/treks/:id', (req, res) => {
  const t = treks.find(x => x.id === req.params.id);
  t ? res.json(t) : res.status(404).json({ error: 'Trek not found' });
});

// ---- Bookings
app.post('/api/bookings', auth, (req, res) => {
  const { trekId, startDate } = req.body || {};
  const travelers = Number(req.body?.travelers) || 1;
  const trek = treks.find(t => t.id === trekId);
  if (!trek) return res.status(404).json({ error: 'Trek not found' });
  if (travelers < 1 || travelers > 20) return res.status(400).json({ error: 'Travelers must be between 1 and 20' });
  const date = new Date(startDate);
  if (isNaN(date) || date < new Date(new Date().toDateString()))
    return res.status(400).json({ error: 'Choose a start date that is today or later' });
  const db = read();
  const booking = {
    id: randomUUID(), userId: req.uid, trekId, trekName: trek.name, travelers,
    startDate, total: estimateBudget({ trekId, travelers }).total, createdAt: new Date().toISOString()
  };
  db.bookings.push(booking);
  write(db);
  res.status(201).json(booking);
});

app.get('/api/bookings/mine', auth, (req, res) =>
  res.json(read().bookings.filter(b => b.userId === req.uid)));

app.delete('/api/bookings/:id', auth, (req, res) => {
  const db = read();
  const i = db.bookings.findIndex(b => b.id === req.params.id && b.userId === req.uid);
  if (i < 0) return res.status(404).json({ error: 'Booking not found' });
  db.bookings.splice(i, 1);
  write(db);
  res.json({ ok: true });
});

// ---- Planner
app.post('/api/plan', async (req, res) => res.json(await runPlanner(req.body)));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`TrekMate API on http://localhost:${port}`));
