-- ============================================================
--  PIMMES 원소재 투입 대기 테이블 : mes_material_input   (2026-11-03)
--  흐름 : 휴대폰/키오스크 QR 장착 → 이 테이블에 'pending' 저장
--         → 사내 동기화 프로그램이 PIMMES 원소재 투입 등록 → 'synced'
--  (소재 입고 raw_material_receipt 의 pending → synced 와 같은 구조)
--  상세 사양 : sql/mes_material_input_spec.md
-- ============================================================

create table if not exists public.mes_material_input (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- 우리 시스템 장착 기록
  attachment_id   bigint,                 -- material_attachment.id
  cert_id         bigint,                 -- inspection_certs.id (코일 라벨 QR 의 cert)
  coil_seq        integer,                -- 라벨 QR 의 코일 순번 (c=)
  source          text,                   -- qr_phone | qr_kiosk | qr_page | touch

  -- PIMMES 투입에 필요한 값
  machine_code    text not null,          -- PIMMES 설비코드 (machine_status.machine_code, 예: 007)
  machine_name    text,                   -- PIMMES 설비명 (예: 01_200)
  attach_machine  text,                   -- 우리 호기명 (예: 1호기 쌍용200톤)
  work_order_no   text,                   -- 장착 시점 작업지시 (machine_status.current_wo)
  item_code       text,                   -- 장착 시점 품번 (machine_status.current_item_code)
  raw_item_code   text,                   -- 원소재 품목코드 (예: SPCC_0.6X102)
  heat_no         text,                   -- 코일 로트 (예: SB65954-1) = PIMMES 소재로트
  receipt_no      text,                   -- PIMMES 입고번호 (raw_material_receipt.mes_receipt_no)
  net_weight      numeric,                -- 코일 입고 중량(kg)
  input_time      timestamptz not null,   -- 장착(투입) 시각
  worker          text,                   -- 장착자

  -- 처리 상태
  status          text not null default 'pending'
                  check (status in ('pending','processing','synced','error','manual')),
                  -- pending    : 동기화 프로그램 처리 대기
                  -- processing : 처리 중 (동기화 프로그램이 잡음)
                  -- synced     : PIMMES 투입 완료
                  -- error      : PIMMES 등록 실패 (error_msg 참고, 재시도 가능)
                  -- manual     : 입고번호를 찾지 못해 자동 반영 불가 → PIMMES 에서 직접 투입
  mes_result      text,                   -- PIMMES 쪽 결과(투입번호 등)
  error_msg       text,
  synced_at       timestamptz,
  retry_count     integer not null default 0
);

comment on table public.mes_material_input is 'PIMMES 원소재 투입 대기 (QR 장착 → 동기화 프로그램 → PIMMES). sql/mes_material_input_spec.md 참고';

-- 같은 장착 기록이 두 번 들어가지 않게
create unique index if not exists mes_material_input_attachment_uq
  on public.mes_material_input (attachment_id) where attachment_id is not null;
create index if not exists mes_material_input_status_idx
  on public.mes_material_input (status, created_at);
create index if not exists mes_material_input_machine_idx
  on public.mes_material_input (machine_code, input_time desc);

-- updated_at 자동 갱신
create or replace function public.mes_material_input_touch() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists mes_material_input_touch on public.mes_material_input;
create trigger mes_material_input_touch before update on public.mes_material_input
  for each row execute function public.mes_material_input_touch();

-- 다른 화면 테이블(material_attachment 등)과 같은 접근 정책
alter table public.mes_material_input enable row level security;
drop policy if exists p_anon_full_access on public.mes_material_input;
create policy p_anon_full_access on public.mes_material_input
  for all to anon, authenticated using (true) with check (true);
