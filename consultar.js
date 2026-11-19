'use strict';

if (requireAuth()) {
  renderHeader('consultar.html');

  const AUTO_CLEAR_MS = 10000; // en modo quiosco, la pantalla se limpia sola
  const input = $('#barcode');
  const msg = $('#msg');
  const result = $('#result');
  const idle = $('#idle');
  const countdown = $('#countdown');
  const btnExit = $('#btn-exit-kiosk');

  let kiosk = false;
  let clearTimer = null;

  /* ---------- Consulta ---------- */
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

  /** En quiosco, programa la limpieza automática y reinicia la barra de cuenta regresiva. */
  function scheduleClear() {
    clearTimeout(clearTimer);
    if (!kiosk) { countdown.hidden = true; return; }
    const bar = countdown.firstElementChild;
    bar.style.animation = 'none';
    void bar.offsetWidth; // reinicia la animación
    bar.style.animation = '';
    bar.style.animationDuration = `${AUTO_CLEAR_MS}ms`;
    countdown.hidden = false;
    clearTimer = setTimeout(clearResult, AUTO_CLEAR_MS);
  }

  function lookup(id) {
    result.replaceChildren();
    input.value = ''; // evita que el siguiente escaneo se concatene con el anterior
    clearFieldError(input);

    const p = store.products.find((x) => x.IDProducto === id);
    if (!p) {
      setMsg(msg, 'No se encontró ningún artículo con ese código de barras.');
      updateIdle();
      scheduleClear();
      return;
    }
    setMsg(msg, '');

    const photo = store.photos[p.IDProducto];
    const inStock = p.StockActual > 0;

    result.append(el('article', { className: 'product-card' },
      photo
        ? el('img', { src: photo, alt: `Fotografía de ${p.Nombre}` })
        : el('div', { className: 'no-photo', textContent: 'Sin fotografía' }),
      el('div', {},
        el('span', { className: 'badge', textContent: categoryName(p.IDCategoria) }),
        el('h3', { textContent: p.Nombre }),
        el('div', { className: 'price', textContent: money(p.PrecioUnitario) }),
        el('span', { className: `badge ${inStock ? 'ok' : 'out'}`, textContent: inStock ? `Disponible (${p.StockActual})` : 'Agotado' }),
        el('dl', {},
          el('dt', { textContent: 'Marca' }), el('dd', { textContent: p.Marca }),
          el('dt', { textContent: 'Código' }), el('dd', { textContent: p.IDProducto }),
        ),
      ),
    ));
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

  // Solo dígitos: algunos lectores USB envían prefijos o espacios.
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); });

  /* ---------- Lector USB (teclea el código + Enter) ---------- */
  // En quiosco, cualquier tecla numérica devuelve el foco al campo para no perder el escaneo.
  document.addEventListener('keydown', (e) => {
    if (!kiosk || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.activeElement !== input && /^\d$/.test(e.key)) input.focus();
  });

  /* ---------- Modo quiosco ---------- */
  async function enterKiosk() {
    kiosk = true;
    document.body.classList.add('kiosk');
    btnExit.hidden = false;
    try { await document.documentElement.requestFullscreen(); } catch { /* sin pantalla completa: se queda en modo quiosco */ }
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
  // Esc sale de pantalla completa → también sale del modo quiosco.
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) exitKiosk(); });

  /* ---------- Cámara (BarcodeDetector) ---------- */
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
      } catch { /* fotograma no legible: se reintenta */ }
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
}
