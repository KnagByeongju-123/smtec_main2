// ===========================================================
//  draw_tool_core.js  —  [1/2]
//  전역상태 · 캔버스/렌더링 · 마우스/키보드 이벤트 · 기본 도구
//  (draw_tool.html 에서 분리. tools 보다 먼저 로드)
//  ※ initPanZoom()/updateLayerStatus() 호출은 tools 정의 이후 실행되도록
//     draw_tool_tools.js 끝으로 이동했습니다.
// ===========================================================
'use strict';

// ===== Rev.10.12: 글로벌 에러 진단 =====
// addEventListener of null 같은 에러가 정확히 어디서 발생하는지 콘솔에 명확히 표시
window.addEventListener('error', function(e) {
  if (e && e.error && e.message && e.message.indexOf('addEventListener') >= 0) {
    console.error('🔍 [draw_tool 진단] addEventListener null 에러 발생');
    console.error('  파일:', e.filename);
    console.error('  라인:', e.lineno, '컬럼:', e.colno);
    console.error('  메시지:', e.message);
    console.error('  스택:\n' + (e.error.stack || '(없음)'));
  }
});

const bgCanvas = document.getElementById('bgCanvas');
const fillCanvas = document.getElementById('fillCanvas');
const drawCanvas = document.getElementById('drawCanvas');
const previewCanvas = document.getElementById('previewCanvas');
const bgCtx = bgCanvas.getContext('2d');
const fillCtx = fillCanvas.getContext('2d');
const drawCtx = drawCanvas.getContext('2d');
const preCtx = previewCanvas.getContext('2d');

let baseW = 16000, baseH = 9000;  // Rev.16.22: 16:9, 1mm=300px 기준 약 53mm×30mm (5cm 미만 제품, 줌 100%까지 선명)
let zoom = 0.06;
// Rev.11.24: 눈금자(그리드) 표시
let gridOn = false;
let gridSpacingMm = 10;   // 격자 간격 (mm)
let bgImage = null;
let bgImageOpacity = 1.0; // 배경 이미지 불투명도 (0~1)
let bgImageScale = 1.0;   // Rev.11.10: 배경 이미지 자체 확대/축소 (도면 맞춤용)
let bgImageOffsetX = 0;   // Rev.11.10: 배경 이미지 X 오프셋 (px)
let bgImageOffsetY = 0;   // Rev.11.10: 배경 이미지 Y 오프셋 (px)
let bgZoom = 1.0;         // Rev.13.2: 배경 독립 확대/축소 (작업영역과 별개, CSS transform)
let bgZoomOriginX = 50;   // transform-origin X (%)
let bgZoomOriginY = 50;   // transform-origin Y (%)
let tool = 'select';
let shapes = [];
let fills = [];        // 영역 채움 목록 [{type:'fill', points:[{x,y}...], color, alpha}]
let fillAsOutline = false;  // Rev.15.5: 채움 도구가 외곽선(폴리라인) 생성 모드인지
let redoStack = [];
// Rev.11.41: 스냅샷 기반 Undo/Redo (전체 상태 저장 → 정렬·이동·분할 등 모든 작업 복원)
let history = [];      // 상태 스냅샷 배열
let histIdx = -1;      // 현재 위치
let histLock = false;  // 복원 중 재기록 방지
const HIST_MAX = 100;  // 최대 보관 단계
let firstClick = null;

let continuousMode = false;
let snapMode = false;
let snapPoints = [];
let snapShown = null;
let selectedIds = new Set();
let dragState = null;
// Rev.11.9: 이동 거리 패널 상태
//   moveDeltaBase: 이동 기준 시점의 선택 도형 좌표 스냅샷 {id: shapeJSON}
//   현재 ΔX/ΔY는 이 기준에서의 누적 이동량 (mm)
let moveDeltaBase = null;
// Rev.11.14: 클립보드 (Ctrl+C / Ctrl+V) - 복사된 도형 스냅샷 배열
let clipboardShapes = [];
let pasteCount = 0; // 연속 붙여넣기 시 오프셋 누적
// Rev.11.18: 버텍스 점 찍기 / 연결 모드
let pointMode = false;        // 점 찍기 모드
let connectMode = false;      // 연결 모드
let connectPoints = [];       // 연결 모드에서 클릭한 좌표 누적 [{x,y}]
// Rev.11.20: 연장(Extrude) 모드 - 선을 끌어 면 만들기
let extrudeMode = false;
let extrudeState = null;      // {lineId, p1, p2}  돌출 대상 선 정보
let extrudeAxis = null;       // Rev.11.39: 연장 축 제한 null/'x'/'y'
let extrudeDragging = false;  // Rev.11.43: 연장 드래그 진행 중
// Rev.11.37: 블렌더식 분할(Subdivide) 모드 - 선 클릭 → 휠로 분할 수 → 좌클릭 적용
let subdivideMode = false;        // 분할 모드 ON/OFF
let subdivideTarget = null;       // 선택된 선 도형
let subdivideCount = 1;           // 분할 수 (N개 점 추가 → N+1 세그먼트)
// Rev.16.14: 쓸어 지우기(Swipe Erase) - 드래그 경로가 가로지른 선 중 방향 각도차≥임계값인 선 삭제
let swipeEraseMode = false;       // 쓸어 지우기 모드 ON/OFF
let swipeErasing = false;         // 드래그 중 여부
let swipePath = [];               // 드래그 경로 점들 [{x,y}]
let swipeAngleThresh = 30;        // 삭제 각도 임계값(도)
// Rev.16.29: 한붓그리기 점번호 시스템 (좌/우/상/하/도 명령으로 이어그리기)
let penPoints = [];               // [{x,y}] P0,P1,P2... 픽셀 좌표
let penLabelIds = [];             // 각 점 라벨(text 도형) id (지우기용)
let penCur = -1;                  // 현재 점 인덱스 (이 점에서 다음 선 시작)
let penSealMode = false;          // Rev.16.30: 씰 모드(좌/우 숫자=목표 지름, 이동=|목표-현재|/2)
// Rev.16.9~16.10: 대각선(교점) 모드 - 범위 안 교점을 드래그로 선택(최대2), 2쌍 동시 대각 연결
let diagXMode = false;            // 대각선-교점 모드 ON/OFF
let diagXRadius = 40;             // 짧은 클릭 시 교점 탐지 반경 (px, 고정)
let diagXPhase = 0;              // 0=시작영역 선택, 1=끝영역 선택
let diagXStartPts = [];          // 시작 교점들 (최대 2) [{x,y}]
let diagXEndPts = [];            // 끝 교점들 (최대 2) [{x,y}]
let diagXDragging = false;       // 드래그 중 여부
let diagXDragOrigin = null;      // 드래그 시작 화면점(도면좌표)
let diagXHoverPt = null;         // 현재 마우스 도면좌표 (반경 미리보기용)
// Rev.11.39: 블렌더식 이동(Grab) 모드 - G → 마우스 따라 이동, X/Y로 축 제한
let grabMode = false;             // 이동 모드 ON/OFF
let grabAxis = null;              // null=자유, 'x'=X축만, 'y'=Y축만
let grabStart = null;             // 시작 마우스 좌표 (도면)
let grabBase = {};                // {id: 원본도형 복사본}
// Rev.11.23: 거리두기(Offset Twin) - 선 생성/선택 시 좌우 평행선 후보 생성
let offsetTwinMode = false;        // 거리두기 ON/OFF
let offsetTwinDist = 0.6;          // mm 단위 거리
let offsetTwinCandidates = [];     // (미사용: Rev.11.27부터 3개 모두 즉시 확정)
// Rev.12.6: 거리두기 좌/우 선택 방식
//   offsetTwinPickMode: 버튼 클릭 후 "선 클릭 → 좌/우 방향 클릭"으로 한쪽만 생성
//   offsetTwinTarget : 거리두기 대상으로 클릭한 선 도형
let offsetTwinPickMode = false;    // 좌/우 선택 진행 모드
let offsetTwinTarget = null;       // 선택된 대상 선 도형
// Rev.13.3: 베이스선 복제 모드 - 선 클릭 후 방향별 치수 입력으로 평행선 생성
let baseLineMode = false;          // 베이스선 복제 ON/OFF
let baseLineTarget = null;         // 클릭된 기준 선 도형
let baseLineOrient = null;         // 'h'(가로) | 'v'(세로) | 'o'(기타)
let baseLineDir = null;            // 선택된 방향 'up'|'down'|'left'|'right'
let baseOffDir = null;             // Rev.14.9: 거리두기 독립 방향 (베이스선과 별개)
// Rev.13.2: 기준선(중심선) 자동생성
let centerlineMode = false;
let centerlineOverhang = 5;   // 원 바깥으로 튀어나오는 길이(mm)
// Rev.13.2: 챔퍼(C면취)
let chamferState = null;           // null | {firstLine, firstClickPt}
let chamferC = 5;                  // 챔퍼 거리(mm)
// Rev.13.2: 호-직선 접선 연결
let tangentState = null;           // null | {line, endKey}
let shapeIdSeq = 0;

// 라운드(호) 그리기용 마우스 경로 추적
let arcPath = [];           // 1차 클릭 후 마우스 이동 경로
let detectedArcs = [];      // 배경에서 검출된 호/원 후보

// 캘리브레이션 상태 (v5.0)
// Rev.12.4: 기본 단위계 1mm = 75px (mmPerPixel=1/75).
let mmPerPixel = 1/300;
let calibSet = true;
let calibFirstPoint = null;

// 회전축 (v6.0)
let rotAxis = null;
let axisFirstPoint = null;
let lastGeneratedMesh = null;
let lastMousePoint = null; // Rev.10.5 - 회전축 거리입력 Enter 처리용

// 끝점 픽킹 모드 (v7.2)
let endpointPickState = null;

// 호 각도 편집 (v7.3)
let editingArcId = null;          // 편집 중인 호의 id
let arcHandleDrag = null;         // {type:'start'|'end'|'middle', startMouseAngle, originalStart, originalEnd}

// 라이브 스냅 (Rev.7.8): 마우스가 도형 근처에 갈 때 점/선/면으로 자동 흡착
let liveSnapMode = false;

// B/D안 도구 상태 (Rev.9.0)
let filletState = null;
// Rev.16.24: 필렛 방향 인터랙티브 선택 - 두 선 선택+지름 입력 후, 마우스로 코너 방향 결정→좌클릭 확정
let filletPreview = null;  // {L1, L2, ix, rPx, rMm} 방향 미리보기 진행 중
let offsetState = null;
let dimState = null;

// A안 정밀 스냅 (Rev.7.9): 접점/수선/평행/연장선
let snapTangent = true;
let snapPerpendicular = true;
let snapParallel = true;
let snapExtension = true;
const PARALLEL_ANGLE_TOL_DEG = 1.5;  // 평행 판정 허용 오차 (도)

// ===== OSNAP 점-종류별 토글 (Rev.10.8) =====
// 일반 스냅(snapMode)이 ON일 때, 어떤 종류의 점을 스냅할지 세부 제어
let osnapEnabled = {
  endpoint: true,     // 선/원의 끝점, 호의 끝점
  midpoint: true,     // 선/사각형 변의 중점
  center: true,       // 원·호·사각형의 중심
  quadrant: true,     // 원의 4분점 (0°/90°/180°/270°)
  corner: true,       // 사각형 코너, 배경 코너
  intersection: true, // 도형 간 교차점
  onshape: true       // 선/원 위 임의점 (라이브스냅)
};

setCanvasSize(baseW, baseH);

function setCanvasSize(w, h) {
  baseW = w; baseH = h;
  let dw = w * zoom, dh = h * zoom;
  // Rev.12.0: 캔버스 내부 해상도 안전 상한 — 초과 시 하얀 화면(렌더 실패) 방지.
  //   브라우저 캔버스 한계(변 길이/총 면적)를 넘지 않도록 내부 해상도 배율을 낮춤.
  //   CSS 표시 크기(style)는 그대로 두고 backing store만 줄여 디테일만 약간 감소.
  const MAX_SIDE = 16384;         // Rev.16.18: 한 변 최대 px (최신 브라우저 한계 현실화)
  const MAX_AREA = 160000000;     // 총 면적 최대 (약 1.6억 px) - 확대 시 흐트러짐 방지
  let res = 1;                    // backing store 해상도 배율
  if (dw > MAX_SIDE) res = Math.min(res, MAX_SIDE / dw);
  if (dh > MAX_SIDE) res = Math.min(res, MAX_SIDE / dh);
  if (dw * dh > MAX_AREA) res = Math.min(res, Math.sqrt(MAX_AREA / (dw * dh)));
  const bw = Math.max(1, Math.floor(dw * res));
  const bh = Math.max(1, Math.floor(dh * res));
  [bgCanvas, fillCanvas, drawCanvas, previewCanvas].forEach(c => {
    c.width = bw;
    c.height = bh;
    c.style.width = dw + 'px';   // 표시 크기는 줌 그대로
    c.style.height = dh + 'px';
  });
  // 컨텍스트 스케일: 내부 해상도 = zoom * res → 그리기는 도면좌표(baseW 기준) 그대로
  const eff = zoom * res;
  [bgCtx, fillCtx, drawCtx, preCtx].forEach(ctx => {
    ctx.setTransform(eff, 0, 0, eff, 0, 0);
  });
  document.getElementById('canvasStack').style.width = dw + 'px';
  document.getElementById('canvasStack').style.height = dh + 'px';
  redrawAll();
}

// ====== 배경 ======
document.getElementById('imgFile').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      // Rev.11.10: 새 이미지 로드 시 배경 맞춤 슬라이더 초기화
      bgImageScale = 1.0; bgImageOffsetX = 0; bgImageOffsetY = 0;
      bgZoom = 1.0; bgZoomOriginX = 50; bgZoomOriginY = 50; applyBgZoom();
      const bs = document.getElementById('bgScale');
      const bx = document.getElementById('bgOffsetX');
      const by = document.getElementById('bgOffsetY');
      if (bs){ bs.value = 100; document.getElementById('bgScaleVal').textContent = '100%'; }
      if (bx){ bx.value = 0; document.getElementById('bgOffsetXVal').textContent = '0'; }
      if (by){ by.value = 0; document.getElementById('bgOffsetYVal').textContent = '0'; }
      setCanvasSize(img.naturalWidth, img.naturalHeight);
      resetCalibration();
      if (typeof cv !== 'undefined' && cv.Mat) {
        detectSnapPoints();
        detectBackgroundArcs();
      }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(f);
});

document.getElementById('btnClearBg').addEventListener('click', () => {
  bgImage = null;
  snapPoints = []; detectedArcs = [];
  updateSnapStat();
  redrawBg();
});

document.getElementById('zoom').addEventListener('input', e => {
  zoom = parseInt(e.target.value) / 100;
  document.getElementById('zoomVal').textContent = e.target.value + '%';
  setCanvasSize(baseW, baseH);
  if (typeof updateSelActionBar === 'function') updateSelActionBar(); // Rev.10.11
});

// 배경 이미지 불투명도
document.getElementById('bgOpacity').addEventListener('input', e => {
  bgImageOpacity = parseInt(e.target.value) / 100;
  document.getElementById('bgOpacityVal').textContent = e.target.value + '%';
  redrawBg();
});

// Rev.11.10: 배경 이미지 크기 (도면 맞춤용)
document.getElementById('bgScale').addEventListener('input', e => {
  bgImageScale = parseInt(e.target.value) / 100;
  document.getElementById('bgScaleVal').textContent = e.target.value + '%';
  redrawBg();
});

// Rev.11.10: 배경 이미지 X 오프셋
document.getElementById('bgOffsetX').addEventListener('input', e => {
  bgImageOffsetX = parseInt(e.target.value);
  document.getElementById('bgOffsetXVal').textContent = e.target.value;
  redrawBg();
});

// Rev.11.10: 배경 이미지 Y 오프셋
document.getElementById('bgOffsetY').addEventListener('input', e => {
  bgImageOffsetY = parseInt(e.target.value);
  document.getElementById('bgOffsetYVal').textContent = e.target.value;
  redrawBg();
});

// Rev.11.10: 배경 위치/크기 초기화
document.getElementById('menuBgReset').addEventListener('click', () => {
  bgImageScale = 1.0; bgImageOffsetX = 0; bgImageOffsetY = 0;
  bgZoom = 1.0; bgZoomOriginX = 50; bgZoomOriginY = 50; applyBgZoom();
  document.getElementById('bgScale').value = 100;
  document.getElementById('bgScaleVal').textContent = '100%';
  document.getElementById('bgOffsetX').value = 0;
  document.getElementById('bgOffsetXVal').textContent = '0';
  document.getElementById('bgOffsetY').value = 0;
  document.getElementById('bgOffsetYVal').textContent = '0';
  redrawBg();
});

// Rev.11.10: 빠른 배율 프리셋 버튼
document.querySelectorAll('.zoom-preset').forEach(el => {
  el.addEventListener('click', () => {
    const z = el.getAttribute('data-zoom');
    const zoomInput = document.getElementById('zoom');
    zoomInput.value = z;
    zoomInput.dispatchEvent(new Event('input'));
  });
});

// 채움 투명도 표시
document.getElementById('fillAlpha').addEventListener('input', e => {
  document.getElementById('fillAlphaVal').textContent = e.target.value + '%';
});

// Rev.10.1: 해치 패턴
let currentHatchPattern = 'solid';
let selectedFillIds = new Set();  // 선택된 채움 (편집용)

document.getElementById('hatchPattern').addEventListener('change', e => {
  currentHatchPattern = e.target.value;
  cmdLog(`  HATCH 패턴 = ${e.target.options[e.target.selectedIndex].text}`, 'system');
});

// Rev.11.22: 채움(면)의 테두리 선 id 목록 찾기
// Rev.11.30: 더 견고하게 - 선의 양 끝점이 면의 어느 한 변(선분) 위에 놓이면 테두리로 간주
function findFillEdgeLines(f){
  if (!f || !f.points || f.points.length < 2) return [];
  const tol = 4; // px 허용 오차 (변에서 이 거리 이내면 변 위로 간주)
  const pts = f.points;
  const ids = [];

  // 점이 선분(a-b) 위(투영 0~1 범위 내)이고 수직거리 tol 이내인지
  const onSegment = (pt, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx*dx + dy*dy;
    if (len2 < 1e-6) return Math.hypot(pt.x-a.x, pt.y-a.y) <= tol;
    let t = ((pt.x-a.x)*dx + (pt.y-a.y)*dy) / len2;
    if (t < -0.02 || t > 1.02) return false;
    const px = a.x + t*dx, py = a.y + t*dy;
    return Math.hypot(pt.x-px, pt.y-py) <= tol;
  };

  shapes.forEach(s => {
    if (s.type !== 'line' || !s.p1 || !s.p2) return;
    if (ids.includes(s.id)) return;
    // 면의 각 변에 대해, 선의 양 끝점이 모두 그 변 위에 있으면 테두리
    for (let i = 0; i < pts.length; i++){
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (onSegment(s.p1, a, b) && onSegment(s.p2, a, b)){
        ids.push(s.id);
        break;
      }
    }
  });
  return ids;
}

// 채움 편집 모달 생성 (런타임)
function openFillEditor(fill) {
  // 동적 모달
  let modal = document.getElementById('fillEditModal');
  if (!modal) {
    const html = `
      <div class="modal-overlay" id="fillEditModal">
        <div class="modal" style="max-width:400px;">
          <h3>🎨 채움 편집</h3>
          <div class="row"><label>색상:</label><input type="color" id="feColor" style="flex:1;"></div>
          <div class="row"><label>투명도:</label>
            <input type="range" id="feAlpha" min="0" max="100" style="flex:1;">
            <span id="feAlphaVal" style="min-width:36px;">50%</span>
          </div>
          <div class="row"><label>패턴:</label>
            <select id="fePattern" style="flex:1;">
              <option value="solid">■ 단색</option>
              <option value="lines45">／ 빗금45°</option>
              <option value="lines135">＼ 빗금135°</option>
              <option value="cross">＃ 격자</option>
              <option value="dots">⋮⋮ 도트</option>
              <option value="ansi31">≡ ANSI31</option>
            </select>
          </div>
          <div class="actions">
            <button id="feDelete" style="background:#c9302c;">🗑 삭제</button>
            <button id="feCancel">취소</button>
            <button class="success" id="feApply">적용</button>
          </div>
        </div>
      </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    
    // 핸들러 (한 번만)
    document.getElementById('feAlpha').addEventListener('input', e => {
      document.getElementById('feAlphaVal').textContent = e.target.value + '%';
    });
    document.getElementById('feCancel').addEventListener('click', () => {
      document.getElementById('fillEditModal').classList.remove('show');
    });
    document.getElementById('feApply').addEventListener('click', () => {
      const f = window._editingFill;
      if (f) {
        f.color = document.getElementById('feColor').value;
        f.alpha = parseInt(document.getElementById('feAlpha').value) / 100;
        f.pattern = document.getElementById('fePattern').value;
        redrawFills();
        redrawDraw();
        cmdLog(`  채움 #${f.id} 편집 완료.`, 'system');
      }
      document.getElementById('fillEditModal').classList.remove('show');
    });
    document.getElementById('feDelete').addEventListener('click', () => {
      const f = window._editingFill;
      if (f) {
        // 면의 테두리(꼭지점을 잇는 선)가 있으면 함께 삭제할지 확인
        const edgeIds = findFillEdgeLines(f);
        let alsoEdges = false;
        if (edgeIds.length > 0) {
          alsoEdges = confirm(
            `이 채움을 삭제합니다.\n\n테두리 선 ${edgeIds.length}개도 함께 삭제할까요?\n[확인] 면+테두리 모두 삭제\n[취소] 면만 삭제`
          );
        }
        fills = fills.filter(x => x.id !== f.id);
        if (alsoEdges) {
          shapes = shapes.filter(s => !edgeIds.includes(s.id));
        }
        if (typeof redrawAll === 'function') redrawAll();
        else { redrawFills(); redrawDraw(); }
        updateCount();
        cmdLog(`  채움 #${f.id} 삭제됨${alsoEdges ? ' (테두리 '+edgeIds.length+'개 포함)' : ''}.`, 'system');
      }
      document.getElementById('fillEditModal').classList.remove('show');
    });
  }
  
  // 값 채우기
  window._editingFill = fill;
  document.getElementById('feColor').value = fill.color || '#ffaa00';
  document.getElementById('feAlpha').value = Math.round((fill.alpha || 0.5) * 100);
  document.getElementById('feAlphaVal').textContent = Math.round((fill.alpha || 0.5) * 100) + '%';
  document.getElementById('fePattern').value = fill.pattern || 'solid';
  document.getElementById('fillEditModal').classList.add('show');
}

// ====== 도구 선택 ======
// Rev.11.51: 도구 선택 공통 함수 (메뉴/상단버튼 공용, active 동기화)
function selectTool(toolName){
  document.querySelectorAll('.tool-menu-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tool-strip-btn').forEach(b => b.classList.remove('active'));
  // 같은 data-tool 가진 메뉴/버튼 모두 active
  document.querySelectorAll('.tool-menu-item[data-tool="'+toolName+'"], .tool-strip-btn[data-tool="'+toolName+'"]').forEach(b => b.classList.add('active'));
  tool = toolName;
  firstClick = null;
  arcPath = [];
  // Rev.15.5: 도구 전환 시 외곽선 모드 해제 (외곽선 버튼이 직접 다시 켬)
  fillAsOutline = false;
  const obtn = document.getElementById('headerBtnOutline');
  if (obtn) obtn.classList.remove('active');
  filletState = null; offsetState = null; dimState = null; breakState = null;
  filletPreview = null;  // Rev.16.27: 도구 전환 시 필렛 미리보기 확실히 종료
  preCtx.clearRect(0,0,baseW,baseH);
  redrawDraw();
  updateToolStatus();
  if (typeof updateVertexButtons === 'function') updateVertexButtons();
  if (tool === 'select') drawCanvas.style.cursor = 'default';
  else if (tool === 'fill') drawCanvas.style.cursor = 'cell';
  else if (tool === 'calib') drawCanvas.style.cursor = 'crosshair';
  else drawCanvas.style.cursor = 'crosshair';
  if (tool === 'calib') calibFirstPoint = null;
  if (tool === 'axis') axisFirstPoint = null;
  if (tool !== 'select') { selectedIds.clear(); updateSelStat(); redrawDraw(); }
}

// Rev.11.64: 작성 도구 1회 실행 후 선택 도구로 복귀하는 공통 헬퍼 (블렌더식)
function backToSelectTool(){
  firstClick = null; arcPath = [];
  preCtx.clearRect(0,0,baseW,baseH);
  selectTool('select');
}

document.querySelectorAll('.tool-menu-item').forEach(btn => {
  btn.addEventListener('click', () => {
    selectTool(btn.dataset.tool);
  });
});

// Rev.11.51: 상단 그리기 버튼 → 도구 선택
document.querySelectorAll('.tool-strip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectTool(btn.dataset.tool);
  });
});

// Rev.11.51: 상단 편집 액션 버튼 → 대상 선택 후 실행
document.querySelectorAll('.edit-act-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    runEditAction(btn.dataset.edit);
  });
});

// Rev.11.58: 거리복사 모달 방향 버튼
document.querySelectorAll('.dc-dir').forEach(b => {
  b.addEventListener('click', () => {
    _dcDir = b.dataset.dir;
    if (typeof updateDcDirButtons === 'function') updateDcDirButtons();
  });
});
// 거리복사 모달에서 Enter=실행
document.getElementById('dcGaps')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); runDistCopy(); }
});

// Rev.11.53: 상단 파일/스냅 액션 버튼 → 기존 메뉴 핸들러 트리거
document.querySelectorAll('.ts-act').forEach(btn => {
  btn.addEventListener('click', () => {
    const a = btn.dataset.act;
    const trigger = id => { const el = document.getElementById(id); if (el) el.click(); };
    switch(a){
      case 'open':     trigger('imgFile'); break;
      case 'save':     trigger('btnSaveProject'); break;
      case 'undo':     trigger('btnUndo'); break;
      case 'redo':     trigger('btnRedo'); break;
      case 'clearall': trigger('btnClearAll'); break;
      case 'snap':     trigger('menuSnap'); break;
      case 'cont':     trigger('menuContinuous'); break;
      case 'osnap':    trigger('menuOsnapDlg'); break;
    }
    // Rev.12.0: 토글형 버튼은 클릭 후 ON/OFF 색상 동기화
    if (typeof syncToolStripToggles === 'function') syncToolStripToggles();
  });
});

// Rev.12.0: 보라색 스냅/연속선 버튼의 ON/OFF 색상 동기화
function syncToolStripToggles(){
  const snapBtn = document.querySelector('.ts-act[data-act="snap"]');
  const contBtn = document.querySelector('.ts-act[data-act="cont"]');
  if (snapBtn) snapBtn.classList.toggle('active', !!snapMode);
  if (contBtn) contBtn.classList.toggle('active', !!continuousMode);
}

// Rev.11.51: 편집 액션 실행 (대상 선택 필요)
function runEditAction(act){
  // 선택 도형이 없으면 안내 (삭제/배열/거리복사 등 모두 선택 필요)
  if (selectedIds.size === 0){
    cmdLog('  먼저 선택(S) 도구로 대상을 클릭해 선택한 뒤 편집 버튼을 누르세요.', 'error');
    if (typeof updateToolStatus === 'function') updateToolStatus();
    return;
  }
  try {
    switch(act){
      case 'delete':
        if (typeof deleteSelected === 'function') deleteSelected();
        else { document.getElementById('btnDelSel') && document.getElementById('btnDelSel').click(); }
        break;
      case 'distcopy': handleDistanceCopyCommand(); break;
      case 'array':    handleArrayCommand(); break;
      case 'copy':     selectTool('copy'); break;
      case 'move':     selectTool('movetool'); break;
      case 'rotate':   selectTool('rotate'); break;
      case 'mirror':   selectTool('mirror'); break;
    }
  } catch(err){
    cmdLog('  편집 실행 오류: ' + err.message, 'error');
    console.error('편집 액션 오류:', err);
  }
}

function updateToolStatus() {
  const names = {select:'선택', line:'선', rect:'사각형', circle:'원', arc:'라운드', fill:'영역채움', calib:'캘리브', axis:'회전축',
    trim:'트리밍', extend:'연장', fillet:'모서리R', offset:'오프셋', break:'분할', breakAtPoint:'점분할',
    dimLinear:'선형치수', dimAligned:'평행치수', dimRadius:'반지름치수', dimDiameter:'직경치수', dimAngle:'각도치수',
    copy:'복사', movetool:'이동', rotate:'회전', mirror:'대칭', scale:'스케일',
    polyline:'폴리라인', ellipse:'타원', text:'텍스트'};
  const el = document.getElementById('statusTool');
  el.textContent = names[tool];
  el.className = 'badge tool-' + tool;
  const hints = {
    select: '클릭=선택 / Shift+클릭=추가 / 빈곳드래그=박스(영역에 걸치면 선택) / 드래그=이동 (끝점/도형 자동 스냅) / Shift+드래그=수평수직만 / Del=삭제',
    line: continuousMode ? '⛓ 연속선: 매 클릭마다 선 추가 / 더블클릭/ESC=종료' : '첫 클릭→두 번째 클릭 / Shift=직각',
    rect: '첫 클릭→두 번째 클릭으로 사각형',
    circle: '첫 클릭(중심)→두 번째 클릭으로 반지름',
    arc: '⌒ 1차 클릭 → 라운드를 따라 마우스 이동 → 2차 클릭 시 가장 가까운 배경 라운드 자동 피팅!',
    fill: '🎨 닫힌 영역 안 클릭 → 채움 (연속 클릭 가능) / 더블클릭=편집 / 패턴 셀렉트로 빗금/격자 선택 / BPOLY=모두 자동',
    calib: '📏 알고 있는 치수의 양 끝점 2개를 클릭 (스냅 권장) → 실제 mm 입력 → 이미지 자동 스케일',
    axis: '🔄 회전축의 양 끝 2개 클릭 → 보라색 점선 표시됨. 이 축 기준으로 윤곽선이 회전체가 됨',
    trim: '✂ 트리밍: 자르고 싶은 선의 자를 부분을 클릭 (다른 선/도형과 교차하는 부분 기준으로 자름)',
    extend: '↔ 연장: 연장할 선의 늘릴 쪽 끝점 가까이 클릭 → 가장 가까운 다른 선까지 자동 연장',
    fillet: '◜ 모서리 R: ① 사각형/두 선의 꼭지점 클릭→자동 라운드 ② 또는 두 직선 차례 클릭',
    chamfer: '⌐ 챔퍼(C면취): ① 사각형/꼭지점 클릭→즉시 면취 ② 또는 두 직선 차례 클릭 (C값 입력 필드 참조)',
    centerline: '✛ 기준선: 원/호 클릭→수평+수직 일점쇄선 자동생성 / 선 클릭→그 선의 평행 중심선 / Esc=종료',
    tangent: '⌒ 접선연결: 직선 클릭(끝점 가까운 쪽)→ 호/원 클릭→ 자동 접선 연결',
    offset: '∥ 오프셋: 원본 선/도형 클릭 → 오프셋할 방향 클릭 → 거리 입력으로 평행 복사',
    break: '✄ 분할: 선 클릭 → 첫 분할점 → 두 번째 분할점 클릭 (두 점 사이를 잘라내고 두 선으로 분할). 같은 점 두 번 클릭하면 그 점에서만 분할',
    breakAtPoint: '⋮ 점에서 분할: 선 클릭 → 한 점 클릭 → 그 점에서 두 선으로 분할 (중간 제거 없음)',
    dimLinear: '↦ 선형 치수: 두 점 클릭 (또는 선 1개 클릭) → 치수선 위치 클릭',
    dimAligned: '⤡ 평행 치수: 두 점을 잇는 방향에 평행한 치수 / 점1 → 점2 → 위치',
    dimRadius: 'R 반지름: 원/호 클릭 → 라벨 위치 클릭',
    dimDiameter: '⌀ 직경: 원/호 클릭 → 라벨 위치 클릭',
    dimAngle: '∠ 각도: 첫 번째 선 → 두 번째 선 → 호 위치 클릭'
  };
  document.getElementById('statusHint').textContent = hints[tool] || '';
}

document.getElementById('btnContinuous').addEventListener('click', () => {
  continuousMode = !continuousMode;
  document.getElementById('btnContinuous').classList.toggle('active', continuousMode);
  document.getElementById('btnContinuous').textContent = continuousMode ? '⛓ 연속선 ON' : '⛓ 연속선';
  firstClick = null;
  preCtx.clearRect(0,0,baseW,baseH);
  updateToolStatus();
  if (typeof syncToolStripToggles === 'function') syncToolStripToggles(); // Rev.12.0
});

document.getElementById('btnSnap').addEventListener('click', () => {
  snapMode = !snapMode;
  document.getElementById('btnSnap').classList.toggle('active', snapMode);
  document.getElementById('btnSnap').textContent = snapMode ? '🧲 스냅 ON' : '🧲 스냅';
  if (!snapMode) snapShown = null;
  updateSnapStat();
  if (typeof syncToolStripToggles === 'function') syncToolStripToggles(); // Rev.12.0
});

function updateSnapStat() {
  const el = document.getElementById('snapStat');
  if (!bgImage && !shapes.length) {
    el.textContent = '스냅: 비활성 (배경/도형 없음)';
    el.classList.remove('ready');
  } else {
    let txt = `🧲 점${snapPoints.length} 호${detectedArcs.length}`;
    if (snapMode) txt += ' [고정ON]';
    if (liveSnapMode) txt += ' [라이브ON]';
    el.textContent = txt;
    el.classList.add('ready');
  }
}

// ====== 스냅점 검출 ======
function detectSnapPoints() {
  if (!bgImage) return;
  try {
    const tmpC = document.createElement('canvas');
    tmpC.width = baseW; tmpC.height = baseH;
    tmpC.getContext('2d').drawImage(bgImage, 0, 0, baseW, baseH);
    const src = cv.imread(tmpC);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const corners = new cv.Mat();
    cv.goodFeaturesToTrack(gray, corners, 500, 0.01, 10);
    snapPoints = [];
    for (let i = 0; i < corners.rows; i++) {
      snapPoints.push({x: Math.round(corners.data32F[i*2]), y: Math.round(corners.data32F[i*2+1])});
    }
    // 직선 교차점 추가
    const edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);
    const lines = new cv.Mat();
    cv.HoughLinesP(edges, lines, 1, Math.PI/180, 50, 40, 10);
    const lineSegs = [];
    for (let i = 0; i < lines.rows; i++) {
      lineSegs.push({x1:lines.data32S[i*4],y1:lines.data32S[i*4+1],x2:lines.data32S[i*4+2],y2:lines.data32S[i*4+3]});
    }
    const maxLines = Math.min(lineSegs.length, 80);
    for (let i = 0; i < maxLines; i++) {
      for (let j = i+1; j < maxLines; j++) {
        const ip = lineIntersection(lineSegs[i], lineSegs[j]);
        if (ip && ip.x>=0 && ip.y>=0 && ip.x<baseW && ip.y<baseH) {
          if (isPointNearSegment(ip, lineSegs[i], 5) && isPointNearSegment(ip, lineSegs[j], 5)) {
            snapPoints.push({x: Math.round(ip.x), y: Math.round(ip.y)});
          }
        }
      }
    }
    snapPoints = dedupePoints(snapPoints, 5);
    src.delete(); gray.delete(); corners.delete(); edges.delete(); lines.delete();
    updateSnapStat();
  } catch(e) { console.error('스냅 검출:', e); }
}

// ====== 배경 라운드(호/원) 자동검출 (라운드 도구용) ======
function detectBackgroundArcs() {
  if (!bgImage) return;
  try {
    const tmpC = document.createElement('canvas');
    tmpC.width = baseW; tmpC.height = baseH;
    tmpC.getContext('2d').drawImage(bgImage, 0, 0, baseW, baseH);
    const src = cv.imread(tmpC);
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    detectedArcs = [];
    
    // 1) Hough Circles로 완전한 원/큰 호
    const circles = new cv.Mat();
    const grayBlur = new cv.Mat();
    cv.medianBlur(gray, grayBlur, 5);
    cv.HoughCircles(grayBlur, circles, cv.HOUGH_GRADIENT, 1, 15, 100, 25, 5, 300);
    for (let i = 0; i < circles.cols; i++) {
      detectedArcs.push({
        cx: circles.data32F[i*3],
        cy: circles.data32F[i*3+1],
        r: circles.data32F[i*3+2],
        startAngle: 0, endAngle: Math.PI*2, isFull: true
      });
    }
    circles.delete(); grayBlur.delete();
    
    // 2) Contour + fitEllipse로 부분 호(라운드 코너) 검출
    const bin = new cv.Mat();
    cv.threshold(gray, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_NONE);
    
    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      if (cnt.rows < 15) { cnt.delete(); continue; }
      
      try {
        // 윤곽선을 작은 세그먼트로 잘라서 각 부분이 호인지 검사
        // 간단히: fitEllipse → 원에 가까우면 (rx≈ry) 호로 등록
        if (cnt.rows >= 5) {
          const rrect = cv.fitEllipse(cnt);
          const rx = rrect.size.width / 2;
          const ry = rrect.size.height / 2;
          const ratio = Math.max(rx,ry) / Math.max(Math.min(rx,ry), 0.001);
          
          // 원에 가까운 (ratio < 1.5) 작은 호만 (반지름 3~200px)
          if (ratio < 1.5 && rx >= 3 && rx <= 200 && ry >= 3 && ry <= 200) {
            const cx = rrect.center.x;
            const cy = rrect.center.y;
            const r = (rx + ry) / 2;
            
            // 윤곽선 점들이 실제로 이 원 위에 있는지 검증
            let onCircle = 0;
            for (let k = 0; k < cnt.rows; k++) {
              const px = cnt.data32S[k*2];
              const py = cnt.data32S[k*2+1];
              const d = Math.hypot(px-cx, py-cy);
              if (Math.abs(d - r) < r * 0.15) onCircle++;
            }
            const onRatio = onCircle / cnt.rows;
            
            if (onRatio > 0.7) {
              // 시작/끝 각도 계산 (윤곽선 양 끝점 기준)
              const sx = cnt.data32S[0], sy = cnt.data32S[1];
              const ex = cnt.data32S[(cnt.rows-1)*2], ey = cnt.data32S[(cnt.rows-1)*2+1];
              const startAng = Math.atan2(sy-cy, sx-cx);
              const endAng = Math.atan2(ey-cy, ex-cx);
              
              const fullPerim = 2 * Math.PI * r;
              const cntPerim = cv.arcLength(cnt, false);
              const coverage = cntPerim / fullPerim;
              
              detectedArcs.push({
                cx, cy, r,
                startAngle: startAng,
                endAngle: endAng,
                isFull: coverage > 0.85
              });
            }
          }
        }
      } catch(e) {}
      cnt.delete();
    }
    
    contours.delete(); hierarchy.delete(); bin.delete();
    src.delete(); gray.delete();
    
    // 중복 제거 (중심과 반지름이 거의 같은것)
    const filtered = [];
    for (const a of detectedArcs) {
      let dup = false;
      for (const b of filtered) {
        if (Math.abs(a.cx-b.cx)<5 && Math.abs(a.cy-b.cy)<5 && Math.abs(a.r-b.r)<5) { dup = true; break; }
      }
      if (!dup) filtered.push(a);
    }
    detectedArcs = filtered;
    
    updateSnapStat();
  } catch(e) { console.error('배경 호 검출:', e); }
}

function lineIntersection(L1, L2) {
  const x1=L1.x1, y1=L1.y1, x2=L1.x2, y2=L1.y2;
  const x3=L2.x1, y3=L2.y1, x4=L2.x2, y4=L2.y2;
  const denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denom;
  return { x: x1 + t*(x2-x1), y: y1 + t*(y2-y1) };
}
function isPointNearSegment(p, L, tol) {
  return p.x >= Math.min(L.x1,L.x2)-tol && p.x <= Math.max(L.x1,L.x2)+tol &&
         p.y >= Math.min(L.y1,L.y2)-tol && p.y <= Math.max(L.y1,L.y2)+tol;
}
function dedupePoints(pts, tol) {
  const r = [];
  for (const p of pts) {
    let dup = false;
    for (const q of r) { if (Math.abs(p.x-q.x)<tol && Math.abs(p.y-q.y)<tol) { dup=true; break; }}
    if (!dup) r.push(p);
  }
  return r;
}

function getAllSnapTargets() {
  const t = [...snapPoints];
  // 그려진 도형의 끝점/중심
  shapes.forEach(s => {
    if (s.type === 'line' || s.type === 'rect') {
      t.push({x:s.p1.x, y:s.p1.y});
      t.push({x:s.p2.x, y:s.p2.y});
      if (s.type === 'rect') {
        t.push({x:s.p1.x, y:s.p2.y});
        t.push({x:s.p2.x, y:s.p1.y});
      }
    } else if (s.type === 'circle') {
      t.push({x:s.p1.x, y:s.p1.y});
      // 원의 4분점도 스냅 대상으로
      const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
      t.push({x:s.p1.x+r, y:s.p1.y});
      t.push({x:s.p1.x-r, y:s.p1.y});
      t.push({x:s.p1.x, y:s.p1.y+r});
      t.push({x:s.p1.x, y:s.p1.y-r});
    } else if (s.type === 'arc') {
      t.push({x:s.cx, y:s.cy});
      // 호의 시작점과 끝점
      t.push({x: s.cx + s.r*Math.cos(s.startAngle), y: s.cy + s.r*Math.sin(s.startAngle)});
      t.push({x: s.cx + s.r*Math.cos(s.endAngle), y: s.cy + s.r*Math.sin(s.endAngle)});
    }
  });
  // 배경 검출 라운드의 핵심 점들 (중심, 4분점, 검출된 호의 양 끝점)
  detectedArcs.forEach(a => {
    t.push({x: Math.round(a.cx), y: Math.round(a.cy)});
    t.push({x: Math.round(a.cx + a.r), y: Math.round(a.cy)});
    t.push({x: Math.round(a.cx - a.r), y: Math.round(a.cy)});
    t.push({x: Math.round(a.cx), y: Math.round(a.cy + a.r)});
    t.push({x: Math.round(a.cx), y: Math.round(a.cy - a.r)});
    // 호의 시작/끝 (전체 원이 아닌 경우만)
    if (!a.isFull) {
      t.push({x: Math.round(a.cx + a.r*Math.cos(a.startAngle)), y: Math.round(a.cy + a.r*Math.sin(a.startAngle))});
      t.push({x: Math.round(a.cx + a.r*Math.cos(a.endAngle)), y: Math.round(a.cy + a.r*Math.sin(a.endAngle))});
    }
  });
  return t;
}

function findNearestSnap(p) {
  // 어떤 스냅도 켜져있지 않으면 종료
  const anyPreciseOn = snapTangent || snapPerpendicular || snapParallel || snapExtension;
  if (!snapMode && !liveSnapMode && !anyPreciseOn) return null;
  
  // Rev.11.29: 스냅 반경을 화면 픽셀 기준으로 → 줌과 무관하게 커서 근처에서만 스냅
  const radiusScreen = parseInt(document.getElementById('snapRadius').value) || 15;
  const radius = radiusScreen / (zoom || 1); // 도면 좌표 기준 반경
  const r2 = radius * radius;
  let best = null, bestD = Infinity;
  
  // 1) 일반 스냅 점들 (배경 코너 + 도형 특징점) - 점종류별 필터 적용
  if (snapMode) {
    for (const t of getAllSnapTargets()) {
      // Rev.10.8: 점 종류 필터링
      const kind = t.kind || 'corner';
      if (!osnapKindAllowed(kind)) continue;
      const dx = t.x - p.x, dy = t.y - p.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < r2 && d2 < bestD) { bestD = d2; best = {...t, kind: kind}; }
    }
  }
  
  // 2) 라이브 스냅: 모든 도형의 가장 가까운 점 (선 위/원 위/사각형 변 위)
  if (liveSnapMode) {
    const excludeIds = (dragState && dragState.type === 'move') 
      ? new Set(dragState.offsets.map(o => o.id)) 
      : new Set();
    
    for (const s of shapes) {
      if (excludeIds.has(s.id)) continue;
      // 도형 위 임의점 - osnapEnabled.onshape 필터 (Rev.10.8)
      if (osnapEnabled.onshape) {
        const np = nearestPointOnShape(p, s);
        if (np) {
          const dx = np.x - p.x, dy = np.y - p.y;
          const d2 = dx*dx + dy*dy;
          if (d2 < r2 && d2 < bestD) {
            bestD = d2;
            best = {x: np.x, y: np.y, kind: 'on-shape', shapeType: s.type};
          }
        }
      }
      const kps = getShapeKeyPoints(s);
      for (const kp of kps) {
        // Rev.10.8: 점 종류 필터
        if (!osnapKindAllowed(kp.kind)) continue;
        const ddx = kp.x - p.x, ddy = kp.y - p.y;
        const dd2 = ddx*ddx + ddy*ddy;
        if (dd2 < r2 && dd2 < bestD) {
          bestD = dd2;
          best = {x: kp.x, y: kp.y, kind: kp.kind};
        }
      }
    }
  }
  
  // 3) A안 정밀 스냅 (작도 중일 때만): 접점/수선/평행/연장
  // 각 정밀스냅 토글로만 제어 - 일반 스냅 OFF여도 독립 작동
  if (firstClick && (tool === 'line' || tool === 'arc' || tool === 'circle' || tool === 'rect')) {
    if (anyPreciseOn) {
      const preciseCands = findPreciseSnapCandidates(firstClick, p);
      // 정밀 스냅은 반경을 더 크게 (접점이나 연장은 마우스에서 멀 수 있음)
      const preciseR = Math.max(radius * 3, 40);
      const preciseR2 = preciseR * preciseR;
      
      for (const c of preciseCands) {
        const dx = c.x - p.x, dy = c.y - p.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < preciseR2 && d2 < bestD) {
          bestD = d2;
          best = c;
        }
      }
    }
  }
  
  return best;
}

// ====== A안 정밀 스냅 후보 계산 (Rev.7.9) ======
// firstPt(시작점) → p(현재 마우스) 작도 중일 때, 다른 도형들과의 관계 기반 후보점 생성
function findPreciseSnapCandidates(firstPt, p) {
  const cands = [];
  const ids = new Set(); // 중복 방지
  
  // 1) 접점 (Tangent): 시작점에서 원/호에 접하는 직선
  //    캐드 동작: 마우스가 원 둘레 어느 부분에 가까우면 → 가장 가까운 수학적 접점으로 흡착
  //    원 외부 시작점일 때 접점은 정확히 2개 (대칭). 마우스 위치로 둘 중 하나 자동 선택.
  if (snapTangent && tool === 'line') {
    for (const s of shapes) {
      let cx, cy, r, isArc = false, arcStart = 0, arcEnd = Math.PI*2, arcCcw = false;
      if (s.type === 'circle') {
        cx = s.p1.x; cy = s.p1.y;
        r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
      } else if (s.type === 'arc') {
        cx = s.cx; cy = s.cy; r = s.r;
        isArc = true; arcStart = s.startAngle; arcEnd = s.endAngle; arcCcw = s.ccw;
      } else continue;
      
      const distStart = Math.hypot(firstPt.x - cx, firstPt.y - cy);
      if (distStart <= r + 0.5) continue;  // 시작점이 원 안/위면 접선 없음
      
      // 마우스가 원 둘레에 얼마나 가까운지 (확장 반경 적용)
      const distMouse = Math.hypot(p.x - cx, p.y - cy);
      const distToCircumference = Math.abs(distMouse - r);
      
      // 마우스가 원 둘레 근처(원의 반지름의 50% 또는 60px 중 큰 값 이내)면 접점 후보 활성화
      const tangentSnapThreshold = Math.max(60, r * 0.5);
      if (distToCircumference > tangentSnapThreshold) continue;
      
      // 수학적 접점 2개
      const tangents = computeTangentPoints({x: firstPt.x, y: firstPt.y}, {cx, cy, r});
      
      tangents.forEach(tp => {
        // 호일 경우 그 접점이 호 범위 내에 있어야 함
        if (isArc) {
          const ang = Math.atan2(tp.y - cy, tp.x - cx);
          if (!isAngleInArcRange(ang, arcStart, arcEnd, arcCcw)) return;
        }
        cands.push({x: tp.x, y: tp.y, kind: 'tangent', sourceId: s.id});
      });
    }
  }
  
  // 2) 수선 (Perpendicular): 시작점에서 다른 선에 내린 수선의 발
  if (snapPerpendicular && tool === 'line') {
    for (const s of shapes) {
      if (s.type === 'line') {
        // s의 무한 직선 위에 firstPt에서 내린 수선의 발
        const foot = footOnInfiniteLine(firstPt, s.p1, s.p2);
        if (foot) cands.push({x: foot.x, y: foot.y, kind: 'perp', sourceId: s.id});
      } else if (s.type === 'rect') {
        // 사각형 4변 각각에 대해
        const x1 = Math.min(s.p1.x, s.p2.x), x2 = Math.max(s.p1.x, s.p2.x);
        const y1 = Math.min(s.p1.y, s.p2.y), y2 = Math.max(s.p1.y, s.p2.y);
        const edges = [
          [{x:x1,y:y1},{x:x2,y:y1}], [{x:x2,y:y1},{x:x2,y:y2}],
          [{x:x2,y:y2},{x:x1,y:y2}], [{x:x1,y:y2},{x:x1,y:y1}]
        ];
        for (const [a,b] of edges) {
          const foot = footOnInfiniteLine(firstPt, a, b);
          if (foot) cands.push({x: foot.x, y: foot.y, kind: 'perp', sourceId: s.id});
        }
      }
      // 원에 대한 수선: 중심을 지나는 직선과의 교점 (= 가까운 4분점)
      // 일반적으로는 접점이 더 의미있으므로 생략
    }
  }
  
  // 3) 평행 (Parallel): 시작점에서 그어지는 직선이 다른 직선과 평행이 되는 지점
  // 현재 마우스 위치가 만드는 선의 각도가 기존 선과 가까우면 정확히 평행으로 보정
  if (snapParallel && tool === 'line') {
    const curDx = p.x - firstPt.x;
    const curDy = p.y - firstPt.y;
    const curLen = Math.hypot(curDx, curDy);
    if (curLen > 5) {  // 너무 짧으면 의미 없음
      const curAng = Math.atan2(curDy, curDx);
      for (const s of shapes) {
        if (s.type !== 'line' && s.type !== 'rect') continue;
        // 후보 각도들 (선=1개, 사각형=2개)
        let candAngs = [];
        if (s.type === 'line') {
          const ang = Math.atan2(s.p2.y-s.p1.y, s.p2.x-s.p1.x);
          candAngs.push(ang);
          candAngs.push(ang + Math.PI);  // 반대 방향도
        } else if (s.type === 'rect') {
          // 사각형은 수평/수직만
          candAngs = [0, Math.PI/2, Math.PI, -Math.PI/2];
        }
        for (const refAng of candAngs) {
          // 각도 차이를 -PI~PI로 정규화
          let diff = curAng - refAng;
          while (diff > Math.PI) diff -= Math.PI*2;
          while (diff < -Math.PI) diff += Math.PI*2;
          const diffDeg = Math.abs(diff * 180 / Math.PI);
          if (diffDeg < PARALLEL_ANGLE_TOL_DEG) {
            // 평행 보정: 현재 길이는 유지, 방향만 refAng로
            const x = firstPt.x + curLen * Math.cos(refAng);
            const y = firstPt.y + curLen * Math.sin(refAng);
            cands.push({x, y, kind: 'parallel', sourceId: s.id});
          }
        }
      }
    }
  }
  
  // 4) 연장선 (Extension): 시작점에서 그어지는 선이 기존 선의 연장선과 일치하거나 그 위에 있을 때
  // 또는 마우스 근처에 다른 선의 연장선이 있을 때
  if (snapExtension) {
    for (const s of shapes) {
      if (s.type !== 'line') continue;
      // 선 s의 무한 직선 위에서 p에 가장 가까운 점
      const foot = footOnInfiniteLine(p, s.p1, s.p2);
      if (!foot) continue;
      // 선분 양 끝점에서 떨어져 있어야 "연장선"
      const dToP1 = Math.hypot(foot.x-s.p1.x, foot.y-s.p1.y);
      const dToP2 = Math.hypot(foot.x-s.p2.x, foot.y-s.p2.y);
      const segLen = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
      // 선분 안에 있으면 일반 line nearest로 잡힘 → 여기서는 외부 연장만
      if (dToP1 > segLen + 2 || dToP2 > segLen + 2) {
        cands.push({x: foot.x, y: foot.y, kind: 'extension', sourceId: s.id});
      }
    }
  }
  
  return cands;
}

// 점 P에서 두 점이 정의하는 무한 직선 위에 내린 수선의 발
function footOnInfiniteLine(P, A, B) {
  const dx = B.x - A.x, dy = B.y - A.y;
  const len2 = dx*dx + dy*dy;
  if (len2 < 1e-6) return null;
  const t = ((P.x - A.x)*dx + (P.y - A.y)*dy) / len2;
  return { x: A.x + t*dx, y: A.y + t*dy };
}

// 각도 ang이 호 (startAng, endAng, ccw)의 범위 안에 있는지 (canvas 좌표계)
function isAngleInArcRange(ang, startAng, endAng, ccw) {
  const norm = a => { while(a < 0) a += Math.PI*2; while(a >= Math.PI*2) a -= Math.PI*2; return a; };
  const na = norm(ang);
  const ns = norm(startAng);
  const ne = norm(endAng);
  // canvas의 ccw=false 면 start→end로 각도 증가 방향 (캔버스 시계방향)
  // 시작각부터 ccw=false 방향으로 끝각까지 경로상에 na가 있는지
  if (!ccw) {
    if (ns <= ne) return na >= ns && na <= ne;
    return na >= ns || na <= ne;
  } else {
    if (ns >= ne) return na <= ns && na >= ne;
    return na <= ns || na >= ne;
  }
}

// 점 P에서 중심 (cx,cy) 반지름 r 원에 그어지는 접선의 접점 2개
function computeTangentPoints(P, circle) {
  const cx = circle.cx, cy = circle.cy, r = circle.r;
  const dx = P.x - cx, dy = P.y - cy;
  const dist = Math.hypot(dx, dy);
  if (dist <= r + 0.5) return [];  // 점이 원 안이나 위에 있으면 접선 없음
  
  // 벡터 (P-C) 정규화
  const ux = dx / dist, uy = dy / dist;
  // 접점은 C에서 (P방향으로 r²/dist만큼) + (수직방향으로 ±r*sqrt(1-(r/dist)²))
  const a = r * r / dist;
  const h = r * Math.sqrt(Math.max(0, 1 - (r/dist) * (r/dist)));
  const baseX = cx + ux * a;
  const baseY = cy + uy * a;
  // 수직 단위벡터: (-uy, ux)
  return [
    { x: baseX + (-uy) * h, y: baseY + (ux) * h },
    { x: baseX - (-uy) * h, y: baseY - (ux) * h }
  ];
}

function getCanvasPoint(e) {
  const r = drawCanvas.getBoundingClientRect();
  const p = {
    x: Math.round((e.clientX - r.left) / zoom),
    y: Math.round((e.clientY - r.top) / zoom)
  };
  const snap = findNearestSnap(p);
  if (snap) { p.snapped = true; p.x = snap.x; p.y = snap.y; snapShown = snap; }
  else snapShown = null;
  return p;
}

// ====== 마우스 이벤트 ======
drawCanvas.addEventListener('mousemove', e => {
  const p = getCanvasPoint(e);
  lastMousePoint = p; // 회전축 거리입력 Enter 처리용
  const mmX = (p.x * mmPerPixel).toFixed(2);
  const mmY = (p.y * mmPerPixel).toFixed(2);
  const unit = calibSet ? `${mmX}, ${mmY} mm` : `${p.x}, ${p.y} px`;
  document.getElementById('statusCoord').textContent = unit + (p.snapped ? ' 🧲' : '');

  // Rev.16.24: 필렛 방향 미리보기 (지름 입력 후 진행 중)
  if (filletPreview){
    drawFilletPreview(p);
    return;
  }

  // Rev.16.14: 쓸어 지우기 미리보기 - 경로(빨강) + 삭제예정 선(빨강 굵게)
  if (swipeEraseMode){
    if (swipeErasing){
      const last = swipePath[swipePath.length-1];
      if (!last || Math.hypot(p.x-last.x, p.y-last.y) > (3/(zoom||1))){
        swipePath.push({ x: p.x, y: p.y });
      }
    }
    drawSwipeErasePreview(p);
    return;
  }

  // Rev.16.10: 대각선(교점) 미리보기 - 반경 원 + 범위내 교점후보 + 선택점 + 드래그박스
  if (diagXMode){
    diagXHoverPt = { x: p.x, y: p.y };
    drawDiagXPreview(p);
    return;
  }

  // Rev.12.6: 거리두기 좌/우 미리보기 (대상 선 선택 후)
  if (offsetTwinPickMode && offsetTwinTarget){
    drawOffsetTwinPreview(p);
    return;
  }

  // Rev.11.39: 이동(Grab) 모드 - 마우스 따라 선택 도형 이동
  if (grabMode){
    grabUpdate(p);
    return;
  }

  // Rev.11.20: 연장(Extrude) 미리보기
  if (extrudeMode && extrudeState) {
    const off = extrudeOffset(p);
    drawExtrudePreview(off);
    return;
  }
  // 캘리브 도구: 첫 점 클릭 후 두 번째 점까지의 미리보기
  if (tool === 'calib' && calibFirstPoint) {
    drawCalibPreview(calibFirstPoint, p);
    return;
  }
  
  // 회전축 도구: 첫 점 클릭 후 미리보기
  if (tool === 'axis' && axisFirstPoint) {
    // Shift 직선 잠금 + 거리 오버라이드 적용
    const constrained = applyAxisConstraint(axisFirstPoint, p);
    drawAxisPreview(axisFirstPoint, constrained);
    // 길이 표시 (mm 우선)
    const dx0 = constrained.x - axisFirstPoint.x;
    const dy0 = constrained.y - axisFirstPoint.y;
    const lenPx = Math.hypot(dx0, dy0);
    const lenMmShow = (lenPx * mmPerPixel).toFixed(2);
    const angDeg = (Math.atan2(-dy0, dx0) * 180 / Math.PI).toFixed(1);
    const lockTxt = shiftDown ? ' [Shift:45°잠금]' : '';
    const distTxt = axisDistanceOverride !== null
      ? ` ⟪ 거리고정 ${axisDistanceOverride}${calibSet ? 'mm' : 'px'} ⟫` : '';
    document.getElementById('statusHint').textContent =
      `🔄 회전축 2번째 점 → 길이 ${lenMmShow}mm (${lenPx.toFixed(0)}px) · ${angDeg}°${lockTxt}${distTxt}` +
      ` · 숫자입력=거리지정(Enter확정, Esc해제)`;
    return;
  }
  
  // Rev.10.9: select 외 도구에서 시작된 박스 선택 드래그 미리보기
  if (dragState && dragState.type === 'box' && dragState.fromOtherTool) {
    const dx = p.x - dragState.boxStart.x;
    const dy = p.y - dragState.boxStart.y;
    // 5px 이상 움직였을 때만 박스 선택을 실제로 시작
    if (!dragState.active) {
      if (Math.hypot(dx, dy) < 5) return; // 아직 작은 움직임 - 도구 미리보기 계속
      // 활성화: 기존 선택 해제 (Shift 누른 상태면 추가 선택)
      dragState.active = true;
      if (!shiftDown) { selectedIds.clear(); updateSelStat(); redrawDraw(); }
    }
    drawBoxSelectPreview(dragState.boxStart, p);
    return;
  }
  
  if (tool === 'select') {
    // 호 핸들 드래그 처리
    if (arcHandleDrag) {
      handleArcHandleDrag(p);
      return;
    }
    // Rev.11.12: 그립 위 hover 시 커서 변경 (드래그 중이 아닐 때)
    if (!dragState){
      const overGrip = hitGrip(p);
      drawCanvas.style.cursor = overGrip ? 'crosshair' : 'default';
    }
    // Rev.11.12: 끝점 그립 드래그 (연장/이동) - 스냅 지원
    // Rev.11.15: 정렬 추적 추가 (점 위치 유지하며 X/Y축만 정렬 → 수평/수직 연장)
    if (dragState && dragState.type === 'grip') {
      const g = dragState.grip;
      const s = shapes.find(x => x.id === g.shapeId);
      if (!s) return;
      let nx = p.x, ny = p.y;
      // Shift = 수평/수직 제약 (반대편 끝점 기준)
      let anchor = null;
      if (s.type === 'line') anchor = (g.key === 'p1') ? s.p2 : s.p1;
      if (shiftDown && anchor){
        if (Math.abs(nx - anchor.x) > Math.abs(ny - anchor.y)) ny = anchor.y;
        else nx = anchor.x;
      }
      let snapHit = null;     // 점 직접 스냅
      let alignX = null;      // X 정렬 기준점 {x,y} (수직 정렬선)
      let alignY = null;      // Y 정렬 기준점 {x,y} (수평 정렬선)
      if (snapMode && !shiftDown){
        const radius = (parseInt(document.getElementById('snapRadius').value) || 15) / (zoom || 1);
        // 후보점 수집: 다른 도형의 끝점/코너/중심 + 배경 스냅점 + (선이면) 반대편 끝점
        const cand = [];
        shapes.forEach(o => {
          if (o.id === s.id) return;
          if (o.type === 'line' && o.p1 && o.p2){ cand.push(o.p1, o.p2); }
          else if (o.type === 'rect' && o.p1 && o.p2){
            cand.push(o.p1, {x:o.p2.x,y:o.p1.y}, o.p2, {x:o.p1.x,y:o.p2.y});
          }
          else if (o.type === 'circle'){ cand.push({x:o.cx, y:o.cy}); }
          else if (o.type === 'arc'){
            cand.push({x:o.cx + o.r*Math.cos(o.startAngle), y:o.cy + o.r*Math.sin(o.startAngle)});
            cand.push({x:o.cx + o.r*Math.cos(o.endAngle), y:o.cy + o.r*Math.sin(o.endAngle)});
          }
        });
        if (typeof snapPoints !== 'undefined' && snapPoints.length){
          snapPoints.forEach(sp => cand.push(sp));
        }
        // 반대편 끝점(앵커)도 정렬 후보 → 늘려도 수평/수직 유지
        if (anchor) cand.push({x: anchor.x, y: anchor.y, _anchor: true});

        // ① 점 직접 스냅: 마우스와 가장 가까운 후보점 (반경 내)
        let best = Infinity;
        cand.forEach(c => {
          const d = Math.hypot(c.x - p.x, c.y - p.y);
          if (d < radius && d < best){ best = d; snapHit = c; }
        });

        // ② 점 스냅이 없으면 정렬 추적: X 정렬(수직선) / Y 정렬(수평선)
        if (!snapHit){
          let bestDX = radius, bestDY = radius;
          cand.forEach(c => {
            const dX = Math.abs(c.x - p.x); // 세로 정렬선까지 거리
            const dY = Math.abs(c.y - p.y); // 가로 정렬선까지 거리
            if (dX < bestDX){ bestDX = dX; alignX = c; }
            if (dY < bestDY){ bestDY = dY; alignY = c; }
          });
        }
      }

      if (snapHit){
        nx = snapHit.x; ny = snapHit.y;
      } else {
        // 정렬: X는 alignX의 X로(세로 정렬), Y는 alignY의 Y로(가로 정렬)
        if (alignX) nx = alignX.x;
        if (alignY) ny = alignY.y;
      }

      // 그립 좌표를 도형에 반영
      applyGripMove(s, g.key, nx, ny);
      redrawDraw();

      // 가이드/스냅 표시
      preCtx.clearRect(0,0,baseW,baseH);
      preCtx.save();
      const Z = zoom || 1;
      if (snapHit){
        const sr = 6 / Z;
        preCtx.strokeStyle = '#00ff88';
        preCtx.lineWidth = 2 / Z;
        preCtx.strokeRect(snapHit.x - sr, snapHit.y - sr, sr*2, sr*2);
      } else {
        // 정렬 가이드 점선 (수직: 주황 / 수평: 하늘)
        preCtx.setLineDash([6/Z, 4/Z]);
        preCtx.lineWidth = 1 / Z;
        if (alignX){
          preCtx.strokeStyle = '#ff9b3d';
          preCtx.beginPath();
          preCtx.moveTo(alignX.x, alignX.y);
          preCtx.lineTo(nx, ny);
          preCtx.stroke();
          // 기준점 표시
          preCtx.setLineDash([]);
          preCtx.strokeStyle = '#ff9b3d';
          const m = 4 / Z;
          preCtx.strokeRect(alignX.x - m, alignX.y - m, m*2, m*2);
          preCtx.setLineDash([6/Z, 4/Z]);
        }
        if (alignY){
          preCtx.strokeStyle = '#3dc8ff';
          preCtx.beginPath();
          preCtx.moveTo(alignY.x, alignY.y);
          preCtx.lineTo(nx, ny);
          preCtx.stroke();
          preCtx.setLineDash([]);
          preCtx.strokeStyle = '#3dc8ff';
          const m = 4 / Z;
          preCtx.strokeRect(alignY.x - m, alignY.y - m, m*2, m*2);
          preCtx.setLineDash([6/Z, 4/Z]);
        }
      }
      preCtx.restore();

      // 길이/좌표 안내
      let alignMsg = '';
      if (snapHit) alignMsg = ' [🧲 점 스냅]';
      else if (alignX && alignY) alignMsg = ' [📐 X·Y 정렬]';
      else if (alignX) alignMsg = ' [📐 수직 정렬]';
      else if (alignY) alignMsg = ' [📐 수평 정렬]';
      else if (shiftDown) alignMsg = ' [Shift: 직선]';
      if (s.type === 'line'){
        const len = Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y) * mmPerPixel;
        document.getElementById('statusHint').textContent =
          `↔ 끝점 이동: 길이 ${len.toFixed(2)}mm` + alignMsg;
      } else {
        document.getElementById('statusHint').textContent =
          `↔ 코너 이동: (${(nx*mmPerPixel).toFixed(2)}, ${(ny*mmPerPixel).toFixed(2)})mm` + alignMsg;
      }
      return;
    }
    if (dragState && dragState.type === 'movefill') {
      let dx = p.x - dragState.startX, dy = p.y - dragState.startY;
      if (dx !== 0 || dy !== 0) dragState.moved = true;
      if (shiftDown) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const f = fills.find(x => x.id === dragState.fillId);
      if (f){
        f.points = dragState.basePts.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
        redrawFills(); redrawDraw();
      }
      return;
    }
    if (dragState && dragState.type === 'move') {
      let dx = p.x - dragState.startX, dy = p.y - dragState.startY;
      if (dx !== 0 || dy !== 0) dragState.moved = true; // Rev.11.41: 실제 이동 표시
      // Shift 누르면 수평/수직만 (큰 변위 방향만 적용)
      if (shiftDown) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      
      // 이동 스냅: 선택된 도형들의 끝점을 다른 도형의 끝점/선/면으로 자동 흡착
      // 가장 가까운 (선택된 끝점, 타깃) 쌍을 찾아 그쪽으로 보정
      let snapApplied = null;  // {targetPoint, snappedShape, type}
      if (snapMode && !shiftDown) {
        const radius = (parseInt(document.getElementById('snapRadius').value) || 15) / (zoom || 1);
        const r2 = radius * radius;
        
        // 모든 선택된 도형의 끝점들 (이동 후 예상 위치)
        const movedPoints = [];  // [{x, y, shapeId, kind}]
        for (const off of dragState.offsets) {
          const s = shapes.find(x => x.id === off.id);
          if (!s) continue;
          getShapeKeyPoints({...s, _snapshot: off}).forEach(kp => {
            // 이동 후 위치 (off의 원본에 dx,dy 더함)
            movedPoints.push({x: kp.x + dx, y: kp.y + dy, shapeId: s.id});
          });
        }
        
        // 후보 타깃: 비선택 도형들의 끝점 + 배경 스냅점
        let bestD2 = r2;
        let bestSnapDx = 0, bestSnapDy = 0;
        let bestTarget = null;
        
        for (const mp of movedPoints) {
          // 배경 스냅점
          for (const sp of snapPoints) {
            const d2 = (sp.x - mp.x)*(sp.x - mp.x) + (sp.y - mp.y)*(sp.y - mp.y);
            if (d2 < bestD2) {
              bestD2 = d2;
              bestSnapDx = sp.x - mp.x; bestSnapDy = sp.y - mp.y;
              bestTarget = {pt: sp, kind: 'corner'};
            }
          }
          // 비선택 도형의 특징점들
          for (const ts of shapes) {
            if (selectedIds.has(ts.id)) continue;
            const tps = getShapeKeyPoints(ts);
            for (const tp of tps) {
              const d2 = (tp.x - mp.x)*(tp.x - mp.x) + (tp.y - mp.y)*(tp.y - mp.y);
              if (d2 < bestD2) {
                bestD2 = d2;
                bestSnapDx = tp.x - mp.x; bestSnapDy = tp.y - mp.y;
                bestTarget = {pt: tp, kind: tp.kind || 'endpoint'};
              }
            }
            // 선 위/원 위 가까운 점에도 스냅 (선의 면 스냅)
            const nearestOnShape = nearestPointOnShape({x:mp.x, y:mp.y}, ts);
            if (nearestOnShape) {
              const d2 = (nearestOnShape.x-mp.x)*(nearestOnShape.x-mp.x) + (nearestOnShape.y-mp.y)*(nearestOnShape.y-mp.y);
              if (d2 < bestD2) {
                bestD2 = d2;
                bestSnapDx = nearestOnShape.x - mp.x; bestSnapDy = nearestOnShape.y - mp.y;
                bestTarget = {pt: nearestOnShape, kind: 'on-shape'};
              }
            }
          }
        }
        
        // 스냅 보정 적용
        if (bestTarget) {
          dx += bestSnapDx; dy += bestSnapDy;
          snapApplied = bestTarget;
        }
      }
      
      for (const off of dragState.offsets) {
        const s = shapes.find(x => x.id === off.id);
        if (s) moveShapeTo(s, off, dx, dy);
      }
      redrawDraw();
      
      // 스냅 인디케이터 표시
      if (snapApplied) {
        preCtx.clearRect(0,0,baseW,baseH);
        preCtx.save();
        preCtx.strokeStyle = '#f39c12';
        preCtx.lineWidth = 2;
        const sr = 10;
        preCtx.strokeRect(snapApplied.pt.x - sr, snapApplied.pt.y - sr, sr*2, sr*2);
        preCtx.beginPath();
        preCtx.moveTo(snapApplied.pt.x - sr/2, snapApplied.pt.y);
        preCtx.lineTo(snapApplied.pt.x + sr/2, snapApplied.pt.y);
        preCtx.moveTo(snapApplied.pt.x, snapApplied.pt.y - sr/2);
        preCtx.lineTo(snapApplied.pt.x, snapApplied.pt.y + sr/2);
        preCtx.stroke();
        // 라벨
        const kindLabel = {corner:'코너', endpoint:'끝점', midpoint:'중점', center:'중심', 'on-shape':'선위'}[snapApplied.kind] || '스냅';
        preCtx.fillStyle = '#f39c12';
        preCtx.font = 'bold 11px sans-serif';
        preCtx.fillText(`🧲 ${kindLabel}`, snapApplied.pt.x + 12, snapApplied.pt.y - 8);
        preCtx.restore();
      } else {
        preCtx.clearRect(0,0,baseW,baseH);
      }
      
      // 이동 거리 표시 (mm)
      const dxMm = (dx * mmPerPixel).toFixed(2);
      const dyMm = (dy * mmPerPixel).toFixed(2);
      document.getElementById('statusHint').textContent = 
        `🔲 이동 중: ΔX=${dxMm}mm, ΔY=${dyMm}mm` + 
        (shiftDown ? ' [Shift: 직선이동]' : '') +
        (snapApplied ? ` [🧲 ${snapApplied.kind} 스냅]` : '');
      // Rev.11.9: 이동 거리 패널이 열려있으면 실시간 갱신
      updateMoveDeltaPanelLive();
      return;
    } else if (dragState && dragState.type === 'box') {
      drawBoxSelectPreview(dragState.boxStart, p);
      return;
    }
  } else if (tool === 'arc' && firstClick) {
    // 라운드 도구: 마우스 경로 기록
    if (arcPath.length === 0 || 
        (Math.abs(p.x - arcPath[arcPath.length-1].x) + Math.abs(p.y - arcPath[arcPath.length-1].y)) > 2) {
      arcPath.push({x: p.x, y: p.y});
    }
    drawArcPreview(firstClick, p);
    return;
  } else if (firstClick) {
    drawPreview(firstClick, p);
    return;
  }
  drawSnapIndicator();
});

drawCanvas.addEventListener('mousedown', e => {
  // Rev.11.26: 휠 클릭(가운데 버튼)은 패닝 전용 → 작도/선택 처리 안 함
  if (e.button === 1) return;

  // Rev.16.24: 필렛 방향 미리보기 중 - 좌클릭=확정, 우클릭=취소
  if (filletPreview){
    const p = getCanvasPoint(e);
    if (e.button === 0){ commitFilletAt(p); }
    else if (e.button === 2){ cancelFilletPreview(); }
    e.preventDefault();
    return;
  }

  // Rev.12.7: 거리두기 픽 모드 중에는 select 드래그(박스·이동) 시작 안 함 (click 으로만 처리)
  if ((offsetTwinPickMode || baseLineMode) && e.button === 0) return;

  // Rev.11.39: 이동(Grab) 모드 - 좌클릭 = 확정
  if (grabMode){
    if (e.button === 0){
      exitGrabMode(true);
      document.getElementById('statusHint').textContent = '✓ 이동 확정';
      e.preventDefault();
      return;
    }
  }

  // Rev.16.10: 대각선(교점) 모드 - 드래그 시작 (영역 선택)
  if (diagXMode){
    // 우클릭 = 취소
    if (e.button === 2){
      cancelDiagX();
      e.preventDefault();
      return;
    }
    if (e.button === 0){
      const p = getCanvasPoint(e);
      // 시작/끝 교점 모두 Shift+드래그 박스로 선택
      if (e.shiftKey){
        diagXDragging = true;
        diagXDragOrigin = { x: p.x, y: p.y };
      } else {
        const stg = diagXPhase === 0 ? '시작' : '끝';
        document.getElementById('statusHint').textContent = `╲ 대각선: ${stg} 교점은 Shift+드래그로 박스 선택하세요 (최대 2개)`;
      }
      e.preventDefault();
      return;
    }
  }

  // Rev.16.14: 쓸어 지우기 모드 - 드래그 시작
  if (swipeEraseMode){
    if (e.button === 2){  // 우클릭 = 종료
      exitSwipeEraseMode();
      document.getElementById('statusHint').textContent = '🧹 쓸어 지우기 종료';
      e.preventDefault();
      return;
    }
    if (e.button === 0){
      const p = getCanvasPoint(e);
      swipeErasing = true;
      swipePath = [{ x: p.x, y: p.y }];
      e.preventDefault();
      return;
    }
  }

  // Rev.11.37: 블렌더식 분할 모드
  if (subdivideMode){
    if (e.button === 0){
      const p = getCanvasPoint(e);
      if (!subdivideTarget){
        // 선 선택
        const target = findShapeAtPoint(p, 15);
        if (target && target.type === 'line'){
          subdivideTarget = target;
          subdivideCount = 1;
          drawSubdividePreview();
        } else {
          document.getElementById('statusHint').textContent = '✂ 분할: 선(line)만 분할 가능합니다. 선을 클릭하세요.';
        }
      } else {
        // 이미 선 선택됨 → 좌클릭 = 적용
        applySubdivide();
      }
      e.preventDefault();
      return;
    }
  }

  // Rev.11.20: 연장(Extrude) 확정 (좌클릭)
  if (extrudeMode && extrudeState && e.button === 0) {
    // Rev.11.43: 드래그로 연장 - mousedown은 드래그 시작만 표시
    extrudeDragging = true;
    e.preventDefault();
    return;
  }
  // Rev.11.18: 버텍스 점 찍기 모드 (좌클릭 = 점 생성)
  if (pointMode && e.button === 0) {
    let p = getCanvasPoint(e);
    p = snapPointForVertex(p); // 스냅 적용
    const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
    shapes.push({
      id: ++shapeIdSeq, type: 'point',
      p1: { x: p.x, y: p.y },
      stroke: document.getElementById('strokeColor').value || '#16e0b0',
      strokeWidth: sw
    });
    redoStack = []; pushHistory();
    redrawDraw(); updateCount();
    // Rev.11.44: 점 생성은 1회성 - 점 1개 찍으면 모드 종료
    pointMode = false;
    updateVertexButtons();
    drawCanvas.style.cursor = 'default';
    document.getElementById('statusHint').textContent =
      `• 점 생성 완료 (${(p.x*mmPerPixel).toFixed(2)}, ${(p.y*mmPerPixel).toFixed(2)})mm`;
    e.preventDefault();
    return;
  }
  // Rev.11.18: 연결 모드 (점/끝점을 순서대로 클릭해 선으로 잇기)
  // Rev.11.19: 연결에 사용된 버텍스 점은 선으로 흡수되어 삭제됨
  if (connectMode && e.button === 0) {
    let p = getCanvasPoint(e);
    // 클릭 위치에 버텍스 점이 있으면 그 점에 정확히 맞추고 삭제 대상으로 기록
    let usedPointId = null;
    const tolPt = (parseInt(document.getElementById('snapRadius').value) || 15) / (zoom || 1);
    for (let i = shapes.length - 1; i >= 0; i--) {
      const o = shapes[i];
      if (o.type === 'point' && o.p1 && Math.hypot(o.p1.x - p.x, o.p1.y - p.y) <= tolPt) {
        p = { x: o.p1.x, y: o.p1.y };
        usedPointId = o.id;
        break;
      }
    }
    // 버텍스에 안 걸리면 일반 스냅(끝점/코너 등) 적용
    if (usedPointId === null) p = snapPointForVertex(p);

    connectPoints.push({ x: p.x, y: p.y, pointId: usedPointId });
    if (connectPoints.length >= 2) {
      const a = connectPoints[connectPoints.length - 2];
      const b = connectPoints[connectPoints.length - 1];
      const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
      shapes.push({
        id: ++shapeIdSeq, type: 'line',
        p1: { x: a.x, y: a.y }, p2: { x: b.x, y: b.y },
        stroke: document.getElementById('strokeColor').value || '#ffffff',
        strokeWidth: sw
      });
      // 이 선에 사용된 양 끝의 버텍스 점 삭제 (선으로 흡수)
      [a.pointId, b.pointId].forEach(pid => {
        if (pid != null){
          const idx = shapes.findIndex(x => x.id === pid && x.type === 'point');
          if (idx >= 0) shapes.splice(idx, 1);
        }
      });
      redoStack = []; pushHistory();
      redrawDraw(); updateCount();
      // Rev.14.6: 연결은 1회성 - 선 1개 생성 후 모드 종료
      connectPoints = [];
      exitConnectMode();
      drawCanvas.style.cursor = 'default';
      document.getElementById('statusHint').textContent =
        '🔗 연결: 선 1개 생성 완료 (모드 종료) · 다시 연결하려면 F';
      e.preventDefault();
      return;
    }
    document.getElementById('statusHint').textContent =
      `🔗 연결: 1번째 점 지정됨 · 두 번째 점을 클릭하면 선 생성 / 우클릭·Esc=종료`;
    e.preventDefault();
    return;
  }

  // 끝점 픽킹 모드 (select 도구 외에서도 동작 - 어느 도구에서든 picker 활성 시 우선 처리)
  if (endpointPickState) {
    const p = getCanvasPoint(e);
    handleEndpointPick(p);
    e.preventDefault();
    return;
  }

  // ===== Rev.10.9: 모든 도구에서 좌클릭 드래그로 박스 선택 가능 =====
  // 조건:
  //   - 좌클릭만 (button === 0)
  //   - 'select' 도구가 아닐 때
  //   - 작도 중 첫 점이 이미 찍히지 않은 상태 (firstClick 등)
  //   - 호 핸들 편집 중도 아님
  //   - 도형이 없는 빈 영역에서 시작
  if (tool !== 'select' && tool !== 'fill' && e.button === 0 && !endpointPickState && !arcHandleDrag) {
    const inDrawSequence =
      firstClick || axisFirstPoint || calibFirstPoint ||
      (typeof arcPath !== 'undefined' && arcPath.length > 0) ||
      filletState || offsetState || dimState ||
      (typeof copyTransformState !== 'undefined' && copyTransformState) ||
      idPickActive;
    if (!inDrawSequence) {
      const p = getCanvasPoint(e);
      const hit = hitTest(p);
      if (!hit) {
        // 빈 영역 → 박스 선택 모드 대기 (5px 이상 움직여야 실제 활성화)
        // 즉, 살짝 클릭은 도구의 일반 클릭으로 처리됨
        dragState = { type: 'box', boxStart: p, fromOtherTool: true, active: false };
        window._lastBoxRect = null;
        return; // preventDefault 안 함 → click 이벤트도 같이 발생
      }
      // 도형 위에서는 기존 도구의 동작에 맡김
    }
  }

  if (tool !== 'select') return;
  const p = getCanvasPoint(e);
  
  // 호 핸들 클릭 처리 (편집 중인 호가 있을 때 우선)
  if (editingArcId !== null) {
    const arcShape = shapes.find(x => x.id === editingArcId);
    if (arcShape) {
      const handleType = hitArcHandle(p, arcShape);
      if (handleType) {
        // 핸들 드래그 시작
        arcHandleDrag = {
          type: handleType,
          shapeId: editingArcId,
          original: {
            startAngle: arcShape.startAngle,
            endAngle: arcShape.endAngle,
            ccw: arcShape.ccw,
            r: arcShape.r
          },
          mouseStartAngle: Math.atan2(p.y - arcShape.cy, p.x - arcShape.cx)
        };
        e.preventDefault();
        return;
      }
    }
  }
  
  const hit = hitTest(p);
  // Rev.11.12: 단일 선택 도형의 끝점 그립을 잡으면 끝점 드래그(연장/이동) 시작
  const grip = hitGrip(p);
  if (grip) {
    dragState = { type: 'grip', grip: grip, startX: p.x, startY: p.y };
    e.preventDefault();
    return;
  }
  if (hit) {
    if (!selectedIds.has(hit.id)) {
      if (!e.shiftKey) selectedIds.clear();
      selectedIds.add(hit.id);
      updateSelStat(); redrawDraw();
    }
    updateShapePropPanel();  // Rev.14.5: 클릭 즉시 속성 패널 갱신 (editingShapeId 설정)
    const offsets = [];
    selectedIds.forEach(id => {
      const s = shapes.find(x => x.id === id);
      if (s) offsets.push(snapshotShape(s));
    });
    dragState = { type: 'move', startX: p.x, startY: p.y, offsets };
    // Rev.11.9: 이동 시작 시점을 기준으로 거리 패널 준비
    captureMoveDeltaBase();
    showMoveDeltaPanel(0, 0);
  } else {
    // Rev.16.0: 도형이 없으면 채움(fill) 위인지 검사 → 채움 단독 선택·이동
    const fhit = hitTestFill(p);
    if (fhit){
      selectedFillIds.clear(); selectedFillIds.add(fhit.id);
      if (!e.shiftKey) selectedIds.clear();
      updateSelStat(); redrawFills(); redrawDraw();
      dragState = { type: 'movefill', startX: p.x, startY: p.y,
                    fillId: fhit.id, basePts: fhit.points.map(pt => ({x:pt.x, y:pt.y})) };
      document.getElementById('statusHint').textContent = '🎨 채움 선택 — 드래그로 이동 (외곽선 버튼 누르면 이 위치에 외곽선 생성)';
      e.preventDefault();
      return;
    }
    // Rev.11.62: 블렌더식 - 점/선 선택 + Shift+빈공간 클릭 → 즉시 연장(점→선, 선→면)
    if (e.shiftKey && selectedIds.size > 0) {
      if (blenderQuickExtrudeAt(p)) {
        suppressNextClick = true; // 직후 click으로 선택 해제 방지
        e.preventDefault();
        return;
      }
    }
    if (!e.shiftKey) { selectedIds.clear(); selectedFillIds.clear(); updateSelStat(); redrawDraw(); redrawFills(); updateShapePropPanel(); }
    dragState = { type: 'box', boxStart: p };
    window._lastBoxRect = null;
  }
});

drawCanvas.addEventListener('mouseup', e => {
  // Rev.16.14: 쓸어 지우기 - 드래그 종료 시 경로가 가로지른 선 중 각도차≥임계값인 선 삭제
  if (swipeEraseMode && swipeErasing){
    swipeErasing = false;
    const p = getCanvasPoint(e);
    const last = swipePath[swipePath.length-1];
    if (!last || Math.hypot(p.x-last.x, p.y-last.y) > 0.5) swipePath.push({x:p.x, y:p.y});
    const ids = swipeEraseTargets(swipePath, swipeAngleThresh);
    if (ids.length){
      shapes = shapes.filter(s => !ids.includes(s.id));
      selectedIds.clear();
      redoStack = []; pushHistory();
      redrawDraw(); updateCount();
      document.getElementById('statusHint').textContent =
        `🧹 쓸어 지우기: 방향 ${swipeAngleThresh}° 이상 어긋난 선 ${ids.length}개 삭제 · 계속 드래그 · 우클릭/Esc=종료`;
    } else {
      document.getElementById('statusHint').textContent = '🧹 쓸어 지우기: 조건에 맞는 선이 없습니다 (경로를 가로지르고 방향이 어긋난 선만 삭제)';
    }
    swipePath = [];
    preCtx.clearRect(0,0,baseW,baseH);
    redrawDraw();
    e.preventDefault();
    return;
  }

  // Rev.16.12: 대각선(교점) - Shift+드래그 박스로 시작(Phase0)·끝(Phase1) 교점 각각 선택
  if (diagXMode && diagXDragging){
    diagXDragging = false;
    const p = getCanvasPoint(e);
    const o = diagXDragOrigin || p;
    diagXDragOrigin = null;

    const dragDist = Math.hypot(p.x - o.x, p.y - o.y);
    let picked;
    if (dragDist > (8 / (zoom||1))){
      picked = intersectionsInBox(Math.min(o.x,p.x), Math.min(o.y,p.y), Math.max(o.x,p.x), Math.max(o.y,p.y));
    } else {
      const rWorld = diagXRadius / (zoom||1);
      picked = intersectionsWithinRadius(p.x, p.y, rWorld);
    }
    const sel = picked.slice(0, 2).map(q => ({x:q.x, y:q.y}));

    if (sel.length === 0){
      document.getElementById('statusHint').textContent = '╲ 대각선: 선택 영역 안에 교점이 없습니다. 교차부를 더 넓게 Shift+드래그하세요.';
      drawDiagXPreview(p);
      e.preventDefault(); return;
    }

    if (diagXPhase === 0){
      diagXStartPts = sel;
      diagXPhase = 1;
      document.getElementById('statusHint').textContent =
        `╲ 시작 교점 ${sel.length}곳 마킹됨 — 이제 끝 교점을 Shift+드래그로 선택하세요 (우클릭/Esc=취소)`;
      drawDiagXPreview(p);
    } else {
      // Phase 1: 끝 교점 확정 → 시작 개수에 맞춰 자르고 확인 팝업
      const n = Math.min(diagXStartPts.length, sel.length);
      diagXEndPts = sel.slice(0, n);
      drawDiagXPreview(p);
      confirmDiagX();
    }
    e.preventDefault();
    return;
  }

  // Rev.11.43: 연장 드래그 종료 → 확정 (모드는 유지하여 연속 연장 가능)
  if (extrudeMode && extrudeState && extrudeDragging){
    extrudeDragging = false;
    const p = getCanvasPoint(e);
    const off = extrudeOffset(p);
    if (off.dist > 1){ // 충분히 드래그됐을 때만 확정
      commitExtrude(off);
    }
    preCtx.clearRect(0,0,baseW,baseH);
    // 모드 종료 (commitExtrude가 새 도형 선택 상태로 만듦) → 다시 연장하려면 버튼/E
    extrudeMode = false; extrudeState = null; extrudeAxis = null;
    updateVertexButtons();
    drawCanvas.style.cursor = 'default';
    document.getElementById('statusHint').textContent = '⬄ 연장 완료 · 계속하려면 도형 선택 후 연장(E)';
    return;
  }
  // 호 핸들 드래그 종료
  if (arcHandleDrag) {
    arcHandleDrag = null;
    updateShapePropPanel();  // 통합 패널 갱신
    return;
  }
  // Rev.10.9: select 외 도구에서 시작된 박스 선택 확정
  if (dragState && dragState.type === 'box' && dragState.fromOtherTool) {
    if (dragState.active) {
      // 실제로 5px 이상 드래그된 경우만 박스 선택 확정
      const p = getCanvasPoint(e);
      boxSelect(dragState.boxStart, p, e.shiftKey);
      preCtx.clearRect(0,0,baseW,baseH);
      window._lastBoxRect = null;
      updateShapePropPanel();  // Rev.14.5
      suppressNextClick = true; // click 이벤트 차단
    }
    // active=false였다면 도구의 일반 클릭으로 처리되도록 그냥 종료
    dragState = null;
    return;
  }
  if (tool !== 'select') return;
  const p = getCanvasPoint(e);
  if (dragState && dragState.type === 'box') {
    boxSelect(dragState.boxStart, p, e.shiftKey);
    preCtx.clearRect(0,0,baseW,baseH);
    window._lastBoxRect = null;
    updateShapePropPanel();  // Rev.14.5: 박스 선택 후에도 단일 선택이면 패널 표시
  } else if (dragState && dragState.type === 'move') {
    preCtx.clearRect(0,0,baseW,baseH);  // 스냅 표시 제거
    updateToolStatus();
    updateShapePropPanel();  // 이동 후 패널값 갱신
    // Rev.11.41: 실제로 움직였으면 히스토리 기록
    if (dragState.moved) { redoStack = []; pushHistory(); }
  } else if (dragState && dragState.type === 'movefill') {
    // Rev.16.0: 채움 이동 종료
    if (dragState.moved) { redoStack = []; pushHistory(); }
    suppressNextClick = true; // 드래그 후 click으로 선택 해제/외곽선 오작동 방지
  } else if (dragState && dragState.type === 'grip') {
    // Rev.11.12: 끝점 그립 드래그 종료
    preCtx.clearRect(0,0,baseW,baseH);
    redoStack = []; pushHistory();
    redrawDraw();
    updateToolStatus();
    updateShapePropPanel();
    suppressNextClick = true; // 드래그 후 click으로 인한 선택 해제 방지
  }
  dragState = null;
});

// Rev.10.9: 박스 선택 후 click 이벤트 중복 방지
let suppressNextClick = false;

drawCanvas.addEventListener('click', e => {
  // Rev.16.24: 필렛 방향 미리보기 중에는 click 무시 (mousedown에서 처리)
  if (filletPreview) return;
  // Rev.16.14: 쓸어 지우기 모드는 mousedown/up에서 처리하므로 click 무시
  if (swipeEraseMode) return;
  // Rev.16.11: 대각선 모드는 mousedown에서 처리하므로 click은 무시 (select 동작 방지)
  if (diagXMode) return;
  // Rev.10.9: 박스 선택 직후의 click 이벤트 무시
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  // Rev.12.6: 거리두기 좌/우 선택 모드 (select 도구 상태에서 동작)
  if (offsetTwinPickMode) {
    const pOt = getCanvasPoint(e);
    if (handleOffsetTwinPickClick(pOt)) return;
  }
  // Rev.13.3: 베이스선 복제 모드 (select 도구 상태에서 동작)
  if (baseLineMode) {
    const pBl = getCanvasPoint(e);
    if (handleBaseLineClick(pBl)) return;
  }
  if (tool === 'select') return;
  const p = getCanvasPoint(e);
  
  if (tool === 'fill') {
    doFillAtPoint(p);
    // Rev.16.1: 채움/외곽선 후 선택 모드로 전환 (연속 모드가 아니면)
    if (!continuousMode){
      fillAsOutline = false;
      const obtn = document.getElementById('headerBtnOutline');
      if (obtn) obtn.classList.remove('active');
      selectTool('select');
    }
    return;
  }
  
  if (tool === 'calib') {
    handleCalibClick(p);
    return;
  }
  
  if (tool === 'axis') {
    handleAxisClick(p);
    return;
  }
  
  // B안 편집 도구
  if (tool === 'trim') { handleTrimClick(p); return; }
  if (tool === 'extend') { handleExtendClick(p); return; }
  if (tool === 'fillet') { handleFilletClick(p); return; }
  if (tool === 'chamfer') { handleChamferClick(p); return; }
  if (tool === 'centerline') { handleCenterlineClick(p); return; }
  if (tool === 'tangent') { handleTangentClick(p); return; }
  if (tool === 'offset') { handleOffsetClick(p); return; }
  if (tool === 'break') { handleBreakClick(p); return; }
  if (tool === 'breakAtPoint') { handleBreakAtPointClick(p); return; }
  
  // E안 복사/변환
  if (tool === 'copy') { handleCopyClick(p); return; }
  if (tool === 'movetool') { handleMoveClick(p); return; }
  if (tool === 'rotate') { handleRotateClick(p); return; }
  if (tool === 'mirror') { handleMirrorClick(p); return; }
  if (tool === 'scale') { handleScaleClick(p); return; }
  
  // F안 그리기
  if (tool === 'polyline') { handlePolylineClick(p); return; }
  if (tool === 'ellipse') { handleEllipseClick(p); return; }
  if (tool === 'text') { handleTextClick(p); return; }
  if (polygonState) { handlePolygonClick(p); return; }
  if (arrayState && arrayState.phase === 'center') { handleArrayClick(p); return; }
  
  // 측정 (ID)
  if (idPickActive) { if (handleIdClick(p)) return; }
  
  // D안 치수 도구
  if (tool === 'dimLinear' || tool === 'dimAligned' || 
      tool === 'dimRadius' || tool === 'dimDiameter' || tool === 'dimAngle') {
    handleDimClick(p);
    return;
  }
  
  if (tool === 'arc') {
    if (!firstClick) {
      firstClick = {x: p.x, y: p.y};
      arcPath = [{x: p.x, y: p.y}];
    } else {
      // 2차 클릭: 마우스 경로와 가장 잘 맞는 배경 호 찾기
      addArcFromPath(firstClick, p, arcPath);
      firstClick = null;
      arcPath = [];
      preCtx.clearRect(0,0,baseW,baseH);
      // Rev.11.64: 호 1회 작도 후 선택 도구로 전환 (연속모드 제외)
      if (!continuousMode){
        backToSelectTool();
        document.getElementById('statusHint').textContent = '⌒ 호 1개 생성 완료 (선택 도구로 전환)';
      }
    }
    return;
  }
  
  if (!firstClick) {
    firstClick = {x: p.x, y: p.y};
  } else {
    addShape(firstClick, p);
    if (tool === 'line' && continuousMode) {
      firstClick = {x: p.x, y: p.y};
    } else {
      firstClick = null;
      preCtx.clearRect(0,0,baseW,baseH);
      // Rev.11.64: 작성 도구(선/사각형/원) 1회 작도 후 선택 도구로 자동 전환 (연속모드 제외)
      if (!continuousMode){
        const nm = (tool === 'line') ? '／ 선' : (tool === 'rect') ? '▭ 사각형' : (tool === 'circle') ? '○ 원' : '도형';
        backToSelectTool();
        document.getElementById('statusHint').textContent = `${nm} 1개 생성 완료 (선택 도구로 전환)`;
      }
    }
  }
});

drawCanvas.addEventListener('dblclick', e => {
  if (tool === 'polyline' && polylineState) {
    finishPolyline(false);
    return;
  }
  
  // 채움 영역 더블클릭 시 편집 모달 (선택/채움 도구에서)
  if ((tool === 'select' || tool === 'fill') && !fillAsOutline) {
    const p = getCanvasPoint(e);
    const f = hitTestFill(p);
    if (f) {
      openFillEditor(f);
      return;
    }
  }
  
  if (continuousMode && firstClick) {
    firstClick = null;
    preCtx.clearRect(0,0,baseW,baseH);
  }
});

let shiftDown = false;
window.addEventListener('keydown', e => {
  if (e.key === 'Shift') shiftDown = true;

  // 회전축 도구 + 첫 점 클릭된 상태에서 숫자 입력 = 거리 지정
  // (입력창에 포커스 있을 때는 동작 안 함)
  const focusInInput = document.activeElement &&
    (document.activeElement.tagName === 'INPUT' ||
     document.activeElement.tagName === 'TEXTAREA' ||
     document.activeElement.tagName === 'SELECT');
  if (tool === 'axis' && axisFirstPoint && !focusInInput && !e.ctrlKey && !e.altKey) {
    // 숫자, 소수점, 백스페이스
    if (/^[0-9.]$/.test(e.key)) {
      axisDistanceBuf += e.key;
      const v = parseFloat(axisDistanceBuf);
      if (isFinite(v) && v > 0) axisDistanceOverride = v;
      document.getElementById('statusHint').textContent =
        `🔄 회전축 거리 입력중: ${axisDistanceBuf}${calibSet ? 'mm' : 'px'} (Enter:확정, Esc:해제, BS:지움)`;
      e.preventDefault();
      return;
    }
    if (e.key === 'Backspace') {
      axisDistanceBuf = axisDistanceBuf.slice(0, -1);
      const v = parseFloat(axisDistanceBuf);
      axisDistanceOverride = (isFinite(v) && v > 0) ? v : null;
      document.getElementById('statusHint').textContent =
        `🔄 회전축 거리 입력중: ${axisDistanceBuf || '(없음)'} (Enter:확정, Esc:해제)`;
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      // 현재 마우스 위치 + 거리 강제 적용 즉시 확정
      if (axisDistanceOverride !== null && lastMousePoint) {
        handleAxisClick(lastMousePoint); // 내부에서 applyAxisConstraint로 거리 적용됨
      }
      e.preventDefault();
      return;
    }
  }

  if (e.key === 'Escape') {
    // Rev.12.6: 거리두기 좌/우 선택 모드 우선 취소
    if (offsetTwinPickMode){
      cancelOffsetTwinPick();
      document.getElementById('statusHint').textContent = '⫴ 거리두기 취소';
      return;
    }
    // Rev.13.3: 베이스선 복제 모드 종료
    if (baseLineMode){
      cancelBaseLineMode();
      document.getElementById('statusHint').textContent = '📋 베이스선 복제 종료';
      return;
    }
    // Rev.11.39: 이동(Grab) 모드 우선 취소 (원위치 복원)
    if (grabMode){
      exitGrabMode(false);
      document.getElementById('statusHint').textContent = '↔ 이동 취소 (원위치)';
      return;
    }
    // Rev.16.24: 필렛 방향 미리보기 취소
    if (filletPreview){
      cancelFilletPreview();
      return;
    }
    // Rev.16.14: 쓸어 지우기 모드 종료
    if (swipeEraseMode){
      exitSwipeEraseMode();
      document.getElementById('statusHint').textContent = '🧹 쓸어 지우기 종료';
      return;
    }
    // Rev.16.11: 대각선(교점) 모드 - 진행 중이면 선택만 취소, 비어있으면 모드 종료
    if (diagXMode){
      if (diagXPhase !== 0 || diagXStartPts.length || diagXEndPts.length || diagXDragging){
        cancelDiagX();
      } else {
        exitDiagXMode();
        document.getElementById('statusHint').textContent = '╲ 대각선 종료';
      }
      return;
    }
    // Rev.11.37: 분할 모드 우선 종료
    if (subdivideMode){
      exitSubdivideMode();
      document.getElementById('statusHint').textContent = '✂ 분할 취소';
      return;
    }
    // Rev.11.18: 점/연결 모드 우선 종료
    if (exitVertexModes()){
      document.getElementById('statusHint').textContent = '모드 종료';
      preCtx.clearRect(0,0,baseW,baseH);
      redrawDraw();
      return;
    }
    // 작도 시퀀스 중이면 그것만 취소, 아니면 선택 해제도 같이
    const hadDrawing = firstClick || axisFirstPoint || calibFirstPoint ||
      (typeof arcPath !== 'undefined' && arcPath.length > 0) ||
      filletState || offsetState || dimState ||
      endpointPickState || arcHandleDrag;
    firstClick = null; arcPath = []; dragState = null;
    calibFirstPoint = null; axisFirstPoint = null;
    axisDistanceOverride = null; axisDistanceBuf = '';
    endpointPickState = null;
    arcHandleDrag = null;
    filletState = null; offsetState = null; dimState = null; breakState = null;
    try { resetCopyTransformStates(); } catch(e) {}
    try { resetDrawingStates(); } catch(e) {}
    idPickActive = false;
    // Rev.10.11: 작도 시퀀스가 없었다면 선택도 해제
    if (!hadDrawing && selectedIds.size > 0) {
      selectedIds.clear();
      updateSelStat();
    }
    if (typeof closeMoveDeltaPanel === 'function') closeMoveDeltaPanel(); // Rev.11.14
    preCtx.clearRect(0,0,baseW,baseH);
    redrawDraw();
  } else if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
  else if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
  else if (e.ctrlKey && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
    // Rev.11.13: Shift+Ctrl+E = 제자리 복제 (동일 좌표에 복제 후 드래그 이동 가능)
    e.preventDefault();
    duplicateInPlace();
  }
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    // Rev.10.11: 도구 무관 - 선택된 도형이 있으면 삭제 (입력란에 포커스 있을 땐 제외)
    const inInput = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
       document.activeElement.tagName === 'TEXTAREA' ||
       document.activeElement.tagName === 'SELECT');
    if (!inInput && selectedIds.size > 0) {
      e.preventDefault();
      deleteSelected();
    }
  } else if (e.ctrlKey && (e.key === 'a' || e.key === 'A')) {
    // Rev.10.11: 도구 무관 Ctrl+A 전체 선택 (입력란 포커스 시 제외)
    const inInput = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
       document.activeElement.tagName === 'TEXTAREA');
    if (!inInput) {
      e.preventDefault();
      shapes.forEach(s => selectedIds.add(s.id));
      updateSelStat(); redrawDraw();
      document.getElementById('statusHint').textContent = `전체 선택: ${selectedIds.size}개 도형`;
    }
  } else if (e.ctrlKey && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
    // Rev.11.14: Ctrl+C 도형 복사 (입력란 포커스 시엔 일반 텍스트 복사 허용)
    const inInput = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
       document.activeElement.tagName === 'TEXTAREA');
    if (!inInput && selectedIds.size > 0) {
      e.preventDefault();
      copySelectedToClipboard();
    }
  } else if (e.ctrlKey && !e.shiftKey && (e.key === 'v' || e.key === 'V')) {
    // Rev.11.14: Ctrl+V 도형 붙여넣기 (입력란 포커스 시엔 일반 텍스트 붙여넣기 허용)
    const inInput = document.activeElement &&
      (document.activeElement.tagName === 'INPUT' ||
       document.activeElement.tagName === 'TEXTAREA');
    if (!inInput && clipboardShapes.length > 0) {
      e.preventDefault();
      pasteClipboard();
    }
  }
});
window.addEventListener('keyup', e => { if (e.key === 'Shift') shiftDown = false; });

function applyShiftConstraint(p1, p2) {
  if (!shiftDown || tool !== 'line') return p2;
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  if (Math.abs(dx) > Math.abs(dy)) return {x: p2.x, y: p1.y};
  return {x: p1.x, y: p2.y};
}

function addShape(p1, p2) {
  const _p2 = applyShiftConstraint(p1, p2);
  const newLine = {
    id: ++shapeIdSeq, type: tool,
    p1: {x:p1.x, y:p1.y}, p2: {x:_p2.x, y:_p2.y},
    stroke: document.getElementById('strokeColor').value,
    strokeWidth: parseInt(document.getElementById('strokeWidth').value)
  };
  shapes.push(newLine);
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  // Rev.12.6: 거리두기는 더 이상 선 그리기 시 자동 생성하지 않음 (좌/우 선택 방식)
  // Rev.12.1: 일반 선(line) 그리기 직후 길이/각도/상대거리 팝업 (연속모드 제외)
  if (tool === 'line' && !continuousMode){
    const _id = newLine.id;
    setTimeout(() => openLineDimModal(_id), 0);
  }
}

// Rev.11.23: 거리두기 - 주어진 선의 좌우로 offsetTwinDist(mm) 만큼 평행선 생성
//   원본 포함 3개를 후보로 등록. 살릴 선 1개 클릭 → 나머지 삭제.
function makeOffsetTwins(srcLine){
  if (!srcLine || srcLine.type !== 'line') return;
  const distPx = offsetTwinDist / mmPerPixel; // mm → px
  if (distPx <= 0) return;
  const a = srcLine.p1, b = srcLine.p2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // 법선 단위벡터 (선에 수직)
  const nx = -dy / len, ny = dx / len;
  const stroke = srcLine.stroke;
  const sw = srcLine.strokeWidth;
  const mk = (sign) => {
    const ox = nx * distPx * sign, oy = ny * distPx * sign;
    const ln = {
      id: ++shapeIdSeq, type: 'line',
      p1: { x: a.x + ox, y: a.y + oy },
      p2: { x: b.x + ox, y: b.y + oy },
      stroke, strokeWidth: sw
    };
    shapes.push(ln);
    return ln.id;
  };
  // Rev.11.27: 좌(-) / 우(+) 평행선 2개를 원본과 함께 즉시 확정 (3개 모두 살림)
  mk(+1); mk(-1);
  offsetTwinCandidates = []; // 후보 개념 없음 (전부 확정)
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  document.getElementById('statusHint').textContent =
    `⫴ 거리두기 ${offsetTwinDist}mm: 좌우 평행선 2개 + 원본 = 총 3개 선 생성 완료`;
}

// Rev.12.6: 거리두기(좌/우 선택) - 선의 한쪽(sign: +1=법선방향, -1=반대)으로만 평행선 1개 생성
//   nx,ny = (-dy/len, dx/len). 화면에서 sign=+1 은 진행방향 기준 왼쪽.
function makeOffsetTwinOneSide(srcLine, sign){
  if (!srcLine || srcLine.type !== 'line') return null;
  const distPx = offsetTwinDist / mmPerPixel; // mm → px
  if (distPx <= 0) return null;
  const a = srcLine.p1, b = srcLine.p2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len; // 법선 단위벡터
  const ox = nx * distPx * sign, oy = ny * distPx * sign;
  const ln = {
    id: ++shapeIdSeq, type: 'line',
    p1: { x: a.x + ox, y: a.y + oy },
    p2: { x: b.x + ox, y: b.y + oy },
    stroke: srcLine.stroke, strokeWidth: srcLine.strokeWidth
  };
  shapes.push(ln);
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  return ln.id;
}

// Rev.12.6: 마우스 위치 p 가 선(srcLine)의 어느 쪽인지 부호 판정 (+1 / -1)
function offsetTwinSideSign(srcLine, p){
  const a = srcLine.p1, b = srcLine.p2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len; // 법선
  // 선 중점에서 마우스까지 벡터를 법선에 투영
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  const proj = (p.x - mx) * nx + (p.y - my) * ny;
  return proj >= 0 ? +1 : -1;
}

// Rev.12.6: 거리두기 좌/우 선택 모드 시작
function startOffsetTwinPick(){
  offsetTwinPickMode = true;
  offsetTwinTarget = null;
  selectTool('select');
  drawCanvas.style.cursor = 'crosshair';
  document.getElementById('statusHint').textContent =
    `⫴ 거리두기(${offsetTwinDist}mm): 기준이 될 선을 클릭하세요`;
  updateOffsetTwinButton();
}

// Rev.12.6: 거리두기 좌/우 선택 모드 종료
function cancelOffsetTwinPick(){
  offsetTwinPickMode = false;
  offsetTwinTarget = null;
  preCtx.clearRect(0, 0, baseW, baseH);
  drawCanvas.style.cursor = 'default';
  updateOffsetTwinButton();
}

// Rev.12.6: 거리두기 모드의 클릭 처리. 처리했으면 true 반환
function handleOffsetTwinPickClick(p){
  if (!offsetTwinPickMode) return false;
  if (!offsetTwinTarget){
    // 1단계: 기준 선 선택
    const s = hitTest(p);   // hitTest는 도형 객체를 반환
    if (s && s.type === 'line'){
      offsetTwinTarget = s;
      document.getElementById('statusHint').textContent =
        `⫴ 거리두기(${offsetTwinDist}mm): 마우스를 선의 왼쪽/오른쪽으로 옮긴 뒤 클릭 (Esc=취소)`;
    } else {
      document.getElementById('statusHint').textContent =
        '⫴ 거리두기: 선(line)을 클릭하세요. (사각형/원 불가)';
    }
    return true;
  }
  // 2단계: 좌/우 방향 클릭 → 그 쪽에 평행선 1개 생성
  const sign = offsetTwinSideSign(offsetTwinTarget, p);
  const newId = makeOffsetTwinOneSide(offsetTwinTarget, sign);
  preCtx.clearRect(0, 0, baseW, baseH);
  document.getElementById('statusHint').textContent =
    newId ? `✓ 거리두기 완료: ${offsetTwinDist}mm 평행선 1개 생성` : '거리두기 실패';
  // 한 번 더 만들 수 있도록 대상은 유지(다른 쪽도 클릭 가능). 모드는 계속.
  return true;
}

// ===== Rev.13.3: 베이스선 복제 =====
// 선의 방향 판정: 가로('h') / 세로('v') / 기타('o')
function baseLineDetectOrient(ln){
  const dx = Math.abs(ln.p2.x - ln.p1.x);
  const dy = Math.abs(ln.p2.y - ln.p1.y);
  if (dx >= dy * 3) return 'h';   // 거의 수평
  if (dy >= dx * 3) return 'v';   // 거의 수직
  return 'o';
}

function startBaseLineMode(){
  baseLineMode = true;
  baseLineTarget = null;
  baseLineOrient = null;
  baseLineDir = null;
  selectTool('select');
  drawCanvas.style.cursor = 'crosshair';
  document.getElementById('headerBtnBaseLine')?.classList.add('active');
  closeBaseLinePop();
  document.getElementById('statusHint').textContent =
    '📋 베이스선 복제: 복제할 기준 선(가로/세로)을 클릭하세요 (Esc=종료)';
}

function cancelBaseLineMode(){
  baseLineMode = false;
  baseLineTarget = null;
  baseLineOrient = null;
  baseLineDir = null;
  preCtx.clearRect(0, 0, baseW, baseH);
  drawCanvas.style.cursor = 'default';
  document.getElementById('headerBtnBaseLine')?.classList.remove('active');
  closeBaseLinePop();
}

// 베이스선 모드 클릭 처리. 처리했으면 true
function handleBaseLineClick(p){
  if (!baseLineMode) return false;
  const s = findNearestLineForBase(p);   // 넓은 허용폭으로 가장 가까운 직선 탐색
  if (s){
    baseLineTarget = s;
    baseLineOrient = baseLineDetectOrient(s);
    // 미리보기 강조
    preCtx.clearRect(0,0,baseW,baseH);
    const Z = zoom || 1;
    preCtx.save();
    preCtx.strokeStyle = '#e67e22';
    preCtx.lineWidth = 3 / Z;
    preCtx.setLineDash([8/Z, 4/Z]);
    preCtx.beginPath(); preCtx.moveTo(s.p1.x, s.p1.y); preCtx.lineTo(s.p2.x, s.p2.y); preCtx.stroke();
    preCtx.restore();
    openBaseLinePop(s);
  } else {
    document.getElementById('statusHint').textContent =
      '📋 베이스선: 선(line) 근처를 클릭하세요. (사각형/원/호 불가)';
  }
  return true;
}

// 베이스선 모드 전용: 클릭점에서 가장 가까운 직선을 넓은 허용폭(화면 14px 환산)으로 탐색
function findNearestLineForBase(p){
  const Z = zoom || 1;
  const tolPx = 14 / Z;   // 화면상 약 14px → 월드좌표 환산
  let best = null, bestD = tolPx;
  for (const s of shapes){
    if (s.type !== 'line') continue;
    const d = pointToSegmentDist(p, s.p1, s.p2);
    if (d <= bestD){ bestD = d; best = s; }
  }
  return best;
}

// 클릭한 선의 X좌표(세로선 기준) 또는 Y좌표(가로선 기준) mm값 추정
function baseLineRefX(ln){ return ((ln.p1.x + ln.p2.x) / 2) * mmPerPixel; }
function baseLineRefY(ln){ return ((ln.p1.y + ln.p2.y) / 2) * mmPerPixel; }

function openBaseLinePop(ln){
  const orient = baseLineOrient;
  const typeEl = document.getElementById('baseLineType');
  typeEl.textContent = (orient === 'h') ? '(가로선 → 상/하)' :
                       (orient === 'v') ? '(세로선 → 좌/우)' : '(사선)';
  // 방향 버튼 활성/비활성: 가로선=상/하, 세로선=좌/우
  const allow = (orient === 'h') ? ['up','down'] : (orient === 'v') ? ['left','right'] : ['up','down','left','right'];
  document.querySelectorAll('.baseDirBtn').forEach(b => {
    const ok = allow.includes(b.dataset.dir);
    b.disabled = !ok;
    b.style.opacity = ok ? '1' : '0.3';
    b.style.cursor = ok ? 'pointer' : 'not-allowed';
  });
  // Rev.15.0: 거리두기 방향 버튼도 동일 규칙 (가로선=상/하, 세로선=좌/우)
  document.querySelectorAll('.baseOffDirBtn').forEach(b => {
    const ok = allow.includes(b.dataset.dir);
    b.disabled = !ok;
    b.style.opacity = ok ? '1' : '0.3';
    b.style.cursor = ok ? 'pointer' : 'not-allowed';
  });
  // 입력칸 초기화
  ['baseDist','baseSealCur','basePhi'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('baseSealOn').checked = false;
  document.getElementById('baseSealRow').style.display = 'none';
  document.getElementById('baseSealHint').style.display = 'none';
  document.getElementById('baseNormalRow').style.display = 'flex';
  document.getElementById('baseNormalRow').style.opacity = '1';   // 씰 모드 잔상 제거
  document.getElementById('baseDist').disabled = false;           // 거리칸 항상 활성화로 리셋
  // 씰 파이 토글은 세로선에서만 노출
  document.getElementById('baseSealWrap').style.display = (orient === 'v') ? 'block' : 'none';
  if (orient === 'v'){
    const xMm = baseLineRefX(ln);
    document.getElementById('baseSealCur').placeholder = `현재Ø(자동≈${(Math.abs(xMm)).toFixed(1)})`;
  }
  document.getElementById('basePreviewTxt').textContent = '';
  // 기본 방향 자동 선택 (가로=상, 세로=좌)
  baseLineSelectDir(orient === 'h' ? 'up' : orient === 'v' ? 'left' : 'up');
  // Rev.15.0: 거리두기 기본 방향 — 같은 축이되 베이스선 반대쪽 (가로선=하, 세로선=우)
  baseOffSelectDir(orient === 'h' ? 'down' : orient === 'v' ? 'right' : 'down');

  const pop = document.getElementById('baseLinePop');
  pop.style.display = 'block';
  const mx = (ln.p1.x + ln.p2.x)/2, my = (ln.p1.y + ln.p2.y)/2;
  const sc = worldToScreen(mx, my);
  const pw = pop.offsetWidth || 250, ph = pop.offsetHeight || 200;
  let left = sc.x + 16, top = sc.y + 16;
  if (left + pw > window.innerWidth - 8) left = sc.x - pw - 16;
  if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  const inp = document.getElementById('baseDist');
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
  document.getElementById('statusHint').textContent =
    `📋 기준선 선택됨 ${typeEl.textContent} · 방향 선택 후 수치 입력 → Enter/생성 · Esc=종료`;
}

// 방향 버튼 선택 표시
function baseLineSelectDir(dir){
  baseLineDir = dir;
  document.querySelectorAll('.baseDirBtn').forEach(b => {
    const on = (b.dataset.dir === dir) && !b.disabled;
    b.style.background = on ? '#e67e22' : '#1f1f1f';
    b.style.color = on ? '#fff' : '#ccc';
    b.style.borderColor = on ? '#e67e22' : '#555';
  });
}

function closeBaseLinePop(){
  const pop = document.getElementById('baseLinePop');
  if (pop) pop.style.display = 'none';
}

// 기준선을 dxPx, dyPx 만큼 평행이동한 복제선 생성
// Rev.16.20: 복제선을 교차하는(수직방향) 베이스 선들 사이에 딱 맞게 길이 자동 조정
function baseLineMakeCopy(dxPx, dyPx){
  const ln = baseLineTarget;
  if (!ln) return false;
  let p1 = { x: ln.p1.x + dxPx, y: ln.p1.y + dyPx };
  let p2 = { x: ln.p2.x + dxPx, y: ln.p2.y + dyPx };

  // 복제선이 거의 수직/수평이면, 교차하는 반대축 선들 사이로 양끝을 맞춤 (체크 시)
  const fitChk = document.getElementById('baseFitLen');
  if (!fitChk || fitChk.checked){
    const fitted = fitLineToCrossingBase(p1, p2, ln.id);
    if (fitted){ p1 = fitted.p1; p2 = fitted.p2; }
  }

  const cp = {
    id: ++shapeIdSeq, type: 'line',
    p1, p2,
    stroke: ln.stroke,
    strokeWidth: ln.strokeWidth
  };
  if (ln.layer) cp.layer = ln.layer;
  if (ln.lineType) cp.lineType = ln.lineType;
  shapes.push(cp);
  redoStack = []; pushHistory();
  if (typeof redrawFills === 'function') redrawFills();
  redrawDraw(); updateCount();
  return cp.id;
}

// Rev.16.20: 거의 수직(세로)/수평(가로)인 선을, 그와 교차하는 반대축 선들 중
//   양 끝을 감싸는 가장 가까운 두 경계선에 닿도록 길이를 맞춤. 못 찾으면 null.
function fitLineToCrossingBase(p1, p2, excludeId){
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;
  const TOL = 2; // 방향 판정 허용(px)
  const isV = Math.abs(dx) <= TOL;  // 세로선
  const isH = Math.abs(dy) <= TOL;  // 가로선
  if (!isV && !isH) return null;    // 사선은 건드리지 않음

  if (isV){
    const x = (p1.x + p2.x)/2;
    const yMin = Math.min(p1.y, p2.y), yMax = Math.max(p1.y, p2.y);
    // 이 세로선의 x를 가로지르는 '가로선'들의 y 수집
    const ys = [];
    for (const s of shapes){
      if (s.type !== 'line' || s.id === excludeId) continue;
      const sdx = s.p2.x - s.p1.x, sdy = s.p2.y - s.p1.y;
      if (Math.abs(sdy) > TOL) continue;       // 가로선만
      const sx0 = Math.min(s.p1.x, s.p2.x), sx1 = Math.max(s.p1.x, s.p2.x);
      if (x < sx0 - 1 || x > sx1 + 1) continue; // x가 그 가로선 범위 안
      ys.push((s.p1.y + s.p2.y)/2);
    }
    if (ys.length < 2) return null;
    // 선 중심 기준 위/아래로 가장 가까운 경계
    const cy = (yMin + yMax)/2;
    const above = ys.filter(v => v <= cy).sort((a,b)=>b-a)[0];  // 위(작은 y) 중 가장 큰
    const below = ys.filter(v => v >= cy).sort((a,b)=>a-b)[0];  // 아래(큰 y) 중 가장 작은
    if (above === undefined || below === undefined) return null;
    return { p1:{x, y:above}, p2:{x, y:below} };
  } else {
    const y = (p1.y + p2.y)/2;
    const xMin = Math.min(p1.x, p2.x), xMax = Math.max(p1.x, p2.x);
    const xs = [];
    for (const s of shapes){
      if (s.type !== 'line' || s.id === excludeId) continue;
      const sdx = s.p2.x - s.p1.x, sdy = s.p2.y - s.p1.y;
      if (Math.abs(sdx) > TOL) continue;       // 세로선만
      const sy0 = Math.min(s.p1.y, s.p2.y), sy1 = Math.max(s.p1.y, s.p2.y);
      if (y < sy0 - 1 || y > sy1 + 1) continue;
      xs.push((s.p1.x + s.p2.x)/2);
    }
    if (xs.length < 2) return null;
    const cx = (xMin + xMax)/2;
    const left = xs.filter(v => v <= cx).sort((a,b)=>b-a)[0];
    const right = xs.filter(v => v >= cx).sort((a,b)=>a-b)[0];
    if (left === undefined || right === undefined) return null;
    return { p1:{x:left, y}, p2:{x:right, y} };
  }
}

// 통합 생성 처리 (선택된 방향 + 수치 / 씰 파이 모드)
function baseLineGenerate(){
  if (!baseLineTarget){ document.getElementById('statusHint').textContent = '📋 먼저 기준 선을 클릭하세요'; return; }
  const getVal = id => { const v = evalExpr(document.getElementById(id).value); return isFinite(v) ? v : null; };
  const sealOn = (baseLineOrient === 'v') && document.getElementById('baseSealOn').checked;
  let dxPx = 0, dyPx = 0, msg = '';

  if (sealOn){
    // 씰 파이 모드: 방향은 파이 대소로 자동 결정 (큰값=좌측)
    const phi = getVal('basePhi');
    if (phi === null){ document.getElementById('statusHint').textContent = '⚠ 목표 파이(Ø)를 입력하세요'; return; }
    let cur = getVal('baseSealCur');
    if (cur === null) cur = Math.abs(baseLineRefX(baseLineTarget));
    const radDiffMm = (phi - cur) / 2;
    if (Math.abs(radDiffMm) < 1e-6){ document.getElementById('statusHint').textContent = '⚠ 현재Ø와 목표Ø가 같습니다'; return; }
    const px = Math.abs(radDiffMm) / mmPerPixel;
    dxPx = (phi > cur) ? -px : +px;
    msg = `⌀ 씰 Ø${cur}→Ø${phi} → ${(phi>cur?'좌측':'우측')} ${Math.abs(radDiffMm).toFixed(2)}mm(반지름차) 세로선`;
  } else {
    const dir = baseLineDir;
    if (!dir){ document.getElementById('statusHint').textContent = '⚠ 방향(상/하/좌/우)을 선택하세요'; return; }
    const mm = getVal('baseDist');
    if (!(mm > 0)){ document.getElementById('statusHint').textContent = '⚠ 0보다 큰 거리(mm)를 입력하세요'; return; }
    const px = mm / mmPerPixel;
    if (dir === 'up')    { dyPx = -px; msg = `⬆ 상측 ${mm}mm 가로선`; }
    else if (dir==='down'){ dyPx = +px; msg = `⬇ 하측 ${mm}mm 가로선`; }
    else if (dir==='left'){ dxPx = -px; msg = `⬅ 좌측 ${mm}mm 세로선`; }
    else if (dir==='right'){ dxPx = +px; msg = `➡ 우측 ${mm}mm 세로선`; }
  }

  const id = baseLineMakeCopy(dxPx, dyPx);
  // 기준선 강조 다시 그리기
  const ln = baseLineTarget, Z = zoom || 1;
  preCtx.clearRect(0,0,baseW,baseH);
  preCtx.save();
  preCtx.strokeStyle = '#e67e22'; preCtx.lineWidth = 3/Z; preCtx.setLineDash([8/Z,4/Z]);
  preCtx.beginPath(); preCtx.moveTo(ln.p1.x, ln.p1.y); preCtx.lineTo(ln.p2.x, ln.p2.y); preCtx.stroke();
  preCtx.restore();
  document.getElementById('basePreviewTxt').textContent = id ? ('✓ ' + msg + ' 생성') : '생성 실패';
  document.getElementById('statusHint').textContent = id ? ('✓ ' + msg + ' 생성') : '생성 실패';
}

// Rev.14.9: 거리두기 방향 버튼 선택 (베이스선과 독립)
function baseOffSelectDir(dir){
  baseOffDir = dir;
  document.querySelectorAll('.baseOffDirBtn').forEach(b => {
    const on = (b.dataset.dir === dir) && !b.disabled;
    b.style.background = on ? '#9b59b6' : '#1f1f1f';
    b.style.color = on ? '#fff' : '#ccc';
    b.style.borderColor = on ? '#9b59b6' : '#6a4a7a';
  });
}

// Rev.14.9: 거리두기 생성 (클릭한 기준선에 직접, 자체 방향/거리 사용)
function baseOffGenerate(){
  if (!baseLineTarget){ document.getElementById('statusHint').textContent = '⫴ 먼저 기준 선을 클릭하세요'; return; }
  const dir = baseOffDir;
  if (!dir){ document.getElementById('statusHint').textContent = '⚠ 거리두기 방향(상/하/좌/우)을 선택하세요'; return; }
  const mm = parseFloat(document.getElementById('baseOffDist').value);
  if (!(mm > 0)){ document.getElementById('statusHint').textContent = '⚠ 0보다 큰 거리두기 거리(mm)를 입력하세요'; return; }
  const px = mm / mmPerPixel;
  let dxPx = 0, dyPx = 0, dirTxt = '';
  if (dir === 'up')    { dyPx = -px; dirTxt = '⬆ 상'; }
  else if (dir==='down'){ dyPx = +px; dirTxt = '⬇ 하'; }
  else if (dir==='left'){ dxPx = -px; dirTxt = '⬅ 좌'; }
  else if (dir==='right'){ dxPx = +px; dirTxt = '➡ 우'; }
  const id = baseLineMakeCopy(dxPx, dyPx);
  // 기준선 강조 다시 그리기
  const ln = baseLineTarget, Z = zoom || 1;
  preCtx.clearRect(0,0,baseW,baseH);
  preCtx.save();
  preCtx.strokeStyle = '#e67e22'; preCtx.lineWidth = 3/Z; preCtx.setLineDash([8/Z,4/Z]);
  preCtx.beginPath(); preCtx.moveTo(ln.p1.x, ln.p1.y); preCtx.lineTo(ln.p2.x, ln.p2.y); preCtx.stroke();
  preCtx.restore();
  const msg = `⫴ 거리두기 ${dirTxt} ${mm}mm 평행선`;
  document.getElementById('basePreviewTxt').textContent = id ? ('✓ ' + msg + ' 생성') : '생성 실패';
  document.getElementById('statusHint').textContent = id ? ('✓ ' + msg + ' 생성') : '생성 실패';
}

// Rev.12.6: 거리두기 좌/우 미리보기 (점선)
function drawOffsetTwinPreview(p){
  preCtx.clearRect(0, 0, baseW, baseH);
  if (!offsetTwinTarget) return;
  const sign = offsetTwinSideSign(offsetTwinTarget, p);
  const distPx = offsetTwinDist / mmPerPixel;
  const a = offsetTwinTarget.p1, b = offsetTwinTarget.p2;
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const ox = nx * distPx * sign, oy = ny * distPx * sign;
  preCtx.save();
  preCtx.strokeStyle = '#f39c12';
  preCtx.lineWidth = Math.max(1, (offsetTwinTarget.strokeWidth || 1));
  preCtx.setLineDash([6, 4]);
  preCtx.beginPath();
  preCtx.moveTo(a.x + ox, a.y + oy);
  preCtx.lineTo(b.x + ox, b.y + oy);
  preCtx.stroke();
  preCtx.restore();
}

// ====== 라운드 자동 피팅 ======
function addArcFromPath(p1, p2, path) {
  // 1) 마우스 경로 + 시작/끝점으로 가장 잘 맞는 배경 호 찾기
  const fittedArc = findBestMatchingArc(p1, p2, path);
  
  if (fittedArc) {
    shapes.push({
      id: ++shapeIdSeq, type: 'arc',
      cx: Math.round(fittedArc.cx),
      cy: Math.round(fittedArc.cy),
      r: Math.round(fittedArc.r),
      startAngle: fittedArc.startAngle,
      endAngle: fittedArc.endAngle,
      ccw: fittedArc.ccw,
      stroke: document.getElementById('strokeColor').value,
      strokeWidth: parseInt(document.getElementById('strokeWidth').value),
      p1: {x: Math.round(p1.x), y: Math.round(p1.y)},
      p2: {x: Math.round(p2.x), y: Math.round(p2.y)},
      autoFit: fittedArc.source === 'bg'
    });
  } else {
    // 배경 호 매칭 실패 시: 경로점들로 원 피팅 (3점법)
    const fitted = fitCircleFromPath(path);
    if (fitted) {
      shapes.push({
        id: ++shapeIdSeq, type: 'arc',
        cx: Math.round(fitted.cx), cy: Math.round(fitted.cy),
        r: Math.round(fitted.r),
        startAngle: Math.atan2(p1.y - fitted.cy, p1.x - fitted.cx),
        endAngle: Math.atan2(p2.y - fitted.cy, p2.x - fitted.cx),
        ccw: fitted.ccw,
        stroke: document.getElementById('strokeColor').value,
        strokeWidth: parseInt(document.getElementById('strokeWidth').value),
        p1: {x: Math.round(p1.x), y: Math.round(p1.y)},
        p2: {x: Math.round(p2.x), y: Math.round(p2.y)},
        autoFit: false
      });
    } else {
      alert('라운드 피팅 실패. 마우스를 곡선을 따라 좀 더 천천히 움직여보세요.');
      return;
    }
  }
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
}

// 배경에서 검출된 호 중 마우스 경로와 가장 일치하는 것 찾기
function findBestMatchingArc(p1, p2, path) {
  if (detectedArcs.length === 0) return null;
  
  let best = null, bestScore = Infinity;
  
  for (const arc of detectedArcs) {
    // 1) 시작점과 끝점이 모두 호 위에 있는지 (거리 검사)
    const d1 = Math.abs(Math.hypot(p1.x - arc.cx, p1.y - arc.cy) - arc.r);
    const d2 = Math.abs(Math.hypot(p2.x - arc.cx, p2.y - arc.cy) - arc.r);
    
    if (d1 > 20 || d2 > 20) continue;
    
    // 2) 마우스 경로의 점들이 호 위에 있는지
    let pathScore = 0;
    let onCount = 0;
    for (const pt of path) {
      const d = Math.abs(Math.hypot(pt.x - arc.cx, pt.y - arc.cy) - arc.r);
      pathScore += d;
      if (d < arc.r * 0.2) onCount++;
    }
    pathScore /= Math.max(path.length, 1);
    const onRatio = onCount / Math.max(path.length, 1);
    
    if (onRatio < 0.5) continue;
    
    const score = d1 + d2 + pathScore * 2;
    
    if (score < bestScore) {
      bestScore = score;
      // 회전 방향 결정 (경로 중간점 기준)
      const ccw = determineArcDirection(arc.cx, arc.cy, p1, p2, path);
      best = {
        cx: arc.cx, cy: arc.cy, r: arc.r,
        startAngle: Math.atan2(p1.y - arc.cy, p1.x - arc.cx),
        endAngle: Math.atan2(p2.y - arc.cy, p2.x - arc.cx),
        ccw: ccw,
        source: 'bg'
      };
    }
  }
  
  return best;
}

// 호 회전 방향 결정 (마우스 경로 중간점이 어느 방향에 있는지로 판정)
// 반환: true = ccw (반시계, canvas arc의 counterclockwise=true)
//       false = cw (시계, canvas arc의 counterclockwise=false)
function determineArcDirection(cx, cy, p1, p2, path) {
  if (path.length < 3) return false;
  
  const startAng = Math.atan2(p1.y - cy, p1.x - cx);
  const endAng = Math.atan2(p2.y - cy, p2.x - cx);
  
  // 경로의 중간점 (실제 마우스가 지나간 곳)
  const midPathPt = path[Math.floor(path.length / 2)];
  const midAng = Math.atan2(midPathPt.y - cy, midPathPt.x - cx);
  
  // 시계방향(CW)으로 startAng → endAng 가는 경로 위에 midAng가 있는지 검사
  // 시계방향 = 각도가 감소하는 방향 (canvas 좌표계: Y가 아래로+ 이므로 실제로는 화면상 시계방향)
  // canvas에서 atan2는 X축 기준, Y가 아래이므로 시계방향=각도 증가
  
  // 정규화: 두 경로(CW 가는 거리, CCW 가는 거리) 중 midAng가 어느 쪽에 있는지
  const norm = a => { while(a < 0) a += Math.PI*2; while(a >= Math.PI*2) a -= Math.PI*2; return a; };
  const ns = norm(startAng);
  const ne = norm(endAng);
  const nm = norm(midAng);
  
  // CW 경로 (canvas counterclockwise=false): startAng → endAng 각도가 증가하는 방향
  // 즉 ns에서 시계방향으로 nm을 지나 ne에 도달하는지
  // ns → nm → ne (모두 ns 기준으로 정방향)
  let cw_s_to_m, cw_s_to_e;
  if (nm >= ns) cw_s_to_m = nm - ns;
  else cw_s_to_m = nm - ns + Math.PI*2;
  if (ne >= ns) cw_s_to_e = ne - ns;
  else cw_s_to_e = ne - ns + Math.PI*2;
  
  // midAng가 CW 경로(ns→ne) 위에 있으려면 cw_s_to_m < cw_s_to_e
  const midOnCWPath = cw_s_to_m < cw_s_to_e;
  
  // canvas의 ctx.arc(cx,cy,r,start,end, counterclockwise):
  //  - counterclockwise=false → start에서 end로 각도 증가 (canvas의 CW = 화면 시계방향)
  //  - 마우스가 midOnCWPath면 false 반환 (시계방향으로 그림)
  return !midOnCWPath;
}

// 경로 점들로 원 피팅 (3점 또는 최소제곱)
function fitCircleFromPath(path) {
  if (path.length < 5) return null;
  
  // 간단한 방법: 시작점, 중간점, 끝점으로 3점 원 피팅
  const p1 = path[0];
  const p2 = path[Math.floor(path.length / 2)];
  const p3 = path[path.length - 1];
  
  const ax = p1.x, ay = p1.y;
  const bx = p2.x, by = p2.y;
  const cx = p3.x, cy = p3.y;
  
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) return null;
  
  const ux = ((ax*ax + ay*ay) * (by - cy) + (bx*bx + by*by) * (cy - ay) + (cx*cx + cy*cy) * (ay - by)) / d;
  const uy = ((ax*ax + ay*ay) * (cx - bx) + (bx*bx + by*by) * (ax - cx) + (cx*cx + cy*cy) * (bx - ax)) / d;
  
  const r = Math.hypot(ax - ux, ay - uy);
  
  if (r < 5 || r > 1000) return null;
  
  // 회전 방향: 마우스 경로 기준으로 통일된 함수 사용
  const ccw = determineArcDirection(ux, uy, p1, p3, path);
  
  return { cx: ux, cy: uy, r, ccw };
}

// 라운드 그리기 중 프리뷰
function drawArcPreview(p1, currentP) {
  preCtx.clearRect(0,0,baseW,baseH);
  preCtx.save();
  
  // 1) 마우스 경로 표시 (연한 노란선)
  if (arcPath.length > 1) {
    preCtx.strokeStyle = 'rgba(243, 156, 18, 0.5)';
    preCtx.lineWidth = 2;
    preCtx.setLineDash([]);
    preCtx.beginPath();
    preCtx.moveTo(arcPath[0].x, arcPath[0].y);
    for (let i = 1; i < arcPath.length; i++) {
      preCtx.lineTo(arcPath[i].x, arcPath[i].y);
    }
    preCtx.stroke();
  }
  
  // 2) 시작점 표시
  preCtx.fillStyle = '#28a745';
  preCtx.beginPath();
  preCtx.arc(p1.x, p1.y, 4, 0, Math.PI*2);
  preCtx.fill();
  
  // 3) 실시간 라운드 매칭 미리보기
  if (arcPath.length > 3) {
    const candidate = findBestMatchingArc(p1, currentP, arcPath);
    let arc = candidate;
    if (!arc) {
      const fitted = fitCircleFromPath(arcPath);
      if (fitted) {
        arc = {
          cx: fitted.cx, cy: fitted.cy, r: fitted.r,
          startAngle: Math.atan2(p1.y - fitted.cy, p1.x - fitted.cx),
          endAngle: Math.atan2(currentP.y - fitted.cy, currentP.x - fitted.cx),
          ccw: fitted.ccw, source: 'fit'
        };
      }
    }
    if (arc) {
      preCtx.strokeStyle = candidate ? '#27ae60' : '#3498db';
      preCtx.lineWidth = 2;
      preCtx.setLineDash([5,3]);
      preCtx.beginPath();
      preCtx.arc(arc.cx, arc.cy, arc.r, arc.startAngle, arc.endAngle, arc.ccw);
      preCtx.stroke();
      
      // 중심 표시
      preCtx.setLineDash([]);
      preCtx.strokeStyle = candidate ? '#27ae60' : '#3498db';
      preCtx.beginPath();
      preCtx.arc(arc.cx, arc.cy, 3, 0, Math.PI*2);
      preCtx.stroke();
      
      // 안내 텍스트
      preCtx.fillStyle = candidate ? '#27ae60' : '#3498db';
      preCtx.font = 'bold 12px sans-serif';
      preCtx.fillText(
        candidate ? '✓ 배경 라운드 매칭됨' : '○ 경로 기반 피팅',
        p1.x + 8, p1.y - 8
      );
    }
  }
  
  preCtx.restore();
  drawSnapIndicator();  // 스냅 표시를 마지막에 그려 가려지지 않게
}

function drawPreview(p1, p2) {
  const _p2 = applyShiftConstraint(p1, p2);
  const Z = zoom || 1;
  preCtx.clearRect(0,0,baseW,baseH);
  preCtx.save();
  preCtx.strokeStyle = document.getElementById('strokeColor').value;
  preCtx.lineWidth = (parseInt(document.getElementById('strokeWidth').value) || 1) / Z;
  preCtx.setLineDash([6/Z,4/Z]); preCtx.lineCap='round';
  if (tool==='line') { preCtx.beginPath(); preCtx.moveTo(p1.x,p1.y); preCtx.lineTo(_p2.x,_p2.y); preCtx.stroke(); }
  else if (tool==='rect') { preCtx.strokeRect(Math.min(p1.x,_p2.x), Math.min(p1.y,_p2.y), Math.abs(_p2.x-p1.x), Math.abs(_p2.y-p1.y)); }
  else if (tool==='circle') { const r=Math.hypot(_p2.x-p1.x,_p2.y-p1.y); preCtx.beginPath(); preCtx.arc(p1.x,p1.y,r,0,Math.PI*2); preCtx.stroke(); }
  preCtx.restore();
  drawSnapIndicator();
}

function drawSnapIndicator() {
  if (!snapShown) return;
  const anyPreciseOn = snapTangent || snapPerpendicular || snapParallel || snapExtension;
  if (!snapMode && !liveSnapMode && !anyPreciseOn) return;
  const Z = zoom || 1;
  preCtx.save();
  preCtx.lineWidth = 2 / Z;
  preCtx.setLineDash([]);
  
  const kind = snapShown.kind || 'corner';
  const r = 8 / Z;
  let label = '';
  
  if (kind === 'tangent') {
    // 접점: 노란색 원
    preCtx.strokeStyle = '#ffd966';
    preCtx.beginPath();
    preCtx.arc(snapShown.x, snapShown.y, r, 0, Math.PI*2);
    preCtx.stroke();
    label = '⊙ 접점';
  } else if (kind === 'perp') {
    // 수선: 파란 사각형 + ⊥ 표시
    preCtx.strokeStyle = '#3498db';
    preCtx.strokeRect(snapShown.x - r, snapShown.y - r, r*2, r*2);
    preCtx.beginPath();
    preCtx.moveTo(snapShown.x - r/2, snapShown.y + r);
    preCtx.lineTo(snapShown.x - r/2, snapShown.y);
    preCtx.lineTo(snapShown.x + r/2, snapShown.y);
    preCtx.stroke();
    label = '⊥ 수선';
  } else if (kind === 'parallel') {
    // 평행: 두 줄 평행선 표시
    preCtx.strokeStyle = '#9b59b6';
    preCtx.beginPath();
    preCtx.moveTo(snapShown.x - r, snapShown.y - r/2); preCtx.lineTo(snapShown.x + r, snapShown.y - r/2);
    preCtx.moveTo(snapShown.x - r, snapShown.y + r/2); preCtx.lineTo(snapShown.x + r, snapShown.y + r/2);
    preCtx.stroke();
    label = '∥ 평행';
  } else if (kind === 'extension') {
    // 연장선: 점선 + 점
    preCtx.strokeStyle = '#e67e22';
    preCtx.setLineDash([3,2]);
    preCtx.strokeRect(snapShown.x - r, snapShown.y - r, r*2, r*2);
    preCtx.setLineDash([]);
    preCtx.beginPath();
    preCtx.arc(snapShown.x, snapShown.y, 2/Z, 0, Math.PI*2);
    preCtx.fillStyle = '#e67e22';
    preCtx.fill();
    label = '⤳ 연장';
  } else if (kind === 'on-shape') {
    preCtx.strokeStyle = '#16a085';
    preCtx.beginPath();
    preCtx.moveTo(snapShown.x - r, snapShown.y - r); preCtx.lineTo(snapShown.x + r, snapShown.y + r);
    preCtx.moveTo(snapShown.x + r, snapShown.y - r); preCtx.lineTo(snapShown.x - r, snapShown.y + r);
    preCtx.stroke();
  } else if (kind === 'midpoint') {
    preCtx.strokeStyle = '#16a085';
    preCtx.beginPath();
    preCtx.moveTo(snapShown.x, snapShown.y - r);
    preCtx.lineTo(snapShown.x + r, snapShown.y + r);
    preCtx.lineTo(snapShown.x - r, snapShown.y + r);
    preCtx.closePath();
    preCtx.stroke();
  } else if (kind === 'center') {
    preCtx.strokeStyle = '#e74c3c';
    preCtx.beginPath();
    preCtx.arc(snapShown.x, snapShown.y, r, 0, Math.PI*2);
    preCtx.stroke();
    preCtx.beginPath();
    preCtx.moveTo(snapShown.x - r/2, snapShown.y); preCtx.lineTo(snapShown.x + r/2, snapShown.y);
    preCtx.moveTo(snapShown.x, snapShown.y - r/2); preCtx.lineTo(snapShown.x, snapShown.y + r/2);
    preCtx.stroke();
  } else {
    preCtx.strokeStyle = '#f39c12';
    preCtx.strokeRect(snapShown.x - r, snapShown.y - r, r*2, r*2);
    preCtx.beginPath();
    preCtx.moveTo(snapShown.x - r/2, snapShown.y); preCtx.lineTo(snapShown.x + r/2, snapShown.y);
    preCtx.moveTo(snapShown.x, snapShown.y - r/2); preCtx.lineTo(snapShown.x, snapShown.y + r/2);
    preCtx.stroke();
  }
  
  // 라벨 표시 (정밀 스냅인 경우)
  if (label) {
    preCtx.fillStyle = preCtx.strokeStyle;
    preCtx.font = `bold ${11/Z}px sans-serif`;
    preCtx.fillText(label, snapShown.x + 12/Z, snapShown.y - 10/Z);
  }
  preCtx.restore();
}

function drawBoxSelectPreview(p1, p2) {
  const Z = zoom || 1;
  // Rev.16.21: 성능 - 전체(baseW×baseH) clear 대신 직전 그린 영역만 지움
  if (window._lastBoxRect){
    const r = window._lastBoxRect, pad = 8/Z;
    preCtx.clearRect(r.x - pad, r.y - pad, r.w + pad*2, r.h + pad*2);
  } else {
    preCtx.clearRect(0,0,baseW,baseH);
  }
  preCtx.save();
  preCtx.strokeStyle = '#9b59b6';
  preCtx.fillStyle = 'rgba(155, 89, 182, 0.15)';
  preCtx.lineWidth = 1/Z; preCtx.setLineDash([4/Z,3/Z]);
  const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
  const w = Math.abs(p2.x-p1.x), h = Math.abs(p2.y-p1.y);
  preCtx.fillRect(x, y, w, h);
  preCtx.strokeRect(x, y, w, h);
  preCtx.restore();
  window._lastBoxRect = { x, y, w, h };
}

// ====== 캘리브레이션 (v5.0) ======
function handleCalibClick(p) {
  if (!calibFirstPoint) {
    calibFirstPoint = {x: p.x, y: p.y};
    document.getElementById('statusHint').textContent = 
      `📏 첫 번째 점 클릭됨 (${p.x}, ${p.y}) → 두 번째 점을 클릭하세요`;
  } else {
    const dx = p.x - calibFirstPoint.x;
    const dy = p.y - calibFirstPoint.y;
    const pixelDist = Math.hypot(dx, dy);
    
    if (pixelDist < 5) {
      alert('두 점이 너무 가깝습니다. 더 떨어진 점을 클릭하세요.');
      calibFirstPoint = null;
      preCtx.clearRect(0, 0, baseW, baseH);
      return;
    }
    
    // 두 번째 점도 저장 (모달에서 사용)
    window._calibSecondPoint = {x: p.x, y: p.y};
    window._calibPixelDist = pixelDist;
    
    document.getElementById('calibPixelDist').textContent = pixelDist.toFixed(2) + ' px';
    
    // 기본값: 현재 mmPerPixel로 환산한 추정 치수
    document.getElementById('calibRealMm').value = (pixelDist * mmPerPixel).toFixed(2);
    
    document.getElementById('calibModal').classList.add('show');
    setTimeout(() => document.getElementById('calibRealMm').focus(), 100);
  }
}

function drawCalibPreview(p1, p2) {
  preCtx.clearRect(0, 0, baseW, baseH);
  preCtx.save();
  // 점선
  preCtx.strokeStyle = '#16a085';
  preCtx.lineWidth = 2;
  preCtx.setLineDash([6, 4]);
  preCtx.beginPath();
  preCtx.moveTo(p1.x, p1.y);
  preCtx.lineTo(p2.x, p2.y);
  preCtx.stroke();
  preCtx.setLineDash([]);
  
  // 양 끝점
  preCtx.fillStyle = '#16a085';
  preCtx.beginPath(); preCtx.arc(p1.x, p1.y, 5, 0, Math.PI*2); preCtx.fill();
  preCtx.beginPath(); preCtx.arc(p2.x, p2.y, 5, 0, Math.PI*2); preCtx.fill();
  
  // 거리 표시
  const dist = Math.hypot(p2.x-p1.x, p2.y-p1.y);
  const mid = {x: (p1.x+p2.x)/2, y: (p1.y+p2.y)/2};
  const text = calibSet 
    ? `${dist.toFixed(1)} px ≈ ${(dist*mmPerPixel).toFixed(2)} mm`
    : `${dist.toFixed(1)} px`;
  
  preCtx.font = 'bold 13px sans-serif';
  preCtx.fillStyle = '#000';
  const tw = preCtx.measureText(text).width;
  preCtx.fillStyle = 'rgba(255,255,255,0.9)';
  preCtx.fillRect(mid.x - tw/2 - 4, mid.y - 10, tw + 8, 20);
  preCtx.fillStyle = '#16a085';
  preCtx.textAlign = 'center';
  preCtx.fillText(text, mid.x, mid.y + 4);
  preCtx.textAlign = 'start';
  
  preCtx.restore();
  drawSnapIndicator();
}

// 캘리브 모달 - 적용
document.getElementById('btnCalibApply').addEventListener('click', () => {
  const realMm = parseFloat(document.getElementById('calibRealMm').value);
  const pixelDist = window._calibPixelDist;
  const autoResize = document.getElementById('calibAutoResize').checked;
  
  if (!realMm || realMm <= 0) {
    alert('유효한 치수를 입력하세요.');
    return;
  }
  
  if (autoResize && bgImage) {
    // 이미지를 1mm = 1px로 자동 리사이즈
    const scaleFactor = realMm / pixelDist;  // 새 크기 / 현재 크기
    const newW = Math.round(baseW * scaleFactor);
    const newH = Math.round(baseH * scaleFactor);
    
    // 모든 기존 도형/채움/캘리브 점들도 동일 비율로 스케일
    shapes.forEach(s => scaleShapeUniform(s, scaleFactor));
    fills.forEach(f => {
      f.points = f.points.map(p => ({x: p.x * scaleFactor, y: p.y * scaleFactor}));
    });
    snapPoints = snapPoints.map(p => ({x: p.x * scaleFactor, y: p.y * scaleFactor}));
    detectedArcs = detectedArcs.map(a => ({
      cx: a.cx * scaleFactor, cy: a.cy * scaleFactor, r: a.r * scaleFactor,
      startAngle: a.startAngle, endAngle: a.endAngle, isFull: a.isFull
    }));
    
    // 캔버스 크기 변경
    setCanvasSize(newW, newH);
    mmPerPixel = 1.0;  // 1px = 1mm
  } else {
    // 비율만 저장 (이미지 크기 유지)
    mmPerPixel = realMm / pixelDist;
  }
  
  calibSet = true;
  updateCalibStat();
  document.getElementById('calibModal').classList.remove('show');
  
  calibFirstPoint = null;
  preCtx.clearRect(0, 0, baseW, baseH);
  
  alert(`✓ 캘리브레이션 완료!\n\n` +
        `${pixelDist.toFixed(1)} px = ${realMm} mm\n` +
        `1 px = ${mmPerPixel.toFixed(4)} mm\n\n` +
        (autoResize 
          ? `이미지가 ${baseW} × ${baseH} px 크기로 리사이즈됨 (1mm = 1px)\n좌표가 mm 값과 동일`
          : `이미지 크기 유지 (좌표 표시만 mm로 변환)`));
});

document.getElementById('btnCalibCancel').addEventListener('click', () => {
  document.getElementById('calibModal').classList.remove('show');
  calibFirstPoint = null;
  preCtx.clearRect(0, 0, baseW, baseH);
});

function scaleShapeUniform(s, k) {
  if (s.type === 'line' || s.type === 'rect' || s.type === 'circle') {
    s.p1.x *= k; s.p1.y *= k;
    s.p2.x *= k; s.p2.y *= k;
  } else if (s.type === 'arc') {
    s.cx *= k; s.cy *= k; s.r *= k;
    if (s.p1) { s.p1.x *= k; s.p1.y *= k; }
    if (s.p2) { s.p2.x *= k; s.p2.y *= k; }
  } else if (s.type === 'ellipse') {
    s.cx *= k; s.cy *= k; s.rx *= k; s.ry *= k;
  } else if ((s.type === 'polyline' || s.type === 'fill') && Array.isArray(s.points)) {
    s.points = s.points.map(pt => ({ x: pt.x * k, y: pt.y * k }));
  } else if (s.type === 'point' && s.p1) {
    s.p1.x *= k; s.p1.y *= k;
  }
  s.strokeWidth = Math.max(1, Math.round((s.strokeWidth || 2) * Math.sqrt(k)));
}

function updateCalibStat() {
  const el = document.getElementById('calibStat');
  if (calibSet) {
    const pxPerMm = (mmPerPixel > 0) ? (1 / mmPerPixel) : 0;
    el.textContent = `📏 1mm = ${pxPerMm.toFixed(1)}px`;
    el.style.background = '#27ae60';
  } else {
    el.textContent = '📏 캘리브: 미설정';
    el.style.background = '#e67e22';
  }
}

// 배경 새로 로드 시 캘리브 리셋
function resetCalibration() {
  // Rev.16.22: 기본 1mm = 300px 유지 (calibSet true)
  calibSet = true;
  mmPerPixel = 1/300;
  calibFirstPoint = null;
  updateCalibStat();
}

// Rev.16.23: 사용자 단위 배율 변경 (1mm당 px). 기존 도형의 실치수(mm)는 유지.
function applyUnitScale(newPxPerMm){
  newPxPerMm = parseFloat(newPxPerMm);
  if (!isFinite(newPxPerMm) || newPxPerMm <= 0) return;
  const oldPxPerMm = 1 / mmPerPixel;
  if (Math.abs(newPxPerMm - oldPxPerMm) < 1e-6) return;
  const k = newPxPerMm / oldPxPerMm;   // 좌표 확대비

  // 모든 도형 좌표를 k배 (실치수 mm 유지)
  for (const s of shapes){
    if (typeof scaleShapeUniform === 'function') scaleShapeUniform(s, k);
  }
  // 채움(fill) 등 별도 배열이 있으면 함께
  if (typeof fills !== 'undefined' && Array.isArray(fills)){
    for (const f of fills){ if (typeof scaleShapeUniform === 'function') scaleShapeUniform(f, k); }
  }

  // 작업영역도 k배 (실치수 유지) - 단, 줌 100%에서 흐트러짐 없도록 16384 한계 내로
  baseW = Math.round(baseW * k);
  baseH = Math.round(baseH * k);

  // 비율 갱신
  mmPerPixel = 1 / newPxPerMm;

  // 화면 표시 크기 유지를 위해 줌을 1/k배
  zoom = zoom / k;
  const zEl = document.getElementById('zoom');
  if (zEl){
    let zp = Math.round(zoom * 100);
    zp = Math.max(parseInt(zEl.min), Math.min(parseInt(zEl.max), zp));
    zEl.value = zp;
    zoom = zp / 100;
    const zv = document.getElementById('zoomVal'); if (zv) zv.textContent = zp + '%';
  }

  redoStack = []; pushHistory();
  setCanvasSize(baseW, baseH);
  updateCalibStat();
  if (typeof redrawFills === 'function') redrawFills();
  redrawDraw(); updateCount();
  document.getElementById('statusHint').textContent =
    `📏 단위 배율 변경: 1mm = ${newPxPerMm}px · 작업영역 ${(baseW*mmPerPixel).toFixed(0)}×${(baseH*mmPerPixel).toFixed(0)}mm · 기존 도형 실치수 유지`;
}
document.getElementById('unitScaleSel').addEventListener('change', e => {
  applyUnitScale(e.target.value);
});
// Rev.16.40: 도구바 접기/펼치기 토글
(function(){
  const tg = document.getElementById('toolStripToggle');
  const ts = document.getElementById('toolStrip');
  const ic = document.getElementById('toolStripToggleIcon');
  if (!tg || !ts) return;
  tg.addEventListener('click', () => {
    const collapsed = ts.classList.toggle('collapsed');
    if (ic) ic.textContent = collapsed ? '▶' : '▼';
    // 캔버스 크기 재계산 (영역 변동 반영)
    if (typeof setCanvasSize === 'function') setCanvasSize(baseW, baseH);
  });
})();
// 현재 mmPerPixel에 맞춰 드롭다운 표시 동기화 (로드/파일열기 후 호출)
function syncUnitScaleSel(){
  const sel = document.getElementById('unitScaleSel');
  if (!sel) return;
  const pxPerMm = Math.round(1 / mmPerPixel);
  const opt = [...sel.options].find(o => parseInt(o.value) === pxPerMm);
  if (opt) sel.value = String(pxPerMm);
}

// ====== B안: 편집 명령 (Rev.9.0) ======

// 직선-직선 교점 (무한 직선)
function lineLineIntersection(a1, a2, b1, b2) {
  const d = (a2.x - a1.x)*(b2.y - b1.y) - (a2.y - a1.y)*(b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b1.x - a1.x)*(b2.y - b1.y) - (b1.y - a1.y)*(b2.x - b1.x)) / d;
  return { x: a1.x + t*(a2.x - a1.x), y: a1.y + t*(a2.y - a1.y), t: t };
}

// 두 선분의 교점 (선분 내부 점만)
function lineSegmentIntersection(a1, a2, b1, b2) {
  const d = (a2.x - a1.x)*(b2.y - b1.y) - (a2.y - a1.y)*(b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((b1.x - a1.x)*(b2.y - b1.y) - (b1.y - a1.y)*(b2.x - b1.x)) / d;
  const u = ((b1.x - a1.x)*(a2.y - a1.y) - (b1.y - a1.y)*(a2.x - a1.x)) / d;
  if (t < -0.01 || t > 1.01 || u < -0.01 || u > 1.01) return null;
  return { x: a1.x + t*(a2.x - a1.x), y: a1.y + t*(a2.y - a1.y), t: t, u: u };
}

// Rev.16.14: 두 방향의 각도차(0~90도). 선은 양방향이므로 90도로 접어서 반환
function angleDiffDeg(ax, ay, bx, by){
  const la = Math.hypot(ax,ay), lb = Math.hypot(bx,by);
  if (la < 1e-9 || lb < 1e-9) return 0;
  let cos = (ax*bx + ay*by) / (la*lb);
  cos = Math.max(-1, Math.min(1, cos));
  let deg = Math.acos(cos) * 180 / Math.PI;  // 0~180
  if (deg > 90) deg = 180 - deg;             // 선 방향성 무시 → 0~90
  return deg;
}

// Rev.16.14: 드래그 경로(점 배열)가 가로지른 line 도형 중, 드래그 전체 방향과 각도차≥thresh 인 선 id 수집
function swipeEraseTargets(path, thresh){
  if (!path || path.length < 2) return [];
  // 드래그 전체 방향 = 시작→끝 벡터
  const dvx = path[path.length-1].x - path[0].x;
  const dvy = path[path.length-1].y - path[0].y;
  const ids = new Set();
  for (const s of shapes){
    if (s.type !== 'line' || !s.p1 || !s.p2) continue;
    // 경로의 어느 한 구간이라도 이 선과 교차하면 "지나감"
    let crossed = false;
    for (let i=0;i<path.length-1 && !crossed;i++){
      if (lineSegmentIntersection(path[i], path[i+1], s.p1, s.p2)) crossed = true;
    }
    if (!crossed) continue;
    // 선 방향과 드래그 방향의 각도차
    const diff = angleDiffDeg(dvx, dvy, s.p2.x - s.p1.x, s.p2.y - s.p1.y);
    if (diff >= thresh) ids.add(s.id);
  }
  return [...ids];
}

// Rev.16.10: 도면 내 모든 line/polyline 변을 선분 리스트로 수집
function collectAllSegments(){
  const segs = [];
  for (const s of shapes){
    if (s.type === 'line' && s.p1 && s.p2){
      segs.push({ a:s.p1, b:s.p2 });
    } else if (s.type === 'polyline' && Array.isArray(s.points) && s.points.length >= 2){
      const pts = s.points;
      for (let i=0;i<pts.length-1;i++) segs.push({ a:pts[i], b:pts[i+1] });
      if (s.closed && pts.length >= 3) segs.push({ a:pts[pts.length-1], b:pts[0] });
    }
  }
  return segs;
}

// Rev.16.10: 중심점 cx,cy 에서 반경 rWorld(도면단위) 안에 들어오는 모든 선-교점 수집 (중복 제거)
function intersectionsWithinRadius(cx, cy, rWorld){
  const segs = collectAllSegments();
  const found = [];
  for (let i=0;i<segs.length;i++){
    for (let j=i+1;j<segs.length;j++){
      const ix = lineSegmentIntersection(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
      if (!ix) continue;
      if (Math.hypot(ix.x - cx, ix.y - cy) <= rWorld){
        // 근접 중복 제거 (1px 이내 같은 점)
        if (!found.some(f => Math.hypot(f.x-ix.x, f.y-ix.y) < 1)){
          found.push({ x:ix.x, y:ix.y, d:Math.hypot(ix.x-cx, ix.y-cy) });
        }
      }
    }
  }
  found.sort((a,b)=> a.d - b.d);  // 중심에 가까운 순
  return found;
}

// Rev.16.10: 사각 영역(도면좌표) 안의 모든 선-교점 수집 (박스 중앙 가까운 순)
function intersectionsInBox(x0, y0, x1, y1){
  const segs = collectAllSegments();
  const cx = (x0+x1)/2, cy = (y0+y1)/2;
  const found = [];
  for (let i=0;i<segs.length;i++){
    for (let j=i+1;j<segs.length;j++){
      const ix = lineSegmentIntersection(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
      if (!ix) continue;
      if (ix.x >= x0 && ix.x <= x1 && ix.y >= y0 && ix.y <= y1){
        if (!found.some(f => Math.hypot(f.x-ix.x, f.y-ix.y) < 1)){
          found.push({ x:ix.x, y:ix.y, d:Math.hypot(ix.x-cx, ix.y-cy) });
        }
      }
    }
  }
  found.sort((a,b)=> a.d - b.d);
  return found;
}

// Rev.16.14: 쓸어 지우기 미리보기 (경로=빨강 실선, 삭제예정 선=빨강 굵게)
function drawSwipeErasePreview(p){
  if (!preCtx) return;
  const Z = zoom || 1;
  preCtx.clearRect(0,0,baseW,baseH);
  preCtx.save();
  if (swipeErasing && swipePath.length >= 1){
    // 경로
    preCtx.strokeStyle = '#ff4d4d'; preCtx.lineWidth = 2/Z; preCtx.setLineDash([]);
    preCtx.beginPath();
    preCtx.moveTo(swipePath[0].x, swipePath[0].y);
    for (let i=1;i<swipePath.length;i++) preCtx.lineTo(swipePath[i].x, swipePath[i].y);
    preCtx.lineTo(p.x, p.y);
    preCtx.stroke();
    // 삭제 예정 선 하이라이트
    const tmpPath = swipePath.concat([{x:p.x,y:p.y}]);
    const ids = swipeEraseTargets(tmpPath, swipeAngleThresh);
    if (ids.length){
      preCtx.strokeStyle = 'rgba(255,77,77,0.9)'; preCtx.lineWidth = 4/Z;
      for (const s of shapes){
        if (ids.includes(s.id) && s.type==='line'){
          preCtx.beginPath(); preCtx.moveTo(s.p1.x,s.p1.y); preCtx.lineTo(s.p2.x,s.p2.y); preCtx.stroke();
        }
      }
    }
  } else {
    // 호버 시 십자만
    preCtx.strokeStyle = 'rgba(255,77,77,0.6)'; preCtx.lineWidth = 1/Z; preCtx.setLineDash([4/Z,3/Z]);
    preCtx.beginPath();
    preCtx.moveTo(p.x-12/Z, p.y); preCtx.lineTo(p.x+12/Z, p.y);
    preCtx.moveTo(p.x, p.y-12/Z); preCtx.lineTo(p.x, p.y+12/Z);
    preCtx.stroke(); preCtx.setLineDash([]);
  }
  preCtx.restore();
  const hint = document.getElementById('statusHint');
  if (hint && !swipeErasing) hint.textContent = `🧹 쓸어 지우기: 드래그로 경로를 그어 가로지른 선 중 방향 ${swipeAngleThresh}° 이상 어긋난 선 삭제 · 우클릭/Esc=종료`;
}

// Rev.16.11: 대각선 모드 미리보기 (Phase0=시작박스/반경, Phase1=시작점+끝후보+쌍선)
function drawDiagXPreview(p){
  if (!preCtx) return;
  const Z = zoom || 1;
  preCtx.clearRect(0,0,baseW,baseH);
  preCtx.save();

  // 이미 선택된 시작 교점(초록) + 라벨
  preCtx.fillStyle = '#2ecc71';
  diagXStartPts.forEach((q,i) => {
    preCtx.beginPath(); preCtx.arc(q.x,q.y,7/Z,0,Math.PI*2); preCtx.fill();
  });
  // 이미 선택된 끝 교점(파랑)
  preCtx.fillStyle = '#3aa0ff';
  diagXEndPts.forEach((q,i) => {
    preCtx.beginPath(); preCtx.arc(q.x,q.y,7/Z,0,Math.PI*2); preCtx.fill();
  });

  if (diagXPhase === 0){
    // 시작 선택 단계: Shift+드래그 박스만 (호버 시 가이드 없음)
    if (diagXDragging && diagXDragOrigin){
      const o = diagXDragOrigin;
      preCtx.strokeStyle = '#2ecc71'; preCtx.lineWidth = 1.5/Z; preCtx.setLineDash([6/Z,3/Z]);
      preCtx.strokeRect(Math.min(o.x,p.x), Math.min(o.y,p.y), Math.abs(p.x-o.x), Math.abs(p.y-o.y));
      preCtx.setLineDash([]);
      const cand = intersectionsInBox(Math.min(o.x,p.x),Math.min(o.y,p.y),Math.max(o.x,p.x),Math.max(o.y,p.y));
      preCtx.fillStyle = '#2ecc71';
      cand.slice(0,2).forEach(q => { preCtx.beginPath(); preCtx.arc(q.x,q.y,5/Z,0,Math.PI*2); preCtx.fill(); });
    }
  } else {
    // 끝 선택 단계: Shift+드래그 박스 + 박스내 끝교점 후보 + 쌍선 미리보기
    let endCand = [];
    if (diagXDragging && diagXDragOrigin){
      const o = diagXDragOrigin;
      preCtx.strokeStyle = '#ffcc00'; preCtx.lineWidth = 1.5/Z; preCtx.setLineDash([6/Z,3/Z]);
      preCtx.strokeRect(Math.min(o.x,p.x), Math.min(o.y,p.y), Math.abs(p.x-o.x), Math.abs(p.y-o.y));
      preCtx.setLineDash([]);
      endCand = intersectionsInBox(Math.min(o.x,p.x),Math.min(o.y,p.y),Math.max(o.x,p.x),Math.max(o.y,p.y)).slice(0,2);
    }
    // 끝 후보(노랑) 표시
    preCtx.fillStyle = '#ffcc00';
    endCand.forEach(q => { preCtx.beginPath(); preCtx.arc(q.x,q.y,5/Z,0,Math.PI*2); preCtx.fill(); });

    // 쌍선 미리보기: 시작점 i ↔ 끝후보 i (있으면)
    preCtx.strokeStyle = '#ffcc00'; preCtx.lineWidth = 1.5/Z; preCtx.setLineDash([8/Z,4/Z]);
    diagXStartPts.forEach((a,i) => {
      if (i < endCand.length){
        preCtx.beginPath(); preCtx.moveTo(a.x,a.y); preCtx.lineTo(endCand[i].x,endCand[i].y); preCtx.stroke();
      }
    });
    preCtx.setLineDash([]);
  }
  preCtx.restore();

  const hint = document.getElementById('statusHint');
  if (hint && !diagXDragging){
    if (diagXPhase === 0)
      hint.textContent = `╲ 대각선: 시작 교점을 Shift+드래그로 선택 (최대2) · Esc=종료`;
    else
      hint.textContent = `╲ 끝 교점을 Shift+드래그로 선택 (시작 ${diagXStartPts.length}곳 마킹됨) · 우클릭/Esc=취소`;
  }
}

// 선분-원 교점 (선분 안)
function lineCircleIntersections(p1, p2, cx, cy, r) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const fx = p1.x - cx, fy = p1.y - cy;
  const a = dx*dx + dy*dy;
  const b = 2 * (fx*dx + fy*dy);
  const c = fx*fx + fy*fy - r*r;
  const disc = b*b - 4*a*c;
  if (disc < 0) return [];
  const sq = Math.sqrt(disc);
  const ts = [(-b - sq) / (2*a), (-b + sq) / (2*a)];
  return ts.filter(t => t >= -0.01 && t <= 1.01).map(t => ({
    x: p1.x + t*dx, y: p1.y + t*dy, t
  }));
}

// 모든 도형과 선분의 교점 모음 (선분 위 t값들)
function findIntersectionsOnLine(line, otherShapes) {
  const pts = [];
  for (const s of otherShapes) {
    if (s.id === line.id) continue;
    if (s.type === 'line') {
      const x = lineSegmentIntersection(line.p1, line.p2, s.p1, s.p2);
      if (x) pts.push({x: x.x, y: x.y, t: x.t, src: s});
    } else if (s.type === 'rect') {
      const x1 = Math.min(s.p1.x, s.p2.x), x2 = Math.max(s.p1.x, s.p2.x);
      const y1 = Math.min(s.p1.y, s.p2.y), y2 = Math.max(s.p1.y, s.p2.y);
      const edges = [
        [{x:x1,y:y1},{x:x2,y:y1}], [{x:x2,y:y1},{x:x2,y:y2}],
        [{x:x2,y:y2},{x:x1,y:y2}], [{x:x1,y:y2},{x:x1,y:y1}]
      ];
      for (const [a,b] of edges) {
        const x = lineSegmentIntersection(line.p1, line.p2, a, b);
        if (x) pts.push({x: x.x, y: x.y, t: x.t, src: s});
      }
    } else if (s.type === 'circle') {
      const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
      const ints = lineCircleIntersections(line.p1, line.p2, s.p1.x, s.p1.y, r);
      ints.forEach(i => pts.push({x: i.x, y: i.y, t: i.t, src: s}));
    } else if (s.type === 'arc') {
      const ints = lineCircleIntersections(line.p1, line.p2, s.cx, s.cy, s.r);
      ints.forEach(i => {
        const ang = Math.atan2(i.y - s.cy, i.x - s.cx);
        if (isAngleInArcRange(ang, s.startAngle, s.endAngle, s.ccw)) {
          pts.push({x: i.x, y: i.y, t: i.t, src: s});
        }
      });
    }
  }
  return pts.sort((a,b) => a.t - b.t);
}

// 트리밍: 클릭한 위치의 양쪽 가장 가까운 교점 사이를 자름
function handleTrimClick(p) {
  // 클릭한 위치에서 가장 가까운 선/호 찾기
  const target = findShapeAtPoint(p, 15);
  if (!target) {
    document.getElementById('statusHint').textContent = '✂ 자를 선/호를 클릭하세요 (선과 다른 도형이 교차해야 함)';
    return;
  }
  
  if (target.type === 'line') {
    // 선의 양 끝점 + 모든 교점들을 t값으로 정렬
    const pts = findIntersectionsOnLine(target, shapes);
    if (pts.length === 0) {
      alert('자를 수 있는 교점이 없습니다.\n선이 다른 도형과 교차해야 합니다.');
      return;
    }
    
    // 클릭 위치의 t값
    const tClick = pointToLineT(p, target.p1, target.p2);
    
    // 클릭 t보다 작은 가장 큰 교점 (왼쪽 경계)
    // 클릭 t보다 큰 가장 작은 교점 (오른쪽 경계)
    let leftT = 0, rightT = 1;
    let leftPt = target.p1, rightPt = target.p2;
    for (const pt of pts) {
      if (pt.t < tClick && pt.t > leftT) { leftT = pt.t; leftPt = pt; }
      if (pt.t > tClick && pt.t < rightT) { rightT = pt.t; rightPt = pt; }
    }
    
    // 새 분할: 양쪽 두 선분으로 (가운데 잘림)
    const newShapes = [];
    if (leftT > 0.001) {
      newShapes.push({
        id: ++shapeIdSeq, type: 'line',
        p1: {x: target.p1.x, y: target.p1.y},
        p2: {x: leftPt.x, y: leftPt.y},
        stroke: target.stroke, strokeWidth: target.strokeWidth
      });
    }
    if (rightT < 0.999) {
      newShapes.push({
        id: ++shapeIdSeq, type: 'line',
        p1: {x: rightPt.x, y: rightPt.y},
        p2: {x: target.p2.x, y: target.p2.y},
        stroke: target.stroke, strokeWidth: target.strokeWidth
      });
    }
    
    // 원본 제거 후 추가
    shapes = shapes.filter(s => s.id !== target.id);
    newShapes.forEach(s => shapes.push(s));
    redoStack = []; pushHistory();
    redrawDraw();
    updateCount();
    
    document.getElementById('statusHint').textContent = 
      `✂ 트리밍 완료 (${newShapes.length}개 분할). 계속 자르려면 다시 클릭.`;
  } else {
    alert('현재 트리밍은 선(직선)만 지원합니다.\n호/원의 트리밍은 향후 추가 예정.');
  }
}

// 점이 선분 위에서의 매개변수 t (0~1, 가까운 값)
function pointToLineT(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx*dx + dy*dy;
  if (len2 < 1e-6) return 0;
  return ((p.x - a.x)*dx + (p.y - a.y)*dy) / len2;
}

// 클릭 지점 근처 도형 찾기
function findShapeAtPoint(p, tolerance) {
  let best = null, bestD = tolerance;
  for (const s of shapes) {
    let d = Infinity;
    if (s.type === 'line') {
      d = pointToSegmentDist(p, s.p1, s.p2);
    } else if (s.type === 'circle') {
      const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
      d = Math.abs(Math.hypot(p.x-s.p1.x, p.y-s.p1.y) - r);
    } else if (s.type === 'arc') {
      const d2c = Math.hypot(p.x-s.cx, p.y-s.cy);
      const ang = Math.atan2(p.y-s.cy, p.x-s.cx);
      if (isAngleInArcRange(ang, s.startAngle, s.endAngle, s.ccw)) {
        d = Math.abs(d2c - s.r);
      }
    } else if (s.type === 'rect') {
      const x1 = Math.min(s.p1.x, s.p2.x), x2 = Math.max(s.p1.x, s.p2.x);
      const y1 = Math.min(s.p1.y, s.p2.y), y2 = Math.max(s.p1.y, s.p2.y);
      const ds = [
        pointToSegmentDist(p, {x:x1,y:y1}, {x:x2,y:y1}),
        pointToSegmentDist(p, {x:x2,y:y1}, {x:x2,y:y2}),
        pointToSegmentDist(p, {x:x2,y:y2}, {x:x1,y:y2}),
        pointToSegmentDist(p, {x:x1,y:y2}, {x:x1,y:y1})
      ];
      d = Math.min(...ds);
    }
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

// 연장: 선의 가까운 끝점을 다른 선까지 늘림
function handleExtendClick(p) {
  const target = findShapeAtPoint(p, 15);
  if (!target || target.type !== 'line') {
    document.getElementById('statusHint').textContent = '↔ 연장할 선을 클릭하세요 (현재 직선만 지원)';
    return;
  }
  
  // 클릭한 쪽 끝점 (p1 또는 p2)
  const d1 = Math.hypot(p.x-target.p1.x, p.y-target.p1.y);
  const d2 = Math.hypot(p.x-target.p2.x, p.y-target.p2.y);
  const extendEnd = d1 < d2 ? 'p1' : 'p2';
  const fixedEnd = extendEnd === 'p1' ? 'p2' : 'p1';
  
  // 선의 방향 벡터 (fixedEnd → extendEnd)
  const dir = {
    x: target[extendEnd].x - target[fixedEnd].x,
    y: target[extendEnd].y - target[fixedEnd].y
  };
  const dirLen = Math.hypot(dir.x, dir.y);
  if (dirLen < 1e-6) { alert('선이 너무 짧습니다.'); return; }
  dir.x /= dirLen; dir.y /= dirLen;
  
  // 무한 직선상의 다른 도형과의 교점 중, extendEnd 너머 가장 가까운 것
  // 그 점이 fixedEnd로부터 dirLen 보다 먼 거리에 있어야 "연장"
  let bestT = Infinity;
  let bestPt = null;
  
  for (const s of shapes) {
    if (s.id === target.id) continue;
    let candidates = [];
    
    if (s.type === 'line') {
      const x = lineLineIntersection(target.p1, target.p2, s.p1, s.p2);
      if (x) {
        // 교점이 s 선분 위에 있는지 검사
        const u = pointToLineT(x, s.p1, s.p2);
        if (u >= -0.01 && u <= 1.01) candidates.push(x);
      }
    } else if (s.type === 'circle' || s.type === 'arc') {
      const cx = s.type === 'circle' ? s.p1.x : s.cx;
      const cy = s.type === 'circle' ? s.p1.y : s.cy;
      const r = s.type === 'circle' 
        ? Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y)
        : s.r;
      // 무한 직선 - 원 교점
      const farPt = {x: target[fixedEnd].x + dir.x * 100000, y: target[fixedEnd].y + dir.y * 100000};
      const ints = lineCircleIntersections(target[fixedEnd], farPt, cx, cy, r);
      ints.forEach(i => {
        if (s.type === 'arc') {
          const ang = Math.atan2(i.y - cy, i.x - cx);
          if (!isAngleInArcRange(ang, s.startAngle, s.endAngle, s.ccw)) return;
        }
        candidates.push({x: i.x, y: i.y});
      });
    } else if (s.type === 'rect') {
      const x1 = Math.min(s.p1.x, s.p2.x), x2 = Math.max(s.p1.x, s.p2.x);
      const y1 = Math.min(s.p1.y, s.p2.y), y2 = Math.max(s.p1.y, s.p2.y);
      const edges = [
        [{x:x1,y:y1},{x:x2,y:y1}], [{x:x2,y:y1},{x:x2,y:y2}],
        [{x:x2,y:y2},{x:x1,y:y2}], [{x:x1,y:y2},{x:x1,y:y1}]
      ];
      for (const [a,b] of edges) {
        const x = lineLineIntersection(target.p1, target.p2, a, b);
        if (x) {
          const u = pointToLineT(x, a, b);
          if (u >= -0.01 && u <= 1.01) candidates.push(x);
        }
      }
    }
    
    // 각 후보가 extendEnd 너머에 있는지 검사
    for (const c of candidates) {
      // fixedEnd 기준 dir 방향 t값
      const tv = (c.x - target[fixedEnd].x) * dir.x + (c.y - target[fixedEnd].y) * dir.y;
      // 원본 길이보다 커야 "연장"
      if (tv > dirLen + 0.5 && tv < bestT) {
        bestT = tv; bestPt = c;
      }
    }
  }
  
  if (!bestPt) {
    alert('연장 가능한 교점이 없습니다.\n선의 연장선 위에 다른 도형이 있어야 합니다.');
    return;
  }
  
  // extendEnd를 bestPt로 이동
  target[extendEnd] = {x: Math.round(bestPt.x), y: Math.round(bestPt.y)};
  redoStack = []; pushHistory();
  redrawDraw();
  document.getElementById('statusHint').textContent = '↔ 연장 완료';
}

// 모서리 라운드 (Fillet) - 두 선 클릭 후 반지름 입력
// Rev.10.14: rect 자동 분해 + 끝점 선택 로직 명확화

function handleFilletClick(p) {
  // 우선 검사: 클릭점 근처에서 두 line의 끝점이 만나는 "꼭지점"인지 자동 감지
  // 만약 그렇다면 두 번 클릭 없이 즉시 fillet 적용 (사용자 편의)
  const vertexHit = findVertexAt(p, 15);
  if (vertexHit) {
    // 꼭지점 발견 - 즉시 두 line에 fillet 적용
    applyFilletToTwoLines(vertexHit.line1, vertexHit.line2, vertexHit.click1, vertexHit.click2);
    filletState = null;
    return;
  }

  // 1차 클릭: 클릭한 도형 찾기 (line 또는 rect)
  let target = findShapeAtPoint(p, 15);
  if (!target) {
    alert('모서리 R 도구\n\n💡 사용법:\n• 사각형의 꼭지점을 클릭 → 즉시 라운드 (사각형은 자동 분해)\n• 두 선이 만나는 꼭지점 클릭 → 즉시 라운드\n• 또는 첫 직선 클릭 → 두 번째 직선 클릭');
    return;
  }

  // rect 클릭 시: 클릭 위치에서 가장 가까운 두 변을 자동으로 인식하여 라운드 적용
  if (target.type === 'rect') {
    handleFilletOnRect(target, p);
    return;
  }

  if (target.type !== 'line') {
    alert('모서리 R은 선 또는 사각형에만 적용 가능합니다.');
    return;
  }

  if (!filletState) {
    filletState = { firstLine: target, firstClickPt: {x:p.x, y:p.y} };
    document.getElementById('statusHint').textContent = '◜ 첫 번째 선 선택됨. 두 번째 선을 클릭하거나 다른 꼭지점을 클릭하세요.';
    // 시각 강조
    redrawDraw();
    drawCtx.save();
    drawCtx.strokeStyle = '#f39c12'; drawCtx.lineWidth = 4;
    drawCtx.beginPath();
    drawCtx.moveTo(target.p1.x, target.p1.y);
    drawCtx.lineTo(target.p2.x, target.p2.y);
    drawCtx.stroke();
    drawCtx.restore();
    return;
  }
  
  // 두 번째 선
  if (target.id === filletState.firstLine.id) {
    alert('다른 선을 클릭하세요.');
    return;
  }
  
  const L1 = filletState.firstLine;
  const L2 = target;
  
  applyFilletToTwoLines(L1, L2, filletState.firstClickPt, {x:p.x, y:p.y});
  filletState = null;
}

// 클릭점 근처에 두 line의 끝점이 만나는 "꼭지점"이 있는지 찾기
// 있으면 {line1, line2, click1, click2} 반환 (click은 끝점에서 약간 안쪽으로 떨어진 점 = keep 방향용)
function findVertexAt(p, tolerance) {
  const tol2 = tolerance * tolerance;
  // 모든 line의 끝점을 수집
  const endpoints = [];  // {line, endKey, x, y}
  for (const s of shapes) {
    if (s.type !== 'line') continue;
    endpoints.push({line: s, endKey: 'p1', x: s.p1.x, y: s.p1.y});
    endpoints.push({line: s, endKey: 'p2', x: s.p2.x, y: s.p2.y});
  }
  // 클릭점 근처의 끝점들만 필터
  const near = endpoints.filter(e => {
    const dx = e.x - p.x, dy = e.y - p.y;
    return dx*dx + dy*dy <= tol2;
  });
  if (near.length < 2) return null;
  
  // 두 끝점이 같은 위치(꼭지점)에 모여있는지 확인 (서로 1픽셀 이내)
  // 가장 가까운 위치에 모인 두 line을 찾는다
  for (let i = 0; i < near.length; i++) {
    for (let j = i+1; j < near.length; j++) {
      const a = near[i], b = near[j];
      if (a.line.id === b.line.id) continue; // 같은 line의 양 끝은 무시
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 1.5) {
        // 두 line의 같은 끝점 위치 = 꼭지점
        // 각 line의 살릴 끝점(반대편 끝점) 위치를 클릭점으로 사용
        const oppKey1 = a.endKey === 'p1' ? 'p2' : 'p1';
        const oppKey2 = b.endKey === 'p1' ? 'p2' : 'p1';
        return {
          line1: a.line,
          line2: b.line,
          click1: {x: a.line[oppKey1].x, y: a.line[oppKey1].y},
          click2: {x: b.line[oppKey2].x, y: b.line[oppKey2].y}
        };
      }
    }
  }
  return null;
}

// 두 직선에 라운드 적용 - 공통 함수
function applyFilletToTwoLines(L1, L2, click1, click2) {
  // 두 무한 직선 교점
  const ix = lineLineIntersection(L1.p1, L1.p2, L2.p1, L2.p2);
  if (!ix) {
    alert('두 선이 평행이라 라운드를 만들 수 없습니다.');
    redrawDraw();
    return false;
  }
  // 지름 입력 (R은 지름 Ø)
  const rStr = prompt(`모서리 라운드 지름 Ø(mm)을 입력하세요:\n(예: 10 또는 20 · 수식가능)\n\n현재 캘리브: ${calibSet ? '1mm = '+(1/mmPerPixel).toFixed(1)+'px' : '미설정 (1:1)'}`, '10');
  if (!rStr) { redrawDraw(); return false; }
  const dMm = evalExpr(rStr);
  if (isNaN(dMm) || dMm <= 0) { alert('잘못된 지름.'); redrawDraw(); return false; }
  const rMm = dMm / 2;
  const r = rMm / mmPerPixel;

  // 인터랙티브 방향 선택 모드로 진입: 마우스 위치로 4코너 중 결정, 좌클릭 확정
  filletPreview = { L1, L2, ix, rPx: r, rMm };
  filletState = null;
  document.getElementById('statusHint').textContent =
    `◜ 필렛 Ø${dMm}mm: 마우스로 라운드 넣을 코너 방향을 정하고 좌클릭 · 우클릭/Esc=취소`;
  // 초기 미리보기 (두 선 클릭 위치 평균 쪽)
  const mx = (click1.x + click2.x)/2, my = (click1.y + click2.y)/2;
  drawFilletPreview({ x: mx, y: my });
  return true;
}

// Rev.16.24: 교점 기준 각 선의 ± 방향 단위벡터 구하기
function filletLineDirs(line, ix){
  // 선의 양 끝점 방향 단위벡터 (교점에서 p1쪽, p2쪽)
  const d1 = { x: line.p1.x - ix.x, y: line.p1.y - ix.y };
  const d2 = { x: line.p2.x - ix.x, y: line.p2.y - ix.y };
  const l1 = Math.hypot(d1.x, d1.y), l2 = Math.hypot(d2.x, d2.y);
  const dirs = [];
  if (l1 > 1e-6) dirs.push({ ux:d1.x/l1, uy:d1.y/l1, key:'p1', len:l1 });
  if (l2 > 1e-6) dirs.push({ ux:d2.x/l2, uy:d2.y/l2, key:'p2', len:l2 });
  return dirs;
}

// Rev.16.24: 마우스 위치(mp)에 가장 부합하는 방향(각 선의 keep 방향) 선택 → 필렛 계산 결과 반환(없으면 null)
function computeFilletForMouse(mp){
  if (!filletPreview) return null;
  const { L1, L2, ix, rPx } = filletPreview;
  // 마우스 방향 단위벡터 (교점→마우스)
  const mdx = mp.x - ix.x, mdy = mp.y - ix.y;
  const mlen = Math.hypot(mdx, mdy);
  if (mlen < 1e-6) return null;
  const mux = mdx/mlen, muy = mdy/mlen;

  // 각 선에서 마우스 방향과 내적이 큰(=같은 쪽) 방향을 keep으로 선택
  const dirs1 = filletLineDirs(L1, ix);
  const dirs2 = filletLineDirs(L2, ix);
  if (!dirs1.length || !dirs2.length) return null;
  const pick = (dirs) => dirs.reduce((best,d) => {
    const dot = d.ux*mux + d.uy*muy;
    return (!best || dot > best.dot) ? {d, dot} : best;
  }, null).d;
  const e1 = pick(dirs1), e2 = pick(dirs2);

  const dot = e1.ux*e2.ux + e1.uy*e2.uy;
  const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
  if (ang < 0.01 || ang > Math.PI - 0.01) return null;

  const d = rPx / Math.tan(ang/2);
  // 길이 초과 체크 (keepLen = 해당 방향 끝점까지 거리)
  if ((d > e1.len + 0.5) || (d > e2.len + 0.5)) {
    return { tooBig:true, needMm:(d*mmPerPixel), maxMm:(Math.min(e1.len,e2.len)*mmPerPixel) };
  }
  const t1 = { x: ix.x + e1.ux*d, y: ix.y + e1.uy*d };
  const t2 = { x: ix.x + e2.ux*d, y: ix.y + e2.uy*d };
  const bisX = e1.ux + e2.ux, bisY = e1.uy + e2.uy;
  const bisLen = Math.hypot(bisX, bisY);
  if (bisLen < 1e-6) return null;
  const distC = rPx / Math.sin(ang/2);
  const cx = ix.x + (bisX/bisLen)*distC;
  const cy = ix.y + (bisY/bisLen)*distC;
  const a1 = Math.atan2(t1.y - cy, t1.x - cx);
  const a2 = Math.atan2(t2.y - cy, t2.x - cx);
  let diff = a2 - a1;
  while (diff > Math.PI) diff -= 2*Math.PI;
  while (diff < -Math.PI) diff += 2*Math.PI;
  const ccw = diff < 0;
  // cut 방향 = keep의 반대 끝점
  const cut1 = e1.key === 'p1' ? 'p2' : 'p1';
  const cut2 = e2.key === 'p1' ? 'p2' : 'p1';
  return { t1, t2, cx, cy, a1, a2, ccw, cut1, cut2, r:rPx };
}

// Rev.16.24: 필렛 방향 미리보기 그리기
function drawFilletPreview(mp){
  if (!filletPreview || !preCtx) return;
  const Z = zoom || 1;
  preCtx.clearRect(0,0,baseW,baseH);
  const res = computeFilletForMouse(mp);
  preCtx.save();
  if (res && !res.tooBig){
    // 단축될 두 선 + 호 미리보기
    const { L1, L2, ix } = filletPreview;
    preCtx.strokeStyle = '#ffcc00'; preCtx.lineWidth = 2/Z; preCtx.setLineDash([]);
    // 호
    preCtx.beginPath();
    preCtx.arc(res.cx, res.cy, res.r, res.a1, res.a2, res.ccw);
    preCtx.stroke();
    // 단축 후 선 끝(접점) 표시
    preCtx.fillStyle = '#ffcc00';
    [res.t1, res.t2].forEach(t => { preCtx.beginPath(); preCtx.arc(t.x,t.y,4/Z,0,Math.PI*2); preCtx.fill(); });
    document.getElementById('statusHint').textContent =
      `◜ 필렛 Ø${(filletPreview.rMm*2)}mm: 이 코너로 좌클릭 확정 · 우클릭/Esc=취소`;
  } else if (res && res.tooBig){
    document.getElementById('statusHint').textContent =
      `◜ 지름이 큼: 필요 ${res.needMm.toFixed(1)}mm > 선길이 ${res.maxMm.toFixed(1)}mm. 다른 코너 또는 작은 Ø`;
  }
  preCtx.restore();
}

// Rev.16.24: 필렛 확정 (좌클릭)
function commitFilletAt(mp){
  if (!filletPreview) return false;
  const res = computeFilletForMouse(mp);
  if (!res || res.tooBig){
    document.getElementById('statusHint').textContent = '◜ 이 방향은 적용 불가. 다른 코너로 이동 후 좌클릭하세요.';
    return false;
  }
  const { L1, L2, rMm } = filletPreview;
  L1[res.cut1] = { x: Math.round(res.t1.x), y: Math.round(res.t1.y) };
  L2[res.cut2] = { x: Math.round(res.t2.x), y: Math.round(res.t2.y) };
  shapes.push({
    id: ++shapeIdSeq, type:'arc',
    cx: res.cx, cy: res.cy, r: res.r,
    startAngle: res.a1, endAngle: res.a2, ccw: res.ccw,
    p1: { x: Math.round(res.t1.x), y: Math.round(res.t1.y) },
    p2: { x: Math.round(res.t2.x), y: Math.round(res.t2.y) },
    stroke: L1.stroke, strokeWidth: L1.strokeWidth
  });
  redoStack = []; pushHistory();
  preCtx.clearRect(0,0,baseW,baseH);
  redrawDraw(); updateCount();
  document.getElementById('statusHint').textContent = `◜ 모서리 Ø${(rMm*2)}mm (R${rMm}mm) 생성 완료 · 선택 모드로 전환`;
  filletPreview = null;
  filletState = null;
  if (typeof selectTool === 'function') selectTool('select');  // Rev.16.25: 1회성 - 확정 후 선택 모드
  return true;
}

// Rev.16.24: 필렛 미리보기 취소
function cancelFilletPreview(){
  if (!filletPreview) return false;
  filletPreview = null;
  preCtx.clearRect(0,0,baseW,baseH);
  redrawDraw();
  document.getElementById('statusHint').textContent = '◜ 필렛 취소됨';
  return true;
}

// 사각형의 모서리에 라운드 적용
// 사각형 → 4개 line으로 분해 + 선택된 모서리에 호 추가 + 인접 두 변 단축
function handleFilletOnRect(rect, p) {
  const x1 = Math.min(rect.p1.x, rect.p2.x);
  const x2 = Math.max(rect.p1.x, rect.p2.x);
  const y1 = Math.min(rect.p1.y, rect.p2.y);
  const y2 = Math.max(rect.p1.y, rect.p2.y);
  const w = x2 - x1, h = y2 - y1;

  if (w < 4 || h < 4) {
    alert('사각형이 너무 작습니다.');
    return;
  }

  // 4 모서리 위치
  const corners = [
    {key:'TL', label:'좌상', x: x1, y: y1},
    {key:'TR', label:'우상', x: x2, y: y1},
    {key:'BR', label:'우하', x: x2, y: y2},
    {key:'BL', label:'좌하', x: x1, y: y2}
  ];
  // 클릭점에서 가장 가까운 모서리 선택
  let best = null, bd = Infinity;
  for (const c of corners) {
    const d = Math.hypot(p.x-c.x, p.y-c.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return;

  // 꼭지점에서 너무 멀면 안내 후 종료 (사용자가 어느 모서리인지 명확히 클릭하도록)
  const maxDist = Math.min(w, h) / 2; // 사각형 절반보다 멀면 모호함
  if (bd > maxDist + 10) {
    alert(`사각형의 꼭지점(모서리) 근처를 클릭해주세요.\n\n현재 가장 가까운 꼭지점: [${best.label}] (${bd.toFixed(0)}px 거리)\n허용 거리: ${maxDist.toFixed(0)}px 이내\n\n💡 꼭지점에 가까이 클릭할수록 정확합니다.`);
    return;
  }

  // 지름 입력
  const rStr = prompt(
    `사각형 모서리 [${best.label}]에 라운드 적용\n\n지름 Ø(mm) 입력 (반지름의 2배):\n현재 캘리브: ${calibSet ? '1mm = '+(1/mmPerPixel).toFixed(1)+'px' : '미설정 (1:1)'}`,
    '10'
  );
  if (!rStr) return;
  const dMm = evalExpr(rStr);
  if (isNaN(dMm) || dMm <= 0) { alert('잘못된 지름.'); return; }
  const rMm = dMm / 2;
  const r = rMm / mmPerPixel;

  const maxR = Math.min(w, h) / 2;
  if (r > maxR) {
    alert(`반지름이 너무 큽니다.\n사각형: ${(w*mmPerPixel).toFixed(1)}×${(h*mmPerPixel).toFixed(1)}mm\n최대 R: ${(maxR*mmPerPixel).toFixed(1)}mm`);
    return;
  }

  // 모서리별로 직접 계산:
  //   TL 모서리(x1,y1) → 가로변 위 t1=(x1+r, y1), 세로변 위 t2=(x1, y1+r), 호 중심 (x1+r, y1+r)
  //   TR (x2,y1) → t1=(x2-r,y1), t2=(x2,y1+r), 중심 (x2-r, y1+r)
  //   BR (x2,y2) → t1=(x2-r,y2), t2=(x2,y2-r), 중심 (x2-r, y2-r)
  //   BL (x1,y2) → t1=(x1+r,y2), t2=(x1,y2-r), 중심 (x1+r, y2-r)
  let cx, cy, startAng, endAng;
  // 호의 각도는 중심에서 t1, t2로 향하는 각도
  // 작은 호(90°)가 모서리를 채워야 함

  const stroke = rect.stroke || '#fff';
  const strokeWidth = rect.strokeWidth || 1;
  const layer = rect.layer;

  // 4 line 생성 - 각 변 양 끝을 시작점으로 (이미 라운드된 끝점 적용)
  // 변 순서: top(x1+r→x2-r), right(y1+r→y2-r), bottom(x2-r→x1+r), left(y2-r→y1+r)
  // 단순화를 위해 각 모서리 r은 0이지만, 클릭된 모서리만 r 적용
  let topStartX = x1, topEndX = x2;
  let rightStartY = y1, rightEndY = y2;
  let bottomStartX = x2, bottomEndX = x1;
  let leftStartY = y2, leftEndY = y1;

  if (best.key === 'TL') {
    topStartX = x1 + r;
    leftEndY = y1 + r;
    cx = x1 + r; cy = y1 + r;
    // TL: 호중심에서 t1=(x1,cy)는 왼쪽=π, t2=(cx,y1)은 위=-π/2 (canvas Y는 아래로 +)
    // 정렬: startAng=-π, endAng=-π/2 (차이 +π/2)
    startAng = -Math.PI;
    endAng   = -Math.PI/2;
  } else if (best.key === 'TR') {
    topEndX = x2 - r;
    rightStartY = y1 + r;
    cx = x2 - r; cy = y1 + r;
    // TR: t1=(x2,cy)=오른쪽=0, t2=(cx,y1)=위=-π/2
    // 정렬: startAng=-π/2, endAng=0
    startAng = -Math.PI/2;
    endAng   = 0;
  } else if (best.key === 'BR') {
    rightEndY = y2 - r;
    bottomStartX = x2 - r;
    cx = x2 - r; cy = y2 - r;
    // BR: 0 → π/2
    startAng = 0;
    endAng   = Math.PI/2;
  } else { // BL
    bottomEndX = x1 + r;
    leftStartY = y2 - r;
    cx = x1 + r; cy = y2 - r;
    // BL: π/2 → π
    startAng = Math.PI/2;
    endAng   = Math.PI;
  }

  // shapes에서 rect 제거
  const idx = shapes.findIndex(s => s.id === rect.id);
  if (idx >= 0) shapes.splice(idx, 1);

  // 4 line 추가 (라운드 적용된 모서리만 단축됨)
  const newLines = [
    {id: ++shapeIdSeq, type:'line', p1:{x: Math.round(topStartX), y:y1}, p2:{x: Math.round(topEndX), y:y1}, stroke, strokeWidth, layer},
    {id: ++shapeIdSeq, type:'line', p1:{x:x2, y: Math.round(rightStartY)}, p2:{x:x2, y: Math.round(rightEndY)}, stroke, strokeWidth, layer},
    {id: ++shapeIdSeq, type:'line', p1:{x: Math.round(bottomStartX), y:y2}, p2:{x: Math.round(bottomEndX), y:y2}, stroke, strokeWidth, layer},
    {id: ++shapeIdSeq, type:'line', p1:{x:x1, y: Math.round(leftStartY)}, p2:{x:x1, y: Math.round(leftEndY)}, stroke, strokeWidth, layer}
  ];
  newLines.forEach(L => shapes.push(L));

  // 호 추가 (90° 짧은 호)
  // 위에서 startAng < endAng가 되도록 각도를 설정했고, 차이는 정확히 90°
  // ccw=false (시계방향, canvas 좌표에서 각도 증가 방향) → 90° 짧은 호 그리기
  const t1 = {x: cx + r*Math.cos(startAng), y: cy + r*Math.sin(startAng)};
  const t2 = {x: cx + r*Math.cos(endAng),   y: cy + r*Math.sin(endAng)};
  console.log('🔧 [Fillet rect ' + best.key + '] start=' + (startAng*180/Math.PI).toFixed(0) + '° end=' + (endAng*180/Math.PI).toFixed(0) + '° (90° 짧은 호, ccw=false)');

  shapes.push({
    id: ++shapeIdSeq, type: 'arc',
    cx: cx, cy: cy, r: r,
    startAngle: startAng, endAngle: endAng,
    ccw: false,
    p1: {x: Math.round(t1.x), y: Math.round(t1.y)},
    p2: {x: Math.round(t2.x), y: Math.round(t2.y)},
    stroke, strokeWidth, layer
  });

  redoStack = []; pushHistory();
  redrawDraw();
  updateCount();
  document.getElementById('statusHint').textContent = `◜ 사각형 [${best.label}] 모서리 Ø${(rMm*2)}mm (R${rMm}mm) 적용 완료 · 선택 모드로 전환`;
  filletState = null;
  if (typeof selectTool === 'function') selectTool('select');  // Rev.16.25: 1회성
}

// 반지름이 이미 정해진 상태에서 두 선에 라운드 적용 (prompt 생략)

// ═══════════════════════════════════════════════════════════════
//  Rev.13.2: 챔퍼(C면취) - applyFilletToTwoLines와 동일 흐름
// ═══════════════════════════════════════════════════════════════

function handleChamferClick(p) {
  // 꼭지점 자동 감지 (두 선 끝점이 만나는 곳)
  const vertexHit = findVertexAt(p, 15);
  if (vertexHit) {
    applyChamferToTwoLines(vertexHit.line1, vertexHit.line2, vertexHit.click1, vertexHit.click2);
    chamferState = null;
    return;
  }

  let target = findShapeAtPoint(p, 15);
  if (!target) {
    document.getElementById('statusHint').textContent = '⌐ 챔퍼: 사각형 꼭지점 또는 선을 클릭하세요.';
    return;
  }

  if (target.type === 'rect') {
    handleChamferOnRect(target, p);
    return;
  }

  if (target.type !== 'line') {
    document.getElementById('statusHint').textContent = '⌐ 챔퍼: 선(line) 또는 사각형을 클릭하세요.';
    return;
  }

  if (!chamferState) {
    chamferState = { firstLine: target, firstClickPt: {x:p.x, y:p.y} };
    document.getElementById('statusHint').textContent = '⌐ 첫 번째 선 선택됨. 두 번째 선을 클릭하세요.';
    redrawDraw();
    drawCtx.save();
    drawCtx.strokeStyle = '#e67e22'; drawCtx.lineWidth = 4;
    drawCtx.beginPath();
    drawCtx.moveTo(target.p1.x, target.p1.y);
    drawCtx.lineTo(target.p2.x, target.p2.y);
    drawCtx.stroke();
    drawCtx.restore();
    return;
  }

  if (target.id === chamferState.firstLine.id) {
    document.getElementById('statusHint').textContent = '⌐ 챔퍼: 다른 선을 클릭하세요.';
    return;
  }

  const L1 = chamferState.firstLine;
  applyChamferToTwoLines(L1, target, chamferState.firstClickPt, {x:p.x, y:p.y});
  chamferState = null;
}

function applyChamferToTwoLines(L1, L2, click1, click2, cOverride) {
  const ix = lineLineIntersection(L1.p1, L1.p2, L2.p1, L2.p2);
  if (!ix) { alert('두 선이 평행이라 면취할 수 없습니다.'); redrawDraw(); return false; }

  // C값: 인자 우선, 없으면 입력창값, 없으면 prompt
  let cMm = cOverride != null ? cOverride : chamferC;
  if (cOverride == null) {
    const inp = document.getElementById('chamferCInput');
    if (inp) { const v = parseFloat(inp.value); if (!isNaN(v) && v > 0) cMm = v; }
  }
  if (cMm <= 0) {
    const s = prompt('챔퍼 C값(mm):', '5');
    if (!s) { redrawDraw(); return false; }
    cMm = parseFloat(s);
    if (isNaN(cMm) || cMm <= 0) { alert('잘못된 값.'); redrawDraw(); return false; }
  }
  chamferC = cMm;
  const inp2 = document.getElementById('chamferCInput');
  if (inp2) inp2.value = cMm;

  const c = cMm / mmPerPixel; // px

  // 각 선의 살릴 방향(교점 기준)
  function lineDir(line, clickPt) {
    const d1 = Math.hypot(clickPt.x - line.p1.x, clickPt.y - line.p1.y);
    const d2 = Math.hypot(clickPt.x - line.p2.x, clickPt.y - line.p2.y);
    const keepKey = d1 < d2 ? 'p1' : 'p2';
    const cutKey  = keepKey === 'p1' ? 'p2' : 'p1';
    const keep = line[keepKey];
    const dx = keep.x - ix.x, dy = keep.y - ix.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      const other = line[cutKey];
      const ox = other.x - ix.x, oy = other.y - ix.y;
      const oLen = Math.hypot(ox, oy);
      if (oLen < 1e-6) return null;
      return {ux: -ox/oLen, uy: -oy/oLen, keepKey, cutKey, keepLen: 0};
    }
    return {ux: dx/len, uy: dy/len, keepKey, cutKey, keepLen: len};
  }

  const e1 = lineDir(L1, click1);
  const e2 = lineDir(L2, click2);
  if (!e1 || !e2) { redrawDraw(); return false; }

  if (c > e1.keepLen + 0.5 && e1.keepLen > 0.5 || c > e2.keepLen + 0.5 && e2.keepLen > 0.5) {
    alert(`C${cMm}mm가 선 길이를 벗어납니다.
최대: ${(Math.min(e1.keepLen, e2.keepLen)*mmPerPixel).toFixed(1)}mm`);
    redrawDraw(); return false;
  }

  // 각 선 위의 면취 시작점 (교점에서 c만큼)
  const t1 = {x: ix.x + e1.ux * c, y: ix.y + e1.uy * c};
  const t2 = {x: ix.x + e2.ux * c, y: ix.y + e2.uy * c};

  // 선 단축
  L1[e1.cutKey] = {x: Math.round(t1.x), y: Math.round(t1.y)};
  L2[e2.cutKey] = {x: Math.round(t2.x), y: Math.round(t2.y)};

  // 면취 직선 추가
  shapes.push({
    id: ++shapeIdSeq, type: 'line',
    p1: {x: Math.round(t1.x), y: Math.round(t1.y)},
    p2: {x: Math.round(t2.x), y: Math.round(t2.y)},
    stroke: L1.stroke, strokeWidth: L1.strokeWidth || 1
  });

  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  document.getElementById('statusHint').textContent = `⌐ 챔퍼 C${cMm}mm 생성 완료`;
  return true;
}

// 사각형 챔퍼 - 클릭된 모서리만, 양쪽 균등(C값)
function handleChamferOnRect(rect, p) {
  const x1 = Math.min(rect.p1.x, rect.p2.x);
  const x2 = Math.max(rect.p1.x, rect.p2.x);
  const y1 = Math.min(rect.p1.y, rect.p2.y);
  const y2 = Math.max(rect.p1.y, rect.p2.y);
  const w = x2 - x1, h = y2 - y1;
  if (w < 4 || h < 4) { alert('사각형이 너무 작습니다.'); return; }

  const corners = [
    {key:'TL', label:'좌상', x:x1, y:y1},
    {key:'TR', label:'우상', x:x2, y:y1},
    {key:'BR', label:'우하', x:x2, y:y2},
    {key:'BL', label:'좌하', x:x1, y:y2}
  ];
  let best = null, bd = Infinity;
  for (const c of corners) {
    const d = Math.hypot(p.x-c.x, p.y-c.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return;

  // C값
  let cMm = chamferC;
  const inp = document.getElementById('chamferCInput');
  if (inp) { const v = parseFloat(inp.value); if (!isNaN(v) && v > 0) cMm = v; }
  if (cMm <= 0) {
    const s = prompt(`사각형 [${best.label}] 챔퍼 C값(mm):`, '5');
    if (!s) return;
    cMm = parseFloat(s);
    if (isNaN(cMm) || cMm <= 0) { alert('잘못된 값.'); return; }
  }
  chamferC = cMm;
  if (inp) inp.value = cMm;

  const c = cMm / mmPerPixel;
  const maxC = Math.min(w, h) / 2;
  if (c > maxC) {
    alert(`C값이 너무 큽니다. 최대: ${(maxC*mmPerPixel).toFixed(1)}mm`);
    return;
  }

  const stroke = rect.stroke || '#fff';
  const strokeWidth = rect.strokeWidth || 1;
  const layer = rect.layer;

  // 면취 적용 - 각 변 끝점 조정 (클릭된 모서리만)
  let topX1=x1, topX2=x2, rightY1=y1, rightY2=y2;
  let bottomX1=x1, bottomX2=x2, leftY1=y1, leftY2=y2;
  let chamferP1, chamferP2; // 면취 직선 양 끝

  if (best.key === 'TL') {
    topX1    = x1 + c; leftY1   = y1 + c;
    chamferP1 = {x: x1+c, y: y1}; chamferP2 = {x: x1, y: y1+c};
  } else if (best.key === 'TR') {
    topX2    = x2 - c; rightY1  = y1 + c;
    chamferP1 = {x: x2-c, y: y1}; chamferP2 = {x: x2, y: y1+c};
  } else if (best.key === 'BR') {
    bottomX2 = x2 - c; rightY2  = y2 - c;
    chamferP1 = {x: x2-c, y: y2}; chamferP2 = {x: x2, y: y2-c};
  } else { // BL
    bottomX1 = x1 + c; leftY2   = y2 - c;
    chamferP1 = {x: x1+c, y: y2}; chamferP2 = {x: x1, y: y2-c};
  }

  // 기존 rect 제거
  const idx = shapes.findIndex(s => s.id === rect.id);
  if (idx >= 0) shapes.splice(idx, 1);

  // 4변 추가 (면취된 모서리만 단축)
  const mk = (p1, p2) => ({id:++shapeIdSeq, type:'line', p1, p2, stroke, strokeWidth, layer});
  shapes.push(
    mk({x:Math.round(topX1),    y:y1}, {x:Math.round(topX2),    y:y1}),
    mk({x:x2, y:Math.round(rightY1)},  {x:x2, y:Math.round(rightY2)}),
    mk({x:Math.round(bottomX2), y:y2}, {x:Math.round(bottomX1), y:y2}),
    mk({x:x1, y:Math.round(leftY2)},   {x:x1, y:Math.round(leftY1)})
  );
  // 면취 직선
  shapes.push(mk(
    {x:Math.round(chamferP1.x), y:Math.round(chamferP1.y)},
    {x:Math.round(chamferP2.x), y:Math.round(chamferP2.y)}
  ));

  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  document.getElementById('statusHint').textContent = `⌐ 사각형 [${best.label}] 챔퍼 C${cMm}mm 완료`;
}

// ═══════════════════════════════════════════════════════════════
//  Rev.13.2: 호-직선 접선 자동연결
//  ① 직선 클릭(끝점 가까운 쪽 선택) → ② 호/원 클릭
//  선의 해당 끝점을 호와의 접선점으로 이동
// ═══════════════════════════════════════════════════════════════

function handleTangentClick(p) {
  if (!tangentState) {
    // 1단계: 직선 선택
    const target = findShapeAtPoint(p, 15);
    if (!target || target.type !== 'line') {
      document.getElementById('statusHint').textContent = '⌒ 접선연결: 직선(line)을 클릭하세요.';
      return;
    }
    // 클릭점에 가까운 끝점 = 이동할 끝점
    const d1 = Math.hypot(p.x - target.p1.x, p.y - target.p1.y);
    const d2 = Math.hypot(p.x - target.p2.x, p.y - target.p2.y);
    const endKey = d1 <= d2 ? 'p1' : 'p2';
    tangentState = { line: target, endKey };

    redrawDraw();
    drawCtx.save();
    drawCtx.strokeStyle = '#27ae60'; drawCtx.lineWidth = 4;
    drawCtx.beginPath();
    drawCtx.moveTo(target.p1.x, target.p1.y);
    drawCtx.lineTo(target.p2.x, target.p2.y);
    drawCtx.stroke();
    // 이동할 끝점 강조
    const ep = target[endKey];
    drawCtx.fillStyle = '#f39c12';
    drawCtx.beginPath(); drawCtx.arc(ep.x, ep.y, 7/(zoom||1), 0, Math.PI*2); drawCtx.fill();
    drawCtx.restore();
    document.getElementById('statusHint').textContent = '⌒ 접선연결: 연결할 호/원을 클릭하세요.';
    return;
  }

  // 2단계: 호/원 선택 → 접선점 계산
  const arc = findShapeAtPoint(p, 15);
  if (!arc || (arc.type !== 'arc' && arc.type !== 'circle')) {
    document.getElementById('statusHint').textContent = '⌒ 접선연결: 호 또는 원을 클릭하세요.';
    return;
  }

  const line = tangentState.line;
  const endKey = tangentState.endKey;
  const fixedKey = endKey === 'p1' ? 'p2' : 'p1';
  const fixed = line[fixedKey]; // 고정 끝점
  const movePt = line[endKey];  // 이동할 끝점

  // 원/호 중심 (circle: p1=중심, r=hypot(p2-p1) / arc: cx,cy,r)
  let cx, cy, r;
  if (arc.type === 'circle') {
    cx = arc.p1.x; cy = arc.p1.y;
    r = Math.hypot(arc.p2.x - arc.p1.x, arc.p2.y - arc.p1.y);
  } else {
    cx = arc.cx; cy = arc.cy; r = arc.r;
  }

  // 고정점 → 원 중심 벡터
  const dx = cx - fixed.x, dy = cy - fixed.y;
  const dist = Math.hypot(dx, dy);

  if (dist < r - 0.5) {
    document.getElementById('statusHint').textContent = '⚠ 선의 고정 끝점이 호 안쪽에 있어 접선 불가.';
    tangentState = null; redrawDraw(); return;
  }

  // 외부 접선: 고정점 → 원에 접하는 두 접선점 계산
  // sin(θ) = r/dist → θ = 접선 반각
  const sinT = r / dist;
  const cosT = Math.sqrt(Math.max(0, 1 - sinT*sinT));
  const baseAng = Math.atan2(dy, dx); // 고정점→중심 각도

  // 두 접선점 (원 위)
  const tang1 = {
    x: cx + r * Math.cos(baseAng + Math.PI/2 + Math.acos(cosT) - Math.PI/2),
    y: cy + r * Math.sin(baseAng + Math.PI/2 + Math.acos(cosT) - Math.PI/2)
  };
  // 더 정확한 계산: 접선점 = 원 중심에서 수선발
  // 접선 각도 α = baseAng ± asin(r/dist)
  const alpha1 = baseAng + Math.asin(sinT);
  const alpha2 = baseAng - Math.asin(sinT);
  // 각 접선의 방향벡터와 fixed→원 사이의 접선점
  // 접선점은: 원 중심에서 접선 방향의 수선발
  const tp1 = {
    x: cx - r * Math.sin(alpha1),
    y: cy + r * Math.cos(alpha1)
  };
  const tp2 = {
    x: cx - r * Math.sin(alpha2),
    y: cy + r * Math.cos(alpha2)
  };

  // 이동할 끝점(movePt)에 더 가까운 접선점 선택
  const d1 = Math.hypot(movePt.x - tp1.x, movePt.y - tp1.y);
  const d2 = Math.hypot(movePt.x - tp2.x, movePt.y - tp2.y);
  const tp = d1 <= d2 ? tp1 : tp2;

  // 선의 이동할 끝점을 접선점으로 교체
  line[endKey] = {x: Math.round(tp.x), y: Math.round(tp.y)};

  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  tangentState = null;
  document.getElementById('statusHint').textContent = '⌒ 접선연결 완료';
}

// ═══════════════════════════════════════════════════════════════
//  Rev.13.2: 기준선(중심선) 자동생성
//  - 원/호 클릭 → 중심 기준 수평+수직 일점쇄선 생성
//  - 직선 클릭  → 그 선의 수직이등분 중심선 생성
//  - 두 평행선 클릭 → 중간 기준선 생성
//  lineType:'dashdot', layer:'center', stroke:'#ff8800'
// ═══════════════════════════════════════════════════════════════

function handleCenterlineClick(p) {
  const target = findShapeAtPoint(p, 15);
  if (!target) {
    document.getElementById('statusHint').textContent = '✛ 기준선: 원, 호, 또는 선을 클릭하세요.';
    return;
  }

  const oh = centerlineOverhang / mmPerPixel; // 바깥 튀어나오기(px)
  const clStyle = { lineType:'dashdot', layer:'center', stroke:'#ff8800', strokeWidth:1 };

  // ── 원 클릭: 수평 + 수직 중심선 ──────────────────────────────
  if (target.type === 'circle') {
    const cx = target.p1.x, cy = target.p1.y;
    const r  = Math.hypot(target.p2.x - cx, target.p2.y - cy);
    addCenterlines(cx, cy, r, oh, clStyle);
    finish('원');
    return;
  }

  // ── 호 클릭: 수평 + 수직 중심선 ──────────────────────────────
  if (target.type === 'arc') {
    addCenterlines(target.cx, target.cy, target.r, oh, clStyle);
    finish('호');
    return;
  }

  // ── 직선 클릭: 수직이등분 중심선 + 선 위 중심 마크 ──────────
  if (target.type === 'line') {
    const mx = (target.p1.x + target.p2.x) / 2;
    const my = (target.p1.y + target.p2.y) / 2;
    const len = Math.hypot(target.p2.x - target.p1.x, target.p2.y - target.p1.y);
    // 선 방향 단위벡터 → 수직 방향
    const dx = target.p2.x - target.p1.x, dy = target.p2.y - target.p1.y;
    const L = Math.hypot(dx, dy);
    if (L < 1e-6) return;
    const px = -dy/L, py = dx/L; // 수직 방향
    // 수직이등분선: 중점에서 수직으로 선 길이/2 + 여백
    const ext = len/2 + oh;
    shapes.push({ id:++shapeIdSeq, type:'line',
      p1:{x: Math.round(mx + px*ext), y: Math.round(my + py*ext)},
      p2:{x: Math.round(mx - px*ext), y: Math.round(my - py*ext)},
      ...clStyle });
    // 선 자체의 중점 마크(짧은 교차선)
    const mk = oh * 0.6;
    const ux = dx/L, uy = dy/L;
    shapes.push({ id:++shapeIdSeq, type:'line',
      p1:{x: Math.round(mx + ux*mk), y: Math.round(my + uy*mk)},
      p2:{x: Math.round(mx - ux*mk), y: Math.round(my - uy*mk)},
      ...clStyle });
    finish('선 수직이등분');
    return;
  }

  // ── 사각형 클릭: 수평 + 수직 중심선 ─────────────────────────
  if (target.type === 'rect') {
    const cx = (target.p1.x + target.p2.x) / 2;
    const cy = (target.p1.y + target.p2.y) / 2;
    const hw = Math.abs(target.p2.x - target.p1.x) / 2;
    const hh = Math.abs(target.p2.y - target.p1.y) / 2;
    // 수평
    shapes.push({ id:++shapeIdSeq, type:'line',
      p1:{x: Math.round(cx - hw - oh), y: Math.round(cy)},
      p2:{x: Math.round(cx + hw + oh), y: Math.round(cy)},
      ...clStyle });
    // 수직
    shapes.push({ id:++shapeIdSeq, type:'line',
      p1:{x: Math.round(cx), y: Math.round(cy - hh - oh)},
      p2:{x: Math.round(cx), y: Math.round(cy + hh + oh)},
      ...clStyle });
    finish('사각형');
    return;
  }

  document.getElementById('statusHint').textContent = '✛ 기준선: 원, 호, 선, 사각형을 클릭하세요.';
}

// 원/호 중심 기준 수평+수직 일점쇄선 2개 생성
function addCenterlines(cx, cy, r, oh, style) {
  // 수평
  shapes.push({ id:++shapeIdSeq, type:'line',
    p1:{x: Math.round(cx - r - oh), y: Math.round(cy)},
    p2:{x: Math.round(cx + r + oh), y: Math.round(cy)},
    ...style });
  // 수직
  shapes.push({ id:++shapeIdSeq, type:'line',
    p1:{x: Math.round(cx), y: Math.round(cy - r - oh)},
    p2:{x: Math.round(cx), y: Math.round(cy + r + oh)},
    ...style });
}

function finish(label) {
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  document.getElementById('statusHint').textContent =
    `✛ ${label} 기준선(일점쇄선) 생성 완료 — 계속 클릭하거나 Esc 종료`;
}


function applyFilletNoPrompt(L1, L2, click1, click2, r, rMm) {
  const ix = lineLineIntersection(L1.p1, L1.p2, L2.p1, L2.p2);
  if (!ix) { alert('두 선이 평행입니다.'); return false; }
  
  function lineEndpointToCutKey(line, clickPt, ix) {
    const d1 = Math.hypot(clickPt.x - line.p1.x, clickPt.y - line.p1.y);
    const d2 = Math.hypot(clickPt.x - line.p2.x, clickPt.y - line.p2.y);
    const keepKey = d1 < d2 ? 'p1' : 'p2';
    const cutKey  = d1 < d2 ? 'p2' : 'p1';
    const keep = line[keepKey];
    const dx = keep.x - ix.x, dy = keep.y - ix.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    return {ux: dx/len, uy: dy/len, keepKey, cutKey};
  }
  const e1 = lineEndpointToCutKey(L1, click1, ix);
  const e2 = lineEndpointToCutKey(L2, click2, ix);
  if (!e1 || !e2) return false;
  
  const dot = e1.ux * e2.ux + e1.uy * e2.uy;
  const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
  if (ang < 0.01 || ang > Math.PI - 0.01) { alert('각도 오류'); return false; }
  
  const d = r / Math.tan(ang/2);
  const t1 = {x: ix.x + e1.ux * d, y: ix.y + e1.uy * d};
  const t2 = {x: ix.x + e2.ux * d, y: ix.y + e2.uy * d};
  
  const bisX = e1.ux + e2.ux, bisY = e1.uy + e2.uy;
  const bisLen = Math.hypot(bisX, bisY);
  if (bisLen < 1e-6) return false;
  const distC = r / Math.sin(ang/2);
  const cx = ix.x + (bisX/bisLen) * distC;
  const cy = ix.y + (bisY/bisLen) * distC;
  
  L1[e1.cutKey] = {x: Math.round(t1.x), y: Math.round(t1.y)};
  L2[e2.cutKey] = {x: Math.round(t2.x), y: Math.round(t2.y)};
  
  const startAng = Math.atan2(t1.y - cy, t1.x - cx);
  const endAng   = Math.atan2(t2.y - cy, t2.x - cx);
  function midPoint(ccw) {
    let span = ccw ? (startAng - endAng) : (endAng - startAng);
    while (span < 0) span += Math.PI*2;
    const midA = ccw ? (startAng - span/2) : (startAng + span/2);
    return {x: cx + r*Math.cos(midA), y: cy + r*Math.sin(midA)};
  }
  const mA = midPoint(false), mB = midPoint(true);
  const distA = Math.hypot(mA.x-ix.x, mA.y-ix.y);
  const distB = Math.hypot(mB.x-ix.x, mB.y-ix.y);
  const ccw = distA < distB;
  
  shapes.push({
    id: ++shapeIdSeq, type: 'arc',
    cx: cx, cy: cy, r: r,
    startAngle: startAng, endAngle: endAng, ccw: ccw,
    p1: {x: Math.round(t1.x), y: Math.round(t1.y)},
    p2: {x: Math.round(t2.x), y: Math.round(t2.y)},
    stroke: L1.stroke, strokeWidth: L1.strokeWidth
  });
  redoStack = []; pushHistory();
  redrawDraw();
  updateCount();
  document.getElementById('statusHint').textContent = `◜ 모서리 Ø${(rMm*2)}mm (R${rMm}mm) 생성 완료`;
  return true;
}

// 오프셋 (Offset)

// ===== 분할 (Break) =====
// 선의 두 점 사이를 잘라내고 두 개의 선으로 분할
// 1차 클릭: 선 선택
// 2차 클릭: 첫 분할점
// 3차 클릭: 둘째 분할점 (같은 점이면 단순 분할)
let breakState = null;

function handleBreakClick(p) {
  // 1차: 선 선택
  if (!breakState) {
    const target = findShapeAtPoint(p, 15);
    if (!target) {
      document.getElementById('statusHint').textContent = '✄ 분할할 선/원/호를 클릭하세요.';
      return;
    }
    if (target.type !== 'line' && target.type !== 'circle' && target.type !== 'arc') {
      alert('분할은 선/원/호만 지원합니다.');
      return;
    }
    breakState = { target, points: [] };
    document.getElementById('statusHint').textContent = '✄ 첫 분할점 클릭 (도형 위)';
    redrawDraw();
    drawCtx.save();
    drawCtx.strokeStyle = '#f39c12'; drawCtx.lineWidth = 4;
    drawCtx.beginPath();
    if (target.type === 'line') {
      drawCtx.moveTo(target.p1.x, target.p1.y);
      drawCtx.lineTo(target.p2.x, target.p2.y);
    } else if (target.type === 'circle') {
      const r = Math.hypot(target.p2.x-target.p1.x, target.p2.y-target.p1.y);
      drawCtx.arc(target.p1.x, target.p1.y, r, 0, Math.PI*2);
    } else if (target.type === 'arc') {
      drawCtx.arc(target.cx, target.cy, target.r, target.startAngle, target.endAngle, target.ccw);
    }
    drawCtx.stroke();
    drawCtx.restore();
    return;
  }

  // 2차/3차 클릭: 분할점
  const proj = projectPointToShape(p, breakState.target);
  if (!proj) {
    alert('도형 위의 점을 클릭하세요.');
    return;
  }
  breakState.points.push(proj);

  if (breakState.points.length === 1) {
    document.getElementById('statusHint').textContent = '✄ 두 번째 분할점 클릭 (같은 점이면 1점 분할)';
    // 마커 표시
    drawCtx.save();
    drawCtx.fillStyle = '#ff5722';
    drawCtx.beginPath();
    drawCtx.arc(proj.x, proj.y, 4, 0, Math.PI*2);
    drawCtx.fill();
    drawCtx.restore();
    return;
  }

  // 두 점 모두 모임 - 실행
  const p1 = breakState.points[0], p2 = breakState.points[1];
  const target = breakState.target;
  breakState = null;

  applyBreak(target, p1, p2);
}

// ===== 점에서 분할 (Break at Point) =====
// 한 점에서 선을 두 개로 나눔 (중간 제거 없음)
function handleBreakAtPointClick(p) {
  if (!breakState) {
    const target = findShapeAtPoint(p, 15);
    if (!target) {
      document.getElementById('statusHint').textContent = '⋮ 분할할 선/원/호를 클릭하세요.';
      return;
    }
    if (target.type !== 'line' && target.type !== 'circle' && target.type !== 'arc') {
      alert('분할은 선/원/호만 지원합니다.');
      return;
    }
    breakState = { target, points: [] };
    document.getElementById('statusHint').textContent = '⋮ 분할할 점 클릭';
    redrawDraw();
    drawCtx.save();
    drawCtx.strokeStyle = '#f39c12'; drawCtx.lineWidth = 4;
    drawCtx.beginPath();
    if (target.type === 'line') {
      drawCtx.moveTo(target.p1.x, target.p1.y);
      drawCtx.lineTo(target.p2.x, target.p2.y);
    } else if (target.type === 'circle') {
      const r = Math.hypot(target.p2.x-target.p1.x, target.p2.y-target.p1.y);
      drawCtx.arc(target.p1.x, target.p1.y, r, 0, Math.PI*2);
    } else if (target.type === 'arc') {
      drawCtx.arc(target.cx, target.cy, target.r, target.startAngle, target.endAngle, target.ccw);
    }
    drawCtx.stroke();
    drawCtx.restore();
    return;
  }

  // 분할점
  const proj = projectPointToShape(p, breakState.target);
  if (!proj) { alert('도형 위의 점을 클릭하세요.'); return; }
  const target = breakState.target;
  breakState = null;
  // 같은 점 두 번 = 단순 1점 분할
  applyBreak(target, proj, proj);
}

// 임의 점 p를 도형 위로 투영 (가장 가까운 점)
function projectPointToShape(p, s) {
  if (s.type === 'line') {
    // 선분상 가장 가까운 점
    const vx = s.p2.x - s.p1.x, vy = s.p2.y - s.p1.y;
    const len2 = vx*vx + vy*vy;
    if (len2 < 1e-9) return {x:s.p1.x, y:s.p1.y};
    let t = ((p.x-s.p1.x)*vx + (p.y-s.p1.y)*vy) / len2;
    t = Math.max(0, Math.min(1, t));
    return {x: s.p1.x + vx*t, y: s.p1.y + vy*t, t};
  } else if (s.type === 'circle') {
    const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
    const dx = p.x - s.p1.x, dy = p.y - s.p1.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) return null;
    return {x: s.p1.x + dx/d*r, y: s.p1.y + dy/d*r, angle: Math.atan2(dy, dx)};
  } else if (s.type === 'arc') {
    const dx = p.x - s.cx, dy = p.y - s.cy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) return null;
    const ang = Math.atan2(dy, dx);
    // 호 범위 안에 있는지 검사
    if (!isAngleInArcRange(ang, s.startAngle, s.endAngle, s.ccw)) return null;
    return {x: s.cx + dx/d*s.r, y: s.cy + dy/d*s.r, angle: ang};
  }
  return null;
}

// 도형 분할 실행
function applyBreak(target, brk1, brk2) {
  const stroke = target.stroke || '#fff';
  const strokeWidth = target.strokeWidth || 1;
  const layer = target.layer;

  if (target.type === 'line') {
    // 선분의 t 값을 구해 정렬
    const t1 = (brk1.t !== undefined) ? brk1.t : projectPointToShape(brk1, target).t;
    const t2 = (brk2.t !== undefined) ? brk2.t : projectPointToShape(brk2, target).t;
    const tA = Math.min(t1, t2), tB = Math.max(t1, t2);
    // 두 점이 같으면 → 1점 분할 (양쪽이 다른 선)
    // 두 점이 다르면 → 두 점 사이 제거, 양쪽 선만 남김
    const pA = {x: target.p1.x + (target.p2.x-target.p1.x)*tA, y: target.p1.y + (target.p2.y-target.p1.y)*tA};
    const pB = {x: target.p1.x + (target.p2.x-target.p1.x)*tB, y: target.p1.y + (target.p2.y-target.p1.y)*tB};
    const idx = shapes.findIndex(s => s.id === target.id);
    if (idx < 0) return;
    shapes.splice(idx, 1);
    // 첫 조각: p1 → pA (tA > 0.001 인 경우만)
    if (tA > 0.001) {
      shapes.push({
        id: ++shapeIdSeq, type:'line',
        p1: {x: Math.round(target.p1.x), y: Math.round(target.p1.y)},
        p2: {x: Math.round(pA.x), y: Math.round(pA.y)},
        stroke, strokeWidth, layer
      });
    }
    // 둘째 조각: pB → p2 (tB < 0.999 인 경우만)
    if (tB < 0.999) {
      shapes.push({
        id: ++shapeIdSeq, type:'line',
        p1: {x: Math.round(pB.x), y: Math.round(pB.y)},
        p2: {x: Math.round(target.p2.x), y: Math.round(target.p2.y)},
        stroke, strokeWidth, layer
      });
    }
    document.getElementById('statusHint').textContent = '✄ 선 분할 완료';
  } else if (target.type === 'circle') {
    // 원 분할: 두 각도 사이를 제거하고 두 호로 변환
    const a1 = brk1.angle !== undefined ? brk1.angle : Math.atan2(brk1.y - target.p1.y, brk1.x - target.p1.x);
    const a2 = brk2.angle !== undefined ? brk2.angle : Math.atan2(brk2.y - target.p1.y, brk2.x - target.p1.x);
    const r = Math.hypot(target.p2.x-target.p1.x, target.p2.y-target.p1.y);
    const idx = shapes.findIndex(s => s.id === target.id);
    if (idx < 0) return;
    shapes.splice(idx, 1);
    // 같은 각도면 분할 불가 (원에서 한 점은 분할 의미 없음 → 호 하나로 변환)
    if (Math.abs(a1 - a2) < 0.001) {
      // 원 → 호 (시작각=끝각이지만 거의 완전한 원)
      shapes.push({
        id: ++shapeIdSeq, type:'arc',
        cx: target.p1.x, cy: target.p1.y, r,
        startAngle: a1, endAngle: a1 - 0.001, ccw: false,
        p1: {x: Math.round(target.p1.x + Math.cos(a1)*r), y: Math.round(target.p1.y + Math.sin(a1)*r)},
        p2: {x: Math.round(target.p1.x + Math.cos(a1-0.001)*r), y: Math.round(target.p1.y + Math.sin(a1-0.001)*r)},
        stroke, strokeWidth, layer
      });
    } else {
      // 두 호로 분할 (각도 사이 + 반대 사이)
      shapes.push({
        id: ++shapeIdSeq, type:'arc',
        cx: target.p1.x, cy: target.p1.y, r,
        startAngle: a2, endAngle: a1, ccw: false,
        p1: {x: Math.round(target.p1.x + Math.cos(a2)*r), y: Math.round(target.p1.y + Math.sin(a2)*r)},
        p2: {x: Math.round(target.p1.x + Math.cos(a1)*r), y: Math.round(target.p1.y + Math.sin(a1)*r)},
        stroke, strokeWidth, layer
      });
    }
    document.getElementById('statusHint').textContent = '✄ 원 분할 완료 (호로 변환)';
  } else if (target.type === 'arc') {
    // 호 분할: 두 각도 사이 제거, 양쪽 호 남김
    const a1 = brk1.angle, a2 = brk2.angle;
    if (a1 === undefined || a2 === undefined) return;
    const idx = shapes.findIndex(s => s.id === target.id);
    if (idx < 0) return;
    shapes.splice(idx, 1);
    // 두 분할점 사이를 제거. 호의 진행 방향 기준으로 정렬
    // startAngle → a1/a2 → endAngle 순서
    // 단순화: 두 호 (start→smaller, larger→end)
    const aSmall = Math.min(a1, a2), aLarge = Math.max(a1, a2);
    if (Math.abs(a1 - a2) < 0.001) {
      // 1점 분할
      shapes.push({
        id: ++shapeIdSeq, type:'arc',
        cx: target.cx, cy: target.cy, r: target.r,
        startAngle: target.startAngle, endAngle: a1, ccw: target.ccw,
        p1: target.p1, p2: {x: Math.round(target.cx + Math.cos(a1)*target.r), y: Math.round(target.cy + Math.sin(a1)*target.r)},
        stroke, strokeWidth, layer
      });
      shapes.push({
        id: ++shapeIdSeq, type:'arc',
        cx: target.cx, cy: target.cy, r: target.r,
        startAngle: a1, endAngle: target.endAngle, ccw: target.ccw,
        p1: {x: Math.round(target.cx + Math.cos(a1)*target.r), y: Math.round(target.cy + Math.sin(a1)*target.r)}, p2: target.p2,
        stroke, strokeWidth, layer
      });
    } else {
      shapes.push({
        id: ++shapeIdSeq, type:'arc',
        cx: target.cx, cy: target.cy, r: target.r,
        startAngle: target.startAngle, endAngle: aSmall, ccw: target.ccw,
        p1: target.p1, p2: {x: Math.round(target.cx + Math.cos(aSmall)*target.r), y: Math.round(target.cy + Math.sin(aSmall)*target.r)},
        stroke, strokeWidth, layer
      });
      shapes.push({
        id: ++shapeIdSeq, type:'arc',
        cx: target.cx, cy: target.cy, r: target.r,
        startAngle: aLarge, endAngle: target.endAngle, ccw: target.ccw,
        p1: {x: Math.round(target.cx + Math.cos(aLarge)*target.r), y: Math.round(target.cy + Math.sin(aLarge)*target.r)}, p2: target.p2,
        stroke, strokeWidth, layer
      });
    }
    document.getElementById('statusHint').textContent = '✄ 호 분할 완료';
  }

  redoStack = []; pushHistory();
  redrawDraw();
  updateCount();
}

// ===== 교차점 일괄 분할 (Break All) =====
// 선택된 선들의 모든 교차점을 찾아 한꺼번에 분할
// 선택이 없으면 → 전체 line 대상
function runBreakAllIntersections() {
  // 대상: 선택된 line만, 없으면 전체 line
  let targets;
  if (selectedIds.size > 0) {
    targets = shapes.filter(s => s.type === 'line' && selectedIds.has(s.id));
  } else {
    targets = shapes.filter(s => s.type === 'line');
  }
  if (targets.length < 2) {
    alert('교차점 분할은 2개 이상의 선이 필요합니다.\n선들을 선택한 후 다시 실행하세요.\n(선택이 없으면 전체 선 대상)');
    return;
  }

  // 각 line에 대해 다른 line과의 교차점 t 값을 수집
  // t는 0~1 사이 (선분 내부)
  const cutMap = new Map(); // line.id → [t1, t2, ...] (정렬 전)
  for (const L of targets) cutMap.set(L.id, []);

  let intersectionCount = 0;
  for (let i = 0; i < targets.length; i++) {
    for (let j = i+1; j < targets.length; j++) {
      const A = targets[i], B = targets[j];
      const ix = segmentSegmentIntersection(A.p1, A.p2, B.p1, B.p2);
      if (!ix) continue;
      // t 계산
      const tA = paramOnSegment(ix, A.p1, A.p2);
      const tB = paramOnSegment(ix, B.p1, B.p2);
      // 끝점 너무 가까우면 제외 (이미 끝나는 점)
      if (tA > 0.001 && tA < 0.999) cutMap.get(A.id).push(tA);
      if (tB > 0.001 && tB < 0.999) cutMap.get(B.id).push(tB);
      intersectionCount++;
    }
  }

  if (intersectionCount === 0) {
    alert('교차점이 발견되지 않았습니다.');
    return;
  }

  // 각 line을 분할
  let totalSegments = 0;
  for (const L of targets) {
    const ts = cutMap.get(L.id);
    if (!ts.length) continue;
    // 정렬 + 중복 제거
    const sortedT = Array.from(new Set(ts.map(t => Math.round(t * 10000) / 10000))).sort((a,b) => a - b);
    // 분할 점들 + 양끝 추가
    const allT = [0, ...sortedT, 1];
    // 원본 line 제거
    const idx = shapes.findIndex(s => s.id === L.id);
    if (idx < 0) continue;
    shapes.splice(idx, 1);
    // 조각 추가
    const dx = L.p2.x - L.p1.x, dy = L.p2.y - L.p1.y;
    for (let k = 0; k < allT.length - 1; k++) {
      const t1 = allT[k], t2 = allT[k+1];
      if (t2 - t1 < 0.0001) continue; // 너무 작으면 스킵
      const x1n = L.p1.x + dx * t1, y1n = L.p1.y + dy * t1;
      const x2n = L.p1.x + dx * t2, y2n = L.p1.y + dy * t2;
      shapes.push({
        id: ++shapeIdSeq, type:'line',
        p1: {x: Math.round(x1n), y: Math.round(y1n)},
        p2: {x: Math.round(x2n), y: Math.round(y2n)},
        stroke: L.stroke || '#fff',
        strokeWidth: L.strokeWidth || 1,
        layer: L.layer
      });
      totalSegments++;
    }
  }

  selectedIds.clear();
  redoStack = []; pushHistory();
  redrawDraw();
  updateCount();
  updateSelStat();
  document.getElementById('statusHint').textContent = `⊞ 교차점 ${intersectionCount}개에서 ${totalSegments}개 조각으로 분할됨`;
  try { cmdLog(`  ✓ ${targets.length}개 선 → 교차점 ${intersectionCount}개에서 ${totalSegments}개 조각으로 분할`, 'system'); } catch(e) {}
}

// 선분-선분 교차점 (양쪽 모두 0~1 범위 내일 때만)
function segmentSegmentIntersection(p1, p2, p3, p4) {
  const x1=p1.x, y1=p1.y, x2=p2.x, y2=p2.y;
  const x3=p3.x, y3=p3.y, x4=p4.x, y4=p4.y;
  const denom = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / denom;
  const u = -((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3)) / denom;
  if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) return null;
  return {x: x1 + t*(x2-x1), y: y1 + t*(y2-y1)};
}

function paramOnSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx*dx + dy*dy;
  if (len2 < 1e-9) return 0;
  return ((p.x-a.x)*dx + (p.y-a.y)*dy) / len2;
}

function handleOffsetClick(p) {
  if (!offsetState) {
    const target = findShapeAtPoint(p, 15);
    if (!target) {
      document.getElementById('statusHint').textContent = '∥ 오프셋할 원본 도형을 클릭하세요.';
      return;
    }
    if (target.type !== 'line' && target.type !== 'circle' && target.type !== 'rect' && target.type !== 'arc') {
      alert('오프셋은 선/사각형/원/호만 지원합니다.');
      return;
    }
    offsetState = { source: target };
    document.getElementById('statusHint').textContent = '∥ 오프셋할 방향(side)을 클릭하세요.';
    redrawDraw();
    drawCtx.save();
    drawCtx.strokeStyle = '#16a085'; drawCtx.lineWidth = 3; drawCtx.setLineDash([5,3]);
    drawCtx.beginPath();
    if (target.type === 'line') {
      drawCtx.moveTo(target.p1.x, target.p1.y);
      drawCtx.lineTo(target.p2.x, target.p2.y);
    } else if (target.type === 'rect') {
      const x1 = Math.min(target.p1.x, target.p2.x), x2 = Math.max(target.p1.x, target.p2.x);
      const y1 = Math.min(target.p1.y, target.p2.y), y2 = Math.max(target.p1.y, target.p2.y);
      drawCtx.rect(x1, y1, x2-x1, y2-y1);
    } else if (target.type === 'circle') {
      const r = Math.hypot(target.p2.x-target.p1.x, target.p2.y-target.p1.y);
      drawCtx.arc(target.p1.x, target.p1.y, r, 0, Math.PI*2);
    } else if (target.type === 'arc') {
      drawCtx.arc(target.cx, target.cy, target.r, target.startAngle, target.endAngle, target.ccw);
    }
    drawCtx.stroke();
    drawCtx.restore();
    return;
  }
  
  // 두 번째 클릭: 거리 입력
  const distStr = prompt('오프셋 거리(mm)를 입력하세요:\n(양수: 클릭한 방향으로)', '10');
  if (!distStr) { offsetState = null; redrawDraw(); return; }
  const distMm = parseFloat(distStr);
  if (isNaN(distMm) || distMm <= 0) { alert('잘못된 거리.'); offsetState = null; redrawDraw(); return; }
  const dist = distMm / mmPerPixel;
  
  const src = offsetState.source;
  const newShape = createOffsetShape(src, p, dist);
  if (newShape) {
    shapes.push(newShape);
    redoStack = []; pushHistory();
    redrawDraw();
    updateCount();
    document.getElementById('statusHint').textContent = `∥ 오프셋 ${distMm}mm 완료`;
  }
  offsetState = null;
}

function createOffsetShape(src, clickPt, dist) {
  const id = ++shapeIdSeq;
  const stroke = src.stroke, strokeWidth = src.strokeWidth;
  
  if (src.type === 'line') {
    // 선의 법선 방향 두 개 중 클릭점에 가까운 쪽
    const dx = src.p2.x - src.p1.x, dy = src.p2.y - src.p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    const nx = -dy / len, ny = dx / len;  // 좌측 법선
    // 클릭점이 어느 쪽인지
    const midX = (src.p1.x + src.p2.x)/2, midY = (src.p1.y + src.p2.y)/2;
    const sgn = ((clickPt.x - midX)*nx + (clickPt.y - midY)*ny) > 0 ? 1 : -1;
    return {
      id, type: 'line',
      p1: { x: Math.round(src.p1.x + nx*dist*sgn), y: Math.round(src.p1.y + ny*dist*sgn) },
      p2: { x: Math.round(src.p2.x + nx*dist*sgn), y: Math.round(src.p2.y + ny*dist*sgn) },
      stroke, strokeWidth
    };
  } else if (src.type === 'rect') {
    // 클릭이 사각형 외부면 키우고, 내부면 줄임
    const x1 = Math.min(src.p1.x, src.p2.x), x2 = Math.max(src.p1.x, src.p2.x);
    const y1 = Math.min(src.p1.y, src.p2.y), y2 = Math.max(src.p1.y, src.p2.y);
    const isInside = clickPt.x > x1 && clickPt.x < x2 && clickPt.y > y1 && clickPt.y < y2;
    const sgn = isInside ? -1 : 1;
    return {
      id, type: 'rect',
      p1: { x: Math.round(x1 - dist*sgn), y: Math.round(y1 - dist*sgn) },
      p2: { x: Math.round(x2 + dist*sgn), y: Math.round(y2 + dist*sgn) },
      stroke, strokeWidth
    };
  } else if (src.type === 'circle') {
    const r = Math.hypot(src.p2.x-src.p1.x, src.p2.y-src.p1.y);
    const dC = Math.hypot(clickPt.x-src.p1.x, clickPt.y-src.p1.y);
    const isInside = dC < r;
    const newR = isInside ? r - dist : r + dist;
    if (newR <= 0) { alert('오프셋 거리가 너무 큽니다.'); return null; }
    return {
      id, type: 'circle',
      p1: { x: src.p1.x, y: src.p1.y },
      p2: { x: Math.round(src.p1.x + newR), y: src.p1.y },
      stroke, strokeWidth
    };
  } else if (src.type === 'arc') {
    const dC = Math.hypot(clickPt.x-src.cx, clickPt.y-src.cy);
    const isInside = dC < src.r;
    const newR = isInside ? src.r - dist : src.r + dist;
    if (newR <= 0) return null;
    return {
      id, type: 'arc',
      cx: src.cx, cy: src.cy, r: newR,
      startAngle: src.startAngle, endAngle: src.endAngle, ccw: src.ccw,
      p1: { x: Math.round(src.cx + newR*Math.cos(src.startAngle)), y: Math.round(src.cy + newR*Math.sin(src.startAngle)) },
      p2: { x: Math.round(src.cx + newR*Math.cos(src.endAngle)), y: Math.round(src.cy + newR*Math.sin(src.endAngle)) },
      stroke, strokeWidth
    };
  }
  return null;
}

// ====== D안: 치수선 (Rev.9.0) ======

function handleDimClick(p) {
  if (tool === 'dimLinear' || tool === 'dimAligned') {
    if (!dimState) {
      dimState = { step: 1, p1: {x:p.x, y:p.y} };
      document.getElementById('statusHint').textContent = '↦ 두 번째 점을 클릭하세요.';
    } else if (dimState.step === 1) {
      dimState.p2 = {x:p.x, y:p.y};
      dimState.step = 2;
      document.getElementById('statusHint').textContent = '↦ 치수선 위치(오프셋)를 클릭하세요.';
    } else {
      // 위치 결정 후 치수 생성
      addDimension({
        type: tool === 'dimLinear' ? 'dim-linear' : 'dim-aligned',
        p1: dimState.p1, p2: dimState.p2,
        offset: {x:p.x, y:p.y}
      });
      dimState = null;
    }
  } else if (tool === 'dimRadius' || tool === 'dimDiameter') {
    if (!dimState) {
      const target = findShapeAtPoint(p, 15);
      if (!target || (target.type !== 'circle' && target.type !== 'arc')) {
        document.getElementById('statusHint').textContent = '⌀ 원이나 호를 클릭하세요.';
        return;
      }
      dimState = { step: 1, target: target };
      document.getElementById('statusHint').textContent = '⌀ 라벨 위치를 클릭하세요.';
    } else {
      addDimension({
        type: tool === 'dimRadius' ? 'dim-radius' : 'dim-diameter',
        targetId: dimState.target.id,
        offset: {x:p.x, y:p.y}
      });
      dimState = null;
    }
  } else if (tool === 'dimAngle') {
    if (!dimState) {
      const target = findShapeAtPoint(p, 15);
      if (!target || target.type !== 'line') {
        alert('각도 치수는 두 직선이 필요합니다. 첫 번째 선을 클릭하세요.');
        return;
      }
      dimState = { step: 1, line1: target };
      document.getElementById('statusHint').textContent = '∠ 두 번째 선을 클릭하세요.';
    } else if (dimState.step === 1) {
      const target = findShapeAtPoint(p, 15);
      if (!target || target.type !== 'line' || target.id === dimState.line1.id) {
        alert('다른 직선을 클릭하세요.');
        return;
      }
      dimState.line2 = target;
      dimState.step = 2;
      document.getElementById('statusHint').textContent = '∠ 호 위치를 클릭하세요.';
    } else {
      addDimension({
        type: 'dim-angle',
        line1Id: dimState.line1.id, line2Id: dimState.line2.id,
        offset: {x:p.x, y:p.y}
      });
      dimState = null;
    }
  }
  redrawDraw();
}

function addDimension(dim) {
  dim.id = ++shapeIdSeq;
  dim.stroke = '#cc0000';
  dim.strokeWidth = 1;
  const fsSel = document.getElementById('dimFontSizeInput');
  dim.fontSize = fsSel ? (parseFloat(fsSel.value) || 12) : 12;
  shapes.push(dim);
  redoStack = []; pushHistory();
  redrawDraw();
  updateCount();
}

// 치수 그리기 (drawShape에서 호출)
function drawDimension(ctx, d, selected) {
  ctx.save();
  ctx.strokeStyle = selected ? '#3498db' : d.stroke;
  ctx.fillStyle = selected ? '#3498db' : d.stroke;
  ctx.lineWidth = d.strokeWidth || 1;
  const _fs = (d.fontSize || 12) / (zoom || 1);
  ctx.font = `${_fs}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  if (d.type === 'dim-linear') {
    drawLinearDim(ctx, d.p1, d.p2, d.offset, 'horizontal-or-vertical', selected);
  } else if (d.type === 'dim-aligned') {
    drawAlignedDim(ctx, d.p1, d.p2, d.offset, selected);
  } else if (d.type === 'dim-radius') {
    const tg = shapes.find(s => s.id === d.targetId);
    if (tg) drawRadiusDim(ctx, tg, d.offset, false);
  } else if (d.type === 'dim-diameter') {
    const tg = shapes.find(s => s.id === d.targetId);
    if (tg) drawRadiusDim(ctx, tg, d.offset, true);
  } else if (d.type === 'dim-angle') {
    const l1 = shapes.find(s => s.id === d.line1Id);
    const l2 = shapes.find(s => s.id === d.line2Id);
    if (l1 && l2) drawAngleDim(ctx, l1, l2, d.offset);
  }
  
  ctx.restore();
}

function drawArrow(ctx, from, to, size) {
  const ang = Math.atan2(to.y-from.y, to.x-from.x);
  ctx.save();
  ctx.translate(to.x, to.y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size/3);
  ctx.lineTo(-size, size/3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLinearDim(ctx, p1, p2, offset, mode, selected) {
  // 수평/수직 자동 결정: 두 점의 x차/y차 중 큰 쪽 기준
  const horizontal = Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y);
  let dp1, dp2;  // 치수선 양 끝
  if (horizontal) {
    dp1 = {x: p1.x, y: offset.y};
    dp2 = {x: p2.x, y: offset.y};
  } else {
    dp1 = {x: offset.x, y: p1.y};
    dp2 = {x: offset.x, y: p2.y};
  }
  
  // 연장선 (extension line)
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y); ctx.lineTo(dp1.x, dp1.y);
  ctx.moveTo(p2.x, p2.y); ctx.lineTo(dp2.x, dp2.y);
  ctx.stroke();
  
  // 치수선 (dimension line)
  ctx.beginPath();
  ctx.moveTo(dp1.x, dp1.y); ctx.lineTo(dp2.x, dp2.y);
  ctx.stroke();
  
  // 화살표
  const arrowSize = 8;
  drawArrow(ctx, dp2, dp1, arrowSize);
  drawArrow(ctx, dp1, dp2, arrowSize);
  
  // 치수 텍스트 (캐드식: 치수선 중간 끊기)
  const dist = horizontal ? Math.abs(p2.x - p1.x) : Math.abs(p2.y - p1.y);
  const distMm = (dist * mmPerPixel).toFixed(2);
  const mx = (dp1.x + dp2.x) / 2, my = (dp1.y + dp2.y) / 2;
  const text = distMm;
  const m = ctx.measureText(text);
  const gap = m.width / 2 + 4;
  // 치수선을 텍스트 폭만큼 끊어서 다시 그리기
  const lineAng = horizontal ? 0 : Math.PI/2;
  const ux2 = Math.cos(lineAng), uy2 = Math.sin(lineAng);
  ctx.beginPath();
  ctx.moveTo(dp1.x, dp1.y); ctx.lineTo(mx - ux2*gap, my - uy2*gap);
  ctx.moveTo(mx + ux2*gap, my + uy2*gap); ctx.lineTo(dp2.x, dp2.y);
  ctx.stroke();
  ctx.fillStyle = selected ? '#3498db' : '#cc0000';
  ctx.fillText(text, mx, my);
}

function drawAlignedDim(ctx, p1, p2, offset, selected) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx/len, uy = dy/len;
  const nx = -uy, ny = ux;
  const offDist = (offset.x - p1.x)*nx + (offset.y - p1.y)*ny;
  const dp1 = {x: p1.x + nx*offDist, y: p1.y + ny*offDist};
  const dp2 = {x: p2.x + nx*offDist, y: p2.y + ny*offDist};

  // 연장선
  ctx.beginPath();
  ctx.moveTo(p1.x,p1.y); ctx.lineTo(dp1.x,dp1.y);
  ctx.moveTo(p2.x,p2.y); ctx.lineTo(dp2.x,dp2.y);
  ctx.stroke();

  drawArrow(ctx, dp2, dp1, 8);
  drawArrow(ctx, dp1, dp2, 8);

  // 텍스트
  const distMm = (len * mmPerPixel).toFixed(2);
  const mx = (dp1.x+dp2.x)/2, my = (dp1.y+dp2.y)/2;
  let textAng = Math.atan2(uy, ux);
  if (Math.abs(textAng) > Math.PI/2) textAng += Math.PI;

  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(textAng);
  const text = distMm;
  const m = ctx.measureText(text);
  const gap = m.width/2 + 4;
  const half = len/2;

  // 치수선 중간 끊기 (회전 좌표계 x축 = dp1→dp2)
  ctx.beginPath();
  ctx.moveTo(-half, 0); ctx.lineTo(-gap, 0);
  ctx.moveTo( gap,  0); ctx.lineTo( half, 0);
  ctx.stroke();

  ctx.fillStyle = selected ? '#3498db' : '#cc0000';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawRadiusDim(ctx, target, offset, isDiameter) {
  let cx, cy, r;
  if (target.type === 'circle') {
    cx = target.p1.x; cy = target.p1.y;
    r = Math.hypot(target.p2.x-target.p1.x, target.p2.y-target.p1.y);
  } else if (target.type === 'arc') {
    cx = target.cx; cy = target.cy; r = target.r;
  } else return;
  
  // offset 방향의 원 위 점 (또는 직경이면 양쪽 끝)
  const dx = offset.x - cx, dy = offset.y - cy;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  const ux = dx/len, uy = dy/len;
  const ptOnCircle = {x: cx + ux*r, y: cy + uy*r};
  
  ctx.beginPath();
  if (isDiameter) {
    const ptOpposite = {x: cx - ux*r, y: cy - uy*r};
    ctx.moveTo(ptOpposite.x, ptOpposite.y);
    ctx.lineTo(offset.x, offset.y);
  } else {
    ctx.moveTo(cx, cy);
    ctx.lineTo(offset.x, offset.y);
  }
  ctx.stroke();
  
  // 화살표 (원 위 점)
  drawArrow(ctx, {x:cx,y:cy}, ptOnCircle, 8);
  
  const valMm = (isDiameter ? r*2 : r) * mmPerPixel;
  const text = (isDiameter ? '⌀' : 'R') + valMm.toFixed(2);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillText(text, offset.x, offset.y);
}

function drawAngleDim(ctx, l1, l2, offset) {
  // 두 직선의 교점
  const ix = lineLineIntersection(l1.p1, l1.p2, l2.p1, l2.p2);
  if (!ix) return;
  
  // 각 선의 두 방향 중 offset 쪽 방향 선택
  function pickDir(line, ix, offset) {
    const dirA = {x: line.p1.x - ix.x, y: line.p1.y - ix.y};
    const dirB = {x: line.p2.x - ix.x, y: line.p2.y - ix.y};
    const lenA = Math.hypot(dirA.x, dirA.y);
    const lenB = Math.hypot(dirB.x, dirB.y);
    // offset과 각 방향의 내적
    const offX = offset.x - ix.x, offY = offset.y - ix.y;
    const dotA = lenA > 1e-6 ? (dirA.x*offX + dirA.y*offY)/lenA : -Infinity;
    const dotB = lenB > 1e-6 ? (dirB.x*offX + dirB.y*offY)/lenB : -Infinity;
    return dotA > dotB ? dirA : dirB;
  }
  const d1 = pickDir(l1, ix, offset);
  const d2 = pickDir(l2, ix, offset);
  const ang1 = Math.atan2(d1.y, d1.x);
  const ang2 = Math.atan2(d2.y, d2.x);
  
  // 호 반지름 = offset에서 교점까지 거리
  const r = Math.hypot(offset.x - ix.x, offset.y - ix.y);
  
  // 호 그리기 (ang1 ~ ang2 중 작은 각도 쪽)
  let span = ang2 - ang1;
  while (span > Math.PI) span -= Math.PI*2;
  while (span < -Math.PI) span += Math.PI*2;
  const ccw = span < 0;
  
  ctx.beginPath();
  ctx.arc(ix.x, ix.y, r, ang1, ang2, ccw);
  ctx.stroke();
  
  // 화살표 (호 양 끝)
  const arrowSize = 8;
  // ang1 끝의 접선 방향: ccw에 따라 -90° 또는 +90°
  const arrowAng1 = ang1 + (ccw ? -Math.PI/2 : Math.PI/2);
  const arrowAng2 = ang2 + (ccw ? Math.PI/2 : -Math.PI/2);
  const ap1 = {x: ix.x + r*Math.cos(ang1), y: ix.y + r*Math.sin(ang1)};
  const ap2 = {x: ix.x + r*Math.cos(ang2), y: ix.y + r*Math.sin(ang2)};
  // 화살표 머리는 호 끝에서 약간 뒤로
  drawArrow(ctx,
    {x: ap1.x - 1*Math.cos(arrowAng1), y: ap1.y - 1*Math.sin(arrowAng1)},
    ap1, arrowSize);
  drawArrow(ctx,
    {x: ap2.x - 1*Math.cos(arrowAng2), y: ap2.y - 1*Math.sin(arrowAng2)},
    ap2, arrowSize);
  
  // 각도 텍스트
  const degAbs = Math.abs(span * 180 / Math.PI);
  const text = degAbs.toFixed(1) + '°';
  const midAng = ang1 + span/2;
  const tx = ix.x + (r + 12) * Math.cos(midAng);
  const ty = ix.y + (r + 12) * Math.sin(midAng);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fillText(text, tx, ty);
}

// ====== 회전축 (v6.0) - Rev.10.5 Shift 직선잠금 + 거리 입력 ======
let axisDistanceOverride = null; // 사용자가 키보드로 입력한 거리 (현재 단위: calibSet이면 mm, 아니면 px)
let axisDistanceBuf = '';        // 입력 중 버퍼

function handleAxisClick(p) {
  if (!axisFirstPoint) {
    axisFirstPoint = {x: p.x, y: p.y};
    axisDistanceOverride = null;
    axisDistanceBuf = '';
    document.getElementById('statusHint').textContent = 
      `🔄 회전축 첫 점 (${p.x}, ${p.y}) → 두 번째 점 클릭 [Shift: 45°잠금, 숫자입력: 거리지정]`;
  } else {
    // Shift 직선잠금 + 거리 오버라이드 적용된 최종 좌표
    const finalP = applyAxisConstraint(axisFirstPoint, p);
    rotAxis = {
      p1: {x: axisFirstPoint.x, y: axisFirstPoint.y},
      p2: {x: Math.round(finalP.x), y: Math.round(finalP.y)}
    };
    axisFirstPoint = null;
    axisDistanceOverride = null;
    axisDistanceBuf = '';
    preCtx.clearRect(0, 0, baseW, baseH);
    redrawDraw();  // 회전축 표시 위해 다시 그림
    
    if (typeof updateAxisStatus === 'function') updateAxisStatus();
    
    const len = Math.hypot(rotAxis.p2.x-rotAxis.p1.x, rotAxis.p2.y-rotAxis.p1.y);
    const lenMm = (len * mmPerPixel).toFixed(2);
    // 3D 탭이 활성화된 상태면 alert 안띄움 (이미 화면에서 보임)
    // Rev.10.10: tab3d 요소가 없는 환경(현재 메뉴바 구조) 안전 처리
    const tab3dEl = document.getElementById('tab3d');
    const isOn3DTab = tab3dEl ? tab3dEl.classList.contains('active') : false;
    if (!isOn3DTab) {
      alert(`✓ 회전축 설정됨 (${lenMm}mm)\n[3D 회전체] 탭의 [🧊 3D 생성] 버튼으로 회전체를 만드세요.`);
    }
  }
}

// 회전축 제약: Shift = 45° 단위 잠금, axisDistanceOverride = 거리 강제
function applyAxisConstraint(p1, p2) {
  let dx = p2.x - p1.x;
  let dy = p2.y - p1.y;
  let len = Math.hypot(dx, dy);
  if (len < 0.0001) return {x: p2.x, y: p2.y};
  let ux = dx / len, uy = dy / len;

  // Shift: 45° 단위 각도 잠금 (수평/수직/대각선 8방향)
  if (shiftDown) {
    let ang = Math.atan2(dy, dx);
    const step = Math.PI / 4; // 45도
    ang = Math.round(ang / step) * step;
    ux = Math.cos(ang);
    uy = Math.sin(ang);
  }

  // 거리 오버라이드: 사용자가 입력한 mm/px를 강제 적용
  if (axisDistanceOverride !== null && axisDistanceOverride > 0) {
    const pxLen = calibSet
      ? (axisDistanceOverride / mmPerPixel)  // mm → px
      : axisDistanceOverride;                 // px
    len = pxLen;
  }

  return { x: p1.x + ux * len, y: p1.y + uy * len };
}

function drawAxisPreview(p1, p2) {
  preCtx.clearRect(0, 0, baseW, baseH);
  preCtx.save();
  preCtx.strokeStyle = '#8e44ad';
  preCtx.lineWidth = 2;
  preCtx.setLineDash([10, 5, 2, 5]);  // 1점 쇄선 (중심선)
  preCtx.beginPath();
  preCtx.moveTo(p1.x, p1.y);
  preCtx.lineTo(p2.x, p2.y);
  preCtx.stroke();
  preCtx.setLineDash([]);
  // 양 끝
  preCtx.fillStyle = '#8e44ad';
  preCtx.beginPath(); preCtx.arc(p1.x, p1.y, 5, 0, Math.PI*2); preCtx.fill();
  preCtx.beginPath(); preCtx.arc(p2.x, p2.y, 5, 0, Math.PI*2); preCtx.fill();

  // 캔버스 라벨: 길이 + 각도 + Shift/거리 잠금 표시
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const lenPx = Math.hypot(dx, dy);
  const lenMm = (lenPx * mmPerPixel).toFixed(2);
  const angDeg = (Math.atan2(-dy, dx) * 180 / Math.PI).toFixed(1);
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  // 라벨 배경
  const labelLines = [
    `${calibSet ? lenMm + 'mm' : lenPx.toFixed(0) + 'px'}  ∠${angDeg}°`
  ];
  if (shiftDown) labelLines.push('🔒 Shift 45° 잠금');
  if (axisDistanceOverride !== null) labelLines.push(`🔒 거리 ${axisDistanceOverride}${calibSet ? 'mm' : 'px'}`);
  preCtx.font = 'bold 11px sans-serif';
  const maxW = Math.max(...labelLines.map(s => preCtx.measureText(s).width));
  const pad = 4, lh = 14;
  const bx = mid.x + 12, by = mid.y - (labelLines.length * lh) / 2 - pad;
  preCtx.fillStyle = 'rgba(142, 68, 173, 0.92)';
  preCtx.fillRect(bx, by, maxW + pad * 2, labelLines.length * lh + pad * 2);
  preCtx.fillStyle = '#fff';
  labelLines.forEach((s, i) => {
    preCtx.fillText(s, bx + pad, by + pad + (i + 1) * lh - 3);
  });

  preCtx.restore();
  drawSnapIndicator();
}

// 영구 회전축 그리기 (도형들과 함께)
function drawRotationAxis(ctx) {
  if (!rotAxis) return;
  ctx.save();
  ctx.strokeStyle = '#8e44ad';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([10, 5, 2, 5]);
  // 축을 양쪽으로 살짝 연장
  const dx = rotAxis.p2.x - rotAxis.p1.x;
  const dy = rotAxis.p2.y - rotAxis.p1.y;
  const len = Math.hypot(dx, dy);
  const ux = dx/len, uy = dy/len;
  const ext = 30;
  ctx.beginPath();
  ctx.moveTo(rotAxis.p1.x - ux*ext, rotAxis.p1.y - uy*ext);
  ctx.lineTo(rotAxis.p2.x + ux*ext, rotAxis.p2.y + uy*ext);
  ctx.stroke();
  ctx.setLineDash([]);
  // 끝 마커
  ctx.fillStyle = '#8e44ad';
  ctx.beginPath(); ctx.arc(rotAxis.p1.x, rotAxis.p1.y, 4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(rotAxis.p2.x, rotAxis.p2.y, 4, 0, Math.PI*2); ctx.fill();
  // 라벨
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText('회전축', rotAxis.p1.x + 8, rotAxis.p1.y - 8);
  ctx.restore();
}

// ====== 3D 메쉬 생성 (회전체) ======
// 점을 회전축에 대한 (axial, radial) 좌표로 변환
// axial: 축을 따른 거리 (높이 Y), radial: 축까지의 수직 거리 (반지름)
function pointToAxialRadial(p) {
  if (!rotAxis) return null;
  const ax = rotAxis.p1.x, ay = rotAxis.p1.y;
  const bx = rotAxis.p2.x, by = rotAxis.p2.y;
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  const ux = dx/len, uy = dy/len;  // 축 방향 단위벡터
  
  const vx = p.x - ax, vy = p.y - ay;
  const axial = vx*ux + vy*uy;          // 축 상의 투영 거리 (mm)
  // 수직 거리 (부호 포함)
  const perp = vx*(-uy) + vy*ux;        // 축의 왼쪽=음수, 오른쪽=양수
  
  return {axial, radial: perp};
}

// 도형들을 (axial, radial) 점들의 윤곽선으로 변환
function shapesToProfile(targetMode, sampleStep) {
  if (!rotAxis) return [];
  
  let targetShapes = [];
  if (targetMode === 'selected') {
    targetShapes = shapes.filter(s => selectedIds.has(s.id));
    if (targetShapes.length === 0) targetShapes = shapes;  // 선택 없으면 전체
  } else {
    targetShapes = shapes;
  }
  
  // 1) 각 도형을 (axial, radial) 점 목록으로 샘플링
  const segments = [];  // [{points:[{axial, radial}...]}]
  
  targetShapes.forEach(s => {
    const pts = [];
    if (s.type === 'line') {
      pts.push(pointToAxialRadial(s.p1));
      // 길이가 길면 샘플링
      const len = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y) * mmPerPixel;
      const steps = Math.max(1, Math.ceil(len / sampleStep));
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        pts.push(pointToAxialRadial({
          x: s.p1.x + (s.p2.x-s.p1.x)*t,
          y: s.p1.y + (s.p2.y-s.p1.y)*t
        }));
      }
      pts.push(pointToAxialRadial(s.p2));
    } else if (s.type === 'rect') {
      // 사각형 4변
      const x1 = Math.min(s.p1.x, s.p2.x), x2 = Math.max(s.p1.x, s.p2.x);
      const y1 = Math.min(s.p1.y, s.p2.y), y2 = Math.max(s.p1.y, s.p2.y);
      const corners = [{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2},{x:x1,y:y1}];
      for (let i = 0; i < corners.length-1; i++) {
        const len = Math.hypot(corners[i+1].x-corners[i].x, corners[i+1].y-corners[i].y) * mmPerPixel;
        const steps = Math.max(1, Math.ceil(len / sampleStep));
        for (let j = 0; j <= steps; j++) {
          const t = j / steps;
          pts.push(pointToAxialRadial({
            x: corners[i].x + (corners[i+1].x-corners[i].x)*t,
            y: corners[i].y + (corners[i+1].y-corners[i].y)*t
          }));
        }
      }
    } else if (s.type === 'circle') {
      const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
      const circ = 2 * Math.PI * r * mmPerPixel;
      const steps = Math.max(8, Math.ceil(circ / sampleStep));
      for (let i = 0; i <= steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        pts.push(pointToAxialRadial({
          x: s.p1.x + r*Math.cos(ang),
          y: s.p1.y + r*Math.sin(ang)
        }));
      }
    } else if (s.type === 'arc') {
      let sa = s.startAngle, ea = s.endAngle;
      let diff = ea - sa;
      if (s.ccw) {
        while (diff > 0) diff -= Math.PI*2;
        while (diff < -Math.PI*2) diff += Math.PI*2;
      } else {
        while (diff < 0) diff += Math.PI*2;
        while (diff > Math.PI*2) diff -= Math.PI*2;
      }
      const arcLen = Math.abs(diff) * s.r * mmPerPixel;
      const steps = Math.max(4, Math.ceil(arcLen / sampleStep));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const ang = sa + diff * t;
        pts.push(pointToAxialRadial({
          x: s.cx + s.r*Math.cos(ang),
          y: s.cy + s.r*Math.sin(ang)
        }));
      }
    } else if (s.type === 'ellipse') {
      const circ = Math.PI * (s.rx + s.ry) * mmPerPixel;  // 근사 둘레
      const steps = Math.max(8, Math.ceil(circ / sampleStep));
      const cosA = Math.cos(s.angle||0), sinA = Math.sin(s.angle||0);
      for (let i = 0; i <= steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        const ex = s.rx * Math.cos(ang), ey = s.ry * Math.sin(ang);
        pts.push(pointToAxialRadial({
          x: s.cx + ex*cosA - ey*sinA,
          y: s.cy + ex*sinA + ey*cosA
        }));
      }
    }
    if (pts.length > 0) segments.push({points: pts});
  });
  
  // 2) 세그먼트들을 끝점 기준으로 연결 (그리디 알고리즘)
  if (segments.length === 0) return [];
  
  const profile = [];
  const used = new Array(segments.length).fill(false);
  
  // 시작: 첫 세그먼트
  let current = segments[0].points.slice();
  used[0] = true;
  
  for (let iter = 0; iter < segments.length; iter++) {
    if (current.length === 0) break;
    const tail = current[current.length-1];
    
    let bestIdx = -1, bestDist = Infinity, bestReverse = false;
    for (let i = 0; i < segments.length; i++) {
      if (used[i]) continue;
      const head = segments[i].points[0];
      const end = segments[i].points[segments[i].points.length-1];
      const dH = Math.hypot(tail.axial-head.axial, tail.radial-head.radial);
      const dE = Math.hypot(tail.axial-end.axial, tail.radial-end.radial);
      if (dH < bestDist) { bestDist = dH; bestIdx = i; bestReverse = false; }
      if (dE < bestDist) { bestDist = dE; bestIdx = i; bestReverse = true; }
    }
    
    if (bestIdx === -1) break;
    if (bestDist > 50) break;  // 연결 불가
    
    const next = bestReverse ? segments[bestIdx].points.slice().reverse() : segments[bestIdx].points;
    // 시작점이 tail과 같으면 중복 제거
    if (Math.hypot(tail.axial-next[0].axial, tail.radial-next[0].radial) < 0.01) {
      current = current.concat(next.slice(1));
    } else {
      current = current.concat(next);
    }
    used[bestIdx] = true;
  }
  
  // 3) oneSide 모드: radial 부호 통일 (음수면 모두 절대값)
  // 회전체는 반드시 한쪽 단면(radial > 0)이어야 함
  // 평균 radial 부호로 결정
  let sumPos = 0, sumNeg = 0;
  current.forEach(p => { if (p.radial > 0) sumPos++; else if (p.radial < 0) sumNeg++; });
  const flip = sumNeg > sumPos;
  current.forEach(p => { p.radial = Math.abs(p.radial); if(flip){} });
  
  // 4) axial 기준으로 정렬 안 함 (사용자가 그린 순서 유지가 자연스러움)
  
  return current.map(p => ({axial: p.axial * mmPerPixel, radial: p.radial * mmPerPixel}));
}

// 윤곽선을 회전시켜 메쉬 생성
function generateRevolutionMesh(profile, segments, angleDeg, closedCaps) {
  // profile: [{axial, radial}] (mm 단위)
  // segments: 회전 분할 수
  // angleDeg: 회전 각도 (도)
  const vertices = [];   // [x, y, z]
  const triangles = [];  // [i1, i2, i3]
  
  const angleRad = angleDeg * Math.PI / 180;
  const numRings = segments;  // 회전 분할
  
  // 정점 생성: 각 윤곽선 점을 각 회전 각도로 배치
  // X축 = axial (회전축 방향, 메쉬의 Y로 매핑)
  // 회전 평면: YZ
  for (let i = 0; i <= numRings; i++) {
    const t = i / numRings;
    const ang = angleRad * t;
    const cosA = Math.cos(ang), sinA = Math.sin(ang);
    
    profile.forEach(pt => {
      // 3D 좌표: X = radial*cos, Y = axial, Z = radial*sin
      const x = pt.radial * cosA;
      const y = pt.axial;
      const z = pt.radial * sinA;
      vertices.push([x, y, z]);
    });
  }
  
  const pn = profile.length;
  
  // 측면 삼각형 (각 ring 사이)
  for (let i = 0; i < numRings; i++) {
    for (let j = 0; j < pn - 1; j++) {
      const a = i * pn + j;
      const b = i * pn + (j+1);
      const c = (i+1) * pn + j;
      const d = (i+1) * pn + (j+1);
      // 사각형 → 2 삼각형 (반시계방향, 외부 노멀)
      triangles.push([a, c, b]);
      triangles.push([b, c, d]);
    }
  }
  
  // 캡 (윤곽선이 회전축에서 시작/끝나지 않으면 닫지 않음)
  if (closedCaps && profile.length >= 2) {
    // 시작 캡 (회전 시작점)
    // 평균 axial을 가진 점을 중심으로 한 부채꼴들
    // 단순히: 첫 ring과 끝 ring의 점들로 폐쇄
    // 여기서는 윤곽선 양 끝이 축에 가까운지 확인
    const first = profile[0];
    const last = profile[profile.length-1];
    
    if (first.radial > 0.1) {
      // 시작점이 축에서 떨어져 있음 → 캡 필요
      // 시작 ring 점들로 부채꼴 (윤곽선 첫 점 기준)
      // 단순 접근: 회전축 상의 점(0, first.axial, 0)을 추가하고 팬으로 닫음
      // 이렇게 하면 깔끔하지 않음. 더 간단하게 첫 ring + 끝 ring을 다각형으로 닫는 방식 생략
    }
    
    // 양 끝 ring을 연결 (회전 각도가 360 미만일 때)
    if (angleDeg < 360 - 0.01) {
      // 시작 ring (i=0)과 끝 ring (i=numRings)를 닫는 면 추가
      // 이 두 ring은 윤곽선 모양의 평면 다각형 → 삼각화 필요
      // 간단히 fan triangulation (첫 점 기준)
      for (let j = 1; j < pn - 1; j++) {
        // 시작 ring
        triangles.push([0, j, j+1]);
        // 끝 ring (반대 방향)
        const offset = numRings * pn;
        triangles.push([offset, offset + j+1, offset + j]);
      }
    }
  }
  
  return {vertices, triangles};
}

// STL ASCII 내보내기
function meshToSTL_ASCII(mesh, name) {
  let stl = `solid ${name}\n`;
  mesh.triangles.forEach(t => {
    const v1 = mesh.vertices[t[0]], v2 = mesh.vertices[t[1]], v3 = mesh.vertices[t[2]];
    // 노멀 계산
    const ux = v2[0]-v1[0], uy = v2[1]-v1[1], uz = v2[2]-v1[2];
    const vx = v3[0]-v1[0], vy = v3[1]-v1[1], vz = v3[2]-v1[2];
    let nx = uy*vz - uz*vy;
    let ny = uz*vx - ux*vz;
    let nz = ux*vy - uy*vx;
    const nlen = Math.hypot(nx,ny,nz);
    if (nlen > 1e-10) { nx/=nlen; ny/=nlen; nz/=nlen; }
    stl += `  facet normal ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}\n`;
    stl += `    outer loop\n`;
    stl += `      vertex ${v1[0].toFixed(4)} ${v1[1].toFixed(4)} ${v1[2].toFixed(4)}\n`;
    stl += `      vertex ${v2[0].toFixed(4)} ${v2[1].toFixed(4)} ${v2[2].toFixed(4)}\n`;
    stl += `      vertex ${v3[0].toFixed(4)} ${v3[1].toFixed(4)} ${v3[2].toFixed(4)}\n`;
    stl += `    endloop\n`;
    stl += `  endfacet\n`;
  });
  stl += `endsolid ${name}\n`;
  return stl;
}

// STL Binary 내보내기
function meshToSTL_Binary(mesh) {
  const numTri = mesh.triangles.length;
  const buf = new ArrayBuffer(84 + numTri * 50);
  const view = new DataView(buf);
  
  // 헤더 80바이트 (텍스트)
  const header = `Binary STL by 도면작도기 Rev.6 - ${new Date().toISOString().substring(0,19)}`;
  for (let i = 0; i < Math.min(header.length, 80); i++) {
    view.setUint8(i, header.charCodeAt(i));
  }
  // 삼각형 개수
  view.setUint32(80, numTri, true);
  
  let offset = 84;
  mesh.triangles.forEach(t => {
    const v1 = mesh.vertices[t[0]], v2 = mesh.vertices[t[1]], v3 = mesh.vertices[t[2]];
    const ux = v2[0]-v1[0], uy = v2[1]-v1[1], uz = v2[2]-v1[2];
    const vx = v3[0]-v1[0], vy = v3[1]-v1[1], vz = v3[2]-v1[2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const nlen = Math.hypot(nx,ny,nz);
    if (nlen > 1e-10) { nx/=nlen; ny/=nlen; nz/=nlen; }
    view.setFloat32(offset, nx, true); offset += 4;
    view.setFloat32(offset, ny, true); offset += 4;
    view.setFloat32(offset, nz, true); offset += 4;
    [v1, v2, v3].forEach(v => {
      view.setFloat32(offset, v[0], true); offset += 4;
      view.setFloat32(offset, v[1], true); offset += 4;
      view.setFloat32(offset, v[2], true); offset += 4;
    });
    view.setUint16(offset, 0, true); offset += 2;  // attribute byte count
  });
  return buf;
}

// OBJ 내보내기
function meshToOBJ(mesh, name) {
  let obj = `# Wavefront OBJ - ${name}\n`;
  obj += `# Generated by 도면작도기 Rev.6 - ${new Date().toISOString()}\n`;
  obj += `# vertices: ${mesh.vertices.length}, triangles: ${mesh.triangles.length}\n\n`;
  obj += `o ${name}\n`;
  mesh.vertices.forEach(v => {
    obj += `v ${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}\n`;
  });
  obj += `\n`;
  mesh.triangles.forEach(t => {
    // OBJ는 1-based 인덱스
    obj += `f ${t[0]+1} ${t[1]+1} ${t[2]+1}\n`;
  });
  return obj;
}

// PLY 내보내기 (ASCII)
function meshToPLY(mesh, name) {
  let ply = `ply\nformat ascii 1.0\n`;
  ply += `comment Generated by 도면작도기 Rev.6\n`;
  ply += `element vertex ${mesh.vertices.length}\n`;
  ply += `property float x\nproperty float y\nproperty float z\n`;
  ply += `element face ${mesh.triangles.length}\n`;
  ply += `property list uchar int vertex_indices\n`;
  ply += `end_header\n`;
  mesh.vertices.forEach(v => {
    ply += `${v[0].toFixed(4)} ${v[1].toFixed(4)} ${v[2].toFixed(4)}\n`;
  });
  mesh.triangles.forEach(t => {
    ply += `3 ${t[0]} ${t[1]} ${t[2]}\n`;
  });
  return ply;
}

// 3D 생성 핸들러
document.getElementById('btnGen3D').addEventListener('click', () => {
  if (!rotAxis) {
    alert('먼저 [🔄 회전축] 도구로 회전축을 설정하세요.\n축의 양 끝을 클릭하면 됩니다.');
    return;
  }
  if (shapes.length === 0) {
    alert('회전시킬 도형(윤곽선)이 없습니다.');
    return;
  }
  updateGen3DPreview();
  document.getElementById('gen3DModal').classList.add('show');
});

function updateGen3DPreview() {
  const seg = parseInt(document.getElementById('genSegments').value) || 64;
  const ang = parseFloat(document.getElementById('genAngle').value) || 360;
  const target = document.getElementById('genTarget').value;
  const step = parseFloat(document.getElementById('genSampleStep').value) || 0.5;
  const closed = document.getElementById('genClosed').checked;
  
  const profile = shapesToProfile(target, step);
  if (profile.length === 0) {
    document.getElementById('genPreviewInfo').innerHTML = '<span style="color:#e74c3c;">⚠ 윤곽선을 추출할 수 없습니다.</span>';
    return;
  }
  
  const numTri = seg * (profile.length-1) * 2 + (closed && ang < 360 ? (profile.length-2)*2 : 0);
  const sizeKB = (numTri * 50 / 1024).toFixed(1);
  
  document.getElementById('genPreviewInfo').innerHTML = 
    `윤곽선 점: ${profile.length}개<br>` +
    `삼각형 수: 약 ${numTri.toLocaleString()}개<br>` +
    `STL Binary 예상: ${sizeKB} KB`;
}

['genSegments','genAngle','genTarget','genSampleStep','genClosed'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateGen3DPreview);
  document.getElementById(id).addEventListener('change', updateGen3DPreview);
});

document.getElementById('btnGen3DCancel').addEventListener('click', () => {
  document.getElementById('gen3DModal').classList.remove('show');
});

document.getElementById('btnGen3DPreview').addEventListener('click', () => {
  const mesh = buildMeshFromUI();
  if (!mesh) return;
  lastGeneratedMesh = mesh;
  if (typeof updateLastMeshInfo === 'function') updateLastMeshInfo();
  document.getElementById('gen3DModal').classList.remove('show');
  show3DPreview(mesh);
});

document.getElementById('btnGen3DSave').addEventListener('click', () => {
  const mesh = buildMeshFromUI();
  if (!mesh) return;
  lastGeneratedMesh = mesh;
  if (typeof updateLastMeshInfo === 'function') updateLastMeshInfo();
  saveMesh3D(mesh);
  document.getElementById('gen3DModal').classList.remove('show');
});

function buildMeshFromUI() {
  const seg = parseInt(document.getElementById('genSegments').value) || 64;
  const ang = parseFloat(document.getElementById('genAngle').value) || 360;
  const target = document.getElementById('genTarget').value;
  const step = parseFloat(document.getElementById('genSampleStep').value) || 0.5;
  const closed = document.getElementById('genClosed').checked;
  
  const profile = shapesToProfile(target, step);
  if (profile.length < 2) {
    alert('윤곽선이 너무 짧습니다. 도형을 더 그리거나 회전축 위치를 확인하세요.');
    return null;
  }
  
  return generateRevolutionMesh(profile, seg, ang, closed);
}

function saveMesh3D(mesh) {
  const fmt = document.getElementById('gen3DFormat').value;
  const stlBin = document.getElementById('genStlBinary').value === 'binary';
  const name = (document.getElementById('saveName')?.value || '회전체').trim();
  let finalName = name;
  if (calibSet) finalName = `${name}_${mesh.vertices.length}v`;
  
  let blob, ext;
  if (fmt === 'stl') {
    if (stlBin) {
      const buf = meshToSTL_Binary(mesh);
      blob = new Blob([buf], {type: 'application/octet-stream'});
    } else {
      const txt = meshToSTL_ASCII(mesh, name);
      blob = new Blob([txt], {type: 'text/plain'});
    }
    ext = 'stl';
  } else if (fmt === 'obj') {
    const txt = meshToOBJ(mesh, name);
    blob = new Blob([txt], {type: 'text/plain'});
    ext = 'obj';
  } else if (fmt === 'ply') {
    const txt = meshToPLY(mesh, name);
    blob = new Blob([txt], {type: 'text/plain'});
    ext = 'ply';
  }
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = finalName + '.' + ext; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  
  alert(`✓ 3D 파일 저장 완료\n\n파일: ${finalName}.${ext}\n정점: ${mesh.vertices.length}개\n삼각형: ${mesh.triangles.length}개\n\n3D 프린터 슬라이서(Cura, PrusaSlicer)에서 바로 열 수 있습니다.`);
}

// ====== 3D 미리보기 (간단한 직접 렌더링) ======
let prev3D = {
  rotX: 0.3, rotY: 0.5, distance: 0, mesh: null,
  dragging: false, lastX: 0, lastY: 0
};

function show3DPreview(mesh) {
  prev3D.mesh = mesh;
  // 바운딩 박스로 거리 계산
  let mn = [Infinity,Infinity,Infinity], mx = [-Infinity,-Infinity,-Infinity];
  mesh.vertices.forEach(v => {
    for (let i = 0; i < 3; i++) {
      if (v[i] < mn[i]) mn[i] = v[i];
      if (v[i] > mx[i]) mx[i] = v[i];
    }
  });
  const sz = Math.max(mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2]);
  prev3D.distance = sz * 2.5;
  prev3D.center = [(mn[0]+mx[0])/2, (mn[1]+mx[1])/2, (mn[2]+mx[2])/2];
  
  document.getElementById('preview3DInfo').innerHTML = 
    `정점 ${mesh.vertices.length} | 삼각형 ${mesh.triangles.length}<br>` +
    `크기: ${(mx[0]-mn[0]).toFixed(1)} × ${(mx[1]-mn[1]).toFixed(1)} × ${(mx[2]-mn[2]).toFixed(1)} mm`;
  
  document.getElementById('preview3DModal').classList.add('show');
  setTimeout(() => {
    const canvas = document.getElementById('preview3DCanvas');
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    render3D();
  }, 50);
}

function render3D() {
  const canvas = document.getElementById('preview3DCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, w, h);
  
  if (!prev3D.mesh) return;
  
  const cx = prev3D.center;
  const rx = prev3D.rotX, ry = prev3D.rotY;
  const cosX = Math.cos(rx), sinX = Math.sin(rx);
  const cosY = Math.cos(ry), sinY = Math.sin(ry);
  const dist = prev3D.distance;
  const focal = h * 0.8;
  
  // 모든 정점 변환
  const projected = prev3D.mesh.vertices.map(v => {
    // 중심 이동
    let x = v[0] - cx[0], y = v[1] - cx[1], z = v[2] - cx[2];
    // Y축 회전 (좌우)
    let x1 = x*cosY - z*sinY;
    let z1 = x*sinY + z*cosY;
    // X축 회전 (상하)
    let y2 = y*cosX - z1*sinX;
    let z2 = y*sinX + z1*cosX;
    // 원근 투영
    const zc = z2 + dist;
    if (zc <= 0.1) return null;
    return {
      x: w/2 + x1 * focal / zc,
      y: h/2 - y2 * focal / zc,
      z: zc,
      vz: z2
    };
  });
  
  // 삼각형 렌더 (Z-sort)
  const trisToDraw = [];
  prev3D.mesh.triangles.forEach(t => {
    const p1 = projected[t[0]], p2 = projected[t[1]], p3 = projected[t[2]];
    if (!p1 || !p2 || !p3) return;
    const avgZ = (p1.z + p2.z + p3.z) / 3;
    // 노멀 (백페이스 컬링)
    const ux = p2.x - p1.x, uy = p2.y - p1.y;
    const vx = p3.x - p1.x, vy = p3.y - p1.y;
    const cross = ux*vy - uy*vx;
    // 빛 강도 (간이 라이팅): 3D 노멀 사용
    const v1 = prev3D.mesh.vertices[t[0]], v2 = prev3D.mesh.vertices[t[1]], v3 = prev3D.mesh.vertices[t[2]];
    let nx = (v2[1]-v1[1])*(v3[2]-v1[2]) - (v2[2]-v1[2])*(v3[1]-v1[1]);
    let ny = (v2[2]-v1[2])*(v3[0]-v1[0]) - (v2[0]-v1[0])*(v3[2]-v1[2]);
    let nz = (v2[0]-v1[0])*(v3[1]-v1[1]) - (v2[1]-v1[1])*(v3[0]-v1[0]);
    const nlen = Math.hypot(nx,ny,nz);
    if (nlen > 1e-10) { nx/=nlen; ny/=nlen; nz/=nlen; }
    // 광원: 위에서 약간 앞 (-Y, +Z 방향)
    const light = [0.3, -0.7, 0.6];
    const llen = Math.hypot(...light); light.forEach((_,i) => light[i]/=llen);
    // 노멀도 회전 적용 (간단히)
    let lx1 = nx*cosY - nz*sinY, lz1 = nx*sinY + nz*cosY;
    let ly2 = ny*cosX - lz1*sinX, lz2 = ny*sinX + lz1*cosX;
    let intensity = -(lx1*light[0] + ly2*light[1] + lz2*light[2]);
    if (intensity < 0.1) intensity = 0.1;
    if (intensity > 1) intensity = 1;
    trisToDraw.push({p1,p2,p3,avgZ,intensity,cross});
  });
  
  trisToDraw.sort((a,b) => b.avgZ - a.avgZ);
  
  trisToDraw.forEach(tri => {
    const g = Math.round(180 * tri.intensity + 40);
    ctx.fillStyle = `rgb(${g},${Math.round(g*0.9)},${Math.round(g*0.7)})`;
    ctx.strokeStyle = `rgba(0,0,0,0.3)`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(tri.p1.x, tri.p1.y);
    ctx.lineTo(tri.p2.x, tri.p2.y);
    ctx.lineTo(tri.p3.x, tri.p3.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

// 미리보기 마우스 컨트롤
(() => {
  const canvas = document.getElementById('preview3DCanvas');
  if (!canvas) return;
  canvas.addEventListener('mousedown', e => {
    prev3D.dragging = true;
    prev3D.lastX = e.clientX; prev3D.lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!prev3D.dragging) return;
    const dx = e.clientX - prev3D.lastX;
    const dy = e.clientY - prev3D.lastY;
    prev3D.rotY += dx * 0.01;
    prev3D.rotX += dy * 0.01;
    prev3D.lastX = e.clientX; prev3D.lastY = e.clientY;
    render3D();
  });
  window.addEventListener('mouseup', () => {
    prev3D.dragging = false;
    canvas.style.cursor = 'grab';
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    prev3D.distance *= (e.deltaY > 0 ? 1.1 : 0.9);
    render3D();
  });
})();

document.getElementById('btnPrev3DClose').addEventListener('click', () => {
  document.getElementById('preview3DModal').classList.remove('show');
});
document.getElementById('btnPrev3DSave').addEventListener('click', () => {
  if (lastGeneratedMesh) saveMesh3D(lastGeneratedMesh);
  document.getElementById('preview3DModal').classList.remove('show');
});

// ====== 영역 채움 (페인트버킷) ======

// Rev.11.3: showLoading/hideLoading 누락 함수 추가
// setTimeout 콜백 내부에서 ReferenceError 발생 → silent fail 방지
function showLoading(msg) {
  let el = document.getElementById('_loadingOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = '_loadingOverlay';
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.85);color:#fff;padding:16px 24px;border-radius:8px;z-index:9999;font-size:14px;border:1px solid #4a6fa5;box-shadow:0 4px 20px rgba(0,0,0,0.5);pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = '⏳ ' + (msg || '처리 중...');
  el.style.display = 'block';
}
function hideLoading() {
  const el = document.getElementById('_loadingOverlay');
  if (el) el.style.display = 'none';
}

// Rev.10.1: BPOLY - 모든 닫힌 영역 자동 검출 후 채움
function handleBpolyCommand() {
  if (shapes.length === 0) {
    cmdLog('  BPOLY: 도형이 없습니다.', 'error');
    return;
  }
  if (typeof cv === 'undefined' || !cv.Mat) {
    cmdLog('  BPOLY: OpenCV 로딩 중. 잠시 후 다시 시도.', 'error');
    return;
  }
  
  if (!confirm('현재 화면의 모든 닫힌 영역을 자동으로 채울까요?\n현재 채움 패턴/색상이 적용됩니다.')) return;
  
  showLoading('자동 경계 검출 중...');
  setTimeout(() => {
    try {
      // 도형 외곽선만 흑백 마스크에 그림 (텍스트/치수 제외)
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = baseW; maskCanvas.height = baseH;
      const mctx = maskCanvas.getContext('2d');
      mctx.fillStyle = '#ffffff';
      mctx.fillRect(0, 0, baseW, baseH);
      mctx.strokeStyle = '#000000';
      mctx.lineWidth = 2;
      mctx.lineCap = 'round'; mctx.lineJoin = 'round';
      
      shapes.forEach(s => {
        if (s.type === 'text' || (s.type && s.type.startsWith('dim-'))) return;
        mctx.beginPath();
        if (s.type === 'line') { mctx.moveTo(s.p1.x, s.p1.y); mctx.lineTo(s.p2.x, s.p2.y); mctx.stroke(); }
        else if (s.type === 'rect') {
          const x=Math.min(s.p1.x,s.p2.x), y=Math.min(s.p1.y,s.p2.y);
          const w=Math.abs(s.p2.x-s.p1.x), h=Math.abs(s.p2.y-s.p1.y);
          mctx.strokeRect(x,y,w,h);
        } else if (s.type === 'circle') {
          const r=Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
          mctx.arc(s.p1.x, s.p1.y, r, 0, Math.PI*2); mctx.stroke();
        } else if (s.type === 'arc') {
          mctx.arc(s.cx, s.cy, s.r, s.startAngle, s.endAngle, s.ccw); mctx.stroke();
        } else if (s.type === 'ellipse') {
          const rot = s.rotation !== undefined ? s.rotation : (s.angle || 0);
          mctx.ellipse(s.cx, s.cy, s.rx, s.ry, rot, 0, Math.PI*2); mctx.stroke();
        } else if (s.type === 'polyline' && s.points && s.points.length >= 2) {
          mctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length; i++) mctx.lineTo(s.points[i].x, s.points[i].y);
          if (s.closed) mctx.closePath();
          mctx.stroke();
        }
      });
      
      const src = cv.imread(maskCanvas);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      const bin = new cv.Mat();
      cv.threshold(gray, bin, 128, 255, cv.THRESH_BINARY);
      
      // RETR_CCOMP: 외곽 + 안쪽 모두
      // 또는 RETR_LIST: 모든 윤곽선 (계층 무관)
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      // 흑백 반전 (도형 선이 흰색이 되도록)
      cv.bitwise_not(bin, bin);
      cv.findContours(bin, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
      
      const totalPixels = baseW * baseH;
      const newFills = [];
      const alpha = parseInt(document.getElementById('fillAlpha').value) / 100;
      const color = document.getElementById('fillColor').value;
      const pattern = currentHatchPattern || 'solid';
      
      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        // 너무 작거나 너무 큰 영역 (전체 화면) 제외
        if (area < 100 || area > totalPixels * 0.7) continue;
        
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 2, true);
        const pts = [];
        for (let j = 0; j < approx.rows; j++) {
          pts.push({x: approx.data32S[j*2], y: approx.data32S[j*2+1]});
        }
        approx.delete();
        if (pts.length < 3) continue;
        
        newFills.push({
          id: ++shapeIdSeq,
          type: 'fill',
          points: pts,
          color,
          alpha,
          pattern,
          layer: currentLayer || 'default'
        });
      }
      
      newFills.forEach(f => fills.push(f));
      redoStack = []; pushHistory();
      redrawFills();
      redrawDraw();
      updateCount();
      
      cmdLog(`  BPOLY: ${newFills.length}개 영역 자동 채움 완료.`, 'system');
      
      src.delete(); gray.delete(); bin.delete();
      contours.delete(); hierarchy.delete();
    } catch(e) {
      console.error(e);
      cmdLog('  BPOLY 오류: ' + e.message, 'error');
    }
    hideLoading();
  }, 50);
}

function doFillAtPoint(p) {
  // Rev.11.2: OpenCV 의존 제거 - 순수 JS floodFill로 대체

  // Rev.15.7: 외곽선 모드 + 클릭 위치에 이미 채워진 영역(fill)이 있으면
  //   선 floodFill 없이 그 fill의 경계점을 바로 외곽선 폴리라인으로 변환 (채움은 삭제)
  //   → 워크플로: ①채움으로 영역확정 ②기존 선 삭제 ③채움 클릭→외곽선
  if (fillAsOutline){
    const f = hitTestFill(p);
    if (f && Array.isArray(f.points) && f.points.length >= 3){
      const stroke = document.getElementById('lineColor') ? (document.getElementById('lineColor').value || '#000') : '#000';
      // Rev.15.9: 픽셀 계단/미세 단차 제거 - 직선 피팅 + 교점 코너
      const cleaned = fitOutlineToLines(f.points.map(pt => ({x: pt.x, y: pt.y})), 8);
      const poly = {
        id: ++shapeIdSeq, type: 'polyline',
        points: cleaned,
        closed: true,
        stroke,
        strokeWidth: parseInt(document.getElementById('strokeWidth').value) || 1,
        layer: f.layer || currentLayer || 'default'
      };
      // 원본 채움 삭제
      const fi = fills.findIndex(x => x.id === f.id);
      if (fi >= 0) fills.splice(fi, 1);
      shapes.push(poly);
      selectedIds.clear(); selectedIds.add(poly.id);
      redoStack = []; pushHistory();
      if (typeof redrawFills === 'function') redrawFills();
      redrawDraw(); updateCount();
      if (typeof updateSelStat === 'function') updateSelStat();
      document.getElementById('statusHint').textContent =
        `🖊 채움 → 외곽선 변환 완료: 점 ${poly.points.length}개 폴리라인 (채움 삭제). 계속 클릭=다중, Esc=종료`;
      return;
    }
    // 채움이 없으면 아래로 진행: 선을 경계로 floodFill해서 외곽선 생성 (기존 방식)
  }

  if (shapes.length === 0) {
    cmdLog('  🎨 채움 실패: 도형이 없습니다. 먼저 도형을 그려주세요.', 'error');
    return;
  }

  // 경계로 사용 가능한 도형만 카운트 (텍스트/치수 제외)
  const boundaryShapes = shapes.filter(s =>
    s.type !== 'text' && !(s.type && s.type.startsWith('dim-'))
  );
  if (boundaryShapes.length === 0) {
    cmdLog('  🎨 채움 실패: 경계가 될 도형이 없습니다 (텍스트/치수만 있음).', 'error');
    return;
  }

  cmdLog(`  🎨 채움 시작: 클릭 (${Math.round(p.x)}, ${Math.round(p.y)}), 경계 ${boundaryShapes.length}개`, 'prompt');

  showLoading('영역 채움 계산 중...');
  setTimeout(() => {
    try {
      // 1) 도형 외곽선만 그린 임시 캔버스 (흰 배경, 검은 선)
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = baseW; maskCanvas.height = baseH;
      const mctx = maskCanvas.getContext('2d');
      mctx.fillStyle = '#ffffff';
      mctx.fillRect(0, 0, baseW, baseH);
      mctx.strokeStyle = '#000000';
      mctx.fillStyle = '#000000';
      mctx.lineWidth = 2;
      mctx.lineCap = 'round'; mctx.lineJoin = 'round';

      shapes.forEach(s => {
        if (s.type === 'text' || (s.type && s.type.startsWith('dim-'))) return;
        mctx.beginPath();
        if (s.type === 'line') {
          mctx.moveTo(s.p1.x, s.p1.y); mctx.lineTo(s.p2.x, s.p2.y); mctx.stroke();
        } else if (s.type === 'rect') {
          const x=Math.min(s.p1.x,s.p2.x), y=Math.min(s.p1.y,s.p2.y);
          const w=Math.abs(s.p2.x-s.p1.x), h=Math.abs(s.p2.y-s.p1.y);
          mctx.strokeRect(x,y,w,h);
        } else if (s.type === 'circle') {
          const r=Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
          mctx.arc(s.p1.x, s.p1.y, r, 0, Math.PI*2); mctx.stroke();
        } else if (s.type === 'arc') {
          mctx.arc(s.cx, s.cy, s.r, s.startAngle, s.endAngle, s.ccw); mctx.stroke();
        } else if (s.type === 'ellipse') {
          const rot = s.rotation !== undefined ? s.rotation : (s.angle || 0);
          mctx.ellipse(s.cx, s.cy, s.rx, s.ry, rot, 0, Math.PI*2); mctx.stroke();
        } else if (s.type === 'polyline') {
          if (!s.points || s.points.length < 2) return;
          mctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length; i++) {
            mctx.lineTo(s.points[i].x, s.points[i].y);
          }
          if (s.closed) mctx.closePath();
          mctx.stroke();
        }
      });

      // 2) ImageData 읽어서 순수 JS floodFill
      const imgData = mctx.getImageData(0, 0, baseW, baseH);
      const data = imgData.data; // RGBA Uint8ClampedArray
      const W = baseW, H = baseH;

      // 픽셀이 흰색(빈 영역)인지 검사 - R/G/B 모두 200 이상
      function isEmpty(idx) {
        return data[idx] > 200 && data[idx+1] > 200 && data[idx+2] > 200;
      }
      function pixelIdx(x, y) { return (y * W + x) * 4; }

      // 시드 좌표 검증/이동 - 선 위면 근처 빈곳으로 이동
      let sx = Math.round(Math.max(0, Math.min(W-1, p.x)));
      let sy = Math.round(Math.max(0, Math.min(H-1, p.y)));
      if (!isEmpty(pixelIdx(sx, sy))) {
        let found = false;
        for (let radius = 3; radius <= 20 && !found; radius += 2) {
          for (let dx = -radius; dx <= radius && !found; dx += 2) {
            for (let dy = -radius; dy <= radius && !found; dy += 2) {
              const nx = Math.max(0, Math.min(W-1, sx+dx));
              const ny = Math.max(0, Math.min(H-1, sy+dy));
              if (isEmpty(pixelIdx(nx, ny))) {
                sx = nx; sy = ny; found = true;
                cmdLog(`  ⚠ 클릭한 곳이 선 위였습니다. 근처(${nx}, ${ny})로 자동 이동.`, 'system');
              }
            }
          }
        }
        if (!found) {
          cmdLog('  🎨 채움 실패: 클릭한 위치 근처에 빈 영역이 없습니다.', 'error');
          hideLoading();
          return;
        }
      }

      // 3) Scanline floodFill - 클릭 영역을 mark
      // visited는 Uint8Array (메모리 효율)
      const visited = new Uint8Array(W * H);
      const stack = [[sx, sy]];
      let pixelCount = 0;
      // 바운딩박스도 같이 측정
      let minX = sx, minY = sy, maxX = sx, maxY = sy;

      while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        let idx = pixelIdx(x, y);
        if (visited[y*W + x] || !isEmpty(idx)) continue;

        // scanline 왼쪽 끝
        let lx = x;
        while (lx >= 0 && !visited[y*W + lx] && isEmpty(pixelIdx(lx, y))) lx--;
        lx++;
        // scanline 오른쪽 끝
        let rx = x;
        while (rx < W && !visited[y*W + rx] && isEmpty(pixelIdx(rx, y))) rx++;
        rx--;

        // 이 row 채우기 + 위/아래 row에서 빈 픽셀 stack 추가
        for (let i = lx; i <= rx; i++) {
          visited[y*W + i] = 1;
          pixelCount++;
        }
        if (lx < minX) minX = lx;
        if (rx > maxX) maxX = rx;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        // 위/아래 row 검사
        for (let yi = -1; yi <= 1; yi += 2) {
          const ny = y + yi;
          if (ny < 0 || ny >= H) continue;
          let inRun = false;
          for (let i = lx; i <= rx; i++) {
            const idx2 = pixelIdx(i, ny);
            const empty = !visited[ny*W + i] && isEmpty(idx2);
            if (empty && !inRun) {
              stack.push([i, ny]);
              inRun = true;
            } else if (!empty) {
              inRun = false;
            }
          }
        }
      }

      // 4) 닫힘 검증
      const totalPixels = W * H;
      if (pixelCount > totalPixels * 0.8) {
        cmdLog('  HATCH: ❌ 닫힌 영역이 아닙니다 (화면 80% 이상이 채워짐). 선들 사이 틈을 확인하세요.', 'error');
        cmdLog('  팁: 라이브스냅 ON 상태로 선 끝점이 정확히 만나게 그리세요.', 'prompt');
        hideLoading();
        return;
      }
      if (pixelCount < 20) {
        cmdLog('  HATCH: 영역이 너무 작습니다.', 'error');
        hideLoading();
        return;
      }

      // 5) 경계 추출 (visited 마스크의 외곽 픽셀들)
      // 간단한 방법: visited[y][x]=1이고 인접 4방향 중 1개라도 0이면 경계
      // Marching squares 대신 단순 contour tracing
      const boundary = traceBoundary(visited, W, H, minX, minY, maxX, maxY);

      if (!boundary || boundary.length < 3) {
        cmdLog('  HATCH: 경계 추출 실패.', 'error');
        hideLoading();
        return;
      }

      // 6) 단순화 (Douglas-Peucker 간단 버전 - 거리 기반 점 솎아내기)
      const simplified = simplifyPath(boundary, 2.0);

      // Rev.15.5: 외곽선 모드 - 경계점으로 fill 대신 닫힌 폴리라인 생성
      if (fillAsOutline){
        if (simplified.length < 3){
          cmdLog('  외곽선: 경계점이 부족합니다.', 'error');
          hideLoading(); return;
        }
        const stroke = document.getElementById('lineColor') ? (document.getElementById('lineColor').value || '#000') : '#000';
        // Rev.15.9: 픽셀 계단/미세 단차 제거 - 직선 피팅 + 교점 코너
        const cleaned = fitOutlineToLines(simplified.map(pt => ({x: pt.x, y: pt.y})), 8);
        const poly = {
          id: ++shapeIdSeq, type: 'polyline',
          points: cleaned,
          closed: true,
          stroke,
          strokeWidth: parseInt(document.getElementById('strokeWidth').value) || 1,
          layer: currentLayer || 'default'
        };
        shapes.push(poly);
        selectedIds.clear(); selectedIds.add(poly.id);
        redoStack = []; pushHistory();
        if (typeof redrawFills === 'function') redrawFills();
        redrawDraw(); updateCount();
        if (typeof updateSelStat === 'function') updateSelStat();
        const areaMm2 = (pixelCount * mmPerPixel * mmPerPixel).toFixed(2);
        document.getElementById('statusHint').textContent =
          `🖊 외곽선 생성 완료: 점 ${poly.points.length}개 닫힌 폴리라인 (면적 ${areaMm2}㎟). 계속 클릭=다중, Esc=종료`;
        hideLoading();
        return;
      }

      // 7) fill 객체 생성
      const alpha = parseInt(document.getElementById('fillAlpha').value) / 100;
      const pattern = (typeof currentHatchPattern !== 'undefined') ? currentHatchPattern : 'solid';
      const fill = {
        id: ++shapeIdSeq,
        type: 'fill',
        points: simplified,
        color: document.getElementById('fillColor').value,
        alpha,
        pattern,
        layer: currentLayer || 'default'
      };
      fills.push(fill);
      redoStack = []; pushHistory();
      redrawFills();
      updateCount();
      const areaMm = (pixelCount * mmPerPixel * mmPerPixel).toFixed(2);
      cmdLog(`  HATCH: 채움 완료 (${pattern}, 면적 ${areaMm}㎟, ${pixelCount}px). 계속 클릭=다중채움, ESC=종료.`, 'system');

    } catch(e) {
      console.error(e);
      alert('채움 오류: ' + e.message);
    }
    hideLoading();
  }, 50);
}

// Moore-neighbor contour tracing (visited 마스크의 외곽 경로 추출)
function traceBoundary(visited, W, H, minX, minY, maxX, maxY) {
  // 시작점: 좌상단 첫 번째 visited 픽셀
  let startX = -1, startY = -1;
  for (let y = minY; y <= maxY && startX < 0; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (visited[y*W + x]) { startX = x; startY = y; break; }
    }
  }
  if (startX < 0) return null;

  // 8방향 (시계방향): E, SE, S, SW, W, NW, N, NE
  const dx8 = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy8 = [0, 1, 1, 1, 0, -1, -1, -1];

  function isInside(x, y) {
    return x >= 0 && x < W && y >= 0 && y < H && visited[y*W + x];
  }

  const boundary = [];
  let cx = startX, cy = startY;
  let prevDir = 6; // N (위쪽에서 들어왔다고 가정)
  const maxIter = (maxX - minX + 1) * (maxY - minY + 1) * 8;
  let iter = 0;

  do {
    boundary.push({x: cx, y: cy});
    // 이전 방향 + 6 (반시계 2칸) 부터 시작해서 시계방향으로 8방향 검사
    let startDir = (prevDir + 6) % 8;
    let found = false;
    for (let i = 0; i < 8; i++) {
      const d = (startDir + i) % 8;
      const nx = cx + dx8[d], ny = cy + dy8[d];
      if (isInside(nx, ny)) {
        cx = nx; cy = ny;
        prevDir = d;
        found = true;
        break;
      }
    }
    if (!found) break; // 고립된 점
    iter++;
    if (iter > maxIter) break;
  } while (!(cx === startX && cy === startY));

  return boundary;
}

// 경로 단순화 (거리 기반 - 두 인접 점 간 거리가 epsilon 이하면 제거)
function simplifyPath(pts, epsilon) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = out[out.length-1];
    const cur = pts[i];
    const d = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    if (d >= epsilon) out.push(cur);
  }
  out.push(pts[pts.length-1]);
  return out;
}

// Rev.15.9: 외곽선 정리 - 거의 직선인 구간을 직선으로 피팅하고
//   인접 직선의 교점으로 코너 꼭짓점을 재계산 (픽셀 계단/미세 단차 제거)
//   pts: 닫힌 경계 점배열, angTolDeg: 같은 직선으로 볼 각도 임계값
function fitOutlineToLines(pts, angTolDeg){
  const n = pts.length;
  if (n < 4) return pts;
  angTolDeg = angTolDeg || 8;
  const angTol = angTolDeg * Math.PI / 180;

  // 1) 닫힌 경로를 직선 세그먼트(연속된 거의 동일방향 점들)로 분할
  // 코너 후보: 앞뒤 윈도우(여러 점) 평균 진행방향의 차이가 큰 점 (흔들림에 강건)
  const W = Math.max(2, Math.min(8, Math.floor(n / 12)));  // 윈도우 크기
  const winDir = (i, sign) => {
    let sx = 0, sy = 0;
    for (let k = 1; k <= W; k++){
      const j = (i + sign*k + n) % n;
      const jp = (i + sign*(k-1) + n) % n;
      sx += pts[j].x - pts[jp].x; sy += pts[j].y - pts[jp].y;
    }
    return Math.atan2(sign*sy, sign*sx);
  };
  const angDiff = (a, b) => { let d = Math.abs(a - b) % (2*Math.PI); if (d > Math.PI) d = 2*Math.PI - d; return d; };

  const cornerScore = new Array(n).fill(0);
  for (let i = 0; i < n; i++){
    const dBack = winDir(i, -1);
    const dFwd  = winDir(i, +1);
    cornerScore[i] = angDiff(dBack, dFwd);
  }
  // 코너 = 국소 최대이면서 임계각 초과 (연속 후보는 가장 큰 것 하나만)
  const isCorner = new Array(n).fill(false);
  for (let i = 0; i < n; i++){
    if (cornerScore[i] <= angTol) continue;
    let isMax = true;
    for (let k = -W; k <= W; k++){
      if (k === 0) continue;
      const j = (i + k + n) % n;
      if (cornerScore[j] > cornerScore[i]) { isMax = false; break; }
    }
    if (isMax) isCorner[i] = true;
  }
  // 코너가 너무 적으면(거의 원형) 원본 유지
  const cornerIdx = [];
  for (let i = 0; i < n; i++) if (isCorner[i]) cornerIdx.push(i);
  if (cornerIdx.length < 2) return pts;

  // 2) 코너~코너 사이 점들로 최소제곱 직선 피팅 → 각 변(edge)의 직선식
  const edges = [];  // {dir:{x,y}, pt:{x,y}}  (점 pt를 지나고 방향 dir인 직선)
  for (let c = 0; c < cornerIdx.length; c++){
    const i0 = cornerIdx[c];
    const i1 = cornerIdx[(c + 1) % cornerIdx.length];
    // i0..i1 구간 점 수집 (닫힌 경로 순환)
    const seg = [];
    let i = i0;
    while (true){ seg.push(pts[i]); if (i === i1) break; i = (i + 1) % n; }
    if (seg.length < 2){ edges.push(null); continue; }
    // 최소제곱: 평균점 + 주성분 방향
    let mx = 0, my = 0; seg.forEach(p => { mx += p.x; my += p.y; }); mx /= seg.length; my /= seg.length;
    let sxx = 0, sxy = 0, syy = 0;
    seg.forEach(p => { const dx = p.x - mx, dy = p.y - my; sxx += dx*dx; sxy += dx*dy; syy += dy*dy; });
    // 공분산행렬 최대 고유벡터 = 직선 방향
    const theta = 0.5 * Math.atan2(2*sxy, sxx - syy);
    edges.push({ dir: { x: Math.cos(theta), y: Math.sin(theta) }, pt: { x: mx, y: my } });
  }

  // 3) 인접 두 직선(edge)의 교점 = 새 코너 꼭짓점
  const lineInt = (a, da, b, db) => {
    const den = da.x*db.y - da.y*db.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((b.x - a.x)*db.y - (b.y - a.y)*db.x) / den;
    return { x: a.x + da.x*t, y: a.y + da.y*t };
  };
  const verts = [];
  const E = edges.length;
  for (let c = 0; c < E; c++){
    const e1 = edges[(c - 1 + E) % E];
    const e2 = edges[c];
    if (!e1 || !e2){ verts.push(pts[cornerIdx[c]]); continue; }
    const ix = lineInt(e1.pt, e1.dir, e2.pt, e2.dir);
    // 교점이 원래 코너에서 너무 멀면(거의 평행) 원래 코너 사용
    if (ix){
      const oc = pts[cornerIdx[c]];
      if (Math.hypot(ix.x - oc.x, ix.y - oc.y) < Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) * 50 + 200){
        verts.push(ix);
      } else verts.push(oc);
    } else verts.push(pts[cornerIdx[c]]);
  }
  return verts.length >= 3 ? verts : pts;
}

// ====== 도형 렌더 ======
function drawShape(ctx, s, selected) {
  // 레이어 visibility 체크
  if (s.layer && typeof getLayer === 'function') {
    const layer = getLayer(s.layer);
    if (layer && !layer.visible) return;
  }
  
  // 치수 타입은 별도 함수로
  if (s.type && s.type.startsWith('dim-')) {
    drawDimension(ctx, s, selected);
    return;
  }
  // 폴리라인
  if (s.type === 'polyline') {
    drawPolyline(ctx, s, selected);
    return;
  }
  // 텍스트
  if (s.type === 'text') {
    drawText(ctx, s, selected);
    return;
  }
  // Rev.11.18: 버텍스(점) - 작은 +자 마커
  if (s.type === 'point') {
    ctx.save();
    const r = 5 / zoom;
    ctx.strokeStyle = selected ? '#ffcc00' : (s.stroke || '#16e0b0');
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    ctx.moveTo(s.p1.x - r, s.p1.y); ctx.lineTo(s.p1.x + r, s.p1.y);
    ctx.moveTo(s.p1.x, s.p1.y - r); ctx.lineTo(s.p1.x, s.p1.y + r);
    ctx.stroke();
    // 작은 사각형
    ctx.fillStyle = selected ? '#ffcc00' : (s.stroke || '#16e0b0');
    const hr = 2.5 / zoom;
    ctx.fillRect(s.p1.x - hr, s.p1.y - hr, hr*2, hr*2);
    ctx.restore();
    return;
  }
  // 회전 타원 (rx/ry/rotation 있으면)
  if (s.type === 'ellipse' && (s.rx !== undefined)) {
    drawEllipseRotated(ctx, s, selected);
    return;
  }
  ctx.save();
  ctx.strokeStyle = s.stroke;
  // Rev.11.31: scale(zoom) 환경 + 고해상도 캔버스 → strokeWidth/zoom 으로 화면상 일정 두께 + 또렷
  ctx.lineWidth = s.strokeWidth / (zoom || 1);
  ctx.lineCap='round'; ctx.lineJoin='round';
  
  // 선 종류 (lineType 또는 layer)
  if (typeof LINE_TYPES !== 'undefined') {
    const lt = s.lineType || (s.layer && typeof getLayer === 'function' ? getLayer(s.layer).lineType : 'solid');
    ctx.setLineDash(LINE_TYPES[lt] || []);
  }

  // Rev.12.6: 도면베이스 가이드선 → 두께 1, lineType 적용 (dashdot 유지)
  if (s.guide){
    ctx.strokeStyle = selected ? '#ffcc00' : (s.stroke || '#3aa0ff');
    ctx.lineWidth = 1 / (zoom || 1);
    // lineType이 있으면 유지, 없으면 실선
    if (!s.lineType) ctx.setLineDash([]);
  }

  ctx.beginPath();
  if (s.type === 'line') {
    ctx.moveTo(s.p1.x,s.p1.y); ctx.lineTo(s.p2.x,s.p2.y); ctx.stroke();
  } else if (s.type === 'rect') {
    const x=Math.min(s.p1.x,s.p2.x), y=Math.min(s.p1.y,s.p2.y);
    const w=Math.abs(s.p2.x-s.p1.x), h=Math.abs(s.p2.y-s.p1.y);
    ctx.strokeRect(x,y,w,h);
  } else if (s.type === 'circle') {
    const r=Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
    ctx.arc(s.p1.x,s.p1.y,r,0,Math.PI*2); ctx.stroke();
  } else if (s.type === 'arc') {
    ctx.arc(s.cx, s.cy, s.r, s.startAngle, s.endAngle, s.ccw); ctx.stroke();
  } else if (s.type === 'ellipse') {
    ctx.ellipse(s.cx, s.cy, s.rx, s.ry, s.angle||0, 0, Math.PI*2); ctx.stroke();
  }
  ctx.restore();
  if (selected) drawSelectionMarker(ctx, s);
}

function drawFill(ctx, f) {
  if (!f.points || f.points.length < 3) return;
  
  // 레이어 visibility 체크
  if (f.layer && typeof getLayer === 'function') {
    const layer = getLayer(f.layer);
    if (layer && !layer.visible) return;
  }
  
  ctx.save();
  
  // 패턴 지원
  const pattern = f.pattern || 'solid';
  if (pattern === 'solid' || !pattern) {
    ctx.fillStyle = hexToRgba(f.color, f.alpha);
    ctx.beginPath();
    ctx.moveTo(f.points[0].x, f.points[0].y);
    for (let i = 1; i < f.points.length; i++) {
      ctx.lineTo(f.points[i].x, f.points[i].y);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    // 해치 패턴 그리기 (clip + lines)
    drawHatchFill(ctx, f);
  }
  
  // 선택된 채움 표시 (테두리 강조)
  if (selectedFillIds && selectedFillIds.has(f.id)) {
    ctx.strokeStyle = '#3498db';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(f.points[0].x, f.points[0].y);
    for (let i = 1; i < f.points.length; i++) {
      ctx.lineTo(f.points[i].x, f.points[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
  }
  
  ctx.restore();
}

// 해치 패턴 그리기 (clip 영역 안에 라인/그리드/점 패턴)
function drawHatchFill(ctx, f) {
  const pts = f.points;
  const color = f.color || '#000000';
  const alpha = f.alpha != null ? f.alpha : 0.5;
  
  // 클립 영역 설정
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.save();
  ctx.clip();
  
  // bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pts.forEach(p => {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  });
  
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1;
  
  const patternDef = (typeof HATCH_PATTERNS !== 'undefined' && HATCH_PATTERNS[f.pattern]) 
    ? HATCH_PATTERNS[f.pattern] : null;
  
  if (patternDef && patternDef.type === 'lines') {
    const ang = (patternDef.angle || 45) * Math.PI / 180;
    const sp = patternDef.spacing || 8;
    const diag = Math.hypot(maxX-minX, maxY-minY) + 50;
    const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const nx = -dy, ny = dx;
    const steps = Math.ceil(diag / sp) + 5;
    ctx.beginPath();
    for (let i = -steps; i <= steps; i++) {
      const px = cx + nx * i * sp, py = cy + ny * i * sp;
      ctx.moveTo(px - dx*diag, py - dy*diag);
      ctx.lineTo(px + dx*diag, py + dy*diag);
    }
    ctx.stroke();
  } else if (patternDef && patternDef.type === 'cross') {
    const sp = patternDef.spacing || 10;
    ctx.beginPath();
    for (let x = Math.floor(minX/sp)*sp; x <= maxX+sp; x += sp) {
      ctx.moveTo(x, minY-5); ctx.lineTo(x, maxY+5);
    }
    for (let y = Math.floor(minY/sp)*sp; y <= maxY+sp; y += sp) {
      ctx.moveTo(minX-5, y); ctx.lineTo(maxX+5, y);
    }
    ctx.stroke();
  } else if (patternDef && patternDef.type === 'dots') {
    const sp = patternDef.spacing || 6;
    for (let x = Math.floor(minX/sp)*sp; x <= maxX+sp; x += sp) {
      for (let y = Math.floor(minY/sp)*sp; y <= maxY+sp; y += sp) {
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.substr(1,2), 16);
  const g = parseInt(hex.substr(3,2), 16);
  const b = parseInt(hex.substr(5,2), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawSelectionMarker(ctx, s) {
  ctx.save();
  ctx.strokeStyle = '#d9534f';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4,2]);
  const bb = shapeBoundingBox(s);
  ctx.strokeRect(bb.minX - 3, bb.minY - 3, bb.maxX - bb.minX + 6, bb.maxY - bb.minY + 6);
  ctx.setLineDash([]);
  const hs = 4;
  [[bb.minX, bb.minY],[bb.maxX, bb.minY],[bb.minX, bb.maxY],[bb.maxX, bb.maxY]].forEach(([x,y]) => {
    ctx.fillRect(x-hs, y-hs, hs*2, hs*2);
    ctx.strokeRect(x-hs, y-hs, hs*2, hs*2);
  });
  ctx.restore();
}

function shapeBoundingBox(s) {
  if (s.type === 'point') {
    return { minX: s.p1.x, maxX: s.p1.x, minY: s.p1.y, maxY: s.p1.y };
  } else if (s.type === 'line' || s.type === 'rect') {
    return { minX: Math.min(s.p1.x, s.p2.x), maxX: Math.max(s.p1.x, s.p2.x),
             minY: Math.min(s.p1.y, s.p2.y), maxY: Math.max(s.p1.y, s.p2.y) };
  } else if (s.type === 'circle') {
    const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
    return { minX: s.p1.x-r, maxX: s.p1.x+r, minY: s.p1.y-r, maxY: s.p1.y+r };
  } else if (s.type === 'arc') {
    return { minX: s.cx-s.r, maxX: s.cx+s.r, minY: s.cy-s.r, maxY: s.cy+s.r };
  } else if (s.type === 'ellipse') {
    if (s.rx !== undefined) {
      // 회전 타원의 BBox는 근사 (장축 사용)
      const r = Math.max(s.rx, s.ry);
      return { minX: s.cx-r, maxX: s.cx+r, minY: s.cy-r, maxY: s.cy+r };
    }
    return { minX: s.cx-s.rx, maxX: s.cx+s.rx, minY: s.cy-s.ry, maxY: s.cy+s.ry };
  } else if (s.type === 'polyline') {
    return polylineBoundingBox(s);
  } else if (s.type === 'text') {
    // 텍스트 BBox는 sizePx 기반 추정
    const w = (s.text || '').length * (s.sizePx || 14) * 0.6;
    const h = s.sizePx || 14;
    return { minX: s.pos.x, maxX: s.pos.x + w, minY: s.pos.y, maxY: s.pos.y + h };
  } else if (s.type && s.type.startsWith('dim-')) {
    // 치수는 대략 offset과 p1/p2로 범위 계산
    const xs = [], ys = [];
    if (s.p1) { xs.push(s.p1.x); ys.push(s.p1.y); }
    if (s.p2) { xs.push(s.p2.x); ys.push(s.p2.y); }
    if (s.offset) { xs.push(s.offset.x); ys.push(s.offset.y); }
    if (xs.length === 0) return { minX:0, maxX:0, minY:0, maxY:0 };
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }
  return { minX:0, maxX:0, minY:0, maxY:0 };
}

function hitTest(p) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i];
    if (isPointOnShape(p, s)) return s;
  }
  return null;
}

// 채움 영역 안 점 hit 검사 (Rev.10.1)
function hitTestFill(p) {
  for (let i = fills.length - 1; i >= 0; i--) {
    const f = fills[i];
    if (pointInPolygon(p, f.points)) return f;
  }
  return null;
}

function pointInPolygon(p, vertices) {
  // ray casting algorithm
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    const intersect = ((yi > p.y) !== (yj > p.y)) &&
      (p.x < (xj - xi) * (p.y - yi) / (yj - yi + 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPointOnShape(p, s) {
  const tol = Math.max(5, s.strokeWidth + 3);
  if (s.type === 'point') return Math.hypot(p.x - s.p1.x, p.y - s.p1.y) <= Math.max(tol, 7);
  if (s.type === 'line') return pointToSegmentDist(p, s.p1, s.p2) <= tol;
  if (s.type === 'rect') {
    const x=Math.min(s.p1.x,s.p2.x), y=Math.min(s.p1.y,s.p2.y);
    const w=Math.abs(s.p2.x-s.p1.x), h=Math.abs(s.p2.y-s.p1.y);
    const onX = (Math.abs(p.x-x)<=tol || Math.abs(p.x-(x+w))<=tol) && p.y>=y-tol && p.y<=y+h+tol;
    const onY = (Math.abs(p.y-y)<=tol || Math.abs(p.y-(y+h))<=tol) && p.x>=x-tol && p.x<=x+w+tol;
    return onX || onY;
  }
  if (s.type === 'circle') {
    const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
    return Math.abs(Math.hypot(p.x-s.p1.x, p.y-s.p1.y) - r) <= tol;
  }
  if (s.type === 'arc') {
    return Math.abs(Math.hypot(p.x-s.cx, p.y-s.cy) - s.r) <= tol;
  }
  if (s.type === 'ellipse') {
    const bb = shapeBoundingBox(s);
    return p.x>=bb.minX-tol && p.x<=bb.maxX+tol && p.y>=bb.minY-tol && p.y<=bb.maxY+tol;
  }
  if (s.type === 'polyline') {
    for (let i = 0; i < s.points.length - 1; i++) {
      if (pointToSegmentDist(p, s.points[i], s.points[i+1]) <= tol) return true;
    }
    if (s.closed && s.points.length >= 3) {
      const last = s.points[s.points.length - 1];
      const first = s.points[0];
      if (pointToSegmentDist(p, last, first) <= tol) return true;
      // Rev.16.3: 닫힌 폴리라인은 내부 클릭으로도 선택 (가는 외곽선도 쉽게 잡기)
      if (pointInPolygon(p, s.points)) return true;
    }
    return false;
  }
  if (s.type === 'text') {
    const bb = shapeBoundingBox(s);
    return p.x>=bb.minX-tol && p.x<=bb.maxX+tol && p.y>=bb.minY-tol && p.y<=bb.maxY+tol;
  }
  // 치수는 텍스트 또는 치수선 근처에서 hit
  if (s.type && s.type.startsWith('dim-')) {
    if (s.offset) {
      const d = Math.hypot(p.x - s.offset.x, p.y - s.offset.y);
      if (d <= 20) return true;
    }
    // 선형/평행 치수는 치수선 위도 hit
    if ((s.type === 'dim-linear' || s.type === 'dim-aligned') && s.p1 && s.p2 && s.offset) {
      if (s.type === 'dim-linear') {
        const horizontal = Math.abs(s.p2.x - s.p1.x) >= Math.abs(s.p2.y - s.p1.y);
        const dp1 = horizontal ? {x:s.p1.x,y:s.offset.y} : {x:s.offset.x,y:s.p1.y};
        const dp2 = horizontal ? {x:s.p2.x,y:s.offset.y} : {x:s.offset.x,y:s.p2.y};
        return pointToSegmentDist(p, dp1, dp2) <= tol;
      }
    }
    return false;
  }
  return false;
}

function pointToSegmentDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx*dx + dy*dy;
  if (len2 < 1e-6) return Math.hypot(p.x-a.x, p.y-a.y);
  let t = ((p.x-a.x)*dx + (p.y-a.y)*dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t*dx), p.y - (a.y + t*dy));
}

// 도형의 주요 특징점 추출 (이동 스냅용)
function getShapeKeyPoints(s) {
  // _snapshot가 있으면 그 좌표 사용 (이동 중 원본 위치 기준)
  const src = s._snapshot || s;
  const pts = [];
  if (s.type === 'line') {
    pts.push({x: src.p1.x, y: src.p1.y, kind:'endpoint'});
    pts.push({x: src.p2.x, y: src.p2.y, kind:'endpoint'});
    // 중점도 스냅 후보
    pts.push({x: (src.p1.x+src.p2.x)/2, y: (src.p1.y+src.p2.y)/2, kind:'midpoint'});
  } else if (s.type === 'rect') {
    const x1 = Math.min(src.p1.x, src.p2.x), x2 = Math.max(src.p1.x, src.p2.x);
    const y1 = Math.min(src.p1.y, src.p2.y), y2 = Math.max(src.p1.y, src.p2.y);
    // 4 코너
    pts.push({x:x1,y:y1,kind:'corner'});
    pts.push({x:x2,y:y1,kind:'corner'});
    pts.push({x:x2,y:y2,kind:'corner'});
    pts.push({x:x1,y:y2,kind:'corner'});
    // 변의 중점
    pts.push({x:(x1+x2)/2, y:y1, kind:'midpoint'});
    pts.push({x:(x1+x2)/2, y:y2, kind:'midpoint'});
    pts.push({x:x1, y:(y1+y2)/2, kind:'midpoint'});
    pts.push({x:x2, y:(y1+y2)/2, kind:'midpoint'});
    // 중심
    pts.push({x:(x1+x2)/2, y:(y1+y2)/2, kind:'center'});
  } else if (s.type === 'circle') {
    const r = Math.hypot(src.p2.x-src.p1.x, src.p2.y-src.p1.y);
    pts.push({x: src.p1.x, y: src.p1.y, kind:'center'});
    // 4분점 (Rev.10.8: quadrant로 분류 - 오토캐드와 동일)
    pts.push({x: src.p1.x+r, y: src.p1.y, kind:'quadrant'});
    pts.push({x: src.p1.x-r, y: src.p1.y, kind:'quadrant'});
    pts.push({x: src.p1.x, y: src.p1.y+r, kind:'quadrant'});
    pts.push({x: src.p1.x, y: src.p1.y-r, kind:'quadrant'});
  } else if (s.type === 'arc') {
    const cx = src.cx !== undefined ? src.cx : s.cx;
    const cy = src.cy !== undefined ? src.cy : s.cy;
    const r = src.r !== undefined ? src.r : s.r;
    pts.push({x: cx, y: cy, kind:'center'});
    pts.push({x: cx + r*Math.cos(s.startAngle), y: cy + r*Math.sin(s.startAngle), kind:'endpoint'});
    pts.push({x: cx + r*Math.cos(s.endAngle), y: cy + r*Math.sin(s.endAngle), kind:'endpoint'});
  }
  return pts;
}

// Rev.10.8: 스냅 점 종류가 현재 OSNAP 설정에서 허용되는지 확인
function osnapKindAllowed(kind) {
  if (!kind) return true;
  // 모든 kind를 osnapEnabled에 매핑
  const map = {
    'endpoint': 'endpoint',
    'midpoint': 'midpoint',
    'center': 'center',
    'quadrant': 'quadrant',
    'corner': 'corner',
    'intersection': 'intersection',
    'on-shape': 'onshape'
  };
  const key = map[kind];
  if (!key) return true; // 알 수 없는 종류는 통과
  return osnapEnabled[key] !== false;
}

// 점 p에서 도형 s에 가장 가까운 점 (선 위, 원 위 등)
function nearestPointOnShape(p, s) {
  if (s.type === 'line') {
    const a = s.p1, b = s.p2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx*dx + dy*dy;
    if (len2 < 1e-6) return null;
    let t = ((p.x-a.x)*dx + (p.y-a.y)*dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return {x: a.x + t*dx, y: a.y + t*dy, kind:'on-shape'};
  } else if (s.type === 'circle') {
    const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
    const d = Math.hypot(p.x-s.p1.x, p.y-s.p1.y);
    if (d < 1e-6) return null;
    return {x: s.p1.x + (p.x-s.p1.x)/d * r, y: s.p1.y + (p.y-s.p1.y)/d * r, kind:'on-shape'};
  } else if (s.type === 'rect') {
    const x1 = Math.min(s.p1.x, s.p2.x), x2 = Math.max(s.p1.x, s.p2.x);
    const y1 = Math.min(s.p1.y, s.p2.y), y2 = Math.max(s.p1.y, s.p2.y);
    // 4변 중 가장 가까운 점
    const candidates = [
      {x: Math.max(x1, Math.min(x2, p.x)), y: y1},
      {x: Math.max(x1, Math.min(x2, p.x)), y: y2},
      {x: x1, y: Math.max(y1, Math.min(y2, p.y))},
      {x: x2, y: Math.max(y1, Math.min(y2, p.y))}
    ];
    let best = null, bd = Infinity;
    for (const c of candidates) {
      const d = Math.hypot(c.x-p.x, c.y-p.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best) { best.kind = 'on-shape'; return best; }
  } else if (s.type === 'arc') {
    const d = Math.hypot(p.x-s.cx, p.y-s.cy);
    if (d < 1e-6) return null;
    return {x: s.cx + (p.x-s.cx)/d * s.r, y: s.cy + (p.y-s.cy)/d * s.r, kind:'on-shape'};
  }
  return null;
}

function boxSelect(p1, p2, addMode) {
  const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
  const box = { minX, maxX, minY, maxY };
  if (!addMode) selectedIds.clear();
  shapes.forEach(s => {
    // Rev.13.9: 교차(걸치기) 선택 - 박스에 도형이 일부라도 걸치면 선택
    if (shapeIntersectsBox(s, box)) selectedIds.add(s.id);
  });
  updateSelStat(); redrawDraw();
}

// Rev.13.9: 도형이 선택 박스와 걸치는지(교차/포함) 판정
function shapeIntersectsBox(s, box){
  const bb = shapeBoundingBox(s);
  // 1) BBox가 박스와 전혀 안 겹치면 즉시 제외
  if (bb.maxX < box.minX || bb.minX > box.maxX || bb.maxY < box.minY || bb.minY > box.maxY) return false;
  // 2) BBox가 박스 안에 완전히 포함되면 선택 (윈도우 케이스)
  if (bb.minX >= box.minX && bb.maxX <= box.maxX && bb.minY >= box.minY && bb.maxY <= box.maxY) return true;
  // 3) 형상별 정밀 교차 (걸치기)
  if (s.type === 'line'){
    return segIntersectsBox(s.p1, s.p2, box);
  }
  if (s.type === 'rect'){
    const x1 = Math.min(s.p1.x, s.p2.x), x2 = Math.max(s.p1.x, s.p2.x);
    const y1 = Math.min(s.p1.y, s.p2.y), y2 = Math.max(s.p1.y, s.p2.y);
    const edges = [
      [{x:x1,y:y1},{x:x2,y:y1}], [{x:x2,y:y1},{x:x2,y:y2}],
      [{x:x2,y:y2},{x:x1,y:y2}], [{x:x1,y:y2},{x:x1,y:y1}]
    ];
    return edges.some(([a,b]) => segIntersectsBox(a, b, box));
  }
  if (s.type === 'circle' || s.type === 'arc' || s.type === 'ellipse'){
    // BBox가 박스와 겹치는 시점에서 원/호/타원은 걸친 것으로 간주(실용적)
    return true;
  }
  if (s.type === 'polyline' && Array.isArray(s.points)){
    for (let i = 0; i < s.points.length - 1; i++){
      if (segIntersectsBox(s.points[i], s.points[i+1], box)) return true;
    }
    if (s.closed && s.points.length >= 3){
      if (segIntersectsBox(s.points[s.points.length-1], s.points[0], box)) return true;
    }
    return false;
  }
  // 그 외(text/dim 등): BBox가 겹치면 선택
  return true;
}

// 선분(a-b)이 박스와 교차하거나 박스 안에 있는지
function segIntersectsBox(a, b, box){
  // 끝점 중 하나라도 박스 안이면 교차
  if (pointInBox(a, box) || pointInBox(b, box)) return true;
  // 박스 네 변과의 선분 교차 검사
  const c1 = {x:box.minX, y:box.minY}, c2 = {x:box.maxX, y:box.minY};
  const c3 = {x:box.maxX, y:box.maxY}, c4 = {x:box.minX, y:box.maxY};
  return segSegIntersect(a,b,c1,c2) || segSegIntersect(a,b,c2,c3) ||
         segSegIntersect(a,b,c3,c4) || segSegIntersect(a,b,c4,c1);
}
function pointInBox(p, box){
  return p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY;
}
// 두 선분 교차 판정 (CCW 방식)
function segSegIntersect(p1, p2, p3, p4){
  const d = (a,b,c) => (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x);
  const d1 = d(p3,p4,p1), d2 = d(p3,p4,p2), d3 = d(p1,p2,p3), d4 = d(p1,p2,p4);
  if (((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0))) return true;
  const onSeg = (a,b,c) => Math.min(a.x,b.x)<=c.x && c.x<=Math.max(a.x,b.x) &&
                           Math.min(a.y,b.y)<=c.y && c.y<=Math.max(a.y,b.y);
  if (d1===0 && onSeg(p3,p4,p1)) return true;
  if (d2===0 && onSeg(p3,p4,p2)) return true;
  if (d3===0 && onSeg(p1,p2,p3)) return true;
  if (d4===0 && onSeg(p1,p2,p4)) return true;
  return false;
}

function snapshotShape(s) {
  const snap = { id: s.id, type: s.type };
  if (s.type === 'line' || s.type === 'rect' || s.type === 'circle') {
    snap.p1 = {x:s.p1.x, y:s.p1.y}; snap.p2 = {x:s.p2.x, y:s.p2.y};
  } else if (s.type === 'arc' || s.type === 'ellipse') {
    snap.cx = s.cx; snap.cy = s.cy;
    if (s.type === 'arc') {
      // arc도 p1/p2 가지고 있을 수 있음 - 함께 저장
      if (s.p1) snap.p1 = {x:s.p1.x, y:s.p1.y};
      if (s.p2) snap.p2 = {x:s.p2.x, y:s.p2.y};
    }
  } else if (s.type && s.type.startsWith('dim-')) {
    if (s.p1) snap.p1 = {x:s.p1.x, y:s.p1.y};
    if (s.p2) snap.p2 = {x:s.p2.x, y:s.p2.y};
    if (s.offset) snap.offset = {x:s.offset.x, y:s.offset.y};
  } else if ((s.type === 'polyline' || s.type === 'fill') && Array.isArray(s.points)) {
    snap.points = s.points.map(pt => ({x: pt.x, y: pt.y}));
  } else if (s.type === 'point' && s.p1) {
    snap.p1 = {x:s.p1.x, y:s.p1.y};
  }
  return snap;
}
function moveShapeTo(s, snap, dx, dy) {
  if (s.type === 'line' || s.type === 'rect' || s.type === 'circle') {
    s.p1.x = snap.p1.x + dx; s.p1.y = snap.p1.y + dy;
    s.p2.x = snap.p2.x + dx; s.p2.y = snap.p2.y + dy;
  } else if (s.type === 'arc' || s.type === 'ellipse') {
    s.cx = snap.cx + dx; s.cy = snap.cy + dy;
    if (s.type === 'arc' && snap.p1) {
      s.p1.x = snap.p1.x + dx; s.p1.y = snap.p1.y + dy;
      s.p2.x = snap.p2.x + dx; s.p2.y = snap.p2.y + dy;
    }
  } else if (s.type && s.type.startsWith('dim-')) {
    if (s.p1 && snap.p1) { s.p1.x = snap.p1.x + dx; s.p1.y = snap.p1.y + dy; }
    if (s.p2 && snap.p2) { s.p2.x = snap.p2.x + dx; s.p2.y = snap.p2.y + dy; }
    if (s.offset && snap.offset) { s.offset.x = snap.offset.x + dx; s.offset.y = snap.offset.y + dy; }
  } else if ((s.type === 'polyline' || s.type === 'fill') && snap.points) {
    s.points = snap.points.map(pt => ({x: pt.x + dx, y: pt.y + dy}));
  } else if (s.type === 'point' && snap.p1) {
    s.p1.x = snap.p1.x + dx; s.p1.y = snap.p1.y + dy;
  }
}

function deleteSelected() {
  if (selectedIds.size === 0) return;
  const removed = shapes.filter(s => selectedIds.has(s.id));
  shapes = shapes.filter(s => !selectedIds.has(s.id));
  selectedIds.clear();
  updateSelStat(); updateCount();
  redrawDraw();
  pushHistory(); // Rev.11.41
}
document.getElementById('btnDelSel').addEventListener('click', deleteSelected);

// ====== Rev.11.36: 객체 정렬 / 균등 분배 ======
// 도형을 dx,dy 만큼 평행 이동 (모든 타입 대응)
function translateShapeBy(s, dx, dy){
  if (dx === 0 && dy === 0) return;
  if (s.p1){ s.p1.x += dx; s.p1.y += dy; }
  if (s.p2){ s.p2.x += dx; s.p2.y += dy; }
  if (typeof s.cx === 'number'){ s.cx += dx; s.cy += dy; }
  if (s.offset){ s.offset.x += dx; s.offset.y += dy; }
  if (s.pos){ s.pos.x += dx; s.pos.y += dy; }
  if (Array.isArray(s.points)){ s.points.forEach(p => { p.x += dx; p.y += dy; }); }
}

// 선택된 도형 목록 + 각자의 BBox 반환
function getSelectedWithBBox(){
  const list = [];
  shapes.forEach(s => {
    if (selectedIds.has(s.id)){
      list.push({ s, bb: shapeBoundingBox(s) });
    }
  });
  return list;
}

// 정렬: mode = 'left','centerH','right','top','centerV','bottom'
function alignSelected(mode){
  const list = getSelectedWithBBox();
  if (list.length < 2){
    document.getElementById('statusHint').textContent = '⚠ 정렬하려면 도형을 2개 이상 선택하세요.';
    return;
  }
  // 전체 영역
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  list.forEach(({bb}) => {
    minX = Math.min(minX, bb.minX); maxX = Math.max(maxX, bb.maxX);
    minY = Math.min(minY, bb.minY); maxY = Math.max(maxY, bb.maxY);
  });
  const cX = (minX + maxX) / 2, cY = (minY + maxY) / 2;
  list.forEach(({s, bb}) => {
    let dx = 0, dy = 0;
    switch(mode){
      case 'left':    dx = minX - bb.minX; break;
      case 'right':   dx = maxX - bb.maxX; break;
      case 'centerH': dx = cX - (bb.minX + bb.maxX)/2; break;
      case 'top':     dy = minY - bb.minY; break;
      case 'bottom':  dy = maxY - bb.maxY; break;
      case 'centerV': dy = cY - (bb.minY + bb.maxY)/2; break;
    }
    translateShapeBy(s, dx, dy);
  });
  redoStack = []; pushHistory();
  redrawDraw(); updateSelStat();
  const names = { left:'왼쪽', right:'오른쪽', centerH:'수평 가운데', top:'위쪽', bottom:'아래쪽', centerV:'수직 가운데' };
  document.getElementById('statusHint').textContent = `✓ ${names[mode]} 정렬 (${list.length}개)`;
}

// 정렬 버튼 핸들러
const _alignBtns = {
  alignLeft:'left', alignCenterH:'centerH', alignRight:'right',
  alignTop:'top', alignCenterV:'centerV', alignBottom:'bottom'
};
Object.keys(_alignBtns).forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => alignSelected(_alignBtns[id]));
});
// Rev.11.37: 블렌더식 분할 버튼 핸들러
{
  const sb = document.getElementById('headerBtnSubdivide');
  if (sb) sb.addEventListener('click', () => enterSubdivideMode());
}
// Rev.16.9: 대각선(교점) 버튼 핸들러
{
  const dx = document.getElementById('headerBtnDiagX');
  if (dx) dx.addEventListener('click', () => {
    if (diagXMode) exitDiagXMode();
    else enterDiagXMode();
  });
}
// Rev.16.14: 쓸어 지우기 버튼 핸들러
{
  const se = document.getElementById('headerBtnSwipeErase');
  if (se) se.addEventListener('click', () => {
    if (swipeEraseMode) exitSwipeEraseMode();
    else enterSwipeEraseMode();
  });
  const thr = document.getElementById('swipeAngleInput');
  if (thr) thr.addEventListener('change', () => {
    const v = parseFloat(thr.value);
    if (isFinite(v) && v >= 0 && v <= 90) swipeAngleThresh = v;
  });
}
function enterSwipeEraseMode(){
  // 다른 모드 종료
  pointMode = false; connectMode = false; connectPoints = [];
  extrudeMode = false; extrudeState = null; extrudeAxis = null;
  if (typeof exitSubdivideMode === 'function') exitSubdivideMode();
  if (typeof exitDiagXMode === 'function') exitDiagXMode();
  if (typeof updateVertexButtons === 'function') updateVertexButtons();
  swipeEraseMode = true; swipeErasing = false; swipePath = [];
  const btn = document.querySelector('.tool-menu-item[data-tool="select"]');
  if (btn) btn.click();
  drawCanvas.style.cursor = 'crosshair';
  updateSwipeEraseButton();
  document.getElementById('statusHint').textContent = `🧹 쓸어 지우기: 드래그로 경로를 그으면 가로지른 선 중 방향 ${swipeAngleThresh}° 이상 어긋난 선 삭제 · 우클릭/Esc=종료`;
}
function exitSwipeEraseMode(){
  if (!swipeEraseMode) return false;
  swipeEraseMode = false; swipeErasing = false; swipePath = [];
  drawCanvas.style.cursor = 'default';
  preCtx.clearRect(0,0,baseW,baseH);
  updateSwipeEraseButton();
  redrawDraw();
  return true;
}
function updateSwipeEraseButton(){
  const btn = document.getElementById('headerBtnSwipeErase');
  if (btn) btn.classList.toggle('active', !!swipeEraseMode);
}
function enterDiagXMode(){
  // 다른 모드 종료
  pointMode = false; connectMode = false; connectPoints = [];
  extrudeMode = false; extrudeState = null; extrudeAxis = null;
  if (typeof exitSubdivideMode === 'function') exitSubdivideMode();
  if (typeof exitSwipeEraseMode === 'function') exitSwipeEraseMode();
  if (typeof updateVertexButtons === 'function') updateVertexButtons();
  diagXMode = true;
  diagXPhase = 0; diagXStartPts = []; diagXEndPts = [];
  diagXDragging = false; diagXDragOrigin = null; diagXHoverPt = null;
  // 선택 도구로 (클릭/드래그 받기 위해)
  const btn = document.querySelector('.tool-menu-item[data-tool="select"]');
  if (btn) btn.click();
  drawCanvas.style.cursor = 'crosshair';
  updateDiagXButton();
  document.getElementById('statusHint').textContent = '╲ 대각선: 시작 교점을 Shift+드래그로 선택(최대2) → 끝 교점도 Shift+드래그로 선택 → 확인 팝업 · 우클릭/Esc=취소';
}
function exitDiagXMode(){
  if (!diagXMode) return false;
  diagXMode = false;
  diagXPhase = 0; diagXStartPts = []; diagXEndPts = [];
  diagXDragging = false; diagXDragOrigin = null; diagXHoverPt = null;
  drawCanvas.style.cursor = 'default';
  preCtx.clearRect(0,0,baseW,baseH);
  updateDiagXButton();
  redrawDraw();
  return true;
}
function updateDiagXButton(){
  const btn = document.getElementById('headerBtnDiagX');
  if (btn) btn.classList.toggle('active', !!diagXMode);
}
// Rev.16.11: 끝 교점 2곳 선택 완료 → 확인 팝업 → 확정/취소
function confirmDiagX(){
  const n = Math.min(diagXStartPts.length, diagXEndPts.length);
  if (n < 1){ return; }
  const lines = [];
  for (let i=0;i<n;i++){
    const a = diagXStartPts[i], b = diagXEndPts[i];
    const lenMm = (Math.hypot(b.x-a.x, b.y-a.y) * mmPerPixel).toFixed(2);
    lines.push(`선 ${i+1}: 길이 ${lenMm}mm`);
  }
  const msg = `대각선 ${n}개를 생성합니다.\n\n${lines.join('\n')}\n\n[확인] 생성  /  [취소] 다시 선택`;
  if (window.confirm(msg)){
    commitDiagX();
  } else {
    // 끝점만 초기화하고 다시 끝 선택 단계 유지
    diagXEndPts = [];
    document.getElementById('statusHint').textContent = '╲ 취소됨 — 끝 교점을 다시 클릭하세요 (우클릭/Esc=전체 취소)';
    drawDiagXPreview(diagXHoverPt || diagXStartPts[0]);
  }
}
function commitDiagX(){
  const n = Math.min(diagXStartPts.length, diagXEndPts.length);
  const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
  const stroke = document.getElementById('strokeColor').value || '#ffffff';
  let made = 0;
  for (let i=0;i<n;i++){
    const a = diagXStartPts[i], b = diagXEndPts[i];
    if (Math.hypot(b.x-a.x, b.y-a.y) > 1){
      shapes.push({ id: ++shapeIdSeq, type:'line',
        p1:{x:a.x,y:a.y}, p2:{x:b.x,y:b.y}, stroke, strokeWidth: sw });
      made++;
    }
  }
  if (made > 0){ redoStack = []; pushHistory(); }
  redrawDraw(); updateCount();
  // 다음 작업 준비 (모드는 유지)
  diagXPhase = 0; diagXStartPts = []; diagXEndPts = [];
  preCtx.clearRect(0,0,baseW,baseH);
  document.getElementById('statusHint').textContent =
    `╲ 대각선 ${made}개 생성 · 다시 시작 교점을 Shift+드래그로 선택 · Esc=종료`;
}
// Rev.16.11: 진행 중 취소 (선택 초기화, 모드는 유지)
function cancelDiagX(){
  diagXPhase = 0; diagXStartPts = []; diagXEndPts = [];
  diagXDragging = false; diagXDragOrigin = null;
  preCtx.clearRect(0,0,baseW,baseH);
  redrawDraw();
  document.getElementById('statusHint').textContent = '╲ 대각선: 취소됨 — 시작 교점을 Shift+드래그로 선택하세요 (Esc=모드 종료)';
}
// Rev.11.65: 교차점 분할(겹친선 분리) 버튼 핸들러
{
  const ba = document.getElementById('headerBtnBreakAll');
  if (ba) ba.addEventListener('click', () => runBreakAllIntersections());
}

// ====== Rev.11.37: 블렌더식 분할(Subdivide) ======
function enterSubdivideMode(){
  // 다른 모드 종료
  pointMode = false; connectMode = false; connectPoints = [];
  extrudeMode = false; extrudeState = null; extrudeAxis = null;
  if (typeof updateVertexButtons === 'function') updateVertexButtons();
  subdivideMode = true;
  subdivideTarget = null;
  subdivideCount = 1;
  // 선택 도구로 (클릭 받기 위해)
  const btn = document.querySelector('.tool-menu-item[data-tool="select"]');
  if (btn) btn.click();
  drawCanvas.style.cursor = 'crosshair';
  updateSubdivideButton();
  document.getElementById('statusHint').textContent = '✂ 분할: 선을 클릭하세요 (이후 휠로 분할 수 조절 → 좌클릭 적용 / 우클릭·Esc=취소)';
}
function exitSubdivideMode(){
  if (!subdivideMode) return false;
  subdivideMode = false;
  subdivideTarget = null;
  subdivideCount = 1;
  drawCanvas.style.cursor = 'default';
  preCtx.clearRect(0,0,baseW,baseH);
  updateSubdivideButton();
  return true;
}
function updateSubdivideButton(){
  const btn = document.getElementById('headerBtnSubdivide');
  if (!btn) return;
  btn.classList.toggle('active', !!subdivideMode); // Rev.11.54: 도구바 구조 보존
}
// 분할 대상 선 위 N개 분할점 좌표 반환
function subdivPoints(line, n){
  const pts = [];
  for (let i = 1; i <= n; i++){
    const t = i / (n + 1);
    pts.push({ x: line.p1.x + (line.p2.x - line.p1.x) * t,
               y: line.p1.y + (line.p2.y - line.p1.y) * t });
  }
  return pts;
}
// 분할 미리보기 (선택된 선 강조 + 분할점 표시)
function drawSubdividePreview(){
  if (!subdivideTarget) return;
  const Z = zoom || 1;
  preCtx.clearRect(0,0,baseW,baseH);
  preCtx.save();
  // 선 강조
  preCtx.strokeStyle = '#e74c3c';
  preCtx.lineWidth = 2 / Z;
  preCtx.setLineDash([]);
  preCtx.beginPath();
  preCtx.moveTo(subdivideTarget.p1.x, subdivideTarget.p1.y);
  preCtx.lineTo(subdivideTarget.p2.x, subdivideTarget.p2.y);
  preCtx.stroke();
  // 분할점
  const pts = subdivPoints(subdivideTarget, subdivideCount);
  const r = 5 / Z;
  preCtx.fillStyle = '#ffd966';
  preCtx.strokeStyle = '#fff';
  preCtx.lineWidth = 1.5 / Z;
  pts.forEach(p => {
    preCtx.beginPath();
    preCtx.arc(p.x, p.y, r, 0, Math.PI*2);
    preCtx.fill();
    preCtx.stroke();
  });
  preCtx.restore();
  document.getElementById('statusHint').textContent =
    `✂ 분할: ${subdivideCount}개 점 → ${subdivideCount+1}등분 · 휠로 조절 / 좌클릭=적용 / 우클릭·Esc=취소`;
}
// 분할 적용: 선을 N+1개 선분으로 교체
function applySubdivide(){
  if (!subdivideTarget) return;
  const line = subdivideTarget;
  const n = subdivideCount;
  const sw = line.strokeWidth;
  const stroke = line.stroke;
  // 끝점 + 분할점들로 정점 배열
  const verts = [{x:line.p1.x, y:line.p1.y}, ...subdivPoints(line, n), {x:line.p2.x, y:line.p2.y}];
  // 원본 선 제거
  const idx = shapes.findIndex(s => s.id === line.id);
  if (idx >= 0) shapes.splice(idx, 1);
  // 인접 정점끼리 새 선분 생성
  for (let i = 0; i < verts.length - 1; i++){
    shapes.push({
      id: ++shapeIdSeq, type: 'line',
      p1: { x: verts[i].x, y: verts[i].y },
      p2: { x: verts[i+1].x, y: verts[i+1].y },
      stroke, strokeWidth: sw
    });
  }
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  const cnt = n + 1;
  exitSubdivideMode();
  document.getElementById('statusHint').textContent = `✓ 분할 완료: ${cnt}개 선분으로 나눔`;
}

// ====== Rev.11.39: 블렌더식 이동(Grab) ======
function enterGrabMode(){
  if (selectedIds.size === 0){
    document.getElementById('statusHint').textContent = '⚠ 이동할 도형을 먼저 선택하세요 (좌클릭).';
    return;
  }
  // 다른 모드 종료
  if (subdivideMode) exitSubdivideMode();
  grabMode = true;
  grabAxis = null;
  grabStart = lastMousePoint ? { x: lastMousePoint.x, y: lastMousePoint.y } : { x: 0, y: 0 };
  // 선택 도형 원본 복사본 저장
  grabBase = {};
  selectedIds.forEach(id => {
    const s = shapes.find(x => x.id === id);
    if (s) grabBase[id] = JSON.parse(JSON.stringify(s));
  });
  drawCanvas.style.cursor = 'move';
  document.getElementById('statusHint').textContent =
    '↔ 이동(G): 마우스 따라 이동 · X=X축만 / Y=Y축만 / 좌클릭·Enter=확정 / 우클릭·Esc=취소';
}
function exitGrabMode(commit){
  if (!grabMode) return false;
  if (!commit){
    // 취소 → 원위치 복원
    Object.keys(grabBase).forEach(id => {
      const s = shapes.find(x => x.id === Number(id));
      if (s && grabBase[id]) restoreShapeFrom(s, grabBase[id]);
    });
  } else {
    redoStack = []; pushHistory();
  }
  grabMode = false; grabAxis = null; grabStart = null; grabBase = {};
  drawCanvas.style.cursor = 'default';
  redrawDraw(); updateSelStat();
  return true;
}
// 도형 좌표를 base(복사본)에서 그대로 되돌림
function restoreShapeFrom(s, base){
  if (base.p1 && s.p1){ s.p1.x = base.p1.x; s.p1.y = base.p1.y; }
  if (base.p2 && s.p2){ s.p2.x = base.p2.x; s.p2.y = base.p2.y; }
  if (typeof base.cx === 'number'){ s.cx = base.cx; s.cy = base.cy; }
  if (base.offset && s.offset){ s.offset.x = base.offset.x; s.offset.y = base.offset.y; }
  if (base.pos && s.pos){ s.pos.x = base.pos.x; s.pos.y = base.pos.y; }
  if (Array.isArray(base.points) && Array.isArray(s.points)){
    s.points.forEach((p,i)=>{ if(base.points[i]){ p.x = base.points[i].x; p.y = base.points[i].y; } });
  }
}
// grab 진행 중 마우스 이동 → 선택 도형을 dx,dy 만큼 (base 기준) 이동
function grabUpdate(mouse){
  if (!grabMode || !grabStart) return;
  let dx = mouse.x - grabStart.x;
  let dy = mouse.y - grabStart.y;
  if (grabAxis === 'x') dy = 0;
  else if (grabAxis === 'y') dx = 0;
  Object.keys(grabBase).forEach(id => {
    const s = shapes.find(x => x.id === Number(id));
    if (!s) return;
    // base 위치로 되돌린 뒤 dx,dy 적용 (절대 이동)
    restoreShapeFrom(s, grabBase[id]);
    translateShapeBy(s, dx, dy);
  });
  redrawDraw();
  const mmX = (dx * mmPerPixel).toFixed(2), mmY = (dy * mmPerPixel).toFixed(2);
  const axisTxt = grabAxis === 'x' ? ' [X축]' : grabAxis === 'y' ? ' [Y축]' : '';
  document.getElementById('statusHint').textContent =
    `↔ 이동${axisTxt}: ΔX=${mmX}, ΔY=${mmY} mm · X/Y=축제한 / 좌클릭=확정 / Esc=취소`;
}

// ====== 선택한 선에서 이어 그리기 (v7.2) ======
// 도형의 끝점들을 추출 (선=2개, 사각형=4코너, 원=중심, 호=양끝, 타원=중심)
function getShapeEndpoints(s) {
  if (s.type === 'line') return [{x:s.p1.x, y:s.p1.y, label:'start'}, {x:s.p2.x, y:s.p2.y, label:'end'}];
  if (s.type === 'rect') {
    const x1 = Math.min(s.p1.x, s.p2.x), x2 = Math.max(s.p1.x, s.p2.x);
    const y1 = Math.min(s.p1.y, s.p2.y), y2 = Math.max(s.p1.y, s.p2.y);
    return [{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}];
  }
  if (s.type === 'arc') {
    return [
      {x: s.cx + s.r*Math.cos(s.startAngle), y: s.cy + s.r*Math.sin(s.startAngle), label:'start'},
      {x: s.cx + s.r*Math.cos(s.endAngle), y: s.cy + s.r*Math.sin(s.endAngle), label:'end'}
    ];
  }
  if (s.type === 'circle') return [{x:s.p1.x, y:s.p1.y, label:'center'}];
  if (s.type === 'ellipse') return [{x:s.cx, y:s.cy, label:'center'}];
  return [];
}

// "끝점에서 이어 그리기" - 선택된 도형의 끝점부터 작도 시작
document.getElementById('btnContinueFromSel').addEventListener('click', () => {
  if (selectedIds.size === 0) {
    alert('먼저 [🔲 선택] 도구로 이어그릴 시작이 될 선을 클릭해주세요.');
    return;
  }
  if (selectedIds.size > 1) {
    alert('1개의 선만 선택해주세요. (현재 ' + selectedIds.size + '개 선택됨)');
    return;
  }
  
  // 선택된 도형 찾기
  const sId = Array.from(selectedIds)[0];
  const s = shapes.find(x => x.id === sId);
  if (!s) return;
  
  if (s.type === 'circle' || s.type === 'ellipse') {
    alert('선/사각형/호의 끝점에서만 이어 그릴 수 있습니다.');
    return;
  }
  
  // 끝점 추출
  const endpoints = getShapeEndpoints(s);
  if (endpoints.length === 0) return;
  
  // 끝점이 2개면 양쪽 모두 표시하고 사용자 선택
  let chosenPt;
  if (endpoints.length === 2) {
    chosenPt = pickEndpointInteractive(endpoints, s);
    if (!chosenPt) return;
    finishContinueFromPoint(chosenPt);
  } else if (endpoints.length > 2) {
    // 사각형 등 코너 여러개
    chosenPt = pickEndpointInteractive(endpoints, s);
    if (!chosenPt) return;
    finishContinueFromPoint(chosenPt);
  } else {
    finishContinueFromPoint(endpoints[0]);
  }
});

// 끝점 인터랙티브 선택: 잠시 화면에 점 표시 후 사용자가 클릭
function pickEndpointInteractive(endpoints, sourceShape) {
  // 끝점들을 화면에 강조 표시
  endpointPickState = { endpoints, callback: null };
  drawEndpointPicker(endpoints);
  document.getElementById('statusHint').textContent = 
    '🎯 이어그릴 끝점을 클릭하세요 (강조된 녹색 원 중 하나) / ESC=취소';
  
  // Promise 방식이 아닌 콜백 방식으로 처리하기 어려우니, 
  // 간단히 동기 prompt 또는 자동 선택으로 변경
  // → 더 간단한 UX: 화면 표시 후 다음 클릭으로 끝점 선택
  
  // 실제 동작: 사용자가 다음 클릭하면 가장 가까운 끝점으로 자동 선택
  return null;  // 일단 비동기로 처리
}

// drawEndpointPicker: 끝점을 강조 표시
function drawEndpointPicker(endpoints) {
  preCtx.clearRect(0, 0, baseW, baseH);
  preCtx.save();
  endpoints.forEach((p, i) => {
    preCtx.strokeStyle = '#16a085';
    preCtx.fillStyle = 'rgba(22, 160, 133, 0.4)';
    preCtx.lineWidth = 2;
    preCtx.beginPath();
    preCtx.arc(p.x, p.y, 10, 0, Math.PI*2);
    preCtx.fill();
    preCtx.stroke();
    // 라벨
    preCtx.fillStyle = '#16a085';
    preCtx.font = 'bold 11px sans-serif';
    preCtx.fillText(`P${i+1}`, p.x + 12, p.y - 8);
  });
  preCtx.restore();
}

// 다음 클릭으로 끝점 선택 처리 (mousemove/click 핸들러에서 분기 필요)
function finishContinueFromPoint(pt) {
  // 선택 해제하고 line 도구로 전환
  selectedIds.clear();
  updateSelStat();
  redrawDraw();
  
  // 도구를 line으로 전환
  document.querySelectorAll('.tool-menu-item').forEach(b => b.classList.remove('active'));
  const lineBtn = document.querySelector('.tool-menu-item[data-tool="line"]');
  if (lineBtn) lineBtn.classList.add('active');
  tool = 'line';
  drawCanvas.style.cursor = 'crosshair';
  
  // firstClick 설정 → 다음 클릭이 두 번째 점
  firstClick = {x: pt.x, y: pt.y};
  
  // 연속선 모드 자동 ON
  if (!continuousMode) {
    continuousMode = true;
    document.getElementById('btnContinuous').classList.add('active');
    document.getElementById('btnContinuous').textContent = '⛓ 연속선 ON';
  }
  
  updateToolStatus();
  
  // 시작점 표시
  preCtx.clearRect(0, 0, baseW, baseH);
  preCtx.save();
  preCtx.fillStyle = '#16a085';
  preCtx.strokeStyle = '#fff';
  preCtx.lineWidth = 2;
  preCtx.beginPath();
  preCtx.arc(pt.x, pt.y, 6, 0, Math.PI*2);
  preCtx.fill();
  preCtx.stroke();
  preCtx.restore();
  
  document.getElementById('statusHint').textContent = 
    '▶ 시작점 설정됨 - 다음 클릭으로 선 추가 / ESC=중지';
}

// 끝점 픽킹 모드의 클릭 처리: drawCanvas click 핸들러에 추가
// 가장 가까운 끝점 자동 선택
function handleEndpointPick(p) {
  if (!endpointPickState) return false;
  let best = null, bestD = Infinity;
  for (const pt of endpointPickState.endpoints) {
    const d = Math.hypot(p.x - pt.x, p.y - pt.y);
    if (d < bestD) { bestD = d; best = pt; }
  }
  if (best) {
    endpointPickState = null;
    finishContinueFromPoint(best);
  }
  return true;
}

// 위의 pickEndpointInteractive를 단순화 - 끝점 1개면 바로, 여러개면 픽킹 모드
document.getElementById('btnContinueFromSel').removeEventListener('click', () => {});
document.getElementById('btnContinueFromSel').onclick = () => {
  if (selectedIds.size === 0) {
    alert('먼저 [🔲 선택] 도구로 이어그릴 시작이 될 선을 클릭해주세요.');
    return;
  }
  if (selectedIds.size > 1) {
    alert('1개의 도형만 선택해주세요.');
    return;
  }
  const sId = Array.from(selectedIds)[0];
  const s = shapes.find(x => x.id === sId);
  if (!s) return;
  if (s.type === 'circle' || s.type === 'ellipse') {
    alert('선/사각형/호의 끝점에서만 이어 그릴 수 있습니다.');
    return;
  }
  const endpoints = getShapeEndpoints(s);
  if (endpoints.length === 0) return;
  if (endpoints.length === 1) {
    finishContinueFromPoint(endpoints[0]);
  } else {
    // 끝점 표시하고 사용자 클릭 대기
    endpointPickState = { endpoints };
    drawEndpointPicker(endpoints);
    document.getElementById('statusHint').textContent = 
      '🎯 이어그릴 끝점을 클릭하세요 (녹색 원 중 하나) / ESC=취소';
  }
};

// ====== 선 연결 (v7.2) ======
// 선택된 2개 이상의 선들의 가장 가까운 끝점들끼리 새 연결선 추가
document.getElementById('btnConnectSel').addEventListener('click', () => {
  if (selectedIds.size < 2) {
    alert('연결할 선 2개 이상을 [🔲 선택]으로 선택하세요. (현재 ' + selectedIds.size + '개)');
    return;
  }
  
  // 선택된 도형들에서 line만 추출 (호/원/사각형은 추후 확장)
  const selectedShapes = shapes.filter(s => selectedIds.has(s.id));
  const lineShapes = selectedShapes.filter(s => s.type === 'line' || s.type === 'arc');
  
  if (lineShapes.length < 2) {
    alert('연결 가능한 선/호가 2개 이상 필요합니다.');
    return;
  }
  
  // 각 도형의 끝점 목록
  const items = lineShapes.map(s => ({
    shape: s,
    endpoints: getShapeEndpoints(s)
  }));
  
  // 모든 도형 쌍에 대해 가장 가까운 끝점 쌍 찾기, 연결선 생성
  // 그리디: 가장 가까운 두 도형부터 시작해서 체인 형태로 연결
  
  // 모든 끝점 쌍의 거리를 계산
  const pairs = [];  // {i, j, pi, pj, dist} (i,j = 도형 인덱스, pi,pj = 끝점)
  for (let i = 0; i < items.length; i++) {
    for (let j = i+1; j < items.length; j++) {
      for (const pi of items[i].endpoints) {
        for (const pj of items[j].endpoints) {
          const d = Math.hypot(pi.x - pj.x, pi.y - pj.y);
          pairs.push({i, j, pi: {x:pi.x, y:pi.y}, pj: {x:pj.x, y:pj.y}, dist: d});
        }
      }
    }
  }
  
  pairs.sort((a, b) => a.dist - b.dist);
  
  // 각 도형이 이미 연결되었는지 추적 (Union-Find)
  const parent = items.map((_, idx) => idx);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) { parent[ra] = rb; return true; } return false; }
  
  // 도형 끝점이 이미 사용되었는지
  const usedEndpoint = new Map();  // key: "i_x_y" → true
  function endpointKey(idx, p) { return `${idx}_${p.x.toFixed(1)}_${p.y.toFixed(1)}`; }
  
  const newConnections = [];  // 생성할 연결선들
  
  // MST 방식: 모든 도형이 하나의 트리로 연결될 때까지
  for (const pair of pairs) {
    if (newConnections.length >= items.length - 1) break;  // 충분
    
    const k1 = endpointKey(pair.i, pair.pi);
    const k2 = endpointKey(pair.j, pair.pj);
    if (usedEndpoint.get(k1) || usedEndpoint.get(k2)) continue;
    
    // 같은 컴포넌트면 스킵 (사이클 방지)
    if (find(pair.i) === find(pair.j)) continue;
    
    // 0 거리면 이미 닿아있음 - 연결선 안 만듦 (단지 union)
    if (pair.dist < 1) {
      union(pair.i, pair.j);
      continue;
    }
    
    union(pair.i, pair.j);
    usedEndpoint.set(k1, true);
    usedEndpoint.set(k2, true);
    newConnections.push({p1: pair.pi, p2: pair.pj});
  }
  
  if (newConnections.length === 0) {
    alert('연결할 새 선이 없습니다 (이미 모두 닿아있거나 연결됨).');
    return;
  }
  
  // 연결선 추가 (현재 선 스타일 사용)
  const stroke = document.getElementById('strokeColor').value;
  const strokeWidth = parseInt(document.getElementById('strokeWidth').value);
  
  newConnections.forEach(c => {
    shapes.push({
      id: ++shapeIdSeq, type: 'line',
      p1: {x: c.p1.x, y: c.p1.y}, p2: {x: c.p2.x, y: c.p2.y},
      stroke, strokeWidth
    });
  });
  
  redoStack = []; pushHistory();
  redrawDraw();
  updateCount();
  
  alert(`✓ ${newConnections.length}개의 연결선이 생성되었습니다.`);
});

// ====== 통합 도형 속성 편집 패널 (Rev.7.4) ======
let editingShapeId = null;

function updateShapePropPanel() {
  const panel = document.getElementById('shapePropPanel');
  
  // 호 편집 ID는 별도로 관리되었으나 editingArcId는 호일 때만 사용
  editingArcId = null;
  
  if (selectedIds.size !== 1) {
    panel.style.display = 'none';
    editingShapeId = null;
    return;
  }
  const sId = Array.from(selectedIds)[0];
  const s = shapes.find(x => x.id === sId);
  if (!s) {
    panel.style.display = 'none';
    editingShapeId = null;
    return;
  }
  
  editingShapeId = sId;
  panel.style.display = 'block';
  
  // 모든 필드 숨김 후 해당 도형 필드만 표시
  document.getElementById('propLineFields').style.display = 'none';
  document.getElementById('propRectFields').style.display = 'none';
  document.getElementById('propCircleFields').style.display = 'none';
  document.getElementById('propArcFields').style.display = 'none';
  
  const title = document.getElementById('propPanelTitle');
  const info = document.getElementById('propInfo');
  
  if (s.type === 'line') {
    title.innerHTML = '／ 선 속성 편집';
    document.getElementById('propLineFields').style.display = 'block';
    document.getElementById('lineX1').value = (s.p1.x * mmPerPixel).toFixed(2);
    document.getElementById('lineY1').value = (s.p1.y * mmPerPixel).toFixed(2);
    document.getElementById('lineX2').value = (s.p2.x * mmPerPixel).toFixed(2);
    document.getElementById('lineY2').value = (s.p2.y * mmPerPixel).toFixed(2);
    const dx = (s.p2.x - s.p1.x) * mmPerPixel;
    const dy = (s.p2.y - s.p1.y) * mmPerPixel;
    const len = Math.hypot(dx, dy);
    const ang = ((-Math.atan2(dy, dx) * 180 / Math.PI) % 360 + 360) % 360;
    document.getElementById('lineLen').value = len.toFixed(2);
    document.getElementById('lineAng').value = ang.toFixed(1);
    // Rev.11.42: 상대 이동거리 (info 표시와 동일 부호: ΔY는 위쪽 양수)
    document.getElementById('lineDX').value = dx.toFixed(2);
    document.getElementById('lineDY').value = (-dy).toFixed(2);
    info.innerHTML = `길이: ${len.toFixed(2)} mm / 각도: ${ang.toFixed(1)}°<br>ΔX: ${dx.toFixed(2)}, ΔY: ${(-dy).toFixed(2)} mm`;
  } else if (s.type === 'rect') {
    title.innerHTML = '▭ 사각형 속성 편집';
    document.getElementById('propRectFields').style.display = 'block';
    const x1 = Math.min(s.p1.x, s.p2.x), y1 = Math.min(s.p1.y, s.p2.y);
    const w = Math.abs(s.p2.x - s.p1.x), h = Math.abs(s.p2.y - s.p1.y);
    document.getElementById('rectX').value = (x1 * mmPerPixel).toFixed(2);
    document.getElementById('rectY').value = (y1 * mmPerPixel).toFixed(2);
    document.getElementById('rectW').value = (w * mmPerPixel).toFixed(2);
    document.getElementById('rectH').value = (h * mmPerPixel).toFixed(2);
    info.innerHTML = `면적: ${(w*h*mmPerPixel*mmPerPixel).toFixed(2)} mm²<br>둘레: ${(2*(w+h)*mmPerPixel).toFixed(2)} mm`;
  } else if (s.type === 'circle') {
    title.innerHTML = '○ 원 속성 편집';
    document.getElementById('propCircleFields').style.display = 'block';
    const r = Math.hypot(s.p2.x-s.p1.x, s.p2.y-s.p1.y);
    document.getElementById('circleCx').value = (s.p1.x * mmPerPixel).toFixed(2);
    document.getElementById('circleCy').value = (s.p1.y * mmPerPixel).toFixed(2);
    document.getElementById('circleR').value = (r * mmPerPixel).toFixed(2);
    document.getElementById('circleD').value = (r * 2 * mmPerPixel).toFixed(2);
    info.innerHTML = `면적: ${(Math.PI*r*r*mmPerPixel*mmPerPixel).toFixed(2)} mm²<br>둘레: ${(2*Math.PI*r*mmPerPixel).toFixed(2)} mm`;
  } else if (s.type === 'arc') {
    title.innerHTML = '⌒ 호 속성 편집';
    document.getElementById('propArcFields').style.display = 'block';
    editingArcId = sId;
    document.getElementById('arcCenterX').value = (s.cx * mmPerPixel).toFixed(2);
    document.getElementById('arcCenterY').value = (s.cy * mmPerPixel).toFixed(2);
    document.getElementById('arcRadius').value = (s.r * mmPerPixel).toFixed(2);
    document.getElementById('arcStartDeg').value = radToDispDeg(s.startAngle).toFixed(1);
    document.getElementById('arcEndDeg').value = radToDispDeg(s.endAngle).toFixed(1);
    document.getElementById('arcCcw').value = s.ccw ? 'true' : 'false';
    updateArcSpanInfoIntegrated(s);
  } else {
    panel.style.display = 'none';
    editingShapeId = null;
  }
}

function updateArcSpanInfoIntegrated(s) {
  const sa = ((s.startAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
  const ea = ((s.endAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
  let span = s.ccw ? (sa - ea) : (ea - sa);
  while (span < 0) span += Math.PI*2;
  const spanDeg = span * 180 / Math.PI;
  const arcLen = span * s.r * mmPerPixel;
  document.getElementById('propInfo').innerHTML = 
    `호각도: ${spanDeg.toFixed(1)}° / 호길이: ${arcLen.toFixed(2)} mm`;
}

function radToDispDeg(rad) {
  const deg = -rad * 180 / Math.PI;
  return ((deg % 360) + 360) % 360;
}
function dispDegToRad(deg) {
  return -deg * Math.PI / 180;
}

function applyShapePropToShape() {
  if (!editingShapeId) return;
  const s = shapes.find(x => x.id === editingShapeId);
  if (!s) return;
  
  if (s.type === 'line') {
    // 좌표 입력 우선, 길이/각도 변경시 끝점만 재계산
    const x1 = parseFloat(document.getElementById('lineX1').value);
    const y1 = parseFloat(document.getElementById('lineY1').value);
    const x2 = parseFloat(document.getElementById('lineX2').value);
    const y2 = parseFloat(document.getElementById('lineY2').value);
    if ([x1,y1,x2,y2].some(v=>isNaN(v))) { alert('숫자 형식 오류'); return; }
    s.p1 = { x: x1/mmPerPixel, y: y1/mmPerPixel };
    s.p2 = { x: x2/mmPerPixel, y: y2/mmPerPixel };
  } else if (s.type === 'rect') {
    const x = parseFloat(document.getElementById('rectX').value);
    const y = parseFloat(document.getElementById('rectY').value);
    const w = parseFloat(document.getElementById('rectW').value);
    const h = parseFloat(document.getElementById('rectH').value);
    if ([x,y,w,h].some(v=>isNaN(v)) || w<=0 || h<=0) { alert('숫자 형식 오류'); return; }
    s.p1 = { x: x/mmPerPixel, y: y/mmPerPixel };
    s.p2 = { x: (x+w)/mmPerPixel, y: (y+h)/mmPerPixel };
  } else if (s.type === 'circle') {
    const cx = parseFloat(document.getElementById('circleCx').value);
    const cy = parseFloat(document.getElementById('circleCy').value);
    const r = parseFloat(document.getElementById('circleR').value);
    if ([cx,cy,r].some(v=>isNaN(v)) || r<=0) { alert('숫자 형식 오류'); return; }
    s.p1 = { x: cx/mmPerPixel, y: cy/mmPerPixel };
    s.p2 = { x: (cx+r)/mmPerPixel, y: cy/mmPerPixel };
  } else if (s.type === 'arc') {
    const cx = parseFloat(document.getElementById('arcCenterX').value);
    const cy = parseFloat(document.getElementById('arcCenterY').value);
    const r = parseFloat(document.getElementById('arcRadius').value);
    const startDeg = parseFloat(document.getElementById('arcStartDeg').value);
    const endDeg = parseFloat(document.getElementById('arcEndDeg').value);
    const ccw = document.getElementById('arcCcw').value === 'true';
    if ([cx,cy,r,startDeg,endDeg].some(v=>isNaN(v)) || r<=0) { alert('숫자 형식 오류'); return; }
    s.cx = cx/mmPerPixel; s.cy = cy/mmPerPixel; s.r = r/mmPerPixel;
    s.startAngle = dispDegToRad(startDeg);
    s.endAngle = dispDegToRad(endDeg);
    s.ccw = ccw;
    s.p1 = { x: Math.round(s.cx + s.r*Math.cos(s.startAngle)), y: Math.round(s.cy + s.r*Math.sin(s.startAngle)) };
    s.p2 = { x: Math.round(s.cx + s.r*Math.cos(s.endAngle)), y: Math.round(s.cy + s.r*Math.sin(s.endAngle)) };
  }
  
  updateShapePropPanel();
  redrawDraw();
}

// 선 도구: 길이/각도 입력시 두 번째 점 자동 계산
function applyLineLenAng() {
  if (!editingShapeId) return;
  const s = shapes.find(x => x.id === editingShapeId);
  if (!s || s.type !== 'line') return;
  const x1 = parseFloat(document.getElementById('lineX1').value);
  const y1 = parseFloat(document.getElementById('lineY1').value);
  const len = parseFloat(document.getElementById('lineLen').value);
  const ang = parseFloat(document.getElementById('lineAng').value);
  if ([x1,y1,len,ang].some(v=>isNaN(v))) return;
  // ang은 표시각(위쪽이 +90), 변환
  const radCanvas = -ang * Math.PI / 180;
  const x2 = x1 + len * Math.cos(radCanvas);
  const y2 = y1 + len * Math.sin(radCanvas);
  s.p1 = { x: x1/mmPerPixel, y: y1/mmPerPixel };
  s.p2 = { x: x2/mmPerPixel, y: y2/mmPerPixel };
  document.getElementById('lineX2').value = x2.toFixed(2);
  document.getElementById('lineY2').value = y2.toFixed(2);
  updateShapePropPanel();
  redrawDraw();
  redoStack = []; pushHistory(); // Rev.11.42
}

// Rev.11.42: 선 도구: ΔX/ΔY(상대 이동거리)로 끝점 재계산 (시작점 기준)
function applyLineDelta() {
  if (!editingShapeId) return;
  const s = shapes.find(x => x.id === editingShapeId);
  if (!s || s.type !== 'line') return;
  const x1 = parseFloat(document.getElementById('lineX1').value);
  const y1 = parseFloat(document.getElementById('lineY1').value);
  const dxMm = parseFloat(document.getElementById('lineDX').value);
  const dyMm = parseFloat(document.getElementById('lineDY').value); // 위쪽 양수 표시값
  if ([x1,y1,dxMm,dyMm].some(v=>isNaN(v))) return;
  // 끝점 = 시작점 + ΔX, 시작점 - ΔY(화면 Y는 아래로 +)
  const x2 = x1 + dxMm;
  const y2 = y1 - dyMm;
  s.p1 = { x: x1/mmPerPixel, y: y1/mmPerPixel };
  s.p2 = { x: x2/mmPerPixel, y: y2/mmPerPixel };
  updateShapePropPanel();
  redrawDraw();
  redoStack = []; pushHistory(); // Rev.11.42
}

// 원: 반지름 ↔ 직경 자동 동기화
function applyCircleRD(changed) {
  if (changed === 'R') {
    const r = parseFloat(document.getElementById('circleR').value);
    if (!isNaN(r)) document.getElementById('circleD').value = (r*2).toFixed(2);
  } else if (changed === 'D') {
    const d = parseFloat(document.getElementById('circleD').value);
    if (!isNaN(d)) document.getElementById('circleR').value = (d/2).toFixed(2);
  }
  applyShapePropToShape();
}

// 패널 적용 버튼/이벤트
// Rev.14.2: 선 속성 패널 - 양방향 연장 (같은 각도로 중심 고정 양쪽 균등)
function applyLineExtend(){
  // editingShapeId가 비어도 단일 선택된 선이 있으면 그것을 사용
  let sid = editingShapeId;
  if (sid == null && selectedIds.size === 1) sid = Array.from(selectedIds)[0];
  if (sid == null){ document.getElementById('statusHint').textContent = '⚠ 먼저 연장할 선을 클릭해 선택하세요'; return; }
  const s = shapes.find(x => x.id === sid);
  if (!s){ document.getElementById('statusHint').textContent = '⚠ 선택된 도형을 찾을 수 없습니다'; return; }
  if (s.type !== 'line'){ document.getElementById('statusHint').textContent = '⚠ 직선(line)만 양방향 연장이 가능합니다'; return; }
  editingShapeId = sid;
  const raw = document.getElementById('lineExtEach').value;
  const v = parseFloat(raw);
  if (raw === '' || !isFinite(v)){ document.getElementById('statusHint').textContent = '⚠ 한쪽당 늘릴 길이(mm)를 입력하세요'; return; }
  const dx = s.p2.x - s.p1.x, dy = s.p2.y - s.p1.y;
  const lenPx = Math.hypot(dx, dy);
  if (lenPx < 1e-6){ document.getElementById('statusHint').textContent = '⚠ 길이가 0인 선'; return; }
  const ux = dx/lenPx, uy = dy/lenPx;
  const cx = (s.p1.x + s.p2.x)/2, cy = (s.p1.y + s.p2.y)/2;
  const halfPx = lenPx/2 + (v / mmPerPixel);
  if (halfPx <= 0){ document.getElementById('statusHint').textContent = '⚠ 축소량이 너무 커서 선이 사라집니다'; return; }
  s.p1 = { x: cx - ux*halfPx, y: cy - uy*halfPx };
  s.p2 = { x: cx + ux*halfPx, y: cy + uy*halfPx };
  redoStack = []; pushHistory();
  if (typeof redrawFills === 'function') redrawFills();
  redrawDraw(); updateCount();
  updateShapePropPanel();  // 길이/좌표 갱신
  document.getElementById('lineExtEach').value = '';
  const totalMm = halfPx*2*mmPerPixel;
  document.getElementById('statusHint').textContent =
    `✓ 양방향 연장: 한쪽당 ${v>=0?'+':''}${v}mm → 총 길이 ${totalMm.toFixed(2)}mm`;
}

document.getElementById('btnPropApply').addEventListener('click', applyShapePropToShape);
window.applyLineExtend = applyLineExtend;  // 인라인 onclick 백업
document.getElementById('btnLineExtApply').addEventListener('click', applyLineExtend);
document.getElementById('lineExtEach').addEventListener('keydown', e => {
  if (e.key === 'Enter'){ e.preventDefault(); applyLineExtend(); }
});
document.getElementById('btnPropClose').addEventListener('click', () => {
  document.getElementById('shapePropPanel').style.display = 'none';
  editingShapeId = null;
  editingArcId = null;
});

// Enter 키 및 change 이벤트로 즉시 적용
const propAllFields = ['lineX1','lineY1','lineX2','lineY2',
                        'rectX','rectY','rectW','rectH',
                        'circleCx','circleCy',
                        'arcCenterX','arcCenterY','arcRadius','arcStartDeg','arcEndDeg'];
propAllFields.forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyShapePropToShape(); }
  });
  el.addEventListener('change', applyShapePropToShape);
});
// 선 길이/각도는 별도 처리
['lineLen','lineAng'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return; // Rev.10.10: null safe
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyLineLenAng(); }
  });
  el.addEventListener('change', applyLineLenAng);
});
// Rev.11.42: 선 ΔX/ΔY(상대 이동거리) 별도 처리
['lineDX','lineDY'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyLineDelta(); }
  });
  el.addEventListener('change', applyLineDelta);
});
// 원 R/D 동기화
document.getElementById('circleR').addEventListener('input', () => {
  const r = parseFloat(document.getElementById('circleR').value);
  if (!isNaN(r)) document.getElementById('circleD').value = (r*2).toFixed(2);
});
document.getElementById('circleD').addEventListener('input', () => {
  const d = parseFloat(document.getElementById('circleD').value);
  if (!isNaN(d)) document.getElementById('circleR').value = (d/2).toFixed(2);
});
document.getElementById('arcCcw').addEventListener('change', applyShapePropToShape);

// 호 핸들 그리기
function drawArcHandles(ctx, s) {
  if (s.type !== 'arc') return;
  ctx.save();
  const handleR = 7;
  const sx = s.cx + s.r * Math.cos(s.startAngle);
  const sy = s.cy + s.r * Math.sin(s.startAngle);
  const ex = s.cx + s.r * Math.cos(s.endAngle);
  const ey = s.cy + s.r * Math.sin(s.endAngle);
  
  // 중간 각도
  const sa = s.startAngle, ea = s.endAngle;
  let span = s.ccw ? (sa - ea) : (ea - sa);
  while (span < 0) span += Math.PI*2;
  const midAng = s.ccw ? (sa - span/2) : (sa + span/2);
  const mx = s.cx + s.r * Math.cos(midAng);
  const my = s.cy + s.r * Math.sin(midAng);
  
  // 중심 십자
  ctx.strokeStyle = '#f39c12'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s.cx - 6, s.cy); ctx.lineTo(s.cx + 6, s.cy);
  ctx.moveTo(s.cx, s.cy - 6); ctx.lineTo(s.cx, s.cy + 6);
  ctx.stroke();
  
  // 보조 점선 (반지름 표시)
  ctx.strokeStyle = 'rgba(243,156,18,0.4)';
  ctx.setLineDash([3,3]);
  ctx.beginPath();
  ctx.moveTo(s.cx, s.cy); ctx.lineTo(sx, sy);
  ctx.moveTo(s.cx, s.cy); ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // 핸들들
  drawArcHandle(ctx, sx, sy, handleR, '#27ae60', '시');
  drawArcHandle(ctx, ex, ey, handleR, '#e74c3c', '끝');
  drawArcHandle(ctx, mx, my, handleR, '#f39c12', '');
  
  ctx.restore();
}

function drawArcHandle(ctx, x, y, r, color, label) {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI*2);
  ctx.fill();
  ctx.stroke();
  if (label) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
}

function hitArcHandle(p, s) {
  if (s.type !== 'arc') return null;
  const handleR = 10;
  const sx = s.cx + s.r * Math.cos(s.startAngle);
  const sy = s.cy + s.r * Math.sin(s.startAngle);
  const ex = s.cx + s.r * Math.cos(s.endAngle);
  const ey = s.cy + s.r * Math.sin(s.endAngle);
  const sa = s.startAngle, ea = s.endAngle;
  let span = s.ccw ? (sa - ea) : (ea - sa);
  while (span < 0) span += Math.PI*2;
  const midAng = s.ccw ? (sa - span/2) : (sa + span/2);
  const mx = s.cx + s.r * Math.cos(midAng);
  const my = s.cy + s.r * Math.sin(midAng);
  if (Math.hypot(p.x - sx, p.y - sy) <= handleR) return 'start';
  if (Math.hypot(p.x - ex, p.y - ey) <= handleR) return 'end';
  if (Math.hypot(p.x - mx, p.y - my) <= handleR) return 'middle';
  return null;
}

// 호 핸들 드래그 처리
function handleArcHandleDrag(p) {
  if (!arcHandleDrag) return;
  const s = shapes.find(x => x.id === arcHandleDrag.shapeId);
  if (!s || s.type !== 'arc') return;
  
  const mouseAng = Math.atan2(p.y - s.cy, p.x - s.cx);
  const mouseDist = Math.hypot(p.x - s.cx, p.y - s.cy);
  
  if (arcHandleDrag.type === 'start') {
    // 시작 각도 변경 (반지름도 함께 조정)
    s.startAngle = mouseAng;
    if (mouseDist > 5) s.r = mouseDist;
  } else if (arcHandleDrag.type === 'end') {
    // 끝 각도 변경
    s.endAngle = mouseAng;
    if (mouseDist > 5) s.r = mouseDist;
  } else if (arcHandleDrag.type === 'middle') {
    // 중간점 드래그: 호의 휨 방향 변경
    // 마우스 위치가 시작각-끝각의 시계/반시계 어느 쪽에 있는지에 따라 ccw 토글
    const ns = ((s.startAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    const ne = ((s.endAngle % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    const nm = ((mouseAng % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
    
    let cw_s_to_m = nm - ns; if (cw_s_to_m < 0) cw_s_to_m += Math.PI*2;
    let cw_s_to_e = ne - ns; if (cw_s_to_e < 0) cw_s_to_e += Math.PI*2;
    const midOnCWPath = cw_s_to_m < cw_s_to_e;
    s.ccw = !midOnCWPath;
    
    // 마우스 거리에 따라 반지름 조정도 가능 (선택적)
    if (mouseDist > 5) s.r = mouseDist;
  }
  
  // p1, p2 갱신
  s.p1 = { x: Math.round(s.cx + s.r*Math.cos(s.startAngle)), y: Math.round(s.cy + s.r*Math.sin(s.startAngle)) };
  s.p2 = { x: Math.round(s.cx + s.r*Math.cos(s.endAngle)), y: Math.round(s.cy + s.r*Math.sin(s.endAngle)) };
  
  redrawDraw();
  
  // 실시간 패널 값 갱신
  document.getElementById('arcRadius').value = (s.r * mmPerPixel).toFixed(2);
  document.getElementById('arcStartDeg').value = radToDispDeg(s.startAngle).toFixed(1);
  document.getElementById('arcEndDeg').value = radToDispDeg(s.endAngle).toFixed(1);
  document.getElementById('arcCcw').value = s.ccw ? 'true' : 'false';
  updateArcSpanInfoIntegrated(s);
  
  // 상태바
  let spanRad = s.ccw ? (s.startAngle - s.endAngle) : (s.endAngle - s.startAngle);
  while (spanRad < 0) spanRad += Math.PI*2;
  const spanDeg = spanRad * 180 / Math.PI;
  document.getElementById('statusHint').textContent = 
    `⌒ 호 편집 중: R=${(s.r*mmPerPixel).toFixed(1)}mm, 회전각=${spanDeg.toFixed(1)}° / 마우스 놓으면 확정`;
}

// Rev.13.2: 배경 캔버스만 독립 CSS scale (작업 캔버스와 무관)
function applyBgZoom() {
  bgCanvas.style.transformOrigin = bgZoomOriginX + '% ' + bgZoomOriginY + '%';
  bgCanvas.style.transform = 'scale(' + bgZoom + ')';
}
function redrawAll() { redrawBg(); redrawFills(); redrawDraw(); }
function redrawBg() {
  bgCtx.clearRect(0,0,baseW,baseH);
  if (bgImage) {
    bgCtx.save();
    bgCtx.globalAlpha = bgImageOpacity;
    // Rev.11.10: 배경 이미지 중심을 기준으로 스케일 + 오프셋 적용
    const dw = baseW * bgImageScale;
    const dh = baseH * bgImageScale;
    const dx = bgImageOffsetX + (baseW - dw) / 2; // 중심 유지하며 스케일
    const dy = bgImageOffsetY + (baseH - dh) / 2;
    bgCtx.drawImage(bgImage, dx, dy, dw, dh);
    bgCtx.restore();
    bgCtx.globalAlpha = 1;
  }
  // Rev.11.24: 눈금자(그리드)
  if (gridOn) drawGrid();
}

// Rev.11.24: mm 기준 그리드 + 눈금 그리기 (배경 캔버스)
function drawGrid(){
  const stepPx = gridSpacingMm / mmPerPixel; // mm → px
  if (stepPx < 4) return; // 너무 촘촘하면 생략
  bgCtx.save();
  // 가는 격자선
  bgCtx.strokeStyle = 'rgba(120,140,170,0.18)';
  bgCtx.lineWidth = 1;
  bgCtx.beginPath();
  for (let x = 0; x <= baseW; x += stepPx){
    bgCtx.moveTo(x, 0); bgCtx.lineTo(x, baseH);
  }
  for (let y = 0; y <= baseH; y += stepPx){
    bgCtx.moveTo(0, y); bgCtx.lineTo(baseW, y);
  }
  bgCtx.stroke();
  // 굵은 선 (5칸마다 = 50mm 기준)
  bgCtx.strokeStyle = 'rgba(120,140,170,0.38)';
  bgCtx.lineWidth = 1;
  bgCtx.beginPath();
  let i = 0;
  for (let x = 0; x <= baseW; x += stepPx, i++){
    if (i % 5 === 0){ bgCtx.moveTo(x, 0); bgCtx.lineTo(x, baseH); }
  }
  i = 0;
  for (let y = 0; y <= baseH; y += stepPx, i++){
    if (i % 5 === 0){ bgCtx.moveTo(0, y); bgCtx.lineTo(baseW, y); }
  }
  bgCtx.stroke();
  // 눈금 라벨 (상단 가로자, 좌측 세로자) - 50mm 간격
  bgCtx.fillStyle = 'rgba(160,180,210,0.7)';
  bgCtx.font = '10px monospace';
  bgCtx.textBaseline = 'top';
  i = 0;
  for (let x = 0; x <= baseW; x += stepPx, i++){
    if (i % 5 === 0 && x > 0){
      const mm = (x * mmPerPixel).toFixed(0);
      bgCtx.fillText(mm, x + 2, 2);
    }
  }
  i = 0;
  bgCtx.textBaseline = 'middle';
  for (let y = 0; y <= baseH; y += stepPx, i++){
    if (i % 5 === 0 && y > 0){
      const mm = (y * mmPerPixel).toFixed(0);
      bgCtx.fillText(mm, 2, y + 6);
    }
  }
  bgCtx.restore();
}
function redrawFills() {
  fillCtx.clearRect(0,0,baseW,baseH);
  fills.forEach(f => drawFill(fillCtx, f));
}
function redrawDraw() {
  drawCtx.clearRect(0,0,baseW,baseH);
  shapes.forEach(s => drawShape(drawCtx, s, selectedIds.has(s.id)));
  drawRotationAxis(drawCtx);
  // 선택된 호의 핸들 표시 (마지막에 그려서 위에)
  if (editingArcId !== null) {
    const s = shapes.find(x => x.id === editingArcId);
    if (s) drawArcHandles(drawCtx, s);
  }
  // Rev.11.12: 단일 선택된 선/사각형의 끝점 그립 표시 (드래그로 연장/이동)
  drawEndpointGrips(drawCtx);
}

// Rev.11.18: 점 찍기/연결 시 스냅 대상점에 흡착 (끝점/코너/점/원중심/배경)
function snapPointForVertex(p){
  if (!snapMode) return p;
  // Rev.11.29: 화면 픽셀 기준 반경 (커서 근처만)
  const radius = (parseInt(document.getElementById('snapRadius').value) || 15) / (zoom || 1);
  const cand = [];
  shapes.forEach(o => {
    if (o.type === 'point' && o.p1){ cand.push(o.p1); }
    else if (o.type === 'line' && o.p1 && o.p2){ cand.push(o.p1, o.p2); }
    else if (o.type === 'rect' && o.p1 && o.p2){
      cand.push(o.p1, {x:o.p2.x,y:o.p1.y}, o.p2, {x:o.p1.x,y:o.p2.y});
    }
    else if (o.type === 'circle'){ cand.push({x:o.p1.x, y:o.p1.y}); }
    else if (o.type === 'arc'){
      cand.push({x:o.cx + o.r*Math.cos(o.startAngle), y:o.cy + o.r*Math.sin(o.startAngle)});
      cand.push({x:o.cx + o.r*Math.cos(o.endAngle), y:o.cy + o.r*Math.sin(o.endAngle)});
      cand.push({x:o.cx, y:o.cy});
    }
  });
  if (typeof snapPoints !== 'undefined' && snapPoints.length){
    snapPoints.forEach(sp => cand.push(sp));
  }
  let best = Infinity, hit = null;
  cand.forEach(c => {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < radius && d < best){ best = d; hit = c; }
  });
  return hit ? { x: hit.x, y: hit.y } : p;
}

// Rev.11.12: 선택 도형의 끝점 그립 좌표 목록 반환
//   반환: [{x, y, shapeId, key}]  key = 'p1'|'p2'|'c0'~'c3'(사각 코너)
function getGripPoints(){
  const grips = [];
  if (selectedIds.size !== 1) return grips;
  const id = [...selectedIds][0];
  const s = shapes.find(x => x.id === id);
  if (!s) return grips;
  if (s.type === 'line' && s.p1 && s.p2){
    grips.push({x: s.p1.x, y: s.p1.y, shapeId: id, key: 'p1'});
    grips.push({x: s.p2.x, y: s.p2.y, shapeId: id, key: 'p2'});
  } else if (s.type === 'rect' && s.p1 && s.p2){
    // 사각형 4코너
    const x1 = s.p1.x, y1 = s.p1.y, x2 = s.p2.x, y2 = s.p2.y;
    grips.push({x: x1, y: y1, shapeId: id, key: 'c0'}); // p1
    grips.push({x: x2, y: y1, shapeId: id, key: 'c1'});
    grips.push({x: x2, y: y2, shapeId: id, key: 'c2'}); // p2
    grips.push({x: x1, y: y2, shapeId: id, key: 'c3'});
  }
  return grips;
}

// Rev.11.12: 끝점 그립 그리기 (화면 줌 보정)
function drawEndpointGrips(ctx){
  const grips = getGripPoints();
  if (grips.length === 0) return;
  const r = 5 / zoom; // 화면상 약 5px 유지
  ctx.save();
  ctx.fillStyle = '#00d4ff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5 / zoom;
  grips.forEach(g => {
    ctx.beginPath();
    ctx.rect(g.x - r, g.y - r, r*2, r*2);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

// Rev.11.12: 마우스 위치가 어떤 그립 위인지 검사 (히트 시 그립 객체 반환)
function hitGrip(p){
  const grips = getGripPoints();
  const tol = 8 / zoom; // 클릭 허용 반경
  for (const g of grips){
    if (Math.abs(p.x - g.x) <= tol && Math.abs(p.y - g.y) <= tol) return g;
  }
  return null;
}

// Rev.11.12: 그립 키에 따라 도형 좌표 갱신
//   선: p1/p2 직접 이동 (연장 효과)
//   사각형: 코너 이동 시 직사각형 유지 (인접 코너의 공유 좌표도 함께 이동)
function applyGripMove(s, key, nx, ny){
  if (s.type === 'line'){
    if (key === 'p1'){ s.p1.x = nx; s.p1.y = ny; }
    else if (key === 'p2'){ s.p2.x = nx; s.p2.y = ny; }
  } else if (s.type === 'rect'){
    // p1=(x1,y1) 좌상, p2=(x2,y2) 우하 기준으로 코너별 갱신
    // c0=p1, c1=(x2,y1), c2=p2, c3=(x1,y2)
    if (key === 'c0'){ s.p1.x = nx; s.p1.y = ny; }
    else if (key === 'c1'){ s.p2.x = nx; s.p1.y = ny; }
    else if (key === 'c2'){ s.p2.x = nx; s.p2.y = ny; }
    else if (key === 'c3'){ s.p1.x = nx; s.p2.y = ny; }
  }
}
function updateCount() {
  document.getElementById('statusCount').textContent = shapes.length;
  document.getElementById('fillCount').textContent = fills.length;
}
function updateSelStat() {
  document.getElementById('statusSel').textContent = selectedIds.size;
  updateShapePropPanel();  // 통합 속성 패널 갱신 (선/사각형/원/호 모두)
  updateSelActionBar();    // Rev.10.11: 선택 액션 바 갱신
}

/* ===== Rev.10.11: 선택 액션 바 ===== */
// 캔버스 스크롤 시 액션 바 위치 갱신
(function(){
  const wrap = document.getElementById('canvasWrap');
  if (wrap) {
    wrap.addEventListener('scroll', () => {
      if (typeof updateSelActionBar === 'function') updateSelActionBar();
    });
  }
  window.addEventListener('resize', () => {
    if (typeof updateSelActionBar === 'function') updateSelActionBar();
  });
})();

function updateSelActionBar() {
  // Rev.11.14: 선택 액션 바 제거됨. 선택 0개가 되면 이동 거리 패널만 닫음.
  if (selectedIds.size === 0) {
    closeMoveDeltaPanel();
  }
}

function positionSelActionBar() {
  // Rev.11.14: 액션 바 제거됨 - no-op
}

function sabClearSelection() {
  selectedIds.clear();
  updateSelStat();
  redrawDraw();
  closeMoveDeltaPanel(); // Rev.11.9
}

function sabDuplicate() {
  if (selectedIds.size === 0) return;
  const newIds = new Set();
  const offset = 20; // 우하 20px 이동
  const newShapes = [];
  selectedIds.forEach(id => {
    const s = shapes.find(x => x.id === id);
    if (!s) return;
    const copy = JSON.parse(JSON.stringify(s));
    copy.id = ++shapeIdSeq;
    // 좌표 이동
    if (copy.p1) { copy.p1.x += offset; copy.p1.y += offset; }
    if (copy.p2) { copy.p2.x += offset; copy.p2.y += offset; }
    if (copy.cx !== undefined) copy.cx += offset;
    if (copy.cy !== undefined) copy.cy += offset;
    newShapes.push(copy);
    newIds.add(copy.id);
  });
  newShapes.forEach(s => shapes.push(s));
  selectedIds.clear();
  newIds.forEach(id => selectedIds.add(id));
  redoStack = []; pushHistory();
  redrawDraw();
  updateCount();
  updateSelStat();
  // Rev.11.9: 복제 직후 이동 거리 패널 표시 (기준점 = 복제 직후 위치)
  captureMoveDeltaBase();
  showMoveDeltaPanel(offset * mmPerPixel, offset * mmPerPixel);
}

// Rev.11.13: 제자리 복제 (Shift+Ctrl+E) - 동일 좌표에 복제 후 바로 드래그/수치 이동
function duplicateInPlace() {
  if (selectedIds.size === 0) {
    document.getElementById('statusHint').textContent = '복제할 도형을 먼저 선택하세요';
    return;
  }
  const newIds = new Set();
  const newShapes = [];
  selectedIds.forEach(id => {
    const s = shapes.find(x => x.id === id);
    if (!s) return;
    const copy = JSON.parse(JSON.stringify(s));
    copy.id = ++shapeIdSeq;
    // 오프셋 없음 = 동일 좌표
    newShapes.push(copy);
    newIds.add(copy.id);
  });
  newShapes.forEach(s => shapes.push(s));
  selectedIds.clear();
  newIds.forEach(id => selectedIds.add(id));
  redoStack = []; pushHistory();
  // 선택 도구로 전환해서 즉시 드래그 가능하게
  if (tool !== 'select') {
    const selBtn = document.querySelector('.tool-menu-item[data-tool="select"]');
    if (selBtn) selBtn.click();
  }
  redrawDraw();
  updateCount();
  updateSelStat();
  // 이동 거리 패널: 기준점=제자리, ΔX/ΔY=0 → 드래그하거나 수치 입력으로 이동
  captureMoveDeltaBase();
  showMoveDeltaPanel(0, 0);
  document.getElementById('statusHint').textContent =
    `📋 제자리 복제 완료 (${newIds.size}개) · 드래그 또는 이동거리 입력으로 옮기세요`;
}

// Rev.11.14: Ctrl+C - 선택 도형을 클립보드 버퍼에 복사
function copySelectedToClipboard(){
  if (selectedIds.size === 0){
    document.getElementById('statusHint').textContent = '복사할 도형을 먼저 선택하세요';
    return;
  }
  clipboardShapes = [];
  selectedIds.forEach(id => {
    const s = shapes.find(x => x.id === id);
    if (s) clipboardShapes.push(JSON.parse(JSON.stringify(s)));
  });
  pasteCount = 0; // 새로 복사하면 붙여넣기 오프셋 리셋
  document.getElementById('statusHint').textContent =
    `📋 ${clipboardShapes.length}개 도형 복사됨 (Ctrl+V로 붙여넣기)`;
}

// Rev.11.14: Ctrl+V - 클립보드 도형을 약간 오프셋해서 붙여넣기 (연속 시 누적)
function pasteClipboard(){
  if (!clipboardShapes || clipboardShapes.length === 0){
    document.getElementById('statusHint').textContent = '붙여넣을 도형이 없습니다 (먼저 Ctrl+C)';
    return;
  }
  // Rev.11.39: 블렌더식 - 동일 위치에 복사본 생성 (offset 0)
  const newIds = new Set();
  clipboardShapes.forEach(src => {
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = ++shapeIdSeq;
    shapes.push(copy);
    newIds.add(copy.id);
  });
  selectedIds.clear();
  newIds.forEach(id => selectedIds.add(id));
  redoStack = []; pushHistory();
  // 선택 도구로 전환해 바로 이동/드래그(G) 가능
  if (tool !== 'select'){
    const selBtn = document.querySelector('.tool-menu-item[data-tool="select"]');
    if (selBtn) selBtn.click();
  }
  redrawDraw();
  updateCount();
  updateSelStat();
  document.getElementById('statusHint').textContent =
    `📋 ${newIds.size}개 제자리 붙여넣기 · G=이동(X/Y축 제한) / 드래그로 옮기기`;
}

// ===== Rev.11.9: 이동 거리 패널 =====
// 현재 선택 도형들의 좌표를 기준 스냅샷으로 저장
function captureMoveDeltaBase(){
  moveDeltaBase = {};
  selectedIds.forEach(id => {
    const s = shapes.find(x => x.id === id);
    if (s) moveDeltaBase[id] = JSON.parse(JSON.stringify(s));
  });
}

// 패널 표시 + 현재 ΔX/ΔY 값 채움
function showMoveDeltaPanel(dxMm, dyMm){
  const panel = document.getElementById('moveDeltaPanel');
  if (!panel) return;
  if (selectedIds.size === 0) return;
  document.getElementById('mdpDX').value = (dxMm || 0).toFixed(2);
  document.getElementById('mdpDY').value = (dyMm || 0).toFixed(2);
  panel.classList.add('show');
}

function closeMoveDeltaPanel(){
  const panel = document.getElementById('moveDeltaPanel');
  if (panel) panel.classList.remove('show');
  moveDeltaBase = null;
}

// 드래그 이동 중 패널 값 실시간 갱신 (기준 스냅샷 대비 현재 위치 차이)
function updateMoveDeltaPanelLive(){
  const panel = document.getElementById('moveDeltaPanel');
  if (!panel || !panel.classList.contains('show') || !moveDeltaBase) return;
  // Rev.11.13: 사용자가 입력란에 수식을 타이핑 중이면 덮어쓰지 않음
  const ae = document.activeElement;
  if (ae && (ae.id === 'mdpDX' || ae.id === 'mdpDY')) return;
  // 선택된 첫 도형의 기준 대비 현재 이동량 계산
  let dxPx = 0, dyPx = 0, found = false;
  for (const id of selectedIds){
    const cur = shapes.find(x => x.id === id);
    const base = moveDeltaBase[id];
    if (cur && base){
      // p1 우선, 없으면 cx/cy, 없으면 폴리라인 첫 점
      if (cur.p1 && base.p1){ dxPx = cur.p1.x - base.p1.x; dyPx = cur.p1.y - base.p1.y; found = true; break; }
      if (cur.cx !== undefined && base.cx !== undefined){ dxPx = cur.cx - base.cx; dyPx = cur.cy - base.cy; found = true; break; }
      if (Array.isArray(cur.points) && Array.isArray(base.points) && cur.points.length && base.points.length){
        dxPx = cur.points[0].x - base.points[0].x; dyPx = cur.points[0].y - base.points[0].y; found = true; break;
      }
    }
  }
  if (!found) return;
  document.getElementById('mdpDX').value = (dxPx * mmPerPixel).toFixed(2);
  document.getElementById('mdpDY').value = (dyPx * mmPerPixel).toFixed(2);
}

// Rev.11.13: 안전한 사칙연산 수식 평가 (예: "100.52-100.23")
//   숫자, + - * / ( ) . 공백만 허용. eval 미사용.
function evalExpr(str){
  if (str === null || str === undefined) return NaN;
  let t = String(str).trim();
  if (t === '') return NaN;
  // 허용 문자만 남기고 검사
  if (!/^[\d+\-*/().\s]+$/.test(t)) return NaN;
  try {
    // Function 생성자로 안전하게 산술만 평가 (식별자/문자 없음이 위에서 보장됨)
    const v = Function('"use strict"; return (' + t + ');')();
    return (typeof v === 'number' && isFinite(v)) ? v : NaN;
  } catch(e){ return NaN; }
}

// 입력된 ΔX/ΔY(mm)를 기준 스냅샷에 적용 → 선택 도형을 절대 오프셋으로 이동
function applyMoveDelta(){
  if (!moveDeltaBase){
    // 기준이 없으면 현재 위치를 기준으로 새로 잡음
    captureMoveDeltaBase();
  }
  // Rev.11.13: 수식 입력 허용 (1/100mm 단위)
  const dxMm = evalExpr(document.getElementById('mdpDX').value);
  const dyMm = evalExpr(document.getElementById('mdpDY').value);
  if (isNaN(dxMm) || isNaN(dyMm)){
    document.getElementById('statusHint').textContent = '숫자 또는 수식을 입력하세요 (예: 100.52-100.23)';
    return;
  }
  // 계산 결과를 입력란에 다시 표시 (1/100mm = 소수점 2자리)
  document.getElementById('mdpDX').value = dxMm.toFixed(2);
  document.getElementById('mdpDY').value = dyMm.toFixed(2);
  const dxPx = dxMm / mmPerPixel;
  const dyPx = dyMm / mmPerPixel;
  selectedIds.forEach(id => {
    const s = shapes.find(x => x.id === id);
    const base = moveDeltaBase[id];
    if (!s || !base) return;
    // 기준 스냅샷 + 오프셋으로 절대 재배치
    if (s.p1 && base.p1){ s.p1.x = base.p1.x + dxPx; s.p1.y = base.p1.y + dyPx; }
    if (s.p2 && base.p2){ s.p2.x = base.p2.x + dxPx; s.p2.y = base.p2.y + dyPx; }
    if (s.cx !== undefined && base.cx !== undefined){ s.cx = base.cx + dxPx; s.cy = base.cy + dyPx; }
    // Rev.16.4: 폴리라인/채움 - points 배열 절대 재배치
    if ((s.type === 'polyline' || s.type === 'fill') && Array.isArray(base.points)){
      s.points = base.points.map(pt => ({ x: pt.x + dxPx, y: pt.y + dyPx }));
    }
  });
  redoStack = []; pushHistory();
  redrawDraw();
  updateSelStat();
  if (typeof updateShapePropPanel === 'function') updateShapePropPanel();
  document.getElementById('statusHint').textContent =
    `✓ 이동 적용: ΔX=${dxMm.toFixed(2)}mm, ΔY=${dyMm.toFixed(2)}mm`;
}

function sabOpenProp() {
  // 속성 패널이 이미 표시되어 있다면 강조, 아니면 통합 패널 표시
  updateShapePropPanel();
  const panel = document.getElementById('shapePropPanel') || document.getElementById('propPanel');
  if (panel) {
    panel.scrollIntoView({behavior:'smooth', block:'nearest'});
  }
}

// ====== Rev.12.3: 도면 프로젝트 저장 / 열기 (.json) ======
// 도형·채움·회전축·캘리브레이션·작업영역·배경설정을 하나의 JSON으로 저장/복원.
function buildProjectData(){
  return {
    app: 'TJD-도면작도기',
    version: '12.3',
    savedAt: new Date().toISOString(),
    mmPerPixel: mmPerPixel,
    calibSet: calibSet,
    baseW: baseW, baseH: baseH,
    zoom: zoom,
    bg: {
      hasImage: !!bgImage,
      src: bgImage ? (bgImage.src || null) : null, // dataURL이면 그대로 보존
      opacity: bgImageOpacity,
      scale: bgImageScale,
      offsetX: bgImageOffsetX,
      offsetY: bgImageOffsetY
    },
    shapes: JSON.parse(JSON.stringify(shapes)),
    fills: JSON.parse(JSON.stringify(fills)),
    rotAxis: rotAxis ? JSON.parse(JSON.stringify(rotAxis)) : null,
    shapeIdSeq: shapeIdSeq
  };
}

function saveProject(){
  const data = buildProjectData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  // 파일명: 도면_YYYYMMDD_HHMM.json (KST)
  const now = new Date(Date.now() + 9*3600*1000); // UTC+9
  const ts = now.toISOString().slice(0,16).replace(/[-T:]/g,'').replace(/(\d{8})(\d{4})/,'$1_$2');
  const name = `도면_${ts}.json`;
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  if (document.getElementById('statusHint'))
    document.getElementById('statusHint').textContent = `📁 도면 저장됨: ${name} (도형 ${shapes.length}개)`;
}

function loadProjectData(data){
  if (!data || !Array.isArray(data.shapes)){
    alert('올바른 도면 파일이 아닙니다.');
    return false;
  }
  // 단위/작업영역/줌
  if (typeof data.mmPerPixel === 'number' && data.mmPerPixel > 0) mmPerPixel = data.mmPerPixel;
  if (typeof data.calibSet === 'boolean') calibSet = data.calibSet;
  if (typeof syncUnitScaleSel === 'function') syncUnitScaleSel();
  if (typeof data.zoom === 'number' && data.zoom > 0){
    zoom = data.zoom;
    const zi = document.getElementById('zoom');
    if (zi){ zi.value = Math.round(zoom*100); document.getElementById('zoomVal').textContent = Math.round(zoom*100)+'%'; }
  }
  const newW = (typeof data.baseW === 'number') ? data.baseW : baseW;
  const newH = (typeof data.baseH === 'number') ? data.baseH : baseH;

  // 도형/채움/회전축
  shapes = JSON.parse(JSON.stringify(data.shapes));
  fills = Array.isArray(data.fills) ? JSON.parse(JSON.stringify(data.fills)) : [];
  rotAxis = data.rotAxis ? JSON.parse(JSON.stringify(data.rotAxis)) : null;
  // shapeIdSeq: 저장값 또는 현재 도형 최대 id 중 큰 값
  let maxId = 0;
  shapes.forEach(s => { if (s.id > maxId) maxId = s.id; });
  fills.forEach(s => { if (s.id > maxId) maxId = s.id; });
  shapeIdSeq = Math.max(typeof data.shapeIdSeq === 'number' ? data.shapeIdSeq : 0, maxId);

  selectedIds.clear();
  history = []; histIdx = -1; redoStack = [];

  const finishLoad = () => {
    setCanvasSize(newW, newH);
    if (typeof updateCalibStat === 'function') updateCalibStat();
    if (typeof redrawBg === 'function') redrawBg();
    redrawFills(); redrawDraw(); updateCount(); updateSelStat();
    pushHistory(); // 불러온 상태를 히스토리 시작점으로
    if (document.getElementById('statusHint'))
      document.getElementById('statusHint').textContent = `📂 도면 열기 완료 (도형 ${shapes.length}개)`;
  };

  // 배경 이미지 복원 (dataURL일 때만)
  const bg = data.bg || {};
  bgImageOpacity = (typeof bg.opacity === 'number') ? bg.opacity : 1.0;
  bgImageScale   = (typeof bg.scale === 'number') ? bg.scale : 1.0;
  bgImageOffsetX = (typeof bg.offsetX === 'number') ? bg.offsetX : 0;
  bgImageOffsetY = (typeof bg.offsetY === 'number') ? bg.offsetY : 0;
  if (bg.hasImage && bg.src && bg.src.indexOf('data:') === 0){
    const img = new Image();
    img.onload = () => { bgImage = img; finishLoad(); };
    img.onerror = () => { bgImage = null; finishLoad(); };
    img.src = bg.src;
  } else {
    bgImage = null;
    finishLoad();
  }
  return true;
}

function openProjectFile(file){
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      loadProjectData(data);
    } catch(err){
      alert('파일을 읽을 수 없습니다: ' + err.message);
    }
  };
  reader.readAsText(file);
}

document.getElementById('btnSaveProject').addEventListener('click', saveProject);
document.getElementById('btnOpenProject').addEventListener('click', (e) => {
  // 메뉴 안의 input[type=file] 트리거
  e.stopPropagation();
  document.getElementById('projFile').click();
});
document.getElementById('projFile').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  if (f) openProjectFile(f);
  e.target.value = ''; // 같은 파일 재선택 허용
  document.querySelectorAll('.menu').forEach(m => m.classList.remove('open')); // 메뉴 닫기
});

// ====== Rev.12.5: 도면베이스 (기준선 배치) ======
//  원형 제품 단면 작도용 기준선(가이드).
//   - 거리: 중심선(세로)에서 좌측으로 반경 위치마다 세로선
//   - 높이: 바닥선(가로, 높이0)에서 위로 높이마다 가로선
//  좌표: 중심 cx=작업영역 가로 2/3, 바닥 groundY=세로 1/2.
function parseNumList(str){
  if (!str) return [];
  return String(str).split(/[,\s]+/).map(t => t.trim()).filter(t => t !== '')
    .map(t => evalExpr(t)).filter(v => isFinite(v));
}

function applyBaseLines(){
  const distRaw = parseNumList(document.getElementById('baseDistVals').value);
  const heightRaw = parseNumList(document.getElementById('baseHeightVals').value);
  const isDia = document.getElementById('baseDistIsDiameter').checked;
  const drawCenter = document.getElementById('baseDrawCenter').checked;
  const clearOld = document.getElementById('baseClearOld').checked;

  if (distRaw.length === 0 && heightRaw.length === 0){
    document.getElementById('statusHint').textContent = '⚠ 거리 또는 높이 값을 하나 이상 입력하세요';
    return;
  }

  // 기존 기준선 삭제 옵션
  if (clearOld){
    for (let i = shapes.length - 1; i >= 0; i--){
      if (shapes[i].guide) shapes.splice(i, 1);
    }
  }

  const cx = baseW * 2/3;       // 중심선 X (가로 2/3 지점)
  const groundY = baseH / 2;    // 바닥선 Y (세로 중간)
  const guideColor = '#3aa0ff';

  // 거리 → 반경(mm), 큰 값이 바깥(거리1). 정렬해서 일관 배치
  const radii = distRaw.map(v => isDia ? v/2 : v);
  // 세로선 Y 범위: 바닥 위/아래로 충분히
  const yTop = Math.max(0, groundY - (Math.max(...(heightRaw.length?heightRaw:[0])) / mmPerPixel) - 20/mmPerPixel);
  const yBot = Math.min(baseH, groundY + 10/mmPerPixel);

  const added = [];
  // 중심선
  if (drawCenter){
    const ln = { id: ++shapeIdSeq, type:'line', guide:true, baseRole:'center',
                 p1:{x:cx, y:yTop}, p2:{x:cx, y:yBot}, stroke:'#ff7f50', strokeWidth:1 };
    shapes.push(ln); added.push(ln);
  }
  // 거리 세로선 (중심에서 좌측)
  radii.forEach((rmm, i) => {
    const x = cx - (rmm / mmPerPixel);
    const ln = { id: ++shapeIdSeq, type:'line', guide:true, baseRole:'dist', baseIndex:i+1, baseValMm:rmm,
                 p1:{x:x, y:yTop}, p2:{x:x, y:yBot}, stroke:guideColor, strokeWidth:1 };
    shapes.push(ln); added.push(ln);
  });

  // 높이 가로선 X 범위: 가장 먼 거리선 ~ 중심
  const maxR = radii.length ? Math.max(...radii) : 40;
  const xLeft = cx - (maxR / mmPerPixel) - 10/mmPerPixel;
  const xRight = cx + 10/mmPerPixel;
  heightRaw.forEach((hmm, i) => {
    const y = groundY - (hmm / mmPerPixel);
    const ln = { id: ++shapeIdSeq, type:'line', guide:true, baseRole:'height', baseIndex:i+1, baseValMm:hmm,
                 p1:{x:xLeft, y:y}, p2:{x:xRight, y:y},
                 stroke: (i===0 ? '#2ecc71' : guideColor), strokeWidth:1 };
    shapes.push(ln); added.push(ln);
  });

  redoStack = []; pushHistory();
  if (typeof redrawFills === 'function') redrawFills();
  redrawDraw(); updateCount();
  document.getElementById('baseModal').classList.remove('show');
  document.getElementById('statusHint').textContent =
    `📐 도면베이스 배치: 거리 ${radii.length}개(세로) · 높이 ${heightRaw.length}개(가로) 기준선 생성`;
}

// 모달 열기/버튼
document.getElementById('menuBaseLines').addEventListener('click', () => {
  document.getElementById('baseModal').classList.add('show');
  document.querySelectorAll('.menu').forEach(m => m.classList.remove('open'));
});
document.getElementById('btnBaseCancel').addEventListener('click', () => {
  document.getElementById('baseModal').classList.remove('show');
});
document.getElementById('btnBaseApply').addEventListener('click', applyBaseLines);

// ====== Rev.16.6: 베이스(사각형) 배치 ======
// 제품 가로/세로 사이즈로 사각형(4개 선)을 적정 위치에 작도.
// 세로 좌측선은 직접 X(mm) 입력 또는 씰 파이(현재Ø→목표Ø) 모드로 결정.
function baseRectPreviewUpdate(){
  const w = evalExpr(document.getElementById('baseRectW').value);
  const h = evalExpr(document.getElementById('baseRectH').value);
  const sealOn = document.getElementById('baseRectSealOn').checked;
  const leftXin = document.getElementById('baseRectLeftX').value.trim();
  const el = document.getElementById('baseRectPreview');
  if (!isFinite(h) || h <= 0){
    el.textContent = '⚠ 세로 값을 0보다 크게 입력하세요'; return;
  }

  // Rev.16.8: 씰모드 ON이면 폭=씰 반지름차, 입력 폭 무시
  let effW = w;
  if (sealOn){
    const cur = evalExpr(document.getElementById('baseRectSealCur').value);
    const phi = evalExpr(document.getElementById('baseRectSealPhi').value);
    if (!isFinite(cur) || !isFinite(phi)){
      el.textContent = `▭ 세로 ${h}mm · 씰: 현재Ø/목표Ø 입력 필요`; return;
    }
    effW = Math.abs(phi - cur) / 2;
    if (effW <= 0){ el.textContent = '⚠ 씰: 현재Ø와 목표Ø가 달라야 폭이 생깁니다'; return; }
  } else {
    if (!isFinite(w) || w <= 0){ el.textContent = '⚠ 가로 값을 0보다 크게 입력하세요'; return; }
  }

  let leftMm;
  if (leftXin !== '' && isFinite(evalExpr(leftXin))) leftMm = evalExpr(leftXin);
  else leftMm = (baseW * 0.5) * mmPerPixel - effW/2;

  if (sealOn){
    const cur = evalExpr(document.getElementById('baseRectSealCur').value);
    const phi = evalExpr(document.getElementById('baseRectSealPhi').value);
    el.textContent = `▭ 씰 Ø${cur}→Ø${phi} → 폭 ${effW.toFixed(2)}mm (폭 입력 무시) × 세로 ${h}mm · 좌측선 ${leftMm.toFixed(2)}mm · 우측선 ${(leftMm+effW).toFixed(2)}mm`;
  } else {
    el.textContent = `▭ 가로 ${effW}mm × 세로 ${h}mm · 좌측선 ${leftMm.toFixed(2)}mm · 우측선 ${(leftMm+effW).toFixed(2)}mm`;
  }
}

function applyBaseRect(){
  const w = evalExpr(document.getElementById('baseRectW').value);
  const h = evalExpr(document.getElementById('baseRectH').value);
  if (!isFinite(h) || h <= 0){
    document.getElementById('baseRectPreview').textContent = '⚠ 세로 값을 0보다 크게 입력하세요';
    return;
  }
  const sealOn = document.getElementById('baseRectSealOn').checked;
  const asGuide = document.getElementById('baseRectGuide').checked;
  const asGroup = document.getElementById('baseRectGroup').checked;
  const leftXin = document.getElementById('baseRectLeftX').value.trim();

  // 씰모드가 아니면 가로폭도 필수
  if (!sealOn && (!isFinite(w) || w <= 0)){
    document.getElementById('baseRectPreview').textContent = '⚠ 가로 값을 0보다 크게 입력하세요';
    return;
  }

  // Rev.16.8: 씰모드 ON이면 폭을 씰 반지름차로 대체 (입력 폭 무시)
  let effW = w;   // 실제 사용 가로폭
  if (sealOn){
    const cur = evalExpr(document.getElementById('baseRectSealCur').value);
    const phi = evalExpr(document.getElementById('baseRectSealPhi').value);
    if (isFinite(cur) && isFinite(phi)){
      effW = Math.abs(phi - cur) / 2;   // 씰 반지름차를 폭으로 사용
      if (effW <= 0){
        document.getElementById('baseRectPreview').textContent = '⚠ 씰: 현재Ø와 목표Ø가 달라야 폭이 생깁니다';
        return;
      }
    } else {
      document.getElementById('baseRectPreview').textContent = '⚠ 씰: 현재Ø/목표Ø를 모두 입력하세요';
      return;
    }
  }

  // 좌측선 X (mm) 결정 - 입력값 우선, 비우면 작업영역 중앙 정렬(폭=effW 기준)
  let leftMm;
  if (leftXin !== '' && isFinite(evalExpr(leftXin))) leftMm = evalExpr(leftXin);
  else leftMm = (baseW * 0.5) * mmPerPixel - effW/2;

  // 바닥선 Y (mm) - 작업영역 세로 중앙에 사각형이 오도록
  const groundMm = (baseH * 0.5) * mmPerPixel + h/2;  // 바닥(아래) 기준선
  const topMm = groundMm - h;                          // 윗선

  const rightMm = leftMm + effW;

  // mm → px
  const xL = leftMm / mmPerPixel;
  const xR = rightMm / mmPerPixel;
  const yB = groundMm / mmPerPixel;
  const yT = topMm / mmPerPixel;

  const stroke = asGuide ? '#3aa0ff' : (document.getElementById('strokeColor').value || '#ffffff');
  const sw = asGuide ? 1 : (parseInt(document.getElementById('strokeWidth').value) || 1);

  const mk = (p1, p2) => ({
    id: ++shapeIdSeq, type:'line',
    p1:{x:p1.x, y:p1.y}, p2:{x:p2.x, y:p2.y},
    stroke, strokeWidth: sw,
    ...(asGuide ? { guide:true, baseRole:'rect' } : {})
  });

  const TL = {x:xL, y:yT}, TR = {x:xR, y:yT}, BR = {x:xR, y:yB}, BL = {x:xL, y:yB};

  if (asGroup){
    // 닫힌 폴리라인 1개로
    shapes.push({
      id: ++shapeIdSeq, type:'polyline', closed:true,
      points:[ {x:xL,y:yT}, {x:xR,y:yT}, {x:xR,y:yB}, {x:xL,y:yB} ],
      stroke, strokeWidth: sw, layer: (currentLayer || 'default'),
      ...(asGuide ? { guide:true, baseRole:'rect' } : {})
    });
  } else {
    shapes.push(mk(TL, TR)); // 윗선(가로)
    shapes.push(mk(BL, BR)); // 바닥선(가로)
    shapes.push(mk(TL, BL)); // 좌측선(세로)
    shapes.push(mk(TR, BR)); // 우측선(세로)
  }

  redoStack = []; pushHistory();
  if (typeof redrawFills === 'function') redrawFills();
  redrawDraw(); updateCount();
  document.getElementById('baseRectModal').classList.remove('show');
  document.getElementById('statusHint').textContent =
    `▭ 베이스 사각형 배치: 가로 ${effW.toFixed(2)}mm × 세로 ${h}mm · 좌측선 ${leftMm.toFixed(2)}mm` + (sealOn ? ' (씰 파이 모드: 폭=반지름차)' : '');
}

// 모달 열기/닫기 + 씰 파이 토글 (Rev.16.7: 방어적 바인딩)
(function bindBaseRect(){
  const openBtn = document.getElementById('headerBtnBaseRect');
  const modal   = document.getElementById('baseRectModal');
  if (!openBtn || !modal){ console.warn('baseRect: 요소 없음', !!openBtn, !!modal); return; }
  openBtn.addEventListener('click', () => {
    modal.classList.add('show');
    try { baseRectPreviewUpdate(); } catch(e){ console.warn(e); }
  });
  const cancel = document.getElementById('btnBaseRectCancel');
  if (cancel) cancel.addEventListener('click', () => modal.classList.remove('show'));
  const apply = document.getElementById('btnBaseRectApply');
  if (apply) apply.addEventListener('click', applyBaseRect);
  const sealOn = document.getElementById('baseRectSealOn');
  if (sealOn) sealOn.addEventListener('change', (e) => {
    const on = e.target.checked;
    const r = document.getElementById('baseRectSealRow');
    const h = document.getElementById('baseRectSealHint');
    if (r) r.style.display = on ? 'flex' : 'none';
    if (h) h.style.display = on ? 'block' : 'none';
    // Rev.16.8: 씰모드 ON이면 가로폭 입력칸 비활성(무시됨 표시)
    const wEl = document.getElementById('baseRectW');
    if (wEl){ wEl.disabled = on; wEl.style.opacity = on ? '0.4' : '1'; wEl.title = on ? '씰모드에서는 폭이 무시됩니다 (씰 반지름차 사용)' : ''; }
    baseRectPreviewUpdate();
  });
  ['baseRectW','baseRectH','baseRectLeftX','baseRectSealCur','baseRectSealPhi'].forEach(id => {
    const el = document.getElementById(id);
    if (el){
      el.addEventListener('input', baseRectPreviewUpdate);
      el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') applyBaseRect(); });
    }
  });
})();

// ====== Rev.11.41: 스냅샷 기반 Undo/Redo ======
// 현재 전체 상태를 깊은 복사로 캡처
function captureState(){
  return {
    shapes: JSON.parse(JSON.stringify(shapes)),
    fills: JSON.parse(JSON.stringify(fills)),
    rotAxis: rotAxis ? JSON.parse(JSON.stringify(rotAxis)) : null,
    shapeIdSeq: shapeIdSeq
  };
}
// 스냅샷을 현재 상태로 복원
function restoreState(st){
  histLock = true;
  shapes = JSON.parse(JSON.stringify(st.shapes));
  fills = JSON.parse(JSON.stringify(st.fills));
  rotAxis = st.rotAxis ? JSON.parse(JSON.stringify(st.rotAxis)) : null;
  shapeIdSeq = st.shapeIdSeq;
  selectedIds.clear();
  redrawFills(); redrawDraw(); updateCount(); updateSelStat();
  histLock = false;
}
// 변경 직후 호출 → 현재 상태를 히스토리에 추가
function pushHistory(){
  if (histLock) return;
  // 현재 위치 이후(redo 분기)는 버림
  if (histIdx < history.length - 1) history = history.slice(0, histIdx + 1);
  history.push(captureState());
  if (history.length > HIST_MAX) history.shift();
  histIdx = history.length - 1;
}
// 초기 빈 상태 기록
function initHistory(){
  history = [captureState()];
  histIdx = 0;
}
function undo() {
  if (histIdx <= 0){
    document.getElementById('statusHint').textContent = '↶ 더 되돌릴 작업이 없습니다';
    return;
  }
  histIdx--;
  restoreState(history[histIdx]);
  document.getElementById('statusHint').textContent = `↶ 실행 취소 (${histIdx+1}/${history.length})`;
}
function redo() {
  if (histIdx >= history.length - 1){
    document.getElementById('statusHint').textContent = '↷ 다시 실행할 작업이 없습니다';
    return;
  }
  histIdx++;
  restoreState(history[histIdx]);
  document.getElementById('statusHint').textContent = `↷ 다시 실행 (${histIdx+1}/${history.length})`;
}
document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);

document.getElementById('btnClearAll').addEventListener('click', () => {
  if (!shapes.length && !fills.length && !rotAxis) return;
  if (!confirm(`도형 ${shapes.length}개 + 채움 ${fills.length}개${rotAxis ? ' + 회전축' : ''}을 모두 지우시겠습니까?`)) return;
  redoStack = []; shapes = []; fills = []; selectedIds.clear(); pushHistory();
  rotAxis = null;
  redrawFills(); redrawDraw(); updateCount(); updateSelStat();
  if (typeof updateAxisStatus === 'function') updateAxisStatus();
});


// 저장
const saveModal = document.getElementById('saveModal');
document.getElementById('btnSave').addEventListener('click', () => {
  if (shapes.length === 0 && fills.length === 0) { alert('저장할 내용이 없습니다.'); return; }
  saveModal.classList.add('show');
});
document.getElementById('btnCancelSave').addEventListener('click', () => saveModal.classList.remove('show'));
document.getElementById('saveScale').addEventListener('change', e => {
  document.getElementById('customScaleRow').style.display = e.target.value === 'custom' ? 'flex' : 'none';
});

// 저장 형식 선택에 따라 옵션 UI 토글
document.getElementById('saveFormat').addEventListener('change', e => {
  const v = e.target.value;
  const isSvg = v === 'svg';
  const isPng = v === 'png';
  // PNG일 때만 비율 옵션 표시
  document.getElementById('rowSaveScale').style.display = isPng ? 'flex' : 'none';
  document.getElementById('customScaleRow').style.display = (isPng && document.getElementById('saveScale').value === 'custom') ? 'flex' : 'none';
  // SVG 전용 옵션
  document.getElementById('rowSvgUnit').style.display = isSvg ? 'flex' : 'none';
  document.getElementById('rowSvgStrokeMm').style.display = isSvg ? 'flex' : 'none';
});
// 초기 상태: SVG가 기본이므로 PNG 옵션은 숨김
window.addEventListener('load', () => {
  // Rev.16.7: 첫 시작 시 도구를 '선택'으로 고정 (다른 초기화보다 먼저, 에러 영향 차단)
  try { if (typeof selectTool === 'function') selectTool('select'); } catch(e){ console.warn('selectTool init', e); }
  try { document.getElementById('rowSaveScale').style.display = 'none'; } catch(e){}
  // Rev.11.4: 메뉴 섹션 접기 기능 초기화
  try { initCollapsibleMenuSections(); } catch(e){ console.warn('collapsible init', e); }
});

// ===== Rev.11.4: 메뉴 섹션 접기 =====
function initCollapsibleMenuSections() {
  const sections = document.querySelectorAll('.menu-section');
  sections.forEach((sec, idx) => {
    sec.classList.add('collapsible');
    // 기본 접힘 상태 (Rev.11.5: localStorage에 저장된 값이 없으면 접힘으로 시작)
    const key = 'menuSec_' + idx + '_' + (sec.textContent || '').trim();
    const saved = localStorage.getItem(key);
    const collapsed = saved === null ? true : (saved === '1');
    if (collapsed) sec.classList.add('collapsed');
    applyMenuSectionState(sec);
    sec.addEventListener('click', (e) => {
      e.stopPropagation();
      sec.classList.toggle('collapsed');
      localStorage.setItem(key, sec.classList.contains('collapsed') ? '1' : '0');
      applyMenuSectionState(sec);
    });
  });
}

// section 다음부터 다음 section을 만날 때까지의 형제 요소들을 hide/show
function applyMenuSectionState(sec) {
  const collapsed = sec.classList.contains('collapsed');
  let el = sec.nextElementSibling;
  while (el && !el.classList.contains('menu-section')) {
    if (el.classList.contains('menu-item') || el.classList.contains('menu-sep')) {
      el.classList.toggle('collapsed-by-section', collapsed);
    }
    el = el.nextElementSibling;
  }
}

document.getElementById('btnDoSave').addEventListener('click', () => {
  const name = (document.getElementById('saveName').value || '도면').trim();
  const fmt = document.getElementById('saveFormat').value;
  const crop = document.getElementById('saveCrop').value;
  
  if (fmt === 'svg') {
    exportSVG(name, crop);
  } else if (fmt === 'dxf') {
    if (typeof exportDXF === 'function') exportDXF(name);
    else { alert('DXF 내보내기 함수를 찾을 수 없습니다.'); return; }
  } else {
    const sel = document.getElementById('saveScale').value;
    const scale = sel === 'custom' ? (parseFloat(document.getElementById('customScale').value)||1) : parseFloat(sel);
    exportImage(name, scale, crop);
  }
  saveModal.classList.remove('show');
});

// ====== SVG 내보내기 (3D프린터/레이저 커터용 벡터) ======
function exportSVG(name, cropMode) {
  let x0 = 0, y0 = 0, w = baseW, h = baseH;
  if (cropMode === 'content') {
    const bb = computeBoundingBox();
    if (bb) {
      const pad = 2;  // SVG는 패딩 적게
      x0 = Math.max(0, bb.minX - pad);
      y0 = Math.max(0, bb.minY - pad);
      w = Math.min(baseW - x0, bb.maxX - bb.minX + pad*2);
      h = Math.min(baseH - y0, bb.maxY - bb.minY + pad*2);
    }
  }
  
  const unit = document.getElementById('svgUnit').value;
  const useStrokeMm = document.getElementById('svgStrokeMm').checked;
  
  // mm 단위로 출력하려면 mmPerPixel을 곱함 (캘리브 됐을 때 정확한 실측)
  const k = (unit === 'mm') ? mmPerPixel : 1;
  const wOut = (w * k).toFixed(3);
  const hOut = (h * k).toFixed(3);
  
  // 선 두께 (레이저용 0.1mm 또는 원본)
  const fixedStroke = useStrokeMm ? 0.1 : null;  // mm
  
  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<!-- 도면 작도기 Rev.5 - ${new Date().toISOString()} -->\n`;
  svg += `<!-- 캘리브: ${calibSet ? `1px = ${mmPerPixel.toFixed(4)}mm` : '미설정'} -->\n`;
  svg += `<!-- 실측 크기: ${(w*mmPerPixel).toFixed(1)} × ${(h*mmPerPixel).toFixed(1)} mm -->\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" `;
  
  if (unit === 'mm') {
    svg += `width="${wOut}mm" height="${hOut}mm" `;
    svg += `viewBox="0 0 ${wOut} ${hOut}">\n`;
  } else {
    svg += `width="${wOut}" height="${hOut}" `;
    svg += `viewBox="0 0 ${wOut} ${hOut}">\n`;
  }
  
  // 채움 (배경 - 채움 도형들)
  fills.forEach(f => {
    if (!f.points || f.points.length < 3) return;
    const pts = f.points.map(p => `${((p.x-x0)*k).toFixed(3)},${((p.y-y0)*k).toFixed(3)}`).join(' ');
    const rgba = hexToRgba(f.color, f.alpha);
    svg += `  <polygon points="${pts}" fill="${rgba}" stroke="none"/>\n`;
  });
  
  // 도형
  shapes.forEach(s => {
    // 치수는 SVG에서 제외 (별도 처리 필요, 현재 미지원)
    if (s.type && s.type.startsWith('dim-')) return;
    const stroke = s.stroke;
    const sw = fixedStroke !== null ? fixedStroke : (s.strokeWidth * k);
    
    if (s.type === 'line') {
      const x1 = ((s.p1.x - x0) * k).toFixed(3);
      const y1 = ((s.p1.y - y0) * k).toFixed(3);
      const x2 = ((s.p2.x - x0) * k).toFixed(3);
      const y2 = ((s.p2.y - y0) * k).toFixed(3);
      svg += `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>\n`;
    } else if (s.type === 'rect') {
      const rx = ((Math.min(s.p1.x, s.p2.x) - x0) * k).toFixed(3);
      const ry = ((Math.min(s.p1.y, s.p2.y) - y0) * k).toFixed(3);
      const rw = (Math.abs(s.p2.x - s.p1.x) * k).toFixed(3);
      const rh = (Math.abs(s.p2.y - s.p1.y) * k).toFixed(3);
      svg += `  <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>\n`;
    } else if (s.type === 'circle') {
      const r = Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y);
      const cx = ((s.p1.x - x0) * k).toFixed(3);
      const cy = ((s.p1.y - y0) * k).toFixed(3);
      const rOut = (r * k).toFixed(3);
      svg += `  <circle cx="${cx}" cy="${cy}" r="${rOut}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>\n`;
    } else if (s.type === 'arc') {
      // SVG arc는 path로 그림
      const cx = (s.cx - x0) * k;
      const cy = (s.cy - y0) * k;
      const r = s.r * k;
      const sa = s.startAngle;
      const ea = s.endAngle;
      
      const x1 = (cx + r * Math.cos(sa)).toFixed(3);
      const y1 = (cy + r * Math.sin(sa)).toFixed(3);
      const x2 = (cx + r * Math.cos(ea)).toFixed(3);
      const y2 = (cy + r * Math.sin(ea)).toFixed(3);
      
      // largeArcFlag: 180도 이상이면 1
      let angDiff = ea - sa;
      if (s.ccw) angDiff = -angDiff;
      while (angDiff < 0) angDiff += Math.PI * 2;
      const largeArc = angDiff > Math.PI ? 1 : 0;
      const sweepFlag = s.ccw ? 0 : 1;  // SVG: 0=CCW, 1=CW
      
      svg += `  <path d="M ${x1} ${y1} A ${r.toFixed(3)} ${r.toFixed(3)} 0 ${largeArc} ${sweepFlag} ${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>\n`;
    } else if (s.type === 'ellipse') {
      const cx = ((s.cx - x0) * k).toFixed(3);
      const cy = ((s.cy - y0) * k).toFixed(3);
      const rx = (s.rx * k).toFixed(3);
      const ry = (s.ry * k).toFixed(3);
      const ang = ((s.angle || 0) * 180 / Math.PI).toFixed(2);
      svg += `  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${ang} ${cx} ${cy})" fill="none" stroke="${stroke}" stroke-width="${sw}"/>\n`;
    }
  });
  
  svg += `</svg>\n`;
  
  // 파일 다운로드
  let finalName = name;
  if (calibSet) {
    const wMm = (w * mmPerPixel).toFixed(0);
    const hMm = (h * mmPerPixel).toFixed(0);
    finalName = `${name}_${wMm}x${hMm}mm`;
  }
  
  const blob = new Blob([svg], {type: 'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = finalName + '.svg'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportImage(name, scale, cropMode) {
  let x0 = 0, y0 = 0, w = baseW, h = baseH;
  if (cropMode === 'content') {
    const bb = computeBoundingBox();
    if (bb) {
      const pad = 10;
      x0 = Math.max(0, bb.minX - pad);
      y0 = Math.max(0, bb.minY - pad);
      w = Math.min(baseW - x0, bb.maxX - bb.minX + pad*2);
      h = Math.min(baseH - y0, bb.maxY - bb.minY + pad*2);
    }
  }
  const out = document.createElement('canvas');
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  const octx = out.getContext('2d');
  
  // 배경색 적용 (Rev.8.0)
  const bgOpt = document.getElementById('pngBg').value;
  let bgColor = null;
  if (bgOpt === 'white') bgColor = '#ffffff';
  else if (bgOpt === 'current') {
    bgColor = (currentCanvasBg && currentCanvasBg !== 'checker') ? currentCanvasBg : null;
  } else if (bgOpt === 'custom') {
    bgColor = document.getElementById('pngBgCustom').value;
  }
  if (bgColor) {
    octx.fillStyle = bgColor;
    octx.fillRect(0, 0, out.width, out.height);
  }
  
  octx.translate(-x0 * scale, -y0 * scale);
  octx.scale(scale, scale);
  fills.forEach(f => drawFill(octx, f));
  shapes.forEach(s => drawShape(octx, s, false));
  const url = out.toDataURL('image/png');
  
  let finalName = name;
  if (calibSet) {
    const wMm = (w * mmPerPixel).toFixed(0);
    const hMm = (h * mmPerPixel).toFixed(0);
    finalName = `${name}_${wMm}x${hMm}mm`;
  }
  
  const a = document.createElement('a');
  a.href = url; a.download = finalName + '.png'; a.click();
}

function computeBoundingBox() {
  if (!shapes.length && !fills.length) return null;
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  shapes.forEach(s => {
    const bb = shapeBoundingBox(s);
    const pad = s.strokeWidth/2;
    minX = Math.min(minX, bb.minX - pad); maxX = Math.max(maxX, bb.maxX + pad);
    minY = Math.min(minY, bb.minY - pad); maxY = Math.max(maxY, bb.maxY + pad);
  });
  fills.forEach(f => {
    f.points.forEach(p => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
  });
  return { minX, minY, maxX, maxY };
}

// ====== 3D 회전체 추가 버튼 (v7.6) ======
// 회전축 리셋 (✖ 버튼)
document.getElementById('btnResetAxis').addEventListener('click', () => {
  if (!rotAxis) return;
  if (!confirm('회전축을 삭제하시겠습니까?')) return;
  rotAxis = null;
  redrawDraw();
  updateAxisStatus();
});

// 회전축 상태 표시
function updateAxisStatus() {
  const el = document.getElementById('axisStatus');
  if (!el) return;
  if (rotAxis) {
    const len = Math.hypot(rotAxis.p2.x-rotAxis.p1.x, rotAxis.p2.y-rotAxis.p1.y);
    const lenMm = (len * mmPerPixel).toFixed(1);
    el.textContent = `축 설정됨 (${lenMm}mm)`;
    el.style.color = '#27ae60';
  } else {
    el.textContent = '축 미설정';
    el.style.color = '#aac8ff';
  }
}

// 미리보기 버튼: 마지막 메쉬 또는 새로 생성하여 표시
document.getElementById('btnPreview3D').addEventListener('click', () => {
  if (!rotAxis) {
    alert('먼저 [🔄 회전축]으로 회전축을 설정하세요.');
    return;
  }
  if (shapes.length === 0) {
    alert('회전시킬 도형(윤곽선)이 없습니다.\n[2D 도면] 탭에서 단면을 먼저 그려주세요.');
    return;
  }
  // 빠른 미리보기: 기본 옵션으로 메쉬 생성 → 미리보기
  // 사용자가 이미 옵션을 한번 설정했으면 그 값 사용
  // 옵션 모달의 현재 값 그대로 사용
  const mesh = buildMeshFromUI();
  if (!mesh) {
    // 기본값으로 강제 시도
    alert('윤곽선 추출에 실패했습니다.\n[🧊 3D 생성]에서 옵션을 조정해보세요.');
    return;
  }
  lastGeneratedMesh = mesh;
  updateLastMeshInfo();
  show3DPreview(mesh);
});

// ====== 탭 전환 (Rev.7.5) ======
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    const target = t.dataset.tab;
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(target).classList.add('active');
    
    // 탭별 도구 자동 전환
    if (target === 'tab3d') {
      // 3D 탭으로 가면 회전축 도구가 자연스럽게 선택 가능 (자동 선택은 안함)
    } else if (target === 'tab2d') {
      // 2D 탭으로 돌아오면 line이 기본
      if (tool === 'axis') {
        document.querySelectorAll('.tool-menu-item').forEach(b => b.classList.remove('active'));
        const lineBtn = document.querySelector('.tool-menu-item[data-tool="line"]');
        if (lineBtn) lineBtn.classList.add('active');
        tool = 'line';
        updateToolStatus();
      }
    }
  });
});

// ====== 3D 저장 버튼 (저장 탭) ======
document.getElementById('btnSave3D').addEventListener('click', () => {
  if (!lastGeneratedMesh) {
    if (!rotAxis) {
      alert('먼저 [3D 회전체] 탭에서:\n1) [🔄 회전축 설정]으로 축을 그리고\n2) [🧊 3D 생성]으로 모델을 만든 다음 저장하세요.');
    } else {
      alert('아직 3D 모델이 생성되지 않았습니다.\n[3D 회전체] 탭의 [🧊 3D 생성] 버튼으로 만들어 주세요.');
    }
    // 3D 탭으로 자동 이동
    document.querySelector('.tab[data-tab="tab3d"]').click();
    return;
  }
  saveMesh3D(lastGeneratedMesh);
});

// 3D 생성 후 최근 메쉬 정보 표시
function updateLastMeshInfo() {
  const el = document.getElementById('lastMeshInfo');
  if (!el) return;
  if (!lastGeneratedMesh) {
    el.textContent = '없음 (3D 생성 시 표시됨)';
    el.style.color = '#aac8ff';
  } else {
    el.textContent = `정점 ${lastGeneratedMesh.vertices.length}, 삼각형 ${lastGeneratedMesh.triangles.length}`;
    el.style.color = '#27ae60';
  }
}

// ====== 헤더 버튼 (Rev.7.8) ======
// 선택 도구 버튼
document.getElementById('headerBtnSelect')?.addEventListener('click', () => {
  const btn = document.querySelector('.tool-menu-item[data-tool="select"]');
  if (btn) btn.click();
});

// Rev.11.18: 점 찍기 모드 토글
document.getElementById('headerBtnPoint').addEventListener('click', () => {
  exitConnectMode();
  extrudeMode = false; extrudeState = null; extrudeAxis = null;
  pointMode = !pointMode;
  updateVertexButtons();
  if (pointMode){
    // 선택 도구 기반으로 동작하므로 선택 도구로
    const btn = document.querySelector('.tool-menu-item[data-tool="select"]');
    if (btn) btn.click();
    drawCanvas.style.cursor = 'crosshair';
    document.getElementById('statusHint').textContent = '• 점 찍기: 좌표를 클릭해 점 1개 생성 (1회성) / 우클릭·Esc=취소';
  } else {
    drawCanvas.style.cursor = 'default';
  }
});

// Rev.11.21: 선 그리기 버튼 (선 도구로 전환)
document.getElementById('headerBtnLine')?.addEventListener('click', () => {
  exitVertexModes();
  const btn = document.querySelector('.tool-menu-item[data-tool="line"]');
  if (btn) btn.click();
  updateVertexButtons(); // Rev.11.43: 선 ON 표시
  document.getElementById('statusHint').textContent = '／ 선 그리기: 시작점 클릭 → 끝점 클릭';
});

// Rev.11.18: 연결 모드 토글
document.getElementById('headerBtnConnect').addEventListener('click', () => {
  pointMode = false;
  connectMode = !connectMode;
  connectPoints = [];
  extrudeMode = false; extrudeState = null; extrudeAxis = null;
  updateVertexButtons();
  if (connectMode){
    const btn = document.querySelector('.tool-menu-item[data-tool="select"]');
    if (btn) btn.click();
    drawCanvas.style.cursor = 'crosshair';
    document.getElementById('statusHint').textContent = '🔗 연결 ON: 두 점(점/끝점)을 클릭해 선 연결 (연속) / 우클릭·Esc=종료';
  } else {
    drawCanvas.style.cursor = 'default';
  }
});

// ===== Rev.12.1: 선 길이/각도/상대거리 입력 팝업 =====
let lineDimTargetId = null;
let lineDimLastEdited = 'polar'; // Rev.12.2: 'polar'(실제길이·각도) | 'axis'(ΔX·ΔY)

function worldToScreen(x, y){
  const r = drawCanvas.getBoundingClientRect();
  return { x: r.left + x * zoom, y: r.top + y * zoom };
}

function openLineDimModal(lineId){
  const ln = shapes.find(s => s.id === lineId && s.type === 'line');
  if (!ln){ return; }
  lineDimTargetId = lineId;
  const fixEnd = document.getElementById('lineDimFixEnd').value;
  const fix = (fixEnd === 'end') ? ln.p2 : ln.p1;
  const mov = (fixEnd === 'end') ? ln.p1 : ln.p2;
  const dx = mov.x - fix.x, dy = mov.y - fix.y;
  const lenMm = Math.hypot(dx, dy) * mmPerPixel;
  let angDeg = Math.atan2(-dy, dx) * 180 / Math.PI;
  if (angDeg < 0) angDeg += 360;
  const dxMm = dx * mmPerPixel, dyMm = -dy * mmPerPixel;

  document.getElementById('lineDimCurrent').textContent =
    `실제 ${lenMm.toFixed(2)}mm · ΔX ${dxMm.toFixed(2)} · ΔY ${dyMm.toFixed(2)} · ${angDeg.toFixed(1)}°`;
  document.getElementById('lineDimInput').value = lenMm.toFixed(2);
  document.getElementById('lineAngInput').value = angDeg.toFixed(1);
  document.getElementById('lineDXInput').value = dxMm.toFixed(2);
  document.getElementById('lineDYInput').value = dyMm.toFixed(2);

  const pop = document.getElementById('lineDimPop');
  pop.style.display = 'block';
  const sc = worldToScreen(mov.x, mov.y);
  const pw = pop.offsetWidth || 250, ph = pop.offsetHeight || 220;
  let left = sc.x + 14, top = sc.y + 14;
  if (left + pw > window.innerWidth - 8) left = sc.x - pw - 14;
  if (top + ph > window.innerHeight - 8) top = window.innerHeight - ph - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';

  lineDimLastEdited = 'polar'; // Rev.12.2: 마지막 편집 기준 초기화
  const inp = document.getElementById('lineDimInput');
  setTimeout(() => { inp.focus(); inp.select(); }, 30);
}

function syncPolarToAxis(){
  const len = evalExpr(document.getElementById('lineDimInput').value);
  const ang = evalExpr(document.getElementById('lineAngInput').value);
  if (!(len >= 0) || !isFinite(ang)) return;
  const rad = ang * Math.PI / 180;
  document.getElementById('lineDXInput').value = (Math.cos(rad) * len).toFixed(2);
  document.getElementById('lineDYInput').value = (Math.sin(rad) * len).toFixed(2);
}
function syncAxisToPolar(){
  const dxMm = evalExpr(document.getElementById('lineDXInput').value);
  const dyMm = evalExpr(document.getElementById('lineDYInput').value);
  if (!isFinite(dxMm) || !isFinite(dyMm)) return;
  const len = Math.hypot(dxMm, dyMm);
  let ang = Math.atan2(dyMm, dxMm) * 180 / Math.PI;
  if (ang < 0) ang += 360;
  document.getElementById('lineDimInput').value = len.toFixed(2);
  document.getElementById('lineAngInput').value = ang.toFixed(1);
}

function applyLineDim(){
  const ln = shapes.find(s => s.id === lineDimTargetId && s.type === 'line');
  if (!ln){ closeLineDimModal(); return; }
  const fixEnd = document.getElementById('lineDimFixEnd').value;
  const fix = (fixEnd === 'end') ? ln.p2 : ln.p1;
  const mov = (fixEnd === 'end') ? ln.p1 : ln.p2;
  // Rev.12.2: 마지막으로 편집한 칸 기준으로 적용 (네 칸 항상 표시)
  if (lineDimLastEdited === 'axis'){
    const dxMm = evalExpr(document.getElementById('lineDXInput').value);
    const dyMm = evalExpr(document.getElementById('lineDYInput').value);
    if (!isFinite(dxMm) || !isFinite(dyMm)){
      document.getElementById('statusHint').textContent = '⚠ ΔX, ΔY를 숫자(또는 수식)로 입력하세요'; return;
    }
    if (Math.abs(dxMm) < 1e-9 && Math.abs(dyMm) < 1e-9){
      document.getElementById('statusHint').textContent = '⚠ ΔX, ΔY가 모두 0이면 선이 사라집니다'; return;
    }
    mov.x = fix.x + (dxMm / mmPerPixel);
    mov.y = fix.y - (dyMm / mmPerPixel);
    document.getElementById('statusHint').textContent =
      `✓ 선 보정: 실제 ${Math.hypot(dxMm,dyMm).toFixed(2)}mm · ΔX ${dxMm.toFixed(2)} · ΔY ${dyMm.toFixed(2)}`;
  } else {
    const valMm = evalExpr(document.getElementById('lineDimInput').value);
    const angRaw = evalExpr(document.getElementById('lineAngInput').value);
    if (!(valMm > 0)){ document.getElementById('statusHint').textContent = '⚠ 0보다 큰 실제길이를 입력하세요'; return; }
    if (!isFinite(angRaw)){ document.getElementById('statusHint').textContent = '⚠ 각도를 숫자로 입력하세요'; return; }
    const targetPx = valMm / mmPerPixel;
    const rad = angRaw * Math.PI / 180;
    mov.x = fix.x + Math.cos(rad) * targetPx;
    mov.y = fix.y - Math.sin(rad) * targetPx;
    document.getElementById('statusHint').textContent = `✓ 선 보정: 실제 ${valMm.toFixed(2)}mm · ${angRaw.toFixed(1)}°`;
  }
  redoStack = []; pushHistory();
  if (typeof redrawFills === 'function') redrawFills();
  redrawDraw(); updateCount();
  closeLineDimModal();
}

function closeLineDimModal(){
  document.getElementById('lineDimPop').style.display = 'none';
  lineDimTargetId = null;
}

document.getElementById('btnLineDimApply').addEventListener('click', applyLineDim);
document.getElementById('btnLineDimSkip').addEventListener('click', closeLineDimModal);
['lineDimInput','lineAngInput','lineDXInput','lineDYInput'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){ e.preventDefault(); applyLineDim(); }
    else if (e.key === 'Escape'){ e.preventDefault(); closeLineDimModal(); }
    e.stopPropagation();
  });
});
// Rev.12.2: 실제길이/각도 편집 → ΔX/ΔY 자동 갱신 (마지막 편집='polar')
['lineDimInput','lineAngInput'].forEach(id =>
  document.getElementById(id).addEventListener('input', () => { lineDimLastEdited='polar'; syncPolarToAxis(); }));
// ΔX/ΔY 편집 → 실제길이/각도 자동 갱신 (마지막 편집='axis')
['lineDXInput','lineDYInput'].forEach(id =>
  document.getElementById(id).addEventListener('input', () => { lineDimLastEdited='axis'; syncAxisToPolar(); }));
document.getElementById('lineDimFixEnd').addEventListener('change', () => {
  if (lineDimTargetId != null) openLineDimModal(lineDimTargetId);
});

// Rev.13.3: 베이스선 복제 버튼/팝업 바인딩
document.getElementById('headerBtnBaseLine').addEventListener('click', () => {
  if (baseLineMode) cancelBaseLineMode();
  else startBaseLineMode();
});
document.getElementById('btnBaseLineClose').addEventListener('click', () => {
  closeBaseLinePop();
  baseLineTarget = null; baseLineOrient = null; baseLineDir = null;
  preCtx.clearRect(0,0,baseW,baseH);
  if (baseLineMode) document.getElementById('statusHint').textContent =
    '📋 베이스선 복제: 다음 기준 선을 클릭하세요 (Esc=종료)';
});
document.getElementById('btnBaseLineGo').addEventListener('click', () => baseLineGenerate());
// 방향 버튼 선택
document.querySelectorAll('.baseDirBtn').forEach(btn => {
  btn.addEventListener('click', () => { if (!btn.disabled) baseLineSelectDir(btn.dataset.dir); });
});
// Rev.14.9: 거리두기 방향 버튼/생성버튼 (독립)
document.querySelectorAll('.baseOffDirBtn').forEach(btn => {
  btn.addEventListener('click', () => { if (!btn.disabled) baseOffSelectDir(btn.dataset.dir); });
});
document.getElementById('btnBaseOffGo').addEventListener('click', () => baseOffGenerate());
document.getElementById('baseOffDist').addEventListener('keydown', e => {
  if (e.key === 'Enter'){ e.preventDefault(); baseOffGenerate(); }
  else if (e.key === 'Escape'){ e.preventDefault(); cancelBaseLineMode();
    document.getElementById('statusHint').textContent = '📋 베이스선 복제 종료'; }
  e.stopPropagation();
});
// 씰 파이 토글
document.getElementById('baseSealOn').addEventListener('change', e => {
  const on = e.target.checked;
  document.getElementById('baseSealRow').style.display = on ? 'flex' : 'none';
  document.getElementById('baseSealHint').style.display = on ? 'block' : 'none';
  // 파이 모드에선 방향버튼/거리칸 비활성(방향은 파이값으로 자동결정)
  document.getElementById('baseNormalRow').style.opacity = on ? '0.4' : '1';
  document.getElementById('baseDist').disabled = on;
  document.querySelectorAll('.baseDirBtn').forEach(b => { b.style.opacity = on ? '0.3' : (b.disabled ? '0.3' : '1'); });
  if (on) setTimeout(() => { const i = document.getElementById('basePhi'); i.focus(); }, 20);
});
// 입력칸 Enter=생성 / Esc=종료
['baseDist','baseSealCur','basePhi'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter'){ e.preventDefault(); baseLineGenerate(); }
    else if (e.key === 'Escape'){ e.preventDefault(); cancelBaseLineMode();
      document.getElementById('statusHint').textContent = '📋 베이스선 복제 종료'; }
    e.stopPropagation();
  });
});

// Rev.11.66: 선택된 점들을 선택 순서대로 즉시 연결 (점 2개 이상 선택 후 F)
//   2개 → 선 1개, 3개 이상 → 연쇄 연결(폴리라인식). 사용된 점은 선으로 흡수(삭제).
//   반환: 연결 처리했으면 true
function connectSelectedPoints(){
  // 선택된 점(point)만 선택 순서대로 추출
  const pts = [];
  selectedIds.forEach(id => {
    const s = shapes.find(x => x.id === id);
    if (s && s.type === 'point') pts.push(s);
  });
  if (pts.length < 2) return false;

  const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
  const stroke = document.getElementById('strokeColor').value || '#ffffff';
  // 연쇄 연결: p0-p1, p1-p2, ...
  let lastLineId = null;
  for (let i = 0; i < pts.length - 1; i++){
    const a = pts[i], b = pts[i+1];
    lastLineId = ++shapeIdSeq;
    shapes.push({
      id: lastLineId, type: 'line',
      p1: { x: a.p1.x, y: a.p1.y }, p2: { x: b.p1.x, y: b.p1.y },
      stroke, strokeWidth: sw
    });
  }
  // 사용된 점 삭제(선으로 흡수)
  const usedIds = new Set(pts.map(p => p.id));
  for (let i = shapes.length - 1; i >= 0; i--){
    if (shapes[i].type === 'point' && usedIds.has(shapes[i].id)) shapes.splice(i, 1);
  }
  selectedIds.clear(); updateSelStat();
  redoStack = []; pushHistory();
  redrawDraw(); updateCount();
  document.getElementById('statusHint').textContent =
    `🔗 점 ${pts.length}개 연결 완료 (선 ${pts.length-1}개 생성)`;
  // Rev.12.1: 점 2개로 선 1개만 만든 경우 길이 팝업
  if (pts.length === 2 && lastLineId != null){ const _id = lastLineId; setTimeout(() => openLineDimModal(_id), 0); }
  return true;
}

// ===== Rev.14.7: 도면 정리 (끝점 맞물림 + 일직선 병합) =====
// ===== Rev.16.26: 도면 정리 - 점 + 지정 길이 이하 짧은 선 전체 삭제 =====
function cleanupDrawing(){
  const minLenMm = parseFloat(document.getElementById('cleanupTolInput').value) || 1;
  const minLenPx = minLenMm / mmPerPixel;

  // 대상: 선택된 도형이 있으면 그 안에서만, 없으면 전체
  const hasSel = selectedIds && selectedIds.size > 0;
  const inScope = (s) => !hasSel || selectedIds.has(s.id);

  const removeIds = [];
  for (const s of shapes){
    if (!inScope(s)) continue;
    if (s.type === 'point'){
      removeIds.push(s.id);
    } else if (s.type === 'line' && s.p1 && s.p2){
      const len = Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y);
      if (len <= minLenPx) removeIds.push(s.id);
    }
  }

  if (removeIds.length === 0){
    document.getElementById('statusHint').textContent =
      `🧹 삭제할 점/짧은 선이 없습니다 (기준 ${minLenMm}mm 이하)`;
    return;
  }

  shapes = shapes.filter(s => !removeIds.includes(s.id));
  if (selectedIds) selectedIds.clear();
  redoStack = []; pushHistory();
  if (typeof redrawFills === 'function') redrawFills();
  redrawDraw(); updateCount();
  document.getElementById('statusHint').textContent =
    `🧹 정리 완료: 점/짧은 선 ${removeIds.length}개 삭제 (${minLenMm}mm 이하${hasSel ? ', 선택 영역' : ', 전체'})`;
}

document.getElementById('headerBtnCleanup').addEventListener('click', cleanupDrawing);

// ===== Rev.15.6: 그룹화 (선택한 선들을 하나의 폴리라인으로 — 블렌더 J처럼) =====
//  이어지는 끝점은 최대한 연결, 안 이어져도 갈래를 한 폴리라인에 모두 담음. 절대 실패 안 함.
function mergeLinesToPolyline(){
  const tolMm = parseFloat(document.getElementById('cleanupTolInput').value) || 0.5;
  const tolPx = tolMm / mmPerPixel;

  const sel = shapes.filter(s => s.type === 'line' && selectedIds.has(s.id));
  if (sel.length < 2){
    document.getElementById('statusHint').textContent = '🔗 그룹화: 선을 2개 이상 선택하세요';
    return;
  }

  const segs = sel.map(s => ({ a:{x:s.p1.x,y:s.p1.y}, b:{x:s.p2.x,y:s.p2.y} }));
  const near = (p, q) => Math.hypot(p.x - q.x, p.y - q.y) <= tolPx;

  // 연결 가능한 만큼 이어붙이되, 안 이어지면 새 갈래를 그냥 뒤에 이어붙임 (하나의 점 배열)
  const usedSeg = new Array(segs.length).fill(false);
  const allPts = [];
  let remaining = segs.length;
  let curChain = null;
  while (remaining > 0){
    if (!curChain){
      // 미사용 첫 세그먼트로 새 갈래 시작
      const idx = usedSeg.indexOf(false);
      usedSeg[idx] = true; remaining--;
      curChain = [ segs[idx].a, segs[idx].b ];
      continue;
    }
    // 현재 갈래의 양끝에 이어지는 세그먼트 탐색
    const head = curChain[0], tail = curChain[curChain.length - 1];
    let found = false;
    for (let i = 0; i < segs.length; i++){
      if (usedSeg[i]) continue;
      const s = segs[i];
      if (near(tail, s.a)){ curChain.push(s.b); usedSeg[i]=true; remaining--; found=true; break; }
      if (near(tail, s.b)){ curChain.push(s.a); usedSeg[i]=true; remaining--; found=true; break; }
      if (near(head, s.b)){ curChain.unshift(s.a); usedSeg[i]=true; remaining--; found=true; break; }
      if (near(head, s.a)){ curChain.unshift(s.b); usedSeg[i]=true; remaining--; found=true; break; }
    }
    if (!found){
      // 더 이상 이 갈래에 못 이으면 → 전체 점배열에 흘려넣고 새 갈래 시작
      allPts.push(...curChain);
      curChain = null;
    }
  }
  if (curChain) allPts.push(...curChain);

  // 인접 중복점 제거
  const pts = [];
  allPts.forEach(p => { if (pts.length === 0 || !near(pts[pts.length-1], p)) pts.push({x:p.x, y:p.y}); });
  if (pts.length < 2){
    document.getElementById('statusHint').textContent = '🔗 그룹화: 유효한 경로가 아닙니다';
    return;
  }
  // 닫힘 (시작=끝)
  let closed = false;
  if (pts.length >= 3 && near(pts[0], pts[pts.length-1])){ closed = true; pts.pop(); }

  const base = sel[0];
  const poly = {
    id: ++shapeIdSeq, type: 'polyline', points: pts, closed,
    stroke: base.stroke || '#000',
    strokeWidth: base.strokeWidth || 2,
    layer: base.layer || (typeof currentLayer !== 'undefined' ? currentLayer : 'default') || 'default'
  };

  // 원본 선 삭제
  const delIds = new Set(sel.map(s => s.id));
  for (let i = shapes.length - 1; i >= 0; i--){
    if (shapes[i].type === 'line' && delIds.has(shapes[i].id)) shapes.splice(i, 1);
  }
  shapes.push(poly);
  selectedIds.clear(); selectedIds.add(poly.id);

  redoStack = []; pushHistory();
  if (typeof redrawFills === 'function') redrawFills();
  redrawDraw(); updateCount();
  if (typeof updateSelStat === 'function') updateSelStat();
  if (typeof updateShapePropPanel === 'function') updateShapePropPanel();
  document.getElementById('statusHint').textContent =
    `🔗 그룹화 완료: 선 ${sel.length}개 → 폴리라인 1개 (점 ${pts.length}개${closed ? ', 닫힘' : ''})`;
}
document.getElementById('headerBtnMerge').addEventListener('click', mergeLinesToPolyline);

// ===== Rev.15.8: 분리 (선택한 폴리라인을 개별 선들로 분해) =====
function ungroupPolyline(){
  const sel = shapes.filter(s => s.type === 'polyline' && selectedIds.has(s.id));
  if (sel.length === 0){
    document.getElementById('statusHint').textContent = '✂ 분리: 폴리라인을 선택하세요';
    return;
  }
  const newLineIds = [];
  let madeLines = 0;
  sel.forEach(poly => {
    const pts = poly.points || [];
    if (pts.length < 2) return;
    // 인접 점쌍마다 선 1개
    for (let i = 0; i < pts.length - 1; i++){
      const ln = {
        id: ++shapeIdSeq, type: 'line',
        p1: { x: pts[i].x, y: pts[i].y },
        p2: { x: pts[i+1].x, y: pts[i+1].y },
        stroke: '#ffffff',
        strokeWidth: poly.strokeWidth || 2,
        layer: poly.layer || 'default'
      };
      shapes.push(ln); newLineIds.push(ln.id); madeLines++;
    }
    // 닫힌 폴리라인이면 마지막→처음 선도 추가
    if (poly.closed && pts.length >= 3){
      const ln = {
        id: ++shapeIdSeq, type: 'line',
        p1: { x: pts[pts.length-1].x, y: pts[pts.length-1].y },
        p2: { x: pts[0].x, y: pts[0].y },
        stroke: '#ffffff',
        strokeWidth: poly.strokeWidth || 2,
        layer: poly.layer || 'default'
      };
      shapes.push(ln); newLineIds.push(ln.id); madeLines++;
    }
  });
  // 원본 폴리라인 삭제
  const delIds = new Set(sel.map(s => s.id));
  for (let i = shapes.length - 1; i >= 0; i--){
    if (shapes[i].type === 'polyline' && delIds.has(shapes[i].id)) shapes.splice(i, 1);
  }
  selectedIds.clear();
  newLineIds.forEach(id => selectedIds.add(id));

  redoStack = []; pushHistory();
  if (typeof redrawFills === 'function') redrawFills();
  redrawDraw(); updateCount();
  if (typeof updateSelStat === 'function') updateSelStat();
  if (typeof updateShapePropPanel === 'function') updateShapePropPanel();
  document.getElementById('statusHint').textContent =
    `✂ 분리 완료: 폴리라인 ${sel.length}개 → 선 ${madeLines}개`;
}
document.getElementById('headerBtnUngroup').addEventListener('click', ungroupPolyline);

// Rev.15.5: 외곽선 만들기 버튼 - 채움 도구를 외곽선(폴리라인) 모드로 켬
document.getElementById('headerBtnOutline').addEventListener('click', () => {
  selectTool('fill');           // 먼저 도구 전환(여기서 fillAsOutline가 false로 리셋됨)
  fillAsOutline = true;         // 그 다음 외곽선 모드 ON
  document.getElementById('headerBtnOutline').classList.add('active');
  document.getElementById('statusHint').textContent =
    '🖊 외곽선 만들기: 닫힌 영역 안을 클릭하면 경계를 따라 외곽선(폴리라인) 생성 (Esc=종료)';
});

// Rev.11.20: 연장(Extrude) 버튼
document.getElementById('headerBtnExtrude').addEventListener('click', () => {
  if (extrudeMode){
    exitVertexModes();
    return;
  }
  startExtrude();
});

// Rev.12.6: 거리두기 버튼 → 좌/우 선택 모드 토글
//   ON: 선 클릭 → 마우스를 좌/우로 → 클릭한 쪽에만 평행선 1개 생성
document.getElementById('headerBtnOffsetTwin').addEventListener('click', () => {
  if (offsetTwinPickMode){
    cancelOffsetTwinPick();
    document.getElementById('statusHint').textContent = '거리두기 OFF';
    return;
  }
  // 이미 선이 선택돼 있으면 그 선을 바로 대상으로
  let sel = null;
  selectedIds.forEach(id => {
    const s = shapes.find(x => x.id === id);
    if (s && s.type === 'line' && !sel) sel = s;
  });
  startOffsetTwinPick();
  if (sel){
    offsetTwinTarget = sel;
    document.getElementById('statusHint').textContent =
      `⫴ 거리두기(${offsetTwinDist}mm): 마우스를 선의 왼쪽/오른쪽으로 옮긴 뒤 클릭 (Esc=취소)`;
  }
});

document.getElementById('offsetTwinDistInput').addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  if (!isNaN(v) && v >= 0) offsetTwinDist = v;
});

function updateOffsetTwinButton(){
  const b = document.getElementById('headerBtnOffsetTwin');
  if (!b) return;
  b.classList.toggle('active', !!offsetTwinPickMode); // Rev.12.6: 픽 모드 기준
}

document.getElementById('chamferCInput') && document.getElementById('chamferCInput').addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  if (!isNaN(v) && v > 0) chamferC = v;
});

function updateVertexButtons(){
  const pb = document.getElementById('headerBtnPoint');
  const cb = document.getElementById('headerBtnConnect');
  const eb = document.getElementById('headerBtnExtrude');
  const lb = document.getElementById('headerBtnLine');
  // Rev.11.54: 도구바 버튼 구조 보존 → active 클래스로 활성 표시
  if (lb){
    const on = (tool === 'line') && !pointMode && !connectMode && !extrudeMode;
    lb.classList.toggle('active', on);
  }
  if (pb) pb.classList.toggle('active', pointMode);
  if (cb) cb.classList.toggle('active', connectMode);
  if (eb) eb.classList.toggle('active', extrudeMode);
}

function exitPointMode(){ pointMode = false; updateVertexButtons(); }
function exitConnectMode(){ connectMode = false; connectPoints = []; updateVertexButtons(); }
function exitVertexModes(){
  if (pointMode || connectMode || extrudeMode){
    pointMode = false; connectMode = false; connectPoints = [];
    extrudeMode = false; extrudeState = null; extrudeAxis = null; extrudeDragging = false;
    updateVertexButtons();
    preCtx.clearRect(0,0,baseW,baseH);
    drawCanvas.style.cursor = 'default';
    return true;
  }
  return false;
}

// Rev.11.20: 연장(Extrude) 시작 - 선택된 선 또는 점 1개를 돌출 대상으로
// Rev.11.21: 점도 지원 (점 연장 → 선), 원본은 확정 시 삭제
function startExtrude(){
  // 선택된 도형 중 line 또는 point 1개를 찾음
  let target = null;
  selectedIds.forEach(id => {
    const s = shapes.find(x => x.id === id);
    if (s && (s.type === 'line' || s.type === 'point') && !target) target = s;
  });
  if (!target){
    document.getElementById('statusHint').textContent = '⬄ 연장: 먼저 선 또는 점을 1개 선택하세요';
    return;
  }
  pointMode = false; connectMode = false; connectPoints = [];
  extrudeMode = true;
  extrudeAxis = null; // Rev.11.39: 축 제한 초기화
  if (target.type === 'point'){
    extrudeState = {
      srcType: 'point',
      srcId: target.id,
      p1: { x: target.p1.x, y: target.p1.y },
      p2: null  // 점은 단일 좌표
    };
  } else {
    extrudeState = {
      srcType: 'line',
      srcId: target.id,
      p1: { x: target.p1.x, y: target.p1.y },
      p2: { x: target.p2.x, y: target.p2.y }
    };
  }
  updateVertexButtons();
  const btn = document.querySelector('.tool-menu-item[data-tool="select"]');
  if (btn) btn.click();
  selectedIds.clear(); selectedIds.add(target.id); updateSelStat();
  drawCanvas.style.cursor = 'crosshair';
  document.getElementById('statusHint').textContent =
    (target.type === 'point')
      ? '⬄ 점 연장: 드래그해서 선 생성 · X/Y=축제한 / 놓으면 확정 / Shift=직교 / Esc=취소'
      : '⬄ 선 연장: 끝선/선을 드래그해서 면 생성 · X/Y=축제한 / 놓으면 확정 / Shift=직교 / Esc=취소';
}

// Rev.11.20: 마우스 위치 → 돌출 오프셋 벡터 계산
//   기본은 선과 수직 방향으로 돌출(블렌더 엣지 돌출과 유사), Shift면 선의 법선 방향으로 강제 직교
function extrudeOffset(mouse){
  const a = extrudeState.p1, b = extrudeState.p2;
  // Rev.11.39: 축 제한 (X/Y 키) - 마우스 변위를 해당 축으로만
  if (extrudeAxis === 'x' || extrudeAxis === 'y'){
    const origin = b ? { x:(a.x+b.x)/2, y:(a.y+b.y)/2 } : a;
    let dx = mouse.x - origin.x, dy = mouse.y - origin.y;
    if (extrudeAxis === 'x') dy = 0; else dx = 0;
    return { ox: dx, oy: dy, dist: Math.hypot(dx, dy) };
  }
  // 점 연장: 방향 개념 없음 → 자유 변위, Shift면 수평/수직 스냅
  if (!b){
    let dx = mouse.x - a.x, dy = mouse.y - a.y;
    if (shiftDown){
      if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0;
    }
    return { ox: dx, oy: dy, dist: Math.hypot(dx, dy) };
  }
  // 선의 중점
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // 마우스까지의 변위
  let dx = mouse.x - mid.x, dy = mouse.y - mid.y;
  // 선 방향 단위벡터
  const lx = b.x - a.x, ly = b.y - a.y;
  const ll = Math.hypot(lx, ly) || 1;
  const ux = lx / ll, uy = ly / ll;
  // 법선(선에 수직) 단위벡터
  const nx = -uy, ny = ux;
  // 변위를 법선 성분만 사용(수직 돌출) → 면이 직사각형이 됨
  const nd = dx * nx + dy * ny; // 법선 방향 투영 길이
  if (shiftDown){
    // Shift: 완전 직교(법선) 돌출만
    return { ox: nx * nd, oy: ny * nd, dist: Math.abs(nd) };
  }
  // 기본: 자유 돌출(마우스 변위 그대로) - 평행사변형 가능
  return { ox: dx, oy: dy, dist: Math.hypot(dx, dy) };
}

// Rev.11.20: 돌출 미리보기 (면 반투명 + 새 선)
function drawExtrudePreview(off){
  const a = extrudeState.p1, b = extrudeState.p2;
  const Z = zoom || 1;
  preCtx.clearRect(0,0,baseW,baseH);
  preCtx.save();
  if (!b){
    // 점 연장 → 선 미리보기
    const a2 = { x: a.x + off.ox, y: a.y + off.oy };
    preCtx.strokeStyle = '#bf7fd8';
    preCtx.lineWidth = 1.5 / Z;
    preCtx.beginPath();
    preCtx.moveTo(a.x, a.y);
    preCtx.lineTo(a2.x, a2.y);
    preCtx.stroke();
    preCtx.fillStyle = '#bf7fd8';
    const m = 3 / Z;
    preCtx.fillRect(a2.x - m, a2.y - m, m*2, m*2);
    preCtx.restore();
    const dm = (off.dist * mmPerPixel).toFixed(2);
    document.getElementById('statusHint').textContent =
      `⬄ 점 연장: ${dm}mm 선 · 클릭=확정 / Shift=직교 / Esc=취소`;
    return;
  }
  const a2 = { x: a.x + off.ox, y: a.y + off.oy };
  const b2 = { x: b.x + off.ox, y: b.y + off.oy };
  // 면(반투명)
  preCtx.fillStyle = 'rgba(142, 68, 173, 0.25)';
  preCtx.beginPath();
  preCtx.moveTo(a.x, a.y);
  preCtx.lineTo(b.x, b.y);
  preCtx.lineTo(b2.x, b2.y);
  preCtx.lineTo(a2.x, a2.y);
  preCtx.closePath();
  preCtx.fill();
  // 외곽선
  preCtx.strokeStyle = '#bf7fd8';
  preCtx.lineWidth = 1.5 / Z;
  preCtx.stroke();
  preCtx.restore();
  const distMm = (off.dist * mmPerPixel).toFixed(2);
  document.getElementById('statusHint').textContent =
    `⬄ 선 연장: ${distMm}mm 면 · 클릭=확정 / Shift=직교 / Esc=취소`;
}

// Rev.11.20: 돌출 확정 - 새 선 + 양옆 선 2개 + 면(fill) 생성
function commitExtrude(off){
  if (off.dist < 0.5){ return; } // 너무 작으면 무시
  const a = extrudeState.p1, b = extrudeState.p2;
  const stroke = document.getElementById('strokeColor').value || '#ffffff';
  const sw = parseInt(document.getElementById('strokeWidth').value) || 1;

  // 원본 도형 삭제 (점/선이 연장되면 새 요소로 대체됨)
  const removeSrc = () => {
    if (extrudeState.srcId != null){
      const idx = shapes.findIndex(x => x.id === extrudeState.srcId);
      if (idx >= 0) shapes.splice(idx, 1);
    }
  };

  if (!b){
    // 점 연장 → 선 1개 생성, 원본 점 삭제
    const a2 = { x: a.x + off.ox, y: a.y + off.oy };
    removeSrc();
    const newLn = { id: ++shapeIdSeq, type: 'line', p1: {...a}, p2: {...a2}, stroke, strokeWidth: sw };
    shapes.push(newLn);
    redoStack = []; pushHistory();
    redrawFills(); redrawDraw(); updateCount();
    document.getElementById('statusHint').textContent =
      `✓ 점 연장 완료: ${(off.dist*mmPerPixel).toFixed(2)}mm 선 생성`;
    // Rev.12.6: 거리두기 자동 생성 제거 (좌/우 선택 방식으로 변경)
    // Rev.12.1: 점 연장으로 만든 선 길이 팝업
    { const _id = newLn.id; setTimeout(() => openLineDimModal(_id), 0); }
    return;
  }

  // 선 연장 → 면 + 4변 생성, 원본 선 삭제 (원본 자리는 면의 한 변이 됨)
  const a2 = { x: a.x + off.ox, y: a.y + off.oy };
  const b2 = { x: b.x + off.ox, y: b.y + off.oy };
  removeSrc();
  // 사각형 4변 (원본 변 a-b 포함)
  shapes.push({ id: ++shapeIdSeq, type: 'line', p1: {...a},  p2: {...b},  stroke, strokeWidth: sw }); // 원본 자리
  shapes.push({ id: ++shapeIdSeq, type: 'line', p1: {...b},  p2: {...b2}, stroke, strokeWidth: sw });
  shapes.push({ id: ++shapeIdSeq, type: 'line', p1: {...b2}, p2: {...a2}, stroke, strokeWidth: sw });
  shapes.push({ id: ++shapeIdSeq, type: 'line', p1: {...a2}, p2: {...a},  stroke, strokeWidth: sw });
  // 면(fill)
  const fillColor = document.getElementById('fillColor').value || '#8e44ad';
  const alpha = (parseInt(document.getElementById('fillAlpha').value) || 50) / 100;
  const pattern = (typeof currentHatchPattern !== 'undefined') ? currentHatchPattern : 'solid';
  fills.push({
    id: ++shapeIdSeq, type: 'fill',
    points: [ {...a}, {...b}, {...b2}, {...a2} ],
    color: fillColor, alpha, pattern,
    layer: (typeof currentLayer !== 'undefined' ? currentLayer : 'default') || 'default'
  });
  redoStack = []; pushHistory();
  redrawFills(); redrawDraw(); updateCount();
  document.getElementById('statusHint').textContent =
    `✓ 선 연장 완료: ${(off.dist*mmPerPixel).toFixed(2)}mm 면 생성`;
}

// Rev.11.62: 블렌더식 1-클릭 연장 - 점/선 선택 후 Shift+빈공간 클릭 시 즉시 확정
//   점 선택 → 클릭 위치까지 선 생성(원본 점 삭제)
//   선 선택 → 클릭 위치 방향으로 면 생성(원본 선 흡수)
// 반환: 처리했으면 true
function blenderQuickExtrudeAt(mouse){
  // 선택된 점/선 1개 찾기
  let target = null;
  selectedIds.forEach(id => {
    const s = shapes.find(x => x.id === id);
    if (s && (s.type === 'line' || s.type === 'point') && !target) target = s;
  });
  if (!target) return false;

  // 클릭 위치 스냅(끝점/점/코너에 붙기)
  let p = snapPointForVertex(mouse);

  // extrudeState 임시 세팅 후 기존 commitExtrude 재사용
  const savedState = extrudeState, savedAxis = extrudeAxis, savedMode = extrudeMode;
  extrudeAxis = null;
  extrudeMode = true;

  let off;
  if (target.type === 'point'){
    extrudeState = { srcType:'point', srcId: target.id, p1:{x:target.p1.x,y:target.p1.y}, p2:null };
    // 점 → 클릭 위치까지 그대로 선 생성 (Shift 방향제약 배제)
    const a = extrudeState.p1;
    const dx = p.x - a.x, dy = p.y - a.y;
    off = { ox: dx, oy: dy, dist: Math.hypot(dx, dy) };
  } else {
    extrudeState = { srcType:'line', srcId: target.id,
                     p1:{x:target.p1.x,y:target.p1.y}, p2:{x:target.p2.x,y:target.p2.y} };
    // 선 → 클릭 위치 방향으로 직각(법선) 돌출하여 직사각형 면 생성
    const a = extrudeState.p1, b = extrudeState.p2;
    const mid = { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
    const dx = p.x - mid.x, dy = p.y - mid.y;
    const lx = b.x - a.x, ly = b.y - a.y;
    const ll = Math.hypot(lx, ly) || 1;
    const nx = -ly/ll, ny = lx/ll;          // 법선 단위벡터
    const nd = dx*nx + dy*ny;               // 법선 방향 투영 길이
    off = { ox: nx*nd, oy: ny*nd, dist: Math.abs(nd) };
  }

  if (off.dist < 1){
    // 너무 가까우면 취소(원상복구)
    extrudeState = savedState; extrudeAxis = savedAxis; extrudeMode = savedMode;
    return false;
  }
  commitExtrude(off);
  // 모드 종료
  extrudeState = null; extrudeAxis = null; extrudeMode = false;
  selectedIds.clear(); updateSelStat();
  preCtx.clearRect(0,0,baseW,baseH);
  updateVertexButtons();
  return true;
}

// 라이브 스냅 토글 버튼
document.getElementById('headerBtnLiveSnap').addEventListener('click', () => {
  liveSnapMode = !liveSnapMode;
  updateLiveSnapButton();
});

// Rev.11.24: 눈금자(그리드) 토글
document.getElementById('headerBtnGrid').addEventListener('click', () => {
  gridOn = !gridOn;
  const btn = document.getElementById('headerBtnGrid');
  btn.classList.toggle('active', gridOn); // Rev.11.54
  if (gridOn){
    document.getElementById('statusHint').textContent =
      `📐 눈금자 ON: 격자 ${gridSpacingMm}mm 간격 (굵은선 ${gridSpacingMm*5}mm)`;
  }
  redrawBg();
});
function updateLiveSnapButton() {
  const btn = document.getElementById('headerBtnLiveSnap');
  if (!btn) return;
  btn.classList.toggle('active', !!liveSnapMode); // Rev.11.54
  updateSnapStat();
}

// 헤더 선택 버튼 상태 표시 (선택 도구 활성 시 강조)
function updateHeaderSelectButton() {
  const btn = document.getElementById('headerBtnSelect');
  if (!btn) return;
  if (tool === 'select') {
    btn.style.background = '#d9534f';
    btn.textContent = '🔲 선택 (ON)';
  } else {
    btn.style.background = '#9b59b6';
    btn.textContent = '🔲 선택';
  }
}

// updateToolStatus 후에 헤더 버튼 갱신
const _origUpdateToolStatus2 = updateToolStatus;
updateToolStatus = function() {
  _origUpdateToolStatus2();
  updateHeaderSelectButton();
};

// ====== C3D(draw_tool3.html)로 도형 전송 ======
function sendToC3D() {
  if (!shapes || shapes.length === 0) {
    if (confirm('전송할 2D 도형이 없습니다.\nC3D(3D 모델러)로 그냥 이동할까요?')) {
      window.location.href = 'draw_tool3.html';
    }
    return;
  }

  // 픽셀 -> mm 스케일 입력 (기본 1픽셀 = 1mm)
  const scaleStr = prompt(
    '📐 C3D로 전송\n\n2D 도형 ' + shapes.length + '개를 3D 모델러로 보냅니다.\n\n픽셀 → mm 변환 스케일 입력\n(예: 1 = 1px당 1mm, 0.1 = 1px당 0.1mm)',
    '1'
  );
  if (scaleStr === null) return; // 취소
  const scale = parseFloat(scaleStr);
  if (!isFinite(scale) || scale <= 0) {
    alert('잘못된 스케일 값입니다.');
    return;
  }

  // 도형 변환: draw_tool 좌표(Y 아래로 +) -> Catia3D 좌표(Y 위로 +)
  // 캔버스 좌표의 중앙(또는 0,0)을 기준으로 그대로 변환하되 Y만 반전
  const out = [];
  shapes.forEach(s => {
    const color = s.stroke || '#000000';
    const lw = s.strokeWidth || 2;
    if (s.type === 'line') {
      out.push({
        type: 'line',
        x1: s.p1.x * scale, y1: -s.p1.y * scale,
        x2: s.p2.x * scale, y2: -s.p2.y * scale,
        color: color, lineWidth: lw
      });
    } else if (s.type === 'rect') {
      out.push({
        type: 'rect',
        x1: s.p1.x * scale, y1: -s.p1.y * scale,
        x2: s.p2.x * scale, y2: -s.p2.y * scale,
        color: color, lineWidth: lw
      });
    } else if (s.type === 'circle') {
      const r = Math.hypot(s.p2.x - s.p1.x, s.p2.y - s.p1.y) * scale;
      out.push({
        type: 'circle',
        cx: s.p1.x * scale, cy: -s.p1.y * scale, r: r,
        color: color, lineWidth: lw
      });
    } else if (s.type === 'arc') {
      // Y 반전 시 각도도 부호 반전 (atan2(-y,x))
      out.push({
        type: 'arc',
        cx: s.cx * scale, cy: -s.cy * scale, r: s.r * scale,
        startAngle: -s.startAngle,
        endAngle: -s.endAngle,
        color: color, lineWidth: lw
      });
    }
    // dim/text 등 기타 타입은 3D 변환 불가 → 건너뜀
  });

  if (out.length === 0) {
    if (confirm('변환 가능한 도형(선/사각/원/호)이 없습니다.\nC3D로 그냥 이동할까요?')) {
      window.location.href = 'draw_tool3.html';
    }
    return;
  }

  // localStorage에 저장 (C3D에서 자동 로드)
  const payload = {
    from: 'draw_tool',
    sentAt: new Date().toISOString(),
    scale: scale,
    shapes: out
  };
  try {
    localStorage.setItem('c3d_import_from_draw_tool', JSON.stringify(payload));
  } catch (e) {
    alert('전송 실패: ' + e.message);
    return;
  }

  if (confirm('✅ ' + out.length + '개 도형을 C3D로 전송 준비 완료.\n\nC3D(draw_tool3.html)로 이동하시겠습니까?')) {
    window.location.href = 'draw_tool3.html';
  }
}

// ====== 드롭다운 메뉴바 (Rev.7.7) ======
document.querySelectorAll('.menu .menu-title').forEach(t => {
  t.addEventListener('click', e => {
    e.stopPropagation();
    const menu = t.parentElement;
    // Tinkercad 탭은 드롭다운 없이 외부 사이트(새 탭)로 이동
    if (menu.dataset.menu === 'tinkercad') {
      window.open('https://www.tinkercad.com/dashboard', '_blank');
      return;
    }
    // tool3 탭은 3D 모델러(draw_tool3.html)로 이동 (새 탭)
    if (menu.dataset.menu === 'tool3') {
      window.open('draw_tool3.html', '_blank');
      return;
    }
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.menu').forEach(m => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
  });
  // 호버로 열림 전환 (다른 메뉴가 열려있을 때만)
  t.addEventListener('mouseenter', () => {
    // Tinkercad 탭은 호버시 열림 처리 안 함
    if (t.parentElement.dataset.menu === 'tinkercad') return;
    if (t.parentElement.dataset.menu === 'tool3') return;
    const anyOpen = document.querySelector('.menu.open');
    if (anyOpen && anyOpen !== t.parentElement) {
      document.querySelectorAll('.menu').forEach(m => m.classList.remove('open'));
      t.parentElement.classList.add('open');
    }
  });
});
// 바깥 클릭으로 닫기
document.addEventListener('click', () => {
  document.querySelectorAll('.menu').forEach(m => m.classList.remove('open'));
});
// 메뉴 항목 클릭 시 자동 닫기 (단, input 타입은 제외)
document.querySelectorAll('.menu-item').forEach(it => {
  it.addEventListener('click', e => {
    // input/range가 안에 있는 항목은 닫지 않음
    if (e.target.tagName === 'INPUT') {
      e.stopPropagation();
      return;
    }
    setTimeout(() => {
      document.querySelectorAll('.menu').forEach(m => m.classList.remove('open'));
    }, 50);
  });
});

// 신규 메뉴 ID들 → 기존 더미 버튼으로 위임
document.getElementById('menuClearBg').addEventListener('click', () => {
  document.getElementById('btnClearBg').click();
});
document.getElementById('menuContinueFromSel').addEventListener('click', () => {
  document.getElementById('btnContinueFromSel').click();
});
document.getElementById('menuConnectSel').addEventListener('click', () => {
  document.getElementById('btnConnectSel').click();
});
document.getElementById('menuResetAxis').addEventListener('click', () => {
  document.getElementById('btnResetAxis').click();
});
// 교차점 일괄 분할
(function(){
  const m = document.getElementById('menuBreakAll');
  if (m) m.addEventListener('click', () => {
    runBreakAllIntersections();
  });
})();
document.getElementById('menuSave3D').addEventListener('click', () => {
  if (!lastGeneratedMesh) {
    alert('아직 3D 모델이 없습니다.\n[3D] 메뉴 → [3D 모델 생성]에서 만들어 주세요.');
    return;
  }
  saveMesh3D(lastGeneratedMesh);
});

// 스냅/연속선 메뉴 토글 → 더미 버튼 트리거
document.getElementById('menuSnap').addEventListener('click', () => {
  document.getElementById('btnSnap').click();
  setTimeout(updateMenuToggles, 50);
});
document.getElementById('menuContinuous').addEventListener('click', () => {
  document.getElementById('btnContinuous').click();
  setTimeout(updateMenuToggles, 50);
});

// A안 정밀 스냅 토글 (Rev.7.9)
document.getElementById('menuSnapTangent').addEventListener('click', () => {
  snapTangent = !snapTangent;
  document.getElementById('snapTanState').textContent = snapTangent ? 'ON' : 'OFF';
});
document.getElementById('menuSnapPerp').addEventListener('click', () => {
  snapPerpendicular = !snapPerpendicular;
  document.getElementById('snapPerpState').textContent = snapPerpendicular ? 'ON' : 'OFF';
});
document.getElementById('menuSnapParallel').addEventListener('click', () => {
  snapParallel = !snapParallel;
  document.getElementById('snapParaState').textContent = snapParallel ? 'ON' : 'OFF';
});
document.getElementById('menuSnapExtension').addEventListener('click', () => {
  snapExtension = !snapExtension;
  document.getElementById('snapExtState').textContent = snapExtension ? 'ON' : 'OFF';
});

// ====== 배경색 변경 (Rev.8.0) ======
function setCanvasBgColor(color) {
  const wrap = document.getElementById('canvasWrap');
  if (color === 'checker') {
    wrap.classList.add('checker');
    document.documentElement.style.setProperty('--canvas-bg', 'transparent');
    document.getElementById('canvasStack').style.background = 'transparent';
  } else {
    wrap.classList.remove('checker');
    document.documentElement.style.setProperty('--canvas-bg', color);
    document.getElementById('canvasStack').style.background = color;
    document.getElementById('canvasBgColor').value = color;
  }
  // 저장 시 PNG에 배경색 적용을 위해 전역 저장
  currentCanvasBg = color;
  try { localStorage.setItem('canvasBgColor', color); } catch(e) {}
}

let currentCanvasBg = '#000000';

// 컬러 피커
document.getElementById('canvasBgColor').addEventListener('input', e => {
  setCanvasBgColor(e.target.value);
});
document.getElementById('canvasBgColor').addEventListener('click', e => {
  e.stopPropagation();  // 메뉴 닫힘 방지
});

// 프리셋 색 클릭
document.querySelectorAll('.bg-preset').forEach(el => {
  el.addEventListener('click', e => {
    e.stopPropagation();
    setCanvasBgColor(el.dataset.color);
  });
});

// Rev.16.1: 채움 색 팔레트 - 클릭 시 fillColor 설정
document.querySelectorAll('.fill-preset').forEach(el => {
  el.addEventListener('click', e => {
    e.stopPropagation();
    const c = el.dataset.color;
    const inp = document.getElementById('fillColor');
    if (inp) inp.value = c;
    document.getElementById('statusHint').textContent = `🎨 채움 색: ${c}`;
  });
});

// 초기값 복원 (저장된 색이 있으면)
try {
  const saved = localStorage.getItem('canvasBgColor');
  if (saved) setCanvasBgColor(saved);
  else setCanvasBgColor('#000000');  // 기본 검은색
} catch(e) {
  setCanvasBgColor('#000000');
}

// PNG 배경 옵션: 사용자 지정 선택 시 컬러피커 표시
document.getElementById('pngBg').addEventListener('change', e => {
  const customPicker = document.getElementById('pngBgCustom');
  customPicker.style.display = (e.target.value === 'custom') ? 'inline-block' : 'none';
});

// 상단바의 토글 뱃지
document.getElementById('badgeSnap').addEventListener('click', () => {
  document.getElementById('btnSnap').click();
  setTimeout(updateMenuToggles, 50);
});
document.getElementById('badgeCont').addEventListener('click', () => {
  document.getElementById('btnContinuous').click();
  setTimeout(updateMenuToggles, 50);
});

// 메뉴 토글 상태 표시 갱신
function updateMenuToggles() {
  const snapState = document.getElementById('menuSnapState');
  if (snapState) snapState.textContent = snapMode ? 'ON' : 'OFF';
  const contState = document.getElementById('menuContState');
  if (contState) contState.textContent = continuousMode ? 'ON' : 'OFF';
  
  const bs = document.getElementById('badgeSnap');
  if (bs) { bs.textContent = '🧲 ' + (snapMode?'ON':'OFF'); bs.style.background = snapMode?'#d9534f':'#9b59b6'; }
  const bc = document.getElementById('badgeCont');
  if (bc) { bc.textContent = '⛓ ' + (continuousMode?'ON':'OFF'); bc.style.background = continuousMode?'#d9534f':'#555'; }
  
  const bt = document.getElementById('badgeTool');
  const names = {select:'선택', line:'선', rect:'사각형', circle:'원', arc:'라운드', fill:'채움', calib:'캘리브', axis:'회전축'};
  if (bt) bt.textContent = names[tool] || tool;
}

// ====== AutoCAD 스타일 명령창 (Rev.9.1) ======
// 명령어 사전: 별칭(키) → {tool: 또는 action:, name: 표시명}
const CMD_DICT = {
  // 그리기 도구
  'L':         { tool: 'line',   name: 'LINE (선)' },
  'LINE':      { tool: 'line',   name: 'LINE (선)' },
  'REC':       { tool: 'rect',   name: 'RECTANG (사각형)' },
  'RECT':      { tool: 'rect',   name: 'RECTANG (사각형)' },
  'RECTANG':   { tool: 'rect',   name: 'RECTANG (사각형)' },
  'RECTANGLE': { tool: 'rect',   name: 'RECTANG (사각형)' },
  'C':         { tool: 'circle', name: 'CIRCLE (원)' },
  'CIRCLE':    { tool: 'circle', name: 'CIRCLE (원)' },
  'A':         { tool: 'arc',    name: 'ARC (호)' },
  'ARC':       { tool: 'arc',    name: 'ARC (호)' },
  
  // 선택/측정/채움
  'S':         { tool: 'select', name: 'SELECT (선택)' },
  'SE':        { tool: 'select', name: 'SELECT (선택)' },
  'SELECT':    { tool: 'select', name: 'SELECT (선택)' },
  'H':         { tool: 'fill',   name: 'HATCH (채움)' },
  'HATCH':     { tool: 'fill',   name: 'HATCH (채움)' },
  'BH':        { tool: 'fill',   name: 'HATCH (채움)' },
  'DI':        { tool: 'calib',  name: 'DIST (캘리브/거리)' },
  'DIST':      { tool: 'calib',  name: 'DIST (캘리브/거리)' },
  
  // B안 편집 명령 (AutoCAD 표준)
  'TR':        { tool: 'trim',   name: 'TRIM (트리밍)' },
  'TRIM':      { tool: 'trim',   name: 'TRIM (트리밍)' },
  'EX':        { tool: 'extend', name: 'EXTEND (연장)' },
  'EXTEND':    { tool: 'extend', name: 'EXTEND (연장)' },
  'R':         { tool: 'fillet',  name: 'FILLET (모서리R)' },
  'CH':        { tool: 'chamfer',    name: 'CHAMFER (면취)' },
  'CL':        { tool: 'centerline', name: 'CENTERLINE (기준선)' },
  'CENTERLINE':{ tool: 'centerline', name: 'CENTERLINE (기준선)' },
  'CHAMFER':   { tool: 'chamfer', name: 'CHAMFER (면취)' },
  'TAN':       { tool: 'tangent', name: 'TANGENT (접선연결)' },
  'TANGENT':   { tool: 'tangent', name: 'TANGENT (접선연결)' },
  'ER':        { tool: 'fillet', name: 'FILLET (모서리R)' },
  'FILLET':    { tool: 'fillet', name: 'FILLET (모서리R)' },
  'F':         { action: 'connect', name: 'CONNECT (연결)' },
  'CONNECT':   { action: 'connect', name: 'CONNECT (연결)' },
  'O':         { tool: 'offset', name: 'OFFSET (오프셋)' },
  'OFFSET':    { tool: 'offset', name: 'OFFSET (오프셋)' },
  'BR':        { tool: 'break',  name: 'BREAK (분할)' },
  'BREAK':     { tool: 'break',  name: 'BREAK (분할)' },
  'BAT':       { tool: 'breakAtPoint', name: 'BREAK at POINT (점에서 분할)' },
  'BREAKATPOINT': { tool: 'breakAtPoint', name: 'BREAK at POINT (점에서 분할)' },
  'BRA':       { action: 'breakAll', name: 'BREAK ALL (교차점 일괄 분할)' },
  'BREAKALL':  { action: 'breakAll', name: 'BREAK ALL (교차점 일괄 분할)' },
  
  // D안 치수 (AutoCAD DIM 명령군)
  'DLI':       { tool: 'dimLinear',   name: 'DIMLINEAR (선형치수)' },
  'DIMLIN':    { tool: 'dimLinear',   name: 'DIMLINEAR (선형치수)' },
  'DIMLINEAR': { tool: 'dimLinear',   name: 'DIMLINEAR (선형치수)' },
  'DAL':       { tool: 'dimAligned',  name: 'DIMALIGNED (평행치수)' },
  'DIMALI':    { tool: 'dimAligned',  name: 'DIMALIGNED (평행치수)' },
  'DIMALIGNED':{ tool: 'dimAligned',  name: 'DIMALIGNED (평행치수)' },
  'DRA':       { tool: 'dimRadius',   name: 'DIMRADIUS (반지름)' },
  'DIMRAD':    { tool: 'dimRadius',   name: 'DIMRADIUS (반지름)' },
  'DIMRADIUS': { tool: 'dimRadius',   name: 'DIMRADIUS (반지름)' },
  'DDI':       { tool: 'dimDiameter', name: 'DIMDIAMETER (직경)' },
  'DIMDIA':    { tool: 'dimDiameter', name: 'DIMDIAMETER (직경)' },
  'DIMDIAMETER':{tool: 'dimDiameter', name: 'DIMDIAMETER (직경)' },
  'DAN':       { tool: 'dimAngle',    name: 'DIMANGULAR (각도)' },
  'DIMANG':    { tool: 'dimAngle',    name: 'DIMANGULAR (각도)' },
  'DIMANGULAR':{ tool: 'dimAngle',    name: 'DIMANGULAR (각도)' },
  
  // 3D
  'AX':        { tool: 'axis',   name: 'AXIS (회전축)' },
  'AXIS':      { tool: 'axis',   name: 'AXIS (회전축)' },
  
  // E안: 복사/변환
  'CO':        { tool: 'copy',     name: 'COPY (복사)' },
  'COPY':      { tool: 'copy',     name: 'COPY (복사)' },
  'CP':        { tool: 'copy',     name: 'COPY (복사)' },
  
  // Rev.10.1: 채움 자동 검출
  'BPOLY':     { action: 'bpoly',   name: 'BPOLY (모든 영역 자동 채움)' },
  'BH':        { tool: 'fill',      name: 'BHATCH (채움)' },
  'BHATCH':    { tool: 'fill',      name: 'BHATCH (채움)' },
  'M':         { tool: 'movetool', name: 'MOVE (이동)' },
  'MOVE':      { tool: 'movetool', name: 'MOVE (이동)' },
  'RO':        { tool: 'rotate',   name: 'ROTATE (회전)' },
  'ROTATE':    { tool: 'rotate',   name: 'ROTATE (회전)' },
  'MI':        { tool: 'mirror',   name: 'MIRROR (대칭)' },
  'MIRROR':    { tool: 'mirror',   name: 'MIRROR (대칭)' },
  'SC':        { tool: 'scale',    name: 'SCALE (스케일)' },
  'SCALE':     { tool: 'scale',    name: 'SCALE (스케일)' },
  'AR':        { action: 'array',  name: 'ARRAY (배열)' },
  'ARRAY':     { action: 'array',  name: 'ARRAY (배열)' },
  'DC':        { action: 'distcopy', name: '거리복사 (Distance Copy)' },
  'DISTCOPY':  { action: 'distcopy', name: '거리복사 (Distance Copy)' },
  
  // F안: 추가 그리기
  'PL':        { tool: 'polyline', name: 'POLYLINE (폴리라인)' },
  'POLYLINE':  { tool: 'polyline', name: 'POLYLINE (폴리라인)' },
  'POL':       { action: 'polygon',name: 'POLYGON (정n각형)' },
  'POLYGON':   { action: 'polygon',name: 'POLYGON (정n각형)' },
  'EL':        { tool: 'ellipse',  name: 'ELLIPSE (타원)' },
  'ELLIPSE':   { tool: 'ellipse',  name: 'ELLIPSE (타원)' },
  'T':         { tool: 'text',     name: 'TEXT (텍스트)' },
  'TEXT':      { tool: 'text',     name: 'TEXT (텍스트)' },
  'MT':        { tool: 'text',     name: 'MTEXT (텍스트)' },
  'MTEXT':     { tool: 'text',     name: 'MTEXT (텍스트)' },
  
  // G안: 레이어/선종류
  'LA':        { action: 'layer',  name: 'LAYER (레이어 관리)' },
  'LAYER':     { action: 'layer',  name: 'LAYER (레이어 관리)' },
  'LAY':       { action: 'layer',  name: 'LAYER (레이어 관리)' },
  
  // 측정 도구
  'LI':        { action: 'list',   name: 'LIST (속성 출력)' },
  'LIST':      { action: 'list',   name: 'LIST (속성 출력)' },
  'AA':        { action: 'area',   name: 'AREA (면적)' },
  'AREA':      { action: 'area',   name: 'AREA (면적)' },
  'ID':        { action: 'id',     name: 'ID (좌표)' },
  
  // 뷰
  'Z':         { action: 'zoom-extent', name: 'ZOOM (전체보기)' },
  'ZE':        { action: 'zoom-extent', name: 'ZOOM EXTENT' },
  'ZOOM':      { action: 'zoom-extent', name: 'ZOOM (전체보기)' },
  
  // 파일 형식
  'DXF':       { action: 'dxf',    name: 'DXF 내보내기' },
  'DXFOUT':    { action: 'dxf',    name: 'DXF 내보내기' },
  
  // 액션 명령
  'U':         { action: 'undo',  name: 'UNDO (실행취소)' },
  'UNDO':      { action: 'undo',  name: 'UNDO (실행취소)' },
  'REDO':      { action: 'redo',  name: 'REDO (다시실행)' },
  'E':         { action: 'extrude', name: 'EXTRUDE (연장-면만들기)' },
  'EXT':       { action: 'extrude', name: 'EXTRUDE (연장-면만들기)' },
  'EXTRUDE':   { action: 'extrude', name: 'EXTRUDE (연장-면만들기)' },
  'ERASE':     { action: 'erase', name: 'ERASE (선택 삭제)' },
  'DEL':       { action: 'erase', name: 'ERASE (선택 삭제)' },
  'DELETE':    { action: 'erase', name: 'ERASE (선택 삭제)' },
  'SAVE':      { action: 'save',  name: 'SAVE (저장)' },
  'QSAVE':     { action: 'save',  name: 'QSAVE (저장)' },
  
  // 토글
  'SNAP':      { action: 'toggle-snap',     name: 'SNAP 토글' },
  'OSNAP':     { action: 'toggle-snap',     name: 'OSNAP (객체스냅)' },
  'OS':        { action: 'toggle-snap',     name: 'OSNAP (객체스냅)' },
  'LSNAP':     { action: 'toggle-livesnap', name: '라이브스냅 토글' },
  
  // 도움말
  '?':         { action: 'help',  name: 'HELP (도움말)' },
  'HELP':      { action: 'help',  name: 'HELP (도움말)' },
};

// E는 EXTEND(편집) vs ERASE(삭제) 충돌 → AutoCAD에서도 E는 ERASE가 표준
// 위에서 ERASE가 E를 덮어씌우므로 E = ERASE (의도된 동작)
// EXTEND는 EX 사용

let cmdHistory = [];  // 실행한 명령어들
let cmdHistoryIdx = -1;  // 위/아래 화살표 인덱스
let lastCmd = null;  // Space/Enter로 반복할 마지막 명령

function cmdLog(text, cls) {
  const hist = document.getElementById('cmdHistory');
  const div = document.createElement('div');
  div.className = 'cmd-line ' + (cls || '');
  div.textContent = text;
  hist.appendChild(div);
  hist.scrollTop = hist.scrollHeight;
  // 오래된 줄 제거 (최대 200줄)
  while (hist.children.length > 200) hist.removeChild(hist.firstChild);
}

// Rev.16.28: 치수 인자형 그리기 명령 파서. 처리하면 true 반환.
// 지원:
//   BASE W H            → W×H mm 사각형(4선) 작업영역 중앙 배치 (가로 세로)
//   사각형 W H / REC W H → 동일
//   LINE x1 y1 x2 y2    → (x1,y1)-(x2,y2) mm 선
//   원 D / CIRCLE D      → 지름 D mm 원 (작업영역 중앙)
//   HLINE L / 가로선 L   → 길이 L mm 가로선 (중앙)
//   VLINE L / 세로선 L   → 길이 L mm 세로선 (중앙)
// Rev.16.29: 한붓그리기 점번호 시스템
//   시작 X Y / START X Y → P0를 (X,Y)mm로 설정 (없으면 0,0=중앙)
//   우/좌/상/하 D        → 현재 점에서 D mm 이동하며 선, 끝점에 새 번호
//   도 A D / ANG A D     → 각도 A도(반시계,0=우) 방향 D mm
//   P3 우 50             → P3에서 분기 시작 후 이동
//   선 P1 P4 / LINK P1 P4→ 두 점 직접 연결
//   닫기 / CLOSE         → 현재 점에서 P0로 선 긋기
//   점초기화 / PRESET     → 점번호 시스템 리셋
function penWorldOrigin(){ return { x: baseW/2, y: baseH/2 }; }   // 0,0 = 작업영역 중앙
// mm(위=+Y 도면좌표) → 픽셀(아래=+Y). 원점은 중앙
function penMmToPx(xmm, ymm){
  const o = penWorldOrigin();
  return { x: o.x + xmm/mmPerPixel, y: o.y - ymm/mmPerPixel };
}
function penPxToMm(px, py){
  const o = penWorldOrigin();
  return { x: (px - o.x)*mmPerPixel, y: -(py - o.y)*mmPerPixel };
}
function penAddPoint(px, py){
  // Rev.16.34: 이미 같은 위치에 번호 점이 있으면 그 번호를 현재점으로 (중복 생성 방지)
  const tolPx = 1/mmPerPixel * 0.05;
  for (let i=0;i<penPoints.length;i++){
    if (Math.hypot(penPoints[i].x-px, penPoints[i].y-py) < tolPx){ penCur = i; return i; }
  }
  const idx = penPoints.length;
  penPoints.push({ x:px, y:py });
  penCur = idx;
  // 점 마커
  shapes.push({ id:++shapeIdSeq, type:'point', p1:{x:px,y:py}, stroke:'#16e0b0', strokeWidth:1, penIdx:idx });
  // 라벨 Pn
  const lbId = ++shapeIdSeq;
  shapes.push({ id:lbId, type:'text', pos:{x:px + 8/(zoom||1), y:py - 22/(zoom||1)}, text:''+idx, sizePx: 16/(zoom||1), stroke:'#16e0b0', layer:(currentLayer||'default'), penLabel:idx });
  penLabelIds[idx] = lbId;
  return idx;
}
function penAddLine(x1,y1,x2,y2){
  const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
  const stroke = document.getElementById('strokeColor').value || '#ffffff';
  const newLine = { id:++shapeIdSeq, type:'line', p1:{x:x1,y:y1}, p2:{x:x2,y:y2}, stroke, strokeWidth:sw, layer:(currentLayer||'default') };
  shapes.push(newLine);
  // Rev.16.34: 새 선이 기존 선들과 만나는 교차점 자동 번호 부여
  penAutoIntersect(newLine);
}
// Rev.16.34: 주어진 선과 기존 다른 선들의 교차점을 찾아 자동으로 번호 점 추가
function penAutoIntersect(newLine){
  const tolPx = 1/mmPerPixel * 0.05;  // 0.05mm 이내 중복 무시
  const dup = (x,y) => penPoints.some(p => Math.hypot(p.x-x, p.y-y) < tolPx);
  for (const s of shapes){
    if (s === newLine || s.type !== 'line' || !s.p1 || !s.p2) continue;
    const ix = lineSegmentIntersection(newLine.p1, newLine.p2, s.p1, s.p2);
    if (ix && !dup(ix.x, ix.y)){
      penAddPoint(ix.x, ix.y);  // 교점에 번호 부여
    }
  }
}
function penFinish(msg){
  redoStack = []; pushHistory();
  if (typeof redrawFills === 'function') redrawFills();
  redrawDraw(); updateCount();
  cmdLog('  '+msg, 'system');
  document.getElementById('statusHint').textContent = msg;
}
function tryPenCommand(cmdStr){
  const toks = cmdStr.replace(/,/g,' ').split(/\s+/).filter(Boolean);
  if (!toks.length) return false;

  // 점번호 초기화
  if (toks[0] === '점초기화' || toks[0] === 'PRESET' || toks[0] === '리셋'){
    penPoints = []; penLabelIds = []; penCur = -1;
    document.getElementById('statusHint').textContent = '✎ 한붓그리기 점번호 초기화됨';
    cmdLog('  점번호 초기화', 'system');
    return true;
  }

  // Rev.16.35: 백 - 직전 작업 1회 취소 (undo)
  if (toks[0] === '백' || toks[0] === 'BACK' || toks[0] === 'UNDO'){
    if (typeof undo === 'function') undo();
    // 마지막 점이 사라졌으면 penCur/penPoints 동기화
    penSyncFromShapes();
    document.getElementById('statusHint').textContent = '↩ 백: 직전 작업 취소';
    cmdLog('  백(취소)', 'system');
    return true;
  }

  // Rev.16.38: 선택 N - 현재 점을 N번으로 이동 (이후 거기서 이어그리기)
  if ((toks[0] === '선택' || toks[0] === 'SEL' || toks[0] === 'SELECT') && toks.length >= 2){
    const idx = parsePenIdx(toks[1]);
    if (idx == null || !penPoints[idx]){
      document.getElementById('statusHint').textContent = `선택 실패: ${toks[1]}번 점이 없습니다`;
      return true;
    }
    penCur = idx;
    const m = penPxToMm(penPoints[idx].x, penPoints[idx].y);
    penFinish(`▸ 현재 점 = ${idx}번 (${Math.round(m.x*10)/10}, ${Math.round(m.y*10)/10})mm · 여기서 이어그리기`);
    return true;
  }

  // Rev.16.39: 삭제 - 삭제 1 2 (1-2 선 삭제) / 삭제 3 (3번 점 삭제)
  if (toks[0] === '삭제' || toks[0] === 'DEL' || toks[0] === 'DELETE' || toks[0] === 'ERASE'){
    if (toks.length >= 3 && parsePenIdx(toks[1]) != null && parsePenIdx(toks[2]) != null){
      // 선 삭제 (두 점이 끝점인 선)
      const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
      const ln = penFindLineByEndpoints(i1, i2);
      if (!ln){ document.getElementById('statusHint').textContent = `삭제 실패: ${i1}-${i2} 선이 없음`; return true; }
      shapes = shapes.filter(s => s.id !== ln.id);
      penFinish(`🗑 ${i1}-${i2} 선 삭제`);
      return true;
    } else if (toks.length >= 2 && parsePenIdx(toks[1]) != null){
      // 점 삭제 (점 마커 + 라벨)
      const idx = parsePenIdx(toks[1]);
      if (!penPoints[idx]){ document.getElementById('statusHint').textContent = `삭제 실패: ${idx}번 점이 없음`; return true; }
      const removeIds = [];
      for (const s of shapes){
        if (s.type === 'point' && s.penIdx === idx) removeIds.push(s.id);
        if (s.type === 'text' && s.penLabel === idx) removeIds.push(s.id);
      }
      shapes = shapes.filter(s => !removeIds.includes(s.id));
      penPoints[idx] = undefined;  // 번호는 빈 자리로 둠 (다른 번호 안 밀림)
      penLabelIds[idx] = undefined;
      penFinish(`🗑 ${idx}번 점 삭제 (연결선은 유지)`);
      return true;
    }
    return false;
  }

  // Rev.16.39: 이동 - 이동 1 우 10 (1번 점을 우 10mm, 연결된 선 끝점도 함께)
  if (toks[0] === '이동' || toks[0] === 'MOVE'){
    const idx = parsePenIdx(toks[1]);
    if (idx == null || !penPoints[idx]) return false;
    let moff = 2;
    let useSealM = false;
    if (toks[moff] === '씰'){ useSealM = true; moff++; }
    const mdir = toks[moff];
    const mval = evalExpr(toks[moff+1]);
    if (!['우','좌','상','하','R','L','U','D'].includes(mdir) || !isFinite(mval)) return false;
    const old = penPoints[idx];
    let ndx=0, ndy=0;
    if (useSealM && (mdir==='우'||mdir==='좌'||mdir==='R'||mdir==='L')){
      // 씰: mval=목표지름, 이동=|목표-현재|/2
      const curXmm = penPxToMm(old.x, old.y).x;
      const moveMm = Math.abs(mval - curXmm)/2;
      ndx = ((mdir==='좌'||mdir==='L') ? -1 : 1) * moveMm / mmPerPixel;
    } else {
      const dpx = mval/mmPerPixel;
      if (mdir==='우'||mdir==='R') ndx = dpx;
      else if (mdir==='좌'||mdir==='L') ndx = -dpx;
      else if (mdir==='상'||mdir==='U') ndy = -dpx;
      else if (mdir==='하'||mdir==='D') ndy = dpx;
    }
    const nx = old.x + ndx, ny = old.y + ndy;
    const tol = 1/mmPerPixel * 0.1;
    // 이 점에 연결된 선 끝점들도 함께 이동
    for (const s of shapes){
      if (s.type !== 'line' || !s.p1 || !s.p2) continue;
      if (Math.hypot(s.p1.x-old.x, s.p1.y-old.y) < tol){ s.p1.x = nx; s.p1.y = ny; }
      if (Math.hypot(s.p2.x-old.x, s.p2.y-old.y) < tol){ s.p2.x = nx; s.p2.y = ny; }
    }
    // 점 마커 + 라벨 갱신
    for (const s of shapes){
      if (s.type === 'point' && s.penIdx === idx){ s.p1.x = nx; s.p1.y = ny; }
    }
    penPoints[idx] = { x:nx, y:ny };
    penUpdateLabel(idx, nx, ny);
    penFinish(`✥ ${idx}번 점 ${useSealM?'씰 ':''}${mdir} ${mval}${useSealM?'(지름)':'mm'} 이동`);
    return true;
  }

  // Rev.16.31: 교점 번호 - 현재 모든 선의 교차점을 찾아 번호 부여
  if (toks[0] === '교점' || toks[0] === 'INTERSECT' || toks[0] === 'IX'){
    const lines = shapes.filter(s => s.type === 'line' && s.p1 && s.p2);
    if (lines.length < 2){
      document.getElementById('statusHint').textContent = '교점: 선이 2개 이상 필요합니다';
      return true;
    }
    // 모든 선쌍의 교차점(선분 내부) 수집, 중복 제거
    const found = [];
    const isDup = (x,y) => found.some(p => Math.hypot(p.x-x, p.y-y) < 1/mmPerPixel*0.05) // 0.05mm 이내 중복
                        || penPoints.some(p => Math.hypot(p.x-x, p.y-y) < 1/mmPerPixel*0.05);
    for (let i=0;i<lines.length;i++){
      for (let j=i+1;j<lines.length;j++){
        const ix = lineSegmentIntersection(lines[i].p1, lines[i].p2, lines[j].p1, lines[j].p2);
        if (ix && !isDup(ix.x, ix.y)){ found.push({x:ix.x, y:ix.y}); }
      }
    }
    if (found.length === 0){
      document.getElementById('statusHint').textContent = '교점: 새로운 교차점이 없습니다';
      return true;
    }
    const first = penPoints.length;
    found.forEach(p => penAddPoint(p.x, p.y));
    penFinish(`✕ 교점 ${found.length}개에 번호 부여 (${first}~${penPoints.length-1})`);
    return true;
  }

  // Rev.16.32: 좌표 점 찍기 - 점 X,Y  (0,0=중앙, 위=+Y)
  if (toks[0] === '점' && toks.length >= 3){
    const xmm = evalExpr(toks[1]), ymm = evalExpr(toks[2]);
    if (!isFinite(xmm) || !isFinite(ymm)) return false;
    const p = penMmToPx(xmm, ymm);
    penAddPoint(p.x, p.y);
    penFinish(`• ${penCur}번 점 = (${xmm}, ${ymm})mm`);
    return true;
  }

  // Rev.16.32: 씰 좌표 점 - 씰 점 D,Y  (D=지름, 항상 좌측 X=-D/2, Y 그대로)
  if (toks[0] === '씰' && toks[1] === '점' && toks.length >= 4){
    const D = evalExpr(toks[2]), ymm = evalExpr(toks[3]);
    if (!isFinite(D) || !isFinite(ymm)) return false;
    const xmm = -Math.abs(D)/2;   // 좌측 전용
    const p = penMmToPx(xmm, ymm);
    penAddPoint(p.x, p.y);
    penFinish(`⌀ ${penCur}번 씰점 = Ø${D} → 좌측 X=${xmm.toFixed(2)}, Y=${ymm}mm`);
    return true;
  }

  // Rev.16.33: 연결 1 2  (1번과 2번 직선 연결, 공백 구분 / '선'도 동일)
  if (toks[0] === '연결' || toks[0] === '선' || toks[0] === 'LINK'){
    if (toks.length < 3) return false;
    const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
    if (i1 == null || i2 == null || !penPoints[i1] || !penPoints[i2]) return false;
    penAddLine(penPoints[i1].x, penPoints[i1].y, penPoints[i2].x, penPoints[i2].y);
    penCur = i2;
    penFinish(`／ ${i1}-${i2} 연결`);
    return true;
  }

  // Rev.16.32: 필렛 - 알 3 0.1  (3번 교점에 지름 0.1 필렛)
  if ((toks[0] === '알' || toks[0] === 'FILLET' || toks[0] === 'R') && toks.length >= 3){
    const idx = parsePenIdx(toks[1]);
    const dia = evalExpr(toks[2]);
    if (idx == null || !penPoints[idx] || !isFinite(dia) || dia <= 0) return false;
    const ok = penFilletAtPoint(penPoints[idx], dia);
    if (!ok){ document.getElementById('statusHint').textContent = `필렛 실패: ${idx}번에서 만나는 두 선을 못 찾음`; return true; }
    penFinish(`◜ ${idx}번 교점 Ø${dia} 필렛`);
    return true;
  }

  // Rev.16.37: 모따기 - 모따기 10 0.5  (10번 교점에 C=0.5 모따기, 기존 챔퍼와 동일)
  if ((toks[0] === '모따기' || toks[0] === 'CHAMFER' || toks[0] === 'CHA') && toks.length >= 3){
    const idx = parsePenIdx(toks[1]);
    const c = evalExpr(toks[2]);
    if (idx == null || !penPoints[idx] || !isFinite(c) || c <= 0) return false;
    const ok = penChamferAtPoint(penPoints[idx], c);
    if (!ok){ document.getElementById('statusHint').textContent = `모따기 실패: ${idx}번에서 만나는 두 선을 못 찾음`; return true; }
    penFinish(`╱ ${idx}번 교점 C${c} 모따기`);
    return true;
  }

  // Rev.16.36: 연장 1 2 30 - 1-2 선에서 2번 쪽(뒤 번호)을 30mm 연장
  if ((toks[0] === '연장' || toks[0] === 'EXTEND') && toks.length >= 4){
    const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
    const dist = evalExpr(toks[3]);
    if (i1 == null || i2 == null || !penPoints[i1] || !penPoints[i2] || !isFinite(dist)) return false;
    const ln = penFindLineByEndpoints(i1, i2);
    if (!ln){ document.getElementById('statusHint').textContent = `연장 실패: ${i1}-${i2}를 끝점으로 가진 선이 없음`; return true; }
    // 1→2 방향 단위벡터로 2번 끝을 dist 연장
    const a = penPoints[i1], b = penPoints[i2];
    const len = Math.hypot(b.x-a.x, b.y-a.y);
    if (len < 1e-6) return true;
    const ux = (b.x-a.x)/len, uy = (b.y-a.y)/len;
    const nx = b.x + ux*dist/mmPerPixel, ny = b.y + uy*dist/mmPerPixel;
    // 선의 2번 끝점을 갱신 (어느 p가 2번인지 찾아서)
    const which = (Math.hypot(ln.p1.x-b.x, ln.p1.y-b.y) < Math.hypot(ln.p2.x-b.x, ln.p2.y-b.y)) ? 'p1' : 'p2';
    ln[which] = { x:nx, y:ny };
    // 2번 점 좌표도 갱신
    penPoints[i2] = { x:nx, y:ny };
    // 라벨 위치도 이동
    penUpdateLabel(i2, nx, ny);
    penFinish(`↦ ${i1}-${i2} 선 ${i2}번 쪽 ${dist}mm 연장`);
    return true;
  }

  // Rev.16.36: 거리두기 2 3 위 0.6 - 2-3 선을 위/아래로 평행복제 (새 선 끝점 번호 부여)
  if ((toks[0] === '거리두기' || toks[0] === 'OFFSET') && toks.length >= 5
      && parsePenIdx(toks[1]) != null && parsePenIdx(toks[2]) != null){
    const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
    const ud = toks[3];
    const dmm = evalExpr(toks[4]);
    if (!penPoints[i1] || !penPoints[i2] || (ud!=='위'&&ud!=='아래') || !isFinite(dmm)) return false;
    const ln = penFindLineByEndpoints(i1, i2);
    if (!ln){ document.getElementById('statusHint').textContent = `거리두기 실패: ${i1}-${i2} 선이 없음`; return true; }
    const dpx = dmm/mmPerPixel * (ud==='위' ? -1 : 1);  // 화면 위=Y감소
    const nx1 = ln.p1.x, ny1 = ln.p1.y + dpx;
    const nx2 = ln.p2.x, ny2 = ln.p2.y + dpx;
    penAddLine(nx1, ny1, nx2, ny2);
    penAddPoint(nx1, ny1);
    penAddPoint(nx2, ny2);
    penFinish(`⫴ ${i1}-${i2} 선 ${ud} ${dmm}mm 평행복제`);
    return true;
  }

  // 시작점 지정: 시작 X Y
  if ((toks[0] === '시작' || toks[0] === 'START') && toks.length >= 3){
    const xmm = evalExpr(toks[1]), ymm = evalExpr(toks[2]);
    if (!isFinite(xmm) || !isFinite(ymm)) return false;
    const p = penMmToPx(xmm, ymm);
    penAddPoint(p.x, p.y);
    penFinish(`✎ 시작점 P0 = (${xmm}, ${ymm})mm`);
    return true;
  }

  // 선 P1 P4 : 두 점 직접 연결
  if ((toks[0] === '선' || toks[0] === 'LINK') && toks.length >= 3){
    const i1 = parsePenIdx(toks[1]), i2 = parsePenIdx(toks[2]);
    if (i1 == null || i2 == null || !penPoints[i1] || !penPoints[i2]) return false;
    penAddLine(penPoints[i1].x, penPoints[i1].y, penPoints[i2].x, penPoints[i2].y);
    penCur = i2;
    penFinish(`✎ 선 P${i1}-P${i2} 연결`);
    return true;
  }

  // 닫기 : 현재 점 → P0
  if (toks[0] === '닫기' || toks[0] === 'CLOSE'){
    if (penCur < 0 || !penPoints[0] || penCur === 0){ return false; }
    penAddLine(penPoints[penCur].x, penPoints[penCur].y, penPoints[0].x, penPoints[0].y);
    penFinish(`✎ 닫기: ${penCur} → 0`);
    penCur = 0;
    return true;
  }

  // [Pn] 방향 거리  /  방향 거리
  let off = 0;
  let startIdx = penCur;
  const maybeIdx = parsePenIdx(toks[0]);
  if (maybeIdx != null){
    if (!penPoints[maybeIdx]) return false;
    startIdx = maybeIdx;
    off = 1;
  }
  // Rev.16.32: '씰' 접두 - 이 명령만 씰 계산 적용 (예: 씰 좌 130, 3 씰 좌 130)
  let useSeal = false;
  if (toks[off] === '씰'){ useSeal = true; off++; }
  const dir = toks[off];
  const dirSet = ['우','좌','상','하','R','L','U','D','각','도','ANG','거리두기'];
  if (!dirSet.includes(dir)) return false;

  // 시작점이 없으면 P0를 중앙(0,0)에 자동 생성
  if (startIdx < 0 || !penPoints[startIdx]){
    const o = penMmToPx(0,0);
    penAddPoint(o.x, o.y);
    startIdx = 0;
  }
  const sp = penPoints[startIdx];

  // 거리두기 위/아래 D : 마지막 선 평행복제 (한붓그리기 흐름 밖)
  if (dir === '거리두기'){
    const ud = toks[off+1];
    const dmm = evalExpr(toks[off+2]);
    if ((ud !== '위' && ud !== '아래') || !isFinite(dmm)) return false;
    // 마지막으로 그린 line 찾기
    let last=null;
    for (let i=shapes.length-1;i>=0;i--){ if (shapes[i].type==='line'){ last=shapes[i]; break; } }
    if (!last) return false;
    const dpx = dmm/mmPerPixel * (ud==='위'? -1 : 1);  // 화면상 위=Y감소
    penAddLine(last.p1.x, last.p1.y+dpx, last.p2.x, last.p2.y+dpx);
    penFinish(`✎ 거리두기 ${ud} ${dmm}mm 평행복제`);
    return true;
  }

  // 각도: 도 A D
  if (dir === '각' || dir === '도' || dir === 'ANG'){
    const ang = evalExpr(toks[off+1]);
    const dist = evalExpr(toks[off+2]);
    if (!isFinite(ang) || !isFinite(dist)) return false;
    const rad = ang * Math.PI/180;
    const dx = Math.cos(rad)*dist/mmPerPixel;
    const dy = -Math.sin(rad)*dist/mmPerPixel;  // 반시계 양수=화면 위
    const nx = sp.x + dx, ny = sp.y + dy;
    penAddLine(sp.x, sp.y, nx, ny);
    penAddPoint(nx, ny);
    penFinish(`✎ ${startIdx} → ${ang}° ${dist}mm → ${penCur}`);
    return true;
  }

  // 좌우상하 거리
  const dist = evalExpr(toks[off+1]);
  if (!isFinite(dist)) return false;
  let dx=0, dy=0;
  const isLR = (dir==='우'||dir==='R'||dir==='좌'||dir==='L');

  if (useSeal && isLR){
    // Rev.16.30: 씰 모드 좌/우 - 숫자=목표 지름. 이동량 = |목표 - 현재지름값|/2
    //   현재지름값 = 현재 X(mm, penPxToMm) ※ 부호 그대로 사용 (예: P0 X=100, 좌 130 → (130-100)/2=15 좌측)
    const curXmm = penPxToMm(sp.x, sp.y).x;   // 현재 점의 X(mm) = 현재 지름값
    const targetD = dist;                      // 목표 지름
    const moveMm = Math.abs(targetD - curXmm) / 2;
    const moveDir = (dir==='좌'||dir==='L') ? -1 : +1;  // 방향은 단어대로
    dx = moveDir * moveMm / mmPerPixel;
    const nx = sp.x + dx, ny = sp.y;
    penAddLine(sp.x, sp.y, nx, ny);
    penAddPoint(nx, ny);
    const newXmm = penPxToMm(nx, ny).x;
    penFinish(`⌀ 씰 ${startIdx} ${dir} 목표Ø${targetD} → ${moveMm.toFixed(2)}mm 이동 → X=${newXmm.toFixed(1)} (${penCur})`);
    return true;
  }

  // 일반 이동 (씰 모드의 상/하 포함)
  const dpx = dist/mmPerPixel;
  if (dir==='우'||dir==='R') dx = dpx;
  else if (dir==='좌'||dir==='L') dx = -dpx;
  else if (dir==='상'||dir==='U') dy = -dpx;   // 화면 위=Y감소
  else if (dir==='하'||dir==='D') dy = dpx;
  const nx = sp.x + dx, ny = sp.y + dy;
  penAddLine(sp.x, sp.y, nx, ny);
  penAddPoint(nx, ny);
  penFinish(`✎ ${startIdx} → ${dir} ${dist}mm → ${penCur}`);
  return true;
}
// Rev.16.36: 두 점 번호(i1,i2)를 양 끝점으로 가진 선 찾기
function penFindLineByEndpoints(i1, i2){
  const a = penPoints[i1], b = penPoints[i2];
  if (!a || !b) return null;
  const tol = 1/mmPerPixel * 0.1;  // 0.1mm
  for (const s of shapes){
    if (s.type !== 'line' || !s.p1 || !s.p2) continue;
    const m1 = (Math.hypot(s.p1.x-a.x,s.p1.y-a.y)<tol && Math.hypot(s.p2.x-b.x,s.p2.y-b.y)<tol);
    const m2 = (Math.hypot(s.p1.x-b.x,s.p1.y-b.y)<tol && Math.hypot(s.p2.x-a.x,s.p2.y-a.y)<tol);
    if (m1 || m2) return s;
  }
  return null;
}
// Rev.16.36: 점 번호 라벨 위치 갱신
function penUpdateLabel(idx, px, py){
  const lbId = penLabelIds[idx];
  if (lbId == null) return;
  const lb = shapes.find(s => s.id === lbId);
  if (lb && lb.pos){ lb.pos.x = px + 8/(zoom||1); lb.pos.y = py - 22/(zoom||1); }
}

// "3" / "P3" → 3, 그 외 null
function parsePenIdx(tok){
  if (/^P\d+$/i.test(tok)) return parseInt(tok.slice(1));
  if (/^\d+$/.test(tok)) return parseInt(tok);
  return null;
}

// Rev.16.35: undo 후 현재 도면에 남은 점 라벨 기준으로 penPoints 재구성
function penSyncFromShapes(){
  // 남아있는 point 도형 중 penIdx 가진 것들로 penPoints 복원
  const pts = [];
  const labels = [];
  for (const s of shapes){
    if (s.type === 'point' && typeof s.penIdx === 'number'){
      pts[s.penIdx] = { x:s.p1.x, y:s.p1.y };
    }
    if (s.type === 'text' && typeof s.penLabel === 'number'){
      labels[s.penLabel] = s.id;
    }
  }
  // 연속된 앞부분만 유효 (중간 빈 곳에서 끊김)
  let n = 0;
  while (pts[n] !== undefined) n++;
  penPoints = pts.slice(0, n);
  penLabelIds = labels.slice(0, n);
  penCur = penPoints.length - 1;
}

// Rev.16.32: 지정 점(pt) 근처에서 끝점이 만나는 두 선을 찾아 지름 dia 필렛
function penFilletAtPoint(pt, diaMm){
  const tol = Math.max(2, 1/mmPerPixel*0.2);  // 0.2mm 또는 2px
  const near = [];
  for (const s of shapes){
    if (s.type !== 'line' || !s.p1 || !s.p2) continue;
    const d1 = Math.hypot(s.p1.x-pt.x, s.p1.y-pt.y);
    const d2 = Math.hypot(s.p2.x-pt.x, s.p2.y-pt.y);
    if (d1 <= tol || d2 <= tol){
      // 교점에서 먼 끝점 = keep(살릴 방향) 클릭점으로 사용
      const far = (d1 <= d2) ? s.p2 : s.p1;
      near.push({ line:s, click:{x:far.x, y:far.y} });
    }
  }
  if (near.length < 2) return false;
  const L1 = near[0], L2 = near[1];
  const rMm = diaMm/2;
  const r = rMm / mmPerPixel;
  return applyFilletNoPrompt(L1.line, L2.line, L1.click, L2.click, r, rMm);
}

// Rev.16.37: 지정 점에서 만나는 두 선을 찾아 C값 cMm 모따기 (기존 챔퍼 로직 사용)
function penChamferAtPoint(pt, cMm){
  const tol = Math.max(2, 1/mmPerPixel*0.2);
  const near = [];
  for (const s of shapes){
    if (s.type !== 'line' || !s.p1 || !s.p2) continue;
    const d1 = Math.hypot(s.p1.x-pt.x, s.p1.y-pt.y);
    const d2 = Math.hypot(s.p2.x-pt.x, s.p2.y-pt.y);
    if (d1 <= tol || d2 <= tol){
      const far = (d1 <= d2) ? s.p2 : s.p1;
      near.push({ line:s, click:{x:far.x, y:far.y} });
    }
  }
  if (near.length < 2) return false;
  return applyChamferToTwoLines(near[0].line, near[1].line, near[0].click, near[1].click, cMm);
}

// Rev.16.30: 텍스트입력(한붓그리기) 시작 - 씰/일반 모드 선택
(function(){
  const btn = document.getElementById('headerBtnPenInput');
  if (!btn) return;
  btn.addEventListener('click', () => {
    penSealMode = false;  // Rev.16.32: 전역 씰모드 폐지 (씰 계산은 '씰' 접두 명령으로만)
    // 점번호 초기화
    penPoints = []; penLabelIds = []; penCur = -1;
    // 명령창 포커스
    const ci = document.getElementById('cmdInput');
    if (ci){ ci.focus(); ci.value = ''; }
    document.getElementById('statusHint').textContent =
      `⌨ 한붓그리기 시작: '시작 X Y' 또는 '점 X,Y'로 점 찍기 · 좌/우/상/하/각 이어그리기 · 씰은 '씰 점 D,Y' · 취소=백 또는 Ctrl+Z`;
    cmdLog(`⌨ 한붓그리기 시작. 예: 점 -100,100 → 점 -100,110 → 연결 1 2 · 씰: 씰 점 110,100`, 'system');
  });
})();

function tryDimCommand(cmdStr){
  // Rev.16.29: 한붓그리기(점번호) 명령 우선 처리
  if (tryPenCommand(cmdStr)) return true;
  // 토큰 분리 (콤마/공백 혼용 허용)
  const toks = cmdStr.replace(/,/g,' ').split(/\s+/).filter(Boolean);
  if (toks.length < 2) return false;
  const key = toks[0];
  const nums = toks.slice(1).map(t => evalExpr(t));
  if (nums.some(n => !isFinite(n))) return false;
  const mm2px = mm => mm / mmPerPixel;
  const cx = baseW/2, cy = baseH/2;
  const sw = parseInt(document.getElementById('strokeWidth').value) || 1;
  const stroke = document.getElementById('strokeColor').value || '#ffffff';
  const mkLine = (x1,y1,x2,y2) => ({ id:++shapeIdSeq, type:'line', p1:{x:x1,y:y1}, p2:{x:x2,y:y2}, stroke, strokeWidth:sw, layer:(currentLayer||'default') });

  function pushAnd(msg, arr){
    arr.forEach(s => shapes.push(s));
    redoStack = []; pushHistory();
    if (typeof redrawFills === 'function') redrawFills();
    redrawDraw(); updateCount();
    cmdLog('  ' + msg, 'system');
    document.getElementById('statusHint').textContent = msg;
  }

  if ((key === 'BASE' || key === '사각형' || key === 'REC' || key === 'RECT') && nums.length >= 2){
    const w = mm2px(nums[0]), h = mm2px(nums[1]);
    const xL = cx - w/2, xR = cx + w/2, yT = cy - h/2, yB = cy + h/2;
    pushAnd(`▭ 사각형 ${nums[0]}×${nums[1]}mm 생성`, [
      mkLine(xL,yT,xR,yT), mkLine(xL,yB,xR,yB), mkLine(xL,yT,xL,yB), mkLine(xR,yT,xR,yB)
    ]);
    return true;
  }
  if (key === 'LINE' && nums.length >= 4){
    pushAnd(`／ 선 (${nums[0]},${nums[1]})-(${nums[2]},${nums[3]})mm 생성`,
      [ mkLine(mm2px(nums[0]),mm2px(nums[1]),mm2px(nums[2]),mm2px(nums[3])) ]);
    return true;
  }
  if ((key === 'HLINE' || key === '가로선') && nums.length >= 1){
    const L = mm2px(nums[0]);
    pushAnd(`― 가로선 ${nums[0]}mm 생성`, [ mkLine(cx-L/2,cy,cx+L/2,cy) ]);
    return true;
  }
  if ((key === 'VLINE' || key === '세로선') && nums.length >= 1){
    const L = mm2px(nums[0]);
    pushAnd(`｜ 세로선 ${nums[0]}mm 생성`, [ mkLine(cx,cy-L/2,cx,cy+L/2) ]);
    return true;
  }
  if ((key === 'CIRCLE' || key === '원' || key === 'CIR') && nums.length >= 1){
    let ccx = cx, ccy = cy, dia = nums[0];
    if (nums.length >= 3){
      // 원 X Y D : 좌표 지정 (0,0=중앙, 위=+Y)
      const o = { x: baseW/2, y: baseH/2 };
      ccx = o.x + nums[0]/mmPerPixel;
      ccy = o.y - nums[1]/mmPerPixel;
      dia = nums[2];
    }
    const r = mm2px(dia)/2;  // 지름 → 반지름
    shapes.push({ id:++shapeIdSeq, type:'circle',
      p1:{x:ccx, y:ccy}, p2:{x:ccx+r, y:ccy},
      stroke, strokeWidth:sw, layer:(currentLayer||'default') });
    redoStack=[]; pushHistory(); redrawDraw(); updateCount();
    const msg = (nums.length>=3) ? `○ 원 (${nums[0]},${nums[1]}) Ø${dia}mm 생성` : `○ 원 Ø${dia}mm 생성`;
    cmdLog('  '+msg,'system'); document.getElementById('statusHint').textContent = msg;
    return true;
  }
  return false;
}

function executeCommand(cmdStr) {
  cmdStr = cmdStr.trim().toUpperCase();
  if (!cmdStr) {
    // 빈 입력 = 마지막 명령 반복 (AutoCAD 동작)
    if (lastCmd) {
      cmdLog('명령: ' + lastCmd + ' (반복)', 'user');
      executeCommand(lastCmd);
    }
    return;
  }
  
  // 좌표 입력 시도 (현재 도구 작도 중일 때)
  if (firstClick || (polylineState && polylineState.points.length > 0)) {
    try {
      if (tryCoordinateInput(cmdStr)) {
        cmdLog('좌표 입력: ' + cmdStr, 'user');
        return;
      }
    } catch(e) {}
  }
  
  // 폴리라인 단축 명령
  if (polylineState && (cmdStr === 'C' || cmdStr === 'CLOSE')) {
    cmdLog('명령: C → 폴리라인 닫기', 'user');
    finishPolyline(true);
    return;
  }

  // Rev.16.28: 치수 인자형 그리기 명령 (말/텍스트로 도면 그리기)
  if (tryDimCommand(cmdStr)) return;

  const def = CMD_DICT[cmdStr];
  if (!def) {
    cmdLog(`'${cmdStr}' 알 수 없는 명령. '?' 또는 HELP 입력하여 명령 목록 보기.`, 'error');
    return;
  }
  
  cmdLog('명령: ' + cmdStr + '  → ' + def.name, 'user');
  lastCmd = cmdStr;
  
  if (def.tool) {
    // 도구 전환 (Rev.11.51: selectTool로 메뉴+상단버튼 동기화)
    selectTool(def.tool);
    cmdLog('  ' + def.name + ' 도구 활성화. 캔버스에서 작업하세요.', 'prompt');
  } else if (def.action) {
    handleAction(def.action);
  }
}

function handleAction(action) {
  switch (action) {
    case 'connect':
      // Rev.11.40: F = 연결 모드 (헤더 연결 버튼과 동일)
      {
        const cb = document.getElementById('headerBtnConnect');
        if (cb) cb.click();
      }
      break;
    case 'undo':
      undo();
      cmdLog('  ↶ 실행 취소', 'system');
      break;
    case 'redo':
      redo();
      cmdLog('  ↷ 다시 실행', 'system');
      break;
    case 'erase':
      if (selectedIds.size === 0) {
        cmdLog('  선택된 도형이 없습니다. SELECT 후 ERASE 또는 캔버스에서 도형 선택 후 입력.', 'error');
      } else {
        const n = selectedIds.size;
        deleteSelected();
        cmdLog(`  ${n}개 도형 삭제됨.`, 'system');
      }
      break;
    case 'extrude':
      // Rev.11.20: 연장(Extrude) - 선택된 선을 끌어 면 만들기
      startExtrude();
      cmdLog('  ⬄ EXTRUDE: 마우스를 움직여 면을 만들고 클릭하세요. (Shift=직교)', 'system');
      break;
    case 'breakAll':
      runBreakAllIntersections();
      break;
    case 'save':
      document.getElementById('btnSave').click();
      cmdLog('  💾 저장 대화상자 표시', 'system');
      break;
    case 'toggle-snap':
      document.getElementById('btnSnap').click();
      cmdLog('  🧲 스냅 = ' + (snapMode ? 'ON' : 'OFF'), 'system');
      break;
    case 'toggle-livesnap':
      liveSnapMode = !liveSnapMode;
      updateLiveSnapButton();
      cmdLog('  🧲 라이브스냅 = ' + (liveSnapMode ? 'ON' : 'OFF'), 'system');
      break;
    case 'help':
      showHelpInCmd();
      break;
    case 'array':
      handleArrayCommand();
      break;
    case 'distcopy':
      handleDistanceCopyCommand();
      break;
    case 'polygon':
      handlePolygonCommand();
      break;
    case 'layer':
      showLayerManager();
      break;
    case 'list':
      handleListCommand();
      break;
    case 'area':
      handleAreaCommand();
      break;
    case 'id':
      handleIdCommand();
      break;
    case 'zoom-extent':
      zoomExtent();
      cmdLog('  ZOOM EXTENT: 전체 보기.', 'system');
      break;
    case 'dxf':
      handleDxfCommand();
      break;
    case 'bpoly':
      handleBpolyCommand();
      break;
  }
}

function showHelpInCmd() {
  cmdLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'system');
  cmdLog('▼ 사용 가능한 명령 (AutoCAD 호환)', 'system');
  cmdLog('  그리기:  L(LINE)  REC(RECT)  C(CIRCLE)  A(ARC)  PL(POLYLINE)  POL(POLYGON)  EL(ELLIPSE)  T(TEXT)', 'prompt');
  cmdLog('  편집:    TR(TRIM)  EX(EXTEND)  R/ER(FILLET모서리R)  F(CONNECT연결)  O(OFFSET)', 'prompt');
  cmdLog('  변환:    CO(COPY)  M(MOVE)  RO(ROTATE)  MI(MIRROR)  SC(SCALE)  AR(ARRAY)', 'prompt');
  cmdLog('  치수:    DLI(선형) DAL(평행) DRA(반지름) DDI(직경) DAN(각도)', 'prompt');
  cmdLog('  기타:    S(SELECT) H(HATCH채움) BPOLY(자동채움) DI(캘리브) AX(회전축) LA(LAYER) Z(ZOOM)', 'prompt');
  cmdLog('  측정:    LI(LIST) AA(AREA) ID(좌표)', 'prompt');
  cmdLog('  파일:    SAVE  DXF  ?(HELP)', 'prompt');
  cmdLog('  액션:    U(UNDO)  REDO  E(ERASE)  OS(OSNAP) LSNAP', 'prompt');
  cmdLog('▼ 좌표 입력 (작도 중):  100,200(절대mm)  @50,30(상대)  @100<45(극좌표)', 'system');
  cmdLog('▼ 단축 동작:  Enter/Space=마지막명령 반복  |  ESC=취소  |  ↑↓=이력  |  더블클릭=폴리라인종료', 'system');
  cmdLog('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'system');
}

// 명령창 입력 처리
const cmdInput = document.getElementById('cmdInput');

cmdInput.addEventListener('keydown', e => {
  // Rev.16.41: 한글(IME) 조합 중에는 명령 처리 안 함 (조합 깨짐 방지)
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Enter') {
    // Rev.16.41: 한글 명령은 공백을 포함하므로 스페이스 실행 제거, Enter로만 실행
    e.preventDefault();
    const v = cmdInput.value;
    if (v.trim()) {
      cmdHistory.push(v.trim().toUpperCase());
      if (cmdHistory.length > 50) cmdHistory.shift();
    }
    cmdHistoryIdx = cmdHistory.length;
    executeCommand(v);
    cmdInput.value = '';
  } else if (e.key === 'Escape') {
    e.preventDefault();
    if (cmdInput.value) {
      cmdInput.value = '';
      cmdLog('  명령 취소.', 'system');
    } else {
      // 진행 중인 작업 취소 (ESC 핸들러로 위임)
      // window keydown ESC 핸들러가 잡지 못하도록 직접 디스패치
      cancelActiveTool();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (cmdHistory.length === 0) return;
    cmdHistoryIdx = Math.max(0, cmdHistoryIdx - 1);
    cmdInput.value = cmdHistory[cmdHistoryIdx] || '';
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (cmdHistory.length === 0) return;
    cmdHistoryIdx = Math.min(cmdHistory.length, cmdHistoryIdx + 1);
    cmdInput.value = cmdHistory[cmdHistoryIdx] || '';
  }
});

// 명령창 ESC 시 도구 진행 상태 취소
function cancelActiveTool() {
  firstClick = null; arcPath = []; dragState = null;
  calibFirstPoint = null; axisFirstPoint = null;
  endpointPickState = null; arcHandleDrag = null;
  filletState = null; chamferState = null; tangentState = null;
  offsetState = null; dimState = null; breakState = null;
  preCtx.clearRect(0,0,baseW,baseH);
  redrawDraw();
  cmdLog('  ESC: 현재 작업 취소.', 'system');
}

// 캔버스 클릭/포커스 시에도 명령창 입력 받을 수 있도록 자동 포커스
// (단, INPUT/TEXTAREA 안에 있을 때는 그쪽이 우선)
window.addEventListener('keydown', e => {
  // 입력 필드 안이면 무시
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  
  // Ctrl+S: 도면 저장(.json), Ctrl+O: 도면 열기 (Rev.12.3)
  if (e.ctrlKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    document.getElementById('btnSaveProject').click();
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'o') {
    e.preventDefault();
    document.getElementById('btnOpenProject').click();
    return;
  }
  // Ctrl+0: 배경 독립줌 초기화
  if (e.ctrlKey && e.key === '0') {
    e.preventDefault();
    if (bgImage) {
      bgZoom = 1.0; bgZoomOriginX = 50; bgZoomOriginY = 50;
      applyBgZoom();
      const hint = document.getElementById('statusHint');
      if (hint) hint.textContent = '🖼 배경 독립줌 초기화 (100%)';
    }
    return;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  // Rev.11.39: 블렌더식 단축키 (cmdInput으로 보내기 전에 가로챔)
  const k = e.key.toLowerCase();
  // grab(이동) 모드 진행 중: X/Y 축 제한, Enter 확정
  if (grabMode){
    if (k === 'x'){ grabAxis = (grabAxis === 'x') ? null : 'x'; grabUpdate(lastMousePoint || grabStart); e.preventDefault(); return; }
    if (k === 'y'){ grabAxis = (grabAxis === 'y') ? null : 'y'; grabUpdate(lastMousePoint || grabStart); e.preventDefault(); return; }
    if (e.key === 'Enter'){ exitGrabMode(true); document.getElementById('statusHint').textContent='✓ 이동 확정'; e.preventDefault(); return; }
    // grab 중 다른 글자는 무시 (오작동 방지)
    if (/^[a-z]$/.test(k)){ e.preventDefault(); return; }
  }
  // extrude(연장) 모드 진행 중: X/Y 축 제한
  if (extrudeMode && extrudeState){
    if (k === 'x'){ extrudeAxis = (extrudeAxis === 'x') ? null : 'x'; e.preventDefault(); return; }
    if (k === 'y'){ extrudeAxis = (extrudeAxis === 'y') ? null : 'y'; e.preventDefault(); return; }
  }
  // G = 이동(Grab) 진입
  if (k === 'g'){
    enterGrabMode();
    e.preventDefault();
    return;
  }

  // Rev.11.62: E = 연장(블렌더식), F = 연결 - 키 한 번에 즉시 실행 (Enter 불필요)
  if (k === 'e'){
    // 선택된 점/선이 있으면 연장(extrude) 시작
    startExtrude();
    e.preventDefault();
    return;
  }
  if (k === 'f'){
    // Rev.11.66: 점이 2개 이상 선택돼 있으면 즉시 연결, 아니면 연결 모드 토글
    if (connectSelectedPoints()){
      e.preventDefault();
      return;
    }
    const cb = document.getElementById('headerBtnConnect');
    if (cb) cb.click(); // 연결 모드 토글
    e.preventDefault();
    return;
  }

  // Rev.11.63: 단일키 단축키 즉시 실행 (L,C,S,A,H,R,O,M,T,Z,U,? 등)
  //   E/F는 위에서 이미 처리됨. 작도/좌표 입력 중에는 기존 명령창 흐름 유지.
  const inCoordInput =
    firstClick || axisFirstPoint || calibFirstPoint || dimState ||
    (typeof polylineState !== 'undefined' && polylineState && polylineState.points && polylineState.points.length > 0);

  if (!inCoordInput && /^[a-zA-Z?]$/.test(e.key)) {
    const key = e.key.toUpperCase();
    const def = (typeof CMD_DICT !== 'undefined') ? CMD_DICT[key] : null;
    if (def) {
      // 단일 글자 명령이 정의돼 있으면 키 한 번에 즉시 실행
      executeCommand(key);
      e.preventDefault();
      return;
    }
    // 정의 안 된 글자 키는 무시 (다중글자 캐드명령 입력 비활성)
    e.preventDefault();
    return;
  }

  // 작도/좌표 입력 중: 숫자·좌표를 명령창으로 받아 Enter 실행 (캐드식 정밀 좌표 입력 유지)
  if (/^[a-zA-Z0-9?]$/.test(e.key)) {
    cmdInput.focus();
    cmdInput.value = e.key.toUpperCase();
    e.preventDefault();
    const hint = document.getElementById('statusHint');
    if (hint) hint.textContent = `⌨ 좌표/명령: ${cmdInput.value} (Enter 실행 / Esc 취소)`;
  }
});

// Rev.11.28: 명령 입력 중 상태바에 실시간 표시 (명령줄이 숨겨져 있으므로)
cmdInput.addEventListener('input', () => {
  // Rev.11.38: 명령창은 영문만 - 한글 등 비영문 제거 + 대문자 변환
  //   허용: 영문/숫자/좌표 입력 기호(. , - + @ < > 공백)
  const cleaned = cmdInput.value.toUpperCase().replace(/[^A-Z0-9.,\-+@<> ]/g, '');
  if (cleaned !== cmdInput.value) cmdInput.value = cleaned;
  const hint = document.getElementById('statusHint');
  if (hint && cmdInput.value) hint.textContent = `⌨ 명령: ${cmdInput.value} (Enter 실행 / Esc 취소)`;
});
// Rev.11.38: 한글 IME 조합 완료 시점에도 한 번 더 정리 (조합 중 한글이 잠깐 보이는 것 방지)
cmdInput.addEventListener('compositionend', () => {
  cmdInput.value = cmdInput.value.toUpperCase().replace(/[^A-Z0-9.,\-+@<> ]/g, '');
});

// 도구 전환 시 명령창에 포커스 복귀 (선택적)
document.querySelectorAll('.tool-menu-item').forEach(btn => {
  btn.addEventListener('click', () => {
    setTimeout(() => cmdInput.focus(), 100);
  });
});

// 초기 포커스
setTimeout(() => cmdInput.focus(), 200);
// Rev.11.41: 초기 빈 상태를 히스토리에 기록 (undo 기준점)
initHistory();

// Rev.11.35: 모든 헤더 버튼(.hbtn) 클릭 시 잠깐 눌린 피드백(흰테두리+밝게+줌아웃)
document.querySelectorAll('header button.hbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.add('clicked');
    setTimeout(() => btn.classList.remove('clicked'), 180);
  });
});

// updateToolStatus 호출 시 뱃지도 갱신
const _origUpdateToolStatus = updateToolStatus;
updateToolStatus = function() {
  _origUpdateToolStatus();
  updateMenuToggles();
  // 명령창 프롬프트 갱신: 도구 이름 표시
  const promptEl = document.getElementById('cmdPrompt');
  if (promptEl) {
    const names = {select:'선택', line:'선', rect:'사각형', circle:'원', arc:'라운드', 
      fill:'채움', calib:'캘리브', axis:'회전축',
      trim:'트리밍', extend:'연장', fillet:'모서리R', offset:'오프셋',
      dimLinear:'선형치수', dimAligned:'평행치수', dimRadius:'반지름', dimDiameter:'직경', dimAngle:'각도'};
    promptEl.textContent = `[${names[tool] || tool}] 명령: `;
  }
};

// ====== 도움말 (Rev.9.2) ======
const helpModal = document.getElementById('helpModal');
function openHelp(initialTab) {
  helpModal.classList.add('show');
  if (initialTab) switchHelpTab(initialTab);
}
function closeHelp() {
  helpModal.classList.remove('show');
}
function switchHelpTab(tabName) {
  document.querySelectorAll('.help-tab').forEach(t => {
    if (t.dataset.htab === tabName) {
      t.classList.add('active');
      t.style.color = '#fff';
      t.style.background = '#3a3a3a';
      t.style.borderBottom = '3px solid #f39c12';
    } else {
      t.classList.remove('active');
      t.style.color = '#aaa';
      t.style.background = '';
      t.style.borderBottom = '3px solid transparent';
    }
  });
  document.querySelectorAll('.help-content').forEach(c => {
    c.style.display = (c.id === 'htab-' + tabName) ? 'block' : 'none';
  });
}

document.getElementById('headerBtnHelp').addEventListener('click', () => openHelp());
document.getElementById('btnHelpClose').addEventListener('click', closeHelp);

// Rev.11.11: 상단 채움/전체채움 버튼 제거됨 (주 메뉴 '영역 채움' F키, 명령창 BPOLY로 대체)

document.querySelectorAll('.help-tab').forEach(t => {
  t.addEventListener('click', () => switchHelpTab(t.dataset.htab));
});

// helpModal 바깥 클릭 시 닫기
helpModal.addEventListener('click', e => {
  if (e.target === helpModal) closeHelp();
});

// F1 키로 도움말 열기
window.addEventListener('keydown', e => {
  if (e.key === 'F1') {
    e.preventDefault();
    if (helpModal.classList.contains('show')) closeHelp();
    else openHelp();
  }
});

// ====== 끝 (메뉴 초기 상태) ======
updateMenuToggles();

updateCount();
updateSelStat();
updateToolStatus();
updateCalibStat();
updateLastMeshInfo();
updateAxisStatus();
updateLiveSnapButton();
updateHeaderSelectButton();
redrawAll();

