(function () {
  'use strict';

  // ---- Elements ----
  const textInput      = document.getElementById('qr-text');
  const charHint        = document.getElementById('char-hint');
  const fgColorInput    = document.getElementById('fg-color');
  const bgColorInput    = document.getElementById('bg-color');
  const fgColorText     = document.getElementById('fg-color-text');
  const bgColorText     = document.getElementById('bg-color-text');
  const ecLevelSelect   = document.getElementById('ec-level');
  const contrastWarning = document.getElementById('contrast-warning');

  const scanTarget   = document.getElementById('scan-target');
  const scanLine     = document.getElementById('scan-line');
  const canvas       = document.getElementById('qr-canvas');
  const emptyState    = document.getElementById('empty-state');
  const previewCaption = document.getElementById('preview-caption');

  const btnPng = document.getElementById('download-png');
  const btnSvg = document.getElementById('download-svg');
  const btnPdf = document.getElementById('download-pdf');

  const EXPORT_SIZE = 1024; // high-res export target, in px
  let debounceTimer = null;
  let hasContent = false;

  // ---- Helpers ----
  function debounce(fn, delay) {
    return function (...args) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function currentOptions(width) {
    return {
      width: width,
      margin: 1,
      errorCorrectionLevel: ecLevelSelect.value,
      color: {
        dark: fgColorInput.value,
        light: bgColorInput.value
      }
    };
  }

  // relative luminance contrast check (WCAG-style, simplified) so users
  // don't accidentally pick two colors a scanner can't distinguish
  function relativeLuminance(hex) {
    const rgb = hex.replace('#', '').match(/.{2}/g).map((h) => {
      const v = parseInt(h, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  }

  function contrastRatio(hexA, hexB) {
    const lA = relativeLuminance(hexA) + 0.05;
    const lB = relativeLuminance(hexB) + 0.05;
    return lA > lB ? lA / lB : lB / lA;
  }

  function updateContrastWarning() {
    const ratio = contrastRatio(fgColorInput.value, bgColorInput.value);
    contrastWarning.hidden = ratio >= 2.5; // QR needs less contrast than text, but very low ratios do fail scanners
  }

  function triggerScanAnimation() {
    scanLine.classList.remove('is-active');
    // force reflow so the animation can restart
    void scanLine.offsetWidth;
    scanLine.classList.add('is-active');
  }

  function setButtonsEnabled(enabled) {
    btnPng.disabled = !enabled;
    btnSvg.disabled = !enabled;
    btnPdf.disabled = !enabled;
  }

  function download(filename, blobOrUrl) {
    const a = document.createElement('a');
    a.href = blobOrUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ---- Core render ----
  function renderPreview() {
    const text = textInput.value.trim();
    charHint.textContent = `${textInput.value.length} characters`;

    if (!text) {
      hasContent = false;
      emptyState.style.display = 'flex';
      canvas.style.display = 'none';
      previewCaption.textContent = 'Ready when you are.';
      setButtonsEnabled(false);
      return;
    }

    QRCode.toCanvas(canvas, text, currentOptions(320), function (err) {
      if (err) {
        previewCaption.textContent = 'Could not encode this content — try shortening it.';
        setButtonsEnabled(false);
        return;
      }
      hasContent = true;
      emptyState.style.display = 'none';
      canvas.style.display = 'block';
      previewCaption.textContent = 'Updated live — download whenever you\'re ready.';
      setButtonsEnabled(true);
      triggerScanAnimation();
    });

    updateContrastWarning();
  }

  const debouncedRender = debounce(renderPreview, 150);

  // ---- Export: PNG ----
  function exportPng() {
    const text = textInput.value.trim();
    if (!text) return;
    const off = document.createElement('canvas');
    QRCode.toCanvas(off, text, currentOptions(EXPORT_SIZE), function (err) {
      if (err) return;
      download('qr-code.png', off.toDataURL('image/png'));
    });
  }

  // ---- Export: SVG ----
  function exportSvg() {
    const text = textInput.value.trim();
    if (!text) return;
    QRCode.toString(text, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: ecLevelSelect.value,
      color: { dark: fgColorInput.value, light: bgColorInput.value }
    }, function (err, svgString) {
      if (err) return;
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      download('qr-code.svg', url);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    });
  }

  // ---- Export: PDF (print-ready) ----
  function exportPdf() {
    const text = textInput.value.trim();
    if (!text) return;
    const off = document.createElement('canvas');
    QRCode.toCanvas(off, text, currentOptions(EXPORT_SIZE), function (err) {
      if (err) return;

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a5' });
      const pageWidth = doc.internal.pageSize.getWidth();

      const imgData = off.toDataURL('image/png');
      const qrSizeMm = 90;
      const x = (pageWidth - qrSizeMm) / 2;
      const y = 20;

      doc.addImage(imgData, 'PNG', x, y, qrSizeMm, qrSizeMm);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(120);
      const caption = text.length > 70 ? text.slice(0, 70) + '…' : text;
      doc.text(caption, pageWidth / 2, y + qrSizeMm + 12, { align: 'center', maxWidth: pageWidth - 20 });

      doc.setFontSize(7.5);
      doc.setTextColor(170);
      doc.text('Generated free with QRSMITH', pageWidth / 2, y + qrSizeMm + 24, { align: 'center' });

      doc.save('qr-code.pdf');
    });
  }

  // ---- Wire up events ----
  textInput.addEventListener('input', debouncedRender);

  [fgColorInput, bgColorInput].forEach((el) => {
    el.addEventListener('input', () => {
      fgColorText.textContent = fgColorInput.value.toUpperCase();
      bgColorText.textContent = bgColorInput.value.toUpperCase();
      debouncedRender();
    });
  });

  ecLevelSelect.addEventListener('change', debouncedRender);

  btnPng.addEventListener('click', exportPng);
  btnSvg.addEventListener('click', exportSvg);
  btnPdf.addEventListener('click', exportPdf);

  // init
  fgColorText.textContent = fgColorInput.value.toUpperCase();
  bgColorText.textContent = bgColorInput.value.toUpperCase();
  setButtonsEnabled(false);
})();
