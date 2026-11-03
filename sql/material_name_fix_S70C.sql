-- ============================================================
--  잘못된 재질명 수정 : S70C → S70CM-S   (2026-11-03)
--  대상 : 한국금속 HEAT ZE22365 (1.25t × 248W, 입고 2026-10-28)
--         inspection_certs id 468  /  iqc_inspections id 239 (TJ-IQC-261029-001)
--  ※ 수입검사 화면은 그룹키(공급자|재질|두께|폭)로 검사건을 찾으므로
--    inspection_certs 와 iqc_inspections(group_key 포함)를 반드시 함께 수정
--  실행 : Supabase 대시보드 > SQL Editor 에서 전체 실행
-- ============================================================

-- 0) 변경 전 확인 (각 1건)
select id, supplier, material_type, thickness, width_mm, heat_no, final_judge
from inspection_certs where id = 468;
select id, group_key, cert_no, material_type, receipt_date, cert_ids
from iqc_inspections where id = 239;

-- 1) 백업
create table if not exists inspection_certs_bak_20261103_s70c as
select * from inspection_certs where id = 468;
create table if not exists iqc_inspections_bak_20261103_s70c as
select * from iqc_inspections where id = 239;

-- 2) 변경
update inspection_certs
set material_type = 'S70CM-S'
where id = 468 and material_type = 'S70C';

update iqc_inspections
set material_type = 'S70CM-S',
    group_key     = '한국금속|S70CM-S|1.25|248'
where id = 239 and material_type = 'S70C';

-- 3) 변경 후 확인 (S70C 0건)
select 'certs' t, count(*) from inspection_certs where material_type = 'S70C'
union all
select 'iqc', count(*) from iqc_inspections where material_type = 'S70C';

-- [되돌리기] 필요 시에만 실행
-- update inspection_certs c set material_type = b.material_type
--   from inspection_certs_bak_20261103_s70c b where c.id = b.id;
-- update iqc_inspections i set material_type = b.material_type, group_key = b.group_key
--   from iqc_inspections_bak_20261103_s70c b where i.id = b.id;
