-- ============================================================
--  소재 마스터 재질명 통일 : C67SCM-S → C67S   (2026-11-03)
--  기준 표기 : C67S, S70CM-S  (현장 사용 표기)
--  대상     : material_master_tj 4건 (id 1205, 1208, 1209, 1210)
--  실행     : Supabase 대시보드 > SQL Editor 에서 전체 실행
-- ============================================================

-- 0) 변경 전 확인 (4건이 나와야 함)
select id, material_type, material_name, thickness, width, mold_number
from material_master_tj
where material_type = 'C67SCM-S'
order by id;

-- 1) 백업 (되돌릴 때 사용)
create table if not exists material_master_tj_bak_20261103 as
select * from material_master_tj where material_type = 'C67SCM-S';

-- 2) 변경 : 재질 + 소재명 접두어
update material_master_tj
set material_type = 'C67S',
    material_name = regexp_replace(material_name, '^C67SCM-S', 'C67S')
where material_type = 'C67SCM-S';

-- 3) 변경 후 확인 (C67S 4건, C67SCM-S 0건)
select id, material_type, material_name, mold_number
from material_master_tj
where material_type in ('C67S', 'C67SCM-S')
order by id;

-- [되돌리기] 필요 시에만 실행
-- update material_master_tj m
-- set material_type = b.material_type, material_name = b.material_name
-- from material_master_tj_bak_20261103 b
-- where m.id = b.id;
