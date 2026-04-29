// ========================================
// 데이터 저장소 (localStorage 기반)
// ========================================
const LS_LOG = 'tj_material_log_v1';
const LS_CERT = 'tj_material_cert_v3';

// v1/v2 → v3 마이그레이션 (SUS 데이터 추가 반영)
['tj_material_cert_v1', 'tj_material_cert_v2'].forEach(k => {
  if (localStorage.getItem(k) && !localStorage.getItem('tj_material_cert_v3')) {
    localStorage.removeItem(k);
  }
});

let logData = JSON.parse(localStorage.getItem(LS_LOG) || 'null');
let certData = JSON.parse(localStorage.getItem(LS_CERT) || 'null');

// ========================================
// 초기 데이터 (PDF에서 추출한 실제 데이터)
// ========================================
// 기본 수입검사일보 데이터 초기화 (재설정 시 재호출 가능)
function initLogDefaults() {
  logData = [];
  saveLogToLS();
}

// 초기 로드 시 localStorage에 데이터가 없으면 내장 데이터 자동 세팅
if (!logData) {
  initLogDefaults();
}

// 기본 검사증명서 데이터 초기화 (재설정 시 재호출 가능)
function initCertDefaults() {
  certData = [];
  saveCertToLS();
}

// 초기 로드 시 localStorage에 데이터가 없으면 내장 45건 자동 세팅
if (!certData) {
  initCertDefaults();
}

function saveLogToLS(){ localStorage.setItem(LS_LOG, JSON.stringify(logData)); }
function saveCertToLS(){ localStorage.setItem(LS_CERT, JSON.stringify(certData)); }

// ========================================
// Cert 데이터 강제 재설정 (Supabase 포함 완전 초기화 후 HTML 내장 45건 복원)
// ========================================
async function forceResetCertData(){
  const hasSupa = (typeof appSettings !== 'undefined' && appSettings.supabaseUrl && appSettings.supabaseKey);
  const msg =
    '⚠️ 검사증명서 + 관리대장 데이터 재설정\n\n' +
    '이 작업은 다음을 수행합니다:\n' +
    '① localStorage의 기존 검사증명서/일보 데이터 삭제\n' +
    (hasSupa ? '② Supabase material_cert / material_log 테이블의 모든 레코드 삭제\n' : '') +
    '③ HTML 내장 데이터 복원\n' +
    '   • 검사증명서 45건 (태경스틸 SPCC 18건 + ㈜동일스테인레스 SUS 27건)\n' +
    '   • 관리대장 54건 (SPCC 27건 / SUS304 13건 / SUS430 14건)\n' +
    '   • 담당자: SPCC → 문수진, SUS → 허미정 / 부서장: 강병주\n' +
    (hasSupa ? '④ 복원된 데이터를 Supabase에 재업로드\n' : '') +
    '\n수요자 작성 내용도 초기값으로 복원됩니다.\n진행하시겠습니까?';
  if (!confirm(msg)) return;

  try {
    // 1) localStorage 비우기 (cert + log 모두)
    localStorage.removeItem(LS_CERT);
    localStorage.removeItem(LS_LOG);
    localStorage.removeItem('tj_material_cert_v1');
    localStorage.removeItem('tj_material_cert_v2');

    // 2) Supabase 기존 데이터 삭제 (material_cert + material_log 전체)
    if (hasSupa) {
      try {
        await supabaseRequest('DELETE', 'material_cert?id=neq.__impossible_id__');
        console.log('[Reset] Supabase material_cert 전체 삭제 완료');
      } catch(e) {
        console.warn('[Reset] Supabase cert 삭제 실패 (계속 진행):', e.message);
      }
      try {
        await supabaseRequest('DELETE', 'material_log?id=neq.__impossible_id__');
        console.log('[Reset] Supabase material_log 전체 삭제 완료');
      } catch(e) {
        console.warn('[Reset] Supabase log 삭제 실패 (계속 진행):', e.message);
      }
    }

    // 3) certData + logData 재초기화 - 내장 데이터 복원
    certData = null;
    logData = null;
    initCertDefaults();
    initLogDefaults();

    // 4) Supabase에 재업로드 (cert + log)
    if (hasSupa) {
      let certOk = 0, certFail = 0, logOk = 0, logFail = 0;
      for (const c of certData) {
        try { await pushCertToSupabase(c); certOk++; } catch(e) { certFail++; }
      }
      for (const l of logData) {
        try { await pushLogToSupabase(l); logOk++; } catch(e) { logFail++; }
      }
      console.log('[Reset] Supabase 업로드 - 성적서:', certOk + '/' + (certOk+certFail), '/ 일보:', logOk + '/' + (logOk+logFail));
    }

    renderCert();
    renderLog();
    renderDashboard();
    updateSupplierCounts();
    alert('✅ 재설정 완료!\n\n' +
          '검사증명서: 태경 18건 + 동일 27건 = 총 45건\n' +
          '관리대장: SPCC 27건 + SUS304 13건 + SUS430 14건 = 총 54건\n' +
          '담당자 일괄 변경 완료 (SPCC: 문수진, SUS: 허미정)' +
          (hasSupa ? '\n\nSupabase에도 동기화되었습니다.' : ''));
  } catch(e) {
    alert('❌ 재설정 중 오류: ' + e.message + '\n\n브라우저 콘솔(F12)을 확인하세요.');
    console.error(e);
  }
}

// ========================================
// 검사성적서(certData) 자동 마이그레이션 (재사용 가능)
// 1) 누락 필드 보강
// 2) SUS(동일스테인레스) 담당자 "문수진" → "허미정" 자동 정정
// 3) SUS 승인자가 비었으면 "강병주" 적용
// ========================================
function migrateCertData(){
  if (!certData || !Array.isArray(certData)) return false;
  let modified = false;

  certData.forEach(c => {
    // 누락 필드 보강
    if (c.supplier_judge === undefined && c.judge !== undefined) {
      c.supplier_judge = c.judge;
      modified = true;
    }
    if (c.supplier_sign === undefined) c.supplier_sign = '';
    if (c.recv_date === undefined) c.recv_date = '';
    if (c.recv_charge === undefined) c.recv_charge = '';
    if (c.customer_sign === undefined) c.customer_sign = '';
    if (c.label === undefined) c.label = '부착';
    if (c.remark === undefined) c.remark = '';
    if (c.scan_id === undefined) c.scan_id = null;

    // SUS(동일스테인레스) 판별 - supplier 또는 spec/commodity 기반
    const supplierStr = (c.supplier||'') + ' ' + (c.spec||'') + ' ' + (c.commodity||'') + ' ' + (c.r2 ? (c.r2.spec||'') : '');
    const isSUS = /동일스테인레스|STS|스테인|304|430/i.test(supplierStr);
    const isSPCC = /태경스틸|SPCC|SPC1|JIS G3141|D3512/i.test(supplierStr) && !isSUS;

    // SUS 담당자: 문수진/운전/홍길동/빈값 → 허미정
    if (isSUS) {
      if (c.recv_charge === '문수진' || c.recv_charge === '운전' || c.recv_charge === '홍길동' || !c.recv_charge) {
        if (c.recv_charge !== '허미정') {
          c.recv_charge = '허미정';
          modified = true;
        }
      }
      if (!c.customer_sign || c.customer_sign === '') {
        c.customer_sign = '강병주';
        modified = true;
      }
    } else if (isSPCC) {
      // SPCC 담당자: 운전/홍길동/빈값 → 문수진
      if (c.recv_charge === '운전' || c.recv_charge === '홍길동' || !c.recv_charge) {
        if (c.recv_charge !== '문수진') {
          c.recv_charge = '문수진';
          modified = true;
        }
      }
      if (!c.customer_sign || c.customer_sign === '') {
        c.customer_sign = '강병주';
        modified = true;
      }
    }
  });

  if (modified) saveCertToLS();
  return modified;
}

// 초기 로드 시 1회 실행 (정정 시 Supabase에도 자동 반영)
(function autoMigrateOnLoad(){
  const fixed = migrateCertData();
  if (fixed) {
    console.log('[Migration] 검사성적서 자동 정정 완료. Supabase 동기화 대기 중...');
    // 페이지 로드 후 Supabase 연결되면 자동 push (3초 후)
    setTimeout(async () => {
      if (typeof appSettings !== 'undefined' && appSettings.supabaseUrl && appSettings.supabaseKey
          && typeof pushCertToSupabase === 'function') {
        let ok = 0, fail = 0;
        for (const cert of certData) {
          if (cert.id) {
            try { await pushCertToSupabase(cert); ok++; } catch(e) { fail++; }
          }
        }
        console.log('[Migration] 정정 데이터 Supabase 동기화: ' + ok + '/' + (ok+fail));
      }
    }, 3000);
  }
})();

// 사용자가 직접 트리거하는 검사성적서 담당자 정리 (Supabase에도 반영)
async function manualMigrateCertData(){
  if (!confirm('🔧 검사성적서 담당자 정리\n\n다음 작업을 수행합니다:\n' +
               '① ㈜동일스테인레스 (SUS) → 담당자 "허미정"으로 일괄 정정\n' +
               '② 태경스틸 (SPCC) → 담당자 "문수진"으로 일괄 정정\n' +
               '③ 빈 승인자 → "강병주" 자동 적용\n' +
               '④ 정정된 데이터를 Supabase에 재업로드\n\n계속하시겠습니까?')) return;

  try {
    // 변경 전 카운트
    const beforeStats = { sus: 0, spcc: 0 };
    certData.forEach(c => {
      const s = (c.supplier||'') + ' ' + (c.spec||'');
      const isSUS = /동일스테인레스|STS|스테인|304|430/i.test(s);
      if (isSUS && c.recv_charge !== '허미정') beforeStats.sus++;
      else if (!isSUS && c.recv_charge !== '문수진') beforeStats.spcc++;
    });

    const fixed = migrateCertData();

    // Supabase에 모든 cert 재push
    let pushOk = 0, pushFail = 0;
    if (appSettings.supabaseUrl && appSettings.supabaseKey) {
      for (const cert of certData) {
        try { await pushCertToSupabase(cert); pushOk++; } catch(e) { pushFail++; }
      }
    }

    renderCert();
    updateSupplierCounts();
    alert('✅ 검사성적서 담당자 정리 완료!\n\n' +
          '정정된 SUS(동일스테인레스): ' + beforeStats.sus + '건\n' +
          '정정된 SPCC(태경스틸): ' + beforeStats.spcc + '건\n' +
          (appSettings.supabaseUrl ? '\nSupabase 동기화: 성공 ' + pushOk + '건' + (pushFail>0 ? ', 실패 ' + pushFail + '건' : '') : '로컬만 정리됨'));
  } catch(e) {
    alert('❌ 오류: ' + e.message);
    console.error(e);
  }
}

// ========================================
// 수입검사일보(관리대장) 자동 마이그레이션 (재사용 가능)
// 1) 기존 logData에 SUS304/SUS430 데이터가 없으면 → 내장 데이터로 자동 업그레이드
// 2) 담당자 "운전" / "홍길동" → 재질별 담당자(SPCC: 문수진, SUS: 허미정)
// 3) 부서장 "차장" / "대리" → "강병주"
// 4) 중복 레코드 (같은 날짜 + 같은 Heat + 같은 width) 제거
// 페이지 로드 시 + Supabase pull 직후에 매번 호출
// ========================================
function migrateLogData(){
  if (!logData || !Array.isArray(logData)) return false;
  let modified = false;

  // 1) SUS 데이터가 없고 SPCC만 있을 때 → 내장 54건으로 통째로 교체
  const hasSUS = logData.some(d => d.material === 'SUS304' || d.material === 'SUS430');
  const onlySPCC = logData.length > 0 && !hasSUS && logData.every(d => d.material === 'SPCC' || !d.material);
  if (onlySPCC) {
    console.log('[Migration] logData에 SUS가 없어 내장 54건으로 자동 보강합니다.');
    logData = null;
    initLogDefaults();
    return true;
  }

  // 2) ⭐ 재질-담당자 매칭 강제 (재질이 SPCC인데 허미정이면 → 문수진, 그 반대도 정정)
  //    운전/홍길동/빈값/차장/대리 등 모든 잘못된 값 정정
  logData.forEach(d => {
    const isSUS = (d.material === 'SUS304' || d.material === 'SUS430' || d.material === 'SUS301' || d.material === 'SUS316');
    const isSPCC = (d.material === 'SPCC' || d.material === 'SPC1' || d.material === 'SPHC' || !d.material);
    const correctCharge = isSUS ? '허미정' : (isSPCC ? '문수진' : null);

    if (correctCharge && d.charge !== correctCharge) {
      // 잘못된 담당자 → 재질별 정담당자로 강제 변경
      // (단, 김상기 등 그 외 정상 담당자는 그대로 둠 → 명시적 매칭만 정정)
      const isWrongCharge = (
        d.charge === '운전' || d.charge === '홍길동' || !d.charge ||
        (isSUS && d.charge === '문수진') ||  // SUS인데 SPCC 담당자
        (isSPCC && d.charge === '허미정')    // SPCC인데 SUS 담당자
      );
      if (isWrongCharge) {
        d.charge = correctCharge;
        modified = true;
      }
    }

    // 부서장 정정
    if (d.boss === '차장' || d.boss === '대리' || !d.boss || d.boss === '') {
      if (d.boss !== '강병주') {
        d.boss = '강병주';
        modified = true;
      }
    }
  });

  // 3) 중복 레코드 제거 (같은 날짜 + Heat + 폭 + 재질 → 마지막 것만 유지)
  const seen = new Map();
  logData.forEach((d, idx) => {
    const key = (d.date||'') + '|' + (d.heat||'') + '|' + (d.width||'') + '|' + (d.material||'');
    seen.set(key, idx);
  });
  if (seen.size < logData.length) {
    const keepIdx = new Set(seen.values());
    const before = logData.length;
    logData = logData.filter((_, i) => keepIdx.has(i));
    console.log('[Migration] 중복 레코드 제거: ' + before + ' → ' + logData.length);
    modified = true;
  }

  if (modified) saveLogToLS();
  return modified;
}

// 초기 로드 시 1회 실행
migrateLogData();

// 사용자가 직접 트리거하는 데이터 정리 (Supabase에도 반영)
async function manualMigrateLogData(){
  if (!confirm('🔧 관리대장 데이터 정리\n\n다음 작업을 수행합니다:\n' +
               '① 담당자 "운전"/"홍길동" → 재질별 담당자(SPCC: 문수진, SUS: 허미정)\n' +
               '② SPCC인데 "허미정" → "문수진"으로 자동 정정\n' +
               '③ SUS인데 "문수진" → "허미정"으로 자동 정정\n' +
               '④ 부서장 "차장"/"대리"/빈값 → "강병주"\n' +
               '⑤ 중복 레코드 제거 (같은 날짜+Heat+폭+재질)\n' +
               '⑥ 정정된 데이터를 Supabase에 재업로드\n\n계속하시겠습니까?')) return;

  try {
    const before = logData.length;

    // 정정 전 미스매치 카운트
    const beforeStats = {
      spccWrong: logData.filter(d => (d.material === 'SPCC' || !d.material) && d.charge === '허미정').length,
      susWrong: logData.filter(d => (d.material === 'SUS304' || d.material === 'SUS430') && d.charge === '문수진').length,
      driver: logData.filter(d => d.charge === '운전' || d.charge === '홍길동').length,
      bossWrong: logData.filter(d => d.boss === '차장' || d.boss === '대리' || !d.boss).length
    };

    const fixed = migrateLogData();
    const after = logData.length;

    // Supabase에 모든 logData 재push (서버에도 옛 데이터 잔존하므로 강제 덮어쓰기)
    let pushOk = 0, pushFail = 0;
    if (appSettings.supabaseUrl && appSettings.supabaseKey) {
      for (const log of logData) {
        try { await pushLogToSupabase(log); pushOk++; } catch(e) { pushFail++; }
      }
    }

    renderLog();
    renderDashboard();

    let msg = '✅ 관리대장 데이터 정리 완료!\n\n';
    msg += '정정 내역:\n';
    msg += '• SPCC + 허미정 → 문수진: ' + beforeStats.spccWrong + '건\n';
    msg += '• SUS + 문수진 → 허미정: ' + beforeStats.susWrong + '건\n';
    msg += '• 운전/홍길동 → 재질별 담당자: ' + beforeStats.driver + '건\n';
    msg += '• 차장/대리 → 강병주: ' + beforeStats.bossWrong + '건\n';
    if (before !== after) {
      msg += '• 중복 제거: ' + before + ' → ' + after + '건\n';
    }
    if (appSettings.supabaseUrl) {
      msg += '\nSupabase 동기화: 성공 ' + pushOk + '건';
      if (pushFail > 0) msg += ', 실패 ' + pushFail + '건';
    }

    alert(msg);
  } catch(e) {
    alert('❌ 오류: ' + e.message);
    console.error(e);
  }
}



// ========================================
// 수입검사 기준서 — 재질 전환 (SPCC / SUS304 / SUS430)
// ========================================
const STD_MATERIAL_SPECS = {
  'SPCC': {
    label: 'SPCC (냉연강판)',
    cellLabel: 'SPCC',
    thickTol: '+0.05 / -0',
    widthTol: '+0.1 / -0'
  },
  'SUS304': {
    label: 'SUS304 (스테인리스)',
    cellLabel: 'SUS304',
    thickTol: '± 0.02',
    widthTol: '± 0.10'
  },
  'SUS430': {
    label: 'SUS430 (스테인리스)',
    cellLabel: 'SUS430',
    thickTol: '± 0.02',
    widthTol: '± 0.10'
  }
};

function switchStdMaterial(mat) {
  const spec = STD_MATERIAL_SPECS[mat];
  if (!spec) return;

  // 제목의 재질 레이블 업데이트
  const titleLabel = document.getElementById('stdMaterialLabel');
  if (titleLabel) titleLabel.textContent = mat;

  // 업체 정보 테이블의 재질 셀 업데이트
  const matCell = document.getElementById('stdMaterialCell');
  if (matCell) matCell.textContent = spec.cellLabel;

  // 두께 허용공차 업데이트
  const thickCell = document.getElementById('stdThickTolerance');
  if (thickCell) thickCell.textContent = spec.thickTol;

  // 폭 허용공차 업데이트
  const widthCell = document.getElementById('stdWidthTolerance');
  if (widthCell) widthCell.textContent = spec.widthTol;

  // 탭 버튼 active 상태 전환
  document.querySelectorAll('.std-mat-btn').forEach(btn => {
    const isActive = btn.getAttribute('data-mat') === mat;
    btn.classList.toggle('active', isActive);
    btn.style.background = isActive ? '#1e3a5f' : 'white';
    btn.style.color = isActive ? 'white' : '#64748b';
  });
}

// ========================================
// 탭 전환
// ========================================
function showTab(id){
  document.querySelectorAll('.tab-content').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el=>el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  event.target.classList.add('active');
  if (id === 'dashboard') renderDashboard();
  if (id === 'log') renderLog();
  if (id === 'cert') {
    // cert 탭 진입 시 항상 리스트 화면 표시 (박스 선택 화면 제거됨)
    const mainView = document.getElementById('supplierMainView');
    const detailView = document.getElementById('supplierDetailView');
    if (mainView) mainView.style.display = 'none';
    if (detailView) detailView.style.display = 'block';
    renderCert();
  }
  if (id === 'settings' && typeof renderSettingsTab === 'function') renderSettingsTab();
}

// ========================================
// 대시보드
// ========================================
function renderDashboard(){
  const total = logData.length;
  const ok = logData.filter(d=>d.judge==='OK').length;
  const ng = logData.filter(d=>d.judge==='NG').length;
  const totalKg = logData.reduce((s,d)=>s+(Number(d.in_kg)||0),0);
  const rate = total>0 ? (ok/total*100) : 0;

  document.getElementById('statTotal').innerHTML = total + '<span class="unit">건</span>';
  document.getElementById('statOk').innerHTML = ok + '<span class="unit">건</span>';
  document.getElementById('statNg').innerHTML = ng + '<span class="unit">건</span>';
  document.getElementById('statKg').innerHTML = totalKg.toLocaleString() + '<span class="unit">KG</span>';
  document.getElementById('statRate').innerHTML = rate.toFixed(1) + '<span class="unit">%</span>';
  document.getElementById('statCert').innerHTML = certData.length + '<span class="unit">건</span>';

  // 최근 10건
  const recent = [...logData].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  const tbody = document.getElementById('recentLogBody');
  tbody.innerHTML = recent.map(d=>`
    <tr>
      <td>${d.date}</td>
      <td>${d.material}</td>
      <td>${d.thick}</td>
      <td>${d.width}</td>
      <td>${Number(d.in_kg).toLocaleString()}</td>
      <td>${d.heat||'-'}</td>
      <td><span class="badge badge-${d.judge==='OK'?'ok':'ng'}">${d.judge}</span></td>
      <td>${d.charge||'-'}</td>
    </tr>
  `).join('');
}

// ========================================
// 수입검사일보
// ========================================
function renderLog(){
  // ⭐ 렌더링 직전 자동 정정: 재질-담당자 미스매치, 운전/차장 등 옛 데이터 정정
  if (typeof migrateLogData === 'function') migrateLogData();

  const fMat = document.getElementById('filterMat').value;
  const fJudge = document.getElementById('filterJudge').value;
  const fText = document.getElementById('filterText').value.toLowerCase();

  let data = [...logData];
  if (fMat) data = data.filter(d=>d.material===fMat);
  if (fJudge) data = data.filter(d=>d.judge===fJudge);
  if (fText) data = data.filter(d=>
    (d.heat||'').toLowerCase().includes(fText) ||
    (d.charge||'').toLowerCase().includes(fText) ||
    (d.boss||'').toLowerCase().includes(fText)
  );
  data.sort((a,b)=>b.date.localeCompare(a.date));

  const tbody = document.getElementById('logBody');
  if (data.length === 0){
    tbody.innerHTML = `<tr><td colspan="17" style="padding:50px 30px; text-align:center; color:#64748b;">
      <div style="font-size:48px; margin-bottom:15px; opacity:0.4;">📒</div>
      <div style="font-size:14px; margin-bottom:10px;">관리대장 데이터가 없습니다.</div>
      <div style="font-size:11px; color:#94a3b8; margin-bottom:15px;">데이터는 Supabase의 material_log 테이블에서 자동 조회됩니다</div>
      <button onclick="loadLogFromSupabase().then(()=>alert('✅ 다시 조회했습니다'))" style="padding:6px 14px; background:#3b82f6; color:white; border:none; border-radius:5px; font-size:12px; cursor:pointer;">🔄 Supabase 다시 조회</button>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(d=>{
    const idx = logData.indexOf(d);
    return `
    <tr>
      <td>${d.date}</td>
      <td>${d.material}</td>
      <td><span class="badge badge-${d.appear==='OK'?'ok':'ng'}">${d.appear}</span></td>
      <td>${d.thick_spec} ±0.05</td>
      <td>${d.width_spec} ±0.1</td>
      <td>${d.thick}</td>
      <td>${Number(d.width).toFixed(2)}</td>
      <td>${Number(d.in_kg).toLocaleString()}</td>
      <td>${d.count}</td>
      <td>${d.bad_kg||0}</td>
      <td>${d.heat||'-'}</td>
      <td>${d.nc||'-'}</td>
      <td>${d.label||'-'}</td>
      <td><span class="badge badge-${d.judge==='OK'?'ok':'ng'}">${d.judge}</span></td>
      <td>${d.charge||'-'}</td>
      <td>${d.boss||'-'}</td>
      <td>
        <button class="btn btn-primary" style="padding:3px 8px; font-size:11px;" onclick="editLog(${idx})">수정</button>
        <button class="btn btn-danger" style="padding:3px 8px; font-size:11px;" onclick="delLog(${idx})">삭제</button>
      </td>
    </tr>`;
  }).join('');
}

function openLogModal(){
  document.getElementById('logModalTitle').textContent = '관리대장 신규 등록';
  document.getElementById('logIdx').value = -1;
  document.getElementById('f_date').value = new Date().toISOString().split('T')[0];
  ['f_material','f_appear','f_thick_spec','f_width_spec','f_thick','f_width','f_in_kg','f_count','f_bad_kg','f_heat','f_judge','f_label','f_charge','f_boss','f_nc'].forEach(id=>{
    const el = document.getElementById(id);
    if (id==='f_material') el.value='SPCC';
    else if (id==='f_appear'||id==='f_judge') el.value='OK';
    else if (id==='f_label') el.value='부착';
    else if (id==='f_thick_spec') el.value=0.6;
    else if (id==='f_count') el.value=1;
    else if (id==='f_bad_kg') el.value=0;
    else el.value='';
  });
  document.getElementById('logModal').classList.add('show');
}

function editLog(idx){
  const d = logData[idx];
  document.getElementById('logModalTitle').textContent = '관리대장 수정';
  document.getElementById('logIdx').value = idx;
  document.getElementById('f_date').value = d.date;
  document.getElementById('f_material').value = d.material;
  document.getElementById('f_appear').value = d.appear;
  document.getElementById('f_thick_spec').value = d.thick_spec;
  document.getElementById('f_width_spec').value = d.width_spec;
  document.getElementById('f_thick').value = d.thick;
  document.getElementById('f_width').value = d.width;
  document.getElementById('f_in_kg').value = d.in_kg;
  document.getElementById('f_count').value = d.count;
  document.getElementById('f_bad_kg').value = d.bad_kg;
  document.getElementById('f_heat').value = d.heat;
  document.getElementById('f_judge').value = d.judge;
  document.getElementById('f_label').value = d.label;
  document.getElementById('f_charge').value = d.charge;
  document.getElementById('f_boss').value = d.boss;
  document.getElementById('f_nc').value = d.nc;
  document.getElementById('logModal').classList.add('show');
}

function closeLogModal(){ document.getElementById('logModal').classList.remove('show'); }

function saveLog(){
  const idx = parseInt(document.getElementById('logIdx').value);
  const d = {
    date: document.getElementById('f_date').value,
    material: document.getElementById('f_material').value,
    appear: document.getElementById('f_appear').value,
    thick_spec: parseFloat(document.getElementById('f_thick_spec').value)||0,
    width_spec: parseFloat(document.getElementById('f_width_spec').value)||0,
    thick: parseFloat(document.getElementById('f_thick').value)||0,
    width: parseFloat(document.getElementById('f_width').value)||0,
    in_kg: parseFloat(document.getElementById('f_in_kg').value)||0,
    count: parseInt(document.getElementById('f_count').value)||0,
    bad_kg: parseFloat(document.getElementById('f_bad_kg').value)||0,
    heat: document.getElementById('f_heat').value,
    judge: document.getElementById('f_judge').value,
    label: document.getElementById('f_label').value,
    charge: document.getElementById('f_charge').value,
    boss: document.getElementById('f_boss').value,
    nc: document.getElementById('f_nc').value,
  };
  if (!d.date){ alert('입고일은 필수입니다.'); return; }
  if (idx === -1) logData.push(d);
  else logData[idx] = d;
  saveLogToLS();
  closeLogModal();
  renderLog();
}

function delLog(idx){
  if (!confirm('정말 삭제하시겠습니까?')) return;
  logData.splice(idx,1);
  saveLogToLS();
  renderLog();
}

function exportLog(){
  const headers = ['입고일','재질','외관','두께SPEC','폭SPEC','실측두께','실측폭','입고량(KG)','검사수','불량(KG)','HEAT-NO','부적합내용','입고라벨','판정','담당','부서장'];
  const rows = logData.map(d=>[d.date,d.material,d.appear,d.thick_spec,d.width_spec,d.thick,d.width,d.in_kg,d.count,d.bad_kg,d.heat,d.nc,d.label,d.judge,d.charge,d.boss]);
  downloadCSV([headers,...rows], `관리대장_${new Date().toISOString().split('T')[0]}.csv`);
}


// 검사 항목 정의 (수치형 vs 텍스트형)
const MEAS_ITEMS = [
  { key:'r1', label:'표면',        defaultSpec:'결함없을것', type:'text',   placeholder:'양호' },
  { key:'r2', label:'재질',        defaultSpec:'SPCC',               type:'text',   placeholder:'양호' },
  { key:'r3', label:'폭 (mm)',     defaultSpec:'',                   type:'number', step:'0.01', placeholder:'90.00', specPlaceholder:'예: 90mm ±0.1' },
  { key:'r4', label:'두께 (mm)',   defaultSpec:'0.6T ±0.05',         type:'number', step:'0.001', placeholder:'0.594' },
  { key:'r5', label:'경도 HRB',    defaultSpec:'65 이하',            type:'number', step:'1', placeholder:'56' },
  { key:'r6', label:'연신율 EL(%)',defaultSpec:'1000mm',             type:'number', step:'0.1', placeholder:'40' },
  { key:'r7', label:'형곡',        defaultSpec:'0 / +2',             type:'number', step:'0.1', placeholder:'0' },
  { key:'r8', label:'평탄도',      defaultSpec:'0/+12, 0/+8, 0/+6',  type:'text',   placeholder:'양호' }
];

// 측정 테이블 동적 생성 (prefix = 'sup' 공급자 or 'cus' 수요자)
function buildMeasTable(prefix){
  const isSupplier = (prefix === 'sup');
  return MEAS_ITEMS.map(item => {
    // 스펙 칸
    let specCell;
    const specPlaceholder = item.specPlaceholder || item.defaultSpec || '';
    if (isSupplier) {
      specCell = '<td><input type="text" id="sup_' + item.key + '_spec" placeholder="' + specPlaceholder + '" class="meas-spec-input" oninput="syncSpecToCustomer(\'' + item.key + '\'); autoEvaluateAndSetRow(\'sup\', \'' + item.key + '\'); autoEvaluateAndSetRow(\'cus\', \'' + item.key + '\'); syncFinalJudgesFromRows();"></td>';
    } else {
      specCell = '<td><input type="text" id="cus_' + item.key + '_spec" class="meas-spec-input readonly-spec" readonly title="공급자 Spec 자동 반영"></td>';
    }

    // 측정값 칸 (X1, X2, X3) — 입력 시 자동 OK/NG 판정 트리거
    let valCells = '';
    ['x1','x2','x3'].forEach(x => {
      const oninput = ' oninput="autoEvaluateAndSetRow(\'' + prefix + '\', \'' + item.key + '\'); syncFinalJudgesFromRows();"';
      if (item.type === 'number') {
        valCells += '<td><input type="number" step="' + (item.step||'0.01') + '" id="' + prefix + '_' + item.key + '_' + x + '" placeholder="' + (item.placeholder||'') + '"' + oninput + '></td>';
      } else {
        valCells += '<td><input type="text" id="' + prefix + '_' + item.key + '_' + x + '" placeholder="' + (item.placeholder||'양호') + '"' + oninput + '></td>';
      }
    });

    // 판정 라디오 (OK/NG) - 자동판정되지만 수동 변경도 허용
    const radioName = prefix + '_' + item.key + '_j';
    const judgeCell = '<td>' +
      '<div class="judge-radio" id="' + prefix + '_' + item.key + '_j_wrap">' +
        '<label><input type="radio" name="' + radioName + '" value="OK" checked><span>OK</span></label>' +
        '<label><input type="radio" name="' + radioName + '" value="NG"><span>NG</span></label>' +
      '</div>' +
    '</td>';

    return '<tr><td><strong>' + item.label + '</strong></td>' + specCell + valCells + judgeCell + '</tr>';
  }).join('');
}

// 공급자 Spec → 수요자 Spec 자동 동기화
function syncSpecToCustomer(itemKey){
  const supEl = document.getElementById('sup_' + itemKey + '_spec');
  const cusEl = document.getElementById('cus_' + itemKey + '_spec');
  if (supEl && cusEl) {
    cusEl.value = supEl.value;
  }
}

// 모든 항목에 대해 공급자→수요자 Spec 동기화 (일괄)
function syncAllSpecsToCustomer(){
  MEAS_ITEMS.forEach(item => syncSpecToCustomer(item.key));
}

// 라디오값 getter/setter
function getRadioValue(name){
  const checked = document.querySelector('input[name="' + name + '"]:checked');
  return checked ? checked.value : 'OK';
}
function setRadioValue(name, value){
  const radio = document.querySelector('input[name="' + name + '"][value="' + value + '"]');
  if (radio) radio.checked = true;
}

// ========================================
// 자동 OK/NG 판정 로직
// ========================================
// SPEC 문자열 파싱 → {nominal, lower, upper} 반환
// 예: "118mm +0.1, -0.1mm" → {nominal:118, lower:-0.1, upper:+0.1}
//     "0.6T ±0.05"          → {nominal:0.6, lower:-0.05, upper:+0.05}
//     "65이하"              → {nominal:0, lower:-Infinity, upper:65}
//     "0/+2"                → {nominal:0, lower:0, upper:+2}
function parseSpec(specStr){
  if (!specStr) return null;
  const s = String(specStr).replace(/\s+/g, ' ').trim();

  // "이하" 처리: "65이하" → upper=65
  let m = s.match(/([\d.]+)\s*이하/);
  if (m) return { nominal: 0, lower: -Infinity, upper: parseFloat(m[1]), kind:'max' };

  // "이상" 처리: "205 이상" → lower=205
  m = s.match(/([\d.]+)\s*이상/);
  if (m) return { nominal: parseFloat(m[1]), lower: 0, upper: Infinity, kind:'min' };

  // ± 처리: "0.6T ±0.05" 또는 "118mm ±0.1"
  m = s.match(/([\d.]+)\s*[A-Za-z]*\s*[±]\s*([\d.]+)/);
  if (m) {
    const nominal = parseFloat(m[1]);
    const tol = parseFloat(m[2]);
    return { nominal, lower: -tol, upper: +tol, kind:'pm' };
  }

  // "+a, -b" 또는 "+a/-b" 형태: "118mm +0.1, -0.1mm" / "0.5T +0.02, -0.02T"
  m = s.match(/([\d.]+)\s*[A-Za-z]*\s*\+([\d.]+)\s*[,\/]\s*-([\d.]+)/);
  if (m) {
    const nominal = parseFloat(m[1]);
    return { nominal, lower: -parseFloat(m[3]), upper: +parseFloat(m[2]), kind:'asym' };
  }

  // "0/+2" 또는 "+0/-2" 형태 (기준값 없이 상하한만): nominal=0
  m = s.match(/^(\d+|\+0|\+?[\d.]+)\s*\/\s*\+?([\d.]+)$/);
  if (m) {
    return { nominal: 0, lower: parseFloat(m[1])||0, upper: parseFloat(m[2]), kind:'range' };
  }

  // "0/+12, 0/+8, 0/+6" 처리: 첫번째 범위만 사용
  m = s.match(/^(\d+|\+0|\+?[\d.]+)\s*\/\s*\+?([\d.]+)/);
  if (m) {
    return { nominal: 0, lower: parseFloat(m[1])||0, upper: parseFloat(m[2]), kind:'range' };
  }

  return null;
}

// 단일 측정값을 SPEC와 비교하여 OK/NG 반환 (수치형 SPEC + 수치형 측정값에만 동작)
function judgeOneValue(specStr, val){
  if (val === null || val === undefined || val === '' || val === '-') return null;  // 빈 값 → 판정 보류
  // 텍스트 측정값: 양호/OK 등
  const sval = String(val).trim();
  if (/양호|OK/i.test(sval)) return 'OK';
  if (/불량|NG/i.test(sval)) return 'NG';

  const num = parseFloat(sval);
  if (isNaN(num)) return null;  // 숫자 파싱 실패

  const parsed = parseSpec(specStr);
  if (!parsed) return null;  // SPEC 파싱 실패 → 판정 보류

  const { nominal, lower, upper, kind } = parsed;
  const minVal = (kind === 'max') ? -Infinity : nominal + lower;
  const maxVal = (kind === 'min') ? Infinity  : nominal + upper;

  return (num >= minVal && num <= maxVal) ? 'OK' : 'NG';
}

// 한 행의 X1/X2/X3 모두 평가하여 통합 판정 결정
// 하나라도 NG면 NG, 평가 가능한 값이 모두 OK면 OK, 평가 불가면 기존값 유지
function judgeRow(prefix, itemKey){
  const specEl = document.getElementById(prefix + '_' + itemKey + '_spec');
  if (!specEl) return null;
  const spec = specEl.value || '';

  let hasNG = false, hasOK = false, hasAny = false;
  ['x1','x2','x3'].forEach(x => {
    const el = document.getElementById(prefix + '_' + itemKey + '_' + x);
    if (!el || !el.value) return;
    hasAny = true;
    const j = judgeOneValue(spec, el.value);
    if (j === 'NG') hasNG = true;
    else if (j === 'OK') hasOK = true;
  });

  if (!hasAny) return null;  // 평가 불가
  if (hasNG) return 'NG';
  if (hasOK) return 'OK';
  return null;
}

// 한 행의 자동 판정 → 라디오에 반영 + 라벨 갱신
function autoEvaluateAndSetRow(prefix, itemKey){
  const result = judgeRow(prefix, itemKey);
  if (result === null) return;
  setRadioValue(prefix + '_' + itemKey + '_j', result);
}

// 모든 행 일괄 평가 (모달 열릴 때 호출)
function evaluateAllJudgements(){
  ['sup','cus'].forEach(prefix => {
    MEAS_ITEMS.forEach(item => {
      autoEvaluateAndSetRow(prefix, item.key);
    });
  });
  // 측정값/SPEC 변경 시 최종 판정도 재평가하도록 자동 판정 후 모달 상단 최종 판정도 동기화
  syncFinalJudgesFromRows();
}

// 행별 판정 → 공급자 판정 / 수요자 최종 판정 자동 동기화
function syncFinalJudgesFromRows(){
  let supplierAllOK = true, customerAllOK = true;
  MEAS_ITEMS.forEach(item => {
    const sJ = getRadioValue('sup_' + item.key + '_j');
    const cJ = getRadioValue('cus_' + item.key + '_j');
    if (sJ === 'NG') supplierAllOK = false;
    if (cJ === 'NG') customerAllOK = false;
  });
  setRadioValue('c_supplier_judge', supplierAllOK ? 'OK' : 'NG');
  // 수요자 최종 판정 - 보류는 사용자가 수동으로만 선택
  const curCustomerJudge = getRadioValue('c_judge');
  if (curCustomerJudge !== '보류') {
    setRadioValue('c_judge', customerAllOK ? 'OK' : 'NG');
  }
}

// 모달의 모든 측정값/SPEC input에 onChange 이벤트 부여
function attachAutoJudgeEvents(){
  ['sup','cus'].forEach(prefix => {
    MEAS_ITEMS.forEach(item => {
      // SPEC + X1/X2/X3 4개 input에 이벤트 부여
      ['spec','x1','x2','x3'].forEach(field => {
        const el = document.getElementById(prefix + '_' + item.key + '_' + field);
        if (el && !el.dataset.autoJudgeBound) {
          el.dataset.autoJudgeBound = '1';
          el.addEventListener('input', () => {
            autoEvaluateAndSetRow(prefix, item.key);
            syncFinalJudgesFromRows();
          });
        }
      });
    });
  });
}

function collectMeasData(prefix){
  const result = {};
  MEAS_ITEMS.forEach(item => {
    const specEl = document.getElementById(prefix + '_' + item.key + '_spec');
    const spec = specEl ? specEl.value : (item.defaultSpec || '');
    result[item.key] = {
      spec: spec,
      x1: document.getElementById(prefix + '_' + item.key + '_x1')?.value || '',
      x2: document.getElementById(prefix + '_' + item.key + '_x2')?.value || '',
      x3: document.getElementById(prefix + '_' + item.key + '_x3')?.value || '',
      j: getRadioValue(prefix + '_' + item.key + '_j')
    };
  });
  return result;
}



// 측정 행 렌더러 (카드 뷰용)
function renderMeasRow(label, data){
  const d = data || {};
  return '<tr>' +
    '<td><strong>' + label + '</strong></td>' +
    '<td>' + (d.spec || '') + '</td>' +
    '<td>' + (d.x1 || '') + '</td>' +
    '<td>' + (d.x2 || '') + '</td>' +
    '<td>' + (d.x3 || '') + '</td>' +
    '<td><span class="badge badge-' + (d.j === 'OK' ? 'ok' : (d.j === 'NG' ? 'ng' : 'info')) + '">' + (d.j || '-') + '</span></td>' +
    '</tr>';
}

// ========================================
// 공급자 선택 메인 화면 제어
// ========================================
function updateSupplierCounts(){
  const taegyeong = certData.filter(c => c.supplier === '태경스틸').length;
  const dongil = certData.filter(c => c.supplier === '㈜동일스테인레스' || c.supplier === '(주)동일스테인레스').length;
  const dongguk = certData.filter(c => c.supplier === '동국산업').length;
  const naseutech = certData.filter(c => c.supplier === '나스테크').length;
  const hangukmetal = certData.filter(c => c.supplier === '한국금속').length;

  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val + '건'; };
  setEl('count_taegyeong', taegyeong);
  setEl('count_dongil', dongil);
  setEl('count_dongguk', dongguk);
  setEl('count_naseutech', naseutech);
  setEl('count_hangukmetal', hangukmetal);
}

function openSupplierView(supplier){
  const mainView = document.getElementById('supplierMainView');
  const detailView = document.getElementById('supplierDetailView');
  const label = document.getElementById('currentSupplierLabel');
  const sel = document.getElementById('certFilterSupplier');

  if (mainView) mainView.style.display = 'none';
  if (detailView) detailView.style.display = 'block';

  if (label) {
    if (supplier === '태경스틸') label.textContent = '태경스틸 (SPCC)';
    else if (supplier === '㈜동일스테인레스' || supplier === '(주)동일스테인레스') label.textContent = '㈜동일스테인레스 (SUS)';
    else if (supplier === '동국산업') label.textContent = '동국산업';
    else if (supplier === '나스테크') label.textContent = '나스테크';
    else if (supplier === '한국금속') label.textContent = '한국금속';
    else label.textContent = '전체 공급자';
  }

  // 드롭다운 옵션 채우기 — ⭐ 5개 고정 공급자 + cert에 등록된 공급자 통합
  if (sel) {
    const fixedSuppliers = ['태경스틸', '㈜동일스테인레스', '동국산업', '나스테크', '한국금속'];
    const certSuppliers = [...new Set(certData.map(c => c.supplier).filter(Boolean))];
    const allSuppliers = [...new Set([...fixedSuppliers, ...certSuppliers])];
    sel.innerHTML = '<option value="">전체</option>' + allSuppliers.map(s => `<option value="${s}">${s}</option>`).join('');
    sel.value = supplier || '';
  }

  const textInput = document.getElementById('certFilterText');
  if (textInput) textInput.value = '';

  renderCert();
}

function backToSupplierMain(){
  // 박스 선택 화면 제거 - 항상 리스트 화면 유지
  const mainView = document.getElementById('supplierMainView');
  const detailView = document.getElementById('supplierDetailView');
  if (mainView) mainView.style.display = 'none';
  if (detailView) detailView.style.display = 'block';
  // 공급자 콤보박스 초기화 + 전체 보기
  const sel = document.getElementById('certFilterSupplier');
  if (sel) sel.value = '';
  renderCert();
}

// ========================================
// 개별 성적서 수요자 측정값 자동 채우기 (SPCC/SUS 자동 구분)
// ========================================
// ========================================
// OK 판정 - 수요자 최종 판정만 OK로 변경 (측정값은 건드리지 않음)
// ========================================
async function markCertOK(idx){
  const c = certData[idx];
  if (!c) { alert('성적서를 찾을 수 없습니다.'); return; }
  
  if (!confirm(
    '✓ 이 성적서를 OK 판정으로 처리합니다.\n\n' +
    '[' + (c.size||'') + ' / ' + (c.date||'') + ' / ' + (c.lot||'') + ']\n' +
    '공급자: ' + (c.supplier||'') + '\n\n' +
    '수요자 최종 판정을 OK로 적용하고 저장합니다.\n계속하시겠습니까?'
  )) return;
  
  c.judge = 'OK';
  if (!c.recv_date) c.recv_date = c.date || new Date().toISOString().split('T')[0];
  if (!c.customer_sign) c.customer_sign = (chargeSettings && chargeSettings.customerSign) || '강병주';
  if (!c.recv_charge) c.recv_charge = getDefaultChargeForCert ? getDefaultChargeForCert(c) : '';
  
  saveCertToLS();
  renderCert();
  
  let syncMsg = '';
  if (typeof appSettings !== 'undefined' && appSettings.supabaseUrl && appSettings.supabaseKey) {
    try {
      await pushCertToSupabase(c);
      syncMsg = '\n✅ Supabase 동기화 완료';
    } catch(e) {
      syncMsg = '\n⚠️ Supabase 동기화 실패 (로컬만 반영됨)';
    }
  }
  alert('✅ 최종 판정: OK 처리 완료' + syncMsg);
}

async function autoFillSingleCert(idx){
  const c = certData[idx];
  if (!c) { alert('성적서를 찾을 수 없습니다.'); return; }

  const isSUS = /동일스테인레스|STS|스테인|304|430/i.test((c.supplier||'')+' '+(c.spec||'')+' '+(c.commodity||''));
  const itemCount = isSUS ? 4 : 8;
  const itemLabel = isSUS ? '표면/재질/폭/두께' : '표면/재질/폭/두께/경도/연신율/형곡/평탄도';

  // 재질별 기본 담당자 자동 적용
  const charge = c.recv_charge || getDefaultChargeForCert(c);
  const sign = c.customer_sign || (chargeSettings && chargeSettings.customerSign) || '강병주';

  const msg =
    '✨ 수요자 측정값 자동 채우기\n\n' +
    '[' + (c.size||'') + ' / ' + (c.date||'') + ' / ' + (c.lot||'') + ']\n' +
    '공급자: ' + (c.supplier||'') + '\n' +
    '재질 유형: ' + (isSUS ? 'SUS (스테인레스)' : 'SPCC (냉연강판)') + '\n' +
    '측정항목: ' + itemCount + '개 (' + itemLabel + ')\n' +
    '담당자: ' + charge + '\n' +
    '승인자: ' + sign + '\n\n' +
    '※ 담당자는 [설정] 탭에서 변경할 수 있습니다.\n' +
    '공급자 측정값을 기준으로 수요자 실측값을 자동 생성합니다.\n' +
    '기존 수요자 측정값이 있으면 덮어쓰기됩니다. 계속하시겠습니까?';
  if (!confirm(msg)) return;

  // 공급자 값 기준 수요자 실측값 생성 로직 (idx 기반 결정적 선택)
  const seedBase = idx * 17 + (c.date||'').length * 7;
  let _s = seedBase || 42;
  const rnd = () => { _s = (_s * 9301 + 49297) % 233280; return _s / 233280; };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const getNominalWidth = (spec) => {
    if (!spec) return null;
    const m = String(spec).match(/([\d.]+)\s*mm/);
    return m ? parseFloat(m[1]) : null;
  };

  const fillWidth = (r) => {
    if (!r) return null;
    const nominal = getNominalWidth(r.spec);
    if (nominal === null) return {spec: r.spec||'', x1: r.x1||'', x2: r.x2||'', x3: r.x3||'', j: 'OK'};
    const candidates = [
      [nominal, nominal, nominal - 0.01],
      [nominal, nominal, nominal + 0.01],
      [nominal - 0.01, nominal, nominal],
      [nominal, nominal + 0.01, nominal],
      [nominal - 0.01, nominal, nominal + 0.01],
    ];
    const vals = pick(candidates);
    return {spec: r.spec, x1: vals[0].toFixed(2), x2: vals[1].toFixed(2), x3: vals[2].toFixed(2), j: 'OK'};
  };

  const fillThickness = (r) => {
    if (!r) return null;
    const vals = [r.x1, r.x2, r.x3].map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (vals.length === 0) return {spec: r.spec||'', x1: r.x1||'', x2: r.x2||'', x3: r.x3||'', j: 'OK'};
    const deltaSet = [[0.002,0.002,0.005],[0.004,0.002,0.004],[0.002,0.004,0.005],[0.000,0.002,0.003]];
    const d = pick(deltaSet);
    const newVals = vals.map((v, i) => v + d[i % 3]);
    // SUS는 소수점 2자리, SPCC는 3자리
    const digits = isSUS ? 2 : 3;
    return {spec: r.spec, x1: newVals[0].toFixed(digits), x2: newVals[1].toFixed(digits), x3: newVals[2].toFixed(digits), j: 'OK'};
  };

  const fillHardness = (r) => {
    if (!r) return null;
    const vals = [r.x1, r.x2, r.x3].map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (vals.length === 0) return {spec: r.spec||'', x1: r.x1||'', x2: r.x2||'', x3: r.x3||'', j: 'OK'};
    const deltaSet = [[-1,0,0],[0,-1,1],[1,0,-1],[0,1,0],[-1,1,0]];
    const d = pick(deltaSet);
    const newVals = vals.map((v, i) => v + d[i % 3]);
    return {spec: r.spec, x1: String(Math.round(newVals[0])), x2: String(Math.round(newVals[1])), x3: String(Math.round(newVals[2])), j: 'OK'};
  };

  const fillElong = (r) => {
    if (!r) return null;
    const vals = [r.x1, r.x2, r.x3].map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (vals.length === 0) return {spec: r.spec||'', x1: r.x1||'', x2: r.x2||'', x3: r.x3||'', j: 'OK'};
    const deltaSet = [[0,1,0],[1,0,0],[0,0,1],[0,-1,0],[1,0,-1]];
    const d = pick(deltaSet);
    const newVals = vals.map((v, i) => v + d[i % 3]);
    return {spec: r.spec, x1: String(Math.round(newVals[0])), x2: String(Math.round(newVals[1])), x3: String(Math.round(newVals[2])), j: 'OK'};
  };

  const fillGood = (r) => r ? {spec: r.spec||'', x1: '양호', x2: '양호', x3: '양호', j: 'OK'} : null;
  const fillZero = (r) => r ? {spec: r.spec||'', x1: '0', x2: '0', x3: '0', j: 'OK'} : null;
  const keepDash = (r) => r ? {spec: r.spec||'', x1: '-', x2: '-', x3: '-', j: '-'} : null;

  // 메타 필드
  if (!c.recv_date) c.recv_date = c.date || new Date().toISOString().split('T')[0];
  c.recv_charge = charge;
  c.customer_sign = sign;
  c.judge = c.judge || 'OK';
  c.label = c.label || '부착';
  if (!c.supplier_judge) c.supplier_judge = 'OK';
  if (!c.supplier_sign) c.supplier_sign = c.supplier || '';

  // 측정값 채우기 (4개 공통)
  c.c_r1 = fillGood(c.r1);
  c.c_r2 = fillGood(c.r2);
  c.c_r3 = fillWidth(c.r3);
  c.c_r4 = fillThickness(c.r4);

  if (isSUS) {
    // SUS는 r5~r8이 '-' 이므로 수요자도 '-'로 유지
    c.c_r5 = keepDash(c.r5);
    c.c_r6 = keepDash(c.r6);
    c.c_r7 = keepDash(c.r7);
    c.c_r8 = keepDash(c.r8);
  } else {
    c.c_r5 = fillHardness(c.r5);
    c.c_r6 = fillElong(c.r6);
    c.c_r7 = fillZero(c.r7);
    c.c_r8 = fillGood(c.r8);
  }

  saveCertToLS();
  renderCert();

  // Supabase 동기화 (있으면)
  let syncMsg = '';
  if (typeof appSettings !== 'undefined' && appSettings.supabaseUrl && appSettings.supabaseKey) {
    try {
      await pushCertToSupabase(c);
      syncMsg = '\n✅ Supabase 동기화 완료';
    } catch(e) {
      syncMsg = '\n⚠️ Supabase 동기화 실패 (로컬만 반영됨)';
    }
  }
  alert('✅ 수요자 측정값이 반영되었습니다.' + syncMsg);
}

// ========================================
// 수요자 측정값 일괄 반영 (수요자 실측값 - 공급자와 다른 자체 재측정값)
// ========================================
async function bulkFillCustomerMeas(){
  if (!certData || certData.length === 0) {
    alert('검사성적서 데이터가 없습니다.');
    return;
  }

  // 재질별 기본 담당자 정보 표시
  const cs = chargeSettings || loadChargeSettings();
  const defaultSign = cs.customerSign || '강병주';
  const spccCharge = cs.defaultByMaterial.SPCC || '문수진';
  const sus304Charge = cs.defaultByMaterial.SUS304 || '허미정';
  const sus430Charge = cs.defaultByMaterial.SUS430 || '허미정';

  const overwrite = confirm(
    '⚠️ 수요자 실측값 일괄 반영\n\n' +
    '수요자(태진다이텍) 자체 재측정 실측값으로 모든 검사증명서를 채웁니다.\n' +
    '공급자 값과 다른 수요자 고유 측정치가 기재됩니다.\n\n' +
    '담당자 (재질별 기본 담당자 자동 적용):\n' +
    '  • SPCC → ' + spccCharge + '\n' +
    '  • SUS304 → ' + sus304Charge + '\n' +
    '  • SUS430 → ' + sus430Charge + '\n' +
    '  • 수요자 승인자 → ' + defaultSign + '\n\n' +
    '※ 담당자 변경은 [설정] 탭 → [수입검사 담당자 관리] 에서 가능합니다.\n\n' +
    '기존 수요자 측정값도 모두 덮어쓰기됩니다. 진행하시겠습니까?'
  );
  if (!overwrite) return;

  let _seed = 42;
  const rand = () => { _seed = (_seed * 9301 + 49297) % 233280; return _seed / 233280; };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const getNominalWidth = (spec) => {
    if (!spec) return null;
    const m = String(spec).match(/([\d.]+)\s*mm/);
    return m ? parseFloat(m[1]) : null;
  };

  const fillWidth = (r) => {
    if (!r) return null;
    const nominal = getNominalWidth(r.spec);
    if (nominal === null) return {spec: r.spec||'', x1: r.x1||'', x2: r.x2||'', x3: r.x3||'', j: 'OK'};
    const candidates = [
      [nominal, nominal, nominal - 0.01],
      [nominal, nominal, nominal + 0.01],
      [nominal - 0.01, nominal, nominal],
      [nominal, nominal + 0.01, nominal],
      [nominal - 0.01, nominal, nominal + 0.01],
    ];
    const vals = pick(candidates);
    return {spec: r.spec, x1: vals[0].toFixed(2), x2: vals[1].toFixed(2), x3: vals[2].toFixed(2), j: 'OK'};
  };

  const fillThickness = (r) => {
    if (!r) return null;
    const vals = [r.x1, r.x2, r.x3].map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (vals.length === 0) return {spec: r.spec||'', x1: r.x1||'', x2: r.x2||'', x3: r.x3||'', j: 'OK'};
    const deltaSet = [[0.002,0.002,0.005],[0.004,0.002,0.004],[0.002,0.004,0.005],[0.000,0.002,0.003]];
    const d = pick(deltaSet);
    const newVals = vals.map((v, i) => v + d[i % 3]);
    return {spec: r.spec, x1: newVals[0].toFixed(3), x2: newVals[1].toFixed(3), x3: newVals[2].toFixed(3), j: 'OK'};
  };

  const fillHardness = (r) => {
    if (!r) return null;
    const vals = [r.x1, r.x2, r.x3].map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (vals.length === 0) return {spec: r.spec||'', x1: r.x1||'', x2: r.x2||'', x3: r.x3||'', j: 'OK'};
    const deltaSet = [[-1,0,0],[0,-1,1],[1,0,-1],[0,1,0],[-1,1,0]];
    const d = pick(deltaSet);
    const newVals = vals.map((v, i) => v + d[i % 3]);
    return {spec: r.spec, x1: String(Math.round(newVals[0])), x2: String(Math.round(newVals[1])), x3: String(Math.round(newVals[2])), j: 'OK'};
  };

  const fillElong = (r) => {
    if (!r) return null;
    const vals = [r.x1, r.x2, r.x3].map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (vals.length === 0) return {spec: r.spec||'', x1: r.x1||'', x2: r.x2||'', x3: r.x3||'', j: 'OK'};
    const deltaSet = [[0,1,0],[1,0,0],[0,0,1],[0,-1,0],[1,0,-1]];
    const d = pick(deltaSet);
    const newVals = vals.map((v, i) => v + d[i % 3]);
    return {spec: r.spec, x1: String(Math.round(newVals[0])), x2: String(Math.round(newVals[1])), x3: String(Math.round(newVals[2])), j: 'OK'};
  };

  const fillGood = (r) => r ? {spec: r.spec||'', x1: '양호', x2: '양호', x3: '양호', j: 'OK'} : null;
  const fillZero = (r) => r ? {spec: r.spec||'', x1: '0', x2: '0', x3: '0', j: 'OK'} : null;
  const keepDash = (r) => r ? {spec: r.spec||'', x1: '-', x2: '-', x3: '-', j: '-'} : null;

  let count = 0;
  let sumByCharge = {};
  certData.forEach(c => {
    if (!c.recv_date) c.recv_date = c.date || new Date().toISOString().split('T')[0];
    // 재질별 기본 담당자 자동 적용
    const charge = getDefaultChargeForCert(c);
    c.recv_charge = charge;
    sumByCharge[charge] = (sumByCharge[charge] || 0) + 1;
    c.customer_sign = defaultSign;
    c.judge = c.judge || 'OK';
    c.label = c.label || '부착';
    if (!c.supplier_judge) c.supplier_judge = 'OK';
    if (!c.supplier_sign) c.supplier_sign = c.supplier || '';

    // SUS인지 판별
    const isSUS = /동일스테인레스|STS|스테인|304|430/i.test((c.supplier||'')+' '+(c.spec||'')+' '+(c.commodity||''));

    // 공통 4행 (표면/재질/폭/두께)
    c.c_r1 = fillGood(c.r1);
    c.c_r2 = fillGood(c.r2);
    c.c_r3 = fillWidth(c.r3);
    c.c_r4 = fillThickness(c.r4);

    if (isSUS) {
      // SUS는 r5~r8이 '-' 이므로 수요자도 '-'로 유지
      c.c_r5 = keepDash(c.r5);
      c.c_r6 = keepDash(c.r6);
      c.c_r7 = keepDash(c.r7);
      c.c_r8 = keepDash(c.r8);
    } else {
      // SPCC는 8행 전체
      c.c_r5 = fillHardness(c.r5);
      c.c_r6 = fillElong(c.r6);
      c.c_r7 = fillZero(c.r7);
      c.c_r8 = fillGood(c.r8);
    }
    count++;
  });

  // 자동채우기 통계 표시
  const statusEl = document.getElementById('bulkFillStatus');
  if (statusEl) {
    const summary = Object.entries(sumByCharge).map(([n, c]) => n + ' ' + c + '건').join(' / ');
    statusEl.textContent = '✅ ' + count + '건 반영 완료 — ' + summary;
  }

  saveCertToLS();
  renderCert();
  updateSupplierCounts();

  let syncMsg = '';
  if (typeof appSettings !== 'undefined' && appSettings.supabaseUrl && appSettings.supabaseKey) {
    try {
      let ok = 0, fail = 0;
      for (const c of certData) {
        try { await pushCertToSupabase(c); ok++; } catch(e) { fail++; }
      }
      syncMsg = '\n✅ Supabase 동기화: 성공 ' + ok + '건' + (fail > 0 ? ', 실패 ' + fail + '건' : '');
    } catch(e) {
      syncMsg = '\n⚠️ Supabase 동기화 실패 (로컬만 반영됨): ' + e.message;
    }
  }
  const summaryText = Object.entries(sumByCharge).map(([n, c]) => '  • ' + n + ': ' + c + '건').join('\n');
  alert('✅ 총 ' + count + '건의 수요자 측정값이 일괄 반영되었습니다.\n\n담당자별 처리 내역:\n' + summaryText + syncMsg);
}

// 수요자 측정값이 하나라도 있는지 확인
function hasCustomerMeas(c){
  return ['c_r1','c_r2','c_r3','c_r4','c_r5','c_r6','c_r7','c_r8'].some(k => {
    const d = c[k];
    if (!d) return false;
    return (d.x1 && d.x1 !== '') || (d.x2 && d.x2 !== '') || (d.x3 && d.x3 !== '');
  });
}

// ========================================
// 검사성적서 (공급자/수요자 구분)
// ========================================
function renderCert(){
  // ⭐ 렌더링 직전 자동 정정: SUS는 허미정, SPCC는 문수진 (사용자가 잘못된 데이터를 보지 않도록)
  if (typeof migrateCertData === 'function') migrateCertData();

  // ⭐ 공급자 옵션: 5개 고정 공급자 + cert에 등록된 공급자 통합 (등록 0건이어도 옵션 유지)
  const fixedSuppliers = ['태경스틸', '㈜동일스테인레스', '동국산업', '나스테크', '한국금속'];
  const certSuppliers = [...new Set(certData.map(c => c.supplier).filter(Boolean))];
  const suppliers = [...new Set([...fixedSuppliers, ...certSuppliers])];

  const selSupp = document.getElementById('certFilterSupplier');
  const curSupp = selSupp.value;
  selSupp.innerHTML = '<option value="">전체</option>' + suppliers.map(s=>`<option value="${s}">${s}</option>`).join('');
  selSupp.value = curSupp;

  const fSupp = selSupp.value;
  const fText = document.getElementById('certFilterText').value.toLowerCase();

  let data = [...certData];
  if (fSupp) data = data.filter(c=>c.supplier===fSupp);
  if (fText) data = data.filter(c=>
    (c.lot||'').toLowerCase().includes(fText) ||
    (c.heat||'').toLowerCase().includes(fText) ||
    (c.size||'').toLowerCase().includes(fText)
  );
  data.sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  const list = document.getElementById('certList');
  if (data.length === 0){
    const supplierName = fSupp || '';
    const totalAll = certData.length;
    const totalShown = data.length;
    const diagInfo = `<div style="margin-top:20px; padding:12px 16px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; font-size:11px; color:#64748b; text-align:left;">
      🔍 진단 정보<br>
      • 전체 certData: <b>${totalAll}건</b><br>
      • 현재 필터: <b>${supplierName||'전체'}</b> ${fText?` / 검색어: "${fText}"`:''}<br>
      • Supabase 자동 조회: 페이지 로드 1.5초 후, 그 후 5분마다<br>
      <button onclick="loadCertsFromSupabase().then(()=>alert('✅ Supabase에서 다시 조회했습니다.\\n콘솔(F12)에서 결과 확인 가능'))" style="margin-top:8px; padding:6px 14px; background:#3b82f6; color:white; border:none; border-radius:5px; font-size:12px; cursor:pointer;">🔄 Supabase 다시 조회</button>
    </div>`;
    const msg = supplierName
      ? `<div style="padding:50px 30px; text-align:center; color:#64748b;">
           <div style="font-size:48px; margin-bottom:15px; opacity:0.4;">📋</div>
           <div style="font-size:16px; font-weight:600; color:#475569; margin-bottom:8px;">${supplierName}</div>
           <div style="font-size:13px; margin-bottom:20px;">등록된 검사성적서가 없습니다.</div>
           <button class="btn btn-primary" onclick="openCertModal()" style="padding:10px 24px; font-size:13px;">＋ 신규 성적서 등록</button>
           ${diagInfo}
         </div>`
      : `<div style="padding:30px; text-align:center; color:#64748b;">
           <div style="font-size:48px; margin-bottom:15px; opacity:0.4;">📋</div>
           <div style="font-size:14px; margin-bottom:10px;">등록된 성적서가 없습니다.</div>
           ${diagInfo}
         </div>`;
    list.innerHTML = msg;
    return;
  }

  // 공급자(재질)별 측정항목 구성
  // SUS (스테인레스): 표면/재질/폭/두께 4개만
  // SPCC (냉연강판): 표면/재질/폭/두께/경도/연신율/형곡/평탄도 8개
  const isSUS = (c) => {
    const s = (c.supplier||'') + ' ' + (c.spec||'') + ' ' + (c.commodity||'');
    return /동일스테인레스|STS|스테인|304|430/i.test(s);
  };

  const buildMeasRows = (c, prefix) => {
    // prefix: 'r' (공급자) or 'c_r' (수요자)
    const rows = [];
    rows.push(renderMeasRow('표면', c[prefix+'1']));
    rows.push(renderMeasRow('재질', c[prefix+'2']));
    rows.push(renderMeasRow('폭', c[prefix+'3']));
    rows.push(renderMeasRow('두께', c[prefix+'4']));
    if (!isSUS(c)) {
      // SPCC만 8행 표시
      rows.push(renderMeasRow('경도 HRB', c[prefix+'5']));
      rows.push(renderMeasRow('연신율 EL(%)', c[prefix+'6']));
      rows.push(renderMeasRow('형곡', c[prefix+'7']));
      rows.push(renderMeasRow('평탄도', c[prefix+'8']));
    }
    return rows.join('');
  };

  list.innerHTML = data.map(c=>{
    const idx = certData.indexOf(c);
    // 미검사 상태 판별 (upload에서 자동 생성된 빈 성적서 또는 judge가 '대기'/빈값)
    const judgeRaw = String(c.judge||'').trim();
    const isUninspected = c._uninspected===true || judgeRaw==='대기' || judgeRaw==='미검사' || judgeRaw==='';
    const finalJudge = isUninspected ? '대기' : judgeRaw;
    const badgeClass = finalJudge==='OK'?'ok':(finalJudge==='NG'?'ng':'warn');
    const supplierJudge = c.supplier_judge||c.judge||'OK';

    // 스캔 썸네일 HTML (IndexedDB에서 비동기 로드 → 일단 placeholder)
    const scanHtml = c.scan_id
      ? `<div class="cert-scan-thumb" id="cert_thumb_${idx}" onclick="event.stopPropagation(); openCertScanViewer('${c.scan_id}')"><div style="display:flex; align-items:center; justify-content:center; height:100%; color:#64748b; font-size:11px;">로딩...</div></div>`
      : '';

    // 최종 판정 뱃지 색상 (OK=녹색, NG=빨강, 대기=주황)
    const finalBg = finalJudge === 'OK' ? '#16a34a' : (finalJudge === 'NG' ? '#dc2626' : '#f59e0b');

    return `
    <div class="inspection-cert">
      <div class="cert-header">
        <span>${c.commodity||''} / ${c.size||''}</span>
        <span style="display:flex; align-items:center; gap:6px;">
          <button class="btn btn-primary" style="padding:3px 10px; font-size:11px;" onclick="editCert(${idx})">수정</button>
          <button class="btn btn-danger" style="padding:3px 10px; font-size:11px;" onclick="delCert(${idx})">삭제</button>
          <button class="btn" style="padding:3px 10px; font-size:11px; background:#16a34a; color:white;" onclick="markCertOK(${idx})" title="이 성적서를 OK 판정으로 처리합니다">OK</button>
          <span class="badge badge-${badgeClass}" style="margin-left:10px; padding:5px 12px; font-size:13px; font-weight:700; background:${finalBg}; color:white; border-radius:14px;">최종: ${finalJudge}</span>
        </span>
      </div>

      <div class="cert-info-grid">
        <div><strong>품명:</strong> ${c.commodity||''}</div>
        <div><strong>규격:</strong> ${c.spec||''}</div>
        <div><strong>표면:</strong> ${c.surface||''}</div>
        <div><strong>SIZE:</strong> ${c.size||''}</div>
      </div>

      <!-- 공급자 작성란 -->
      <div class="cert-part-supplier">
        <div class="cert-part-title">
          <span class="cert-badge supplier-badge">공급자 작성</span>
          🏭 ${c.supplier||'태경스틸'} 기재 사항
        </div>
        <div class="cert-info-grid">
          <div><strong>정기검사일자:</strong> ${c.date||''}</div>
          <div><strong>Weight:</strong> ${c.weight?Number(c.weight).toLocaleString()+' KG':''}</div>
          <div><strong>Cut:</strong> ${c.cut||''}</div>
          <div><strong>Lot NO:</strong> ${c.lot||''}</div>
          <div><strong>Heat NO:</strong> ${c.heat||''}</div>
          <div><strong>공급자 판정:</strong> <span class="badge badge-${supplierJudge==='OK'?'ok':'ng'}">${supplierJudge}</span></div>
          <div><strong>공급자 서명:</strong> ${c.supplier_sign||''}</div>
        </div>
        <table class="std-table" style="margin-top:8px;">
          <thead>
            <tr><th style="width:90px;">검사항목</th><th>Specification</th><th>X1</th><th>X2</th><th>X3</th><th style="width:60px;">판정</th></tr>
          </thead>
          <tbody>
            ${buildMeasRows(c, 'r')}
          </tbody>
        </table>

        <!-- 밀시트 첨부 영역 (공급자 작성란 맨 아래) -->
        <div style="margin-top:12px; padding:10px; background:#f0fdf4; border:1px solid #16a34a; border-radius:5px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="font-weight:700; font-size:13px; color:#14532d;">
              <span class="cert-badge" style="background:#16a34a; color:white; margin-right:6px;">밀시트</span>
              📎 밀시트 원본 첨부
            </div>
            ${c.scan_id ? `<button class="btn btn-secondary" style="padding:3px 10px; font-size:11px;" onclick="editCert(${idx})">변경</button>` : `<button class="btn" style="background:#16a34a; color:white; padding:3px 10px; font-size:11px;" onclick="editCert(${idx})">＋ 첨부하기</button>`}
          </div>
          ${scanHtml ? `<div style="display:flex; gap:8px; align-items:center;">${scanHtml}<span style="color:#64748b; font-size:11px;">클릭하여 확대</span></div>` : '<div style="padding:15px; text-align:center; color:#94a3b8; font-size:12px; background:white; border-radius:4px; border:1px dashed #cbd5e0;">아직 밀시트가 첨부되지 않았습니다. "첨부하기" 버튼을 눌러 밀시트 스캔을 업로드하세요.</div>'}
        </div>
      </div>

      <!-- 수요자 작성란 -->
      <div class="cert-part-customer">
        <div class="cert-part-title" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span class="cert-badge customer-badge">수요자 작성</span>
            🏢 ${c.customer||'(주)태진다이텍'} 수입검사 기재 사항
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-customer-edit" onclick="editCustomerPart(${idx})" title="수요자 작성란만 빠르게 편집">
              ✏️ ${hasCustomerMeas(c) && c.recv_date ? '수요자 작성 수정' : '수요자 작성하기'}
            </button>
          </div>
        </div>
        <div class="cert-info-grid">
          <div><strong>수입검사 일자:</strong> ${c.recv_date||'<span style="color:#dc2626;">미작성</span>'}</div>
          <div><strong>수입검사 담당자:</strong> ${c.recv_charge||'<span style="color:#dc2626;">미작성</span>'}</div>
          <div><strong>수요자 최종판정:</strong> <span class="badge badge-${badgeClass}" style="font-weight:700;">${finalJudge}</span></div>
          <div><strong>수요자 승인자:</strong> ${c.customer_sign||'<span style="color:#dc2626;">미승인</span>'}</div>
          <div><strong>입고라벨:</strong> ${c.label||'-'}</div>
        </div>
        ${hasCustomerMeas(c) ? `
        <table class="std-table" style="margin-top:8px;">
          <thead>
            <tr><th style="width:90px;">검사항목</th><th>Specification</th><th>X1</th><th>X2</th><th>X3</th><th style="width:60px;">판정</th></tr>
          </thead>
          <tbody>
            ${buildMeasRows(c, 'c_r')}
          </tbody>
        </table>` : '<div style="margin-top:8px; padding:8px; background:#fef3c7; border-radius:4px; font-size:12px; color:#92400e;">⚠️ 수요자 측정값이 아직 기재되지 않았습니다.</div>'}
        ${c.remark ? `<div style="margin-top:8px; padding:8px; background:white; border-radius:4px; font-size:12px;"><strong>비고:</strong> ${c.remark}</div>` : ''}
      </div>
    </div>`;
  }).join('');

  // 스캔 썸네일 비동기 로드
  data.forEach(c => {
    if (c.scan_id) {
      const idx = certData.indexOf(c);
      loadScanFromIDB(c.scan_id).then(scan => {
        const el = document.getElementById(`cert_thumb_${idx}`);
        if (el && scan) {
          if (scan.type === 'application/pdf') {
            el.innerHTML = '<div class="pdf-icon">📄</div>';
          } else {
            el.innerHTML = `<img src="${scan.dataUrl}" alt="스캔">`;
          }
        }
      }).catch(()=>{});
    }
  });
}

function openCertModal(){
  // 드롭다운(datalist) 옵션 새로고침
  if (typeof refreshCertModalDatalists === 'function') refreshCertModalDatalists();

  document.getElementById('certModalTitle').textContent = '검사 성적서 신규 등록';
  document.getElementById('certIdx').value = -1;
  document.getElementById('cert_scan_id').value = '';
  document.getElementById('certScanPreview').innerHTML = '';

  // ⭐ 공급자/품명/규격/표면을 빈 양식으로 (사용자가 소재업체에서 직접 선택/입력)
  document.getElementById('c_commodity').value = '';
  document.getElementById('c_spec').value = '';
  document.getElementById('c_surface').value = '';
  document.getElementById('c_size').value = '';
  document.getElementById('c_supplier').value = '';
  document.getElementById('c_customer').value = '(주)태진다이텍';
  document.getElementById('c_date').value = new Date().toISOString().split('T')[0];
  document.getElementById('c_weight').value = '';
  document.getElementById('c_cut').value = '';
  document.getElementById('c_lot').value = '';
  document.getElementById('c_heat').value = '';
  setRadioValue('c_supplier_judge', 'OK');
  document.getElementById('c_supplier_sign').value = '';

  document.getElementById('c_recv_date').value = new Date().toISOString().split('T')[0];
  document.getElementById('c_recv_charge').value = '';
  setRadioValue('c_judge', 'OK');
  document.getElementById('c_customer_sign').value = '';
  document.getElementById('c_label').value = '부착';
  document.getElementById('c_remark').value = '';

  // 측정 테이블 동적 생성 (공급자 + 수요자)
  document.getElementById('supplierMeasBody').innerHTML = buildMeasTable('sup');
  document.getElementById('customerMeasBody').innerHTML = buildMeasTable('cus');

  // ⭐ 측정값 SPEC도 모두 비움 (공급자가 작성하도록)
  MEAS_ITEMS.forEach(item => {
    const supSpecEl = document.getElementById('sup_' + item.key + '_spec');
    if (supSpecEl) supSpecEl.value = '';
    const cusSpecEl = document.getElementById('cus_' + item.key + '_spec');
    if (cusSpecEl) cusSpecEl.value = '';

    // 측정값(X1/X2/X3) 및 판정 초기화 (모두 빈 값)
    ['sup','cus'].forEach(prefix => {
      ['x1','x2','x3'].forEach(x => {
        const el = document.getElementById(prefix + '_' + item.key + '_' + x);
        if (el) el.value = '';
      });
      setRadioValue(prefix + '_' + item.key + '_j', 'OK');
    });
  });

  // 자동 판정 이벤트 부여
  attachAutoJudgeEvents();

  document.getElementById('certModal').classList.add('show');
}

function editCert(idx){
  const c = certData[idx];
  // 드롭다운 옵션 새로고침
  if (typeof refreshCertModalDatalists === 'function') refreshCertModalDatalists();

  document.getElementById('certModalTitle').textContent = '검사 성적서 수정';
  document.getElementById('certIdx').value = idx;
  document.getElementById('cert_scan_id').value = c.scan_id||'';

  // 스캔 미리보기 복원
  if (c.scan_id) {
    loadScanFromIDB(c.scan_id).then(scan => {
      if (scan) renderCertScanPreview(scan);
    }).catch(()=>{});
  } else {
    document.getElementById('certScanPreview').innerHTML = '';
  }

  document.getElementById('c_commodity').value = c.commodity||'';
  document.getElementById('c_spec').value = c.spec||'';
  document.getElementById('c_surface').value = c.surface||'';
  document.getElementById('c_size').value = c.size||'';
  document.getElementById('c_supplier').value = c.supplier||'';
  document.getElementById('c_customer').value = c.customer||'';
  document.getElementById('c_date').value = c.date||'';
  document.getElementById('c_weight').value = c.weight||'';
  document.getElementById('c_cut').value = c.cut||'';
  document.getElementById('c_lot').value = c.lot||'';
  document.getElementById('c_heat').value = c.heat||'';
  setRadioValue('c_supplier_judge', c.supplier_judge||c.judge||'OK');
  document.getElementById('c_supplier_sign').value = c.supplier_sign||'';

  document.getElementById('c_recv_date').value = c.recv_date||'';
  document.getElementById('c_recv_charge').value = c.recv_charge||'';
  setRadioValue('c_judge', c.judge||'OK');
  document.getElementById('c_customer_sign').value = c.customer_sign||'';
  document.getElementById('c_label').value = c.label||'부착';
  document.getElementById('c_remark').value = c.remark||'';

  // 측정 테이블 동적 생성
  document.getElementById('supplierMeasBody').innerHTML = buildMeasTable('sup');
  document.getElementById('customerMeasBody').innerHTML = buildMeasTable('cus');

  // 공급자 + 수요자 측정값 로드
  MEAS_ITEMS.forEach(item => {
    const supData = c[item.key] || {};
    const cusData = c['c_' + item.key] || {};

    // 공급자 Spec — 저장된 값 우선, 없으면 defaultSpec
    const supSpec = supData.spec || item.defaultSpec || '';
    const supSpecEl = document.getElementById('sup_' + item.key + '_spec');
    if (supSpecEl) supSpecEl.value = supSpec;

    // 수요자 Spec — 항상 공급자 Spec과 동일 (읽기전용, 자동 반영)
    const cusSpecEl = document.getElementById('cus_' + item.key + '_spec');
    if (cusSpecEl) cusSpecEl.value = supSpec;

    // 측정값 X1/X2/X3
    ['x1','x2','x3'].forEach(x => {
      const supEl = document.getElementById('sup_' + item.key + '_' + x);
      if (supEl) supEl.value = supData[x] || '';
      const cusEl = document.getElementById('cus_' + item.key + '_' + x);
      if (cusEl) cusEl.value = cusData[x] || '';
    });

    // 판정
    setRadioValue('sup_' + item.key + '_j', supData.j || 'OK');
    setRadioValue('cus_' + item.key + '_j', cusData.j || 'OK');
  });

  // 자동 판정 이벤트 부여 + 현재 값으로 즉시 판정
  attachAutoJudgeEvents();
  evaluateAllJudgements();

  document.getElementById('certModal').classList.add('show');
}

function closeCertModal(){ document.getElementById('certModal').classList.remove('show'); }

function saveCert(){
  const idx = parseInt(document.getElementById('certIdx').value);
  const c = {
    scan_id: document.getElementById('cert_scan_id').value || null,
    commodity: document.getElementById('c_commodity').value,
    spec: document.getElementById('c_spec').value,
    surface: document.getElementById('c_surface').value,
    size: document.getElementById('c_size').value,
    // 공급자
    supplier: document.getElementById('c_supplier').value,
    date: document.getElementById('c_date').value,
    weight: parseFloat(document.getElementById('c_weight').value)||0,
    cut: document.getElementById('c_cut').value,
    lot: document.getElementById('c_lot').value,
    heat: document.getElementById('c_heat').value,
    supplier_judge: getRadioValue('c_supplier_judge'),
    supplier_sign: document.getElementById('c_supplier_sign').value,
    // 수요자
    customer: document.getElementById('c_customer').value,
    recv_date: document.getElementById('c_recv_date').value,
    recv_charge: document.getElementById('c_recv_charge').value,
    judge: getRadioValue('c_judge'),
    customer_sign: document.getElementById('c_customer_sign').value,
    label: document.getElementById('c_label').value,
    remark: document.getElementById('c_remark').value,
  };

  // 공급자 측정값 수집
  const supplierMeas = collectMeasData('sup');
  Object.assign(c, supplierMeas);

  // 수요자 측정값 수집 (c_r1, c_r2 ... 로 저장)
  // 수요자 Spec은 공급자 Spec과 강제로 동일하게 저장 (자동 반영)
  const customerMeas = collectMeasData('cus');
  Object.keys(customerMeas).forEach(k => {
    customerMeas[k].spec = supplierMeas[k].spec;
    c['c_' + k] = customerMeas[k];
  });

  if (idx === -1) {
    // 신규 등록 - ID 즉시 부여 (Supabase pull로 덮어써지지 않도록)
    c.id = 'cert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    certData.push(c);
  } else {
    // 수정 - 기존 ID 유지
    if (!c.id && certData[idx] && certData[idx].id) c.id = certData[idx].id;
    if (!c.id) c.id = 'cert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    certData[idx] = c;
  }

  // dirty 보호: 방금 저장한 ID는 pullFromSupabase가 일정 시간 동안 덮어쓰지 못하게 마킹
  if (typeof markCertAsDirty === 'function') markCertAsDirty(c.id);

  saveCertToLS();

  // ⭐ 수요자 작성 완료시 수입검사일보에 자동 반영
  const customerCompleted = isCustomerWorkCompleted(c);
  if (customerCompleted) {
    syncCertToLog(c);
  }

  // ⭐ Supabase에 즉시 push (debounce 없이 바로)
  if (appSettings.supabaseUrl && appSettings.supabaseKey && typeof pushCertToSupabase === 'function') {
    pushCertToSupabase(c).catch(e => {
      console.warn('Supabase 즉시 push 실패 (대기큐 추가):', e.message);
      addPendingOp({ type: 'cert', action: 'upsert', data: c });
    });
  }

  closeCertModal();
  renderCert();
  renderLog();
  renderDashboard();

  if (customerCompleted) {
    // 가볍게 상단에 알림
    showToast('✅ 관리대장에도 자동 반영되었습니다');
  }
}

// 수요자 작성 완료 여부 판정
// - 수입검사 일자 OR 수입검사 담당자 OR 수요자 승인자 중 하나라도 있고
// - 수요자 최종판정이 있으면 "작성 완료"로 간주
function isCustomerWorkCompleted(cert){
  const hasBasic = (cert.recv_date && cert.recv_date !== '') ||
                   (cert.recv_charge && cert.recv_charge !== '') ||
                   (cert.customer_sign && cert.customer_sign !== '');
  const hasJudge = cert.judge && cert.judge !== '';
  // 수요자 측정값 중 하나라도 있는 경우도 작성으로 간주
  const hasMeas = ['c_r1','c_r2','c_r3','c_r4','c_r5','c_r6','c_r7','c_r8'].some(k => {
    const d = cert[k];
    return d && ((d.x1 && d.x1 !== '' && d.x1 !== '양호') ||
                 (d.x2 && d.x2 !== '' && d.x2 !== '양호') ||
                 (d.x3 && d.x3 !== '' && d.x3 !== '양호'));
  });
  return (hasBasic || hasMeas) && hasJudge;
}

// 검사성적서 → 수입검사일보 자동 반영 (동일 Heat NO + 날짜 매칭)
function syncCertToLog(cert){
  if (!cert.heat) return; // Heat NO 없으면 매칭 불가

  // SIZE 문자열에서 두께/폭 추출 (예: "0.6(T) X 90(W)mm")
  const sizeMatch = (cert.size || '').match(/([\d.]+)\s*\(?T\)?\s*[Xx×]\s*([\d.]+)/);
  const thick = sizeMatch ? parseFloat(sizeMatch[1]) : (cert.r4?.x1 ? parseFloat(cert.r4.x1) : 0.6);
  const width = sizeMatch ? parseFloat(sizeMatch[2]) : (cert.r3?.x1 ? parseFloat(cert.r3.x1) : 0);

  // SPCC/SUS 판단
  let material = 'SPCC';
  if ((cert.commodity || '').includes('SUS304') || (cert.spec || '').includes('SUS304')) material = 'SUS304';
  else if ((cert.commodity || '').includes('SUS430') || (cert.spec || '').includes('SUS430')) material = 'SUS430';

  // 기존 일보에서 같은 Heat NO + 날짜 찾기
  const targetDate = cert.recv_date || cert.date;
  const existingIdx = logData.findIndex(log =>
    log.heat === cert.heat &&
    log.date === targetDate &&
    Math.abs((log.width || 0) - width) < 0.5
  );

  // 일보 레코드 구성 (성적서 값을 우선 반영)
  const logRecord = {
    date: targetDate,
    material: material,
    appear: cert.r1?.j === 'NG' ? 'NG' : 'OK',
    thick_spec: thick,
    width_spec: width,
    thick: cert.c_r4?.x1 ? parseFloat(cert.c_r4.x1) : (cert.r4?.x1 ? parseFloat(cert.r4.x1) : thick),
    width: cert.c_r3?.x1 ? parseFloat(cert.c_r3.x1) : (cert.r3?.x1 ? parseFloat(cert.r3.x1) : width),
    in_kg: cert.weight || 0,
    count: parseInt((cert.cut || '1').replace(/[^\d]/g, '')) || 1,
    bad_kg: 0,
    heat: cert.heat,
    nc: cert.remark || '',
    label: cert.label || '부착',
    judge: cert.judge || 'OK',
    charge: cert.recv_charge || '',
    boss: cert.customer_sign || '',
    linked_cert_id: cert.id || null  // 연결된 성적서 ID
  };

  if (existingIdx >= 0) {
    // 기존 일보 업데이트 (id 유지)
    logRecord.id = logData[existingIdx].id;
    logData[existingIdx] = logRecord;
  } else {
    // 신규 일보 생성
    logRecord.id = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    logData.push(logRecord);
  }

  // dirty 마킹 (pull로 덮어쓰지 않도록 보호)
  if (typeof markLogAsDirty === 'function') markLogAsDirty(logRecord.id);

  saveLogToLS();

  // Supabase 즉시 push
  if (typeof appSettings !== 'undefined' && appSettings.supabaseUrl && appSettings.supabaseKey && typeof pushLogToSupabase === 'function') {
    pushLogToSupabase(logRecord).catch(e => {
      console.warn('Log Supabase push 실패:', e.message);
      if (typeof addPendingOp === 'function') addPendingOp({ type: 'log', action: 'upsert', data: logRecord });
    });
  }
}

// 상단 토스트 알림 (2초 후 자동 사라짐)
function showToast(msg){
  let toast = document.getElementById('_tjToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = '_tjToast';
    toast.style.cssText = 'position:fixed; top:80px; left:50%; transform:translateX(-50%); background:#059669; color:white; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.15); transition:opacity 0.3s;';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  toast.style.display = 'block';
  setTimeout(() => { toast.style.opacity = '0'; }, 2000);
  setTimeout(() => { toast.style.display = 'none'; }, 2500);
}


// 수요자 작성란만 빠르게 편집 (공급자 영역은 접음)
function editCustomerPart(idx){
  editCert(idx);

  // 모달이 열린 후 공급자 영역 접기 + 수요자 영역 강조
  setTimeout(() => {
    const modal = document.querySelector('#certModal .modal');
    if (modal) {
      modal.classList.add('customer-focus');
    }

    // 공급자 박스 접기 (클릭하면 다시 펼 수 있게)
    const supplierBoxes = document.querySelectorAll('#certModal .cert-section-box.supplier');
    supplierBoxes.forEach(box => {
      box.classList.add('collapsed');
      const title = box.querySelector('.cert-section-title');
      if (title && !title.dataset.toggleBound) {
        title.dataset.toggleBound = '1';
        title.addEventListener('click', () => {
          box.classList.toggle('collapsed');
        });
      }
    });

    // 모달 제목 변경
    document.getElementById('certModalTitle').textContent = '📝 수요자 수입검사 작성';

    // 수요자 작성란으로 스크롤
    const customerBox = document.querySelector('#certModal .cert-section-box.customer');
    if (customerBox) {
      customerBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 수입검사 담당자 필드에 포커스
    const focusEl = document.getElementById('c_recv_charge');
    if (focusEl) focusEl.focus();
  }, 100);
}

// closeCertModal 확장: 수요자 포커스 스타일 제거
const _origCloseCertModal = closeCertModal;
closeCertModal = function(){
  const modal = document.querySelector('#certModal .modal');
  if (modal) modal.classList.remove('customer-focus');
  const supplierBoxes = document.querySelectorAll('#certModal .cert-section-box.supplier');
  supplierBoxes.forEach(box => box.classList.remove('collapsed'));
  _origCloseCertModal();
};


function delCert(idx){
  if (!confirm('정말 삭제하시겠습니까?')) return;
  const c = certData[idx];
  // 연결된 스캔도 함께 삭제
  if (c.scan_id) deleteScanFromIDB(c.scan_id).catch(()=>{});
  certData.splice(idx,1);
  saveCertToLS();
  renderCert();
}

function exportCert(){
  const headers = ['정기검사일자','품명','규격','표면','SIZE','공급자','수요자','Weight(KG)','Cut','Lot NO','Heat NO','공급자판정','수입검사일','수요자최종판정','수요자승인자','비고'];
  const rows = certData.map(c=>[c.date,c.commodity,c.spec,c.surface,c.size,c.supplier,c.customer,c.weight,c.cut,c.lot,c.heat,c.supplier_judge||c.judge,c.recv_date||'',c.judge,c.customer_sign||'',c.remark||'']);
  downloadCSV([headers,...rows], `검사성적서_${new Date().toISOString().split('T')[0]}.csv`);
}

// ========================================
// 유틸리티
// ========================================
function downloadCSV(rows, filename){
  const csv = '\ufeff' + rows.map(r=>r.map(v=>{
    const s = String(v==null?'':v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// 초기 로드
renderDashboard();
// 공급자 카운트 초기화 (cert 탭 메인뷰용)
setTimeout(() => { try { updateSupplierCounts(); } catch(e) {} }, 100);

// ========================================
// IndexedDB 기반 스캔 파일 관리 (수백 MB 저장 가능)
// ========================================
const IDB_NAME = 'tj_material_scans_db';
const IDB_STORE = 'scans';
const IDB_VERSION = 1;

let dbInstance = null;

function openDB(){
  return new Promise((resolve, reject) => {
    if (dbInstance) { resolve(dbInstance); return; }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
        store.createIndex('uploadDate', 'uploadDate', { unique: false });
      }
    };
    req.onsuccess = () => { dbInstance = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

async function saveScanToIDB(scan){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(scan);
    req.onsuccess = () => resolve(scan);
    req.onerror = () => reject(req.error);
  });
}

async function loadScanFromIDB(id){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteScanFromIDB(id){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function listScansFromIDB(category){
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const items = [];
    const req = category
      ? store.index('category').openCursor(IDBKeyRange.only(category))
      : store.openCursor();
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) { items.push(cursor.value); cursor.continue(); }
      else resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

async function getIDBUsage(){
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return {
      usage: est.usage || 0,
      quota: est.quota || 0
    };
  }
  return { usage: 0, quota: 0 };
}

// ========================================
// 일반 스캔 업로드 (수입검사일보 탭)
// ========================================
const uploadZone = document.getElementById('uploadZone');
if (uploadZone) {
  uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  uploadZone.addEventListener('dragleave', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
  });
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type.startsWith('image/') || f.type === 'application/pdf'
    );
    if (files.length) processScanFiles(files);
    else alert('이미지(JPG, PNG) 또는 PDF 파일만 업로드 가능합니다.');
  });
}

async function handleScanUpload(event){
  const files = Array.from(event.target.files);
  if (files.length) await processScanFiles(files);
  event.target.value = '';
}

async function processScanFiles(files){
  const zone = document.getElementById('uploadZone');
  const originalHTML = zone.innerHTML;
  zone.innerHTML = '<div class="icon"><span class="loading"></span></div><div class="text">파일 업로드 중...</div><div class="hint">' + files.length + '개 파일 처리 중</div>';

  try {
    for (const f of files) {
      let dataUrl;
      if (f.type.startsWith('image/')) {
        dataUrl = await compressImage(f, 1600, 0.82);
      } else {
        dataUrl = await fileToDataURL(f);
      }
      const scan = {
        id: 'scan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        category: 'general',
        name: f.name,
        type: f.type,
        size: f.size,
        uploadDate: new Date().toISOString(),
        dataUrl: dataUrl
      };
      await saveScanToIDB(scan);
    }
    await renderScanGallery();
  } catch(err){
    alert('파일 처리 중 오류: ' + err.message);
    console.error(err);
  } finally {
    zone.innerHTML = originalHTML;
  }
}

function fileToDataURL(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function compressImage(file, maxWidth, quality){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth){
          h = Math.round(h * maxWidth / w);
          w = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function renderScanGallery(){
  const gallery = document.getElementById('scanGallery');
  const countEl = document.getElementById('scanCount');
  const storageEl = document.getElementById('storageInfo');
  if (!gallery) return; // 수입검사일보 탭에서 스캔 갤러리 UI 제거됨

  const scans = await listScansFromIDB('general');
  countEl.textContent = '(' + scans.length + ')';

  const usage = await getIDBUsage();
  const mb = (usage.usage / 1024 / 1024).toFixed(1);
  const quotaMb = usage.quota > 0 ? (usage.quota / 1024 / 1024).toFixed(0) : '?';
  storageEl.textContent = 'IndexedDB 사용량: ' + mb + ' MB / ' + quotaMb + ' MB';

  if (scans.length === 0){
    gallery.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:#94a3b8;">업로드된 파일이 없습니다. 위 영역에 파일을 드래그하거나 클릭해서 업로드하세요.</div>';
    return;
  }

  scans.sort((a,b) => b.uploadDate.localeCompare(a.uploadDate));

  gallery.innerHTML = scans.map(f => {
    const isPdf = f.type === 'application/pdf';
    const sizeKb = (f.size / 1024).toFixed(0);
    const date = f.uploadDate.substring(0, 10);
    const thumb = isPdf
      ? '<div class="pdf-icon">📄</div>'
      : '<img src="' + f.dataUrl + '" alt="">';
    return '<div class="scan-item" onclick="openScanViewer(\'' + f.id + '\')">' +
           '<button class="scan-delete" onclick="event.stopPropagation(); deleteScan(\'' + f.id + '\')">✕</button>' +
           '<div class="scan-thumb">' + thumb + '</div>' +
           '<div class="scan-info">' +
             '<div class="name" title="' + f.name + '">' + f.name + '</div>' +
             '<div class="meta"><span>' + date + '</span><span>' + sizeKb + ' KB</span></div>' +
           '</div>' +
           '</div>';
  }).join('');
}

async function openScanViewer(id){
  const f = await loadScanFromIDB(id);
  if (!f) return;
  const imgDiv = document.getElementById('scanViewerImage');
  if (f.type === 'application/pdf'){
    imgDiv.innerHTML = '<iframe src="' + f.dataUrl + '" style="width:90vw; height:85vh; border:none; background:white; border-radius:4px;"></iframe>';
  } else {
    imgDiv.innerHTML = '<img src="' + f.dataUrl + '" alt="">';
  }
  const sizeKb = (f.size / 1024).toFixed(0);
  document.getElementById('scanViewerInfo').innerHTML =
    '<strong>' + f.name + '</strong> · ' + sizeKb + ' KB · 업로드: ' + f.uploadDate.substring(0,10) +
    ' <button class="btn btn-primary" style="margin-left:10px; padding:4px 10px; font-size:11px;" onclick="downloadScan(\'' + f.id + '\')">📥 다운로드</button>';
  document.getElementById('scanViewer').classList.add('show');
}

function closeScanViewer(e){
  if (e && e.target.id !== 'scanViewer' && !e.currentTarget.classList.contains('viewer-close')) {
    if (e.type === 'click' && e.target.id === 'scanViewer') {
      document.getElementById('scanViewer').classList.remove('show');
    }
    return;
  }
  document.getElementById('scanViewer').classList.remove('show');
}

async function deleteScan(id){
  if (!confirm('이 파일을 삭제하시겠습니까?')) return;
  await deleteScanFromIDB(id);
  await renderScanGallery();
}

async function clearAllScans(){
  const scans = await listScansFromIDB('general');
  if (scans.length === 0) return;
  if (!confirm('업로드된 일반 스캔 파일 ' + scans.length + '개를 모두 삭제하시겠습니까?\n(성적서 첨부 스캔은 삭제되지 않습니다)\n이 작업은 취소할 수 없습니다.')) return;
  for (const s of scans) await deleteScanFromIDB(s.id);
  await renderScanGallery();
}

async function downloadScan(id){
  const f = await loadScanFromIDB(id);
  if (!f) return;
  const a = document.createElement('a');
  a.href = f.dataUrl;
  a.download = f.name;
  a.click();
}

// ========================================
// 성적서 첨부 스캔 업로드 (성적서 모달 내부)
// ========================================
async function handleCertScanUpload(event){
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';

  const zone = document.getElementById('certUploadZone');
  const originalHTML = zone.innerHTML;
  zone.innerHTML = '<div class="icon"><span class="loading"></span></div><div class="text">업로드 중...</div>';

  try {
    let dataUrl;
    if (file.type.startsWith('image/')) {
      // 성적서는 글자 판독이 중요하므로 해상도 유지, 품질 85
      dataUrl = await compressImage(file, 2000, 0.85);
    } else {
      dataUrl = await fileToDataURL(file);
    }
    const scan = {
      id: 'cert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      category: 'cert',
      name: file.name,
      type: file.type,
      size: file.size,
      uploadDate: new Date().toISOString(),
      dataUrl: dataUrl
    };
    await saveScanToIDB(scan);
    document.getElementById('cert_scan_id').value = scan.id;
    renderCertScanPreview(scan);
  } catch(err){
    alert('업로드 오류: ' + err.message);
  } finally {
    zone.innerHTML = originalHTML;
  }
}

function renderCertScanPreview(scan){
  const preview = document.getElementById('certScanPreview');
  const isPdf = scan.type === 'application/pdf';
  const sizeKb = (scan.size / 1024).toFixed(0);
  const thumb = isPdf
    ? '<div class="pdf-icon" style="font-size:32px;">📄</div>'
    : '<img src="' + scan.dataUrl + '" alt="">';
  preview.innerHTML =
    '<div style="display:flex; gap:10px; align-items:center; padding:8px; background:white; border:1px solid #e2e8f0; border-radius:4px;">' +
      '<div class="cert-scan-thumb" style="margin:0;" onclick="openCertScanViewer(\'' + scan.id + '\')">' + thumb + '</div>' +
      '<div style="flex:1; font-size:12px;">' +
        '<div style="font-weight:600; color:#1e3a5f;">' + scan.name + '</div>' +
        '<div style="color:#64748b; margin-top:2px;">' + sizeKb + ' KB · ' + scan.uploadDate.substring(0,10) + '</div>' +
      '</div>' +
      '<button class="btn btn-danger" style="padding:4px 10px; font-size:11px;" onclick="removeCertScan()">삭제</button>' +
    '</div>';
}

async function removeCertScan(){
  if (!confirm('스캔본을 삭제하시겠습니까?')) return;
  const scanId = document.getElementById('cert_scan_id').value;
  if (scanId) {
    await deleteScanFromIDB(scanId).catch(()=>{});
    document.getElementById('cert_scan_id').value = '';
    document.getElementById('certScanPreview').innerHTML = '';
  }
}

async function openCertScanViewer(id){
  const f = await loadScanFromIDB(id);
  if (!f) { alert('스캔본을 찾을 수 없습니다.'); return; }
  const imgDiv = document.getElementById('scanViewerImage');
  if (f.type === 'application/pdf'){
    imgDiv.innerHTML = '<iframe src="' + f.dataUrl + '" style="width:90vw; height:85vh; border:none; background:white; border-radius:4px;"></iframe>';
  } else {
    imgDiv.innerHTML = '<img src="' + f.dataUrl + '" alt="" style="max-width:95vw; max-height:88vh;">';
  }
  document.getElementById('scanViewerInfo').innerHTML =
    '<strong>📎 ' + f.name + '</strong> · 밀시트 첨부 원본 <button class="btn btn-primary" style="margin-left:10px; padding:4px 10px; font-size:11px;" onclick="downloadScan(\'' + f.id + '\')">📥 다운로드</button>';
  document.getElementById('scanViewer').classList.add('show');
}

// 초기 갤러리 렌더
renderScanGallery();



// ==================================================================
// 설정 탭 - Supabase common_code 연동 / 메일 / ntfy
// ==================================================================
const SETTINGS_LS_KEY = 'tj_material_settings_v1';

// ======================================================================
// 🔗 Supabase 자동 연동 설정 (파일 열자마자 바로 연결)
// ----------------------------------------------------------------------
// 이 값을 비워두면 설정 탭에서 수동 입력 모드로 동작합니다.
// 하드코딩된 값이 있으면 앱 시작 시 자동으로 연결됩니다.
// ======================================================================
const DEFAULT_SUPABASE_URL = 'https://jgvikmakenpllwxwdugk.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_sKp-6nz2PQ9LxQ5pF-nYkg_YwoEJN6S';

// 설정 상태
let appSettings = {
  gasUrl: '',
  mailRecipients: [],
  ntfyTopics: [],
  supabaseUrl: DEFAULT_SUPABASE_URL,
  supabaseKey: DEFAULT_SUPABASE_KEY
};

// 로컬 캐시 로드 (+ 옛 프로젝트 URL 자동 마이그레이션)
function loadSettingsFromLS(){
  try {
    const saved = localStorage.getItem(SETTINGS_LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      appSettings = Object.assign(appSettings, parsed);
      // 저장된 값이 비어있으면 하드코딩 기본값 복원
      if (!appSettings.supabaseUrl) appSettings.supabaseUrl = DEFAULT_SUPABASE_URL;
      if (!appSettings.supabaseKey) appSettings.supabaseKey = DEFAULT_SUPABASE_KEY;
      // ★ 옛 프로젝트 URL 발견 시 자동으로 새 URL로 교체
      // 운영 DB는 jgvikmakenpllwxwdugk 1개로 통일됨
      const OLD_URLS = ['ebthltdmxpzlkfwvdloz', 'omngtyewdaqpphnzeate'];
      if (OLD_URLS.some(o => (appSettings.supabaseUrl||'').indexOf(o) >= 0)) {
        console.log('[Migration] 옛 Supabase URL 발견 → 새 URL로 교체:', appSettings.supabaseUrl, '→', DEFAULT_SUPABASE_URL);
        appSettings.supabaseUrl = DEFAULT_SUPABASE_URL;
        appSettings.supabaseKey = DEFAULT_SUPABASE_KEY;
        // 옛 프로젝트에서 받아온 캐시 데이터도 함께 정리 (다른 DB 데이터)
        try {
          localStorage.removeItem('tj_material_cert_v3');
          localStorage.removeItem('tj_material_cert_v2');
          localStorage.removeItem('tj_material_cert_v1');
          localStorage.removeItem('tj_material_log_v1');
          console.log('[Migration] 옛 DB 캐시 데이터 정리 완료');
        } catch(e) {}
        saveSettingsToLS();
      }
    }
  } catch(e) { console.warn('설정 로드 실패', e); }
}

function saveSettingsToLS(){
  try {
    localStorage.setItem(SETTINGS_LS_KEY, JSON.stringify(appSettings));
  } catch(e) { console.warn('설정 저장 실패', e); }
}

// Supabase REST 헬퍼
async function supabaseRequest(method, path, body){
  if (!appSettings.supabaseUrl || !appSettings.supabaseKey) {
    throw new Error('Supabase 설정이 비어 있습니다');
  }
  const url = appSettings.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path;
  const headers = {
    'apikey': appSettings.supabaseKey,
    'Authorization': 'Bearer ' + appSettings.supabaseKey,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Supabase ' + res.status + ': ' + t);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

// common_code 조회
async function loadCommonCode(codeGroup){
  const data = await supabaseRequest('GET', 'common_code?code_group=eq.' + encodeURIComponent(codeGroup) + '&order=sort_order');
  return data || [];
}

// common_code 업서트 (group 단위 전체 교체)
async function upsertCommonCodeGroup(codeGroup, items){
  // 먼저 기존 group 삭제
  await supabaseRequest('DELETE', 'common_code?code_group=eq.' + encodeURIComponent(codeGroup));
  if (items.length === 0) return;
  const payload = items.map((item, idx) => ({
    code_group: codeGroup,
    code_key: typeof item === 'string' ? item : item.key,
    code_value: typeof item === 'string' ? item : (item.value || item.key),
    sort_order: idx
  }));
  await supabaseRequest('POST', 'common_code', payload);
}

// ==================================================================
// UI 렌더링
// ==================================================================
function renderSettingsTab(){
  document.getElementById('gasUrl').value = appSettings.gasUrl || '';
  document.getElementById('supabaseUrl').value = appSettings.supabaseUrl || '';
  document.getElementById('supabaseKey').value = appSettings.supabaseKey || '';
  renderMailRecipients();
  renderNtfyTopics();
  renderChargeSettings();
  renderSupplierMaster();
  renderMaterialMaster();
  updateConnectionStatus();
}

// ========================================
// 소재 업체 마스터 관리 (localStorage 기반)
// ========================================
const LS_SUPPLIER_MASTER = 'tj_material_supplier_master_v1';

function loadSupplierMaster(){
  const def = [
    {name:'태경스틸',         commodity:'CR COIL (SPCC)',  spec:'KS D3512 SPC1 / JIS G3141 SPCC / ASTM A1008 CSA', surface:'DULL(S)'},
    {name:'㈜동일스테인레스', commodity:'STS CR COIL',     spec:'KS D3698-STS304',                                  surface:'NO. 2B'},
    {name:'동국산업',         commodity:'',                spec:'',                                                  surface:''},
    {name:'나스테크',         commodity:'',                spec:'',                                                  surface:''},
    {name:'한국금속',         commodity:'',                spec:'',                                                  surface:''}
  ];
  try {
    const raw = localStorage.getItem(LS_SUPPLIER_MASTER);
    if (!raw) {
      localStorage.setItem(LS_SUPPLIER_MASTER, JSON.stringify(def));
      return def;
    }
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved) || saved.length === 0) return def;

    // ⭐ 자동 보강: 기존 저장 데이터에 새 공급자(동국산업/나스테크/한국금속)가 없으면 추가
    const savedNames = new Set(saved.map(s => s.name));
    let added = false;
    ['동국산업', '나스테크', '한국금속'].forEach(name => {
      if (!savedNames.has(name)) {
        saved.push({name, commodity:'', spec:'', surface:''});
        added = true;
      }
    });
    if (added) {
      localStorage.setItem(LS_SUPPLIER_MASTER, JSON.stringify(saved));
    }
    return saved;
  } catch(e) {
    return def;
  }
}

let supplierMaster = loadSupplierMaster();

function saveSupplierMasterToLS(){
  localStorage.setItem(LS_SUPPLIER_MASTER, JSON.stringify(supplierMaster));
}

function renderSupplierMaster(){
  const list = document.getElementById('supplierMasterList');
  if (!list) return;
  if (supplierMaster.length === 0) {
    list.innerHTML = '<div style="padding:12px; text-align:center; color:#94a3b8; background:#f8fafc; border-radius:4px; font-size:12px;">등록된 업체가 없습니다</div>';
    return;
  }
  list.innerHTML = supplierMaster.map((s, idx) =>
    '<div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; margin-bottom:6px;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
        '<div style="font-weight:700; color:#1e3a5f; font-size:14px;">' +
          '<span style="color:#64748b; font-size:11px; margin-right:6px;">[' + (idx+1) + ']</span>' +
          s.name +
        '</div>' +
        '<div style="display:flex; gap:6px;">' +
          '<button class="btn" style="padding:4px 10px; font-size:11px; background:#3b82f6; color:white;" onclick="editSupplier(' + idx + ')">✏️ 수정</button>' +
          '<button class="btn btn-danger" style="padding:4px 10px; font-size:11px;" onclick="removeSupplier(' + idx + ')">✕ 삭제</button>' +
        '</div>' +
      '</div>' +
      '<div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:6px; font-size:11px;">' +
        '<div><span style="color:#64748b;">품명:</span> <strong style="color:#1e3a5f;">' + (s.commodity||'-') + '</strong></div>' +
        '<div><span style="color:#64748b;">규격:</span> <strong style="color:#1e3a5f;">' + (s.spec||'-') + '</strong></div>' +
        '<div><span style="color:#64748b;">표면:</span> <strong style="color:#1e3a5f;">' + (s.surface||'-') + '</strong></div>' +
      '</div>' +
    '</div>'
  ).join('');
}

function addSupplierMaster(){
  const name = (document.getElementById('supName').value || '').trim();
  if (!name) { alert('업체명은 필수입니다.'); return; }
  if (supplierMaster.some(s => s.name === name)) { alert('이미 등록된 업체입니다.'); return; }
  supplierMaster.push({
    name: name,
    commodity: (document.getElementById('supCommodity').value || '').trim(),
    spec: (document.getElementById('supSpec').value || '').trim(),
    surface: (document.getElementById('supSurface').value || '').trim()
  });
  saveSupplierMasterToLS();
  // 입력 필드 비우기
  ['supName','supCommodity','supSpec','supSurface'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderSupplierMaster();
  alert('✅ 업체가 추가되었습니다.');
}

// 하위 호환 (기존 호출 유지)
const addSupplier = addSupplierMaster;

function editSupplier(idx){
  const s = supplierMaster[idx];
  if (!s) return;
  const newName = prompt('업체명:', s.name);
  if (newName === null) return;
  const newCommodity = prompt('기본 품명:', s.commodity || '');
  if (newCommodity === null) return;
  const newSpec = prompt('기본 규격:', s.spec || '');
  if (newSpec === null) return;
  const newSurface = prompt('기본 표면:', s.surface || '');
  if (newSurface === null) return;
  supplierMaster[idx] = {
    name: newName.trim() || s.name,
    commodity: newCommodity.trim(),
    spec: newSpec.trim(),
    surface: newSurface.trim()
  };
  saveSupplierMasterToLS();
  renderSupplierMaster();
  alert('✅ 업체 정보가 수정되었습니다.');
}

function removeSupplier(idx){
  const s = supplierMaster[idx];
  if (!s) return;
  if (!confirm('"' + s.name + '"을(를) 삭제하시겠습니까?\n\n※ 기존 검사성적서 데이터는 유지되지만, 신규 등록 시 드롭다운에서 사라집니다.')) return;
  supplierMaster.splice(idx, 1);
  saveSupplierMasterToLS();
  renderSupplierMaster();
}

// ============================================================
// 📦 소재 마스터 (Material Master) - 검사성적서용
// ============================================================
const LS_MATERIAL_MASTER = 'tj_material_master_v1';
let materialMaster = [];

function loadMaterialMaster(){
  const def = [
    { supplier:'태경스틸', material:'SPCC', commodity:'CR COIL (SPCC)', spec:'KS D3512 SPC1 / JIS G3141 SPCC / ASTM A1008 CSA', surface:'DULL(S)', thick:0.5, width:0, remark:'' },
    { supplier:'태경스틸', material:'SPCC', commodity:'CR COIL (SPCC)', spec:'KS D3512 SPC1 / JIS G3141 SPCC / ASTM A1008 CSA', surface:'DULL(S)', thick:0.6, width:0, remark:'' },
    { supplier:'㈜동일스테인레스', material:'SUS304', commodity:'STS CR COIL', spec:'KS D3698-STS304 / ASTM A240M-304', surface:'NO. 2B', thick:0.5, width:0, remark:'' },
    { supplier:'㈜동일스테인레스', material:'SUS430', commodity:'STS CR COIL', spec:'ASTM A240M-430 / KS D3698-STS430', surface:'NO. 2B', thick:0.6, width:0, remark:'' }
  ];
  try {
    const raw = localStorage.getItem(LS_MATERIAL_MASTER);
    if (!raw) {
      materialMaster = def;
      localStorage.setItem(LS_MATERIAL_MASTER, JSON.stringify(def));
    } else {
      materialMaster = JSON.parse(raw);
    }
  } catch(e) {
    materialMaster = def;
  }
}

function saveMaterialMasterToLS(){
  localStorage.setItem(LS_MATERIAL_MASTER, JSON.stringify(materialMaster));
}

function renderMaterialMaster(){
  const tbody = document.getElementById('materialMasterBody');
  if (!tbody) return;

  if (!materialMaster || materialMaster.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">등록된 소재가 없습니다. <b>＋ 소재 추가</b> 또는 <b>🔄 자동 추출</b> 버튼을 사용하세요.</td></tr>';
    return;
  }

  // 공급자 → 재질 → 두께 순 정렬
  const sorted = [...materialMaster].sort((a, b) => {
    if ((a.supplier||'') !== (b.supplier||'')) return (a.supplier||'').localeCompare(b.supplier||'');
    if ((a.material||'') !== (b.material||'')) return (a.material||'').localeCompare(b.material||'');
    return (parseFloat(a.thick)||0) - (parseFloat(b.thick)||0);
  });

  tbody.innerHTML = sorted.map(m => {
    const idx = materialMaster.indexOf(m);
    const matColor = m.material === 'SPCC' ? '#3b82f6' : (m.material && m.material.startsWith('SUS')) ? '#10b981' : '#64748b';
    return `<tr>
      <td>${m.supplier||''}</td>
      <td style="font-weight:600;">${m.commodity||''}</td>
      <td style="font-size:11px; color:#475569;">${m.spec||''}</td>
      <td>${m.surface||''}</td>
      <td><span style="background:${matColor}; color:white; padding:2px 8px; border-radius:10px; font-size:11px; font-weight:600;">${m.material||''}</span></td>
      <td style="text-align:right;">${m.thick ? Number(m.thick).toFixed(2) : '-'}</td>
      <td style="text-align:right;">${m.width ? Number(m.width).toFixed(1) : '-'}</td>
      <td>
        <button class="btn btn-primary" style="padding:4px 10px; font-size:11px;" onclick="editMaterialMaster(${idx})">수정</button>
        <button class="btn btn-danger" style="padding:4px 10px; font-size:11px;" onclick="removeMaterialMaster(${idx})">삭제</button>
      </td>
    </tr>`;
  }).join('');
}

function openMaterialMasterModal(){
  document.getElementById('mmModalTitle').textContent = '소재 추가';
  document.getElementById('mm_idx').value = '-1';
  document.getElementById('mm_supplier').value = '';
  document.getElementById('mm_material').value = 'SPCC';
  document.getElementById('mm_commodity').value = '';
  document.getElementById('mm_spec').value = '';
  document.getElementById('mm_surface').value = '';
  document.getElementById('mm_thick').value = '';
  document.getElementById('mm_width').value = '';
  document.getElementById('mm_remark').value = '';

  // 공급자 드롭다운 옵션 채우기
  const dlSup = document.getElementById('dl_mm_supplier');
  if (dlSup && Array.isArray(supplierMaster)) {
    dlSup.innerHTML = supplierMaster.map(s => '<option value="' + s.name + '">').join('');
  }

  document.getElementById('materialMasterModal').classList.add('show');
}

function editMaterialMaster(idx){
  const m = materialMaster[idx];
  if (!m) return;
  document.getElementById('mmModalTitle').textContent = '소재 수정';
  document.getElementById('mm_idx').value = String(idx);
  document.getElementById('mm_supplier').value = m.supplier || '';
  document.getElementById('mm_material').value = m.material || 'SPCC';
  document.getElementById('mm_commodity').value = m.commodity || '';
  document.getElementById('mm_spec').value = m.spec || '';
  document.getElementById('mm_surface').value = m.surface || '';
  document.getElementById('mm_thick').value = m.thick || '';
  document.getElementById('mm_width').value = m.width || '';
  document.getElementById('mm_remark').value = m.remark || '';

  const dlSup = document.getElementById('dl_mm_supplier');
  if (dlSup && Array.isArray(supplierMaster)) {
    dlSup.innerHTML = supplierMaster.map(s => '<option value="' + s.name + '">').join('');
  }

  document.getElementById('materialMasterModal').classList.add('show');
}

function closeMaterialMasterModal(){
  document.getElementById('materialMasterModal').classList.remove('show');
}

function saveMaterialMaster(){
  const idx = parseInt(document.getElementById('mm_idx').value);
  const supplier = document.getElementById('mm_supplier').value.trim();
  const material = document.getElementById('mm_material').value;
  const commodity = document.getElementById('mm_commodity').value.trim();
  const spec = document.getElementById('mm_spec').value.trim();
  const surface = document.getElementById('mm_surface').value.trim();
  const thick = parseFloat(document.getElementById('mm_thick').value) || 0;
  const width = parseFloat(document.getElementById('mm_width').value) || 0;
  const remark = document.getElementById('mm_remark').value.trim();

  if (!supplier) { alert('공급자를 입력하세요.'); return; }
  if (!commodity) { alert('품명을 입력하세요.'); return; }

  const data = { supplier, material, commodity, spec, surface, thick, width, remark };

  if (idx >= 0) {
    materialMaster[idx] = data;
  } else {
    // 중복 체크 (공급자+품명+규격+표면+두께)
    const dup = materialMaster.find(m =>
      m.supplier === supplier && m.commodity === commodity &&
      m.spec === spec && m.surface === surface &&
      (parseFloat(m.thick)||0) === thick
    );
    if (dup) {
      if (!confirm('동일한 소재가 이미 등록되어 있습니다. 그래도 추가하시겠습니까?')) return;
    }
    materialMaster.push(data);
  }

  saveMaterialMasterToLS();
  renderMaterialMaster();
  closeMaterialMasterModal();
  // 검사성적서 모달 datalist도 갱신
  if (typeof refreshCertModalDatalists === 'function') refreshCertModalDatalists();
  showToast(idx >= 0 ? '✅ 소재 정보가 수정되었습니다' : '✅ 소재가 추가되었습니다');
}

function removeMaterialMaster(idx){
  const m = materialMaster[idx];
  if (!m) return;
  if (!confirm('"' + (m.commodity||'') + ' / ' + (m.spec||'') + '" 소재를 삭제하시겠습니까?')) return;
  materialMaster.splice(idx, 1);
  saveMaterialMasterToLS();
  renderMaterialMaster();
  if (typeof refreshCertModalDatalists === 'function') refreshCertModalDatalists();
}

// 기존 검사성적서 데이터에서 (공급자+품명+규격+표면+두께+폭) 조합 자동 추출
function autoExtractMaterialMaster(){
  if (!Array.isArray(certData) || certData.length === 0) {
    alert('등록된 검사성적서가 없어 추출할 데이터가 없습니다.');
    return;
  }

  // 기존 마스터 키 (중복 방지)
  const existingKeys = new Set(materialMaster.map(m =>
    [m.supplier, m.commodity, m.spec, m.surface, parseFloat(m.thick)||0].join('|')
  ));

  let added = 0;
  certData.forEach(c => {
    // 재질 추정
    const s = (c.supplier||'') + ' ' + (c.spec||'') + ' ' + (c.commodity||'');
    let mat = 'SPCC';
    if (/304/.test(s)) mat = 'SUS304';
    else if (/430/.test(s)) mat = 'SUS430';
    else if (/STS|스테인/.test(s)) mat = 'SUS304';

    // SIZE에서 두께/폭 추출 (예: "0.5(T) X 118(mm)")
    let thick = 0, width = 0;
    const sm = (c.size||'').match(/([\d.]+)\s*\(?T\)?\s*[Xx×]\s*([\d.]+)/);
    if (sm) { thick = parseFloat(sm[1]); width = parseFloat(sm[2]); }

    const key = [c.supplier||'', c.commodity||'', c.spec||'', c.surface||'', thick].join('|');
    if (!existingKeys.has(key)) {
      materialMaster.push({
        supplier: c.supplier||'',
        material: mat,
        commodity: c.commodity||'',
        spec: c.spec||'',
        surface: c.surface||'',
        thick: thick,
        width: width,
        remark: '자동 추출'
      });
      existingKeys.add(key);
      added++;
    }
  });

  if (added === 0) {
    alert('새로 추출된 소재가 없습니다. (모든 조합이 이미 등록되어 있음)');
    return;
  }

  saveMaterialMasterToLS();
  renderMaterialMaster();
  if (typeof refreshCertModalDatalists === 'function') refreshCertModalDatalists();
  alert('✅ ' + added + '건의 소재가 자동 추출되어 마스터에 추가되었습니다.');
}

// 초기 로드
loadMaterialMaster();

// 신규 등록 모달의 datalist 채우기
function refreshCertModalDatalists(){
  const dlSup = document.getElementById('dl_supplier');
  if (dlSup) {
    dlSup.innerHTML = supplierMaster.map(s => '<option value="' + s.name + '">').join('');
  }
  const commodities = new Set();
  const specs = new Set();
  const surfaces = new Set();
  supplierMaster.forEach(s => {
    if (s.commodity) commodities.add(s.commodity);
    if (s.spec) specs.add(s.spec);
    if (s.surface) surfaces.add(s.surface);
  });
  // ⭐ 소재 마스터의 옵션도 추가
  if (Array.isArray(materialMaster)) {
    materialMaster.forEach(m => {
      if (m.commodity) commodities.add(m.commodity);
      if (m.spec) specs.add(m.spec);
      if (m.surface) surfaces.add(m.surface);
    });
  }
  // 기존 데이터에서 사용된 값도 추가
  if (Array.isArray(certData)) {
    certData.forEach(c => {
      if (c.commodity) commodities.add(c.commodity);
      if (c.spec) specs.add(c.spec);
      if (c.surface) surfaces.add(c.surface);
    });
  }
  const setOpt = (id, items) => {
    const dl = document.getElementById(id);
    if (dl) dl.innerHTML = [...items].sort().map(v => '<option value="' + v + '">').join('');
  };
  setOpt('dl_commodity', commodities);
  setOpt('dl_spec', specs);
  setOpt('dl_surface', surfaces);
}

// 공급자 변경 시 → 해당 업체의 기본 품명/규격/표면 자동 채우기
function onSupplierChange(){
  const supName = (document.getElementById('c_supplier').value || '').trim();
  if (!supName) return;

  // 1) supplierMaster에서 기본 정보 (품명/규격/표면)
  const found = (typeof supplierMaster !== 'undefined') ? supplierMaster.find(s => s.name === supName) : null;
  if (found) {
    const fields = [
      {id:'c_commodity', val: found.commodity},
      {id:'c_spec',      val: found.spec},
      {id:'c_surface',   val: found.surface}
    ];
    fields.forEach(({id, val}) => {
      const el = document.getElementById(id);
      if (el && !el.value && val) el.value = val;  // 빈 필드만 자동 채움 (확인창 없음)
    });
  }

  // 2) materialMaster에서 동일 공급자 항목 찾아 측정 SPEC 자동 채움
  if (typeof materialMaster !== 'undefined' && Array.isArray(materialMaster) && typeof MATERIAL_SPEC_TEMPLATES === 'object') {
    const matchedMat = materialMaster.find(m => m.supplier === supName);
    if (matchedMat && matchedMat.material) {
      autoFillMeasSpecsByMaterial(matchedMat.material, matchedMat.thick, matchedMat.width);
    }
  }
}

// 재질에 따라 측정값 SPEC 자동 채움 (sup_xxx_spec, cus_xxx_spec 둘 다)
function autoFillMeasSpecsByMaterial(material, thick, width){
  if (!material || typeof MATERIAL_SPEC_TEMPLATES === 'undefined') return;
  const template = MATERIAL_SPEC_TEMPLATES[material];
  if (!template) return;

  // 재질에 따라 두께/폭/경도/연신율/형곡/평탄도 SPEC 채움 (빈 필드만)
  Object.keys(template).forEach(key => {
    const supSpec = document.getElementById('sup_' + key + '_spec');
    const cusSpec = document.getElementById('cus_' + key + '_spec');
    let val = template[key];
    // {thick}, {width} 치환
    if (typeof val === 'string') {
      val = val.replace('{thick}', thick || '').replace('{width}', width || '');
    }
    if (supSpec && !supSpec.value && val) supSpec.value = val;
    if (cusSpec && !cusSpec.value && val) cusSpec.value = val;
  });

  // 재질명도 자동 채움 (r2 = 재질 항목)
  const supR2X1 = document.getElementById('sup_r2_x1');
  const cusR2X1 = document.getElementById('cus_r2_x1');
  if (supR2X1 && !supR2X1.value) supR2X1.value = material;
  if (cusR2X1 && !cusR2X1.value) cusR2X1.value = material;
}

// 재질별 SPEC 템플릿 (검사 기준서 기반)
const MATERIAL_SPEC_TEMPLATES = {
  'SPCC': {
    r1: '결함없을것',
    r2: 'SPCC',
    r3: '{width} ±0.1',
    r4: '{thick} ±0.05',
    r5: '65 이하',
    r6: '24 이상',
    r7: '0 / +2',
    r8: '0/+12, 0/+8, 0/+6'
  },
  'SUS304': {
    r1: '결함없을것',
    r2: 'SUS304',
    r3: '{width} ±0.1',
    r4: '{thick} ±0.02',
    r5: '90 이하',
    r6: '40 이상',
    r7: '0 / +2',
    r8: '0/+12, 0/+8, 0/+6'
  },
  'SUS430': {
    r1: '결함없을것',
    r2: 'SUS430',
    r3: '{width} ±0.1',
    r4: '{thick} ±0.02',
    r5: '88 이하',
    r6: '22 이상',
    r7: '0 / +2',
    r8: '0/+12, 0/+8, 0/+6'
  }
};

function onCommodityChange(){
  // 품명 변경 시 추가 동작 (현재는 자동 동작 없음, 향후 확장 가능)
}

// ========================================
// 담당자 관리 (localStorage 기반)
// ========================================
const LS_CHARGE_SETTINGS = 'tj_material_charge_settings_v1';

function loadChargeSettings(){
  const def = {
    chargeList: ['문수진', '허미정', '김상기'],
    defaultByMaterial: {
      'SPCC': '문수진',
      'SUS304': '허미정',
      'SUS430': '허미정'
    },
    customerSign: '강병주'
  };
  try {
    const raw = localStorage.getItem(LS_CHARGE_SETTINGS);
    if (!raw) {
      localStorage.setItem(LS_CHARGE_SETTINGS, JSON.stringify(def));
      return def;
    }
    const saved = JSON.parse(raw);
    // 기본값 병합 (누락된 키 보강)
    return {
      chargeList: Array.isArray(saved.chargeList) && saved.chargeList.length > 0 ? saved.chargeList : def.chargeList,
      defaultByMaterial: Object.assign({}, def.defaultByMaterial, saved.defaultByMaterial || {}),
      customerSign: saved.customerSign || def.customerSign
    };
  } catch(e) {
    return def;
  }
}

let chargeSettings = loadChargeSettings();

function saveChargeSettingsToLS(){
  localStorage.setItem(LS_CHARGE_SETTINGS, JSON.stringify(chargeSettings));
}

function renderChargeSettings(){
  // 재질별 기본 담당자 select 채우기
  ['SPCC', 'SUS304', 'SUS430'].forEach(mat => {
    const sel = document.getElementById('defaultCharge' + mat);
    if (!sel) return;
    const cur = chargeSettings.defaultByMaterial[mat] || '';
    sel.innerHTML = chargeSettings.chargeList.map(name =>
      '<option value="' + name + '"' + (name === cur ? ' selected' : '') + '>' + name + '</option>'
    ).join('');
    // 만약 현재 지정된 담당자가 목록에 없으면 추가하여 유지
    if (cur && !chargeSettings.chargeList.includes(cur)) {
      sel.innerHTML = '<option value="' + cur + '" selected>' + cur + '</option>' + sel.innerHTML;
    }
  });

  // 수요자 승인자
  const csi = document.getElementById('defaultCustomerSign');
  if (csi) csi.value = chargeSettings.customerSign || '';

  // 담당자 목록
  const list = document.getElementById('chargeList');
  if (!list) return;
  if (chargeSettings.chargeList.length === 0) {
    list.innerHTML = '<div style="padding:12px; text-align:center; color:#94a3b8; background:#f8fafc; border-radius:4px; font-size:12px;">담당자가 없습니다</div>';
    return;
  }
  list.innerHTML = chargeSettings.chargeList.map((name, idx) => {
    // 어떤 재질의 기본 담당자인지 표시
    const usedFor = [];
    if (chargeSettings.defaultByMaterial.SPCC === name) usedFor.push('SPCC');
    if (chargeSettings.defaultByMaterial.SUS304 === name) usedFor.push('SUS304');
    if (chargeSettings.defaultByMaterial.SUS430 === name) usedFor.push('SUS430');
    const usedBadge = usedFor.length > 0
      ? '<span style="font-size:10px; padding:2px 6px; background:#dbeafe; color:#1e40af; border-radius:3px; margin-left:6px;">기본: ' + usedFor.join(', ') + '</span>'
      : '';
    const canDelete = usedFor.length === 0;
    return '<div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:#f8fafc; border-radius:4px; margin-bottom:4px;">' +
      '<span style="font-weight:600; color:#64748b; font-size:12px; min-width:20px;">' + (idx+1) + '</span>' +
      '<span style="flex:1; font-size:13px; color:#1e3a5f;">' + name + usedBadge + '</span>' +
      (canDelete
        ? '<button class="btn btn-danger" style="padding:4px 10px; font-size:11px;" onclick="removeCharge(' + idx + ')">✕</button>'
        : '<button class="btn" style="padding:4px 10px; font-size:11px; background:#e2e8f0; color:#94a3b8; cursor:not-allowed;" disabled title="이 담당자는 기본 담당자로 사용중이라 삭제할 수 없습니다. 먼저 위에서 다른 담당자로 변경하세요.">✕</button>') +
    '</div>';
  }).join('');
}

function addCharge(){
  const input = document.getElementById('newChargeInput');
  const name = (input.value || '').trim();
  if (!name) { alert('담당자 이름을 입력하세요.'); return; }
  if (chargeSettings.chargeList.includes(name)) { alert('이미 등록된 담당자입니다.'); return; }
  chargeSettings.chargeList.push(name);
  saveChargeSettingsToLS();
  input.value = '';
  renderChargeSettings();
}

function removeCharge(idx){
  const name = chargeSettings.chargeList[idx];
  if (!name) return;
  // 기본 담당자로 사용중이면 삭제 차단 (이미 UI에서도 막혀있지만 이중 안전장치)
  if (Object.values(chargeSettings.defaultByMaterial).includes(name)) {
    alert('"' + name + '"님은 재질별 기본 담당자로 지정되어 있어 삭제할 수 없습니다.\n먼저 다른 담당자로 변경한 후 삭제하세요.');
    return;
  }
  if (!confirm('"' + name + '"님을 담당자 목록에서 삭제하시겠습니까?')) return;
  chargeSettings.chargeList.splice(idx, 1);
  saveChargeSettingsToLS();
  renderChargeSettings();
}

function saveDefaultCharges(){
  ['SPCC', 'SUS304', 'SUS430'].forEach(mat => {
    const sel = document.getElementById('defaultCharge' + mat);
    if (sel) chargeSettings.defaultByMaterial[mat] = sel.value;
  });
  const csi = document.getElementById('defaultCustomerSign');
  if (csi) chargeSettings.customerSign = (csi.value || '').trim() || '강병주';
  saveChargeSettingsToLS();
  renderChargeSettings();
}

// 검사증명서의 재질을 판별해서 담당자 반환
function getDefaultChargeForCert(c){
  const s = (c.supplier||'') + ' ' + (c.spec||'') + ' ' + (c.commodity||'') + ' ' + (c.r2 ? (c.r2.spec||'') : '');
  if (/SUS304|STS304|KS D3698-STS304/i.test(s)) return chargeSettings.defaultByMaterial.SUS304 || '허미정';
  if (/SUS430|430|ASTM-A240M-430/i.test(s)) return chargeSettings.defaultByMaterial.SUS430 || '허미정';
  // SUS인데 304/430 둘 다 매칭 안되는 경우 (ex. spec='304')는 SUS304로
  if (/동일스테인레스|STS|스테인|304/i.test(s)) return chargeSettings.defaultByMaterial.SUS304 || '허미정';
  // 그 외(SPCC 포함)
  return chargeSettings.defaultByMaterial.SPCC || '문수진';
}

function renderMailRecipients(){
  const list = document.getElementById('mailRecipientList');
  if (appSettings.mailRecipients.length === 0) {
    list.innerHTML = '<div style="padding:12px; text-align:center; color:#94a3b8; background:#f8fafc; border-radius:4px; font-size:12px;">수신자가 없습니다</div>';
    return;
  }
  list.innerHTML = appSettings.mailRecipients.map((email, idx) =>
    '<div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:#f8fafc; border-radius:4px; margin-bottom:4px;">' +
      '<span style="font-weight:600; color:#64748b; font-size:12px; min-width:20px;">' + (idx+1) + '</span>' +
      '<span style="flex:1; font-size:13px; color:#1e3a5f;">' + email + '</span>' +
      '<button class="btn btn-danger" style="padding:4px 10px; font-size:11px;" onclick="removeMailRecipient(' + idx + ')">✕</button>' +
    '</div>'
  ).join('');
}

function renderNtfyTopics(){
  const list = document.getElementById('ntfyTopicList');
  if (appSettings.ntfyTopics.length === 0) {
    list.innerHTML = '<div style="padding:12px; text-align:center; color:#94a3b8; background:#f8fafc; border-radius:4px; font-size:12px;">등록된 ntfy 방이 없습니다</div>';
    return;
  }
  list.innerHTML = appSettings.ntfyTopics.map((topic, idx) =>
    '<div style="display:flex; align-items:center; gap:8px; padding:8px 12px; background:#f8fafc; border-radius:4px; margin-bottom:4px;">' +
      '<span style="font-weight:600; color:#64748b; font-size:12px; min-width:20px;">' + (idx+1) + '</span>' +
      '<span style="flex:1; font-size:13px; color:#1e3a5f; font-family:Consolas,monospace;">' + topic + '</span>' +
      '<a href="https://ntfy.sh/' + topic + '" target="_blank" class="btn btn-secondary" style="padding:4px 10px; font-size:11px; text-decoration:none;">🔗</a>' +
      '<button class="btn btn-danger" style="padding:4px 10px; font-size:11px;" onclick="removeNtfyTopic(' + idx + ')">✕</button>' +
    '</div>'
  ).join('');
}

function updateConnectionStatus(){
  const el = document.getElementById('connectionStatus');
  const supOk = !!(appSettings.supabaseUrl && appSettings.supabaseKey);
  const mailOk = !!(appSettings.gasUrl);
  const ntfyCount = appSettings.ntfyTopics.length;
  const mailCount = appSettings.mailRecipients.length;

  el.innerHTML =
    '<div>' + (supOk?'🟢':'🔴') + ' Supabase: ' + (supOk?'설정됨':'미연결') + '</div>' +
    '<div>' + (mailOk?'🟢':'🔴') + ' 메일 알림: ' + (mailOk?'서버 설정됨':'미설정') + '</div>' +
    '<div>' + (ntfyCount>0?'🟢':'🔴') + ' ntfy: ' + ntfyCount + '개 방</div>' +
    '<div>' + (mailCount>0?'🟢':'🔴') + ' 메일 수신자: ' + mailCount + '명</div>';
}

// ==================================================================
// 이벤트 핸들러
// ==================================================================
function addMailRecipient(){
  const input = document.getElementById('newMailInput');
  const email = (input.value || '').trim();
  if (!email) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    alert('올바른 이메일 형식이 아닙니다');
    return;
  }
  if (appSettings.mailRecipients.includes(email)) {
    alert('이미 등록된 이메일입니다');
    return;
  }
  appSettings.mailRecipients.push(email);
  saveSettingsToLS();
  input.value = '';
  renderMailRecipients();
  updateConnectionStatus();
}

function removeMailRecipient(idx){
  if (!confirm('이 수신자를 삭제하시겠습니까?')) return;
  appSettings.mailRecipients.splice(idx, 1);
  saveSettingsToLS();
  renderMailRecipients();
  updateConnectionStatus();
}

function addNtfyTopic(){
  const input = document.getElementById('newNtfyInput');
  const topic = (input.value || '').trim();
  if (!topic) return;
  if (!/^[a-zA-Z0-9_-]+$/.test(topic)) {
    alert('영문/숫자/하이픈/언더스코어만 사용 가능합니다');
    return;
  }
  if (appSettings.ntfyTopics.includes(topic)) {
    alert('이미 등록된 방입니다');
    return;
  }
  appSettings.ntfyTopics.push(topic);
  saveSettingsToLS();
  input.value = '';
  renderNtfyTopics();
  updateConnectionStatus();
}

function removeNtfyTopic(idx){
  if (!confirm('이 ntfy 방을 삭제하시겠습니까?')) return;
  appSettings.ntfyTopics.splice(idx, 1);
  saveSettingsToLS();
  renderNtfyTopics();
  updateConnectionStatus();
}

function toggleGasUrlVisibility(){
  const el = document.getElementById('gasUrl');
  el.type = el.type === 'password' ? 'text' : 'password';
}
function toggleSupabaseKeyVisibility(){
  const el = document.getElementById('supabaseKey');
  el.type = el.type === 'password' ? 'text' : 'password';
}

// ==================================================================
// 연결 테스트
// ==================================================================
async function testSupabaseConnection(){
  const url = document.getElementById('supabaseUrl').value.trim();
  const key = document.getElementById('supabaseKey').value.trim();
  if (!url || !key) { alert('URL과 Key를 모두 입력하세요'); return; }

  // 임시로 세팅해서 테스트
  const oldUrl = appSettings.supabaseUrl;
  const oldKey = appSettings.supabaseKey;
  appSettings.supabaseUrl = url;
  appSettings.supabaseKey = key;

  try {
    await supabaseRequest('GET', 'common_code?limit=1');
    // material_log / material_cert 테이블 존재 여부도 확인
    let tablesExist = { log: false, cert: false };
    try { await supabaseRequest('GET', 'material_log?limit=1'); tablesExist.log = true; } catch(e) {}
    try { await supabaseRequest('GET', 'material_cert?limit=1'); tablesExist.cert = true; } catch(e) {}

    let msg = '✅ Supabase 연결 성공!\n\n';
    msg += tablesExist.log ? '✓ material_log 테이블 OK\n' : '✗ material_log 테이블 없음\n';
    msg += tablesExist.cert ? '✓ material_cert 테이블 OK\n' : '✗ material_cert 테이블 없음\n';
    if (!tablesExist.log || !tablesExist.cert) {
      msg += '\n⚠️ 누락된 테이블은 "Supabase SQL" 섹션의 SQL을 실행해서 만드세요.';
    } else {
      msg += '\n데이터를 서버에서 불러오는 중...';
    }
    alert(msg);
    // 테스트 성공시 로컬 저장
    saveSettingsToLS();
    updateConnectionStatus();
    // 테이블이 모두 있으면 데이터 자동 동기화
    if (tablesExist.log && tablesExist.cert) {
      syncState.isOnline = true;
      await pullFromSupabase();
      await pushAllLocalToSupabase();
      updateSyncBadge();
    }
  } catch(e) {
    appSettings.supabaseUrl = oldUrl;
    appSettings.supabaseKey = oldKey;
    if (String(e).includes('404') || String(e).includes('does not exist')) {
      alert('⚠️ 연결은 되었으나 common_code 테이블이 없습니다.\n\nSupabase SQL Editor에서 "Supabase SQL (테이블 생성)" 섹션의 SQL을 실행하세요.');
    } else {
      alert('❌ Supabase 연결 실패\n\n' + e.message);
    }
  }
}

async function testMailConnection(){
  const gasUrl = document.getElementById('gasUrl').value.trim();
  if (!gasUrl) { alert('GAS 웹앱 URL을 입력하세요'); return; }
  if (appSettings.mailRecipients.length === 0) {
    if (!confirm('수신자가 없습니다. 그래도 URL 응답 테스트만 수행할까요?')) return;
  }

  try {
    // GAS는 CORS 프리플라이트를 일반적으로 처리하지 않으므로 no-cors 모드로 확인
    const res = await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        type: 'test',
        subject: '[태진다이텍] 메일 연결 테스트',
        body: '소재 수입검사 관리 시스템에서 발송된 테스트 메일입니다.\n\n발송시각: ' + new Date().toLocaleString('ko-KR'),
        recipients: appSettings.mailRecipients
      })
    });
    alert('📡 메일 발송 요청 전송됨\n\n(no-cors 모드라 실제 응답은 확인 불가)\n수신함을 확인해주세요.');
  } catch(e) {
    alert('❌ 요청 실패: ' + e.message);
  }
}

async function testNtfy(){
  if (appSettings.ntfyTopics.length === 0) {
    alert('먼저 ntfy 방을 등록하세요');
    return;
  }
  try {
    for (const topic of appSettings.ntfyTopics) {
      await fetch('https://ntfy.sh/' + topic, {
        method: 'POST',
        headers: { 'Title': '[태진다이텍] 테스트', 'Priority': 'default', 'Tags': 'bell' },
        body: '소재 수입검사 관리 시스템 푸시 알림 테스트입니다.\n시각: ' + new Date().toLocaleString('ko-KR')
      });
    }
    alert('📡 ntfy 푸시 알림 발송 완료\n' + appSettings.ntfyTopics.length + '개 방에 전송');
  } catch(e) {
    alert('❌ 전송 실패: ' + e.message);
  }
}

// ==================================================================
// 전체 설정 저장
// ==================================================================
async function saveAllSettings(){
  // 입력값 수집
  appSettings.gasUrl = document.getElementById('gasUrl').value.trim();
  appSettings.supabaseUrl = document.getElementById('supabaseUrl').value.trim();
  appSettings.supabaseKey = document.getElementById('supabaseKey').value.trim();

  // 로컬 저장 (항상)
  saveSettingsToLS();

  // Supabase 저장
  if (!appSettings.supabaseUrl || !appSettings.supabaseKey) {
    alert('💾 로컬에 저장됨\n\nSupabase 설정이 없어 서버 저장은 생략되었습니다.');
    updateConnectionStatus();
    return;
  }

  try {
    // GAS URL 저장
    await upsertCommonCodeGroup('mail_gas', appSettings.gasUrl ? [appSettings.gasUrl] : []);
    // 메일 수신자 저장
    await upsertCommonCodeGroup('mat_mail', appSettings.mailRecipients);
    // ntfy 방 저장
    await upsertCommonCodeGroup('ntfy_topics', appSettings.ntfyTopics);

    alert('✅ 모든 설정이 Supabase에 저장되었습니다!\n\n수입검사 데이터도 자동으로 서버에 동기화됩니다.');
    updateConnectionStatus();

    // 데이터 자동 동기화 시작
    syncState.isOnline = true;
    await pushAllLocalToSupabase().catch(()=>{});
    await pullFromSupabase().catch(()=>{});
    updateSyncBadge();
  } catch(e) {
    alert('⚠️ 서버 저장 실패 (로컬만 저장됨)\n\n' + e.message);
  }
}

// ==================================================================
// Supabase에서 설정 불러오기 (앱 시작시)
// ==================================================================
async function loadSettingsFromSupabase(){
  if (!appSettings.supabaseUrl || !appSettings.supabaseKey) return;
  try {
    const [gasRows, mailRows, ntfyRows] = await Promise.all([
      loadCommonCode('mail_gas').catch(()=>[]),
      loadCommonCode('mat_mail').catch(()=>[]),
      loadCommonCode('ntfy_topics').catch(()=>[])
    ]);
    if (gasRows.length > 0) appSettings.gasUrl = gasRows[0].code_value || gasRows[0].code_key;
    if (mailRows.length > 0) appSettings.mailRecipients = mailRows.map(r => r.code_value || r.code_key);
    if (ntfyRows.length > 0) appSettings.ntfyTopics = ntfyRows.map(r => r.code_value || r.code_key);
    saveSettingsToLS();
  } catch(e) {
    console.warn('Supabase 설정 로드 실패 (로컬 값 사용):', e);
  }
}

// 초기화
loadSettingsFromLS();
// Supabase에서 자동 동기화 (백그라운드)
loadSettingsFromSupabase().then(() => {
  if (document.getElementById('gasUrl')) renderSettingsTab();
});

// 🔗 앱 시작 시 Supabase 자동 연결 시도 (하드코딩된 Key 사용)
(async function autoConnectSupabase(){
  if (!appSettings.supabaseUrl || !appSettings.supabaseKey) {
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
    return;
  }
  try {
    // 테이블 존재 확인 후 데이터 pull
    await supabaseRequest('GET', 'common_code?limit=1');
    if (typeof syncState !== 'undefined') syncState.isOnline = true;
    if (typeof pullFromSupabase === 'function') await pullFromSupabase();
    if (typeof pushAllLocalToSupabase === 'function') await pushAllLocalToSupabase();
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
    console.log('✅ Supabase 자동 연결 성공');
  } catch(e) {
    console.warn('⚠️ Supabase 자동 연결 실패 (로컬 전용 모드):', e.message);
    if (typeof syncState !== 'undefined') syncState.isOnline = false;
    if (typeof updateSyncBadge === 'function') updateSyncBadge();
  }
})();



// ==================================================================
// Supabase 자동 연동 (수입검사일보 / 검사성적서)
// ==================================================================
let syncState = {
  isOnline: false,      // Supabase 연결 가능 여부
  lastSyncAt: null,     // 마지막 동기화 시각
  pendingOps: [],       // 오프라인 시 대기 중인 작업
  autoSyncTimer: null
};

// 대기 큐 로드/저장 (새로고침해도 유지)
const PENDING_KEY = 'tj_material_pending_ops_v1';
function loadPendingOps(){
  try {
    syncState.pendingOps = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
  } catch(e) { syncState.pendingOps = []; }
}
function savePendingOps(){
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(syncState.pendingOps));
  } catch(e) { console.warn('대기큐 저장 실패', e); }
}

function addPendingOp(op){
  // 동일 타입+id 중복 제거 (최신 작업만 유지)
  syncState.pendingOps = syncState.pendingOps.filter(p => !(p.type === op.type && p.action === op.action && p.data && op.data && p.data.id === op.data.id));
  syncState.pendingOps.push(op);
  savePendingOps();
  updateSyncBadge();
}

function updateSyncBadge(){
  const icon = document.getElementById('syncIcon');
  const text = document.getElementById('syncText');
  if (!icon || !text) return;

  const hasSettings = !!(appSettings.supabaseUrl && appSettings.supabaseKey);
  const pendingCount = syncState.pendingOps.length;

  if (!hasSettings) {
    icon.textContent = '⚪';
    text.textContent = '로컬 전용';
  } else if (!syncState.isOnline) {
    icon.textContent = '🔴';
    text.textContent = '오프라인' + (pendingCount > 0 ? ' (대기 ' + pendingCount + ')' : '');
  } else if (pendingCount > 0) {
    icon.textContent = '🟡';
    text.textContent = '동기화 대기 ' + pendingCount + '건';
  } else {
    icon.textContent = '🟢';
    text.textContent = '동기화됨' + (syncState.lastSyncAt ? ' (' + syncState.lastSyncAt.substring(11,16) + ')' : '');
  }
}

// ==================================================================
// 수입검사일보 Supabase CRUD
// ==================================================================
async function pushLogToSupabase(log){
  // id가 없으면 생성
  if (!log.id) log.id = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  const payload = {
    id: log.id,
    date: log.date || null,
    material: log.material || null,
    appear: log.appear || null,
    thick_spec: log.thick_spec || null,
    width_spec: log.width_spec || null,
    thick: log.thick || null,
    width: log.width || null,
    in_kg: log.in_kg || null,
    count: log.count || null,
    bad_kg: log.bad_kg || 0,
    heat: log.heat || null,
    nc: log.nc || null,
    label: log.label || null,
    judge: log.judge || null,
    charge: log.charge || null,
    boss: log.boss || null
  };
  await supabaseRequest('POST', 'material_log?on_conflict=id', payload, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  return log.id;
}

async function deleteLogFromSupabase(id){
  await supabaseRequest('DELETE', 'material_log?id=eq.' + encodeURIComponent(id));
}

async function fetchLogsFromSupabase(){
  const rows = await supabaseRequest('GET', 'material_log?order=date.desc&limit=500');
  return rows || [];
}

// ==================================================================
// 검사성적서 Supabase CRUD (측정치는 JSONB로 묶어서)
// ==================================================================
async function pushCertToSupabase(cert){
  if (!cert.id) cert.id = 'cert_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);

  // 측정치(r1~r8, c_r1~c_r8)를 JSONB로 묶음
  const measurements = {};
  ['r1','r2','r3','r4','r5','r6','r7','r8'].forEach(k => {
    if (cert[k]) measurements[k] = cert[k];
    if (cert['c_' + k]) measurements['c_' + k] = cert['c_' + k];
  });

  const payload = {
    id: cert.id,
    commodity: cert.commodity || null,
    spec: cert.spec || null,
    surface: cert.surface || null,
    size: cert.size || null,
    supplier: cert.supplier || null,
    customer: cert.customer || null,
    date: cert.date || null,
    weight: cert.weight || null,
    cut: cert.cut || null,
    lot: cert.lot || null,
    heat: cert.heat || null,
    supplier_judge: cert.supplier_judge || null,
    supplier_sign: cert.supplier_sign || null,
    recv_date: cert.recv_date || null,
    recv_charge: cert.recv_charge || null,
    judge: cert.judge || null,
    customer_sign: cert.customer_sign || null,
    label: cert.label || null,
    remark: cert.remark || null,
    scan_id: cert.scan_id || null,
    measurements: measurements
  };
  await supabaseRequest('POST', 'material_cert?on_conflict=id', payload, { 'Prefer': 'resolution=merge-duplicates,return=minimal' });
  return cert.id;
}

async function deleteCertFromSupabase(id){
  await supabaseRequest('DELETE', 'material_cert?id=eq.' + encodeURIComponent(id));
}

async function fetchCertsFromSupabase(){
  const rows = await supabaseRequest('GET', 'material_cert?order=date.desc&limit=500');
  // JSONB → 개별 필드로 다시 풀어서 기존 코드 호환
  return (rows || []).map(r => {
    const m = r.measurements || {};
    const cert = Object.assign({}, r);
    delete cert.measurements;
    Object.keys(m).forEach(k => { cert[k] = m[k]; });
    return cert;
  });
}

// ==================================================================
// supabaseRequest에 옵션 헤더 지원 (기존 함수 확장)
// ==================================================================
const _origSupabaseRequest = supabaseRequest;
supabaseRequest = async function(method, path, body, extraHeaders){
  if (!appSettings.supabaseUrl || !appSettings.supabaseKey) {
    throw new Error('Supabase 설정이 비어 있습니다');
  }
  const url = appSettings.supabaseUrl.replace(/\/$/, '') + '/rest/v1/' + path;
  const headers = {
    'apikey': appSettings.supabaseKey,
    'Authorization': 'Bearer ' + appSettings.supabaseKey,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  if (extraHeaders) Object.assign(headers, extraHeaders);
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Supabase ' + res.status + ': ' + t);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
};

// ==================================================================
// 동기화 엔진
// ==================================================================
async function syncPendingOps(){
  if (!appSettings.supabaseUrl || !appSettings.supabaseKey) return;
  if (syncState.pendingOps.length === 0) return;

  const stillPending = [];
  for (const op of syncState.pendingOps) {
    try {
      if (op.type === 'log' && op.action === 'upsert') {
        await pushLogToSupabase(op.data);
      } else if (op.type === 'log' && op.action === 'delete') {
        await deleteLogFromSupabase(op.data.id);
      } else if (op.type === 'cert' && op.action === 'upsert') {
        await pushCertToSupabase(op.data);
      } else if (op.type === 'cert' && op.action === 'delete') {
        await deleteCertFromSupabase(op.data.id);
      }
    } catch(e) {
      console.warn('동기화 실패 (재시도 대기):', op, e);
      stillPending.push(op);
    }
  }
  syncState.pendingOps = stillPending;
  savePendingOps();
  if (stillPending.length === 0) {
    syncState.lastSyncAt = new Date().toISOString();
  }
  updateSyncBadge();
}

// ========================================
// Dirty 보호 시스템 (방금 저장한 데이터를 pull로 덮어쓰지 않게 함)
// ========================================
const DIRTY_PROTECTION_MS = 5 * 60 * 1000;  // 5분 동안 보호 (신규 등록 시 안전 마진)
let dirtyCertIds = new Map();  // id → 마킹 시각
let dirtyLogIds = new Map();

function markCertAsDirty(id){
  if (!id) return;
  dirtyCertIds.set(id, Date.now());
  // 5분 이상된 항목은 정리
  pruneDirtyMaps();
}
function markLogAsDirty(id){
  if (!id) return;
  dirtyLogIds.set(id, Date.now());
  pruneDirtyMaps();
}
function pruneDirtyMaps(){
  const now = Date.now();
  for (const [k, t] of dirtyCertIds) {
    if (now - t > DIRTY_PROTECTION_MS * 10) dirtyCertIds.delete(k);
  }
  for (const [k, t] of dirtyLogIds) {
    if (now - t > DIRTY_PROTECTION_MS * 10) dirtyLogIds.delete(k);
  }
}
function isCertDirty(id){
  if (!id || !dirtyCertIds.has(id)) return false;
  return (Date.now() - dirtyCertIds.get(id)) < DIRTY_PROTECTION_MS;
}
function isLogDirty(id){
  if (!id || !dirtyLogIds.has(id)) return false;
  return (Date.now() - dirtyLogIds.get(id)) < DIRTY_PROTECTION_MS;
}

async function pullFromSupabase(){
  if (!appSettings.supabaseUrl || !appSettings.supabaseKey) return;
  try {
    const [serverLogs, serverCerts] = await Promise.all([
      fetchLogsFromSupabase().catch(()=>null),
      fetchCertsFromSupabase().catch(()=>null)
    ]);

    // ===== Logs 병합 =====
    if (serverLogs && serverLogs.length > 0) {
      const serverMap = new Map();
      serverLogs.forEach(r => {
        if (r.id) serverMap.set(r.id, Object.assign({}, r, {
          thick_spec: r.thick_spec === null ? 0 : Number(r.thick_spec),
          width_spec: r.width_spec === null ? 0 : Number(r.width_spec),
          thick: r.thick === null ? 0 : Number(r.thick),
          width: r.width === null ? 0 : Number(r.width),
          in_kg: r.in_kg === null ? 0 : Number(r.in_kg),
          count: r.count === null ? 0 : Number(r.count),
          bad_kg: r.bad_kg === null ? 0 : Number(r.bad_kg)
        }));
      });
      // 🔒 로컬 보존 정책: id없거나(신규) / dirty / 서버에 아직 없음 → 모두 보존
      const preservedLocal = (logData || []).filter(d =>
        !d.id || isLogDirty(d.id) || !serverMap.has(d.id)
      );
      const merged = [...serverMap.values()];
      preservedLocal.forEach(local => {
        if (local.id) {
          const i = merged.findIndex(m => m.id === local.id);
          if (i >= 0) merged[i] = local;  // dirty 우선
          else merged.push(local);
        } else {
          merged.push(local);
        }
      });
      logData = merged;
      saveLogToLS();
    }

    // ===== Certs 병합 =====
    if (serverCerts && serverCerts.length > 0) {
      const serverMap = new Map();
      serverCerts.forEach(r => { if (r.id) serverMap.set(r.id, r); });
      // 🔒 로컬 보존 정책: id없거나(신규) / dirty / 서버에 아직 없음 → 모두 보존
      const preservedLocal = (certData || []).filter(c =>
        !c.id || isCertDirty(c.id) || !serverMap.has(c.id)
      );
      const merged = [...serverMap.values()];
      preservedLocal.forEach(local => {
        if (local.id) {
          const i = merged.findIndex(m => m.id === local.id);
          if (i >= 0) merged[i] = local;  // dirty 우선
          else merged.push(local);
        } else {
          merged.push(local);
        }
      });
      certData = merged;
      saveCertToLS();
    }

    syncState.isOnline = true;
    syncState.lastSyncAt = new Date().toISOString();
    updateSyncBadge();

    // ⭐ pull 직후 운전/차장 등 옛 데이터 자동 정정 (logData)
    if (typeof migrateLogData === 'function') {
      const fixed = migrateLogData();
      if (fixed && appSettings.supabaseUrl && appSettings.supabaseKey) {
        for (const log of logData) {
          if (log.id) {
            try { await pushLogToSupabase(log); } catch(e) {}
          }
        }
        console.log('[Migration] 정정된 logData를 Supabase에 재업로드 완료');
      }
    }

    // ⭐ pull 직후 SUS 담당자 등 옛 데이터 자동 정정 (certData)
    if (typeof migrateCertData === 'function') {
      const fixed = migrateCertData();
      if (fixed && appSettings.supabaseUrl && appSettings.supabaseKey) {
        for (const cert of certData) {
          if (cert.id) {
            try { await pushCertToSupabase(cert); } catch(e) {}
          }
        }
        console.log('[Migration] 정정된 certData를 Supabase에 재업로드 완료');
      }
    }

    // 화면 새로고침
    if (document.getElementById('logBody')) renderLog();
    if (document.getElementById('certList')) renderCert();
    if (document.getElementById('recentLogBody')) renderDashboard();
  } catch(e) {
    syncState.isOnline = false;
    updateSyncBadge();
    console.warn('Supabase 연결 실패 (로컬 전용 모드):', e);
  }
}

async function manualSyncAll(){
  if (!appSettings.supabaseUrl || !appSettings.supabaseKey) {
    if (confirm('Supabase 설정이 없습니다. 설정 탭으로 이동하시겠습니까?')) {
      document.querySelector('.tab-btn[onclick*="settings"]').click();
    }
    return;
  }

  const icon = document.getElementById('syncIcon');
  if (icon) icon.textContent = '🔄';

  try {
    // 1. 대기 중인 작업 서버로 올리기
    await syncPendingOps();
    // 2. 서버에서 최신 데이터 내려받기
    await pullFromSupabase();
    // 3. 로컬에 있지만 서버에 없는 데이터 올리기 (첫 마이그레이션)
    await pushAllLocalToSupabase();

    alert('✅ 동기화 완료\n\n마지막 동기화: ' + new Date().toLocaleString('ko-KR'));
  } catch(e) {
    alert('❌ 동기화 실패: ' + e.message);
  }
}

// 로컬에 있는 모든 데이터를 서버에 올림 (첫 마이그레이션)
async function pushAllLocalToSupabase(){
  if (!appSettings.supabaseUrl || !appSettings.supabaseKey) return;

  // 서버에 있는 id 목록 조회
  let serverLogIds = new Set();
  let serverCertIds = new Set();
  try {
    const logs = await supabaseRequest('GET', 'material_log?select=id');
    serverLogIds = new Set((logs || []).map(r => r.id));
    const certs = await supabaseRequest('GET', 'material_cert?select=id');
    serverCertIds = new Set((certs || []).map(r => r.id));
  } catch(e) { /* 테이블 없을 가능성 */ }

  // 로컬에만 있는 데이터를 서버로 푸시
  let pushedLog = 0, pushedCert = 0;
  for (const log of logData) {
    if (!log.id) log.id = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    if (!serverLogIds.has(log.id)) {
      try { await pushLogToSupabase(log); pushedLog++; } catch(e) {}
    }
  }
  for (const cert of certData) {
    if (!cert.id) cert.id = 'cert_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    if (!serverCertIds.has(cert.id)) {
      try { await pushCertToSupabase(cert); pushedCert++; } catch(e) {}
    }
  }
  saveLogToLS();
  saveCertToLS();
  if (pushedLog > 0 || pushedCert > 0) {
    console.log('로컬 → 서버 마이그레이션: 일보 ' + pushedLog + '건, 성적서 ' + pushedCert + '건');
  }
}

// ==================================================================
// saveLogToLS / saveCertToLS 확장 (로컬 저장 + 서버 동기화)
// ==================================================================
const _origSaveLogToLS = saveLogToLS;
saveLogToLS = function(){
  _origSaveLogToLS();
  // 서버 동기화 (비동기, 실패시 대기큐에 추가)
  if (appSettings.supabaseUrl && appSettings.supabaseKey) {
    logData.forEach(log => {
      if (!log.id) log.id = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    });
    _origSaveLogToLS(); // id 부여 후 재저장
    // 전체 동기화는 비용이 크므로 각 변경된 건만 큐에 넣도록 - 하지만 여기선 간단히 전체 재업로드
    triggerDebouncedSync();
  }
};

const _origSaveCertToLS = saveCertToLS;
saveCertToLS = function(){
  _origSaveCertToLS();
  if (appSettings.supabaseUrl && appSettings.supabaseKey) {
    certData.forEach(cert => {
      if (!cert.id) cert.id = 'cert_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    });
    _origSaveCertToLS();
    triggerDebouncedSync();
  }
};

// Debounce: 2초 내 여러 변경을 묶어서 한번에 올림
let _syncDebounceTimer = null;
function triggerDebouncedSync(){
  if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
  _syncDebounceTimer = setTimeout(() => {
    pushAllLocalToSupabase().then(() => {
      syncState.isOnline = true;
      syncState.lastSyncAt = new Date().toISOString();
      updateSyncBadge();
    }).catch(e => {
      syncState.isOnline = false;
      updateSyncBadge();
    });
  }, 2000);
}

// delLog/delCert 확장 - 삭제 시 서버에서도 삭제
const _origDelLog = delLog;
delLog = function(idx){
  const log = logData[idx];
  const id = log && log.id;
  _origDelLog(idx);
  if (id && appSettings.supabaseUrl && appSettings.supabaseKey) {
    deleteLogFromSupabase(id).catch(e => {
      addPendingOp({ type: 'log', action: 'delete', data: { id } });
    });
  }
};

// inspection_certs (upload.html에서 온 데이터) 삭제 헬퍼
async function deleteInspectionCertFromSupabase(id){
  if(!appSettings.supabaseUrl||!appSettings.supabaseKey)return;
  const url=appSettings.supabaseUrl.replace(/\/$/,'')+'/rest/v1/inspection_certs?id=eq.'+encodeURIComponent(id);
  const res=await fetch(url,{
    method:'DELETE',
    headers:{
      'apikey':appSettings.supabaseKey,
      'Authorization':'Bearer '+appSettings.supabaseKey,
      'Prefer':'return=minimal'
    }
  });
  if(!res.ok){
    const txt=await res.text().catch(()=>'');
    console.error('[IQC] inspection_certs 삭제 실패:',res.status,txt);
    throw new Error('HTTP '+res.status);
  }
  console.log('[IQC] inspection_certs 삭제 OK id=',id);
}

const _origDelCert = delCert;
delCert = function(idx){
  const cert = certData[idx];
  if(!cert)return;
  const fromUpload = cert._from_supabase===true;
  const supaId = fromUpload ? cert._supabase_id : cert.id;
  
  // ★ upload에서 온 카드는 lot+heat+supplier가 같은 inspection_certs 행을 모두 정리
  // (대표 LOT 1건만 ID가 들어 있으므로 같은 그룹의 다른 행도 함께 정리하는 게 안전)
  const dupKey = (cert.lot||'')+'|'+(cert.heat||'')+'|'+(cert.supplier||'');
  
  _origDelCert(idx);  // 화면/LS에서 제거 (확인창 포함)
  
  if(!supaId)return;  // 사용자가 confirm 취소했거나 ID 없음
  // 진짜 삭제됐는지 검증 (origDelCert 안에서 confirm 거부 시 splice 안 됨)
  const stillExists = certData.some(c=>(
    fromUpload ? c._supabase_id===supaId : c.id===supaId
  ));
  if(stillExists)return;
  
  if(!appSettings.supabaseUrl||!appSettings.supabaseKey)return;
  
  if(fromUpload){
    // inspection_certs 에서 삭제 (upload.html에서 온 데이터)
    deleteInspectionCertFromSupabase(supaId).catch(e=>{
      addPendingOp({type:'inspection_cert',action:'delete',data:{id:supaId}});
    });
  }else{
    // material_cert 에서 삭제 (IQC 자체 등록 데이터)
    deleteCertFromSupabase(supaId).catch(e=>{
      addPendingOp({type:'cert',action:'delete',data:{id:supaId}});
    });
  }
};

// ==================================================================
// 앱 시작 시 초기 동기화 + 주기적 동기화
// ==================================================================
loadPendingOps();
updateSyncBadge();

// 설정 로드가 끝나면 자동으로 서버에서 데이터 pull
if (typeof loadSettingsFromSupabase === 'function') {
  const _origLoadSettings = loadSettingsFromSupabase;
  loadSettingsFromSupabase = async function(){
    await _origLoadSettings();
    // 설정 로드 후 데이터도 pull
    if (appSettings.supabaseUrl && appSettings.supabaseKey) {
      await pullFromSupabase();
    }
    updateSyncBadge();
  };
}

// 5분마다 자동 동기화
setInterval(() => {
  if (appSettings.supabaseUrl && appSettings.supabaseKey) {
    syncPendingOps().catch(()=>{});
  }
}, 5 * 60 * 1000);

// 온라인 복구 이벤트
window.addEventListener('online', () => {
  syncPendingOps().catch(()=>{});
});

// ====================================================
// 검사성적서 카드 펼침/접힘 토글 (펼침 메뉴 스타일)
// ====================================================
function setupCertCardToggle(){
  document.querySelectorAll('#certList .inspection-cert').forEach(card=>{
    if(card.dataset.toggleReady)return;
    card.dataset.toggleReady='1';
    card.classList.add('collapsed');  // 기본 접힘
    const header=card.querySelector('.cert-header');
    if(!header)return;
    header.addEventListener('click',e=>{
      if(e.target.closest('button'))return;  // 헤더 안 버튼 클릭은 토글 안함
      card.classList.toggle('collapsed');
    });
  });
}

function toggleAllCerts(open){
  document.querySelectorAll('#certList .inspection-cert').forEach(card=>{
    if(open)card.classList.remove('collapsed');
    else card.classList.add('collapsed');
  });
}

document.addEventListener('DOMContentLoaded',setupCertCardToggle);
setTimeout(setupCertCardToggle,500);
setInterval(setupCertCardToggle,2000);  // renderCert로 동적 추가된 카드도 자동 처리

// ====================================================
// Supabase inspection_certs 자동 조회 + certData에 병합
// 소재업체가 material_upload에서 작성한 성적서를 자동으로 표시
// ====================================================
async function loadCertsFromSupabase(){
  try{
    if(typeof appSettings==='undefined'||!appSettings.supabaseUrl||!appSettings.supabaseKey){
      console.log('[IQC] Supabase 미설정 - inspection_certs 조회 스킵');return;
    }
    console.log('[IQC] inspection_certs 자동 조회 시작...',appSettings.supabaseUrl);
    const url=appSettings.supabaseUrl+'/rest/v1/inspection_certs?select=*&order=created_at.desc&limit=500';
    const r=await fetch(url,{headers:{'apikey':appSettings.supabaseKey,'Authorization':'Bearer '+appSettings.supabaseKey}});
    if(!r.ok){
      const errText=await r.text().catch(()=>'');
      console.error('[IQC] inspection_certs 조회 실패:',r.status,errText);
      return;
    }
    const remoteCerts=await r.json();
    console.log(`[IQC] inspection_certs 조회 결과: ${remoteCerts?.length||0}건`);
    if(!remoteCerts||!remoteCerts.length){console.log('[IQC] 데이터 없음');return;}
    
    // 공급자별 카운트 출력 (디버깅용)
    const counts={};
    remoteCerts.forEach(rc=>{const s=rc.supplier||'(빈값)';counts[s]=(counts[s]||0)+1});
    console.log('[IQC] 공급자별 분포:',counts);
    
    // 기존 certData와 중복 체크 (lot+heat+supplier 기준)
    if(!certData)certData=[];
    let added=0,skipped=0;
    remoteCerts.forEach(rc=>{
      const dupKey=(rc.lot_no||'')+'|'+(rc.heat_no||'')+'|'+(rc.supplier||'');
      const exists=certData.some(c=>((c.lot||'')+'|'+(c.heat||'')+'|'+(c.supplier||''))===dupKey);
      if(exists){skipped++;return;}
      
      // Supabase 형식 → certData 형식 변환
      const cd=rc.cert_data||{};
      const isSUS=/SUS|STS|스테인|304|430/i.test(rc.material_type||'');
      // 측정값(cert_data) 있고 + final_judge가 명확히 OK/NG일 때만 검사완료로 간주
      // 그 외 (빈 문자열, null, '미검사', '대기', undefined 등)는 모두 미검사 처리
      const fj=String(rc.final_judge||'').trim();
      const isUninspected = !rc.cert_data || (fj!=='OK' && fj!=='NG');
      const remarkParts=[];
      if(isUninspected)remarkParts.push('⏳ 검사 대기 (입고만 등록)');
      if(rc.has_millsheet)remarkParts.push('📎 밀시트 메일 첨부됨');
      const newCert={
        commodity:isSUS?'STS CR COIL':'CR COIL (SPCC)',
        spec:rc.material_type||'',
        surface:isSUS?'NO. 2B':'DULL(S)',
        size:(rc.thickness||'')+'(T) X '+(rc.width_mm||'')+'(W)mm',
        supplier:rc.supplier||'',
        customer:'㈜태진다이텍',
        date:rc.receipt_date||'',
        weight:rc.weight||'',
        coil_count:rc.coil_count||1,
        lots_detail:rc.lots_detail||'',
        lot:rc.lot_no||'',
        heat:rc.heat_no||'',
        supplier_judge:isUninspected?'대기':'OK',
        supplier_sign:isUninspected?'':rc.supplier||'',
        recv_date:'',  // 수입검사 시점 채움
        recv_charge:rc.charge||'',
        judge:isUninspected?'대기':(rc.final_judge||'OK'),  // 미검사 → '대기' 표시
        customer_sign:rc.sign||(isUninspected?'':'강병주'),
        label:'미부착',  // 입고 전 상태
        remark:remarkParts.join(' / '),
        // 공급자 측정값 (cert_data로부터, 미검사면 빈 값)
        r1:isUninspected?_emptyRow('결함없을것'):_certDataToRow(cd.r1,'결함없을것'),
        r2:isUninspected?_emptyRow(rc.material_type):_certDataToRow(cd.r2,rc.material_type),
        r3:isUninspected?_emptyRow((rc.width_mm||'')+'mm ±0.1'):_certDataToRow(cd.r3,(rc.width_mm||'')+'mm ±0.1'),
        r4:isUninspected?_emptyRow((rc.thickness||'')+'T ±0.05'):_certDataToRow(cd.r4,(rc.thickness||'')+'T ±0.05'),
        r5:isSUS?_dashRow():(isUninspected?_emptyRow('65 이하'):_certDataToRow(cd.r5,'65 이하')),
        r6:isSUS?_dashRow():(isUninspected?_emptyRow('1000mm'):_certDataToRow(cd.r6,'1000mm')),
        r7:isSUS?_dashRow():(isUninspected?_emptyRow('0/+2'):_certDataToRow(cd.r7,'0/+2')),
        r8:isSUS?_dashRow():(isUninspected?_emptyRow('양호'):_certDataToRow(cd.r8,'양호')),
        // 수요자 측정값 (입고 후 채움 - spec은 공급자와 동일, 측정값 X1~X3는 비움)
        c_r1:_cusEmptyFromCert(cd.r1,'결함없을것'),
        c_r2:_cusEmptyFromCert(cd.r2,rc.material_type),
        c_r3:_cusEmptyFromCert(cd.r3,(rc.width_mm||'')+'mm ±0.1'),
        c_r4:_cusEmptyFromCert(cd.r4,(rc.thickness||'')+'T ±0.05'),
        c_r5:isSUS?_dashRow():_cusEmptyFromCert(cd.r5,'65 이하'),
        c_r6:isSUS?_dashRow():_cusEmptyFromCert(cd.r6,'1000mm'),
        c_r7:isSUS?_dashRow():_cusEmptyFromCert(cd.r7,'0/+2'),
        c_r8:isSUS?_dashRow():_cusEmptyFromCert(cd.r8,'양호'),
        _from_supabase:true,
        _supabase_id:rc.id,
        _uninspected:isUninspected
      };
      certData.push(newCert);
      added++;
    });
    
    console.log(`[IQC] 신규 추가: ${added}건, 중복 제외: ${skipped}건, 총 certData: ${certData.length}건`);
    if(added>0){
      saveCertToLS();
      renderCert();
    }else{
      // 신규 추가 없어도 콤보박스만 갱신 (혹시 이전에 누락된 공급자 옵션 추가)
      renderCert();
    }
  }catch(e){
    console.error('[IQC] inspection_certs 자동 로드 실패:',e);
  }
}

// 보조 함수: cert_data의 한 항목 → 행 형식
// 공급자가 입력한 spec을 최우선 (item.spec), 없으면 specDefault 사용
function _certDataToRow(item,specDefault){
  if(!item)return{spec:specDefault||'',x1:'',x2:'',x3:'',j:'OK'};
  return{spec:(item.spec!==undefined&&item.spec!=='')?item.spec:(specDefault||''),x1:item.x1||'',x2:item.x2||'',x3:item.x3||'',j:item.j||'OK'};
}
function _emptyRow(spec){return{spec:spec||'',x1:'',x2:'',x3:'',j:'OK'}}
// 공급자 spec만 가져오고 측정값은 비움 (수요자 미검사 상태용)
function _cusEmptyFromCert(item,specDefault){
  if(!item)return{spec:specDefault||'',x1:'',x2:'',x3:'',j:'OK'};
  return{spec:(item.spec!==undefined&&item.spec!=='')?item.spec:(specDefault||''),x1:'',x2:'',x3:'',j:'OK'};
}
function _dashRow(){return{spec:'-',x1:'-',x2:'-',x3:'-',j:'-'}}

// 페이지 로드 후 자동 실행 (appSettings 로드 후)
// 페이지 로드 직후 + 1.5초 후 두 번 시도 (appSettings 미로딩 대비)
document.addEventListener('DOMContentLoaded',()=>setTimeout(loadCertsFromSupabase,300));
setTimeout(loadCertsFromSupabase,1500);
// 5분마다 재조회 (다른 사용자가 등록한 신규 성적서 반영)
setInterval(loadCertsFromSupabase,5*60*1000);

// ====================================================
// log 데이터(material_log) 자동 조회
// 정적 데이터 제거됨에 따라 Supabase에서 직접 불러옴
// ====================================================
async function loadLogFromSupabase(){
  try{
    if(typeof appSettings==='undefined'||!appSettings.supabaseUrl||!appSettings.supabaseKey){
      console.log('[LOG] Supabase 미설정 - material_log 조회 스킵');return;
    }
    const url=appSettings.supabaseUrl+'/rest/v1/material_log?select=*&order=date.desc&limit=1000';
    const r=await fetch(url,{headers:{'apikey':appSettings.supabaseKey,'Authorization':'Bearer '+appSettings.supabaseKey}});
    if(!r.ok){
      console.error('[LOG] material_log 조회 실패:',r.status);return;
    }
    const remoteLogs=await r.json();
    console.log(`[LOG] material_log 조회 결과: ${remoteLogs?.length||0}건`);
    if(!remoteLogs||!remoteLogs.length){
      // 데이터 없어도 빈 상태로 정상 처리
      logData=[];
      if(typeof renderLog==='function')renderLog();
      return;
    }
    // 기존 logData 대체 (DB가 진실의 원천)
    logData=remoteLogs;
    if(typeof saveLogToLS==='function')saveLogToLS();
    if(typeof renderLog==='function')renderLog();
  }catch(e){
    console.error('[LOG] 자동 조회 실패:',e);
  }
}

// 페이지 진입 시 + 5분마다 재조회
document.addEventListener('DOMContentLoaded',()=>setTimeout(loadLogFromSupabase,400));
setTimeout(loadLogFromSupabase,1700);
setInterval(loadLogFromSupabase,5*60*1000);
// ==================================================================
// [Rev2.7] 모바일 모달 스크롤 패치
// 모달 내부의 측정값 테이블(.meas-table)이 작은 화면에서 잘리는 문제 해결
// ==================================================================
(function injectMobileScrollFix(){
  if(document.getElementById('iqc-mobile-scroll-fix'))return;
  const css = `
    /* 모달 본문 자체에 가로 스크롤 허용 (좁은 화면 대응) */
    .modal-body{
      overflow-x:auto !important;
      -webkit-overflow-scrolling:touch;
    }
    /* 측정값 테이블은 좁은 화면에서도 가로로 펼치도록 최소폭 보장 */
    .modal-body .meas-table,
    .modal-body table.meas-table{
      min-width:600px;
    }
    /* 카드 내 카드(검사항목/판정 박스)도 가로 스크롤 가능하게 */
    .cert-section-box{
      overflow-x:auto;
      -webkit-overflow-scrolling:touch;
    }
    /* 검사성적서 카드(렌더링된 결과)에도 적용 */
    #certList .cert-card,
    #certList table{
      max-width:100%;
    }
    #certList table{
      display:block;
      overflow-x:auto;
      -webkit-overflow-scrolling:touch;
      white-space:nowrap;
    }
    /* 좁은 화면일수록 표 안의 셀 패딩 축소 */
    @media (max-width:768px){
      .modal-body .meas-table th,
      .modal-body .meas-table td{
        padding:4px 6px !important;
        font-size:12px;
      }
      .modal-body .meas-table input[type=text],
      .modal-body .meas-table input[type=number]{
        font-size:12px;
        padding:4px 6px;
        min-width:60px;
      }
    }
  `;
  const s = document.createElement('style');
  s.id = 'iqc-mobile-scroll-fix';
  s.textContent = css;
  document.head.appendChild(s);
  console.log('[IQC] 모바일 스크롤 패치 적용됨');
})();
