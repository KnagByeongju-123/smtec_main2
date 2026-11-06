// ============================================================
//  final_check.js — 완제품 최종(출하)검사 기록 조회 · 품번 대조   window.FinalCheck
//  사용: final_tag.html (검사완료 식별표), request_outgoing.html (출하 등록 전 검사기록 대조)
//
//  SQ 평가(2026-07-20) 2_8 지적 대응: 최종검사 완료품의 생산 LOT 및 검사완료 식별 미흡
//
//  검사 기록 = qc_shipping_inspection (검사실 입력 · result OK/NG · inspection_date)
//  품번      = qc_part.part_number  ↔ 출하·MES 품번은 표기가 달라 아래 순서로 맞춘다
//    ① qc_part_alias (별칭 → QC 품번)   ② 같은 품번
//    ③ QC 품번이 출하 품번 + '-xx' (예: 1551-189 ↔ 1551-189-01)
//    ④ 출하 품번이 QC 품번 + '-x'  (예: 1945-349-1 ↔ 1945-349 외철/내철, IW/OW-BDA-1106-2 ↔ IW-BDA-1106)
//  생산 LOT = 생산일자 6자리(YYMMDD), 줄임 표기 '260831/0901'(월일) · '260620/23'(일) 도 읽는다
//  검사일이 LOT 일자 -1일 ~ +3일 사이면 그 LOT 검사로 본다
// ============================================================
(function (g) {
  const SB_URL = 'https://omngtyewdaqpphnzeate.supabase.co';
  const SB_KEY = 'sb_publishable_9j2YkkL-7ul1TrhH-NjVdQ_vWDG2-1D';
  const LOT_WIN = 3, LOT_BEFORE = 1;   // 검사일 허용 범위 : LOT 일자 -1일 ~ +3일 (야간 생산·다음날 검사)
  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  let PARTS = new Map(), ALIAS = new Map(), RECS = [], FROM = '';

  async function get(path) {
    const out = [];
    for (let off = 0; off < 20000; off += 1000) {
      const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: Object.assign({ Range: `${off}-${off + 999}` }, H) });
      if (!r.ok) throw new Error(`${path.split('?')[0]} HTTP ${r.status}`);
      const d = await r.json(); out.push(...d); if (d.length < 1000) break;
    }
    return out;
  }
  /* 표기 정리: 대문자, 공백·한글(외철/내철/어퍼 등) 제거 */
  const norm = (s) => String(s || '').toUpperCase().replace(/[가-힣]+/g, '').replace(/\s+/g, '').replace(/-+$/, '');
  /* 'IW/OW-BDA-1106-2' → ['IW/OW-BDA-1106-2','IW-BDA-1106-2','OW-BDA-1106-2'] */
  function variants(pn) {
    const n = norm(pn), v = [n];
    const m = n.match(/^([A-Z]+)\/([A-Z]+)-(.+)$/);
    if (m) v.push(m[1] + '-' + m[3], m[2] + '-' + m[3]);
    return v;
  }
  async function load(fromDate) {
    fromDate = addDays(fromDate, -LOT_BEFORE); FROM = fromDate;
    const [parts, alias, recs] = await Promise.all([
      get('qc_part?select=id,part_number,part_name,customer'),
      get('qc_part_alias?select=alias,part_number'),
      get(`qc_shipping_inspection?select=id,part_id,inspection_date,inspection_time,inspector,result,ho,mold_no,process_type,lot_no,memo&inspection_date=gte.${fromDate}&order=inspection_date.desc,inspection_time.desc`),
    ]);
    PARTS = new Map(parts.map((p) => [p.id, p]));
    ALIAS = new Map(alias.map((a) => [norm(a.alias), norm(a.part_number)]));
    RECS = recs.map((r) => Object.assign({}, r, { part: PARTS.get(r.part_id) || null }));
    return RECS;
  }
  /* 출하·MES 품번이 이 QC 품번과 같은 품목인가 */
  function samePart(shipPn, qcPn) {
    const q = norm(qcPn); if (!q) return false;
    return variants(shipPn).some((v) => {
      if (ALIAS.get(v) === q) return true;
      if (v === q) return true;
      if (q.startsWith(v + '-')) return true;
      if (v.startsWith(q + '-')) return true;
      return false;
    });
  }
  const lotToDate = (l) => { const m = String(l || '').match(/^(\d{2})(\d{2})(\d{2})$/); return m ? `20${m[1]}-${m[2]}-${m[3]}` : ''; };
  const addDays = (d, n) => { const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  /* LOT 문자열 → 생산일자 목록 ('261030,261031' · '261030/261031' · '260831/0901' · '260620/23') */
  function lotDates(lot) {
    const out = []; let yy = '', mm = '';
    String(lot || '').split(/[,\/\s]+/).map((s) => s.trim().replace(/-/g, '')).filter(Boolean).forEach((s) => {
      let d = '';
      if (/^\d{6}$/.test(s)) d = s;
      else if (/^\d{4}$/.test(s) && yy) d = yy + s;
      else if (/^\d{1,2}$/.test(s) && yy && mm) d = yy + mm + s.padStart(2, '0');
      const v = lotToDate(d); if (!v) return;
      yy = d.slice(0, 2); mm = d.slice(2, 4); out.push(v);
    });
    return out;
  }
  /* 품번·LOT 에 해당하는 검사 기록 → {ok:[...], ng:[...], lots:[{d, ok, ng}]} */
  function find(shipPn, lot) {
    const ds = lotDates(lot);
    const mine = RECS.filter((r) => r.part && samePart(shipPn, r.part.part_number));
    const lots = ds.map((d) => {
      const hit = mine.filter((r) => r.inspection_date >= addDays(d, -LOT_BEFORE) && r.inspection_date <= addDays(d, LOT_WIN));
      return { d, ok: hit.filter((r) => String(r.result).toUpperCase() === 'OK'), ng: hit.filter((r) => String(r.result).toUpperCase() !== 'OK') };
    });
    return { lots, all: mine, covered: FROM && ds.every((d) => d >= FROM) };
  }
  g.FinalCheck = { load, find, samePart, lotDates, lotToDate, norm, records: () => RECS, LOT_WIN };
})(window);
