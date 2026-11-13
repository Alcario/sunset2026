document.addEventListener('DOMContentLoaded', () => {
  let authToken = localStorage.getItem('sunset_admin_token') || '';
  let html5QrCode = null;
  let isScanning = false;
  let scanCooldown = false;

  const loginSection = document.getElementById('scannerLoginSection');
  const scannerMain = document.getElementById('scannerMain');
  const loginForm = document.getElementById('scannerLoginForm');
  const loginError = document.getElementById('scannerLoginError');

  const modeQrBtn = document.getElementById('modeQrBtn');
  const modeDniBtn = document.getElementById('modeDniBtn');
  const qrScannerPanel = document.getElementById('qrScannerPanel');
  const manualDniPanel = document.getElementById('manualDniPanel');

  const startCamBtn = document.getElementById('startCamBtn');
  const stopCamBtn = document.getElementById('stopCamBtn');
  const manualQrCodeForm = document.getElementById('manualQrCodeForm');
  const qrTokenInput = document.getElementById('qrTokenInput');

  const dniSearchForm = document.getElementById('dniSearchForm');
  const dniSearchInput = document.getElementById('dniSearchInput');
  const dniSearchResultsBody = document.getElementById('dniSearchResultsBody');

  const scanResultBanner = document.getElementById('scanResultBanner');
  const scanResultIcon = document.getElementById('scanResultIcon');
  const scanResultTitle = document.getElementById('scanResultTitle');
  const scanResultMessage = document.getElementById('scanResultMessage');
  const scanResultStudentCard = document.getElementById('scanResultStudentCard');
  const clearResultBtn = document.getElementById('clearResultBtn');

  // Synthesize beep sound for immediate audio feedback at the door
  function playFeedbackSound(type) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
        osc.start();
        osc.stop(ctx.currentTime + 0.38);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.setValueAtTime(160, ctx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
        osc.start();
        osc.stop(ctx.currentTime + 0.45);
      }
    } catch (_e) {}
  }

  async function apiFetch(url, options = {}) {
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${authToken}`
    };
    if (options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      authToken = '';
      localStorage.removeItem('sunset_admin_token');
      loginSection.style.display = 'block';
      scannerMain.style.display = 'none';
      throw new Error('No autorizado');
    }
    return res;
  }

  function showScannerMain() {
    loginSection.style.display = 'none';
    scannerMain.style.display = 'block';
    loadDoorStats();
    searchStudentsByDni('');
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    const password = document.getElementById('scannerPass').value;

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
      showScannerMain();
    } catch (_err) {
      loginError.textContent = 'Error de conexión.';
      loginError.style.display = 'block';
    }
  });

  // Switch between QR Scanner and Manual DNI Fallback
  modeQrBtn.addEventListener('click', () => {
    modeQrBtn.className = 'btn btn-primary';
    modeDniBtn.className = 'btn btn-secondary';
    qrScannerPanel.style.display = 'block';
    manualDniPanel.style.display = 'none';
  });

  modeDniBtn.addEventListener('click', () => {
    modeDniBtn.className = 'btn btn-primary';
    modeQrBtn.className = 'btn btn-secondary';
    manualDniPanel.style.display = 'block';
    qrScannerPanel.style.display = 'none';
    stopCamera();
    dniSearchInput.focus();
    searchStudentsByDni(dniSearchInput.value);
  });

  // Display result banner
  function showScanResult(data) {
    scanResultBanner.style.display = 'block';
    scanResultBanner.className = 'scan-result-box';

    if (data.result === 'ACCESS_GRANTED') {
      playFeedbackSound('success');
      scanResultBanner.classList.add('granted');
      scanResultIcon.textContent = '✅';
      scanResultTitle.textContent = '¡INGRESO PERMITIDO!';
      scanResultMessage.textContent = data.message;
    } else if (data.result === 'ALREADY_USED') {
      playFeedbackSound('error');
      scanResultBanner.classList.add('used');
      scanResultIcon.textContent = '⛔';
      scanResultTitle.textContent = '¡ENTRADA YA UTILIZADA!';
      scanResultMessage.textContent = data.message;
    } else if (data.result === 'UNCONFIRMED') {
      playFeedbackSound('error');
      scanResultBanner.classList.add('warning');
      scanResultIcon.textContent = '⚠️';
      scanResultTitle.textContent = 'PAGO AÚN NO CONFIRMADO';
      scanResultMessage.textContent = data.message;
    } else {
      playFeedbackSound('error');
      scanResultBanner.classList.add('used');
      scanResultIcon.textContent = '❌';
      scanResultTitle.textContent = 'CÓDIGO QR NO VÁLIDO';
      scanResultMessage.textContent = data.message || 'No se encontró la entrada.';
    }

    if (data.student) {
      const s = data.student;
      scanResultStudentCard.style.display = 'block';
      scanResultStudentCard.innerHTML = `
        <div>👤 <strong>Alumno/a:</strong> ${s.first_name} ${s.last_name}</div>
        <div>🪪 <strong>DNI:</strong> ${s.dni}</div>
        <div>🎓 <strong>Curso:</strong> ${s.course} "${s.division}"</div>
        <div>📞 <strong>Tel. Padre/Madre:</strong> ${s.parent_phone}</div>
        ${s.checked_in_at ? `<div>🕒 <strong>Hora de ingreso:</strong> ${s.checked_in_at}</div>` : ''}
      `;
    } else {
      scanResultStudentCard.style.display = 'none';
    }

    scanResultBanner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    loadDoorStats();
  }

  clearResultBtn.addEventListener('click', () => {
    scanResultBanner.style.display = 'none';
  });

  // Validate QR Token against backend
  async function processQrToken(qrToken) {
    if (scanCooldown) return;
    scanCooldown = true;
    setTimeout(() => {
      scanCooldown = false;
    }, 2200);

    try {
      const res = await apiFetch('/api/checkin/scan', {
        method: 'POST',
        body: { qr_token: qrToken }
      });
      const data = await res.json();
      showScanResult(data);
    } catch (e) {
      console.error(e);
    }
  }

  // Camera Scanner Controls
  startCamBtn.addEventListener('click', async () => {
    if (isScanning) return;
    try {
      html5QrCode = new Html5Qrcode('qrReader');
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          processQrToken(decodedText);
        },
        () => {}
      );
      isScanning = true;
      startCamBtn.style.display = 'none';
      stopCamBtn.style.display = 'inline-flex';
    } catch (err) {
      alert('No se pudo acceder a la cámara. Verificá los permisos del navegador o usá el Ingreso Manual por DNI.');
    }
  });

  async function stopCamera() {
    if (html5QrCode && isScanning) {
      try {
        await html5QrCode.stop();
        html5QrCode.clear();
      } catch (_e) {}
      isScanning = false;
      startCamBtn.style.display = 'inline-flex';
      stopCamBtn.style.display = 'none';
    }
  }

  stopCamBtn.addEventListener('click', stopCamera);

  manualQrCodeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = qrTokenInput.value.trim();
    if (!code) return;
    processQrToken(code);
    qrTokenInput.value = '';
  });

  // Manual DNI Search & Single-Use Check-In
  async function searchStudentsByDni(query) {
    try {
      const res = await apiFetch(`/api/checkin/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      const rows = data.results || [];

      if (rows.length === 0) {
        dniSearchResultsBody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: 22px; color: var(--text-muted);">
              No se encontró ningún alumno con "${query}".
            </td>
          </tr>
        `;
        return;
      }

      dniSearchResultsBody.innerHTML = rows
        .map((r) => {
          const isConfirmed = r.status === 'confirmado';
          const alreadyIn = r.checked_in === 1;

          let actionHtml = '';
          if (alreadyIn) {
            actionHtml = `<span class="badge badge-checkedin">⛔ Ya ingresó (${r.checked_in_at})</span>`;
          } else if (!isConfirmed) {
            actionHtml = `<span class="badge badge-pending">⚠️ Pago Pendiente (Confirmar en Admin)</span>`;
          } else {
            actionHtml = `<button type="button" class="btn btn-success btn-sm" onclick="window.manualCheckInById(${r.id})">✅ Registrar Ingreso por DNI</button>`;
          }

          return `
            <tr>
              <td><strong>${r.first_name} ${r.last_name}</strong></td>
              <td style="font-family: monospace; font-weight: 800; font-size: 1rem; color: var(--sunset-gold);">${r.dni}</td>
              <td>${r.course} "${r.division}"</td>
              <td>
                ${
                  isConfirmed
                    ? '<span class="badge badge-confirmed">Confirmado</span>'
                    : '<span class="badge badge-pending">Pendiente</span>'
                }
              </td>
              <td>${actionHtml}</td>
            </tr>
          `;
        })
        .join('');
    } catch (e) {
      console.error(e);
    }
  }

  dniSearchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    searchStudentsByDni(dniSearchInput.value.trim());
  });

  dniSearchInput.addEventListener('input', () => {
    searchStudentsByDni(dniSearchInput.value.trim());
  });

  window.manualCheckInById = async (id) => {
    try {
      const res = await apiFetch('/api/checkin/manual', {
        method: 'POST',
        body: { id }
      });
      const data = await res.json();
      showScanResult(data);
      searchStudentsByDni(dniSearchInput.value.trim());
    } catch (_e) {
      alert('Error al registrar el ingreso manual.');
    }
  };

  // Load live stats & recent check-ins
  async function loadDoorStats() {
    try {
      const res = await apiFetch('/api/checkin/stats');
      const data = await res.json();

      document.getElementById('doorStatCheckedIn').textContent = data.checked_in;
      document.getElementById('doorStatConfirmed').textContent = data.confirmed;
      document.getElementById('doorStatRemaining').textContent = data.remaining;

      const recentBody = document.getElementById('recentCheckinsBody');
      if (!data.recent || data.recent.length === 0) {
        recentBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 18px; color: var(--text-muted);">Aún no hay ingresos registrados.</td></tr>`;
        return;
      }

      recentBody.innerHTML = data.recent
        .map(
          (r) => `
          <tr>
            <td style="font-size: 0.84rem; color: #00f5d4; font-weight: 700;">${r.checked_in_at}</td>
            <td><strong>${r.first_name} ${r.last_name}</strong></td>
            <td style="font-family: monospace;">${r.dni}</td>
            <td>${r.course} "${r.division}"</td>
            <td>
              ${
                r.checked_in_method === 'manual_dni'
                  ? '<span class="badge" style="background:rgba(255,194,71,0.2); color:var(--sunset-gold);">🪪 Manual DNI</span>'
                  : '<span class="badge badge-confirmed">📷 Escaneo QR</span>'
              }
            </td>
          </tr>
        `
        )
        .join('');
    } catch (e) {
      console.error(e);
    }
  }

  if (authToken) {
    showScannerMain();
  }
});

