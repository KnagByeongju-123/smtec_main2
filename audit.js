// ============================================================
//  audit.js — 웹 화면 접속·수정·인쇄 기록 (모든 HTML <head> 맨 앞에서 로드)
//   ① 접속   : 화면을 열면 누가·어느 PC에서·언제 열었는지 기록
//   ② 수정   : Supabase 쓰기(POST/PATCH/PUT/DELETE) 요청을 30초 단위로 모아 기록
//   ③ 인쇄   : 인쇄 창을 열 때 기록 + 인쇄물 모든 페이지 하단에 출력자 표시
//              (종이·PDF 구분은 브라우저가 알려주지 않음 → 출력물 하단 표시로 추적)
//              새 창(window.open)으로 만드는 인쇄 화면에도 같은 표시를 넣는다
//  사용자 : 포털(index.html) 로그인(localStorage 'esg_pin_auth') 을 그대로 쓰고,
//           없으면 PIN 입력 (user_pin.pin_hash 대조). 로그인 없이는 인쇄 내용이 가려진다
//  IP    : 기록 서버(Edge Function audit-log)가 요청 헤더에서 확인한다
//  기록은 audit_log 테이블에만 쌓이며 화면에서 읽거나 고칠 수 없다 (조회: audit_view.html)
// ============================================================
(function () {
  if (window.__TJ_AUDIT__) return;
  window.__TJ_AUDIT__ = true;

  const AUDIT_URL = 'https://omngtyewdaqpphnzeate.supabase.co/functions/v1/audit-log';
  const MAIN_URL = 'https://omngtyewdaqpphnzeate.supabase.co';
  const MAIN_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tbmd0eWV3ZGFxcHBobnplYXRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODk4ODksImV4cCI6MjA5MDQ2NTg4OX0.Zxur3t02JHtOcXforCMSwO3i2mMaf5sViE0tXXUC0-s';
  const LK_AUTH = 'esg_pin_auth';      // 포털과 같은 로그인 키 (7일)
  const LK_USER = 'tj_audit_user';     // {id, name, dept}
  const AUTH_DAYS = 7;
  const EDIT_FLUSH_MS = 30000;
  // 다른 주소에서 불러 쓰는 화면은 window.__TJ_AUDIT_PAGE__ 로 화면 이름을 지정 (예: worker_voice.html)
  const PAGE = window.__TJ_AUDIT_PAGE__ || (location.pathname.split('/').pop() || 'index.html');
  // 무인 표시 화면: 로그인 창을 띄우지 않는다 (인쇄는 로그인 필요)
  const DISPLAY_PAGES = ['mes_kiosk.html', 'QC_mes.html', 'counter_dashboard.html', 'env_dashboard.html', 'twin_factory.html', 'twin_factory_3d_QC.html', 'mes_work_virtual.html', 'camera.html', 'mon.html'];
  // 협력사(소재업체)가 쓰는 화면: 사내 PIN 이 없으므로 로그인 필수에서 제외
  //   사내 로그인이 있으면 그 사용자로, 없으면 화면이 넣은 업체(localStorage 'vendor_upload_auth' = {code,name})로 기록
  const VENDOR_PAGES = ['material_upload.html'];
  // 자체 잠금 화면이 있는 포털: 포털 로그인이 끝나면 그 사용자로 기록
  const OWN_LOGIN_PAGES = ['index.html', ''];
  // 자체 PIN 잠금 + 자체 기록을 하는 화면: 들어올 때마다 PIN 을 받고, 접속·로그인·항목별 수정 내용을 화면이 직접 보낸다
  //   (사용자는 window.__TJ_AUDIT_USER__ 로 지정 · 원본 저장 요청(kv_store)은 내용 파악이 안 되므로 따로 기록하지 않음)
  const SELF_AUDIT_PAGES = ['safety_voice.html', 'worker_voice.html'];
  const SELF = SELF_AUDIT_PAGES.indexOf(PAGE) >= 0;
  // 포털 탭(내장 창)으로 열린 화면: 입력 창은 바깥 포털에서만 띄운다
  const IN_FRAME = (() => { try { return window.top !== window && !!window.top.__TJ_AUDIT__; } catch (_) { return false; } })();

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };
  const origFetch = window.fetch.bind(window);

  // ---------- 사용자·단말 ----------
  // 기기 이름은 사원 정보로 자동 생성: 부서-이름-기기종류 (예: 품질관리팀-김상기-PC, 생산팀-하경자-모바일)
  const UA = navigator.userAgent || '';
  const KIND = /iPad|Tablet/i.test(UA) || (/Android/i.test(UA) && !/Mobi/i.test(UA)) ? '태블릿' : /Mobi|iPhone|Android/i.test(UA) ? '모바일' : 'PC';
  function device() {
    const u = user();
    if (!u) return '';
    return [u.dept, u.name, KIND].filter(Boolean).join('-');
  }
  function user() {
    if (SELF) return window.__TJ_AUDIT_USER__ || null;
    const a = ls.get(LK_AUTH);
    if (!a || !a.name || (a.exp && a.exp < Date.now())) {
      if (VENDOR_PAGES.indexOf(PAGE) < 0) return null;
      const v = ls.get('vendor_upload_auth');
      return { id: 'VENDOR' + (v && v.code ? '-' + v.code : ''), name: (v && v.name) || '협력사(업체 미선택)', dept: '협력사' };
    }
    const u = ls.get(LK_USER);
    return u && u.name === a.name ? u : { id: '', name: a.name, dept: '' };
  }
  async function resolveUser(name) {
    // 포털 로그인으로 이름만 있을 때 user_pin 의 id·부서를 채운다
    try {
      const r = await origFetch(`${MAIN_URL}/rest/v1/user_pin?select=id,name,dept,emp_id&name=eq.${encodeURIComponent(name)}`, { headers: { apikey: MAIN_KEY, Authorization: `Bearer ${MAIN_KEY}` } });
      const u = r.ok ? (await r.json())[0] : null;
      if (u) ls.set(LK_USER, { id: String(u.emp_id || u.id), name: u.name, dept: u.dept || '' });
    } catch (_) {}
  }
  async function sha256hex(s) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  // ---------- 기록 전송 ----------
  function send(kind, extra) {
    const u = user();
    const body = JSON.stringify(Object.assign({
      kind, page: PAGE, title: document.title || '', doc: location.search.replace(/([?&])_v=[^&]*&?/, '$1').replace(/[?&]$/, ''),
      user_id: u ? u.id : '', user_name: u ? u.name : '(미로그인)', dept: u ? u.dept : '', device: device(),
    }, extra || {}));
    try {
      origFetch(AUDIT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch (_) {}
  }
  window.tjAudit = { send, user, device };

  // ---------- ② 수정 기록 (fetch 가로채기) ----------
  const edits = {};
  function summarizeBody(b) {
    if (b == null) return '';
    let s = typeof b === 'string' ? b : (b instanceof URLSearchParams ? b.toString() : '');
    return s.length > 600 ? s.slice(0, 600) + `…(${s.length}자)` : s;
  }
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    const p = origFetch(input, init);
    if (!SELF && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && url.indexOf('/rest/v1/') >= 0 && url.indexOf(AUDIT_URL) < 0) {
      let table = '', query = '';
      try { const U = new URL(url, location.href); table = U.pathname.split('/rest/v1/')[1] || ''; query = U.search.slice(0, 300); } catch (_) {}
      const key = method + ' ' + table;
      p.then((res) => {
        const e = edits[key] || (edits[key] = { method, table, count: 0, fail: 0, first: new Date().toISOString(), samples: [] });
        e.count++; if (!res.ok) e.fail++;
        e.last = new Date().toISOString(); e.status = res.status;
        // PIN 등 민감 테이블은 내용 없이 건수만 남긴다
        if (e.samples.length < 3) e.samples.push({ q: query, body: /pin|user|auth|secret/i.test(table) ? '(내용 생략)' : summarizeBody(init && init.body) });
      }).catch(() => {});
    }
    return p;
  };
  function flushEdits() {
    const list = Object.values(edits);
    if (!list.length) return;
    Object.keys(edits).forEach((k) => delete edits[k]);
    list.forEach((e) => send('edit', { detail: e }));
  }
  setInterval(flushEdits, EDIT_FLUSH_MS);
  window.addEventListener('pagehide', flushEdits);

  // ---------- ③ 인쇄 표시·기록 ----------
  const pad = (n) => String(n).padStart(2, '0');
  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function markText(title) {
    const u = user();
    return u ? `출력자: ${u.name}${u.id ? '(' + u.id + ')' : ''}${u.dept ? ' · ' + u.dept : ''} · ${stamp()} · ${KIND} · ${title || document.title || PAGE} · 출력본(비관리본)`
      : '로그인하지 않은 출력 — 무효';
  }
  const PRINT_CSS = `
#tj-print-mark{display:none}
@media print{
  #tj-print-mark{display:block!important;visibility:visible!important;position:fixed!important;left:0;right:0;bottom:0;
    font:9px/1.3 'Malgun Gothic',sans-serif!important;color:#444!important;background:#fff!important;text-align:center;
    border-top:1px solid #999;padding:2px 4px;z-index:2147483647}
  body.tj-noauth > *:not(#tj-print-block){display:none!important}
  body.tj-noauth #tj-print-block{display:block!important;visibility:visible!important;font:20px 'Malgun Gothic',sans-serif;padding:40px}
}
#tj-print-block{display:none}`;
  function decorate(doc, title) {
    if (!doc || !doc.body) return;
    if (!doc.getElementById('tj-print-style')) {
      const st = doc.createElement('style'); st.id = 'tj-print-style'; st.textContent = PRINT_CSS;
      (doc.head || doc.documentElement).appendChild(st);
    }
    let m = doc.getElementById('tj-print-mark');
    if (!m) { m = doc.createElement('div'); m.id = 'tj-print-mark'; doc.body.appendChild(m); }
    m.textContent = markText(title);
    let b = doc.getElementById('tj-print-block');
    if (!b) { b = doc.createElement('div'); b.id = 'tj-print-block'; b.textContent = '로그인 후 인쇄할 수 있습니다. 화면에서 PIN 로그인 후 다시 인쇄해 주세요.'; doc.body.appendChild(b); }
    doc.body.classList.toggle('tj-noauth', !user());
  }
  function onPrint(doc, title, via) {
    decorate(doc, title);
    // 같은 문서의 print() 호출과 beforeprint 가 함께 들어오면 한 번만 기록
    const now = Date.now();
    if (doc.__tjLastPrint && now - doc.__tjLastPrint < 3000) return;
    doc.__tjLastPrint = now;
    send('print', { title: title || document.title, detail: { via, loggedIn: !!user(), mark: markText(title) } });
    if (!user()) setTimeout(() => showLogin('인쇄하려면 로그인이 필요합니다'), 300);
  }
  window.addEventListener('beforeprint', () => onPrint(document, document.title, 'page'));

  // ---------- ③-2 PDF 직접 생성 (jsPDF·html2pdf): 브라우저 인쇄를 거치지 않으므로 따로 잡는다 ----------
  //  모든 페이지 하단에 출력자 표시를 그림으로 넣고 인쇄 기록(via: pdf-save / pdf-output)을 남긴다
  //  로그인하지 않았으면 PDF 저장을 막는다
  function markImage(text) {
    const c = document.createElement('canvas');
    c.width = 2400; c.height = 40;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#444444'; g.font = "22px 'Malgun Gothic','맑은 고딕',sans-serif";
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2 + 1);
    g.fillStyle = '#999999'; g.fillRect(0, 0, c.width, 1);
    return { url: c.toDataURL('image/png'), ratio: c.height / c.width };
  }
  function markPdf(pdf, via, name) {
    if (!pdf || pdf.__tjMarked) return true;
    if (!user()) { showLogin('PDF로 저장하려면 로그인이 필요합니다'); return false; }
    const title = (typeof name === 'string' && name) || document.title;
    const text = markText(title);
    let pages = 0;
    try {
      const img = markImage(text);
      pages = pdf.getNumberOfPages();
      const cur = pdf.getCurrentPageInfo ? pdf.getCurrentPageInfo().pageNumber : pages;
      for (let i = 1; i <= pages; i++) {
        pdf.setPage(i);
        const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
        const w = W * 0.92, h = w * img.ratio;
        pdf.addImage(img.url, 'PNG', (W - w) / 2, H - h - H * 0.004, w, h);
      }
      pdf.setPage(cur);
    } catch (_) {}
    pdf.__tjMarked = true;
    send('print', { title: document.title, detail: { via, file: typeof name === 'string' ? name : '', pages, loggedIn: true, mark: text } });
    return true;
  }
  // jsPDF 2.x 는 save/output 을 문서(인스턴스)마다 만들므로, 생성자를 감싸 새 문서마다 연결한다
  function hookPdfDoc(doc) {
    if (!doc || doc.__tjHooked) return doc;
    const os = doc.save, oo = doc.output;
    if (typeof os === 'function') doc.save = function (name) { if (!markPdf(this, 'pdf-save', name)) return this; return os.apply(this, arguments); };
    if (typeof oo === 'function') doc.output = function (type) {
      // 미리보기·파일로 내보내는 출력만 표시 (로그인 안 됐으면 표시 없이 원래대로 — 저장은 save 에서 막음)
      if (type && /blob|uri|url|window/i.test(type) && user()) markPdf(this, 'pdf-output', document.title);
      return oo.apply(this, arguments);
    };
    doc.__tjHooked = true;
    return doc;
  }
  function wrapCtor(holder, key) {
    const Orig = holder && holder[key];
    if (typeof Orig !== 'function' || Orig.__tjWrapped) return;
    const TJ = function () { return hookPdfDoc(new (Function.prototype.bind.apply(Orig, [null].concat([].slice.call(arguments))))()); };
    TJ.prototype = Orig.prototype;
    Object.setPrototypeOf(TJ, Orig);   // API·version 등 정적 속성 그대로
    TJ.__tjWrapped = true;
    try { holder[key] = TJ; } catch (_) {}
  }
  function patchPdfLibs() {
    if (window.jspdf) wrapCtor(window.jspdf, 'jsPDF');
    if (window.jsPDF) wrapCtor(window, 'jsPDF');
    const H2 = window.html2pdf;
    if (H2 && H2.Worker && !H2.Worker.prototype.__tjPatched) {
      const W = H2.Worker.prototype, os = W.save;
      W.save = function (filename) {
        return this.toPdf().then(function () {
          if (!markPdf(this.prop.pdf, 'pdf-save', filename || (this.opt && this.opt.filename))) throw new Error('로그인 후 PDF 저장 가능');
        }).then(function () { return os.call(this, filename); });
      };
      W.__tjPatched = true;
    }
  }
  // PDF 라이브러리는 audit.js 뒤에 로드되므로 로드 후·잠시 동안 확인
  document.addEventListener('DOMContentLoaded', patchPdfLibs);
  window.addEventListener('load', patchPdfLibs);
  (function () { let n = 0; const t = setInterval(() => { patchPdfLibs(); if (++n > 30) clearInterval(t); }, 1000); })();
  // 버튼을 누를 때 PDF 라이브러리를 늦게 불러오는 화면(coil_label.js 등)은 불러온 직후 이것을 호출
  window.tjAudit.patchPdf = patchPdfLibs;

  // 새 창 인쇄: window.open 으로 연 같은 출처 창의 print() 와 Ctrl+P 를 잡는다
  const origOpen = window.open;
  window.open = function () {
    const w = origOpen.apply(window, arguments);
    try {
      if (w) {
        const hook = () => {
          try {
            if (w.__tjHooked) return;
            const op = w.print;
            w.print = function () { try { onPrint(w.document, w.document.title || document.title, 'popup'); } catch (_) {} return op.apply(w, arguments); };
            w.__tjHooked = true;
          } catch (_) {}
        };
        hook();
        // document.write 로 내용을 채운 뒤에도 표시·Ctrl+P 처리가 되도록 잠시 확인
        let n = 0;
        const t = setInterval(() => {
          n++;
          try {
            hook();
            const d = w.document;
            if (d && d.body && d.body.childNodes.length && !d.__tjDecorated) {
              d.__tjDecorated = true;
              decorate(d, d.title || document.title);
              w.addEventListener('beforeprint', () => onPrint(w.document, w.document.title || document.title, 'popup-ctrlp'));
            }
          } catch (_) { clearInterval(t); }
          if (n > 40 || w.closed) clearInterval(t);
        }, 250);
      }
    } catch (_) {}
    return w;
  };

  // ---------- 로그인 창 ----------
  let loginShown = false;
  function showLogin(msg) {
    if (loginShown || !document.body) return;
    loginShown = true;
    const box = document.createElement('div');
    box.id = 'tj-login';
    box.innerHTML = `
<div style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2147483646;display:flex;align-items:center;justify-content:center;font-family:'Malgun Gothic',sans-serif">
 <div style="background:#fff;color:#111;border-radius:10px;padding:22px 24px;width:min(360px,92vw);box-shadow:0 8px 30px rgba(0,0,0,.4)">
  <div style="font-size:18px;font-weight:800;margin-bottom:4px">사용자 확인</div>
  <div style="font-size:12px;color:#555;margin-bottom:14px">${msg || '사원번호(PIN)를 입력해야 화면을 사용할 수 있습니다 (7일 유지)'}</div>
  <input id="tj-pin" type="password" inputmode="numeric" maxlength="8" placeholder="PIN" style="width:100%;font-size:22px;padding:8px;letter-spacing:6px;text-align:center;border:1px solid #bbb;border-radius:6px">
  <div id="tj-err" style="color:#c00;font-size:12px;height:16px;margin-top:6px"></div>
  <div style="display:flex;gap:8px;margin-top:6px">
   <button id="tj-later" style="display:none;flex:1;padding:9px;border:0;border-radius:6px;background:#ddd;cursor:pointer">임시 사용</button>
   <button id="tj-ok" style="flex:2;padding:9px;border:0;border-radius:6px;background:#0a2a8c;color:#fff;font-weight:700;cursor:pointer">확인</button>
  </div>
 </div>
</div>`;
    document.body.appendChild(box);
    const $ = (id) => document.getElementById(id);
    const close = () => { box.remove(); loginShown = false; };
    // 로그인 필수: 닫기 없음. 서버 장애로 확인이 안 될 때만 '임시 사용'(미로그인 기록)을 연다
    $('tj-later').onclick = () => { send('login', { detail: { via: 'temp-use', reason: 'server-unreachable' } }); close(); };
    const ok = async () => {
      const pin = $('tj-pin').value.trim();
      if (!/^\d{3,8}$/.test(pin)) { $('tj-err').textContent = 'PIN 을 확인해 주세요'; return; }
      $('tj-err').textContent = '확인 중…';
      try {
        const h = await sha256hex(pin);
        const r = await origFetch(`${MAIN_URL}/rest/v1/user_pin?select=id,name,dept,emp_id&pin_hash=eq.${h}`, { headers: { apikey: MAIN_KEY, Authorization: `Bearer ${MAIN_KEY}` } });
        const u = r.ok ? (await r.json())[0] : null;
        if (!u) { $('tj-err').textContent = '등록되지 않은 PIN 입니다'; return; }
        ls.set(LK_AUTH, { name: u.name, pin: '', exp: Date.now() + AUTH_DAYS * 86400e3 });
        ls.set(LK_USER, { id: String(u.emp_id || u.id), name: u.name, dept: u.dept || '' });
        send('login', { detail: { via: 'audit.js' } });
        close();
        document.body.classList.remove('tj-noauth');
      } catch (e) { $('tj-err').textContent = '서버 연결 실패 — 다시 시도하거나 임시 사용'; $('tj-later').style.display = ''; }
    };
    $('tj-ok').onclick = ok;
    $('tj-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    setTimeout(() => $('tj-pin').focus(), 50);
  }

  // ---------- ① 접속 기록 ----------
  async function ensureUser(u) {
    // 포털 로그인은 이름만 있으므로 user_pin 에서 ID·부서를 채운 뒤 기록 (기기 이름에 부서 포함)
    if (u && (!u.id || !u.dept)) await resolveUser(u.name);
  }
  function start() {
    decorate(document);
    if (SELF) return;   // 접속·로그인 기록은 화면의 PIN 잠금에서 보낸다
    const u = user();
    if (OWN_LOGIN_PAGES.includes(PAGE)) {
      // 포털: 잠금 화면에서 로그인할 때까지 기다렸다가 그 사용자로 접속 기록
      let n = 0;
      const t = setInterval(async () => {
        n++;
        const v = user();
        if (v || n > 120) { clearInterval(t); await ensureUser(v); send('open'); }
      }, 1000);
      return;
    }
    ensureUser(u).then(() => send('open'));
    if (!u && !IN_FRAME && DISPLAY_PAGES.indexOf(PAGE) < 0) showLogin();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();

// ---------- [2026-11-10] iPhone: 입력칸을 누를 때 화면이 확대되는 것 방지 ----------
//  iOS Safari 는 글자 16px 미만 입력칸에 초점이 가면 화면을 확대한다. viewport 에 maximum-scale=1 을 더하면 막히고,
//  iOS 는 손가락 확대(핀치)는 그대로 허용한다. 안드로이드·PC 는 손대지 않는다 (화면 배치·글자 크기 변경 없음)
(function () {
  try {
    var ua = navigator.userAgent || '';
    var ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios) return;
    var fix = function () {
      var m = document.querySelector('meta[name=viewport]');
      if (!m) { m = document.createElement('meta'); m.name = 'viewport'; m.content = 'width=device-width, initial-scale=1'; document.head.appendChild(m); }
      if (!/maximum-scale/i.test(m.content)) m.content = m.content.replace(/\s*$/, '') + ', maximum-scale=1';
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fix); else fix();
  } catch (e) {}
})();
