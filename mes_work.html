<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>MES 가동설비 모니터링</title>
<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js"></script>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0f1117;--card:#1a1d27;--card2:#222838;--border:#2a2e3d;--txt:#e8eaf0;--sub:#8b8fa3;--accent:#38bdf8;--green:#22c55e;--red:#ef4444;--yellow:#eab308;--orange:#f97316;--radius:12px}
body{font-family:'Noto Sans KR',sans-serif;background:var(--bg);color:var(--txt);min-height:100vh;padding-bottom:80px}
.hdr{padding:16px 20px;background:linear-gradient(180deg,#181b26,var(--bg));border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center}.hdr h1{font-size:17px;font-weight:800;color:var(--accent)}.hdr .sub{font-size:11px;color:var(--sub);margin-top:2px}
.tabs{display:flex;border-bottom:1px solid var(--border);background:var(--card);position:sticky;top:0;z-index:100;overflow-x:auto}.tab{flex:1;min-width:70px;padding:12px 8px;text-align:center;font-size:12px;font-weight:600;color:var(--sub);cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}.tab.active{color:var(--accent);border-bottom-color:var(--accent);background:rgba(56,189,248,.05)}
.panel{display:none;padding:16px}.panel.active{display:block}.panel.nop{padding:0}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px}.st{background:var(--card);border-radius:10px;padding:10px;border-left:3px solid var(--accent);text-align:center}.st-label{font-size:10px;color:var(--sub)}.st-val{font-size:20px;font-weight:800;margin-top:2px}.st.run{border-left-color:var(--green)}.st.run .st-val{color:var(--green)}.st.stop{border-left-color:var(--red)}.st.stop .st-val{color:var(--red)}.st.warn{border-left-color:var(--yellow)}.st.warn .st-val{color:var(--yellow)}.st.ng{border-left-color:var(--orange)}.st.ng .st-val{color:var(--orange)}
.alert-box{margin-bottom:14px;padding:12px 16px;background:#422006;border:1px solid var(--yellow);border-radius:var(--radius);display:none}.alert-box.show{display:block}.alert-box h3{color:var(--yellow);font-size:13px;margin-bottom:6px}.alert-item{font-size:12px;color:#fde68a;padding:2px 0}
.filter-wrap{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}.fbtn{padding:5px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--sub);cursor:pointer;font-size:11px;font-weight:600}.fbtn.active{background:var(--accent);color:#0f172a;border-color:var(--accent)}
.cg{background:var(--card);border-radius:var(--radius);margin-bottom:10px;overflow:hidden;border:1px solid var(--border)}.cg-hdr{padding:11px 16px;background:#334155;display:flex;justify-content:space-between;align-items:center}.cg-hdr h2{font-size:14px;color:var(--accent)}.cg-stats{font-size:11px;color:var(--sub);display:flex;gap:12px}.cg-stats .gr{color:var(--green)}.cg-stats .rd{color:var(--red)}
.mt{width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed}.mt th{padding:7px 6px;color:var(--sub);font-weight:600;border-bottom:2px solid var(--border);font-size:10px;white-space:nowrap;vertical-align:middle}.mt td{padding:7px 6px;border-bottom:1px solid rgba(71,85,105,.25);white-space:nowrap;vertical-align:middle}.mt tbody tr{cursor:pointer}.mt tbody tr:hover{background:rgba(56,189,248,.08)}.mt tr.dim{opacity:.4}
.mt .c-eq{width:42px;text-align:center}.mt .c-nm{width:62px;text-align:left;overflow:hidden;text-overflow:ellipsis}.mt .c-st{width:62px;text-align:center}.mt .c-mold{width:82px;text-align:left;overflow:hidden;text-overflow:ellipsis}.mt .c-item{width:110px;text-align:left;overflow:hidden;text-overflow:ellipsis}.mt .c-pname{width:120px;text-align:left;overflow:hidden;text-overflow:ellipsis}.mt .c-num{width:56px;text-align:right}.mt .c-prog{width:72px;text-align:center}.mt .c-rem{width:58px;text-align:center}.mt .c-lot{width:115px;text-align:left;font-size:10px;overflow:hidden;text-overflow:ellipsis}.mt .c-coil{width:50px;text-align:right}.mt .c-unit{width:44px;text-align:right}.mt .c-ct{width:48px;text-align:center}.mt .c-ng{width:34px;text-align:right}.mt .c-insp{width:34px;text-align:center}.mt .c-wk{width:52px;text-align:left;overflow:hidden;text-overflow:ellipsis}
.run-dot{color:var(--green);font-weight:700}.stop-dot{color:#fca5a5;font-weight:600}
.rem-urg{background:#422006;color:#fbbf24;font-weight:700;border-radius:4px;padding:1px 6px;animation:pulse 1.5s infinite}.rem-soon{color:var(--yellow);font-weight:600}.rem-ok{color:var(--sub)}
.prog{width:48px;height:6px;background:#334155;border-radius:3px;overflow:hidden;display:inline-block;vertical-align:middle;margin-right:3px}.prog-f{height:100%;border-radius:3px}.prog-f.hi{background:var(--green)}.prog-f.md{background:var(--yellow)}.prog-f.lo{background:var(--red)}
.io{color:var(--green)}.in{color:var(--red);font-weight:700}.ix{color:#475569}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.set-section{background:var(--card);border-radius:var(--radius);margin-bottom:12px;border:1px solid var(--border);overflow:hidden}.set-hdr{padding:14px 16px;display:flex;align-items:center;gap:10px;cursor:pointer}.set-hdr .ico{font-size:20px}.set-hdr .ttl{font-size:14px;font-weight:700;flex:1}.set-hdr .arrow{color:var(--sub);font-size:16px;transition:transform .2s}.set-section.open .set-hdr .arrow{transform:rotate(90deg);color:var(--accent)}.set-body{max-height:0;overflow:hidden;transition:max-height .3s ease}.set-section.open .set-body{max-height:4000px}.set-inner{padding:0 16px 16px}
.form-row{display:flex;gap:10px;margin-bottom:10px;align-items:center;flex-wrap:wrap}.form-row label{font-size:12px;font-weight:600;min-width:70px;color:var(--sub)}.form-row input,.form-row select{flex:1;padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:#0f1117;color:var(--txt);font-size:13px;font-family:inherit;min-width:0}
.btn{padding:10px 20px;border-radius:10px;border:none;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px}.btn-accent{background:var(--accent);color:#0f172a}.btn-orange{background:linear-gradient(135deg,#f59e0b,#f97316);color:#fff}.btn-green{background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff}.btn-red{background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff}.btn-sm{padding:7px 14px;font-size:11px;border-radius:8px}.btn-block{width:100%;justify-content:center}
.rule-list{margin-top:8px}.rule-item{display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,.03);border-radius:8px;margin-bottom:6px}.ri-num{font-size:12px;font-weight:700;color:var(--sub);min-width:24px}.ri-cond{font-size:12px;font-weight:600;flex:1}.ri-val{font-size:12px;color:var(--accent);font-weight:600}.ri-del{width:28px;height:28px;border-radius:6px;border:1px solid rgba(239,68,68,.3);background:transparent;color:var(--red);cursor:pointer;font-size:14px}
.rule-add{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}.rule-add select,.rule-add input{padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:#0f1117;color:var(--txt);font-size:12px;font-family:inherit}.rule-add input{flex:1;min-width:100px}
.conn-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.conn-item{padding:12px;background:rgba(255,255,255,.03);border-radius:10px;display:flex;align-items:center;gap:10px}.conn-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0}.conn-dot.ok{background:var(--green);box-shadow:0 0 8px rgba(34,197,94,.5)}.conn-dot.fail{background:var(--red)}.conn-dot.wait{background:var(--yellow)}.ci-name{font-size:12px;font-weight:600}.ci-status{font-size:10px;color:var(--sub)}
.hist-table{width:100%;border-collapse:collapse;font-size:11px;margin-top:12px}.hist-table th{padding:8px;text-align:left;color:var(--sub);border-bottom:1px solid var(--border);font-size:10px}.hist-table td{padding:8px;border-bottom:1px solid rgba(42,46,61,.3)}
.toast{position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.9);color:#fff;padding:10px 22px;border-radius:20px;font-size:12px;font-weight:600;z-index:10001;opacity:0;transition:opacity .3s;pointer-events:none}.toast.show{opacity:1}
#panel-layout{padding:0;display:none;flex-direction:column;height:calc(100vh - 96px)}#panel-layout.active{display:flex}
.ly-topbar{padding:5px 12px;font-size:10px;color:var(--sub);background:var(--card);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;flex-shrink:0}.ly-zone-bar{display:flex;gap:6px;padding:8px 12px;background:var(--card);border-bottom:1px solid var(--border);overflow-x:auto;flex-shrink:0}.ly-zchip{padding:5px 14px;border-radius:16px;border:1.5px solid var(--border);font-size:11px;font-weight:700;cursor:pointer;background:var(--card2);color:var(--sub);white-space:nowrap}.ly-zchip.active{background:var(--accent);color:#0f172a;border-color:var(--accent)}
.ly-legend{display:flex;gap:10px;padding:5px 12px;background:var(--card);border-bottom:1px solid var(--border);flex-wrap:wrap;flex-shrink:0;align-items:center}.ly-lgi{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--sub)}.ly-lgd{width:11px;height:11px;border-radius:2px;border:2px solid;flex-shrink:0}
.ly-zoom-bar{display:flex;gap:4px;align-items:center;margin-left:auto}.ly-zbtn{width:28px;height:26px;border:1px solid rgba(56,189,248,.3);background:rgba(56,189,248,.1);color:var(--accent);border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;font-family:inherit}.ly-zbtn:active{background:rgba(56,189,248,.3)}.ly-zbtn-fit{width:auto;padding:0 8px;font-size:10px;font-weight:700}.ly-zoom-pct{font-size:11px;color:var(--accent);font-weight:700;min-width:36px;text-align:center}
.ly-canvas-wrap{flex:1;overflow:auto;background:#161b28;position:relative}.ly-canvas{position:relative;margin:12px auto;border-radius:4px;background:#1d2235}
.ly-eq{position:absolute;border:2px solid;border-radius:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;cursor:pointer;overflow:hidden;user-select:none}.ly-eq .eq-no{font-weight:800;line-height:1.2;overflow:hidden;text-overflow:ellipsis;max-width:96%;white-space:nowrap;padding:0 2px}.ly-eq .eq-mk{opacity:.7;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:96%}.ly-eq .eq-rem{font-weight:700;padding:1px 3px;border-radius:2px;line-height:1.2;margin-top:1px;white-space:nowrap}.ly-eq .eq-rate{opacity:.85;line-height:1.1;white-space:nowrap}
.s-run{background:rgba(34,197,94,.12);border-color:#22c55e;color:#4ade80}.s-run .eq-rem{background:rgba(34,197,94,.2);color:#86efac}.s-stop{background:rgba(20,24,36,.9);border-color:#1e2535;color:#374151}.s-urg{background:rgba(234,179,8,.12);border-color:#ca8a04;color:#fbbf24;animation:urgP 1.5s infinite}.s-urg .eq-rem{background:rgba(234,179,8,.2);color:#fde68a}.s-none{background:rgba(15,19,30,.8);border-color:#151a27;color:#1f2937}
@keyframes urgP{0%,100%{box-shadow:0 0 4px rgba(234,179,8,.3)}50%{box-shadow:0 0 14px rgba(234,179,8,.7)}}
.ly-grid{display:grid;gap:8px;padding:12px}.ly-geq{border:2px solid;border-radius:10px;padding:10px 8px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:64px;cursor:pointer;text-align:center;font-weight:700}.ly-geq .eq-no{font-size:13px}.ly-geq .eq-mk{font-size:10px;margin-top:2px}.ly-geq .eq-rem{font-size:9px;margin-top:3px;padding:2px 6px;border-radius:4px}
.ly-popup{display:none;position:fixed;z-index:9000;background:#1a1d27;border:1px solid var(--border);border-radius:14px;padding:14px 16px;width:280px;max-width:90vw;box-shadow:0 8px 32px rgba(0,0,0,.7);bottom:16px;left:50%;transform:translateX(-50%)}.ly-popup.show{display:block}.lp-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.lp-title{font-size:14px;font-weight:800;color:var(--accent)}.lp-close{width:26px;height:26px;border:none;border-radius:50%;background:rgba(255,255,255,.08);color:var(--sub);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}.lp-row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(42,46,61,.5);font-size:12px}.lp-row:last-child{border:none}.lp-lb{color:var(--sub);flex-shrink:0;min-width:60px}.lp-vl{font-weight:600;text-align:right;word-break:break-all}.lp-run{color:var(--green)}.lp-stop{color:var(--red)}
@media(max-width:480px){.stats{grid-template-columns:repeat(3,1fr)}.conn-grid{grid-template-columns:1fr}}
.le-toolbar{display:flex;gap:6px;padding:8px 10px;background:#0a0d14;border-radius:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px}.le-group{display:flex;gap:4px;align-items:center;background:rgba(255,255,255,.05);border-radius:6px;padding:4px 8px}.le-group label{font-size:10px;color:var(--sub);white-space:nowrap}.le-group input[type=number],.le-group input[type=text]{width:52px;padding:3px 5px;border:1px solid var(--border);border-radius:4px;background:#1a1d27;color:var(--txt);font-size:11px;font-family:inherit;text-align:center}
.le-btn{padding:5px 10px;border:none;border-radius:6px;font-size:11px;font-weight:700;font-family:inherit;cursor:pointer;white-space:nowrap}.le-btn-fac{background:#f97316;color:#fff}.le-btn-eq{background:var(--accent);color:#0f172a}.le-btn-save{background:#22c55e;color:#fff}.le-btn-del{background:#ef4444;color:#fff;display:none}.le-btn-grid{background:rgba(255,255,255,.08);color:var(--sub);border:1px solid var(--border)}.le-btn-zoom{background:rgba(56,189,248,.1);color:var(--accent);border:1px solid rgba(56,189,248,.3);font-size:13px;width:30px;height:28px;display:flex;align-items:center;justify-content:center;padding:0}.le-zoom-info{font-size:11px;color:var(--accent);font-weight:700;min-width:42px;text-align:center}
.le-zone-sel{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}.le-zchip2{padding:4px 12px;border-radius:12px;border:1.5px solid var(--border);font-size:11px;font-weight:700;cursor:pointer;background:var(--card2);color:var(--sub)}.le-zchip2.active{background:var(--accent);color:#0f172a;border-color:var(--accent)}
.le-canvas-wrap2{overflow:auto;background:#0a0d14;border-radius:8px;min-height:300px;max-height:70vh;position:relative;border:1px solid var(--border)}.le-canvas2{position:relative;margin:0;background:#1a1f2e;border:none;transform-origin:0 0}.le-canvas2.grid-on{background-image:linear-gradient(rgba(56,189,248,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.06) 1px,transparent 1px)}
.le-eq-box{position:absolute;border:2px solid var(--accent);background:rgba(56,189,248,.1);border-radius:3px;cursor:move;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--accent);user-select:none;touch-action:none;overflow:hidden;min-width:20px;min-height:16px}.le-eq-box.sel{border-color:#f97316;background:rgba(249,115,22,.15);color:#f97316;z-index:10}.le-eq-box .b-no{font-size:11px;font-weight:800;white-space:nowrap;max-width:96%;overflow:hidden;text-overflow:ellipsis;padding:0 2px;line-height:1.2}.le-eq-box .b-info{font-size:8px;opacity:.7;white-space:nowrap;max-width:96%;overflow:hidden;text-overflow:ellipsis}.le-eq-box .b-rs{position:absolute;right:-4px;bottom:-4px;width:12px;height:12px;background:var(--accent);border-radius:50%;cursor:se-resize;z-index:11}.le-eq-box.sel .b-rs{background:#f97316}
.le-sel-bar{padding:5px 8px;background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.3);border-radius:6px;font-size:11px;color:#fb923c;display:none;margin-top:6px;flex-wrap:wrap;gap:8px;align-items:center}.le-sel-bar.show{display:flex}
.le-eq-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;max-height:80px;overflow-y:auto}.le-chip{padding:3px 8px;background:rgba(56,189,248,.08);border:1px solid var(--border);border-radius:10px;font-size:10px;font-weight:600;color:var(--accent);cursor:pointer}
.sr-loading{text-align:center;padding:20px;color:var(--accent);font-size:12px}

/* ========= 점검등록 모달 ========= */
.chk-modal{display:none;position:fixed;inset:0;z-index:11000;background:rgba(0,0,0,.75);padding:16px;overflow-y:auto;align-items:flex-start;justify-content:center}
.chk-modal.show{display:flex}
.chk-box{background:var(--card);border-radius:14px;width:100%;max-width:520px;margin:auto;border:1px solid var(--border);overflow:hidden}
.chk-hdr{padding:14px 16px;background:linear-gradient(135deg,#1e3a5f,#0f172a);display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border)}
.chk-hdr h3{font-size:15px;color:var(--accent);font-weight:800}
.chk-hdr .sub2{font-size:11px;color:var(--sub);margin-top:3px}
.chk-body{padding:14px}
/* ★★★ 당일 정지요약 영역 ★★★ */
.dsum-wrap{background:linear-gradient(180deg,#111827,#0f172a);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px}
.dsum-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:6px}
.dsum-title{font-size:14px;color:var(--accent);font-weight:800;display:flex;align-items:center;gap:5px}
.dsum-refresh{background:rgba(56,189,248,.1);border:1px solid rgba(56,189,248,.3);color:var(--accent);border-radius:5px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit}
.dsum-kpi{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:10px}
.dsum-k{background:rgba(255,255,255,.04);border-radius:7px;padding:8px 3px;text-align:center;border-left:3px solid}
.dsum-k .kl{font-size:11px;color:var(--sub);line-height:1.2;font-weight:600}
.dsum-k .kv{font-size:15px;font-weight:800;margin-top:3px;line-height:1.1}
.dsum-k.ok{border-left-color:var(--green)}.dsum-k.ok .kv{color:var(--green)}
.dsum-k.ng{border-left-color:var(--red)}.dsum-k.ng .kv{color:var(--red)}
.dsum-k.plan{border-left-color:#a78bfa}.dsum-k.plan .kv{color:#c4b5fd}
.dsum-k.cnt{border-left-color:var(--yellow)}.dsum-k.cnt .kv{color:var(--yellow)}
.dsum-k.rate{border-left-color:var(--accent)}.dsum-k.rate .kv{color:var(--accent)}
.dsum-tabs{display:flex;gap:4px;margin-bottom:8px}
.dsum-tab{flex:1;padding:7px 6px;background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:5px;font-size:12px;color:var(--sub);cursor:pointer;font-family:inherit;font-weight:700;text-align:center}
.dsum-tab.active{background:var(--accent);color:#0f172a;border-color:var(--accent)}
.dsum-body{background:rgba(0,0,0,.25);border-radius:7px;padding:8px 10px;min-height:60px}
/* TOP5 리스트 (구버전 호환) */
.dsum-top5{display:flex;flex-direction:column;gap:3px}
/* 개별 이벤트 한줄 표시 */
.dsum-ev{font-size:13px;padding:6px 10px;border-radius:5px;margin-bottom:3px;display:flex;align-items:center;justify-content:space-between;gap:8px;line-height:1.35}
.dsum-ev .ev-nm{flex:1;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsum-ev .ev-tm{font-family:ui-monospace,monospace;font-size:12px;color:#cbd5e1;min-width:92px;flex-shrink:0;font-weight:600}
.dsum-ev .ev-min{color:var(--yellow);font-weight:800;font-size:13px;flex-shrink:0;font-variant-numeric:tabular-nums}
.dsum-ev.ev-stop{background:rgba(239,68,68,.08);border-left:2px solid #ef4444}
.dsum-ev.ev-plan{background:rgba(167,139,250,.08);border-left:2px solid #a78bfa}
.dsum-row{display:flex;align-items:center;gap:6px;font-size:10px}
.dsum-row .rk{color:var(--sub);font-weight:700;min-width:14px;text-align:right}
.dsum-row .rn{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsum-row .rt{color:var(--yellow);font-weight:700;min-width:56px;text-align:right;font-variant-numeric:tabular-nums}
.dsum-row .rb{flex:1.2;height:7px;background:#1f2937;border-radius:3px;overflow:hidden;margin:0 4px;min-width:50px}
.dsum-row .rbf{height:100%;background:linear-gradient(90deg,#f59e0b,#ef4444);border-radius:3px}
/* 타임라인 */
.dsum-tl{position:relative;height:28px;background:#1f2937;border-radius:4px;overflow:hidden;margin-top:2px}
.dsum-tl-seg{position:absolute;top:0;bottom:0}
.dsum-tl-seg.sr{background:linear-gradient(180deg,#22c55e,#16a34a)}
.dsum-tl-seg.ss{background:linear-gradient(180deg,#ef4444,#b91c1c)}
.dsum-tl-seg.sp{background:linear-gradient(180deg,#a78bfa,#7c3aed)}
.dsum-tl-now{position:absolute;top:-2px;bottom:-2px;width:2px;background:#fbbf24;box-shadow:0 0 6px #fbbf24;z-index:5}
.dsum-tl-axis{display:flex;justify-content:space-between;margin-top:3px;font-size:9px;color:var(--sub);padding:0 1px}
.dsum-tl-legend{display:flex;gap:10px;margin-top:4px;font-size:9px;color:var(--sub);justify-content:flex-end}
.dsum-tl-lgi{display:flex;align-items:center;gap:3px}
.dsum-tl-lgd{width:10px;height:8px;border-radius:2px}
.dsum-empty{text-align:center;color:var(--sub);font-size:10px;padding:12px 0}
.dsum-loading{text-align:center;color:var(--accent);font-size:10px;padding:12px 0}

/* ★ 오늘의 생산실적 */
.prod-wrap{background:linear-gradient(180deg,#0f1a1a,#0f172a);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:12px}
.prod-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:6px}
.prod-title{font-size:14px;color:#4ade80;font-weight:800;display:flex;align-items:center;gap:5px}
.prod-body{background:rgba(0,0,0,.25);border-radius:7px;padding:8px 10px;min-height:50px}
.prod-row{display:grid;grid-template-columns:70px 1fr 56px 62px 72px;gap:5px;align-items:center;padding:6px 4px;font-size:12px;border-bottom:1px dashed rgba(71,85,105,.3)}
.prod-row:last-child{border-bottom:none}
.prod-row.cur{background:rgba(34,197,94,.06);border-left:3px solid var(--green);padding-left:6px;border-radius:3px}
.prod-head{display:grid;grid-template-columns:70px 1fr 56px 62px 72px;gap:5px;padding:4px;font-size:10px;color:var(--sub);font-weight:700;border-bottom:1px solid rgba(71,85,105,.4);margin-bottom:4px}
.prod-head .ph-c{text-align:center}
.prod-head .ph-r{text-align:right}
.prod-mold{font-weight:800;color:var(--accent);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prod-info{color:var(--txt);overflow:hidden;font-size:11.5px}
.prod-info .pi-item{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prod-info .pi-wo{font-size:10px;color:var(--sub);margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.prod-run{color:#fbbf24;font-weight:700;text-align:right;font-variant-numeric:tabular-nums;font-size:12px}
.prod-qty{color:var(--green);font-weight:800;text-align:right;font-variant-numeric:tabular-nums;font-size:13px}
.prod-qty .pq-prog{font-size:10px;color:var(--sub);font-weight:600;display:block;margin-top:1px}
/* 보정수량 입력 */
.prod-adj{position:relative}
.prod-adj input{width:100%;padding:5px 4px;border:1px solid rgba(56,189,248,.3);background:#0f1117;color:#fbbf24;font-size:13px;font-weight:800;font-family:ui-monospace,monospace;text-align:right;border-radius:4px;outline:none}
.prod-adj input:focus{border-color:var(--accent);background:#1a1d27;box-shadow:0 0 0 2px rgba(56,189,248,.2)}
.prod-adj input.diff-pos{color:#4ade80;border-color:rgba(34,197,94,.4)}
.prod-adj input.diff-neg{color:#fca5a5;border-color:rgba(239,68,68,.4)}
.prod-adj .pa-diff{font-size:9px;text-align:right;margin-top:1px;color:var(--sub);font-weight:700}
.prod-adj .pa-diff.p{color:#4ade80}
.prod-adj .pa-diff.n{color:#fca5a5}
.prod-foot{margin-top:6px;padding-top:6px;border-top:1px solid rgba(71,85,105,.4);display:flex;justify-content:space-between;align-items:center;font-size:11.5px;font-weight:700;flex-wrap:wrap;gap:4px}
.prod-foot .pf-lb{color:var(--sub)}
.prod-foot .pf-val{color:#4ade80;font-size:14px;font-weight:800}
.prod-foot .pf-adj{color:#fbbf24;font-size:13px;font-weight:800}
/* 보정 사유 입력 */
.prod-memo{margin-top:6px;display:flex;gap:4px;align-items:center;padding-top:6px;border-top:1px dashed rgba(71,85,105,.3)}
.prod-memo label{font-size:10px;color:var(--sub);font-weight:700;flex-shrink:0}
.prod-memo input{flex:1;padding:5px 8px;border:1px solid var(--border);background:#0f1117;color:var(--txt);font-size:11px;border-radius:4px;font-family:inherit}
.prod-memo input:focus{outline:none;border-color:var(--accent);background:#1a1d27}
.prod-empty{text-align:center;color:var(--sub);font-size:11px;padding:10px 0}

/* Step1: 큰 카드 4개 */
.chk-cards{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}
.chk-card{height:40px;border-radius:10px;border:2px solid var(--border);background:var(--card2);color:var(--txt);font-size:12px;font-weight:800;cursor:pointer;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:5px;font-family:inherit;transition:transform .12s;padding:0 8px}
.chk-card:active{transform:scale(.97)}
.chk-card .ic{font-size:14px;line-height:1}
.chk-card.c-dim{background:linear-gradient(135deg,#1e40af,#1e3a8a);border-color:#3b82f6}
.chk-card.c-mat{background:linear-gradient(135deg,#15803d,#14532d);border-color:#22c55e}
.chk-card.c-def{background:linear-gradient(135deg,#c2410c,#7c2d12);border-color:#f97316}
.chk-card.c-urg{background:linear-gradient(135deg,#b91c1c,#7f1d1d);border-color:#ef4444;animation:urgP2 2s infinite}
@keyframes urgP2{0%,100%{box-shadow:0 0 0 rgba(239,68,68,.4)}50%{box-shadow:0 0 20px rgba(239,68,68,.7)}}
/* Step2: 세부항목 입력 */
.chk-back-btn{background:rgba(255,255,255,.08);border:none;color:var(--sub);font-size:12px;padding:6px 12px;border-radius:6px;cursor:pointer;font-family:inherit;margin-bottom:10px;display:inline-flex;align-items:center;gap:4px}
.chk-cur-cat{display:inline-block;margin-left:8px;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:700}
.chk-items{margin-bottom:12px;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.chk-item{display:grid;grid-template-columns:90px 1fr 32px;align-items:stretch;border-bottom:1px solid var(--border);background:rgba(255,255,255,.02)}
.chk-item:last-child{border-bottom:none}
/* 치수 카테고리 전용 - 2열 메모 */
.chk-memos{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.chk-memo{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:8px;overflow:hidden;display:flex;flex-direction:column;position:relative}
.chk-memo .chk-mhdr{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:rgba(255,255,255,.04);border-bottom:1px solid var(--border)}
.chk-memo .chk-mhdr input{background:transparent;border:none;color:var(--txt);font-size:12px;font-weight:700;font-family:inherit;outline:none;flex:1;min-width:0;padding:2px 4px}
.chk-memo .chk-mhdr input:focus{background:rgba(56,189,248,.08);border-radius:4px}
.chk-memo textarea{width:100%;min-height:90px;padding:8px 10px;border:none;background:transparent;color:var(--txt);font-size:12px;font-family:inherit;resize:vertical;outline:none}
.chk-memo textarea:focus{background:rgba(56,189,248,.05)}
.chk-memo .chk-del-memo{border:none;background:transparent;color:var(--red);cursor:pointer;font-size:13px;padding:2px 6px;border-radius:4px}
.chk-memo .chk-del-memo:hover{background:rgba(239,68,68,.15)}
.chk-item .chk-ilabel{padding:10px 12px;font-size:13px;font-weight:700;color:var(--txt);background:rgba(255,255,255,.04);border-right:1px solid var(--border);display:flex;align-items:center;justify-content:flex-start}
.chk-item .chk-iin{padding:10px 12px;border:none;background:transparent;color:var(--txt);font-size:13px;font-family:inherit;width:100%;outline:none}
.chk-item .chk-iin:focus{background:rgba(56,189,248,.08)}
.chk-item .chk-del-row{border:none;background:transparent;color:var(--red);cursor:pointer;font-size:14px;width:100%;height:100%;border-left:1px solid var(--border)}
.chk-item .chk-del-row:hover{background:rgba(239,68,68,.12)}
.chk-add-btn{background:rgba(56,189,248,.1);border:1px dashed var(--accent);color:var(--accent);border-radius:8px;padding:8px;width:100%;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;margin:10px 0}
.chk-photo-area{margin-top:10px;padding:10px;background:rgba(0,0,0,.3);border-radius:8px;border:1px dashed var(--border)}
.chk-photo-label{font-size:11px;color:var(--sub);margin-bottom:6px;display:block}
.chk-photo-btn{display:inline-block;padding:8px 14px;background:var(--card2);border:1px solid var(--border);border-radius:6px;color:var(--txt);font-size:12px;cursor:pointer}
.chk-photo-preview{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.chk-ph-item{position:relative;width:70px;height:70px;border-radius:6px;overflow:hidden;border:1px solid var(--border)}
.chk-ph-item img{width:100%;height:100%;object-fit:cover}
.chk-ph-del{position:absolute;top:2px;right:2px;width:18px;height:18px;background:rgba(239,68,68,.9);border:none;color:#fff;border-radius:50%;font-size:10px;cursor:pointer;line-height:16px;padding:0}
.chk-ph-size{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.7);color:#fff;font-size:9px;text-align:center;padding:1px}
.chk-foot{padding:12px 14px;border-top:1px solid var(--border);display:flex;gap:8px;background:rgba(0,0,0,.2)}
.chk-foot .btn{flex:1;padding:12px;font-size:13px}
.chk-info{background:rgba(56,189,248,.08);border-radius:8px;padding:8px 10px;font-size:11px;color:var(--sub);margin-bottom:10px}
.chk-info b{color:var(--accent)}

/* 이력관리 */
.hi-filter{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.hi-filter .fld{display:flex;flex-direction:column;gap:3px}
.hi-filter label{font-size:11px;color:var(--sub);font-weight:600}
.hi-filter input,.hi-filter select{padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:#0f1117;color:var(--txt);font-size:12px;font-family:inherit}
.hi-btns{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.hi-btns .btn{flex:1;min-width:70px;padding:9px 10px;font-size:12px}
.hi-table{width:100%;border-collapse:collapse;font-size:11px;margin-top:4px}
.hi-table th{padding:7px 6px;color:var(--sub);border-bottom:2px solid var(--border);font-size:10px;text-align:left;white-space:nowrap;font-weight:600}
.hi-table td{padding:7px 6px;border-bottom:1px solid rgba(71,85,105,.25);vertical-align:top;font-size:11px}
.hi-table tr.sel{background:rgba(56,189,248,.1)}
.hi-cat-dim{color:#60a5fa}
.hi-cat-mat{color:#4ade80}
.hi-cat-def{color:#fb923c}
.hi-cat-urg{color:#f87171;font-weight:700}
.hi-det{font-size:10px;color:var(--sub);max-width:180px;white-space:normal;word-break:break-all}
.hi-empty{text-align:center;padding:20px;color:var(--sub);font-size:12px}
.hi-checkbox{width:16px;height:16px;cursor:pointer}

/* 설정 - 점검항목 관리 */
.ci-cat-tabs{display:flex;gap:4px;margin-bottom:10px;flex-wrap:wrap}
.ci-cat{padding:6px 12px;border-radius:16px;border:1.5px solid var(--border);background:var(--card2);color:var(--sub);font-size:11px;font-weight:700;cursor:pointer}
.ci-cat.active{background:var(--accent);color:#0f172a;border-color:var(--accent)}
.ci-list{margin-top:8px}
.ci-row{display:flex;gap:6px;align-items:center;background:rgba(255,255,255,.03);border-radius:6px;padding:6px 10px;margin-bottom:5px;font-size:12px}
.ci-rnum{color:var(--sub);min-width:20px}
.ci-rnm{flex:1;font-weight:600}
.ci-rtype{font-size:10px;color:var(--accent);background:rgba(56,189,248,.1);padding:2px 6px;border-radius:4px}
.ci-radd{display:flex;gap:4px;margin-top:8px;flex-wrap:wrap}
.ci-radd input,.ci-radd select{padding:7px 9px;border-radius:6px;border:1px solid var(--border);background:#0f1117;color:var(--txt);font-size:11px;font-family:inherit}
.ci-radd input{flex:1;min-width:90px}
</style>
</head>
<body>
<div class="hdr"><div><h1>🏭 MES 가동설비 모니터링</h1><div class="sub"><span id="dot" style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);margin-right:4px;vertical-align:middle"></span><span id="lastUpdate">-</span> │ <span id="countdown">30초 갱신</span></div></div></div>
<div class="tabs"><div class="tab active" data-tab="monitor" onclick="switchTab('monitor')">📊 모니터링</div><div class="tab" data-tab="settings" onclick="switchTab('settings')">📋 이력/설정</div></div>
<div class="panel active" id="panel-monitor">
  <div class="stats"><div class="st"><div class="st-label">전체</div><div class="st-val" id="sTotal">-</div></div><div class="st run"><div class="st-label">가동</div><div class="st-val" id="sRun">-</div></div><div class="st stop"><div class="st-label">비가동</div><div class="st-val" id="sStop">-</div></div><div class="st warn"><div class="st-label">⏰30분이내</div><div class="st-val" id="sSoon">-</div></div><div class="st ng"><div class="st-label">NG</div><div class="st-val" id="sNg">-</div></div></div>
  <div class="alert-box" id="alertBox"><h3>⏰ 측정 준비 필요 (잔여 30분 이내)</h3><div id="alertList"></div></div>
  <div class="filter-wrap" id="filterBar"></div>
  <div id="groupArea"><div style="text-align:center;padding:40px;color:var(--sub)">데이터 로딩 중...</div></div>
</div>

<!-- === 점검등록 모달 === -->
<div class="chk-modal" id="chkModal">
  <div class="chk-box">
    <div class="chk-hdr">
      <div><h3 id="chkTitle">설비 점검등록</h3><div class="sub2" id="chkSub">-</div></div>
      <button class="lp-close" onclick="closeChkModal()">✕</button>
    </div>
    <div class="chk-body">
      <!-- ★ 당일 정지요약 (항상 상단 고정) -->
      <div class="dsum-wrap" id="dsumWrap">
        <div class="dsum-hdr">
          <div class="dsum-title">📊 <span id="dsumTitle">당일 가동/정지 요약</span></div>
          <button class="dsum-refresh" onclick="loadDowntimeSummary()">🔄 새로고침</button>
        </div>
        <!-- KPI 4칸 -->
        <div class="dsum-kpi" id="dsumKpi">
          <div class="dsum-k ok"><div class="kl">가동</div><div class="kv" id="kpiRun">-</div></div>
          <div class="dsum-k ng"><div class="kl">비가동</div><div class="kv" id="kpiStop">-</div></div>
          <div class="dsum-k plan"><div class="kl">계획정지</div><div class="kv" id="kpiPlan">-</div></div>
          <div class="dsum-k cnt"><div class="kl">정지횟수</div><div class="kv" id="kpiCnt">-</div></div>
          <div class="dsum-k rate"><div class="kl">가동률</div><div class="kv" id="kpiRate">-</div></div>
        </div>
        <!-- 탭 -->
        <div class="dsum-tabs">
          <div class="dsum-tab active" id="tabTop5" onclick="dsumSwitch('top5')">📋 정지이력</div>
          <div class="dsum-tab" id="tabTL" onclick="dsumSwitch('tl')">⏱ 24시간 타임라인</div>
        </div>
        <!-- 바디 -->
        <div class="dsum-body" id="dsumBody">
          <div class="dsum-loading">⏳ 조회중...</div>
        </div>
      </div>

      <!-- ★ 오늘의 생산실적 (설비별 WO/금형/품번) -->
      <div class="prod-wrap" id="prodWrap">
        <div class="prod-hdr">
          <div class="prod-title">🏭 <span id="prodTitle">오늘의 생산실적</span></div>
          <button class="dsum-refresh" onclick="loadProductionToday()">🔄</button>
        </div>
        <div class="prod-body" id="prodBody">
          <div class="dsum-loading">⏳ 조회중...</div>
        </div>
      </div>

      <!-- Step 1: 카테고리 카드 선택 -->
      <div id="chkStep1">
        <div class="chk-info">점검할 <b>카테고리</b>를 선택하세요</div>
        <div class="chk-cards" id="chkCards"></div>
      </div>
      <!-- Step 2: 세부 항목 입력 -->
      <div id="chkStep2" style="display:none">
        <button class="chk-back-btn" onclick="chkBackToCards()">◀ 카테고리 다시선택</button>
        <span class="chk-cur-cat" id="chkCurCat"></span>
        <div id="chkContent"></div>
      </div>
    </div>
    <div class="chk-foot" id="chkFoot" style="display:none">
      <button class="btn" style="background:#475569;color:#fff" onclick="closeChkModal()">취소</button>
      <button class="btn btn-green" onclick="submitCheck()">💾 저장·알림</button>
    </div>
  </div>
</div>

<div class="panel" id="panel-settings">
  <!-- 이력 관리 -->
  <div class="set-section open" onclick="toggleSet(event,this)"><div class="set-hdr"><span class="ico">📊</span><span class="ttl">이력 관리</span><span class="arrow">›</span></div><div class="set-body"><div class="set-inner">
    <div class="hi-filter">
      <div class="fld"><label>시작일</label><input type="date" id="hiStart"></div>
      <div class="fld"><label>종료일</label><input type="date" id="hiEnd"></div>
      <div class="fld"><label>카테고리</label><select id="hiCat"><option value="">전체</option><option value="dim">📏 치수</option><option value="mat">🔩 소재</option><option value="def">⚠️ 불량</option><option value="urg">🚨 긴급</option></select></div>
      <div class="fld"><label>설비코드(선택)</label><input type="text" id="hiMachine" placeholder="예: 001"></div>
    </div>
    <div class="hi-btns">
      <button class="btn btn-accent btn-sm" onclick="hiSearch()">🔍 조회</button>
      <button class="btn btn-green btn-sm" onclick="hiExportCsv()">📥 엑셀 다운로드</button>
      <button class="btn btn-sm" style="background:#ef4444;color:#fff" onclick="hiDeleteSelected()">🗑 선택삭제</button>
    </div>
    <div id="hiResult"><div class="hi-empty">조회 버튼을 눌러주세요</div></div>
  </div></div></div>
  <div class="set-section open" onclick="toggleSet(event,this)"><div class="set-hdr"><span class="ico">🔔</span><span class="ttl">ntfy 알림</span><span class="arrow">›</span></div><div class="set-body"><div class="set-inner"><p style="font-size:11px;color:var(--sub);margin-bottom:8px;background:rgba(56,189,248,.08);padding:8px;border-radius:8px">💡 점검 제출 시 조건에 해당하면 ntfy 방으로 자동 발송됩니다.<br>카테고리별 방 구분 가능 (예: tj-press-urg / tj-press-qc)</p><div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:6px">📋 등록된 규칙</div><div class="rule-list" id="ntfyRules"></div><div class="rule-add"><select id="ntfyCond"><option value="30">30분이내</option><option value="60">60분이내</option><option value="15">15분이내</option><option value="chk_dim">점검:치수</option><option value="chk_mat">점검:소재</option><option value="chk_def">점검:불량</option><option value="chk_urg">점검:긴급</option><option value="chk_all">점검:전체</option></select><input type="text" id="ntfyRoom" placeholder="방이름 (예: tj-press)"><button class="btn btn-accent btn-sm" onclick="addNtfyRule()">+</button></div><div style="display:flex;gap:8px;margin-top:12px"><input type="text" id="ntfyTestMsg" placeholder="ntfy 테스트" style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--border);background:#0f1117;color:var(--txt);font-size:12px;font-family:inherit"><button class="btn btn-orange btn-sm" onclick="testNtfy()">🔔 테스트</button></div></div></div></div>

  <div class="set-section open" onclick="toggleSet(event,this)"><div class="set-hdr"><span class="ico">✈️</span><span class="ttl">텔레그램 알림</span><span class="arrow">›</span></div><div class="set-body"><div class="set-inner"><div class="form-row"><label>봇토큰</label><input type="text" id="tgToken" readonly placeholder="서버저장"></div><div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:6px;margin-top:8px">📋 등록된 수신자</div><div class="rule-list" id="tgRules"></div><div class="rule-add"><select id="tgCond"><option value="30">30분이내</option><option value="60">60분이내</option><option value="15">15분이내</option><option value="chk_dim">점검:치수</option><option value="chk_mat">점검:소재</option><option value="chk_def">점검:불량</option><option value="chk_urg">점검:긴급</option><option value="chk_all">점검:전체</option></select><input type="text" id="tgChatId" placeholder="Chat ID"><button class="btn btn-accent btn-sm" onclick="addTgRule()">+</button></div><button class="btn btn-orange btn-sm" onclick="testTelegram()" style="margin-top:12px">✈️ 테스트</button></div></div></div>

  <div class="set-section" onclick="toggleSet(event,this)"><div class="set-hdr"><span class="ico">💬</span><span class="ttl">디스코드 알림</span><span class="arrow">›</span></div><div class="set-body"><div class="set-inner"><div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:6px">📋 등록된 Webhook</div><div class="rule-list" id="dcRules"></div><div class="rule-add"><select id="dcCond"><option value="30">30분이내</option><option value="60">60분이내</option><option value="15">15분이내</option><option value="chk_dim">점검:치수</option><option value="chk_mat">점검:소재</option><option value="chk_def">점검:불량</option><option value="chk_urg">점검:긴급</option><option value="chk_all">점검:전체</option></select><input type="text" id="dcHook" placeholder="Webhook URL"><button class="btn btn-accent btn-sm" onclick="addDcRule()">+</button></div><button class="btn btn-orange btn-sm" onclick="testDiscord()" style="margin-top:12px">💬 테스트</button></div></div></div>

  <!-- 점검항목 관리 -->
  <div class="set-section open" onclick="toggleSet(event,this)"><div class="set-hdr"><span class="ico">📝</span><span class="ttl">점검항목 관리</span><span class="arrow">›</span></div><div class="set-body"><div class="set-inner">
    <p style="font-size:11px;color:var(--sub);margin-bottom:8px;background:rgba(56,189,248,.08);padding:8px;border-radius:8px">💡 설비 행 클릭 시 나타나는 점검등록 팝업의 카테고리별 기본 항목을 관리합니다.</p>
    <div class="ci-cat-tabs" id="ciCatTabs"></div>
    <div class="ci-list" id="ciList"></div>
    <div class="ci-radd">
      <input type="text" id="ciNewName" placeholder="항목명 (예: 홀직경)">
      <select id="ciNewType"><option value="text">텍스트</option><option value="number">숫자</option></select>
      <button class="btn btn-accent btn-sm" onclick="addChkItem()">+</button>
    </div>
    <button class="btn btn-green btn-sm btn-block" onclick="resetChkItems()" style="margin-top:8px;background:#475569;color:#fff">🔄 기본값 복원</button>
  </div></div></div>

  <div class="set-section" onclick="toggleSet(event,this)"><div class="set-hdr"><span class="ico">🗄️</span><span class="ttl">Supabase 설정</span><span class="arrow">›</span></div><div class="set-body"><div class="set-inner"><div class="form-row"><label>URL</label><input type="text" id="sbUrl" readonly></div><div class="form-row"><label>Key</label><input type="text" id="sbKey" readonly></div></div></div></div>
  <button class="btn btn-accent btn-block" onclick="saveAllSettings()" style="margin-top:8px;padding:14px">☁️ 서버에 설정 저장</button>
  <div class="set-section open" style="margin-top:12px"><div class="set-hdr"><span class="ico">📡</span><span class="ttl">연결 상태</span></div><div class="set-body" style="max-height:2000px"><div class="set-inner"><div class="conn-grid" id="connGrid"></div><button class="btn btn-accent btn-sm" onclick="checkConnections()" style="margin-top:10px">🔄</button></div></div></div>
</div>
<div class="toast" id="toast"></div>

<script>
var API_BASE='';
// ★★★ MES DB 직접조회 API 엔드포인트 (실제 API URL로 변경 필요) ★★★
var MES_API_BASE='/api/mes';  // 예: 'http://10.10.1.100/api/mes' 또는 '/api/mes'

var SB_URL='https://omngtyewdaqpphnzeate.supabase.co',SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tbmd0eWV3ZGFxcHBobnplYXRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODk4ODksImV4cCI6MjA5MDQ2NTg4OX0.Zxur3t02JHtOcXforCMSwO3i2mMaf5sViE0tXXUC0-s',SETTINGS_TABLE='mes_settings';
var timer=30,curFilter='ALL',cachedData=null;
var settings={ntfy:[],telegram:{token:'',rules:[]},discord:[],lastAlerted:{},lyMapping:[]};
var _DEFAULT_ZONES=[{id:'C',name:'C동',type:'map',equip:[{no:'39',mk:'국일',t:250,x:138,y:1327,w:87,h:68},{no:'02',mk:'심팩',t:200,x:139,y:1172,w:84,h:68},{no:'01',mk:'쌍용',t:200,x:140,y:999,w:84,h:67},{no:'29',mk:'국일',t:200,x:154,y:820,w:69,h:61},{no:'28',mk:'국일',t:250,x:377,y:545,w:74,h:68},{no:'34',mk:'심팩',t:250,x:146,y:435,w:76,h:54},{no:'38',mk:'국일',t:250,x:507,y:376,w:80,h:66},{no:'35',mk:'심팩',t:250,x:147,y:237,w:75,h:57},{no:'36',mk:'심팩',t:300,x:0,y:8,w:77,h:108},{no:'43',mk:'HIM',t:800,x:398,y:0,w:159,h:129}]},{id:'B',name:'B동',type:'map',equip:[{no:'45',mk:'심팩',t:300,x:205,y:1664,w:74,h:57},{no:'31',mk:'심팩',t:150,x:399,y:1656,w:77,h:56},{no:'41',mk:'국일',t:200,x:566,y:1653,w:79,h:59},{no:'47',mk:'심팩',t:300,x:200,y:1377,w:74,h:58},{no:'04',mk:'심팩',t:150,x:360,y:1228,w:79,h:53},{no:'37',mk:'국일',t:200,x:503,y:1227,w:75,h:52},{no:'03',mk:'심팩',t:150,x:543,y:1004,w:83,h:65},{no:'40',mk:'심팩',t:110,x:417,y:1004,w:72,h:65},{no:'46',mk:'심팩',t:300,x:232,y:1012,w:84,h:56},{no:'48',mk:'심팩',t:300,x:235,y:740,w:74,h:58},{no:'05',mk:'심팩',t:110,x:461,y:561,w:75,h:60},{no:'06',mk:'심팩',t:110,x:349,y:560,w:80,h:59},{no:'30',mk:'국일',t:160,x:581,y:560,w:73,h:59},{no:'32',mk:'심팩',t:200,x:397,y:346,w:77,h:49},{no:'42',mk:'AIDA',t:200,x:540,y:352,w:78,h:49},{no:'49',mk:'심팩',t:300,x:237,y:254,w:68,h:104},{no:'17',mk:'심팩',t:80,x:0,y:158,w:55,h:39},{no:'11',mk:'심팩',t:80,x:476,y:135,w:55,h:38},{no:'10',mk:'심팩',t:80,x:579,y:135,w:57,h:41},{no:'13',mk:'심팩',t:80,x:476,y:77,w:54,h:38},{no:'09',mk:'심팩',t:80,x:579,y:79,w:56,h:38},{no:'07',mk:'심팩',t:80,x:475,y:18,w:54,h:38},{no:'08',mk:'심팩',t:80,x:579,y:20,w:55,h:39},{no:'12',mk:'심팩',t:80,x:354,y:0,w:50,h:45}]}];
var ZONES=(function(){var s=localStorage.getItem('ZONES');var z=null;if(s){try{z=JSON.parse(s)}catch(e){z=null}}if(!z||!z.length)z=_DEFAULT_ZONES;z=z.filter(function(x){return x&&x.id!=='F'&&x.id!=='W'});z.forEach(function(x){if(!x.scale)x.scale=20});localStorage.setItem('ZONES',JSON.stringify(z));return z})();

// ========= 점검등록 설정 (카테고리별 항목) =========
var CHK_CATS=[
  {id:'dim',name:'치수',icon:'📏',color:'#38bdf8'},
  {id:'mat',name:'소재',icon:'🔩',color:'#22c55e'},
  {id:'def',name:'불량',icon:'⚠️',color:'#f97316'},
  {id:'urg',name:'긴급',icon:'🚨',color:'#ef4444'}
];
var DEFAULT_CHK_ITEMS={
  dim:[{name:'측정부위1',type:'text'},{name:'측정부위2',type:'text'}],
  mat:[{name:'중량',type:'text'},{name:'찍힘',type:'text'},{name:'기스',type:'text'},{name:'변형',type:'text'},{name:'발청',type:'text'},{name:'기타',type:'text'}],
  def:[{name:'불량항목1',type:'text'},{name:'불량항목2',type:'text'}],
  urg:[{name:'안전',type:'text'},{name:'소방',type:'text'},{name:'기타',type:'text'}]
};
var CHK_ITEMS_LS='MES_CHK_ITEMS';
function getChkItems(){try{var v=localStorage.getItem(CHK_ITEMS_LS);if(v){var o=JSON.parse(v);if(o&&(o.dim||o.mat||o.def||o.urg))return o}}catch(e){}return JSON.parse(JSON.stringify(DEFAULT_CHK_ITEMS))}
function saveChkItems(o){localStorage.setItem(CHK_ITEMS_LS,JSON.stringify(o));_saveRulesToServer('mes_chk_items',[o])}

// ========= 점검등록 모달 상태 =========
var chkState={machine:null,category:'dim',rows:[],photos:[],activeCatIdx:0};
var ciState={activeCat:'dim'};
var dsumState={tab:'top5',data:null,loading:false};
var prodState={data:null,loading:false};

var sbH={'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Content-Type':'application/json'};
async function sbGet(t,q){var r=await fetch(SB_URL+'/rest/v1/'+t+'?'+(q||''),{headers:sbH});return r.ok?r.json():null}
async function sbPost(t,d){return fetch(SB_URL+'/rest/v1/'+t,{method:'POST',headers:Object.assign({},sbH,{'Prefer':'return=minimal'}),body:JSON.stringify(d)})}
async function sbDelete(t,q){return fetch(SB_URL+'/rest/v1/'+t+'?'+q,{method:'DELETE',headers:Object.assign({},sbH,{'Prefer':'return=minimal'})})}

var toastT;function showToast(m,ms){var t=document.getElementById('toast');t.textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('show')},ms||2500)}
function fmt(n){return n!=null?Number(n).toLocaleString():'-'}
function fmtKg(g){return g>0?(g/1000).toFixed(1):'-'}
function fmtMinutes(min){if(min==null||isNaN(min))return'-';min=Math.round(min);if(min<60)return min+'분';var h=Math.floor(min/60),m=min%60;return h+'h'+(m>0?String(m).padStart(2,'0')+'m':'')}
function remStr(min){if(!min||min<=0)return{t:'-',c:''};var h=Math.floor(min/60),m=Math.round(min%60);var t=h>0?(h+'h'+String(m).padStart(2,'0')+'m'):(m+'m');if(min<=30)return{t:'⏰'+t,c:'rem-urg'};if(min<=60)return{t:t,c:'rem-soon'};return{t:t,c:'rem-ok'}}
function inspH(v){if(v==='O')return'<span class="io">O</span>';if(v==='N')return'<span class="in">N</span>';return'<span class="ix">-</span>'}
function toggleSet(e,el){if(e.target.closest('.set-body'))return;el.classList.toggle('open')}
document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('.set-body').forEach(function(b){b.addEventListener('click',function(e){e.stopPropagation()})})});
function maskStr(s){if(!s||s.length<10)return'****';return s.slice(0,8)+'••••'+s.slice(-4)}
function switchTab(name){document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.dataset.tab===name)});document.querySelectorAll('.panel').forEach(function(p){p.classList.toggle('active',p.id==='panel-'+name)});if(name==='settings'){renderNtfyRules();renderTgRules();renderDcRules();renderCiTabs();renderCiList();hiInit()}}

async function loadMonitor(){var data=await sbGet('machine_status','select=*&order=machine_code.asc');if(!data)return;cachedData=data;renderMonitor(data);checkAlerts(data);timer=30}
var _stopMap={'Z001':'작업대기','M001':'금형교체','M002':'금형예열','M003':'금형세척','M004':'금형점검','M005':'금형대기','M006':'금형수리','M007':'금형시험','M008':'금형조정','A001':'자재대기','A002':'자재교체','A003':'자재불량','A004':'모델교체','A005':'작업지시대기','E001':'설비고장','E002':'설비점검','E003':'설비수리','Q001':'품질이상','Q002':'검사대기','R001':'휴식','R002':'식사','P001':'전원이상','P002':'기타'};
function stopName(code){if(!code||code==='N')return'가동';var sub=code.indexOf('-')>=0?code.split('-')[1]:'';return _stopMap[sub]||sub||'비가동'}

function renderMonitor(data){
  var total=data.length,running=data.filter(function(d){return d.machine_status==='N'}).length,stopped=total-running;
  var soon=data.filter(function(d){return d.machine_status==='N'&&d.remaining_minutes>0&&d.remaining_minutes<=30});
  var totalNg=data.reduce(function(s,d){return s+(d.ng_qty||0)},0);
  document.getElementById('sTotal').textContent=total;document.getElementById('sRun').textContent=running;document.getElementById('sStop').textContent=stopped;document.getElementById('sSoon').textContent=soon.length;document.getElementById('sNg').textContent=fmt(totalNg);
  if(data[0]&&data[0].updated_at){var dt=new Date(data[0].updated_at);document.getElementById('lastUpdate').textContent=dt.toLocaleString('ko-KR');document.getElementById('dot').style.background=(Date.now()-dt.getTime())/60000>10?'var(--red)':'var(--green)'}
  var ab=document.getElementById('alertBox'),al=document.getElementById('alertList');
  if(soon.length){ab.classList.add('show');al.innerHTML=soon.map(function(d){var rm=remStr(d.remaining_minutes);return'<div class="alert-item">🔔 ['+d.machine_code+'] '+d.machine_name+' │ '+(d.customer||'')+' → <b>'+rm.t+'</b></div>'}).join('')}else ab.classList.remove('show');
  var groups={};data.forEach(function(d){var c=d.customer||'미지정';if(!groups[c])groups[c]=[];groups[c].push(d)});
  var custs=Object.keys(groups).sort();
  var fb=document.getElementById('filterBar');fb.innerHTML='';
  (function(){var b=document.createElement('div');b.className='fbtn'+(curFilter==='ALL'?' active':'');b.textContent='전체('+total+')';b.onclick=function(){setFilter('ALL')};fb.appendChild(b)})();
  custs.forEach(function(c2){var b=document.createElement('div');b.className='fbtn'+(curFilter===c2?' active':'');b.textContent=c2+'('+groups[c2].length+')';(function(cc){b.onclick=function(){setFilter(cc)}})(c2);fb.appendChild(b)});
  var show=curFilter==='ALL'?custs:[curFilter];
  var ga=document.getElementById('groupArea');
  ga.innerHTML='';
  show.forEach(function(cust){
    var rows=groups[cust];if(!rows)return;
    var gRun=rows.filter(function(d){return d.machine_status==='N'}).length;
    var gA=rows.reduce(function(s,d){return s+(d.actual_qty||0)},0);
    var gNg=rows.reduce(function(s,d){return s+(d.ng_qty||0)},0);
    var cg=document.createElement('div');cg.className='cg';
    var hdr='<div class="cg-hdr"><h2>🏢 '+cust+'</h2><div class="cg-stats"><span>'+rows.length+'대</span><span class="gr">가동'+gRun+'</span><span class="rd">비가동'+(rows.length-gRun)+'</span><span>생산'+fmt(gA)+'</span>';
    if(gNg>0)hdr+='<span style="color:var(--orange)">NG'+fmt(gNg)+'</span>';
    hdr+='</div></div>';
    var tbl='<div style="overflow-x:auto"><table class="mt"><thead><tr><th class="c-eq">설비</th><th class="c-nm">설비명</th><th class="c-st">상태</th><th class="c-mold">금형</th><th class="c-item">품번</th><th class="c-pname">품명</th><th class="c-num">가능</th><th class="c-num">실적</th><th class="c-prog">달성</th><th class="c-num">잔량</th><th class="c-rem">잔여</th><th class="c-lot">로트</th><th class="c-coil">코일kg</th><th class="c-unit">소요g</th><th class="c-ct">CT</th><th class="c-ng">NG</th><th class="c-insp">검사</th><th class="c-wk">작업자</th></tr></thead><tbody id="tb_'+cust.replace(/[^\w]/g,'_')+'"></tbody></table></div>';
    cg.innerHTML=hdr+tbl;
    ga.appendChild(cg);
    var tb=cg.querySelector('tbody');
    rows.forEach(function(d){
      var isR=d.machine_status==='N';
      var st=isR?'<span class="run-dot">● 가동</span>':'<span class="stop-dot">■ '+stopName(d.machine_status)+'</span>';
      var rate=d.target_qty>0?d.actual_qty/d.target_qty*100:0;
      var fc=rate>=80?'hi':rate>=50?'md':'lo';
      var prog=d.target_qty>0?'<div class="prog"><div class="prog-f '+fc+'" style="width:'+Math.min(rate,100)+'%"></div></div>'+rate.toFixed(0)+'%':'-';
      var rm=remStr(d.remaining_minutes);
      var tr=document.createElement('tr');
      if(!isR)tr.className='dim';
      tr.innerHTML='<td class="c-eq">'+d.machine_code+'</td><td class="c-nm">'+(d.machine_name||'-')+'</td><td class="c-st">'+st+'</td><td class="c-mold">'+(d.current_mold||'-')+'</td><td class="c-item">'+(d.current_item_code||'-')+'</td><td class="c-pname">'+(d.item_name||'-')+'</td><td class="c-num">'+fmt(d.target_qty)+'</td><td class="c-num">'+fmt(d.actual_qty)+'</td><td class="c-prog">'+prog+'</td><td class="c-num">'+fmt(d.remaining_qty)+'</td><td class="c-rem"><span class="'+rm.c+'">'+rm.t+'</span></td><td class="c-lot" style="color:var(--sub)">'+(d.lot_no||'-')+'</td><td class="c-coil" style="color:var(--accent)">'+(d.coil_weight>0?d.coil_weight.toFixed(0):'-')+'</td><td class="c-unit" style="color:var(--sub)">'+(d.unit_per_qty>0?d.unit_per_qty.toFixed(1):'-')+'</td><td class="c-ct">'+(d.actual_ct>0?d.actual_ct.toFixed(1):'-')+'/'+(d.target_ct>0?d.target_ct.toFixed(1):'-')+'</td><td class="c-ng">'+(d.ng_qty>0?'<span style="color:var(--red);font-weight:600">'+d.ng_qty+'</span>':'0')+'</td><td class="c-insp">'+inspH(d.inspect_top)+inspH(d.inspect_mid)+inspH(d.inspect_bottom)+'</td><td class="c-wk">'+(d.worker||'-')+'</td>';
      (function(row){tr.onclick=function(){openChkModal(row)}})(d);
      tb.appendChild(tr);
    });
  });
}
function setFilter(c){curFilter=c;if(cachedData)renderMonitor(cachedData)}

// ========= 점검등록 모달 =========
function openChkModal(machine){
  chkState.machine=machine;
  chkState.category=null;
  chkState.rows=[];
  chkState.photos=[];
  chkState.editId=null;
  document.getElementById('chkTitle').textContent='📋 점검등록 ['+machine.machine_code+'] '+(machine.machine_name||'');
  document.getElementById('chkSub').textContent=(machine.customer||'-')+' │ '+(machine.current_item_code||'-')+' │ '+(machine.item_name||'-');
  // Step1 표시
  document.getElementById('chkStep1').style.display='';
  document.getElementById('chkStep2').style.display='none';
  document.getElementById('chkFoot').style.display='none';
  renderChkCards();
  document.getElementById('chkModal').classList.add('show');
  // ★ 당일 정지요약 로드
  dsumState.tab='top5';
  document.getElementById('tabTop5').classList.add('active');
  document.getElementById('tabTL').classList.remove('active');
  loadDowntimeSummary();
  loadProductionToday();
}
function closeChkModal(){document.getElementById('chkModal').classList.remove('show')}

// ★★★ 당일 정지시간 요약 ★★★
// 업무일 기준 날짜 (오전 8시 이전이면 전일로 처리)
var WORK_DAY_START_HOUR=8;
function getWorkDate(){
  var now=new Date();
  if(now.getHours()<WORK_DAY_START_HOUR){
    now.setDate(now.getDate()-1);
  }
  return now;
}
function fmtYmd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}

async function loadDowntimeSummary(){
  var m=chkState.machine;if(!m)return;
  var workDate=getWorkDate();
  var ymd=fmtYmd(workDate);
  var titleBase='업무일 요약 ('+(workDate.getMonth()+1)+'/'+workDate.getDate()+' 08시~)';
  document.getElementById('dsumTitle').textContent=titleBase;
  var body=document.getElementById('dsumBody');
  body.innerHTML='<div class="dsum-loading">⏳ Supabase 조회중...</div>';
  dsumState.loading=true;
  try{
    // Supabase daily_downtime 테이블 조회 (Python 워커가 5분주기로 업로드)
    var q='select=*&ymd=eq.'+ymd+'&machine_code=eq.'+encodeURIComponent(m.machine_code)+'&limit=1';
    var data=await sbGet('daily_downtime',q);
    if(data&&data.length){
      var d=data[0];
      // Supabase 레코드 → 렌더링용 포맷 변환
      var summary={
        runMin:d.run_min||0,
        stopMin:d.stop_min||0,
        plannedMin:d.planned_min||0,
        stopCount:d.stop_count||0,
        plannedCount:d.planned_count||0,
        totalMin:d.total_min||0,
        rate:d.rate||0,
        top5:d.top5||[],
        stopEvents:d.stop_events||[],
        plannedList:d.planned_list||[],
        plannedEvents:d.planned_events||[],
        timeline:d.timeline||[],
        updatedAt:d.updated_at
      };
      dsumState.data=summary;
      renderDowntimeSummary(summary);
      // 갱신시각 표시
      if(summary.updatedAt){
        var dt=new Date(summary.updatedAt);
        var hm=String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');
        document.getElementById('dsumTitle').textContent=titleBase+' · 갱신 '+hm;
      }
    }else{
      body.innerHTML='<div class="dsum-empty">📭 업무일 집계 데이터 없음<br><span style="font-size:9px">Python 워커 동작 확인 · 5분주기 집계</span></div>';
    }
  }catch(e){
    console.log('비가동요약 조회실패:',e);
    body.innerHTML='<div class="dsum-empty">📡 Supabase 조회 실패<br><span style="font-size:9px;color:#ef4444">'+(e.message||e)+'</span></div>';
  }finally{
    dsumState.loading=false;
  }
}

function renderDowntimeSummary(data){
  // KPI 5칸
  document.getElementById('kpiRun').textContent=fmtMinutes(data.runMin);
  document.getElementById('kpiStop').textContent=fmtMinutes(data.stopMin);
  document.getElementById('kpiPlan').textContent=fmtMinutes(data.plannedMin);
  document.getElementById('kpiCnt').textContent=(data.stopCount||0)+'회';
  document.getElementById('kpiRate').textContent=(data.rate||0).toFixed(1)+'%';
  // 현재 탭 렌더
  if(dsumState.tab==='top5')renderEvents(data);
  else renderTimeline(data.timeline||[]);
}

function renderEvents(data){
  var b=document.getElementById('dsumBody');
  // 개별 이벤트 리스트 우선 사용, 없으면 기존 top5/plannedList 집계에서 생성
  var stopEvents=data.stopEvents||[];
  var plannedEvents=data.plannedEvents||[];
  // 구버전 호환: stop_events가 없으면 집계된 top5 형식 표시
  var useLegacy=(!stopEvents.length&&!plannedEvents.length)&&((data.top5||[]).length||(data.plannedList||[]).length);
  if(!stopEvents.length&&!plannedEvents.length&&!useLegacy){
    b.innerHTML='<div class="dsum-empty">✅ 당일 정지 이력 없음</div>';return;
  }
  // 항목별 합산 함수 (사유이름 기준)
  function groupByName(events){
    var map={};
    events.forEach(function(ev){
      var k=ev.name||'기타';
      if(!map[k])map[k]={name:k,min:0,count:0,times:[]};
      map[k].min+=(+ev.min||0);
      map[k].count++;
      if(ev.start&&ev.end)map[k].times.push(ev.start+'-'+ev.end+'('+fmtMinutes(ev.min)+')');
    });
    // 시간 많은 순으로 정렬
    var arr=Object.keys(map).map(function(k){return map[k]});
    arr.sort(function(a,b){return b.min-a.min});
    return arr;
  }
  var html='';
  if(useLegacy){
    // 구버전 데이터 (이미 집계된 형식)
    var list=data.top5||[],plannedList=data.plannedList||[];
    if(list.length){
      html+='<div style="font-size:12px;color:#fca5a5;font-weight:800;margin-bottom:5px">🔴 실비가동</div>';
      list.forEach(function(it){
        html+='<div class="dsum-ev ev-stop"><span class="ev-nm">'+it.name+'</span><span class="ev-min">'+fmtMinutes(it.min)+'</span></div>';
      });
    }
    if(plannedList.length){
      html+='<div style="font-size:12px;color:#c4b5fd;font-weight:800;margin:10px 0 5px 0;padding-top:8px;border-top:1px dashed rgba(167,139,250,.3)">🟣 계획정지</div>';
      plannedList.forEach(function(it){
        html+='<div class="dsum-ev ev-plan"><span class="ev-nm">'+it.name+'</span><span class="ev-min">'+fmtMinutes(it.min)+'</span></div>';
      });
    }
    b.innerHTML=html;
    return;
  }
  // 항목별로 합산
  var stopGrouped=groupByName(stopEvents);
  var planGrouped=groupByName(plannedEvents);
  var stopTot=0,planTot=0;
  stopEvents.forEach(function(e){stopTot+=(+e.min||0)});
  plannedEvents.forEach(function(e){planTot+=(+e.min||0)});
  if(stopGrouped.length){
    html+='<div style="font-size:12px;color:#fca5a5;font-weight:800;margin-bottom:5px">🔴 실비가동 ('+stopGrouped.length+'항목·총'+fmtMinutes(stopTot)+')</div>';
    stopGrouped.forEach(function(it){
      var tip=it.times.join(' / ');
      var cnt=it.count>1?' <span style="color:#94a3b8;font-size:11px">×'+it.count+'</span>':'';
      html+='<div class="dsum-ev ev-stop" title="'+tip+'"><span class="ev-nm">'+it.name+cnt+'</span><span class="ev-min">'+fmtMinutes(it.min)+'</span></div>';
    });
  }else{
    html+='<div style="font-size:12px;color:var(--green);padding:6px 0;font-weight:700">✅ 실비가동 없음</div>';
  }
  if(planGrouped.length){
    html+='<div style="font-size:12px;color:#c4b5fd;font-weight:800;margin:10px 0 5px 0;padding-top:8px;border-top:1px dashed rgba(167,139,250,.3)">🟣 계획정지 ('+planGrouped.length+'항목·총'+fmtMinutes(planTot)+')</div>';
    planGrouped.forEach(function(it){
      var tip=it.times.join(' / ');
      var cnt=it.count>1?' <span style="color:#94a3b8;font-size:11px">×'+it.count+'</span>':'';
      html+='<div class="dsum-ev ev-plan" title="'+tip+'"><span class="ev-nm">'+it.name+cnt+'</span><span class="ev-min">'+fmtMinutes(it.min)+'</span></div>';
    });
  }
  b.innerHTML=html;
}

function renderTimeline(list){
  var b=document.getElementById('dsumBody');
  if(!list.length){b.innerHTML='<div class="dsum-empty">이력 없음</div>';return}
  var now=new Date();
  // 업무일 08:00 ~ 익일 08:00 을 타임라인의 0% ~ 100%에 매핑
  var workDate=getWorkDate();
  var dayStart=new Date(workDate.getFullYear(),workDate.getMonth(),workDate.getDate(),WORK_DAY_START_HOUR,0,0).getTime();
  var totalMs=24*3600*1000;
  var nowOffset=Math.min(100,Math.max(0,(now.getTime()-dayStart)/totalMs*100));
  // HH:MM 문자열을 업무일 ms로 변환 (08시 미만은 익일로 해석)
  function parseTime(v){
    if(!v)return dayStart;
    if(typeof v==='string'&&/^\d{1,2}:\d{2}$/.test(v)){
      var p=v.split(':');
      var hh=parseInt(p[0],10),mm=parseInt(p[1],10);
      // 00:00~07:59 는 다음날로 해석
      var dayOffset=(hh<WORK_DAY_START_HOUR)?24*3600000:0;
      return dayStart+((hh-WORK_DAY_START_HOUR)*60+mm)*60000+dayOffset;
    }
    var t=new Date(v).getTime();
    return isNaN(t)?dayStart:t;
  }
  var segs='';
  list.forEach(function(seg){
    var s=parseTime(seg.start),e=parseTime(seg.end);
    if(s<dayStart)s=dayStart;
    if(e>dayStart+totalMs)e=dayStart+totalMs;
    if(e<=s)return;
    var left=(s-dayStart)/totalMs*100;
    var width=(e-s)/totalMs*100;
    var cls='ss';
    if(seg.status==='N')cls='sr';
    else if(seg.status==='P')cls='sp';
    var title=(seg.name||'')+' '+(seg.start||'')+'~'+(seg.end||'');
    segs+='<div class="dsum-tl-seg '+cls+'" style="left:'+left.toFixed(2)+'%;width:'+width.toFixed(2)+'%" title="'+title+'"></div>';
  });
  var html='<div class="dsum-tl">'+segs+'<div class="dsum-tl-now" style="left:'+nowOffset.toFixed(2)+'%"></div></div>';
  // 축: 08시 -> 14시 -> 20시 -> 익일02시 -> 08시
  html+='<div class="dsum-tl-axis"><span>08시</span><span>14시</span><span>20시</span><span>02시</span><span>08시</span></div>';
  html+='<div class="dsum-tl-legend"><span class="dsum-tl-lgi"><span class="dsum-tl-lgd" style="background:#22c55e"></span>가동</span><span class="dsum-tl-lgi"><span class="dsum-tl-lgd" style="background:#ef4444"></span>비가동</span><span class="dsum-tl-lgi"><span class="dsum-tl-lgd" style="background:#a78bfa"></span>계획정지</span><span class="dsum-tl-lgi"><span class="dsum-tl-lgd" style="background:#fbbf24;width:2px"></span>현재</span></div>';
  b.innerHTML=html;
}

function dsumSwitch(tab){
  dsumState.tab=tab;
  document.getElementById('tabTop5').classList.toggle('active',tab==='top5');
  document.getElementById('tabTL').classList.toggle('active',tab==='tl');
  if(!dsumState.data){loadDowntimeSummary();return}
  if(tab==='top5')renderEvents(dsumState.data);
  else renderTimeline(dsumState.data.timeline||[]);
}

// ★★★ 오늘의 생산실적 (업무일 08시~현재) ★★★
async function loadProductionToday(){
  var m=chkState.machine;if(!m)return;
  var body=document.getElementById('prodBody');
  body.innerHTML='<div class="dsum-loading">⏳ MES 조회중...</div>';
  prodState.loading=true;
  try{
    var r=await fetch(MES_API_BASE+'/production_today?machine_code='+encodeURIComponent(m.machine_code));
    if(!r.ok)throw new Error('API 응답오류 '+r.status);
    var data=await r.json();
    if(data.error)throw new Error(data.error);
    prodState.data=data;
    renderProductionToday(data);
  }catch(e){
    console.log('생산실적 조회실패:',e);
    // API 실패시 machine_status 데이터로 간이 표시
    renderProductionFallback(m);
  }finally{
    prodState.loading=false;
  }
}

function renderProductionToday(data){
  var b=document.getElementById('prodBody');
  var items=data.items||[];
  var workDate=data.work_date||'';
  document.getElementById('prodTitle').textContent='오늘의 생산실적 ('+workDate.slice(5)+' 08시~)';
  if(!items.length){
    renderProductionFallback(chkState.machine);
    return;
  }
  // 헤더
  var html='<div class="prod-head"><div>금형</div><div>품번</div><div class="ph-r">가동</div><div class="ph-r">MES</div><div class="ph-c">실제</div></div>';
  items.forEach(function(it,idx){
    var moldTxt=it.mold||'-';
    var itemTxt=(it.item_code||'-');
    var itemNmTxt=it.item_name||'';
    var woTxt=it.work_order||'';
    var timeTxt=it.start&&it.end?(it.start+'~'+it.end):'';
    var runTxt=it.run_min!=null?fmtMinutes(it.run_min):'-';
    // MES 실적 (수정불가)
    var mesQty=(it.actual_qty!=null)?it.actual_qty:0;
    var mesTxt=(it.actual_qty!=null)?mesQty.toLocaleString():(it.is_current===false?'<span style="color:var(--sub);font-size:10px">-</span>':'-');
    // 보정수량 기본값 = MES실적 (작업자가 수정 가능)
    var adjInitial=(it.adj_qty!=null)?it.adj_qty:mesQty;
    var cls='prod-row'+(it.is_current?' cur':'');
    html+='<div class="'+cls+'" title="WO:'+woTxt+' / '+timeTxt+'">'+
      '<div class="prod-mold">'+moldTxt+'</div>'+
      '<div class="prod-info"><div class="pi-item">'+itemTxt+(itemNmTxt?' <span style="color:var(--sub);font-size:10px;font-weight:400">'+itemNmTxt+'</span>':'')+'</div>'+
      (timeTxt?'<div class="pi-wo">'+timeTxt+(woTxt?' · '+woTxt:'')+'</div>':'')+'</div>'+
      '<div class="prod-run">'+runTxt+'</div>'+
      '<div class="prod-qty">'+mesTxt+'</div>'+
      '<div class="prod-adj">'+
        '<input type="number" inputmode="numeric" value="'+adjInitial+'" data-idx="'+idx+'" data-mes="'+mesQty+'" onchange="onAdjChange(this)" oninput="onAdjChange(this)">'+
        '<div class="pa-diff" id="diff-'+idx+'"></div>'+
      '</div>'+
      '</div>';
  });
  // 합계
  var totMin=data.total_run_min||0;
  var totMes=data.total_qty||0;
  html+='<div class="prod-foot">'+
    '<span class="pf-lb">합계 ('+items.length+'건) 가동 <b style="color:#fbbf24">'+fmtMinutes(totMin)+'</b></span>'+
    '<span>MES <span class="pf-val">'+totMes.toLocaleString()+'</span> · 실제 <span class="pf-adj" id="prodTotalAdj">'+totMes.toLocaleString()+'</span></span>'+
    '</div>';
  // 보정 사유 메모
  html+='<div class="prod-memo">'+
    '<label>📝 보정사유</label>'+
    '<input type="text" id="prodAdjMemo" placeholder="예: 낙하불량 3개 발생, 재검수시 -2개 등" oninput="onAdjMemoChange(this)">'+
    '</div>';
  b.innerHTML=html;
  // 초기 상태 저장
  updateProdAdjState();
}

// 보정수량 변경 이벤트
function onAdjChange(inp){
  var idx=+inp.dataset.idx;
  var mes=+inp.dataset.mes||0;
  var adj=+inp.value||0;
  var diff=adj-mes;
  // 테두리 색상 변경
  inp.classList.remove('diff-pos','diff-neg');
  if(diff>0)inp.classList.add('diff-pos');
  else if(diff<0)inp.classList.add('diff-neg');
  // 차이 표시
  var d=document.getElementById('diff-'+idx);
  if(d){
    d.classList.remove('p','n');
    if(diff===0){d.textContent=''}
    else if(diff>0){d.textContent='+'+diff;d.classList.add('p')}
    else{d.textContent=diff;d.classList.add('n')}
  }
  // 상태 업데이트
  updateProdAdjState();
}

function onAdjMemoChange(inp){
  if(prodState.data)prodState.data.adj_memo=inp.value||'';
}

function updateProdAdjState(){
  if(!prodState.data||!prodState.data.items)return;
  var totalAdj=0;
  document.querySelectorAll('.prod-adj input').forEach(function(inp){
    var idx=+inp.dataset.idx;
    var adj=+inp.value||0;
    if(prodState.data.items[idx])prodState.data.items[idx].adj_qty=adj;
    totalAdj+=adj;
  });
  prodState.data.total_adj_qty=totalAdj;
  var el=document.getElementById('prodTotalAdj');
  if(el){
    el.textContent=totalAdj.toLocaleString();
    // 차이 표시
    var mesTotal=prodState.data.total_qty||0;
    var diff=totalAdj-mesTotal;
    el.style.color=diff===0?'#4ade80':(diff>0?'#86efac':'#fca5a5');
  }
}

function renderProductionFallback(m){
  // API 미사용시 현재 설비 실적만 간이 표시
  var b=document.getElementById('prodBody');
  document.getElementById('prodTitle').textContent='현재 실적 (간이)';
  if(!m||!m.current_item_code){
    b.innerHTML='<div class="prod-empty">생산정보 없음</div>';
    return;
  }
  var mold=m.current_mold||'-';
  var itemTxt=m.current_item_code||'-';
  var itemNmTxt=m.item_name||'';
  var qty=+m.actual_qty||0,tgt=+m.target_qty||0;
  var html='<div class="prod-head"><div>금형</div><div>품번</div><div class="ph-r">가동</div><div class="ph-r">MES</div><div class="ph-c">실제</div></div>';
  html+='<div class="prod-row cur">'+
    '<div class="prod-mold">'+mold+'</div>'+
    '<div class="prod-info"><div class="pi-item">'+itemTxt+(itemNmTxt?' <span style="color:var(--sub);font-size:10px;font-weight:400">'+itemNmTxt+'</span>':'')+'</div>'+
    (m.lot_no?'<div class="pi-wo">LOT '+m.lot_no+'</div>':'')+'</div>'+
    '<div class="prod-run">-</div>'+
    '<div class="prod-qty">'+qty.toLocaleString()+'</div>'+
    '<div class="prod-adj">'+
      '<input type="number" inputmode="numeric" value="'+qty+'" data-idx="0" data-mes="'+qty+'" onchange="onAdjChange(this)" oninput="onAdjChange(this)">'+
      '<div class="pa-diff" id="diff-0"></div>'+
    '</div>'+
    '</div>';
  html+='<div class="prod-foot">'+
    '<span class="pf-lb" style="font-size:10px;color:#94a3b8">※ MES API 미연결</span>'+
    '<span>MES <span class="pf-val">'+qty.toLocaleString()+'</span> · 실제 <span class="pf-adj" id="prodTotalAdj">'+qty.toLocaleString()+'</span></span>'+
    '</div>';
  html+='<div class="prod-memo">'+
    '<label>📝 보정사유</label>'+
    '<input type="text" id="prodAdjMemo" placeholder="예: 낙하불량 3개 발생, 재검수시 -2개 등" oninput="onAdjMemoChange(this)">'+
    '</div>';
  b.innerHTML=html;
  // 저장용 데이터 구성
  prodState.data={
    machine_code:m.machine_code,
    items:[{mold:mold,item_code:m.current_item_code||'',item_name:m.item_name||'',work_order:m.work_order_no||'',actual_qty:qty,target_qty:tgt,run_min:null,is_current:true,adj_qty:qty}],
    total_qty:qty,
    total_adj_qty:qty,
    total_run_min:null,
    fallback:true,
    adj_memo:''
  };
}

function renderChkCards(){
  var c=document.getElementById('chkCards');c.innerHTML='';
  CHK_CATS.forEach(function(cat){
    var b=document.createElement('button');
    b.className='chk-card c-'+cat.id;
    b.innerHTML='<span class="ic">'+cat.icon+'</span><span>'+cat.name+'</span>';
    (function(cid){b.onclick=function(){chkPickCategory(cid)}})(cat.id);
    c.appendChild(b);
  });
}
function chkPickCategory(cid){
  chkState.category=cid;
  var cat=CHK_CATS.find(function(x){return x.id===cid});
  var el=document.getElementById('chkCurCat');
  el.textContent=cat.icon+' '+cat.name;
  el.style.background=cat.color+'33';el.style.color=cat.color;
  resetChkRowsForCategory();
  document.getElementById('chkStep1').style.display='none';
  document.getElementById('chkStep2').style.display='';
  document.getElementById('chkFoot').style.display='flex';
  renderChkContent();
}
function chkBackToCards(){
  document.getElementById('chkStep1').style.display='';
  document.getElementById('chkStep2').style.display='none';
  document.getElementById('chkFoot').style.display='none';
  chkState.category=null;chkState.rows=[];chkState.photos=[];
}
function resetChkRowsForCategory(){
  var items=getChkItems()[chkState.category]||[];
  chkState.rows=items.map(function(it){return{itemName:it.name,itemType:it.type,value:'',remark:''}});
  // 소재 카테고리 - 중량 자동계산
  if(chkState.category==='mat'&&chkState.machine){
    var m=chkState.machine;
    var coilKg=+m.coil_weight||0;
    var unitG=+m.unit_per_qty||0;
    var actQty=+m.actual_qty||0;
    var usedKg=actQty*unitG/1000;
    var remainKg=coilKg-usedKg;
    var wRow=chkState.rows.find(function(r){return r.itemName==='중량'});
    if(wRow){
      var parts=[];
      if(coilKg>0)parts.push('코일'+coilKg.toFixed(1)+'kg');
      if(actQty>0&&unitG>0){parts.push('사용'+actQty+'×'+unitG+'g='+usedKg.toFixed(2)+'kg');parts.push('잔량예상'+remainKg.toFixed(2)+'kg')}
      if(parts.length)wRow.value=parts.join(' / ');
    }
  }
}
function renderChkContent(){
  var c=document.getElementById('chkContent');c.innerHTML='';
  if(chkState.category==='dim'||chkState.category==='def'){
    var grid=document.createElement('div');grid.className='chk-memos';
    chkState.rows.forEach(function(r,idx){
      var box=document.createElement('div');box.className='chk-memo';
      var hdr=document.createElement('div');hdr.className='chk-mhdr';
      var nm=document.createElement('input');nm.type='text';nm.value=r.itemName||'';nm.placeholder=chkState.category==='dim'?'측정부위':'불량항목';
      (function(i){nm.oninput=function(e){chkState.rows[i].itemName=e.target.value}})(idx);
      var del=document.createElement('button');del.className='chk-del-memo';del.textContent='✕';del.title='삭제';
      (function(i){del.onclick=function(){chkState.rows.splice(i,1);renderChkContent()}})(idx);
      hdr.appendChild(nm);hdr.appendChild(del);
      var ta=document.createElement('textarea');ta.placeholder=chkState.category==='dim'?'치수 / 측정값 / 메모':'불량내용 / 위치 / 수량 등';ta.value=r.value||'';
      (function(i){ta.oninput=function(e){chkState.rows[i].value=e.target.value}})(idx);
      box.appendChild(hdr);box.appendChild(ta);
      grid.appendChild(box);
    });
    c.appendChild(grid);
  }else{
    if(chkState.category==='mat'&&chkState.machine){
      var m=chkState.machine;
      var info=document.createElement('div');
      info.style.cssText='background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.3);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:11px;color:#86efac;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap';
      var coilKg=+m.coil_weight||0,unitG=+m.unit_per_qty||0,actQty=+m.actual_qty||0;
      var usedKg=actQty*unitG/1000,remainKg=coilKg-usedKg;
      var txt='📦 코일 '+coilKg.toFixed(1)+'kg · 소요 '+unitG+'g/ea · 실적 '+actQty+' · 예상잔량 <b>'+remainKg.toFixed(2)+'kg</b>';
      info.innerHTML='<span>'+txt+'</span>';
      var reBtn=document.createElement('button');reBtn.textContent='🔄 자동계산';reBtn.style.cssText='border:none;background:rgba(34,197,94,.2);color:#86efac;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:700';
      reBtn.onclick=function(){resetChkRowsForCategory();renderChkContent()};
      info.appendChild(reBtn);
      c.appendChild(info);
    }
    var wrap=document.createElement('div');wrap.className='chk-items';
    chkState.rows.forEach(function(r,idx){
      var item=document.createElement('div');item.className='chk-item';
      var lb=document.createElement('div');lb.className='chk-ilabel';lb.textContent=r.itemName;
      var inp=document.createElement('input');inp.className='chk-iin';inp.type=r.itemType==='number'?'number':'text';inp.placeholder='';inp.value=r.value;
      (function(i){inp.oninput=function(e){chkState.rows[i].value=e.target.value}})(idx);
      var del=document.createElement('button');del.className='chk-del-row';del.textContent='✕';del.title='행 삭제';
      (function(i){del.onclick=function(){chkState.rows.splice(i,1);renderChkContent()}})(idx);
      item.appendChild(lb);item.appendChild(inp);item.appendChild(del);
      wrap.appendChild(item);
    });
    c.appendChild(wrap);
  }
  var addBtn=document.createElement('button');addBtn.className='chk-add-btn';
  addBtn.textContent=(chkState.category==='dim'||chkState.category==='def')?'+ 항목 추가':'+ 항목 추가 (같은 카테고리)';
  addBtn.onclick=function(){addChkRowDialog()};
  c.appendChild(addBtn);
  var pa=document.createElement('div');pa.className='chk-photo-area';
  var lab=document.createElement('label');lab.className='chk-photo-btn';lab.textContent='📸 사진 선택/촬영';
  var inp2=document.createElement('input');inp2.type='file';inp2.accept='image/*';inp2.capture='environment';inp2.multiple=true;inp2.style.display='none';
  inp2.onchange=function(e){handlePhotos(e.target.files)};
  lab.appendChild(inp2);
  pa.appendChild(lab);
  var prev=document.createElement('div');prev.className='chk-photo-preview';prev.id='chkPhPrev';
  pa.appendChild(prev);
  c.appendChild(pa);
  renderChkPhotos();
}
function addChkRowDialog(){
  if(chkState.category==='dim'||chkState.category==='def'){
    var base=chkState.category==='dim'?'측정부위':'불량항목';
    var n=chkState.rows.length+1;
    chkState.rows.push({itemName:base+n,itemType:'text',value:'',remark:''});
    renderChkContent();
    setTimeout(function(){var ins=document.querySelectorAll('.chk-mhdr input');if(ins.length)ins[ins.length-1].focus()},50);
    return;
  }
  var items=getChkItems()[chkState.category]||[];
  if(!items.length){showToast('등록된 항목없음');return}
  var names=items.map(function(i){return i.name}).join(' / ');
  var pick=prompt('추가할 항목명 (사용가능: '+names+')',items[0].name);
  if(!pick)return;
  var found=items.find(function(i){return i.name===pick});
  chkState.rows.push({itemName:pick,itemType:found?found.type:'text',value:'',remark:''});
  renderChkContent();
}
function handlePhotos(files){
  if(!files||!files.length)return;
  if(chkState.photos.length+files.length>6){showToast('최대 6장까지');return}
  for(var i=0;i<files.length;i++){
    (function(f){compressImage(f,30*1024,function(dataUrl,size){
      chkState.photos.push({dataUrl:dataUrl,size:size,name:f.name});
      renderChkPhotos();
    })})(files[i]);
  }
}
function compressImage(file,targetBytes,cb){
  var reader=new FileReader();
  reader.onload=function(e){
    var img=new Image();
    img.onload=function(){
      var canvas=document.createElement('canvas');
      function tryCompress(maxDim,quality,attempt){
        if(attempt>12){cb(canvas.toDataURL('image/jpeg',0.3),-1);return}
        var w=img.width,h=img.height;
        if(w>maxDim||h>maxDim){if(w>h){h=Math.round(h*maxDim/w);w=maxDim}else{w=Math.round(w*maxDim/h);h=maxDim}}
        canvas.width=w;canvas.height=h;
        var ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
        ctx.drawImage(img,0,0,w,h);
        var dataUrl=canvas.toDataURL('image/jpeg',quality);
        var b64=dataUrl.split(',')[1]||'';
        var bytes=Math.floor(b64.length*3/4);
        if(bytes<=targetBytes||(maxDim<=200&&quality<=0.35)){cb(dataUrl,bytes);return}
        var nq=quality>0.5?quality-0.1:quality-0.05;
        if(nq<0.35){nq=0.7;maxDim=Math.round(maxDim*0.8)}
        tryCompress(maxDim,nq,attempt+1);
      }
      tryCompress(1200,0.85,0);
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}
function renderChkPhotos(){
  var p=document.getElementById('chkPhPrev');if(!p)return;
  p.innerHTML='';
  chkState.photos.forEach(function(ph,i){
    var d=document.createElement('div');d.className='chk-ph-item';
    var im=document.createElement('img');im.src=ph.dataUrl;
    var del=document.createElement('button');del.className='chk-ph-del';del.textContent='✕';
    (function(idx){del.onclick=function(){chkState.photos.splice(idx,1);renderChkPhotos()}})(i);
    var sz=document.createElement('div');sz.className='chk-ph-size';sz.textContent=ph.size>0?Math.round(ph.size/1024)+'KB':'?';
    d.appendChild(im);d.appendChild(del);d.appendChild(sz);
    p.appendChild(d);
  });
}

async function submitCheck(){
  var filled=chkState.rows.filter(function(r){return r.value||r.remark});
  if(!filled.length&&!chkState.photos.length){showToast('입력내용이 없습니다');return}
  var m=chkState.machine,cat=chkState.category;
  var catInfo=CHK_CATS.find(function(c){return c.id===cat});
  var now=new Date();
  var record={
    machine_code:m.machine_code,
    machine_name:m.machine_name||'',
    customer:m.customer||'',
    item_code:m.current_item_code||'',
    item_name:m.item_name||'',
    mold:m.current_mold||'',
    raw_item_code:m.raw_item_code||'',
    lot_no:m.lot_no||'',
    coil_weight:m.coil_weight||0,
    unit_per_qty:m.unit_per_qty||0,
    actual_qty:m.actual_qty||0,
    worker:m.worker||'',
    category:cat,
    category_name:catInfo?catInfo.name:cat,
    rows:filled,
    photo_count:chkState.photos.length,
    photos:chkState.photos.map(function(p){return{size:p.size,data:p.dataUrl}}),
    // ★ 당일 정지요약 스냅샷 같이 저장
    downtime_snapshot:dsumState.data?{runMin:dsumState.data.runMin,stopMin:dsumState.data.stopMin,plannedMin:dsumState.data.plannedMin,stopCount:dsumState.data.stopCount,plannedCount:dsumState.data.plannedCount,rate:dsumState.data.rate,stopEvents:dsumState.data.stopEvents,plannedEvents:dsumState.data.plannedEvents}:null,
    // ★ 생산실적 스냅샷 (금형별 WO/품번/MES실적/실제보정값)
    production_snapshot:prodState.data?{items:prodState.data.items||[],total_qty:prodState.data.total_qty||0,total_adj_qty:prodState.data.total_adj_qty||0,total_run_min:prodState.data.total_run_min,work_date:prodState.data.work_date||'',adj_memo:prodState.data.adj_memo||'',fallback:!!prodState.data.fallback}:null,
    created_at:now.toISOString()
  };
  showToast('⏳ 저장중...');
  var isEdit=!!chkState.editId;
  try{
    if(isEdit){
      await fetch(SB_URL+'/rest/v1/mes_check_log?id=eq.'+chkState.editId,{
        method:'PATCH',
        headers:Object.assign({},sbH,{'Prefer':'return=minimal'}),
        body:JSON.stringify({
          machine_code:record.machine_code,machine_name:record.machine_name,
          customer:record.customer,item_code:record.item_code,
          category:cat,payload:record
        })
      });
    }else{
      await sbPost('mes_check_log',{
        machine_code:record.machine_code,machine_name:record.machine_name,
        customer:record.customer,item_code:record.item_code,
        item_name:record.item_name,category:cat,
        payload:record,created_at:record.created_at
      });
    }
  }catch(e){console.log('supabase 저장실패:',e)}
  var msg='📋 ['+catInfo.icon+' '+catInfo.name+'] '+record.machine_code+' '+record.machine_name+'\n';
  msg+='고객:'+record.customer+' │ 품번:'+record.item_code+'\n';
  filled.forEach(function(r){
    var v=r.value||'-';
    var rm=r.remark?' ('+r.remark+')':'';
    msg+='• '+r.itemName+': '+v+rm+'\n';
  });
  if(record.downtime_snapshot){
    var ds=record.downtime_snapshot;
    msg+='📊 당일: 가동'+fmtMinutes(ds.runMin)+' / 비가동'+fmtMinutes(ds.stopMin)+'('+ds.stopCount+'회)';
    if(ds.plannedMin>0)msg+=' / 계획정지'+fmtMinutes(ds.plannedMin);
    msg+=' · 가동률'+(ds.rate||0).toFixed(1)+'%\n';
  }
  if(record.production_snapshot&&record.production_snapshot.items&&record.production_snapshot.items.length){
    var ps=record.production_snapshot;
    msg+='🏭 생산실적 (금형별):\n';
    ps.items.forEach(function(it){
      var mes=(it.actual_qty!=null?it.actual_qty:0);
      var adj=(it.adj_qty!=null?it.adj_qty:mes);
      var rm=it.run_min!=null?' '+fmtMinutes(it.run_min):'';
      var diff=adj-mes;
      var diffTxt=diff===0?'':(' ('+(diff>0?'+':'')+diff+')');
      msg+='  • '+(it.mold||'-')+' '+(it.item_code||'')+': MES '+mes.toLocaleString()+' → 실제 '+adj.toLocaleString()+'ea'+diffTxt+rm+'\n';
    });
    var totDiff=(ps.total_adj_qty||0)-(ps.total_qty||0);
    var totDiffTxt=totDiff===0?'':(' ('+(totDiff>0?'+':'')+totDiff+')');
    msg+='  합계: MES '+(ps.total_qty||0).toLocaleString()+' → 실제 '+(ps.total_adj_qty||0).toLocaleString()+'ea'+totDiffTxt+'\n';
    if(ps.adj_memo)msg+='  📝 보정사유: '+ps.adj_memo+'\n';
  }
  if(record.photo_count>0)msg+='📷 사진 '+record.photo_count+'장 첨부\n';
  msg+='⏱ '+now.toLocaleString('ko-KR');
  if(!isEdit){
    await sendChkAlerts(cat,msg,record);
    showToast('✅ 저장 및 알림 발송 완료');
  }else{
    showToast('✅ 수정 완료 (알림 미발송)');
  }
  closeChkModal();
  if(isEdit){var r=document.getElementById('hiResult');if(r&&document.getElementById('panel-settings').classList.contains('active'))hiSearch()}
}

async function sendChkAlerts(cat,msg,record){
  var wantKeys=['chk_'+cat,'chk_all'];
  var nfs=getNtfyRules().filter(function(r){return wantKeys.indexOf(String(r.cond))>=0});
  for(var i=0;i<nfs.length;i++){
    try{
      await fetch('https://ntfy.sh/'+nfs[i].room,{
        method:'POST',
        headers:{'Title':'MES점검:'+record.category_name,'Priority':cat==='urg'?'max':'high','Tags':cat==='urg'?'warning,rotating_light':'clipboard'},
        body:msg
      });
      for(var p=0;p<Math.min(3,record.photos.length);p++){
        var blob=await (await fetch(record.photos[p].data)).blob();
        await fetch('https://ntfy.sh/'+nfs[i].room,{
          method:'PUT',
          headers:{'Filename':'photo'+(p+1)+'.jpg','Title':'사진'+(p+1)+'/'+record.photo_count},
          body:blob
        });
      }
    }catch(e){console.log('ntfy실패',e)}
  }
  var tgs=getTgRules().filter(function(r){return wantKeys.indexOf(String(r.cond))>=0});
  var TG_BOT_TOKEN='8367539669:AAFzZeMULV8B4adNROtENsUc6wr0MvLpSi0';
  for(var i=0;i<tgs.length;i++){
    try{
      await fetch('https://api.telegram.org/bot'+TG_BOT_TOKEN+'/sendMessage',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({chat_id:tgs[i].chatId,text:msg})
      });
      for(var p=0;p<Math.min(6,record.photos.length);p++){
        var blob=await (await fetch(record.photos[p].data)).blob();
        var fd=new FormData();
        fd.append('chat_id',tgs[i].chatId);
        fd.append('photo',blob,'photo'+(p+1)+'.jpg');
        fd.append('caption',record.machine_code+' '+record.category_name+' 사진'+(p+1));
        await fetch('https://api.telegram.org/bot'+TG_BOT_TOKEN+'/sendPhoto',{method:'POST',body:fd});
      }
    }catch(e){console.log('tg실패',e)}
  }
  var dcs=getDcRules().filter(function(r){return wantKeys.indexOf(String(r.cond))>=0});
  for(var i=0;i<dcs.length;i++){
    try{
      var fd=new FormData();
      fd.append('payload_json',JSON.stringify({content:msg}));
      for(var p=0;p<Math.min(6,record.photos.length);p++){
        var blob=await (await fetch(record.photos[p].data)).blob();
        fd.append('files['+p+']',blob,'photo'+(p+1)+'.jpg');
      }
      await fetch(dcs[i].hook,{method:'POST',body:fd});
    }catch(e){console.log('dc실패',e)}
  }
}

// ========= 점검항목 관리 (설정탭) =========
function renderCiTabs(){
  var c=document.getElementById('ciCatTabs');if(!c)return;
  c.innerHTML='';
  CHK_CATS.forEach(function(cat){
    var b=document.createElement('div');
    b.className='ci-cat'+(ciState.activeCat===cat.id?' active':'');
    b.textContent=cat.icon+' '+cat.name;
    (function(cid){b.onclick=function(){ciState.activeCat=cid;renderCiTabs();renderCiList()}})(cat.id);
    c.appendChild(b);
  });
}
function renderCiList(){
  var c=document.getElementById('ciList');if(!c)return;
  c.innerHTML='';
  var items=getChkItems()[ciState.activeCat]||[];
  if(!items.length){var p=document.createElement('p');p.style.cssText='font-size:11px;color:var(--sub);text-align:center;padding:10px';p.textContent='항목 없음';c.appendChild(p);return}
  items.forEach(function(it,i){
    var r=document.createElement('div');r.className='ci-row';
    r.innerHTML='<span class="ci-rnum">'+(i+1)+'</span><span class="ci-rnm">'+it.name+'</span><span class="ci-rtype">'+(it.type==='number'?'숫자':'텍스트')+'</span>';
    var del=document.createElement('button');del.className='ri-del';del.textContent='✕';
    (function(idx){del.onclick=function(e){e.stopPropagation();var all=getChkItems();all[ciState.activeCat].splice(idx,1);saveChkItems(all);renderCiList()}})(i);
    r.appendChild(del);c.appendChild(r);
  });
}
function addChkItem(){
  var nm=document.getElementById('ciNewName').value.trim();
  if(!nm){showToast('항목명 입력');return}
  var tp=document.getElementById('ciNewType').value;
  var all=getChkItems();
  if(!all[ciState.activeCat])all[ciState.activeCat]=[];
  all[ciState.activeCat].push({name:nm,type:tp});
  saveChkItems(all);
  document.getElementById('ciNewName').value='';
  renderCiList();
  showToast('추가됨');
}
function resetChkItems(){
  if(!confirm('기본값으로 복원합니다. 기존 항목은 삭제됩니다. 진행?'))return;
  saveChkItems(JSON.parse(JSON.stringify(DEFAULT_CHK_ITEMS)));
  renderCiList();
  showToast('복원완료');
}


async function checkAlerts(data){var soon=data.filter(function(d){return d.machine_status==='N'&&d.remaining_minutes>0});var ntfyRules=getNtfyRules().filter(function(r){return typeof r.cond==='number'||/^\d+$/.test(String(r.cond))});for(var i=0;i<ntfyRules.length;i++){var rule=ntfyRules[i],cond=+rule.cond,targets=soon.filter(function(d){return d.remaining_minutes<=cond});for(var j=0;j<targets.length;j++){var d=targets[j],key='ntfy_'+rule.room+'_'+d.machine_code;if(settings.lastAlerted[key]&&Date.now()-settings.lastAlerted[key]<600000)continue;try{await fetch('https://ntfy.sh/'+rule.room,{method:'POST',headers:{'Title':'MES','Priority':'high','Tags':'warning'},body:'['+d.machine_code+'] '+d.machine_name+' → '+remStr(d.remaining_minutes).t})}catch(e){}settings.lastAlerted[key]=Date.now()}}var tgRules=getTgRules().filter(function(r){return typeof r.cond==='number'||/^\d+$/.test(String(r.cond))});for(var i=0;i<tgRules.length;i++){var rule=tgRules[i],cond=+rule.cond,targets=soon.filter(function(d){return d.remaining_minutes<=cond});for(var j=0;j<targets.length;j++){var d=targets[j],key='tg_'+rule.chatId+'_'+d.machine_code;if(settings.lastAlerted[key]&&Date.now()-settings.lastAlerted[key]<600000)continue;try{await fetch('https://api.telegram.org/bot8367539669:AAFzZeMULV8B4adNROtENsUc6wr0MvLpSi0/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:rule.chatId,text:'⏰['+d.machine_code+'] '+d.machine_name+' 잔여:'+remStr(d.remaining_minutes).t})})}catch(e){}settings.lastAlerted[key]=Date.now()}}var dcRules=getDcRules().filter(function(r){return typeof r.cond==='number'||/^\d+$/.test(String(r.cond))});for(var i=0;i<dcRules.length;i++){var rule=dcRules[i],cond=+rule.cond,targets=soon.filter(function(d){return d.remaining_minutes<=cond});for(var j=0;j<targets.length;j++){var d=targets[j],key='dc_'+d.machine_code;if(settings.lastAlerted[key]&&Date.now()-settings.lastAlerted[key]<600000)continue;try{await fetch(rule.hook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'⏰['+d.machine_code+'] '+d.machine_name+' → '+remStr(d.remaining_minutes).t})})}catch(e){}settings.lastAlerted[key]=Date.now()}}}

function _condLabel(c){var s=String(c);if(s==='chk_dim')return'점검:치수';if(s==='chk_mat')return'점검:소재';if(s==='chk_def')return'점검:불량';if(s==='chk_urg')return'점검:긴급';if(s==='chk_all')return'점검:전체';return s+'분'}

// ========== 이력관리 ==========
var hiData=[];
function hiInit(){
  var end=new Date(),st=new Date();st.setDate(st.getDate()-30);
  var fmtD=function(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  var s=document.getElementById('hiStart'),e=document.getElementById('hiEnd');
  if(s&&!s.value)s.value=fmtD(st);
  if(e&&!e.value)e.value=fmtD(end);
}
async function hiSearch(){
  var s=document.getElementById('hiStart').value,e=document.getElementById('hiEnd').value;
  var cat=document.getElementById('hiCat').value,mc=document.getElementById('hiMachine').value.trim();
  if(!s||!e){showToast('기간 선택');return}
  var q='select=id,created_at,machine_code,machine_name,customer,item_code,category,payload&order=created_at.desc&limit=500';
  q+='&created_at=gte.'+s+'T00:00:00&created_at=lte.'+e+'T23:59:59';
  if(cat)q+='&category=eq.'+cat;
  if(mc)q+='&machine_code=eq.'+mc;
  document.getElementById('hiResult').innerHTML='<div class="hi-empty">⏳ 조회중...</div>';
  var data=await sbGet('mes_check_log',q);
  if(!data){document.getElementById('hiResult').innerHTML='<div class="hi-empty" style="color:var(--red)">조회실패</div>';return}
  hiData=data;
  hiRenderTable(data);
}
function hiRenderTable(data){
  var c=document.getElementById('hiResult');c.innerHTML='';
  if(!data.length){c.innerHTML='<div class="hi-empty">결과 없음</div>';return}
  var info=document.createElement('div');info.style.cssText='font-size:11px;color:var(--accent);margin:6px 0';info.textContent='총 '+data.length+'건';
  c.appendChild(info);
  var wrap=document.createElement('div');wrap.style.overflowX='auto';
  var tbl=document.createElement('table');tbl.className='hi-table';
  tbl.innerHTML='<thead><tr><th style="width:26px"><input type="checkbox" class="hi-checkbox" onclick="hiToggleAll(this)"></th><th>일시</th><th>설비</th><th>고객</th><th>카테</th><th>내용</th><th>📷</th><th style="width:70px">관리</th></tr></thead>';
  var tb=document.createElement('tbody');
  data.forEach(function(d){
    var dt=new Date(d.created_at);
    var tstr=dt.toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
    var cat=CHK_CATS.find(function(x){return x.id===d.category});
    var catH=cat?'<span class="hi-cat-'+d.category+'">'+cat.icon+' '+cat.name+'</span>':(d.category||'-');
    var rows=(d.payload&&d.payload.rows)||[];
    var detail=rows.map(function(r){return r.itemName+':'+(r.value||'-')+(r.remark?'('+r.remark+')':'')}).join(' / ');
    var pc=(d.payload&&d.payload.photo_count)||0;
    var tr=document.createElement('tr');tr.dataset.id=d.id;
    tr.innerHTML='<td><input type="checkbox" class="hi-checkbox hi-chk" value="'+d.id+'"></td><td style="white-space:nowrap">'+tstr+'</td><td><b>'+d.machine_code+'</b><br><span style="color:var(--sub);font-size:10px">'+(d.machine_name||'')+'</span></td><td style="font-size:10px">'+(d.customer||'-')+'</td><td>'+catH+'</td><td class="hi-det">'+(detail||'-')+'</td><td style="text-align:center">'+(pc>0?'📷'+pc:'')+'</td>';
    var tdAct=document.createElement('td');tdAct.style.cssText='white-space:nowrap;text-align:center';
    var btnE=document.createElement('button');btnE.textContent='✏️';btnE.title='수정';btnE.style.cssText='border:none;background:rgba(56,189,248,.12);color:var(--accent);border-radius:4px;padding:3px 6px;cursor:pointer;margin-right:3px;font-size:13px';
    var btnD=document.createElement('button');btnD.textContent='🗑';btnD.title='삭제';btnD.style.cssText='border:none;background:rgba(239,68,68,.12);color:var(--red);border-radius:4px;padding:3px 6px;cursor:pointer;font-size:13px';
    (function(rec){btnE.onclick=function(e){e.stopPropagation();hiEditRecord(rec)};btnD.onclick=function(e){e.stopPropagation();hiDeleteOne(rec.id)}})(d);
    tdAct.appendChild(btnE);tdAct.appendChild(btnD);
    tr.appendChild(tdAct);
    tb.appendChild(tr);
  });
  tbl.appendChild(tb);wrap.appendChild(tbl);c.appendChild(wrap);
}
function hiDeleteOne(id){
  if(!confirm('이 기록을 삭제합니다. 진행?'))return;
  (async function(){
    try{await sbDelete('mes_check_log','id=eq.'+id);showToast('✅삭제');hiSearch()}
    catch(e){showToast('삭제실패');console.log(e)}
  })();
}
function hiEditRecord(d){
  var machine={
    machine_code:d.machine_code,machine_name:d.machine_name||'',
    customer:d.customer||'',current_item_code:d.item_code||'',
    item_name:(d.payload&&d.payload.item_name)||'',
    current_mold:(d.payload&&d.payload.mold)||''
  };
  openChkModal(machine);
  chkState.editId=d.id;
  var cid=d.category;
  var cat=CHK_CATS.find(function(x){return x.id===cid});
  if(!cat){showToast('카테고리 오류');return}
  chkState.category=cid;
  var el=document.getElementById('chkCurCat');
  el.textContent=cat.icon+' '+cat.name+' (수정)';
  el.style.background=cat.color+'33';el.style.color=cat.color;
  chkState.rows=((d.payload&&d.payload.rows)||[]).map(function(r){return{itemName:r.itemName||r.name||'',itemType:r.itemType||'text',value:r.value||'',remark:r.remark||''}});
  if(!chkState.rows.length)resetChkRowsForCategory();
  chkState.photos=[];
  if(d.payload&&d.payload.photos){
    d.payload.photos.forEach(function(p){if(p.data)chkState.photos.push({dataUrl:p.data,size:p.size||0,name:'photo.jpg'})});
  }
  // 이전 생산실적 스냅샷 복원 (수정모드에서도 보정값 유지)
  if(d.payload&&d.payload.production_snapshot){
    prodState.data=JSON.parse(JSON.stringify(d.payload.production_snapshot));
    // 렌더는 loadProductionToday가 openChkModal에서 호출되므로 기록된 값으로 덮어쓰기
    setTimeout(function(){
      if(prodState.data&&prodState.data.items){
        if(!prodState.data.work_date)prodState.data.work_date='';
        if(prodState.data.items.length){
          renderProductionToday(prodState.data);
          // 보정 사유 복원
          var memo=prodState.data.adj_memo||'';
          var memoInp=document.getElementById('prodAdjMemo');
          if(memoInp)memoInp.value=memo;
          // 각 input 값 복원 + diff 갱신
          document.querySelectorAll('.prod-adj input').forEach(function(inp){
            var idx=+inp.dataset.idx;
            var it=prodState.data.items[idx];
            if(it&&it.adj_qty!=null){inp.value=it.adj_qty;onAdjChange(inp)}
          });
        }
      }
    },500);
  }
  document.getElementById('chkStep1').style.display='none';
  document.getElementById('chkStep2').style.display='';
  document.getElementById('chkFoot').style.display='flex';
  document.getElementById('chkTitle').textContent='✏️ 점검수정 ['+d.machine_code+'] '+(d.machine_name||'');
  renderChkContent();
}
function hiToggleAll(el){document.querySelectorAll('.hi-chk').forEach(function(c){c.checked=el.checked;c.closest('tr').classList.toggle('sel',el.checked)})}
async function hiExportCsv(){
  if(!hiData.length){showToast('먼저 조회');return}
  if(typeof ExcelJS==='undefined'||typeof saveAs==='undefined'){showToast('엑셀 라이브러리 로딩중 · 잠시후 재시도');return}
  showToast('⏳엑셀 생성중...');
  var wb=new ExcelJS.Workbook();
  wb.creator='MES 점검시스템';wb.created=new Date();
  var ws=wb.addWorksheet('점검이력',{views:[{state:'frozen',ySplit:1}]});
  var headers=['일시','고객사','설비코드','설비명','기종품번','기종명','금형','소재코드','로트','코일kg','소요g','실적','잔량kg','카테고리','항목','값','비고','작업자','사진1','사진2','사진3','사진4','사진5','사진6'];
  ws.columns=[
    {width:18},{width:12},{width:10},{width:14},{width:18},{width:22},{width:14},{width:14},{width:14},{width:9},{width:8},{width:8},{width:10},{width:12},{width:14},{width:24},{width:20},{width:10},
    {width:14},{width:14},{width:14},{width:14},{width:14},{width:14}
  ];
  var hdrRow=ws.addRow(headers);hdrRow.height=22;
  hdrRow.eachCell(function(cell){
    cell.font={bold:true,color:{argb:'FFFFFFFF'},size:11};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E40AF'}};
    cell.alignment={vertical:'middle',horizontal:'center'};
    cell.border={top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}};
  });
  var CAT_FILL={dim:'FFDBEAFE',mat:'FFDCFCE7',def:'FFFFEDD5',urg:'FFFEE2E2'};
  for(var i=0;i<hiData.length;i++){
    var d=hiData[i];
    var dt=new Date(d.created_at);
    var tstr=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0')+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');
    var cat=CHK_CATS.find(function(x){return x.id===d.category});
    var catN=cat?(cat.icon+' '+cat.name):(d.category||'');
    var p=d.payload||{};
    var detRows=(p.rows&&p.rows.length)?p.rows:[{itemName:'',value:'',remark:''}];
    var firstRowNum=null;
    for(var j=0;j<detRows.length;j++){
      var r=detRows[j];
      var coilKg=+p.coil_weight||0,unitG=+p.unit_per_qty||0,actQty=+p.actual_qty||0;
      var remainKg=(coilKg>0)?(coilKg-actQty*unitG/1000):'';
      if(typeof remainKg==='number')remainKg=Math.round(remainKg*100)/100;
      var base=(j===0)?[
        tstr,d.customer||'',d.machine_code||'',d.machine_name||p.machine_name||'',
        d.item_code||'',p.item_name||'',p.mold||'',p.raw_item_code||'',p.lot_no||'',
        p.coil_weight||'',p.unit_per_qty||'',p.actual_qty||'',remainKg,catN
      ]:['','','','','','','','','','','','','',''];
      var rowData=base.concat([r.itemName||'',r.value||'',r.remark||'',(j===0?(p.worker||''):'')]);
      for(var k=0;k<6;k++)rowData.push('');
      var row=ws.addRow(rowData);
      if(j===0)firstRowNum=row.number;
      var catFillColor=CAT_FILL[d.category];
      if(catFillColor&&j===0){row.getCell(14).fill={type:'pattern',pattern:'solid',fgColor:{argb:catFillColor}};row.getCell(14).font={bold:true}}
      row.eachCell({includeEmpty:true},function(cell){cell.border={top:{style:'hair',color:{argb:'FFCCCCCC'}},bottom:{style:'hair',color:{argb:'FFCCCCCC'}},left:{style:'hair',color:{argb:'FFCCCCCC'}},right:{style:'hair',color:{argb:'FFCCCCCC'}}};cell.alignment={vertical:'middle',wrapText:true}});
      if(d.category==='urg')row.eachCell({includeEmpty:true},function(cell){if(!cell.fill||!cell.fill.fgColor)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF1F2'}}});
      if(j===0&&p.photos&&p.photos.length){
        row.height=90;
        for(var k=0;k<Math.min(6,p.photos.length);k++){
          try{
            var ph=p.photos[k];if(!ph||!ph.data)continue;
            var b64=ph.data.split(',')[1]||ph.data;
            var imgId=wb.addImage({base64:b64,extension:'jpeg'});
            var col=19+k;
            ws.addImage(imgId,{tl:{col:col-1+0.05,row:firstRowNum-1+0.05},ext:{width:100,height:85}});
          }catch(e){console.log('img err',e)}
        }
      }
    }
  }
  ws.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}};
  try{
    var buf=await wb.xlsx.writeBuffer();
    var fname='점검이력_'+document.getElementById('hiStart').value+'_'+document.getElementById('hiEnd').value+'.xlsx';
    saveAs(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),fname);
    showToast('✅엑셀 다운로드 ('+hiData.length+'건)');
  }catch(e){console.log(e);showToast('엑셀 생성실패')}
}
function _csvCell(v){var s=String(v==null?'':v);if(/[",\n]/.test(s))return'"'+s.replace(/"/g,'""')+'"';return s}
async function hiDeleteSelected(){
  var chks=document.querySelectorAll('.hi-chk:checked');
  if(!chks.length){showToast('선택된 항목 없음');return}
  if(!confirm('선택한 '+chks.length+'건을 삭제합니다. 진행?'))return;
  var ids=[];chks.forEach(function(c){ids.push(c.value)});
  try{
    await sbDelete('mes_check_log','id=in.('+ids.join(',')+')');
    showToast('✅'+ids.length+'건 삭제');
    hiSearch();
  }catch(e){showToast('삭제실패');console.log(e)}
}

function renderNtfyRules(){var rules=getNtfyRules();var c=document.getElementById('ntfyRules');c.innerHTML='';if(!rules.length){c.innerHTML='<div style="text-align:center;color:#666;font-size:11px;padding:8px 0">등록된 규칙 없음</div>';return}rules.forEach(function(r,i){var d=document.createElement('div');d.className='rule-item';d.innerHTML='<span class="ri-num">'+(i+1)+'</span><span class="ri-cond">'+_condLabel(r.cond)+'</span><span class="ri-val">#'+r.room+'</span>';var b=document.createElement('button');b.className='ri-del';b.textContent='✕';(function(x){b.onclick=function(e){e.stopPropagation();var arr=getNtfyRules();arr.splice(x,1);localStorage.setItem(NTFY_LS,JSON.stringify(arr));renderNtfyRules();_saveRulesToServer('mes_chk_ntfy',arr)}})(i);d.appendChild(b);c.appendChild(d)})}
function addNtfyRule(){var cond=document.getElementById('ntfyCond').value,room=document.getElementById('ntfyRoom').value.trim();if(!room)return;var rules=getNtfyRules();rules.push({cond:(/^\d+$/.test(cond)?Number(cond):cond),room:room});localStorage.setItem(NTFY_LS,JSON.stringify(rules));document.getElementById('ntfyRoom').value='';renderNtfyRules();_saveRulesToServer('mes_chk_ntfy',rules)}

function renderTgRules(){var rules=getTgRules();var c=document.getElementById('tgRules');c.innerHTML='';if(!rules.length){c.innerHTML='<div style="text-align:center;color:#666;font-size:11px;padding:8px 0">등록된 수신자 없음</div>';return}rules.forEach(function(r,i){var d=document.createElement('div');d.className='rule-item';d.innerHTML='<span class="ri-num">'+(i+1)+'</span><span class="ri-cond">'+_condLabel(r.cond)+'</span><span class="ri-val">'+r.chatId+'</span>';var b=document.createElement('button');b.className='ri-del';b.textContent='✕';(function(x){b.onclick=function(e){e.stopPropagation();var arr=getTgRules();arr.splice(x,1);localStorage.setItem(TG_LS,JSON.stringify(arr));renderTgRules();_saveRulesToServer('mes_chk_tg',arr)}})(i);d.appendChild(b);c.appendChild(d)})}
function addTgRule(){var cond=document.getElementById('tgCond').value,cid=document.getElementById('tgChatId').value.trim();if(!cid)return;var rules=getTgRules();rules.push({cond:(/^\d+$/.test(cond)?Number(cond):cond),chatId:cid});localStorage.setItem(TG_LS,JSON.stringify(rules));document.getElementById('tgChatId').value='';renderTgRules();_saveRulesToServer('mes_chk_tg',rules)}

function renderDcRules(){var rules=getDcRules();var c=document.getElementById('dcRules');c.innerHTML='';if(!rules.length){c.innerHTML='<div style="text-align:center;color:#666;font-size:11px;padding:8px 0">등록된 Webhook 없음</div>';return}rules.forEach(function(r,i){var d=document.createElement('div');d.className='rule-item';d.innerHTML='<span class="ri-num">'+(i+1)+'</span><span class="ri-cond">'+_condLabel(r.cond)+'</span><span class="ri-val">'+r.hook.slice(0,30)+'…</span>';var b=document.createElement('button');b.className='ri-del';b.textContent='✕';(function(x){b.onclick=function(e){e.stopPropagation();var arr=getDcRules();arr.splice(x,1);localStorage.setItem(DC_LS,JSON.stringify(arr));renderDcRules();_saveRulesToServer('mes_chk_dc',arr)}})(i);d.appendChild(b);c.appendChild(d)})}
function addDcRule(){var cond=document.getElementById('dcCond').value,hook=document.getElementById('dcHook').value.trim();if(!hook)return;var rules=getDcRules();rules.push({cond:(/^\d+$/.test(cond)?Number(cond):cond),hook:hook});localStorage.setItem(DC_LS,JSON.stringify(rules));document.getElementById('dcHook').value='';renderDcRules();_saveRulesToServer('mes_chk_dc',rules)}

async function testNtfy(){var rules=getNtfyRules();var room=rules.length>0?rules[0].room:document.getElementById('ntfyRoom').value.trim();if(!room)return;try{await fetch('https://ntfy.sh/'+room,{method:'POST',headers:{'Title':'Test','Tags':'test'},body:document.getElementById('ntfyTestMsg').value||'테스트'});showToast('전송')}catch(e){showToast('실패')}}
async function testTelegram(){var rules=getTgRules();if(!rules.length)return;try{await fetch('https://api.telegram.org/bot8367539669:AAFzZeMULV8B4adNROtENsUc6wr0MvLpSi0/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:rules[0].chatId,text:'✅테스트'})});showToast('전송')}catch(e){showToast('실패')}}
async function testDiscord(){var rules=getDcRules();if(!rules.length)return;try{await fetch(rules[0].hook,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:'✅테스트'})});showToast('전송')}catch(e){showToast('실패')}}

async function _saveRulesToServer(cg,rules){var json=JSON.stringify(rules);try{await fetch(SB_URL+'/rest/v1/common_code?code_group=eq.'+cg,{method:'DELETE',headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});if(rules.length){await fetch(SB_URL+'/rest/v1/common_code',{method:'POST',headers:{'Content-Type':'application/json','apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY,'Prefer':'return=representation'},body:JSON.stringify({code_group:cg,code_value:json,sort_order:0})})}}catch(e){console.log('서버저장실패('+cg+'):',e)}}
async function _loadRulesFromServer(cg,lsKey){try{var res=await fetch(SB_URL+'/rest/v1/common_code?select=*&code_group=eq.'+cg+'&limit=1',{headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});if(res.ok){var data=await res.json();if(data&&data.length&&data[0].code_value){localStorage.setItem(lsKey,data[0].code_value);return true}}}catch(e){console.log('서버로드실패('+cg+'):',e)}return false}
async function _saveAllRulesToServer(){await _saveRulesToServer('mes_chk_ntfy',getNtfyRules());await _saveRulesToServer('mes_chk_tg',getTgRules());await _saveRulesToServer('mes_chk_dc',getDcRules());await _saveRulesToServer('mes_work_settings',[settings]);await _saveRulesToServer('mes_chk_items',[getChkItems()])}
async function _loadAllRulesFromServer(){
  await _loadRulesFromServer('mes_chk_ntfy',NTFY_LS);
  await _loadRulesFromServer('mes_chk_tg',TG_LS);
  await _loadRulesFromServer('mes_chk_dc',DC_LS);
  var loaded=await _loadRulesFromServer('mes_work_settings','mes_settings_json');
  if(loaded){try{var arr=JSON.parse(localStorage.getItem('mes_settings_json')||'[]');if(arr&&arr.length)settings=Object.assign({},settings,arr[0])}catch(e){}}
  else{var l=localStorage.getItem('mes_settings');if(l)try{settings=Object.assign({},settings,JSON.parse(l))}catch(e){}}
  var loaded2=await _loadRulesFromServer('mes_chk_items','mes_chk_items_srv');
  if(loaded2){
    try{
      var arr2=JSON.parse(localStorage.getItem('mes_chk_items_srv')||'[]');
      if(arr2&&arr2.length&&arr2[0]&&(arr2[0].dim||arr2[0].mat||arr2[0].def||arr2[0].urg)){
        localStorage.setItem(CHK_ITEMS_LS,JSON.stringify(arr2[0]));
      }
    }catch(e){}
  }
  renderNtfyRules();renderTgRules();renderDcRules();
}

var NTFY_LS='MES_NTFY_RULES',TG_LS='MES_TG_RULES',DC_LS='MES_DC_RULES';
function getNtfyRules(){try{return JSON.parse(localStorage.getItem(NTFY_LS)||'[]')}catch(e){return[]}}
function getTgRules(){try{return JSON.parse(localStorage.getItem(TG_LS)||'[]')}catch(e){return[]}}
function getDcRules(){try{return JSON.parse(localStorage.getItem(DC_LS)||'[]')}catch(e){return[]}}

async function saveAllSettings(){
  showToast('⏳ 서버 저장중...');
  localStorage.setItem('mes_settings',JSON.stringify(settings));
  try{
    await _saveAllRulesToServer();
    showToast('✅ 서버에 저장됨 (ntfy·텔레그램·디스코드·점검항목)',4000);
  }catch(e){
    console.log(e);
    showToast('⚠️ 서버 저장실패 · 로컬에만 저장됨',4000);
  }
}
async function loadSettings(){await _loadAllRulesFromServer();renderNtfyRules();renderTgRules();renderDcRules();renderCiTabs();renderCiList();document.getElementById('sbUrl').value=maskStr(SB_URL);document.getElementById('sbKey').value=maskStr(SB_KEY);if(settings.telegram&&settings.telegram.token)document.getElementById('tgToken').value=maskStr(settings.telegram.token)}

async function checkConnections(){var grid=document.getElementById('connGrid');var checks=[{name:'Supabase',fn:async function(){return(await sbGet('machine_status','select=id&limit=1'))!==null}},{name:'ntfy',fn:async function(){try{return(await fetch('https://ntfy.sh/health')).ok}catch(e){return false}}},{name:'비가동집계',fn:async function(){var t=new Date();var ymd=t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');var d=await sbGet('daily_downtime','select=updated_at&ymd=eq.'+ymd+'&order=updated_at.desc&limit=1');if(!d||!d.length)return false;return(Date.now()-new Date(d[0].updated_at).getTime())/60000<15}},{name:'MES DB',fn:async function(){var d=await sbGet('machine_status','select=updated_at&order=updated_at.desc&limit=1');if(!d||!d.length)return false;return(Date.now()-new Date(d[0].updated_at).getTime())/60000<15}}];var html='';checks.forEach(function(c){html+='<div class="conn-item"><div class="conn-dot wait"></div><div><div class="ci-name">'+c.name+'</div><div class="ci-status">…</div></div></div>'});grid.innerHTML=html;for(var i=0;i<checks.length;i++){try{var ok=await checks[i].fn();var dots=grid.querySelectorAll('.conn-dot'),stats=grid.querySelectorAll('.ci-status');if(ok===null){dots[i].className='conn-dot wait';stats[i].textContent='미설정'}else if(ok){dots[i].className='conn-dot ok';stats[i].textContent='연결'}else{dots[i].className='conn-dot fail';stats[i].textContent='실패'}}catch(e){grid.querySelectorAll('.conn-dot')[i].className='conn-dot fail';grid.querySelectorAll('.ci-status')[i].textContent='오류'}}}


async function init(){try{localStorage.removeItem('MES_CHK_ITEMS_VER')}catch(e){}await loadSettings();await loadMonitor();checkConnections()}
setInterval(function(){timer--;if(timer<=0)loadMonitor();document.getElementById('countdown').textContent='갱신:'+Math.floor(timer/60)+':'+String(timer%60).padStart(2,'0')},1000);
init();
</script>
</body>
</html>
