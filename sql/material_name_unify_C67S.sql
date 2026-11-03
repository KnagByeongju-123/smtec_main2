-- ============================================================
--  재질명 통일 : C67SCM-S, S70CM-S, S70CM, S70C  →  C67S   (2026-11-03)
--  (C67S 와 S70CM-S 는 같은 소재 — 현장 확인, 표기는 C67S 로 통일)
--  ※ 이전에 만든 material_name_fix_S70C.sql(S70C→S70CM-S)은 이 파일로 대체되었음
--
--  대상 (2026-11-03 조회)
--    material_master_tj    7건 (C67SCM-S 4, S70CM-S 3) — material_name 접두어도 변경
--    inspection_certs      4건 (S70CM 2, S70CM-S 1, S70C 1)
--    iqc_inspections       4건 (id 183, 189, 200, 239) — group_key 함께 변경
--        단, id 189(TJ-IQC-260921-003, S70CM 8코일)는 같은 날 기존 C67S 성적서
--        id 188(TJ-IQC-260921-002)과 (group_key, receipt_date)가 겹치므로
--        재질명만 바꾸고 group_key 는 유지 (두 성적서를 별도 문서로 보존)
--    raw_material_receipt 38건 (S70CM 28, S70CM-S 10) — material_type 만 변경
--        ※ item_code / mes_item_code (S70CM_1.25X132, S70CM-S_1.25X132) 는 PIMMES 품목코드라 변경하지 않음
--  실행 : Supabase 대시보드 > SQL Editor 에서 전체 실행
-- ============================================================

-- 0) 변경 전 확인 (7 / 4 / 4 / 38)
select 'master' t, count(*) from material_master_tj   where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C')
union all select 'certs', count(*) from inspection_certs     where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C')
union all select 'iqc',   count(*) from iqc_inspections      where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C')
union all select 'raw',   count(*) from raw_material_receipt where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C');

-- 1) 백업
create table if not exists material_master_tj_bak_20261103_c67s   as select * from material_master_tj   where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C');
create table if not exists inspection_certs_bak_20261103_c67s     as select * from inspection_certs     where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C');
create table if not exists iqc_inspections_bak_20261103_c67s      as select * from iqc_inspections      where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C');
create table if not exists raw_material_receipt_bak_20261103_c67s as select * from raw_material_receipt where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C');

-- 2) 변경 (한 트랜잭션)
begin;

update material_master_tj
   set material_name = regexp_replace(material_name, '^(C67SCM-S|S70CM-S|S70CM|S70C)', 'C67S'),
       material_type = 'C67S'
 where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C');

update inspection_certs
   set material_type = 'C67S'
 where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C');

-- 성적서: group_key 는 겹치지 않는 경우에만 변경
update iqc_inspections i
   set group_key = regexp_replace(i.group_key, '\|(C67SCM-S|S70CM-S|S70CM|S70C)\|', '|C67S|')
 where i.material_type in ('C67SCM-S','S70CM-S','S70CM','S70C')
   and not exists (
         select 1 from iqc_inspections x
          where x.id <> i.id
            and x.receipt_date = i.receipt_date
            and x.group_key = regexp_replace(i.group_key, '\|(C67SCM-S|S70CM-S|S70CM|S70C)\|', '|C67S|'));

update iqc_inspections
   set material_type = 'C67S'
 where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C');

update raw_material_receipt
   set material_type = 'C67S'
 where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C');

commit;

-- 3) 변경 후 확인 (옛 표기 0건 / 성적서 group_key 확인)
select 'master' t, count(*) from material_master_tj   where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C')
union all select 'certs', count(*) from inspection_certs     where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C')
union all select 'iqc',   count(*) from iqc_inspections      where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C')
union all select 'raw',   count(*) from raw_material_receipt where material_type in ('C67SCM-S','S70CM-S','S70CM','S70C');
select id, cert_no, material_type, group_key, receipt_date from iqc_inspections where id in (183,188,189,200,239) order by id;

-- [되돌리기] 필요 시에만 실행
-- update material_master_tj m   set material_type = b.material_type, material_name = b.material_name from material_master_tj_bak_20261103_c67s b where m.id = b.id;
-- update inspection_certs c     set material_type = b.material_type from inspection_certs_bak_20261103_c67s b where c.id = b.id;
-- update iqc_inspections i      set material_type = b.material_type, group_key = b.group_key from iqc_inspections_bak_20261103_c67s b where i.id = b.id;
-- update raw_material_receipt r set material_type = b.material_type from raw_material_receipt_bak_20261103_c67s b where r.id = b.id;
