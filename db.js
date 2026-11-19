const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'sunset2026.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for better concurrency
db.exec('PRAGMA journal_mode = WAL;');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    dni TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    course TEXT NOT NULL,
    division TEXT NOT NULL DEFAULT 'A',
    parent_phone TEXT NOT NULL,
    pickup_adult TEXT NOT NULL DEFAULT '',
    payment_method TEXT NOT NULL CHECK(payment_method IN ('efectivo', 'transferencia')),
    receipt_path TEXT,
    status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente', 'confirmado', 'rechazado')),
    qr_token TEXT UNIQUE,
    email_sent INTEGER NOT NULL DEFAULT 0,
    email_error TEXT,
    checked_in INTEGER NOT NULL DEFAULT 0,
    checked_in_at TEXT,
    checked_in_method TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

const defaultSettings = {
  event_name: 'SUNSET 2026 — Ntra. Sra. del Valle',
  school_name: 'Instituto Parroquia Nuestra Señora del Valle',
  province: 'Córdoba, Argentina',
  organizer: 'Promo 6° Año',
  event_date: '2026-11-27',
  event_time_start: '19:30',
  event_time_end: '23:00',
  venue_name: 'Predio / Salón del Instituto Parroquia Nuestra Señora del Valle',
  venue_address: 'Córdoba, Argentina',
  ticket_price: '12000',
  door_ticket_price: '15000',
  bank_alias: 'SUNSET2026.6',
  bank_alias_6to: 'SUNSET2026.6',
  bank_holder_6to: '',
  bank_cbu_6to: '',
  bank_name_6to: '',
  bank_alias_1ro: 'SUNSET2026.1',
  bank_holder_1ro: '',
  bank_cbu_1ro: '',
  bank_name_1ro: '',
  bank_alias_2do: 'SUNSET2026.2',
  bank_holder_2do: '',
  bank_cbu_2do: '',
  bank_name_2do: '',
  bank_cbu: '',
  bank_holder: '',
  bank_name: '',
  cash_instructions: 'Acercate en los recreos a los chicos de 6° Año o en Preceptoría para abonar en efectivo y que activen tu entrada QR.',
  divisions: 'A,B,C,Única',
  admin_password: 'sunset2026',
  smtp_user: '',
  smtp_pass: '',
  smtp_from_name: 'Sunset 2026 - Promo 6° Año'
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(defaultSettings)) {
  insertSetting.run(k, v);
}

// Safe migration for pickup_adult column & updated price/alias defaults
try {
  db.exec("ALTER TABLE registrations ADD COLUMN pickup_adult TEXT NOT NULL DEFAULT '';");
} catch (_e) {
  // Column already exists
}
db.prepare("UPDATE settings SET value = '12000' WHERE key = 'ticket_price' AND value = '8000'").run();
db.prepare("UPDATE settings SET value = 'SUNSET2026.6' WHERE key = 'bank_alias' AND value = 'SUNSET.VALLE.26'").run();

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = { ...defaultSettings };
  for (const row of rows) {
    result[row.key] = row.value;
  }
  return result;
}

function updateSettings(updates) {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== null) {
      upsert.run(key, String(value));
    }
  }
  return getSettings();
}

module.exports = {
  db,
  getSettings,
  updateSettings
};

