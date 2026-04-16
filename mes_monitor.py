"""
태진다이텍 품질관리 모니터링 v4.3
- 30초: MES → Supabase machine_status
- Flask API: /api/lot_search (on-demand MES 로트이력 조회 → Supabase 동기화 → 결과 반환)
"""
import oracledb
import os
import time
import json
import urllib.request
import urllib.error
import threading
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS  # pip install flask-cors

HOST = "192.168.1.250"
PORT = 1521
SERVICE_NAME = "XE"
DB_USER = "infinity21_pimmes"
DB_PASSWORD = "infinity21_pimmes"

SUPABASE_URL = "https://omngtyewdaqpphnzeate.supabase.co"
SUPABASE_KEY = "sb_publishable_9j2YkkL-7ul1TrhH-NjVdQ_vWDG2-1D"

REFRESH_SEC = 30
API_PORT = 5100

G="\033[92m";R="\033[91m";Y="\033[93m";C="\033[96m";B="\033[1m";D="\033[2m";RS="\033[0m"

# ─── Supabase ───
def sb_headers():
    return {"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}","Content-Type":"application/json","Prefer":"return=minimal"}

def sb_request(method, path, data=None):
    url=f"{SUPABASE_URL}/rest/v1/{path}"
    body=json.dumps(data).encode('utf-8') if data else None
    req=urllib.request.Request(url,data=body,headers=sb_headers(),method=method)
    try:
        with urllib.request.urlopen(req,timeout=15) as resp: return resp.status
    except urllib.error.HTTPError as e: return e.code
    except: return 0

def upload_machine_status(records):
    sb_request('DELETE','machine_status?id=gt.0')
    return sb_request('POST','machine_status',records)

# ─── MES 조회 ───
def get_mes_connection():
    return oracledb.connect(user=DB_USER, password=DB_PASSWORD, dsn=f"{HOST}:{PORT}/{SERVICE_NAME}")

def fetch_tablet(cursor):
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

def fetch_lot_history(cursor, start_date, end_date, item_filter=None, lot_filter=None):
    """MES 소재로트 사용이력 on-demand 조회"""
    sql = """
        SELECT D.RECEIPT_NO, D.RECEIPT_SEQ, D.HEAT_NO, D.ACTUCAL_DATE,
               D.WORK_SHIFT, D.WORK_ORDER_NO, D.ITEM_CODE, D.RAW_ITEM_CODE,
               D.UNIT_PER_QTY, D.USE_WEIGHT, D.SHOT_QTY, D.NORMAL_SHOT, D.ABNORMAL_SHOT,
               D.START_DATE, D.END_DATE, D.MACHINE_CODE,
               M.ITEM_NAME
        FROM IMTL_RAW_SF_USE_CASE_DTL D
        LEFT JOIN ICOM_ITEM_MASTER M ON D.ITEM_CODE = M.ITEM_CODE
        WHERE D.ACTUCAL_DATE >= :sd AND D.ACTUCAL_DATE <= :ed
    """
    params = {'sd': datetime.strptime(start_date, '%Y-%m-%d'),
              'ed': datetime.strptime(end_date, '%Y-%m-%d')}

    if item_filter:
        sql += " AND (UPPER(D.ITEM_CODE) LIKE UPPER(:item) OR UPPER(M.ITEM_NAME) LIKE UPPER(:item2))"
        params['item'] = f'%{item_filter}%'
        params['item2'] = f'%{item_filter}%'
    if lot_filter:
        sql += " AND UPPER(D.HEAT_NO) LIKE UPPER(:lot)"
        params['lot'] = f'%{lot_filter}%'

    sql += " ORDER BY D.ACTUCAL_DATE DESC, D.START_DATE DESC"
    cursor.execute(sql, params)
    return cursor.fetchall()

# ─── 계산 ───
def calc_capacity(aw,uq): return int(aw/uq) if aw and uq and uq>0 else 0
def get_ct(ac,tc):
    if ac and ac>0: return ac
    if tc and tc>0: return tc
    return 0
def calc_remaining(cap,sq,ct):
    rq=max(0,(cap or 0)-(sq or 0))
    rm=round(rq*ct/60,1) if ct>0 and rq>0 else 0
    return rq,rm

# ─── Flask API ───
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=SCRIPT_DIR)
CORS(app)

@app.route('/')
def index():
    """같은 폴더의 mes_monitor_layout.html 서빙"""
    return send_from_directory(SCRIPT_DIR, 'mes_monitor_layout.html')

@app.route('/<path:filename>')
def static_files(filename):
    """같은 폴더의 정적 파일 서빙"""
    return send_from_directory(SCRIPT_DIR, filename)

@app.route('/api/lot_search')
def lot_search():
    """on-demand MES 로트이력 조회 → Supabase 동기화 → JSON 반환"""
    start = request.args.get('start', '')
    end = request.args.get('end', '')
    item = request.args.get('item', '').strip()
    lot = request.args.get('lot', '').strip()

    if not start or not end:
        return jsonify({"error": "start/end 필수"}), 400

    try:
        conn = get_mes_connection()
        cursor = conn.cursor()
        rows = fetch_lot_history(cursor, start, end,
                                 item if item else None,
                                 lot if lot else None)
        cursor.close()
        conn.close()
    except Exception as e:
        return jsonify({"error": f"MES DB 오류: {str(e)}"}), 500

    # Supabase 동기화 (해당 범위 DELETE → INSERT)
    sb_request('DELETE', f'lot_use_history?actual_date=gte.{start}&actual_date=lte.{end}')
    records = []
    results = []
    for r in rows:
        rec = {
            "receipt_no": r[0], "receipt_seq": r[1], "heat_no": r[2],
            "actual_date": r[3].strftime('%Y-%m-%d') if r[3] else None,
            "work_shift": r[4], "work_order_no": r[5],
            "item_code": r[6], "raw_item_code": r[7],
            "unit_per_qty": float(r[8]) if r[8] else 0,
            "use_weight": float(r[9]) if r[9] else 0,
            "shot_qty": int(r[10]) if r[10] else 0,
            "normal_shot": int(r[11]) if r[11] else 0,
            "abnormal_shot": int(r[12]) if r[12] else 0,
            "start_date": r[13].isoformat() if r[13] else None,
            "end_date": r[14].isoformat() if r[14] else None,
            "machine_code": r[15],
            "item_name": r[16] or '',
            "synced_at": datetime.now().isoformat()
        }
        records.append(rec)
        results.append(rec)

    # 배치 INSERT
    for i in range(0, len(records), 100):
        sb_request('POST', 'lot_use_history', records[i:i+100])

    print(f"  {Y}🔍 로트검색: {start}~{end}, {len(results)}건 (item={item}, lot={lot}){RS}")
    return jsonify({"count": len(results), "data": results})

@app.route('/api/health')
def health():
    return jsonify({"status": "ok", "time": datetime.now().isoformat()})

def run_flask():
    import logging
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    app.run(host='0.0.0.0', port=API_PORT, debug=False, use_reloader=False)

# ─── 콘솔 표시 ───
def display(rows, upload_ok):
    os.system('cls' if os.name=='nt' else 'clear')
    now=datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    total=len(rows);running=sum(1 for r in rows if r[2]=='N');stopped=total-running
    ts=sum(r[11]or 0 for r in rows);tn=sum(r[10]or 0 for r in rows)
    sp=f"{G}●OK{RS}" if upload_ok else f"{R}●FAIL{RS}"
    print(f"{B}{C}")
    print(f"  ╔══════════════════════════════════════════════════════════════════════════════════════════════════════════════╗")
    print(f"  ║  태진다이텍 품질관리 모니터링 v4.3                                          {now}  ({REFRESH_SEC}초 갱신)  ║")
    print(f"  ╚══════════════════════════════════════════════════════════════════════════════════════════════════════════════╝{RS}")
    print(f"\n  {sp} │ 전체:{B}{total}{RS} │ {G}가동:{running}{RS} │ {R}비가동:{stopped}{RS} │ 생산:{B}{ts:,}{RS} │ NG:{R}{tn:,}{RS} │ {C}API:localhost:{API_PORT}{RS}")
    print()
    customers={}
    for row in rows:
        c=str(row[16]or'미지정')
        if c not in customers:customers[c]=[]
        customers[c].append(row)
    print(f"  {B}{'설비':<5} {'설비명':<12} {'상태':<9} {'품번':<16} {'가능':>7} {'실적':>7} {'잔량':>7} {'잔여':>8} {'CT':>5} {'NG':>4} {'로트':<16} {'작업자':<6}{RS}")
    print(f"  {'─'*120}")
    for cust in sorted(customers.keys()):
        grp=customers[cust];gs=sum(r[11]or 0 for r in grp);gr=sum(1 for r in grp if r[2]=='N')
        print(f"\n  {B}{C}▌ {cust} ({len(grp)}대, 가동{gr}, 생산{gs:,}){RS}")
        for row in grp:
            mc=str(row[0]or'');nm=str(row[1]or'')[:10];st=str(row[2]or'');it=str(row[5]or'-')[:14]
            sq=row[11]or 0;ac=row[8]or 0;tc=row[9]or 0;ng=row[10]or 0;wk=str(row[12]or'-')[:5]
            aw=row[19]or 0;uq=row[20]or 0;ln=str(row[22]or'-')[:14]
            ct=get_ct(ac,tc);cap=calc_capacity(aw,uq);rq,rm=calc_remaining(cap,sq,ct)
            s=f"{G}● 가동{RS}" if st=='N' else f"{R}■ 비가동{RS}"
            if rm>0:
                h=int(rm//60);m=int(rm%60);ts2=f"{h}h{m:02d}m" if h>0 else f"{m}m"
                if rm<=30:ts2=f"{Y}{B}★{ts2}{RS}"
                elif rm<=60:ts2=f"{Y}{ts2}{RS}"
            else:ts2="   -"
            cs=f"{ac:.1f}" if ac>0 else (f"({tc:.1f})" if tc>0 else "  -")
            ns=f"{R}{ng}{RS}" if ng>0 else "  0"
            cp=f"{cap:>7,}" if cap>0 else "      -"
            print(f"  {mc:<5} {nm:<12} {s} {it:<16} {cp} {sq:>7,} {rq:>7,} {ts2:>18} {cs:>5} {ns:>4} {ln:<16} {wk:<6}")
    print(f"\n  {Y}★=잔여30분이내{RS} │ API http://localhost:{API_PORT}/api/lot_search │ {D}Ctrl+C 종료{RS}")

# ─── 메인 ───
if __name__ == "__main__":
    if os.name=='nt': os.system('color')
    import glob
    thick_ok=False
    for pat in [r"C:\oracle\instantclient*",r"C:\instantclient*",
                os.path.join(os.path.dirname(os.path.abspath(__file__)),"instantclient*")]:
        for p in glob.glob(pat):
            if os.path.isdir(p):
                try: oracledb.init_oracle_client(lib_dir=p);print(f"  Thick:{p}");thick_ok=True;break
                except: pass
        if thick_ok:break
    if not thick_ok:
        try: oracledb.init_oracle_client()
        except: pass

    # Flask API 백그라운드 시작
    print(f"  API 서버 시작: http://localhost:{API_PORT}")
    flask_thread = threading.Thread(target=run_flask, daemon=True)
    flask_thread.start()

    print("  DB 접속 중...")
    conn=get_mes_connection()
    cursor=conn.cursor();print("  ✅ 접속!")

    try:
        while True:
            try:
                rows=fetch_tablet(cursor)
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
                status=upload_machine_status(records)
                upload_ok=(200<=status<300) if status else False
                display(rows,upload_ok)
                # Supabase 업로드 결과는 display()의 sp 표시로 확인
                for r in range(REFRESH_SEC,0,-1):
                    print(f"\r  갱신:{r//60}:{r%60:02d}  ",end="",flush=True);time.sleep(1)
            except oracledb.DatabaseError as e:
                print(f"\n  DB오류:{e}");time.sleep(30)
                try:
                    conn=get_mes_connection();cursor=conn.cursor();print("  ✅재접속!")
                except:pass
    except KeyboardInterrupt:print(f"\n\n  종료.")
    finally:
        try:cursor.close();conn.close()
        except:pass
