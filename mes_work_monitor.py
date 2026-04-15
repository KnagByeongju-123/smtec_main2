"""
태진다이텍 품질관리 모니터링 v4.3
- 3분 주기 MES DB 조회 → Supabase machine_status 전송
- 가능수량(코일중량/소요량), 실적=SHOT_QTY
- CT fallback: ACTUAL_CT 0이면 TARGET_CT
"""
import oracledb
import os
import time
import json
import urllib.request
import urllib.error
from datetime import datetime

HOST = "192.168.1.250"
PORT = 1521
SERVICE_NAME = "XE"
DB_USER = "infinity21_pimmes"
DB_PASSWORD = "infinity21_pimmes"

SUPABASE_URL = "https://omngtyewdaqpphnzeate.supabase.co"
SUPABASE_KEY = "sb_publishable_9j2YkkL-7ul1TrhH-NjVdQ_vWDG2-1D"

REFRESH_SEC = 180

G="\033[92m";R="\033[91m";Y="\033[93m";C="\033[96m";B="\033[1m";D="\033[2m";RS="\033[0m"

def supabase_delete():
    url=f"{SUPABASE_URL}/rest/v1/machine_status?id=gt.0"
    headers={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}","Content-Type":"application/json","Prefer":"return=minimal"}
    req=urllib.request.Request(url,headers=headers,method="DELETE")
    try:
        with urllib.request.urlopen(req,timeout=15) as resp: return resp.status
    except: return 0

def supabase_insert(records):
    url=f"{SUPABASE_URL}/rest/v1/machine_status"
    headers={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}","Content-Type":"application/json","Prefer":"return=minimal"}
    body=json.dumps(records).encode('utf-8')
    req=urllib.request.Request(url,data=body,headers=headers,method="POST")
    try:
        with urllib.request.urlopen(req,timeout=15) as resp: return resp.status
    except urllib.error.HTTPError as e:
        print(f"  Supabase 오류: {e.code} {e.read().decode()[:200]}")
        return e.code
    except Exception as e:
        print(f"  Supabase 연결 오류: {e}")
        return 0

def upload_to_supabase(records):
    supabase_delete()
    return supabase_insert(records)

def fetch_data(cursor):
    cursor.execute("""
        SELECT T.MACHINE_CODE, T.MACHINE_NAME, T.MACHINE_STATUS,
               T.CURRENT_MOLD, T.CURRENT_WO, T.CURRENT_ITEM_CODE,
               T.CURRNET_ACTUAL_QTY, T.CURRENT_TARGET_QTY,
               T.CURRNET_ACTUAL_CT, T.CURRENT_TARGET_CT,
               T.NG_QTY, T.SHOT_QTY, T.WORKER,
               T.INSPECT_TOP, T.INSPECT_MID, T.INSPECT_BOTTOM,
               M.CUSTOMER_SITE_ID, M.MODEL_CODE, M.ITEM_NAME,
               T.ACTION_WEIGHT, T.UNIT_PER_QTY, T.REMAIN_WEIGHT,
               T.CURRENT_RAW_MTL_LOTNO, T.RAW_MTL_HEAT_NO
        FROM ICOM_APP_TABLET_UI T
        LEFT JOIN ICOM_ITEM_MASTER M ON T.CURRENT_ITEM_CODE = M.ITEM_CODE
        ORDER BY T.DISPLAY_SEQUENCE
    """)
    return cursor.fetchall()

def calc_capacity(aw,uq):
    return int(aw/uq) if aw and uq and uq>0 else 0

def get_ct(ac,tc):
    if ac and ac>0: return ac
    if tc and tc>0: return tc
    return 0

def calc_remaining(cap,sq,ct):
    rq=max(0,(cap or 0)-(sq or 0))
    rm=round(rq*ct/60,1) if ct>0 and rq>0 else 0
    return rq,rm

def display(rows, upload_ok):
    os.system('cls' if os.name=='nt' else 'clear')
    now=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    total=len(rows);running=sum(1 for r in rows if r[2]=='N');stopped=total-running
    ts=sum(r[11]or 0 for r in rows);tn=sum(r[10]or 0 for r in rows)
    sp=f"{G}● Supabase OK{RS}" if upload_ok else f"{R}● Supabase FAIL{RS}"

    print(f"{B}{C}")
    print(f"  ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════╗")
    print(f"  ║  태진다이텍 품질관리 모니터링 v4.3                                          {now}  (3분 갱신)              ║")
    print(f"  ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════╝{RS}")
    print(f"\n  {sp}  │  전체: {B}{total}대{RS}  │  {G}가동: {running}{RS}  │  {R}비가동: {stopped}{RS}  │  생산: {B}{ts:,}{RS}  │  NG: {R}{tn:,}{RS}")
    print()

    customers={}
    for row in rows:
        cust=str(row[16]or'미지정')
        if cust not in customers: customers[cust]=[]
        customers[cust].append(row)

    print(f"  {B}{'설비':<5} {'설비명':<12} {'상태':<9} {'품번':<16} {'가능':>7} {'실적':>7} {'잔량':>7} {'잔여':>8} {'CT':>5} {'NG':>4} {'로트':<16} {'작업자':<6}{RS}")
    print(f"  {'─'*120}")

    for cust in sorted(customers.keys()):
        grp=customers[cust]
        gs=sum(r[11]or 0 for r in grp);gr=sum(1 for r in grp if r[2]=='N')
        print(f"\n  {B}{C}▌ {cust} ({len(grp)}대, 가동{gr}, 생산{gs:,}){RS}")

        for row in grp:
            mc=str(row[0]or'');nm=str(row[1]or'')[:10];st=str(row[2]or'')
            it=str(row[5]or'-')[:14];sq=row[11]or 0
            ac=row[8]or 0;tc=row[9]or 0;ng=row[10]or 0
            wk=str(row[12]or'-')[:5];aw=row[19]or 0;uq=row[20]or 0
            ln=str(row[22]or'-')[:14]

            ct=get_ct(ac,tc);cap=calc_capacity(aw,uq);rq,rm=calc_remaining(cap,sq,ct)

            s=f"{G}● 가동{RS}" if st=='N' else f"{R}■ 비가동{RS}"
            if rm>0:
                h=int(rm//60);m=int(rm%60)
                ts2=f"{h}h{m:02d}m" if h>0 else f"{m}m"
                if rm<=30: ts2=f"{Y}{B}★{ts2}{RS}"
                elif rm<=60: ts2=f"{Y}{ts2}{RS}"
            else: ts2="   -"

            cs=f"{ac:.1f}" if ac>0 else (f"({tc:.1f})" if tc>0 else "  -")
            ns=f"{R}{ng}{RS}" if ng>0 else "  0"
            cp=f"{cap:>7,}" if cap>0 else "      -"
            print(f"  {mc:<5} {nm:<12} {s} {it:<16} {cp} {sq:>7,} {rq:>7,} {ts2:>18} {cs:>5} {ns:>4} {ln:<16} {wk:<6}")

    print(f"\n  {Y}★ = 잔여 30분 이내{RS}  │  가능=코일/소요  │  {D}Ctrl+C 종료{RS}")

if __name__=="__main__":
    if os.name=='nt': os.system('color')

    import glob
    thick_ok=False
    for pat in [r"C:\oracle\instantclient*",r"C:\instantclient*",
                os.path.join(os.path.dirname(os.path.abspath(__file__)),"instantclient*")]:
        for p in glob.glob(pat):
            if os.path.isdir(p):
                try: oracledb.init_oracle_client(lib_dir=p);print(f"  Thick: {p}");thick_ok=True;break
                except: pass
        if thick_ok: break
    if not thick_ok:
        try: oracledb.init_oracle_client()
        except: pass

    print("  DB 접속 중...")
    conn=oracledb.connect(user=DB_USER,password=DB_PASSWORD,dsn=f"{HOST}:{PORT}/{SERVICE_NAME}")
    cursor=conn.cursor()
    print("  ✅ DB 접속 성공!")

    try:
        while True:
            try:
                rows=fetch_data(cursor)
                now_str=datetime.now().isoformat()
                records=[]
                for row in rows:
                    sq=row[11]or 0;wa=row[6]or 0;ac=row[8]or 0;tc=row[9]or 0
                    aw=row[19]or 0;uq=row[20]or 0;rw=row[21]or 0

                    ct=get_ct(ac,tc);cap=calc_capacity(aw,uq);rq,rm=calc_remaining(cap,sq,ct)

                    records.append({
                        "machine_code":row[0],"machine_name":row[1],"machine_status":row[2],
                        "current_mold":row[3],"current_wo":row[4],"current_item_code":row[5],
                        "actual_qty":sq,"target_qty":cap,"actual_ct":ct,"target_ct":tc,
                        "ng_qty":row[10]or 0,"shot_qty":wa,"worker":row[12],
                        "inspect_top":row[13],"inspect_mid":row[14],"inspect_bottom":row[15],
                        "customer":row[16],"model_code":row[17],"item_name":row[18],
                        "remaining_qty":rq,"remaining_minutes":rm,
                        "coil_weight":round(aw/1000,1) if aw else 0,
                        "unit_per_qty":round(uq,1) if uq else 0,
                        "remain_weight":round(rw/1000,1) if rw else 0,
                        "lot_no":row[22]or'',"heat_no":row[23]or'',"updated_at":now_str
                    })

                status=upload_to_supabase(records)
                upload_ok=(200<=status<300) if status else False
                display(rows,upload_ok)
                

                for remaining in range(REFRESH_SEC,0,-1):
                    mins=remaining//60;secs=remaining%60
                    print(f"\r  다음 갱신까지: {mins}분 {secs:02d}초  ",end="",flush=True)
                    time.sleep(1)

            except oracledb.DatabaseError as e:
                print(f"\n  DB 오류: {e}")
                time.sleep(30)
                try:
                    conn=oracledb.connect(user=DB_USER,password=DB_PASSWORD,dsn=f"{HOST}:{PORT}/{SERVICE_NAME}")
                    cursor=conn.cursor();print("  ✅ 재접속!")
                except: pass

    except KeyboardInterrupt:
        print(f"\n\n  모니터링 종료.")
    finally:
        try: cursor.close();conn.close()
        except: pass
