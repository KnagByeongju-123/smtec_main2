-- ============================================================
--  입고 재질명 정정 1건 : S70C → C67S   (2026-11-03)
--  대상 : 한국금속 HEAT ZE22365  1.25t × 248W  입고 2026-10-28
--         inspection_certs id 468  /  iqc_inspections id 239 (TJ-IQC-261029-001)
--  ※ 그 외 입고 데이터는 기존 그대로 둔다 (이 1건만 현장 확인으로 정정)
--  ※ 수입검사 화면은 그룹키(공급자|재질|두께|폭)로 검사건을 찾으므로 group_key 도 함께 변경
--     변경 후 키 '한국금속|C67S|1.25|248' 은 기존 성적서와 겹치지 않음 (2026-11-03 조회)
--  실행 : Supabase 대시보드 > SQL Editor 에서 전체 실행
-- ============================================================

-- 0) 변경 전 확인 (각 1건, S70C)
select id, supplier, material_type, thickness, width_mm, heat_no from inspection_certs where id = 468;
select id, cert_no, material_type, group_key, receipt_date from iqc_inspections where id = 239;

-- 1) 백업
create table if not exists inspection_certs_bak_20261103_ze22365 as select * from inspection_certs where id = 468;
create table if not exists iqc_inspections_bak_20261103_ze22365  as select * from iqc_inspections  where id = 239;

-- 2) 변경
begin;
update inspection_certs set material_type = 'C67S'
 where id = 468 and material_type = 'S70C';
update iqc_inspections set material_type = 'C67S', group_key = '한국금속|C67S|1.25|248'
 where id = 239 and material_type = 'S70C';
commit;

-- 3) 변경 후 확인
select id, material_type, heat_no from inspection_certs where id = 468;
select id, material_type, group_key from iqc_inspections where id = 239;

-- [되돌리기] 필요 시에만 실행
-- update inspection_certs c set material_type = b.material_type from inspection_certs_bak_20261103_ze22365 b where c.id = b.id;
-- update iqc_inspections i  set material_type = b.material_type, group_key = b.group_key from iqc_inspections_bak_20261103_ze22365 b where i.id = b.id;
