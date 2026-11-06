// ============================================================
//  mat_grade.js — 소재 식별색 표시 (라벨용)  window.MatGrade
//  사용: coil_label.js (입고 소재 QR 라벨), material_IQC.html (IQC 합격 라벨)
//
//  SQ 평가(2026-07-20) 5_3 지적 대응:
//    SUS430 · SUS304 는 외관으로 구분이 어려워 식별표 외 스티커로 이중관리했으나 부착 누락 발생
//    → 라벨 자체에 강종과 사내 식별색을 크게 인쇄
//      컬러(A4) : 식별색 바탕 띠 / 흑백 라벨 프린터(100×70) : 흰 바탕 + 색 이름을 검정 박스 흰 글자로 크게
//
//  사내 소재 식별색 기준 (2026-11 품질관리팀 제공)
//    스테인리스 : SUS304 노랑 · SUS304J1 노랑(304와 같은 색, 혼동 주의 문구) · SUS430 파랑 · SPCC 없음
//    A1008 : 당사 사용 재질 아님 → 식별색 대신 '당사 미사용 재질 · 입고 확인' 경고
//    탄소강(SKF ATC · SKF KOREA) : 재질 + 두께(T) + 폭(W) 로 결정 — 같은 규격이라도 재질에 따라 다름
//      S55CM-S 1.01×126 BDA-1106 초록  | S70CM-S 1.25×134 BDA-1113  파랑
//      S55CM-S 1.01×144 BDA-1159 빨강  | S67CM-S 1.01×134 BDA-1113D 노랑
//      S67CM-S 1.25×140 BDA-1179 흰색  | S55CM-S 1.01×120 BDA-1124  없음
//      S55CM-S 1.01×134 BDA-1165 없음  | C67S    1.01×132 BDA-1113D 노랑
//      C67S    1.25×137 BDA-1179 흰색  | C67S    1.25×146 BDA-1156  검정
//    허용차 : 두께 ±0.02mm · 폭 ±0.5mm (material_spec.js 와 같음)
// ============================================================
(function (g) {
  const TOL_T = 0.02, TOL_W = 0.5;
  // 식별색 → [바탕, 글자, 테두리]
  const COLORS = {
    '노랑': ['#facc15', '#111', '#a16207'], '파랑': ['#1d4ed8', '#fff', '#1d4ed8'],
    '초록': ['#16a34a', '#fff', '#16a34a'], '빨강': ['#dc2626', '#fff', '#dc2626'],
    '흰색': ['#ffffff', '#111', '#111'],    '검정': ['#111111', '#fff', '#111'],
    '없음': ['#ffffff', '#111', '#111'],
  };
  // 재질군: 표기 차이를 묶음 (C67S = S70CM-S = S67CM-S 계열, S55CM-S = S55CM = S55C)
  function norm(s) {
    return String(s || '').toUpperCase().trim()
      .replace(/^(SUS|STS)\s*/, '')
      .replace(/[\s\-()_.]/g, '')
      .replace(/(2B|BA|BB)$/, '');
  }
  function family(material) {
    const n = norm(material);
    if (/^304J1/.test(n)) return 'SUS304J1';
    if (/^430/.test(n)) return 'SUS430';
    if (/^304/.test(n)) return 'SUS304';
    if (/^SPCC/.test(n)) return 'SPCC';
    if (/^(C67S|S67C|S70C)/.test(n)) return 'C67S';
    if (/^S55C/.test(n)) return 'S55CM';
    if (/^A1008/.test(n)) return 'A1008';
    return '';
  }
  // [재질군, 두께, 폭, 품명, 식별색, 표 재질명]
  const SPEC = [
    ['S55CM', 1.01, 126, 'BDA-1106', '초록', 'S55CM-S'],
    ['C67S',  1.25, 134, 'BDA-1113', '파랑', 'S70CM-S'],
    ['S55CM', 1.01, 144, 'BDA-1159', '빨강', 'S55CM-S'],
    ['C67S',  1.01, 134, 'BDA-1113D', '노랑', 'S67CM-S'],
    ['C67S',  1.25, 140, 'BDA-1179', '흰색', 'S67CM-S'],
    ['S55CM', 1.01, 120, 'BDA-1124', '없음', 'S55CM-S'],
    ['S55CM', 1.01, 134, 'BDA-1165', '없음', 'S55CM-S'],
    ['C67S',  1.01, 132, 'BDA-1113D', '노랑', 'C67S'],
    ['C67S',  1.25, 137, 'BDA-1179', '흰색', 'C67S'],
    ['C67S',  1.25, 146, 'BDA-1156', '검정', 'C67S'],
  ];
  const BY_FAMILY = { 'SUS304': '노랑', 'SUS304J1': '노랑', 'SUS430': '파랑', 'SPCC': '없음' };
  const SIMILAR = { 'SUS304': 'SUS430', 'SUS430': 'SUS304' };
  // 주의 문구 (식별색이 같거나 당사 미사용 재질)
  const CAUTION = {
    'SUS304J1': 'SUS304와 같은 노랑 — 강종(J1) 확인 주의',
    'A1008': '당사 사용 재질 아님 — 입고 확인 필요',
  };

  /* 재질·두께·폭 → { code(표시명), color(식별색 이름|''), item(품명), bg, fg, bd, similar, raw }
     color '' = 기준표에 없는 규격 (식별색 미지정) */
  function of(material, t, w) {
    const raw = String(material || '').trim();
    const fam = family(raw);
    // 스테인리스는 'SUS'+강종(접미사 L·J1L 등 유지), 그 외는 입고 표기 그대로
    const code = fam.startsWith('SUS') ? 'SUS' + norm(raw) : (raw.toUpperCase() || '재질 미상');
    let color = BY_FAMILY[fam] || '', item = '';
    if (!color && fam) {
      const hit = SPEC.find(([f, st, sw]) => f === fam && Math.abs(+t - st) <= TOL_T + 1e-9 && Math.abs(+w - sw) <= TOL_W + 1e-9);
      if (hit) { color = hit[4]; item = hit[3]; }
    }
    const [bg, fg, bd] = COLORS[color] || ['#e5e7eb', '#111', '#6b7280'];
    return { code, family: fam, color, item, bg, fg, bd: fam === 'A1008' ? '#dc2626' : bd, similar: SIMILAR[fam] || '', caution: CAUTION[fam] || '', raw };
  }
  const colorText = (G) => G.family === 'A1008' ? '⚠ 미사용 재질' : G.color === '없음' ? '식별색 없음' : G.color ? '식별색 ' + G.color : '식별색 미지정';
  const subText = (G) => G.caution || [G.item ? G.item + '용' : '', G.similar ? G.similar + '와 혼동 주의' : ''].filter(Boolean).join(' · ');

  /* 흑백(감열 라벨 프린터)용 : 색 띠는 회색·검정으로 뭉개지므로 색 이름을 검정 바탕 흰 글자로 크게 */
  const monoWord = (G) => G.family === 'A1008' ? '⚠미사용' : G.color && G.color !== '없음' ? G.color : '';
  /* 식별색 띠 HTML (라벨 안) — mono=true : 흑백 프린터용 */
  function bandHtml(material, esc, t, w, mono) {
    const G = of(material, t, w);
    const e = esc || ((v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const dash = (G.color === '없음' || !G.color) ? 'dashed' : 'solid';
    if (mono) {
      const wd = monoWord(G);
      return `<div class="mg-band" style="background:#fff;color:#000;border:.7mm ${dash} #000">
      <span class="mg-code">${e(G.code)}</span>
      <span class="mg-sim">${wd ? `<span class="mg-word">${e(wd)}</span>` : `<b>${e(colorText(G))}</b>`}${subText(G) ? '<br>' + e(subText(G)) : ''}</span></div>`;
    }
    return `<div class="mg-band" style="background:${G.bg};color:${G.fg};border:.6mm ${dash} ${G.bd}">
      <span class="mg-code">${e(G.code)}</span>
      <span class="mg-sim"><b>${e(colorText(G))}</b>${subText(G) ? '<br>' + e(subText(G)) : ''}</span></div>`;
  }
  const BAND_CSS = `.mg-band{display:flex;align-items:center;justify-content:space-between;gap:2mm;padding:.4mm 2mm;margin-top:1mm;min-height:9mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.mg-band .mg-code{font-size:19pt;font-weight:900;letter-spacing:1px;line-height:1;white-space:nowrap}
.mg-band .mg-sim{font-size:7pt;font-weight:700;text-align:right;line-height:1.25}.mg-band .mg-sim b{font-size:10pt}
.mg-band .mg-word{display:inline-block;background:#000;color:#fff;font-size:15pt;font-weight:900;padding:.3mm 2.5mm;margin-bottom:.4mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}`;

  /* 캔버스에 식별색 띠 그리기 (x,y,w,h : 픽셀) */
  function drawBand(c, material, x, y, w, h, font, t, wd, mono) {
    const G = of(material, t, wd);
    if (mono) {
      c.fillStyle = '#fff'; c.fillRect(x, y, w, h);
      c.save(); c.strokeStyle = '#000'; c.lineWidth = Math.max(2, h * 0.08);
      if (G.color === '없음' || !G.color) c.setLineDash([h * 0.25, h * 0.15]);
      c.strokeRect(x, y, w, h); c.restore();
      c.fillStyle = '#000'; c.textBaseline = 'middle'; c.textAlign = 'left';
      c.font = `900 ${Math.round(h * 0.68)}px ${font}`;
      c.fillText(G.code, x + h * 0.25, y + h / 2, w * 0.5);
      const word = monoWord(G), sub = subText(G);
      if (word) {
        c.font = `900 ${Math.round(h * 0.5)}px ${font}`;
        const tw = Math.min(c.measureText(word).width + h * 0.5, w * 0.4), bx = x + w - h * 0.15 - tw, bh = h * (sub ? 0.58 : 0.8), by = y + h * (sub ? 0.08 : 0.1);
        c.fillStyle = '#000'; c.fillRect(bx, by, tw, bh);
        c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(word, bx + tw / 2, by + bh / 2, tw - h * 0.2);
      } else {
        c.textAlign = 'right'; c.font = `800 ${Math.round(h * 0.34)}px ${font}`;
        c.fillText(colorText(G), x + w - h * 0.2, y + h * (sub ? 0.34 : 0.5), w * 0.42);
      }
      if (sub) { c.fillStyle = '#000'; c.textAlign = 'right'; c.font = `700 ${Math.round(h * 0.22)}px ${font}`; c.fillText(sub, x + w - h * 0.15, y + h * 0.83, w * 0.45); }
      c.textAlign = 'left'; return;
    }
    c.fillStyle = G.bg; c.fillRect(x, y, w, h);
    c.save(); c.strokeStyle = G.bd; c.lineWidth = Math.max(2, h * 0.07);
    if (G.color === '없음' || !G.color) c.setLineDash([h * 0.25, h * 0.15]);
    c.strokeRect(x, y, w, h); c.restore();
    c.fillStyle = G.fg; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.font = `900 ${Math.round(h * 0.68)}px ${font}`;
    c.fillText(G.code, x + h * 0.25, y + h / 2, w * 0.55);
    c.textAlign = 'right';
    const sub = subText(G);
    c.font = `800 ${Math.round(h * 0.34)}px ${font}`;
    c.fillText(colorText(G), x + w - h * 0.2, y + h * (sub ? 0.34 : 0.5), w * 0.42);
    if (sub) { c.font = `700 ${Math.round(h * 0.24)}px ${font}`; c.fillText(sub, x + w - h * 0.2, y + h * 0.74, w * 0.42); }
    c.textAlign = 'left';
  }
  g.MatGrade = { of, family, norm, bandHtml, drawBand, BAND_CSS, SPEC, COLORS };
})(window);
