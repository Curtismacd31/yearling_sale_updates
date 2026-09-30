const bcrypt = require('bcryptjs');
const { ensureFile, readJSON, writeJSON } = require('./db');

/**
 * Runs once at server start. Creates default (empty) data files, and — only
 * if no users exist yet — seeds a single admin user from env vars so there's
 * a way to log in on a brand new install.
 */
function bootstrap() {
  ensureFile('roster', []);
  ensureFile('content', []);
  ensureFile('config', {
    saleCompany: '',
    saleCompanyKey: '',
    saleId: ''
  });

  const users = readJSON('users');
  if (!users || users.length === 0) {
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASS || 'changeme';
    const passwordHash = bcrypt.hashSync(password, 10);
    writeJSON('users', [{ id: 1, username, passwordHash }]);
    console.log(`[bootstrap] Created initial user "${username}". Change this password after logging in.`);
  }
}

module.exports = { bootstrap };
