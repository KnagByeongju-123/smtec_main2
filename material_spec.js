// ============================================================
//  material_spec.js — 소재 오투입 방지: 현재 작업 규격 vs 장착 코일 규격 비교
//  사용: material_attach.html (장착 확인창), mes_kiosk.html (소재로트 표시)
//
//  작업 규격 = material_master_tj (소재 마스터)
//    ① machine_status.current_mold  = material_master_tj.mold_number   (금형 기준)
//    ② machine_status.current_item_code ∈ material_master_tj.mapped_models (품번 기준)
//  코일 규격 = inspection_certs / material_attachment 의 material_type·thickness·width
//
//  재질 표기 정규화: 'SUS' 접두, '-S'/'-P' 접미, 공백·하이픈·괄호 무시
//    예) 304-(J1) = 304J1 2B,  430-2B = 430 2B,  S55CM-S = S55CM,  SUS430 = 430
//    표면(2B/BA/BB)은 양쪽 모두 적혀 있을 때만 비교
//  허용차: 두께 ±0.02mm, 폭 ±0.5mm
// ============================================================
(function (g) {
  const TOL_T = 0.02;
  const TOL_W = 0.5;
  // 표기는 다르지만 같은 재질로 볼 이름 (정규화 후 값 기준) — 필요 시 추가
  const MAT_ALIAS = {
    // 현장 표기: C67S, S70CM-S — 두 이름은 같은 소재 (2026-11 현장 확인)
    //   정규화하면 S70CM-S → S70CM 이 되므로 아래 이름을 모두 같은 소재(C67S)로 묶는다
    C67SCM: 'C67S',   // 옛 소재마스터 표기 'C67SCM-S' (sql/material_name_unify_C67S.sql 로 통일)
    S70CM: 'C67S',    // S70CM-S, S70CM
    S70C: 'C67S',     // 'S70C' 는 잘못 입력된 이름 (sql/material_name_fix_S70C.sql 로 S70CM-S 수정)
  };

  function parseMat(s) {
    let t = String(s || '').toUpperCase().trim();
    t = t.replace(/^SUS\s*/, '').replace(/-(S|P)$/, '');
    t = t.replace(/[\s\-()_.]/g, '');
    let fin = '';
    const m = t.match(/^(.+?)(2B|BA|BB)$/);
    if (m && m[1].length >= 3) { t = m[1]; fin = m[2]; }
    return { base: MAT_ALIAS[t] || t, fin };
  }

  function sameMat(a, b) {
    const A = parseMat(a), B = parseMat(b);
    if (!A.base || !B.base) return true;   // 한쪽이 비어 있으면 판단 보류
    return A.base === B.base && (!A.fin || !B.fin || A.fin === B.fin);
  }
  function num(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
  function sameNum(a, b, tol) {
    const x = num(a), y = num(b);
    if (x == null || y == null) return true;
    return Math.abs(x - y) <= tol + 1e-9;
  }

  /* 설비 현재 작업(machine_status 1행) → 소재 마스터 규격 목록 */
  function findJobSpecs(ms, masterRows) {
    if (!ms || !Array.isArray(masterRows)) return null;
    const mold = String(ms.current_mold || '').trim().toUpperCase();
    const item = String(ms.current_item_code || '').trim().toUpperCase();
    let rows = mold ? masterRows.filter(r => String(r.mold_number || '').trim().toUpperCase() === mold) : [];
    let by = rows.length ? `금형 ${ms.current_mold}` : '';
    if (!rows.length && item) {
      rows = masterRows.filter(r => String(r.mapped_models || '').toUpperCase().split(/[\s(),/;=]+/).includes(item));
      if (rows.length) by = `품번 ${ms.current_item_code}`;
    }
    rows = rows.filter(r => r.material_type || r.thickness || r.width);
    if (!rows.length) return { specs: [], by: '', item: ms.current_item_code || '', mold: ms.current_mold || '' };
    return { specs: rows.map(r => ({ material_type: r.material_type, thickness: r.thickness, width: r.width, name: r.material_name })), by, item: ms.current_item_code || '', mold: ms.current_mold || '' };
  }

  /* 코일(mat: material_type, thickness, width) vs 작업 규격 → { status: 'ok'|'mismatch'|'unknown', diffs[], spec } */
  function checkSpec(mat, job) {
    if (!job || !job.specs || !job.specs.length) return { status: 'unknown', diffs: [], spec: null };
    const res = job.specs.map(s => {
      const d = [];
      if (!sameMat(mat.material_type, s.material_type)) d.push(`재질 ${s.material_type} ≠ ${mat.material_type || '-'}`);
      if (!sameNum(mat.thickness, s.thickness, TOL_T)) d.push(`두께 ${s.thickness}t ≠ ${mat.thickness ?? '-'}t`);
      if (!sameNum(mat.width, s.width, TOL_W)) d.push(`폭 ${s.width}W ≠ ${mat.width ?? '-'}W`);
      return { spec: s, diffs: d };
    });
    const hit = res.find(r => !r.diffs.length);
    if (hit) return { status: 'ok', diffs: [], spec: hit.spec };
    res.sort((a, b) => a.diffs.length - b.diffs.length);
    return { status: 'mismatch', diffs: res[0].diffs, spec: res[0].spec };
  }

  function specText(s) {
    return s ? `${s.material_type || '-'} ${s.thickness ?? '-'}t × ${s.width ?? '-'}W` : '-';
  }

  /* 호기명('36호기 심팩300톤' / '36_300') → 호기번호 36 */
  function hoOf(name) {
    const n = parseInt(String(name || '').trim(), 10);
    return isNaN(n) ? null : n;
  }

  g.MatSpec = { parseMat, sameMat, findJobSpecs, checkSpec, specText, hoOf, TOL_T, TOL_W };
})(window);
