-- 공정흐름 일일체크: 수동 체크 항목 저장 테이블
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- (테이블이 없어도 화면은 동작하며, 수동체크만 브라우저에 임시 저장됩니다)

create table if not exists public.daily_flow_check (
  id          bigserial primary key,
  check_date  date        not null,          -- 체크 대상 일자
  item_key    text        not null,          -- process_flow_check.html 의 ITEMS.key
  checked     boolean     not null default true,
  checked_by  text,                          -- 담당자 이름
  note        text,
  created_at  timestamptz not null default now(),
  unique (check_date, item_key)
);

alter table public.daily_flow_check enable row level security;

-- 기존 점검 테이블들과 동일하게 anon 키로 읽기/쓰기 허용
create policy "daily_flow_check_select" on public.daily_flow_check for select using (true);
create policy "daily_flow_check_insert" on public.daily_flow_check for insert with check (true);
create policy "daily_flow_check_update" on public.daily_flow_check for update using (true);
