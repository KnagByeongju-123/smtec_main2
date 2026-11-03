// ============================================================
//  coil_label.js — 코일 QR 라벨 (CoilLabel)
//  사용: material_upload.html (소재입고 [최종등록] 직후 → 코일별 QR 라벨 표시·출력)
//
//  QR 내용 = material_attach.html?cert=<inspection_certs.id>&c=<코일순번>
//    · IQC 합격 라벨(material_IQC.html)과 같은 QR — 현장 휴대폰으로 찍으면 소재 장착
//    · 장착할 때 시스템이 IQC 판정을 확인하므로, 입고 시 붙인 라벨로도 미검사 코일은 장착 차단
//  코일 = inspection_certs.lots_detail 순서 (코일 태그의 Heat NO. 와 같음)
// ============================================================
(function (g) {
  const PUBLIC_BASE = 'https://knagbyeongju-123.github.io/smtec_main2/';   // 회사 웹 주소 (휴대폰 접속용)
  const QR_GEN_LIB = ['https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
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
.lb .qr{width:34mm;height:34mm;image-rendering:pixelated;flex-shrink:0}
.lb table{border-collapse:collapse;font-size:8.5pt;width:100%;table-layout:fixed}
.lb th{width:12mm;text-align:left;color:#444;font-weight:600;padding:.3mm 0;vertical-align:top}
.lb td{font-weight:700;padding:.3mm 0;word-break:break-all} .lb td.heat{font-size:12pt;font-weight:900}
.lb .ft{border-top:1px solid #000;padding-top:1mm;font-size:7.5pt;display:flex;justify-content:space-between;gap:2mm;align-items:baseline}
.lb .ft b{font-size:10pt}`;

  /* 화면 미리보기 (container 안에 라벨 카드) */
  async function preview(container, labels) {
    await loadQrGen();
    const base = baseUrl();
    if (!document.getElementById('coil-label-css')) {
      const st = document.createElement('style'); st.id = 'coil-label-css';
      st.textContent = LABEL_CSS + `.lb-prev{display:grid;grid-template-columns:repeat(auto-fill,minmax(99mm,1fr));gap:6px}.lb-prev .lb{height:67mm}`;
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
      await loadQrGen();
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
${LABEL_CSS}
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

  g.CoilLabel = { fromCerts, preview, print, baseUrl };
})(window);
