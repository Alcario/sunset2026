require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const { db, getSettings, updateSettings } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for transfer receipts
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const safeName = `comprobante_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|pdf|heic/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype.toLowerCase());
    if (extOk || mimeOk) {
      return cb(null, true);
    }
    cb(new Error('Formato no válido. Subí una imagen (JPG, PNG, WEBP) o PDF.'));
  }
});

// Simple token auth helper for Admin & Scanner
const activeSessions = new Set();

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const settings = getSettings();

  if (token && (activeSessions.has(token) || token === settings.admin_password)) {
    return next();
  }
  return res.status(401).json({ error: 'No autorizado. Iniciá sesión como organizador.' });
}

// Helper: Format timestamp in Argentina timezone
function getArgentinaTimestamp() {
  return new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Cordoba',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// Helper: Generate QR Data URL
async function generateQrDataUrl(qrToken) {
  return QRCode.toDataURL(qrToken, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 420,
    color: {
      dark: '#140923',
      light: '#FFFFFF'
    }
  });
}

// Helper: Send Confirmation Email with QR Code
async function sendTicketEmail(registration, settings) {
  const smtpUser = settings.smtp_user || process.env.SMTP_USER || '';
  const smtpPass = settings.smtp_pass || process.env.SMTP_PASS || '';

  if (!smtpUser || !smtpPass) {
    return {
      sent: false,
      reason: 'Credenciales de correo Gmail (SMTP) aún no configuradas en la pestaña Configuración. La entrada QR fue generada y podés descargarla o enviarla por WhatsApp.'
    };
  }

  const qrDataUrl = await generateQrDataUrl(registration.qr_token);
  const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const htmlContent = `
  <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; max-width: 560px; margin: 0 auto; background: linear-gradient(145deg, #160926 0%, #2b103b 60%, #4d193d 100%); color: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,158,68,0.35);">
    <div style="background: linear-gradient(90deg, #ff5e62, #ff9966); padding: 24px 20px; text-align: center;">
      <p style="margin: 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; font-weight: 700; color: #220b34;">${settings.school_name}</p>
      <h1 style="margin: 6px 0 4px; font-size: 30px; font-weight: 900; color: #140821;">🌅 SUNSET 2026</h1>
      <p style="margin: 0; font-size: 14px; font-weight: 600; color: #2b103b;">Organiza ${settings.organizer} • Córdoba, Argentina</p>
    </div>

    <div style="padding: 28px 24px; text-align: center;">
      <p style="font-size: 18px; margin: 0 0 8px;">¡Hola <strong>${registration.first_name} ${registration.last_name}</strong>! 🎉</p>
      <p style="font-size: 14px; color: #e2d4f0; line-height: 1.5; margin: 0 0 22px;">
        Tu inscripción para el <strong>Sunset 2026</strong> ya está <strong>CONFIRMADA</strong>. Presentá este código QR en la entrada el día del evento.
      </p>

      <div style="background: #ffffff; padding: 18px; border-radius: 16px; display: inline-block; box-shadow: 0 10px 25px rgba(0,0,0,0.4);">
        <img src="cid:sunsetqr" alt="Código QR de Entrada" style="width: 240px; height: 240px; display: block;" />
        <p style="margin: 10px 0 0; font-family: monospace; font-size: 13px; color: #333; font-weight: bold;">CÓDIGO: ${registration.qr_token}</p>
      </div>

      <div style="margin-top: 24px; background: rgba(255,255,255,0.08); border-radius: 14px; padding: 16px; text-align: left; font-size: 14px; line-height: 1.7;">
        <div>👤 <strong>Alumno/a:</strong> ${registration.first_name} ${registration.last_name}</div>
        <div>🪪 <strong>DNI:</strong> ${registration.dni}</div>
        <div>🎓 <strong>Curso:</strong> ${registration.course} "${registration.division}"</div>
        <div>📅 <strong>Fecha:</strong> Viernes 27 de Noviembre de 2026</div>
        <div>🕢 <strong>Horario:</strong> ${settings.event_time_start} a ${settings.event_time_end} hs</div>
        <div>📍 <strong>Lugar:</strong> ${settings.venue_name}</div>
      </div>

      <p style="margin-top: 20px; font-size: 12px; color: #ffb38a; background: rgba(255, 94, 98, 0.15); padding: 10px 14px; border-radius: 10px;">
        ⚠️ <strong>Importante:</strong> Este código QR es personal e intransferible y <strong>solo puede escanearse 1 (una) sola vez</strong> en la puerta. También recordá tu número de DNI por cualquier eventualidad.
      </p>
    </div>
  </div>
  `;

  await transporter.sendMail({
    from: `"${settings.smtp_from_name || 'Sunset 2026'}" <${smtpUser}>`,
    to: registration.email,
    subject: `🎟️ Tu Entrada QR para el SUNSET 2026 - ${registration.first_name} ${registration.last_name}`,
    html: htmlContent,
    attachments: [
      {
        filename: `Entrada_Sunset_${registration.dni}.png`,
        content: Buffer.from(base64Data, 'base64'),
        cid: 'sunsetqr'
      }
    ]
  });

  return { sent: true };
}

// ============================================================================
// PUBLIC ROUTES
// ============================================================================

app.get('/api/public-config', (_req, res) => {
  const s = getSettings();
  res.json({
    event_name: s.event_name,
    school_name: s.school_name,
    province: s.province,
    organizer: s.organizer,
    event_date: s.event_date,
    event_time_start: s.event_time_start,
    event_time_end: s.event_time_end,
    venue_name: s.venue_name,
    venue_address: s.venue_address,
    ticket_price: s.ticket_price,
    bank_alias: s.bank_alias,
    bank_cbu: s.bank_cbu,
    bank_holder: s.bank_holder,
    bank_name: s.bank_name,
    cash_instructions: s.cash_instructions,
    divisions: (s.divisions || 'A,B,C,Única').split(',').map((d) => d.trim()).filter(Boolean)
  });
});

// Register a student
app.post('/api/register', (req, res) => {
  upload.single('receipt')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Error al subir el comprobante.' });
    }

    try {
      const {
        first_name = '',
        last_name = '',
        dni = '',
        email = '',
        course = '',
        division = 'Única',
        parent_phone = '',
        payment_method = ''
      } = req.body;

      const cleanFirstName = first_name.trim();
      const cleanLastName = last_name.trim();
      const cleanDni = String(dni).replace(/\D/g, '').trim();
      const cleanEmail = email.trim().toLowerCase();
      const cleanCourse = course.trim();
      const cleanDivision = division.trim() || 'Única';
      const cleanParentPhone = parent_phone.trim();
      const cleanPaymentMethod = payment_method.trim().toLowerCase();

      if (!cleanFirstName || !cleanLastName || !cleanDni || !cleanEmail || !cleanCourse || !cleanParentPhone || !cleanPaymentMethod) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Por favor completá todos los campos obligatorios.' });
      }

      if (cleanDni.length < 7 || cleanDni.length > 9) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Ingresá un número de DNI válido (7 a 9 dígitos sin puntos).' });
      }

      const validCourses = ['6° Grado', '1° Año', '2° Año'];
      if (!validCourses.includes(cleanCourse)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Seleccioná un curso válido (6° Grado, 1° Año o 2° Año).' });
      }

      if (!['efectivo', 'transferencia'].includes(cleanPaymentMethod)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Seleccioná una forma de pago válida (Efectivo o Transferencia).' });
      }

      if (cleanPaymentMethod === 'transferencia' && !req.file) {
        return res.status(400).json({
          error: 'Para pagos por transferencia es obligatorio adjuntar el comprobante de pago.'
        });
      }

      // Check duplicate DNI
      const existing = db.prepare('SELECT id, first_name, last_name, status FROM registrations WHERE dni = ?').get(cleanDni);
      if (existing) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(409).json({
          error: `Ya existe una inscripción registrada con el DNI ${cleanDni} (${existing.first_name} ${existing.last_name}).`
        });
      }

      const receiptPath = req.file ? `/uploads/${req.file.filename}` : null;
      const createdAt = getArgentinaTimestamp();

      const insert = db.prepare(`
        INSERT INTO registrations (
          first_name, last_name, dni, email, course, division,
          parent_phone, payment_method, receipt_path, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)
      `);

      const result = insert.run(
        cleanFirstName,
        cleanLastName,
        cleanDni,
        cleanEmail,
        cleanCourse,
        cleanDivision,
        cleanParentPhone,
        cleanPaymentMethod,
        receiptPath,
        createdAt
      );

      res.status(201).json({
        success: true,
        registration_id: result.lastInsertRowid,
        payment_method: cleanPaymentMethod,
        message:
          cleanPaymentMethod === 'efectivo'
            ? '¡Inscripción registrada! Cuando abones en efectivo a los organizadores de 6° Año, confirmaremos tu pago y te llegará la entrada QR a tu correo.'
            : '¡Inscripción y comprobante recibidos! En cuanto los chicos de 6° Año verifiquen la transferencia, te llegará tu entrada con código QR al correo electrónico.'
      });
    } catch (e) {
      console.error('Error en /api/register:', e);
      res.status(500).json({ error: 'Error interno al procesar la inscripción.' });
    }
  });
});

// Public Digital Ticket View by QR Token (for sharing via link / WhatsApp)
app.get('/api/tickets/:token', async (req, res) => {
  const row = db.prepare('SELECT * FROM registrations WHERE qr_token = ?').get(req.params.token);
  if (!row || row.status !== 'confirmado') {
    return res.status(404).json({ error: 'Entrada no encontrada o aún no confirmada.' });
  }
  const qrDataUrl = await generateQrDataUrl(row.qr_token);
  const s = getSettings();
  res.json({
    first_name: row.first_name,
    last_name: row.last_name,
    dni: row.dni,
    course: row.course,
    division: row.division,
    qr_token: row.qr_token,
    qr_data_url: qrDataUrl,
    checked_in: Boolean(row.checked_in),
    checked_in_at: row.checked_in_at,
    event: {
      event_name: s.event_name,
      school_name: s.school_name,
      event_date: s.event_date,
      event_time_start: s.event_time_start,
      event_time_end: s.event_time_end,
      venue_name: s.venue_name
    }
  });
});

// ============================================================================
// AUTHENTICATION & ADMIN ROUTES
// ============================================================================

app.post('/api/auth/login', (req, res) => {
  const { password = '' } = req.body;
  const settings = getSettings();
  if (password === settings.admin_password) {
    const sessionToken = crypto.randomBytes(24).toString('hex');
    activeSessions.add(sessionToken);
    return res.json({ success: true, token: sessionToken });
  }
  return res.status(401).json({ error: 'Contraseña incorrecta.' });
});

app.get('/api/admin/registrations', requireAuth, (_req, res) => {
  const rows = db.prepare('SELECT * FROM registrations ORDER BY id DESC').all();
  const s = getSettings();
  const price = Number(s.ticket_price) || 0;

  const stats = {
    total: rows.length,
    confirmed: rows.filter((r) => r.status === 'confirmado').length,
    pending: rows.filter((r) => r.status === 'pendiente').length,
    checked_in: rows.filter((r) => r.checked_in === 1).length,
    cash_count: rows.filter((r) => r.payment_method === 'efectivo').length,
    transfer_count: rows.filter((r) => r.payment_method === 'transferencia').length,
    confirmed_revenue: rows.filter((r) => r.status === 'confirmado').length * price
  };

  res.json({ registrations: rows, stats });
});

// Confirm payment -> Generate unique single-use QR -> Send Email
app.post('/api/admin/registrations/:id/confirm', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
    if (!reg) {
      return res.status(404).json({ error: 'Inscripción no encontrada.' });
    }

    const qrToken = reg.qr_token || `SUNSET26-${reg.dni}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    db.prepare(`
      UPDATE registrations
      SET status = 'confirmado', qr_token = ?
      WHERE id = ?
    `).run(qrToken, id);

    const updatedReg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
    const settings = getSettings();
    const qrDataUrl = await generateQrDataUrl(qrToken);

    let emailResult = { sent: false, reason: '' };
    try {
      emailResult = await sendTicketEmail(updatedReg, settings);
      if (emailResult.sent) {
        db.prepare('UPDATE registrations SET email_sent = 1, email_error = NULL WHERE id = ?').run(id);
      } else {
        db.prepare('UPDATE registrations SET email_error = ? WHERE id = ?').run(emailResult.reason, id);
      }
    } catch (mailErr) {
      console.error('Error enviando email:', mailErr);
      emailResult = { sent: false, reason: `Error SMTP: ${mailErr.message}` };
      db.prepare('UPDATE registrations SET email_error = ? WHERE id = ?').run(emailResult.reason, id);
    }

    const finalReg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);

    res.json({
      success: true,
      registration: finalReg,
      qr_data_url: qrDataUrl,
      email_sent: emailResult.sent,
      email_message: emailResult.sent
        ? `Entrada QR enviada con éxito a ${finalReg.email}`
        : emailResult.reason
    });
  } catch (e) {
    console.error('Error confirmando inscripción:', e);
    res.status(500).json({ error: 'No se pudo confirmar la inscripción.' });
  }
});

// Get QR Data URL for an already confirmed student
app.get('/api/admin/registrations/:id/qr', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if (!reg || !reg.qr_token) {
    return res.status(404).json({ error: 'El alumno aún no tiene un QR generado. Confirmá primero su pago.' });
  }
  const qrDataUrl = await generateQrDataUrl(reg.qr_token);
  res.json({
    registration: reg,
    qr_data_url: qrDataUrl
  });
});

// Resend QR Email
app.post('/api/admin/registrations/:id/resend-email', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
    if (!reg || !reg.qr_token) {
      return res.status(400).json({ error: 'La inscripción debe estar confirmada primero.' });
    }
    const settings = getSettings();
    const emailResult = await sendTicketEmail(reg, settings);
    if (emailResult.sent) {
      db.prepare('UPDATE registrations SET email_sent = 1, email_error = NULL WHERE id = ?').run(id);
      return res.json({ success: true, message: `Correo reenviado exitosamente a ${reg.email}` });
    }
    return res.status(400).json({ error: emailResult.reason });
  } catch (err) {
    return res.status(500).json({ error: `No se pudo enviar el correo: ${err.message}` });
  }
});

// Delete a registration
app.delete('/api/admin/registrations/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(id);
  if (!reg) {
    return res.status(404).json({ error: 'Inscripción no encontrada.' });
  }
  if (reg.receipt_path) {
    const fullPath = path.join(__dirname, reg.receipt_path);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (_e) {}
    }
  }
  db.prepare('DELETE FROM registrations WHERE id = ?').run(id);
  res.json({ success: true });
});

// Admin settings get & update
app.get('/api/admin/settings', requireAuth, (_req, res) => {
  res.json(getSettings());
});

app.put('/api/admin/settings', requireAuth, (req, res) => {
  const updated = updateSettings(req.body || {});
  res.json({ success: true, settings: updated });
});

// ============================================================================
// DOOR CHECK-IN ROUTES (QR SCANNER + MANUAL DNI FALLBACK)
// ============================================================================

// 1. Scan QR Code (Single-use strictly enforced)
app.post('/api/checkin/scan', requireAuth, (req, res) => {
  const rawCode = String(req.body.qr_token || '').trim();
  if (!rawCode) {
    return res.status(400).json({
      result: 'INVALID_QR',
      message: 'Código QR vacío o ilegible.'
    });
  }

  // Extract token if a URL was encoded or direct token
  const tokenMatch = rawCode.match(/SUNSET26-[A-Z0-9-]+/i);
  const qrToken = tokenMatch ? tokenMatch[0].toUpperCase() : rawCode;

  const reg = db.prepare('SELECT * FROM registrations WHERE qr_token = ?').get(qrToken);

  if (!reg) {
    return res.status(404).json({
      result: 'NOT_FOUND',
      message: 'Código QR no válido o no pertenece al Sunset 2026.'
    });
  }

  if (reg.status !== 'confirmado') {
    return res.status(403).json({
      result: 'UNCONFIRMED',
      message: `El alumno ${reg.first_name} ${reg.last_name} figura con pago PENDIENTE.`,
      student: reg
    });
  }

  if (reg.checked_in === 1) {
    return res.status(409).json({
      result: 'ALREADY_USED',
      message: `¡ALERTA! Esta entrada YA FUE UTILIZADA a las ${reg.checked_in_at} (${reg.checked_in_method === 'manual_dni' ? 'Ingreso manual por DNI' : 'Escaneo QR'}).`,
      student: reg
    });
  }

  const now = getArgentinaTimestamp();
  db.prepare(`
    UPDATE registrations
    SET checked_in = 1, checked_in_at = ?, checked_in_method = 'qr'
    WHERE id = ? AND checked_in = 0
  `).run(now, reg.id);

  const updated = db.prepare('SELECT * FROM registrations WHERE id = ?').get(reg.id);

  return res.json({
    result: 'ACCESS_GRANTED',
    message: `¡INGRESO PERMITIDO! Bienvenido/a ${updated.first_name} ${updated.last_name}.`,
    student: updated
  });
});

// 2. Search Student by DNI or Last Name (for Manual Fallback)
app.get('/api/checkin/search', requireAuth, (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    const recent = db.prepare(`
      SELECT * FROM registrations
      WHERE status = 'confirmado'
      ORDER BY last_name ASC, first_name ASC
      LIMIT 30
    `).all();
    return res.json({ results: recent });
  }

  const likeQuery = `%${q}%`;
  const rows = db.prepare(`
    SELECT * FROM registrations
    WHERE dni LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR (first_name || ' ' || last_name) LIKE ?
    ORDER BY
      CASE WHEN dni = ? THEN 0 ELSE 1 END,
      last_name ASC
    LIMIT 25
  `).all(likeQuery, likeQuery, likeQuery, likeQuery, q);

  res.json({ results: rows });
});

// 3. Manual Check-in by Student ID / DNI (Single-use strictly enforced)
app.post('/api/checkin/manual', requireAuth, (req, res) => {
  const { id, dni } = req.body;
  let reg = null;

  if (id) {
    reg = db.prepare('SELECT * FROM registrations WHERE id = ?').get(Number(id));
  } else if (dni) {
    const cleanDni = String(dni).replace(/\D/g, '').trim();
    reg = db.prepare('SELECT * FROM registrations WHERE dni = ?').get(cleanDni);
  }

  if (!reg) {
    return res.status(404).json({
      result: 'NOT_FOUND',
      message: 'No se encontró ningún alumno con ese DNI.'
    });
  }

  if (reg.status !== 'confirmado') {
    return res.status(403).json({
      result: 'UNCONFIRMED',
      message: `El alumno ${reg.first_name} ${reg.last_name} (DNI ${reg.dni}) aún tiene el pago PENDIENTE de confirmación.`,
      student: reg
    });
  }

  if (reg.checked_in === 1) {
    return res.status(409).json({
      result: 'ALREADY_USED',
      message: `¡ATENCIÓN! ${reg.first_name} ${reg.last_name} (DNI ${reg.dni}) YA INGRESÓ al evento el ${reg.checked_in_at}. No puede volver a ingresar con la misma entrada.`,
      student: reg
    });
  }

  const now = getArgentinaTimestamp();
  db.prepare(`
    UPDATE registrations
    SET checked_in = 1, checked_in_at = ?, checked_in_method = 'manual_dni'
    WHERE id = ? AND checked_in = 0
  `).run(now, reg.id);

  const updated = db.prepare('SELECT * FROM registrations WHERE id = ?').get(reg.id);

  return res.json({
    result: 'ACCESS_GRANTED',
    message: `¡INGRESO MANUAL REGISTRADO! ${updated.first_name} ${updated.last_name} (DNI ${updated.dni}) habilitado/a para pasar.`,
    student: updated
  });
});

// 4. Door Live Stats & Recent Check-ins
app.get('/api/checkin/stats', requireAuth, (_req, res) => {
  const confirmedCount = db.prepare("SELECT COUNT(*) as c FROM registrations WHERE status = 'confirmado'").get().c;
  const checkedInCount = db.prepare('SELECT COUNT(*) as c FROM registrations WHERE checked_in = 1').get().c;
  const recentCheckins = db.prepare(`
    SELECT id, first_name, last_name, dni, course, division, checked_in_at, checked_in_method
    FROM registrations
    WHERE checked_in = 1
    ORDER BY checked_in_at DESC, id DESC
    LIMIT 15
  `).all();

  res.json({
    confirmed: confirmedCount,
    checked_in: checkedInCount,
    remaining: Math.max(0, confirmedCount - checkedInCount),
    recent: recentCheckins
  });
});

app.listen(PORT, () => {
  console.log(`🌅 Servidor SUNSET 2026 corriendo en http://localhost:${PORT}`);
});

