'use strict';

// Lógica del verificador de precios, modo quiosco y escáner (consultar.html)
(async () => {
  if (!(await requireAuth())) return;
  renderHeader('consultar.html');

  const AUTO_CLEAR_MS = 10000; // Tiempo en ms para limpiar pantalla en modo quiosco
  const input = $('#barcode');
  const msg = $('#msg');
  const result = $('#result');
  const idle = $('#idle');
  const countdown = $('#countdown');
  const btnExit = $('#btn-exit-kiosk');

  let kiosk = false;
  let clearTimer = null;

  function updateIdle() {
    idle.hidden = !(kiosk && !result.hasChildNodes() && !msg.textContent);
  }

  function clearResult() {
    clearTimeout(clearTimer);
    result.replaceChildren();
    setMsg(msg, '');
    countdown.hidden = true;
    input.value = '';
    updateIdle();
    if (!cameraActive()) input.focus();
  }

  function scheduleClear() {
    clearTimeout(clearTimer);
    if (!kiosk) { countdown.hidden = true; return; }
    const bar = countdown.firstElementChild;
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = '';
    bar.style.animationDuration = `${AUTO_CLEAR_MS}ms`;
    countdown.hidden = false;
    clearTimer = setTimeout(clearResult, AUTO_CLEAR_MS);
  }

  /** Consulta el código de barras en consultar.php (y registra el log en tblog_verificador) */
  async function lookup(id) {
    result.replaceChildren();
    input.value = '';
    clearFieldError(input);
    setMsg(msg, '');

    try {
      const data = await apiFetch(`consultar.php?id=${encodeURIComponent(id)}`);
      const p = data.producto;
      const inStock = p.StockActual > 0;

      // Dibuja la tarjeta con foto local, categoría, nombre, precio y stock
      result.append(el('article', { className: 'product-card' },
        p.Foto
          ? el('img', { src: `${p.Foto}?t=${Date.now()}`, alt: `Fotografía de ${p.Nombre}` })
          : el('div', { className: 'no-photo', textContent: 'Sin fotografía' }),
        el('div', {},
          el('span', { className: 'badge', textContent: p.NombreCategoria }),
          el('h3', { textContent: p.Nombre }),
          el('div', { className: 'price', textContent: money(p.PrecioUnitario) }),
          el('span', { className: `badge ${inStock ? 'ok' : 'out'}`, textContent: inStock ? `Disponible (${p.StockActual})` : 'Agotado' }),
          el('dl', {},
            el('dt', { textContent: 'Marca' }), el('dd', { textContent: p.Marca }),
            el('dt', { textContent: 'Código' }), el('dd', { textContent: p.IDProducto }),
          ),
        ),
      ));
    } catch (err) {
      setMsg(msg, err.message);
    }
    updateIdle();
    scheduleClear();
  }

  const searchForm = $('#form-search');
  setupValidation(searchForm);
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateForm(searchForm)) return;
    lookup(input.value.trim());
  });

  // Limpia cualquier carácter no numérico enviado por lectores USB
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); });

  // En modo quiosco, redirige automáticamente cualquier dígito al campo de búsqueda
  document.addEventListener('keydown', (e) => {
    if (!kiosk || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.activeElement !== input && /^\d$/.test(e.key)) input.focus();
  });

  /* ---------- Control del modo quiosco ---------- */
  async function enterKiosk() {
    kiosk = true;
    document.body.classList.add('kiosk');
    btnExit.hidden = false;
    try { await document.documentElement.requestFullscreen(); } catch {}
    clearResult();
  }

  function exitKiosk() {
    if (!kiosk) return;
    kiosk = false;
    clearTimeout(clearTimer);
    countdown.hidden = true;
    document.body.classList.remove('kiosk');
    btnExit.hidden = true;
    stopCamera();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    updateIdle();
  }

  $('#btn-kiosk').addEventListener('click', enterKiosk);
  btnExit.addEventListener('click', exitKiosk);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) exitKiosk(); });

  /* ---------- Escáner con cámara (BarcodeDetector API) ---------- */
  const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
  const cameraSupported = 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
  const btnCamera = $('#btn-camera');
  const cameraBox = $('#camera-box');
  const video = $('#video');
  let stream = null;
  let detectTimer = null;
  let detecting = false;

  btnCamera.hidden = !cameraSupported;
  $('#camera-unsupported').hidden = cameraSupported;

  function cameraActive() { return stream !== null; }

  async function startCamera() {
    if (cameraActive()) return;
    let detector;
    try { detector = new BarcodeDetector({ formats: FORMATS }); } catch { detector = new BarcodeDetector(); }

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch {
      stream = null;
      return setMsg(msg, 'No se pudo acceder a la cámara. Revisa los permisos del navegador.');
    }
    setMsg(msg, '');
    video.srcObject = stream;
    await video.play().catch(() => {});
    cameraBox.hidden = false;

    detectTimer = setInterval(async () => {
      if (detecting || video.readyState < 2) return;
      detecting = true;
      try {
        const codes = await detector.detect(video);
        const hit = codes.find((c) => /^\d{8,14}$/.test(c.rawValue));
        if (hit) { stopCamera(); lookup(hit.rawValue); }
      } catch {}
      detecting = false;
    }, 250);
  }

  function stopCamera() {
    clearInterval(detectTimer);
    detectTimer = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
    cameraBox.hidden = true;
  }

  btnCamera.addEventListener('click', () => (cameraActive() ? stopCamera() : startCamera()));
  $('#btn-camera-stop').addEventListener('click', stopCamera);
  window.addEventListener('pagehide', stopCamera);
})();