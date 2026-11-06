// ============================================================
//  mat_grade.js — 소재 강종 식별 표시 (라벨용)  window.MatGrade
//  사용: coil_label.js (입고 소재 QR 라벨), material_IQC.html (IQC 합격 라벨)
//
//  SQ 평가(2026-07-20) 5_3 지적 대응:
//    SUS430 · SUS304 는 외관으로 구분이 어려워 식별표 외 스티커로 이중관리했으나 부착 누락 발생
//    → 라벨 자체에 강종을 크게, 강종별 색 + 모양 기호로 인쇄 (흑백 프린터에서도 기호로 구분)
//
//  재질 표기 → 강종: 'SUS' 접두·표면(2B/BA/BB)·'-S' 접미·공백 무시
//    430 2B = SUS430,  304 2B = SUS304,  304J1 2B = SUS304J1
//    C67S = S70CM-S (같은 소재, material_spec.js SAME_MAT 와 같은 기준)
// ============================================================
(function (g) {
  // [강종, 정규식(정규화된 표기), 색, 기호, 외관 유사 강종]
  const GRADES = [
    ['SUS304J1', /^304J1/,                 '#7e22ce', '◆', 'SUS304 · SUS430'],
    ['SUS430',   /^430/,                   '#1d4ed8', '●', 'SUS304'],
    ['SUS304',   /^304/,                   '#b91c1c', '▲', 'SUS430'],
    ['SPCC',     /^SPCC/,                  '#374151', '■', 'A1008'],
    ['C67S',     /^(C67S|S70C)/,           '#15803d', '★', 'S55CM'],
    ['S55CM',    /^S55C/,                  '#c2410c', '◎', 'C67S'],
    ['A1008',    /^A1008/,                 '#92400e', '◇', 'SPCC'],
  ];
  function norm(s) {
    return String(s || '').toUpperCase().trim()
      .replace(/^SUS\s*/, '')
      .replace(/[\s\-()_.]/g, '')
      .replace(/(2B|BA|BB)$/, '');
  }
  /* 재질 → { code(표시명), family(강종군), color, mark, similar, raw }  (모르는 재질은 표기 그대로, 검정) */
  function of(material) {
    const raw = String(material || '').trim();
    const n = norm(raw);
    for (const [code, re, color, mark, similar] of GRADES) {
      if (re.test(n)) {
        // 스테인리스는 SUS 표기로 통일, 그 외는 코일 태그와 맞추도록 입고 표기 그대로 (예: S70CM-S 는 C67S 와 같은 색·기호)
        const shown = code.startsWith('SUS') ? code : raw.toUpperCase();
        return { code: shown, color, mark, similar, raw, family: code };
      }
    }
    return { code: raw || '재질 미상', color: '#111827', mark: '', similar: '', raw };
  }
  /* 강종 띠 HTML (라벨 안) */
  function bandHtml(material, esc) {
    const G = of(material);
    const e = esc || ((v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    return `<div class="mg-band" style="background:${G.color}">
      <span class="mg-code">${G.mark ? e(G.mark) + ' ' : ''}${e(G.code)}</span>
      ${G.similar ? `<span class="mg-sim">${e(G.similar)}와 혼동 주의</span>` : ''}</div>`;
  }
  const BAND_CSS = `.mg-band{display:flex;align-items:center;justify-content:space-between;gap:2mm;color:#fff;padding:.6mm 2mm;margin-top:1mm;min-height:9mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.mg-band .mg-code{font-size:19pt;font-weight:900;letter-spacing:1px;line-height:1;white-space:nowrap}
.mg-band .mg-sim{font-size:7pt;font-weight:700;text-align:right;line-height:1.2}`;
  /* 캔버스에 강종 띠 그리기 (x,y,w,h : 픽셀) */
  function drawBand(c, material, x, y, w, h, font) {
    const G = of(material);
    c.fillStyle = G.color; c.fillRect(x, y, w, h);
    c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.font = `900 ${Math.round(h * 0.72)}px ${font}`;
    c.fillText((G.mark ? G.mark + ' ' : '') + G.code, x + h * 0.25, y + h / 2, w * 0.68);
    if (G.similar) {
      c.font = `700 ${Math.round(h * 0.27)}px ${font}`; c.textAlign = 'right';
      c.fillText(G.similar + '와', x + w - h * 0.2, y + h * 0.33);
      c.fillText('혼동 주의', x + w - h * 0.2, y + h * 0.7);
      c.textAlign = 'left';
    }
  }
  g.MatGrade = { of, norm, bandHtml, drawBand, BAND_CSS, GRADES };
})(window);
