#!/usr/bin/env python3
"""
lot_tracking_tj.html 자동 패치 스크립트

기능: 생산 이동등록 시 미사용 소재 선택하면
      출발지를 소재입고 시 등록된 업체명(departure)으로 자동 선택
      도착지를 '태진다이텍'으로 자동 선택

사용법:
  python3 apply_patch.py
  (lot_tracking_tj.html 과 같은 폴더에서 실행)
"""
import os, sys, shutil
from datetime import datetime

FILE = "lot_tracking_tj.html"

if not os.path.exists(FILE):
    print(f"❌ {FILE} 파일을 찾을 수 없습니다.")
    print(f"   이 스크립트를 {FILE} 과 같은 폴더에서 실행하세요.")
    sys.exit(1)

# 백업
backup = f"{FILE}.bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
shutil.copy2(FILE, backup)
print(f"✅ 백업: {backup}")

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

old_text = """  _selectedUnusedLot._mappedModels=mappedModels;
  _selectedUnusedLot._lot=lot;
  _selectedUnusedLot._matCustomer=matCustomer;
  _selectedUnusedLot._matMatches=matMatches;

  showToast('✅ 소재 선택: '+lot);
  if(navigator.vibrate)navigator.vibrate([50,30,50]);"""

new_text = """  _selectedUnusedLot._mappedModels=mappedModels;
  _selectedUnusedLot._lot=lot;
  _selectedUnusedLot._matCustomer=matCustomer;
  _selectedUnusedLot._matMatches=matMatches;

  // ★ 소재입고 출발지 자동 선택 (material_upload.html 등록 시 departure 활용)
  if(h.departure){
    const fromIdx=cats.findIndex(c=>c.name==='출발지');
    if(fromIdx>=0){
      savedSelections['출발지']=h.departure;
      const fromSel=document.getElementById('sel_'+fromIdx);
      if(fromSel){
        let found=false;
        for(let o of fromSel.options){if(o.value===h.departure){fromSel.value=h.departure;found=true;break}}
        if(!found){const opt=document.createElement('option');opt.value=h.departure;opt.textContent=h.departure;fromSel.appendChild(opt);fromSel.value=h.departure}
      }
    }
  }
  // 도착지 자동 선택: 태진다이텍
  {
    const toIdx=cats.findIndex(c=>c.name==='도착지');
    if(toIdx>=0){
      savedSelections['도착지']='태진다이텍';
      const toSel=document.getElementById('sel_'+toIdx);
      if(toSel){for(let o of toSel.options){if(o.value==='태진다이텍'){toSel.value='태진다이텍';break}}}
    }
  }

  showToast('✅ 소재 선택: '+lot);
  if(navigator.vibrate)navigator.vibrate([50,30,50]);"""

count = content.count(old_text)

if count == 0:
    # 이미 패치 적용 여부 확인
    if "소재입고 출발지 자동 선택" in content:
        print("ℹ️  이미 패치가 적용되어 있습니다.")
        os.remove(backup)
        sys.exit(0)
    
    print("❌ 패치 대상 텍스트를 찾을 수 없습니다.")
    print("   파일 버전이 다를 수 있습니다.")
    print()
    print("   수동 패치 방법:")
    print("   1. lot_tracking_tj.html 을 에디터로 열기")
    print("   2. '_selectedUnusedLot._matMatches=matMatches;' 검색")
    print("   3. 그 아래 showToast 줄 바로 위에 아래 코드 삽입:")
    print()
    print("   // ★ 소재입고 출발지 자동 선택")
    print("   if(h.departure){")
    print("     const fromIdx=cats.findIndex(c=>c.name==='출발지');")
    print("     if(fromIdx>=0){")
    print("       savedSelections['출발지']=h.departure;")
    print("       const fromSel=document.getElementById('sel_'+fromIdx);")
    print("       if(fromSel){")
    print("         let found=false;")
    print("         for(let o of fromSel.options){if(o.value===h.departure){fromSel.value=h.departure;found=true;break}}")
    print("         if(!found){const opt=document.createElement('option');opt.value=h.departure;opt.textContent=h.departure;fromSel.appendChild(opt);fromSel.value=h.departure}")
    print("       }")
    print("     }")
    print("   }")
    print("   // 도착지 자동 선택: 태진다이텍")
    print("   {")
    print("     const toIdx=cats.findIndex(c=>c.name==='도착지');")
    print("     if(toIdx>=0){")
    print("       savedSelections['도착지']='태진다이텍';")
    print("       const toSel=document.getElementById('sel_'+toIdx);")
    print("       if(toSel){for(let o of toSel.options){if(o.value==='태진다이텍'){toSel.value='태진다이텍';break}}}")
    print("     }")
    print("   }")
    sys.exit(1)

result = content.replace(old_text, new_text, 1)

with open(FILE, "w", encoding="utf-8") as f:
    f.write(result)

print(f"✅ 패치 완료! ({count}건 교체)")
print()
print("   변경 내용:")
print("   ✓ 미사용 소재 선택 시 출발지 자동 선택 (소재입고 departure 활용)")
print("   ✓ 도착지 '태진다이텍' 자동 선택")
print()
print("   Git push 명령:")
print("   git add lot_tracking_tj.html")
print("   git commit -m '생산: 소재 선택 시 출발지/도착지 자동 선택'")
print("   git push")
