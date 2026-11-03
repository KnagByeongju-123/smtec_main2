-- ============================================================
--  소재 마스터 재질명 정정 : C67SCM-S → C67S   (2026-11-03)
--  C67S 와 S70CM-S 는 같은 소재 — 모델별로 명칭만 다르게 납품 (현장 확인)
--    1113AA, 1113E               : S70CM-S 로 납품  → 1113 금형 3건은 S70CM-S 그대로
--    1113D, 1179(1179C), 1156     : C67S 로 납품     → 아래 4건만 C67S 로 정정
--  ※ 입고 데이터(inspection_certs, iqc_inspections, raw_material_receipt)는 기존 그대로 둔다
--     (S70CM, S70C 등 옛 표기도 판정 로직 material_spec.js 에서 같은 소재로 처리)
--  대상 : material_master_tj 4건 (id 1205, 1208, 1209, 1210)
--  실행 : Supabase 대시보드 > SQL Editor 에서 전체 실행
-- ============================================================

-- 0) 변경 전 확인 (4건)
select id, material_type, material_name, mold_number, mapped_models
from material_master_tj where material_type = 'C67SCM-S' order by id;

-- 1) 백업
create table if not exists material_master_tj_bak_20261103_c67s as
select * from material_master_tj where material_type = 'C67SCM-S';

-- 2) 변경
update material_master_tj
   set material_name = regexp_replace(material_name, '^C67SCM-S', 'C67S'),
       material_type = 'C67S'
 where material_type = 'C67SCM-S';

-- 3) 변경 후 확인 (C67SCM-S 0건)
select id, material_type, material_name, mold_number, mapped_models
from material_master_tj where id in (1205, 1208, 1209, 1210) order by id;

-- [되돌리기] 필요 시에만 실행
-- update material_master_tj m set material_type = b.material_type, material_name = b.material_name
--   from material_master_tj_bak_20261103_c67s b where m.id = b.id;
