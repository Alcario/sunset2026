document.addEventListener('DOMContentLoaded', () => {
  let authToken = localStorage.getItem('sunset_admin_token') || '';
  let allRegistrations = [];
  let currentQrStudent = null;

  const loginSection = document.getElementById('loginSection');
  const adminDashboard = document.getElementById('adminDashboard');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');

  const tableBody = document.getElementById('registrationsTableBody');
  const searchInput = document.getElementById('searchInput');
  const filterCourse = document.getElementById('filterCourse');
  const filterStatus = document.getElementById('filterStatus');
  const filterPayment = document.getElementById('filterPayment');

  // Tabs
  const tabBtnRegistrations = document.getElementById('tabBtnRegistrations');
  const tabBtnSettings = document.getElementById('tabBtnSettings');
  const viewRegistrations = document.getElementById('viewRegistrations');
  const viewSettings = document.getElementById('viewSettings');

  // Modals
  const receiptModal = document.getElementById('receiptModal');
  const qrModal = document.getElementById('qrModal');

  function formatARS(val) {
    return '$' + (Number(val) || 0).toLocaleString('es-AR');
  }

  async function apiFetch(url, options = {}) {
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${authToken}`
    };
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      logout();
      throw new Error('Sesión expirada');
    }
    return res;
  }

  function showDashboard() {
    loginSection.style.display = 'none';
    adminDashboard.style.display = 'block';
    logoutBtn.style.display = 'inline-flex';
    loadRegistrations();
    loadSettings();
  }

  function logout() {
    authToken = '';
    localStorage.removeItem('sunset_admin_token');
    loginSection.style.display = 'block';
    adminDashboard.style.display = 'none';
    logoutBtn.style.display = 'none';
  }

  logoutBtn.addEventListener('click', logout);

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    const password = document.getElementById('adminPassword').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) {
        loginError.textContent = data.error || 'Contraseña incorrecta.';
        loginError.style.display = 'block';
        return;
      }
      authToken = data.token;
      localStorage.setItem('sunset_admin_token', authToken);
      showDashboard();
    } catch (_err) {
      loginError.textContent = 'Error de conexión con el servidor.';
      loginError.style.display = 'block';
    }
  });

  // Switch tabs
  tabBtnRegistrations.addEventListener('click', () => {
    tabBtnRegistrations.className = 'btn btn-primary btn-sm';
    tabBtnSettings.className = 'btn btn-secondary btn-sm';
    viewRegistrations.style.display = 'block';
    viewSettings.style.display = 'none';
  });

  tabBtnSettings.addEventListener('click', () => {
    tabBtnSettings.className = 'btn btn-primary btn-sm';
    tabBtnRegistrations.className = 'btn btn-secondary btn-sm';
    viewSettings.style.display = 'block';
    viewRegistrations.style.display = 'none';
  });

  // Load registrations & stats
  async function loadRegistrations() {
    try {
      const res = await apiFetch('/api/admin/registrations');
      const data = await res.json();
      allRegistrations = data.registrations || [];

      document.getElementById('statTotal').textContent = data.stats.total;
      document.getElementById('statPending').textContent = data.stats.pending;
      document.getElementById('statConfirmed').textContent = data.stats.confirmed;
      document.getElementById('statCheckedIn').textContent = data.stats.checked_in;
      document.getElementById('statRevenue').textContent = formatARS(data.stats.confirmed_revenue);

      renderTable();
    } catch (e) {
      console.error(e);
    }
  }

  function renderTable() {
    const q = searchInput.value.trim().toLowerCase();
    const courseVal = filterCourse.value;
    const statusVal = filterStatus.value;
    const paymentVal = filterPayment.value;

    const filtered = allRegistrations.filter((r) => {
      if (courseVal && r.course !== courseVal) return false;
      if (statusVal && r.status !== statusVal) return false;
      if (paymentVal && r.payment_method !== paymentVal) return false;
      if (q) {
        const hay = `${r.first_name} ${r.last_name} ${r.dni} ${r.email} ${r.parent_phone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 28px; color: var(--text-muted);">No se encontraron inscriptos con esos filtros.</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered
      .map((r) => {
        const isConfirmed = r.status === 'confirmado';
        const paymentBadge =
          r.payment_method === 'efectivo'
            ? `<span class="badge" style="background:rgba(255,255,255,0.1);">💵 Efectivo</span>`
            : `<span class="badge" style="background:rgba(157,78,221,0.28); color:#e9d5ff; border:1px solid rgba(157,78,221,0.5);">📲 Transferencia</span>`;

        const receiptBtn = r.receipt_path
          ? `<div style="margin-top:6px;"><button type="button" class="btn btn-secondary btn-sm" style="padding:4px 10px; font-size:0.76rem;" onclick="window.viewReceipt('${r.receipt_path}', '${r.first_name} ${r.last_name}')">📄 Ver Comprobante</button></div>`
          : '';

        const statusBadge = isConfirmed
          ? `<span class="badge badge-confirmed">✅ Confirmado</span>`
          : `<span class="badge badge-pending">⏳ Pendiente</span>`;

        const emailStatusText = isConfirmed
          ? r.email_sent
            ? `<div style="font-size:0.75rem; color:#6ee7b7; margin-top:4px;">📧 QR enviado al mail</div>`
            : `<div style="font-size:0.75rem; color:#fcd34d; margin-top:4px;" title="${r.email_error || ''}">⚠️ QR listo (enviar/descargar)</div>`
          : '';

        const checkInInfo = r.checked_in
          ? `<div style="margin-top:5px;"><span class="badge badge-checkedin">🎉 Ingresó ${r.checked_in_at}</span></div>`
          : '';

        const cleanPhone = String(r.parent_phone).replace(/\D/g, '');

        return `
          <tr>
            <td>
              <div style="font-weight: 800; color: #fff;">${r.first_name} ${r.last_name}</div>
              <div style="font-size: 0.76rem; color: var(--text-muted);">Reg: ${r.created_at}</div>
            </td>
            <td style="font-family: monospace; font-weight: 700; font-size: 0.96rem;">${r.dni}</td>
            <td><strong>${r.course}</strong> "${r.division}"</td>
            <td>
              <div style="font-size: 0.86rem;">✉️ ${r.email}</div>
              <div style="font-size: 0.84rem; color: var(--sunset-gold); margin-top: 3px;">
                📞 Padres: <a href="https://wa.me/549${cleanPhone}" target="_blank" style="color: var(--sunset-gold); text-decoration: underline;">${r.parent_phone}</a>
              </div>
            </td>
            <td>
              ${paymentBadge}
              ${receiptBtn}
            </td>
            <td>
              ${statusBadge}
              ${emailStatusText}
              ${checkInInfo}
            </td>
            <td>
              <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                ${
                  !isConfirmed
                    ? `<button type="button" class="btn btn-success btn-sm" onclick="window.confirmStudent(${r.id})">✅ Confirmar y Enviar QR</button>`
                    : `<button type="button" class="btn btn-primary btn-sm" onclick="window.openQrModal(${r.id})">🎟️ Ver / Enviar QR</button>`
                }
                <button type="button" class="btn btn-danger btn-sm" title="Eliminar inscripción" onclick="window.deleteStudent(${r.id}, '${r.first_name} ${r.last_name}')">🗑️</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  [searchInput, filterCourse, filterStatus, filterPayment].forEach((el) => {
    el.addEventListener('input', renderTable);
    el.addEventListener('change', renderTable);
  });

  document.getElementById('refreshBtn').addEventListener('click', loadRegistrations);

  // View receipt modal
  window.viewReceipt = (path, studentName) => {
    document.getElementById('receiptModalTitle').textContent = `Comprobante — ${studentName}`;
    const container = document.getElementById('receiptModalContent');
    document.getElementById('receiptDownloadLink').href = path;

    if (path.toLowerCase().endsWith('.pdf')) {
      container.innerHTML = `<iframe src="${path}" style="width:100%; height:400px; border-radius:12px; border:none;"></iframe>`;
    } else {
      container.innerHTML = `<img src="${path}" alt="Comprobante" style="max-width:100%; max-height:420px; border-radius:12px;" />`;
    }
    receiptModal.classList.add('open');
  };

  document.getElementById('closeReceiptModal').addEventListener('click', () => {
    receiptModal.classList.remove('open');
  });

  // Confirm student & send QR
  window.confirmStudent = async (id) => {
    try {
      const res = await apiFetch(`/api/admin/registrations/${id}/confirm`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Error al confirmar');
        return;
      }
      await loadRegistrations();
      displayQrModal(data.registration, data.qr_data_url, data.email_message);
    } catch (e) {
      alert('Error de conexión al confirmar el pago.');
    }
  };

  // Open QR Modal for already confirmed student
  window.openQrModal = async (id) => {
    try {
      const res = await apiFetch(`/api/admin/registrations/${id}/qr`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'No se pudo cargar el QR.');
        return;
      }
      const msg = data.registration.email_sent
        ? `✅ Entrada enviada al correo ${data.registration.email}`
        : `ℹ️ Entrada lista para descargar o compartir (${data.registration.email})`;
      displayQrModal(data.registration, data.qr_data_url, msg);
    } catch (e) {
      alert('Error obteniendo el código QR.');
    }
  };

  function displayQrModal(reg, qrDataUrl, statusMessage) {
    currentQrStudent = reg;
    document.getElementById('qrModalEmailStatus').textContent = statusMessage;
    document.getElementById('qrStudentName').textContent = `${reg.first_name} ${reg.last_name}`;
    document.getElementById('qrStudentMeta').textContent = `DNI ${reg.dni} • ${reg.course} "${reg.division}"`;
    document.getElementById('qrImage').src = qrDataUrl;
    document.getElementById('qrCodeText').textContent = reg.qr_token;

    const downloadBtn = document.getElementById('downloadQrBtn');
    downloadBtn.href = qrDataUrl;
    downloadBtn.download = `Entrada_Sunset_${reg.dni}_${reg.last_name}.png`;

    const ticketUrl = `${window.location.origin}/ticket.html?token=${encodeURIComponent(reg.qr_token)}`;
    const cleanPhone = String(reg.parent_phone).replace(/\D/g, '');
    const waText = `¡Hola! 🌅 Ya está CONFIRMADA la inscripción de *${reg.first_name} ${reg.last_name}* (DNI ${reg.dni}) para el *SUNSET 2026 del Instituto Parroquia Ntra. Sra. del Valle* (Viernes 27 de Noviembre de 19:30 a 23:00 hs).\n\n🎟️ Podés ver y descargar su Entrada con Código QR de uso único acá:\n${ticketUrl}`;

    document.getElementById('whatsappShareBtn').href = `https://wa.me/549${cleanPhone}?text=${encodeURIComponent(waText)}`;
    qrModal.classList.add('open');
  }

  document.getElementById('closeQrModal').addEventListener('click', () => {
    qrModal.classList.remove('open');
  });

  document.getElementById('resendEmailBtn').addEventListener('click', async () => {
    if (!currentQrStudent) return;
    const btn = document.getElementById('resendEmailBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Enviando...';
    try {
      const res = await apiFetch(`/api/admin/registrations/${currentQrStudent.id}/resend-email`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        document.getElementById('qrModalEmailStatus').textContent = `✅ ${data.message}`;
        loadRegistrations();
      } else {
        alert(data.error || 'No se pudo enviar el correo.');
      }
    } catch (_e) {
      alert('Error al intentar reenviar el correo.');
    } finally {
      btn.disabled = false;
      btn.textContent = '📧 Reenviar al Email';
    }
  });

  window.deleteStudent = async (id, fullName) => {
    if (!confirm(`¿Seguro que querés eliminar la inscripción de ${fullName}?`)) return;
    try {
      const res = await apiFetch(`/api/admin/registrations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadRegistrations();
      }
    } catch (_e) {
      alert('No se pudo eliminar el registro.');
    }
  };

  // Export CSV
  document.getElementById('exportCsvBtn').addEventListener('click', () => {
    if (!allRegistrations.length) {
      alert('No hay inscriptos para exportar.');
      return;
    }
    const headers = [
      'ID',
      'Nombre',
      'Apellido',
      'DNI',
      'Curso',
      'Division',
      'Email',
      'Telefono_Padres',
      'Forma_Pago',
      'Estado_Pago',
      'Codigo_QR',
      'Ingreso_Puerta',
      'Hora_Ingreso'
    ];
    const rows = allRegistrations.map((r) => [
      r.id,
      `"${r.first_name}"`,
      `"${r.last_name}"`,
      r.dni,
      `"${r.course}"`,
      `"${r.division}"`,
      r.email,
      `"${r.parent_phone}"`,
      r.payment_method,
      r.status,
      r.qr_token || '',
      r.checked_in ? 'SI' : 'NO',
      `"${r.checked_in_at || ''}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Inscriptos_Sunset2026_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  });

  // Settings load & save
  async function loadSettings() {
    try {
      const res = await apiFetch('/api/admin/settings');
      const s = await res.json();
      document.getElementById('set_ticket_price').value = s.ticket_price || '';
      document.getElementById('set_bank_alias').value = s.bank_alias || '';
      document.getElementById('set_bank_cbu').value = s.bank_cbu || '';
      document.getElementById('set_bank_holder').value = s.bank_holder || '';
      document.getElementById('set_bank_name').value = s.bank_name || '';
      document.getElementById('set_divisions').value = s.divisions || 'A,B,C,Única';
      document.getElementById('set_cash_instructions').value = s.cash_instructions || '';
      document.getElementById('set_smtp_user').value = s.smtp_user || '';
      document.getElementById('set_smtp_pass').value = s.smtp_pass || '';
      document.getElementById('set_admin_password').value = s.admin_password || 'sunset2026';
    } catch (e) {
      console.error(e);
    }
  }

  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById('settingsAlert');
    alertBox.style.display = 'none';

    const payload = {
      ticket_price: document.getElementById('set_ticket_price').value.trim(),
      bank_alias: document.getElementById('set_bank_alias').value.trim(),
      bank_cbu: document.getElementById('set_bank_cbu').value.trim(),
      bank_holder: document.getElementById('set_bank_holder').value.trim(),
      bank_name: document.getElementById('set_bank_name').value.trim(),
      divisions: document.getElementById('set_divisions').value.trim(),
      cash_instructions: document.getElementById('set_cash_instructions').value.trim(),
      smtp_user: document.getElementById('set_smtp_user').value.trim(),
      smtp_pass: document.getElementById('set_smtp_pass').value.trim(),
      admin_password: document.getElementById('set_admin_password').value.trim()
    };

    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: payload
      });
      if (res.ok) {
        alertBox.className = 'alert alert-success';
        alertBox.textContent = '✅ Configuración actualizada correctamente.';
        alertBox.style.display = 'block';
        loadRegistrations();
      }
    } catch (_err) {
      alertBox.className = 'alert alert-error';
      alertBox.textContent = '❌ Error al guardar la configuración.';
      alertBox.style.display = 'block';
    }
  });

  if (authToken) {
    showDashboard();
  }
});

