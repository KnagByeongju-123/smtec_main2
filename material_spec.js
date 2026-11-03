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
//    같은 소재(SAME_MAT): C67S = S70CM-S (같은 소재를 모델별로 다른 이름으로 납품)
//                         C67SCM-S·S70CM·S70C 는 잘못된/옛 표기,  S55C → S55CM-S
//  품번별 납품 표기(ITEM_MAT): 판정에는 영향 없음 — 확인창에 '이 품번은 ○○ 표기로 납품'을 보여주는 용도
//  허용차: 두께 ±0.02mm, 폭 ±0.5mm
// ============================================================
(function (g) {
  const TOL_T = 0.02;
  const TOL_W = 0.5;
  // 같은 소재로 판정할 이름 (정규화 전 '정확한 이름' 기준, 값은 비교용 기준명) — 2026-11 현장 확인
  //   C67S = S70CM-S : 같은 소재, 모델별로 납품 명칭만 다름
  //   C67SCM-S·C67SCM : 옛 소재마스터 표기,  S70CM·S70C : 잘못 입력된 표기
  //   S55C : 잘못된 소재명 → 정식명 S55CM-S  (S55CM-S 와 S55CM 은 일반 정규화로 같음)
  const SAME_MAT = {
    'C67S': '=C67S', 'S70CM-S': '=C67S',
    'C67SCM-S': '=C67S', 'C67SCM': '=C67S', 'S70CM': '=C67S', 'S70C': '=C67S',
    'S55C': 'S55CM',
  };

  // 품번별 납품 표기 (SKF SBC MSBU RING) — 같은 소재, 명칭만 다르게 납품 (2026-11 현장 확인)
  //   1113AA, 1113E               : S70CM-S
  //   1113D, 1179(1179C 포함), 1156 : C67S
  //   품번 예: IW/OW-BDA-1113D, IW/OW-BDA-1179-1
  const ITEM_MAT = [
    { re: /BDA-?1113(AA|E)(?![A-Z0-9])/, material: 'S70CM-S', label: '1113AA/1113E' },
    { re: /BDA-?(1113D(?![A-Z0-9])|1179|1156)/, material: 'C67S', label: '1113D/1179/1156' },
  ];

  function parseMat(s) {
    let t = String(s || '').toUpperCase().trim();
    const exact = SAME_MAT[t.replace(/\s+/g, '')];
    if (exact) return { base: exact, fin: '' };
    t = t.replace(/^SUS\s*/, '').replace(/-(S|P)$/, '');
    t = t.replace(/[\s\-()_.]/g, '');
    let fin = '';
    const m = t.match(/^(.+?)(2B|BA|BB)$/);
    if (m && m[1].length >= 3) { t = m[1]; fin = m[2]; }
    return { base: t, fin };
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

  /* 마스터 금형번호 표기 해석 — 현재 금형(mold)이 마스터 금형번호(m)에 해당하는지
       19DHA205A            : 그대로 일치
       19SKA202A_1179       : 뒤에 꼬리표 (예: _1179, (Transfer))
       19RDA604~612A        : 번호 범위 604~612 (끝 글자 A/B 등 개정 무관)
       21SDA301A~K          : 끝 글자 범위 301A ~ 301K */
  function moldMatch(m, mold) {
    if (!m || !mold) return false;
    if (m === mold) return true;
    if (m.startsWith(mold) && /^[^A-Z0-9]/.test(m.slice(mold.length))) return true;
    const cur = mold.match(/^(.*?)(\d+)([A-Z]*)$/);
    let r = m.match(/^(.*?)(\d+)\s*~\s*(\d+)([A-Z]*)$/);
    if (r && cur && cur[1] === r[1]) {
      const n = parseInt(cur[2], 10);
      return n >= parseInt(r[2], 10) && n <= parseInt(r[3], 10);
    }
    r = m.match(/^(.*\d)([A-Z])\s*~\s*([A-Z])$/);
    const cl = mold.match(/^(.*\d)([A-Z])$/);
    if (r && cl && cl[1] === r[1]) return cl[2] >= r[2] && cl[2] <= r[3];
    return false;
  }
  // 품번 비교용: 뒤의 -(BK), (TR) 같은 꼬리 제거  예) 54610-C1001-(BK) → 54610-C1001
  function itemBase(s) { return String(s || '').toUpperCase().replace(/-?\([^)]*\)/g, '').trim(); }

  function itemRule(item) {
    const it = String(item || '').toUpperCase();
    return it ? ITEM_MAT.find(r => r.re.test(it)) || null : null;
  }

  /* 설비 현재 작업(machine_status 1행) → 소재 마스터 규격 목록 */
  function findJobSpecs(ms, masterRows) {
    if (!ms || !Array.isArray(masterRows)) return null;
    const mold = String(ms.current_mold || '').trim().toUpperCase();
    const item = String(ms.current_item_code || '').trim().toUpperCase();
    const moldOf = r => String(r.mold_number || '').trim().toUpperCase();
    let rows = mold ? masterRows.filter(r => moldOf(r) === mold) : [];
    if (!rows.length && mold) rows = masterRows.filter(r => moldMatch(moldOf(r), mold));
    // 마스터 금형번호에 꼬리표가 붙은 경우 (예: 19SKA202A_1179, 22RDA602A(Transfer))
    if (!rows.length && mold) rows = masterRows.filter(r => moldOf(r).startsWith(mold) && /^[^A-Z0-9]/.test(moldOf(r).slice(mold.length)));
    let by = rows.length ? `금형 ${ms.current_mold}` : '';
    if (!rows.length && item) {
      const ib = itemBase(item);
      rows = masterRows.filter(r => {
        const toks = String(r.mapped_models || '').toUpperCase().split(/[\s(),/;=]+/);
        return toks.includes(item) || (ib && toks.includes(ib));
      });
      if (rows.length) by = `품번 ${ms.current_item_code}`;
    }
    // 마지막 단계: 금형 끝 개정 문자만 다른 경우 (예: 현재 23BKA002C ↔ 마스터 23BKA002A) — '개정 다름' 표시
    if (!rows.length && mold) {
      const base = x => x.replace(/[A-Z]+$/, '');
      const mb = base(mold);
      if (mb !== mold && /\d$/.test(mb)) {
        rows = masterRows.filter(r => { const m = moldOf(r); return m !== mold && /^[0-9A-Z]+$/.test(m) && base(m) === mb; });
        if (rows.length) by = `금형 ${moldOf(rows[0])} (개정 다름 · 현재 ${ms.current_mold})`;
      }
    }
    rows = rows.filter(r => r.material_type || r.thickness || r.width);
    let specs = rows.map(r => ({ material_type: r.material_type, thickness: r.thickness, width: r.width, name: r.material_name }));
    // 품번별 납품 표기 (같은 소재라 판정은 동일, 표시만 품번 표기로)
    const rule = itemRule(item);
    if (rule) {
      specs = specs.length ? specs.map(s => ({ ...s, material_type: rule.material })) : [{ material_type: rule.material, thickness: null, width: null }];
      by = (by ? by + ' · ' : '') + `납품표기 ${rule.material}`;
    }
    const base = { by, item: ms.current_item_code || '', mold: ms.current_mold || '' };
    return { ...base, specs: specs };
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
    if (!s) return '-';
    if (s.thickness == null && s.width == null) return `${s.material_type || '-'} (두께·폭 미등록)`;
    return `${s.material_type || '-'} ${s.thickness ?? '-'}t × ${s.width ?? '-'}W`;
  }

  /* 호기명('36호기 심팩300톤' / '36_300') → 호기번호 36 */
  function hoOf(name) {
    const n = parseInt(String(name || '').trim(), 10);
    return isNaN(n) ? null : n;
  }

  g.MatSpec = { parseMat, sameMat, findJobSpecs, checkSpec, specText, hoOf, itemRule, moldMatch, itemBase, TOL_T, TOL_W };
})(window);
