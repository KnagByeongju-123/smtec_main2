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

  const AUDIT_URL = 'https://ebthltdmxpzlkfwvdloz.supabase.co/functions/v1/audit-log';
  const MAIN_URL = 'https://omngtyewdaqpphnzeate.supabase.co';
  const MAIN_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tbmd0eWV3ZGFxcHBobnplYXRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODk4ODksImV4cCI6MjA5MDQ2NTg4OX0.Zxur3t02JHtOcXforCMSwO3i2mMaf5sViE0tXXUC0-s';
  const LK_AUTH = 'esg_pin_auth';      // 포털과 같은 로그인 키 (7일)
  const LK_USER = 'tj_audit_user';     // {id, name, dept}
  const LK_DEVICE = 'tj_audit_device'; // PC 이름
  const AUTH_DAYS = 7;
  const EDIT_FLUSH_MS = 30000;
  const PAGE = (location.pathname.split('/').pop() || 'index.html');
  // 무인 표시 화면: 로그인 창을 띄우지 않는다 (인쇄는 로그인 필요)
  const DISPLAY_PAGES = ['mes_kiosk.html', 'QC_mes.html', 'counter_dashboard.html', 'env_dashboard.html', 'twin_factory.html', 'twin_factory_3d_QC.html', 'mes_work_virtual.html', 'camera.html', 'mon.html'];
  // 자체 잠금 화면이 있는 포털: 포털 로그인이 끝나면 그 사용자로 기록
  const OWN_LOGIN_PAGES = ['index.html', ''];

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  };
  const origFetch = window.fetch.bind(window);

  // ---------- 사용자·단말 ----------
  function device() { return ls.get(LK_DEVICE) || ''; }
  function user() {
    const a = ls.get(LK_AUTH);
    if (!a || !a.name || (a.exp && a.exp < Date.now())) return null;
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
      kind, page: PAGE, title: document.title || '', doc: location.search || '',
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
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && url.indexOf('/rest/v1/') >= 0 && url.indexOf(AUDIT_URL) < 0) {
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
    return u ? `출력자: ${u.name}${u.id ? '(' + u.id + ')' : ''}${u.dept ? ' · ' + u.dept : ''} · ${stamp()} · PC: ${device() || '미등록'} · ${title || document.title || PAGE} · 출력본(비관리본)`
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
  <div style="font-size:12px;color:#555;margin-bottom:14px">${msg || '접속·수정·인쇄 기록을 위해 PIN 을 입력해 주세요 (7일 유지)'}</div>
  <input id="tj-pin" type="password" inputmode="numeric" maxlength="8" placeholder="PIN" style="width:100%;font-size:22px;padding:8px;letter-spacing:6px;text-align:center;border:1px solid #bbb;border-radius:6px">
  <input id="tj-dev" type="text" maxlength="40" placeholder="이 PC 이름 (예: 품질팀-01)" value="${(device() || '').replace(/"/g, '')}" style="width:100%;font-size:14px;padding:7px;margin-top:8px;border:1px solid #bbb;border-radius:6px">
  <div id="tj-err" style="color:#c00;font-size:12px;height:16px;margin-top:6px"></div>
  <div style="display:flex;gap:8px;margin-top:6px">
   <button id="tj-later" style="flex:1;padding:9px;border:0;border-radius:6px;background:#ddd;cursor:pointer">나중에</button>
   <button id="tj-ok" style="flex:2;padding:9px;border:0;border-radius:6px;background:#0a2a8c;color:#fff;font-weight:700;cursor:pointer">확인</button>
  </div>
 </div>
</div>`;
    document.body.appendChild(box);
    const $ = (id) => document.getElementById(id);
    const close = () => { box.remove(); loginShown = false; };
    $('tj-later').onclick = () => { if ($('tj-dev').value.trim()) ls.set(LK_DEVICE, $('tj-dev').value.trim()); close(); };
    const ok = async () => {
      const pin = $('tj-pin').value.trim();
      if (!/^\d{3,8}$/.test(pin)) { $('tj-err').textContent = 'PIN 을 확인해 주세요'; return; }
      $('tj-err').textContent = '확인 중…';
      try {
        const h = await sha256hex(pin);
        const r = await origFetch(`${MAIN_URL}/rest/v1/user_pin?select=id,name,dept,emp_id&pin_hash=eq.${h}`, { headers: { apikey: MAIN_KEY, Authorization: `Bearer ${MAIN_KEY}` } });
        const u = r.ok ? (await r.json())[0] : null;
        if (!u) { $('tj-err').textContent = '등록되지 않은 PIN 입니다'; return; }
        if ($('tj-dev').value.trim()) ls.set(LK_DEVICE, $('tj-dev').value.trim());
        ls.set(LK_AUTH, { name: u.name, pin: '', exp: Date.now() + AUTH_DAYS * 86400e3 });
        ls.set(LK_USER, { id: String(u.emp_id || u.id), name: u.name, dept: u.dept || '' });
        send('login', { detail: { via: 'audit.js' } });
        close();
        document.body.classList.remove('tj-noauth');
      } catch (e) { $('tj-err').textContent = '서버 연결 실패 — 잠시 후 다시 시도'; }
    };
    $('tj-ok').onclick = ok;
    $('tj-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    setTimeout(() => $('tj-pin').focus(), 50);
  }

  // ---------- ① 접속 기록 ----------
  function start() {
    decorate(document);
    const u = user();
    if (u && !u.id) resolveUser(u.name);
    if (OWN_LOGIN_PAGES.includes(PAGE)) {
      // 포털: 잠금 화면에서 로그인할 때까지 기다렸다가 그 사용자로 접속 기록
      let n = 0;
      const t = setInterval(() => {
        n++;
        const v = user();
        if (v || n > 120) { clearInterval(t); if (v && !v.id) resolveUser(v.name); send('open'); }
      }, 1000);
      return;
    }
    send('open');
    if (!u && DISPLAY_PAGES.indexOf(PAGE) < 0) showLogin();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
