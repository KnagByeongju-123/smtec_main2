"""
MES 소재로트 사용이력 조회
- 날짜범위, 품번/품명, 로트번호로 검색
- 결과를 콘솔 출력 + CSV 저장
"""
import oracledb
import os
import csv
import glob
from datetime import datetime, timedelta

HOST = "192.168.1.250"
PORT = 1521
SERVICE_NAME = "XE"
DB_USER = "infinity21_pimmes"
DB_PASSWORD = "infinity21_pimmes"

G="\033[92m";R="\033[91m";Y="\033[93m";C="\033[96m";B="\033[1m";D="\033[2m";RS="\033[0m"

def get_connection():
    thick_ok = False
    for pat in [r"C:\oracle\instantclient*", r"C:\instantclient*",
                os.path.join(os.path.dirname(os.path.abspath(__file__)), "instantclient*")]:
        for p in glob.glob(pat):
            if os.path.isdir(p):
                try: oracledb.init_oracle_client(lib_dir=p); thick_ok=True; break
                except: pass
        if thick_ok: break
    if not thick_ok:
        try: oracledb.init_oracle_client()
        except: pass
    return oracledb.connect(user=DB_USER, password=DB_PASSWORD, dsn=f"{HOST}:{PORT}/{SERVICE_NAME}")

def search_lot(cursor, start_date, end_date, item_filter=None, lot_filter=None, machine_filter=None):
    sql = """
        SELECT D.MACHINE_CODE, D.ACTUCAL_DATE, D.WORK_SHIFT,
               D.ITEM_CODE, M.ITEM_NAME, D.RAW_ITEM_CODE,
               D.HEAT_NO, D.RECEIPT_NO,
               D.UNIT_PER_QTY, D.USE_WEIGHT,
               D.SHOT_QTY, D.NORMAL_SHOT, D.ABNORMAL_SHOT,
               D.START_DATE, D.END_DATE,
               D.WORK_ORDER_NO
        FROM IMTL_RAW_SF_USE_CASE_DTL D
        LEFT JOIN ICOM_ITEM_MASTER M ON D.ITEM_CODE = M.ITEM_CODE
        WHERE D.ACTUCAL_DATE >= :sd AND D.ACTUCAL_DATE <= :ed
    """
    params = {
        'sd': datetime.strptime(start_date, '%Y-%m-%d'),
        'ed': datetime.strptime(end_date, '%Y-%m-%d')
    }

    if item_filter:
        sql += " AND (UPPER(D.ITEM_CODE) LIKE UPPER(:item) OR UPPER(M.ITEM_NAME) LIKE UPPER(:item2))"
        params['item'] = f'%{item_filter}%'
        params['item2'] = f'%{item_filter}%'
    if lot_filter:
        sql += " AND UPPER(D.HEAT_NO) LIKE UPPER(:lot)"
        params['lot'] = f'%{lot_filter}%'
    if machine_filter:
        sql += " AND D.MACHINE_CODE = :mc"
        params['mc'] = machine_filter

    sql += " ORDER BY D.ACTUCAL_DATE DESC, D.START_DATE DESC"
    cursor.execute(sql, params)
    return cursor.fetchall()

def display_results(rows):
    if not rows:
        print(f"\n  {Y}검색 결과 없음{RS}")
        return

    total_shot = sum(r[10] or 0 for r in rows)
    total_normal = sum(r[11] or 0 for r in rows)
    total_abnormal = sum(r[12] or 0 for r in rows)
    total_weight = sum(r[9] or 0 for r in rows)

    print(f"\n  {G}{B}검색 결과: {len(rows)}건{RS}")
    print(f"  총실적: {B}{total_shot:,}{RS}  │  양품: {G}{total_normal:,}{RS}  │  불량: {R}{total_abnormal:,}{RS}  │  사용중량: {B}{total_weight/1000:,.1f}kg{RS}")
    print()
    print(f"  {B}{'설비':<5} {'일자':<12} {'품번':<18} {'품명':<20} {'소재코드':<16} {'로트(HEAT)':<22} {'소요g':>7} {'사용kg':>8} {'실적':>7} {'양품':>7} {'불량':>5} {'시작':>6} {'종료':>6}{RS}")
    print(f"  {'─'*155}")

    for r in rows:
        mc = str(r[0] or '')
        dt = r[1].strftime('%Y-%m-%d') if r[1] else '-'
        item = str(r[3] or '-')[:16]
        name = str(r[4] or '-')[:18]
        raw = str(r[5] or '-')[:14]
        heat = str(r[6] or '-')[:20]
        upq = f"{r[8]:.1f}" if r[8] else '  -'
        uw = f"{r[9]/1000:.1f}" if r[9] else '  -'
        sq = r[10] or 0
        ns = r[11] or 0
        ab = r[12] or 0
        sd = r[13].strftime('%H:%M') if r[13] else '-'
        ed = r[14].strftime('%H:%M') if r[14] else '-'

        ab_str = f"{R}{ab}{RS}" if ab > 0 else f"  0"
        print(f"  {mc:<5} {dt:<12} {item:<18} {name:<20} {raw:<16} {heat:<22} {upq:>7} {uw:>8} {sq:>7,} {ns:>7,} {ab_str:>5} {sd:>6} {ed:>6}")

def save_csv(rows, filename):
    headers = ['설비','일자','교대','품번','품명','소재코드','로트(HEAT)','입고번호',
               '소요량(g)','사용중량(g)','실적','양품','불량','시작시각','종료시각','작업지시']
    with open(filename, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for r in rows:
            writer.writerow([
                r[0], r[1].strftime('%Y-%m-%d') if r[1] else '',
                r[2], r[3], r[4] or '', r[5] or '', r[6] or '', r[7] or '',
                r[8] or '', r[9] or '', r[10] or 0, r[11] or 0, r[12] or 0,
                r[13].strftime('%Y-%m-%d %H:%M:%S') if r[13] else '',
                r[14].strftime('%Y-%m-%d %H:%M:%S') if r[14] else '',
                r[15] or ''
            ])
    print(f"\n  {G}✅ CSV 저장: {filename}{RS}")

def main():
    if os.name == 'nt': os.system('color')
    os.system('cls' if os.name == 'nt' else 'clear')

    print(f"{B}{C}")
    print(f"  ╔══════════════════════════════════════════════════╗")
    print(f"  ║       MES 소재로트 사용이력 조회                ║")
    print(f"  ╚══════════════════════════════════════════════════╝{RS}")
    print()

    # 기본값: 오늘
    today = datetime.now().strftime('%Y-%m-%d')

    while True:
        print(f"  {C}━━━ 검색 조건 입력 ━━━{RS}")
        start = input(f"  시작일 ({today}): ").strip() or today
        end = input(f"  종료일 ({today}): ").strip() or today
        item = input(f"  품번/품명 (빈칸=전체): ").strip()
        lot = input(f"  로트번호 (빈칸=전체): ").strip()
        mc = input(f"  설비코드 (빈칸=전체): ").strip()
        print()

        print(f"  {Y}MES DB 조회 중...{RS}")
        try:
            conn = get_connection()
            cursor = conn.cursor()
            rows = search_lot(cursor, start, end,
                              item if item else None,
                              lot if lot else None,
                              mc if mc else None)
            cursor.close()
            conn.close()
        except Exception as e:
            print(f"  {R}DB 오류: {e}{RS}")
            input("\n  Enter 키로 계속...")
            continue

        display_results(rows)

        if rows:
            save_yn = input(f"\n  CSV 저장? (y/n): ").strip().lower()
            if save_yn == 'y':
                fname = f"소재로트_{start.replace('-','')}_{end.replace('-','')}"
                if item: fname += f"_{item}"
                if lot: fname += f"_{lot}"
                fname += ".csv"
                save_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), fname)
                save_csv(rows, save_path)

        print()
        again = input(f"  다시 검색? (y/n): ").strip().lower()
        if again != 'y':
            break
        os.system('cls' if os.name == 'nt' else 'clear')

    print(f"\n  {D}종료.{RS}")

if __name__ == "__main__":
    main()
