// ============================================================
//  supabase_config.js — SMTECH 스마트팩토리 Supabase 공통 모듈
//  모든 HTML에서 <script src="supabase_config.js"></script>로 로드
// ============================================================

const SUPABASE_URL = 'https://omngtyewdaqpphnzeate.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tbmd0eWV3ZGFxcHBobnplYXRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODk4ODksImV4cCI6MjA5MDQ2NTg4OX0.Zxur3t02JHtOcXforCMSwO3i2mMaf5sViE0tXXUC0-s';

// ============================================================
//  공통 헤더
// ============================================================
function sbHeaders(prefer) {
  const h = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
  if (prefer) h['Prefer'] = prefer;
  return h;
}

// ============================================================
//  SELECT — 테이블 조회
//  sbSelect('part_mapping', {barcode: 'eq.ABC123'})
//  sbSelect('feeder_setting', {model: 'eq.MODEL-A', line: 'eq.LINE-1'})
//  sbSelect('move_history', {}, 'id.desc', 100)
// ============================================================
async function sbSelect(table, filters = {}, order = '', limit = 1000) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set('select', '*');
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') url.searchParams.set(k, v);
  });
  if (order) url.searchParams.set('order', order);
  if (limit) url.searchParams.set('limit', String(limit));

  const res = await fetch(url.toString(), { headers: sbHeaders() });
  if (!res.ok) throw new Error(`SELECT ${table} 오류: ${res.status} ${await res.text()}`);
  return await res.json(); // 배열 반환
}

// ============================================================
//  INSERT — 단건/다건 삽입
//  sbInsert('part_mapping', {barcode:'ABC', base_part:'PT-001'})
//  sbInsert('move_history', [{...}, {...}])  // 배열도 가능
// ============================================================
async function sbInsert(table, data) {
  const body = Array.isArray(data) ? data : [data];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders('return=representation'),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`INSERT ${table} 오류: ${res.status} ${await res.text()}`);
  return await res.json();
}

// ============================================================
//  UPDATE — 조건부 수정
//  sbUpdate('part_mapping', {id: 'eq.5'}, {base_part: 'PT-002'})
// ============================================================
async function sbUpdate(table, filters, data) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(filters).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: sbHeaders('return=representation'),
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`UPDATE ${table} 오류: ${res.status} ${await res.text()}`);
  return await res.json();
}

// ============================================================
//  DELETE — 조건부 삭제
//  sbDelete('part_mapping', {id: 'eq.5'})
// ============================================================
async function sbDelete(table, filters) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  Object.entries(filters).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method: 'DELETE',
    headers: sbHeaders()
  });
  if (!res.ok) throw new Error(`DELETE ${table} 오류: ${res.status} ${await res.text()}`);
  return true;
}

// ============================================================
//  UPSERT — 있으면 수정, 없으면 삽입
//  sbUpsert('mask_setting', {setting_key:'위치목록', setting_value:'본사,공장'}, 'setting_key')
// ============================================================
async function sbUpsert(table, data, onConflict) {
  const body = Array.isArray(data) ? data : [data];
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  if (onConflict) url.searchParams.set('on_conflict', onConflict);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: sbHeaders('return=representation,resolution=merge-duplicates'),
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`UPSERT ${table} 오류: ${res.status} ${await res.text()}`);
  return await res.json();
}

// ============================================================
//  RPC — Postgres 함수 호출 (필요시)
//  sbRpc('my_function', {param1: 'value'})
// ============================================================
async function sbRpc(fnName, params = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error(`RPC ${fnName} 오류: ${res.status} ${await res.text()}`);
  return await res.json();
}

// ============================================================
//  연결 테스트
// ============================================================
async function sbTestConnection() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/part_mapping?select=id&limit=1`, {
      headers: sbHeaders()
    });
    return { success: res.ok, status: res.status };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============================================================
//  유틸: 텍스트 검색 (ilike)
//  sbSearch('part_mapping', 'barcode', 'ABC')
//  → barcode ilike '%ABC%' 인 행들 반환
// ============================================================
async function sbSearch(table, column, keyword, limit = 100) {
  return sbSelect(table, { [column]: `ilike.*${keyword}*` }, '', limit);
}

// ============================================================
//  유틸: 전체 카운트
// ============================================================
async function sbCount(table, filters = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  url.searchParams.set('select', 'id');
  Object.entries(filters).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { ...sbHeaders(), 'Prefer': 'count=exact' }
  });
  const cnt = res.headers.get('content-range');
  if (cnt) {
    const m = cnt.match(/\/(\d+)/);
    return m ? parseInt(m[1]) : 0;
  }
  return (await res.json()).length;
}

console.log('✅ Supabase 공통 모듈 로드 완료:', SUPABASE_URL);
