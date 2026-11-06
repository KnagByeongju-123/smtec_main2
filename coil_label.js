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
    // QR
    const qr = await loadImg(qrSrc);
    c.imageSmoothingEnabled = false;
    const qy = P + 9.5, qs = 34;
    c.drawImage(qr, mm(P), mm(qy), mm(qs), mm(qs));
    // 정보
    const rows = [['HEAT', L.heat, true], ['재질', L.material], ['규격', `${L.t}t × ${L.w}W`],
                  ['중량', L.kg ? Number(L.kg).toLocaleString() + ' kg' : '-'], ['공급사', L.supplier || ''], ['입고', L.date || '']];
    let y = qy + 3; const x0 = P + qs + 3;
    rows.forEach(([k, v, big]) => {
      c.fillStyle = '#444'; c.font = `600 ${mm(2.9)}px ${FONT}`; c.fillText(k, mm(x0), mm(y));
      c.fillStyle = '#000'; c.font = `${big ? 900 : 700} ${mm(big ? 4.2 : 3)}px ${FONT}`;
      c.fillText(String(v), mm(x0 + 12), mm(y), mm(Wmm - x0 - 12 - P));
      y += big ? 6 : 4.6;
    });
    // 하단
    const fy = Hmm - P - 4;
    c.strokeStyle = '#000'; c.lineWidth = mm(0.3); c.beginPath(); c.moveTo(mm(P), mm(fy)); c.lineTo(mm(Wmm - P), mm(fy)); c.stroke();
    c.fillStyle = '#000'; c.font = `900 ${mm(3.6)}px ${FONT}`; c.fillText(`코일 ${L.seq}/${L.n}`, mm(P), mm(fy + 2.4));
    c.font = `${mm(2.6)}px ${FONT}`; c.textAlign = 'right'; c.fillText(`#${L.certId} · 수입검사 합격 후 장착`, mm(Wmm - P), mm(fy + 2.4)); c.textAlign = 'left';
    return cv.toDataURL('image/png');
  }
  async function downloadPdf(labels, size, fileName) {
    await loadQrGen();
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

  /* ── Zebra 라벨 프린터 (ZPL) ─────────────────────────────
     PDF·브라우저 인쇄는 드라이버가 그림을 늘리고 회색을 점으로 바꿔(디더링) 감열 프린터에서 흐리게 나온다
     → 프린터 해상도(203dpi = 8 dots/mm, 300dpi = 12 dots/mm)에 딱 맞춘 흑백 그림을 직접 만들어 ZPL(^GFA)로 보낸다
       · QR 은 칸 하나를 정수 도트로 그려 경계가 깨끗하다 · 글자는 굵게, 회색 없이 검정만
       · 한글은 프린터 글꼴이 없어도 그림으로 들어가므로 깨지지 않는다
     opt: {dpmm: 8|12, w: 100, h: 70}(mm)  · 라벨 L 에 title/sub/foot 가 있으면 머리글·하단 문구로 사용 (IQC 합격 라벨) */
  function monoLabel(L, url, dpmm, Wmm, Hmm) {
    const d = dpmm, cv = document.createElement('canvas');
    cv.width = Math.round(Wmm * d); cv.height = Math.round(Hmm * d);
    const c = cv.getContext('2d');
    const mm = (v) => Math.round(v * d);
    c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = '#000'; c.textBaseline = 'middle';
    const P = 2.5;
    // 머리글 (검정 바탕 흰 글자)
    c.fillRect(mm(P), mm(P), cv.width - 2 * mm(P), mm(8));
    c.fillStyle = '#fff';
    c.font = `900 ${mm(5.6)}px ${FONT}`; c.fillText(L.title || '입고 소재', mm(P + 2), mm(P + 4.2));
    c.font = `700 ${mm(3.4)}px ${FONT}`; c.textAlign = 'right'; c.fillText(L.sub || '(주)태진다이텍', cv.width - mm(P + 2), mm(P + 4.2)); c.textAlign = 'left';
    c.fillStyle = '#000';
    // QR — 칸 크기를 정수 도트로
    const q = g.qrcode(0, 'M'); q.addData(url); q.make();
    const n = q.getModuleCount(), box = mm(Math.min(36, Hmm - 24)), m = Math.max(2, Math.floor(box / n));
    const qx = mm(P + 0.5), qy = mm(P + 10.5) + Math.floor((box - m * n) / 2);
    for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect(qx + k * m, qy + r * m, m, m);
    // 정보
    const x0 = qx + box + mm(3), xv = x0 + mm(13), maxW = cv.width - mm(P) - xv;
    const rows = [['HEAT', L.heat, 1], ['재질', L.material], ['규격', `${L.t}t × ${L.w}W`],
                  ['중량', L.kg ? Number(L.kg).toLocaleString() + ' kg' : '-'], ['공급사', L.supplier || ''], ['입고', L.date || '']];
    let y = mm(P + 13);
    rows.forEach(([k, v, big]) => {
      c.font = `700 ${mm(3.3)}px ${FONT}`; c.fillText(k, x0, y);
      c.font = `${big ? 900 : 700} ${mm(big ? 5.4 : 3.7)}px ${FONT}`;
      c.fillText(String(v), xv, y, maxW);
      y += mm(big ? 7 : 5.2);
    });
    // 하단
    const fy = cv.height - mm(P + 6);
    c.fillRect(mm(P), fy, cv.width - 2 * mm(P), Math.max(2, mm(0.3)));
    c.font = `900 ${mm(4.6)}px ${FONT}`; c.fillText(`코일 ${L.seq}/${L.n}`, mm(P), fy + mm(3.4));
    c.font = `700 ${mm(3)}px ${FONT}`; c.textAlign = 'right'; c.fillText(L.foot || `#${L.certId} · 수입검사 합격 후 장착`, cv.width - mm(P), fy + mm(3.4), cv.width - mm(P + 30)); c.textAlign = 'left';
    return cv;
  }
  // 캔버스 → ZPL ^GFA (흑백 1비트, Zebra ASCII 압축)
  function gfa(cv) {
    const W = cv.width, H = cv.height, bpr = Math.ceil(W / 8);
    const px = cv.getContext('2d').getImageData(0, 0, W, H).data;
    const HEX = '0123456789ABCDEF';
    const cnt = (n) => { let s = ''; while (n >= 400) { s += 'z'; n -= 400; } if (n >= 20) { s += String.fromCharCode(102 + Math.floor(n / 20)); n %= 20; } if (n) s += String.fromCharCode(70 + n); return s; };
    let out = '', prev = null;
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let b = 0; b < bpr; b++) {
        let v = 0;
        for (let i = 0; i < 8; i++) {
          const x = b * 8 + i; if (x >= W) continue;
          const o = (y * W + x) * 4;
          if (px[o] * 0.3 + px[o + 1] * 0.59 + px[o + 2] * 0.11 < 140) v |= 0x80 >> i;
        }
        row += HEX[v >> 4] + HEX[v & 15];
      }
      if (row === prev) { out += ':'; continue; }
      prev = row;
      let r = row, tail = '';
      const z = r.match(/0+$/); if (z) { r = r.slice(0, -z[0].length); tail = ','; }
      if (!r) { out += ','; continue; }
      let i = 0;
      while (i < r.length) { let j = i; while (j < r.length && r[j] === r[i]) j++; out += (j - i > 1 ? cnt(j - i) : '') + r[i]; i = j; }
      out += tail;
    }
    return { total: bpr * H, bpr, data: out };
  }
  function toZpl(labels, opt) {
    opt = opt || {};
    const d = opt.dpmm || 8, Wmm = opt.w || 100, Hmm = opt.h || 70, base = baseUrl();
    return labels.map((L) => {
      const g1 = gfa(monoLabel(L, `${base}?cert=${L.certId}&c=${L.seq}`, d, Wmm, Hmm));
      return `^XA\n^FX 소재 QR 라벨 ${L.heat} (코일 ${L.seq}/${L.n}, #${L.certId})\n^PW${Math.round(Wmm * d)}^LL${Math.round(Hmm * d)}^LH0,0^PR3^CI28\n`
        + `^FO0,0^GFA,${g1.total},${g1.total},${g1.bpr},${g1.data}^FS\n^PQ1\n^XZ\n`;
    }).join('');
  }
  function saveText(text, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  // Zebra Browser Print(PC 에 설치된 Zebra 프로그램)가 있으면 바로 출력, 없으면 .zpl 파일로 저장
  async function zebraBrowserPrint(zpl) {
    for (const host of ['http://127.0.0.1:9100', 'https://127.0.0.1:9101']) {
      try {
        const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 2500);
        const r = await fetch(host + '/default?type=printer', { signal: ac.signal }); clearTimeout(t);
        if (!r.ok) continue;
        const dev = await r.json().catch(() => null);
        if (!dev || !dev.uid) continue;
        const w = await fetch(host + '/write', { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ device: dev, data: zpl }) });
        if (w.ok) return dev.name || 'Zebra';
      } catch (_) {}
    }
    return null;
  }
  async function zebra(labels, opt, fileName) {
    await loadQrGen();
    const zpl = toZpl(labels, opt);
    const log = (via) => { try { g.tjAudit && g.tjAudit.send('print', { title: `소재 QR 라벨 ${labels.length}매 (Zebra)`, detail: { via, labels: labels.length, dpmm: (opt || {}).dpmm || 8 } }); } catch (_) {} };
    if (!(opt && opt.fileOnly)) {
      const name = await zebraBrowserPrint(zpl);
      if (name) { log('zebra-browserprint'); return { printed: name }; }
    }
    saveText(zpl, fileName || `소재QR라벨_${labels.length}매.zpl`);
    log('zebra-zpl-file');
    return { file: true };
  }

  g.CoilLabel = { fromCerts, preview, print, downloadPdf, drawLabel, baseUrl, monoLabel, toZpl, zebra };
})(window);
