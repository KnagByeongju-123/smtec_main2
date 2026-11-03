-- ============================================================
--  잘못된 재질명 수정 : S55C → S55CM-S (정식 소재명)   (2026-11-03)
--  대상
--    inspection_certs      7건 (id 127, 219, 220, 221, 466, 467, 469)
--    iqc_inspections       5건 (id 11, 33, 34, 238, 241) — group_key 함께 수정
--    raw_material_receipt 15건 — material_type 만 수정
--        ※ item_code / mes_item_code (S55C_1X134, S55C_1X141 …) 는 PIMMES 품목코드라 변경하지 않음
--  충돌 확인 : 변경 후 group_key 가 기존 S55CM-S 성적서(나스테크 id 74)와 겹치지 않음 (2026-11-03 조회)
--  실행 : Supabase 대시보드 > SQL Editor 에서 전체 실행
-- ============================================================

-- 0) 변경 전 확인 (7 / 5 / 15)
select 'certs' t, count(*) from inspection_certs     where material_type = 'S55C'
union all select 'iqc', count(*) from iqc_inspections      where material_type = 'S55C'
union all select 'raw', count(*) from raw_material_receipt where material_type = 'S55C';

-- 1) 백업
create table if not exists inspection_certs_bak_20261103_s55c     as select * from inspection_certs     where material_type = 'S55C';
create table if not exists iqc_inspections_bak_20261103_s55c      as select * from iqc_inspections      where material_type = 'S55C';
create table if not exists raw_material_receipt_bak_20261103_s55c as select * from raw_material_receipt where material_type = 'S55C';

-- 2) 변경 (한 트랜잭션)
begin;
update inspection_certs     set material_type = 'S55CM-S' where material_type = 'S55C';
update iqc_inspections
   set material_type = 'S55CM-S',
       group_key     = replace(group_key, '|S55C|', '|S55CM-S|')
 where material_type = 'S55C';
update raw_material_receipt set material_type = 'S55CM-S' where material_type = 'S55C';
commit;

-- 3) 변경 후 확인 (모두 0건)
select 'certs' t, count(*) from inspection_certs     where material_type = 'S55C'
union all select 'iqc', count(*) from iqc_inspections      where material_type = 'S55C' or group_key like '%|S55C|%'
union all select 'raw', count(*) from raw_material_receipt where material_type = 'S55C';

-- [되돌리기] 필요 시에만 실행
-- update inspection_certs c     set material_type = b.material_type from inspection_certs_bak_20261103_s55c b where c.id = b.id;
-- update iqc_inspections i      set material_type = b.material_type, group_key = b.group_key from iqc_inspections_bak_20261103_s55c b where i.id = b.id;
-- update raw_material_receipt r set material_type = b.material_type from raw_material_receipt_bak_20261103_s55c b where r.id = b.id;
