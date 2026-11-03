# PIMMES 원소재 투입 연동 사양 (동기화 프로그램 추가분)

작성 2026-11-03 · 대상: 사내 동기화 프로그램(PIMMES ↔ Supabase) 담당

## 1. 목적
현장에서 **휴대폰·키오스크로 코일 QR을 찍어 장착**하면, PIMMES 키오스크의 **[원소재 투입]**을 따로 누르지 않아도 PIMMES에 투입이 등록되게 한다.

소재 입고 연동(`raw_material_receipt`: pending → synced, `mes_receipt_no`)과 같은 구조로, 방향만 **투입**이다.

```
휴대폰/키오스크 QR 장착 ──▶ Supabase mes_material_input (status = pending)
                                        │
                     동기화 프로그램 (공장 PC, 주기 조회)
                                        │
                                        ▼
                         PIMMES 원소재 투입 등록 (키오스크 [원소재 투입]과 동일)
                                        │
                     status = synced (실패 시 error + error_msg)
```

## 2. 테이블 `public.mes_material_input` (생성 완료)
생성 SQL: `sql/mes_material_input.sql`

| 컬럼 | 예시 | 설명 |
|---|---|---|
| `id` | 1 | 자동 번호 |
| `machine_code` | `007` | **PIMMES 설비코드** (`machine_status.machine_code`) |
| `machine_name` | `01_200` | PIMMES 설비명 |
| `work_order_no` | `WO26B03P3425` | 장착 시점 작업지시 (`machine_status.current_wo`) |
| `item_code` | `1969-0030-01` | 장착 시점 품번 |
| `raw_item_code` | `SPCC_0.6X102` | 원소재 품목코드 (입고 때 PIMMES 품목코드 `mes_item_code`) |
| `heat_no` | `SB65954-1` | **코일 로트** = PIMMES 소재로트 |
| `receipt_no` | `261103000336` | **PIMMES 입고번호** (입고 동기화 때 받은 `mes_receipt_no`) |
| `net_weight` | `554` | 코일 입고 중량(kg) |
| `input_time` | `2026-11-03T14:30:00+09:00` | 장착(투입) 시각 |
| `worker` | `한영숙` | 장착자 |
| `status` | `pending` | 아래 상태표 |
| `mes_result` | | PIMMES 결과값(투입번호 등) 기록용 |
| `error_msg` | | 실패/수동 사유 |
| `synced_at` | | PIMMES 반영 시각 |
| `retry_count` | 0 | 재시도 횟수 |
| `attachment_id`, `cert_id`, `coil_seq`, `attach_machine`, `source` | | 우리 시스템 추적용 (PIMMES 등록에는 불필요) |

### 상태
| status | 의미 | 누가 바꾸나 |
|---|---|---|
| `pending` | PIMMES 반영 대기 | 화면이 저장 |
| `processing` | 처리 중 | 동기화 프로그램 |
| `synced` | PIMMES 투입 완료 | 동기화 프로그램 |
| `error` | PIMMES 등록 실패 (`error_msg`) | 동기화 프로그램 |
| `manual` | 입고번호를 못 찾아 자동 반영 불가 → **PIMMES에서 직접 투입** | 화면이 저장 (동기화 프로그램은 건드리지 않음) |
| `cancelled` | 잘못된 장착 또는 장착 후 5분 안에 탈착 → **투입 취소** | 화면이 저장 (동기화 프로그램은 건드리지 않음) |

## 3. 동기화 프로그램 처리 순서
1. `status = 'pending'` 을 `id` 순으로 조회 (예: 10초~1분 주기)
   `GET /rest/v1/mes_material_input?status=eq.pending&order=id.asc&limit=50`
2. 한 건씩 `processing` 으로 바꾸고 (다른 PC와 중복 처리 방지: `?id=eq.{id}&status=eq.pending` 조건으로 PATCH, 0건이면 건너뜀)
3. **PIMMES 원소재 투입 등록** — 키오스크 [원소재 투입]과 같은 처리
   - 설비 `machine_code`, 입고번호 `receipt_no`, 소재로트 `heat_no`, 품목 `raw_item_code`, 투입시각 `input_time`, 작업지시 `work_order_no`
   - 이미 같은 설비에 같은 `receipt_no` 가 투입되어 있으면 → 중복 등록하지 말고 `synced` (mes_result 에 '기존 투입' 표기)
   - 기존 투입 코일의 종료 처리는 PIMMES 키오스크에서 새 코일 투입 시 하는 방식과 동일하게
4. 성공 → `status='synced', synced_at=now(), mes_result=<PIMMES 키/메시지>`
5. 실패 → `status='error', error_msg=<사유>, retry_count=retry_count+1`
   - 일시적 오류(접속 등)는 `retry_count < 3` 이면 `pending` 으로 되돌려 재시도해도 됨

### 참고 코드 (Python, 입고 동기화와 같은 방식 가정)
```python
SB = "https://omngtyewdaqpphnzeate.supabase.co/rest/v1"
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json",
     "Prefer": "return=representation"}

def sync_material_input():
    rows = requests.get(f"{SB}/mes_material_input",
                        params={"status": "eq.pending", "order": "id.asc", "limit": 50}, headers=H).json()
    for r in rows:
        got = requests.patch(f"{SB}/mes_material_input",
                             params={"id": f"eq.{r['id']}", "status": "eq.pending"},
                             json={"status": "processing"}, headers=H).json()
        if not got:            # 다른 PC가 이미 잡음
            continue
        try:
            res = pimmes_material_input(          # ← PIMMES 투입 등록 (키오스크 [원소재 투입]과 동일)
                machine_code=r["machine_code"], receipt_no=r["receipt_no"], lot_no=r["heat_no"],
                raw_item_code=r["raw_item_code"], input_time=r["input_time"],
                work_order_no=r["work_order_no"], worker=r["worker"])
            requests.patch(f"{SB}/mes_material_input", params={"id": f"eq.{r['id']}"},
                           json={"status": "synced", "synced_at": now_kst(), "mes_result": str(res)}, headers=H)
        except Exception as e:
            requests.patch(f"{SB}/mes_material_input", params={"id": f"eq.{r['id']}"},
                           json={"status": "error", "error_msg": str(e)[:500],
                                 "retry_count": r["retry_count"] + 1}, headers=H)
```

## 4. 입고번호 찾는 규칙 (화면 쪽, 참고)
- 코일 라벨 QR = `material_attach.html?cert=<inspection_certs.id>&c=<코일순번>`
- 코일 로트 = `inspection_certs.lots_detail` 의 (코일순번)번째 값 (예: `SB65954-1`)
- 입고번호 = `raw_material_receipt` 에서 `heat_no = 코일 로트`, 두께·폭 일치, `status='synced'` 인 최신 행의 `mes_receipt_no`
- 2026-11-03 기준 최근 IQC OK 80건 중 77건이 모든 코일 매칭됨 (나머지는 우리 입고 화면을 거치지 않은 입고)
- 못 찾으면 `status='manual'` 로 저장 → 동기화 대상 아님

## 5. 확인 방법
- 화면: 소재 장착 화면의 장착중 카드에 `⏳ PIMMES 대기 / ✅ PIMMES 반영 / ❌ 오류 / ✋ 직접투입` 표시
- 조회: `select id, machine_code, heat_no, receipt_no, status, error_msg, input_time from mes_material_input order by id desc;`
- PIMMES 키오스크 화면의 **소재로트**가 `heat_no` 로 바뀌면 정상

## 6. 확인 필요 (동기화 프로그램 담당)
1. PIMMES 원소재 투입을 등록하는 방법 (DB 직접 INSERT / 프로시저 / PIMMES API) 과 필요한 필수값이 위 컬럼으로 충분한지
2. 새 코일 투입 시 이전 코일 투입 종료가 자동인지
3. 작업지시(`work_order_no`)가 투입 등록에 필수인지 — 장착 시점 값이 바뀌었을 수 있음
