// ============================================================
//  coil_label.js — 코일 QR 라벨 (CoilLabel)
//  사용: material_upload.html (소재입고 [최종등록] 직후 → 코일별 QR 라벨 표시·출력)
//  식별색 띠: mat_grade.js (강종 + 사내 소재 식별색을 크게 표시 — SQ 5_3)
//
//  QR 내용 = material_attach.html?cert=<inspection_certs.id>&c=<코일순번>
//    · IQC 합격 라벨(material_IQC.html)과 같은 QR — 현장 휴대폰으로 찍으면 소재 장착
//    · 장착할 때 시스템이 IQC 판정을 확인하므로, 입고 시 붙인 라벨로도 미검사 코일은 장착 차단
//  코일 = inspection_certs.lots_detail 순서 (코일 태그의 Heat NO. 와 같음)
// ============================================================
(function (g) {
  const PUBLIC_BASE = 'https://knagbyeongju-123.github.io/smtec_main2/';   // 회사 웹 주소 (휴대폰 접속용)
  // 라이브러리는 사이트에 같이 올린 파일(lib/)을 먼저 쓰고, 없으면 CDN — 업체 PC 의 CDN 차단·지연에도 출력되도록
  const HERE = (document.currentScript && document.currentScript.src) ? new URL('.', document.currentScript.src).href : '';
  const QR_GEN_LIB = [HERE + 'lib/qrcode-generator-1.4.4.js', 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
                      'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'];
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function baseUrl() {
    const local = !/^https?:$/.test(location.protocol) || /^(localhost|127\.)/.test(location.hostname);
    return (local ? PUBLIC_BASE : new URL('.', location.href).href) + 'material_attach.html';
  }
  function loadQrGen() {
    if (g.qrcode) return Promise.resolve();
    return QR_GEN_LIB.reduce((chain, url) => chain.catch(() => new Promise((ok, ng) => {
      const el = document.createElement('script');
      el.src = url; el.onload = () => g.qrcode ? ok() : ng(); el.onerror = ng;
      document.head.appendChild(el);
    })), Promise.reject()).catch(() => { throw new Error('QR 라이브러리를 불러오지 못했습니다 (인터넷 확인)'); });
  }
  // 강종 식별 띠 (mat_grade.js) — 없으면 같은 폴더에서 불러옴, 실패해도 라벨은 강종 띠 없이 출력
  function loadGrade() {
    if (g.MatGrade) return Promise.resolve();
    return new Promise((ok) => {
      const el = document.createElement('script');
      el.src = HERE + 'mat_grade.js?v=3'; el.onload = ok; el.onerror = ok;
      document.head.appendChild(el);
    });
  }
  const band = (L) => g.MatGrade ? g.MatGrade.bandHtml(L.material, esc, L.t, L.w) : '';
  const css = () => LABEL_CSS + (g.MatGrade ? g.MatGrade.BAND_CSS : '');
  function qrImg(text) {
    const qr = g.qrcode(0, 'M');
    qr.addData(text); qr.make();
    return qr.createDataURL(6, 0);
  }

  /* 저장된 inspection_certs 행 + 입고 행(코일 중량) → 코일 라벨 목록
     receipts: [{heat_no, thickness, width_mm, receipt_date, net_weight}] */
  function fromCerts(certs, receipts) {
    const out = [];
    (certs || []).forEach((c) => {
      const lots = String(c.lots_detail || '').split(',').map((x) => x.trim()).filter(Boolean);
      const n = Math.max(1, parseInt(c.coil_count, 10) || lots.length || 1);
      for (let i = 1; i <= n; i++) {
        const heat = lots[i - 1] || (n === 1 ? (c.lot_no || c.heat_no) : `${c.heat_no || c.lot_no}-?`);
        const r = (receipts || []).find((x) => String(x.heat_no) === heat && +x.thickness === +c.thickness && +x.width_mm === +c.width_mm
          && (!x.receipt_date || !c.receipt_date || String(x.receipt_date).slice(0, 10) === String(c.receipt_date).slice(0, 10)));
        out.push({ certId: c.id, seq: i, n, heat, material: c.material_type, t: c.thickness, w: c.width_mm,
                   kg: r ? r.net_weight : null, supplier: c.supplier, date: c.receipt_date });
      }
    });
    return out;
  }

  function cardHtml(L, img) {
    return `<div class="lb">
      <div class="hd"><span>입고 소재</span><small>(주)태진다이텍</small></div>
      ${band(L)}
      <div class="bd"><img class="qr" src="${img}" alt="QR">
        <table>
          <tr><th>HEAT</th><td class="heat">${esc(L.heat)}</td></tr>
          <tr><th>재질</th><td>${esc(L.material)}</td></tr>
          <tr><th>규격</th><td>${esc(L.t)}t × ${esc(L.w)}W</td></tr>
          <tr><th>중량</th><td>${L.kg ? Number(L.kg).toLocaleString() + ' kg' : '-'}</td></tr>
          <tr><th>공급사</th><td>${esc(L.supplier || '')}</td></tr>
          <tr><th>입고</th><td>${esc(L.date || '')}</td></tr>
        </table></div>
      <div class="ft"><b>코일 ${L.seq}/${L.n}</b><span>#${esc(L.certId)} · 수입검사 합격 후 장착</span></div>
    </div>`;
  }
  const LABEL_CSS = `
.lb{border:1.5px solid #000;padding:2mm 3mm;display:flex;flex-direction:column;overflow:hidden;break-inside:avoid;page-break-inside:avoid;background:#fff;color:#000;font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif}
.lb .hd{display:flex;justify-content:space-between;align-items:center;background:#1e3a8a;color:#fff;padding:1mm 2mm;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.lb .hd span{font-size:15pt;font-weight:900;letter-spacing:2px} .lb .hd small{font-size:8pt}
.lb .bd{flex:1;display:flex;gap:2mm;align-items:center;padding-top:1.5mm}
.lb .qr{width:30mm;height:30mm;image-rendering:pixelated;flex-shrink:0}
.lb table{border-collapse:collapse;font-size:8.5pt;width:100%;table-layout:fixed}
.lb th{width:12mm;text-align:left;color:#444;font-weight:600;padding:.3mm 0;vertical-align:top}
.lb td{font-weight:700;padding:.3mm 0;word-break:break-all} .lb td.heat{font-size:12pt;font-weight:900}
.lb .ft{border-top:1px solid #000;padding-top:1mm;font-size:7.5pt;display:flex;justify-content:space-between;gap:2mm;align-items:baseline}
.lb .ft b{font-size:10pt}`;

  /* 화면 미리보기 (container 안에 라벨 카드) */
  async function preview(container, labels) {
    await loadQrGen(); await loadGrade();
    const base = baseUrl();
    if (!document.getElementById('coil-label-css')) {
      const st = document.createElement('style'); st.id = 'coil-label-css';
      st.textContent = css() + `.lb-prev{display:grid;grid-template-columns:repeat(auto-fill,minmax(99mm,1fr));gap:6px}.lb-prev .lb{height:67mm}`;
      document.head.appendChild(st);
    }
    container.innerHTML = `<div class="lb-prev">${labels.map((L) => cardHtml(L, qrImg(`${base}?cert=${L.certId}&c=${L.seq}`))).join('')}</div>`;
  }

  /* 출력 창 (size: 'a4' = A4 2×4 99×67mm / 'roll' = 라벨 프린터 100×70mm 1장씩) — 버튼 클릭에서 호출할 것 */
  async function print(labels, size) {
    const w = g.open('', '_blank');
    if (!w) { alert('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.'); return; }
    w.document.write('<p style="font-family:sans-serif;padding:20px">라벨 생성 중...</p>');
    try {
      await loadQrGen(); await loadGrade();
      const base = baseUrl();
      const roll = size === 'roll';
      const cards = labels.map((L) => cardHtml(L, qrImg(`${base}?cert=${L.certId}&c=${L.seq}`))).join('');
      w.document.open();
      w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>소재 QR 라벨 ${labels.length}매</title>
<style>
@page{${roll ? 'size:100mm 70mm;margin:0' : 'size:A4;margin:8mm 6mm'}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo',sans-serif;color:#000}
.bar{padding:10px;background:#f1f5f9;border-bottom:1px solid #cbd5e0;font-size:13px;display:flex;gap:10px;align-items:center}
.bar button{padding:6px 16px;font-size:13px;font-weight:700;cursor:pointer}
.grid{display:grid;${roll ? 'grid-template-columns:100mm;grid-auto-rows:70mm' : 'grid-template-columns:99mm 99mm;grid-auto-rows:67mm;justify-content:center'}}
${css()}
${roll ? '.lb{border:0;padding:3mm;break-after:page;page-break-after:always}' : ''}
@media print{.bar{display:none}}
</style></head><body>
<div class="bar"><b>🏷 소재 QR 라벨 ${labels.length}매</b> ${roll ? '라벨 프린터 100×70mm' : 'A4 2×4 · 99×67mm'} <button onclick="print()">🖨 인쇄</button>
<span style="color:#64748b">코일 태그의 Heat NO.와 라벨 HEAT가 같은 코일에 부착</span></div>
<div class="grid">${cards}</div>
<script>window.onload=function(){setTimeout(function(){print()},300)}<\/script>
</body></html>`);
      w.document.close();
    } catch (e) {
      try { w.close(); } catch (_) {}
      alert('라벨 출력 실패: ' + e.message);
    }
  }

  /* ── PDF 다운로드 ─────────────────────────────────────────
     한글 글꼴을 PDF 에 넣지 않도록 라벨을 캔버스 그림으로 그린 뒤 jsPDF 에 이미지로 넣는다
     size: 'a4' = A4 2×4 (99×67mm) / 'roll' = 100×70mm 1장씩 */
  const JSPDF_LIB = [HERE + 'lib/jspdf-2.5.1.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
                     'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'];
  function loadJsPdf() {
    if (g.jspdf && g.jspdf.jsPDF) return Promise.resolve();
    return JSPDF_LIB.reduce((chain, url) => chain.catch(() => new Promise((ok, ng) => {
      const el = document.createElement('script');
      el.src = url; el.onload = () => (g.jspdf && g.jspdf.jsPDF) ? ok() : ng(); el.onerror = ng;
      document.head.appendChild(el);
    })), Promise.reject()).catch(() => { throw new Error('PDF 라이브러리를 불러오지 못했습니다 (인터넷 확인)'); })
      // 화면을 연 지 오래 지나 불러온 jsPDF 도 출력자 표시·인쇄 기록이 되도록 audit.js 에 연결
      .then(() => { try { g.tjAudit && g.tjAudit.patchPdf && g.tjAudit.patchPdf(); } catch (_) {} });
  }
  function loadImg(src) {
    return new Promise((ok, ng) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ng; im.src = src; });
  }
  const FONT = "'Malgun Gothic','맑은 고딕','Apple SD Gothic Neo','Noto Sans KR',sans-serif";
  /* 라벨 1장을 캔버스에 그림 (W×H mm, 1mm = PX 픽셀) */
  async function drawLabel(L, qrSrc, Wmm, Hmm, border) {
    const PX = 12;
    const cv = document.createElement('canvas');
    cv.width = Wmm * PX; cv.height = Hmm * PX;
    const c = cv.getContext('2d');
    const mm = (v) => v * PX;
    c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
    if (border) { c.strokeStyle = '#000'; c.lineWidth = mm(0.4); c.strokeRect(mm(0.2), mm(0.2), cv.width - mm(0.4), cv.height - mm(0.4)); }
    const P = 3;                                   // 안쪽 여백(mm)
    // 머리글
    c.fillStyle = '#1e3a8a'; c.fillRect(mm(P), mm(P), mm(Wmm - 2 * P), mm(7));
    c.fillStyle = '#fff'; c.textBaseline = 'middle';
    c.font = `900 ${mm(5)}px ${FONT}`; c.fillText('입고 소재', mm(P + 2), mm(P + 3.6));
    c.font = `${mm(2.8)}px ${FONT}`; c.textAlign = 'right'; c.fillText('(주)태진다이텍', mm(Wmm - P - 2), mm(P + 3.6)); c.textAlign = 'left';
    // 강종 띠
    if (g.MatGrade) g.MatGrade.drawBand(c, L.material, mm(P), mm(P + 8), mm(Wmm - 2 * P), mm(8.5), FONT, L.t, L.w);
    // QR
    const qr = await loadImg(qrSrc);
    c.imageSmoothingEnabled = false;
    const qy = P + 18, qs = 29;
    c.drawImage(qr, mm(P), mm(qy), mm(qs), mm(qs));
    // 정보
    const rows = [['HEAT', L.heat, true], ['재질', L.material], ['규격', `${L.t}t × ${L.w}W`],
                  ['중량', L.kg ? Number(L.kg).toLocaleString() + ' kg' : '-'], ['공급사', L.supplier || ''], ['입고', L.date || '']];
    let y = qy + 2; const x0 = P + qs + 3;
    rows.forEach(([k, v, big]) => {
      c.fillStyle = '#444'; c.font = `600 ${mm(2.9)}px ${FONT}`; c.fillText(k, mm(x0), mm(y));
      c.fillStyle = '#000'; c.font = `${big ? 900 : 700} ${mm(big ? 4.2 : 3)}px ${FONT}`;
      c.fillText(String(v), mm(x0 + 12), mm(y), mm(Wmm - x0 - 12 - P));
      y += big ? 5.4 : 4.3;
    });
    // 하단
    const fy = Hmm - P - 4;
    c.strokeStyle = '#000'; c.lineWidth = mm(0.3); c.beginPath(); c.moveTo(mm(P), mm(fy)); c.lineTo(mm(Wmm - P), mm(fy)); c.stroke();
    c.fillStyle = '#000'; c.font = `900 ${mm(3.6)}px ${FONT}`; c.fillText(`코일 ${L.seq}/${L.n}`, mm(P), mm(fy + 2.4));
    c.font = `${mm(2.6)}px ${FONT}`; c.textAlign = 'right'; c.fillText(`#${L.certId} · 수입검사 합격 후 장착`, mm(Wmm - P), mm(fy + 2.4)); c.textAlign = 'left';
    return cv.toDataURL('image/png');
  }
  async function downloadPdf(labels, size, fileName) {
    await loadQrGen(); await loadGrade();
    await loadJsPdf();
    const base = baseUrl();
    const roll = size === 'roll';
    const { jsPDF } = g.jspdf;
    const doc = roll ? new jsPDF({ orientation: 'landscape', unit: 'mm', format: [100, 70] }) : new jsPDF({ unit: 'mm', format: 'a4' });
    const W = roll ? 100 : 99, H = roll ? 70 : 67;
    for (let i = 0; i < labels.length; i++) {
      const L = labels[i];
      const png = await drawLabel(L, qrImg(`${base}?cert=${L.certId}&c=${L.seq}`), W, H, !roll);
      if (roll) {
        if (i) doc.addPage([100, 70], 'landscape');
        doc.addImage(png, 'PNG', 0, 0, W, H, undefined, 'FAST');   // FAST = 압축 (없으면 장당 약 3MB)
      } else {
        const k = i % 8;
        if (i && k === 0) doc.addPage();
        doc.addImage(png, 'PNG', 6 + (k % 2) * 99, 8 + Math.floor(k / 2) * 67, W, H, undefined, 'FAST');
      }
    }
    doc.save(fileName || `소재QR라벨_${labels.length}매.pdf`);
  }

  g.CoilLabel = { fromCerts, preview, print, downloadPdf, drawLabel, baseUrl };
})(window);
