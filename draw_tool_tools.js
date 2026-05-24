// ===========================================================
//  draw_tool_tools.js  —  [2/2]
//  복사/이동/회전/대칭/배열, 폴리라인/다각형/타원/텍스트,
//  레이어/선종류/해치, DXF/패닝/측정, OSNAP 설정
//  (draw_tool.html 에서 분리. core 다음에 로드)
// ===========================================================
// ====== Rev.10.0 추가 모듈 (E/F/G + Extra) ======
// ====== E안: 복사 / 이동 / 회전 / 대칭 / 배열 / 스케일 (Rev.10.0) ======
// 이 모듈은 draw_tool_v10_0.html의 전역 변수(shapes, shapeIdSeq, mmPerPixel, etc.)와
// 함수(redrawDraw, updateCount, getCanvasPoint, findShapeAtPoint, snapshotShape, moveShapeTo, hitTest)를
// 그대로 사용합니다.

// 작업 상태 (다단계 클릭 처리)
let copyState = null;     // {phase: 'select'|'base'|'target', sourceShapes, basePt}
let moveState = null;     // {phase, sourceShapes, basePt}
let rotateState = null;   // {phase, sourceShapes, basePt, refAng}
let mirrorState = null;   // {phase, sourceShapes, p1}
let scaleState = null;    // {phase, sourceShapes, basePt}
let arrayState = null;    // {phase, sourceShapes}

// 도형 깊은 복사 (id 새로 할당)
function cloneShape(s) {
  const c = JSON.parse(JSON.stringify(s));
  c.id = ++shapeIdSeq;
  return c;
}

// 도형 위치 변환 (선형: ax + dx, ay + dy)
function transformShape(s, fn) {
  if (s.type === 'line' || s.type === 'rect' || s.type === 'circle') {
    const p1 = fn(s.p1.x, s.p1.y);
    const p2 = fn(s.p2.x, s.p2.y);
    s.p1.x = Math.round(p1.x); s.p1.y = Math.round(p1.y);
    s.p2.x = Math.round(p2.x); s.p2.y = Math.round(p2.y);
  } else if (s.type === 'arc') {
    const c = fn(s.cx, s.cy);
    s.cx = c.x; s.cy = c.y;
    if (s.p1) {
      const p1 = fn(s.p1.x, s.p1.y);
      s.p1.x = Math.round(p1.x); s.p1.y = Math.round(p1.y);
    }
    if (s.p2) {
      const p2 = fn(s.p2.x, s.p2.y);
      s.p2.x = Math.round(p2.x); s.p2.y = Math.round(p2.y);
    }
  } else if (s.type === 'ellipse') {
    const c = fn(s.cx, s.cy);
    s.cx = c.x; s.cy = c.y;
  } else if (s.type && s.type.startsWith('dim-')) {
    if (s.p1) { const p1 = fn(s.p1.x, s.p1.y); s.p1.x = p1.x; s.p1.y = p1.y; }
    if (s.p2) { const p2 = fn(s.p2.x, s.p2.y); s.p2.x = p2.x; s.p2.y = p2.y; }
    if (s.offset) { const o = fn(s.offset.x, s.offset.y); s.offset.x = o.x; s.offset.y = o.y; }
  } else if ((s.type === 'polyline' || s.type === 'fill') && Array.isArray(s.points)) {
    // Rev.15.8: 폴리라인/채움 - 모든 점 변환 (회전·복사·대칭·배율 지원)
    s.points = s.points.map(pt => { const q = fn(pt.x, pt.y); return { x: q.x, y: q.y }; });
  } else if (s.type === 'point' && s.p1) {
    const p1 = fn(s.p1.x, s.p1.y);
    s.p1.x = p1.x; s.p1.y = p1.y;
  }
}

// 회전 변환 (각도 라디안, 중심점)
function rotateShape(s, cx, cy, ang) {
  const cos = Math.cos(ang), sin = Math.sin(ang);
  transformShape(s, (x, y) => {
    const dx = x - cx, dy = y - cy;
    return { x: cx + dx*cos - dy*sin, y: cy + dx*sin + dy*cos };
  });
  // 호의 각도도 회전
  if (s.type === 'arc') {
    s.startAngle += ang;
    s.endAngle += ang;
  }
}

// 스케일 변환
function scaleShape(s, cx, cy, factor) {
  transformShape(s, (x, y) => {
    return { x: cx + (x-cx)*factor, y: cy + (y-cy)*factor };
  });
  if (s.type === 'arc' || s.type === 'circle') {
    if (s.r) s.r *= factor;
  }
  if (s.strokeWidth) s.strokeWidth = Math.max(1, s.strokeWidth);
}

// 대칭 변환 (두 점이 정의하는 직선 기준)
function mirrorShape(s, p1, p2) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len2 = dx*dx + dy*dy;
  if (len2 < 1e-6) return;
  transformShape(s, (x, y) => {
    const t = ((x - p1.x)*dx + (y - p1.y)*dy) / len2;
    const fx = p1.x + t*dx, fy = p1.y + t*dy;
    return { x: 2*fx - x, y: 2*fy - y };
  });
  // 호: ccw 반전 + 각도 반사
  if (s.type === 'arc') {
    s.ccw = !s.ccw;
    const ang = Math.atan2(dy, dx);
    s.startAngle = 2*ang - s.startAngle;
    s.endAngle = 2*ang - s.endAngle;
  }
}

// ====== COPY ======
function handleCopyClick(p) {
  if (!copyState) {
    // 선택 도형 사용
    if (selectedIds.size === 0) {
      const t = findShapeAtPoint(p, 15);
      if (!t) { cmdLog('  COPY: 복사할 도형을 클릭하세요.', 'error'); return; }
      selectedIds.add(t.id);
      updateSelStat();
    }
    copyState = { phase: 'base', sourceShapes: Array.from(selectedIds).map(id => shapes.find(s => s.id === id)).filter(Boolean) };
    cmdLog(`  COPY: ${copyState.sourceShapes.length}개 선택됨. 기준점을 클릭하세요.`, 'prompt');
  } else if (copyState.phase === 'base') {
    copyState.basePt = {x:p.x, y:p.y};
    copyState.phase = 'target';
    cmdLog('  COPY: 목적점을 클릭하세요 (반복 가능 / ESC=종료).', 'prompt');
  } else {
    const dx = p.x - copyState.basePt.x;
    const dy = p.y - copyState.basePt.y;
    const newShapes = copyState.sourceShapes.map(s => {
      const c = cloneShape(s);
      transformShape(c, (x, y) => ({x: x+dx, y: y+dy}));
      return c;
    });
    newShapes.forEach(s => shapes.push(s));
    redoStack = []; pushHistory();
    redrawDraw(); updateCount();
    const dxMm = (dx * mmPerPixel).toFixed(1);
    const dyMm = (dy * mmPerPixel).toFixed(1);
    cmdLog(`  COPY: ΔX=${dxMm}mm, ΔY=${dyMm}mm 복사 완료. 계속 클릭하면 추가 복사.`, 'system');
    // 캐드 동작: 계속 복사 모드 유지
  }
}

// ====== MOVE ======
function handleMoveClick(p) {
  if (!moveState) {
    if (selectedIds.size === 0) {
      const t = findShapeAtPoint(p, 15);
      if (!t) { cmdLog('  MOVE: 이동할 도형을 클릭하세요.', 'error'); return; }
      selectedIds.add(t.id);
      updateSelStat();
    }
    moveState = { phase: 'base', sourceShapes: Array.from(selectedIds).map(id => shapes.find(s => s.id === id)).filter(Boolean) };
    cmdLog(`  MOVE: ${moveState.sourceShapes.length}개 선택됨. 기준점 클릭.`, 'prompt');
  } else if (moveState.phase === 'base') {
    moveState.basePt = {x:p.x, y:p.y};
    moveState.phase = 'target';
    cmdLog('  MOVE: 목적점 클릭.', 'prompt');
  } else {
    const dx = p.x - moveState.basePt.x;
    const dy = p.y - moveState.basePt.y;
    moveState.sourceShapes.forEach(s => {
      transformShape(s, (x, y) => ({x: x+dx, y: y+dy}));
    });
    redoStack = []; pushHistory();
    redrawDraw(); updateCount();
    cmdLog(`  MOVE: 완료.`, 'system');
    moveState = null;
    selectedIds.clear();
    updateSelStat();
  }
}

// ====== ROTATE ======
function handleRotateClick(p) {
  if (!rotateState) {
    if (selectedIds.size === 0) {
      const t = findShapeAtPoint(p, 15);
      if (!t) { cmdLog('  ROTATE: 회전할 도형을 클릭하세요.', 'error'); return; }
      selectedIds.add(t.id);
      updateSelStat();
    }
    rotateState = { phase: 'base', sourceShapes: Array.from(selectedIds).map(id => shapes.find(s => s.id === id)).filter(Boolean) };
    cmdLog(`  ROTATE: ${rotateState.sourceShapes.length}개 선택됨. 회전 중심점 클릭.`, 'prompt');
  } else if (rotateState.phase === 'base') {
    rotateState.basePt = {x:p.x, y:p.y};
    rotateState.phase = 'angle';
    // 각도 입력 (또는 점 클릭으로 각도 결정)
    const angStr = prompt('회전 각도를 입력하세요 (도, +반시계 / -시계):', '90');
    if (!angStr) { rotateState = null; return; }
    const angDeg = parseFloat(angStr);
    if (isNaN(angDeg)) { cmdLog('  잘못된 각도.', 'error'); rotateState = null; return; }
    const angRad = -angDeg * Math.PI / 180;  // 화면 좌표(Y 아래)에서는 부호 반전
    rotateState.sourceShapes.forEach(s => {
      rotateShape(s, rotateState.basePt.x, rotateState.basePt.y, angRad);
    });
    redoStack = []; pushHistory();
    redrawDraw(); updateCount();
    cmdLog(`  ROTATE: ${angDeg}° 회전 완료.`, 'system');
    rotateState = null;
    selectedIds.clear();
    updateSelStat();
  }
}

// ====== MIRROR ======
function handleMirrorClick(p) {
  if (!mirrorState) {
    if (selectedIds.size === 0) {
      const t = findShapeAtPoint(p, 15);
      if (!t) { cmdLog('  MIRROR: 대칭할 도형을 클릭하세요.', 'error'); return; }
      selectedIds.add(t.id);
      updateSelStat();
    }
    mirrorState = { phase: 'p1', sourceShapes: Array.from(selectedIds).map(id => shapes.find(s => s.id === id)).filter(Boolean) };
    cmdLog(`  MIRROR: ${mirrorState.sourceShapes.length}개 선택됨. 대칭선 첫 점.`, 'prompt');
  } else if (mirrorState.phase === 'p1') {
    mirrorState.p1 = {x:p.x, y:p.y};
    mirrorState.phase = 'p2';
    cmdLog('  MIRROR: 대칭선 둘째 점 클릭.', 'prompt');
  } else {
    const p2 = {x:p.x, y:p.y};
    const keepOrig = confirm('원본을 유지하시겠습니까?\n[확인]=원본+복사본 (기본)\n[취소]=원본 삭제');
    
    if (keepOrig) {
      // 복사본 만들어서 대칭
      mirrorState.sourceShapes.forEach(s => {
        const c = cloneShape(s);
        mirrorShape(c, mirrorState.p1, p2);
        shapes.push(c);
      });
    } else {
      // 원본을 그대로 대칭
      mirrorState.sourceShapes.forEach(s => {
        mirrorShape(s, mirrorState.p1, p2);
      });
    }
    
    redoStack = []; pushHistory();
    redrawDraw(); updateCount();
    cmdLog(`  MIRROR: 완료.`, 'system');
    mirrorState = null;
    selectedIds.clear();
    updateSelStat();
  }
}

// ====== SCALE ======
function handleScaleClick(p) {
  if (!scaleState) {
    if (selectedIds.size === 0) {
      const t = findShapeAtPoint(p, 15);
      if (!t) { cmdLog('  SCALE: 크기 조정할 도형을 클릭하세요.', 'error'); return; }
      selectedIds.add(t.id);
      updateSelStat();
    }
    scaleState = { phase: 'base', sourceShapes: Array.from(selectedIds).map(id => shapes.find(s => s.id === id)).filter(Boolean) };
    cmdLog(`  SCALE: ${scaleState.sourceShapes.length}개 선택됨. 기준점 클릭.`, 'prompt');
  } else if (scaleState.phase === 'base') {
    scaleState.basePt = {x:p.x, y:p.y};
    const fStr = prompt('배율을 입력하세요 (예: 2 = 2배, 0.5 = 절반):', '2');
    if (!fStr) { scaleState = null; return; }
    const f = parseFloat(fStr);
    if (isNaN(f) || f <= 0) { cmdLog('  잘못된 배율.', 'error'); scaleState = null; return; }
    scaleState.sourceShapes.forEach(s => {
      scaleShape(s, scaleState.basePt.x, scaleState.basePt.y, f);
    });
    redoStack = []; pushHistory();
    redrawDraw(); updateCount();
    cmdLog(`  SCALE: ${f}배 완료.`, 'system');
    scaleState = null;
    selectedIds.clear();
    updateSelStat();
  }
}

// ====== ARRAY (격자/원형) ======
function handleArrayCommand() {
  if (selectedIds.size === 0) {
    cmdLog('  ARRAY: 먼저 SELECT로 도형 선택 후 사용.', 'error');
    return;
  }
  const mode = prompt('배열 종류 선택:\n  R = 직사각형 격자\n  P = 원형(폴라)\n\nR 또는 P 입력:', 'R');
  if (!mode) return;
  const m = mode.trim().toUpperCase();
  const sources = Array.from(selectedIds).map(id => shapes.find(s => s.id === id)).filter(Boolean);
  
  if (m === 'R') {
    const rowStr = prompt('행 개수 (세로):', '2');
    const colStr = prompt('열 개수 (가로):', '2');
    const dxStr = prompt('열 간격 (mm, 가로):', '50');
    const dyStr = prompt('행 간격 (mm, 세로):', '50');
    const rows = parseInt(rowStr), cols = parseInt(colStr);
    const dxMm = parseFloat(dxStr), dyMm = parseFloat(dyStr);
    if (!rows || !cols || isNaN(dxMm) || isNaN(dyMm)) { cmdLog('  잘못된 입력.', 'error'); return; }
    const dx = dxMm / mmPerPixel, dy = dyMm / mmPerPixel;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 && c === 0) continue;
        sources.forEach(s => {
          const cs = cloneShape(s);
          transformShape(cs, (x,y) => ({x: x + c*dx, y: y + r*dy}));
          shapes.push(cs);
        });
      }
    }
    const total = rows * cols * sources.length;
    cmdLog(`  ARRAY: ${rows}×${cols} 격자 완료 (총 ${total}개).`, 'system');
  } else if (m === 'P') {
    const nStr = prompt('항목 개수:', '6');
    const totalAngStr = prompt('전체 각도 (도, 기본 360):', '360');
    const n = parseInt(nStr);
    const totalAng = parseFloat(totalAngStr);
    if (!n || isNaN(totalAng)) { cmdLog('  잘못된 입력.', 'error'); return; }
    cmdLog(`  ARRAY-P: 중심점을 클릭하세요.`, 'prompt');
    arrayState = { phase: 'center', sources, n, totalAng };
    return;
  } else {
    cmdLog('  잘못된 배열 종류.', 'error');
  }
  
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  selectedIds.clear();
  updateSelStat();
}

function handleArrayClick(p) {
  if (!arrayState || arrayState.phase !== 'center') return;
  const cx = p.x, cy = p.y;
  const step = (arrayState.totalAng / arrayState.n) * Math.PI / 180;
  for (let i = 1; i < arrayState.n; i++) {
    arrayState.sources.forEach(s => {
      const cs = cloneShape(s);
      rotateShape(cs, cx, cy, -i * step);  // 화면 좌표 Y가 아래로 + 라서 부호 반전
      shapes.push(cs);
    });
  }
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  cmdLog(`  ARRAY-P: ${arrayState.n}개 원형 배열 완료.`, 'system');
  arrayState = null;
  selectedIds.clear();
  updateSelStat();
}

// ====== 거리복사 (DISTANCE COPY, Rev.11.49) ======
// 점/선 선택 → 간격 여러개 입력(콤마) → 방향(상하좌우) → 각 간격 위치에 복사
// 대각선 선은 수평/수직선으로 펴서 복사, 길이는 원본의 1.5배(원본 중점 기준 양쪽)
// Rev.11.58: 거리복사 - prompt 대신 화면 모달 사용 (GitHub Pages에서 prompt 차단됨)
let _dcDir = 'D'; // 선택된 방향

function handleDistanceCopyCommand() {
  if (selectedIds.size === 0) {
    cmdLog('  거리복사: 먼저 SELECT(S)로 점 또는 선을 선택하세요.', 'error');
    return;
  }
  const sources = Array.from(selectedIds).map(id => shapes.find(s => s.id === id)).filter(Boolean);
  const valid = sources.filter(s => s.type === 'line' || s.type === 'point');
  if (valid.length === 0) {
    cmdLog('  거리복사: 점 또는 선만 지원합니다.', 'error');
    return;
  }
  // 모달 표시
  _dcDir = 'D';
  updateDcDirButtons();
  document.getElementById('distCopyModal').style.display = 'flex';
  setTimeout(() => { const g = document.getElementById('dcGaps'); if (g){ g.focus(); g.select(); } }, 50);
}

function closeDistCopyModal() {
  document.getElementById('distCopyModal').style.display = 'none';
}

function updateDcDirButtons() {
  document.querySelectorAll('.dc-dir').forEach(b => {
    const on = b.dataset.dir === _dcDir;
    b.style.background = on ? '#27ae60' : '#3a3a3a';
    b.style.borderColor = on ? '#2ecc71' : '#666';
  });
}

function runDistCopy() {
  const gapStr = document.getElementById('dcGaps').value;
  const gaps = gapStr.split(/[,\s]+/).map(v => parseFloat(v)).filter(v => !isNaN(v) && v !== 0);
  if (gaps.length === 0) { cmdLog('  거리복사: 유효한 간격이 없습니다.', 'error'); return; }

  const sources = Array.from(selectedIds).map(id => shapes.find(s => s.id === id)).filter(Boolean);
  const valid = sources.filter(s => s.type === 'line' || s.type === 'point');
  if (valid.length === 0) { cmdLog('  거리복사: 대상이 없습니다.', 'error'); return; }

  const dir = _dcDir;
  let ux = 0, uy = 0, horizontal = true;
  if (dir === 'U') { uy = -1; horizontal = true; }
  else if (dir === 'D') { uy = 1; horizontal = true; }
  else if (dir === 'L') { ux = -1; horizontal = false; }
  else if (dir === 'R') { ux = 1; horizontal = false; }

  const keepAngle = document.getElementById('dcKeepAngle')?.checked;

  let madeCount = 0;
  valid.forEach(src => {
    gaps.forEach(gapMm => {
      const gap = gapMm / mmPerPixel; // mm → px
      const cs = cloneShape(src);

      if (src.type === 'line' && keepAngle) {
        // Rev.11.59: 각도 유지(평행 복사) — 선에 수직으로 간격만큼, 기울기·길이 그대로
        const dx = src.p2.x - src.p1.x, dy = src.p2.y - src.p1.y;
        const len = Math.hypot(dx, dy) || 1;
        // 선의 단위 수직벡터 (법선)
        let nx = -dy / len, ny = dx / len;
        // 방향(위/아래/좌/우)에 맞게 법선 부호 결정
        // 위/아래: 법선의 y성분이 원하는 방향(uy)과 같도록 / 좌/우: x성분이 ux와 같도록
        if (horizontal) {            // 위(uy=-1)/아래(uy=1)
          if (Math.sign(ny) !== Math.sign(uy) && ny !== 0) { nx = -nx; ny = -ny; }
          else if (ny === 0) { ny = uy; nx = 0; } // 수평선이면 그냥 위/아래로
        } else {                     // 좌(ux=-1)/우(ux=1)
          if (Math.sign(nx) !== Math.sign(ux) && nx !== 0) { nx = -nx; ny = -ny; }
          else if (nx === 0) { nx = ux; ny = 0; } // 수직선이면 그냥 좌/우로
        }
        transformShape(cs, (x,y) => ({x: x + nx*gap, y: y + ny*gap}));
      } else if (src.type === 'line') {
        // 기존: 대각선은 수평/수직선으로 펴서 복사(1.5배)
        const dx = src.p2.x - src.p1.x, dy = src.p2.y - src.p1.y;
        const len = Math.hypot(dx, dy);
        const isDiagonal = Math.abs(dx) > 1e-6 && Math.abs(dy) > 1e-6;
        if (isDiagonal) {
          const proj1 = src.p1.x*ux + src.p1.y*uy;
          const proj2 = src.p2.x*ux + src.p2.y*uy;
          const base = (proj1 >= proj2) ? src.p1 : src.p2;
          const newLen = len * 1.5;
          if (horizontal) {
            cs.p1 = {x: Math.round(base.x), y: Math.round(base.y)};
            cs.p2 = {x: Math.round(base.x + newLen), y: Math.round(base.y)};
          } else {
            cs.p1 = {x: Math.round(base.x), y: Math.round(base.y)};
            cs.p2 = {x: Math.round(base.x), y: Math.round(base.y + newLen)};
          }
        }
        transformShape(cs, (x,y) => ({x: x + ux*gap, y: y + uy*gap}));
      } else if (src.type === 'point') {
        cs.p1 = {x: Math.round(src.p1.x + ux*gap), y: Math.round(src.p1.y + uy*gap)};
      }
      shapes.push(cs);
      madeCount++;
    });
  });

  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  selectedIds.clear();
  updateSelStat();
  closeDistCopyModal();
  const dirName = {U:'위', D:'아래', L:'왼쪽', R:'오른쪽'}[dir];
  const modeName = keepAngle ? '각도유지(평행)' : '수평펴기';
  cmdLog(`  거리복사[${modeName}]: ${dirName} 방향, 간격 [${gaps.join(', ')}]mm → ${madeCount}개 복사 완료.`, 'system');
}

// ====== 도구 ESC 시 상태 리셋용 ======
function resetCopyTransformStates() {
  copyState = null; moveState = null; rotateState = null;
  mirrorState = null; scaleState = null; arrayState = null;
}
// ====== F안: 폴리라인 / 다각형 / 타원 / 좌표입력 / 텍스트 (Rev.10.0) ======

// ====== 폴리라인 ======
let polylineState = null;  // {points: [{x,y}, ...]}

function handlePolylineClick(p) {
  if (!polylineState) {
    polylineState = { points: [{x:p.x, y:p.y}] };
    cmdLog('  POLYLINE: 다음 점 클릭 / 더블클릭 또는 ESC=완료 / C=닫기', 'prompt');
  } else {
    polylineState.points.push({x:p.x, y:p.y});
    cmdLog(`  POLYLINE: ${polylineState.points.length}개 점. 계속 클릭 또는 ESC/더블클릭=완료`, 'prompt');
  }
}

function finishPolyline(closed) {
  if (!polylineState || polylineState.points.length < 2) {
    polylineState = null;
    return;
  }
  const stroke = document.getElementById('strokeColor').value;
  const strokeWidth = parseInt(document.getElementById('strokeWidth').value);
  
  const layer = currentLayer || 'default';
  shapes.push({
    id: ++shapeIdSeq, type: 'polyline',
    points: polylineState.points.map(p => ({x:p.x, y:p.y})),
    closed: closed,
    stroke, strokeWidth,
    layer
  });
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  cmdLog(`  POLYLINE: ${polylineState.points.length}개 점 (${closed ? '닫힘' : '열림'}) 완료.`, 'system');
  polylineState = null;
}

// 폴리라인 그리기 (drawShape에서 호출)
function drawPolyline(ctx, s, selected) {
  ctx.save();
  ctx.strokeStyle = selected ? '#3498db' : (s.stroke || '#000');
  ctx.lineWidth = s.strokeWidth || 2;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  s.points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  if (s.closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// 폴리라인 BBox
function polylineBoundingBox(s) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  s.points.forEach(p => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  });
  return { minX, minY, maxX, maxY };
}

// ====== 다각형 (POLYGON) - 정n각형 ======
let polygonState = null;  // {n, center}

function handlePolygonCommand() {
  const nStr = prompt('정n각형의 변 개수 (3~20):', '6');
  const n = parseInt(nStr);
  if (!n || n < 3 || n > 20) { cmdLog('  POLYGON: 3~20 사이의 숫자 입력.', 'error'); return; }
  polygonState = { phase: 'center', n };
  cmdLog(`  POLYGON: 정${n}각형. 중심점 클릭.`, 'prompt');
}

function handlePolygonClick(p) {
  if (!polygonState) return;
  if (polygonState.phase === 'center') {
    polygonState.center = {x:p.x, y:p.y};
    polygonState.phase = 'radius';
    cmdLog('  POLYGON: 외접원 반지름 점 클릭.', 'prompt');
  } else {
    const cx = polygonState.center.x, cy = polygonState.center.y;
    const r = Math.hypot(p.x-cx, p.y-cy);
    const startAng = Math.atan2(p.y-cy, p.x-cx);
    const n = polygonState.n;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = startAng + i * (2 * Math.PI / n);
      pts.push({x: Math.round(cx + r*Math.cos(a)), y: Math.round(cy + r*Math.sin(a))});
    }
    const stroke = document.getElementById('strokeColor').value;
    const strokeWidth = parseInt(document.getElementById('strokeWidth').value);
    const layer = currentLayer || 'default';
    shapes.push({
      id: ++shapeIdSeq, type: 'polyline',
      points: pts, closed: true,
      stroke, strokeWidth, layer
    });
    redoStack = []; pushHistory();
    redrawDraw(); updateCount();
    const rMm = (r * mmPerPixel).toFixed(1);
    cmdLog(`  POLYGON: 정${n}각형 (R=${rMm}mm) 완료.`, 'system');
    polygonState = null;
  }
}

// ====== 타원 (ELLIPSE) ======
let ellipseState = null;  // {phase, center, rx}

function handleEllipseClick(p) {
  if (!ellipseState) {
    ellipseState = { phase: 'center', center: {x:p.x, y:p.y} };
    cmdLog('  ELLIPSE: 첫 번째 반지름(가로) 점 클릭.', 'prompt');
  } else if (ellipseState.phase === 'center') {
    // p.x - center.x 가 rx, 방향 결정
    ellipseState.rxPt = {x:p.x, y:p.y};
    ellipseState.phase = 'ry';
    cmdLog('  ELLIPSE: 두 번째 반지름(세로) 점 클릭.', 'prompt');
  } else {
    const cx = ellipseState.center.x, cy = ellipseState.center.y;
    const rx = Math.hypot(ellipseState.rxPt.x - cx, ellipseState.rxPt.y - cy);
    const ry = Math.hypot(p.x - cx, p.y - cy);
    // 타원의 회전각: rxPt 방향
    const rotation = Math.atan2(ellipseState.rxPt.y - cy, ellipseState.rxPt.x - cx);
    const stroke = document.getElementById('strokeColor').value;
    const strokeWidth = parseInt(document.getElementById('strokeWidth').value);
    const layer = currentLayer || 'default';
    shapes.push({
      id: ++shapeIdSeq, type: 'ellipse',
      cx, cy, rx, ry, rotation,
      stroke, strokeWidth, layer
    });
    redoStack = []; pushHistory();
    redrawDraw(); updateCount();
    cmdLog(`  ELLIPSE: rx=${(rx*mmPerPixel).toFixed(1)}mm, ry=${(ry*mmPerPixel).toFixed(1)}mm 완료.`, 'system');
    ellipseState = null;
  }
}

// 회전 가능한 타원 그리기
function drawEllipseRotated(ctx, s, selected) {
  ctx.save();
  ctx.strokeStyle = selected ? '#3498db' : (s.stroke || '#000');
  ctx.lineWidth = s.strokeWidth || 2;
  ctx.beginPath();
  ctx.ellipse(s.cx, s.cy, s.rx, s.ry, s.rotation || 0, 0, Math.PI*2);
  ctx.stroke();
  ctx.restore();
}

// ====== 텍스트 (TEXT) ======
let textState = null;

function handleTextClick(p) {
  if (!textState) {
    textState = { phase: 'pos', pos: {x:p.x, y:p.y} };
    const text = prompt('텍스트 내용을 입력하세요:', '');
    if (!text) { textState = null; return; }
    const sizeStr = prompt('글자 크기(mm):', '5');
    const sizeMm = parseFloat(sizeStr) || 5;
    const sizePx = sizeMm / mmPerPixel;
    const stroke = document.getElementById('strokeColor').value;
    const layer = currentLayer || 'default';
    shapes.push({
      id: ++shapeIdSeq, type: 'text',
      pos: {x:p.x, y:p.y},
      text: text,
      sizePx: sizePx,
      stroke, layer
    });
    redoStack = []; pushHistory();
    redrawDraw(); updateCount();
    cmdLog(`  TEXT: "${text}" 입력 완료.`, 'system');
    textState = null;
  }
}

function drawText(ctx, s, selected) {
  ctx.save();
  ctx.fillStyle = selected ? '#3498db' : (s.stroke || '#000');
  ctx.font = `${s.sizePx || 14}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(s.text || '', s.pos.x, s.pos.y);
  if (selected) {
    const m = ctx.measureText(s.text || '');
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 1;
    ctx.setLineDash([2,2]);
    ctx.strokeRect(s.pos.x - 1, s.pos.y - 1, m.width + 2, (s.sizePx || 14) + 2);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// ====== 좌표 입력 (절대/상대/극좌표) ======
// 명령창에서 도구가 활성 상태일 때, 클릭 대신 좌표를 입력하면 점이 결정됨
// 형식:
//   100,200    → 절대 좌표 X=100mm, Y=200mm
//   @50,30     → 직전 점 기준 +50, +30 mm
//   @100<45    → 직전 점 기준 길이 100mm, 각도 45°
// 캘리브 설정 안되면 1px=1mm

function parseCoordinateInput(text) {
  text = text.trim();
  if (!text) return null;
  
  // 절대 좌표: 100,200
  let m = text.match(/^(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)$/);
  if (m) return { mode: 'abs', x: parseFloat(m[1]), y: parseFloat(m[2]) };
  
  // 상대 좌표: @50,30
  m = text.match(/^@\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)$/);
  if (m) return { mode: 'rel', dx: parseFloat(m[1]), dy: parseFloat(m[2]) };
  
  // 극좌표: @100<45 또는 100<45
  m = text.match(/^@?\s*(-?\d*\.?\d+)\s*<\s*(-?\d*\.?\d+)$/);
  if (m) return { mode: 'polar', len: parseFloat(m[1]), ang: parseFloat(m[2]) };
  
  return null;
}

// 좌표 입력 결과를 화면 px 좌표로 변환
// lastPt: 직전 클릭점 (상대좌표 기준)
function coordToCanvasPoint(parsed, lastPt) {
  if (!parsed) return null;
  if (parsed.mode === 'abs') {
    return { x: parsed.x / mmPerPixel, y: parsed.y / mmPerPixel };
  }
  if (parsed.mode === 'rel') {
    if (!lastPt) return null;
    return { x: lastPt.x + parsed.dx / mmPerPixel, y: lastPt.y - parsed.dy / mmPerPixel };  // Y 반전
  }
  if (parsed.mode === 'polar') {
    const base = lastPt || {x:0, y:0};
    const rad = -parsed.ang * Math.PI / 180;  // 화면 Y 반전
    return {
      x: base.x + (parsed.len / mmPerPixel) * Math.cos(rad),
      y: base.y + (parsed.len / mmPerPixel) * Math.sin(rad)
    };
  }
  return null;
}

// 명령창 좌표 입력 처리 (도구별)
function tryCoordinateInput(text) {
  const parsed = parseCoordinateInput(text);
  if (!parsed) return false;
  
  // 직전 점 = firstClick 또는 폴리라인 마지막 점
  let lastPt = firstClick;
  if (polylineState && polylineState.points.length > 0) {
    lastPt = polylineState.points[polylineState.points.length - 1];
  }
  
  const pt = coordToCanvasPoint(parsed, lastPt);
  if (!pt) return false;
  
  // 가짜 클릭 이벤트 생성하여 현재 도구에 전달
  simulateClick(pt);
  return true;
}

function simulateClick(pt) {
  // drawCanvas의 click 핸들러를 호출하기 위해 가상 좌표로 호출
  // 직접 도구 핸들러 호출이 깔끔
  if (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'arc' ||
      tool === 'fill' || tool === 'calib' || tool === 'axis' ||
      tool === 'trim' || tool === 'extend' || tool === 'fillet' || tool === 'offset' ||
      tool === 'break' || tool === 'breakAtPoint' ||
      tool === 'dimLinear' || tool === 'dimAligned' || tool === 'dimRadius' || 
      tool === 'dimDiameter' || tool === 'dimAngle' ||
      tool === 'copy' || tool === 'movetool' || tool === 'rotate' || 
      tool === 'mirror' || tool === 'scale' ||
      tool === 'polyline' || tool === 'polygon' || tool === 'ellipse' || tool === 'text') {
    // click 이벤트 디스패치
    const rect = drawCanvas.getBoundingClientRect();
    const fakeEvent = new MouseEvent('click', {
      clientX: rect.left + pt.x * zoom,
      clientY: rect.top + pt.y * zoom,
      bubbles: true
    });
    drawCanvas.dispatchEvent(fakeEvent);
  }
}

// ESC로 폴리라인/다각형 종료
function resetDrawingStates() {
  if (polylineState && polylineState.points.length >= 2) {
    finishPolyline(false);
  } else {
    polylineState = null;
  }
  polygonState = null;
  ellipseState = null;
  textState = null;
}
// ====== G안: 레이어 / 선 종류 / 해치 패턴 (Rev.10.0) ======

// 레이어 정의
let layers = [
  { name: 'default',  color: '#000000', visible: true, locked: false, lineType: 'solid' },
  { name: 'outline',  color: '#000000', visible: true, locked: false, lineType: 'solid' },
  { name: 'dim',      color: '#cc0000', visible: true, locked: false, lineType: 'solid' },
  { name: 'hidden',   color: '#888888', visible: true, locked: false, lineType: 'dashed' },
  { name: 'center',   color: '#ff8800', visible: true, locked: false, lineType: 'dashdot' },
  { name: 'phantom',  color: '#666666', visible: true, locked: false, lineType: 'dashdotdot' },
];
let currentLayer = 'default';

// 선 종류별 점선 패턴 (px 단위)
const LINE_TYPES = {
  'solid':       [],
  'dashed':      [10, 5],
  'dotted':      [2, 4],
  'dashdot':     [10, 5, 2, 5],
  'dashdotdot':  [10, 5, 2, 5, 2, 5],
};

// 레이어 찾기
function getLayer(name) {
  return layers.find(l => l.name === name) || layers[0];
}

// 도형 그리기 시 레이어/선종류 적용 (drawShape 확장 시 사용)
function applyLayerStyle(ctx, s) {
  const layer = getLayer(s.layer || 'default');
  if (!layer.visible) return false;
  // 색상은 도형 stroke가 있으면 우선, 아니면 layer 색
  // 사용자 명시적 색상 vs 레이어 색상 우선순위는 도형 stroke 자체로 결정
  ctx.setLineDash(LINE_TYPES[s.lineType || layer.lineType] || []);
  return true;
}

// LAYER 명령 → 모달 표시
function showLayerManager() {
  const modal = document.getElementById('layerModal');
  if (!modal) {
    createLayerModal();
  }
  refreshLayerModal();
  document.getElementById('layerModal').classList.add('show');
}

function createLayerModal() {
  const html = `
    <div class="modal-overlay" id="layerModal">
      <div class="modal" style="max-width:600px;">
        <h3>📚 레이어 관리</h3>
        <div id="layerList" style="max-height:400px; overflow-y:auto;"></div>
        <div class="actions">
          <button id="btnAddLayer" style="background:#27ae60;">+ 새 레이어</button>
          <button id="btnLayerClose">닫기</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  document.getElementById('btnAddLayer').addEventListener('click', addLayer);
  document.getElementById('btnLayerClose').addEventListener('click', () => {
    document.getElementById('layerModal').classList.remove('show');
  });
}

function refreshLayerModal() {
  const list = document.getElementById('layerList');
  if (!list) return;
  let html = `<table style="width:100%; font-size:12px;">
    <tr style="background:#2a2a2a;">
      <th style="padding:6px; text-align:left;">현재</th>
      <th style="padding:6px; text-align:left;">이름</th>
      <th style="padding:6px;">색</th>
      <th style="padding:6px;">선종류</th>
      <th style="padding:6px;">표시</th>
      <th style="padding:6px;">잠금</th>
      <th style="padding:6px;">삭제</th>
    </tr>`;
  layers.forEach((l, i) => {
    const isCurrent = l.name === currentLayer;
    html += `<tr style="background:${isCurrent ? '#3d2f1f' : 'transparent'};">
      <td style="padding:6px;"><input type="radio" name="currentLayer" data-name="${l.name}" ${isCurrent?'checked':''}></td>
      <td style="padding:6px;">${escapeHtml(l.name)}</td>
      <td style="padding:6px;"><input type="color" data-layer="${l.name}" data-prop="color" value="${l.color}"></td>
      <td style="padding:6px;">
        <select data-layer="${l.name}" data-prop="lineType">
          <option value="solid" ${l.lineType==='solid'?'selected':''}>실선</option>
          <option value="dashed" ${l.lineType==='dashed'?'selected':''}>점선</option>
          <option value="dotted" ${l.lineType==='dotted'?'selected':''}>도트</option>
          <option value="dashdot" ${l.lineType==='dashdot'?'selected':''}>일점쇄선</option>
          <option value="dashdotdot" ${l.lineType==='dashdotdot'?'selected':''}>이점쇄선</option>
        </select>
      </td>
      <td style="padding:6px; text-align:center;"><input type="checkbox" data-layer="${l.name}" data-prop="visible" ${l.visible?'checked':''}></td>
      <td style="padding:6px; text-align:center;"><input type="checkbox" data-layer="${l.name}" data-prop="locked" ${l.locked?'checked':''}></td>
      <td style="padding:6px; text-align:center;">
        ${l.name === 'default' ? '-' : `<button data-del="${l.name}" style="background:#c9302c; padding:2px 8px;">×</button>`}
      </td>
    </tr>`;
  });
  html += '</table>';
  list.innerHTML = html;
  
  // 이벤트 바인딩
  list.querySelectorAll('input[name="currentLayer"]').forEach(r => {
    r.addEventListener('change', e => {
      currentLayer = e.target.dataset.name;
      refreshLayerModal();
      updateLayerStatus();
    });
  });
  list.querySelectorAll('[data-layer]').forEach(el => {
    el.addEventListener('change', e => {
      const lname = e.target.dataset.layer;
      const prop = e.target.dataset.prop;
      const layer = getLayer(lname);
      if (prop === 'visible' || prop === 'locked') layer[prop] = e.target.checked;
      else layer[prop] = e.target.value;
      redrawDraw();
    });
  });
  list.querySelectorAll('[data-del]').forEach(b => {
    b.addEventListener('click', e => {
      const name = e.target.dataset.del;
      if (!confirm(`레이어 "${name}" 삭제? (해당 도형은 default로 이동됨)`)) return;
      // 해당 레이어 도형을 default로
      shapes.forEach(s => { if (s.layer === name) s.layer = 'default'; });
      layers = layers.filter(l => l.name !== name);
      if (currentLayer === name) currentLayer = 'default';
      refreshLayerModal();
      updateLayerStatus();
      redrawDraw();
    });
  });
}

function addLayer() {
  const name = prompt('새 레이어 이름:', '');
  if (!name) return;
  if (layers.find(l => l.name === name)) {
    alert('이미 존재하는 이름입니다.');
    return;
  }
  layers.push({ name, color: '#000000', visible: true, locked: false, lineType: 'solid' });
  refreshLayerModal();
  updateLayerStatus();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// 현재 레이어 표시 (헤더 또는 상태바)
function updateLayerStatus() {
  let el = document.getElementById('currentLayerStat');
  if (!el) {
    const header = document.querySelector('header');
    if (header) {
      el = document.createElement('span');
      el.id = 'currentLayerStat';
      el.style.cssText = 'background:#3d2f1f; padding:3px 10px; border-radius:10px; font-size:11px; color:#fff; cursor:pointer;';
      el.title = '레이어 변경 (클릭)';
      header.appendChild(el);
      el.addEventListener('click', showLayerManager);
    }
  }
  if (el) {
    const cl = getLayer(currentLayer);
    el.innerHTML = `📚 <b>${currentLayer}</b> <span style="display:inline-block; width:12px; height:12px; background:${cl.color}; border:1px solid #fff; vertical-align:middle; margin-left:4px;"></span>`;
  }
}

// ====== 해치 패턴 (선택) ======
// 단순 패턴들 (canvas pattern 또는 줄 반복)
const HATCH_PATTERNS = {
  'solid':    { type: 'solid' },
  'lines45':  { type: 'lines', angle: 45, spacing: 8 },
  'lines135': { type: 'lines', angle: 135, spacing: 8 },
  'cross':    { type: 'cross', spacing: 10 },
  'dots':     { type: 'dots', spacing: 6 },
  'ansi31':   { type: 'lines', angle: 45, spacing: 6 },
};

function drawHatchPattern(ctx, fill, points) {
  // 단순 클립 + 패턴 그리기
  if (!points || points.length < 3) return;
  
  const pattern = HATCH_PATTERNS[fill.pattern || 'solid'];
  const color = fill.color || '#000';
  const alpha = (fill.alpha != null ? fill.alpha : 50) / 100;
  
  ctx.save();
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  
  if (!pattern || pattern.type === 'solid') {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fill();
  } else {
    ctx.clip();
    // 바운딩 박스
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => { 
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1;
    
    if (pattern.type === 'lines') {
      const ang = pattern.angle * Math.PI / 180;
      const sp = pattern.spacing;
      const diag = Math.hypot(maxX-minX, maxY-minY);
      const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const nx = -dy, ny = dx;
      const steps = Math.ceil(diag / sp);
      ctx.beginPath();
      for (let i = -steps; i <= steps; i++) {
        const px = cx + nx * i * sp, py = cy + ny * i * sp;
        ctx.moveTo(px - dx*diag, py - dy*diag);
        ctx.lineTo(px + dx*diag, py + dy*diag);
      }
      ctx.stroke();
    } else if (pattern.type === 'cross') {
      const sp = pattern.spacing;
      ctx.beginPath();
      for (let x = Math.floor(minX/sp)*sp; x <= maxX; x += sp) {
        ctx.moveTo(x, minY); ctx.lineTo(x, maxY);
      }
      for (let y = Math.floor(minY/sp)*sp; y <= maxY; y += sp) {
        ctx.moveTo(minX, y); ctx.lineTo(maxX, y);
      }
      ctx.stroke();
    } else if (pattern.type === 'dots') {
      const sp = pattern.spacing;
      for (let x = Math.floor(minX/sp)*sp; x <= maxX; x += sp) {
        for (let y = Math.floor(minY/sp)*sp; y <= maxY; y += sp) {
          ctx.beginPath();
          ctx.arc(x, y, 1, 0, Math.PI*2);
          ctx.fill();
        }
      }
    }
  }
  ctx.restore();
}
// ====== 추가: DXF 내보내기 + 패닝/줌 + 측정도구 (Rev.10.0) ======

// ====== 패닝 / 줌 (마우스 휠=줌, 휠클릭/우클릭 드래그=패닝) ======
let panState = null;

function initPanZoom() {
  const wrap = document.getElementById('canvasWrap');
  if (!wrap) return;
  
  // 휠 줌
  wrap.addEventListener('wheel', e => {
    // Rev.11.37: 분할 모드 + 선 선택됨 → 휠로 분할 수 조절 (줌 대신)
    if (subdivideMode && subdivideTarget){
      e.preventDefault();
      if (e.deltaY < 0) subdivideCount = Math.min(50, subdivideCount + 1);
      else subdivideCount = Math.max(1, subdivideCount - 1);
      drawSubdividePreview();
      return;
    }

    // Rev.13.1: Ctrl+휠 = 배경 독립 확대/축소 (작업영역과 별개 CSS scale)
    //            마우스 위치 기준 zoom-origin → 마우스 아래 지점 고정
    if (e.ctrlKey && bgImage) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : (1 / 1.08);
      bgZoom = Math.max(0.05, Math.min(20.0, bgZoom * factor));

      // 마우스 위치를 bgCanvas 기준 % 로 변환 → transform-origin 설정
      const rect = bgCanvas.getBoundingClientRect();
      bgZoomOriginX = Math.max(0, Math.min(100, Math.round(((e.clientX - rect.left) / rect.width)  * 100)));
      bgZoomOriginY = Math.max(0, Math.min(100, Math.round(((e.clientY - rect.top)  / rect.height) * 100)));
      applyBgZoom();

      const hint = document.getElementById('statusHint');
      if (hint) hint.textContent = `🖼 배경 독립줌: ${Math.round(bgZoom*100)}%  (Ctrl+휠 / Ctrl+0=초기화)`;
      return;
    }

    // Rev.11.25: 휠만으로 확대/축소 (마우스 위치 기준)
    e.preventDefault();
    const zoomInput = document.getElementById('zoom');
    const cur = parseInt(zoomInput.value);
    // 휠 1틱당 배율 (위로=확대)
    const factor = e.deltaY < 0 ? 1.15 : (1 / 1.15);
    const minZ = parseInt(zoomInput.min) || 10;
    const maxZ = parseInt(zoomInput.max) || 800;
    let next = Math.round(cur * factor);
    next = Math.max(minZ, Math.min(maxZ, next));
    if (next === cur) return;

    // 마우스 아래의 도면 좌표가 줌 후에도 같은 화면 위치에 오도록 스크롤 보정
    const rect = wrap.getBoundingClientRect();
    const mx = e.clientX - rect.left + wrap.scrollLeft; // 현재 컨텐츠 기준 마우스 위치(px)
    const my = e.clientY - rect.top + wrap.scrollTop;
    const ratio = next / cur;

    zoomInput.value = next;
    zoomInput.dispatchEvent(new Event('input'));

    // 줌 변경 후 컨텐츠 크기가 ratio배 됨 → 마우스 지점 유지하도록 스크롤 조정
    wrap.scrollLeft = mx * ratio - (e.clientX - rect.left);
    wrap.scrollTop  = my * ratio - (e.clientY - rect.top);
  }, { passive: false });
  
  // 패닝: 휠 클릭(가운데 버튼, 캐드 표준) 또는 우클릭 드래그
  wrap.addEventListener('mousedown', e => {
    // Rev.11.26: 휠 클릭(button 1) = 화면 이동 (캐드 표준)
    if (e.button === 1) {
      e.preventDefault();
      panState = { x: e.clientX, y: e.clientY, scrollLeft: wrap.scrollLeft, scrollTop: wrap.scrollTop };
      wrap.style.cursor = 'grabbing';
      return;
    }
    if (e.button === 2) {
      e.preventDefault();
      // Rev.11.39: 이동(Grab) 모드면 취소(원위치)
      if (grabMode){
        exitGrabMode(false);
        document.getElementById('statusHint').textContent = '↔ 이동 취소 (원위치)';
        return;
      }
      // Rev.11.37: 분할 모드면 종료
      if (subdivideMode){
        exitSubdivideMode();
        document.getElementById('statusHint').textContent = '✂ 분할 취소';
        return;
      }
      if (pointMode || connectMode){
        exitVertexModes();
        document.getElementById('statusHint').textContent = '모드 종료';
        return;
      }
      panState = { x: e.clientX, y: e.clientY, scrollLeft: wrap.scrollLeft, scrollTop: wrap.scrollTop };
      wrap.style.cursor = 'grab';
    }
  });
  // 휠 클릭의 기본 동작(자동 스크롤/링크 열기) 방지
  wrap.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  wrap.addEventListener('mousemove', e => {
    if (panState) {
      const dx = e.clientX - panState.x;
      const dy = e.clientY - panState.y;
      wrap.scrollLeft = panState.scrollLeft - dx;
      wrap.scrollTop = panState.scrollTop - dy;
    }
  });
  wrap.addEventListener('mouseup', e => {
    if (panState) {
      panState = null;
      wrap.style.cursor = '';
    }
  });
  wrap.addEventListener('contextmenu', e => e.preventDefault());
}

// ZOOM EXTENT (전체 보기) - 도형이 모두 보이게
function zoomExtent() {
  if (shapes.length === 0 && !bgImage) return;
  const bb = computeBoundingBox();
  if (!bb) return;
  const wrap = document.getElementById('canvasWrap');
  const ww = wrap.clientWidth, wh = wrap.clientHeight;
  const bw = bb.maxX - bb.minX, bh = bb.maxY - bb.minY;
  if (bw < 1 || bh < 1) return;
  const z = Math.min(ww/bw, wh/bh) * 0.85;
  const zoomVal = Math.max(10, Math.min(300, Math.round(z*100)));
  document.getElementById('zoom').value = zoomVal;
  document.getElementById('zoom').dispatchEvent(new Event('input'));
  // 중앙 이동
  setTimeout(() => {
    const cx = (bb.minX + bb.maxX)/2 * (zoomVal/100);
    const cy = (bb.minY + bb.maxY)/2 * (zoomVal/100);
    wrap.scrollLeft = cx - ww/2;
    wrap.scrollTop = cy - wh/2;
  }, 50);
}

// ====== 측정 도구 ======
// LIST - 선택 도형 속성 출력
function handleListCommand() {
  if (selectedIds.size === 0) {
    cmdLog('  LIST: 도형 선택 후 사용.', 'error');
    return;
  }
  cmdLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'system');
  selectedIds.forEach(id => {
    const s = shapes.find(x => x.id === id);
    if (!s) return;
    if (s.type === 'line') {
      const len = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y) * mmPerPixel;
      const ang = Math.atan2(-(s.p2.y-s.p1.y), s.p2.x-s.p1.x) * 180/Math.PI;
      cmdLog(`  LINE #${s.id}: 길이=${len.toFixed(2)}mm, 각도=${ang.toFixed(1)}°`, 'prompt');
    } else if (s.type === 'rect') {
      const w = Math.abs(s.p2.x-s.p1.x) * mmPerPixel;
      const h = Math.abs(s.p2.y-s.p1.y) * mmPerPixel;
      cmdLog(`  RECT #${s.id}: ${w.toFixed(1)} × ${h.toFixed(1)} mm, 면적=${(w*h).toFixed(2)}㎟`, 'prompt');
    } else if (s.type === 'circle') {
      const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y) * mmPerPixel;
      cmdLog(`  CIRCLE #${s.id}: R=${r.toFixed(2)}mm, ⌀=${(r*2).toFixed(2)}mm, 면적=${(Math.PI*r*r).toFixed(2)}㎟`, 'prompt');
    } else if (s.type === 'arc') {
      const r = s.r * mmPerPixel;
      let span = s.ccw ? (s.startAngle - s.endAngle) : (s.endAngle - s.startAngle);
      while (span < 0) span += Math.PI*2;
      cmdLog(`  ARC #${s.id}: R=${r.toFixed(2)}mm, 회전=${(span*180/Math.PI).toFixed(1)}°, 호길이=${(span*r).toFixed(2)}mm`, 'prompt');
    } else {
      cmdLog(`  ${s.type.toUpperCase()} #${s.id}`, 'prompt');
    }
  });
  cmdLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'system');
}

// AREA - 선택 도형의 면적 합계
function handleAreaCommand() {
  if (selectedIds.size === 0) {
    cmdLog('  AREA: 도형 선택 후 사용.', 'error');
    return;
  }
  let totalArea = 0, totalPerim = 0;
  selectedIds.forEach(id => {
    const s = shapes.find(x => x.id === id);
    if (!s) return;
    if (s.type === 'rect') {
      const w = Math.abs(s.p2.x-s.p1.x);
      const h = Math.abs(s.p2.y-s.p1.y);
      totalArea += w*h;
      totalPerim += 2*(w+h);
    } else if (s.type === 'circle') {
      const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
      totalArea += Math.PI * r * r;
      totalPerim += 2 * Math.PI * r;
    } else if (s.type === 'polyline' && s.closed) {
      // 폴리곤 면적 (신발끈 공식)
      let a = 0;
      const pts = s.points;
      for (let i = 0; i < pts.length; i++) {
        const j = (i+1) % pts.length;
        a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
      }
      totalArea += Math.abs(a) / 2;
      for (let i = 0; i < pts.length; i++) {
        const j = (i+1) % pts.length;
        totalPerim += Math.hypot(pts[j].x - pts[i].x, pts[j].y - pts[i].y);
      }
    }
  });
  const areaMm = totalArea * mmPerPixel * mmPerPixel;
  const perimMm = totalPerim * mmPerPixel;
  cmdLog(`  AREA: ${areaMm.toFixed(2)} ㎟, 둘레 합계: ${perimMm.toFixed(2)} mm`, 'system');
}

// ID - 점 좌표 (다음 클릭 점 위치 표시)
let idPickActive = false;
function handleIdCommand() {
  idPickActive = true;
  cmdLog('  ID: 좌표를 알고 싶은 점을 클릭하세요.', 'prompt');
}

function handleIdClick(p) {
  if (!idPickActive) return false;
  const xMm = (p.x * mmPerPixel).toFixed(2);
  const yMm = (p.y * mmPerPixel).toFixed(2);
  cmdLog(`  좌표: X=${xMm}mm, Y=${yMm}mm  (px: ${p.x}, ${p.y})`, 'system');
  idPickActive = false;
  return true;
}

// ====== DXF 내보내기 (간단한 ASCII DXF) ======
function exportDXF(name) {
  let dxf = '';
  
  // 헤더
  dxf += '0\nSECTION\n2\nHEADER\n';
  dxf += '9\n$ACADVER\n1\nAC1015\n';  // AutoCAD 2000 호환
  dxf += '9\n$INSUNITS\n70\n4\n';  // 단위: mm
  dxf += '0\nENDSEC\n';
  
  // 테이블 (레이어)
  dxf += '0\nSECTION\n2\nTABLES\n';
  dxf += '0\nTABLE\n2\nLAYER\n';
  layers.forEach(l => {
    dxf += '0\nLAYER\n';
    dxf += `2\n${l.name}\n`;
    dxf += '70\n0\n';
    dxf += `62\n${dxfColorIndex(l.color)}\n`;
    dxf += '6\nCONTINUOUS\n';
  });
  dxf += '0\nENDTAB\n0\nENDSEC\n';
  
  // 엔티티
  dxf += '0\nSECTION\n2\nENTITIES\n';
  
  shapes.forEach(s => {
    const layer = s.layer || 'default';
    if (s.type === 'line') {
      dxf += '0\nLINE\n';
      dxf += `8\n${layer}\n`;
      dxf += `10\n${(s.p1.x * mmPerPixel).toFixed(3)}\n`;
      dxf += `20\n${(-s.p1.y * mmPerPixel).toFixed(3)}\n`;  // Y 반전
      dxf += `30\n0.0\n`;
      dxf += `11\n${(s.p2.x * mmPerPixel).toFixed(3)}\n`;
      dxf += `21\n${(-s.p2.y * mmPerPixel).toFixed(3)}\n`;
      dxf += `31\n0.0\n`;
    } else if (s.type === 'circle') {
      const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
      dxf += '0\nCIRCLE\n';
      dxf += `8\n${layer}\n`;
      dxf += `10\n${(s.p1.x * mmPerPixel).toFixed(3)}\n`;
      dxf += `20\n${(-s.p1.y * mmPerPixel).toFixed(3)}\n`;
      dxf += `30\n0.0\n`;
      dxf += `40\n${(r * mmPerPixel).toFixed(3)}\n`;
    } else if (s.type === 'arc') {
      dxf += '0\nARC\n';
      dxf += `8\n${layer}\n`;
      dxf += `10\n${(s.cx * mmPerPixel).toFixed(3)}\n`;
      dxf += `20\n${(-s.cy * mmPerPixel).toFixed(3)}\n`;
      dxf += `30\n0.0\n`;
      dxf += `40\n${(s.r * mmPerPixel).toFixed(3)}\n`;
      // 각도 (Y 반전이라 부호 반전)
      let sa = -s.startAngle * 180/Math.PI;
      let ea = -s.endAngle * 180/Math.PI;
      // DXF arc는 반시계 방향. canvas의 ccw=false면 두 각도 스왑
      if (!s.ccw) { const t = sa; sa = ea; ea = t; }
      dxf += `50\n${sa.toFixed(3)}\n`;
      dxf += `51\n${ea.toFixed(3)}\n`;
    } else if (s.type === 'rect') {
      // 사각형 = 4개 라인
      const x1 = Math.min(s.p1.x, s.p2.x), x2 = Math.max(s.p1.x, s.p2.x);
      const y1 = Math.min(s.p1.y, s.p2.y), y2 = Math.max(s.p1.y, s.p2.y);
      const corners = [[x1,y1],[x2,y1],[x2,y2],[x1,y2]];
      for (let i = 0; i < 4; i++) {
        const [ax,ay] = corners[i], [bx,by] = corners[(i+1)%4];
        dxf += '0\nLINE\n';
        dxf += `8\n${layer}\n`;
        dxf += `10\n${(ax * mmPerPixel).toFixed(3)}\n20\n${(-ay * mmPerPixel).toFixed(3)}\n30\n0.0\n`;
        dxf += `11\n${(bx * mmPerPixel).toFixed(3)}\n21\n${(-by * mmPerPixel).toFixed(3)}\n31\n0.0\n`;
      }
    } else if (s.type === 'polyline') {
      dxf += '0\nLWPOLYLINE\n';
      dxf += `8\n${layer}\n`;
      dxf += `90\n${s.points.length}\n`;
      dxf += `70\n${s.closed ? 1 : 0}\n`;
      s.points.forEach(p => {
        dxf += `10\n${(p.x * mmPerPixel).toFixed(3)}\n`;
        dxf += `20\n${(-p.y * mmPerPixel).toFixed(3)}\n`;
      });
    } else if (s.type === 'ellipse') {
      dxf += '0\nELLIPSE\n';
      dxf += `8\n${layer}\n`;
      dxf += `10\n${(s.cx * mmPerPixel).toFixed(3)}\n20\n${(-s.cy * mmPerPixel).toFixed(3)}\n30\n0.0\n`;
      // 장축 끝점 (vector)
      const ax = s.rx * Math.cos(s.rotation || 0);
      const ay = s.rx * Math.sin(s.rotation || 0);
      dxf += `11\n${(ax * mmPerPixel).toFixed(3)}\n21\n${(-ay * mmPerPixel).toFixed(3)}\n31\n0.0\n`;
      dxf += `40\n${(s.ry/s.rx).toFixed(6)}\n`;  // 비율
      dxf += `41\n0.0\n42\n6.283185\n`;  // 0 ~ 2π
    } else if (s.type === 'text') {
      dxf += '0\nTEXT\n';
      dxf += `8\n${layer}\n`;
      dxf += `10\n${(s.pos.x * mmPerPixel).toFixed(3)}\n20\n${(-s.pos.y * mmPerPixel).toFixed(3)}\n30\n0.0\n`;
      dxf += `40\n${((s.sizePx || 14) * mmPerPixel).toFixed(3)}\n`;
      dxf += `1\n${s.text || ''}\n`;
    }
    // 치수는 SVG 처럼 DXF에서도 DIMENSION 엔티티가 복잡하므로 일단 스킵
  });
  
  dxf += '0\nENDSEC\n0\nEOF\n';
  
  // 다운로드
  const blob = new Blob([dxf], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name + '.dxf';
  a.click();
  URL.revokeObjectURL(url);
  
  cmdLog(`  DXF 저장됨: ${name}.dxf (${shapes.length} 도형)`, 'system');
}

// 색상 hex → DXF 인덱스 색 (단순 매핑)
function dxfColorIndex(hex) {
  if (!hex) return 7;
  const map = {
    '#ff0000': 1, '#ffff00': 2, '#00ff00': 3, '#00ffff': 4,
    '#0000ff': 5, '#ff00ff': 6, '#ffffff': 7, '#000000': 7,
    '#cc0000': 1, '#888888': 8, '#ff8800': 30, '#666666': 9
  };
  return map[hex.toLowerCase()] || 7;
}

function handleDxfCommand() {
  const name = prompt('DXF 파일명 (확장자 제외):', '도면');
  if (!name) return;
  exportDXF(name);
}

/* ============================================================
   ===== OSNAP 다이얼로그 (Rev.10.8) - AutoCAD 스타일 =====
   ============================================================ */
const OSNAP_LS_KEY = 'osnap_settings_v1';

// 페이지 로드 시 저장값 복원
(function loadOsnapSettings(){
  try {
    const raw = localStorage.getItem(OSNAP_LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.snapMode === 'boolean') snapMode = s.snapMode;
    if (s.osnapEnabled && typeof s.osnapEnabled === 'object') {
      Object.keys(osnapEnabled).forEach(k => {
        if (typeof s.osnapEnabled[k] === 'boolean') osnapEnabled[k] = s.osnapEnabled[k];
      });
    }
    if (typeof s.snapTangent === 'boolean') snapTangent = s.snapTangent;
    if (typeof s.snapPerpendicular === 'boolean') snapPerpendicular = s.snapPerpendicular;
    if (typeof s.snapParallel === 'boolean') snapParallel = s.snapParallel;
    if (typeof s.snapExtension === 'boolean') snapExtension = s.snapExtension;
    if (typeof s.snapRadius === 'number' && s.snapRadius >= 3) {
      const el = document.getElementById('snapRadius');
      if (el) el.value = s.snapRadius;
    }
  } catch(e) {}
})();

function saveOsnapSettings(){
  try {
    const radEl = document.getElementById('snapRadius');
    const radDlg = document.getElementById('os_radius');
    const radius = parseInt((radDlg && radDlg.value) || (radEl && radEl.value) || 15);
    localStorage.setItem(OSNAP_LS_KEY, JSON.stringify({
      snapMode, osnapEnabled, snapTangent, snapPerpendicular, snapParallel, snapExtension,
      snapRadius: radius
    }));
  } catch(e) {}
}

function openOsnapDlg(){
  // 현재 상태를 다이얼로그에 반영
  document.getElementById('osnapMaster').checked = snapMode;
  document.getElementById('os_endpoint').checked = osnapEnabled.endpoint;
  document.getElementById('os_midpoint').checked = osnapEnabled.midpoint;
  document.getElementById('os_center').checked = osnapEnabled.center;
  document.getElementById('os_quadrant').checked = osnapEnabled.quadrant;
  document.getElementById('os_corner').checked = osnapEnabled.corner;
  document.getElementById('os_intersection').checked = osnapEnabled.intersection;
  document.getElementById('os_onshape').checked = osnapEnabled.onshape;
  document.getElementById('os_tangent').checked = snapTangent;
  document.getElementById('os_perpendicular').checked = snapPerpendicular;
  document.getElementById('os_parallel').checked = snapParallel;
  document.getElementById('os_extension').checked = snapExtension;
  const radEl = document.getElementById('snapRadius');
  document.getElementById('os_radius').value = radEl ? radEl.value : 15;
  onOsnapMasterToggle(); // 마스터 체크에 따라 행 흐림 처리
  document.getElementById('osnapDlg').classList.add('show');
}

function closeOsnapDlg(){
  document.getElementById('osnapDlg').classList.remove('show');
}

function onOsnapMasterToggle(){
  const on = document.getElementById('osnapMaster').checked;
  // 점 스냅 6개는 마스터에 종속 (정밀스냅/onshape는 독립)
  const dep = ['os_endpoint','os_midpoint','os_center','os_quadrant','os_corner','os_intersection'];
  dep.forEach(id => {
    const cb = document.getElementById(id);
    if (!cb) return;
    const row = cb.closest('.osnap-row');
    if (row) row.classList.toggle('disabled', !on);
  });
}

function osnapSelectAll(checked){
  const ids = ['os_endpoint','os_midpoint','os_center','os_quadrant','os_corner','os_intersection',
               'os_tangent','os_perpendicular','os_parallel','os_extension','os_onshape'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
  });
  // 마스터도 같이 켜기
  if (checked) document.getElementById('osnapMaster').checked = true;
  onOsnapMasterToggle();
}

function applyOsnapDlg(){
  // 마스터 = 일반 스냅 ON/OFF (= snapMode)
  snapMode = document.getElementById('osnapMaster').checked;

  // 점-종류별 토글
  osnapEnabled.endpoint     = document.getElementById('os_endpoint').checked;
  osnapEnabled.midpoint     = document.getElementById('os_midpoint').checked;
  osnapEnabled.center       = document.getElementById('os_center').checked;
  osnapEnabled.quadrant     = document.getElementById('os_quadrant').checked;
  osnapEnabled.corner       = document.getElementById('os_corner').checked;
  osnapEnabled.intersection = document.getElementById('os_intersection').checked;
  osnapEnabled.onshape      = document.getElementById('os_onshape').checked;

  // 정밀스냅
  snapTangent       = document.getElementById('os_tangent').checked;
  snapPerpendicular = document.getElementById('os_perpendicular').checked;
  snapParallel      = document.getElementById('os_parallel').checked;
  snapExtension     = document.getElementById('os_extension').checked;

  // onshape = liveSnapMode 와 동기화 (있는 경우)
  if (typeof liveSnapMode !== 'undefined') {
    try { liveSnapMode = osnapEnabled.onshape; } catch(e){}
  }

  // 스냅 반경
  const radDlg = document.getElementById('os_radius');
  const radMain = document.getElementById('snapRadius');
  if (radDlg && radMain) radMain.value = radDlg.value;

  // 기존 메뉴/뱃지 UI 동기화
  try {
    document.getElementById('menuSnapState').textContent = snapMode ? 'ON' : 'OFF';
    document.getElementById('snapTanState').textContent  = snapTangent ? 'ON' : 'OFF';
    document.getElementById('snapPerpState').textContent = snapPerpendicular ? 'ON' : 'OFF';
    document.getElementById('snapParaState').textContent = snapParallel ? 'ON' : 'OFF';
    document.getElementById('snapExtState').textContent  = snapExtension ? 'ON' : 'OFF';
    const badge = document.getElementById('badgeSnap');
    if (badge) {
      badge.textContent = snapMode ? '🧲 ON' : '🧲 OFF';
      badge.classList.toggle('on', snapMode);
    }
    const btn = document.getElementById('btnSnap');
    if (btn) {
      btn.classList.toggle('active', snapMode);
      btn.textContent = snapMode ? '🧲 스냅 ON' : '🧲 스냅';
    }
  } catch(e) {}

  saveOsnapSettings();
  closeOsnapDlg();
  try { redrawDraw(); } catch(e){}
  // 짧은 안내
  const cnts = Object.values(osnapEnabled).filter(v=>v).length;
  const status = document.getElementById('statusHint');
  if (status) status.textContent = `🧲 객체 스냅 ${snapMode?'ON':'OFF'} · 활성 ${cnts}종 · 반경 ${radMain ? radMain.value : 15}px`;
}

// 메뉴 항목 연결 (null safe)
(function(){
  const m = document.getElementById('menuOsnapDlg');
  if (m) m.addEventListener('click', openOsnapDlg);
})();

// F3 키 = 마스터 스냅 토글 (오토캐드와 동일)
window.addEventListener('keydown', e => {
  if (e.key === 'F3' &&
      !(document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA'))) {
    e.preventDefault();
    snapMode = !snapMode;
    saveOsnapSettings();
    try {
      document.getElementById('menuSnapState').textContent = snapMode ? 'ON' : 'OFF';
      const badge = document.getElementById('badgeSnap');
      if (badge) { badge.textContent = snapMode ? '🧲 ON' : '🧲 OFF'; badge.classList.toggle('on', snapMode); }
      const btn = document.getElementById('btnSnap');
      if (btn) { btn.classList.toggle('active', snapMode); btn.textContent = snapMode ? '🧲 스냅 ON' : '🧲 스냅'; }
      const status = document.getElementById('statusHint');
      if (status) status.textContent = `🧲 객체 스냅 ${snapMode?'ON':'OFF'} (F3)`;
    } catch(err) {}
  }
});

// 다이얼로그 바깥 클릭 시 닫기 (null safe)
(function(){
  const dlg = document.getElementById('osnapDlg');
  if (dlg) dlg.addEventListener('click', e => {
    if (e.target.id === 'osnapDlg') closeOsnapDlg();
  });
})();


// ===== (분리) core 에서 옮겨온 초기화 호출 — tools 정의 이후 실행 =====
try { initPanZoom(); } catch(e) { console.warn(e); }
try { updateLayerStatus(); } catch(e) {}
