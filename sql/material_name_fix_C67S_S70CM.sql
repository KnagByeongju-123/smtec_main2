-- ============================================================
--  재질명 정정 (C67S / S70CM-S 계열)   (2026-11-03)
--  C67S 와 S70CM-S 는 같은 소재 — 모델별로 명칭만 다르게 납품 (현장 확인)
--    1113AA, 1113E               : S70CM-S 로 납품
--    1113D, 1179(1179C), 1156     : C67S 로 납품
--  → 납품 표기(C67S, S70CM-S)는 그대로 두고, 잘못/옛 표기만 정정한다
--
--  대상 (2026-11-03 조회)
--    material_master_tj    C67SCM-S → C67S        4건 (1156, 1179-1/2/3 금형) — material_name 접두어도 변경
--                          (1113 금형 3건은 S70CM-S 그대로)
--    inspection_certs      S70CM → S70CM-S 2건,  S70C → S70CM-S 1건
--    iqc_inspections       S70CM → S70CM-S 2건 (id 189, 200),  S70C → S70CM-S 1건 (id 239) — group_key 함께
--    raw_material_receipt  S70CM → S70CM-S 28건 — material_type 만
--        ※ item_code / mes_item_code (S70CM_1.25X132) 는 PIMMES 품목코드라 변경하지 않음
--  group_key 충돌: 없음 (같은 키의 기존 성적서 id 183 은 입고일이 다름) — 그래도 겹치면 key 는 유지
--  실행 : Supabase 대시보드 > SQL Editor 에서 전체 실행
-- ============================================================

-- 0) 변경 전 확인 (4 / 3 / 3 / 28)
select 'master' t, count(*) from material_master_tj   where material_type = 'C67SCM-S'
union all select 'certs', count(*) from inspection_certs     where material_type in ('S70CM','S70C')
union all select 'iqc',   count(*) from iqc_inspections      where material_type in ('S70CM','S70C')
union all select 'raw',   count(*) from raw_material_receipt where material_type in ('S70CM','S70C');

-- 1) 백업
create table if not exists material_master_tj_bak_20261103_c67s   as select * from material_master_tj   where material_type = 'C67SCM-S';
create table if not exists inspection_certs_bak_20261103_s70cm    as select * from inspection_certs     where material_type in ('S70CM','S70C');
create table if not exists iqc_inspections_bak_20261103_s70cm     as select * from iqc_inspections      where material_type in ('S70CM','S70C');
create table if not exists raw_material_receipt_bak_20261103_s70cm as select * from raw_material_receipt where material_type in ('S70CM','S70C');

-- 2) 변경 (한 트랜잭션)
begin;

update material_master_tj
   set material_name = regexp_replace(material_name, '^C67SCM-S', 'C67S'),
       material_type = 'C67S'
 where material_type = 'C67SCM-S';

update inspection_certs
   set material_type = 'S70CM-S'
 where material_type in ('S70CM','S70C');

update iqc_inspections i
   set group_key = regexp_replace(i.group_key, '\|(S70CM|S70C)\|', '|S70CM-S|')
 where i.material_type in ('S70CM','S70C')
   and not exists (
         select 1 from iqc_inspections x
          where x.id <> i.id
            and x.receipt_date = i.receipt_date
            and x.group_key = regexp_replace(i.group_key, '\|(S70CM|S70C)\|', '|S70CM-S|'));

update iqc_inspections
   set material_type = 'S70CM-S'
 where material_type in ('S70CM','S70C');

update raw_material_receipt
   set material_type = 'S70CM-S'
 where material_type in ('S70CM','S70C');

commit;

-- 3) 변경 후 확인 (옛 표기 0건)
select 'master' t, count(*) from material_master_tj   where material_type = 'C67SCM-S'
union all select 'certs', count(*) from inspection_certs     where material_type in ('S70CM','S70C')
union all select 'iqc',   count(*) from iqc_inspections      where material_type in ('S70CM','S70C')
union all select 'raw',   count(*) from raw_material_receipt where material_type in ('S70CM','S70C');
select id, cert_no, material_type, group_key, receipt_date from iqc_inspections where id in (183,189,200,239) order by id;

-- [되돌리기] 필요 시에만 실행
-- update material_master_tj m   set material_type = b.material_type, material_name = b.material_name from material_master_tj_bak_20261103_c67s b where m.id = b.id;
-- update inspection_certs c     set material_type = b.material_type from inspection_certs_bak_20261103_s70cm b where c.id = b.id;
-- update iqc_inspections i      set material_type = b.material_type, group_key = b.group_key from iqc_inspections_bak_20261103_s70cm b where i.id = b.id;
-- update raw_material_receipt r set material_type = b.material_type from raw_material_receipt_bak_20261103_s70cm b where r.id = b.id;
