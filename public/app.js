document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registrationForm');
  const cardEfectivo = document.getElementById('cardEfectivo');
  const cardTransferencia = document.getElementById('cardTransferencia');
  const cashInfoBox = document.getElementById('cashInfoBox');
  const transferInfoBox = document.getElementById('transferInfoBox');
  const uploadZone = document.getElementById('uploadZone');
  const receiptInput = document.getElementById('receipt');
  const uploadFileName = document.getElementById('uploadFileName');
  const receiptPreview = document.getElementById('receiptPreview');
  const formAlert = document.getElementById('formAlert');
  const submitBtn = document.getElementById('submitBtn');
  const copyAliasBtn = document.getElementById('copyAliasBtn');

  let publicConfig = null;

  // Format currency ARS
  function formatARS(value) {
    const num = Number(value) || 0;
    return '$' + num.toLocaleString('es-AR');
  }

  // Load event public configuration
  async function loadPublicConfig() {
    try {
      const res = await fetch('/api/public-config');
      if (!res.ok) return;
      publicConfig = await res.json();

      document.getElementById('heroTimeText').textContent = `${publicConfig.event_time_start} a ${publicConfig.event_time_end} hs`;
      document.getElementById('heroVenueText').textContent = `${publicConfig.venue_name} • ${publicConfig.province}`;
      document.getElementById('ticketPriceDisplay').textContent = formatARS(publicConfig.ticket_price);
      document.getElementById('bankPriceText').textContent = formatARS(publicConfig.ticket_price);
      document.getElementById('bankAliasText').textContent = publicConfig.bank_alias;
      document.getElementById('bankCbuText').textContent = publicConfig.bank_cbu;
      document.getElementById('bankHolderText').textContent = `${publicConfig.bank_holder} (${publicConfig.bank_name})`;
      document.getElementById('cashInstructionsText').textContent = publicConfig.cash_instructions;

      if (Array.isArray(publicConfig.divisions) && publicConfig.divisions.length > 0) {
        const divSelect = document.getElementById('division');
        divSelect.innerHTML = publicConfig.divisions
          .map((d) => `<option value="${d}">${d === 'Única' ? 'División Única' : 'División ' + d}</option>`)
          .join('');
      }
    } catch (e) {
      console.error('Error cargando configuración:', e);
    }
  }

  loadPublicConfig();

  // Countdown to Nov 27, 2026 19:30:00 (Argentina GMT-3)
  function updateCountdown() {
    const target = new Date('2026-11-27T19:30:00-03:00').getTime();
    const now = Date.now();
    const diff = target - now;

    if (diff <= 0) {
      document.getElementById('cd-days').textContent = '00';
      document.getElementById('cd-hours').textContent = '00';
      document.getElementById('cd-mins').textContent = '00';
      document.getElementById('cd-secs').textContent = '00';
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((diff / 1000 / 60) % 60);
    const secs = Math.floor((diff / 1000) % 60);

    document.getElementById('cd-days').textContent = String(days).padStart(2, '0');
    document.getElementById('cd-hours').textContent = String(hours).padStart(2, '0');
    document.getElementById('cd-mins').textContent = String(mins).padStart(2, '0');
    document.getElementById('cd-secs').textContent = String(secs).padStart(2, '0');
  }

  updateCountdown();
  setInterval(updateCountdown, 1000);

  // Payment method toggle
  function setPaymentMethod(method) {
    if (method === 'efectivo') {
      cardEfectivo.classList.add('active');
      cardTransferencia.classList.remove('active');
      cashInfoBox.style.display = 'block';
      transferInfoBox.style.display = 'none';
      receiptInput.required = false;
    } else {
      cardTransferencia.classList.add('active');
      cardEfectivo.classList.remove('active');
      cashInfoBox.style.display = 'none';
      transferInfoBox.style.display = 'block';
      receiptInput.required = true;
    }
  }

  document.querySelectorAll('input[name="payment_method"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      setPaymentMethod(e.target.value);
    });
  });

  // Copy bank alias
  copyAliasBtn.addEventListener('click', () => {
    const alias = document.getElementById('bankAliasText').textContent.trim();
    navigator.clipboard.writeText(alias).then(() => {
      const original = copyAliasBtn.textContent;
      copyAliasBtn.textContent = '✅ ¡Copiado!';
      setTimeout(() => {
        copyAliasBtn.textContent = original;
      }, 2000);
    });
  });

  // Upload zone interaction
  uploadZone.addEventListener('click', () => {
    receiptInput.click();
  });

  receiptInput.addEventListener('change', () => {
    const file = receiptInput.files[0];
    if (!file) {
      uploadFileName.textContent = 'Hacé clic acá para subir el comprobante de transferencia *';
      receiptPreview.style.display = 'none';
      return;
    }

    uploadFileName.textContent = `📎 Archivo seleccionado: ${file.name}`;
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        receiptPreview.src = e.target.result;
        receiptPreview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      receiptPreview.style.display = 'none';
    }
  });

  function showAlert(type, message) {
    formAlert.style.display = 'block';
    formAlert.className = `alert ${type === 'error' ? 'alert-error' : 'alert-success'}`;
    formAlert.innerHTML = message;
    formAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // Handle form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formAlert.style.display = 'none';

    const selectedMethod = document.querySelector('input[name="payment_method"]:checked')?.value || 'efectivo';
    const firstName = document.getElementById('first_name').value.trim();
    const lastName = document.getElementById('last_name').value.trim();
    const dni = document.getElementById('dni').value.replace(/\D/g, '').trim();
    const email = document.getElementById('email').value.trim();
    const course = document.getElementById('course').value;
    const division = document.getElementById('division').value;
    const parentPhone = document.getElementById('parent_phone').value.trim();

    if (!firstName || !lastName || !dni || !email || !course || !parentPhone) {
      return showAlert('error', '⚠️ Por favor completá todos los datos del alumno/a y el teléfono del padre/madre/tutor.');
    }

    if (selectedMethod === 'transferencia' && (!receiptInput.files || receiptInput.files.length === 0)) {
      return showAlert('error', '⚠️ Seleccionaste pago por <strong>Transferencia</strong>: por favor adjuntá la captura o PDF del comprobante antes de continuar.');
    }

    const formData = new FormData();
    formData.append('first_name', firstName);
    formData.append('last_name', lastName);
    formData.append('dni', dni);
    formData.append('email', email);
    formData.append('course', course);
    formData.append('division', division);
    formData.append('parent_phone', parentPhone);
    formData.append('payment_method', selectedMethod);

    if (selectedMethod === 'transferencia' && receiptInput.files[0]) {
      formData.append('receipt', receiptInput.files[0]);
    }

    submitBtn.disabled = true;
    const prevText = submitBtn.innerHTML;
    submitBtn.innerHTML = '⏳ Procesando inscripción...';

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();

      if (!response.ok) {
        showAlert('error', `❌ ${data.error || 'No se pudo completar la inscripción.'}`);
      } else {
        showAlert(
          'success',
          `🎉 <strong>¡Inscripción registrada con éxito!</strong><br/>${data.message}<br/><small style="opacity:0.9">Alumno/a: ${firstName} ${lastName} (DNI ${dni}) — Curso: ${course} "${division}"</small>`
        );
        form.reset();
        setPaymentMethod('efectivo');
        uploadFileName.textContent = 'Hacé clic acá para subir el comprobante de transferencia *';
        receiptPreview.style.display = 'none';
      }
    } catch (err) {
      showAlert('error', '❌ Error de conexión al enviar el formulario. Intentá nuevamente.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = prevText;
    }
  });
});

