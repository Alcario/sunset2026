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
  const courseSelect = document.getElementById('course');

  let publicConfig = null;

  function updateCourseBankDetails() {
    const selectedCourse = courseSelect.value;
    const noCourseAlert = document.getElementById('noCourseTransferAlert');
    const detailsBox = document.getElementById('courseBankDetails');

    if (!selectedCourse || !publicConfig) {
      if (noCourseAlert) noCourseAlert.style.display = 'block';
      if (detailsBox) detailsBox.style.display = 'none';
      return;
    }

    if (noCourseAlert) noCourseAlert.style.display = 'none';
    if (detailsBox) detailsBox.style.display = 'block';

    let alias = '';
    let holder = '';
    let cbu = '';
    let bank = '';

    if (selectedCourse === '6° Grado') {
      alias = publicConfig.bank_alias_6to || 'SUNSET2026.6';
      holder = publicConfig.bank_holder_6to || '';
      cbu = publicConfig.bank_cbu_6to || '';
      bank = publicConfig.bank_name_6to || '';
    } else if (selectedCourse === '1° Año') {
      alias = publicConfig.bank_alias_1ro || 'SUNSET2026.1';
      holder = publicConfig.bank_holder_1ro || '';
      cbu = publicConfig.bank_cbu_1ro || '';
      bank = publicConfig.bank_name_1ro || '';
    } else if (selectedCourse === '2° Año') {
      alias = publicConfig.bank_alias_2do || 'SUNSET2026.2';
      holder = publicConfig.bank_holder_2do || '';
      cbu = publicConfig.bank_cbu_2do || '';
      bank = publicConfig.bank_name_2do || '';
    }

    document.getElementById('transferBoxTitle').textContent = `🏦 Datos de Transferencia exclusivos para ${selectedCourse}`;
    document.getElementById('activeAliasLabel').innerHTML = `Alias para <strong>${selectedCourse}</strong>:`;
    document.getElementById('activeAliasText').textContent = alias;

    const holderRow = document.getElementById('activeHolderRow');
    if (holder && holder.trim()) {
      holderRow.style.display = 'flex';
      document.getElementById('activeHolderText').textContent = holder.trim();
    } else {
      holderRow.style.display = 'none';
    }

    const cbuRow = document.getElementById('activeCbuRow');
    if (cbu && cbu.trim()) {
      cbuRow.style.display = 'flex';
      document.getElementById('activeCbuText').textContent = cbu.trim();
    } else {
      cbuRow.style.display = 'none';
    }

    const bankRow = document.getElementById('activeBankRow');
    if (bank && bank.trim()) {
      bankRow.style.display = 'flex';
      document.getElementById('activeBankText').textContent = bank.trim();
    } else {
      bankRow.style.display = 'none';
    }
  }

  courseSelect.addEventListener('change', updateCourseBankDetails);

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
      if (document.getElementById('doorPriceDisplay') && publicConfig.door_ticket_price) {
        document.getElementById('doorPriceDisplay').textContent = formatARS(publicConfig.door_ticket_price);
      }
      document.getElementById('bankPriceText').textContent = formatARS(publicConfig.ticket_price);
      document.getElementById('cashInstructionsText').textContent = publicConfig.cash_instructions;
      updateCourseBankDetails();

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

  // Copy active course alias button
  const copyActiveAliasBtn = document.getElementById('copyActiveAliasBtn');
  if (copyActiveAliasBtn) {
    copyActiveAliasBtn.addEventListener('click', () => {
      const alias = document.getElementById('activeAliasText').textContent.trim();
      navigator.clipboard.writeText(alias).then(() => {
        const original = copyActiveAliasBtn.textContent;
        copyActiveAliasBtn.textContent = '✅ ¡Copiado!';
        setTimeout(() => {
          copyActiveAliasBtn.textContent = original;
        }, 2000);
      });
    });
  }

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
    const pickupAdult = document.getElementById('pickup_adult').value.trim();

    if (!firstName || !lastName || !dni || !email || !course || !parentPhone || !pickupAdult) {
      return showAlert('error', '⚠️ Por favor completá todos los datos del alumno/a, el teléfono de contacto y quién será el mayor a cargo que lo/la retira.');
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
    formData.append('pickup_adult', pickupAdult);
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
        updateCourseBankDetails();
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

