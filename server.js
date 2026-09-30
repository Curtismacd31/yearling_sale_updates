require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const { bootstrap } = require('./src/bootstrap');
const { requireAuth } = require('./src/middleware/requireAuth');

const authRoutes = require('./src/routes/auth');
const rosterRoutes = require('./src/routes/roster');
const updatesRoutes = require('./src/routes/updates');
const saledayRoutes = require('./src/routes/saleday');
const submitRoutes = require('./src/routes/submit');
const resultsRoutes = require('./src/routes/results');

bootstrap();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000, // 8 hour session — plenty for a sale day
    sameSite: 'lax'
    // secure: true  — enable once this is served over HTTPS (recommended in production)
  }
}));

// Auth endpoints (login itself must stay outside requireAuth)
app.use('/api/auth', authRoutes);

// Public, unauthenticated JSON results feed (for overlays/websites/etc.)
app.use('/api/public/results', resultsRoutes);

// Everything else under /api requires a logged-in session
app.use('/api/roster', requireAuth, rosterRoutes);
app.use('/api/updates', requireAuth, updatesRoutes);
app.use('/api/saleday', requireAuth, saledayRoutes);
app.use('/api/submit', requireAuth, submitRoutes);

// Static frontend — login page is public, everything else needs a session
app.use('/login.html', express.static(path.join(__dirname, 'public', 'login.html')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Hip sale app running on http://localhost:${PORT}`);
});
