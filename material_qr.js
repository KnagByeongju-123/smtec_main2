// ============================================================
//  material_qr.js — 코일 QR 장착 공통 모듈 (MatQR)
//  사용: mes_kiosk.html (키오스크에서 바로 스캔·장착), material_attach.html (소재 장착 화면)
//  필요: material_spec.js (MatSpec) 를 먼저 로드
//
//  흐름: 입고 → 수입검사 OK → [🏷 라벨] 출력(QR) → 코일 부착 → 프레스 키오스크에서 QR 스캔 → 장착
//  QR 내용: material_attach.html?cert=<inspection_certs.id>&c=<코일순번>
//
//  · listenScanner : USB/블루투스 바코드 스캐너(키보드 입력형) 입력을 화면 어디서나 받는다
//                    한글 입력 상태여도 물리 키(e.code)로 읽어 글자가 깨지지 않는다
//  · openCamera    : 태블릿/웹캠으로 스캔 (html5-qrcode)
//  · inspect       : IQC 판정·블랙리스트·중복·다른 호기·소진·작업 규격 확인
//  · attach/detach : material_attachment 기록
//  · queueMesInput : PIMMES 원소재 투입 대기(mes_material_input) 저장 → 사내 동기화 프로그램이 PIMMES 반영
//
//  req(method, path, body) : 각 화면의 Supabase REST 호출 함수 (실패 시 throw, JSON 반환)
// ============================================================
(function (g) {
  const T_CERTS = 'inspection_certs';
  const T_ATTACH = 'material_attachment';
  const T_EXCLUDED = 'excluded_heats';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 현재 시각 (DB timestamptz 저장용). UTC ISO 문자열 그대로 보내면 DB 가 정확히 저장하고
  // 화면은 기기 시간대(한국)로 표시한다. ※ 2026-11-03 이전 코드는 시간대를 이중 보정해 ±9시간 오차가 있었음
  function nowKST() {
    return new Date().toISOString();
  }

  /* QR 문자열 → { certId, coil }  (우리 라벨이 아니면 null) */
  function parseCoilQr(text) {
    const s = String(text || '').trim();
    let m = s.match(/[?&]cert=(\d+)/i);
    if (m) {
      const c = s.match(/[?&]c=(\d+)/i);
      return { certId: parseInt(m[1], 10), coil: c ? parseInt(c[1], 10) : null };
    }
    m = s.match(/^SMTEC-COIL[:|](\d+)(?:[:|](\d+))?$/i);
    if (m) return { certId: parseInt(m[1], 10), coil: m[2] ? parseInt(m[2], 10) : null };
    return null;
  }

  /* ── 바코드 스캐너 (키보드 입력형) ──────────────────────────
     스캐너는 글자를 아주 빠르게 연속 입력하고 Enter 로 끝낸다.
     한글 입력 상태면 e.key 가 한글로 바뀌므로 물리 키(e.code)로 글자를 복원한다. */
  const SHIFTED = { Digit1: '!', Digit2: '@', Digit3: '#', Digit4: '$', Digit5: '%', Digit6: '^', Digit7: '&', Digit8: '*', Digit9: '(', Digit0: ')',
    Minus: '_', Equal: '+', BracketLeft: '{', BracketRight: '}', Backslash: '|', Semicolon: ':', Quote: '"', Comma: '<', Period: '>', Slash: '?', Backquote: '~' };
  const PLAIN = { Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`', Space: ' ',
    NumpadDecimal: '.', NumpadSubtract: '-', NumpadAdd: '+', NumpadDivide: '/', NumpadMultiply: '*' };
  function codeToChar(e) {
    // 영문 입력 상태: 키 값(e.key)을 그대로 사용
    if (e.key && e.key.length === 1 && e.key.charCodeAt(0) < 128) return e.key;
    // 한글 입력 상태 등: e.key 가 한글/'Process' 로 바뀌므로 물리 키(e.code)로 복원
    const c = e.code || '';
    let m = c.match(/^Key([A-Z])$/);
    if (m) {
      const upper = e.shiftKey !== (e.getModifierState && e.getModifierState('CapsLock'));
      return upper ? m[1] : m[1].toLowerCase();
    }
    m = c.match(/^(?:Digit|Numpad)(\d)$/);
    if (m) return (e.shiftKey && c.startsWith('Digit')) ? SHIFTED[c] : m[1];
    if (e.shiftKey && SHIFTED[c]) return SHIFTED[c];
    if (PLAIN[c] != null) return PLAIN[c];
    return '';
  }
  function isEditable(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const t = el.tagName;
    if (t === 'TEXTAREA') return !el.readOnly;
    if (t === 'INPUT') return !el.readOnly && !/^(button|checkbox|radio|submit|reset)$/i.test(el.type || '');
    return false;
  }
  /* onScan(text) — 스캐너 1회 입력이 끝날 때 호출. 반환값: 해제 함수 */
  function listenScanner(onScan, opts) {
    const o = Object.assign({ gapMs: 150, minLen: 6 }, opts || {});
    let buf = '', last = 0;
    function h(e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (isEditable(e.target)) return;                 // 무게 입력칸 등 일반 입력은 건드리지 않음
      const now = Date.now();
      if (now - last > o.gapMs) buf = '';
      last = now;
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter' || e.code === 'Tab') {
        if (buf.length >= o.minLen) {
          e.preventDefault(); e.stopPropagation();
          const text = buf; buf = '';
          onScan(text);
        }
        buf = '';
        return;
      }
      const ch = codeToChar(e);
      if (!ch) return;
      buf += ch;
      e.preventDefault();                               // 선택상자 값이 바뀌는 등 화면 오동작 방지
      e.stopPropagation();
    }
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }

  /* ── 카메라 스캔 (html5-qrcode) ── */
  const QR_LIB = ['https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
                  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'];
  function loadQrLib() {
    if (g.Html5Qrcode) return Promise.resolve();
    return QR_LIB.reduce((chain, url) => chain.catch(() => new Promise((ok, ng) => {
      const el = document.createElement('script');
      el.src = url; el.onload = () => g.Html5Qrcode ? ok() : ng(); el.onerror = ng;
      document.head.appendChild(el);
    })), Promise.reject());
  }
  let camState = null;
  function injectCamCss() {
    if (document.getElementById('mqr-css')) return;
    const st = document.createElement('style');
    st.id = 'mqr-css';
    st.textContent = `
.mqr-ov{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:10000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px}
.mqr-box{width:min(92vw,62vh,520px);border-radius:12px;overflow:hidden;background:#000}
.mqr-hint{color:#fff;font-size:clamp(14px,2.6vh,24px);font-weight:700;text-align:center;font-family:inherit}
.mqr-acts{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.mqr-acts button{padding:12px 26px;font-size:clamp(14px,2.4vh,22px);font-weight:800;font-family:inherit;border-radius:10px;border:1px solid #555;background:#222;color:#fff;cursor:pointer}`;
    document.head.appendChild(st);
  }
  /* onText(text): QR 인식 시 / extra: [{t, fn}] 추가 버튼 */
  async function openCamera(onText, extra) {
    if (camState) return;
    injectCamCss();
    const ov = document.createElement('div');
    ov.className = 'mqr-ov';
    ov.innerHTML = '<div class="mqr-box" id="mqrBox"></div><div class="mqr-hint" id="mqrHint">스캐너 준비 중...</div><div class="mqr-acts" id="mqrActs"></div>';
    document.body.appendChild(ov);
    const hint = ov.querySelector('#mqrHint');
    const acts = ov.querySelector('#mqrActs');
    camState = { ov, cam: null };
    (extra || []).concat([{ t: '✕ 닫기' }]).forEach(a => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = a.t;
      b.onclick = () => { closeCamera(); if (a.fn) a.fn(); };
      acts.appendChild(b);
    });
    try { await loadQrLib(); }
    catch (e) { hint.textContent = '❌ 스캐너를 불러오지 못했습니다 (인터넷 확인)'; return; }
    if (!camState) return;
    hint.textContent = '카메라를 켜는 중...';
    const cam = new g.Html5Qrcode('mqrBox', { verbose: false });
    camState.cam = cam;
    const cfg = { fps: 10, qrbox: { width: 240, height: 240 } };
    const hit = (text) => {
      if (!parseCoilQr(text)) { hint.textContent = '⚠️ IQC 합격 라벨 QR이 아닙니다'; return; }
      closeCamera();
      onText(text);
    };
    try {
      await cam.start({ facingMode: 'environment' }, cfg, hit, () => {});
    } catch (e1) {
      try {   // 후면 카메라가 없는 키오스크(전면/USB 웹캠)
        const list = await g.Html5Qrcode.getCameras();
        if (!list || !list.length) throw e1;
        await cam.start(list[0].id, cfg, hit, () => {});
      } catch (e2) {
        hint.textContent = '❌ 카메라를 사용할 수 없습니다';
        return;
      }
    }
    if (camState) hint.textContent = 'IQC 합격 라벨의 QR을 사각형 안에 맞춰 주세요';
  }
  function closeCamera() {
    const s = camState; camState = null;
    if (!s) return;
    const c = s.cam;
    if (c) Promise.resolve().then(() => c.stop()).then(() => c.clear()).catch(() => { try { c.clear(); } catch (e) {} });
    s.ov.remove();
  }

  /* ── 호기 이름 (material_attachment.machine_code 와 같은 형식: '36호기 심팩300톤') ── */
  function composeMachineName(ho, maker, ton) {
    const parts = [];
    if (ho) parts.push(ho + '호기');
    let tail = String(maker || '').trim();
    if (ton) tail += ton + '톤';
    if (tail) parts.push(tail);
    return parts.join(' ');
  }
  let machineMaster = null;
  /* machine_status 행(machine_name '36_300') → 호기 마스터 이름 */
  async function machineNameOf(req, msRow) {
    if (!machineMaster) machineMaster = await req('GET', 'machine_master_tj?select=ho_code,maker,tonnage,active');
    const ho = MatSpec.hoOf(String(msRow && msRow.machine_name || '').split('_')[0]);
    const m = (machineMaster || []).find(x => x.active !== false && MatSpec.hoOf(x.ho_code) === ho);
    return m ? composeMachineName(m.ho_code, m.maker, m.tonnage) : null;
  }

  /* 호기의 현재 작업 규격 (machine_status 현재 금형·품번 → 소재 마스터) */
  async function loadJob(req, machineName) {
    const ho = MatSpec.hoOf(machineName);
    if (ho == null) return null;
    const [msRows, master] = await Promise.all([
      req('GET', 'machine_status?select=machine_code,machine_name,current_mold,current_item_code,item_name,is_virtual'),
      req('GET', 'material_master_tj?select=material_name,material_type,thickness,width,mapped_models,mold_number&limit=5000')
    ]);
    const ms = (msRows || []).find(r => !r.is_virtual && MatSpec.hoOf(String(r.machine_name || '').split('_')[0]) === ho);
    if (!ms) return null;
    const job = MatSpec.findJobSpecs(ms, master || []);
    job.item_name = ms.item_name || '';
    return job;
  }

  /* 코일 QR 확인 → { block:{title,msg} }  또는  { mat, warns[], onThis[], job, chk } */
  async function inspect(req, certId, coil, machineName) {
    if (!machineName) return { block: { title: '호기 미확인', msg: '장착할 호기를 확인할 수 없습니다.' } };
    const certs = await req('GET', `${T_CERTS}?select=id,supplier,material_type,thickness,width_mm,lot_no,lots_detail,heat_no,coil_count,weight,receipt_date,recv_date,final_judge&id=eq.${certId}`);
    const c = certs && certs[0];
    if (!c) return { block: { title: '장착 불가', msg: `등록되지 않은 코일입니다 (#${certId}).\n품질팀에 확인하세요.` } };
    if (!c.heat_no) return { block: { title: '장착 불가', msg: 'HEAT 번호가 없는 입고 데이터입니다. 품질팀에 확인하세요.' } };
    const judge = String(c.final_judge || '').trim().toUpperCase();
    if (judge !== 'OK') return { block: { title: '장착 불가 — IQC 미합격', msg: `HEAT ${c.heat_no}\nIQC 판정: ${c.final_judge || '미검사'}\n\n수입검사 합격(OK) 코일만 장착할 수 있습니다.` } };

    // 코일 HEAT = 코일 태그의 Heat NO. (lots_detail 의 코일순번 번째, 예: SB65954-6)
    const coilCount = parseInt(c.coil_count, 10) || 1;
    const lots = String(c.lots_detail || '').split(',').map(x => x.trim()).filter(Boolean);
    const coilHeat = coil && lots.length >= coil ? lots[coil - 1] : (coilCount <= 1 ? (lots[0] || null) : null);
    const heat = coilHeat || c.heat_no;

    const enc = encodeURIComponent;
    const heats = [...new Set([c.heat_no, coilHeat].filter(Boolean))].map(h => '"' + h.replace(/"/g, '') + '"').join(',');
    const [ex, hist, onThis] = await Promise.all([
      req('GET', `${T_EXCLUDED}?select=heat_no,reason&is_active=eq.true&heat_no=in.(${enc(heats)})`).catch(() => []),
      req('GET', `${T_ATTACH}?select=id,machine_code,status&cert_id=eq.${c.id}`).catch(() => []),
      req('GET', `${T_ATTACH}?select=*&status=eq.attached&machine_code=eq.${enc(machineName)}&order=attach_time.desc`).catch(() => [])
    ]);
    if (ex && ex.length) return { block: { title: '장착 불가 — 사용금지 HEAT', msg: `HEAT ${ex[0].heat_no || heat}\n사유: ${ex[0].reason || '-'}\n\n블랙리스트에 등록된 소재입니다. 품질팀에 연락하세요.` } };

    const coilTxt = coil ? ` (코일 ${coil}/${coilCount})` : '';
    // 중복 장착: 같은 '코일'(코일 HEAT)이 이 호기에 이미 장착된 경우만 차단
    //   같은 입고 묶음(cert)의 다른 코일 (예: SB65954-1 장착중 → SB65954-2) 은 교체로 진행
    const sameCoil = a => a.cert_id === c.id && (coilCount <= 1 || (coilHeat && a.heat_no === coilHeat));
    if ((onThis || []).some(sameCoil)) return { block: { title: '이미 장착됨', msg: `HEAT ${heat}${coilTxt}\n이미 ${machineName}에 장착되어 있습니다.` } };
    const otherMc = [...new Set((hist || []).filter(h => h.status === 'attached' && h.machine_code !== machineName).map(h => h.machine_code))];
    const usedUp = (hist || []).filter(h => h.status === 'consumed').length;
    const warns = [];
    if (coilCount <= 1) {
      if (otherMc.length) return { block: { title: '장착 불가 — 다른 호기에 장착중', msg: `HEAT ${heat}\n현재 ${otherMc.join(', ')}에 장착되어 있습니다.\n\n먼저 그 호기에서 탈착 처리하세요.` } };
      if (usedUp) return { block: { title: '장착 불가 — 소진 처리된 코일', msg: `HEAT ${heat}\n이미 소진 처리된 코일입니다.\n잘못 처리된 경우 품질팀에 연락하세요.` } };
    } else {
      if (otherMc.length) warns.push(`같은 입고LOT 코일이 ${otherMc.join(', ')}에 장착중입니다. 라벨의 코일 번호가 다른지 확인하세요.`);
      if (usedUp >= coilCount) warns.push(`이 입고LOT은 코일 ${coilCount}개 중 ${usedUp}건이 이미 소진 처리되었습니다.`);
    }

    const mat = {
      cert_id: c.id, heat_no: heat, cert_heat: c.heat_no, coil_lot: coilHeat, lot_no: c.lot_no || c.lots_detail || '', supplier: c.supplier || '',
      material_type: c.material_type || '', thickness: parseFloat(c.thickness) || 0, width: parseFloat(c.width_mm) || 0,
      receipt_kg: parseFloat(c.weight) || 0, receipt_date: c.receipt_date || c.recv_date || '',
      cert_no: c.lot_no ? String(c.lot_no).substring(0, 16) : ('CERT-' + c.id),
      coil_seq: coil, coil_count: coilCount,
      lots   // 코일별 로트 (라벨 코일 순번 순서)
    };
    let job = null, chk = { status: 'unknown', diffs: [], spec: null };
    try { job = await loadJob(req, machineName); chk = MatSpec.checkSpec(mat, job); } catch (e) { console.warn('작업 규격 조회 실패:', e); }
    return { mat, warns, onThis: onThis || [], job, chk };
  }

  /* 장착 기록 → 생성된 행 */
  async function attach(req, mat, machineName, user) {
    const u = user || {};
    const rows = await req('POST', T_ATTACH, {
      machine_code: machineName, cert_id: mat.cert_id, cert_no: mat.cert_no, heat_no: mat.heat_no, lot_no: mat.lot_no,
      supplier: mat.supplier, material_type: mat.material_type, thickness: mat.thickness, width: mat.width,
      attach_time: nowKST(), attach_user_id: u.id || null, attach_user_name: u.name || null, attach_user_dept: u.dept || null,
      attach_qty_kg: mat.receipt_kg, status: 'attached'
    });
    return Array.isArray(rows) ? rows[0] : rows;
  }

  /* 탈착 기록 — type: 'normal'(정상 탈착) | 'consumed'(소진) */
  async function detach(req, row, type, user, remainKg) {
    const u = user || {};
    await req('PATCH', `${T_ATTACH}?id=eq.${row.id}&status=eq.attached`, {
      detach_time: nowKST(), detach_user_id: u.id || null, detach_user_name: u.name || null, detach_user_dept: u.dept || null,
      detach_type: type, detach_remain_kg: remainKg == null ? null : remainKg,
      status: type === 'consumed' ? 'consumed' : 'detached'
    });
    await cancelMesInput(req, row, type);
  }

  /* 탈착 시 PIMMES 투입 대기 취소
     · '잘못된 장착'으로 탈착  · 또는 장착 후 5분 안에 탈착 (실수 장착 → 다시 장착 등)
     → 아직 처리 안 된(pending/manual) 투입 대기를 'cancelled' 로. 정상 사용 후 탈착·소진은 그대로 둠 */
  const CANCEL_WITHIN_MS = 5 * 60e3;
  async function cancelMesInput(req, row, type) {
    if (!row || !row.id) return;
    const t = row.attach_time ? new Date(row.attach_time).getTime() : NaN;
    const quick = !isNaN(t) && Date.now() - t < CANCEL_WITHIN_MS;
    if (type !== 'wrong_attach' && !quick) return;
    try {
      await req('PATCH', `mes_material_input?attachment_id=eq.${row.id}&status=in.(pending,manual)`, {
        status: 'cancelled',
        error_msg: type === 'wrong_attach' ? '취소: 잘못된 장착으로 탈착' : '취소: 장착 후 5분 안에 탈착 (실수 장착)'
      });
    } catch (e) { console.warn('[투입 대기 취소 실패]', e); }
  }

  /* ── PIMMES 원소재 투입 대기 ─────────────────────────────
     코일 로트 = inspection_certs.lots_detail 의 (코일순번)번째 (예: SB65954-1)
     PIMMES 입고번호 = 소재 입고(raw_material_receipt) 에서 같은 로트·두께·폭으로 찾은 mes_receipt_no
     → mes_material_input 에 저장 (입고번호를 못 찾으면 status='manual': PIMMES 에서 직접 투입) */
  function coilLotOf(mat) {
    if (mat.coil_lot) return mat.coil_lot;
    const lots = mat.lots || [];
    if (mat.coil_seq && lots.length >= mat.coil_seq) return lots[mat.coil_seq - 1];
    if ((mat.coil_count || 1) <= 1) return lots[0] || mat.cert_heat || mat.heat_no || null;
    return null;   // 여러 코일 LOT 인데 코일 순번을 모름 (목록에서 터치 선택 등)
  }
  async function queueMesInput(req, opt) {
    const { mat, machineName, attachRow, user, source } = opt;
    try {
      const ho = MatSpec.hoOf(machineName);
      const msRows = await req('GET', 'machine_status?select=machine_code,machine_name,current_wo,current_item_code,is_virtual');
      const ms = (msRows || []).find(r => !r.is_virtual && MatSpec.hoOf(String(r.machine_name || '').split('_')[0]) === ho);
      if (!ms) return { status: 'skip', msg: 'PIMMES 설비를 찾지 못함' };
      const lot = coilLotOf(mat);
      let rcp = null;
      if (lot) {
        const enc = encodeURIComponent;
        const rows = await req('GET', `raw_material_receipt?select=item_code,mes_item_code,mes_receipt_no,net_weight&status=eq.synced&heat_no=eq.${enc(lot)}&thickness=eq.${mat.thickness}&width_mm=eq.${mat.width}&order=id.desc&limit=1`).catch(() => []);
        rcp = rows && rows[0] && rows[0].mes_receipt_no ? rows[0] : null;
      }
      const reason = !lot ? '코일 순번을 알 수 없음 (라벨 QR 이 아닌 목록 선택)' : !rcp ? `PIMMES 입고번호를 찾지 못함 (로트 ${lot})` : null;
      const row = {
        attachment_id: attachRow && attachRow.id || null, cert_id: mat.cert_id, coil_seq: mat.coil_seq || null, source: source || null,
        machine_code: ms.machine_code, machine_name: ms.machine_name, attach_machine: machineName,
        work_order_no: ms.current_wo || null, item_code: ms.current_item_code || null,
        raw_item_code: rcp ? (rcp.mes_item_code || rcp.item_code) : null, heat_no: lot || mat.heat_no,
        receipt_no: rcp ? rcp.mes_receipt_no : null, net_weight: rcp ? rcp.net_weight : null,
        input_time: (attachRow && attachRow.attach_time) || nowKST(), worker: (user && user.name) || null,
        status: reason ? 'manual' : 'pending', error_msg: reason
      };
      const saved = await req('POST', 'mes_material_input', row);
      return { status: row.status, msg: reason, row: Array.isArray(saved) ? saved[0] : saved };
    } catch (e) {
      console.warn('[PIMMES 투입 대기 저장 실패]', e);
      return { status: 'fail', msg: e.message };
    }
  }
  const MES_LABEL = { cancelled: 'PIMMES 투입 취소', pending: 'PIMMES 반영 대기', processing: 'PIMMES 반영 중', synced: 'PIMMES 반영 완료', error: 'PIMMES 반영 오류', manual: 'PIMMES 직접 투입 필요', skip: 'PIMMES 연동 안 됨', fail: 'PIMMES 대기 저장 실패' };
  function mesText(r) { return r ? (MES_LABEL[r.status] || r.status) + (r.msg ? ` — ${r.msg}` : '') : ''; }

  /* 확인창에 넣을 작업 규격 안내 HTML (cls: 화면별 CSS 클래스 접두) */
  function jobHtml(res) {
    const { job, chk } = res;
    const name = job ? esc([job.item, job.item_name].filter(Boolean).join(' ')) : '';
    if (chk.status === 'mismatch') {
      return `<div class="mq-mis">🚫 규격 불일치 — 오투입 주의<br>${chk.diffs.map(esc).join('<br>')}</div>
        <div class="mq-job">현재 작업 ${name || '-'}<br>필요 규격 <b>${esc(MatSpec.specText(chk.spec))}</b> (${esc(job.by)})</div>`;
    }
    if (chk.status === 'ok') {
      return `<div class="mq-job ok">✅ 작업 규격 일치 · ${name || '-'}<br>필요 규격 <b>${esc(MatSpec.specText(chk.spec))}</b> (${esc(job.by)})</div>`;
    }
    return `<div class="mq-warn">작업 규격을 확인할 수 없습니다${job ? ` (품번 ${esc(job.item || '-')} · 금형 ${esc(job.mold || '-')} — 소재마스터 미등록)` : ''}.<br>작업지시서의 소재 규격을 직접 확인하세요.</div>`;
  }

  function feedback(ok) {
    try { if (navigator.vibrate) navigator.vibrate(ok ? 60 : [120, 60, 120]); } catch (e) {}
    try {
      const ac = new (g.AudioContext || g.webkitAudioContext)();
      const o = ac.createOscillator(), gn = ac.createGain();
      o.frequency.value = ok ? 1200 : 300; gn.gain.value = 0.15;
      o.connect(gn); gn.connect(ac.destination); o.start();
      setTimeout(() => { o.stop(); ac.close(); }, ok ? 120 : 400);
    } catch (e) {}
  }

  g.MatQR = { esc, nowKST, parseCoilQr, codeToChar, listenScanner, openCamera, closeCamera,
    composeMachineName, machineNameOf, loadJob, inspect, attach, detach, jobHtml, feedback,
    coilLotOf, queueMesInput, cancelMesInput, mesText, MES_LABEL };
})(window);
