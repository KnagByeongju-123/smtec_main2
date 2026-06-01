/* ============================================================
   Catia3D v1.0 - 프레스 금형 부품 3D 모델러
   ============================================================ */

/* ============================================================
   CSG 불리언 엔진 (Evan Wallace csg.js 기반, MIT)
   three.js r128 BufferGeometry 연동 래퍼
   - 솔리드 − 구멍 실제 빼기(subtract)에 사용
   ============================================================ */
(function(){
  // ---- CSG core ----
  function CSG(){ this.polygons = []; }
  CSG.fromPolygons = function(polygons){ var csg = new CSG(); csg.polygons = polygons; return csg; };
  CSG.prototype = {
    clone: function(){ var csg = new CSG(); csg.polygons = this.polygons.map(function(p){return p.clone();}); return csg; },
    toPolygons: function(){ return this.polygons; },
    union: function(csg){
      var a = new CSGNode(this.clone().polygons), b = new CSGNode(csg.clone().polygons);
      a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert();
      a.build(b.allPolygons()); return CSG.fromPolygons(a.allPolygons());
    },
    subtract: function(csg){
      var a = new CSGNode(this.clone().polygons), b = new CSGNode(csg.clone().polygons);
      a.invert(); a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert();
      a.build(b.allPolygons()); a.invert(); return CSG.fromPolygons(a.allPolygons());
    },
    intersect: function(csg){
      var a = new CSGNode(this.clone().polygons), b = new CSGNode(csg.clone().polygons);
      a.invert(); b.clipTo(a); b.invert(); a.clipTo(b); b.clipTo(a);
      a.build(b.allPolygons()); a.invert(); return CSG.fromPolygons(a.allPolygons());
    }
  };
  function CSGVertex(pos, normal){ this.pos = pos.clone(); this.normal = normal.clone(); }
  CSGVertex.prototype = {
    clone: function(){ return new CSGVertex(this.pos, this.normal); },
    flip: function(){ this.normal.multiplyScalar(-1); },
    interpolate: function(other, t){
      return new CSGVertex(this.pos.clone().lerp(other.pos, t), this.normal.clone().lerp(other.normal, t));
    }
  };
  function CSGPlane(normal, w){ this.normal = normal; this.w = w; }
  CSGPlane.EPSILON = 1e-5;
  CSGPlane.fromPoints = function(a, b, c){
    var n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    return new CSGPlane(n, n.dot(a));
  };
  CSGPlane.prototype = {
    clone: function(){ return new CSGPlane(this.normal.clone(), this.w); },
    flip: function(){ this.normal.multiplyScalar(-1); this.w = -this.w; },
    splitPolygon: function(polygon, coplanarFront, coplanarBack, front, back){
      var COPLANAR=0, FRONT=1, BACK=2, SPANNING=3;
      var polygonType = 0, types = [];
      for(var i=0;i<polygon.vertices.length;i++){
        var t = this.normal.dot(polygon.vertices[i].pos) - this.w;
        var type = (t < -CSGPlane.EPSILON) ? BACK : (t > CSGPlane.EPSILON) ? FRONT : COPLANAR;
        polygonType |= type; types.push(type);
      }
      switch(polygonType){
        case COPLANAR:
          (this.normal.dot(polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon); break;
        case FRONT: front.push(polygon); break;
        case BACK: back.push(polygon); break;
        case SPANNING:
          var f=[], bk=[];
          for(var i=0;i<polygon.vertices.length;i++){
            var j=(i+1)%polygon.vertices.length, ti=types[i], tj=types[j];
            var vi=polygon.vertices[i], vj=polygon.vertices[j];
            if(ti!==BACK) f.push(vi);
            if(ti!==FRONT) bk.push(ti!==BACK ? vi.clone() : vi);
            if((ti|tj)===SPANNING){
              var t=(this.w - this.normal.dot(vi.pos))/this.normal.dot(vj.pos.clone().sub(vi.pos));
              var v=vi.interpolate(vj, t); f.push(v); bk.push(v.clone());
            }
          }
          if(f.length>=3) front.push(new CSGPolygon(f, polygon.shared));
          if(bk.length>=3) back.push(new CSGPolygon(bk, polygon.shared));
          break;
      }
    }
  };
  function CSGPolygon(vertices, shared){
    this.vertices = vertices; this.shared = shared;
    this.plane = CSGPlane.fromPoints(vertices[0].pos, vertices[1].pos, vertices[2].pos);
  }
  CSGPolygon.prototype = {
    clone: function(){ return new CSGPolygon(this.vertices.map(function(v){return v.clone();}), this.shared); },
    flip: function(){ this.vertices.reverse().forEach(function(v){v.flip();}); this.plane.flip(); }
  };
  function CSGNode(polygons){
    this.plane=null; this.front=null; this.back=null; this.polygons=[];
    if(polygons) this.build(polygons);
  }
  CSGNode.prototype = {
    clone: function(){
      var node=new CSGNode();
      node.plane=this.plane&&this.plane.clone();
      node.front=this.front&&this.front.clone();
      node.back=this.back&&this.back.clone();
      node.polygons=this.polygons.map(function(p){return p.clone();}); return node;
    },
    invert: function(){
      for(var i=0;i<this.polygons.length;i++) this.polygons[i].flip();
      this.plane.flip();
      if(this.front) this.front.invert();
      if(this.back) this.back.invert();
      var t=this.front; this.front=this.back; this.back=t;
    },
    clipPolygons: function(polygons){
      if(!this.plane) return polygons.slice();
      var front=[], back=[];
      for(var i=0;i<polygons.length;i++) this.plane.splitPolygon(polygons[i], front, back, front, back);
      if(this.front) front=this.front.clipPolygons(front);
      if(this.back) back=this.back.clipPolygons(back); else back=[];
      return front.concat(back);
    },
    clipTo: function(node){
      this.polygons=node.clipPolygons(this.polygons);
      if(this.front) this.front.clipTo(node);
      if(this.back) this.back.clipTo(node);
    },
    allPolygons: function(){
      var polygons=this.polygons.slice();
      if(this.front) polygons=polygons.concat(this.front.allPolygons());
      if(this.back) polygons=polygons.concat(this.back.allPolygons());
      return polygons;
    },
    build: function(polygons){
      if(!polygons.length) return;
      if(!this.plane) this.plane=polygons[0].plane.clone();
      var front=[], back=[];
      for(var i=0;i<polygons.length;i++) this.plane.splitPolygon(polygons[i], this.polygons, this.polygons, front, back);
      if(front.length){ if(!this.front) this.front=new CSGNode(); this.front.build(front); }
      if(back.length){ if(!this.back) this.back=new CSGNode(); this.back.build(back); }
    }
  };

  // ---- three.js r128 BufferGeometry <-> CSG ----
  function fromMesh(mesh){
    mesh.updateMatrixWorld(true);
    var geom = mesh.geometry;
    var posAttr = geom.attributes.position;
    var normAttr = geom.attributes.normal;
    var index = geom.index ? geom.index.array : null;
    var matrix = mesh.matrixWorld;
    var normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    var polygons = [];
    var count = index ? index.length : posAttr.count;
    for(var i=0;i<count;i+=3){
      var verts=[];
      for(var k=0;k<3;k++){
        var idx = index ? index[i+k] : (i+k);
        var p = new THREE.Vector3(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx)).applyMatrix4(matrix);
        var n = normAttr
          ? new THREE.Vector3(normAttr.getX(idx), normAttr.getY(idx), normAttr.getZ(idx)).applyMatrix3(normalMatrix).normalize()
          : new THREE.Vector3(0,1,0);
        verts.push(new CSGVertex(p, n));
      }
      polygons.push(new CSGPolygon(verts));
    }
    return CSG.fromPolygons(polygons);
  }
  function toGeometry(csg){
    var polygons = csg.toPolygons();
    var positions=[], normals=[];
    for(var i=0;i<polygons.length;i++){
      var p=polygons[i], vs=p.vertices;
      for(var j=2;j<vs.length;j++){
        [vs[0], vs[j-1], vs[j]].forEach(function(v){
          positions.push(v.pos.x, v.pos.y, v.pos.z);
          normals.push(v.normal.x, v.normal.y, v.normal.z);
        });
      }
    }
    var geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    return geom;
  }
  // 외부 노출: 월드좌표 기준 mesh 빼기. 결과는 worldMatrix=단위인 새 BufferGeometry(월드좌표).
  window.CSGEngine = {
    fromMesh: fromMesh,
    toGeometry: toGeometry,
    // solidMesh 에서 holeMeshes 들을 모두 뺀 BufferGeometry(월드좌표) 반환
    subtractMeshes: function(solidMesh, holeMeshes){
      var result = fromMesh(solidMesh);
      for(var i=0;i<holeMeshes.length;i++){
        result = result.subtract(fromMesh(holeMeshes[i]));
      }
      return toGeometry(result);
    }
  };
})();

// ============================================================
// v6.5: 정점 통합 유틸 (편집 모드용) — 같은 위치 정점을 하나로 병합한
//   인덱스드 BufferGeometry 반환. position만 다룸(normal은 이후 recompute).
// ============================================================
function mergeVerticesGeom(geom, tol){
  tol = tol || 1e-4;
  const src = geom.index ? geom.toNonIndexed() : geom;
  const pos = src.attributes.position;
  const n = pos.count;
  const map = new Map();      // key → 새 정점 인덱스
  const newPos = [];          // 펼친 좌표
  const indices = [];
  const decimals = Math.max(0, Math.floor(-Math.log10(tol)));
  function key(x,y,z){ return x.toFixed(decimals)+'_'+y.toFixed(decimals)+'_'+z.toFixed(decimals); }
  for(let i=0;i<n;i++){
    const x=pos.getX(i), y=pos.getY(i), z=pos.getZ(i);
    const k=key(x,y,z);
    let idx=map.get(k);
    if(idx===undefined){
      idx=newPos.length/3;
      map.set(k,idx);
      newPos.push(x,y,z);
    }
    indices.push(idx);
  }
  const out=new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(newPos,3));
  out.setIndex(indices);
  out.computeVertexNormals();
  return out;
}

// ============================================================
// v6.6: 입체도형 외곽 모서리(직선 엣지) 표시
//   EdgesGeometry(thresholdAngle)로 실제 꺾이는 모서리만 선으로 그림.
//   메시의 자식 LineSegments로 추가 → 메시와 함께 이동/회전/스케일됨.
// ============================================================
const EDGE_OUTLINE_COLOR = 0x1a1a1a;       // 모서리 선 색 (어두운 회색)
const EDGE_THRESHOLD_DEG = 25;             // 이 각도 이상 꺾인 모서리만 표시

function addEdgeOutline(mesh){
  if(!mesh) return;
  // mesh가 Group이면 내부 각 Mesh에 적용
  if(!mesh.isMesh){
    mesh.traverse(o=>{ if(o.isMesh) addEdgeOutline(o); });
    return;
  }
  removeEdgeOutline(mesh);
  if(!mesh.geometry || !mesh.geometry.attributes || !mesh.geometry.attributes.position) return;
  let eg;
  try { eg = new THREE.EdgesGeometry(mesh.geometry, EDGE_THRESHOLD_DEG); }
  catch(err){ return; }
  const lines = new THREE.LineSegments(
    eg,
    new THREE.LineBasicMaterial({color: EDGE_OUTLINE_COLOR})
  );
  lines.userData._isEdgeOutline = true;
  lines.renderOrder = 1; // 면 위에 그려지도록 살짝 우선
  // 부모(mesh)의 로컬 공간에 그대로 얹음 → 변환 공유
  mesh.add(lines);
}

function removeEdgeOutline(mesh){
  if(!mesh || !mesh.children) return;
  const toRemove = mesh.children.filter(c=>c.userData && c.userData._isEdgeOutline);
  toRemove.forEach(c=>{
    mesh.remove(c);
    if(c.geometry) c.geometry.dispose();
    if(c.material) c.material.dispose();
  });
}

function refreshEdgeOutline(mesh){
  addEdgeOutline(mesh); // remove 후 재생성
}

// 전체 부품 외곽선 일괄 갱신 (토글/로드 후)
function refreshAllEdgeOutlines(){
  state.parts.forEach(p=>{ if(p.mesh && p.visible !== false) addEdgeOutline(p.mesh); });
}

const state = {
  mode: 'sketch',
  tool: 'select',
  shapes: [],
  selectedShapes: new Set(),
  parts: [],
  selectedPartId: null,
  history: [],
  historyIdx: -1,
  penPoints: [],   // 한붓그리기 점 배열 [{x,y}]
  penCur: -1,      // 현재 점 인덱스 (-1=없음)
  penShowLabels: true,  // 점 번호 라벨 표시
  penOrigin: null, // 기준점 {x,y} (노란 십자)
  penShowCoord: false,  // 점 옆에 좌표 라벨 표시
  penDiameterMode: null, // {Cx, Cy} 직경좌표 모드 (회전체용)
  thickness: 0.6,  // 소재 두께(mm)
  wheelConnectMode: false, // 휠클릭 연결 모드 ON 시 true
  wheelConnectFirst: -1,   // 휠클릭 첫번째 점 인덱스
  gridSnap: false,  // v8.10: 기본 OFF (자유 클릭) — 사용자가 격자 버튼으로 ON 가능
  objSnap: true,    // v8.11: 객체 스냅 (점/끝점/중점/중심/사분점/수평수직 가이드)
  _lastSnapKind: null,  // 마지막 스냅 종류 — 시각 피드백용
  gridSize: 10,
  yOrigin: 0,       // (deprecated v8.25 — 호환을 위해 유지, 사용 안 함)
  xOrigin: 0,       // v8.25: X축 표시 기준점(mm) — 표시 X = 실제 X − xOrigin, 입력 X는 + xOrigin로 변환 (음수도 가능)
  tangentSnap: false,  // v8.24: 라이브 접선 스냅 - 원/호 드래그 시 가까운 선에 자동 접선
  fineGrid: null,      // v8.34: 정밀 격자 {anchor:{x,y}, step:0.1, range:30} or null (Ctrl 누름 + 점 선택 시)
  bgImage: null,       // v8.43: 배경 도면 이미지 {img, widthMm, heightMm, pxW, pxH, opacity, anchor, offsetX, offsetY, visible, fileName}
  angleLineMode: null, // v8.37: 각선 모드 {anchor, anchorIdx, angleRad, angleDeg, previewWp} or null
  sweepConnect: null,  // v8.44: 스윕 연결 진행 상태 {R, lastWp, hoverWp, visitedIdx:Set, orderedIdx:[], newLines:[]} (드래그 중에만 활성)
  sweepConnectModeOn: false,  // v8.44: 스윕 연결 모드 토글 (true면 마우스 드래그 시작 시 sweepConnect 시작)
  sweepRadius: 0.5,    // v8.44: 스윕 연결 원 반경 (mm). 휠로 0.1~5mm 조절
  fillModeOn: false,   // v8.45: 채움 모드 ON/OFF (닫힌 영역 클릭 시 자동 채움)
  moveSnap: 0,   // v5.2: 3D 부품 이동 스냅 단위(mm). 0=없음(자유 이동)
  rotSnap: 0,    // v5.3: 3D 부품 회전 스냅 단위(도). 0=없음(자유 회전)
  autoPopup: true, // v6.2: 도형 클릭 시 위치/크기/회전 입력 팝업 자동 표시
  blenderKeys: false, // v6.4: 블렌더식 단축키(G/R/S 모달 변형) 사용 여부
  showGrid: false,  // 기본 OFF (필요시 G 키 또는 ⊞ 버튼)
  showAxes: true,
  wireframe: false,
  showEdges: true,  // v6.6: 입체도형 외곽 모서리 선 표시
  smoothShading: false,  // v8.90: 부드러운 렌더링(스무딩) 토글
  showDimLabels: true, // v8.70: 오브젝트 선택 시 치수(가로/세로/높이) 표시
  vertexSnap: true, // v6.7: 버텍스 스냅(이동 시 코너 일치하면 달라붙음)
  measureMode: false, // v7.1: 치수 측정 모드
  measureFirst: null, // 측정 첫 점(월드 Vector3)
  pixelsPerMm: 4,
  panX: 0,
  panY: 0,
  drawing: null,
  partIdCounter: 1,
  // v2.6: 워크플레인 (W 키)
  workPlanePickMode: false,   // true면 다음 면 클릭이 워크플레인 지정
  workPlane: null,            // {origin: Vector3, normal: Vector3, partId: number, mesh: THREE.Group}
  boxSelect: null,            // v8.5: 우클릭 박스 선택 진행 상태 {sx,sy,ex,ey,wpStart,wpEnd,addToSel}
  continuousMode: false,      // v8.9: 연속선 토글 OFF=점만, ON=점+이전점과 자동 선
  dragPoint: null,            // v8.11~v8.12: 점 드래그 진행 상태
  dragShape: null,            // v8.16: 도형(선/사각형/원/호) 드래그 이동 상태
  _penPreviewWp: null,        // v8.12: 펜 도구 실시간 미리보기 — 마우스 현재 위치 (snapped)
};

const skCanvas = document.getElementById('sketchCanvas');
const skCtx = skCanvas.getContext('2d');

function resizeSkCanvas(){
  const r = skCanvas.parentElement.getBoundingClientRect();
  skCanvas.width = r.width;
  skCanvas.height = r.height;
  redrawSketch();
}
window.addEventListener('resize', ()=>{resizeSkCanvas(); onThreeResize()});

function worldToScreen(x, y){
  return {
    x: skCanvas.width/2 + x * state.pixelsPerMm + state.panX,
    y: skCanvas.height/2 - y * state.pixelsPerMm + state.panY
  };
}
function screenToWorld(sx, sy){
  return {
    x: (sx - skCanvas.width/2 - state.panX) / state.pixelsPerMm,
    y: -(sy - skCanvas.height/2 - state.panY) / state.pixelsPerMm
  };
}
// v8.11: snapPoint = 객체 스냅(OSNAP) — 점/끝점/중점/중심/직각·수평 가이드에 붙기
//   격자 스냅은 별도 (state.gridSnap이 true일 때만)
function snapPoint(p){
  // v8.34: 정밀 격자 스냅 (최우선) — anchor 기준 ±range 내에 들어오면 step 단위로
  if(state.fineGrid){
    const fg = state.fineGrid;
    const dx = p.x - fg.anchor.x;
    const dy = p.y - fg.anchor.y;
    if(Math.abs(dx) <= fg.range && Math.abs(dy) <= fg.range){
      // 표시 격자가 자동 폴백된 경우 그 step에 맞춰 스냅
      const stepPx = fg.step * state.pixelsPerMm;
      let s = fg.step;
      if(stepPx < 1.5){ s = 0.5; if(s * state.pixelsPerMm < 1.5) s = 1.0; if(s * state.pixelsPerMm < 1.5) s = 5.0; }
      state._lastSnapKind = '🟡정밀' + s + 'mm';
      return {
        x: fg.anchor.x + Math.round(dx/s)*s,
        y: fg.anchor.y + Math.round(dy/s)*s
      };
    }
  }
  // 1) 격자 스냅 (옵션, 기본 OFF)
  let result = p;
  if(state.gridSnap){
    const g = state.gridSize;
    result = {x: Math.round(p.x/g)*g, y: Math.round(p.y/g)*g};
  }
  // 2) 객체 스냅 (기본 ON)
  if(state.objSnap === false) return result;
  const tol = 6 / state.pixelsPerMm;  // 화면 6px 반경
  let best = null, bestD = Infinity, kind = null;
  const consider = (x, y, k) => {
    const d = Math.hypot(x - p.x, y - p.y);
    if(d < tol && d < bestD){ bestD = d; best = {x, y}; kind = k; }
  };
  // (A) 한붓그리기 점들
  state.penPoints.forEach(pt => consider(pt.x, pt.y, 'point'));
  // (B) 도형의 끝점·중점·중심 + line 목록 수집 (수선/평행/교점용)
  const lines = [];
  state.shapes.forEach(s => {
    if(s.type === 'line'){
      consider(s.x1, s.y1, 'endpoint');
      consider(s.x2, s.y2, 'endpoint');
      consider((s.x1+s.x2)/2, (s.y1+s.y2)/2, 'midpoint');
      lines.push({x1:s.x1, y1:s.y1, x2:s.x2, y2:s.y2});
    } else if(s.type === 'rect'){
      const xs = [s.x1, s.x2], ys = [s.y1, s.y2];
      xs.forEach(x => ys.forEach(y => consider(x, y, 'endpoint')));
      consider((s.x1+s.x2)/2, (s.y1+s.y2)/2, 'center');
      consider((s.x1+s.x2)/2, s.y1, 'midpoint');
      consider((s.x1+s.x2)/2, s.y2, 'midpoint');
      consider(s.x1, (s.y1+s.y2)/2, 'midpoint');
      consider(s.x2, (s.y1+s.y2)/2, 'midpoint');
      lines.push({x1:s.x1,y1:s.y1, x2:s.x2,y2:s.y1});
      lines.push({x1:s.x2,y1:s.y1, x2:s.x2,y2:s.y2});
      lines.push({x1:s.x2,y1:s.y2, x2:s.x1,y2:s.y2});
      lines.push({x1:s.x1,y1:s.y2, x2:s.x1,y2:s.y1});
    } else if(s.type === 'circle' || s.type === 'arc'){
      consider(s.cx, s.cy, 'center');
      consider(s.cx + s.r, s.cy, 'quadrant');
      consider(s.cx - s.r, s.cy, 'quadrant');
      consider(s.cx, s.cy + s.r, 'quadrant');
      consider(s.cx, s.cy - s.r, 'quadrant');
    }
  });
  // (C) 선 위 가장 가까운 점 (nearest)
  lines.forEach(L => {
    const dx = L.x2 - L.x1, dy = L.y2 - L.y1;
    const len2 = dx*dx + dy*dy;
    if(len2 < 1e-9) return;
    const t = ((p.x - L.x1)*dx + (p.y - L.y1)*dy) / len2;
    if(t < -0.0001 || t > 1.0001) return;
    const nx = L.x1 + t*dx, ny = L.y1 + t*dy;
    consider(nx, ny, 'nearest');
  });
  // (D) penCur 기준 수평/수직 가이드 + 그 라인 위 다른 점 (h-aligned/v-aligned)
  if(state.penCur >= 0 && state.penPoints[state.penCur]){
    const ref = state.penPoints[state.penCur];
    // 수평선
    if(Math.abs(p.y - ref.y) < tol){
      consider(p.x, ref.y, 'horizontal');
      // 수평선 위 다른 점 — 마우스 X가 그 점 X와 가까우면 정확히 그 점에 스냅
      state.penPoints.forEach(pt => {
        if(Math.abs(p.x - pt.x) < tol) consider(pt.x, ref.y, 'h-aligned');
      });
      lines.forEach(L => {
        [{x:L.x1,y:L.y1},{x:L.x2,y:L.y2}].forEach(ep => {
          if(Math.abs(p.x - ep.x) < tol) consider(ep.x, ref.y, 'h-aligned');
        });
      });
    }
    // 수직선
    if(Math.abs(p.x - ref.x) < tol){
      consider(ref.x, p.y, 'vertical');
      state.penPoints.forEach(pt => {
        if(Math.abs(p.y - pt.y) < tol) consider(ref.x, pt.y, 'v-aligned');
      });
      lines.forEach(L => {
        [{x:L.x1,y:L.y1},{x:L.x2,y:L.y2}].forEach(ep => {
          if(Math.abs(p.y - ep.y) < tol) consider(ref.x, ep.y, 'v-aligned');
        });
      });
    }
    // (E) 수선 — penCur에서 line에 내린 수선의 발
    lines.forEach(L => {
      const dx = L.x2 - L.x1, dy = L.y2 - L.y1;
      const len2 = dx*dx + dy*dy;
      if(len2 < 1e-9) return;
      const t = ((ref.x - L.x1)*dx + (ref.y - L.y1)*dy) / len2;
      if(t < -0.0001 || t > 1.0001) return;
      const fx = L.x1 + t*dx, fy = L.y1 + t*dy;
      consider(fx, fy, 'perpendicular');
    });
    // (F) 평행 라인 + 그 라인 위 다른 점 (p-aligned)
    lines.forEach(L => {
      const dx = L.x2 - L.x1, dy = L.y2 - L.y1;
      const len = Math.hypot(dx, dy);
      if(len < 1e-6) return;
      const ux = dx/len, uy = dy/len;
      const nxn = -uy, nyn = ux;  // 법선
      const offset = (p.x - ref.x)*nxn + (p.y - ref.y)*nyn;  // 법선 거리(부호)
      if(Math.abs(offset) < tol){
        const t = (p.x - ref.x)*ux + (p.y - ref.y)*uy;
        const px = ref.x + t*ux, py = ref.y + t*uy;
        consider(px, py, 'parallel');
        // 평행 라인 위에 있는 다른 점에도 스냅
        state.penPoints.forEach(pt => {
          const td = (pt.x - ref.x)*ux + (pt.y - ref.y)*uy;
          const offPt = (pt.x - ref.x)*nxn + (pt.y - ref.y)*nyn;
          if(Math.abs(offPt) < tol*2 && Math.abs(t - td) < tol){
            consider(pt.x, pt.y, 'p-aligned');
          }
        });
        lines.forEach(L2 => {
          [{x:L2.x1,y:L2.y1},{x:L2.x2,y:L2.y2}].forEach(ep => {
            const td = (ep.x - ref.x)*ux + (ep.y - ref.y)*uy;
            const offEp = (ep.x - ref.x)*nxn + (ep.y - ref.y)*nyn;
            if(Math.abs(offEp) < tol*2 && Math.abs(t - td) < tol){
              consider(ep.x, ep.y, 'p-aligned');
            }
          });
        });
      }
    });
  }
  // (G) 선-선 교점 (intersection)
  for(let i=0;i<lines.length;i++){
    for(let j=i+1;j<lines.length;j++){
      const ix = _sk3LineIntersect(lines[i], lines[j]);
      if(ix) consider(ix.x, ix.y, 'intersection');
    }
  }
  state._lastSnapKind = best ? kind : null;
  return best || result;
}

// 두 선분의 교점 (선분 안만)
function _sk3LineIntersect(A, B){
  const x1=A.x1, y1=A.y1, x2=A.x2, y2=A.y2;
  const x3=B.x1, y3=B.y1, x4=B.x2, y4=B.y2;
  const den = (x1-x2)*(y3-y4) - (y1-y2)*(x3-x4);
  if(Math.abs(den) < 1e-9) return null;
  const t = ((x1-x3)*(y3-y4) - (y1-y3)*(x3-x4)) / den;
  const u = -((x1-x2)*(y1-y3) - (y1-y2)*(x1-x3)) / den;
  if(t < -0.0001 || t > 1.0001 || u < -0.0001 || u > 1.0001) return null;
  return {x: x1 + t*(x2-x1), y: y1 + t*(y2-y1)};
}

function redrawSketch(){
  const w = skCanvas.width, h = skCanvas.height;
  skCtx.fillStyle = '#ffffff';
  skCtx.fillRect(0, 0, w, h);
  // v8.43: 배경 도면 이미지 (그리드/도형보다 먼저 = 가장 아래 레이어)
  if(state.bgImage && state.bgImage.visible && state.bgImage.img){
    drawBgImage();
  }
  if(state.showGrid) drawGrid();
  if(state.showAxes) drawAxes();
  // v8.45: 채움 객체를 다른 도형보다 먼저 (아래 레이어로) 그림
  state.shapes.forEach((s, idx) => {
    if(s.type === 'fill') drawShape(s, state.selectedShapes.has(idx));
  });
  state.shapes.forEach((s, idx) => {
    if(s.type !== 'fill') drawShape(s, state.selectedShapes.has(idx));
  });
  if(state.drawing) drawPreview();
  drawPenLabels();
  // v8.5: 박스 선택 미리보기
  if(state.boxSelect) sk3DrawBoxSelectPreview(state.boxSelect);
  // v8.44: 스윕 연결 미리보기 (원 + 진행 상태)
  if(state.sweepConnectModeOn) drawSweepConnect();
  // v8.37: 각선 모드 가이드 + 미리보기
  if(state.angleLineMode){
    const al = state.angleLineMode;
    const a = worldToScreen(al.anchor.x, al.anchor.y);
    const cs = Math.cos(al.angleRad), sn = Math.sin(al.angleRad);
    // 무한 가이드선 (anchor에서 각도 방향, 양방향 화면 끝까지)
    const big = 100000;
    const farX = al.anchor.x + cs*big, farY = al.anchor.y + sn*big;
    const farX2 = al.anchor.x - cs*big, farY2 = al.anchor.y - sn*big;
    const sFar = worldToScreen(farX, farY);
    const sFar2 = worldToScreen(farX2, farY2);
    skCtx.save();
    skCtx.strokeStyle = 'rgba(46, 204, 113, 0.5)';
    skCtx.lineWidth = 1;
    skCtx.setLineDash([6, 4]);
    skCtx.beginPath();
    skCtx.moveTo(sFar2.x, sFar2.y);
    skCtx.lineTo(sFar.x, sFar.y);
    skCtx.stroke();
    skCtx.setLineDash([]);
    // 미리보기 선 (anchor → previewWp)
    if(al.previewWp){
      const pv = worldToScreen(al.previewWp.x, al.previewWp.y);
      skCtx.strokeStyle = '#27ae60';
      skCtx.lineWidth = 2;
      skCtx.beginPath();
      skCtx.moveTo(a.x, a.y);
      skCtx.lineTo(pv.x, pv.y);
      skCtx.stroke();
      // 미리보기 끝점
      skCtx.fillStyle = '#27ae60';
      skCtx.beginPath();
      skCtx.arc(pv.x, pv.y, 5, 0, Math.PI*2);
      skCtx.fill();
      skCtx.fillStyle = '#fff';
      skCtx.beginPath();
      skCtx.arc(pv.x, pv.y, 2.5, 0, Math.PI*2);
      skCtx.fill();
      // 길이 라벨
      const lenAbs = Math.abs(al.previewWp.length || 0);
      skCtx.fillStyle = '#27ae60';
      skCtx.font = 'bold 12px Consolas';
      const midX = (a.x + pv.x) / 2;
      const midY = (a.y + pv.y) / 2;
      skCtx.fillText(lenAbs.toFixed(2) + 'mm @ ' + al.angleDeg + '°', midX + 6, midY - 6);
    }
    // anchor 마커
    skCtx.strokeStyle = '#e74c3c';
    skCtx.lineWidth = 2;
    skCtx.beginPath();
    skCtx.arc(a.x, a.y, 6, 0, Math.PI*2);
    skCtx.stroke();
    skCtx.restore();
  }
  // v8.12: OSNAP 마커 — 현재 마우스가 스냅된 곳에 종류별 아이콘 표시
  if(state._lastSnapKind && state._penPreviewWp){
    sk3DrawSnapMarker(state._penPreviewWp.x, state._penPreviewWp.y, state._lastSnapKind);
  }
  // v8.10: 선택 속성 패널 자동 갱신
  if(typeof sk3UpdateSelProp === 'function') sk3UpdateSelProp();
  // v9.1: 애드온 오버레이 훅 (따라그리기 미리보기 등) — redraw 후 위에 덧그림
  if(typeof window.SKETCH_OVERLAY_HOOK === 'function'){
    try { window.SKETCH_OVERLAY_HOOK(skCtx); } catch(e){}
  }
}

// v8.12: OSNAP 종류별 시각 마커
function sk3DrawSnapMarker(wx, wy, kind){
  const sp = worldToScreen(wx, wy);
  const size = 7;
  skCtx.save();
  skCtx.strokeStyle = '#f1c40f';
  skCtx.lineWidth = 2;
  skCtx.fillStyle = 'rgba(241, 196, 15, 0.25)';
  skCtx.beginPath();
  if(kind === 'point' || kind === 'endpoint'){
    skCtx.rect(sp.x - size, sp.y - size, size*2, size*2);  // 사각형
  } else if(kind === 'midpoint'){
    // 삼각형
    skCtx.moveTo(sp.x, sp.y - size);
    skCtx.lineTo(sp.x + size, sp.y + size);
    skCtx.lineTo(sp.x - size, sp.y + size);
    skCtx.closePath();
  } else if(kind === 'center'){
    skCtx.arc(sp.x, sp.y, size, 0, Math.PI*2);  // 원
  } else if(kind === 'quadrant'){
    // 마름모
    skCtx.moveTo(sp.x, sp.y - size);
    skCtx.lineTo(sp.x + size, sp.y);
    skCtx.lineTo(sp.x, sp.y + size);
    skCtx.lineTo(sp.x - size, sp.y);
    skCtx.closePath();
  } else if(kind === 'perpendicular'){
    // 수선 마커: ⊥
    skCtx.rect(sp.x - size, sp.y - size, size*2, size*2);
    skCtx.moveTo(sp.x - size, sp.y);
    skCtx.lineTo(sp.x + size, sp.y);
    skCtx.moveTo(sp.x, sp.y - size);
    skCtx.lineTo(sp.x, sp.y + size);
  } else if(kind === 'parallel'){
    // 평행 마커: ∥ (두 짧은 선)
    skCtx.moveTo(sp.x - size/2, sp.y - size);
    skCtx.lineTo(sp.x - size/2, sp.y + size);
    skCtx.moveTo(sp.x + size/2, sp.y - size);
    skCtx.lineTo(sp.x + size/2, sp.y + size);
  } else if(kind === 'intersection'){
    // 교점 마커: ×
    skCtx.moveTo(sp.x - size, sp.y - size);
    skCtx.lineTo(sp.x + size, sp.y + size);
    skCtx.moveTo(sp.x + size, sp.y - size);
    skCtx.lineTo(sp.x - size, sp.y + size);
  } else if(kind === 'nearest'){
    // 근점 마커: 작은 X
    skCtx.moveTo(sp.x - size/2, sp.y - size/2);
    skCtx.lineTo(sp.x + size/2, sp.y + size/2);
    skCtx.moveTo(sp.x + size/2, sp.y - size/2);
    skCtx.lineTo(sp.x - size/2, sp.y + size/2);
  } else if(kind === 'horizontal' || kind === 'vertical'){
    if(kind === 'horizontal'){
      skCtx.moveTo(sp.x - size, sp.y);
      skCtx.lineTo(sp.x + size, sp.y);
    } else {
      skCtx.moveTo(sp.x, sp.y - size);
      skCtx.lineTo(sp.x, sp.y + size);
    }
  } else if(kind === 'h-aligned' || kind === 'v-aligned' || kind === 'p-aligned'){
    // 정렬된 점 — 사각형 (채움)
    skCtx.rect(sp.x - size, sp.y - size, size*2, size*2);
  } else {
    skCtx.rect(sp.x - size, sp.y - size, size*2, size*2);
  }
  if(['point','endpoint','center','quadrant','midpoint','h-aligned','v-aligned','p-aligned'].indexOf(kind) >= 0){
    skCtx.fill();
  }
  skCtx.stroke();
  // 종류 라벨
  skCtx.fillStyle = '#f1c40f';
  skCtx.font = '10px sans-serif';
  skCtx.textAlign = 'left';
  skCtx.textBaseline = 'middle';
  skCtx.fillText(kind, sp.x + size + 4, sp.y - size - 4);
  skCtx.restore();
}

// 한붓그리기 점·번호 라벨 그리기
function drawPenLabels(){
  // 기준점 십자 (노란 +)
  if(state.penOrigin){
    const sp = worldToScreen(state.penOrigin.x, state.penOrigin.y);
    skCtx.save();
    skCtx.strokeStyle = '#ffe040';
    skCtx.lineWidth = 2;
    skCtx.beginPath();
    skCtx.moveTo(sp.x - 9, sp.y); skCtx.lineTo(sp.x + 9, sp.y);
    skCtx.moveTo(sp.x, sp.y - 9); skCtx.lineTo(sp.x, sp.y + 9);
    skCtx.stroke();
    skCtx.fillStyle = '#ffe040';
    skCtx.font = 'bold 10px monospace';
    skCtx.fillText('⊕', sp.x + 11, sp.y - 4);
    skCtx.restore();
  }
  if(!state.penShowLabels || !state.penPoints || state.penPoints.length === 0) return;
  skCtx.save();
  state.penPoints.forEach((p, i) => {
    const sp = worldToScreen(p.x, p.y);
    // 점 마커 (노란 원)
    skCtx.fillStyle = '#f0c040';
    skCtx.strokeStyle = '#000';
    skCtx.lineWidth = 1;
    skCtx.beginPath();
    skCtx.arc(sp.x, sp.y, 3.5, 0, Math.PI*2);
    skCtx.fill();
    skCtx.stroke();
    // 번호 + (옵션) 좌표 텍스트
    let label = 'P' + i;
    if(state.penShowCoord){
      label += ' ' + sk3FormatCoord(p.x, p.y);
    }
    skCtx.font = 'bold 11px monospace';
    skCtx.textAlign = 'left';
    skCtx.textBaseline = 'middle';
    // 라벨 배경 박스 (가독성)
    const m = skCtx.measureText(label);
    const bw = m.width + 6, bh = 14;
    skCtx.fillStyle = 'rgba(20,30,40,0.78)';
    skCtx.strokeStyle = 'rgba(120,220,180,0.5)';
    skCtx.lineWidth = 1;
    skCtx.fillRect(sp.x + 6, sp.y - 14, bw, bh);
    skCtx.strokeRect(sp.x + 6, sp.y - 14, bw, bh);
    // 텍스트
    skCtx.fillStyle = '#ffe070';
    skCtx.fillText(label, sp.x + 9, sp.y - 7);
  });
  // 현재점 강조 (오렌지 링)
  if(state.penCur >= 0 && state.penPoints[state.penCur]){
    const cp = state.penPoints[state.penCur];
    const sp = worldToScreen(cp.x, cp.y);
    skCtx.strokeStyle = '#ff6020';
    skCtx.lineWidth = 2.5;
    skCtx.beginPath();
    skCtx.arc(sp.x, sp.y, 7, 0, Math.PI*2);
    skCtx.stroke();
  }
  skCtx.restore();
}

// 좌표 라벨 포맷 (직경좌표 모드 지원)
function sk3FormatCoord(x, y){
  if(state.penDiameterMode){
    // 직경좌표: 표시X = Cx - 2*x (x는 좌측이 +D), Y = Cy + y
    const Cx = state.penDiameterMode.Cx || 0;
    const Cy = state.penDiameterMode.Cy || 0;
    return '(' + (Cx - 2*x).toFixed(2) + ', ' + (Cy + y).toFixed(2) + ')⌀';
  }
  return '(' + x.toFixed(2) + ', ' + y.toFixed(2) + ')';
}

// 점좌표 표시 토글
window.sk3TogglePenCoord = function(){
  state.penShowCoord = !state.penShowCoord;
  // v8.4: 점좌표 ON 시 펜 도구 자동 활성화 (사용자가 점 찍을 의도)
  if(state.penShowCoord && state.tool !== 'pen' && typeof setTool === 'function'){
    setTool('pen');
  }
  redrawSketch();
  skCmdLog('  📍 점 좌표라벨 ' + (state.penShowCoord ? 'ON' : 'OFF'), 'sys');
  toast('점좌표 ' + (state.penShowCoord ? 'ON (펜 도구 자동 활성)' : 'OFF'));
  const btn = document.getElementById('btn-pencoord');
  if(btn) btn.classList.toggle('on', state.penShowCoord);
};

// ─── v8.40: 도형 끝점 → 펜점 자동 동기화 ──────────────────────
// 모든 도형(line/rect/circle/arc)의 끝점·중심을 스캔하여 펜점이 없으면 자동 추가
// 교차분할/두께주기/교점/외곽선/필렛/모따기 등 도형 변경 후 호출하여
// 새로 생긴 끝점에 즉시 펜점 번호 부여 → 후속 작업(연결/이동/속성) 편의성
// 옵션: kinds = {line:true, rect:true, circle:false, arc:true} 같은 식으로 제한 가능
window.sk3SyncPenPointsToShapes = function(opts){
  const o = opts || {};
  const doLine   = o.line   !== false;  // 기본 true
  const doRect   = o.rect   !== false;
  const doArc    = o.arc    !== false;
  const doCircle = !!o.circle;          // 기본 false (원 중심에 점 자동생성은 보통 거추장)
  const tol = (o.tol !== undefined) ? o.tol : 0.01;

  function findOrAdd(x, y){
    let idx = state.penPoints.findIndex(p => Math.abs(p.x-x)<tol && Math.abs(p.y-y)<tol);
    if(idx < 0){ state.penPoints.push({x, y}); idx = state.penPoints.length - 1; return {idx, added:true}; }
    return {idx, added:false};
  }

  let addedCount = 0;
  state.shapes.forEach(s => {
    if(s.type === 'line' && doLine){
      if(findOrAdd(s.x1, s.y1).added) addedCount++;
      if(findOrAdd(s.x2, s.y2).added) addedCount++;
    } else if(s.type === 'rect' && doRect){
      // rect는 4개 모서리
      const xs = [s.x1, s.x2, s.x2, s.x1];
      const ys = [s.y1, s.y1, s.y2, s.y2];
      for(let i=0; i<4; i++){
        if(findOrAdd(xs[i], ys[i]).added) addedCount++;
      }
    } else if(s.type === 'arc' && doArc && !s.isFull){
      // 호 시작점/끝점
      const sx = s.cx + s.r * Math.cos(s.startAngle);
      const sy = s.cy + s.r * Math.sin(s.startAngle);
      const ex = s.cx + s.r * Math.cos(s.endAngle);
      const ey = s.cy + s.r * Math.sin(s.endAngle);
      if(findOrAdd(sx, sy).added) addedCount++;
      if(findOrAdd(ex, ey).added) addedCount++;
    } else if(s.type === 'circle' && doCircle){
      if(findOrAdd(s.cx, s.cy).added) addedCount++;
    }
  });
  return addedCount;
};

// ─── v8.44: 스윕 연결 — 마우스 드래그로 원이 점들을 순서대로 통과하며 연결 ──
window.sk3ToggleSweepConnect = function(){
  if(state.mode !== 'sketch'){ toast('스케치 모드에서만 가능'); return; }
  state.sweepConnectModeOn = !state.sweepConnectModeOn;
  const btn = document.getElementById('btn-sweep');
  if(btn) btn.classList.toggle('on', state.sweepConnectModeOn);
  if(state.sweepConnectModeOn){
    toast('🪢 스윕 연결 ON — 좌클릭+드래그로 원이 지나가는 점들을 순서대로 연결 (휠로 원 크기 조절)');
    if(typeof skCmdLog === 'function') skCmdLog('  🪢 스윕 연결 ON · 원 반경 ' + state.sweepRadius + 'mm', 'sys');
    // 도형 드래그 도구를 피하려고 select 도구로
    if(typeof setTool === 'function' && state.tool !== 'select') setTool('select');
  } else {
    toast('🪢 스윕 연결 OFF');
    state.sweepConnect = null;
    redrawSketch();
  }
};

// 휠 이벤트로 반경 조절 (스윕 모드일 때만)
window.sk3AdjustSweepRadius = function(deltaY){
  // wheel up(deltaY<0) = 크게, down = 작게
  const step = (state.sweepRadius < 0.5) ? 0.05 : (state.sweepRadius < 1.5) ? 0.1 : 0.25;
  if(deltaY < 0) state.sweepRadius = Math.min(5.0, state.sweepRadius + step);
  else            state.sweepRadius = Math.max(0.1, state.sweepRadius - step);
  state.sweepRadius = Math.round(state.sweepRadius * 100) / 100;
  if(state.sweepConnect) state.sweepConnect.R = state.sweepRadius;
  toast('🪢 원 반경 ' + state.sweepRadius + 'mm');
  redrawSketch();
};

// segment(a→b)와 점 p의 최단거리 + 그 위치의 t파라미터
function _segDistAndT(p, a, b){
  const dx = b.x-a.x, dy = b.y-a.y;
  const lenSq = dx*dx + dy*dy;
  if(lenSq < 1e-9) return {d: Math.hypot(p.x-a.x, p.y-a.y), t: 0};
  let t = ((p.x-a.x)*dx + (p.y-a.y)*dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t*dx, cy = a.y + t*dy;
  return {d: Math.hypot(p.x-cx, p.y-cy), t};
}

// 드래그 시작 시 호출 — 스윕 연결 진행 상태 초기화
window.sk3SweepStart = function(wp){
  // 시작점에서 이미 원 안에 들어있는 가장 가까운 점부터 시작
  state.sweepConnect = {
    R: state.sweepRadius,
    lastWp: {x: wp.x, y: wp.y},
    hoverWp: {x: wp.x, y: wp.y},
    visitedIdx: new Set(),
    orderedIdx: [],
    newLines: []
  };
  // 시작 즉시 안에 있는 점도 후킹
  _sweepCheckEntries(wp, wp);
};

// 마우스 이동 시 segment(이전→현재)가 새로 지나간 점들을 순서대로 hit
function _sweepCheckEntries(aWp, bWp){
  const sw = state.sweepConnect;
  if(!sw) return;
  const R = sw.R;
  const hits = [];
  state.penPoints.forEach((p, idx) => {
    if(sw.visitedIdx.has(idx)) return;
    const r = _segDistAndT(p, aWp, bWp);
    if(r.d <= R){
      hits.push({idx, t: r.t});
    }
  });
  // 진입 순서대로 (t 작은 것부터)
  hits.sort((a, b) => a.t - b.t);
  hits.forEach(h => {
    if(sw.visitedIdx.has(h.idx)) return;
    sw.visitedIdx.add(h.idx);
    sw.orderedIdx.push(h.idx);
    // 직전 점과 새 점 연결 (orderedIdx 길이 ≥ 2일 때)
    if(sw.orderedIdx.length >= 2){
      const prevIdx = sw.orderedIdx[sw.orderedIdx.length - 2];
      const curIdx = h.idx;
      // 중복 선(이미 같은 두 끝점 선이 있나) 체크
      const p1 = state.penPoints[prevIdx], p2 = state.penPoints[curIdx];
      if(p1 && p2){
        const tol = 0.01;
        const dup = state.shapes.some(s =>
          s.type === 'line' &&
          ((Math.abs(s.x1-p1.x)<tol && Math.abs(s.y1-p1.y)<tol && Math.abs(s.x2-p2.x)<tol && Math.abs(s.y2-p2.y)<tol) ||
           (Math.abs(s.x1-p2.x)<tol && Math.abs(s.y1-p2.y)<tol && Math.abs(s.x2-p1.x)<tol && Math.abs(s.y2-p1.y)<tol)));
        if(!dup){
          const ln = {type:'line', x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y,
            color: (document.getElementById('sketchColor')||{}).value || '#000000',
            lineWidth: parseInt((document.getElementById('lineWidth')||{}).value) || 2};
          state.shapes.push(ln);
          sw.newLines.push(ln);
        }
      }
    }
  });
}

// 드래그 중 마우스 이동 시 호출 (각 mousemove마다)
window.sk3SweepMove = function(wp){
  const sw = state.sweepConnect;
  if(!sw) return;
  _sweepCheckEntries(sw.lastWp, wp);
  sw.lastWp = {x: wp.x, y: wp.y};
  sw.hoverWp = {x: wp.x, y: wp.y};
  redrawSketch();
};

// 드래그 종료 시 호출 — 히스토리 기록 + 토스트
window.sk3SweepEnd = function(){
  const sw = state.sweepConnect;
  if(!sw){ return; }
  const lines = sw.newLines || [];
  const ordered = sw.orderedIdx || [];
  // 임시로 추가했던 선들을 일단 제거하고 pushHistory 후 다시 추가 (정상 undo 가능하도록)
  if(lines.length > 0){
    lines.forEach(ln => {
      const i = state.shapes.indexOf(ln);
      if(i >= 0) state.shapes.splice(i, 1);
    });
    pushHistory();
    lines.forEach(ln => state.shapes.push(ln));
    toast('🪢 스윕 연결: ' + ordered.length + '개 점 통과 → 선 ' + lines.length + '개 생성');
    if(typeof skCmdLog === 'function'){
      skCmdLog('  🪢 스윕 연결: ' + ordered.map(i => 'P'+i).join(' → ') + ' (선 ' + lines.length + '개)', 'sys');
    }
  } else if(ordered.length > 0){
    toast('🪢 점 ' + ordered.length + '개 지나갔으나 새 선 없음 (이미 연결되어 있음)');
  } else {
    toast('🪢 지나간 점이 없습니다');
  }
  state.sweepConnect = null;
  redrawSketch(); updateInfo();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
};

// 그리기: 현재 마우스 위치에 원 + 진행 표시
function drawSweepConnect(){
  if(!state.sweepConnectModeOn) return;
  const ctx = skCtx;
  ctx.save();
  // 드래그 중이 아니어도 마우스 따라 미리보기 원 표시 (대기 상태)
  const sw = state.sweepConnect;
  const wp = sw ? sw.hoverWp : state._sweepHoverWp;
  if(!wp) { ctx.restore(); return; }
  const sp = worldToScreen(wp.x, wp.y);
  const rPx = state.sweepRadius * state.pixelsPerMm;
  // 원 (반투명)
  ctx.fillStyle = sw ? 'rgba(46, 204, 113, 0.22)' : 'rgba(46, 204, 113, 0.10)';
  ctx.strokeStyle = '#27ae60';
  ctx.lineWidth = sw ? 2 : 1;
  ctx.beginPath();
  ctx.arc(sp.x, sp.y, rPx, 0, Math.PI*2);
  ctx.fill();
  ctx.stroke();
  // 반경 표시
  ctx.fillStyle = '#27ae60';
  ctx.font = 'bold 11px Consolas';
  ctx.fillText('R=' + state.sweepRadius + 'mm' + (sw?' · '+sw.orderedIdx.length+'점':''), sp.x + rPx + 4, sp.y - 4);
  // 진행 중 — 지나간 점에 강조
  if(sw && sw.orderedIdx.length > 0){
    sw.orderedIdx.forEach((idx, k) => {
      const p = state.penPoints[idx];
      if(!p) return;
      const ps = worldToScreen(p.x, p.y);
      ctx.fillStyle = '#27ae60';
      ctx.beginPath();
      ctx.arc(ps.x, ps.y, 6, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px Consolas';
      ctx.fillText(String(k+1), ps.x - 3, ps.y + 3);
    });
  }
  ctx.restore();
}

// v8.36: 원점(0,0)에 펜점 추가 — 작업 시작점 빠른 표시
window.sk3AddOriginPoint = function(){
  if(state.mode !== 'sketch'){ toast('스케치 모드에서만 가능'); return; }
  const tol = 0.01;
  let idx = state.penPoints.findIndex(p => Math.abs(p.x) < tol && Math.abs(p.y) < tol);
  if(idx >= 0){
    state.penCur = idx;
    redrawSketch();
    if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
    toast('● 원점 P' + idx + ' 이미 있음 (현재 점으로 선택)');
    return;
  }
  pushHistory();
  state.penPoints.push({x: 0, y: 0});
  state.penCur = state.penPoints.length - 1;
  redrawSketch(); updateInfo();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  toast('● 원점 (0, 0)에 점 P' + state.penCur + ' 추가');
  if(typeof skCmdLog === 'function') skCmdLog('  ● 원점 점 P' + state.penCur + ' 추가 (0, 0)', 'sys');
};

// ─── v8.37: 각선 — 선택된 점에서 각도 유지하며 연장선 그리기 ───
// 사용 흐름:
//   1) 점 선택 (penCur 설정)
//   2) 📐 각선 버튼 클릭 → 각도(°) 입력
//   3) 마우스 이동 → 그 방향으로만 미리보기 진행
//   4) 좌클릭 → 새 점 추가 + 선 생성
//   5) ESC → 취소
window.sk3StartAngleLine = function(){
  if(state.mode !== 'sketch'){ toast('스케치 모드에서만 가능'); return; }
  if(state.penCur < 0 || !state.penPoints[state.penCur]){
    toast('📐 각선 — 먼저 점을 선택하세요 (점 클릭 또는 ⊕원점)');
    return;
  }
  const anchor = state.penPoints[state.penCur];
  const aStr = prompt('📐 각선 — 각도 입력\n\n수평(동) 기준 반시계 방향 (°)\n· 0=오른쪽 →\n· 90=위 ↑\n· 180=왼쪽 ←\n· 270=아래 ↓\n· 45=우상↗, 135=좌상↖\n· 수식 가능 (=45*2, 90/2, =-30)\n\n· 마우스 이동 후 좌클릭으로 길이 결정\n· ESC=취소', '0');
  if(aStr === null) return;
  const cleaned = String(aStr).replace(/[^0-9+\-*/.()]/g, '');
  let deg;
  try { deg = Function('"use strict";return (' + cleaned + ')')(); }
  catch(e){ toast('각도 수식 오류'); return; }
  if(!isFinite(deg)){ toast('유효한 각도 필요'); return; }
  state.angleLineMode = {
    anchorIdx: state.penCur,
    anchor: {x: anchor.x, y: anchor.y},
    angleRad: deg * Math.PI / 180,
    angleDeg: deg,
    previewWp: null
  };
  if(typeof setTool === 'function') setTool('select');
  toast('📐 각선 모드 ON: ' + deg + '° — 마우스 이동 후 클릭으로 길이 결정 (ESC=취소)');
  if(typeof skCmdLog === 'function') skCmdLog('  📐 각선 모드: P' + state.penCur + ' 기준 ' + deg + '°', 'sys');
  redrawSketch();
};

// 각선 모드: 마우스 위치를 angle 직선으로 투영한 점 반환
window.sk3AngleProject = function(wp){
  if(!state.angleLineMode) return null;
  const al = state.angleLineMode;
  const cs = Math.cos(al.angleRad), sn = Math.sin(al.angleRad);
  const dx = wp.x - al.anchor.x;
  const dy = wp.y - al.anchor.y;
  const t = dx*cs + dy*sn;  // anchor에서 단위벡터 방향으로의 부호 거리
  return {x: al.anchor.x + cs*t, y: al.anchor.y + sn*t, length: t};
};

// 각선 모드 종료 (확정/취소)
window.sk3CommitAngleLine = function(wp){
  if(!state.angleLineMode) return false;
  const al = state.angleLineMode;
  const proj = sk3AngleProject(wp);
  if(!proj || Math.abs(proj.length) < 0.05){
    toast('📐 길이가 너무 작아 취소 (anchor와 거의 같은 위치)');
    state.angleLineMode = null;
    redrawSketch();
    return true;
  }
  pushHistory();
  // 새 펜점 + 선
  state.penPoints.push({x: proj.x, y: proj.y});
  const newIdx = state.penPoints.length - 1;
  state.shapes.push({
    type: 'line',
    x1: al.anchor.x, y1: al.anchor.y,
    x2: proj.x, y2: proj.y,
    color: '#000000', lineWidth: 2
  });
  state.penCur = newIdx;
  const lenMm = Math.abs(proj.length);
  toast('📐 각선 추가: ' + al.angleDeg + '°, 길이 ' + lenMm.toFixed(2) + 'mm → P' + newIdx);
  if(typeof skCmdLog === 'function') skCmdLog('  📐 각선 완료: ' + al.angleDeg + '° · 길이 ' + lenMm.toFixed(2) + 'mm · P' + al.anchorIdx + '→P' + newIdx, 'sys');
  state.angleLineMode = null;
  redrawSketch(); updateInfo();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  return true;
};

window.sk3CancelAngleLine = function(){
  if(!state.angleLineMode) return false;
  state.angleLineMode = null;
  redrawSketch();
  toast('✗ 각선 취소');
  return true;
};

// ─── v8.33: 지름좌표 → 원점 양쪽에 점 2개 추가 ─────────────────
// 입력값 D(지름) → 원점(0,0) 기준 ±D/2 X축 양쪽에 점 추가
// 이미 같은 좌표에 펜점이 있으면 재사용 (중복 방지)
window.sk3AddDiameterPoints = function(D, cx, cy){
  if(!isFinite(D) || D <= 0){ toast('유효한 지름 필요 (>0)'); return null; }
  if(typeof cx !== 'number') cx = 0;
  if(typeof cy !== 'number') cy = 0;
  const r = D / 2;
  const left  = {x: cx - r, y: cy};
  const right = {x: cx + r, y: cy};
  pushHistory();
  const tol = 0.01;
  function findOrAdd(p){
    let idx = state.penPoints.findIndex(pp => Math.abs(pp.x-p.x)<tol && Math.abs(pp.y-p.y)<tol);
    if(idx < 0){ state.penPoints.push({x:p.x, y:p.y}); idx = state.penPoints.length - 1; }
    return idx;
  }
  const li = findOrAdd(left);
  const ri = findOrAdd(right);
  state.penCur = ri;  // 오른쪽 점을 현재 점으로
  redrawSketch(); updateInfo();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  toast('⌀ 지름좌표 D=' + D + 'mm → 양쪽 점 추가 (±' + r + ', ' + cy + ')');
  if(typeof skCmdLog === 'function') skCmdLog('  ⌀ 지름좌표 D=' + D + ' → P' + li + '(' + left.x + ',' + left.y + '), P' + ri + '(' + right.x + ',' + right.y + ')', 'sys');
  return {leftIdx: li, rightIdx: ri};
};

// 지름좌표 prompt 모달 (메뉴/단축키 진입용)
window.sk3PromptDiameter = function(){
  const dStr = prompt('⌀ 지름좌표 — 양쪽 대칭 점 추가\n\n지름 D (mm) 입력:\n· 수식 가능 (=10+5, 100/2, 30+5)\n· 결과: 원점에서 ±D/2 거리에 점 2개', '10');
  if(dStr === null) return;
  const cleaned = String(dStr).replace(/[^0-9+\-*/.()]/g, '');
  let v;
  try { v = Function('"use strict";return (' + cleaned + ')')(); }
  catch(e){ toast('수식 오류'); return; }
  if(!isFinite(v) || v <= 0){ toast('유효한 지름 필요'); return; }
  sk3AddDiameterPoints(v);
};

// 직경좌표 모드 토글 (라벨 표시용 - 별도 기능)
window.sk3ToggleDiameter = function(){
  if(state.penDiameterMode){
    state.penDiameterMode = null;
    skCmdLog('  ⌀ 직경좌표 OFF', 'sys');
    toast('직경좌표 OFF');
  } else {
    const Cx = parseFloat(prompt('직경좌표 원점 Cx (mm)', '0'));
    if(isNaN(Cx)) return;
    const Cy = parseFloat(prompt('직경좌표 원점 Cy (mm)', '0'));
    if(isNaN(Cy)) return;
    state.penDiameterMode = {Cx, Cy};
    skCmdLog('  ⌀ 직경좌표 ON: Cx=' + Cx + ', Cy=' + Cy, 'sys');
    toast('직경좌표 ON (펜 도구 자동 활성)');
    // v8.4: 직경좌표 ON 시 펜 도구 자동 활성화
    if(state.tool !== 'pen' && typeof setTool === 'function') setTool('pen');
  }
  redrawSketch();
  const btn = document.getElementById('btn-diameter');
  if(btn) btn.style.background = state.penDiameterMode ? '#7d4296' : '';
};

// 두께 입력값 저장
window.sk3SetThickness = function(){
  const v = parseFloat(prompt('소재 두께(mm)', String(state.thickness || 0.6)));
  if(!isFinite(v) || v <= 0) return;
  state.thickness = v;
  toast('두께 = ' + v + 'mm');
  skCmdLog('  ⚙ 소재 두께 = ' + v + 'mm', 'sys');
};

// v8.9: 연속선 토글 (펜 클릭 시 자동 선 연결 ON/OFF)
window.sk3ToggleContinuous = function(){
  state.continuousMode = !state.continuousMode;
  toast(state.continuousMode ? '⛓ 연속선 ON: 펜 클릭 시 이전 점과 자동 선 연결' : '⛓ 연속선 OFF: 펜 클릭 시 점만 추가');
  skCmdLog('  ⛓ 연속선 ' + (state.continuousMode ? 'ON' : 'OFF'), 'sys');
  const btn = document.getElementById('btn-continuous');
  if(btn) btn.style.background = state.continuousMode ? '#16a085' : '';
};

// 휠클릭 연결 모드 토글
window.sk3ToggleWheelConnect = function(){
  if(state.wheelConnectMode){
    state.wheelConnectMode = false;
    state.wheelConnectFirst = -1;
    toast('⚡ 연결 모드 OFF');
    skCmdLog('  ⚡ 휠클릭 연결 OFF', 'sys');
  } else {
    state.wheelConnectMode = true;
    state.wheelConnectFirst = -1;
    toast('⚡ 연결 ON: 두 점에서 휠클릭(가운데버튼)으로 선 연결');
    skCmdLog('  ⚡ 휠클릭 연결 ON (1회용)', 'sys');
    // v8.4: 연결 모드 ON 시 펜 도구 자동 활성화 (점 위 휠클릭 선택용)
    if(state.tool !== 'pen' && typeof setTool === 'function') setTool('pen');
  }
  const btn = document.getElementById('btn-wconnect');
  if(btn) btn.classList.toggle('on', state.wheelConnectMode);
};

// 가장 가까운 한붓그리기 점 찾기 (worldspace tolerance ~ 5px)
// v8.14: 수식 평가
function sk3EvalExpr(str){
  if(typeof str !== 'string') return parseFloat(str);
  const s = str.trim();
  if(s === '') return NaN;
  const direct = parseFloat(s);
  if(!isNaN(direct) && /^-?[0-9]*\.?[0-9]+$/.test(s)) return direct;
  if(!/^[0-9+\-*\/().\s]+$/.test(s)) return NaN;
  try {
    const v = Function('"use strict"; return (' + s + ')')();
    if(typeof v !== 'number' || !isFinite(v)) return NaN;
    return v;
  } catch(e){ return NaN; }
}

// v8.13: 선 중복 제거 (양 끝점이 같으면 같은 선, 방향 무관)
function sk3AddLineDedup(line){
  const tol = 0.01;
  const same = (a,b,c,d) => Math.abs(a-c)<tol && Math.abs(b-d)<tol;
  for(const s of state.shapes){
    if(s.type !== 'line') continue;
    if(same(s.x1,s.y1,line.x1,line.y1) && same(s.x2,s.y2,line.x2,line.y2)) return false;
    if(same(s.x1,s.y1,line.x2,line.y2) && same(s.x2,s.y2,line.x1,line.y1)) return false;
  }
  state.shapes.push(line);
  return true;
}

function sk3FindNearestPenPoint(wp){
  const tol = 6 / state.pixelsPerMm;  // v8.11: 6px (OSNAP과 동일)
  let bestIdx = -1, bestD = Infinity;
  state.penPoints.forEach((p, i) => {
    const d = Math.hypot(p.x - wp.x, p.y - wp.y);
    if(d < tol && d < bestD){ bestD = d; bestIdx = i; }
  });
  return bestIdx;
}

// 휠클릭 → 점 연결
function sk3HandleWheelConnectClick(wp){
  const idx = sk3FindNearestPenPoint(wp);
  if(idx < 0){ toast('점 위에서 휠클릭하세요'); return; }
  if(state.wheelConnectFirst < 0){
    state.wheelConnectFirst = idx;
    state.penCur = idx;
    redrawSketch();
    toast('⚡ 시작 P' + idx + ' → 둘째 점 휠클릭');
    skCmdLog('  ⚡ 시작점 P' + idx, 'sys');
    return;
  }
  const i1 = state.wheelConnectFirst, i2 = idx;
  if(i1 === i2){ toast('다른 점을 선택하세요'); return; }
  const p1 = state.penPoints[i1], p2 = state.penPoints[i2];
  pushHistory();
  sk3AddLineDedup({type:'line', x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y,
    color: document.getElementById('sketchColor').value || '#000000',
    lineWidth: parseInt(document.getElementById('lineWidth').value)||2});
  state.penCur = i2;
  redrawSketch(); updateInfo();
  skCmdLog('  ⚡ 연결: P' + i1 + '–P' + i2 + ' (자동 OFF)', 'sys');
  toast('⚡ P' + i1 + '–P' + i2 + ' 연결 완료');
  // 자동 OFF
  state.wheelConnectMode = false;
  state.wheelConnectFirst = -1;
  const btn = document.getElementById('btn-wconnect');
  if(btn) btn.classList.remove('on');
}

// ─── 스케치 더블클릭 → 도형 속성 편집 모달 ───────────────
function sk3FindShapeAt(wp){
  const tol = 8 / state.pixelsPerMm;
  for(let i = state.shapes.length - 1; i >= 0; i--){
    const s = state.shapes[i];
    if(s.type === 'line'){
      const dx = s.x2-s.x1, dy = s.y2-s.y1, ln2 = dx*dx+dy*dy;
      if(ln2 < 1e-9) continue;
      let t = ((wp.x-s.x1)*dx + (wp.y-s.y1)*dy)/ln2;
      if(t < -0.05 || t > 1.05) continue;
      t = Math.max(0, Math.min(1, t));
      const px = s.x1+dx*t, py = s.y1+dy*t;
      if(Math.hypot(wp.x-px, wp.y-py) < tol) return {idx:i, s:s};
    } else if(s.type === 'rect'){
      const minX = Math.min(s.x1,s.x2), maxX = Math.max(s.x1,s.x2);
      const minY = Math.min(s.y1,s.y2), maxY = Math.max(s.y1,s.y2);
      // 경계 또는 내부
      if(wp.x >= minX-tol && wp.x <= maxX+tol && wp.y >= minY-tol && wp.y <= maxY+tol){
        return {idx:i, s:s};
      }
    } else if(s.type === 'circle'){
      const d = Math.hypot(wp.x-s.cx, wp.y-s.cy);
      if(Math.abs(d - s.r) < tol || d < s.r) return {idx:i, s:s};
    } else if(s.type === 'arc'){
      const d = Math.hypot(wp.x-s.cx, wp.y-s.cy);
      if(Math.abs(d - s.r) < tol) return {idx:i, s:s};
    } else if(s.type === 'fill' && s.vertices && s.vertices.length >= 3){
      // v8.51: 채움 객체 — 폴리곤 내부 클릭 시 hit
      if(_fillInPolygon(wp, s.vertices)) return {idx:i, s:s};
    }
  }
  return null;
}

function sk3OpenShapeEditor(hit){
  if(!hit || !hit.s) return;
  const s = hit.s;
  let info = '도형 #' + hit.idx + ' [' + s.type + ']\n';
  if(s.type === 'line'){
    const L = Math.hypot(s.x2-s.x1, s.y2-s.y1);
    info += '길이: ' + L.toFixed(2) + 'mm\n';
    info += '시작: (' + s.x1.toFixed(2) + ', ' + s.y1.toFixed(2) + ')\n';
    info += '끝:   (' + s.x2.toFixed(2) + ', ' + s.y2.toFixed(2) + ')';
  } else if(s.type === 'rect'){
    const W = Math.abs(s.x2-s.x1), H = Math.abs(s.y2-s.y1);
    info += 'W×H: ' + W.toFixed(2) + ' × ' + H.toFixed(2) + 'mm';
  } else if(s.type === 'circle'){
    info += '중심: (' + s.cx.toFixed(2) + ', ' + s.cy.toFixed(2) + ')\n';
    info += '직경 Ø' + (s.r*2).toFixed(2) + 'mm (R' + s.r.toFixed(2) + ')';
  } else if(s.type === 'arc'){
    info += '중심: (' + s.cx.toFixed(2) + ', ' + s.cy.toFixed(2) + ') R' + s.r.toFixed(2) + 'mm';
  }
  const action = prompt(info + '\n\n[1]색상 변경  [2]선두께 변경  [3]채움색 변경  [4]크기 변경  [5]삭제  취소=Cancel', '1');
  if(action === null) return;
  pushHistory();
  if(action === '1'){
    const c = prompt('선 색상 (#hex)', s.color || '#000000');
    if(c){ s.color = c; }
  } else if(action === '2'){
    const w = parseFloat(prompt('선 두께 (1-20)', String(s.lineWidth || 2)));
    if(isFinite(w) && w > 0){ s.lineWidth = w; }
  } else if(action === '3'){
    const c = prompt('채움 색상 (#hex, 빈값=제거)', s.fillColor || '#ffd54a');
    if(c === ''){ delete s.fillColor; } else if(c){ s.fillColor = c; }
  } else if(action === '4'){
    if(s.type === 'circle'){
      const d = parseFloat(prompt('직경 (mm)', String(s.r*2)));
      if(isFinite(d) && d > 0) s.r = d/2;
    } else if(s.type === 'rect'){
      const w = parseFloat(prompt('가로 W (mm)', String(Math.abs(s.x2-s.x1))));
      const h = parseFloat(prompt('세로 H (mm)', String(Math.abs(s.y2-s.y1))));
      if(isFinite(w) && isFinite(h) && w > 0 && h > 0){
        const cx = (s.x1+s.x2)/2, cy = (s.y1+s.y2)/2;
        s.x1 = cx - w/2; s.y1 = cy - h/2;
        s.x2 = cx + w/2; s.y2 = cy + h/2;
      }
    } else if(s.type === 'line'){
      const L = parseFloat(prompt('길이 (mm) — 시작점 고정, 끝점 비율 조정', String(Math.hypot(s.x2-s.x1, s.y2-s.y1))));
      if(isFinite(L) && L > 0){
        const dx = s.x2-s.x1, dy = s.y2-s.y1, ln = Math.hypot(dx,dy);
        if(ln > 1e-6){
          s.x2 = s.x1 + dx/ln*L;
          s.y2 = s.y1 + dy/ln*L;
        }
      }
    } else if(s.type === 'arc'){
      const r = parseFloat(prompt('반지름 (mm)', String(s.r)));
      if(isFinite(r) && r > 0) s.r = r;
    }
  } else if(action === '5'){
    if(confirm('정말 삭제하시겠습니까?')){
      state.shapes.splice(hit.idx, 1);
    }
  }
  redrawSketch(); updateInfo();
  skCmdLog('  ✏ 도형 #' + hit.idx + ' 편집됨', 'sys');
}


function drawGrid(){
  const w = skCanvas.width, h = skCanvas.height;
  const g = state.gridSize * state.pixelsPerMm;
  if(g < 4) return;
  const cx = w/2 + state.panX;
  const cy = h/2 + state.panY;
  // v9.9: 배경 이미지가 있고 밝으면 격자색을 어둡게 (가시성)
  let gMinor = '#e8e8e8', gMajor = '#c0c0c0';
  if(state.bgImage && state.bgImage.visible && state.bgImage.img){
    const gc = sk3FineGridColors(0, 0, w, h);
    if(gc.major.indexOf('20,20,20') >= 0){ gMinor = 'rgba(0,0,0,0.18)'; gMajor = 'rgba(0,0,0,0.35)'; }
  }

  skCtx.strokeStyle = gMinor;
  skCtx.lineWidth = 1;
  skCtx.beginPath();
  let startX = cx % g;
  if(startX > 0) startX -= g;
  for(let x = startX; x < w; x += g){
    skCtx.moveTo(x, 0);
    skCtx.lineTo(x, h);
  }
  let startY = cy % g;
  if(startY > 0) startY -= g;
  for(let y = startY; y < h; y += g){
    skCtx.moveTo(0, y);
    skCtx.lineTo(w, y);
  }
  skCtx.stroke();
  
  const g10 = g * 10;
  if(g10 < 100) return;
  skCtx.strokeStyle = gMajor;
  skCtx.beginPath();
  startX = cx % g10;
  if(startX > 0) startX -= g10;
  for(let x = startX; x < w; x += g10){
    skCtx.moveTo(x, 0);
    skCtx.lineTo(x, h);
  }
  startY = cy % g10;
  if(startY > 0) startY -= g10;
  for(let y = startY; y < h; y += g10){
    skCtx.moveTo(0, y);
    skCtx.lineTo(w, y);
  }
  skCtx.stroke();
}

function drawAxes(){
  // v8.34: 정밀 격자 (Ctrl 누름 + 점 선택 시)
  drawFineGrid();
  // v8.33: X축/Y축 선 제거 — 원점(0,0)에 작은 점만 표시
  const o = worldToScreen(0, 0);
  skCtx.save();
  // 십자 가이드 (살짝 보이게)
  skCtx.fillStyle = '#000';
  skCtx.beginPath();
  skCtx.arc(o.x, o.y, 3, 0, Math.PI*2);
  skCtx.fill();
  // 미세한 원점 라벨
  skCtx.fillStyle = '#888';
  skCtx.font = '10px Consolas';
  skCtx.fillText('(0,0)', o.x + 5, o.y - 5);
  skCtx.restore();
}

// v8.43: 배경 도면 이미지 그리기 — anchor 위치에 따라 (0,0)이 이미지 어디에 매핑되는지 결정
function drawBgImage(){
  const bg = state.bgImage;
  if(!bg || !bg.img || !bg.widthMm || !bg.heightMm) return;
  // 앵커 → 이미지 좌상단 월드 좌표(x0=좌측, y0=위쪽)
  // 월드 좌표는 +Y가 위쪽. 이미지 좌상단 y0 (위쪽), 우하단 y0-heightMm (아래쪽)
  let x0 = 0, y0 = 0;
  const w = bg.widthMm, h = bg.heightMm;
  switch(bg.anchor){
    case 'tl': x0 = 0;    y0 = 0;     break; // 좌상단이 원점
    case 'tr': x0 = -w;   y0 = 0;     break; // 우상단이 원점 (좌측 배치, 아래로)
    case 'bl': x0 = 0;    y0 = h;     break; // 좌하단이 원점
    case 'br': x0 = -w;   y0 = h;     break; // 우하단이 원점 (좌측 배치, 위로)
    case 'mr': x0 = -w;   y0 = h/2;   break; // 우중앙이 원점 (좌측 배치, Y 중앙) — 회전체 단면용
    case 'ml': x0 = 0;    y0 = h/2;   break; // 좌중앙이 원점 (우측 배치)
    case 'cc': x0 = -w/2; y0 = h/2;   break; // 이미지 중앙이 원점
    default:   x0 = -w;   y0 = h/2;          // 기본: 좌측 배치, Y 중앙
  }
  x0 += (bg.offsetX || 0);
  y0 += (bg.offsetY || 0);
  // 월드 → 스크린 좌표
  const tl = worldToScreen(x0, y0);
  const br = worldToScreen(x0 + w, y0 - h);
  const sx = tl.x, sy = tl.y;
  const sw = br.x - tl.x;
  const sh = br.y - tl.y;
  skCtx.save();
  skCtx.globalAlpha = (typeof bg.opacity === 'number') ? bg.opacity : 0.5;
  // 부드러운 다운스케일링
  skCtx.imageSmoothingEnabled = true;
  try { skCtx.drawImage(bg.img, sx, sy, sw, sh); } catch(e){}
  skCtx.globalAlpha = 1;
  skCtx.restore();
}

// v8.34: 정밀 격자 그리기 — anchor 기준 ±range mm 범위에 step 간격 격자
// v9.9: 격자 영역 배경 밝기 샘플링 → 밝으면 어두운 격자, 어두우면 기존 주황
function sk3FineGridColors(x0, y0, x1, y1){
  try {
    const sx = Math.max(0, Math.floor(x0)), sy = Math.max(0, Math.floor(y0));
    const sw = Math.min(skCanvas.width - sx, Math.ceil(x1 - x0));
    const sh = Math.min(skCanvas.height - sy, Math.ceil(y1 - y0));
    if(sw <= 0 || sh <= 0) return { major:'rgba(255,180,30,0.65)', mid:'rgba(255,180,30,0.35)', minor:'rgba(255,180,30,0.15)' };
    const d = skCtx.getImageData(sx, sy, sw, sh).data;
    let sum = 0, cnt = 0;
    const stepN = Math.max(1, Math.floor(d.length / 4 / 2000)); // 최대 ~2000 샘플
    for(let i = 0; i < d.length; i += 4 * stepN){
      sum += 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2]; cnt++;
    }
    const avg = cnt ? sum / cnt : 255;
    if(avg > 140){
      // 밝은 배경 → 어두운(검정 계열) 격자
      return { major:'rgba(20,20,20,0.7)', mid:'rgba(20,20,20,0.4)', minor:'rgba(20,20,20,0.18)' };
    }
    // 어두운 배경 → 기존 주황
    return { major:'rgba(255,180,30,0.65)', mid:'rgba(255,180,30,0.35)', minor:'rgba(255,180,30,0.15)' };
  } catch(e){
    return { major:'rgba(255,180,30,0.65)', mid:'rgba(255,180,30,0.35)', minor:'rgba(255,180,30,0.15)' };
  }
}

function drawFineGrid(){
  if(!state.fineGrid) return;
  const fg = state.fineGrid;
  const stepPx = fg.step * state.pixelsPerMm;
  // 화면에서 너무 작아 의미 없으면 자동으로 더 큰 간격으로 폴백 (0.5 → 1.0 → 5.0)
  let step = fg.step;
  let sp = stepPx;
  if(sp < 1.5){
    step = 0.5; sp = step * state.pixelsPerMm;
    if(sp < 1.5){ step = 1.0; sp = step * state.pixelsPerMm; }
    if(sp < 1.5){ step = 5.0; sp = step * state.pixelsPerMm; }
  }
  // 픽셀 범위 계산
  const cTL = worldToScreen(fg.anchor.x - fg.range, fg.anchor.y + fg.range);
  const cBR = worldToScreen(fg.anchor.x + fg.range, fg.anchor.y - fg.range);
  const x0 = Math.max(0, cTL.x), x1 = Math.min(skCanvas.width, cBR.x);
  const y0 = Math.max(0, cTL.y), y1 = Math.min(skCanvas.height, cBR.y);
  if(x1 <= x0 || y1 <= y0) return;
  // 영역 배경(살짝 어둡게)
  skCtx.save();
  skCtx.fillStyle = 'rgba(240, 200, 50, 0.04)';
  skCtx.fillRect(x0, y0, x1-x0, y1-y0);
  // v9.9: 격자 영역의 배경 밝기를 감지해 격자색 자동 전환 (밝으면 어두운 격자)
  const gc = sk3FineGridColors(x0, y0, x1, y1);
  // 격자선 — 매 N번째마다 진하게
  const aS = worldToScreen(fg.anchor.x, fg.anchor.y);
  skCtx.lineWidth = 0.5;
  const N = Math.round(fg.range * 2 / step);  // 격자 줄 수
  for(let i = -N/2; i <= N/2; i++){
    const xPx = aS.x + i * sp;
    if(xPx < x0 - 1 || xPx > x1 + 1) continue;
    // 매 10번째(=1mm)는 강조, 매 5번째(=0.5mm)는 중간, 나머지는 흐리게
    const major = (i % 10 === 0);
    const mid = (!major && i % 5 === 0);
    skCtx.strokeStyle = major ? gc.major : mid ? gc.mid : gc.minor;
    skCtx.beginPath();
    skCtx.moveTo(xPx, y0); skCtx.lineTo(xPx, y1);
    skCtx.stroke();
  }
  for(let i = -N/2; i <= N/2; i++){
    const yPx = aS.y - i * sp;  // Y는 화면 좌표 반전
    if(yPx < y0 - 1 || yPx > y1 + 1) continue;
    const major = (i % 10 === 0);
    const mid = (!major && i % 5 === 0);
    skCtx.strokeStyle = major ? gc.major : mid ? gc.mid : gc.minor;
    skCtx.beginPath();
    skCtx.moveTo(x0, yPx); skCtx.lineTo(x1, yPx);
    skCtx.stroke();
  }
  // anchor 표시 (빨강 십자)
  skCtx.strokeStyle = '#e74c3c';
  skCtx.lineWidth = 1.5;
  skCtx.beginPath();
  skCtx.moveTo(aS.x - 6, aS.y); skCtx.lineTo(aS.x + 6, aS.y);
  skCtx.moveTo(aS.x, aS.y - 6); skCtx.lineTo(aS.x, aS.y + 6);
  skCtx.stroke();
  // 우상단 안내
  skCtx.fillStyle = 'rgba(255,180,30,0.9)';
  skCtx.font = 'bold 11px Consolas';
  skCtx.fillText('⊞ 정밀격자 ' + step + 'mm · ±' + fg.range + 'mm · 스냅 ON',
    Math.min(x0 + 6, skCanvas.width - 200), y0 + 14);
  skCtx.restore();
}

function drawShape(s, selected){
  // v8.45: 채움 객체는 폴리곤 면 + 선택적 외곽선
  if(s.type === 'fill'){
    if(!s.vertices || s.vertices.length < 3) return;
    skCtx.save();
    skCtx.fillStyle = s.color || '#ffe599';
    skCtx.beginPath();
    s.vertices.forEach((v, i) => {
      const sp = worldToScreen(v.x, v.y);
      if(i === 0) skCtx.moveTo(sp.x, sp.y);
      else skCtx.lineTo(sp.x, sp.y);
    });
    skCtx.closePath();
    skCtx.fill();
    // 외곽선 옵션
    if(s.stroke && (s.strokeWidth || 0) > 0){
      skCtx.strokeStyle = s.stroke;
      skCtx.lineWidth = s.strokeWidth;
      skCtx.stroke();
    }
    // 선택 시 dashed 강조 + 꼭짓점 핸들
    if(selected){
      skCtx.setLineDash([6, 4]);
      skCtx.strokeStyle = '#ff0000';
      skCtx.lineWidth = 1.5;
      skCtx.stroke();
      skCtx.setLineDash([]);
      s.vertices.forEach(v => {
        const sp = worldToScreen(v.x, v.y);
        drawHandle(sp.x, sp.y);
      });
    }
    skCtx.restore();
    return;
  }
  skCtx.strokeStyle = selected ? '#ff0000' : (s.color || '#000');
  skCtx.lineWidth = (s.lineWidth || 2);
  skCtx.fillStyle = s.fillColor || 'rgba(100,150,200,0.1)';
  
  if(s.type === 'line'){
    const p1 = worldToScreen(s.x1, s.y1);
    const p2 = worldToScreen(s.x2, s.y2);
    skCtx.beginPath();
    skCtx.moveTo(p1.x, p1.y);
    skCtx.lineTo(p2.x, p2.y);
    skCtx.stroke();
    if(selected){drawHandle(p1.x, p1.y); drawHandle(p2.x, p2.y)}
  } else if(s.type === 'rect'){
    const p1 = worldToScreen(s.x1, s.y1);
    const p2 = worldToScreen(s.x2, s.y2);
    skCtx.beginPath();
    skCtx.rect(Math.min(p1.x,p2.x), Math.min(p1.y,p2.y), Math.abs(p2.x-p1.x), Math.abs(p2.y-p1.y));
    skCtx.fill();
    skCtx.stroke();
    if(selected){drawHandle(p1.x, p1.y); drawHandle(p2.x, p2.y); drawHandle(p1.x, p2.y); drawHandle(p2.x, p1.y)}
  } else if(s.type === 'circle'){
    const c = worldToScreen(s.cx, s.cy);
    const r = s.r * state.pixelsPerMm;
    skCtx.beginPath();
    skCtx.arc(c.x, c.y, r, 0, Math.PI*2);
    skCtx.fill();
    skCtx.stroke();
    if(selected){drawHandle(c.x, c.y); drawHandle(c.x + r, c.y)}
  } else if(s.type === 'arc'){
    const c = worldToScreen(s.cx, s.cy);
    const r = s.r * state.pixelsPerMm;
    skCtx.beginPath();
    skCtx.arc(c.x, c.y, r, -s.endAngle, -s.startAngle);
    skCtx.stroke();
    if(selected) drawHandle(c.x, c.y);
  }
}

function drawHandle(x, y){
  skCtx.fillStyle = '#ff0000';
  skCtx.fillRect(x-3, y-3, 6, 6);
}

function drawPreview(){
  const d = state.drawing;
  if(!d || !d.current){
    // v8.12: 펜 도구 실시간 미리보기 — 마우스가 다음 점을 가리킬 때 선 미리보기 (연속선 ON 시)
    if(state.tool === 'pen' && state.continuousMode && state.penCur >= 0 && state.penPoints[state.penCur] && state._penPreviewWp){
      const cur = state.penPoints[state.penCur];
      const np = state._penPreviewWp;
      const p1 = worldToScreen(cur.x, cur.y);
      const p2 = worldToScreen(np.x, np.y);
      skCtx.save();
      skCtx.strokeStyle = '#3498db';
      skCtx.lineWidth = 1;
      skCtx.setLineDash([4, 4]);
      skCtx.beginPath();
      skCtx.moveTo(p1.x, p1.y);
      skCtx.lineTo(p2.x, p2.y);
      skCtx.stroke();
      skCtx.setLineDash([]);
      const len = Math.hypot(np.x-cur.x, np.y-cur.y);
      const deg = Math.atan2(np.y-cur.y, np.x-cur.x) * 180 / Math.PI;
      const mx = (p1.x+p2.x)/2, my = (p1.y+p2.y)/2;
      skCtx.fillStyle = 'rgba(52,152,219,0.9)';
      skCtx.fillRect(mx-55, my-22, 110, 18);
      skCtx.fillStyle = '#fff';
      skCtx.font = '11px monospace';
      skCtx.textAlign = 'center';
      skCtx.textBaseline = 'middle';
      skCtx.fillText(len.toFixed(2)+'mm · '+deg.toFixed(1)+'°', mx, my-13);
      skCtx.restore();
    }
    return;
  }
  skCtx.strokeStyle = '#0066cc';
  skCtx.lineWidth = 1;
  skCtx.setLineDash([4, 4]);
  
  if(d.type === 'line'){
    const p1 = worldToScreen(d.start.x, d.start.y);
    const p2 = worldToScreen(d.current.x, d.current.y);
    skCtx.beginPath();
    skCtx.moveTo(p1.x, p1.y);
    skCtx.lineTo(p2.x, p2.y);
    skCtx.stroke();
  } else if(d.type === 'rect'){
    const p1 = worldToScreen(d.start.x, d.start.y);
    const p2 = worldToScreen(d.current.x, d.current.y);
    skCtx.beginPath();
    skCtx.rect(Math.min(p1.x,p2.x), Math.min(p1.y,p2.y), Math.abs(p2.x-p1.x), Math.abs(p2.y-p1.y));
    skCtx.stroke();
  } else if(d.type === 'circle'){
    const c = worldToScreen(d.start.x, d.start.y);
    const dx = d.current.x - d.start.x;
    const dy = d.current.y - d.start.y;
    const r = Math.sqrt(dx*dx + dy*dy) * state.pixelsPerMm;
    skCtx.beginPath();
    skCtx.arc(c.x, c.y, r, 0, Math.PI*2);
    skCtx.stroke();
  } else if(d.type === 'arc'){
    if(d.step === 1){
      const c = worldToScreen(d.start.x, d.start.y);
      const p = worldToScreen(d.current.x, d.current.y);
      skCtx.beginPath();
      skCtx.moveTo(c.x, c.y);
      skCtx.lineTo(p.x, p.y);
      skCtx.stroke();
    } else if(d.step === 2){
      const c = worldToScreen(d.center.x, d.center.y);
      const r = d.r * state.pixelsPerMm;
      const endA = Math.atan2(d.current.y - d.center.y, d.current.x - d.center.x);
      skCtx.beginPath();
      skCtx.arc(c.x, c.y, r, -endA, -d.startAngle, true);
      skCtx.stroke();
    }
  } else if(d.type === 'fillet'){
    const p1 = worldToScreen(d.start.x, d.start.y);
    const p2 = worldToScreen(d.current.x, d.current.y);
    skCtx.strokeStyle = '#ffaa00';
    skCtx.lineWidth = 1;
    skCtx.beginPath();
    skCtx.rect(Math.min(p1.x,p2.x), Math.min(p1.y,p2.y), Math.abs(p2.x-p1.x), Math.abs(p2.y-p1.y));
    skCtx.stroke();
  } else if(d.type === 'wipe'){
    const p1 = worldToScreen(d.start.x, d.start.y);
    const p2 = worldToScreen(d.current.x, d.current.y);
    const x = Math.min(p1.x,p2.x), y = Math.min(p1.y,p2.y);
    const w = Math.abs(p2.x-p1.x), h = Math.abs(p2.y-p1.y);
    skCtx.strokeStyle = '#ff5050';
    skCtx.fillStyle = 'rgba(255,80,80,0.18)';
    skCtx.lineWidth = 1.5;
    skCtx.setLineDash([6, 4]);
    skCtx.fillRect(x, y, w, h);
    skCtx.strokeRect(x, y, w, h);
  }
  skCtx.setLineDash([]);
}

let isPanning = false;
let panStart = null;

skCanvas.addEventListener('mousedown', (e)=>{
  if(state.mode !== 'sketch') return;
  const rect = skCanvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  let wp = screenToWorld(sx, sy);
  wp = snapPoint(wp);

  // v8.44: 스윕 연결 모드 ON + 좌클릭 → sweep 시작
  if(state.sweepConnectModeOn && e.button === 0){
    e.preventDefault();
    sk3SweepStart(wp);
    return;
  }

  // v8.45: 채움 모드 ON + 좌클릭 → 자동 boundary trace 후 채움
  if(state.fillModeOn && e.button === 0){
    e.preventDefault();
    // v8.51: 기존 채움 객체 위 클릭이면 채움 모드 OFF + 그 객체 선택 (이동/삭제 가능하도록)
    for(let i = state.shapes.length - 1; i >= 0; i--){
      const s = state.shapes[i];
      if(s.type === 'fill' && s.vertices && _fillInPolygon(wp, s.vertices)){
        sk3ToggleFillMode();  // 모드 OFF
        // 그 객체 단일 선택
        state.selectedShapes.clear();
        state.selectedShapes.add(i);
        redrawSketch(); updateInfo();
        if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
        toast('🎨 채움 모드 OFF · 채움 객체 선택 (드래그=이동, Del=삭제)');
        return;
      }
    }
    sk3FillAtClick(wp);
    return;
  }

  // v8.37: 각선 모드 진행 중이면 좌클릭으로 확정
  if(state.angleLineMode && e.button === 0){
    e.preventDefault();
    // 마우스의 각도-투영 위치에 새 점 추가
    const proj = sk3AngleProject(wp);
    if(proj) sk3CommitAngleLine({x: proj.x, y: proj.y});
    else sk3CancelAngleLine();
    return;
  }
  
  // v8.14: 휠 클릭(중간) — 점 위면 자동 연결, 빈 곳이면 패닝
  if(e.button === 1){
    e.preventDefault();
    const hp = sk3FindNearestPenPoint(wp);
    if(hp >= 0){
      if(!state.wheelConnectMode){
        state.wheelConnectMode = true;
        state.wheelConnectFirst = -1;
      }
      sk3HandleWheelConnectClick(wp);
      return;
    }
    // 빈 곳 휠클릭 = 패닝
    isPanning = true;
    panStart = {x: sx, y: sy, panX: state.panX, panY: state.panY};
    skCanvas.style.cursor = 'grabbing';
    return;
  }
  // v8.5: 우클릭 드래그 = 박스 선택
  if(e.button === 2){
    e.preventDefault();
    state.boxSelect = {sx, sy, ex:sx, ey:sy, wpStart:wp, wpEnd:wp, addToSel:e.shiftKey};
    skCanvas.style.cursor = 'crosshair';
    return;
  }
  // v8.12: 좌클릭 + 점 위 = 드래그 준비 (도구 무관) — mouseup에서 이동량으로 클릭/드래그 분기
  if(e.button === 0){
    const hp = sk3FindNearestPenPoint(wp);
    if(hp >= 0){
      // v8.15: 명령창 활성 상태면 점번호를 명령창에 삽입 (드래그/선택 대신)
      if(typeof _cmdInputActive !== 'undefined' && _cmdInputActive){
        e.preventDefault();
        if(typeof window.sk3InsertPointToCmd === 'function'){
          window.sk3InsertPointToCmd(hp);
        }
        return;
      }
      // v8.35: Shift 누른 상태로 점 드래그 = 복사 모드 (Excel 스타일)
      // 원본 점은 그대로 두고 복제본을 만들어 그 복제본을 드래그
      let dragIdx = hp;
      let copyMode = false;
      if(e.shiftKey){
        const src = state.penPoints[hp];
        state.penPoints.push({x: src.x, y: src.y});
        dragIdx = state.penPoints.length - 1;
        copyMode = true;
      }
      state.dragPoint = {
        idx: dragIdx,
        origX: state.penPoints[dragIdx].x,
        origY: state.penPoints[dragIdx].y,
        startSx: sx, startSy: sy,
        moved: false,
        prevTool: state.tool,
        copyMode: copyMode,
        sourceIdx: copyMode ? hp : -1
      };
      state.penCur = dragIdx;
      skCanvas.style.cursor = copyMode ? 'copy' : 'move';
      if(copyMode && typeof skCmdLog === 'function') skCmdLog('  📋 Shift+드래그 복사: P' + hp + ' → P' + dragIdx + ' (복제)', 'sys');
      redrawSketch();
      return;
    }

    // v8.16: 도형 드래그 시작 시, 일치하는 펜점도 함께 이동 대상으로 저장
    const cmdActive = (typeof _cmdInputActive !== 'undefined' && _cmdInputActive);
    if(!cmdActive && state.tool === 'select'){
      const hitS = sk3FindShapeAt(wp);
      if(hitS){
        // 클릭한 도형이 선택돼 있지 않으면 단독 선택 (Shift=추가선택)
        if(!state.selectedShapes.has(hitS.idx)){
          if(!e.shiftKey) state.selectedShapes.clear();
          state.selectedShapes.add(hitS.idx);
        }
        const idxs = [...state.selectedShapes];
        const origs = idxs.map(i => JSON.parse(JSON.stringify(state.shapes[i])));
        // 선택된 도형의 끝점/중심점에 일치하는 펜점 인덱스 모음 (좌표 백업 포함)
        const tol = 0.01;
        const pinSet = new Set();
        idxs.forEach(i => {
          const s = state.shapes[i];
          const ends = [];
          if(s.type === 'line' || s.type === 'rect'){
            ends.push([s.x1, s.y1], [s.x2, s.y2]);
          } else if(s.type === 'circle' || s.type === 'arc'){
            ends.push([s.cx, s.cy]);
          }
          ends.forEach(([ex, ey]) => {
            state.penPoints.forEach((p, pi) => {
              if(Math.abs(p.x - ex) < tol && Math.abs(p.y - ey) < tol) pinSet.add(pi);
            });
          });
        });
        const pinIdxs = [...pinSet];
        const pinOrigs = pinIdxs.map(pi => ({x: state.penPoints[pi].x, y: state.penPoints[pi].y}));
        state.dragShape = {
          idxs: idxs,
          origs: origs,
          pinIdxs: pinIdxs,
          pinOrigs: pinOrigs,
          startWp: {x: wp.x, y: wp.y},
          moved: false
        };
        skCanvas.style.cursor = 'move';
        if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
        redrawSketch();
        return;
      }
    }
  }
  
  if(state.tool === 'fillet'){
    state.drawing = {type:'fillet', start: wp, current: wp};
    redrawSketch();
    return;
  }

  if(state.tool === 'wipe'){
    state.drawing = {type:'wipe', start: wp, current: wp};
    redrawSketch();
    return;
  }

  if(state.tool === 'pen'){
    // v8.9: 2D 텍스트모드 패턴 이식
    //   1) 기존 점 위 클릭 → 그 점 재사용 (penCur로 설정만)
    //   2) 연속선 OFF면 점만 / ON이면 이전 점과 자동 선
    //   3) Shift = 8방향 직교 스냅
    let tx = wp.x, ty = wp.y;
    if(e.shiftKey && state.penCur >= 0 && state.penPoints[state.penCur]){
      const cur = state.penPoints[state.penCur];
      const dx = wp.x - cur.x, dy = wp.y - cur.y;
      const ang = Math.atan2(dy, dx);
      const snapAng = Math.round(ang / (Math.PI/4)) * (Math.PI/4);
      const ln = Math.hypot(dx, dy);
      tx = cur.x + ln*Math.cos(snapAng);
      ty = cur.y + ln*Math.sin(snapAng);
    }
    // 클릭 위치 근처의 기존 점 찾기 (재사용)
    const nearIdx = sk3FindNearestPenPoint({x:tx, y:ty});
    if(nearIdx >= 0){
      // 기존 점 위 클릭 → 그 점 재사용
      const reuse = state.penPoints[nearIdx];
      // 연속선 ON + 이전 점 있으면 선 추가
      if(state.continuousMode && state.penCur >= 0 && state.penCur !== nearIdx && state.penPoints[state.penCur]){
        const cur = state.penPoints[state.penCur];
        pushHistory();
        sk3AddLineDedup({type:'line', x1:cur.x, y1:cur.y, x2:reuse.x, y2:reuse.y,
          color: document.getElementById('sketchColor').value || '#000000',
          lineWidth: parseInt(document.getElementById('lineWidth').value)||2});
      }
      state.penCur = nearIdx;
      redrawSketch(); updateInfo();
      setStat('▸ P' + nearIdx + ' 재사용 (' + reuse.x.toFixed(2) + ', ' + reuse.y.toFixed(2) + ')mm · ' + (state.continuousMode?'⛓연속선 ON':'⛓연속선 OFF · 점만'));
      return;
    }
    // 새 점 추가
    pushHistory();
    // 연속선 ON + 이전 점 있으면 선 자동 추가 (dedup)
    if(state.continuousMode && state.penCur >= 0 && state.penPoints[state.penCur]){
      const cur = state.penPoints[state.penCur];
      sk3AddLineDedup({type:'line', x1:cur.x, y1:cur.y, x2:tx, y2:ty,
        color: document.getElementById('sketchColor').value || '#000000',
        lineWidth: parseInt(document.getElementById('lineWidth').value)||2});
    }
    state.penPoints.push({x:tx, y:ty});
    state.penCur = state.penPoints.length - 1;
    redrawSketch(); updateInfo();
    setStat('● P' + state.penCur + ' 추가 (' + tx.toFixed(2) + ', ' + ty.toFixed(2) + ')mm · ' + (state.continuousMode?'⛓연속선 ON':'⛓연속선 OFF · 점만') + ' · Esc=종료');
    return;
  }

  if(state.tool === 'select'){
    // v8.4: select 도구로 빈 곳 좌클릭 시 안내 메시지 (점 찍기는 펜 도구로)
    const hitShape = sk3FindShapeAt(wp);
    const hitPoint = sk3FindNearestPenPoint(wp);
    // v8.11: 점 위 좌클릭 = 드래그 이동 시작
    if(hitPoint >= 0){
      state.dragPoint = {
        idx: hitPoint,
        origX: state.penPoints[hitPoint].x,
        origY: state.penPoints[hitPoint].y,
        startWp: {x: wp.x, y: wp.y}
      };
      state.penCur = hitPoint;
      skCanvas.style.cursor = 'move';
      redrawSketch();
      setStat('🤚 P' + hitPoint + ' 드래그 중 — 놓으면 이동 확정 (Esc=취소)');
      return;
    }
    if(!hitShape){
      setStat('💡 점을 찍으려면 좌측 ✎ 펜 버튼(P키) 또는 📍 점좌표 버튼을 누르세요');
    }
    selectShapeAt(wp, e.shiftKey);
    return;
  }
  
  if(state.tool === 'line'){
    if(!state.drawing){
      state.drawing = {type:'line', start: wp, current: wp};
    } else {
      pushHistory();
      state.shapes.push({
        type:'line', x1: state.drawing.start.x, y1: state.drawing.start.y,
        x2: wp.x, y2: wp.y,
        color: document.getElementById('sketchColor').value,
        lineWidth: parseInt(document.getElementById('lineWidth').value)
      });
      state.drawing = {type:'line', start: wp, current: wp};
      updateInfo();
    }
  } else if(state.tool === 'rect'){
    if(!state.drawing){
      state.drawing = {type:'rect', start: wp, current: wp};
    } else {
      pushHistory();
      state.shapes.push({
        type:'rect', x1: state.drawing.start.x, y1: state.drawing.start.y,
        x2: wp.x, y2: wp.y,
        color: document.getElementById('sketchColor').value,
        lineWidth: parseInt(document.getElementById('lineWidth').value)
      });
      state.drawing = null;
      updateInfo();
    }
  } else if(state.tool === 'circle'){
    if(!state.drawing){
      state.drawing = {type:'circle', start: wp, current: wp};
    } else {
      const dx = wp.x - state.drawing.start.x;
      const dy = wp.y - state.drawing.start.y;
      const r = Math.sqrt(dx*dx + dy*dy);
      if(r > 0.01){
        pushHistory();
        state.shapes.push({
          type:'circle', cx: state.drawing.start.x, cy: state.drawing.start.y, r,
          color: document.getElementById('sketchColor').value,
          lineWidth: parseInt(document.getElementById('lineWidth').value)
        });
      }
      state.drawing = null;
      updateInfo();
    }
  } else if(state.tool === 'arc'){
    if(!state.drawing){
      state.drawing = {type:'arc', step: 1, start: wp, current: wp};
    } else if(state.drawing.step === 1){
      const dx = wp.x - state.drawing.start.x;
      const dy = wp.y - state.drawing.start.y;
      const r = Math.sqrt(dx*dx + dy*dy);
      const startAngle = Math.atan2(dy, dx);
      state.drawing = {type:'arc', step: 2, center: state.drawing.start, r, startAngle, start: wp, current: wp};
    } else if(state.drawing.step === 2){
      const endAngle = Math.atan2(wp.y - state.drawing.center.y, wp.x - state.drawing.center.x);
      pushHistory();
      state.shapes.push({
        type:'arc',
        cx: state.drawing.center.x, cy: state.drawing.center.y,
        r: state.drawing.r,
        startAngle: state.drawing.startAngle, endAngle,
        color: document.getElementById('sketchColor').value,
        lineWidth: parseInt(document.getElementById('lineWidth').value)
      });
      state.drawing = null;
      updateInfo();
    }
  }
  redrawSketch();
});

skCanvas.addEventListener('mousemove', (e)=>{
  const rect = skCanvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  
  if(isPanning && panStart){
    state.panX = panStart.panX + (sx - panStart.x);
    state.panY = panStart.panY + (sy - panStart.y);
    redrawSketch();
    return;
  }
  // v8.44: 스윕 연결 진행 중 또는 대기 상태
  if(state.sweepConnectModeOn){
    let wpSw = screenToWorld(sx, sy);
    // 스윕 중에는 OSNAP 적용하지 않음 (원이 점에 끌리면 안 됨 — 자유 이동)
    if(state.sweepConnect){
      sk3SweepMove(wpSw);
    } else {
      state._sweepHoverWp = wpSw;
      redrawSketch();
    }
    return;
  }
  // v8.37: 각선 모드 — 마우스 따라 미리보기 업데이트
  if(state.angleLineMode){
    let wp = screenToWorld(sx, sy);
    wp = snapPoint(wp);
    const proj = sk3AngleProject(wp);
    if(proj){
      state.angleLineMode.previewWp = {x: proj.x, y: proj.y, length: proj.length};
      redrawSketch();
      const lenAbs = Math.abs(proj.length);
      document.getElementById('footCoord').textContent =
        `📐 각선: ${state.angleLineMode.angleDeg}° · 길이 ${lenAbs.toFixed(2)}mm · 끝점 (${dispX(proj.x).toFixed(2)}, ${proj.y.toFixed(2)}) — 클릭 확정 · ESC 취소`;
    }
    return;
  }
  // v8.11~v8.12: 점 드래그 진행 — 일정 거리 이동했을 때만 실제로 점 이동
  if(state.dragPoint){
    const dp = state.dragPoint;
    const dist = Math.hypot(sx - dp.startSx, sy - dp.startSy);
    if(!dp.moved && dist < 3){
      // 아직 의미있는 이동이 아님 — 무시 (실수 클릭 허용)
      return;
    }
    dp.moved = true;
    let wp = screenToWorld(sx, sy);
    wp = snapPoint(wp);  // OSNAP 적용
    const p = state.penPoints[dp.idx];
    const oldX = p.x, oldY = p.y;
    p.x = wp.x; p.y = wp.y;
    // v8.35: 복사 모드면 연결된 선은 따라오지 않음 (점만 복제)
    if(!dp.copyMode){
      const tol = 0.01;
      state.shapes.forEach(s => {
        if(s.type !== 'line') return;
        if(Math.abs(s.x1-oldX)<tol && Math.abs(s.y1-oldY)<tol){ s.x1=wp.x; s.y1=wp.y; }
        if(Math.abs(s.x2-oldX)<tol && Math.abs(s.y2-oldY)<tol){ s.x2=wp.x; s.y2=wp.y; }
      });
    }
    state._penPreviewWp = wp;  // 마커 표시용
    redrawSketch();
    // v8.25: X기준점 적용 — 표시는 dispX()로 변환
    const modeTag = dp.copyMode ? ' · 📋복사' : ' · 🤚드래그';
    document.getElementById('footCoord').textContent = `X: ${dispX(wp.x).toFixed(2)}  Y: ${wp.y.toFixed(2)}` + (state.xOrigin?' (X기준'+(state.xOrigin>=0?'+':'')+state.xOrigin+')':'') + (state._lastSnapKind?' ['+state._lastSnapKind+']':'') + modeTag;
    return;
  }
  // v8.16: 도형 드래그 이동 진행 중
  if(state.dragShape){
    const ds = state.dragShape;
    const wpRaw = screenToWorld(sx, sy);
    // 그리드 스냅이 켜져 있으면 이동량을 그리드 단위로 양자화
    let dx = wpRaw.x - ds.startWp.x;
    let dy = wpRaw.y - ds.startWp.y;
    if(state.gridSnap){
      const g = state.gridSize;
      dx = Math.round(dx / g) * g;
      dy = Math.round(dy / g) * g;
    }
    ds.idxs.forEach((idx, k) => {
      const orig = ds.origs[k];
      const cur = state.shapes[idx];
      if(!cur || !orig) return;
      if(orig.type === 'line' || orig.type === 'rect'){
        cur.x1 = orig.x1 + dx; cur.y1 = orig.y1 + dy;
        cur.x2 = orig.x2 + dx; cur.y2 = orig.y2 + dy;
      } else if(orig.type === 'circle' || orig.type === 'arc'){
        cur.cx = orig.cx + dx; cur.cy = orig.cy + dy;
      } else if(orig.type === 'fill' && Array.isArray(orig.vertices)){
        // v8.51: 채움 객체 — 모든 정점을 평행 이동
        cur.vertices = orig.vertices.map(v => ({x: v.x + dx, y: v.y + dy}));
      }
    });

    // v8.24: 라이브 접선 스냅 — 단일 원/호 드래그 시 가까운 선에 자동 접선
    let tangentInfo = '';
    if(state.tangentSnap && ds.idxs.length === 1){
      const idx = ds.idxs[0];
      const cur = state.shapes[idx];
      if(cur && (cur.type === 'circle' || cur.type === 'arc')){
        // 임계값: 화면 픽셀로 약 15px → mm 환산
        const thresholdMm = 15 / state.pixelsPerMm;
        const snap = sk3FindTangentSnap({x: cur.cx, y: cur.cy}, cur.r, [idx], thresholdMm);
        if(snap){
          // 보정된 center 로 이동, dx/dy도 갱신해서 펜점 이동 일관
          const oldCx = cur.cx, oldCy = cur.cy;
          cur.cx = snap.center.x;
          cur.cy = snap.center.y;
          dx += (snap.center.x - oldCx);
          dy += (snap.center.y - oldCy);
          tangentInfo = ' · 🪐접선[선#' + snap.lineIdx + ']';
        }
      }
    }

    // 일치하는 펜점도 함께 이동 (연결 유지)
    if(ds.pinIdxs && ds.pinIdxs.length){
      ds.pinIdxs.forEach((pi, k) => {
        const o = ds.pinOrigs[k];
        const p = state.penPoints[pi];
        if(p && o){ p.x = o.x + dx; p.y = o.y + dy; }
      });
    }
    ds.moved = Math.hypot(dx, dy) > 0.05;
    redrawSketch();
    document.getElementById('footCoord').textContent = `Δx: ${dx.toFixed(2)}  Δy: ${dy.toFixed(2)}mm · 🤚도형 ${ds.idxs.length}개 이동` + (ds.pinIdxs && ds.pinIdxs.length ? ` (+점 ${ds.pinIdxs.length})` : '') + tangentInfo;
    return;
  }
  // v8.5: 박스 선택 진행 중 — 박스 갱신 + 미리보기 그리기
  if(state.boxSelect){
    state.boxSelect.ex = sx;
    state.boxSelect.ey = sy;
    state.boxSelect.wpEnd = snapPoint(screenToWorld(sx, sy));
    redrawSketch();
    return;
  }
  
  if(state.mode !== 'sketch') return;
  let wp = screenToWorld(sx, sy);
  wp = snapPoint(wp);
  // v8.25: X기준점 적용
  document.getElementById('footCoord').textContent = `X: ${dispX(wp.x).toFixed(2)}  Y: ${wp.y.toFixed(2)}` + (state.xOrigin?' (X기준'+(state.xOrigin>=0?'+':'')+state.xOrigin+')':'') + (state._lastSnapKind?' ['+state._lastSnapKind+']':'');
  if(state.drawing){
    state.drawing.current = wp;
    redrawSketch();
  } else if(state.tool === 'pen' && state.continuousMode && state.penCur >= 0){
    // v8.12: 펜 도구 + 연속선 ON 시 실시간 미리보기
    state._penPreviewWp = wp;
    redrawSketch();
  } else if(state._penPreviewWp){
    state._penPreviewWp = null;
    redrawSketch();
  }
});

skCanvas.addEventListener('mouseup', (e)=>{
  if(isPanning){isPanning = false; panStart = null; skCanvas.style.cursor = ''; return;}
  // v8.44: 스윕 연결 드래그 종료
  if(state.sweepConnect){
    sk3SweepEnd();
    return;
  }
  // v8.11~v8.12: 점 드래그 마침
  if(state.dragPoint){
    const dp = state.dragPoint;
    const p = state.penPoints[dp.idx];
    if(dp.moved && (Math.abs(p.x - dp.origX) > 0.01 || Math.abs(p.y - dp.origY) > 0.01)){
      // v8.35: 복사 모드면 단순히 히스토리만 — 원본 펜점은 이미 따로 있음
      if(dp.copyMode){
        // 복제본을 제거한 상태로 되돌리고 history push, 그 후 다시 추가
        const finalX = p.x, finalY = p.y;
        state.penPoints.splice(dp.idx, 1);
        pushHistory();
        state.penPoints.push({x: finalX, y: finalY});
        state.penCur = state.penPoints.length - 1;
        setStat('✓ P' + dp.sourceIdx + ' → P' + state.penCur + ' 복사 (' + finalX.toFixed(2) + ', ' + finalY.toFixed(2) + ')mm');
      } else {
        // 진짜 드래그 → 히스토리 기록
        const finalX = p.x, finalY = p.y;
        const tol = 0.01;
        // 원위치 복원
        state.shapes.forEach(s => {
          if(s.type !== 'line') return;
          if(Math.abs(s.x1-finalX)<tol && Math.abs(s.y1-finalY)<tol){ s.x1=dp.origX; s.y1=dp.origY; }
          if(Math.abs(s.x2-finalX)<tol && Math.abs(s.y2-finalY)<tol){ s.x2=dp.origX; s.y2=dp.origY; }
        });
        p.x = dp.origX; p.y = dp.origY;
        pushHistory();
        // 다시 최종 위치로
        state.shapes.forEach(s => {
          if(s.type !== 'line') return;
          if(Math.abs(s.x1-dp.origX)<tol && Math.abs(s.y1-dp.origY)<tol){ s.x1=finalX; s.y1=finalY; }
          if(Math.abs(s.x2-dp.origX)<tol && Math.abs(s.y2-dp.origY)<tol){ s.x2=finalX; s.y2=finalY; }
        });
        p.x = finalX; p.y = finalY;
        setStat('✓ P' + dp.idx + ' 이동 (' + finalX.toFixed(2) + ', ' + finalY.toFixed(2) + ')mm');
      }
    } else {
      // 안 움직임
      if(dp.copyMode){
        // 복제했는데 안 움직였으면 복제본 제거 (사용자가 마음 바꿈)
        state.penPoints.splice(dp.idx, 1);
        state.penCur = dp.sourceIdx;
        setStat('▸ 복사 취소 (이동 안 함)');
      } else {
        setStat('▸ P' + dp.idx + ' 선택 (penCur로 설정)');
      }
    }
    state.dragPoint = null;
    state._penPreviewWp = null;
    state._lastSnapKind = null;
    skCanvas.style.cursor = '';
    redrawSketch(); updateInfo();
    return;
  }
  // v8.16: 도형 드래그 이동 마침
  if(state.dragShape){
    const ds = state.dragShape;
    if(ds.moved){
      // 히스토리: 원래 상태 잠시 복원 → push → 다시 최종 상태 복귀 (도형+펜점)
      const finalShapes = ds.idxs.map(idx => JSON.parse(JSON.stringify(state.shapes[idx])));
      const finalPins = (ds.pinIdxs||[]).map(pi => ({x: state.penPoints[pi].x, y: state.penPoints[pi].y}));
      // 원위치로 복원
      ds.idxs.forEach((idx, k) => {
        state.shapes[idx] = JSON.parse(JSON.stringify(ds.origs[k]));
      });
      (ds.pinIdxs||[]).forEach((pi, k) => {
        state.penPoints[pi].x = ds.pinOrigs[k].x;
        state.penPoints[pi].y = ds.pinOrigs[k].y;
      });
      pushHistory();
      // 최종 상태로 다시
      ds.idxs.forEach((idx, k) => {
        state.shapes[idx] = finalShapes[k];
      });
      (ds.pinIdxs||[]).forEach((pi, k) => {
        state.penPoints[pi].x = finalPins[k].x;
        state.penPoints[pi].y = finalPins[k].y;
      });
      const pinMsg = (ds.pinIdxs && ds.pinIdxs.length) ? ' (+점 ' + ds.pinIdxs.length + ')' : '';
      setStat('✓ 도형 ' + ds.idxs.length + '개 이동 완료' + pinMsg);
    } else {
      setStat('▸ 도형 ' + ds.idxs.length + '개 선택');
    }
    state.dragShape = null;
    skCanvas.style.cursor = '';
    redrawSketch(); updateInfo();
    return;
  }
  // v8.5: 우클릭 드래그 마침 → 박스 안 도형들 선택
  if(state.boxSelect && e.button === 2){
    sk3FinishBoxSelect(state.boxSelect);
    state.boxSelect = null;
    skCanvas.style.cursor = '';
    redrawSketch(); updateInfo();
    return;
  }
  if(state.mode === 'sketch' && state.tool === 'fillet' && state.drawing && state.drawing.type === 'fillet'){
    const d = state.drawing;
    state.drawing = null;
    const bx1 = Math.min(d.start.x, d.current.x);
    const bx2 = Math.max(d.start.x, d.current.x);
    const by1 = Math.min(d.start.y, d.current.y);
    const by2 = Math.max(d.start.y, d.current.y);
    const hits = [];
    state.shapes.forEach((s, idx) => {
      if(s.type !== 'line') return;
      const inBox = (x,y) => x >= bx1 && x <= bx2 && y >= by1 && y <= by2;
      if(inBox(s.x1,s.y1) || inBox(s.x2,s.y2) || segIntersectsBox(s, bx1,by1,bx2,by2)){
        hits.push({idx, s});
      }
    });
    if(hits.length < 2){ toast('선택 박스 안에 선이 2개 이상 필요합니다'); redrawSketch(); return; }
    const ix = lineLineIntersect(hits[0].s, hits[1].s);
    if(!ix){ toast('두 선이 평행하거나 교점이 없습니다'); redrawSketch(); return; }
    const rStr = prompt('필렛 반지름(mm)을 입력하세요', '5');
    if(rStr === null){ redrawSketch(); return; }
    const R = parseFloat(rStr);
    if(isNaN(R) || R <= 0){ toast('유효한 반지름을 입력하세요'); redrawSketch(); return; }
    applyFillet(hits[0], hits[1], ix, R);
    redrawSketch();
  }
  // 쓸어지우기 처리
  if(state.mode === 'sketch' && state.tool === 'wipe' && state.drawing && state.drawing.type === 'wipe'){
    const d = state.drawing;
    state.drawing = null;
    const bx1 = Math.min(d.start.x, d.current.x);
    const bx2 = Math.max(d.start.x, d.current.x);
    const by1 = Math.min(d.start.y, d.current.y);
    const by2 = Math.max(d.start.y, d.current.y);
    const toRemove = [];
    state.shapes.forEach((s, idx) => {
      let inBox = false;
      if(s.type === 'line'){
        const ib = (x,y) => x >= bx1 && x <= bx2 && y >= by1 && y <= by2;
        inBox = ib(s.x1,s.y1) || ib(s.x2,s.y2) || segIntersectsBox(s, bx1,by1,bx2,by2);
      } else if(s.type === 'rect'){
        const r1x=Math.min(s.x1,s.x2), r2x=Math.max(s.x1,s.x2);
        const r1y=Math.min(s.y1,s.y2), r2y=Math.max(s.y1,s.y2);
        inBox = !(r2x<bx1 || r1x>bx2 || r2y<by1 || r1y>by2);
      } else if(s.type === 'circle' || s.type === 'arc'){
        inBox = bx1<=s.cx && s.cx<=bx2 && by1<=s.cy && s.cy<=by2;
      }
      if(inBox) toRemove.push(idx);
    });
    if(toRemove.length > 0){
      pushHistory();
      toRemove.sort((a,b)=>b-a).forEach(i => state.shapes.splice(i,1));
      // 박스 안의 한붓그리기 점도 함께 삭제
      const ptsBefore = state.penPoints.length;
      state.penPoints = state.penPoints.filter(p =>
        !(bx1<=p.x && p.x<=bx2 && by1<=p.y && p.y<=by2));
      if(state.penPoints.length < ptsBefore){
        state.penCur = Math.min(state.penCur, state.penPoints.length - 1);
      }
      redrawSketch();
      updateInfo();
      skCmdLog('  🧽 쓸어지우기: 도형 ' + toRemove.length + '개, 점 ' + (ptsBefore - state.penPoints.length) + '개 삭제', 'sys');
      toast(toRemove.length + '개 도형 삭제');
    } else {
      toast('박스 안에 도형이 없습니다');
    }
    redrawSketch();
  }
});

function segIntersectsBox(s, bx1,by1,bx2,by2){
  const segs = [
    {x1:bx1,y1:by1,x2:bx2,y2:by1},{x1:bx2,y1:by1,x2:bx2,y2:by2},
    {x1:bx2,y1:by2,x2:bx1,y2:by2},{x1:bx1,y1:by2,x2:bx1,y2:by1}
  ];
  return segs.some(b => segSegIntersect(s.x1,s.y1,s.x2,s.y2, b.x1,b.y1,b.x2,b.y2) !== null);
}
function segSegIntersect(ax,ay,bx,by, cx,cy,dx,dy){
  const d1x=bx-ax,d1y=by-ay, d2x=dx-cx,d2y=dy-cy;
  const cross = d1x*d2y - d1y*d2x;
  if(Math.abs(cross)<1e-10) return null;
  const t = ((cx-ax)*d2y - (cy-ay)*d2x) / cross;
  const u = ((cx-ax)*d1y - (cy-ay)*d1x) / cross;
  if(t<-1e-6||t>1+1e-6||u<-1e-6||u>1+1e-6) return null;
  return {x: ax+t*d1x, y: ay+t*d1y, t, u};
}
function lineLineIntersect(L1, L2){
  return segSegIntersect(L1.x1,L1.y1,L1.x2,L1.y2, L2.x1,L2.y1,L2.x2,L2.y2)
      || lineInfiniteIntersect(L1,L2);
}
function lineInfiniteIntersect(L1,L2){
  const d1x=L1.x2-L1.x1, d1y=L1.y2-L1.y1;
  const d2x=L2.x2-L2.x1, d2y=L2.y2-L2.y1;
  const cross=d1x*d2y-d1y*d2x;
  if(Math.abs(cross)<1e-10) return null;
  const t=((L2.x1-L1.x1)*d2y-(L2.y1-L1.y1)*d2x)/cross;
  return {x:L1.x1+t*d1x, y:L1.y1+t*d1y, t, u:0};
}
function applyFillet(h1, h2, ix, R){
  const L1=h1.s, L2=h2.s;
  const ux1=L1.x2-L1.x1, uy1=L1.y2-L1.y1, len1=Math.hypot(ux1,uy1);
  const ux2=L2.x2-L2.x1, uy2=L2.y2-L2.y1, len2=Math.hypot(ux2,uy2);
  if(len1<1e-6||len2<1e-6) return;

  // 두 선 사이 각도 (실제 각도, abs 없이)
  const dot = (ux1*ux2+uy1*uy2)/(len1*len2);
  const ang = Math.acos(Math.max(-1,Math.min(1,dot))); // 0~π
  const halfAng = ang/2;
  if(Math.abs(Math.sin(halfAng))<1e-6) return;
  const dist = R / Math.tan(halfAng); // 교점→접점 거리
  if(isNaN(dist)||!isFinite(dist)||dist<1e-6) return;

  // 각 선의 교점에 가까운 끝 방향으로 접점 계산
  function trimPt(L, ix, d){
    const dx=L.x2-L.x1, dy=L.y2-L.y1, ln=Math.hypot(dx,dy);
    const udx=dx/ln, udy=dy/ln;
    const d1=Math.hypot(ix.x-L.x1,ix.y-L.y1);
    const d2=Math.hypot(ix.x-L.x2,ix.y-L.y2);
    // 교점에서 선 안쪽 방향(교점에서 멀어지는 방향)으로 d만큼
    if(d1<d2){ return {x:ix.x+udx*d, y:ix.y+udy*d}; }
    else      { return {x:ix.x-udx*d, y:ix.y-udy*d}; }
  }
  const T1=trimPt(L1,ix,dist);
  const T2=trimPt(L2,ix,dist);

  // 호 중심: 교점에서 각도이등분선 방향으로 R/sin(halfAng) 거리
  // 이등분선 방향 = 두 단위벡터 합산 후 정규화
  // (교점에서 각 선의 안쪽 방향 단위벡터를 더함)
  function unitAwayFromIx(L, ix){
    const dx=L.x2-L.x1, dy=L.y2-L.y1, ln=Math.hypot(dx,dy);
    const d1=Math.hypot(ix.x-L.x1,ix.y-L.y1);
    const d2=Math.hypot(ix.x-L.x2,ix.y-L.y2);
    if(d1<d2) return {x: dx/ln, y: dy/ln};
    else      return {x:-dx/ln, y:-dy/ln};
  }
  const u1=unitAwayFromIx(L1,ix);
  const u2=unitAwayFromIx(L2,ix);
  const bx=u1.x+u2.x, by=u1.y+u2.y;
  const blen=Math.hypot(bx,by);
  if(blen<1e-6) return;
  const centerDist = R / Math.sin(halfAng);
  const C = {x: ix.x + (bx/blen)*centerDist, y: ix.y + (by/blen)*centerDist};

  // 호 시작/끝 각도 (world 좌표계)
  const aStart=Math.atan2(T1.y-C.y, T1.x-C.x);
  const aEnd  =Math.atan2(T2.y-C.y, T2.x-C.x);

  // 호 방향: canvas는 -endAngle→-startAngle(반시계) 로 그림
  // 두 접점이 호 중심 주위를 어떤 방향으로 돌아야 올바른지 결정
  // 교점이 호 중심에서 반대쪽에 있어야 함 → 교점 방향으로 가장 짧은 호를 피하는 방향
  // 단순 결정: CCW로 그릴 때와 CW로 그릴 때 중 교점을 포함하지 않는 쪽 선택
  // → 두 각도 차를 0~2π 로 맞춰 짧은 호 방향 결정
  let dAngle = aEnd - aStart;
  while(dAngle < -Math.PI) dAngle += 2*Math.PI;
  while(dAngle >  Math.PI) dAngle -= 2*Math.PI;
  // 교점이 호 중심 기준으로 어느 방향에 있는지
  const ixAngle = Math.atan2(ix.y-C.y, ix.x-C.x);
  // 짧은 호가 교점 쪽을 향하면 → 긴 호로 전환 (startAngle/endAngle 교환)
  let finalStart=aStart, finalEnd=aEnd;
  // 교점까지 각도가 aStart~aEnd 사이에 들어오면 방향 반전
  function angleBetween(a, s, e){
    // s→e 방향(CCW)으로 a가 들어오는지
    let ds = e - s; while(ds<0) ds+=2*Math.PI;
    let da = a - s; while(da<0) da+=2*Math.PI;
    return da <= ds;
  }
  if(angleBetween(ixAngle, aStart, aEnd)){
    // 교점이 짧은 호 안에 → swap해서 긴 호(교점 없는 쪽) 사용
    finalStart=aEnd; finalEnd=aStart;
  }

  function trimLine(L, ix, Tnew){
    const d1=Math.hypot(ix.x-L.x1,ix.y-L.y1);
    const d2=Math.hypot(ix.x-L.x2,ix.y-L.y2);
    if(d1<d2){ L.x1=Tnew.x; L.y1=Tnew.y; }
    else      { L.x2=Tnew.x; L.y2=Tnew.y; }
  }
  pushHistory();
  trimLine(L1,ix,T1);
  trimLine(L2,ix,T2);
  state.shapes.push({
    type:'arc', cx:C.x, cy:C.y, r:R,
    startAngle:finalStart, endAngle:finalEnd,
    color: L1.color||'#000000',
    lineWidth: L1.lineWidth||2
  });
  updateInfo();
  toast('✅ 필렛 R'+R+'mm 적용됨');
}

// ─── v8.17: 신규 필렛 V2 (가상 교점 기반) ───────────────────────
// 두 선이 서로 만나지 않아도, 무한 연장 교점을 기준으로 필렛 호 생성
// - 두 선을 미리 선택(박스선택/Shift+클릭) 후 메뉴 호출
// - R 입력 (수식 가능)
// - 결과: 두 선이 호의 양 끝 접점에 정확히 닿도록 자동 연장/잘라내기
// - 호는 가상 교점 반대편에 위치 (작은 호 = PI - theta)
function sk3FilletV2Calc(L1, L2, R){
  // 무한 연장 교점
  const dx1 = L1.x2 - L1.x1, dy1 = L1.y2 - L1.y1;
  const dx2 = L2.x2 - L2.x1, dy2 = L2.y2 - L2.y1;
  const cross = dx1*dy2 - dy1*dx2;
  if(Math.abs(cross) < 1e-10) return {error: '두 선이 평행하여 교점 없음'};
  const t = ((L2.x1-L1.x1)*dy2 - (L2.y1-L1.y1)*dx2) / cross;
  const I = {x: L1.x1 + t*dx1, y: L1.y1 + t*dy1};

  // 각 선의 가상 교점에서 멀어지는 단위벡터 + 먼 끝점까지 거리
  function unitAway(L){
    const d1 = Math.hypot(I.x-L.x1, I.y-L.y1);
    const d2 = Math.hypot(I.x-L.x2, I.y-L.y2);
    const dx = L.x2 - L.x1, dy = L.y2 - L.y1;
    const ln = Math.hypot(dx, dy);
    if(ln < 1e-9) return null;
    if(d1 < d2) return {x: dx/ln, y: dy/ln, farDist: d2, near: 1};
    else        return {x: -dx/ln, y: -dy/ln, farDist: d1, near: 2};
  }
  const u1 = unitAway(L1), u2 = unitAway(L2);
  if(!u1 || !u2) return {error: '선 길이 0'};

  // 안쪽 각도 (0~PI)
  const cosA = u1.x*u2.x + u1.y*u2.y;
  const theta = Math.acos(Math.max(-1, Math.min(1, cosA)));
  if(theta < 0.005 || Math.PI - theta < 0.005) return {error: '두 선이 평행에 가까움'};

  // 접점까지 거리 T = R / tan(theta/2)
  const T = R / Math.tan(theta/2);
  if(!isFinite(T) || T <= 0) return {error: 'R/각도 계산 오류'};
  if(T > u1.farDist + 0.01) return {error: 'R='+R+'mm 너무 큼 — 선1 길이 부족 (필요 ' + T.toFixed(2) + 'mm)'};
  if(T > u2.farDist + 0.01) return {error: 'R='+R+'mm 너무 큼 — 선2 길이 부족 (필요 ' + T.toFixed(2) + 'mm)'};

  // 접점 좌표
  const t1 = {x: I.x + u1.x*T, y: I.y + u1.y*T};
  const t2 = {x: I.x + u2.x*T, y: I.y + u2.y*T};

  // 호 중심: 이등분선 방향으로 R/sin(theta/2) 거리
  const bx = u1.x + u2.x, by = u1.y + u2.y;
  const bl = Math.hypot(bx, by);
  if(bl < 1e-9) return {error: '이등분선 계산 실패'};
  const cd = R / Math.sin(theta/2);
  const C = {x: I.x + (bx/bl)*cd, y: I.y + (by/bl)*cd};

  // 호 시작/끝 각도 (C 기준)
  const aS = Math.atan2(t1.y - C.y, t1.x - C.x);
  const aE = Math.atan2(t2.y - C.y, t2.x - C.x);
  // v8.20 FIX: 항상 짧은 호 보장 (|dA| ≤ π)
  // 이전 로직(inArcCCW로 swap)이 반대로 동작해 긴 호가 그려져
  // "잘려야 할 부분(코너 안쪽)이 살아남고 외각 쪽이 잘리는" 결함이 있었음
  // 필렛 호는 항상 두 접점 사이의 짧은 곡선 = 코너 안쪽으로 볼록
  let dA = aE - aS;
  while(dA > Math.PI) dA -= 2*Math.PI;
  while(dA < -Math.PI) dA += 2*Math.PI;
  let startAngle, endAngle;
  if(dA >= 0){
    startAngle = aS; endAngle = aE;
  } else {
    startAngle = aE; endAngle = aS;
  }

  return {success: true, I, t1, t2, center: C, R, startAngle, endAngle, u1, u2};
}

window.sk3NewFilletV2 = function(){
  const lineIdxs = [...state.selectedShapes].filter(i =>
    state.shapes[i] && state.shapes[i].type === 'line');
  if(lineIdxs.length !== 2){
    toast('선을 정확히 2개 선택하세요 (현재 line ' + lineIdxs.length + '개)\n· 박스 선택(우클릭 드래그) 또는 Shift+클릭');
    return;
  }
  const rStr = prompt('🌀 신규 필렛 V2 — 가상 교점 기반\n\n반지름 R (mm) 입력:\n· 수식 가능 (=10+5, 100/2, 30+5)\n· 두 선이 만나지 않아도 OK (가상 교점에 호 형성)\n· R이 크면 선이 연장되고, R이 작으면 잘라냄', '5');
  if(rStr === null) return;
  let R;
  try {
    const cleaned = String(rStr).replace(/[^0-9+\-*/.()]/g, '');
    if(!cleaned) throw new Error('empty');
    R = Function('"use strict";return (' + cleaned + ')')();
  } catch(e){ toast('수식 오류: ' + rStr); return; }
  if(!isFinite(R) || R <= 0){ toast('유효한 R 필요 (>0)'); return; }

  const L1 = state.shapes[lineIdxs[0]];
  const L2 = state.shapes[lineIdxs[1]];
  const res = sk3FilletV2Calc(L1, L2, R);
  if(res.error){ toast('❌ ' + res.error); return; }

  pushHistory();
  // 두 선의 가상교점 가까운 끝점을 접점으로 이동 (연장 또는 잘라내기)
  function moveNearEnd(L, I, newPt){
    const d1 = Math.hypot(I.x-L.x1, I.y-L.y1);
    const d2 = Math.hypot(I.x-L.x2, I.y-L.y2);
    // 펜점 좌표도 동시에 갱신 (연결 유지)
    const oldX = (d1 < d2) ? L.x1 : L.x2;
    const oldY = (d1 < d2) ? L.y1 : L.y2;
    if(d1 < d2){ L.x1 = newPt.x; L.y1 = newPt.y; }
    else        { L.x2 = newPt.x; L.y2 = newPt.y; }
    const tol = 0.01;
    state.penPoints.forEach(p => {
      if(Math.abs(p.x - oldX) < tol && Math.abs(p.y - oldY) < tol){
        p.x = newPt.x; p.y = newPt.y;
      }
    });
  }
  moveNearEnd(L1, res.I, res.t1);
  moveNearEnd(L2, res.I, res.t2);
  state.shapes.push({
    type: 'arc',
    cx: res.center.x, cy: res.center.y, r: res.R,
    startAngle: res.startAngle, endAngle: res.endAngle,
    color: L1.color || '#000000',
    lineWidth: L1.lineWidth || 2
  });
  state.selectedShapes.clear();
  // v8.40: 필렛 호 양 끝점·잘린 선 끝점에 펜점 자동 부여
  let autoAdded = 0;
  if(typeof window.sk3SyncPenPointsToShapes === 'function'){
    autoAdded = window.sk3SyncPenPointsToShapes();
  }
  updateInfo(); redrawSketch();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  toast('🌀 신규 필렛 R' + R + 'mm 적용' + (autoAdded?' · 신규 펜점 ' + autoAdded + '개':''));
  if(typeof skCmdLog === 'function') skCmdLog('  🌀 신규 필렛 V2: R' + R + 'mm · 가상교점 (' + res.I.x.toFixed(2) + ',' + res.I.y.toFixed(2) + ')' + (autoAdded?' · 펜점 ' + autoAdded:''), 'sys');
};

// ─── v8.17: 모따기 / Chamfer (가상 교점 기반) ───────────────────
// 두 선을 선택 후 거리 D 입력 → 가상 교점에서 D만큼 떨어진 두 점을 잇는 직선 추가
// - 비대칭 모따기: "5,10" → 선1=5mm, 선2=10mm
window.sk3ChamferAt = function(){
  const lineIdxs = [...state.selectedShapes].filter(i =>
    state.shapes[i] && state.shapes[i].type === 'line');
  if(lineIdxs.length !== 2){
    toast('선을 정확히 2개 선택하세요 (현재 line ' + lineIdxs.length + '개)');
    return;
  }
  const dStr = prompt('✂ 모따기 / Chamfer — 가상 교점 기반\n\n거리 D (mm) 입력:\n· 대칭: 5  (두 선 모두 5mm)\n· 비대칭: 5,10  (선1=5mm, 선2=10mm)\n· 수식 가능 (=10/2, 30+5)', '5');
  if(dStr === null) return;
  function evalExpr(s){
    try {
      const c = String(s).replace(/[^0-9+\-*/.()]/g, '');
      if(!c) return NaN;
      return Function('"use strict";return (' + c + ')')();
    } catch(e){ return NaN; }
  }
  let D1, D2;
  if(String(dStr).includes(',')){
    const parts = String(dStr).split(',').map(p => p.trim());
    D1 = evalExpr(parts[0]); D2 = evalExpr(parts[1]);
  } else {
    D1 = D2 = evalExpr(dStr);
  }
  if(!isFinite(D1) || D1 <= 0 || !isFinite(D2) || D2 <= 0){ toast('유효한 D 필요 (>0)'); return; }

  const L1 = state.shapes[lineIdxs[0]];
  const L2 = state.shapes[lineIdxs[1]];
  const dx1 = L1.x2-L1.x1, dy1 = L1.y2-L1.y1;
  const dx2 = L2.x2-L2.x1, dy2 = L2.y2-L2.y1;
  const cross = dx1*dy2 - dy1*dx2;
  if(Math.abs(cross) < 1e-10){ toast('두 선이 평행하여 교점 없음'); return; }
  const t = ((L2.x1-L1.x1)*dy2 - (L2.y1-L1.y1)*dx2) / cross;
  const I = {x: L1.x1 + t*dx1, y: L1.y1 + t*dy1};

  function unitAway(L){
    const d1 = Math.hypot(I.x-L.x1, I.y-L.y1);
    const d2 = Math.hypot(I.x-L.x2, I.y-L.y2);
    const dx = L.x2-L.x1, dy = L.y2-L.y1;
    const ln = Math.hypot(dx, dy);
    if(ln < 1e-9) return null;
    if(d1 < d2) return {x: dx/ln, y: dy/ln, farDist: d2};
    else        return {x: -dx/ln, y: -dy/ln, farDist: d1};
  }
  const u1 = unitAway(L1), u2 = unitAway(L2);
  if(!u1 || !u2){ toast('선 길이 0'); return; }
  if(D1 > u1.farDist + 0.01){ toast('D1='+D1+'mm 너무 큼 — 선1 길이 부족'); return; }
  if(D2 > u2.farDist + 0.01){ toast('D2='+D2+'mm 너무 큼 — 선2 길이 부족'); return; }

  const c1 = {x: I.x + u1.x*D1, y: I.y + u1.y*D1};
  const c2 = {x: I.x + u2.x*D2, y: I.y + u2.y*D2};

  pushHistory();
  function moveNearEnd(L, I, newPt){
    const d1 = Math.hypot(I.x-L.x1, I.y-L.y1);
    const d2 = Math.hypot(I.x-L.x2, I.y-L.y2);
    const oldX = (d1 < d2) ? L.x1 : L.x2;
    const oldY = (d1 < d2) ? L.y1 : L.y2;
    if(d1 < d2){ L.x1 = newPt.x; L.y1 = newPt.y; }
    else        { L.x2 = newPt.x; L.y2 = newPt.y; }
    const tol = 0.01;
    state.penPoints.forEach(p => {
      if(Math.abs(p.x - oldX) < tol && Math.abs(p.y - oldY) < tol){
        p.x = newPt.x; p.y = newPt.y;
      }
    });
  }
  moveNearEnd(L1, I, c1);
  moveNearEnd(L2, I, c2);
  state.shapes.push({
    type: 'line',
    x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y,
    color: L1.color || '#000000',
    lineWidth: L1.lineWidth || 2
  });
  state.selectedShapes.clear();
  // v8.40: 모따기 새 선·잘린 끝점에 펜점 자동 부여
  let autoAddedC = 0;
  if(typeof window.sk3SyncPenPointsToShapes === 'function'){
    autoAddedC = window.sk3SyncPenPointsToShapes();
  }
  updateInfo(); redrawSketch();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  const lbl = (D1 === D2) ? (D1 + 'mm') : (D1 + ',' + D2 + 'mm');
  toast('✂ 모따기 ' + lbl + ' 적용' + (autoAddedC?' · 신규 펜점 ' + autoAddedC + '개':''));
  if(typeof skCmdLog === 'function') skCmdLog('  ✂ 모따기 D=(' + D1 + ',' + D2 + ')mm · 가상교점 (' + I.x.toFixed(2) + ',' + I.y.toFixed(2) + ')' + (autoAddedC?' · 펜점 ' + autoAddedC:''), 'sys');
};

// ─── v8.19: 복사/붙여넣기/반전/회전 ────────────────────────────
let _sk3Clipboard = null;  // {shapes: [...], penPoints: [...]} 형태로 보관

// v8.21: 전체 선택 (Ctrl+A) — 스케치 모드의 모든 도형
window.sk3SelectAll = function(){
  if(state.mode !== 'sketch'){ toast('스케치 모드에서만 가능'); return; }
  if(state.shapes.length === 0){ toast('🔘 선택할 도형이 없습니다'); return; }
  state.selectedShapes.clear();
  state.shapes.forEach((s, i) => state.selectedShapes.add(i));
  redrawSketch();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  toast('🔘 전체 선택: 도형 ' + state.selectedShapes.size + '개');
  if(typeof skCmdLog === 'function') skCmdLog('  🔘 전체 선택: ' + state.selectedShapes.size + '개 도형', 'sys');
};

// 선택 도형의 바운딩 박스 중심 계산
function _sk3SelectionCenter(){
  const sel = [...state.selectedShapes];
  if(sel.length === 0) return null;
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
  sel.forEach(i => {
    const s = state.shapes[i];
    if(!s) return;
    if(s.type === 'line' || s.type === 'rect'){
      mnX = Math.min(mnX, s.x1, s.x2); mxX = Math.max(mxX, s.x1, s.x2);
      mnY = Math.min(mnY, s.y1, s.y2); mxY = Math.max(mxY, s.y1, s.y2);
    } else if(s.type === 'circle' || s.type === 'arc'){
      mnX = Math.min(mnX, s.cx - s.r); mxX = Math.max(mxX, s.cx + s.r);
      mnY = Math.min(mnY, s.cy - s.r); mxY = Math.max(mxY, s.cy + s.r);
    }
  });
  if(!isFinite(mnX)) return null;
  return {x: (mnX+mxX)/2, y: (mnY+mxY)/2, w: mxX-mnX, h: mxY-mnY};
}

// 선택 도형의 끝점과 일치하는 펜점 인덱스 모음
function _sk3CollectPinnedPenPoints(shapeIdxs){
  const tol = 0.01;
  const pinSet = new Set();
  shapeIdxs.forEach(i => {
    const s = state.shapes[i]; if(!s) return;
    const ends = [];
    if(s.type === 'line' || s.type === 'rect') ends.push([s.x1,s.y1], [s.x2,s.y2]);
    else if(s.type === 'circle' || s.type === 'arc') ends.push([s.cx, s.cy]);
    ends.forEach(([ex, ey]) => {
      state.penPoints.forEach((p, pi) => {
        if(Math.abs(p.x-ex)<tol && Math.abs(p.y-ey)<tol) pinSet.add(pi);
      });
    });
  });
  return [...pinSet];
}

// 복사 (Ctrl+C / 메뉴)
window.sk3CopySelection = function(){
  if(state.mode !== 'sketch'){ toast('스케치 모드에서만 가능'); return; }
  const sel = [...state.selectedShapes];
  if(sel.length === 0){ toast('📋 복사할 도형을 먼저 선택하세요 (박스선택/Shift+클릭)'); return; }
  const shapes = sel.map(i => JSON.parse(JSON.stringify(state.shapes[i])));
  const pinIdxs = _sk3CollectPinnedPenPoints(sel);
  const penPoints = pinIdxs.map(pi => ({x: state.penPoints[pi].x, y: state.penPoints[pi].y}));
  _sk3Clipboard = {shapes, penPoints, t: Date.now()};
  toast('📋 복사: 도형 ' + shapes.length + '개' + (penPoints.length ? ' + 펜점 ' + penPoints.length : ''));
  if(typeof skCmdLog === 'function') skCmdLog('  📋 복사 (도형 ' + shapes.length + ', 점 ' + penPoints.length + ')', 'sys');
};

// 붙여넣기 (Ctrl+V / 메뉴)
// offset 인자 없으면 기본 (+10, +10) 적용
window.sk3PasteClipboard = function(ox, oy){
  if(state.mode !== 'sketch'){ toast('스케치 모드에서만 가능'); return; }
  if(!_sk3Clipboard || !_sk3Clipboard.shapes || _sk3Clipboard.shapes.length === 0){
    toast('📌 클립보드 비어있음 — 먼저 Ctrl+C로 복사');
    return;
  }
  if(typeof ox !== 'number') ox = 10;
  if(typeof oy !== 'number') oy = 10;
  pushHistory();
  const newIdxs = [];
  _sk3Clipboard.shapes.forEach(src => {
    const c = JSON.parse(JSON.stringify(src));
    if(c.type === 'line' || c.type === 'rect'){
      c.x1 += ox; c.y1 += oy; c.x2 += ox; c.y2 += oy;
    } else if(c.type === 'circle' || c.type === 'arc'){
      c.cx += ox; c.cy += oy;
    }
    state.shapes.push(c);
    newIdxs.push(state.shapes.length - 1);
  });
  // 펜점도 복원 (오프셋 적용)
  _sk3Clipboard.penPoints.forEach(p => {
    state.penPoints.push({x: p.x + ox, y: p.y + oy});
  });
  // 새 도형 자동 선택 (사용자가 바로 드래그/조작 가능)
  state.selectedShapes.clear();
  newIdxs.forEach(i => state.selectedShapes.add(i));
  redrawSketch(); updateInfo();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  toast('📌 붙여넣기: ' + newIdxs.length + '개 도형 (+' + ox + ',+' + oy + 'mm) 자동 선택');
  if(typeof skCmdLog === 'function') skCmdLog('  📌 붙여넣기 +' + ox + ',+' + oy + ' (도형 ' + newIdxs.length + ')', 'sys');
};

// 반전 (mirror) — axis: 'x'=좌우반전(Y축 미러), 'y'=상하반전(X축 미러)
window.sk3MirrorSel = function(axis){
  if(state.mode !== 'sketch'){ toast('스케치 모드에서만'); return; }
  const sel = [...state.selectedShapes];
  if(sel.length === 0){ toast('↔ 선택된 도형이 없습니다'); return; }
  const c = _sk3SelectionCenter();
  if(!c){ toast('중심 계산 실패'); return; }
  pushHistory();
  // 펜점도 함께 처리 (도형 끝점과 일치하는 점)
  const pinIdxs = _sk3CollectPinnedPenPoints(sel);
  function mirrorPt(px, py){
    if(axis === 'x') return {x: 2*c.x - px, y: py};
    else             return {x: px, y: 2*c.y - py};
  }
  sel.forEach(i => {
    const s = state.shapes[i]; if(!s) return;
    if(s.type === 'line' || s.type === 'rect'){
      const p1 = mirrorPt(s.x1, s.y1);
      const p2 = mirrorPt(s.x2, s.y2);
      s.x1 = p1.x; s.y1 = p1.y; s.x2 = p2.x; s.y2 = p2.y;
    } else if(s.type === 'circle'){
      const p = mirrorPt(s.cx, s.cy);
      s.cx = p.x; s.cy = p.y;
    } else if(s.type === 'arc'){
      const p = mirrorPt(s.cx, s.cy);
      s.cx = p.x; s.cy = p.y;
      // 각도 반전: X축 반전 → PI - angle, Y축 반전 → -angle
      // 호 방향(CCW→CW)이 뒤집히므로 start/end 교환
      if(axis === 'x'){
        const ns = Math.PI - s.startAngle;
        const ne = Math.PI - s.endAngle;
        s.startAngle = ne; s.endAngle = ns;
      } else {
        const ns = -s.startAngle;
        const ne = -s.endAngle;
        s.startAngle = ne; s.endAngle = ns;
      }
    }
  });
  // 펜점 반전
  pinIdxs.forEach(pi => {
    const p = state.penPoints[pi];
    const np = mirrorPt(p.x, p.y);
    p.x = np.x; p.y = np.y;
  });
  redrawSketch(); updateInfo();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  toast((axis === 'x' ? '↔ 좌우반전' : '↕ 상하반전') + ' (중심: ' + c.x.toFixed(1) + ',' + c.y.toFixed(1) + ')');
  if(typeof skCmdLog === 'function') skCmdLog('  ' + (axis==='x'?'↔ 좌우반전':'↕ 상하반전') + ' 중심(' + c.x.toFixed(2) + ',' + c.y.toFixed(2) + ')', 'sys');
};

// 회전 — degrees: 회전각(°), 반시계+
window.sk3RotateSel = function(degrees){
  if(state.mode !== 'sketch'){ toast('스케치 모드에서만'); return; }
  const sel = [...state.selectedShapes];
  if(sel.length === 0){ toast('🔄 선택된 도형이 없습니다'); return; }
  const c = _sk3SelectionCenter();
  if(!c){ toast('중심 계산 실패'); return; }
  const rad = degrees * Math.PI / 180;
  const cs = Math.cos(rad), sn = Math.sin(rad);
  function rotPt(x, y){
    const dx = x - c.x, dy = y - c.y;
    return {x: c.x + dx*cs - dy*sn, y: c.y + dx*sn + dy*cs};
  }
  const isOrthogonal = (Math.abs(degrees % 90) < 0.001);  // 90의 배수면 rect 유지

  pushHistory();
  const pinIdxs = _sk3CollectPinnedPenPoints(sel);
  // rect가 임의 각도 회전 시 line으로 분해해야 하므로 별도 처리
  const rectToLines = [];  // {idx, lines:[...]}
  sel.forEach(i => {
    const s = state.shapes[i]; if(!s) return;
    if(s.type === 'line'){
      const p1 = rotPt(s.x1, s.y1);
      const p2 = rotPt(s.x2, s.y2);
      s.x1 = p1.x; s.y1 = p1.y; s.x2 = p2.x; s.y2 = p2.y;
    } else if(s.type === 'rect'){
      if(isOrthogonal){
        // 90°/180°/270°: 회전 후 AABB로 재구성
        const corners = [rotPt(s.x1,s.y1), rotPt(s.x2,s.y1), rotPt(s.x2,s.y2), rotPt(s.x1,s.y2)];
        const xs = corners.map(p=>p.x), ys = corners.map(p=>p.y);
        s.x1 = Math.min(...xs); s.y1 = Math.min(...ys);
        s.x2 = Math.max(...xs); s.y2 = Math.max(...ys);
      } else {
        // 임의 각도 → 4 line으로 분해 (이후 일괄 적용)
        const c1 = rotPt(s.x1, s.y1), c2 = rotPt(s.x2, s.y1);
        const c3 = rotPt(s.x2, s.y2), c4 = rotPt(s.x1, s.y2);
        rectToLines.push({idx: i, lines: [
          {type:'line', x1:c1.x, y1:c1.y, x2:c2.x, y2:c2.y, color:s.color, lineWidth:s.lineWidth},
          {type:'line', x1:c2.x, y1:c2.y, x2:c3.x, y2:c3.y, color:s.color, lineWidth:s.lineWidth},
          {type:'line', x1:c3.x, y1:c3.y, x2:c4.x, y2:c4.y, color:s.color, lineWidth:s.lineWidth},
          {type:'line', x1:c4.x, y1:c4.y, x2:c1.x, y2:c1.y, color:s.color, lineWidth:s.lineWidth},
        ]});
      }
    } else if(s.type === 'circle'){
      const np = rotPt(s.cx, s.cy);
      s.cx = np.x; s.cy = np.y;
    } else if(s.type === 'arc'){
      const np = rotPt(s.cx, s.cy);
      s.cx = np.x; s.cy = np.y;
      s.startAngle += rad;
      s.endAngle += rad;
    }
  });
  // rect 분해 적용 (큰 인덱스부터 제거 → 인덱스 흔들림 방지)
  if(rectToLines.length){
    rectToLines.sort((a,b) => b.idx - a.idx);
    rectToLines.forEach(r => {
      state.shapes.splice(r.idx, 1);
      // 새 line들 추가 (선택 해제)
      r.lines.forEach(l => state.shapes.push(l));
    });
    state.selectedShapes.clear();
    toast('🔄 회전 ' + degrees + '° (rect는 line으로 분해)');
  } else {
    toast('🔄 회전 ' + degrees + '° (중심: ' + c.x.toFixed(1) + ',' + c.y.toFixed(1) + ')');
  }
  // 펜점도 회전
  pinIdxs.forEach(pi => {
    const p = state.penPoints[pi];
    const np = rotPt(p.x, p.y);
    p.x = np.x; p.y = np.y;
  });
  redrawSketch(); updateInfo();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  if(typeof skCmdLog === 'function') skCmdLog('  🔄 회전 ' + degrees + '° · 중심(' + c.x.toFixed(2) + ',' + c.y.toFixed(2) + ')', 'sys');
};

// 임의 각도 회전 (prompt)
window.sk3RotateSelPrompt = function(){
  if(state.selectedShapes.size === 0){ toast('🔄 선택된 도형이 없습니다'); return; }
  const aStr = prompt('🔄 회전 각도 (°)\n· 양수=반시계, 음수=시계\n· 수식 가능 (=45*2, 360/4)\n· 90°의 배수가 아니면 rect는 line으로 분해됨', '45');
  if(aStr === null) return;
  let deg;
  try {
    const c = String(aStr).replace(/[^0-9+\-*/.()]/g, '');
    if(!c) throw 0;
    deg = Function('"use strict";return (' + c + ')')();
  } catch(e){ toast('각도 오류'); return; }
  if(!isFinite(deg)){ toast('유효한 각도 필요'); return; }
  sk3RotateSel(deg);
};

// 캔버스 밖으로 마우스가 나가도 패닝이 이어지도록 window에서 추적 (CAD 표준)
window.addEventListener('mousemove', (e)=>{
  if(!isPanning || !panStart) return;
  const rect = skCanvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  state.panX = panStart.panX + (sx - panStart.x);
  state.panY = panStart.panY + (sy - panStart.y);
  redrawSketch();
});

// 캔버스 밖에서 버튼을 떼도 패닝 종료 (CAD 표준 동작)
window.addEventListener('mouseup', ()=>{
  if(isPanning){isPanning = false; panStart = null; skCanvas.style.cursor = ''}
});

skCanvas.addEventListener('contextmenu', (e)=>e.preventDefault());

// 스케치 더블클릭 → 도형 속성 편집 모달
// v7.2: 브라우저 기본 dblclick 대신 click + 300ms 간격 직접 판정 (사용자 더블클릭 어려움 개선)
let _skLastClickTime = 0;
let _skLastClickPos = null;
const _SK_DBL_INTERVAL = 300;        // ms (도형·빈 곳 기본)
const _SK_DBL_INTERVAL_POINT = 500;  // v8.7: 점 위 더블클릭만 500ms (실수 트리거 방지)
const _SK_DBL_DIST = 8;              // px
skCanvas.addEventListener('click', (e)=>{
  if(state.mode !== 'sketch') return;
  // v8.8: 펜 도구 ON이면 더블클릭 판정 자체를 skip
  //   - mousedown이 이미 점 찍기로 처리했으므로 click의 더블클릭 트리거는 무용
  //   - 방금 추가한 점이 hit되어 무한 점 추가/속성팝업 트리거 버그 해결
  if(state.tool === 'pen'){
    _skLastClickTime = 0; _skLastClickPos = null;
    return;
  }
  const now = Date.now();
  const rect = skCanvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  // v8.7: hit 종류에 따라 임계값 동적 적용 (점=500ms, 그 외=300ms)
  const wp = snapPoint(screenToWorld(sx, sy));
  const onShape = sk3FindShapeAt(wp);
  const onPoint = (!onShape) && sk3FindNearestPenPoint(wp) >= 0;
  const interval = onPoint ? _SK_DBL_INTERVAL_POINT : _SK_DBL_INTERVAL;
  // 직전 클릭과 시각·위치 비교
  const dt = now - _skLastClickTime;
  const dd = _skLastClickPos ? Math.hypot(sx - _skLastClickPos.x, sy - _skLastClickPos.y) : Infinity;
  if(dt <= interval && dd <= _SK_DBL_DIST){
    // 더블클릭 확정 → 기존 dblclick 핸들러 호출
    _skLastClickTime = 0; _skLastClickPos = null;
    _skHandleDblClick(e);
    return;
  }
  _skLastClickTime = now;
  _skLastClickPos = {x:sx, y:sy};
});
function _skHandleDblClick(e){
  if(state.mode !== 'sketch') return;
  const rect = skCanvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const wp = snapPoint(screenToWorld(sx, sy));
  const hit = sk3FindShapeAt(wp);
  if(hit){
    sk3OpenShapeEditor(hit);
    return;
  }
  // 점 위 더블클릭 → 점 좌표 변경
  const pidx = sk3FindNearestPenPoint(wp);
  if(pidx < 0){
    // v8.5: 빈 곳 더블클릭 = 펜 도구 자동 ON + 그 위치에 점 찍기
    if(state.tool !== 'pen' && typeof setTool === 'function') setTool('pen');
    pushHistory();
    let tx = wp.x, ty = wp.y;
    if(state.penCur >= 0 && state.penPoints[state.penCur]){
      const cur = state.penPoints[state.penCur];
      state.shapes.push({type:'line', x1:cur.x, y1:cur.y, x2:tx, y2:ty,
        color: document.getElementById('sketchColor').value || '#000000',
        lineWidth: parseInt(document.getElementById('lineWidth').value)||2});
    }
    state.penPoints.push({x:tx, y:ty});
    state.penCur = state.penPoints.length - 1;
    redrawSketch(); updateInfo();
    setStat('✎ P' + state.penCur + ' 더블클릭으로 추가: (' + tx.toFixed(2) + ', ' + ty.toFixed(2) + ')mm');
    return;
  }
  // 점 위 더블클릭 → 좌표 변경 (기존 동작 유지)
  {
    const pidx_local = pidx;
    const pidx = pidx_local;
    if(pidx >= 0){
      const p = state.penPoints[pidx];
      const newX = parseFloat(prompt('P' + pidx + ' X (mm)', String(p.x.toFixed(3))));
      if(isNaN(newX)) return;
      const newY = parseFloat(prompt('P' + pidx + ' Y (mm)', String(p.y.toFixed(3))));
      if(isNaN(newY)) return;
      pushHistory();
      // 점 좌표 변경 + 연결된 선 이동
      const tol = 0.01;
      state.shapes.forEach(s => {
        if(s.type !== 'line') return;
        if(Math.abs(s.x1-p.x)<tol && Math.abs(s.y1-p.y)<tol){ s.x1=newX; s.y1=newY; }
        if(Math.abs(s.x2-p.x)<tol && Math.abs(s.y2-p.y)<tol){ s.x2=newX; s.y2=newY; }
      });
      p.x = newX; p.y = newY;
      redrawSketch(); updateInfo();
      skCmdLog('  ✏ P' + pidx + ' → (' + newX + ', ' + newY + ')', 'sys');
    }
  }
}

skCanvas.addEventListener('wheel', (e)=>{
  if(state.mode !== 'sketch') return;
  e.preventDefault();
  // v8.44: 스윕 모드 ON일 때는 휠로 원 반경 조절 (줌 대신)
  if(state.sweepConnectModeOn){
    sk3AdjustSweepRadius(e.deltaY);
    return;
  }
  const rect = skCanvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const wpBefore = screenToWorld(sx, sy);
  const zoom = e.deltaY < 0 ? 1.15 : 1/1.15;
  state.pixelsPerMm *= zoom;
  state.pixelsPerMm = Math.max(0.1, Math.min(200, state.pixelsPerMm));
  const wpAfter = screenToWorld(sx, sy);
  state.panX += (wpAfter.x - wpBefore.x) * state.pixelsPerMm;
  state.panY -= (wpAfter.y - wpBefore.y) * state.pixelsPerMm;
  redrawSketch();
}, {passive: false});

// v8.5: 박스 선택 미리보기 (점선 박스)
function sk3DrawBoxSelectPreview(box){
  if(!box) return;
  const x = Math.min(box.sx, box.ex), y = Math.min(box.sy, box.ey);
  const w = Math.abs(box.ex - box.sx), h = Math.abs(box.ey - box.sy);
  skCtx.save();
  skCtx.strokeStyle = '#3498db';
  skCtx.fillStyle = 'rgba(52, 152, 219, 0.15)';
  skCtx.lineWidth = 1.5;
  skCtx.setLineDash([6, 4]);
  skCtx.fillRect(x, y, w, h);
  skCtx.strokeRect(x, y, w, h);
  skCtx.setLineDash([]);
  skCtx.restore();
}

function sk3FinishBoxSelect(box){
  if(!box) return;
  if(!box.addToSel) state.selectedShapes.clear();
  const minX = Math.min(box.wpStart.x, box.wpEnd.x);
  const maxX = Math.max(box.wpStart.x, box.wpEnd.x);
  const minY = Math.min(box.wpStart.y, box.wpEnd.y);
  const maxY = Math.max(box.wpStart.y, box.wpEnd.y);
  // 도형의 대표점이 박스 안에 들어가면 선택
  state.shapes.forEach((s, i) => {
    let cx = 0, cy = 0;
    if(s.type === 'line'){ cx=(s.x1+s.x2)/2; cy=(s.y1+s.y2)/2; }
    else if(s.type === 'rect'){ cx=(s.x1+s.x2)/2; cy=(s.y1+s.y2)/2; }
    else if(s.type === 'circle' || s.type === 'arc'){ cx=s.cx; cy=s.cy; }
    else return;
    if(cx >= minX && cx <= maxX && cy >= minY && cy <= maxY){
      state.selectedShapes.add(i);
    }
  });
  const n = state.selectedShapes.size;
  setStat('📦 박스 선택: ' + n + '개 도형');
}

// v8.10: 우측 스케치 속성 패널 갱신 (점/도형 단일 선택 시 자동 표시)
window.sk3UpdateSelProp = function(){
  const panel = document.getElementById('sk3SelProp');
  const body = document.getElementById('sk3SelBody');
  const title = document.getElementById('sk3SelTitle');
  if(!panel || !body || !title) return;
  // 1) 단일 도형 선택 시 도형 속성
  if(state.selectedShapes && state.selectedShapes.size === 1){
    const idx = [...state.selectedShapes][0];
    const s = state.shapes[idx];
    if(!s){ panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    let html = '';
    if(s.type === 'line'){
      title.textContent = '◢ 선 (line)';
      const lineLen = Math.hypot(s.x2-s.x1, s.y2-s.y1);
      const lineDeg = Math.atan2(s.y2-s.y1, s.x2-s.x1) * 180 / Math.PI;
      // v8.15: 절대각도 (0~360°, 동쪽=0, 반시계+) 추가
      let absDeg = lineDeg;
      if(absDeg < 0) absDeg += 360;
      const reverseDeg = (absDeg + 180) % 360;
      // v8.30: 상대 치수 (P1→P2)
      const relDx = s.x2 - s.x1;
      const relDy = s.y2 - s.y1;
      html = `
        <div class="prop-row"><label>P1.X</label><input type="number" step="0.1" id="sk3p1x" value="${dispX(s.x1).toFixed(2)}"></div>
        <div class="prop-row"><label>P1.Y</label><input type="number" step="0.1" id="sk3p1y" value="${s.y1.toFixed(2)}"></div>
        <div class="prop-row"><label>P2.X</label><input type="number" step="0.1" id="sk3p2x" value="${dispX(s.x2).toFixed(2)}"></div>
        <div class="prop-row"><label>P2.Y</label><input type="number" step="0.1" id="sk3p2y" value="${s.y2.toFixed(2)}"></div>
        <div class="prop-row"><label>색상</label><input type="color" id="sk3color" value="${s.color||'#000000'}"></div>
        <div class="prop-row"><label>굵기</label><input type="number" step="1" id="sk3lw" value="${s.lineWidth||2}"></div>
        <button onclick="sk3ApplySelProp()" style="width:100%;margin-top:6px;background:#27ae60;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer">적용</button>
        <div style="font-size:10px;color:#888;margin-top:4px;line-height:1.5;border-top:1px solid #333;padding-top:5px">
          <span style="color:#aac8ff;font-weight:bold">📐 상대 (P1→P2)</span><br>
          Δx: <b style="color:#fff">${relDx >= 0 ? '+' : ''}${relDx.toFixed(2)}mm</b> · Δy: <b style="color:#fff">${relDy >= 0 ? '+' : ''}${relDy.toFixed(2)}mm</b><br>
          📏 길이: <b style="color:#aac8ff">${lineLen.toFixed(2)}mm</b><br>
          📐 절대각도(P1→P2): <b style="color:#f39c12">${absDeg.toFixed(2)}°</b><br>
          ↔ 반대방향(P2→P1): <span style="color:#aaa">${reverseDeg.toFixed(2)}°</span><br>
          <span style="color:#666">부호각: ${lineDeg.toFixed(2)}° (-180°~+180°)</span>
        </div>`;
    } else if(s.type === 'rect'){
      title.textContent = '▭ 사각형 (rect)';
      const w = Math.abs(s.x2-s.x1), h = Math.abs(s.y2-s.y1);
      const rectDiag = Math.hypot(w, h);
      const rectArea = w * h;
      html = `
        <div class="prop-row"><label>X1</label><input type="number" step="0.1" id="sk3p1x" value="${dispX(s.x1).toFixed(2)}"></div>
        <div class="prop-row"><label>Y1</label><input type="number" step="0.1" id="sk3p1y" value="${s.y1.toFixed(2)}"></div>
        <div class="prop-row"><label>X2</label><input type="number" step="0.1" id="sk3p2x" value="${dispX(s.x2).toFixed(2)}"></div>
        <div class="prop-row"><label>Y2</label><input type="number" step="0.1" id="sk3p2y" value="${s.y2.toFixed(2)}"></div>
        <div class="prop-row"><label>색상</label><input type="color" id="sk3color" value="${s.color||'#000000'}"></div>
        <div class="prop-row"><label>굵기</label><input type="number" step="1" id="sk3lw" value="${s.lineWidth||2}"></div>
        <button onclick="sk3ApplySelProp()" style="width:100%;margin-top:6px;background:#27ae60;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer">적용</button>
        <div style="font-size:10px;color:#888;margin-top:4px">W=${w.toFixed(2)} × H=${h.toFixed(2)}mm · 대각선=${rectDiag.toFixed(2)}mm · 면적=${rectArea.toFixed(1)}mm²</div>`;
    } else if(s.type === 'circle'){
      title.textContent = '○ 원 (circle)';
      html = `
        <div class="prop-row"><label>중심 X</label><input type="number" step="0.1" id="sk3cx" value="${dispX(s.cx).toFixed(2)}"></div>
        <div class="prop-row"><label>중심 Y</label><input type="number" step="0.1" id="sk3cy" value="${s.cy.toFixed(2)}"></div>
        <div class="prop-row"><label>반지름</label><input type="number" step="0.1" id="sk3r" value="${s.r.toFixed(2)}"></div>
        <div class="prop-row"><label>색상</label><input type="color" id="sk3color" value="${s.color||'#000000'}"></div>
        <div class="prop-row"><label>굵기</label><input type="number" step="1" id="sk3lw" value="${s.lineWidth||2}"></div>
        <button onclick="sk3ApplySelProp()" style="width:100%;margin-top:6px;background:#27ae60;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer">적용</button>
        <div style="font-size:10px;color:#888;margin-top:4px">직경: ${(s.r*2).toFixed(2)}mm</div>`;
    } else if(s.type === 'arc'){
      title.textContent = '⌒ 호 (arc)';
      const sd = (s.startAngle*180/Math.PI).toFixed(1);
      const ed = (s.endAngle*180/Math.PI).toFixed(1);
      const arcSweep = Math.abs(parseFloat(ed) - parseFloat(sd));
      const arcLen = s.r * arcSweep * Math.PI / 180;
      html = `
        <div class="prop-row"><label>중심 X</label><input type="number" step="0.1" id="sk3cx" value="${dispX(s.cx).toFixed(2)}"></div>
        <div class="prop-row"><label>중심 Y</label><input type="number" step="0.1" id="sk3cy" value="${s.cy.toFixed(2)}"></div>
        <div class="prop-row"><label>반지름</label><input type="number" step="0.1" id="sk3r" value="${s.r.toFixed(2)}"></div>
        <div class="prop-row"><label>시작°</label><input type="number" step="0.1" id="sk3sd" value="${sd}"></div>
        <div class="prop-row"><label>끝°</label><input type="number" step="0.1" id="sk3ed" value="${ed}"></div>
        <div class="prop-row"><label>색상</label><input type="color" id="sk3color" value="${s.color||'#000000'}"></div>
        <button onclick="sk3ApplySelProp()" style="width:100%;margin-top:6px;background:#27ae60;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer">적용</button>
        <div style="font-size:10px;color:#888;margin-top:4px">호 폭: ${arcSweep.toFixed(1)}° · 호 길이: ${arcLen.toFixed(2)}mm</div>`;
    } else if(s.type === 'fill'){
      // v8.45: 채움 객체 속성
      title.textContent = '🎨 채움 (fill)';
      const area = (function(){
        let a = 0;
        for(let i=0, j=s.vertices.length-1; i<s.vertices.length; j=i++){
          a += (s.vertices[j].x+s.vertices[i].x)*(s.vertices[j].y-s.vertices[i].y);
        }
        return Math.abs(a)/2;
      })();
      html = `
        <div class="prop-row"><label>채움색</label><input type="color" id="sk3fillColor" value="${s.color||'#ffe599'}"></div>
        <div class="prop-row"><label>외곽선</label>
          <select id="sk3fillStrokeOn" style="background:#1a1a1a;color:#fff;border:1px solid #444">
            <option value="0" ${(!s.stroke||(s.strokeWidth||0)<=0)?'selected':''}>없음</option>
            <option value="1" ${(s.stroke&&(s.strokeWidth||0)>0)?'selected':''}>표시</option>
          </select>
        </div>
        <div class="prop-row"><label>외곽색</label><input type="color" id="sk3fillStroke" value="${s.stroke||'#000000'}"></div>
        <div class="prop-row"><label>외곽두께</label><input type="number" step="0.5" id="sk3fillStrokeW" value="${s.strokeWidth||1.5}" min="0.5"></div>
        <button onclick="sk3ApplyFillProp()" style="width:100%;margin-top:6px;background:#27ae60;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer">적용</button>
        <div style="display:flex;gap:4px;margin-top:6px">
          <button onclick="sk3FillToExtrude()" style="flex:2;background:#9b59b6;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer;font-weight:bold" title="🟦 돌출: 9각/다각형 부품에 적합. 단면 모양 그대로 Z방향 두께를 줘서 각진 부품 생성">🟦 돌출 (권장)</button>
          <button onclick="sk3FillToRevolve()" style="flex:1;background:#3498db;color:#fff;border:none;padding:5px;border-radius:4px;cursor:pointer;font-size:11px" title="🌀 회전체: 회전대칭 부품(디스크/링/씰)용. 다각형은 회전 시 둥글게 됨">🌀 회전체</button>
        </div>
        <div style="font-size:9px;color:#999;margin-top:3px;line-height:1.4">
          💡 다각형(9각 등) → <b style="color:#bd9eff">돌출</b>이 형태 유지. 회전체는 회전대칭으로 둥글게 됨
        </div>
        <button onclick="sk3DeleteSelectedFill()" style="width:100%;margin-top:4px;background:#c0392b;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer">🗑 채움 삭제</button>
        <div style="font-size:10px;color:#888;margin-top:6px">점 ${s.vertices.length}개 · 면적 ${area.toFixed(2)}mm²</div>`;
    } else {
      title.textContent = '? ' + s.type;
      html = '<div style="font-size:10px;color:#888">이 도형은 속성 편집을 지원하지 않습니다.</div>';
    }
    body.innerHTML = html;
    return;
  }
  // 2) 현재 펜 점 (penCur)
  if(state.penCur >= 0 && state.penPoints[state.penCur]){
    const i = state.penCur, p = state.penPoints[i];
    panel.style.display = 'block';
    title.textContent = '● 점 P' + i;
    // v8.15: 연결된 선들의 절대각도 계산
    // v8.30: 각 연결선의 절대각도/길이를 input으로 만들어 수정 가능
    const tol = 0.01;
    const connected = [];
    state.shapes.forEach((s, sIdx) => {
      if(s.type !== 'line') return;
      if(Math.abs(s.x1 - p.x) < tol && Math.abs(s.y1 - p.y) < tol){
        // 이 점이 P1 → 다른 끝점은 P2 (이동 대상)
        let deg = Math.atan2(s.y2-s.y1, s.x2-s.x1) * 180 / Math.PI;
        if(deg < 0) deg += 360;
        const len = Math.hypot(s.x2-s.x1, s.y2-s.y1);
        connected.push({deg, len, ex:s.x2, ey:s.y2, shapeIdx:sIdx, endIs:'P2'});
      } else if(Math.abs(s.x2 - p.x) < tol && Math.abs(s.y2 - p.y) < tol){
        // 이 점이 P2 → 다른 끝점은 P1 (이동 대상)
        let deg = Math.atan2(s.y1-s.y2, s.x1-s.x2) * 180 / Math.PI;
        if(deg < 0) deg += 360;
        const len = Math.hypot(s.x1-s.x2, s.y1-s.y2);
        connected.push({deg, len, ex:s.x1, ey:s.y1, shapeIdx:sIdx, endIs:'P1'});
      }
    });
    let linesHtml = '';
    if(connected.length > 0){
      connected.sort((a,b) => a.deg - b.deg);
      linesHtml = '<div style="font-size:10px;color:#aac8ff;margin-top:6px;border-top:1px solid #333;padding-top:5px"><b>📐 연결된 선 ' + connected.length + '개</b> (P' + i + '에서 나가는 방향)<br><span style="color:#666;font-size:9px">각도/길이 수정 → 다른 끝점이 이동</span></div>';
      connected.forEach((c, k) => {
        // v8.31: input에 메타데이터 임베드 (계산기 자동 적용용)
        const metaJson = JSON.stringify({pointIdx:i, shapeIdx:c.shapeIdx, fixedEnd:c.endIs, connIdx:k}).replace(/"/g,'&quot;');
        linesHtml += '<div style="margin-top:4px;padding:4px;background:#1f2530;border:1px solid #2e3a45;border-radius:3px">' +
          '<div style="display:flex;gap:4px;align-items:center;font-size:10px;color:#bbb">' +
            '<span style="width:28px;color:#f39c12">↗각</span>' +
            '<input type="number" step="0.01" id="sk3conn_deg_' + k + '" data-conn-meta="' + metaJson + '" value="' + c.deg.toFixed(2) + '" style="flex:1;width:60px;background:#0a0e14;color:#f39c12;border:1px solid #444;border-radius:3px;padding:2px 4px;font-size:10px">' +
            '<span style="color:#666">°</span>' +
          '</div>' +
          '<div style="display:flex;gap:4px;align-items:center;margin-top:3px;font-size:10px;color:#bbb">' +
            '<span style="width:28px;color:#aac8ff">길이</span>' +
            '<input type="number" step="0.01" id="sk3conn_len_' + k + '" data-conn-meta="' + metaJson + '" value="' + c.len.toFixed(2) + '" style="flex:1;width:60px;background:#0a0e14;color:#aac8ff;border:1px solid #444;border-radius:3px;padding:2px 4px;font-size:10px">' +
            '<span style="color:#666">mm</span>' +
          '</div>' +
          '<div style="font-size:9px;color:#666;margin-top:2px">현재 끝점: (' + dispX(c.ex).toFixed(2) + ', ' + c.ey.toFixed(2) + ')</div>' +
          '<button onclick="sk3ApplyConnectedLine(' + i + ',' + c.shapeIdx + ',\'' + c.endIs + '\',' + k + ')" style="width:100%;margin-top:3px;padding:3px;background:#3a7ad4;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:10px">적용</button>' +
          '</div>';
      });
    } else {
      linesHtml = '<div style="font-size:10px;color:#666;margin-top:6px;border-top:1px solid #333;padding-top:5px">연결된 선 없음</div>';
    }
    body.innerHTML = `
      <div class="prop-row"><label>P${i}.X</label><input type="number" step="0.01" id="sk3pxv" value="${dispX(p.x).toFixed(3)}"></div>
      <div class="prop-row"><label>P${i}.Y</label><input type="number" step="0.01" id="sk3pyv" value="${p.y.toFixed(3)}"></div>
      <button onclick="sk3ApplyPointProp(${i})" style="width:100%;margin-top:6px;background:#27ae60;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer">적용</button>
      <div style="font-size:10px;color:#888;margin-top:4px">P${i} 좌표 변경 시 연결된 선도 함께 이동</div>
      ${linesHtml}`;
    return;
  }
  // 3) 다중 선택 시 카운트
  if(state.selectedShapes && state.selectedShapes.size > 1){
    panel.style.display = 'block';
    title.textContent = '📦 ' + state.selectedShapes.size + '개 선택';
    body.innerHTML = '<div style="font-size:11px;color:#aaa">여러 도형이 선택되었습니다. 단일 선택 시 속성 편집이 표시됩니다.</div>';
    return;
  }
  // 그 외엔 숨김
  panel.style.display = 'none';
};

// v8.14: 우측 속성 패널의 input에 Enter 키 → 적용 자동 호출
(function(){
  const panel = document.getElementById('sk3SelProp');
  if(!panel) return;
  panel.addEventListener('keydown', (e) => {
    if(e.key !== 'Enter') return;
    if(e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    // 점이면 sk3ApplyPointProp, 도형이면 sk3ApplySelProp
    if(document.getElementById('sk3pxv') || document.getElementById('sk3pyv')){
      if(typeof sk3ApplyPointProp === 'function') sk3ApplyPointProp(state.penCur);
    } else {
      if(typeof sk3ApplySelProp === 'function') sk3ApplySelProp();
    }
  });
})();

// v8.10: 도형 속성 적용
window.sk3ApplySelProp = function(){
  if(!state.selectedShapes || state.selectedShapes.size !== 1) return;
  const idx = [...state.selectedShapes][0];
  const s = state.shapes[idx];
  if(!s) return;
  pushHistory();
  // v8.14: 수식 입력 지원
  const _v = id => sk3EvalExpr((document.getElementById(id)||{}).value);
  const _c = id => (document.getElementById(id)||{}).value;
  // v8.25: X 입력값은 표시 기준 → 실제 좌표로 변환 (inpX), Y는 그대로
  if(s.type === 'line' || s.type === 'rect'){
    if(isFinite(_v('sk3p1x'))) s.x1 = inpX(_v('sk3p1x'));
    if(isFinite(_v('sk3p1y'))) s.y1 = _v('sk3p1y');
    if(isFinite(_v('sk3p2x'))) s.x2 = inpX(_v('sk3p2x'));
    if(isFinite(_v('sk3p2y'))) s.y2 = _v('sk3p2y');
  } else if(s.type === 'circle'){
    if(isFinite(_v('sk3cx'))) s.cx = inpX(_v('sk3cx'));
    if(isFinite(_v('sk3cy'))) s.cy = _v('sk3cy');
    if(isFinite(_v('sk3r')) && _v('sk3r') > 0) s.r = _v('sk3r');
  } else if(s.type === 'arc'){
    if(isFinite(_v('sk3cx'))) s.cx = inpX(_v('sk3cx'));
    if(isFinite(_v('sk3cy'))) s.cy = _v('sk3cy');
    if(isFinite(_v('sk3r')) && _v('sk3r') > 0) s.r = _v('sk3r');
    if(isFinite(_v('sk3sd'))) s.startAngle = _v('sk3sd') * Math.PI / 180;
    if(isFinite(_v('sk3ed'))) s.endAngle = _v('sk3ed') * Math.PI / 180;
  }
  const cval = _c('sk3color'); if(cval) s.color = cval;
  const lwval = _v('sk3lw'); if(isFinite(lwval) && lwval > 0) s.lineWidth = lwval;
  redrawSketch(); updateInfo();
  toast('✓ 속성 적용');
};

// v8.10: 점 속성 적용 (연결된 선도 같이 이동)
window.sk3ApplyPointProp = function(idx){
  const p = state.penPoints[idx];
  if(!p) return;
  // v8.14: 수식 입력 지원 (25+25 등)
  // v8.25: X 입력값은 표시 기준 → 실제 좌표로 변환
  const nxDisp = sk3EvalExpr((document.getElementById('sk3pxv')||{}).value);
  const nx = isFinite(nxDisp) ? inpX(nxDisp) : nxDisp;
  const ny = sk3EvalExpr((document.getElementById('sk3pyv')||{}).value);
  if(!isFinite(nx) || !isFinite(ny)) return;
  pushHistory();
  const tol = 0.01;
  state.shapes.forEach(s => {
    if(s.type !== 'line') return;
    if(Math.abs(s.x1-p.x)<tol && Math.abs(s.y1-p.y)<tol){ s.x1=nx; s.y1=ny; }
    if(Math.abs(s.x2-p.x)<tol && Math.abs(s.y2-p.y)<tol){ s.x2=nx; s.y2=ny; }
  });
  p.x = nx; p.y = ny;
  redrawSketch(); updateInfo();
  sk3UpdateSelProp();
  toast('✓ P' + idx + ' → 표시X=' + nxDisp + ' (실제X=' + nx + ', Y=' + ny + ')');
};

// v8.30: 점 속성에서 연결된 선의 각도/길이 수정 적용
// pointIdx: 기준 점 인덱스 (penPoints)
// shapeIdx: 대상 선의 인덱스
// fixedEnd: 'P1' or 'P2' — 어느 끝점이 이동 대상인지 (이 끝이 새 위치로 옮겨감)
// connIdx: HTML id의 접미사 (sk3conn_deg_N, sk3conn_len_N)
window.sk3ApplyConnectedLine = function(pointIdx, shapeIdx, fixedEnd, connIdx){
  const p = state.penPoints[pointIdx];
  const s = state.shapes[shapeIdx];
  if(!p || !s || s.type !== 'line'){ toast('대상 선을 찾을 수 없음'); return; }
  const degInp = document.getElementById('sk3conn_deg_' + connIdx);
  const lenInp = document.getElementById('sk3conn_len_' + connIdx);
  if(!degInp || !lenInp) return;
  const deg = sk3EvalExpr(degInp.value);
  const len = sk3EvalExpr(lenInp.value);
  if(!isFinite(deg) || !isFinite(len) || len < 0){ toast('각도/길이 입력 오류'); return; }
  pushHistory();
  // 기준점(P pointIdx)에서 각도/길이만큼 떨어진 점이 새 끝점
  const rad = deg * Math.PI / 180;
  const newEx = p.x + Math.cos(rad) * len;
  const newEy = p.y + Math.sin(rad) * len;
  // fixedEnd에 따라 선의 어느 끝을 옮길지 결정
  const tol = 0.01;
  let oldEx, oldEy;
  if(fixedEnd === 'P2'){
    // 기준점이 P1(s.x1,s.y1) → 옮길 곳은 P2
    oldEx = s.x2; oldEy = s.y2;
    s.x2 = newEx; s.y2 = newEy;
  } else {
    // 기준점이 P2(s.x2,s.y2) → 옮길 곳은 P1
    oldEx = s.x1; oldEy = s.y1;
    s.x1 = newEx; s.y1 = newEy;
  }
  // 이동된 끝점과 일치하던 펜점도 함께 이동
  state.penPoints.forEach(pp => {
    if(pp === p) return; // 기준점은 그대로
    if(Math.abs(pp.x - oldEx) < tol && Math.abs(pp.y - oldEy) < tol){
      pp.x = newEx; pp.y = newEy;
    }
  });
  redrawSketch(); updateInfo();
  sk3UpdateSelProp();
  toast('✓ 선 #' + shapeIdx + ' 갱신: ' + deg.toFixed(2) + '°, ' + len.toFixed(2) + 'mm → (' + dispX(newEx).toFixed(2) + ',' + newEy.toFixed(2) + ')');
};

function selectShapeAt(wp, addToSel){
  if(!addToSel) state.selectedShapes.clear();
  const tol = 5 / state.pixelsPerMm;
  for(let i = state.shapes.length - 1; i >= 0; i--){
    const s = state.shapes[i];
    let hit = false;
    if(s.type === 'line'){
      hit = distToLine(wp, {x:s.x1,y:s.y1}, {x:s.x2,y:s.y2}) < tol;
    } else if(s.type === 'rect'){
      const minX = Math.min(s.x1,s.x2), maxX = Math.max(s.x1,s.x2);
      const minY = Math.min(s.y1,s.y2), maxY = Math.max(s.y1,s.y2);
      hit = wp.x >= minX-tol && wp.x <= maxX+tol && wp.y >= minY-tol && wp.y <= maxY+tol;
    } else if(s.type === 'circle'){
      const d = Math.sqrt((wp.x-s.cx)**2 + (wp.y-s.cy)**2);
      hit = Math.abs(d - s.r) < tol || d < s.r;
    } else if(s.type === 'arc'){
      const d = Math.sqrt((wp.x-s.cx)**2 + (wp.y-s.cy)**2);
      hit = Math.abs(d - s.r) < tol;
    } else if(s.type === 'fill'){
      // v8.45: 채움 객체 — 폴리곤 내부 클릭으로 선택
      if(s.vertices && s.vertices.length >= 3){
        hit = _fillInPolygon(wp, s.vertices);
      }
    }
    if(hit){
      if(state.selectedShapes.has(i)) state.selectedShapes.delete(i);
      else state.selectedShapes.add(i);
      redrawSketch();
      updateInfo();
      return;
    }
  }
  redrawSketch();
  updateInfo();
}

function distToLine(p, a, b){
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx*dx + dy*dy;
  if(len2 < 0.0001) return Math.sqrt((p.x-a.x)**2 + (p.y-a.y)**2);
  let t = ((p.x-a.x)*dx + (p.y-a.y)*dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t*dx, py = a.y + t*dy;
  return Math.sqrt((p.x-px)**2 + (p.y-py)**2);
}

function setTool(t){
  state.tool = t;
  state.drawing = null;
  document.querySelectorAll('.toolbar button').forEach(b=>{
    if(b.id && b.id.startsWith('btn-') && b.id !== 'btn-gridsnap'){ b.classList.remove('active'); }
  });
  // v8.80: 도구 버튼은 .on(주황)으로 활성 표시. 단 토글형(채움/스윕/연결 등)은 자체 핸들러가 관리하므로 제외
  ['btn-select'].forEach(id=>{ const e=document.getElementById(id); if(e) e.classList.remove('on'); });
  const btn = document.getElementById('btn-' + t);
  if(btn) btn.classList.add('on');
  const names = {line:'선', rect:'사각형', circle:'원', arc:'호', select:'선택', fillet:'필렛', wipe:'쓸어지우기', pen:'펜(한붓)'};
  document.getElementById('footTool').textContent = names[t] || t;
  document.getElementById('curTool').textContent = names[t] || t;
  setStat('도구: ' + (names[t]||t));
  redrawSketch();
}

function deleteSelected(){
  if(state.mode === 'sketch'){
    // v8.21: 선택된 도형 삭제 시 그 도형의 끝점과 일치하던 펜점도 함께 정리
    // (단, 그 펜점이 남은 다른 도형의 끝점과도 일치하면 보존)
    const hasShapes = state.selectedShapes && state.selectedShapes.size > 0;
    const hasPen = state.penCur >= 0 && state.penPoints[state.penCur];
    if(!hasShapes && !hasPen){ toast('선택된 도형/점이 없습니다'); return; }
    pushHistory();
    if(hasShapes){
      const idxs = [...state.selectedShapes].sort((a,b)=>b-a);
      // 삭제 전: 삭제될 도형들의 끝점/중심점 좌표 수집
      const tol = 0.01;
      const deletedEnds = [];
      idxs.forEach(i => {
        const s = state.shapes[i]; if(!s) return;
        if(s.type === 'line' || s.type === 'rect'){
          deletedEnds.push([s.x1, s.y1], [s.x2, s.y2]);
        } else if(s.type === 'circle' || s.type === 'arc'){
          deletedEnds.push([s.cx, s.cy]);
        }
      });
      // 도형 삭제
      idxs.forEach(i => state.shapes.splice(i, 1));
      // 고아 펜점 정리: 삭제된 끝점에 있던 펜점 중 남은 도형과도 연결 안 된 것
      function hasRemainingShapeEnd(px, py){
        return state.shapes.some(s => {
          if(s.type === 'line' || s.type === 'rect'){
            return (Math.abs(s.x1-px)<tol && Math.abs(s.y1-py)<tol) ||
                   (Math.abs(s.x2-px)<tol && Math.abs(s.y2-py)<tol);
          } else if(s.type === 'circle' || s.type === 'arc'){
            return Math.abs(s.cx-px)<tol && Math.abs(s.cy-py)<tol;
          }
          return false;
        });
      }
      const beforePts = state.penPoints.length;
      state.penPoints = state.penPoints.filter(p => {
        const wasConnected = deletedEnds.some(([ex,ey]) =>
          Math.abs(p.x-ex)<tol && Math.abs(p.y-ey)<tol);
        if(!wasConnected) return true;  // 원래부터 도형과 무관한 점은 보존
        return hasRemainingShapeEnd(p.x, p.y);  // 다른 도형과도 연결되어 있으면 보존
      });
      const removedPts = beforePts - state.penPoints.length;
      // penCur 조정
      if(state.penCur >= state.penPoints.length) state.penCur = state.penPoints.length - 1;
      state.selectedShapes.clear();
      redrawSketch(); updateInfo();
      if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
      toast('🗑 도형 ' + idxs.length + '개' + (removedPts > 0 ? ' + 펜점 ' + removedPts + '개' : '') + ' 삭제');
      return;
    }
    if(hasPen){
      // 펜 점 삭제: 그 점을 끝점으로 가진 모든 선도 함께
      const p = state.penPoints[state.penCur];
      const tol = 0.01;
      const before = state.shapes.length;
      state.shapes = state.shapes.filter(s => {
        if(s.type !== 'line') return true;
        if(Math.abs(s.x1-p.x)<tol && Math.abs(s.y1-p.y)<tol) return false;
        if(Math.abs(s.x2-p.x)<tol && Math.abs(s.y2-p.y)<tol) return false;
        return true;
      });
      const removed = before - state.shapes.length;
      state.penPoints.splice(state.penCur, 1);
      state.penCur = Math.min(state.penCur, state.penPoints.length - 1);
      redrawSketch(); updateInfo();
      toast('P 점 1개 + 연결선 ' + removed + '개 삭제');
    }
  } else if(state.selectedPartId){
    deletePart();
  }
}

function clearSketch(){
  // v8.21: 도형 또는 펜점이 하나라도 있으면 진행
  const hasBg = !!state.bgImage;
  if(state.shapes.length === 0 && (!state.penPoints || state.penPoints.length === 0) && !hasBg) return;
  if(!confirm('스케치 전체를 삭제하시겠습니까?\n(도형 + 펜점 + 배경 이미지 모두)')) return;
  pushHistory();
  state.shapes = [];
  state.selectedShapes.clear();
  // v8.21: 펜점도 함께 정리 (이미지의 P0~P4 잔존 버그 해결)
  state.penPoints = [];
  state.penCur = -1;
  state.penOrigin = null;
  state.drawing = null;
  // v8.89: 배경 이미지(추적 원본)도 제거 — 외곽선 잔상 방지
  state.bgImage = null;
  state._bgImgTemp = null;
  if(typeof clearFloorSketch === 'function') clearFloorSketch(); // 3D 바닥 미리보기 잔상 제거
  // 캔버스 강제 clear (잔상 방지)
  if(typeof skCanvas !== 'undefined' && skCtx){ skCtx.clearRect(0,0,skCanvas.width,skCanvas.height); }
  redrawSketch();
  updateInfo();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  toast('🧹 스케치 삭제됨 (도형 + 펜점 + 배경)');
}

// v4.6: 부품 1개를 저장 가능한 평형 데이터로 직렬화 (mesh의 현재 위치/회전/크기 포함)
function serializePart(p){
  const t = p.mesh ? {
    pos: [p.mesh.position.x, p.mesh.position.y, p.mesh.position.z],
    rot: [p.mesh.rotation.x, p.mesh.rotation.y, p.mesh.rotation.z],
    scl: [p.mesh.scale.x, p.mesh.scale.y, p.mesh.scale.z]
  } : null;

  // v5.9: 그룹은 자식 스냅샷 + 빼기여부로 재구성 가능하게 저장
  if(p.type === 'group'){
    const pr = p.params || {};
    return {
      id: p.id, name: p.name, type: 'group',
      color: p.color, opacity: p.opacity, visible: p.visible, material: p.material,
      _xform: t,
      params: {
        childCount: pr.childCount, holeCount: pr.holeCount, solidCount: pr.solidCount,
        csgApplied: !!pr.csgApplied, visualHole: !!pr.visualHole,
        // 자식 스냅샷 깊은 복사 (각 child는 이미 직렬화된 평형 데이터)
        childSnaps: pr.childSnaps ? JSON.parse(JSON.stringify(pr.childSnaps)) : []
      }
    };
  }

  // v7.1.4: 가져온 메시는 geometry 정점 배열을 직접 저장
  if(p.type === 'imported_mesh' && p.mesh && p.mesh.geometry){
    const pos = p.mesh.geometry.attributes.position;
    const arr = Array.from(pos.array);
    const idxAttr = p.mesh.geometry.index;
    return {
      id: p.id, name: p.name, type: p.type,
      color: p.color, opacity: p.opacity, visible: p.visible, material: p.material,
      params: { imported: true, format: (p.params&&p.params.format)||'stl',
                positions: arr, indices: idxAttr ? Array.from(idxAttr.array) : null },
      _isHole: !!p._isHole, _xform: t
    };
  }

  return {
    id: p.id, name: p.name, type: p.type,
    color: p.color, opacity: p.opacity, visible: p.visible, material: p.material,
    sourceShapes: p.sourceShapes ? JSON.parse(JSON.stringify(p.sourceShapes)) : undefined,
    params: p.params ? JSON.parse(JSON.stringify(p.params)) : {},
    _isHole: !!p._isHole,
    _xform: t
  };
}

// v4.6: 직렬화 데이터 → 부품 객체로 복원 (타입별 rebuildXXX 재사용)
function deserializePart(pdata){
  // v5.9: 그룹 복원 — 자식 스냅샷으로 재구성 후 (필요시) CSG 빼기 재실행
  if(pdata.type === 'group'){
    return rebuildGroup(pdata);
  }

  let part = null;
  if(pdata.type === 'extrude') part = rebuildExtrude(pdata);
  else if(pdata.type === 'revolve') part = rebuildRevolve(pdata);
  else if(pdata.type === 'svgrevolve') part = rebuildSvgRevolve(pdata);
  else if(pdata.type === 'imported_mesh') part = rebuildImportedMesh(pdata);
  else if(pdata.type && pdata.type.startsWith('primitive_')) part = rebuildPrimitive(pdata);
  else if(pdata.type === 'bolt') part = rebuildBolt(pdata);
  else if(pdata.type === 'nut') part = rebuildNut(pdata);
  else if(pdata.type === 'spring') part = rebuildSpring(pdata);
  else if(pdata.type === 'text3d') part = rebuildText3D(pdata);
  if(part && part.mesh && pdata._xform){
    const t = pdata._xform;
    part.mesh.position.set(t.pos[0], t.pos[1], t.pos[2]);
    part.mesh.rotation.set(t.rot[0], t.rot[1], t.rot[2]);
    part.mesh.scale.set(t.scl[0], t.scl[1], t.scl[2]);
  }
  // v5.9: 구멍 상태 복원 (빨간 반투명 표시 포함)
  if(part && pdata._isHole){
    part._isHole = true;
    applyHoleMaterial(part);
  }
  // v7.1.4: 재질 복원 (구멍이 아닐 때만 — 구멍은 빨간 반투명 유지)
  if(part && pdata.material && !pdata._isHole){
    part.material = pdata.material;
    const preset = MATERIAL_PRESETS[pdata.material];
    if(preset && part.mesh){
      part.mesh.traverse(o=>{
        if(o.isMesh && o.material && !o.userData._isEdgeOutline){
          o.material.roughness = preset.roughness;
          o.material.metalness = preset.metalness;
          o.material.needsUpdate = true;
        }
      });
    }
  }
  return part;
}

// v5.9: 자식 스냅샷으로 그룹(+빼기) 재구성. 반환 part는 state에 등록되지 않은 단일 part 객체.
function rebuildGroup(pdata){
  const pr = pdata.params || {};
  const snaps = pr.childSnaps || [];
  // 자식 부품들을 임시로 복원 (state.parts에 넣지 않고 mesh만 사용)
  const childParts = snaps.map(s => {
    const cp = deserializePart(s); // 재귀 (자식이 또 그룹일 수도 있음)
    // 자식 변환 적용
    if(cp && cp.mesh && s._xform){
      cp.mesh.position.set(s._xform.pos[0], s._xform.pos[1], s._xform.pos[2]);
      cp.mesh.rotation.set(s._xform.rot[0], s._xform.rot[1], s._xform.rot[2]);
      cp.mesh.scale.set(s._xform.scl[0], s._xform.scl[1], s._xform.scl[2]);
    }
    if(cp) cp._isHole = !!s._isHole;
    return cp;
  }).filter(Boolean);

  const solids = childParts.filter(c => !c._isHole);
  const holes  = childParts.filter(c => c._isHole);
  const group = new THREE.Group();

  if(pr.csgApplied && solids.length > 0 && holes.length > 0){
    // CSG 빼기 재실행 (월드좌표 기준)
    try {
      solids.forEach(sp => {
        sp.mesh.updateMatrixWorld(true);
        const solidMesh = collectSingleMesh(sp.mesh);
        const holeMeshes = [];
        holes.forEach(hp => { hp.mesh.updateMatrixWorld(true); const hm = collectSingleMesh(hp.mesh); if(hm) holeMeshes.push(hm); });
        if(!solidMesh) return;
        const geom = window.CSGEngine.subtractMeshes(solidMesh, holeMeshes);
        if(geom.attributes.position && geom.attributes.position.count >= 3){
          const mat = makeMaterial(sp.color || '#7a8aa0', sp.opacity || 1);
          const rm = new THREE.Mesh(geom, mat);
          group.add(rm);
        }
      });
    } catch(err){
      console.warn('[CSG] 그룹 복원 중 빼기 실패, 단순 합치기로 대체', err);
    }
    // 빼기 결과가 하나도 없으면 솔리드 원본이라도 보여줌
    if(group.children.length === 0){
      solids.forEach(sp => { sp.mesh.updateMatrixWorld(true); group.add(sp.mesh); });
    }
  } else {
    // 단순 그룹 또는 시각적 빼기: 모든 자식 mesh를 그룹에 (구멍은 숨김 처리 옵션)
    childParts.forEach(cp => {
      cp.mesh.updateMatrixWorld(true);
      if(pr.visualHole && cp._isHole) cp.mesh.visible = false;
      group.add(cp.mesh);
    });
  }

  const part = {
    id: pdata.id, name: pdata.name, type: 'group',
    color: pdata.color || '#888', opacity: pdata.opacity != null ? pdata.opacity : 1,
    visible: pdata.visible !== false,
    mesh: group,
    params: {
      childCount: pr.childCount, holeCount: pr.holeCount, solidCount: pr.solidCount,
      csgApplied: !!pr.csgApplied, visualHole: !!pr.visualHole,
      childSnaps: snaps  // 다음 직렬화/해제 위해 유지
    }
  };
  // 그룹 자체의 변환 (그룹 이동/회전이 있었으면)
  if(pdata._xform){
    part.mesh.position.set(pdata._xform.pos[0], pdata._xform.pos[1], pdata._xform.pos[2]);
    part.mesh.rotation.set(pdata._xform.rot[0], pdata._xform.rot[1], pdata._xform.rot[2]);
    part.mesh.scale.set(pdata._xform.scl[0], pdata._xform.scl[1], pdata._xform.scl[2]);
  }
  return part;
}

// v5.9: 구멍 표시(빨간 반투명) 적용 — toggleHole의 시각 처리 재사용
function applyHoleMaterial(part){
  if(!part || !part.mesh) return;
  part.mesh.traverse(o => {
    if(o.isMesh && o.material){
      if(!o.userData._origMat){
        o.userData._origMat = Array.isArray(o.material) ? o.material.map(m=>m.clone()) : o.material.clone();
      }
      const setHoleMat = (m) => {
        m.color = new THREE.Color(0xff3333); m.transparent = true; m.opacity = 0.4;
        if(m.emissive) m.emissive.setHex(0x550000);
      };
      if(Array.isArray(o.material)) o.material.forEach(setHoleMat); else setHoleMat(o.material);
    }
  });
}

// v4.6: 스냅샷 = 2D 스케치 + 3D 부품 전체 상태
function snapshotState(){
  return {
    shapes: JSON.parse(JSON.stringify(state.shapes)),
    parts: state.parts.map(serializePart),
    partIdCounter: state.partIdCounter,
    penPoints: JSON.parse(JSON.stringify(state.penPoints || [])),
    penCur: state.penCur != null ? state.penCur : -1,
    penOrigin: state.penOrigin ? {x:state.penOrigin.x, y:state.penOrigin.y} : null
  };
}

function pushHistory(){
  state.history = state.history.slice(0, state.historyIdx + 1);
  state.history.push(snapshotState());
  // v8.18: 한 단계씩 정밀 추적을 위해 50 → 200으로 확대
  if(state.history.length > 200) state.history.shift();
  state.historyIdx = state.history.length - 1;
}

// v4.6: 스냅샷 1개를 화면에 그대로 복원 (스케치 + 3D 부품)
function restoreSnapshot(snap){
  // 기존 부품 메쉬 제거
  state.parts.forEach(p => removePartFromScene(p));
  state.parts = [];
  // 스케치 복원
  state.shapes = JSON.parse(JSON.stringify(snap.shapes || []));
  if(snap.partIdCounter !== undefined) state.partIdCounter = snap.partIdCounter;
  state.penPoints = JSON.parse(JSON.stringify(snap.penPoints || []));
  state.penCur = snap.penCur != null ? snap.penCur : -1;
  state.penOrigin = snap.penOrigin ? {x:snap.penOrigin.x, y:snap.penOrigin.y} : null;
  // 3D 부품 복원
  (snap.parts || []).forEach(pdata => {
    const part = deserializePart(pdata);
    if(part && part.mesh){
      state.parts.push(part);
      addPartToScene(part);
    }
  });
  // 선택 상태 초기화
  state.selectedShapes.clear();
  state.selectedPartId = null;
  state.parts.forEach(p => p._selected = false);
  hideTransformHandles();
  const _spp = document.getElementById('selectedPartProp');
  if(_spp) _spp.style.display = 'none';
  const _zrp = document.getElementById('zRevolvePanel');
  if(_zrp) _zrp.style.display = 'none';
  renderPartsList();
  redrawSketch();
  updateInfo();
}

function undo(){
  if(state.historyIdx <= 0){toast('↶ 더 이상 되돌릴 수 없음 (시작 상태)'); return}
  state.historyIdx--;
  restoreSnapshot(state.history[state.historyIdx]);
  // v8.18: 진행률 명확화 (현재단계/총단계, 남은 undo, 가능 redo)
  const cur = state.historyIdx;
  const max = state.history.length - 1;
  const canRedo = max - cur;
  toast('↶ 되돌리기 ' + cur + '/' + max + ' · ↶' + cur + '회 가능 · ↷' + canRedo + '회 가능');
}

function redo(){
  if(state.historyIdx >= state.history.length - 1){toast('↷ 더 이상 재실행할 수 없음 (최신 상태)'); return}
  state.historyIdx++;
  restoreSnapshot(state.history[state.historyIdx]);
  const cur = state.historyIdx;
  const max = state.history.length - 1;
  const canRedo = max - cur;
  toast('↷ 다시실행 ' + cur + '/' + max + ' · ↶' + cur + '회 가능 · ↷' + canRedo + '회 가능');
}

/* ===== Three.js ===== */
let scene, camera, renderer, gridHelper, axesHelper;

// v4.2: WebGL 지원 여부 점검 + 단계적 폴백으로 안전하게 렌더러 생성
function createRendererSafe(container){
  // 1) WebGL 자체 지원 확인
  const test = document.createElement('canvas');
  const gl = test.getContext('webgl') || test.getContext('experimental-webgl');
  if (!gl){
    showWebGLError(container,
      'WebGL을 사용할 수 없습니다.\n\n해결 방법:\n• 브라우저 설정에서 "하드웨어 가속"을 켜세요\n  (Chrome: 설정 → 시스템 → 하드웨어 가속 사용)\n• 그래픽 드라이버를 최신으로 업데이트\n• 다른 브라우저(Chrome/Edge 최신)로 시도\n• chrome://gpu 에서 WebGL 상태 확인');
    return null;
  }
  // 2) 옵션을 단계적으로 낮춰 WebGLRenderer 생성 시도
  const optionSets = [
    {antialias: true,  powerPreference: 'high-performance'},
    {antialias: false, powerPreference: 'default'},
    {antialias: false, failIfMajorPerformanceCaveat: false}, // 소프트웨어 렌더링 허용
  ];
  for (const opt of optionSets){
    try {
      const r = new THREE.WebGLRenderer(opt);
      if (r && r.getContext()) return r;
    } catch(e){ /* 다음 옵션으로 */ }
  }
  showWebGLError(container,
    'WebGL 컨텍스트 생성에 실패했습니다.\n\n해결 방법:\n• 브라우저 "하드웨어 가속" 켜기\n• 열려있는 다른 탭/프로그램을 닫고 새로고침\n• 그래픽 드라이버 업데이트\n• Chrome/Edge 최신 버전으로 시도');
  return null;
}

// WebGL 사용 불가 시 캔버스 영역에 안내 표시
function showWebGLError(container, msg){
  if (!container) return;
  const div = document.createElement('div');
  div.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:#1a1a1a; color:#eee; padding:24px; text-align:center; z-index:50;';
  div.innerHTML = '<div style="max-width:420px;">' +
    '<div style="font-size:36px; margin-bottom:12px;">⚠️</div>' +
    '<div style="font-size:15px; font-weight:bold; color:#ff8c66; margin-bottom:10px;">3D 뷰어를 시작할 수 없습니다</div>' +
    '<div style="font-size:12px; color:#bbb; white-space:pre-line; line-height:1.6; text-align:left;">' +
    msg.replace(/</g,'&lt;') + '</div></div>';
  container.style.position = 'relative';
  container.appendChild(div);
  console.error('WebGL init failed:', msg);
}

function initThree(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a1a);
  
  const container = document.getElementById('viewerCanvas');
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 600;
  
  camera = new THREE.PerspectiveCamera(45, w/h, 0.1, 10000);
  camera.position.set(150, 150, 200);
  camera.lookAt(0, 0, 0);
  
  // v4.2: WebGL 컨텍스트 생성 견고화 - 실패 시 옵션을 낮춰 재시도, 그래도 안 되면 안내
  renderer = createRendererSafe(container);
  if (!renderer) return; // 생성 실패 시 중단 (안내 메시지 표시됨)
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); // v4.2: pixelRatio 상한(메모리 절약)
  container.appendChild(renderer.domElement);
  
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(100, 200, 150);
  scene.add(dirLight);
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
  dirLight2.position.set(-100, -100, -150);
  scene.add(dirLight2);

  // v7.1.4: 금속/크롬 반사용 절차적 환경맵 (위=밝음, 아래=어두움 그라데이션)
  try {
    const cnv = document.createElement('canvas');
    cnv.width = 64; cnv.height = 256;
    const ctx = cnv.getContext('2d');
    const grd = ctx.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0.0, '#cfe3f0');  // 하늘(위)
    grd.addColorStop(0.45, '#8a9aa8');
    grd.addColorStop(0.5, '#5a6470');  // 지평선
    grd.addColorStop(0.55, '#3a4048');
    grd.addColorStop(1.0, '#22262b');  // 바닥(아래)
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 64, 256);
    const envTex = new THREE.CanvasTexture(cnv);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = envTex;
  } catch(_) {}
  
  // v2.4: 팅커캐드 스타일 격자 - 청록색 메인선, 회색 보조선
  // v8.0: 1mm 보조 그리드(250,000 라인) 제거 — 성능 개선
  // 10mm 메인 그리드만 사용 (50등분 = 2,500 라인)
  gridHelper = new THREE.GridHelper(500, 50, 0x4ec9b0, 0x3a6a6a); // 10mm 격자만
  gridHelper.userData.isMainGrid = true;
  gridHelper.visible = state.showGrid;
  scene.add(gridHelper);
  axesHelper = new THREE.AxesHelper(60);
  // v8.3: 축 색상 — X=빨강, Y=연두, Z=파랑 (표준 RGB 매핑)
  // v8.57: 사용자 요청 — Y(위쪽)와 Z(깊이)의 표시 색상 swap (Y=파랑, Z=연두)
  //   내부 Three.js 축은 그대로 (Y는 여전히 위), 색상 라벨만 CAD 컨벤션에 맞게
  {
    const cX = new THREE.Color(0xff3333); // X 빨강
    const cY = new THREE.Color(0x3366ff); // Y (위쪽) → 파랑
    const cZ = new THREE.Color(0x88ff66); // Z (깊이) → 연두
    const colors = new Float32Array([
      cX.r, cX.g, cX.b,  cX.r, cX.g, cX.b,   // X축 두 점
      cY.r, cY.g, cY.b,  cY.r, cY.g, cY.b,   // Y축(위쪽) 두 점 — 파랑
      cZ.r, cZ.g, cZ.b,  cZ.r, cZ.g, cZ.b    // Z축(깊이) 두 점 — 연두
    ]);
    axesHelper.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    axesHelper.material.vertexColors = true;
    axesHelper.material.needsUpdate = true;
  }
  scene.add(axesHelper);
  
  setupOrbit(renderer.domElement);
  setupRaycastClick(renderer.domElement);
  animate();
}

function onThreeResize(){
  if(!renderer) return;
  const container = document.getElementById('viewerCanvas');
  const w = container.clientWidth;
  const h = container.clientHeight;
  if(w === 0 || h === 0) return;
  if(camera.isPerspectiveCamera){
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  } else if(camera.isOrthographicCamera){
    const r = orbitState ? orbitState.radius : 300;
    const aspect = w/h;
    camera.left = -r*aspect/2;
    camera.right = r*aspect/2;
    camera.top = r/2;
    camera.bottom = -r/2;
    camera.updateProjectionMatrix();
  }
  renderer.setSize(w, h);
}

function animate(){
  requestAnimationFrame(animate);
  if(renderer && scene && camera){
    renderer.render(scene, camera);
    // 치수 라벨 위치 갱신 (선택된 객체가 있을 때만)
    if(transformState.activePart && !dimEditingActive){
      updateDimLabelPositions();
    }
    // v6.5: 편집 모드 정점 마커는 카메라가 움직여도 위치 고정이지만,
    //   부품 변환은 안 바뀌므로 매 프레임 갱신 불필요 (선택/이동 시에만 갱신함)
  }
}

// v1.6: 치수 라벨 시스템
let dimLabels = []; // [{el, axis, getValue, setValue}]
let dimEditingActive = false;

// v8.72: 부품의 로컬 치수(회전 제거, 스케일 포함) — 회전된 부품의 치수 편집 정확도용
function getLocalSize(part){
  const m = part.mesh;
  const q = m.quaternion.clone();
  m.quaternion.identity();
  m.updateMatrixWorld(true);
  const sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
  m.quaternion.copy(q);
  m.updateMatrixWorld(true);
  return sz;
}

function showDimLabels(part){
  hideDimLabels();
  if(state.showDimLabels === false) return; // v6.7: 치수 태그 기본 숨김
  if(!part || !part.mesh) return;
  part.mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(part.mesh);
  const size = bb.getSize(new THREE.Vector3());     // 월드 BB (라벨 위치용)
  const lsz = getLocalSize(part);                   // v8.72: 로컬 치수(회전 무관)
  const center = bb.getCenter(new THREE.Vector3());
  const container = document.getElementById('dimLabels');
  if(!container) return;

  // 3개 축 치수 (Z-up 표시 컨벤션): 가로=X, 세로=Z(깊이), 높이=Y(수직)
  // 값은 로컬 치수(lsz) 사용 — 회전된 부품도 정확히 표시/편집
  const labels = [
    {axis: 'x', label: '가로', value: lsz.x, anchor: new THREE.Vector3(center.x, bb.min.y - size.y*0.15, bb.max.z + size.z*0.1)},
    {axis: 'z', label: '세로', value: lsz.z, anchor: new THREE.Vector3(bb.max.x + size.x*0.15, bb.min.y - size.y*0.15, center.z)},
    {axis: 'y', label: '높이', value: lsz.y, anchor: new THREE.Vector3(bb.max.x + size.x*0.15, center.y, bb.max.z + size.z*0.1)}
  ];

  labels.forEach(L => {
    const el = document.createElement('div');
    el.className = 'dim-label';
    el.textContent = L.label + ': ' + L.value.toFixed(1);
    el.title = L.label + ' (' + L.axis + '축) 치수. 클릭하여 직접 입력';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const inputId = {x:'propSizeX', z:'propSizeY', y:'propSizeZ'}[L.axis];
      const inp = document.getElementById(inputId);
      state.selectedPartId = part.id;
      if(typeof refreshPropPanelTransform === 'function') refreshPropPanelTransform(part);
      if(inp && typeof window.sk3CalcOpen === 'function'){
        inp.value = L.value.toFixed(1);
        window.sk3CalcOpen(inp);
      } else {
        startEditDim(el, L.axis, L.value, part);
      }
    });
    container.appendChild(el);
    dimLabels.push({el, axis: L.axis, anchor: L.anchor, label: L.label});
  });

  // v8.87: 회전 각도 라벨 — 회전값이 있거나 회전 드래그 중이면 표시 (상단 HUD 대체)
  const dRot = (typeof getAbsRot === 'function') ? getAbsRot(part) : {x:0,y:0,z:0};
  const dragAxis = (transformState.draggingHandle && transformState.draggingHandle.type === 'rotate')
    ? transformState.draggingHandle.axis : null;
  // 화면 Z(높이축=내부 Y) 회전을 우선 표시, 없으면 0이 아닌 축
  const angleAxes = [
    {axis:'z', deg:dRot.y, color:'#88aaff'},  // 화면 Z = 내부 Y
    {axis:'x', deg:dRot.x, color:'#ff8888'},
    {axis:'y', deg:dRot.z, color:'#88ff88'}   // 화면 Y = 내부 Z
  ];
  angleAxes.forEach(A => {
    const showThis = (dragAxis === A.axis) || (Math.abs(A.deg) > 0.05);
    if(!showThis) return;
    const el = document.createElement('div');
    el.className = 'dim-label';
    el.style.background = 'rgba(120,140,255,0.92)';
    el.style.borderColor = '#3a5ab0';
    el.textContent = '∠' + A.axis.toUpperCase() + ': ' + A.deg.toFixed(1) + '°';
    el.title = A.axis.toUpperCase() + '축 회전각. 클릭하여 직접 입력';
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      state.selectedPartId = part.id;
      const inputId = {x:'psRotX', y:'psRotY', z:'psRotZ'}[A.axis];
      const inp = document.getElementById(inputId);
      if(inp && typeof window.sk3CalcOpen === 'function'){ inp.value = A.deg.toFixed(1); window.sk3CalcOpen(inp); }
    });
    container.appendChild(el);
    // 부품 위쪽에 배치
    dimLabels.push({el, axis:'_rot_'+A.axis, anchor: new THREE.Vector3(center.x, bb.max.y + size.y*0.12, center.z), label:'∠'});
  });

  updateDimLabelPositions();
}

function hideDimLabels(){
  const container = document.getElementById('dimLabels');
  if(container) container.innerHTML = '';
  dimLabels = [];
}

function updateDimLabels(){
  if(transformState.activePart && state.mode === 'model'){
    showDimLabels(transformState.activePart);
  }
}

function updateDimLabelPositions(){
  if(!renderer || !camera || dimLabels.length === 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  dimLabels.forEach(L => {
    const v = L.anchor.clone().project(camera);
    const x = (v.x + 1) * 0.5 * w;
    const y = (-v.y + 1) * 0.5 * h;
    L.el.style.left = x + 'px';
    L.el.style.top = y + 'px';
    // 카메라 뒤쪽이면 숨김
    L.el.style.display = (v.z > 1) ? 'none' : '';
  });
}

function startEditDim(el, axis, currentValue, part){
  dimEditingActive = true;
  el.classList.add('editing');
  const oldText = el.textContent;
  el.innerHTML = '<input type="number" step="0.1" value="' + currentValue.toFixed(1) + '">';
  const input = el.querySelector('input');
  input.focus();
  input.select();
  function finish(commit){
    dimEditingActive = false;
    el.classList.remove('editing');
    if(commit){
      const newVal = parseFloat(input.value);
      if(!isNaN(newVal) && newVal > 0){
        // v8.72: 로컬 치수 기준으로 factor 계산 (회전된 부품도 정확)
        part.mesh.updateMatrixWorld(true);
        const bbW = new THREE.Box3().setFromObject(part.mesh);
        const cur = getLocalSize(part)[axis];
        if(cur > 0){
          // 중심을 유지하면서 크기 변경
          const center = bbW.getCenter(new THREE.Vector3());
          const factor = newVal / cur;
          part.mesh.scale[axis] *= factor;
          // 위치 보정: scale 후 중심이 바뀌므로 다시 중심으로
          part.mesh.updateMatrixWorld(true);
          const bb2 = new THREE.Box3().setFromObject(part.mesh);
          const newCenter = bb2.getCenter(new THREE.Vector3());
          part.mesh.position[axis] += (center[axis] - newCenter[axis]);
          // 핸들 + 라벨 갱신
          showTransformHandles(part);
          showDimLabels(part);
          toast('📏 ' + axis.toUpperCase() + ' 치수 → ' + newVal.toFixed(1) + 'mm');
          return;
        }
      }
    }
    el.textContent = oldText;
  }
  input.addEventListener('keydown', (ev) => {
    if(ev.key === 'Enter'){ev.preventDefault(); finish(true);}
    else if(ev.key === 'Escape'){ev.preventDefault(); finish(false);}
  });
  input.addEventListener('blur', () => finish(true));
}

// ===== v1.5: 3D 뷰 객체 선택 + 변형 핸들 =====
let transformState = {
  activePart: null,     // 현재 선택된 part (핸들 표시 대상)
  handleGroup: null,    // 핸들들이 담긴 Group
  draggingHandle: null, // 현재 드래그 중인 핸들 정보
  dragStart: null,
  dragStartPos: null,
  dragStartScale: null,
  _rotStart: null,      // 회전 시작 각도 (마우스 좌표 기준)
  _rotInitial: null,    // 회전 시작 시 객체의 rotation
  rotationRing: null,   // v6.3: 회전 아이콘 클릭 시 표시되는 원형 링
  rotationRingAxis: null,
  mode: 'move'          // 'move' | 'scale' | 'rotate'
};

const raycaster = new THREE.Raycaster();
const mouseVec = new THREE.Vector2();

// v3.1: 부품 본체 좌클릭 드래그(수평 이동) 상태
const partDragState = {
  candidate: null,   // 잡힌 부품 (드래그 후보)
  startMouse: null,  // {x,y}
  startPos: null,    // 원래 부품 위치 Vector3
  startHit: null,    // 드래그 시작 시 평면과의 광선 교차점
  plane: null,       // 드래그 기준 평면
  dragging: false,   // 실제로 드래그 중인지 (이동 거리 3px 초과)
  useWorkPlane: false,
  group: null,       // v6.1: 함께 이동할 부품들 [{part, startPos}]
};

// v6.0: 좌클릭 드래그 박스(러버밴드) 선택 상태
const boxSelState = {
  active: false,     // 박스 선택 진행 중
  startX: 0, startY: 0,  // 시작 화면좌표(clientX/Y)
  additive: false,   // Shift/Ctrl 동시 = 기존 선택에 추가
};

function setupRaycastClick(dom){
  dom.addEventListener('pointerdown', (e) => {
    if(e.button !== 0) return;
    // v7.1: 치수 측정 모드 — 클릭으로 점 찍기 (orbit/선택보다 우선)
    if(state.measureMode){
      handleMeasureClick(e);
      e.stopPropagation();
      return;
    }
    // v2.6: 워크플레인 픽 모드 - 다음 클릭은 면 지정 또는 해제
    if(state.workPlanePickMode){
      const hit = pickFaceForWorkPlane(e);
      if(hit){
        setWorkPlaneFromHit(hit);
      } else {
        // 빈 곳 클릭 → 글로벌 바닥으로 복귀
        clearWorkPlane();
        toast('빈 곳 클릭 - 글로벌 바닥으로 복귀');
      }
      e.stopPropagation();
      return;
    }
    // 핸들이 활성화되어 있으면 핸들 클릭 우선 검사 (회전 링 포함)
    if(transformState.handleGroup || transformState.rotationRing){
      const handleHit = pickHandle(e);
      if(handleHit){
        // v6.3: 회전 아이콘 클릭 → 그 축의 원형 회전 링 표시 (드래그는 링에서)
        if(handleHit.type === 'rotateIcon'){
          showRotationRing(transformState.activePart, handleHit.axis);
          orbitState.rotating = false;
          orbitState.panning = false;
          e.stopPropagation();
          return;
        }
        transformState.draggingHandle = handleHit;
        // 시작 위치/크기 저장
        const p = transformState.activePart;
        transformState.dragStartPos = p.mesh.position.clone();
        transformState.dragStartScale = p.mesh.scale.clone();
        transformState.dragStart = {x: e.clientX, y: e.clientY};
        transformState._rotStart = null; // 회전 시작 각도 재계산용
        transformState._rotInitial = null;
        // v2.5: scale 시작 BB 캐시 초기화 (handleDrag 첫 호출 시 캡처)
        transformState._scaleStartBB = null;
        transformState._scaleStartPos = null;
        transformState._scaleStartLocal = null;
        transformState._scaleStartWBB = null;
        orbitState.rotating = false;
        orbitState.panning = false;
        return;
      }
    }
    // 객체 클릭 검사 (orbit 시작 전에)
    const partHit = pickPart(e);
    if(partHit){
      // v3.1: Ctrl/Cmd 또는 Shift 모두 다중 선택 토글
      const multi = e.ctrlKey || e.metaKey || e.shiftKey;
      if(multi){
        partHit._selected = !partHit._selected;
      } else {
        // v6.1: 이미 다중 선택된 부품을 클릭하면 선택 유지(그룹 드래그용),
        //       선택 안 된 부품을 클릭하면 단일 선택으로 전환
        if(!partHit._selected){
          state.parts.forEach(p => p._selected = false);
          partHit._selected = true;
        }
      }
      state.selectedPartId = partHit.id;
      // 속성 패널 갱신
      document.getElementById('selectedPartProp').style.display = '';
      document.getElementById('propPartName').value = partHit.name;
      document.getElementById('propPartColor').value = partHit.color;
      document.getElementById('propPartOpacity').value = Math.round(partHit.opacity * 100);
      // v3.3: 위치/크기/회전 패널 갱신
      refreshPropPanelTransform(partHit);
      const zrp = document.getElementById('zRevolvePanel');
      if(zrp){
        zrp.style.display = '';
        const cInp = document.getElementById('zrevColor');
        if(cInp) cInp.value = partHit.color;
        updateZRevolvePreviewInfo(partHit);
      }
      renderPartsList();
      updateMultiSelectHighlight();
      // 핸들 표시 (단일 선택일 때만)
      const selCount = state.parts.filter(p => p._selected).length;
      if(selCount === 1){
        showTransformHandles(partHit);
        setStat('1개 선택됨 · 좌드래그=이동/박스선택 · 우클릭=회전 · 휠클릭=화면이동');
      } else if(selCount > 1){
        hideTransformHandles();
        setStat('🔗 ' + selCount + '개 선택됨 · 드래그=함께 이동 · 그룹화(Ctrl+G) · 정렬(L)');
      } else {
        hideTransformHandles();
        setStat('선택 해제됨');
      }
      // orbit 비활성화
      orbitState.rotating = false;
      orbitState.panning = false;
      // v6.1: 부품 드래그 후보 — modifier 없이 선택된 부품을 잡으면
      //       선택된 모든 부품을 함께 이동
      if(!multi && partHit._selected){
        const selectedNow = state.parts.filter(p => p._selected && p.mesh);
        partDragState.candidate = partHit;
        partDragState.startMouse = {x: e.clientX, y: e.clientY};
        partDragState.startPos = partHit.mesh.position.clone();
        partDragState.dragging = false;
        // 함께 이동할 부품들의 시작 위치 저장
        partDragState.group = selectedNow.map(p => ({ part: p, startPos: p.mesh.position.clone() }));
        // 워크플레인이 활성화되어 있으면 그 평면을, 아니면 잡은 부품 바닥 높이 평면을 드래그 평면으로
        const wp = state.workPlane;
        if(wp){
          partDragState.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(wp.normal, wp.origin);
          partDragState.useWorkPlane = true;
        } else {
          partHit.mesh.updateMatrixWorld(true);
          const bb = new THREE.Box3().setFromObject(partHit.mesh);
          const baseY = bb.min.y;
          partDragState.plane = new THREE.Plane(new THREE.Vector3(0,1,0), -baseY);
          partDragState.useWorkPlane = false;
        }
        const rect = renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, camera);
        const hitPt = new THREE.Vector3();
        if(ray.ray.intersectPlane(partDragState.plane, hitPt)){
          partDragState.startHit = hitPt.clone();
        } else {
          partDragState.startHit = null;
        }
      }
      e.stopPropagation();
      return;
    }
    // v6.0: 빈 공간 좌클릭 → 박스(러버밴드) 선택 시작
    boxSelState.active = true;
    boxSelState.startX = e.clientX;
    boxSelState.startY = e.clientY;
    boxSelState.additive = (e.ctrlKey || e.metaKey || e.shiftKey);
    // additive 아니면 기존 선택 해제 (드래그가 거의 없으면 단순 빈클릭=해제로 동작)
    if(!boxSelState.additive){
      state.parts.forEach(p => p._selected = false);
      hideTransformHandles();
      renderPartsList();
      updateMultiSelectHighlight();
    }
  }, true);

  dom.addEventListener('pointermove', (e) => {
    if(transformState.draggingHandle){
      handleDrag(e);
      e.stopPropagation();
      return;
    }
    // v6.0: 좌클릭 박스 선택 드래그 → 사각형 표시
    if(boxSelState.active){
      const box = document.getElementById('selectBox');
      const area = document.getElementById('viewerArea');
      if(box && area){
        const r = area.getBoundingClientRect();
        const x1 = boxSelState.startX, y1 = boxSelState.startY;
        const x2 = e.clientX, y2 = e.clientY;
        const left = Math.min(x1, x2) - r.left;
        const top  = Math.min(y1, y2) - r.top;
        const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
        box.style.display = 'block';
        box.style.left = left + 'px';
        box.style.top = top + 'px';
        box.style.width = w + 'px';
        box.style.height = h + 'px';
      }
      e.stopPropagation();
      return;
    }
    // v3.1: 부품 본체 드래그 (수평 이동)
    if(partDragState.candidate){
      const dx = e.clientX - partDragState.startMouse.x;
      const dy = e.clientY - partDragState.startMouse.y;
      const dist2 = dx*dx + dy*dy;
      // 3px 이상 움직이면 드래그 시작
      if(!partDragState.dragging && dist2 > 9){
        partDragState.dragging = true;
        orbitState.rotating = false;
        orbitState.panning = false;
      }
      if(partDragState.dragging && partDragState.startHit){
        const rect = renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, camera);
        const nowHit = new THREE.Vector3();
        if(ray.ray.intersectPlane(partDragState.plane, nowHit)){
          const delta = nowHit.clone().sub(partDragState.startHit);
          // 잡은 부품의 새 위치 계산 (워크플레인=자유, 일반=XZ만)
          let newPos;
          if(partDragState.useWorkPlane){
            newPos = partDragState.startPos.clone().add(delta);
          } else {
            newPos = partDragState.startPos.clone();
            newPos.x += delta.x;
            newPos.z += delta.z;
          }
          // 스냅 (잡은 부품 기준)
          if(state.moveSnap > 0){
            const sn = state.moveSnap;
            const snap = v => Math.round(v / sn) * sn;
            if(partDragState.useWorkPlane){
              newPos.x = snap(newPos.x); newPos.y = snap(newPos.y); newPos.z = snap(newPos.z);
            } else {
              newPos.x = snap(newPos.x); newPos.z = snap(newPos.z);
            }
          }
          // v6.1: 잡은 부품의 이동 offset을 모든 선택 부품에 동일하게 적용
          const moveOffset = newPos.clone().sub(partDragState.startPos);
          const grp = partDragState.group && partDragState.group.length
            ? partDragState.group
            : [{part: partDragState.candidate, startPos: partDragState.startPos}];
          grp.forEach(g => {
            g.part.mesh.position.copy(g.startPos.clone().add(moveOffset));
          });
          // v6.7: 버텍스 스냅 — 이동한 부품 코너가 다른 부품 코너에 가까우면 달라붙음
          //   v6.8: 스냅 토글 ON이거나, Ctrl(또는 Cmd)을 누른 동안 임시 스냅
          let snapped = false;
          const snapActive = (state.vertexSnap !== false) || e.ctrlKey || e.metaKey;
          if(snapActive){
            const moveParts = grp.map(g=>g.part);
            const excl = new Set(moveParts.map(p=>p.id));
            const snap = computeVertexSnap(moveParts, excl, true); // force=true: 토글 무시
            if(snap){
              grp.forEach(g => {
                const base = g.part.mesh.position;
                g.part.mesh.position.set(base.x+snap.x, base.y+snap.y, base.z+snap.z);
              });
              snapped = true;
            }
          }
          // 핸들도 따라 이동 (단일 선택 시)
          if(transformState.handleGroup && transformState.activePart === partDragState.candidate){
            const ofs = partDragState.candidate.mesh.position.clone().sub(partDragState.startPos);
            transformState.handleGroup.position.copy(ofs);
          }
          // 상태바에 좌표 표시
          const snapTxt = snapped ? '  🧲 스냅' : '';
          if(grp.length > 1){
            setStat('📍 ' + grp.length + '개 함께 이동: ΔX=' + moveOffset.x.toFixed(1) + '  ΔZ=' + moveOffset.z.toFixed(1) + snapTxt);
          } else {
            const fp = partDragState.candidate.mesh.position;
            setStat('📍 이동: X=' + fp.x.toFixed(1) + '  Y=' + fp.y.toFixed(1) + '  Z=' + fp.z.toFixed(1) + snapTxt);
          }
          refreshPropPanelTransform(partDragState.candidate);
        }
        e.stopPropagation();
      }
    }
  }, true);

  dom.addEventListener('pointerup', (e) => {
    // v6.0: 박스 선택 확정
    if(boxSelState.active){
      boxSelState.active = false;
      const box = document.getElementById('selectBox');
      if(box) box.style.display = 'none';
      const rect = renderer.domElement.getBoundingClientRect();
      const x1 = Math.min(boxSelState.startX, e.clientX);
      const x2 = Math.max(boxSelState.startX, e.clientX);
      const y1 = Math.min(boxSelState.startY, e.clientY);
      const y2 = Math.max(boxSelState.startY, e.clientY);
      const dragDist = Math.abs(e.clientX - boxSelState.startX) + Math.abs(e.clientY - boxSelState.startY);
      // 드래그가 거의 없으면 단순 클릭(빈곳) → 이미 해제됨, 아무것도 안 함
      if(dragDist >= 5){
        if(!boxSelState.additive) state.parts.forEach(p => p._selected = false);
        // 각 부품의 화면 투영 바운딩박스가 선택 사각형과 겹치면 선택
        let hitCount = 0;
        state.parts.forEach(p => {
          if(!p.visible || !p.mesh) return;
          if(projectedBoxIntersects(p.mesh, rect, x1, y1, x2, y2)){
            p._selected = true;
            hitCount++;
          }
        });
        const selParts = state.parts.filter(p => p._selected);
        state.selectedPartId = selParts.length ? selParts[selParts.length-1].id : null;
        if(selParts.length === 1){
          showTransformHandles(selParts[0]);
          refreshPropPanelTransform(selParts[0]);
          setStat('1개 선택됨 · 우클릭=회전 · 휠클릭=이동');
        } else if(selParts.length > 1){
          hideTransformHandles();
          setStat('🔗 박스선택 ' + selParts.length + '개 · 드래그=함께 이동 · 그룹화(Ctrl+G)');
        } else {
          hideTransformHandles();
          setStat('박스 영역에 도형 없음');
        }
        renderPartsList();
        updateMultiSelectHighlight();
      }
      e.stopPropagation();
      return;
    }

    if(transformState.draggingHandle){
      const h = transformState.draggingHandle;
      const wasRotate = (h && h.type === 'rotate');
      const wasScale = (h && h.type === 'scale');
      const wasMove = (h && h.type === 'move');
      const p = transformState.activePart;
      transformState.draggingHandle = null;
      transformState._rotStart = null;
      transformState._rotInitial = null;
      transformState._absStartDeg = null;       // v8.65
      // v2.0: 회전 종료 시 - v3.9: HUD를 유지하여 직접 입력 가능
      if(wasRotate){
        if(p && p.mesh){
          const d = getAbsRot(p);
          const axName = {x:'X', y:'Y', z:'Z'}[h.axis] || h.axis;
          toast('↻ ' + axName + '축(절대) = ' + d[h.axis].toFixed(1) + '°');
          setStat('회전 완료(절대): ' + axName + '축 ' + d[h.axis].toFixed(1) + '°');
          syncRotPropPanel(p);
          if(typeof rotHudPersist === 'function'){
            rotHudPersist(h.axis, d[h.axis] * Math.PI / 180);
          }
        }
      }
      // v2.5: 크기 변경 종료 시 - v8.64: HUD를 클릭 가능 상태로 유지(직접 입력)
      if(wasScale){
        if(p && p.mesh){
          p.mesh.updateMatrixWorld(true);
          const bb = new THREE.Box3().setFromObject(p.mesh);
          const sz = bb.getSize(new THREE.Vector3());
          if(h.axis === 'corner'){
            toast('📐 크기 = ' + sz.x.toFixed(1) + ' × ' + sz.y.toFixed(1) + ' × ' + sz.z.toFixed(1) + ' mm');
            setStat('비례 크기 변경 완료: ' + sz.x.toFixed(1) + ' × ' + sz.y.toFixed(1) + ' × ' + sz.z.toFixed(1) + ' mm');
            unitHudPersist('scale', 'XYZ', sz.x);
          } else {
            const axisChar = h.axis.slice(1);
            const finalMM = sz[axisChar];
            toast('📐 ' + axisChar.toUpperCase() + ' 크기 = ' + finalMM.toFixed(1) + ' mm');
            setStat('크기 변경 완료: ' + axisChar.toUpperCase() + '축 ' + finalMM.toFixed(1) + ' mm');
            unitHudPersist('scale', axisChar, finalMM);
          }
        }
        // 핸들 BB 재계산을 위해 다시 보이기
        if(p) showTransformHandles(p);
      }
      // v8.64: 위치 이동 종료 시 HUD를 클릭 가능 상태로 유지(직접 입력)
      if(wasMove && p && p.mesh){
        unitHudPersist('move', h.axis, p.mesh.position[h.axis]);
      }
      transformState._scaleStartBB = null;
      transformState._scaleStartPos = null;
        transformState._scaleStartLocal = null;
        transformState._scaleStartWBB = null;
      transformState._cornerFixed = null;
      transformState._cornerScreenC = null;
      transformState._cornerStartDist = null;
      // 핸들 위치 갱신 (회전/이동 케이스)
      const keepRingAxis = (wasRotate && transformState.rotationRingAxis) ? transformState.rotationRingAxis : null;
      if(!wasScale && transformState.activePart) updateHandlePositions();
      // v6.3: 회전이었으면 같은 축의 회전 링을 다시 표시
      if(keepRingAxis && transformState.activePart){
        showRotationRing(transformState.activePart, keepRingAxis);
      }
      pushHistory(); // v4.6: 회전/크기/이동 변형도 되돌리기 대상
      e.stopPropagation();
    }
    // v3.1: 부품 본체 드래그 종료
    if(partDragState.candidate){
      if(partDragState.dragging){
        const p = partDragState.candidate;
        const finalPos = p.mesh.position;
        const cnt = partDragState.group ? partDragState.group.length : 1;
        if(cnt > 1){
          toast('📍 ' + cnt + '개 부품 함께 이동 완료');
        } else {
          toast('📍 부품 이동: X=' + finalPos.x.toFixed(1) + ' Z=' + finalPos.z.toFixed(1));
        }
        // 핸들 재배치 (BB 갱신)
        if(transformState.activePart === p) showTransformHandles(p);
        pushHistory(); // v4.6: 본체 드래그 이동도 되돌리기 대상
      }
      // v6.3: 단일클릭 팝업 제거 → 더블클릭으로 변경 (아래 dblclick 리스너)
      partDragState.candidate = null;
      partDragState.dragging = false;
      partDragState.startHit = null;
      partDragState.plane = null;
      partDragState.group = null;
    }
  }, true);

  // v6.3: 도형 더블클릭 → 이동/크기/회전 입력 팝업
  // v7.2: 브라우저 기본 dblclick 대신 click + 300ms 간격 직접 판정
  let _3dLastClickTime = 0;
  let _3dLastClickPos = null;
  const _3D_DBL_INTERVAL = 300;
  const _3D_DBL_DIST = 8;
  dom.addEventListener('click', (e) => {
    if(state.autoPopup === false) return;
    const now = Date.now();
    const dt = now - _3dLastClickTime;
    const dd = _3dLastClickPos ? Math.hypot(e.clientX - _3dLastClickPos.x, e.clientY - _3dLastClickPos.y) : Infinity;
    if(dt <= _3D_DBL_INTERVAL && dd <= _3D_DBL_DIST){
      _3dLastClickTime = 0; _3dLastClickPos = null;
      _3dHandleDblClick(e);
      return;
    }
    _3dLastClickTime = now;
    _3dLastClickPos = {x:e.clientX, y:e.clientY};
  });
  function _3dHandleDblClick(e){
    if(state.autoPopup === false) return;
    const partHit = pickPart(e);
    if(!partHit) return;
    // 선택 상태로 만들고 단일 선택 보장
    state.parts.forEach(p => p._selected = false);
    partHit._selected = true;
    state.selectedPartId = partHit.id;
    showTransformHandles(partHit);
    renderPartsList();
    updateMultiSelectHighlight();
    openPosSizeModal();
    e.stopPropagation();
  }
}

// v2.6: 워크플레인 지정용 - face/point 정보 포함된 hit 객체 반환
function pickFaceForWorkPlane(e){
  const rect = renderer.domElement.getBoundingClientRect();
  mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouseVec, camera);
  const meshes = [];
  state.parts.forEach(p => {
    if(p.visible && p.mesh){
      p.mesh.traverse(o => {
        if(o.isMesh){
          o.userData._partId = p.id;
          meshes.push(o);
        }
      });
    }
  });
  const hits = raycaster.intersectObjects(meshes, false);
  if(hits.length === 0) return null;
  return hits[0]; // {object, point, face, distance, ...}
}

function pickPart(e){
  const rect = renderer.domElement.getBoundingClientRect();
  mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouseVec, camera);
  // 모든 part 메쉬 (visible만)
  const meshes = [];
  state.parts.forEach(p => {
    if(p.visible && p.mesh){
      p.mesh.traverse(o => {
        if(o.isMesh){
          o.userData._partId = p.id;
          meshes.push(o);
        }
      });
    }
  });
  const hits = raycaster.intersectObjects(meshes, false);
  if(hits.length === 0) return null;
  const partId = hits[0].object.userData._partId;
  return state.parts.find(p => p.id === partId);
}

// v6.0: 부품의 3D 바운딩박스를 화면에 투영한 사각형이 선택 박스와 겹치는지 판정
//   (clientX/Y 기준). 카메라 뒤로 가는 점은 제외.
function projectedBoxIntersects(mesh, rect, selX1, selY1, selX2, selY2){
  mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(mesh);
  if(bb.isEmpty()) return false;
  const corners = [
    new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z),
    new THREE.Vector3(bb.max.x, bb.min.y, bb.min.z),
    new THREE.Vector3(bb.min.x, bb.max.y, bb.min.z),
    new THREE.Vector3(bb.max.x, bb.max.y, bb.min.z),
    new THREE.Vector3(bb.min.x, bb.min.y, bb.max.z),
    new THREE.Vector3(bb.max.x, bb.min.y, bb.max.z),
    new THREE.Vector3(bb.min.x, bb.max.y, bb.max.z),
    new THREE.Vector3(bb.max.x, bb.max.y, bb.max.z)
  ];
  let pminX = Infinity, pminY = Infinity, pmaxX = -Infinity, pmaxY = -Infinity;
  let anyFront = false;
  corners.forEach(c => {
    const v = c.clone().project(camera); // NDC, z<1 이면 화면 앞
    if(v.z > 1) return; // 카메라 뒤
    anyFront = true;
    const sx = rect.left + (v.x + 1) * 0.5 * rect.width;
    const sy = rect.top  + (-v.y + 1) * 0.5 * rect.height;
    if(sx < pminX) pminX = sx; if(sx > pmaxX) pmaxX = sx;
    if(sy < pminY) pminY = sy; if(sy > pmaxY) pmaxY = sy;
  });
  if(!anyFront) return false;
  // AABB 교차 검사 (화면좌표)
  return !(pmaxX < selX1 || pminX > selX2 || pmaxY < selY1 || pminY > selY2);
}
//   먼저 기존 부품의 윗면에 맞으면 그 위에, 아니면 바닥(Y=0)에 떨어뜨림.
const _dropGroundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function screenToGround(clientX, clientY){
  const rect = renderer.domElement.getBoundingClientRect();
  mouseVec.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouseVec, camera);
  // 1) 기존 부품 윗면에 닿으면 그 지점 반환 (위에 쌓기)
  const meshes = [];
  state.parts.forEach(p => {
    if(p.visible && p.mesh){
      p.mesh.traverse(o => { if(o.isMesh) meshes.push(o); });
    }
  });
  const hits = raycaster.intersectObjects(meshes, false);
  if(hits.length > 0){
    return {point: hits[0].point.clone(), onPart: true};
  }
  // 2) 바닥평면 교차
  const pt = new THREE.Vector3();
  const ok = raycaster.ray.intersectPlane(_dropGroundPlane, pt);
  if(ok) return {point: pt, onPart: false};
  return null;
}

function pickHandle(e){
  if(!transformState.handleGroup && !transformState.rotationRing) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVec.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouseVec, camera);
  const handleMeshes = [];
  if(transformState.handleGroup){
    transformState.handleGroup.traverse(o => {
      if(o.isMesh && o.userData._handle) handleMeshes.push(o);
    });
  }
  // v6.3: 회전 링이 떠 있으면 그 핸들도 검사 (우선)
  if(transformState.rotationRing){
    transformState.rotationRing.traverse(o => {
      if(o.isMesh && o.userData._handle) handleMeshes.push(o);
    });
  }
  const hits = raycaster.intersectObjects(handleMeshes, false);
  if(hits.length === 0) return null;
  // v8.60: 같은 위치(near-equal distance)에서 move·scale 핸들이 겹치면 scale(크기조절) 우선
  const best = hits[0];
  const bestH = best.object.userData._handle;
  if(bestH && bestH.type === 'move'){
    for(const h of hits){
      const info = h.object.userData._handle;
      if(info && info.type === 'scale' && (h.distance - best.distance) < best.distance * 0.04){
        return info;
      }
    }
  }
  return bestH;
}

function showTransformHandles(part){
  hideTransformHandles();
  transformState.activePart = part;
  const group = new THREE.Group();
  group.name = '_handleGroup';
  // 바운딩박스 계산
  part.mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(part.mesh);
  const center = bb.getCenter(new THREE.Vector3());
  const size = bb.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 10);
  const minSize = Math.min(size.x, size.y, size.z);
  // v8.83: 핸들 크기를 절대 mm로 클램프 → 큰/납작한 부품에서도 작고 일정하게
  //   (이전: maxSize 비례라 큰 부품에서 과도하게 커짐)
  const dot = Math.min(maxSize*0.030, Math.max(1.2, minSize*0.18, 2.0));
  const moveDot = dot * 1.25;
  const bottomY = center.y - size.y/2;
  const topY = center.y + size.y/2;
  const WHITE = 0xffffff;
  const EDGE = 0x222222;

  // 바운딩박스 와이어 (v8.83: 반투명 → 부품이 투시되어 보임, 팅커캐드식)
  const boxGeom = new THREE.BoxGeometry(size.x, size.y, size.z);
  const edges = new THREE.EdgesGeometry(boxGeom);
  const wire = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({color: 0xf39c12, transparent:true, opacity:0.55}));
  wire.position.copy(center);
  wire.userData._handle = null;
  group.add(wire);

  // ── 흰색 점(구) 핸들 + 작은 큐브(코너) 헬퍼 (팅커캐드식) ──
  function makeDot(px, py, pz, handleInfo, color){
    const g = new THREE.SphereGeometry(dot, 16, 12);
    const m = new THREE.MeshBasicMaterial({color: color || WHITE, depthTest: false});
    const s = new THREE.Mesh(g, m);
    s.position.set(px, py, pz);
    s.userData._handle = handleInfo;
    s.renderOrder = 1002;
    group.add(s);
    const ring = new THREE.Mesh(
      new THREE.SphereGeometry(dot*1.18, 16, 12),
      new THREE.MeshBasicMaterial({color: EDGE, depthTest: false, transparent:true, opacity:0.35})
    );
    ring.position.set(px, py, pz);
    ring.renderOrder = 1001;
    group.add(ring);
    return s;
  }
  // v8.83: 코너용 작은 큐브 핸들 (팅커캐드 스타일) + 넉넉한 투명 클릭영역
  function makeCube(px, py, pz, handleInfo){
    const c = new THREE.Mesh(
      new THREE.BoxGeometry(dot*1.7, dot*1.7, dot*1.7),
      new THREE.MeshBasicMaterial({color: WHITE, depthTest:false})
    );
    c.position.set(px,py,pz); c.userData._handle = handleInfo; c.renderOrder=1002; group.add(c);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(dot*1.7,dot*1.7,dot*1.7)),
      new THREE.LineBasicMaterial({color:0x333333, depthTest:false})
    );
    edge.position.set(px,py,pz); edge.renderOrder=1003; group.add(edge);
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(dot*2.0,10,8),
      new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthTest:false,depthWrite:false})
    );
    hit.position.set(px,py,pz); hit.userData._handle=handleInfo; hit.renderOrder=999; group.add(hit);
    return c;
  }

  // ── 1) 8개 코너: 작은 큐브 = 대각 비례 조절 (팅커캐드식) ──
  const corners = [[1,1,1],[1,1,-1],[-1,1,1],[-1,1,-1],[1,-1,1],[1,-1,-1],[-1,-1,1],[-1,-1,-1]];
  corners.forEach(sg=>{
    makeCube(center.x+sg[0]*size.x/2, center.y+sg[1]*size.y/2, center.z+sg[2]*size.z/2,
             {type:'scale', axis:'corner', sign:[sg[0],sg[1],sg[2]]});
  });

  // ── 2) 밑면 네 변(엣지) 중앙: 너비/깊이 단일축 조절 (±X, ±Z) ──
  makeDot(center.x + size.x/2, bottomY, center.z, {type:'scale', axis:'+x'});
  makeDot(center.x - size.x/2, bottomY, center.z, {type:'scale', axis:'-x'});
  makeDot(center.x, bottomY, center.z + size.z/2, {type:'scale', axis:'+z'});
  makeDot(center.x, bottomY, center.z - size.z/2, {type:'scale', axis:'-z'});

  // ── 3) 윗면 중앙: 높이(Y) 조절 (흰 점 + 가는 지시선) ──
  // v8.61: 지시선을 좀 더 길게 + 흰점에 넉넉한 투명 클릭영역 추가 (선택 쉽게)
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(dot*0.18, dot*0.18, maxSize*0.20, 8),
    new THREE.MeshBasicMaterial({color: WHITE, depthTest:false, transparent:true, opacity:0.7})
  );
  stem.position.set(center.x, topY + maxSize*0.10, center.z);
  stem.renderOrder = 1000;
  group.add(stem);
  makeDot(center.x, topY + maxSize*0.20, center.z, {type:'scale', axis:'+y'});
  // 큰 투명 클릭영역 (흰점만으로는 작아서 클릭이 어려움)
  const yHit = new THREE.Mesh(
    new THREE.SphereGeometry(dot*2.4, 12, 10),
    new THREE.MeshBasicMaterial({transparent:true, opacity:0, depthTest:false, depthWrite:false})
  );
  yHit.position.set(center.x, topY + maxSize*0.20, center.z);
  yHit.userData._handle = {type:'scale', axis:'+y'};
  yHit.renderOrder = 999;
  group.add(yHit);

  // ── 4) 회전 핸들: 작은 곡선 화살표 아이콘 (클릭하면 원형 회전 링 표시) ──
  //    팅커캐드처럼 평소엔 작은 아이콘, 클릭 시 그 축의 원형 링이 나타남
  const icoR = dot * 1.3; // 아이콘 호 반지름 (최소화)
  function makeRotIcon(axis, color, posOffset, rot){
    const grp = new THREE.Group();
    // 작은 곡선 화살표 (호)
    const arc = new THREE.Mesh(
      new THREE.TorusGeometry(icoR, dot*0.16, 8, 24, Math.PI*1.1),
      new THREE.MeshBasicMaterial({color, depthTest:false, transparent:true, opacity:0.95})
    );
    arc.userData._handle = {type:'rotateIcon', axis};
    arc.renderOrder = 1001;
    grp.add(arc);
    // 화살촉 1개 (끝)
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(dot*0.4, dot*0.8, 10),
      new THREE.MeshBasicMaterial({color, depthTest:false})
    );
    const ang = Math.PI*1.1;
    tip.position.set(Math.cos(ang)*icoR, Math.sin(ang)*icoR, 0);
    tip.rotation.z = ang - Math.PI/2;
    tip.userData._handle = {type:'rotateIcon', axis};
    tip.renderOrder = 1001;
    grp.add(tip);
    // 충돌용 투명 디스크 (클릭 쉽게)
    const hit = new THREE.Mesh(
      new THREE.CircleGeometry(icoR*1.4, 16),
      new THREE.MeshBasicMaterial({transparent:true, opacity:0, depthTest:false, depthWrite:false, side:THREE.DoubleSide})
    );
    hit.userData._handle = {type:'rotateIcon', axis};
    hit.renderOrder = 1000;
    grp.add(hit);
    grp.position.set(center.x + posOffset.x, center.y + posOffset.y, center.z + posOffset.z);
    if(rot) grp.rotation.set(rot.x||0, rot.y||0, rot.z||0);
    return grp;
  }
  // Y축 회전(yaw): 상단부 "뒤쪽"(Z 음수)에 수평으로 누운 아이콘 (요청)
  group.add(makeRotIcon('y', 0x44dd44,
    {x: 0, y: size.y/2 + maxSize*0.18, z: -size.z/2 - maxSize*0.22},
    {x: -Math.PI/2}));
  // X축 회전(pitch): 우측에 세로 아이콘
  group.add(makeRotIcon('x', 0xdd4444,
    {x: size.x/2 + maxSize*0.22, y: 0, z: 0},
    {y: Math.PI/2}));
  // Z축 회전(roll): 바닥 앞쪽에 수평 아이콘
  group.add(makeRotIcon('z', 0x4488dd,
    {x: 0, y: -size.y/2 - maxSize*0.08, z: size.z/2 + maxSize*0.30},
    {x: -Math.PI/2}));

  // ── Y축 이동 핸들 ──
  // v8.68: 단일 원뿔 모양 + 부품 가까이 아래로 (이전 0.85는 너무 멀었음)
  function makeMoveArrow(axis, color, posOffset){
    const grp = new THREE.Group();
    const coneR = moveDot * 0.55;   // 원뿔 밑면 반지름
    const coneH = moveDot * 1.4;    // 원뿔 높이
    // 위를 향하는 단일 원뿔
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(coneR, coneH, 18),
      new THREE.MeshBasicMaterial({color, depthTest:false})
    );
    cone.userData._handle = {type:'move', axis:axis, dir:0};
    cone.renderOrder = 1002;
    grp.add(cone);
    // 충돌용 투명 캡슐 (클릭 영역 약간 확장)
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(coneR*1.6, coneR*1.6, coneH*1.4, 10),
      new THREE.MeshBasicMaterial({transparent:true, opacity:0, depthTest:false, depthWrite:false})
    );
    hit.userData._handle = {type:'move', axis:axis, dir:0};
    hit.renderOrder = 1000;
    grp.add(hit);
    grp.position.set(center.x + posOffset.x, center.y + posOffset.y, center.z + posOffset.z);
    return grp;
  }
  // v8.68: 높이조절 흰점(topY+0.20, 히트반경≈0.072) 바로 위에 가깝게 배치
  group.add(makeMoveArrow('y', 0x2244ff,
    {x: 0, y: size.y/2 + maxSize*0.34, z: 0}));

  transformState.handleGroup = group;
  scene.add(group);
  // 치수 라벨도 표시
  showDimLabels(part);
}

function hideTransformHandles(){
  if(transformState.handleGroup){
    scene.remove(transformState.handleGroup);
    transformState.handleGroup.traverse(o => {
      if(o.isMesh){
        if(o.geometry) o.geometry.dispose();
        if(o.material) o.material.dispose();
      }
    });
    transformState.handleGroup = null;
  }
  transformState.activePart = null;
  transformState.draggingHandle = null;
  hideRotationRing();
  hideDimLabels();
}

// v6.3: 회전 아이콘 클릭 시 그 축의 원형 회전 링 표시 (팅커캐드식)
function showRotationRing(part, axis){
  hideRotationRing();
  if(!part || !part.mesh) return;
  part.mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(part.mesh);
  const center = bb.getCenter(new THREE.Vector3());
  const size = bb.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z, 10);
  const ringR = maxSize * 0.62;
  const tube = maxSize * 0.018;
  const color = {x:0xdd4444, y:0x44dd44, z:0x4488dd}[axis] || 0xf39c12;

  const grp = new THREE.Group();
  // 보이는 원형 링
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(ringR, tube, 12, 80),
    new THREE.MeshBasicMaterial({color, depthTest:false, transparent:true, opacity:0.9})
  );
  ring.userData._handle = {type:'rotate', axis};
  ring.renderOrder = 1005;
  grp.add(ring);
  // 두꺼운 투명 충돌 토러스 (드래그하기 쉽게)
  const hit = new THREE.Mesh(
    new THREE.TorusGeometry(ringR, maxSize*0.07, 8, 48),
    new THREE.MeshBasicMaterial({transparent:true, opacity:0, depthTest:false, depthWrite:false})
  );
  hit.userData._handle = {type:'rotate', axis};
  hit.renderOrder = 1004;
  grp.add(hit);
  // 축에 맞춰 토러스 평면 회전 (토러스 기본은 XY평면)
  if(axis === 'x') grp.rotation.y = Math.PI/2;
  else if(axis === 'y') grp.rotation.x = Math.PI/2;
  grp.position.copy(center);
  scene.add(grp);
  transformState.rotationRing = grp;
  transformState.rotationRingAxis = axis;
  setStat('↻ ' + axis.toUpperCase() + '축 회전 링 — 링을 드래그하여 회전 (빈 곳 클릭 시 닫힘)');
}

function hideRotationRing(){
  if(transformState.rotationRing){
    scene.remove(transformState.rotationRing);
    transformState.rotationRing.traverse(o => {
      if(o.isMesh){ if(o.geometry) o.geometry.dispose(); if(o.material) o.material.dispose(); }
    });
    transformState.rotationRing = null;
    transformState.rotationRingAxis = null;
  }
}

function updateHandlePositions(){
  if(!transformState.activePart) return;
  const part = transformState.activePart;
  showTransformHandles(part);
}

// v8.65: 절대축(월드 X/Y/Z) 기준 회전 헬퍼 — 오리진 피벗
//   p._absRotDeg = {x,y,z} (도). 월드축 회전을 Z→Y→X 순서로 합성(q = qx·qy·qz).
function getAbsRot(p){
  if(!p._absRotDeg){
    const e = p.mesh.rotation;
    p._absRotDeg = { x: e.x*180/Math.PI, y: e.y*180/Math.PI, z: e.z*180/Math.PI };
  }
  return p._absRotDeg;
}
function applyAbsRot(p){
  const d = getAbsRot(p);
  const r = v => v*Math.PI/180;
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), r(d.x));
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), r(d.y));
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), r(d.z));
  const q = qx.multiply(qy).multiply(qz); // 월드축 합성 (오리진 피벗 = 기본 동작)
  p.mesh.quaternion.copy(q);
  p.mesh.rotation.setFromQuaternion(q, p.mesh.rotation.order);
}

function handleDrag(e){
  const h = transformState.draggingHandle;
  const p = transformState.activePart;
  if(!h || !p) return;

  if(h.type === 'move'){
    // v1.9: 정확한 이동 - 해당 축 방향으로 마우스 이동량을 투영
    // 시작 시점의 객체 위치에서 해당 축 방향으로 광선 평면 교차로 이동량 계산
    const axisVec = new THREE.Vector3(
      h.axis === 'x' ? 1 : 0,
      h.axis === 'y' ? 1 : 0,
      h.axis === 'z' ? 1 : 0
    );
    // 마우스 현재 + 시작 위치를 월드로 변환해 축 방향 투영
    const rect = renderer.domElement.getBoundingClientRect();
    const nowNDC = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const startNDC = new THREE.Vector2(
      ((transformState.dragStart.x - rect.left) / rect.width) * 2 - 1,
      -((transformState.dragStart.y - rect.top) / rect.height) * 2 + 1
    );
    // 시작 위치를 지나면서 axisVec 방향과 카메라 시점에 수직인 평면을 정의
    // 더 단순한 방법: 시작점에서 axisVec과 수직이면서 카메라를 향한 평면을 만들고
    // 두 ray와의 교차점 차이를 축 방향으로 투영
    const camDir = new THREE.Vector3().subVectors(camera.position, transformState.dragStartPos).normalize();
    // 평면 법선: axisVec과 가장 가까운 camDir 성분을 제거한 것
    // 사실은 axisVec과 직각이고 카메라 방향을 포함하는 평면을 원함
    const planeNormal = camDir.clone().sub(axisVec.clone().multiplyScalar(axisVec.dot(camDir))).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, transformState.dragStartPos);

    const rayNow = new THREE.Raycaster();
    rayNow.setFromCamera(nowNDC, camera);
    const rayStart = new THREE.Raycaster();
    rayStart.setFromCamera(startNDC, camera);
    const hitNow = new THREE.Vector3();
    const hitStart = new THREE.Vector3();
    rayNow.ray.intersectPlane(plane, hitNow);
    rayStart.ray.intersectPlane(plane, hitStart);
    if(hitNow && hitStart){
      const moveVec = hitNow.clone().sub(hitStart);
      let moveAmt = moveVec.dot(axisVec); // 축 방향 투영 (mm)
      // v5.2: 지정 단위로 스냅 (0이면 자유 이동)
      if(state.moveSnap > 0) moveAmt = Math.round(moveAmt / state.moveSnap) * state.moveSnap;
      p.mesh.position.copy(transformState.dragStartPos.clone().add(axisVec.clone().multiplyScalar(moveAmt)));
    }
    // 핸들도 따라가도록 갱신
    if(transformState.handleGroup){
      const delta = p.mesh.position.clone().sub(transformState.dragStartPos);
      transformState.handleGroup.position.copy(delta);
    }
    // v3.3: 우측 속성 패널 위치/크기 실시간 갱신
    refreshPropPanelTransform(p);
    // v8.64: 위치 HUD 실시간 표시 (상단부)
    showMoveHud(h.axis, p.mesh.position[h.axis], p.mesh.position[h.axis] - transformState.dragStartPos[h.axis], state.moveSnap > 0);
  } else if(h.type === 'scale'){
    // v5.6: 코너 핸들 = 3축 균등(비례) 스케일 (팅커캐드 모서리 핸들)
    if(h.axis === 'corner'){
      const rect = renderer.domElement.getBoundingClientRect();
      // 객체 중심을 화면에 투영
      let bb0 = transformState._scaleStartBB;
      if(!bb0){
        p.mesh.updateMatrixWorld(true);
        bb0 = new THREE.Box3().setFromObject(p.mesh).clone();
        transformState._scaleStartBB = bb0;
        transformState._scaleStartPos = p.mesh.position.clone();
        // 고정 코너(드래그하는 코너의 반대편)를 시작 시점에 저장
        const sgn = h.sign;
        transformState._cornerFixed = new THREE.Vector3(
          sgn[0] > 0 ? bb0.min.x : bb0.max.x,
          sgn[1] > 0 ? bb0.min.y : bb0.max.y,
          sgn[2] > 0 ? bb0.min.z : bb0.max.z
        );
        const center0 = bb0.getCenter(new THREE.Vector3());
        const proj = center0.clone().project(camera);
        transformState._cornerScreenC = {
          x: (proj.x + 1) * 0.5 * rect.width + rect.left,
          y: (-proj.y + 1) * 0.5 * rect.height + rect.top
        };
        const movingCorner = new THREE.Vector3(
          sgn[0] > 0 ? bb0.max.x : bb0.min.x,
          sgn[1] > 0 ? bb0.max.y : bb0.min.y,
          sgn[2] > 0 ? bb0.max.z : bb0.min.z
        );
        const pj2 = movingCorner.clone().project(camera);
        const cornerScreen = {
          x: (pj2.x + 1) * 0.5 * rect.width + rect.left,
          y: (-pj2.y + 1) * 0.5 * rect.height + rect.top
        };
        transformState._cornerStartDist = Math.hypot(
          cornerScreen.x - transformState._cornerScreenC.x,
          cornerScreen.y - transformState._cornerScreenC.y
        ) || 1;
      }
      const sc = transformState._cornerScreenC;
      const nowDist = Math.hypot(e.clientX - sc.x, e.clientY - sc.y);
      let factor = nowDist / transformState._cornerStartDist;
      factor = Math.max(0.05, factor);
      const newScale = transformState.dragStartScale.clone().multiplyScalar(factor);
      p.mesh.scale.copy(newScale);
      // 고정 코너 유지: 새 BB 기준으로 위치 보정
      const sizeStart = bb0.getSize(new THREE.Vector3());
      const fixed = transformState._cornerFixed;
      const sgn = h.sign;
      const newSize = sizeStart.clone().multiplyScalar(factor);
      const newCenter = new THREE.Vector3(
        fixed.x + sgn[0] * newSize.x / 2,
        fixed.y + sgn[1] * newSize.y / 2,
        fixed.z + sgn[2] * newSize.z / 2
      );
      const startCenter = bb0.getCenter(new THREE.Vector3());
      const shift = newCenter.clone().sub(startCenter);
      p.mesh.position.copy(transformState._scaleStartPos.clone().add(shift));
      showScaleHud('XYZ', Math.round(newSize.x*10)/10, 0, e.shiftKey);
      refreshPropPanelTransform(p);
      // 아래 단일축 로직은 건너뜀
      showDimLabels(p);
      return;
    }
    // v8.86: 화면(월드) 기준 단일축 크기조절.
    //   핸들이 가리키는 월드축에 가장 정렬된 '로컬 축'을 스케일 → 회전돼도 화면 기준으로 늘어남.
    //   위치 보정·측정은 모두 월드 BB 기준(원래 잘 되던 로직 그대로) → 반대 면 고정.
    const sign = h.axis[0] === '+' ? 1 : -1;
    const axisChar = h.axis.slice(1);                 // 월드 축 'x'/'y'/'z' (측정/위치 보정용)
    const axisVec = new THREE.Vector3(
      axisChar === 'x' ? 1 : 0,
      axisChar === 'y' ? 1 : 0,
      axisChar === 'z' ? 1 : 0
    );
    // 스케일할 로컬 축 결정 (월드축에 가장 정렬된 로컬 축)
    p.mesh.updateMatrixWorld(true);
    const q = p.mesh.quaternion;
    const la = {
      x: new THREE.Vector3(1,0,0).applyQuaternion(q),
      y: new THREE.Vector3(0,1,0).applyQuaternion(q),
      z: new THREE.Vector3(0,0,1).applyQuaternion(q)
    };
    let scaleAxis = axisChar, bestAbs = -1;
    for(const k of ['x','y','z']){
      const d = Math.abs(la[k].dot(axisVec));
      if(d > bestAbs){ bestAbs = d; scaleAxis = k; }
    }
    const rect = renderer.domElement.getBoundingClientRect();
    const nowNDC = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const startNDC = new THREE.Vector2(
      ((transformState.dragStart.x - rect.left) / rect.width) * 2 - 1,
      -((transformState.dragStart.y - rect.top) / rect.height) * 2 + 1
    );
    const camDir = new THREE.Vector3().subVectors(camera.position, transformState.dragStartPos).normalize();
    const planeNormal = camDir.clone().sub(axisVec.clone().multiplyScalar(axisVec.dot(camDir))).normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, transformState.dragStartPos);
    const rayNow = new THREE.Raycaster(); rayNow.setFromCamera(nowNDC, camera);
    const rayStart = new THREE.Raycaster(); rayStart.setFromCamera(startNDC, camera);
    const hitNow = new THREE.Vector3(); const hitStart = new THREE.Vector3();
    rayNow.ray.intersectPlane(plane, hitNow);
    rayStart.ray.intersectPlane(plane, hitStart);
    if(hitNow && hitStart){
      const moveAmt = hitNow.clone().sub(hitStart).dot(axisVec); // 월드축 방향 mm 변위
      let bb0 = transformState._scaleStartBB;
      if(!bb0){
        bb0 = new THREE.Box3().setFromObject(p.mesh).clone();
        transformState._scaleStartBB = bb0;
        transformState._scaleStartPos = p.mesh.position.clone();
      }
      const sizeStart = bb0.getSize(new THREE.Vector3());
      const startSize = sizeStart[axisChar];          // 월드 BB의 그 축 크기
      let newSizeMM = startSize + sign * moveAmt;
      if(e.shiftKey){ newSizeMM = Math.round(newSizeMM); }
      newSizeMM = Math.max(0.5, newSizeMM);
      const factor = newSizeMM / Math.max(0.001, startSize);
      // 로컬 축에 factor 적용 (회전 시 월드축↔로컬축이 바뀌므로 scaleAxis 사용)
      const newScale = transformState.dragStartScale.clone();
      newScale[scaleAxis] = transformState.dragStartScale[scaleAxis] * factor;
      p.mesh.scale.copy(newScale);
      // 반대 면 고정: 월드 BB 기준으로 위치 보정 (원래 로직)
      const startMin = bb0.min[axisChar];
      const startMax = bb0.max[axisChar];
      const startCenter = (startMin + startMax) / 2;
      p.mesh.updateMatrixWorld(true);
      const nowBB = new THREE.Box3().setFromObject(p.mesh);
      const nowSize = nowBB.getSize(new THREE.Vector3())[axisChar];
      const fixedPoint = (sign > 0) ? startMin : startMax;
      const newCenter = fixedPoint + sign * (nowSize/2);
      const nowCenterAxis = nowBB.getCenter(new THREE.Vector3())[axisChar];
      const centerShift = newCenter - nowCenterAxis;
      const newPos = p.mesh.position.clone();
      newPos[axisChar] += centerShift;
      p.mesh.position.copy(newPos);
      showScaleHud(axisChar, newSizeMM, newSizeMM - startSize, e.shiftKey);
      refreshPropPanelTransform(p);
    }
  } else if(h.type === 'rotate'){
    // v8.65: 절대축(월드 X/Y/Z) 기준 회전 + 오리진(물체 원점) 피벗
    // 마우스 회전량은 화면상 "원점 투영점"을 중심으로 계산 → 그 각도를 해당 월드축 절대각에 누적
    p.mesh.updateMatrixWorld(true);
    const origin3D = p.mesh.position.clone();
    const rect = renderer.domElement.getBoundingClientRect();
    const projC = origin3D.clone().project(camera);
    const cx = (projC.x + 1) * 0.5 * rect.width + rect.left;
    const cy = (-projC.y + 1) * 0.5 * rect.height + rect.top;
    if(transformState._rotStart === null || transformState._rotStart === undefined){
      transformState._rotStart = Math.atan2(transformState.dragStart.y - cy, transformState.dragStart.x - cx);
      const d0 = getAbsRot(p);
      transformState._absStartDeg = { x:d0.x, y:d0.y, z:d0.z };
    }
    const angleNow = Math.atan2(e.clientY - cy, e.clientX - cx);
    let delta = angleNow - transformState._rotStart;
    // 핸들 축별 부호 보정 (드래그 방향 직관화)
    let deltaSigned = delta;
    if(h.axis === 'z') deltaSigned = -delta;
    else if(h.axis === 'x') deltaSigned = -delta;
    let deltaDeg = deltaSigned * 180 / Math.PI;
    // 스냅
    let snapDeg = 0;
    if(state.rotSnap > 0) snapDeg = state.rotSnap;
    else if(e.shiftKey) snapDeg = 15;
    if(snapDeg > 0) deltaDeg = Math.round(deltaDeg / snapDeg) * snapDeg;
    // 절대각 = 시작 절대각 + 이번 드래그 델타 (해당 축만)
    const absNew = transformState._absStartDeg[h.axis] + deltaDeg;
    getAbsRot(p)[h.axis] = absNew;
    applyAbsRot(p);
    _rotHudActiveAxis = h.axis;
    showRotHud(h.axis, absNew * Math.PI / 180, deltaDeg * Math.PI / 180, snapDeg > 0);
    syncRotPropPanel(p);
  }
  // 변형 후 치수 라벨 갱신
  showDimLabels(p);
}

let orbitState = {
  rotating: false, panning: false,
  startX: 0, startY: 0,
  theta: 0, phi: 0, radius: 0,
  target: new THREE.Vector3(0, 0, 0)
};

function setupOrbit(dom){
  const offset = new THREE.Vector3().subVectors(camera.position, orbitState.target);
  orbitState.radius = offset.length();
  orbitState.theta = Math.atan2(offset.x, offset.z);
  orbitState.phi = Math.acos(Math.max(-1, Math.min(1, offset.y / orbitState.radius)));
  
  dom.addEventListener('mousedown', (e)=>{
    // 핸들 드래그 중이면 orbit 시작하지 않음
    if(transformState.draggingHandle) return;
    // v6.0: 휠클릭(중간버튼) = 화면 이동(pan)
    if(e.button === 1){
      e.preventDefault();
      orbitState.panning = true;
      dom.style.cursor = 'grabbing';
    }
    // v6.0: 우클릭 = 화면 회전(orbit)  (기존 좌클릭 회전 → 우클릭으로 이동)
    else if(e.button === 2){
      orbitState.rotating = true;
      dom.style.cursor = 'grabbing';
    }
    // 좌클릭(0)은 회전/이동 안 함 → 선택/박스선택 전용 (setupRaycastClick에서 처리)
    orbitState.startX = e.clientX;
    orbitState.startY = e.clientY;
  });
  dom.addEventListener('mousemove', (e)=>{
    if(!orbitState.rotating && !orbitState.panning) return;
    const dx = e.clientX - orbitState.startX;
    const dy = e.clientY - orbitState.startY;
    orbitState.startX = e.clientX;
    orbitState.startY = e.clientY;
    if(orbitState.rotating){
      orbitState.theta -= dx * 0.01;
      orbitState.phi -= dy * 0.01;
      orbitState.phi = Math.max(0.05, Math.min(Math.PI - 0.05, orbitState.phi));
      updateCamera();
    } else if(orbitState.panning){
      const factor = orbitState.radius * 0.002;
      const camDir = new THREE.Vector3().subVectors(camera.position, orbitState.target).normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), camDir).normalize();
      const up = new THREE.Vector3().crossVectors(camDir, right).normalize();
      orbitState.target.add(right.multiplyScalar(-dx * factor));
      orbitState.target.add(up.multiplyScalar(dy * factor));
      updateCamera();
    }
  });
  dom.addEventListener('mouseup', ()=>{orbitState.rotating = false; orbitState.panning = false; dom.style.cursor = ''});
  dom.addEventListener('mouseleave', ()=>{orbitState.rotating = false; orbitState.panning = false; dom.style.cursor = ''});
  window.addEventListener('mouseup', ()=>{orbitState.rotating = false; orbitState.panning = false; dom.style.cursor = ''});
  dom.addEventListener('contextmenu', (e)=>e.preventDefault());
  dom.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const zoom = e.deltaY < 0 ? 0.9 : 1.1;
    orbitState.radius *= zoom;
    orbitState.radius = Math.max(5, Math.min(3000, orbitState.radius));
    updateCamera();
  }, {passive: false});
}

function updateCamera(){
  const x = orbitState.radius * Math.sin(orbitState.phi) * Math.sin(orbitState.theta);
  const y = orbitState.radius * Math.cos(orbitState.phi);
  const z = orbitState.radius * Math.sin(orbitState.phi) * Math.cos(orbitState.theta);
  camera.position.set(
    x + orbitState.target.x,
    y + orbitState.target.y,
    z + orbitState.target.z
  );
  camera.lookAt(orbitState.target);
  // v2.4: Orthographic 카메라일 경우 줌(반경) 변화에 맞춰 frustum 갱신
  if(camera.isOrthographicCamera){
    const container = document.getElementById('viewerCanvas');
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    const aspect = w/h;
    const r = orbitState.radius;
    camera.left = -r*aspect/2;
    camera.right = r*aspect/2;
    camera.top = r/2;
    camera.bottom = -r/2;
    camera.updateProjectionMatrix();
  }
}

function addPartToScene(part){
  if(part.mesh){
    scene.add(part.mesh);
    // v6.6: 입체도형 외곽 모서리 선 자동 표시
    if(state.showEdges !== false) addEdgeOutline(part.mesh);
    // v6.8: 와이어프레임 모드면 새 부품에도 적용
    if(state.wireframe){
      part.mesh.traverse(o=>{ if(o.isMesh && o.material) o.material.wireframe = true; });
    }
  }
}
function removePartFromScene(part){
  if(part.mesh){
    scene.remove(part.mesh);
    part.mesh.traverse(o=>{
      if(o.isMesh){
        if(o.geometry) o.geometry.dispose();
        if(o.material){
          if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose());
          else o.material.dispose();
        }
      }
    });
  }
}

// v7.1.4: 재질 프리셋 (roughness/metalness/투명도/측면)
const MATERIAL_PRESETS = {
  plastic_matte:  {roughness:0.85, metalness:0.0,  clear:0},
  plastic_glossy: {roughness:0.25, metalness:0.0,  clear:0.3},
  metal:          {roughness:0.4,  metalness:0.9,  clear:0},
  chrome:         {roughness:0.05, metalness:1.0,  clear:0},
  brushed:        {roughness:0.55, metalness:0.85, clear:0},
  rubber:         {roughness:0.95, metalness:0.0,  clear:0},
  glass:          {roughness:0.05, metalness:0.0,  clear:0, glassOpacity:0.35},
  ceramic:        {roughness:0.35, metalness:0.05, clear:0.5}
};

function makeMaterial(color, opacity, matKey){
  const preset = MATERIAL_PRESETS[matKey] || MATERIAL_PRESETS.plastic_matte;
  let op = opacity;
  let transparent = opacity < 1;
  if(preset.glassOpacity !== undefined && opacity >= 1){
    op = preset.glassOpacity; transparent = true;
  }
  const mat = new THREE.MeshStandardMaterial({
    color: color,
    roughness: preset.roughness,
    metalness: preset.metalness,
    transparent: transparent,
    opacity: op,
    side: THREE.DoubleSide,
    flatShading: !state.smoothShading  // v8.90
  });
  return mat;
}

// v8.90: 부드러운 렌더링 토글 — 정점 병합 후 각도 기반 부드러운 법선
window.toggleSmoothShading = function(){
  state.smoothShading = !state.smoothShading;
  state.parts.forEach(p => {
    if(!p.mesh) return;
    p.mesh.traverse(o => {
      if(o.isMesh && o.material && !o.userData._isEdgeOutline){
        if(state.smoothShading){
          smoothMeshNormals(o);
        } else {
          // 평면 음영으로 복귀
          if(o.geometry) o.geometry.computeVertexNormals();
          if(Array.isArray(o.material)) o.material.forEach(m=>{m.flatShading=true;m.needsUpdate=true;});
          else { o.material.flatShading=true; o.material.needsUpdate=true; }
        }
      }
    });
  });
  toast(state.smoothShading ? '🟢 부드러운 렌더링 ON' : '🔲 평면 음영 ON');
};

// 정점 병합(weld) + 각도 임계 기반 부드러운 법선 (Three r128 BufferGeometryUtils 없이 직접)
function smoothMeshNormals(mesh, angleThresholdDeg){
  const g0 = mesh.geometry;
  if(!g0 || !g0.attributes || !g0.attributes.position) return;
  const src = g0.index ? g0.toNonIndexed() : g0;
  const pos = src.attributes.position.array;
  const triN = pos.length / 9;
  // weld
  const Q = 1e4, keyf = (x,y,z)=>Math.round(x*Q)+'_'+Math.round(y*Q)+'_'+Math.round(z*Q);
  const vmap = new Map(), verts = [];
  const vid = (x,y,z)=>{const k=keyf(x,y,z);let id=vmap.get(k);if(id===undefined){id=verts.length/3;verts.push(x,y,z);vmap.set(k,id);}return id;};
  const faces = [];
  for(let f=0;f<triN;f++){
    const i=f*9;
    const a=vid(pos[i],pos[i+1],pos[i+2]);
    const b=vid(pos[i+3],pos[i+4],pos[i+5]);
    const c=vid(pos[i+6],pos[i+7],pos[i+8]);
    faces.push([a,b,c]);
  }
  // 정점별 누적 법선 (면적가중)
  const vN = new Float32Array(verts.length);
  const A=new THREE.Vector3(),B=new THREE.Vector3(),C=new THREE.Vector3(),AB=new THREE.Vector3(),AC=new THREE.Vector3(),N=new THREE.Vector3();
  faces.forEach(t=>{
    A.set(verts[t[0]*3],verts[t[0]*3+1],verts[t[0]*3+2]);
    B.set(verts[t[1]*3],verts[t[1]*3+1],verts[t[1]*3+2]);
    C.set(verts[t[2]*3],verts[t[2]*3+1],verts[t[2]*3+2]);
    AB.subVectors(B,A); AC.subVectors(C,A); N.crossVectors(AB,AC); // 면적가중(정규화 안함)
    for(const vi of t){ vN[vi*3]+=N.x; vN[vi*3+1]+=N.y; vN[vi*3+2]+=N.z; }
  });
  // 정규화
  for(let i=0;i<verts.length;i+=3){
    const L=Math.hypot(vN[i],vN[i+1],vN[i+2])||1; vN[i]/=L; vN[i+1]/=L; vN[i+2]/=L;
  }
  // non-indexed 법선 배열 재구성
  const normals = new Float32Array(pos.length);
  for(let f=0;f<faces.length;f++){
    const t=faces[f];
    for(let k=0;k<3;k++){ const vi=t[k]; normals[f*9+k*3]=vN[vi*3]; normals[f*9+k*3+1]=vN[vi*3+1]; normals[f*9+k*3+2]=vN[vi*3+2]; }
  }
  src.setAttribute('normal', new THREE.Float32BufferAttribute(normals,3));
  mesh.geometry = src;
  if(Array.isArray(mesh.material)) mesh.material.forEach(m=>{m.flatShading=false;m.needsUpdate=true;});
  else { mesh.material.flatShading=false; mesh.material.needsUpdate=true; }
}

// ===== v2.2: 바닥(XZ 평면)에 스케치 도형 미리보기 =====
// 2D 도형 좌표 (x, y) → 3D 좌표 (x, 0, -y)  (돌출 회전과 일관)
let floorSketchGroup = null;  // 씬에 추가된 바닥 도형 그룹
let floorAxisHelper = null;   // 회전축 미리보기 라인

function clearFloorSketch(){
  if(floorSketchGroup){
    scene.remove(floorSketchGroup);
    floorSketchGroup.traverse(o=>{
      if(o.geometry) o.geometry.dispose();
      if(o.material){
        if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose());
        else o.material.dispose();
      }
    });
    floorSketchGroup = null;
  }
}

function drawShapesOnFloor(){
  clearFloorSketch();
  if(!state.shapes || state.shapes.length === 0) return;
  floorSketchGroup = new THREE.Group();
  floorSketchGroup.name = 'floorSketch';
  floorSketchGroup.userData.isFloorSketch = true;
  // 외곽선용 라인 재료 (잘 보이게 굵게)
  const lineMat = new THREE.LineBasicMaterial({color: 0x00d4ff, linewidth: 2});
  // 닫힌 면(채움) 재료 - 반투명
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0x00d4ff, transparent: true, opacity: 0.18,
    side: THREE.DoubleSide, depthWrite: false
  });
  // v2.8: 도면을 XY 평면(Z=0)에 세로로 세움
  //   X축 둘레로 -90° 회전한 효과 = 누워있던 도면이 정면을 향해 일어섬
  //   2D (x, y) → 3D (x, y, 0)
  //   z 깊이 정렬: Z=0 평면 안에 있어 평면 채움도 정상 표시
  const to3 = (x, y, zOff) => new THREE.Vector3(x, y, zOff || 0); // Z=0 평면
  state.shapes.forEach(s => {
    if(s.type === 'line'){
      const g = new THREE.BufferGeometry().setFromPoints([
        to3(s.x1, s.y1), to3(s.x2, s.y2)
      ]);
      floorSketchGroup.add(new THREE.Line(g, lineMat));
    } else if(s.type === 'rect'){
      const x1 = Math.min(s.x1, s.x2), x2 = Math.max(s.x1, s.x2);
      const y1 = Math.min(s.y1, s.y2), y2 = Math.max(s.y1, s.y2);
      // 외곽선 (XY 평면)
      const g = new THREE.BufferGeometry().setFromPoints([
        to3(x1,y1), to3(x2,y1), to3(x2,y2), to3(x1,y2), to3(x1,y1)
      ]);
      floorSketchGroup.add(new THREE.Line(g, lineMat));
      // 채움 (XY 평면에 그대로) - ShapeGeometry는 기본 XY 평면
      const shape2 = new THREE.Shape();
      shape2.moveTo(x1, y1); shape2.lineTo(x2, y1); shape2.lineTo(x2, y2); shape2.lineTo(x1, y2); shape2.lineTo(x1, y1);
      const fg = new THREE.ShapeGeometry(shape2);
      const fm = new THREE.Mesh(fg, fillMat);
      fm.position.z = 0.01; // 살짝 띄워 라인보다 뒤에 깔리도록
      floorSketchGroup.add(fm);
    } else if(s.type === 'circle'){
      const pts = [];
      const seg = 64;
      for(let i=0; i<=seg; i++){
        const t = i/seg * Math.PI*2;
        pts.push(to3(s.cx + s.r*Math.cos(t), s.cy + s.r*Math.sin(t)));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      floorSketchGroup.add(new THREE.Line(g, lineMat));
      const shape2 = new THREE.Shape();
      shape2.absarc(s.cx, s.cy, s.r, 0, Math.PI*2, false);
      const fg = new THREE.ShapeGeometry(shape2);
      const fm = new THREE.Mesh(fg, fillMat);
      fm.position.z = 0.01;
      floorSketchGroup.add(fm);
    } else if(s.type === 'arc'){
      const pts = [];
      const steps = 32;
      let a1 = s.startAngle, a2 = s.endAngle;
      if(a2 < a1) a2 += Math.PI*2;
      for(let i=0; i<=steps; i++){
        const t = a1 + (a2-a1)*i/steps;
        pts.push(to3(s.cx + s.r*Math.cos(t), s.cy + s.r*Math.sin(t)));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      floorSketchGroup.add(new THREE.Line(g, lineMat));
    }
  });

  // v2.8: 그룹의 바운딩박스 측정 → 바닥(Y 최소)을 Y=0, X·Z 중심을 0으로 정렬
  scene.add(floorSketchGroup);
  floorSketchGroup.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(floorSketchGroup);
  if(!bb.isEmpty()){
    const c = bb.getCenter(new THREE.Vector3());
    // X는 중심 → 0, Y는 최소 → 0, Z는 그대로 0
    floorSketchGroup.position.set(-c.x, -bb.min.y, 0);
  }
}

function toggleFloorSketch(){
  if(!floorSketchGroup){
    drawShapesOnFloor();
    if(!floorSketchGroup){ toast('표시할 스케치 도형이 없습니다'); return; }
    toast('👁️ 바닥 스케치 표시');
  } else {
    clearFloorSketch();
    toast('🚫 바닥 스케치 숨김');
  }
}

// 회전축 미리보기 (3D 뷰에 표시)
function showAxisPreview(axis){
  hideAxisPreview();
  const len = 200;
  const mat = new THREE.LineDashedMaterial({color: 0xff00aa, dashSize: 4, gapSize: 3, linewidth: 2});
  let p1, p2;
  if(axis === 'x'){ p1 = new THREE.Vector3(-len,0,0); p2 = new THREE.Vector3(len,0,0); }
  else if(axis === 'y'){ p1 = new THREE.Vector3(0,-len,0); p2 = new THREE.Vector3(0,len,0); }
  else { p1 = new THREE.Vector3(0,0,-len); p2 = new THREE.Vector3(0,0,len); }
  const g = new THREE.BufferGeometry().setFromPoints([p1,p2]);
  const line = new THREE.Line(g, mat);
  line.computeLineDistances();
  line.name = 'axisPreview';
  scene.add(line);
  floorAxisHelper = line;
}
function hideAxisPreview(){
  if(floorAxisHelper){
    scene.remove(floorAxisHelper);
    if(floorAxisHelper.geometry) floorAxisHelper.geometry.dispose();
    if(floorAxisHelper.material) floorAxisHelper.material.dispose();
    floorAxisHelper = null;
  }
}

function openExtrudeModal(){
  if(state.shapes.length === 0){toast('스케치가 없습니다'); return}
  document.getElementById('extrudePartName').value = '돌출_' + state.partIdCounter;
  document.getElementById('extrudeModal').classList.add('show');
}

function shapeToThreeShape(s){
  const shape = new THREE.Shape();
  if(s.type === 'rect'){
    const x1 = Math.min(s.x1, s.x2), x2 = Math.max(s.x1, s.x2);
    const y1 = Math.min(s.y1, s.y2), y2 = Math.max(s.y1, s.y2);
    shape.moveTo(x1, y1);
    shape.lineTo(x2, y1);
    shape.lineTo(x2, y2);
    shape.lineTo(x1, y2);
    shape.lineTo(x1, y1);
    return shape;
  } else if(s.type === 'circle'){
    shape.absarc(s.cx, s.cy, s.r, 0, Math.PI*2, false);
    return shape;
  } else if(s.type === 'polyline' && Array.isArray(s.points) && s.points.length >= 3){
    shape.moveTo(s.points[0].x, s.points[0].y);
    for(let i=1;i<s.points.length;i++) shape.lineTo(s.points[i].x, s.points[i].y);
    shape.closePath();
    return shape;
  } else if(s.type === 'fill' && Array.isArray(s.vertices) && s.vertices.length >= 3){
    // v8.47: 채움 객체 → THREE.Shape (돌출/회전체용 단면)
    shape.moveTo(s.vertices[0].x, s.vertices[0].y);
    for(let i=1; i<s.vertices.length; i++) shape.lineTo(s.vertices[i].x, s.vertices[i].y);
    shape.closePath();
    return shape;
  }
  return null;
}

// v4.4: 흩어진 선(line)들을 끝점 연결 순서로 묶어 닫힌 Shape 만들기
//   draw_tool에서 선 4개로 사각형을 그려 import한 경우 등에 대응
function linesToClosedShape(lines){
  if(!lines || lines.length < 3) return null;
  const tol = 0.5; // 끝점 일치 허용 오차(px)
  const segs = lines.map(l => ({a:{x:l.x1,y:l.y1}, b:{x:l.x2,y:l.y2}, used:false}));
  const near = (p,q)=> Math.hypot(p.x-q.x, p.y-q.y) <= tol;
  // 시작 세그먼트
  segs[0].used = true;
  const path = [segs[0].a, segs[0].b];
  let cur = segs[0].b;
  let guard = 0;
  while(guard++ < segs.length + 2){
    let found = false;
    for(const seg of segs){
      if(seg.used) continue;
      if(near(seg.a, cur)){ path.push(seg.b); cur = seg.b; seg.used = true; found = true; break; }
      if(near(seg.b, cur)){ path.push(seg.a); cur = seg.a; seg.used = true; found = true; break; }
    }
    if(!found) break;
    if(near(cur, path[0])) break; // 닫힘
  }
  // 닫힌 경로인지 확인 (시작점으로 돌아왔고 점 3개 이상)
  if(path.length < 4 || !near(path[path.length-1], path[0])) return null;
  const shape = new THREE.Shape();
  shape.moveTo(path[0].x, path[0].y);
  for(let i=1;i<path.length;i++) shape.lineTo(path[i].x, path[i].y);
  shape.closePath();
  return shape;
}

function doExtrude(){
  const height = parseFloat(document.getElementById('extrudeHeight').value);
  const dir = document.getElementById('extrudeDir').value;
  const color = document.getElementById('extrudeColor').value;
  let name = document.getElementById('extrudePartName').value.trim();
  if(!name) name = '돌출_' + state.partIdCounter;
  if(isNaN(height) || height <= 0){toast('높이를 입력하세요'); return}
  
  let targets = state.selectedShapes.size > 0
    ? [...state.selectedShapes].map(i => state.shapes[i])
    : state.shapes;
  
  const meshes = [];
  const lineShapes = []; // v4.4: 따로 모은 line들
  targets.forEach(s=>{
    if(s.type === 'line'){ lineShapes.push(s); return; } // line은 나중에 묶어서 처리
    const shape = shapeToThreeShape(s);
    if(!shape) return;
    const geom = new THREE.ExtrudeGeometry(shape, {depth: height, bevelEnabled: false, curveSegments: 24});
    if(dir === 'down') geom.translate(0, 0, -height);
    else if(dir === 'both') geom.translate(0, 0, -height/2);
    const mat = makeMaterial(color, 1);
    const mesh = new THREE.Mesh(geom, mat);
    meshes.push(mesh);
  });
  // v4.4: 흩어진 선들을 닫힌 경로로 묶어 면으로 돌출
  if(lineShapes.length >= 3){
    const closed = linesToClosedShape(lineShapes);
    if(closed){
      const geom = new THREE.ExtrudeGeometry(closed, {depth: height, bevelEnabled: false, curveSegments: 24});
      if(dir === 'down') geom.translate(0, 0, -height);
      else if(dir === 'both') geom.translate(0, 0, -height/2);
      const mesh = new THREE.Mesh(geom, makeMaterial(color, 1));
      meshes.push(mesh);
    } else {
      toast('⚠ 선들이 닫힌 도형을 이루지 않습니다 (끝점이 안 맞음)');
    }
  }
  
  if(meshes.length === 0){toast('돌출할 닫힌 도형(사각/원/닫힌 선)이 없습니다'); closeModal('extrudeModal'); return}
  
  const group = new THREE.Group();
  meshes.forEach(m => group.add(m));
  
  // v4.2: 돌출 파트를 바닥(y=0)에 안착 + 원점 근처로 정렬
  //   도면이 XY평면에 있어 그대로면 공중에 뜨므로, 바운딩박스 기준으로 위치 보정
  group.updateMatrixWorld(true);
  const gbb = new THREE.Box3().setFromObject(group);
  const gc = gbb.getCenter(new THREE.Vector3());
  // X(좌우), Z(앞뒤)는 중심을 원점으로, Y(높이)는 바닥(min)을 0으로
  group.position.x -= gc.x;
  group.position.z -= gc.z;
  group.position.y -= gbb.min.y;

  const part = {
    id: state.partIdCounter++, name: name, type: 'extrude',
    color: color, opacity: 1, visible: true,
    mesh: group, sourceShapes: JSON.parse(JSON.stringify(targets)),
    params: {height, dir}
  };
  state.parts.push(part);
  addPartToScene(part);
  renderPartsList();
  updateInfo();
  closeModal('extrudeModal');
  switchMode('model');
  fitView();
  pushHistory(); // v4.6
  toast('✅ 돌출 완료: ' + name);
}

// v4.8: 2D import 도형을 0.01mm 두께의 얇은 솔리드(박스) 부품으로 변환
//   - 단면 형상은 그대로 두고 Z방향으로 0.01mm 두께만 부여
//   - 위치는 import 좌표(원점 정렬됨) 유지 → 회전체 단면으로 바로 사용 가능
function makeThinSolidsFromShapes(shapes, thickness){
  const TH = (thickness && thickness > 0) ? thickness : 0.01;
  const color = '#00d4ff';
  const meshes = [];
  const lineShapes = [];
  shapes.forEach(s => {
    if(s.type === 'line'){ lineShapes.push(s); return; }
    const shape = shapeToThreeShape(s);
    if(!shape) return;
    const geom = new THREE.ExtrudeGeometry(shape, {depth: TH, bevelEnabled: false, curveSegments: 24});
    geom.translate(0, 0, -TH/2); // 두께 중심을 Z=0에 맞춤
    meshes.push(new THREE.Mesh(geom, makeMaterial(color, 1)));
  });
  // 흩어진 선들을 닫힌 경로로 묶어 면으로
  if(lineShapes.length >= 3){
    const closed = linesToClosedShape(lineShapes);
    if(closed){
      const geom = new THREE.ExtrudeGeometry(closed, {depth: TH, bevelEnabled: false, curveSegments: 24});
      geom.translate(0, 0, -TH/2);
      meshes.push(new THREE.Mesh(geom, makeMaterial(color, 1)));
    }
  }
  if(meshes.length === 0) return null;
  const group = new THREE.Group();
  meshes.forEach(m => group.add(m));
  const part = {
    id: state.partIdCounter++, name: '소재단면_' + state.partIdCounter,
    type: 'extrude', color: color, opacity: 1, visible: true,
    mesh: group, sourceShapes: JSON.parse(JSON.stringify(shapes)),
    params: {height: TH, dir: 'both'}
  };
  state.parts.push(part);
  addPartToScene(part);
  return part;
}

function openRevolveModal(){
  if(state.shapes.length === 0){toast('회전 단면 스케치가 없습니다'); return}
  document.getElementById('revolvePartName').value = '회전체_' + state.partIdCounter;
  document.getElementById('revolveModal').classList.add('show');
  // v2.2: 3D 뷰에 회전축 미리보기 (분홍 점선)
  const axisSel = document.getElementById('revolveAxis');
  showAxisPreview(axisSel.value);
  axisSel.onchange = () => showAxisPreview(axisSel.value);
}

function doRevolve(){
  const axis = document.getElementById('revolveAxis').value;
  const angleDeg = parseFloat(document.getElementById('revolveAngle').value);
  const seg = parseInt(document.getElementById('revolveSeg').value);
  const color = document.getElementById('revolveColor').value;
  const axisOffset = parseFloat(document.getElementById('revolveAxisOffset').value) || 0;
  const axisMode = document.getElementById('revolveAxisMode').value;
  let name = document.getElementById('revolvePartName').value.trim();
  if(!name) name = '회전체_' + state.partIdCounter;
  if(isNaN(angleDeg) || angleDeg <= 0){toast('각도를 입력하세요'); return}
  
  let targets = state.selectedShapes.size > 0
    ? [...state.selectedShapes].map(i => state.shapes[i])
    : state.shapes;
  
  // v8.48: 채움 객체가 포함된 경우 → 한쪽 outline 자동 추출 + 정렬 skip
  // (닫힌 폴리곤 전체를 y로 정렬하면 정점 순서가 깨져 사오리 형상이 됨)
  const hasFill = targets.some(s => s.type === 'fill');
  if(hasFill){
    toast('🌀 채움 객체 회전체: 한쪽 outline 자동 추출 (9각형 같은 닫힌 도형은 🟦 돌출이 더 적합)');
  }
  
  const points = [];
  targets.forEach(s=>{
    if(s.type === 'line'){
      points.push({x: s.x1, y: s.y1});
      points.push({x: s.x2, y: s.y2});
    } else if(s.type === 'arc'){
      const steps = 16;
      let a1 = s.startAngle, a2 = s.endAngle;
      if(a2 < a1) a2 += Math.PI*2;
      for(let i=0; i<=steps; i++){
        const t = a1 + (a2-a1) * i/steps;
        points.push({x: s.cx + s.r*Math.cos(t), y: s.cy + s.r*Math.sin(t)});
      }
    } else if(s.type === 'rect'){
      points.push({x: s.x1, y: s.y1});
      points.push({x: s.x2, y: s.y1});
      points.push({x: s.x2, y: s.y2});
      points.push({x: s.x1, y: s.y2});
    } else if(s.type === 'fill' && Array.isArray(s.vertices)){
      // v8.48: 닫힌 폴리곤 → 회전축 기준 한쪽 outline만 추출
      // |radius| 최대 정점 ~ |radius| 최소 정점 사이 두 경로 중 더 긴 쪽 (외곽 outline)
      const vs = s.vertices;
      const n = vs.length;
      const rOf = (v) => (axis === 'y' || axis === 'z') ? v.x : v.y;
      let iMax = 0, iMin = 0;
      for(let i = 1; i < n; i++){
        if(Math.abs(rOf(vs[i])) > Math.abs(rOf(vs[iMax]))) iMax = i;
        if(Math.abs(rOf(vs[i])) < Math.abs(rOf(vs[iMin]))) iMin = i;
      }
      function _traceOutline(start, end, dir){
        const path = [];
        let i = start, safety = n + 2;
        while(safety-- > 0){
          path.push({x: vs[i].x, y: vs[i].y});
          if(i === end) return path;
          i = (i + dir + n) % n;
        }
        return path;
      }
      const fwd = _traceOutline(iMax, iMin, 1);
      const bwd = _traceOutline(iMax, iMin, -1);
      const outline = (fwd.length >= bwd.length) ? fwd : bwd;
      outline.forEach(v => points.push({x: v.x, y: v.y}));
    }
  });
  
  if(points.length < 2){toast('회전할 단면이 부족합니다'); closeModal('revolveModal'); return}

  // 축 거리 적용: 단면의 축 방향(Y축이면 X좌표) 범위를 구해서 모드에 따라 평행이동
  // Y축 회전: x좌표가 회전 반경. axisMode에 따라 단면 전체를 이동
  // X축 회전: y좌표가 회전 반경. (코드에서는 변환 시 swap)
  // Rev.1.2: 축 거리(offset)는 "축~단면 사이 최소 거리"로 해석
  let lathePts;
  if(axis === 'z'){
    // v4.8: Z축 회전 - 단면 우측면(+X, maxX)을 회전축에 맞닿게 정렬
    //   반경 = maxX - p.x  (우측 끝 = 반경0, 왼쪽일수록 반경 증가)
    //   높이축(lathe의 y) = 단면의 y좌표
    const xs = points.map(p=>p.x);
    const maxX = Math.max(...xs);
    lathePts = points.map(p => {
      const r = (maxX - p.x) + axisOffset; // 우측면 기준 + 축거리
      return new THREE.Vector2(Math.max(0, r), p.y);
    });
  } else if(axis === 'y'){
    // x좌표 범위
    const xs = points.map(p=>p.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    // 모드별 단면 이동량 결정
    // - auto: 단면이 그려진 위치 그대로 (Math.abs로 양수화) + offset 추가
    // - near: 축에서 가장 가까운 변(=|x| 최소)이 offset 만큼 떨어지도록
    // - far: 축에서 가장 먼 변(=|x| 최대)이 offset 만큼 떨어지도록
    let baseShift = 0;
    if(axisMode === 'near'){
      // |x| 최소값을 offset에 맞춤 → 가까운 변이 |x| = offset
      const minAbsX = Math.min(Math.abs(minX), Math.abs(maxX), minX <= 0 && maxX >= 0 ? 0 : Infinity);
      baseShift = axisOffset - minAbsX;
    } else if(axisMode === 'far'){
      const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX));
      baseShift = axisOffset - maxAbsX;
    } else {
      // auto: 그냥 offset만 추가
      baseShift = axisOffset;
    }
    lathePts = points.map(p => {
      const newX = Math.abs(p.x) + baseShift;
      return new THREE.Vector2(Math.max(0, newX), p.y);
    });
  } else {
    // X축 회전: y좌표가 반경
    const ys = points.map(p=>p.y);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    let baseShift = 0;
    if(axisMode === 'near'){
      const minAbsY = Math.min(Math.abs(minY), Math.abs(maxY), minY <= 0 && maxY >= 0 ? 0 : Infinity);
      baseShift = axisOffset - minAbsY;
    } else if(axisMode === 'far'){
      const maxAbsY = Math.max(Math.abs(minY), Math.abs(maxY));
      baseShift = axisOffset - maxAbsY;
    } else {
      baseShift = axisOffset;
    }
    lathePts = points.map(p => {
      const newR = Math.abs(p.y) + baseShift;
      return new THREE.Vector2(Math.max(0, newR), p.x);
    });
  }
  // v8.48: 채움 객체가 있으면 정점 순서가 이미 outline 순서이므로 정렬 skip
  // (정렬하면 outline 순서가 깨져 사오리 형상이 됨)
  if(!hasFill){
    lathePts.sort((a,b)=>a.y - b.y);
  }
  
  // v2.3: 회전체 결과가 비정상(원반/도넛만) 인지 진단
  //   - 모든 lathe 점의 반경(x)이 거의 같으면 → 원반/도넛만 나옴
  //   - 모든 lathe 점의 높이(y)가 거의 같으면 → 단일 원반
  const radii = lathePts.map(p => p.x);
  const heights = lathePts.map(p => p.y);
  const radiusRange = Math.max(...radii) - Math.min(...radii);
  const heightRange = Math.max(...heights) - Math.min(...heights);
  let warnMsg = '';
  if(radiusRange < 0.1 && heightRange > 0){
    warnMsg = '⚠️ 단면이 회전축과 평행한 단일선 → 얇은 원기둥 외피만 생성됨';
  } else if(heightRange < 0.1 && radiusRange > 0){
    warnMsg = '⚠️ 단면이 회전축에 수직인 단일선 → 평평한 원반만 생성됨';
  } else if(radiusRange < 0.1 && heightRange < 0.1){
    warnMsg = '⚠️ 단면이 한 점에 모임 → 회전체 결과 없음';
  }
  console.log('[doRevolve] lathe 점:', lathePts.length, '개, 반경범위:', radiusRange.toFixed(2), '높이범위:', heightRange.toFixed(2), warnMsg);
  
  const angleRad = angleDeg * Math.PI / 180;
  const geom = new THREE.LatheGeometry(lathePts, seg, 0, angleRad);
  const mat = makeMaterial(color, 1);
  const mesh = new THREE.Mesh(geom, mat);
  if(axis === 'x') mesh.rotation.z = -Math.PI / 2;
  else if(axis === 'z') mesh.rotation.x = -Math.PI / 2; // v4.8: Lathe(Y축)를 Z축 방향으로 눕힘
  
  const part = {
    id: state.partIdCounter++, name: name, type: 'revolve',
    color: color, opacity: 1, visible: true,
    mesh: mesh, sourceShapes: JSON.parse(JSON.stringify(targets)),
    params: {axis, angle: angleDeg, seg, axisOffset, axisMode}
  };
  state.parts.push(part);
  addPartToScene(part);
  renderPartsList();
  updateInfo();
  closeModal('revolveModal');
  switchMode('model');
  fitView();
  if(warnMsg){
    toast(warnMsg);
    setStat(warnMsg + ' - 회전축이나 단면 모양을 확인하세요');
  } else {
    pushHistory(); // v4.6
    toast('✅ 회전체 완료: ' + name + (axisOffset !== 0 ? ' (축거리 '+axisOffset+'mm)' : ''));
  }
}

// ===== v4.9: SVG Revolver (Tinkercad SVG Revolver 스타일) =====
let _svgRevData = null; // 파싱된 SVG 단면 폴리라인 보관

function openSvgRevolverModal(){
  document.getElementById('svgRevPartName').value = 'SVG회전체_' + state.partIdCounter;
  document.getElementById('svgRevolverModal').classList.add('show');
}

// SVG 파일 선택 시 파싱
function onSvgRevFile(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      _svgRevData = parseSvgToOutline(ev.target.result);
      if(!_svgRevData || _svgRevData.length === 0){
        document.getElementById('svgRevInfo').innerHTML = '❌ SVG에서 윤곽을 찾지 못했습니다. (path/polygon 포함 SVG 필요)';
        _svgRevData = null;
        return;
      }
      const ptCount = _svgRevData.reduce((a,c)=>a+c.length,0);
      document.getElementById('svgRevInfo').innerHTML =
        '✅ SVG 파싱 완료: 윤곽 ' + _svgRevData.length + '개, 점 ' + ptCount + '개<br>[생성] 버튼을 누르세요.';
    } catch(err){
      document.getElementById('svgRevInfo').innerHTML = '❌ SVG 파싱 오류: ' + err.message;
      _svgRevData = null;
    }
  };
  reader.readAsText(file);
}

// v4.9.1: SVG 문자열 → 윤곽 폴리라인 배열 [[{x,y},...], ...]
//   외부 SVGLoader 없이 브라우저 내장 SVG DOM 사용
//   getTotalLength/getPointAtLength로 곡선(베지어/호)까지 균일 샘플링
//   Y는 위가 +가 되도록 반전
function parseSvgToOutline(svgText){
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const perr = doc.querySelector('parsererror');
  if(perr) throw new Error('SVG 형식 오류');
  let svg = doc.querySelector('svg');
  if(!svg) throw new Error('<svg> 요소 없음');

  // 길이 측정을 위해 화면 밖에 임시 삽입 (getTotalLength는 렌더 트리 필요)
  svg = document.importNode(svg, true);
  const holder = document.createElement('div');
  holder.style.cssText = 'position:absolute;left:-99999px;top:-99999px;width:0;height:0;overflow:hidden';
  holder.appendChild(svg);
  document.body.appendChild(holder);

  const outlines = [];
  const SAMPLES = 128; // 윤곽당 샘플 점 수
  try {
    const els = svg.querySelectorAll('path, polygon, polyline, line, rect, circle, ellipse');
    els.forEach(el => {
      let pts = null;
      // 1순위: 브라우저 내장 길이 샘플링 (곡선/호 정확)
      try {
        const total = el.getTotalLength ? el.getTotalLength() : 0;
        if(total > 0){
          pts = [];
          for(let i=0; i<=SAMPLES; i++){
            const p = el.getPointAtLength(total * i / SAMPLES);
            pts.push({x: p.x, y: -p.y});
          }
        }
      } catch(_){ pts = null; }
      // 2순위: 폴백 - 좌표 직접 추출 (직선 도형, getTotalLength 미지원 환경)
      if(!pts || pts.length < 2){
        pts = svgElementToPointsFallback(el);
      }
      if(pts && pts.length >= 2) outlines.push(pts);
    });
  } finally {
    document.body.removeChild(holder);
  }
  return outlines;
}

// v4.9.1: getTotalLength 미지원 시 좌표 직접 추출 (직선 위주)
function svgElementToPointsFallback(el){
  const tag = el.tagName.toLowerCase();
  const pts = [];
  const push = (x,y) => pts.push({x: parseFloat(x), y: -parseFloat(y)});
  if(tag === 'polygon' || tag === 'polyline'){
    const raw = (el.getAttribute('points')||'').trim().split(/[\s,]+/).map(Number);
    for(let i=0; i+1<raw.length; i+=2) push(raw[i], raw[i+1]);
  } else if(tag === 'line'){
    push(el.getAttribute('x1'), el.getAttribute('y1'));
    push(el.getAttribute('x2'), el.getAttribute('y2'));
  } else if(tag === 'rect'){
    const x=+el.getAttribute('x')||0, y=+el.getAttribute('y')||0;
    const w=+el.getAttribute('width')||0, h=+el.getAttribute('height')||0;
    push(x,y); push(x+w,y); push(x+w,y+h); push(x,y+h); push(x,y);
  } else if(tag === 'circle' || tag === 'ellipse'){
    const cx=+el.getAttribute('cx')||0, cy=+el.getAttribute('cy')||0;
    const rx = tag==='circle' ? (+el.getAttribute('r')||0) : (+el.getAttribute('rx')||0);
    const ry = tag==='circle' ? (+el.getAttribute('r')||0) : (+el.getAttribute('ry')||0);
    for(let i=0;i<=64;i++){ const t=i/64*Math.PI*2; push(cx+rx*Math.cos(t), cy+ry*Math.sin(t)); }
  } else if(tag === 'path'){
    // 직선 명령(M/L/H/V/Z)만 파싱하는 간이 파서
    const d = el.getAttribute('d')||'';
    const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    let i=0, cx=0, cy=0, sx=0, sy=0, cmd='';
    const num = () => parseFloat(tokens[i++]);
    while(i < tokens.length){
      const t = tokens[i];
      if(/[a-zA-Z]/.test(t)){ cmd = t; i++; }
      const abs = cmd === cmd.toUpperCase();
      switch(cmd.toUpperCase()){
        case 'M': { let x=num(),y=num(); cx=abs?x:cx+x; cy=abs?y:cy+y; sx=cx; sy=cy; push(cx,cy); cmd = abs?'L':'l'; break; }
        case 'L': { let x=num(),y=num(); cx=abs?x:cx+x; cy=abs?y:cy+y; push(cx,cy); break; }
        case 'H': { let x=num(); cx=abs?x:cx+x; push(cx,cy); break; }
        case 'V': { let y=num(); cy=abs?y:cy+y; push(cx,cy); break; }
        case 'Z': { push(sx,sy); break; }
        default: { i++; } // 곡선 명령 등은 토큰 건너뛰기 (정확도는 떨어지나 깨지지 않음)
      }
    }
  }
  return pts;
}

function doSvgRevolve(){
  if(!_svgRevData){toast('먼저 SVG 파일을 선택하세요'); return}
  const mode = document.getElementById('svgRevMode').value;
  const sketchHeight = parseFloat(document.getElementById('svgRevHeight').value) || 5;
  const innerD = parseFloat(document.getElementById('svgRevInnerD').value) || 0;
  const seg = parseInt(document.getElementById('svgRevSeg').value) || 24;
  const startAngleDeg = parseFloat(document.getElementById('svgRevStartAngle').value) || 0;
  const angleDeg = parseFloat(document.getElementById('svgRevAngle').value) || 360;
  const dir = (document.getElementById('svgRevDir') && document.getElementById('svgRevDir').value) || 'ccw';
  const color = document.getElementById('svgRevColor').value;
  let name = document.getElementById('svgRevPartName').value.trim();
  if(!name) name = 'SVG회전체_' + state.partIdCounter;

  // 전체 윤곽의 바운딩박스 → 스케치 높이로 스케일
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  _svgRevData.forEach(poly => poly.forEach(p => {
    if(p.x<minX)minX=p.x; if(p.x>maxX)maxX=p.x;
    if(p.y<minY)minY=p.y; if(p.y>maxY)maxY=p.y;
  }));
  const svgH = Math.max(1e-6, maxY - minY);
  const scale = sketchHeight / svgH; // SVG 세로 → sketchHeight mm
  const innerR = innerD; // 내부 지름 입력값을 그대로 반경으로 사용 (입력값=지름이므로 /2 불필요)

  // 가장 점이 많은(주) 윤곽을 단면으로 사용
  let main = _svgRevData[0];
  _svgRevData.forEach(poly => { if(poly.length > main.length) main = poly; });

  // v7.1.4: SWEEP — 단면의 한쪽 끝을 회전축에 "묶어" 경로 따라 회전
  //   기준 A: 왼쪽 끝(minX)을 축에 붙임 → 단면이 오른쪽으로 펼쳐짐
  //   기준 B: 오른쪽 끝(maxX)을 축에 붙임 → 단면을 좌우반전, 반대 방향으로 펼쳐짐
  //   • p.x → 반경방향(축에서 거리, 0 이상), p.y → 높이방향 (Y 뒤집기)
  const pivotB = (dir === 'B');
  let profile = main.map(p => ({
    x: (pivotB ? (maxX - p.x) : (p.x - minX)) * scale,  // 묶는 끝을 0(축)에 정렬
    y: (maxY - p.y) * scale                              // 세로(Y 뒤집기) → 높이
  }));
  // 연속 중복점 제거
  profile = profile.filter((p,i,arr)=>{
    if(i===0) return true;
    const q=arr[i-1];
    return Math.hypot(p.x-q.x, p.y-q.y) > 1e-4;
  });
  // 마지막=처음 닫힘점 제거 (sweep에서 자동 닫힘)
  if(profile.length>2){
    const a=profile[0], b=profile[profile.length-1];
    if(Math.hypot(a.x-b.x, a.y-b.y) < 1e-3) profile.pop();
  }
  if(profile.length<3){toast('단면 점이 부족합니다 (닫힌 도형 필요)'); return}
  // 너무 조밀하면 다운샘플 (v8.82: STL 용량 관리 — 단면 최대 80점, 120등분과 곱해도 적정)
  if(profile.length>80){
    const step=Math.ceil(profile.length/80);
    profile=profile.filter((_,i)=>i%step===0);
  }
  // 단면 점 순서를 CCW로 정규화 (옆면/끝면 법선 일관성)
  let area2=0;
  for(let i=0;i<profile.length;i++){
    const j=(i+1)%profile.length;
    area2 += profile[i].x*profile[j].y - profile[j].x*profile[i].y;
  }
  if(area2 < 0) profile.reverse();

  const angleRad = angleDeg * Math.PI / 180;
  const startRad = startAngleDeg * Math.PI / 180;
  // v7.1.4: 묶는 끝(단면 x의 최솟값)이 경로 반지름 innerR에 정확히 닿도록.
  //   innerR=0이면 묶는 끝이 중심축(반지름 0)에 붙어 가운데 구멍이 없음.
  let minPx = Infinity;
  profile.forEach(p=>{ if(p.x < minPx) minPx = p.x; });
  const pathR = innerR - minPx; // minPx(보통 0) → pathR = innerR
  // v8.82: 면 수는 입력값 그대로. 360°일 때만 최소 120 보장 (그 이상은 입력값 우선)
  //   자동 과다 상향(수백 등분 → STL 용량 폭증) 제거
  const segUse = (angleDeg >= 359.5) ? Math.max(seg, 120) : seg;
  let geom = sweepProfileTorus(profile, segUse, startRad, angleRad, pathR, angleDeg < 359.5);
  geom = smoothRevolveGeom(geom); // v8.81: weld + 와인딩 일관화 (STL 매끈)
  const mat = makeMaterial(color, mode === 'hole' ? 0.4 : 1);
  const mesh = new THREE.Mesh(geom, mat);

  const part = {
    id: state.partIdCounter++, name: name, type: 'svgrevolve',
    color: color, opacity: (mode === 'hole' ? 0.4 : 1), visible: true,
    mesh: mesh, _isHole: (mode === 'hole'),
    params: {
      mode, sketchHeight, innerD, seg, startAngleDeg, angleDeg, pathR, dir,
      sweep: true, // v7.1.4: sweep 방식 표시 (복원 구분)
      profile: profile.map(v => ({x: v.x, y: v.y}))
    }
  };
  state.parts.push(part);
  addPartToScene(part);
  renderPartsList();
  updateInfo();
  closeModal('svgRevolverModal');
  switchMode('model');
  fitView();
  pushHistory(); // v4.6
  toast('✅ SVG Revolver 완료: ' + name + ' (' + angleDeg + '°, ' + seg + '면)');
}

// v5.0: 닫힌 단면 폴리곤을 Y축 둘레로 회전시켜 솔리드 생성 (부드러운 sweep)
//   profile: [{x:반경, y:높이}, ...] CCW 정규화된 닫힌 폴리곤
//   끝면(부채꼴 양 단면)은 ShapeUtils로 정확히 삼각화 → 오목 단면도 깔끔
function revolveProfileSweep(profile, segments, startAngle, totalAngle, closeEnds){
  const n=profile.length;
  const positions=[];
  const indices=[];
  const rings=segments+1;
  for(let s=0;s<rings;s++){
    const a=startAngle + totalAngle*(s/segments);
    const cos=Math.cos(a), sin=Math.sin(a);
    for(let i=0;i<n;i++){
      const p=profile[i];
      positions.push(p.x*cos, p.y, p.x*sin);
    }
  }
  // 옆면(측벽)
  for(let s=0;s<segments;s++){
    const b0=s*n, b1=(s+1)*n;
    for(let i=0;i<n;i++){
      const i2=(i+1)%n;
      const A=b0+i, B=b0+i2, C=b1+i2, D=b1+i;
      indices.push(A,B,D);
      indices.push(B,C,D);
    }
  }
  // 부채꼴(360 미만)일 때 양 끝 단면을 정확히 삼각화하여 막음
  if(closeEnds && totalAngle < Math.PI*2 - 1e-6){
    const contour = profile.map(p=>new THREE.Vector2(p.x, p.y));
    let faces=[];
    try { faces = THREE.ShapeUtils.triangulateShape(contour, []); }
    catch(_) { faces = []; }
    if(faces.length === 0){
      for(let i=1;i<n-1;i++) faces.push([0,i,i+1]);
    }
    faces.forEach(f=>{
      const [a,b,c]=f;
      indices.push(a, b, c);            // 시작면
      const off=segments*n;
      indices.push(off+a, off+c, off+b); // 끝면(반대 winding)
    });
  }
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// v7.1.4: SWEEP 방식 — SVG 닫힌 단면을 원형 경로(고리)를 따라 이동시켜 도넛/튜브 생성
//   단면 좌표(cx,cy)는 단면 로컬평면, 경로 반지름 R, 각도만큼 sweep.
//   각 링의 단면은 경로 접선에 수직(반경방향+높이방향)으로 배치.
//   profile: [{x,y}] 단면 폴리곤(로컬 mm, 단면 중심이 원점 근처), R: 경로 반지름
function sweepProfileTorus(profile, segments, startAngle, totalAngle, pathR, closeEnds){
  const n = profile.length;
  const positions = [];
  const indices = [];
  const rings = segments + 1;
  for(let s=0; s<rings; s++){
    const a = startAngle + totalAngle*(s/segments);
    const cos = Math.cos(a), sin = Math.sin(a);
    // 경로상의 이 위치에서: 바깥(반경)방향 = (cos,0,sin), 위방향 = (0,1,0)
    for(let i=0;i<n;i++){
      const p = profile[i];
      // 단면 로컬 (p.x = 반경방향 오프셋, p.y = 높이방향 오프셋)
      const radial = pathR + p.x;
      positions.push(radial*cos, p.y, radial*sin);
    }
  }
  // 옆면(튜브 외피) — 음수각도(시계방향)면 winding 반전해 법선이 바깥으로
  const flip = totalAngle < 0;
  for(let s=0;s<segments;s++){
    const b0=s*n, b1=(s+1)*n;
    for(let i=0;i<n;i++){
      const i2=(i+1)%n;
      const A=b0+i, B=b0+i2, C=b1+i2, D=b1+i;
      if(!flip){
        indices.push(A,B,D);
        indices.push(B,C,D);
      } else {
        indices.push(A,D,B);
        indices.push(B,D,C);
      }
    }
  }
  // 열린 sweep(360 미만)일 때 양 끝 단면 막기
  if(closeEnds && Math.abs(totalAngle) < Math.PI*2 - 1e-6){
    const contour = profile.map(p=>new THREE.Vector2(p.x, p.y));
    let faces=[];
    try { faces = THREE.ShapeUtils.triangulateShape(contour, []); } catch(_) { faces=[]; }
    if(faces.length===0){ for(let i=1;i<n-1;i++) faces.push([0,i,i+1]); }
    faces.forEach(f=>{
      const [a,b,c]=f;
      const off=segments*n;
      if(!flip){
        indices.push(a,b,c);
        indices.push(off+a, off+c, off+b);
      } else {
        indices.push(a,c,b);
        indices.push(off+a, off+b, off+c);
      }
    });
  }
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// v8.81: 회전체 메시 정리 — 정점 weld(0.001mm) + 와인딩 일관화 → Tinkercad에서 매끈
function smoothRevolveGeom(geom){
  const g = geom.index ? geom.toNonIndexed() : geom;
  const p = g.attributes.position.array;
  const tris = [];
  for(let i=0;i<p.length;i+=9){
    tris.push([
      {x:p[i],  y:p[i+1],z:p[i+2]},
      {x:p[i+3],y:p[i+4],z:p[i+5]},
      {x:p[i+6],y:p[i+7],z:p[i+8]}
    ]);
  }
  // weld + 중복/퇴화 제거
  const Q=1000, key=v=>Math.round(v.x*Q)+'_'+Math.round(v.y*Q)+'_'+Math.round(v.z*Q);
  const vm=new Map(), verts=[], vid=v=>{const k=key(v);let id=vm.get(k);if(id===undefined){id=verts.length;verts.push(v);vm.set(k,id);}return id;};
  const seen=new Set(), clean=[];
  tris.forEach(t=>{const a=vid(t[0]),b=vid(t[1]),c=vid(t[2]);if(a===b||b===c||a===c)return;const s=[a,b,c].slice().sort((x,y)=>x-y).join('_');if(seen.has(s))return;seen.add(s);clean.push([verts[a],verts[b],verts[c]]);});
  // 와인딩 일관화 (연결요소별) — orientByComponent가 있으면 사용, 없으면 그대로
  const oriented = (typeof orientTrianglesByComponent==='function')
    ? orientTrianglesByComponent(clean, v=>vid(v), verts.length)
    : clean;
  const out=[];
  oriented.forEach(t=>{ out.push(t[0].x,t[0].y,t[0].z, t[1].x,t[1].y,t[1].z, t[2].x,t[2].y,t[2].z); });
  const ng=new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.Float32BufferAttribute(out,3));
  ng.computeVertexNormals();
  ng._cleanTris = oriented;
  return ng;
}

// 저장/불러오기/undo 복원용
function rebuildSvgRevolve(pdata){
  const p = pdata.params || {};
  // v5.0: profile 우선, 구버전 lathe 데이터는 폴백
  let profile = p.profile;
  if(!profile && p.lathe){
    // 구버전(lathe 외곽 프로파일) 호환: 그대로 닫힌 단면 취급은 부정확하므로 LatheGeometry 폴백
    const lathePts = p.lathe.map(o => new THREE.Vector2(o.x, o.y));
    const angleRad = (p.angleDeg || 360) * Math.PI / 180;
    const startRad = (p.startAngleDeg || 0) * Math.PI / 180;
    const geom = new THREE.LatheGeometry(lathePts, p.seg || 24, startRad, angleRad);
    const mat = makeMaterial(pdata.color, pdata.opacity);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.visible = pdata.visible;
    return {...pdata, mesh};
  }
  if(!profile || profile.length < 3) return null;
  const angleDeg = p.angleDeg || 360;
  const angleRad = angleDeg * Math.PI / 180;
  const startRad = (p.startAngleDeg || 0) * Math.PI / 180;
  let geom;
  if(p.sweep){
    // v7.1.4: sweep(도넛/파이프) 방식 복원
    let pathR = p.pathR;
    if(pathR === undefined){
      let minPx = Infinity; profile.forEach(o=>{ if(o.x<minPx) minPx=o.x; });
      pathR = (p.innerD ? p.innerD/2 : 0) - minPx; // v7.1.4: innerR - minPx
    }
    const signed = angleRad; // v7.1.4: 방향은 profile 좌우반전으로 이미 반영됨
    geom = sweepProfileTorus(profile.map(o=>({x:o.x,y:o.y})), p.seg || 24, startRad, signed, pathR, angleDeg < 359.5);
    if(typeof smoothRevolveGeom === 'function') geom = smoothRevolveGeom(geom); // v8.81
  } else {
    // 구버전 lathe 방식 복원
    geom = revolveProfileSweep(profile.map(o=>({x:o.x, y:o.y})), p.seg || 24, startRad, angleRad, angleDeg < 359.5);
  }
  const mat = makeMaterial(pdata.color, pdata.opacity);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.visible = pdata.visible;
  return {...pdata, mesh};
}

// v7.1.4: 가져온 메시 복원 (저장된 정점 배열로 geometry 재생성)
function rebuildImportedMesh(pdata){
  const p = pdata.params || {};
  if(!p.positions || p.positions.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(p.positions), 3));
  if(p.indices && p.indices.length) g.setIndex(p.indices);
  g.computeVertexNormals();
  const mat = makeMaterial(pdata.color || '#9aa7b4', pdata.opacity != null ? pdata.opacity : 1, pdata.material || 'plastic_matte');
  const mesh = new THREE.Mesh(g, mat);
  mesh.visible = pdata.visible !== false;
  return {...pdata, mesh, params: p};
}

function addPrimitive(kind){
  let geom, defaultColor;
  if(kind === 'box'){geom = new THREE.BoxGeometry(30, 30, 30); defaultColor = '#7a8aa0'}
  else if(kind === 'cylinder'){geom = new THREE.CylinderGeometry(15, 15, 30, 32); defaultColor = '#a08070'}
  else if(kind === 'sphere'){geom = new THREE.SphereGeometry(15, 32, 24); defaultColor = '#80a070'}
  if(!geom) return;
  
  const mat = makeMaterial(defaultColor, 1);
  const mesh = new THREE.Mesh(geom, mat);
  const names = {box:'박스', cylinder:'원통', sphere:'구'};
  // v7.1.4: 정의 치수 저장 (지름 표시에 활용, scale 곱해 실제값 계산)
  const dimDefs = {
    box:      {kind:'box', dia:null, baseDia:30, baseH:30},
    cylinder: {kind:'cylinder', baseDia:30, baseH:30},
    sphere:   {kind:'sphere', baseDia:30}
  };
  const part = {
    id: state.partIdCounter++, name: names[kind] + '_' + state.partIdCounter,
    type: 'primitive_' + kind, color: defaultColor, opacity: 1, visible: true,
    mesh: mesh, params: {palette: kind, dim: dimDefs[kind]}
  };
  state.parts.push(part);
  addPartToScene(part);
  renderPartsList();
  updateInfo();
  switchMode('model');
  fitView();
  pushHistory(); // v4.6: 기본도형 추가도 되돌리기 대상
  toast('✅ ' + names[kind] + ' 추가됨');
}

// ===== v2.4: 팅커캐드 스타일 도형 팔레트 - 원클릭 즉시 추가 =====
// 기본 도형 정의 (BoxGeometry 등은 객체 중심이 원점이므로 바닥에 안착시키려면 Y로 들어올리기)
// ===== v2.6: 워크플레인 (W 키) =====
// 클릭한 면을 새 작업평면으로 지정 → 다음 도형이 그 면 위에 생성됨
// 팅커캐드 W 기능 동일

function onWorkPlaneButton(){
  if(state.workPlanePickMode || state.workPlane) clearWorkPlane();
  else startWorkPlanePick();
}

function startWorkPlanePick(){
  if(state.mode !== 'model'){
    toast('3D 모드에서만 사용 가능');
    return;
  }
  state.workPlanePickMode = true;
  document.body.style.cursor = 'crosshair';
  // 안내 배너
  showWorkPlaneBanner('🟡 면을 클릭하면 그 면이 새 작업평면이 됩니다 (ESC=취소, 빈 곳 클릭=글로벌 바닥)');
  setStat('W 모드: 부품 면을 클릭하세요');
}

function clearWorkPlane(){
  if(state.workPlane && state.workPlane.mesh){
    scene.remove(state.workPlane.mesh);
    state.workPlane.mesh.traverse(o => {
      if(o.geometry) o.geometry.dispose();
      if(o.material){
        if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose());
        else o.material.dispose();
      }
    });
  }
  state.workPlane = null;
  state.workPlanePickMode = false;
  document.body.style.cursor = '';
  hideWorkPlaneBanner();
  setStat('워크플레인 해제 - 글로벌 바닥(Y=0)');
}

function setWorkPlaneFromHit(hit){
  // hit는 raycaster 결과 (face.normal 포함)
  if(!hit || !hit.face || !hit.point){
    toast('면을 인식할 수 없습니다');
    return;
  }
  // 클릭된 면의 월드 노멀 계산
  const normalLocal = hit.face.normal.clone();
  const normalMat = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
  const normalWorld = normalLocal.clone().applyMatrix3(normalMat).normalize();
  const origin = hit.point.clone();
  // 부품 id 추적
  let partId = null;
  let cur = hit.object;
  while(cur && partId === null){
    if(cur.userData && cur.userData._partId !== undefined) partId = cur.userData._partId;
    cur = cur.parent;
  }
  // 기존 워크플레인 제거
  if(state.workPlane && state.workPlane.mesh){
    scene.remove(state.workPlane.mesh);
  }
  // 노란 격자 메쉬 (반투명) — 100×100mm, 10mm 격자
  const planeGroup = new THREE.Group();
  planeGroup.name = '_workPlane';
  // 채움
  const fillGeom = new THREE.PlaneGeometry(120, 120);
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xffd54a, transparent: true, opacity: 0.18,
    side: THREE.DoubleSide, depthWrite: false
  });
  const fill = new THREE.Mesh(fillGeom, fillMat);
  planeGroup.add(fill);
  // 격자 라인 (12개 × 12개)
  const gridMat = new THREE.LineBasicMaterial({color: 0xffd54a, transparent: true, opacity: 0.6});
  const gridPts = [];
  const half = 60, step = 10;
  for(let v = -half; v <= half; v += step){
    gridPts.push(new THREE.Vector3(-half, 0.01, v));
    gridPts.push(new THREE.Vector3(half, 0.01, v));
    gridPts.push(new THREE.Vector3(v, 0.01, -half));
    gridPts.push(new THREE.Vector3(v, 0.01, half));
  }
  const gridGeom = new THREE.BufferGeometry().setFromPoints(gridPts);
  const grid = new THREE.LineSegments(gridGeom, gridMat);
  planeGroup.add(grid);
  // PlaneGeometry는 기본 XY평면(법선 +Z). normalWorld 방향으로 회전.
  // quaternion: (0,0,1) → normalWorld
  const quat = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1), normalWorld
  );
  planeGroup.quaternion.copy(quat);
  // 워크플레인의 "위쪽"이 +Z 방향이 되도록 (정상)
  // 하지만 우리는 normalWorld 위에 도형이 놓이길 원하므로
  // PlaneGeometry의 면이 normalWorld과 일치하도록 회전했음.
  // 도형은 normalWorld 방향으로 올라가야 함.
  planeGroup.position.copy(origin);
  // 동일평면 깊이충돌 방지를 위해 노멀 방향으로 살짝 띄움
  planeGroup.position.addScaledVector(normalWorld, 0.05);
  scene.add(planeGroup);

  state.workPlane = {
    origin: origin.clone(),
    normal: normalWorld.clone(),
    partId: partId,
    mesh: planeGroup,
    quaternion: quat.clone()
  };
  state.workPlanePickMode = false;
  document.body.style.cursor = '';
  hideWorkPlaneBanner();
  showWorkPlaneBanner('🟡 워크플레인 활성 (' + 
    formatNormal(normalWorld) + ') · 다음 도형이 이 면 위에 생성됩니다 · [W 다시 누르기 또는 ESC]로 해제',
    true);
  setStat('워크플레인 설정됨: ' + formatNormal(normalWorld) + ' @ ' + origin.x.toFixed(1) + ',' + origin.y.toFixed(1) + ',' + origin.z.toFixed(1));
  toast('🟡 워크플레인 지정 완료 — 도형 추가 시 이 면 위에 생성됩니다');
}

function formatNormal(n){
  // 가장 가까운 정축 표시
  const ax = ['+X','-X','+Y','-Y','+Z','-Z'];
  const dirs = [
    new THREE.Vector3(1,0,0), new THREE.Vector3(-1,0,0),
    new THREE.Vector3(0,1,0), new THREE.Vector3(0,-1,0),
    new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,-1)
  ];
  let best = 0, bestDot = -2;
  dirs.forEach((d, i) => { const dot = d.dot(n); if(dot > bestDot){bestDot = dot; best = i;} });
  return bestDot > 0.95 ? ax[best] + '면' : '경사면';
}

let _wpBanner = null;
function showWorkPlaneBanner(msg, persistent){
  hideWorkPlaneBanner();
  const div = document.createElement('div');
  div.id = 'wpBanner';
  div.style.cssText = 'position:absolute;top:14px;left:50%;transform:translateX(-50%);background:rgba(255,213,74,.95);color:#222;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:bold;z-index:80;box-shadow:0 4px 12px rgba(0,0,0,.4);pointer-events:none;max-width:80%;text-align:center';
  div.textContent = msg;
  const va = document.getElementById('viewerArea');
  if(va) va.appendChild(div); else document.body.appendChild(div);
  _wpBanner = div;
}
function hideWorkPlaneBanner(){
  if(_wpBanner && _wpBanner.parentNode) _wpBanner.parentNode.removeChild(_wpBanner);
  _wpBanner = null;
}

// v6.3: 팔레트 도형 geometry 생성 (복원 시 재사용 → undo 후 크기 1 버그 방지)
function makePaletteGeometry(kind){
  let geom, color, name, bottomLift;
  if(kind === 'box'){
    geom = new THREE.BoxGeometry(30, 30, 30); color = '#7a8aa0'; name = '박스'; bottomLift = 15;
  } else if(kind === 'cylinder'){
    geom = new THREE.CylinderGeometry(15, 15, 30, 32); color = '#a08070'; name = '원통'; bottomLift = 15;
  } else if(kind === 'sphere'){
    geom = new THREE.SphereGeometry(15, 32, 24); color = '#80a070'; name = '구'; bottomLift = 15;
  } else if(kind === 'cone'){
    geom = new THREE.ConeGeometry(15, 30, 32); color = '#a06080'; name = '원뿔'; bottomLift = 15;
  } else if(kind === 'torus'){
    geom = new THREE.TorusGeometry(20, 5, 16, 48);
    geom.rotateX(Math.PI/2);
    color = '#d4a05a'; name = '도넛'; bottomLift = 5;
  } else if(kind === 'pyramid'){
    geom = new THREE.ConeGeometry(20, 30, 4);
    geom.rotateY(Math.PI/4);
    color = '#d4c45a'; name = '피라미드'; bottomLift = 15;
  } else if(kind === 'plane'){
    geom = new THREE.BoxGeometry(50, 1, 50); color = '#5aa0d4'; name = '평면'; bottomLift = 0.5;
  } else if(kind === 'hexprism'){
    geom = new THREE.CylinderGeometry(15, 15, 30, 6); color = '#5a8aa0'; name = '육각기둥'; bottomLift = 15;
  } else if(kind === 'wedge'){
    geom = makeWedgeGeometry(30, 30, 30);
    color = '#a0805a'; name = '쐐기'; bottomLift = 0;
  } else {
    return null;
  }
  return {geom, color, name, bottomLift};
}

function paletteAdd(kind, evt, dropPos){
  const made = makePaletteGeometry(kind);
  if(!made){ toast('알 수 없는 도형: ' + kind); return; }
  const {geom, color, name, bottomLift} = made;
  const mat = makeMaterial(color, 1);
  const mesh = new THREE.Mesh(geom, mat);

  // v2.6: 워크플레인이 활성화된 경우 그 면 위에 배치
  if(state.workPlane){
    const wp = state.workPlane;
    const upToNormal = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), wp.normal
    );
    mesh.quaternion.copy(upToNormal);
    mesh.position.copy(wp.origin).addScaledVector(wp.normal, bottomLift);
    const part = {
      id: state.partIdCounter++, name: name + '_' + state.partIdCounter,
      type: 'primitive_' + kind, color: color, opacity: 1, visible: true,
      mesh: mesh, params: {palette: kind, workPlane: true}
    };
    state.parts.push(part);
    addPartToScene(part);
    renderPartsList();
    updateInfo();
    switchMode('model');
    selectPart(part.id);
    pushHistory();
    toast('✅ ' + name + ' 추가 (워크플레인 위)');
    return;
  }

  // 워크플레인 없으면 기존 동작 (글로벌 바닥)
  mesh.position.y = bottomLift;
  if(dropPos){
    mesh.position.x = dropPos.point.x;
    mesh.position.z = dropPos.point.z;
    mesh.position.y = (dropPos.onPart ? dropPos.point.y : 0) + bottomLift;
  } else if(state.parts.length > 0){
    const last = state.parts[state.parts.length - 1];
    last.mesh.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(last.mesh);
    if(!bb.isEmpty()){
      mesh.position.x = bb.max.x + 25;
    }
  }
  const part = {
    id: state.partIdCounter++, name: name + '_' + state.partIdCounter,
    type: 'primitive_' + kind, color: color, opacity: 1, visible: true,
    mesh: mesh, params: {palette: kind}
  };
  state.parts.push(part);
  addPartToScene(part);
  renderPartsList();
  updateInfo();
  switchMode('model');
  selectPart(part.id);
  pushHistory(); // v4.6
  toast('✅ ' + name + (dropPos ? ' 놓음' : ' 추가') + ' — 핸들로 위치·크기 조정');
}

// ===== v2.7: Z축 회전 솔리드 (캐드식 회전 패턴) =====
// 흐름:
//   1) 대상 부품의 우측면(+X 면)을 Z축(X=0)에 정렬 (정렬용 평행이동량)
//   2) X축 기울임 각도 (옵션)
//   3) X축 이동 mm (회전 반경 추가)
//   4) Z축 회전 각도 (예: 360)
//   5) 분할 수
// 단면: 부품 바운딩박스의 우측면(YZ 평면 사각형) → 사실상 (높이 × 깊이)
//      → 단면을 (반경, 높이) Vector2 점들로 변환 → LatheGeometry로 Z축 회전 솔리드 생성
//   (LatheGeometry는 기본 Y축 회전이므로, 마지막에 mesh를 X축으로 90° 회전해서 Z축 둘레로 회전한 것처럼 보이게)
function updateZRevolvePreviewInfo(part){
  const div = document.getElementById('zrevPreviewInfo');
  if(!div || !part || !part.mesh) return;
  part.mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(part.mesh);
  const sz = bb.getSize(new THREE.Vector3());
  // 정렬 후 단면: Y(높이) × Z(깊이)
  div.innerHTML =
    '단면 크기: <b style="color:#ffc">' + sz.x.toFixed(1) + ' × ' + sz.y.toFixed(1) + ' × ' + sz.z.toFixed(1) + ' mm</b><br>' +
    '우측면 정렬 후 단면 폭(X): <b>' + sz.x.toFixed(1) + ' mm</b><br>' +
    '회전 반경(Y) = X축 이동 + 부품 폭 = 입력값 + ' + sz.x.toFixed(1);
}

function doZAxisRevolve(){
  const partId = state.selectedPartId;
  if(!partId){toast('회전시킬 부품을 선택하세요'); return}
  const part = state.parts.find(p => p.id === partId);
  if(!part){toast('선택된 부품을 찾을 수 없습니다'); return}
  const tiltX = (parseFloat(document.getElementById('zrevTiltX').value) || 0) * Math.PI / 180;
  const offsetX = parseFloat(document.getElementById('zrevOffsetX').value) || 0;
  const angleZdeg = parseFloat(document.getElementById('zrevAngleZ').value) || 360;
  const seg = Math.max(3, parseInt(document.getElementById('zrevSeg').value) || 32);
  const color = document.getElementById('zrevColor').value;
  const deleteOrig = document.getElementById('zrevDeleteOrig').checked;
  const angleZ = angleZdeg * Math.PI / 180;

  // 부품의 바운딩박스 (월드 좌표)
  part.mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(part.mesh);
  const sz = bb.getSize(new THREE.Vector3());
  const sizeX = sz.x;  // 단면 폭 (정렬 후 사용)
  const sizeY = sz.y;  // 단면 높이
  const sizeZ = sz.z;  // 단면 깊이 (Z축 따라)
  if(sizeX < 0.1 || sizeY < 0.1){
    toast('단면이 너무 얇아 회전 솔리드를 만들 수 없습니다');
    return;
  }

  // === 단계 1: 우측면을 Z축에 붙임 ===
  //   바운딩박스의 +X면이 X=0이 되도록 가상 평행이동
  //   → 단면 X 범위: [-sizeX, 0]  (회전축은 X=0)
  //   하지만 LatheGeometry는 Y축 둘레 회전이고 점들이 (radius=x, y=height) 쌍이므로
  //   최종적으로 mesh를 90° 회전해 Z축 둘레가 되도록 함
  //
  // === 단계 3: X축 이동 (+offsetX) ===
  //   우측면이 X=0에서 더 멀어짐 → 단면 X 범위: [-sizeX + offsetX, offsetX]
  //   회전 반경 = |x|이므로 |offsetX| ~ |offsetX - sizeX| 범위
  //   "우측면을 축에 붙인 뒤 X방향으로 이동"하면 단면 전체가 +X쪽으로 이동
  //   → 단면 X 좌표가 [offsetX - sizeX, offsetX]가 되도록
  // 캐드 표준: 우측면(=축에 가까운 면)이 offsetX만큼 떨어짐 → x ∈ [offsetX, offsetX + sizeX]
  //   (사용자가 offsetX=0이면 우측면이 축에 붙음)

  // 단면 점들: 사각형 4점 (반시계 방향)
  // 좌표: (x = 반경, y = 높이)
  //   사각형은 (x1,y1)~(x2,y2). x1 = offsetX, x2 = offsetX + sizeX, y1 = -sizeY/2, y2 = +sizeY/2
  const x1 = offsetX;
  const x2 = offsetX + sizeX;
  const y1 = -sizeY/2;
  const y2 = sizeY/2;
  // 사각형 4점 (lathe profile)
  let prof = [
    new THREE.Vector2(x1, y1),
    new THREE.Vector2(x2, y1),
    new THREE.Vector2(x2, y2),
    new THREE.Vector2(x1, y2),
    new THREE.Vector2(x1, y1)  // 닫힘
  ];

  // === 단계 2: X축 기울임 (옵션) ===
  //   단면을 X축 둘레로 tilt 회전 → 2D profile 평면(XY)에서는 단면이 평행이동/회전한 것처럼 됨
  //   X축 둘레 회전은 Y와 Z를 섞으므로 2D profile에서는 효과가 제한적이지만,
  //   단면 자체가 Y축으로 기울어진 효과를 주려면 Y좌표에 cos, X좌표 보정
  //   여기서는 단면 점을 "Z축 둘레로 회전체 만들기 직전에 단면 평면 안에서 기울이기"로 해석
  //   → 단면 점 (x, y)를 중심 기준 tiltX만큼 회전 (2D 회전)
  if(Math.abs(tiltX) > 1e-6){
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const c = Math.cos(tiltX), s = Math.sin(tiltX);
    prof = prof.map(p => {
      const dx = p.x - cx, dy = p.y - cy;
      // 음수 반경 방지: 회전 결과 x가 음수면 0으로 보정
      const nx = Math.max(0, cx + dx*c - dy*s);
      const ny = cy + dx*s + dy*c;
      return new THREE.Vector2(nx, ny);
    });
  }

  // 단면 점들의 반경이 모두 양수여야 함
  // 음수 반경은 lathe에서 뒤집힌 결과를 만들므로 0으로 clamp
  prof = prof.map(p => new THREE.Vector2(Math.max(0, p.x), p.y));

  // === 단계 4 & 5: LatheGeometry ===
  const geom = new THREE.LatheGeometry(prof, seg, 0, angleZ);
  // LatheGeometry는 Y축 둘레 회전. Z축 둘레 회전으로 보이게 하려면 mesh를 X축 -90° 회전
  // → Y축이 Z축 방향이 됨
  const mat = makeMaterial(color, 1);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;

  const newPart = {
    id: state.partIdCounter++,
    name: 'Z회전솔리드_' + state.partIdCounter,
    type: 'z_revolve',
    color: color, opacity: 1, visible: true,
    mesh: mesh,
    params: {sourcePartId: partId, tiltXdeg: tiltX*180/Math.PI, offsetX, angleZdeg, seg, srcSize: {x: sizeX, y: sizeY, z: sizeZ}}
  };
  state.parts.push(newPart);
  addPartToScene(newPart);

  // 원본 제거 옵션
  if(deleteOrig){
    const idx = state.parts.findIndex(p => p.id === partId);
    if(idx >= 0){
      removePartFromScene(state.parts[idx]);
      state.parts.splice(idx, 1);
    }
    hideTransformHandles();
  }

  renderPartsList();
  updateInfo();
  selectPart(newPart.id);
  fitView();
  pushHistory(); // v4.6
  toast('✅ Z축 회전 솔리드 생성: 반경 ' + offsetX.toFixed(1) + '~' + (offsetX + sizeX).toFixed(1) + 'mm, ' + angleZdeg + '°, ' + seg + '분할');
  setStat('Z회전 완료: ' + (deleteOrig ? '원본 삭제됨' : '원본 유지됨'));
}

// 쐐기(prism) BufferGeometry: 바닥에 직각삼각형 단면 박스
function makeWedgeGeometry(w, h, d){
  // 8개 점 중 위쪽 두 점을 한쪽으로 모음 (직각삼각 단면)
  const hx = w/2, hy = h, hz = d/2;
  // 정점: 바닥 4점 + 상단 2점(한쪽으로 모임)
  const v = [
    -hx, 0, -hz,  // 0
     hx, 0, -hz,  // 1
     hx, 0,  hz,  // 2
    -hx, 0,  hz,  // 3
    -hx, hy, -hz, // 4 (왼쪽 위 뒤)
    -hx, hy,  hz  // 5 (왼쪽 위 앞)
  ];
  // 면 인덱스
  const idx = [
    0,1,2, 0,2,3,       // 바닥
    0,3,5, 0,5,4,       // 왼쪽 (수직)
    1,4,5, 1,5,2,       // 빗면 (1→4→5→2)는 잘못. 다시: 빗면은 1-2-5-4
    // 빗면 재정의
  ];
  // 빗면, 앞/뒤 삼각형 추가
  const idx2 = [
    0,1,2, 0,2,3,        // 바닥
    0,4,5, 0,5,3,        // 왼쪽 직각면
    1,2,5, 1,5,4,        // 빗면
    0,3,5, 0,5,4,        // (중복 제거 필요)
  ];
  // 정리된 인덱스
  const indices = [
    0,1,2, 0,2,3,        // bottom
    0,4,5, 0,5,3,        // left vertical
    1,2,5, 1,5,4,        // slope
    0,1,4,               // back triangle (z = -hz)
    2,3,5                // front triangle (z = +hz)
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// ===== v2.4: 좌측 시점 컬럼 - 줌/투시 =====
function zoomBy(factor){
  if(!orbitState) return;
  orbitState.radius = Math.max(5, Math.min(5000, orbitState.radius * factor));
  updateCamera();
}
function togglePerspective(){
  // Three.js 카메라를 Perspective↔Orthographic 전환
  const container = document.getElementById('viewerCanvas');
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 600;
  const wasPersp = (camera.type === 'PerspectiveCamera');
  let newCam;
  if(wasPersp){
    // → Orthographic
    const r = orbitState.radius;
    const aspect = w/h;
    newCam = new THREE.OrthographicCamera(-r*aspect/2, r*aspect/2, r/2, -r/2, 0.1, 10000);
  } else {
    newCam = new THREE.PerspectiveCamera(45, w/h, 0.1, 10000);
  }
  newCam.position.copy(camera.position);
  newCam.up.copy(camera.up);
  camera = newCam;
  updateCamera();
  const btn = document.getElementById('btnPersp');
  if(btn) btn.textContent = wasPersp ? '📐' : '📦';
  toast(wasPersp ? '직교 투영' : '원근 투영');
}

// ===== v1.4: 통합 도형 모달 (위치/크기 입력) =====
const PRIM_INFO = {
  box:      {name:'박스',    icon:'📦', color:'#7a8aa0', fields:[
    {id:'w', label:'가로(X, mm)', val:30}, {id:'h', label:'세로(Y, mm)', val:30}, {id:'d', label:'폭(Z, mm)', val:30}
  ]},
  cylinder: {name:'원통',    icon:'🥫', color:'#a08070', fields:[
    {id:'r', label:'반지름(mm)', val:15}, {id:'h', label:'높이(mm)', val:30}
  ]},
  sphere:   {name:'구',      icon:'⚪', color:'#80a070', fields:[
    {id:'r', label:'반지름(mm)', val:15}
  ]},
  cone:     {name:'원뿔',    icon:'🔺', color:'#a070b0', fields:[
    {id:'r', label:'밑면 반지름(mm)', val:15}, {id:'h', label:'높이(mm)', val:30}
  ]},
  pyramid:  {name:'피라미드', icon:'⛰️', color:'#b07050', fields:[
    {id:'w', label:'밑변 폭(mm)', val:30}, {id:'h', label:'높이(mm)', val:30}, {id:'sides', label:'밑면 변 수', val:4}
  ]},
  torus:    {name:'도넛',    icon:'🍩', color:'#d0a060', fields:[
    {id:'R', label:'코일 반지름(mm)', val:20}, {id:'r', label:'두께 반지름(mm)', val:5}
  ]},
  wedge:    {name:'쐐기',    icon:'📐', color:'#7090b0', fields:[
    {id:'w', label:'밑변 X(mm)', val:30}, {id:'h', label:'높이 Y(mm)', val:20}, {id:'d', label:'폭 Z(mm)', val:30}
  ]},
  tube:     {name:'파이프',  icon:'⭕', color:'#909090', fields:[
    {id:'rOut', label:'외경 반지름(mm)', val:15}, {id:'rIn', label:'내경 반지름(mm)', val:10}, {id:'h', label:'높이(mm)', val:30}
  ]}
};

let currentPrimKind = null;

function openPrimModal(kind){
  const info = PRIM_INFO[kind];
  if(!info) return;
  currentPrimKind = kind;
  document.getElementById('primTitle').textContent = info.icon + ' ' + info.name + ' 생성';
  // 동적 필드 생성
  const fieldsDiv = document.getElementById('primFields');
  fieldsDiv.innerHTML = info.fields.map(f =>
    `<div class="modal-row"><label>${f.label}</label><input type="number" id="primF_${f.id}" value="${f.val}" step="0.5"></div>`
  ).join('');
  document.getElementById('primColor').value = info.color;
  document.getElementById('primPartName').value = info.name + '_' + state.partIdCounter;
  document.getElementById('primPosX').value = 0;
  document.getElementById('primPosY').value = 0;
  document.getElementById('primPosZ').value = 0;
  document.getElementById('primitiveModal').classList.add('show');
}

function doPrimitive(){
  const kind = currentPrimKind;
  const info = PRIM_INFO[kind];
  if(!info) return;
  // 필드 값 읽기
  const f = {};
  for(const ff of info.fields){
    f[ff.id] = parseFloat(document.getElementById('primF_' + ff.id).value);
    if(isNaN(f[ff.id])){toast(ff.label + ' 값이 잘못됨'); return}
  }
  const posX = parseFloat(document.getElementById('primPosX').value) || 0;
  const posY = parseFloat(document.getElementById('primPosY').value) || 0;
  const posZ = parseFloat(document.getElementById('primPosZ').value) || 0;
  const color = document.getElementById('primColor').value;
  let name = document.getElementById('primPartName').value.trim() || (info.name + '_' + state.partIdCounter);

  const geom = createGeometryForKind(kind, f);
  if(!geom){toast('도형 생성 실패'); return}
  const mat = makeMaterial(color, 1);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(posX, posY, posZ);

  const part = {
    id: state.partIdCounter++, name, type: 'primitive_' + kind,
    color, opacity: 1, visible: true, mesh,
    params: {...f, posX, posY, posZ}
  };
  state.parts.push(part);
  addPartToScene(part);
  renderPartsList(); updateInfo();
  closeModal('primitiveModal'); switchMode('model'); fitView();
  pushHistory(); // v4.6
  toast('✅ ' + info.name + ' 생성: ' + name);
}

function createGeometryForKind(kind, f){
  if(kind === 'box') return new THREE.BoxGeometry(f.w, f.h, f.d);
  if(kind === 'cylinder') return new THREE.CylinderGeometry(f.r, f.r, f.h, 32);
  if(kind === 'sphere') return new THREE.SphereGeometry(f.r, 32, 24);
  if(kind === 'cone') return new THREE.ConeGeometry(f.r, f.h, 32);
  if(kind === 'pyramid'){
    const sides = Math.max(3, Math.round(f.sides || 4));
    // ConeGeometry로 N각뿔
    const g = new THREE.ConeGeometry(f.w/2, f.h, sides);
    return g;
  }
  if(kind === 'torus') return new THREE.TorusGeometry(f.R, f.r, 16, 48);
  if(kind === 'wedge'){
    // 직각삼각기둥: ExtrudeGeometry 사용
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(f.w, 0);
    shape.lineTo(0, f.h);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {depth: f.d, bevelEnabled: false});
    // 중심 정렬: ExtrudeGeometry는 Z+로 돌출 → 중앙으로 이동
    g.translate(-f.w/2, -f.h/2, -f.d/2);
    return g;
  }
  if(kind === 'tube'){
    // 파이프: 외경 원 - 내경 원 ExtrudeGeometry
    if(f.rIn >= f.rOut){toast('내경은 외경보다 작아야 합니다'); return null}
    const shape = new THREE.Shape();
    shape.absarc(0, 0, f.rOut, 0, Math.PI*2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, f.rIn, 0, Math.PI*2, true);
    shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, {depth: f.h, bevelEnabled: false, curveSegments: 48});
    g.rotateX(-Math.PI/2);
    g.translate(0, f.h/2, 0);
    return g;
  }
  return null;
}

// 텍스트 3D
function openTextModal(){
  document.getElementById('text3dName').value = '텍스트_' + state.partIdCounter;
  document.getElementById('textModal').classList.add('show');
}

function doText3D(){
  const content = document.getElementById('text3dContent').value || '태진';
  const size = parseFloat(document.getElementById('text3dSize').value);
  const depth = parseFloat(document.getElementById('text3dDepth').value);
  const posX = parseFloat(document.getElementById('text3dPosX').value) || 0;
  const posY = parseFloat(document.getElementById('text3dPosY').value) || 0;
  const posZ = parseFloat(document.getElementById('text3dPosZ').value) || 0;
  const color = document.getElementById('text3dColor').value;
  let name = document.getElementById('text3dName').value.trim() || ('텍스트_' + state.partIdCounter);
  if(isNaN(size) || size <= 0 || isNaN(depth) || depth <= 0){toast('크기/두께 입력값을 확인하세요'); return}

  // Three.js r128에는 TextGeometry가 기본 포함되지 않음 → Canvas로 그린 후 ExtrudeGeometry로 변환
  // 간단한 방법: Canvas에 텍스트 그리고 그 SVG path를 Shape로 변환은 복잡
  // 대안: 박스를 여러 개 묶어 평면 텍스처 + 얇은 박스(plate)에 텍스처
  // 더 간단: 박스 형태로 만들고 표면에 캔버스 텍스처
  const cw = 256, ch = 128;
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 80px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(content, cw/2, ch/2);

  const texture = new THREE.CanvasTexture(canvas);
  const ratio = content.length > 2 ? content.length * 0.5 : 1.5;
  const w = size * ratio, h = size;
  const geom = new THREE.BoxGeometry(w, h, depth);
  // 6면 중 앞면(+Z)에만 텍스트 텍스처, 나머지는 색상
  const materials = [
    makeMaterial(color, 1), makeMaterial(color, 1),
    makeMaterial(color, 1), makeMaterial(color, 1),
    new THREE.MeshStandardMaterial({map: texture, color: 0xffffff, roughness: 0.5, metalness: 0.1}),
    makeMaterial(color, 1)
  ];
  const mesh = new THREE.Mesh(geom, materials);
  mesh.position.set(posX, posY, posZ);

  const part = {
    id: state.partIdCounter++, name, type: 'text3d',
    color, opacity: 1, visible: true, mesh,
    params: {content, size, depth, posX, posY, posZ}
  };
  state.parts.push(part);
  addPartToScene(part);
  renderPartsList(); updateInfo();
  closeModal('textModal'); switchMode('model'); fitView();
  pushHistory(); // v4.6
  toast('✅ 텍스트 3D 생성: ' + name);
}

// ===== v1.4: 편집 기능 =====
function getSelectedParts(){
  // partsList에서 highlighted 표시된 부품들
  return state.parts.filter(p => p._selected);
}

function duplicatePart(){
  const sel = getSelectedParts();
  const target = sel.length > 0 ? sel : (state.parts.length > 0 ? [state.parts[state.parts.length-1]] : []);
  if(target.length === 0){toast('복제할 부품이 없습니다'); return}
  target.forEach(p => {
    // mesh.clone() + 위치 오프셋
    const newMesh = p.mesh.clone(true);
    // material도 새로 만들어서 색상 변경 시 원본 영향 없게
    newMesh.traverse(o => {
      if(o.isMesh && o.material){
        if(Array.isArray(o.material)) o.material = o.material.map(m => m.clone());
        else o.material = o.material.clone();
      }
    });
    newMesh.position.x += 20;
    newMesh.position.z += 20;
    const newPart = {
      id: state.partIdCounter++,
      name: p.name + '_복사',
      type: p.type,
      color: p.color, opacity: p.opacity, visible: true,
      mesh: newMesh,
      params: JSON.parse(JSON.stringify(p.params || {})),
      sourceShapes: p.sourceShapes ? JSON.parse(JSON.stringify(p.sourceShapes)) : undefined
    };
    state.parts.push(newPart);
    addPartToScene(newPart);
  });
  renderPartsList(); updateInfo();
  toast('✅ ' + target.length + '개 부품 복제됨');
}

function mirrorPart(axis){
  const sel = getSelectedParts();
  const target = sel.length > 0 ? sel : (state.parts.length > 0 ? [state.parts[state.parts.length-1]] : []);
  if(target.length === 0){toast('미러할 부품이 없습니다'); return}
  target.forEach(p => {
    if(axis === 'x') p.mesh.scale.x *= -1;
    else if(axis === 'y') p.mesh.scale.y *= -1;
    else if(axis === 'z') p.mesh.scale.z *= -1;
    // normal이 뒤집혀서 어두워지는 문제를 피하려면 geometry를 재계산해야 하지만 시각적으로는 OK
  });
  pushHistory(); // v4.6
  toast('🪞 ' + target.length + '개 부품 ' + axis.toUpperCase() + '축 미러');
}

function deletePart(){
  const sel = getSelectedParts();
  const target = sel.length > 0 ? sel : (state.parts.length > 0 ? [state.parts[state.parts.length-1]] : []);
  if(target.length === 0){toast('삭제할 부품이 없습니다'); return}
  target.forEach(p => {
    if(transformState.activePart === p) hideTransformHandles();
    scene.remove(p.mesh);
    const idx = state.parts.indexOf(p);
    if(idx >= 0) state.parts.splice(idx, 1);
  });
  renderPartsList(); updateInfo();
  pushHistory(); // v4.6
  toast('🗑️ ' + target.length + '개 부품 삭제됨');
}

// ===== 정렬 =====
function openAlignModal(){
  const sel = getSelectedParts();
  document.getElementById('alignSelCount').textContent = sel.length;
  if(sel.length < 2){
    toast('정렬할 부품을 2개 이상 선택하세요 (부품 패널에서 Ctrl+클릭)');
    return;
  }
  document.getElementById('alignModal').classList.add('show');
}

function doAlign(){
  const sel = getSelectedParts();
  if(sel.length < 2){toast('2개 이상 선택해주세요'); return}
  const axis = document.getElementById('alignAxis').value;
  const mode = document.getElementById('alignMode').value;
  // 각 부품의 바운딩박스 + 위치 정보
  const info = sel.map(p => {
    p.mesh.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(p.mesh);
    return {
      part: p,
      min: bb.min[axis],
      max: bb.max[axis],
      center: (bb.min[axis] + bb.max[axis]) / 2
    };
  });
  let target;
  if(mode === 'min'){
    target = Math.min(...info.map(i => i.min));
    info.forEach(i => { i.part.mesh.position[axis] += (target - i.min); });
  } else if(mode === 'max'){
    target = Math.max(...info.map(i => i.max));
    info.forEach(i => { i.part.mesh.position[axis] += (target - i.max); });
  } else if(mode === 'center'){
    const min = Math.min(...info.map(i => i.min));
    const max = Math.max(...info.map(i => i.max));
    target = (min + max) / 2;
    info.forEach(i => { i.part.mesh.position[axis] += (target - i.center); });
  } else if(mode === 'distribute'){
    // 균등 분배: 정렬 후 중심 위치를 균등 간격으로
    info.sort((a, b) => a.center - b.center);
    const first = info[0].center, last = info[info.length-1].center;
    const step = (last - first) / (info.length - 1);
    info.forEach((i, idx) => {
      const newCenter = first + step * idx;
      i.part.mesh.position[axis] += (newCenter - i.center);
    });
  }
  closeModal('alignModal');
  toast('📐 ' + sel.length + '개 부품 ' + axis.toUpperCase() + '축 정렬 완료');
}

// ===== 그룹화 =====
function groupSelectedParts(){
  const sel = getSelectedParts();
  if(sel.length < 2){toast('2개 이상의 부품을 선택해주세요 (3D 뷰에서 Shift+클릭 또는 Ctrl+클릭)'); return}
  const holes = sel.filter(p => p._isHole);
  const solids = sel.filter(p => !p._isHole);

  // v5.9: 그룹화 직전, 자식들을 직렬화해서 보관 (undo/그룹해제 시 완전 복원용)
  const childSnaps = sel.map(p => serializePart(p));

  // ── 솔리드 + 구멍이 함께 있으면 실제 CSG 빼기 수행 ──
  if(solids.length > 0 && holes.length > 0){
    groupWithBooleanSubtract(sel, solids, holes, childSnaps);
    return;
  }

  // ── 구멍 없이 단순 그룹화 ──
  const group = new THREE.Group();
  sel.forEach(p => {
    scene.remove(p.mesh);
    p.mesh.updateMatrixWorld(true);
    group.add(p.mesh);
    const idx = state.parts.indexOf(p);
    if(idx >= 0) state.parts.splice(idx, 1);
  });
  const newPart = {
    id: state.partIdCounter++,
    name: '그룹_' + state.partIdCounter,
    type: 'group',
    color: '#888', opacity: 1, visible: true,
    mesh: group,
    params: { childCount: sel.length, holeCount: 0, solidCount: solids.length, csgApplied: false, childSnaps: childSnaps }
  };
  state.parts.push(newPart);
  scene.add(group);
  renderPartsList(); updateInfo();
  hideTransformHandles();
  pushHistory();
  toast('🔗 ' + sel.length + '개 부품 그룹화');
}

// v5.8: 솔리드 − 구멍 실제 불리언 빼기 후 그룹 생성
// v5.9: childSnaps(직렬화 스냅샷)을 받아 params에 저장 → undo/해제 완전 복원
function groupWithBooleanSubtract(sel, solids, holes, childSnaps){
  setStat('⏳ 불리언 빼기 계산 중...');
  let resultMeshes = [];
  let failed = false;
  try {
    solids.forEach(solidPart => {
      const solidMesh = collectSingleMesh(solidPart.mesh);
      const holeMeshes = [];
      holes.forEach(hp => {
        const hm = collectSingleMesh(hp.mesh);
        if(hm) holeMeshes.push(hm);
      });
      if(!solidMesh){ failed = true; return; }
      const resultGeom = window.CSGEngine.subtractMeshes(solidMesh, holeMeshes);
      const posCount = resultGeom.attributes.position ? resultGeom.attributes.position.count : 0;
      if(posCount < 3){
        console.warn('[CSG] 빼기 결과가 비어있음 (구멍이 솔리드를 완전히 제거했거나 겹치지 않음)');
        return;
      }
      const mat = makeMaterial(solidPart.color || '#7a8aa0', solidPart.opacity || 1);
      const rmesh = new THREE.Mesh(resultGeom, mat);
      rmesh.position.set(0,0,0);
      rmesh.rotation.set(0,0,0);
      rmesh.scale.set(1,1,1);
      rmesh.userData._srcColor = solidPart.color;
      resultMeshes.push(rmesh);
    });
  } catch(err){
    console.error('[CSG] 빼기 실패:', err);
    failed = true;
  }

  if(failed || resultMeshes.length === 0){
    toast('⚠️ 불리언 빼기 실패 — 시각적 빼기로 대체합니다');
    groupVisualSubtractFallback(sel, solids, holes, childSnaps);
    return;
  }

  // 원본 부품 씬에서 제거
  sel.forEach(p => {
    scene.remove(p.mesh);
    const idx = state.parts.indexOf(p);
    if(idx >= 0) state.parts.splice(idx, 1);
  });

  const group = new THREE.Group();
  resultMeshes.forEach(m => group.add(m));

  const newPart = {
    id: state.partIdCounter++,
    name: '그룹_' + state.partIdCounter,
    type: 'group',
    color: '#888', opacity: 1, visible: true,
    mesh: group,
    params: { childCount: sel.length, holeCount: holes.length, solidCount: solids.length, csgApplied: true, childSnaps: childSnaps }
  };
  state.parts.push(newPart);
  scene.add(group);
  renderPartsList(); updateInfo();
  hideTransformHandles();
  pushHistory();
  toast('✅ 그룹화 + 빼기 완료: 솔리드 ' + solids.length + '개 − 구멍 ' + holes.length + '개');
  setStat('✅ 불리언 빼기 적용됨 (그룹해제·되돌리기 시 원본 복원)');
}

// 부품 mesh가 Group이면 첫 번째 Mesh를, Mesh면 그대로 반환
function collectSingleMesh(obj){
  if(!obj) return null;
  if(obj.isMesh) return obj;
  let found = null;
  obj.traverse(o => { if(!found && o.isMesh) found = o; });
  return found;
}

// CSG 불가 시 시각적 빼기(구멍 숨김) 폴백
function groupVisualSubtractFallback(sel, solids, holes, childSnaps){
  const group = new THREE.Group();
  sel.forEach(p => {
    scene.remove(p.mesh);
    p.mesh.updateMatrixWorld(true);
    if(p._isHole) p.mesh.visible = false;
    group.add(p.mesh);
    const idx = state.parts.indexOf(p);
    if(idx >= 0) state.parts.splice(idx, 1);
  });
  const newPart = {
    id: state.partIdCounter++, name: '그룹_' + state.partIdCounter, type: 'group',
    color: '#888', opacity: 1, visible: true, mesh: group,
    params: { childCount: sel.length, holeCount: holes.length, solidCount: solids.length, csgApplied: false, visualHole: true, childSnaps: childSnaps }
  };
  state.parts.push(newPart);
  scene.add(group);
  renderPartsList(); updateInfo(); hideTransformHandles();
  pushHistory();
  toast('🔗 그룹화 완료 (시각적 빼기): 솔리드 ' + solids.length + '개 + 구멍 ' + holes.length + '개');
}

// v1.5: 구멍(빼기) 토글
function toggleHole(){
  const sel = getSelectedParts();
  const target = sel.length > 0 ? sel : (state.parts.length > 0 ? [state.parts[state.parts.length-1]] : []);
  if(target.length === 0){toast('부품을 선택하세요'); return}
  target.forEach(p => {
    p._isHole = !p._isHole;
    // 시각적 표시: 반투명 빨간색 줄무늬
    p.mesh.traverse(o => {
      if(o.isMesh && o.material){
        if(p._isHole){
          // 원래 색 백업
          if(!o.userData._origMat){
            o.userData._origMat = Array.isArray(o.material)
              ? o.material.map(m => m.clone())
              : o.material.clone();
          }
          // 빨간 반투명으로
          const setHoleMat = (m) => {
            m.color = new THREE.Color(0xff3333);
            m.transparent = true;
            m.opacity = 0.4;
            if(m.emissive) m.emissive.setHex(0x550000);
          };
          if(Array.isArray(o.material)) o.material.forEach(setHoleMat);
          else setHoleMat(o.material);
        } else {
          // 원래 색 복원
          if(o.userData._origMat){
            o.material = o.userData._origMat;
            delete o.userData._origMat;
          }
        }
      }
    });
  });
  renderPartsList();
  toast(target[0]._isHole ? '🕳️ ' + target.length + '개 부품을 구멍으로 지정 (그룹화 시 빼기)' : '◯ ' + target.length + '개 부품 구멍 해제');
}

// v5.2: 솔리드 전환 - 선택 부품을 무조건 솔리드(_isHole=false)로 + 원래 색 복원
function setSolid(){
  const sel = getSelectedParts();
  const target = sel.length > 0 ? sel : (state.parts.length > 0 ? [state.parts[state.parts.length-1]] : []);
  if(target.length === 0){toast('부품을 선택하세요'); return}
  let changed = 0;
  target.forEach(p => {
    if(!p._isHole) return; // 이미 솔리드면 건너뜀
    p._isHole = false;
    changed++;
    p.mesh.traverse(o => {
      if(o.isMesh && o.material && o.userData._origMat){
        o.material = o.userData._origMat;
        delete o.userData._origMat;
      }
    });
  });
  renderPartsList();
  if(changed > 0) toast('⬛ ' + changed + '개 부품을 솔리드로 전환');
  else toast('이미 모두 솔리드 상태입니다');
}

// v5.2: 3D 이동 스냅 단위 변경
function onMoveSnapChange(){
  const v = parseFloat(document.getElementById('moveSnapSel').value) || 0;
  state.moveSnap = v;
  if(v > 0) toast('📏 이동 단위: ' + v + 'mm 씩 이동');
  else toast('📏 이동 단위: 없음 (자유 이동)');
}

// v5.3: 3D 회전 스냅 단위 변경
function onRotSnapChange(){
  const v = parseFloat(document.getElementById('rotSnapSel').value) || 0;
  state.rotSnap = v;
  if(v > 0) toast('↻ 회전 단위: ' + v + '° 씩 회전');
  else toast('↻ 회전 단위: 없음 (자유 회전)');
}
function openPosSizeModal(){
  const sel = getSelectedParts();
  const target = sel.length === 1 ? sel[0] : null;
  if(!target){toast('단일 부품을 선택하세요'); return}
  document.getElementById('posSizePartName').textContent = target.name;
  document.getElementById('psPosX').value = target.mesh.position.x.toFixed(1);
  document.getElementById('psPosY').value = target.mesh.position.y.toFixed(1);
  document.getElementById('psPosZ').value = target.mesh.position.z.toFixed(1);
  // 크기: 현재 바운딩박스 실제 치수(mm)
  target.mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(target.mesh);
  const sz = bb.getSize(new THREE.Vector3());
  document.getElementById('psSizeX').value = sz.x.toFixed(1);
  document.getElementById('psSizeY').value = sz.y.toFixed(1);
  document.getElementById('psSizeZ').value = sz.z.toFixed(1);
  // v7.1.4: 타입별 치수 요약 (구→⌀, 원통→⌀×높이)
  const summary = document.getElementById('posSizeSummary');
  if(summary){
    const t = target.type || '';
    const dim = target.params && target.params.dim;
    const sc = target.mesh.scale;
    let txt = '';
    if(dim && dim.kind === 'sphere'){
      // 정의 지름 × 평균 scale (균등 스케일 가정), 보정은 BB로 교차검증
      const d = dim.baseDia * ((sc.x+sc.y+sc.z)/3);
      txt = '⌀ ' + d.toFixed(1) + ' mm (구)';
    } else if(dim && dim.kind === 'cylinder'){
      const d = dim.baseDia * ((sc.x+sc.z)/2);
      const h = dim.baseH * sc.y;
      txt = '⌀ ' + d.toFixed(1) + ' × 높이 ' + h.toFixed(1) + ' mm';
    } else {
      const mxA = Math.max(sz.x, sz.y, sz.z), mnA = Math.min(sz.x, sz.y, sz.z);
      if(t === 'primitive_sphere' || (mxA>1e-6 && (mxA-mnA)/mxA < 0.08 && isSphereSurface(target.mesh, bb.getCenter(new THREE.Vector3())))){
        txt = '⌀ ' + sz.x.toFixed(1) + ' mm (구)';
      } else if(t === 'primitive_cylinder'){
        txt = '⌀ ' + Math.max(sz.x, sz.z).toFixed(1) + ' × 높이 ' + sz.y.toFixed(1) + ' mm';
      } else if(t === 'svgrevolve' || t === 'revolve'){
        txt = '⌀ ' + Math.max(sz.x, sz.z).toFixed(1) + ' × 높이 ' + sz.y.toFixed(1) + ' mm (회전체)';
      } else {
        txt = sz.x.toFixed(1) + ' × ' + sz.y.toFixed(1) + ' × ' + sz.z.toFixed(1) + ' mm (W×H×D)';
      }
    }
    summary.textContent = '📐 ' + txt;
  }
  document.getElementById('psRotX').value = (target.mesh.rotation.x * 180/Math.PI).toFixed(1);
  document.getElementById('psRotY').value = (target.mesh.rotation.y * 180/Math.PI).toFixed(1);
  document.getElementById('psRotZ').value = (target.mesh.rotation.z * 180/Math.PI).toFixed(1);
  document.getElementById('posSizeModal').classList.add('show');
}

function applyPosSize(){
  const sel = getSelectedParts();
  const target = sel.length === 1 ? sel[0] : null;
  if(!target){toast('단일 부품을 선택하세요'); return}

  // 위치
  target.mesh.position.set(
    parseFloat(document.getElementById('psPosX').value) || 0,
    parseFloat(document.getElementById('psPosY').value) || 0,
    parseFloat(document.getElementById('psPosZ').value) || 0
  );
  // 회전 (크기 역산 전에 회전을 0으로 맞춰 BB 측정 — 회전된 BB는 부정확하므로)
  //   먼저 회전을 적용하기 전, scale=1 기준 기하 치수를 구하기 위해 회전을 잠시 0으로
  const wantRot = new THREE.Euler(
    (parseFloat(document.getElementById('psRotX').value) || 0) * Math.PI/180,
    (parseFloat(document.getElementById('psRotY').value) || 0) * Math.PI/180,
    (parseFloat(document.getElementById('psRotZ').value) || 0) * Math.PI/180
  );
  target.mesh.rotation.set(0,0,0);
  target.mesh.updateMatrixWorld(true);

  // 크기(mm) → scale 역산: 목표치수 ÷ (현재BB ÷ 현재scale)
  const wantX = Math.max(0.5, parseFloat(document.getElementById('psSizeX').value) || 30);
  const wantY = Math.max(0.5, parseFloat(document.getElementById('psSizeY').value) || 30);
  const wantZ = Math.max(0.5, parseFloat(document.getElementById('psSizeZ').value) || 30);
  const bb = new THREE.Box3().setFromObject(target.mesh);
  const cur = bb.getSize(new THREE.Vector3());
  const sc = target.mesh.scale.clone();
  // 기본 기하 치수 = 현재BB ÷ 현재scale
  const baseX = cur.x / (sc.x || 1);
  const baseY = cur.y / (sc.y || 1);
  const baseZ = cur.z / (sc.z || 1);
  target.mesh.scale.set(
    baseX > 0.0001 ? wantX / baseX : sc.x,
    baseY > 0.0001 ? wantY / baseY : sc.y,
    baseZ > 0.0001 ? wantZ / baseZ : sc.z
  );
  // 회전 적용
  target.mesh.rotation.copy(wantRot);

  closeModal('posSizeModal');
  if(transformState.activePart === target) showTransformHandles(target);
  refreshPropPanelTransform(target);
  pushHistory();
  toast('✅ 위치 · 크기(mm) · 회전 적용됨');
}

// v6.2: 도형 클릭 시 입력창 자동 표시 토글
function toggleAutoPopup(){
  state.autoPopup = !state.autoPopup;
  const btn = document.getElementById('btnAutoPopup');
  if(btn){
    btn.textContent = state.autoPopup ? '🪟 더블클릭팝업 ON' : '🪟 더블클릭팝업 OFF';
    btn.className = state.autoPopup ? 'success' : '';
  }
  toast(state.autoPopup ? '🪟 도형 더블클릭 시 입력창 표시' : '🪟 더블클릭 표시 끔 (⌨️ 입력 버튼으로 수동 열기)');
}

function resetTransform(){
  const sel = getSelectedParts();
  const target = sel.length > 0 ? sel : (state.parts.length > 0 ? [state.parts[state.parts.length-1]] : []);
  if(target.length === 0){toast('부품을 선택하세요'); return}
  target.forEach(p => {
    p.mesh.position.set(0, 0, 0);
    p.mesh.rotation.set(0, 0, 0);
    p.mesh.scale.set(1, 1, 1);
  });
  if(transformState.activePart) showTransformHandles(transformState.activePart);
  toast('🔄 ' + target.length + '개 부품 변형 초기화');
}

// ===== v1.6: 팅커캐드 단축키 함수들 =====

// D = 바닥(Y=0)에 떨어뜨리기
function dropToGround(){
  const sel = getSelectedParts();
  const target = sel.length > 0 ? sel : (state.parts.length > 0 ? [state.parts[state.parts.length-1]] : []);
  if(target.length === 0){toast('부품을 선택하세요'); return}

  // v2.9: 워크플레인이 활성화되어 있으면 그 평면 위로 안착, 아니면 글로벌 Y=0
  const wp = state.workPlane;
  if(wp){
    // 평면 정의: 점 wp.origin, 법선 wp.normal
    // 부품의 8개 바운딩박스 모서리 중 평면 아래쪽(노멀 반대편)으로 가장 멀리 있는 점을 찾아
    // 그 점이 평면에 닿도록 부품을 노멀 방향으로 평행이동
    target.forEach(p => {
      p.mesh.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(p.mesh);
      // 8개 모서리
      const corners = [
        new THREE.Vector3(bb.min.x, bb.min.y, bb.min.z),
        new THREE.Vector3(bb.max.x, bb.min.y, bb.min.z),
        new THREE.Vector3(bb.min.x, bb.max.y, bb.min.z),
        new THREE.Vector3(bb.max.x, bb.max.y, bb.min.z),
        new THREE.Vector3(bb.min.x, bb.min.y, bb.max.z),
        new THREE.Vector3(bb.max.x, bb.min.y, bb.max.z),
        new THREE.Vector3(bb.min.x, bb.max.y, bb.max.z),
        new THREE.Vector3(bb.max.x, bb.max.y, bb.max.z),
      ];
      // 각 모서리의 평면 부호거리 = (corner - origin) · normal
      // 가장 작은 값(가장 평면 아래쪽 = 노멀 반대편으로 가장 멀리)을 0으로 만들도록 노멀 방향으로 이동
      let minDist = Infinity;
      corners.forEach(c => {
        const d = c.clone().sub(wp.origin).dot(wp.normal);
        if(d < minDist) minDist = d;
      });
      // 부품을 노멀 방향으로 -minDist만큼 이동 → 최저 모서리가 평면에 닿음
      p.mesh.position.addScaledVector(wp.normal, -minDist);
    });
    if(transformState.activePart) showTransformHandles(transformState.activePart);
    updateDimLabels();
    // v3.3: 단일 선택일 때 패널 갱신
    if(target.length === 1) refreshPropPanelTransform(target[0]);
    toast('⬇️ ' + target.length + '개 부품 워크플레인에 안착');
    return;
  }

  // 기본: 글로벌 바닥(Y=0)
  target.forEach(p => {
    p.mesh.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(p.mesh);
    p.mesh.position.y -= bb.min.y;
  });
  if(transformState.activePart) showTransformHandles(transformState.activePart);
  updateDimLabels();
  // v3.3: 단일 선택일 때 패널 갱신
  if(target.length === 1) refreshPropPanelTransform(target[0]);
  toast('⬇️ ' + target.length + '개 부품 바닥 안착 (Y=0)');
}

// R = 90도 회전 (지정 축 기준)
function rotate90(axis){
  const sel = getSelectedParts();
  const target = sel.length > 0 ? sel : (state.parts.length > 0 ? [state.parts[state.parts.length-1]] : []);
  if(target.length === 0){toast('부품을 선택하세요'); return}
  target.forEach(p => {
    p.mesh.rotation[axis] += Math.PI/2;
    syncRotPropPanel(p);
  });
  if(transformState.activePart) showTransformHandles(transformState.activePart);
  updateDimLabels();
  // v2.0: 누적 각도 표시
  if(target.length === 1){
    const deg = target[0].mesh.rotation[axis] * 180 / Math.PI;
    toast('↻ ' + axis.toUpperCase() + '축 +90° → 누적 ' + deg.toFixed(1) + '°');
    setStat(axis.toUpperCase() + '축 회전 누적: ' + deg.toFixed(1) + '°');
  } else {
    toast('↻ ' + target.length + '개 부품 ' + axis.toUpperCase() + '축 90° 회전');
  }
}

// v3.2: 각도 조절 모달 (XYZ 축 임의 각도 회전)
function openRotateModal(){
  const sel = getSelectedParts();
  const target = sel.length > 0 ? sel : (state.parts.length > 0 ? [state.parts[state.parts.length-1]] : []);
  if(target.length === 0){toast('회전할 부품을 선택하세요'); return}
  document.getElementById('rotateSelCount').textContent = target.length;
  // 현재 Y축 회전값을 기본값으로 (단일 선택일 때만 의미있게 표시)
  if(target.length === 1){
    const curAxis = document.getElementById('rotateAxis').value;
    const curDeg = target[0].mesh.rotation[curAxis] * 180 / Math.PI;
    // 절대 모드일 때는 현재값을, 누적일 때는 90 유지 (사용자가 빠른선택 가능)
    const mode = document.getElementById('rotateMode').value;
    if(mode === 'set'){
      document.getElementById('rotateAngle').value = curDeg.toFixed(1);
    }
  }
  document.getElementById('rotateModal').classList.add('show');
}

function doRotateCustom(){
  const axis = document.getElementById('rotateAxis').value;
  const angDeg = parseFloat(document.getElementById('rotateAngle').value);
  const mode = document.getElementById('rotateMode').value;
  if(isNaN(angDeg)){toast('각도를 숫자로 입력하세요'); return}
  const rad = angDeg * Math.PI / 180;
  const sel = getSelectedParts();
  const target = sel.length > 0 ? sel : (state.parts.length > 0 ? [state.parts[state.parts.length-1]] : []);
  if(target.length === 0){toast('부품을 선택하세요'); return}
  target.forEach(p => {
    if(mode === 'set'){
      p.mesh.rotation[axis] = rad;
    } else {
      p.mesh.rotation[axis] += rad;
    }
    syncRotPropPanel(p);
  });
  if(transformState.activePart) showTransformHandles(transformState.activePart);
  updateDimLabels();
  closeModal('rotateModal');
  // 결과 토스트
  if(target.length === 1){
    const finalDeg = target[0].mesh.rotation[axis] * 180 / Math.PI;
    const modeLabel = mode === 'set' ? '절대' : '누적';
    toast('↻ ' + axis.toUpperCase() + '축 ' + modeLabel + ' ' + angDeg + '° → 현재 ' + finalDeg.toFixed(1) + '°');
    setStat('회전 완료: ' + axis.toUpperCase() + '축 ' + finalDeg.toFixed(1) + '°');
  } else {
    toast('↻ ' + target.length + '개 부품 ' + axis.toUpperCase() + '축 ' + angDeg + '° (' + (mode === 'set' ? '절대' : '누적') + ')');
  }
}

// 방향키 미세 이동
function nudgeSelected(dx, dy, dz){
  const sel = getSelectedParts();
  const target = sel.length > 0 ? sel : (state.parts.length > 0 ? [state.parts[state.parts.length-1]] : []);
  if(target.length === 0) return;
  target.forEach(p => {
    p.mesh.position.x += dx;
    p.mesh.position.y += dy;
    p.mesh.position.z += dz;
  });
  if(transformState.activePart) showTransformHandles(transformState.activePart);
  updateDimLabels();
  // v3.3: 단일 선택일 때 패널 갱신
  if(target.length === 1) refreshPropPanelTransform(target[0]);
  // v6.7: 연타를 묶어 한 번만 history에 기록
  if(nudgeSelected._t) clearTimeout(nudgeSelected._t);
  nudgeSelected._t = setTimeout(()=>{ pushHistory(); nudgeSelected._t = null; }, 350);
}

// v6.7: 방향키 직선 이동 상태바 표시
function nudgeStat(axisLabel, step){
  const sel = getSelectedParts();
  const tip = step > 0 ? '+' : '';
  if(sel.length === 1){
    const p = sel[0].mesh.position;
    setStat('➡️ ' + axisLabel + '축 ' + tip + step + 'mm 이동 → X=' + p.x.toFixed(1) + ' Y=' + p.y.toFixed(1) + ' Z=' + p.z.toFixed(1));
  } else if(sel.length > 1){
    setStat('➡️ ' + sel.length + '개 ' + axisLabel + '축 ' + tip + step + 'mm 직선 이동');
  }
}

// ============================================================
// v6.7: 버텍스 스냅 — 이동 중인 부품의 BB 코너가 다른 부품의 BB 코너와
//   가까워지면 그 위치에 잠시 달라붙도록 보정 offset 계산
// ============================================================
const VERTEX_SNAP_PX = 12; // 화면상 이 픽셀 이내면 스냅

// 부품 mesh의 월드 BB 8코너 반환
function meshCornersWorld(mesh){
  mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(mesh);
  if(bb.isEmpty()) return [];
  const mn = bb.min, mx = bb.max;
  return [
    new THREE.Vector3(mn.x,mn.y,mn.z), new THREE.Vector3(mx.x,mn.y,mn.z),
    new THREE.Vector3(mn.x,mx.y,mn.z), new THREE.Vector3(mx.x,mx.y,mn.z),
    new THREE.Vector3(mn.x,mn.y,mx.z), new THREE.Vector3(mx.x,mn.y,mx.z),
    new THREE.Vector3(mn.x,mx.y,mx.z), new THREE.Vector3(mx.x,mx.y,mx.z),
    bb.getCenter(new THREE.Vector3())
  ];
}

// v7.1.4: 3D 월드좌표 → 화면 픽셀 (스케치용 worldToScreen과 별개)
function worldToScreen3D(v){
  if(!renderer || !camera) return {x:0, y:0, z:2};
  const rect = renderer.domElement.getBoundingClientRect();
  const p = v.clone().project(camera);
  return {x: rect.left + (p.x+1)*0.5*rect.width, y: rect.top + (-p.y+1)*0.5*rect.height, z: p.z};
}

// ===== v7.1: 치수 측정 도구 =====
const measureState = { lines: [], group: null, mode: 'dist' }; // mode: 'dist'(점-점) | 'dia'(지름)

function toggleMeasureMode(){
  state.measureMode = !state.measureMode;
  state.measureFirst = null;
  const btn = document.getElementById('btnMeasure');
  if(btn){
    btn.textContent = state.measureMode ? '📏 측정 ON' : '📏 치수 측정';
    btn.className = state.measureMode ? 'success' : '';
  }
  const dBtn = document.getElementById('btnMeasureDia');
  if(dBtn) dBtn.style.display = state.measureMode ? '' : 'none';
  if(state.measureMode){
    hideTransformHandles();
    state.parts.forEach(p=>p._selected=false);
    renderPartsList();
    const tip = measureState.mode==='dia' ? '⌀ 지름 측정 — 원형 면을 클릭하세요' : '두 점을 클릭(정점에 스냅). ESC로 종료';
    toast('📏 측정 모드 — ' + tip);
    setStat('📏 측정 [' + (measureState.mode==='dia'?'지름':'거리') + '] — ' + tip);
  } else {
    toast('측정 모드 종료');
  }
}

// 거리/지름 서브모드 전환 (⌀ 버튼 토글)
function setMeasureSubMode(m){
  // 이미 그 모드면 거리로 되돌림 (토글)
  if(state.measureMode && measureState.mode === m && m === 'dia') m = 'dist';
  measureState.mode = m;
  state.measureFirst = null;
  if(!state.measureMode) toggleMeasureMode();
  const dBtn = document.getElementById('btnMeasureDia');
  if(dBtn){ dBtn.className = (measureState.mode==='dia') ? 'success' : ''; }
  if(measureState.mode==='dia'){
    setStat('⌀ 지름 측정 — 원통/구/회전체의 둥근 면을 클릭하면 지름 표시');
    toast('⌀ 지름 측정 모드');
  } else {
    setStat('📏 거리 측정 — 두 점을 클릭');
    toast('📏 거리 측정 모드');
  }
}

// 측정 점 픽킹: 정점(코너) 스냅 우선, 없으면 표면 레이캐스트 점
function pickMeasurePoint(e){
  const rect = renderer.domElement.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  // 1) 모든 부품 코너 중 화면상 12px 이내 가장 가까운 점
  let best=null, bestD=14*14;
  state.parts.forEach(p=>{
    if(!p.mesh || p.visible===false) return;
    meshCornersWorld(p.mesh).forEach(c=>{
      const s = worldToScreen3D(c);
      if(s.z>1) return;
      const d=(s.x-rect.left-mx)*(s.x-rect.left-mx)+(s.y-rect.top-my)*(s.y-rect.top-my);
      if(d<bestD){ bestD=d; best=c.clone(); }
    });
  });
  if(best) return best;
  // 2) 표면 레이캐스트
  mouseVec.x=((e.clientX-rect.left)/rect.width)*2-1;
  mouseVec.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouseVec, camera);
  const meshes=[];
  state.parts.forEach(p=>{ if(p.mesh && p.visible!==false) p.mesh.traverse(o=>{ if(o.isMesh && !o.userData._isEdgeOutline) meshes.push(o); }); });
  const hits = raycaster.intersectObjects(meshes, false);
  if(hits.length) return hits[0].point.clone();
  return null;
}

function handleMeasureClick(e){
  // v7.1: 지름 측정 모드 — 클릭한 부품의 둥근 단면 지름 계산
  if(measureState.mode === 'dia'){
    const hit = pickMeasureSurface(e);
    if(!hit){ toast('원형 면을 클릭하세요'); return; }
    const dia = computeDiameterAt(hit.part, hit.point);
    if(!dia){ toast('지름을 계산할 수 없습니다'); return; }
    measureState.lines.push({a:dia.p1, b:dia.p2, dist:dia.dia, isDia:true});
    rebuildMeasureLines();
    setStat('⌀ 지름: ' + dia.dia.toFixed(2) + ' mm — 계속 측정하거나 ESC로 종료');
    toast('⌀ ' + dia.dia.toFixed(2) + ' mm');
    return;
  }
  const pt = pickMeasurePoint(e);
  if(!pt){ toast('점을 찾지 못했습니다 (부품 표면이나 모서리를 클릭)'); return; }
  if(!state.measureFirst){
    state.measureFirst = pt;
    setStat('📏 첫 점 지정 — 두 번째 점을 클릭하세요');
    toast('첫 점 지정');
  } else {
    const a = state.measureFirst, b = pt;
    const dist = a.distanceTo(b);
    measureState.lines.push({a:a.clone(), b:b.clone(), dist});
    state.measureFirst = null;
    rebuildMeasureLines();
    setStat('📏 거리: ' + dist.toFixed(2) + ' mm — 계속 측정하거나 ESC로 종료');
    toast('📏 ' + dist.toFixed(2) + ' mm');
  }
}

// 표면 레이캐스트 → {part, point, mesh}
function pickMeasureSurface(e){
  const rect = renderer.domElement.getBoundingClientRect();
  mouseVec.x=((e.clientX-rect.left)/rect.width)*2-1;
  mouseVec.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouseVec, camera);
  const meshList=[]; const meshToPart=new Map();
  state.parts.forEach(p=>{
    if(p.mesh && p.visible!==false) p.mesh.traverse(o=>{ if(o.isMesh && !o.userData._isEdgeOutline){ meshList.push(o); meshToPart.set(o, p); } });
  });
  const hits = raycaster.intersectObjects(meshList, false);
  if(!hits.length) return null;
  return {part: meshToPart.get(hits[0].object) || null, point: hits[0].point.clone(), mesh: hits[0].object};
}

// v7.1.4: 메시 정점들이 중심에서 등거리(구면)인지 검사
function isSphereSurface(mesh, center){
  let geom = null;
  mesh.traverse(o=>{ if(o.isMesh && !o.userData._isEdgeOutline && !geom) geom = o.geometry; });
  if(!geom || !geom.attributes || !geom.attributes.position) return false;
  const pos = geom.attributes.position;
  // 박스류(코너만 등거리)는 정점이 적음 → 구는 정점이 많아야 함
  if(pos.count < 50) return false;
  mesh.updateMatrixWorld(true);
  const mat = mesh.matrixWorld;
  const n = Math.min(pos.count, 200); // 샘플 200개
  const step = Math.max(1, Math.floor(pos.count / n));
  let sum=0, sum2=0, cnt=0;
  const v = new THREE.Vector3();
  for(let i=0;i<pos.count;i+=step){
    v.fromBufferAttribute(pos, i).applyMatrix4(mat);
    const r = v.distanceTo(center);
    sum += r; sum2 += r*r; cnt++;
  }
  if(cnt < 20) return false;
  const mean = sum/cnt;
  const variance = sum2/cnt - mean*mean;
  const cv = Math.sqrt(Math.max(0,variance)) / mean; // 변동계수
  return cv < 0.03; // 반지름 편차 3% 미만이면 구면
}

// 클릭점이 속한 부품의 지름 계산
//   구: 중심-표면 거리(어디든 일정) / 원통·회전체: 축까지 수평거리 × 2
function computeDiameterAt(part, point){
  if(!part || !part.mesh) return null;
  part.mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(part.mesh);
  const center = bb.getCenter(new THREE.Vector3());
  const size = bb.getSize(new THREE.Vector3());

  // v7.1.4: 구 판별 — 타입이 구이거나, 정점들이 중심에서 등거리(구면)면 구로 처리
  //   (구는 어느 표면을 클릭해도 지름이 일정해야 함)
  const mx = Math.max(size.x, size.y, size.z), mn = Math.min(size.x, size.y, size.z);
  let isSphere = (part.type === 'primitive_sphere');
  if(!isSphere && mx > 1e-6 && (mx - mn) / mx < 0.08){
    // BB가 정육면체에 가까움 → 정점들이 중심 등거리인지 확인 (구면 검증)
    isSphere = isSphereSurface(part.mesh, center);
  }
  if(isSphere){
    // v7.1.4: 구 지름 = BB 최대 치수 (표면 레이캐스트 점은 메시 근사라 부정확 → BB가 정확)
    const dia = Math.max(size.x, size.y, size.z);
    if(dia < 1e-3) return null;
    // 지름선: 클릭점 방향으로 중심 통과하는 선 (시각용)
    const dir = point.clone().sub(center);
    if(dir.lengthSq() < 1e-6) dir.set(1,0,0);
    dir.normalize().multiplyScalar(dia/2);
    const p1 = center.clone().add(dir);
    const p2 = center.clone().sub(dir);
    return {dia, p1, p2, axis: 'sphere'};
  }

  // 회전축을 부품의 가장 긴 축으로 추정 (보통 Y=세로)
  // 클릭점에서 "축"까지 수평거리. 축은 center를 지나는 세로(Y)선으로 가정.
  // 점을 XZ평면(축에 수직)으로 투영해 중심까지 거리 = 반지름
  const dx = point.x - center.x, dz = point.z - center.z;
  let r = Math.hypot(dx, dz);
  let axis = 'y';
  // 만약 XZ 반지름이 너무 작으면(축이 Y가 아닐 수 있음) X축/Z축 기준도 시도
  const rX = Math.hypot(point.y - center.y, point.z - center.z); // X축 둘레
  const rZ = Math.hypot(point.x - center.x, point.y - center.y); // Z축 둘레
  // 셋 중, 그 축 방향 크기가 가장 크고 단면이 원형(나머지 두 치수가 비슷)인 축 선택
  const cand = [
    {axis:'y', r:r,  along:size.y, d1:size.x, d2:size.z},
    {axis:'x', r:rX, along:size.x, d1:size.y, d2:size.z},
    {axis:'z', r:rZ, along:size.z, d1:size.x, d2:size.y}
  ];
  // 단면이 원형에 가까운(d1≈d2) 축 우선
  cand.sort((p,q)=> Math.abs(p.d1-p.d2) - Math.abs(q.d1-q.d2));
  const chosen = cand[0];
  r = chosen.r; axis = chosen.axis;
  if(r < 1e-3) return null;
  // v7.1.4: 지름 = BB 단면 치수(축에 수직인 두 축의 큰 값) — 메시 근사 오차 제거해 정확
  const dia = Math.max(chosen.d1, chosen.d2);
  // 지름선 양 끝점 (클릭점 평면에서 축을 가로지름, 시각용)
  let p1, p2;
  if(axis==='y'){
    const ang = Math.atan2(dz, dx); const rr = dia/2;
    p1 = new THREE.Vector3(center.x+Math.cos(ang)*rr, point.y, center.z+Math.sin(ang)*rr);
    p2 = new THREE.Vector3(center.x-Math.cos(ang)*rr, point.y, center.z-Math.sin(ang)*rr);
  } else if(axis==='x'){
    const dy=point.y-center.y, dz2=point.z-center.z; const ang=Math.atan2(dz2,dy); const rr=dia/2;
    p1 = new THREE.Vector3(point.x, center.y+Math.cos(ang)*rr, center.z+Math.sin(ang)*rr);
    p2 = new THREE.Vector3(point.x, center.y-Math.cos(ang)*rr, center.z-Math.sin(ang)*rr);
  } else {
    const dx2=point.x-center.x, dy=point.y-center.y; const ang=Math.atan2(dy,dx2); const rr=dia/2;
    p1 = new THREE.Vector3(center.x+Math.cos(ang)*rr, center.y+Math.sin(ang)*rr, point.z);
    p2 = new THREE.Vector3(center.x-Math.cos(ang)*rr, center.y-Math.sin(ang)*rr, point.z);
  }
  return {dia, p1, p2, axis};
}

// 치수선(선 + 화살표 + 라벨) 3D 표시
function rebuildMeasureLines(){
  if(measureState.group){ scene.remove(measureState.group); measureState.group.traverse(o=>{ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); }); }
  const grp = new THREE.Group();
  measureState.lines.forEach((m, idx)=>{
    // 치수선 (노란 선)
    const g = new THREE.BufferGeometry().setFromPoints([m.a, m.b]);
    const line = new THREE.Line(g, new THREE.LineBasicMaterial({color:0xffcc00, depthTest:false}));
    line.renderOrder = 3000;
    grp.add(line);
    // 양 끝 점 마커
    [m.a, m.b].forEach(pt=>{
      const dot = new THREE.Mesh(new THREE.SphereGeometry(1.2,8,6), new THREE.MeshBasicMaterial({color:0xffcc00, depthTest:false}));
      dot.position.copy(pt); dot.renderOrder=3001; grp.add(dot);
    });
    // 라벨 (스프라이트 텍스트)
    const mid = m.a.clone().add(m.b).multiplyScalar(0.5);
    const labelTxt = (m.isDia ? '⌀ ' : '') + m.dist.toFixed(2) + ' mm';
    const sprite = makeTextSprite(labelTxt);
    if(sprite){ sprite.position.copy(mid); grp.add(sprite); }
  });
  scene.add(grp);
  measureState.group = grp;
}

// 텍스트 스프라이트 생성 (치수 라벨용)
function makeTextSprite(text){
  const cnv = document.createElement('canvas');
  const fs = 48; cnv.width = 256; cnv.height = 64;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = 'rgba(20,20,20,0.85)';
  ctx.fillRect(0,0,256,64);
  ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 3; ctx.strokeRect(2,2,252,60);
  ctx.font = 'bold ' + fs + 'px sans-serif';
  ctx.fillStyle = '#ffcc00';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cnv);
  const mat = new THREE.SpriteMaterial({map: tex, depthTest: false});
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(20, 5, 1); // mm 단위 크기
  sprite.renderOrder = 3002;
  return sprite;
}

function clearMeasurements(){
  measureState.lines = [];
  state.measureFirst = null;
  rebuildMeasureLines();
  toast('치수 모두 지움');
}


// 이동 후보 부품들(moveGroup)의 코너가 다른 부품 코너에 스냅되는 월드 offset 반환(없으면 null)
function computeVertexSnap(moveParts, excludeSet, force){
  if(!force && state.vertexSnap === false) return null;
  // 대상(이동 중) 코너들 (이미 새 위치로 옮겨진 mesh 기준)
  const movingCorners = [];
  moveParts.forEach(p=>{ meshCornersWorld(p.mesh).forEach(c=>movingCorners.push(c)); });
  if(movingCorners.length === 0) return null;
  // 타깃(고정) 코너들
  const targetCorners = [];
  state.parts.forEach(p=>{
    if(!p.mesh || p.visible === false) return;
    if(excludeSet && excludeSet.has(p.id)) return;
    meshCornersWorld(p.mesh).forEach(c=>targetCorners.push(c));
  });
  if(targetCorners.length === 0) return null;
  // 화면거리 최소 쌍 찾기
  let best=null, bestD=VERTEX_SNAP_PX*VERTEX_SNAP_PX;
  const tScreens = targetCorners.map(c=>({w:c, s:worldToScreen3D(c)}));
  for(const mc of movingCorners){
    const ms = worldToScreen3D(mc);
    if(ms.z>1) continue;
    for(const t of tScreens){
      if(t.s.z>1) continue;
      const d=(ms.x-t.s.x)*(ms.x-t.s.x)+(ms.y-t.s.y)*(ms.y-t.s.y);
      if(d<bestD){ bestD=d; best={from:mc, to:t.w}; }
    }
  }
  if(!best) return null;
  return best.to.clone().sub(best.from); // 이 offset만큼 더 옮기면 코너가 일치
}
function showShortcutHelp(){
  const msg = `📋 tool3 팅커캐드 단축키

[3D 모드]
  D        - 바닥에 떨어뜨리기 (Y=0 안착)
  R        - Y축 90도 회전
  M        - 좌우 미러 (X축)
  H        - 구멍 전환 (Hole)
  L        - 정렬 (Align)
  G        - 그리드 토글
  W        - 와이어프레임
  F        - 전체 맞춤 (Fit)
  T        - 텍스트 3D
  
  Ctrl+D   - 복제 (Duplicate)
  Ctrl+G   - 그룹화
  Ctrl+Shift+G - 그룹 해제
  Ctrl+Z/Y - Undo/Redo

  방향키   - 미세 이동 (1mm)
  Shift+방향키 - 큰 이동 (10mm)
  PgUp/PgDn - Y축 위/아래 이동
  Del      - 삭제
  Esc      - 선택 해제
  ?        - 이 도움말

[스케치 모드]
  L/R/C/A  - 선/사각형/원/호 도구
  S        - 선택
  G        - 그리드 토글
`;
  alert(msg);
}

// 색상 빠른 선택 - 추후 활성화용 placeholder
function applyQuickColor(n){
  const palette = ['#7a8aa0', '#a08070', '#80a070', '#a070b0', '#b07050', '#d0a060', '#7090b0', '#909090', '#d35400'];
  const c = palette[n-1] || '#888';
  const sel = getSelectedParts();
  const target = sel.length > 0 ? sel : [];
  if(target.length === 0) return;
  target.forEach(p => {
    p.color = c;
    p.mesh.traverse(o => {
      if(o.isMesh && o.material){
        const setColor = (m) => { if(m.color) m.color = new THREE.Color(c); };
        if(Array.isArray(o.material)) o.material.forEach(setColor);
        else setColor(o.material);
      }
    });
  });
  renderPartsList();
  toast('🎨 색상 #' + n + ' 적용');
}

function ungroupPart(){
  const sel = getSelectedParts();
  const target = sel.find(p => p.type === 'group') || (state.parts.length > 0 ? state.parts.find(p => p.type === 'group') : null);
  if(!target){toast('해제할 그룹이 없습니다'); return}

  const pr = target.params || {};
  const snaps = pr.childSnaps;

  // ── v5.9: childSnaps 기반 복원 (CSG 빼기/시각빼기/일반 그룹 모두 통일) ──
  if(snaps && snaps.length > 0){
    // 그룹 자체에 추가된 변환(그룹화 후 이동/회전)을 자식 월드변환에 합성
    target.mesh.updateMatrixWorld(true);
    const groupMat = target.mesh.matrixWorld.clone();

    // 빼기 결과 mesh 제거 및 메모리 정리
    scene.remove(target.mesh);
    target.mesh.traverse(o => {
      if(o.isMesh){ if(o.geometry) o.geometry.dispose(); if(o.material){ if(Array.isArray(o.material)) o.material.forEach(m=>m.dispose()); else o.material.dispose(); } }
    });
    const idx = state.parts.indexOf(target);
    if(idx >= 0) state.parts.splice(idx, 1);

    let restored = 0;
    snaps.forEach(s => {
      const cp = deserializePart(s);
      if(!cp || !cp.mesh) return;
      // 스냅샷 변환 적용 후, 그룹 변환을 곱해 월드 위치 정확히 복원
      if(s._xform){
        cp.mesh.position.set(s._xform.pos[0], s._xform.pos[1], s._xform.pos[2]);
        cp.mesh.rotation.set(s._xform.rot[0], s._xform.rot[1], s._xform.rot[2]);
        cp.mesh.scale.set(s._xform.scl[0], s._xform.scl[1], s._xform.scl[2]);
      }
      cp.mesh.updateMatrix();
      // 그룹이 이동했었다면 그 변환을 자식에 적용
      cp.mesh.applyMatrix4(groupMat);
      cp.mesh.visible = true;
      cp._isHole = !!s._isHole;
      cp.id = state.partIdCounter++;
      state.parts.push(cp);
      scene.add(cp.mesh);
      restored++;
    });
    renderPartsList(); updateInfo();
    pushHistory();
    toast('✂️ 그룹 해제 — 원본 ' + restored + '개 복원' + (pr.csgApplied ? ' (빼기 취소)' : ''));
    return;
  }

  // ── 폴백: 자식 mesh 직접 분리 (구버전 그룹) ──
  const children = [];
  target.mesh.children.slice().forEach(child => {
    target.mesh.remove(child);
    child.applyMatrix4(target.mesh.matrixWorld);
    children.push(child);
  });
  scene.remove(target.mesh);
  const idx = state.parts.indexOf(target);
  if(idx >= 0) state.parts.splice(idx, 1);
  children.forEach((mesh) => {
    mesh.visible = true;
    const part = {
      id: state.partIdCounter++, name: '부품_' + state.partIdCounter,
      type: 'primitive_box', color: '#888', opacity: 1, visible: true,
      mesh, params: {}
    };
    state.parts.push(part);
    scene.add(mesh);
  });
  renderPartsList(); updateInfo();
  pushHistory();
  toast('✂️ 그룹 해제 완료 (' + children.length + '개 부품)');
}

// ─── v8.52: ISO 미터 나사 표준 + 나사산 메시 생성 ───────────────
const ISO_METRIC_PITCH = {3:0.5, 4:0.7, 5:0.8, 6:1.0, 8:1.25, 10:1.5, 12:1.75};

// 명목 직경 d → 표준 피치
function isoPitchFor(d){
  const ds = Object.keys(ISO_METRIC_PITCH).map(Number).sort((a,b)=>a-b);
  let best = ds[0], bestDiff = Math.abs(d - ds[0]);
  for(let i=1; i<ds.length; i++){
    const diff = Math.abs(d - ds[i]);
    if(diff < bestDiff){ bestDiff = diff; best = ds[i]; }
  }
  if(bestDiff < 0.4) return ISO_METRIC_PITCH[best];
  return Math.max(0.25, Math.round(d * 0.15 * 4) / 4);
}

// 나사산 메시 — 헬릭스를 따라 삼각 단면을 스윕한 *닫힌 솔리드* 리브 (v8.76)
//   baseR = 몸통 쪽 베이스 반경, crestR = 돌출 끝(크레스트) 반경
//   v8.76: 베이스를 몸통 안으로 살짝 파묻어(penetration) 몸통 원통과 *동일 평면 충돌* 제거
//          → Tinkercad가 두 솔리드를 깨끗이 합침 (이전: 표면이 겹쳐 깨짐)
function createThreadMesh(baseR, crestR, length, pitch, material, rightHand, segPerTurn){
  if(!segPerTurn) segPerTurn = 24;
  if(rightHand === undefined) rightHand = true;
  if(Math.abs(crestR - baseR) < 0.001 || length < pitch * 0.5){
    return null;
  }
  // 베이스를 크레스트 반대 방향으로 penetration 만큼 이동 → 몸통 속으로 파묻음
  const dir = (baseR < crestR) ? -1 : 1;  // 볼트: base<crest → 안쪽(-), 너트: base>crest → 바깥(+)
  const penetration = Math.max(0.15, Math.abs(crestR - baseR) * 0.4);
  const rBase = baseR + dir * penetration;
  const rCrest = crestR;
  const turns = length / pitch;
  const totalSeg = Math.max(16, Math.round(turns * segPerTurn));
  const sign = rightHand ? 1 : -1;
  const positions = [];
  const indices = [];
  const hh = pitch * 0.25;

  for(let i = 0; i <= totalSeg; i++){
    const t = i / segPerTurn;
    const angle = sign * t * Math.PI * 2;
    const yc = t * pitch - length / 2;
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    positions.push(rBase*cosA,  yc - hh, rBase*sinA);  // 0: 베이스 하
    positions.push(rCrest*cosA, yc,      rCrest*sinA); // 1: 크레스트
    positions.push(rBase*cosA,  yc + hh, rBase*sinA);  // 2: 베이스 상
  }
  const quad = (a,b,c,d) => { indices.push(a,b,c); indices.push(a,c,d); };
  for(let i = 0; i < totalSeg; i++){
    const s0 = 3*i, s1 = 3*(i+1);
    const a0=s0, b0=s0+1, c0=s0+2;
    const a1=s1, b1=s1+1, c1=s1+2;
    quad(a0, b0, b1, a1);
    quad(b0, c0, c1, b1);
    quad(c0, a0, a1, c1);
  }
  const lastBase = 3*totalSeg;
  indices.push(0, 2, 1);
  indices.push(lastBase, lastBase+1, lastBase+2);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return new THREE.Mesh(geom, material);
}

// v8.77: 캡스크류 머리 — 단일 watertight 메시 (블라인드 육각 구멍)
//   이전(2조각 원기둥+홀링)의 동일평면 충돌·원호 seam 스파이크 제거
function buildCapHead(headD, headH, keyD, tolerance, mat){
  const R = headD/2;
  const solidH = headH * 0.4;                 // 블라인드 구멍 바닥 높이
  const keyEff = keyD + tolerance;
  const cornerR = keyEff / Math.sqrt(3);      // 육각 정점 반경 (대변 keyEff)
  const M = 36;                               // 외곽 분할 (6의 배수 → 육각과 정렬)
  const pos = []; const idx = [];
  const add = (x,y,z)=>{ pos.push(x,y,z); return pos.length/3-1; };
  const Otop=[],Obot=[];
  for(let j=0;j<M;j++){const a=j*2*Math.PI/M, c=Math.cos(a), s=Math.sin(a);
    Otop.push(add(R*c,headH,R*s)); Obot.push(add(R*c,0,R*s));}
  const Htop=[],Hbot=[];
  for(let k=0;k<6;k++){const a=k*Math.PI/3+Math.PI/6, c=Math.cos(a), s=Math.sin(a);
    Htop.push(add(cornerR*c,headH,cornerR*s)); Hbot.push(add(cornerR*c,solidH,cornerR*s));}
  const Cbot = add(0,0,0), Chole = add(0,solidH,0);
  const tri=(a,b,c)=>idx.push(a,b,c);
  const quad=(a,b,c,d)=>{idx.push(a,b,c);idx.push(a,c,d);};
  for(let j=0;j<M;j++){const j2=(j+1)%M; quad(Obot[j],Obot[j2],Otop[j2],Otop[j]);} // 외곽 벽
  for(let j=0;j<M;j++){const j2=(j+1)%M; tri(Cbot,Obot[j],Obot[j2]);}              // 바닥
  for(let k=0;k<6;k++){const k2=(k+1)%6; quad(Htop[k],Htop[k2],Hbot[k2],Hbot[k]);} // 구멍 벽
  for(let k=0;k<6;k++){const k2=(k+1)%6; tri(Chole,Hbot[k2],Hbot[k]);}            // 구멍 바닥
  for(let k=0;k<6;k++){                                                            // 윗면 환형
    const jk=3+6*k, jk1=(3+6*(k+1))%M, k2=(k+1)%6;
    let j=jk; while(j!==jk1){const j2=(j+1)%M; tri(Htop[k],Otop[j2],Otop[j]); j=j2;}
    tri(Htop[k],Htop[k2],Otop[jk1]);
  }
  const fixedIdx = makeConsistentWinding(pos, idx);  // 와인딩 일관화 + 외향 정렬
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setIndex(fixedIdx);
  geom.computeVertexNormals();
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(geom, mat));
  return grp;
}

// v8.77: 삼각형 메시의 와인딩을 일관되게 정렬 (BFS 전파 + signed-volume 외향 보정)
function makeConsistentWinding(pos, idx){
  const Q=1e4, key=i=>Math.round(pos[3*i]*Q)+'_'+Math.round(pos[3*i+1]*Q)+'_'+Math.round(pos[3*i+2]*Q);
  const vm=new Map(); const vid=i=>{const k=key(i);let id=vm.get(k);if(id===undefined){id=vm.size;vm.set(k,id);}return id;};
  const F=idx.length/3; const tris=[];
  for(let f=0;f<F;f++) tris.push([vid(idx[3*f]),vid(idx[3*f+1]),vid(idx[3*f+2]),idx[3*f],idx[3*f+1],idx[3*f+2]]);
  const ekey=(a,b)=>a<b?a+'_'+b:b+'_'+a;
  const emap=new Map();
  tris.forEach((t,f)=>{for(let e=0;e<3;e++){const a=t[e],b=t[(e+1)%3];const k=ekey(a,b);if(!emap.has(k))emap.set(k,[]);emap.get(k).push(f);}});
  const visited=new Array(F).fill(false), flip=new Array(F).fill(false);
  const dirOf=(f,a,b)=>{const t=tris[f];for(let e=0;e<3;e++){if(t[e]===a&&t[(e+1)%3]===b)return 1;if(t[e]===b&&t[(e+1)%3]===a)return -1;}return 0;};
  for(let s=0;s<F;s++){if(visited[s])continue;visited[s]=true;const stack=[s];
    while(stack.length){const f=stack.pop();const tf=tris[f];
      for(let e=0;e<3;e++){const a=tf[e],b=tf[(e+1)%3];const nbrs=emap.get(ekey(a,b));
        nbrs.forEach(gf=>{if(gf===f||visited[gf])return;
          const fdir=dirOf(f,a,b)*(flip[f]?-1:1), gdir=dirOf(gf,a,b);
          flip[gf]=(fdir===gdir)?!flip[gf]:flip[gf]; visited[gf]=true; stack.push(gf);});
      }
    }
  }
  const out=[];
  for(let f=0;f<F;f++){const t=tris[f]; if(flip[f]) out.push(t[5],t[4],t[3]); else out.push(t[3],t[4],t[5]);}
  let vol=0;
  for(let f=0;f<F;f++){const a=out[3*f],b=out[3*f+1],c=out[3*f+2];
    const ax=pos[3*a],ay=pos[3*a+1],az=pos[3*a+2],bx=pos[3*b],by=pos[3*b+1],bz=pos[3*b+2],cx=pos[3*c],cy=pos[3*c+1],cz=pos[3*c+2];
    vol += ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx);}
  if(vol<0){for(let f=0;f<F;f++){const m=out[3*f+1];out[3*f+1]=out[3*f+2];out[3*f+2]=m;}}
  return out;
}

// ===== 볼트/너트/스프링 (v1.3) =====
const BOLT_PRESETS = {
  M3:  {shankD:3,  shankL:10, headD:5.5,  headH:2,   key:2.5},
  M4:  {shankD:4,  shankL:12, headD:7,    headH:2.8, key:3},
  M5:  {shankD:5,  shankL:16, headD:8.5,  headH:3.5, key:4},
  M6:  {shankD:6,  shankL:20, headD:10,   headH:4,   key:5},
  M8:  {shankD:8,  shankL:25, headD:13,   headH:5.3, key:6},
  M10: {shankD:10, shankL:30, headD:17,   headH:6.4, key:8},
  M12: {shankD:12, shankL:40, headD:19,   headH:7.5, key:10}
};
const NUT_PRESETS = {
  M3:  {holeD:3,  outerD:5.5,  height:2.4},
  M4:  {holeD:4,  outerD:7,    height:3.2},
  M5:  {holeD:5,  outerD:8,    height:4},
  M6:  {holeD:6,  outerD:10,   height:5},
  M8:  {holeD:8,  outerD:13,   height:6.5},
  M10: {holeD:10, outerD:17,   height:8},
  M12: {holeD:12, outerD:19,   height:10}
};

function openBoltModal(){
  document.getElementById('boltPartName').value = '볼트_' + state.partIdCounter;
  document.getElementById('boltModal').classList.add('show');
}
function openNutModal(){
  document.getElementById('nutPartName').value = '너트_' + state.partIdCounter;
  document.getElementById('nutModal').classList.add('show');
}
function openSpringModal(){
  document.getElementById('springPartName').value = '스프링_' + state.partIdCounter;
  document.getElementById('springModal').classList.add('show');
}

function applyBoltPreset(){
  const k = document.getElementById('boltPreset').value;
  if(k === 'custom') return;
  const p = BOLT_PRESETS[k]; if(!p) return;
  document.getElementById('boltShankD').value = p.shankD;
  document.getElementById('boltShankL').value = p.shankL;
  document.getElementById('boltHeadD').value = p.headD;
  document.getElementById('boltHeadH').value = p.headH;
  // v8.52: ISO 표준 피치 자동
  const pitchEl = document.getElementById('boltPitch');
  if(pitchEl){
    const P = ISO_METRIC_PITCH[p.shankD];
    if(P !== undefined) pitchEl.value = P;
  }
  // v8.53: ISO 4762 캡스크류 키 사이즈 자동
  const keyEl = document.getElementById('boltKeyD');
  if(keyEl && p.key !== undefined) keyEl.value = p.key;
}
function applyNutPreset(){
  const k = document.getElementById('nutPreset').value;
  if(k === 'custom') return;
  const p = NUT_PRESETS[k]; if(!p) return;
  document.getElementById('nutHoleD').value = p.holeD;
  document.getElementById('nutOuterD').value = p.outerD;
  document.getElementById('nutHeight').value = p.height;
  // v8.52: ISO 표준 피치 자동
  const pitchEl = document.getElementById('nutPitch');
  if(pitchEl){
    const P = ISO_METRIC_PITCH[p.holeD];
    if(P !== undefined) pitchEl.value = P;
  }
}

function doBolt(){
  const shankD = parseFloat(document.getElementById('boltShankD').value);
  const shankL = parseFloat(document.getElementById('boltShankL').value);
  const headD = parseFloat(document.getElementById('boltHeadD').value);
  const headH = parseFloat(document.getElementById('boltHeadH').value);
  const headType = document.getElementById('boltHeadType').value;
  // v8.53: 캡스크류 키 사이즈
  const keyD = parseFloat((document.getElementById('boltKeyD')||{}).value) || (shankD * 0.6);
  // v8.52: 나사산 옵션
  const threadMode = (document.getElementById('boltThread') || {}).value || 'iso';
  const customPitch = parseFloat((document.getElementById('boltPitch')||{}).value) || 1.0;
  const tolerance = parseFloat((document.getElementById('boltTolerance')||{}).value) || 0;
  const color = document.getElementById('boltColor').value;
  let name = document.getElementById('boltPartName').value.trim() || ('볼트_' + state.partIdCounter);
  if(isNaN(shankD) || isNaN(shankL) || isNaN(headD) || isNaN(headH)){toast('수치를 확인하세요'); return}

  const group = new THREE.Group();
  const mat = makeMaterial(color, 1);

  // v8.52: 나사산이 있으면 나사부는 골 반경의 원통 + 헬릭스 메시 추가
  // 없으면 외경 -공차 원통 하나 (단순)
  let shankOuterR = (shankD - tolerance) / 2;
  let shankCoreR = shankOuterR;
  let threadMesh = null;
  if(threadMode !== 'none'){
    const P = (threadMode === 'iso') ? isoPitchFor(shankD) : customPitch;
    // 골 반경 = (d - 1.0825P)/2 — 공차는 외경에서만 적용 (골은 그대로)
    shankCoreR = (shankD - 1.0825 * P) / 2;
    shankOuterR = (shankD - tolerance) / 2;
    threadMesh = createThreadMesh(shankCoreR, shankOuterR, shankL, P, mat, true, 24);
  }

  // 머리: Y축 위쪽에 배치, 나사부는 아래쪽
  if(headType === 'cap'){
    // v8.53: 캡스크류 — 원기둥 + 육각 렌치 구멍 (실제 음각)
    const capHead = buildCapHead(headD, headH, keyD, tolerance, mat);
    group.add(capHead);
  } else {
    let headGeom;
    if(headType === 'hex'){
      // 육각 머리: 6각형 단면 (Cylinder의 segments=6)
      headGeom = new THREE.CylinderGeometry(headD/2, headD/2, headH, 6);
    } else if(headType === 'round'){
      // 둥근머리: 반구 위에 짧은 원통
      const dome = new THREE.SphereGeometry(headD/2, 32, 16, 0, Math.PI*2, 0, Math.PI/2);
      const domeMesh = new THREE.Mesh(dome, mat);
      domeMesh.position.y = headH/2;
      group.add(domeMesh);
      headGeom = new THREE.CylinderGeometry(headD/2, headD/2, headH, 32);
    }
    const headMesh = new THREE.Mesh(headGeom, mat);
    headMesh.position.y = headH/2;
    group.add(headMesh);
  }

  // 나사부 — 골 반경 원통(core). v8.78: 머리 속으로 headOverlap만큼 파묻어 연결부 동일평면 충돌 제거
  const headOverlap = headH * 0.25;            // 캡 머리 블라인드 구멍 바닥(0.4·headH)보다 낮아 안전
  const coreLen = shankL + headOverlap;
  const shankGeom = new THREE.CylinderGeometry(shankCoreR, shankCoreR, coreLen, 32);
  const shankMesh = new THREE.Mesh(shankGeom, mat);
  shankMesh.position.y = (headOverlap - shankL) / 2;  // 바닥 -shankL, 윗면 +headOverlap(머리 속)
  group.add(shankMesh);
  // v8.52: 나사산 메시 (코어에 묻힘, 위치 그대로)
  if(threadMesh){
    threadMesh.position.y = -shankL/2;
    group.add(threadMesh);
  }

  // v8.53: 캡스크류 음각은 buildCapHead()에서 실제 구멍으로 처리됨

  const part = {
    id: state.partIdCounter++, name, type: 'bolt',
    color, opacity: 1, visible: true, mesh: group,
    params: {shankD, shankL, headD, headH, headType, keyD, threadMode, customPitch, tolerance}
  };
  state.parts.push(part);
  addPartToScene(part);
  renderPartsList(); updateInfo();
  closeModal('boltModal'); switchMode('model'); fitView();
  pushHistory(); // v4.6
  toast('✅ 볼트 생성: ' + name);
}

function doNut(){
  const holeD = parseFloat(document.getElementById('nutHoleD').value);
  const outerD = parseFloat(document.getElementById('nutOuterD').value);
  const height = parseFloat(document.getElementById('nutHeight').value);
  // v8.52: 나사산 옵션
  const threadMode = (document.getElementById('nutThread') || {}).value || 'iso';
  const customPitch = parseFloat((document.getElementById('nutPitch')||{}).value) || 1.0;
  const tolerance = parseFloat((document.getElementById('nutTolerance')||{}).value) || 0;
  const color = document.getElementById('nutColor').value;
  let name = document.getElementById('nutPartName').value.trim() || ('너트_' + state.partIdCounter);
  if(isNaN(holeD) || isNaN(outerD) || isNaN(height)){toast('수치를 확인하세요'); return}
  if(holeD >= outerD){toast('구멍은 외경보다 작아야 합니다'); return}

  // v8.52: 나사산이 있으면 구멍은 공차 적용된 더 큰 골 반경(=볼트 외경 + 공차)
  //         + 안쪽에 나사산 메시 (산이 안쪽으로 돌출)
  // 너트의 구멍 = 볼트 외경 + 공차 (헐겁게 들어가도록)
  // 너트의 나사 산 반경(안쪽 가장 돌출된 곳) = 볼트 골 반경 + 공차*0.5 (살짝 헐겁)
  const outerR = outerD / 2;
  let bore = (holeD + tolerance) / 2;  // 너트 통구멍 반경
  let nutThreadOuter = bore;  // 너트 안쪽 산 반경
  let nutThreadRoot = bore;
  let pitch = 0;
  if(threadMode !== 'none'){
    pitch = (threadMode === 'iso') ? isoPitchFor(holeD) : customPitch;
    // 너트 구멍 자체는 명목 + 공차 (볼트가 헐겁게 들어가도록)
    bore = (holeD + tolerance) / 2;
    // 너트 안쪽 나사산: 산이 안쪽으로 (소경=볼트 골+공차*0.5, 대경=볼트 외경 위치 = 너트 통구멍)
    nutThreadRoot = bore;  // 통구멍 반경 (= 큰 쪽)
    nutThreadOuter = (holeD - 1.0825 * pitch + tolerance * 0.5) / 2;  // 안쪽 돌출(작은 쪽)
  }
  const holeR = bore;  // 헥스 단면 빼기에 쓸 구멍 반경

  const hexShape = new THREE.Shape();
  for(let i = 0; i < 6; i++){
    const a = i * Math.PI / 3 + Math.PI/6; // 평평한 면이 위/아래 향하도록 +30°
    const x = outerR * Math.cos(a);
    const y = outerR * Math.sin(a);
    if(i === 0) hexShape.moveTo(x, y);
    else hexShape.lineTo(x, y);
  }
  hexShape.closePath();
  const holePath = new THREE.Path();
  holePath.absarc(0, 0, holeR, 0, Math.PI*2, false);
  hexShape.holes.push(holePath);

  const geom = new THREE.ExtrudeGeometry(hexShape, {
    depth: height, bevelEnabled: false, curveSegments: 32
  });
  // ExtrudeGeometry는 Z방향으로 돌출 → Y 위로 향하도록 -90° (rotateX(-90°) 결과: Y 0~height)
  geom.rotateX(-Math.PI/2);
  // v8.67: 본체를 원점 중심(-height/2~height/2)으로 정렬
  geom.translate(0, -height/2, 0);

  const mat = makeMaterial(color, 1);
  const body = new THREE.Mesh(geom, mat);
  const group = new THREE.Group();
  group.add(body);
  // v8.52: 너트 내부 나사산 메시 (안쪽으로 산이 튀어나옴)
  // → outerR=nutThreadRoot(통구멍 큰 쪽), rootR=nutThreadOuter(안쪽 작은 쪽)
  if(threadMode !== 'none' && pitch > 0){
    // v8.67: 나사산이 본체를 벗어나지 않도록 본체보다 1피치 짧게 + 원점 중심
    const tLen = Math.max(pitch, height - pitch);
    const nutThread = createThreadMesh(nutThreadRoot, nutThreadOuter, tLen, pitch, mat, true, 24);
    if(nutThread){
      nutThread.position.y = 0;
      group.add(nutThread);
    }
  }

  const part = {
    id: state.partIdCounter++, name, type: 'nut',
    color, opacity: 1, visible: true, mesh: group,
    params: {holeD, outerD, height, threadMode, customPitch, tolerance}
  };
  state.parts.push(part);
  addPartToScene(part);
  renderPartsList(); updateInfo();
  closeModal('nutModal'); switchMode('model'); fitView();
  pushHistory();
  toast('✅ 너트 생성: ' + name + (threadMode!=='none'?' · 나사산 P'+pitch+'mm':''));
}

function doSpring(){
  const coilD = parseFloat(document.getElementById('springCoilD').value);
  const wireD = parseFloat(document.getElementById('springWireD').value);
  const length = parseFloat(document.getElementById('springLength').value);
  const turns = parseFloat(document.getElementById('springTurns').value);
  const seg = parseInt(document.getElementById('springSeg').value);
  const color = document.getElementById('springColor').value;
  let name = document.getElementById('springPartName').value.trim() || ('스프링_' + state.partIdCounter);
  if(isNaN(coilD) || isNaN(wireD) || isNaN(length) || isNaN(turns)){toast('수치를 확인하세요'); return}
  if(wireD >= coilD/2){toast('선재가 너무 굵습니다 (코일 지름보다 작아야)'); return}

  // 헬릭스(나선) 경로 생성
  const coilR = coilD / 2;
  // 총 점 개수: turns * seg
  const totalSeg = Math.max(16, Math.round(turns * seg));
  // CatmullRomCurve3 또는 직접 TubeGeometry용 CurvePath
  class HelixCurve extends THREE.Curve {
    constructor(R, L, T){
      super();
      this.R = R; this.L = L; this.T = T;
    }
    getPoint(t, target){
      target = target || new THREE.Vector3();
      const angle = t * this.T * Math.PI * 2;
      const x = this.R * Math.cos(angle);
      const z = this.R * Math.sin(angle);
      const y = t * this.L - this.L/2; // 가운데 정렬
      return target.set(x, y, z);
    }
  }
  const curve = new HelixCurve(coilR, length, turns);
  // TubeGeometry로 헬릭스를 따라 원형 단면 sweep
  const geom = new THREE.TubeGeometry(curve, totalSeg, wireD/2, 12, false);

  const mat = makeMaterial(color, 1);
  const mesh = new THREE.Mesh(geom, mat);

  const part = {
    id: state.partIdCounter++, name, type: 'spring',
    color, opacity: 1, visible: true, mesh,
    params: {coilD, wireD, length, turns, seg}
  };
  state.parts.push(part);
  addPartToScene(part);
  renderPartsList(); updateInfo();
  closeModal('springModal'); switchMode('model'); fitView();
  pushHistory(); // v4.6
  toast('✅ 스프링 생성: ' + name);
}

function renderPartsList(){
  const list = document.getElementById('partsList');
  if(!list) return; // v1.8: 부품트리 패널 제거됨 - 안전 처리
  if(state.parts.length === 0){
    list.innerHTML = '<div style="padding:10px;font-size:10px;color:#666;text-align:center;line-height:1.6">부품이 없습니다.<br>돌출 / 회전체 또는<br>볼트 / 너트 / 스프링을<br>생성하세요.</div>';
    return;
  }
  list.innerHTML = state.parts.map(p=>`
    <div class="part-item ${state.selectedPartId === p.id ? 'selected' : ''} ${p._selected ? 'multi-selected' : ''}" onclick="selectPart(${p.id}, event)">
      <button class="vis-btn" onclick="event.stopPropagation();togglePartVis(${p.id})" title="표시/숨김">${p.visible ? '👁️' : '🚫'}</button>
      <span style="display:inline-block;width:10px;height:10px;background:${p.color};border-radius:2px;border:1px solid #555"></span>
      <span class="pname" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}${p._selected ? ' ✓' : ''}</span>
      <button class="del-btn" onclick="event.stopPropagation();deletePartById(${p.id})" title="삭제">✕</button>
    </div>
  `).join('');
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function selectPart(id, event){
  const part = state.parts.find(p => p.id === id);
  if(!part) return;
  // v3.1: Ctrl/Cmd 또는 Shift = 다중 선택 토글
  if(event && (event.ctrlKey || event.metaKey || event.shiftKey)){
    part._selected = !part._selected;
    renderPartsList();
    updateMultiSelectHighlight();
    const selCount = state.parts.filter(p => p._selected).length;
    if(selCount !== 1) hideTransformHandles();
    else if(selCount === 1) {
      const onlySel = state.parts.find(p => p._selected);
      if(onlySel) showTransformHandles(onlySel);
    }
    return;
  }
  // 일반 클릭 = 단독 선택
  state.parts.forEach(p => { p._selected = false; });
  part._selected = true;
  state.selectedPartId = id;
  document.getElementById('selectedPartProp').style.display = '';
  document.getElementById('propPartName').value = part.name;
  document.getElementById('propPartColor').value = part.color;
  const matSel = document.getElementById('propPartMaterial');
  if(matSel) matSel.value = part.material || 'plastic_matte';
  document.getElementById('propPartOpacity').value = Math.round(part.opacity * 100);
  // v3.3: 위치/크기/회전 입력값 갱신
  refreshPropPanelTransform(part);
  // v2.7: Z축 회전 솔리드 패널 표시 + 색상 동기화 + 미리보기 정보
  const zrp = document.getElementById('zRevolvePanel');
  if(zrp){
    zrp.style.display = '';
    const cInp = document.getElementById('zrevColor');
    if(cInp) cInp.value = part.color;
    updateZRevolvePreviewInfo(part);
  }
  renderPartsList();
  updateMultiSelectHighlight();
  // 3D 핸들 표시 (3D 모드일 때만)
  if(state.mode === 'model'){
    showTransformHandles(part);
  }
}

function updateMultiSelectHighlight(){
  const selCount = state.parts.filter(p=>p._selected).length;
  state.parts.forEach(p=>{
    if(p.mesh){
      p.mesh.traverse(o=>{
        if(o.isMesh && o.material && o.material.emissive){
          // 다중 선택(2개 이상)이면 더 밝은 주황 발광으로 뚜렷하게
          if(p._selected){
            o.material.emissive.setHex(selCount > 1 ? 0x885500 : 0x553300);
          } else {
            o.material.emissive.setHex(0x000000);
          }
        }
      });
    }
  });
}

function togglePartVis(id){
  const p = state.parts.find(x => x.id === id);
  if(!p) return;
  p.visible = !p.visible;
  if(p.mesh) p.mesh.visible = p.visible;
  renderPartsList();
  updateInfo();
}

function deletePartById(id, skipConfirm){
  if(!skipConfirm && !confirm('부품을 삭제하시겠습니까?')) return;
  const idx = state.parts.findIndex(p => p.id === id);
  if(idx < 0) return;
  const delName = state.parts[idx].name;
  removePartFromScene(state.parts[idx]);
  state.parts.splice(idx, 1);
  if(state.selectedPartId === id){
    state.selectedPartId = null;
    document.getElementById('selectedPartProp').style.display = 'none';
    const zrp = document.getElementById('zRevolvePanel');
    if(zrp) zrp.style.display = 'none';
  }
  hideTransformHandles();
  renderPartsList();
  updateInfo();
  pushHistory(); // v4.6: 삭제도 되돌리기 대상
  if(skipConfirm) toast('🗑️ ' + delName + ' 삭제됨 (Ctrl+Z로 복구)');
}

function deletePart(){if(state.selectedPartId) deletePartById(state.selectedPartId)}

function duplicatePart(){
  if(!state.selectedPartId) return;
  const orig = state.parts.find(p => p.id === state.selectedPartId);
  if(!orig) return;
  const newMesh = orig.mesh.clone();
  newMesh.traverse(o=>{
    if(o.isMesh){
      o.geometry = o.geometry.clone();
      o.material = o.material.clone();
    }
  });
  newMesh.position.x += 30;
  const dup = {...orig, id: state.partIdCounter++, name: orig.name + '_복사', mesh: newMesh};
  state.parts.push(dup);
  addPartToScene(dup);
  renderPartsList();
  updateInfo();
  pushHistory(); // v4.6
  toast('복제됨');
}

function updatePartName(){
  const p = state.parts.find(x => x.id === state.selectedPartId);
  if(!p) return;
  p.name = document.getElementById('propPartName').value;
  renderPartsList();
}
function updatePartColorPreview(){
  // v3.8: 색상 피커에서 색을 고르는 중 실시간 미리보기 (피커는 닫지 않음)
  const p = state.parts.find(x => x.id === state.selectedPartId);
  const colorInp = document.getElementById('propPartColor');
  if(!p || !colorInp) return;
  p.color = colorInp.value;
  if(p.mesh){
    p.mesh.traverse(o=>{
      if(o.isMesh && o.material) o.material.color.set(p.color);
    });
  }
}

function updatePartColor(){
  const p = state.parts.find(x => x.id === state.selectedPartId);
  const colorInp = document.getElementById('propPartColor');
  if(!p || !colorInp) return;
  const newColor = colorInp.value;
  p.color = newColor;
  if(p.mesh){
    p.mesh.traverse(o=>{
      if(o.isMesh && o.material) o.material.color.set(p.color);
    });
  }
  renderPartsList();
  toast('🎨 색상 적용: ' + newColor);
  pushHistory(); // v7.1.4: 색상 변경 되돌리기 지원
  // v3.8: 색상 피커 강제 닫기 - input 요소를 새로 만들어 교체
  //   비동기로 실행해서 onchange 처리가 완전히 끝난 뒤 교체되도록 함
  setTimeout(() => {
    const old = document.getElementById('propPartColor');
    if(!old) return;
    const parent = old.parentNode;
    const clone = document.createElement('input');
    clone.type = 'color';
    clone.id = old.id;
    clone.value = newColor;
    clone.oninput = updatePartColorPreview;
    clone.onchange = updatePartColor;
    if(old.getAttribute('style')) clone.setAttribute('style', old.getAttribute('style'));
    parent.replaceChild(clone, old);
  }, 0);
}
function updatePartOpacity(){
  const p = state.parts.find(x => x.id === state.selectedPartId);
  if(!p) return;
  const v = parseInt(document.getElementById('propPartOpacity').value) / 100;
  p.opacity = v;
  if(p.mesh){
    p.mesh.traverse(o=>{
      if(o.isMesh && o.material && !o.userData._isEdgeOutline){
        o.material.transparent = v < 1;
        o.material.opacity = v;
      }
    });
  }
}

// v7.1.4: 재질(표면 질감) 프리셋 적용 — 색/투명도는 유지하고 roughness/metalness만 교체
function updatePartMaterial(){
  const p = state.parts.find(x => x.id === state.selectedPartId);
  const sel = document.getElementById('propPartMaterial');
  if(!p || !sel) return;
  const matKey = sel.value;
  const preset = MATERIAL_PRESETS[matKey] || MATERIAL_PRESETS.plastic_matte;
  p.material = matKey;
  // 유리 선택 시 투명도 자동 조정
  if(preset.glassOpacity !== undefined && p.opacity >= 1){
    p.opacity = preset.glassOpacity;
    const opInp = document.getElementById('propPartOpacity');
    if(opInp) opInp.value = Math.round(p.opacity * 100);
  }
  if(p.mesh){
    p.mesh.traverse(o=>{
      if(o.isMesh && o.material && !o.userData._isEdgeOutline){
        o.material.roughness = preset.roughness;
        o.material.metalness = preset.metalness;
        o.material.transparent = p.opacity < 1;
        o.material.opacity = p.opacity;
        o.material.needsUpdate = true;
      }
    });
  }
  renderPartsList();
  const labels = {plastic_matte:'무광 플라스틱',plastic_glossy:'광택 플라스틱',metal:'금속',chrome:'크롬',brushed:'브러시드 메탈',rubber:'고무',glass:'유리',ceramic:'세라믹'};
  toast('🧱 재질: ' + (labels[matKey] || matKey));
  pushHistory();
}

function switchMode(m){
  state.mode = m;
  const modeBadge = document.getElementById('modeBadge');
  // v1.7: body class로 모드별 도구바 자동 표시
  document.body.classList.remove('mode-sketch', 'mode-model');
  document.body.classList.add('mode-' + m);
  if(m === 'sketch'){
    document.getElementById('sketchArea').classList.remove('hidden');
    document.getElementById('viewerArea').classList.remove('show');
    modeBadge.className = 'mode-badge';
    modeBadge.textContent = '스케처 모드';
    document.getElementById('footMode').textContent = '스케처';
    document.getElementById('btnSketchMode').classList.add('active');
    document.getElementById('btnModelMode').classList.remove('active');
    // 스케치 모드 → 3D 핸들/치수 숨김
    hideTransformHandles();
    // v8.92: 명령 키보드 열기 버튼 복원 (스케치 전용 UI)
    const kbOpen = document.getElementById('sk3KbOpenBtn');
    if(kbOpen && document.getElementById('sk3KbPanel') &&
       document.getElementById('sk3KbPanel').style.display !== 'flex'){ kbOpen.style.display = ''; }
    setTimeout(resizeSkCanvas, 50);
  } else {
    document.getElementById('sketchArea').classList.add('hidden');
    document.getElementById('viewerArea').classList.add('show');
    modeBadge.className = 'mode-badge model';
    modeBadge.textContent = '3D 모델 보기';
    document.getElementById('footMode').textContent = '3D';
    document.getElementById('btnSketchMode').classList.remove('active');
    document.getElementById('btnModelMode').classList.add('active');
    // v8.92: 3D 모드에서는 스케치용 명령 키보드 패널/열기버튼 숨김
    const kbPanel = document.getElementById('sk3KbPanel');
    if(kbPanel) kbPanel.style.display = 'none';
    const kbOpen = document.getElementById('sk3KbOpenBtn');
    if(kbOpen) kbOpen.style.display = 'none';
    const kbBtn = document.getElementById('btn-cmdkb');
    if(kbBtn) kbBtn.classList.remove('on');
    // v8.6: 3D로 넘어갈 때 스케치 도형을 바닥(XZ 평면) 미리보기로 자동 표시
    // v8.89: 도형이 없으면 이전 바닥 미리보기(잔상)를 반드시 제거
    if(state.shapes && state.shapes.length > 0){
      drawShapesOnFloor();
      if(floorSketchGroup){
        toast('👁️ 스케치 ' + state.shapes.length + '개 도형 바닥 미리보기 · 돌출/회전체 명령으로 3D화');
      }
    } else {
      if(typeof clearFloorSketch === 'function') clearFloorSketch();
    }
    setTimeout(onThreeResize, 50);
  }
}

function setView(v){
  orbitState.target.set(0, 0, 0);
  if(v === 'top'){orbitState.theta = 0; orbitState.phi = 0.001; orbitState.radius = 300}
  else if(v === 'bottom'){orbitState.theta = 0; orbitState.phi = Math.PI - 0.001; orbitState.radius = 300}
  else if(v === 'front'){orbitState.theta = 0; orbitState.phi = Math.PI/2; orbitState.radius = 300}
  else if(v === 'right'){orbitState.theta = Math.PI/2; orbitState.phi = Math.PI/2; orbitState.radius = 300}
  else if(v === 'iso'){orbitState.theta = Math.PI/4; orbitState.phi = Math.PI/3; orbitState.radius = 350}
  updateCamera();
}

function fitView(keepAngle){
  // v2.2: 부품이 없어도 바닥 스케치(import 도형)가 있으면 그것에 맞춰 fit
  // v2.8: keepAngle=true면 현재 시점(theta/phi) 유지하고 거리만 조정
  const box = new THREE.Box3();
  state.parts.forEach(p=>{
    if(p.visible && p.mesh){
      const b = new THREE.Box3().setFromObject(p.mesh);
      if(!b.isEmpty()) box.union(b);
    }
  });
  if(floorSketchGroup){
    const b = new THREE.Box3().setFromObject(floorSketchGroup);
    if(!b.isEmpty()) box.union(b);
  }
  if(box.isEmpty()){
    if(!keepAngle) setView('iso');
    return;
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  orbitState.target.copy(center);
  orbitState.radius = Math.max(50, maxDim * 2.2);
  if(!keepAngle){
    orbitState.theta = Math.PI/4;
    orbitState.phi = Math.PI/3;
  }
  updateCamera();
}

function resetView(){orbitState.target.set(0, 0, 0); setView('iso')}

function toggleWireframe(){
  state.wireframe = !state.wireframe;
  state.parts.forEach(p=>{
    if(p.mesh){
      p.mesh.traverse(o=>{
        if(o.isMesh && o.material) o.material.wireframe = state.wireframe;
      });
    }
  });
  toast('와이어프레임 ' + (state.wireframe ? 'ON' : 'OFF'));
}

// v6.6: 입체도형 외곽 모서리 선 표시 토글
function toggleEdgeOutline(){
  state.showEdges = !state.showEdges;
  if(state.showEdges){
    refreshAllEdgeOutlines();
  } else {
    state.parts.forEach(p=>{ if(p.mesh) (p.mesh.isMesh ? removeEdgeOutline(p.mesh) : p.mesh.traverse(o=>{ if(o.isMesh) removeEdgeOutline(o); })); });
  }
  const btn = document.getElementById('btnEdgeOutline');
  if(btn){
    btn.textContent = state.showEdges ? '🔲 외곽선 ON' : '🔲 외곽선 OFF';
    btn.className = state.showEdges ? 'success' : '';
  }
  toast('모서리 외곽선 ' + (state.showEdges ? 'ON' : 'OFF'));
}

// v6.7: 버텍스 스냅 토글
function toggleVertexSnap(){
  state.vertexSnap = !state.vertexSnap;
  const btn = document.getElementById('btnVertexSnap');
  if(btn){
    btn.textContent = state.vertexSnap ? '🧲 버텍스스냅 ON' : '🧲 버텍스스냅 OFF';
    btn.className = state.vertexSnap ? 'success' : '';
  }
  toast('버텍스 스냅 ' + (state.vertexSnap ? 'ON · 항상 스냅 (또는 Ctrl누르며 이동 시 임시 스냅)' : 'OFF · Ctrl 누르며 이동하면 임시 스냅'));
}

function toggleGrid(){
  if(state.mode === 'model'){
    state.showGrid = !state.showGrid;
    if(gridHelper){
      gridHelper.visible = state.showGrid;
    }
  } else {
    state.showGrid = !state.showGrid;
    redrawSketch();
  }
  toast('그리드 ' + (state.showGrid ? 'ON' : 'OFF'));
}

function toggleAxes(){
  if(state.mode === 'model'){
    state.showAxes = !state.showAxes;
    if(axesHelper) axesHelper.visible = state.showAxes;
  } else {
    state.showAxes = !state.showAxes;
    redrawSketch();
  }
}

function toggleGridSnap(){
  state.gridSnap = !state.gridSnap;
  const btn = document.getElementById('btn-gridsnap');
  if(btn) btn.classList.toggle('active', state.gridSnap);
  toast('격자스냅 ' + (state.gridSnap ? 'ON' : 'OFF'));
}

// ─── v8.25: X축 표시 기준점 ───────────────────────────────────
// dispX(actualX): 사용자에게 보여줄 X (푸터 좌표, 속성 패널 표시)
// inpX(userInputX): 사용자가 입력한 X를 실제 X로 변환 (속성 패널 적용 시)
window.dispX = function(x){ return x - (state.xOrigin || 0); };
window.inpX  = function(x){ return x + (state.xOrigin || 0); };
// v8.23 호환 - Y 헬퍼는 dummy (yOrigin=0 고정)
window.dispY = function(y){ return y; };
window.inpY  = function(y){ return y; };

function updateXOriginIndicator(){
  const ind = document.getElementById('xOriginIndicator');
  if(!ind) return;
  const v = state.xOrigin || 0;
  if(Math.abs(v) < 1e-9){
    ind.textContent = '(기본)';
    ind.style.color = '#888';
  } else {
    const sign = v >= 0 ? '−' : '+';
    ind.textContent = '※표시X = 실제X ' + sign + ' ' + Math.abs(v);
    ind.style.color = '#f39c12';
  }
}

window.sk3SetXOrigin = function(){
  const el = document.getElementById('xOriginInput');
  if(!el) return;
  let raw = String(el.value).trim();
  if(raw === ''){ toast('값을 입력하세요 (음수 가능)'); return; }
  // 수식 평가 (음수, =, +, -, *, /, () 지원)
  const cleaned = raw.replace(/[^0-9+\-*/.()]/g, '');
  let v;
  try { v = Function('"use strict";return (' + cleaned + ')')(); }
  catch(e){ toast('숫자 또는 수식 오류'); return; }
  if(!isFinite(v)){ toast('유효한 숫자 필요'); return; }
  state.xOrigin = v;
  el.value = String(v);
  updateXOriginIndicator();
  redrawSketch();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  toast('📍 X기준 ' + (v >= 0 ? '+' : '') + v + 'mm 적용 — 실제 X=' + v + '인 점이 표시 X=0');
};

window.sk3ResetXOrigin = function(){
  state.xOrigin = 0;
  const el = document.getElementById('xOriginInput');
  if(el) el.value = '0';
  updateXOriginIndicator();
  redrawSketch();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  toast('⟲ X기준 0으로 초기화');
};

// ─── v8.24: 라이브 접선 스냅 + 두 선 접선 배치 ─────────────────
window.toggleTangentSnap = function(){
  state.tangentSnap = !state.tangentSnap;
  const btn = document.getElementById('btn-tangentsnap');
  if(btn) btn.classList.toggle('on', state.tangentSnap);
  toast('🪐 라이브 접선 스냅 ' + (state.tangentSnap ? 'ON' : 'OFF') +
    (state.tangentSnap ? ' — 원/호 드래그 시 가까운 선에 자동 접선' : ''));
};

// 원 중심 P (반지름 r) 를 가장 가까운 line 에 접하도록 보정한 새 중심 반환
// excludeIdxs: 자기 자신 도형 인덱스(선택된 원/호의 펜점·rect 모서리 등) 제외
// thresholdMm: 접선 판정 임계값(mm)
function sk3FindTangentSnap(P, r, excludeIdxs, thresholdMm){
  if(r <= 0) return null;
  let best = null;
  state.shapes.forEach((L, idx) => {
    if(L.type !== 'line') return;
    if(excludeIdxs && excludeIdxs.indexOf(idx) >= 0) return;
    const dx = L.x2-L.x1, dy = L.y2-L.y1;
    const len = Math.hypot(dx, dy);
    if(len < 1e-9) return;
    const ux = dx/len, uy = dy/len;
    const nx = -uy, ny = ux;
    const sd = (P.x-L.x1)*nx + (P.y-L.y1)*ny;
    const err = Math.abs(Math.abs(sd) - r);
    if(err > thresholdMm) return;
    // 마우스의 선 위 투영 t (segment 내부 + 약간 여유)
    const tParam = ((P.x-L.x1)*ux + (P.y-L.y1)*uy) / len;
    if(tParam < -0.2 || tParam > 1.2) return;
    if(!best || err < best.err){
      const sign = sd >= 0 ? 1 : -1;
      const projX = P.x - nx*sd, projY = P.y - ny*sd;
      best = {
        err, lineIdx: idx,
        center: {x: projX + nx*r*sign, y: projY + ny*r*sign}
      };
    }
  });
  return best;
}

// 원을 두 선에 모두 접하도록 이동 (반지름 유지)
window.sk3TangentTwoLines = function(){
  const sel = [...state.selectedShapes];
  if(sel.length === 0){ toast('원 1개 + 선 2개를 선택하세요'); return; }
  const circles = [];
  const lines = [];
  sel.forEach(i => {
    const s = state.shapes[i];
    if(!s) return;
    if(s.type === 'circle') circles.push({idx:i, s});
    else if(s.type === 'line') lines.push({idx:i, s});
  });
  if(circles.length !== 1 || lines.length !== 2){
    toast('원 1개 + 선 2개를 선택해야 합니다 (현재 원 ' + circles.length + ', 선 ' + lines.length + ')');
    return;
  }
  const C = circles[0].s, L1 = lines[0].s, L2 = lines[1].s;
  // 두 선이 평행이면 안 됨
  const dx1=L1.x2-L1.x1, dy1=L1.y2-L1.y1, dx2=L2.x2-L2.x1, dy2=L2.y2-L2.y1;
  const cross = dx1*dy2 - dy1*dx2;
  if(Math.abs(cross) < 1e-10){ toast('두 선이 평행하여 접선 배치 불가'); return; }

  // 각 선의 normal 중 현재 원 중심이 있는 쪽으로 r만큼 평행이동
  // 그 두 직선의 교점이 새 원 중심
  function unitTowardCenter(L, P){
    const dx=L.x2-L.x1, dy=L.y2-L.y1, len=Math.hypot(dx,dy);
    const ux=dx/len, uy=dy/len;
    const n={x:-uy, y:ux};
    const sd=(P.x-L.x1)*n.x+(P.y-L.y1)*n.y;
    return sd>=0 ? n : {x:-n.x, y:-n.y};
  }
  const P = {x: C.cx, y: C.cy};
  const n1 = unitTowardCenter(L1, P);
  const n2 = unitTowardCenter(L2, P);
  const r = C.r;
  const A1={x:L1.x1+n1.x*r, y:L1.y1+n1.y*r};
  const A2={x:L1.x2+n1.x*r, y:L1.y2+n1.y*r};
  const B1={x:L2.x1+n2.x*r, y:L2.y1+n2.y*r};
  const B2={x:L2.x2+n2.x*r, y:L2.y2+n2.y*r};
  const Adx=A2.x-A1.x, Ady=A2.y-A1.y, Bdx=B2.x-B1.x, Bdy=B2.y-B1.y;
  const cr=Adx*Bdy-Ady*Bdx;
  if(Math.abs(cr)<1e-10){ toast('계산 실패'); return; }
  const tt=((B1.x-A1.x)*Bdy-(B1.y-A1.y)*Bdx)/cr;
  const newCx = A1.x + tt*Adx;
  const newCy = A1.y + tt*Ady;

  pushHistory();
  // 펜점 일치하면 함께 이동
  const tol = 0.01;
  state.penPoints.forEach(p => {
    if(Math.abs(p.x-C.cx)<tol && Math.abs(p.y-C.cy)<tol){ p.x=newCx; p.y=newCy; }
  });
  const oldCx = C.cx, oldCy = C.cy;
  C.cx = newCx; C.cy = newCy;
  redrawSketch(); updateInfo();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  // 검증: 두 선까지 거리 확인
  function distLine(P, L){
    const dx=L.x2-L.x1, dy=L.y2-L.y1, len=Math.hypot(dx,dy);
    return Math.abs(((P.x-L.x1)*(-dy/len) + (P.y-L.y1)*(dx/len)));
  }
  const d1 = distLine({x:newCx,y:newCy}, L1).toFixed(3);
  const d2 = distLine({x:newCx,y:newCy}, L2).toFixed(3);
  toast('⊙ 원 → 두 선에 접선 배치 (r=' + r + ', 거리 L1=' + d1 + 'mm, L2=' + d2 + 'mm)');
  if(typeof skCmdLog === 'function') skCmdLog('  ⊙ 두선 접선: 원 (' + oldCx.toFixed(2) + ',' + oldCy.toFixed(2) + ') → (' + newCx.toFixed(2) + ',' + newCy.toFixed(2) + ') r=' + r, 'sys');
};

// ─── v8.27: 겹친 선 통합 (collinear merge) ──────────────────
// 같은 직선 위에 있고 구간이 겹치거나 닿는 line들을 1개로 합침
// - 완전 동일 / 역방향 / 부분 겹침 / 끝점 닿음 / 포함 관계 모두 처리
// - 색상·굵기 다른 선들은 합치되 첫 번째 선 기준 (다르면 토스트로 알림)
// - 펜점은 그대로 유지 (사용자 의도 점일 수 있음)
// ─── v8.45: 닫힌 영역 자동 채움 (Face boundary trace) ──────────
// 평면 그래프(planar subdivision)에서 클릭 위치를 둘러싸는 가장 작은 face를 찾아 폴리곤 채움
// 동작: 채움 도구 ON → 닫힌 영역 클릭 → 자동 boundary trace → 채움 객체 생성
//
// 채움 객체 구조:
//   {type:'fill', vertices:[{x,y},...], color:'#...', stroke:null|'#...', strokeWidth:0|N, id}
//
// 알고리즘:
//   1. 모든 line endpoint를 unique node로 (tolerance 0.01mm)
//   2. 각 line은 양방향 directed edge 두 개, 각 노드의 edges를 각도순 정렬
//   3. 클릭점 +X ray cast → 가장 가까운 line 찾기
//   4. 그 line의 두 방향 directed edge 모두 trace 시도 (next CCW edge)
//   5. point-in-polygon 검증 + 면적 최소인 것 채택 (내부 face)

function _fillBuildPlanarGraph(){
  const nodes = [];
  const edges = [];
  const tol = 0.05;  // v8.80: 필렛 호-선 접점 미세 오차 흡수 (0.01→0.05mm)
  function nFor(x, y){
    let i = nodes.findIndex(n => Math.abs(n.x-x)<tol && Math.abs(n.y-y)<tol);
    if(i<0){ nodes.push({x, y, edges:[]}); i = nodes.length-1; }
    return i;
  }
  state.shapes.forEach((s, lidx) => {
    if(s.type === 'line'){
      const a = nFor(s.x1, s.y1);
      const b = nFor(s.x2, s.y2);
      if(a === b) return;
      const ang = Math.atan2(nodes[b].y - nodes[a].y, nodes[b].x - nodes[a].x);
      const ia = edges.length, ib = ia + 1;
      edges.push({from:a, to:b, angle:ang,         twin:ib, lineIdx:lidx});
      edges.push({from:b, to:a, angle:ang+Math.PI, twin:ia, lineIdx:lidx});
      nodes[a].edges.push(ia);
      nodes[b].edges.push(ib);
    } else if(s.type === 'arc' || s.type === 'circle'){
      // v8.80: 필렛 등 호(arc)/원을 짧은 선분으로 분할해 그래프에 포함 → 닫힌 영역 인식
      let a0 = (s.startAngle !== undefined) ? s.startAngle : 0;
      let a1 = (s.endAngle   !== undefined) ? s.endAngle   : Math.PI*2;
      const full = (s.type === 'circle') || s.isFull;
      if(full){ a0 = 0; a1 = Math.PI*2; }
      else { while(a1 <= a0) a1 += Math.PI*2; }  // 반시계 보장
      const r = s.r || s.radius || 0;
      if(r < 1e-6) return;
      const span = a1 - a0;
      const segN = Math.max(2, Math.ceil(span / (Math.PI/12))); // 약 15° 간격
      let prev = nFor(s.cx + r*Math.cos(a0), s.cy + r*Math.sin(a0));
      for(let k=1;k<=segN;k++){
        const ang = a0 + span * (k/segN);
        const cur = nFor(s.cx + r*Math.cos(ang), s.cy + r*Math.sin(ang));
        if(cur === prev) continue;
        const an = Math.atan2(nodes[cur].y - nodes[prev].y, nodes[cur].x - nodes[prev].x);
        const ia = edges.length, ib = ia + 1;
        edges.push({from:prev, to:cur, angle:an,          twin:ib, lineIdx:lidx});
        edges.push({from:cur, to:prev, angle:an+Math.PI,  twin:ia, lineIdx:lidx});
        nodes[prev].edges.push(ia);
        nodes[cur].edges.push(ib);
        prev = cur;
      }
    }
  });
  nodes.forEach(n => n.edges.sort((x,y) => edges[x].angle - edges[y].angle));
  return {nodes, edges};
}

function _fillNextCCW(g, ei){
  const e = g.edges[ei];
  const node = g.nodes[e.to];
  const tw = e.twin;
  const pos = node.edges.indexOf(tw);
  if(pos < 0) return -1;
  const nextPos = (pos + 1) % node.edges.length;
  return node.edges[nextPos];
}

function _fillTraceFace(g, startEi){
  const path = [g.edges[startEi].from];
  let cur = startEi;
  let safety = 1000;
  while(safety-- > 0){
    const e = g.edges[cur];
    path.push(e.to);
    if(e.to === path[0]) return path.slice(0, -1);
    const nx = _fillNextCCW(g, cur);
    if(nx < 0 || nx === startEi) return null;
    cur = nx;
  }
  return null;
}

function _fillRayCastLine(g, click){
  const seen = new Set();
  let bestX = Infinity, bestLine = -1;
  g.edges.forEach((e) => {
    if(seen.has(e.lineIdx)) return;
    seen.add(e.lineIdx);
    const a = g.nodes[e.from], b = g.nodes[e.to];
    const ymin = Math.min(a.y, b.y), ymax = Math.max(a.y, b.y);
    if(click.y < ymin - 1e-9 || click.y > ymax + 1e-9) return;
    if(Math.abs(b.y - a.y) < 1e-9) return;  // 수평선 skip
    const t = (click.y - a.y) / (b.y - a.y);
    if(t < -1e-9 || t > 1 + 1e-9) return;
    const x = a.x + t * (b.x - a.x);
    if(x < click.x - 1e-9) return;
    if(x < bestX){ bestX = x; bestLine = e.lineIdx; }
  });
  return bestLine;
}

function _fillInPolygon(p, poly){
  let inside = false;
  for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if(((yi > p.y) !== (yj > p.y)) &&
       (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

function _fillPolyArea(poly){
  let a = 0;
  for(let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    a += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(a) / 2;
}

window.sk3FindFaceAt = function(clickWp){
  const g = _fillBuildPlanarGraph();
  if(g.nodes.length === 0) return null;
  const lineIdx = _fillRayCastLine(g, clickWp);
  if(lineIdx < 0) return null;
  const eis = [];
  g.edges.forEach((e, ei) => { if(e.lineIdx === lineIdx) eis.push(ei); });
  const candidates = [];
  eis.forEach(ei => {
    const path = _fillTraceFace(g, ei);
    if(path && path.length >= 3){
      const poly = path.map(i => ({x: g.nodes[i].x, y: g.nodes[i].y}));
      if(_fillInPolygon(clickWp, poly)) candidates.push(poly);
    }
  });
  if(candidates.length === 0) return null;
  candidates.sort((a, b) => _fillPolyArea(a) - _fillPolyArea(b));
  return candidates[0];
};

// v8.45: 선택된 채움 객체 속성 적용 (속성 패널)
window.sk3ApplyFillProp = function(){
  if(!state.selectedShapes || state.selectedShapes.size !== 1) return;
  const idx = [...state.selectedShapes][0];
  const s = state.shapes[idx];
  if(!s || s.type !== 'fill') return;
  pushHistory();
  const c = document.getElementById('sk3fillColor');
  if(c) s.color = c.value;
  const strokeOn = document.getElementById('sk3fillStrokeOn');
  const strokeC = document.getElementById('sk3fillStroke');
  const strokeW = document.getElementById('sk3fillStrokeW');
  if(strokeOn && strokeOn.value === '1'){
    s.stroke = strokeC ? strokeC.value : '#000000';
    s.strokeWidth = strokeW ? parseFloat(strokeW.value) || 1.5 : 1.5;
  } else {
    s.stroke = null;
    s.strokeWidth = 0;
  }
  redrawSketch(); updateInfo();
  toast('✓ 채움 속성 적용');
};

// v8.47: 채움 → 3D 돌출 변환 (모드 전환 + 돌출 모달 자동 열기)
window.sk3FillToExtrude = function(){
  if(!state.selectedShapes || state.selectedShapes.size !== 1){
    toast('채움 객체를 먼저 선택하세요');
    return;
  }
  const idx = [...state.selectedShapes][0];
  const s = state.shapes[idx];
  if(!s || s.type !== 'fill'){ toast('채움 객체를 선택하세요'); return; }
  // 3D 모드로 전환
  if(state.mode === 'sketch' && typeof setMode === 'function'){
    setMode('model');
  }
  // doExtrude는 state.selectedShapes를 대상으로 (그대로 유지됨)
  setTimeout(() => {
    if(typeof openExtrudeModal === 'function') openExtrudeModal();
    toast('🟦 채움 → 돌출: 높이/방향 입력 후 [돌출] 클릭');
  }, 120);
};

// v8.47: 채움 → 3D 회전체 변환
window.sk3FillToRevolve = function(){
  if(!state.selectedShapes || state.selectedShapes.size !== 1){
    toast('채움 객체를 먼저 선택하세요');
    return;
  }
  const idx = [...state.selectedShapes][0];
  const s = state.shapes[idx];
  if(!s || s.type !== 'fill'){ toast('채움 객체를 선택하세요'); return; }
  // v8.49: 채움 객체 회전체 변환 — 자주 의도와 다른 결과 → 확인 dialog
  const ok = confirm(
    '🌀 채움 → 회전체 변환\n\n' +
    '⚠ 회전체는 회전축 360° 회전 → 결과는 항상 둥근 (회전대칭) 형상\n' +
    '   9각형 → 둥근 디스크/도넛 (9각 형태 사라짐)\n\n' +
    '· 9각형 같은 각진 부품을 원한다면 🟦 돌출이 적합\n' +
    '· 회전체는 디스크/축/씰/링 등 회전대칭 부품에 적합\n\n' +
    '계속 진행하시겠습니까?'
  );
  if(!ok) return;
  if(state.mode === 'sketch' && typeof setMode === 'function'){
    setMode('model');
  }
  setTimeout(() => {
    if(typeof openRevolveModal === 'function') openRevolveModal();
    toast('🌀 채움 → 회전체: 회전축/각도 입력 후 [회전] 클릭');
  }, 120);
};

// v8.45: 선택된 채움 객체 삭제 (속성 패널 버튼)
window.sk3DeleteSelectedFill = function(){
  if(!state.selectedShapes || state.selectedShapes.size !== 1) return;
  const idx = [...state.selectedShapes][0];
  const s = state.shapes[idx];
  if(!s || s.type !== 'fill') return;
  if(!confirm('🗑 이 채움을 삭제할까요?')) return;
  pushHistory();
  state.shapes.splice(idx, 1);
  state.selectedShapes.clear();
  redrawSketch(); updateInfo();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  toast('🗑 채움 삭제');
};

// 채움 모드 토글
window.sk3ToggleFillMode = function(){
  if(state.mode !== 'sketch'){ toast('스케치 모드에서만 가능'); return; }
  state.fillModeOn = !state.fillModeOn;
  const btn = document.getElementById('btn-fillmode');
  if(btn) btn.classList.toggle('on', state.fillModeOn);
  if(state.fillModeOn){
    if(typeof setTool === 'function' && state.tool !== 'select') setTool('select');
    toast('🎨 채움 모드 ON — 닫힌 영역 내부를 클릭하면 자동 채움 (Esc=종료)');
  } else {
    toast('🎨 채움 모드 OFF');
  }
};

// 클릭 위치 → 닫힌 영역 자동 채움
window.sk3FillAtClick = function(wp){
  const poly = window.sk3FindFaceAt(wp);
  if(!poly){
    toast('⚠ 닫힌 영역 찾기 실패 — ⊞ 교차로 분할 후 다시 시도하거나, 선이 끊어진 곳을 확인하세요');
    return false;
  }
  pushHistory();
  const fillColor = (document.getElementById('fillColor') || {}).value || '#ffe599';
  state.shapes.push({
    type: 'fill',
    vertices: poly,
    color: fillColor,
    stroke: null,
    strokeWidth: 0
  });
  redrawSketch(); updateInfo();
  toast('🎨 채움 추가 (' + poly.length + '점, 면적 ' + _fillPolyArea(poly).toFixed(2) + 'mm²)');
  if(typeof skCmdLog === 'function') skCmdLog('  🎨 채움: ' + poly.length + '점 폴리곤 · ' + fillColor, 'sys');
  return true;
};


window.sk3MergeOverlappingLines = function(silent){
  if(state.mode !== 'sketch'){ toast('스케치 모드에서만 가능'); return 0; }
  // 작업 대상: 모든 line (선택과 무관 — 전체 정리)
  // 단, 선택된 도형이 있으면 선택된 line만 대상으로
  const useSelection = state.selectedShapes && state.selectedShapes.size > 0;
  const lineEntries = [];   // {origIdx, s}
  const keepOthers = [];
  state.shapes.forEach((s, idx) => {
    const inSel = useSelection ? state.selectedShapes.has(idx) : true;
    if(s.type === 'line' && inSel){
      lineEntries.push({origIdx: idx, s: JSON.parse(JSON.stringify(s))});
    } else {
      keepOthers.push(s);
    }
  });
  if(lineEntries.length < 2){
    if(!silent) toast('통합할 선이 부족 (line ' + lineEntries.length + '개)' + (useSelection?' 선택된 것 중':''));
    return 0;
  }

  const tol = 0.01;       // 좌표 일치 tolerance (mm)
  const tolNormal = 0.05; // 직선 위 판정 tolerance (mm) — 약간 풀어서 사용자가 손으로 그은 선도 흡수

  function tryMerge(A, B){
    const dx = A.x2-A.x1, dy = A.y2-A.y1, len = Math.hypot(dx,dy);
    if(len < tol) return null;
    const ux = dx/len, uy = dy/len;
    function distN(px, py){ return Math.abs(-uy*(px-A.x1) + ux*(py-A.y1)); }
    if(distN(B.x1, B.y1) > tolNormal) return null;
    if(distN(B.x2, B.y2) > tolNormal) return null;
    function tOf(px, py){ return ux*(px-A.x1) + uy*(py-A.y1); }
    const tB1 = tOf(B.x1, B.y1), tB2 = tOf(B.x2, B.y2);
    const tBmin = Math.min(tB1, tB2), tBmax = Math.max(tB1, tB2);
    // 겹치거나 닿는지: [0,len]과 [tBmin,tBmax]
    if(tBmax < -tol || tBmin > len + tol) return null;
    const newMin = Math.min(0, tBmin), newMax = Math.max(len, tBmax);
    return {
      x1: A.x1 + ux*newMin, y1: A.y1 + uy*newMin,
      x2: A.x1 + ux*newMax, y2: A.y1 + uy*newMax
    };
  }

  // 반복적으로 가까운 한 쌍씩 합치기 (변화 없을 때까지)
  let changed = true, iterations = 0, mergedCount = 0;
  let colorMismatchCount = 0;
  while(changed && iterations < 500){
    changed = false; iterations++;
    outer: for(let i = 0; i < lineEntries.length; i++){
      for(let j = i + 1; j < lineEntries.length; j++){
        const A = lineEntries[i].s, B = lineEntries[j].s;
        const m = tryMerge(A, B);
        if(m){
          // 색상/굵기 다르면 카운트만 (첫 번째 선 기준 유지)
          if((A.color || '#000000') !== (B.color || '#000000') ||
             (A.lineWidth || 2) !== (B.lineWidth || 2)){
            colorMismatchCount++;
          }
          // i를 새 선으로 갱신 (색상/굵기는 A 유지)
          lineEntries[i].s = {
            type: 'line',
            x1: m.x1, y1: m.y1, x2: m.x2, y2: m.y2,
            color: A.color, lineWidth: A.lineWidth, fillColor: A.fillColor
          };
          // j 제거
          lineEntries.splice(j, 1);
          changed = true;
          mergedCount++;
          break outer;
        }
      }
    }
  }

  if(mergedCount === 0){
    if(!silent) toast('🧬 통합 대상 없음 (겹친 선 발견 안 됨)');
    return 0;
  }
  pushHistory();
  // useSelection이면 원본 도형 중 선택된 line만 제거하고 합쳐진 결과 추가
  // useSelection이 아니면 전체 line을 합쳐진 것으로 교체
  if(useSelection){
    // 선택된 line의 원래 인덱스 모음
    const selLineIdxSet = new Set();
    state.shapes.forEach((s, idx) => {
      if(s.type === 'line' && state.selectedShapes.has(idx)) selLineIdxSet.add(idx);
    });
    state.shapes = state.shapes.filter((s, idx) => !selLineIdxSet.has(idx));
    lineEntries.forEach(e => state.shapes.push(e.s));
    state.selectedShapes.clear();
  } else {
    state.shapes = keepOthers.concat(lineEntries.map(e => e.s));
    state.selectedShapes.clear();
  }
  // v8.40: 통합된 선의 새 끝점에 펜점 자동 부여
  let autoAddedM = 0;
  if(typeof window.sk3SyncPenPointsToShapes === 'function'){
    autoAddedM = window.sk3SyncPenPointsToShapes();
  }
  redrawSketch(); updateInfo();
  if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
  const msg = '🧬 겹친 선 ' + mergedCount + '쌍 통합' + (colorMismatchCount > 0 ? ' (색상/굵기 다른 ' + colorMismatchCount + '쌍은 첫 선 기준)' : '') + (autoAddedM?' · 신규 펜점 ' + autoAddedM + '개':'');
  if(!silent) toast(msg);
  if(typeof skCmdLog === 'function') skCmdLog('  🧬 겹친 선 통합: ' + mergedCount + '쌍' + (useSelection ? ' (선택 대상)' : ' (전체)') + (colorMismatchCount?' · 색상다름 '+colorMismatchCount:'') + (autoAddedM?' · 펜점 ' + autoAddedM:''), 'sys');
  return mergedCount;
};

function newProject(){
  if(!confirm('새 프로젝트를 시작하시겠습니까?\n저장되지 않은 작업은 사라집니다.')) return;
  state.shapes = [];
  state.selectedShapes.clear();
  // v8.21: 펜점/펜커서/원점/측정 모드 등 모든 스케치 상태 초기화
  state.penPoints = [];
  state.penCur = -1;
  state.penOrigin = null;
  state.drawing = null;
  state.dragPoint = null;
  state.dragShape = null;
  state.boxSelect = null;
  state.wheelConnectMode = false;
  state.wheelConnectFirst = -1;
  if(state.measureMode){
    state.measureMode = false;
    state.measureFirst = null;
  }
  if(typeof _sk3Clipboard !== 'undefined') _sk3Clipboard = null;  // v8.19 클립보드도 비우기
  // v8.25: X 기준점도 0으로 초기화
  state.xOrigin = 0;
  state.yOrigin = 0;
  const _xoi = document.getElementById('xOriginInput');
  if(_xoi) _xoi.value = '0';
  if(typeof updateXOriginIndicator === 'function') updateXOriginIndicator();
  // v8.50: v8.34~v8.45에서 추가된 모드/상태들도 모두 초기화
  state.bgImage = null;
  state._bgImgTemp = null;
  state.angleLineMode = null;
  state.sweepConnect = null;
  state.sweepConnectModeOn = false;
  state.sweepRadius = 0.5;
  state.fillModeOn = false;
  state.fineGrid = null;
  state._sweepHoverWp = null;
  state._penPreviewWp = null;
  state._lastSnapKind = null;
  state.tangentSnap = false;
  // 모드 토글 버튼들 색 원복
  ['btn-sweep', 'btn-fillmode', 'btn-tangentsnap', 'btn-angleline'].forEach(id => {
    const b = document.getElementById(id);
    if(b) b.style.background = '';
  });
  // 도구 모드도 select로 초기화
  if(typeof setTool === 'function') setTool('select');
  state.parts.forEach(p => removePartFromScene(p));
  state.parts = [];
  if(typeof clearFloorSketch === 'function') clearFloorSketch(); // v8.89: 바닥 스케치 미리보기 잔상 제거
  state.selectedPartId = null;
  state.partIdCounter = 1;
  state.history = [];
  state.historyIdx = -1;
  document.getElementById('selectedPartProp').style.display = 'none';
  const _zrpNew = document.getElementById('zRevolvePanel');
  if(_zrpNew) _zrpNew.style.display = 'none';
  const _ssp = document.getElementById('sk3SelProp');
  if(_ssp) _ssp.style.display = 'none';
  // v8.50: 캔버스 강제 clear (3D 모드에서 newProject 클릭 후 2D 돌아갔을 때 잔상 방지)
  if(typeof skCanvas !== 'undefined' && skCtx){
    skCtx.clearRect(0, 0, skCanvas.width, skCanvas.height);
  }
  renderPartsList();
  redrawSketch();
  updateInfo();
  pushHistory(); // v4.6: 새 프로젝트 빈 상태 시드
  toast('📄 새 프로젝트 — 도형/펜점/모드/히스토리 모두 초기화');
}

function saveProject(){
  const data = {
    version: '1.1',
    savedAt: new Date().toISOString(),
    shapes: state.shapes,
    parts: state.parts.map(serializePart), // v4.6: 위치/회전/크기 포함
    partIdCounter: state.partIdCounter
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Catia3D_${new Date().toISOString().slice(0,10)}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('💾 저장 완료');
}

function loadProject(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    try{
      const data = JSON.parse(ev.target.result);
      state.parts.forEach(p => removePartFromScene(p));
      state.parts = [];
      state.shapes = data.shapes || [];
      state.partIdCounter = data.partIdCounter || 1;
      (data.parts || []).forEach(pdata => {
        const part = deserializePart(pdata); // v4.6: 타입별 복원 + 변형 적용 통합
        if(part && part.mesh){
          state.parts.push(part);
          addPartToScene(part);
        }
      });
      renderPartsList();
      redrawSketch();
      updateInfo();
      toast('📂 불러오기 완료');
    } catch(err){
      toast('❌ 파일 오류: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function rebuildExtrude(pdata){
  const meshes = [];
  (pdata.sourceShapes || []).forEach(s=>{
    const shape = shapeToThreeShape(s);
    if(!shape) return;
    const geom = new THREE.ExtrudeGeometry(shape, {depth: pdata.params.height, bevelEnabled: false, curveSegments: 24});
    if(pdata.params.dir === 'down') geom.translate(0, 0, -pdata.params.height);
    else if(pdata.params.dir === 'both') geom.translate(0, 0, -pdata.params.height/2);
    const mat = makeMaterial(pdata.color, pdata.opacity);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    meshes.push(mesh);
  });
  if(meshes.length === 0) return null;
  const group = new THREE.Group();
  meshes.forEach(m => group.add(m));
  group.visible = pdata.visible;
  return {...pdata, mesh: group};
}

function rebuildRevolve(pdata){
  const points = [];
  (pdata.sourceShapes || []).forEach(s=>{
    if(s.type === 'line'){
      points.push({x: s.x1, y: s.y1});
      points.push({x: s.x2, y: s.y2});
    } else if(s.type === 'arc'){
      const steps = 16;
      let a1 = s.startAngle, a2 = s.endAngle;
      if(a2 < a1) a2 += Math.PI*2;
      for(let i=0; i<=steps; i++){
        const t = a1 + (a2-a1) * i/steps;
        points.push({x: s.cx + s.r*Math.cos(t), y: s.cy + s.r*Math.sin(t)});
      }
    } else if(s.type === 'rect'){
      points.push({x: s.x1, y: s.y1});
      points.push({x: s.x2, y: s.y1});
      points.push({x: s.x2, y: s.y2});
      points.push({x: s.x1, y: s.y2});
    }
  });
  if(points.length < 2) return null;
  const axisOffset = pdata.params.axisOffset || 0;
  const axisMode = pdata.params.axisMode || 'auto';
  let lathePts;
  if(pdata.params.axis === 'z'){
    // v4.8: Z축 회전 - 우측면(maxX) 기준
    const xs = points.map(p=>p.x);
    const maxX = Math.max(...xs);
    lathePts = points.map(p => new THREE.Vector2(Math.max(0, (maxX - p.x) + axisOffset), p.y));
  } else if(pdata.params.axis === 'y'){
    const xs = points.map(p=>p.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    let baseShift = 0;
    if(axisMode === 'near'){
      const minAbsX = Math.min(Math.abs(minX), Math.abs(maxX), minX <= 0 && maxX >= 0 ? 0 : Infinity);
      baseShift = axisOffset - minAbsX;
    } else if(axisMode === 'far'){
      const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX));
      baseShift = axisOffset - maxAbsX;
    } else {
      baseShift = axisOffset;
    }
    lathePts = points.map(p => new THREE.Vector2(Math.max(0, Math.abs(p.x) + baseShift), p.y));
  } else {
    const ys = points.map(p=>p.y);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    let baseShift = 0;
    if(axisMode === 'near'){
      const minAbsY = Math.min(Math.abs(minY), Math.abs(maxY), minY <= 0 && maxY >= 0 ? 0 : Infinity);
      baseShift = axisOffset - minAbsY;
    } else if(axisMode === 'far'){
      const maxAbsY = Math.max(Math.abs(minY), Math.abs(maxY));
      baseShift = axisOffset - maxAbsY;
    } else {
      baseShift = axisOffset;
    }
    lathePts = points.map(p => new THREE.Vector2(Math.max(0, Math.abs(p.y) + baseShift), p.x));
  }
  lathePts.sort((a,b)=>a.y - b.y);
  const angleRad = pdata.params.angle * Math.PI / 180;
  const geom = new THREE.LatheGeometry(lathePts, pdata.params.seg, 0, angleRad);
  const mat = makeMaterial(pdata.color, pdata.opacity);
  const mesh = new THREE.Mesh(geom, mat);
  if(pdata.params.axis === 'x') mesh.rotation.z = -Math.PI / 2;
  else if(pdata.params.axis === 'z') mesh.rotation.x = -Math.PI / 2; // v4.8
  mesh.visible = pdata.visible;
  return {...pdata, mesh};
}

function rebuildPrimitive(pdata){
  const kind = pdata.type.replace('primitive_', '');
  let geom;
  const p = pdata.params || {};
  // v6.3: 팔레트로 추가한 도형은 동일 geometry로 재생성 (undo 후 크기 1 버그 방지)
  if(p.palette){
    const made = makePaletteGeometry(p.palette);
    if(made) geom = made.geom;
  }
  if(!geom && PRIM_INFO[kind] && (p.w !== undefined || p.r !== undefined || p.R !== undefined || p.rOut !== undefined)){
    geom = createGeometryForKind(kind, p);
  }
  if(!geom){
    // 안전 기본값 (params에 치수가 전혀 없을 때 — 1 크기 박스 방지)
    if(kind === 'box') geom = new THREE.BoxGeometry(30, 30, 30);
    else if(kind === 'cylinder') geom = new THREE.CylinderGeometry(15, 15, 30, 32);
    else if(kind === 'sphere') geom = new THREE.SphereGeometry(15, 32, 24);
    else if(kind === 'cone') geom = new THREE.ConeGeometry(15, 30, 32);
    else if(kind === 'torus'){ geom = new THREE.TorusGeometry(20, 5, 16, 48); geom.rotateX(Math.PI/2); }
    else if(kind === 'pyramid'){ geom = new THREE.ConeGeometry(20, 30, 4); geom.rotateY(Math.PI/4); }
    else if(kind === 'plane') geom = new THREE.BoxGeometry(50, 1, 50);
    else if(kind === 'hexprism') geom = new THREE.CylinderGeometry(15, 15, 30, 6);
    else if(kind === 'wedge') geom = makeWedgeGeometry(30, 30, 30);
    else geom = new THREE.BoxGeometry(30, 30, 30);
  }
  if(!geom) return null;
  const mat = makeMaterial(pdata.color, pdata.opacity);
  const mesh = new THREE.Mesh(geom, mat);
  if(p.posX !== undefined) mesh.position.set(p.posX || 0, p.posY || 0, p.posZ || 0);
  mesh.visible = pdata.visible;
  return {...pdata, mesh};
}

function rebuildText3D(pdata){
  const {content, size, depth, posX, posY, posZ} = pdata.params;
  const cw = 256, ch = 128;
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = pdata.color;
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = '#000';
  ctx.font = 'bold 80px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(content, cw/2, ch/2);
  const texture = new THREE.CanvasTexture(canvas);
  const ratio = content.length > 2 ? content.length * 0.5 : 1.5;
  const w = size * ratio, h = size;
  const geom = new THREE.BoxGeometry(w, h, depth);
  const materials = [
    makeMaterial(pdata.color, pdata.opacity), makeMaterial(pdata.color, pdata.opacity),
    makeMaterial(pdata.color, pdata.opacity), makeMaterial(pdata.color, pdata.opacity),
    new THREE.MeshStandardMaterial({map: texture, color: 0xffffff, roughness: 0.5, metalness: 0.1}),
    makeMaterial(pdata.color, pdata.opacity)
  ];
  const mesh = new THREE.Mesh(geom, materials);
  mesh.position.set(posX || 0, posY || 0, posZ || 0);
  mesh.visible = pdata.visible;
  return {...pdata, mesh};
}

function rebuildBolt(pdata){
  const {shankD, shankL, headD, headH, headType} = pdata.params;
  // v8.52: 저장 데이터에 나사산 정보 (없으면 'none')
  const threadMode = pdata.params.threadMode || 'none';
  const customPitch = pdata.params.customPitch || 1.0;
  const tolerance = pdata.params.tolerance || 0;
  // v8.53: 캡 키 사이즈 (없으면 shankD * 0.6 폴백)
  const keyD = (pdata.params.keyD !== undefined) ? pdata.params.keyD : (shankD * 0.6);
  const group = new THREE.Group();
  const mat = makeMaterial(pdata.color, pdata.opacity);
  // 머리
  if(headType === 'cap'){
    // v8.53: 캡스크류 — 진짜 육각 렌치 구멍
    const capHead = buildCapHead(headD, headH, keyD, tolerance, mat);
    group.add(capHead);
  } else {
    let headGeom;
    if(headType === 'hex') headGeom = new THREE.CylinderGeometry(headD/2, headD/2, headH, 6);
    else if(headType === 'round'){
      const dome = new THREE.SphereGeometry(headD/2, 32, 16, 0, Math.PI*2, 0, Math.PI/2);
      const domeMesh = new THREE.Mesh(dome, mat);
      domeMesh.position.y = headH/2;
      group.add(domeMesh);
      headGeom = new THREE.CylinderGeometry(headD/2, headD/2, headH, 32);
    }
    const headMesh = new THREE.Mesh(headGeom, mat);
    headMesh.position.y = headH/2;
    group.add(headMesh);
  }
  // v8.52: 나사부
  let shankCoreR, threadMesh = null;
  if(threadMode === 'none'){
    shankCoreR = (shankD - tolerance) / 2;
  } else {
    const P = (threadMode === 'iso') ? isoPitchFor(shankD) : customPitch;
    shankCoreR = (shankD - 1.0825 * P) / 2;
    const shankOuterR = (shankD - tolerance) / 2;
    threadMesh = createThreadMesh(shankCoreR, shankOuterR, shankL, P, mat, true, 24);
  }
  // v8.78: 머리 속으로 파묻어 연결부 동일평면 충돌 제거
  const headOverlap = headH * 0.25;
  const coreLen = shankL + headOverlap;
  const shankGeom = new THREE.CylinderGeometry(shankCoreR, shankCoreR, coreLen, 32);
  const shankMesh = new THREE.Mesh(shankGeom, mat);
  shankMesh.position.y = (headOverlap - shankL) / 2;
  group.add(shankMesh);
  if(threadMesh){
    threadMesh.position.y = -shankL/2;
    group.add(threadMesh);
  }
  group.visible = pdata.visible;
  return {...pdata, mesh: group};
}

function rebuildNut(pdata){
  const {holeD, outerD, height} = pdata.params;
  // v8.52: 저장 데이터에 나사산 정보
  const threadMode = pdata.params.threadMode || 'none';
  const customPitch = pdata.params.customPitch || 1.0;
  const tolerance = pdata.params.tolerance || 0;
  const outerR = outerD / 2;
  let bore, nutThreadOuter, nutThreadRoot, pitch = 0;
  if(threadMode === 'none'){
    bore = holeD / 2;
  } else {
    pitch = (threadMode === 'iso') ? isoPitchFor(holeD) : customPitch;
    bore = (holeD + tolerance) / 2;
    nutThreadRoot = bore;
    nutThreadOuter = (holeD - 1.0825 * pitch + tolerance * 0.5) / 2;
  }
  const holeR = bore;
  const hexShape = new THREE.Shape();
  for(let i = 0; i < 6; i++){
    const a = i * Math.PI / 3 + Math.PI/6;
    const x = outerR * Math.cos(a), y = outerR * Math.sin(a);
    if(i === 0) hexShape.moveTo(x, y);
    else hexShape.lineTo(x, y);
  }
  hexShape.closePath();
  const holePath = new THREE.Path();
  holePath.absarc(0, 0, holeR, 0, Math.PI*2, false);
  hexShape.holes.push(holePath);
  const geom = new THREE.ExtrudeGeometry(hexShape, {depth: height, bevelEnabled: false, curveSegments: 32});
  geom.rotateX(-Math.PI/2);
  geom.translate(0, -height/2, 0); // v8.67: 원점 중심 정렬
  const mat = makeMaterial(pdata.color, pdata.opacity);
  const body = new THREE.Mesh(geom, mat);
  const group = new THREE.Group();
  group.add(body);
  if(threadMode !== 'none' && pitch > 0){
    // v8.67: 본체보다 1피치 짧게 + 원점 중심 → 나사산이 본체 밖으로 안 나감
    const tLen = Math.max(pitch, height - pitch);
    const nutThread = createThreadMesh(nutThreadRoot, nutThreadOuter, tLen, pitch, mat, true, 24);
    if(nutThread){
      nutThread.position.y = 0;
      group.add(nutThread);
    }
  }
  group.visible = pdata.visible;
  return {...pdata, mesh: group};
}

function rebuildSpring(pdata){
  const {coilD, wireD, length, turns, seg} = pdata.params;
  const coilR = coilD / 2;
  const totalSeg = Math.max(16, Math.round(turns * seg));
  class HelixCurve extends THREE.Curve {
    constructor(R, L, T){super(); this.R=R; this.L=L; this.T=T;}
    getPoint(t, target){
      target = target || new THREE.Vector3();
      const angle = t * this.T * Math.PI * 2;
      return target.set(this.R*Math.cos(angle), t*this.L - this.L/2, this.R*Math.sin(angle));
    }
  }
  const curve = new HelixCurve(coilR, length, turns);
  const geom = new THREE.TubeGeometry(curve, totalSeg, wireD/2, 12, false);
  const mat = makeMaterial(pdata.color, pdata.opacity);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.visible = pdata.visible;
  return {...pdata, mesh};
}

// v7.1.4: STL 출력 정비 — 삼각형 배열을 받아 정점 병합(weld) + 중복/퇴화 삼각형 제거
//   tris: [[Vector3,Vector3,Vector3], ...] (월드 좌표)
//   반환: {tris: 정리된 삼각형, stats: {welded, removed, boundary, nonManifold}}
function cleanTrianglesForSTL(tris){
  const QUANT = 1000; // 0.001mm 격자로 양자화해 같은 위치 정점 병합
  const keyOf = v => Math.round(v.x*QUANT)+'_'+Math.round(v.y*QUANT)+'_'+Math.round(v.z*QUANT);
  const vmap = new Map(); const verts = [];
  const vid = v => { const k=keyOf(v); let id=vmap.get(k); if(id===undefined){ id=verts.length; verts.push(v.clone()); vmap.set(k,id); } return id; };
  const triKeys = new Set();
  const outTris = [];
  let removed = 0;
  tris.forEach(t=>{
    const a=vid(t[0]), b=vid(t[1]), c=vid(t[2]);
    if(a===b || b===c || a===c){ removed++; return; } // 퇴화(면적0)
    const sorted=[a,b,c].slice().sort((x,y)=>x-y).join('_');
    if(triKeys.has(sorted)){ removed++; return; }     // 중복(양면 등)
    triKeys.add(sorted);
    outTris.push([verts[a], verts[b], verts[c]]);
  });
  // watertight 검사 (엣지가 정확히 2면 공유?)
  const edge = {};
  outTris.forEach(t=>{
    const ids=[vid(t[0]),vid(t[1]),vid(t[2])];
    for(let e=0;e<3;e++){ const a=ids[e],b=ids[(e+1)%3]; const k=a<b?a+'_'+b:b+'_'+a; edge[k]=(edge[k]||0)+1; }
  });
  let boundary=0, nonManifold=0;
  Object.values(edge).forEach(c=>{ if(c===1) boundary++; else if(c>2) nonManifold++; });
  // v8.79: 연결요소별 와인딩 일관화 + 외향(signed-volume) 보정 → Tinkercad 안정 임포트
  const oriented = orientTrianglesByComponent(outTris, vid, verts.length);
  return {tris: oriented, stats: {removed, boundary, nonManifold, vertexCount: verts.length}};
}

// v8.79: 삼각형 묶음을 연결요소별로 와인딩 일관화 + 컴포넌트별 외향 보정
//   tris: [[V,V,V]...], vidFn: 정점→정수ID, vcount: 정점 수
function orientTrianglesByComponent(tris, vidFn, vcount){
  const F = tris.length;
  if(F === 0) return tris;
  const ids = tris.map(t => [vidFn(t[0]), vidFn(t[1]), vidFn(t[2])]);
  const ekey = (a,b) => a<b ? a+'_'+b : b+'_'+a;
  const emap = new Map();   // edge -> [faceIdx...]
  ids.forEach((t,f)=>{ for(let e=0;e<3;e++){ const k=ekey(t[e],t[(e+1)%3]); if(!emap.has(k)) emap.set(k,[]); emap.get(k).push(f); } });
  const comp = new Array(F).fill(-1);
  const flip = new Array(F).fill(false);
  const dirOf = (f,a,b)=>{ const t=ids[f]; for(let e=0;e<3;e++){ if(t[e]===a&&t[(e+1)%3]===b) return 1; if(t[e]===b&&t[(e+1)%3]===a) return -1; } return 0; };
  let nc = 0;
  for(let s=0;s<F;s++){
    if(comp[s] !== -1) continue;
    comp[s] = nc; const stack=[s];
    while(stack.length){
      const f = stack.pop(); const tf = ids[f];
      for(let e=0;e<3;e++){
        const a=tf[e], b=tf[(e+1)%3]; const nbrs = emap.get(ekey(a,b));
        if(!nbrs) continue;
        nbrs.forEach(g=>{
          if(g===f || comp[g] !== -1) return;
          const fdir = dirOf(f,a,b)*(flip[f]?-1:1);
          const gdir = dirOf(g,a,b);
          flip[g] = (fdir === gdir) ? !flip[g] : flip[g];
          comp[g] = nc; stack.push(g);
        });
      }
    }
    nc++;
  }
  // 컴포넌트별 signed volume → 음수면 그 컴포넌트 전체 뒤집기
  const vol = new Array(nc).fill(0);
  for(let f=0;f<F;f++){
    const t = tris[f];
    const A = flip[f] ? [t[0],t[2],t[1]] : t;  // 적용된 와인딩 기준
    const [a,b,c] = A;
    vol[comp[f]] += (a.x*(b.y*c.z-b.z*c.y) - a.y*(b.x*c.z-b.z*c.x) + a.z*(b.x*c.y-b.y*c.x));
  }
  const out = [];
  for(let f=0;f<F;f++){
    let t = tris[f];
    let fl = flip[f];
    if(vol[comp[f]] < 0) fl = !fl;       // 컴포넌트 외향 보정
    out.push(fl ? [t[0], t[2], t[1]] : [t[0], t[1], t[2]]);
  }
  return out;
}



function exportSTL(){
  if(state.parts.length === 0){toast('내보낼 부품이 없습니다'); return}
  // v7.1.4: 선택된 부품만 내보내기 (다중 선택 우선, 없으면 단일 선택)
  let targets = state.parts.filter(p => p._selected);
  if(targets.length === 0 && state.selectedPartId){
    const sp = state.parts.find(p => p.id === state.selectedPartId);
    if(sp) targets = [sp];
  }
  if(targets.length === 0){ toast('내보낼 부품을 먼저 선택하세요'); return; }
  const triangles = [];
  targets.forEach(p=>{
    if(!p.mesh) return;
    p.mesh.updateMatrixWorld(true);
    p.mesh.traverse(o=>{
      if(o.isMesh && !o.userData._isEdgeOutline){
        const geom = o.geometry;
        const matrix = o.matrixWorld;
        const pos = geom.attributes.position;
        const idx = geom.index;
        const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
        if(idx){
          for(let i=0; i<idx.count; i+=3){
            v0.fromBufferAttribute(pos, idx.getX(i)).applyMatrix4(matrix);
            v1.fromBufferAttribute(pos, idx.getX(i+1)).applyMatrix4(matrix);
            v2.fromBufferAttribute(pos, idx.getX(i+2)).applyMatrix4(matrix);
            triangles.push([v0.clone(), v1.clone(), v2.clone()]);
          }
        } else {
          for(let i=0; i<pos.count; i+=3){
            v0.fromBufferAttribute(pos, i).applyMatrix4(matrix);
            v1.fromBufferAttribute(pos, i+1).applyMatrix4(matrix);
            v2.fromBufferAttribute(pos, i+2).applyMatrix4(matrix);
            triangles.push([v0.clone(), v1.clone(), v2.clone()]);
          }
        }
      }
    });
  });
  
  // v7.1.4: 정점 병합 + 중복/퇴화 제거 + watertight 검사
  const cleaned = cleanTrianglesForSTL(triangles);
  let useTris = cleaned.tris;
  const st = cleaned.stats;

  // v8.91: 외부 add-on이 STL 스무딩 훅을 정의했으면 적용 (서브디비전 등)
  if(typeof window.STL_SMOOTH_HOOK === 'function'){
    try {
      const smoothed = window.STL_SMOOTH_HOOK(useTris);
      if(Array.isArray(smoothed) && smoothed.length > 0) useTris = smoothed;
    } catch(err){ console.error('STL smooth hook 오류:', err); }
  }

  // v8.82: 바이너리 STL — ASCII 대비 약 1/5 용량 (Tinkercad 임포트 안정)
  const triCount = useTris.length;
  const buf = new ArrayBuffer(84 + triCount*50);
  const dv = new DataView(buf);
  // 80바이트 헤더 (ASCII 코멘트)
  const header = 'Catia3D binary STL';
  for(let i=0;i<80;i++) dv.setUint8(i, i<header.length ? header.charCodeAt(i) : 0);
  dv.setUint32(80, triCount, true);
  let off = 84;
  const e1=new THREE.Vector3(), e2=new THREE.Vector3(), nv=new THREE.Vector3();
  useTris.forEach(t=>{
    e1.subVectors(t[1],t[0]); e2.subVectors(t[2],t[0]); nv.crossVectors(e1,e2).normalize();
    dv.setFloat32(off, nv.x, true); dv.setFloat32(off+4, nv.y, true); dv.setFloat32(off+8, nv.z, true); off+=12;
    for(let k=0;k<3;k++){ const v=t[k]; dv.setFloat32(off, v.x, true); dv.setFloat32(off+4, v.y, true); dv.setFloat32(off+8, v.z, true); off+=12; }
    dv.setUint16(off, 0, true); off+=2;
  });

  const defaultName = 'Catia3D_' + new Date().toISOString().slice(0,10).replace(/-/g,'');
  const inputName = prompt('STL 파일명을 입력하세요 (.stl 자동 추가)', defaultName);
  if(inputName === null) return;
  const fileName = (inputName.trim() || defaultName).replace(/\.stl$/i,'') + '.stl';
  const blob = new Blob([buf], {type: 'application/octet-stream'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);

  // 출력 적합성 안내
  const issues = st.boundary + st.nonManifold;
  const pfx = '(' + targets.length + '개 부품) ';
  if(issues === 0){
    toast('✅ STL 완료 ' + pfx + '— watertight (출력 가능) · ' + useTris.length + '면');
  } else {
    toast('⚠️ STL 완료 ' + pfx + '— 비밀폐: 열린모서리 ' + st.boundary + ', 비매니폴드 ' + st.nonManifold + ' (슬라이서 자동수정 필요할 수 있음)');
  }
}

function exportImage(){
  if(state.mode === 'model' && renderer){
    renderer.render(scene, camera);
    const dataURL = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `Catia3D_3D_${Date.now()}.png`;
    a.click();
    toast('🖼️ 3D 이미지 저장됨');
    return;
  }
  // 스케치 모드: v9.7 — 채움(fill) 객체가 있으면 '채움만' 투명 배경 PNG로 저장
  const fills = state.shapes.filter(s => s.type === 'fill' && s.vertices && s.vertices.length >= 3);
  if(fills.length > 0){
    // 채움들의 월드 바운딩박스
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    fills.forEach(f => f.vertices.forEach(v => {
      if(v.x<minX)minX=v.x; if(v.x>maxX)maxX=v.x;
      if(v.y<minY)minY=v.y; if(v.y>maxY)maxY=v.y;
    }));
    const padMm = 2;
    minX-=padMm; minY-=padMm; maxX+=padMm; maxY+=padMm;
    const wMm = maxX-minX, hMm = maxY-minY;
    // 해상도: 10px/mm (고해상)
    const ppm = 10;
    const W = Math.max(1, Math.round(wMm*ppm));
    const H = Math.max(1, Math.round(hMm*ppm));
    const c = document.createElement('canvas'); c.width=W; c.height=H;
    const ctx = c.getContext('2d'); // 기본 투명 배경 (배경색 칠 안 함)
    // 월드 → 이 캔버스 픽셀 (Y 반전)
    const w2p = (x,y) => ({ x:(x-minX)*ppm, y:(maxY-y)*ppm });
    fills.forEach(f => {
      ctx.beginPath();
      f.vertices.forEach((v,i)=>{ const p=w2p(v.x,v.y); if(i===0)ctx.moveTo(p.x,p.y); else ctx.lineTo(p.x,p.y); });
      ctx.closePath();
      ctx.fillStyle = f.color || '#cccccc';
      ctx.fill();
    });
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `Catia3D_Fill_${Date.now()}.png`;
    a.click();
    toast('🖼️ 채움만 투명 PNG 저장됨 (' + fills.length + '개, ' + wMm.toFixed(1) + '×' + hMm.toFixed(1) + 'mm)');
    return;
  }
  // 채움이 없으면 기존: 캔버스 전체 저장
  const dataURL = skCanvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = `Catia3D_Sketch_${Date.now()}.png`;
  a.click();
  toast('🖼️ 스케치 이미지 저장됨');
}

function updateInfo(){
  document.getElementById('shapeCount').textContent = state.shapes.length;
  document.getElementById('selCount').textContent = state.selectedShapes.size;
  document.getElementById('partCount').textContent = state.parts.length;
  document.getElementById('visCount').textContent = state.parts.filter(p=>p.visible).length;
  document.getElementById('footParts').textContent = state.parts.length;
}

function setStat(msg){document.getElementById('statText').textContent = msg}

// v2.0: 회전 각도 실시간 HUD
function showRotHud(axis, currentRad, deltaRad, snapped){
  const hud = document.getElementById('rotHud');
  if(!hud) return;
  // v3.9: 드래그 중에는 입력 모드 끄기 + 활성 축 기록
  const inp = document.getElementById('rotHudInput');
  const angSpan = document.getElementById('rotHudAngle');
  if(inp) inp.style.display = 'none';
  if(angSpan) angSpan.style.display = '';
  hud.classList.remove('clickable'); // v4.0: 드래그 중엔 클릭 통과
  _rotHudActiveAxis = axis;
  _hudMode = 'rotate'; // v8.64
  if(_rotHudPersistTimer){ clearTimeout(_rotHudPersistTimer); _rotHudPersistTimer = null; }
  const axisName = {x:'X축', y:'Y축', z:'Z축'}[axis] || axis;
  const axisColor = {x:'#ff6666', y:'#66ff66', z:'#66aaff'}[axis] || '#f39c12';
  const deg = currentRad * 180 / Math.PI;
  const dDeg = deltaRad * 180 / Math.PI;
  document.getElementById('rotHudAxis').textContent = axisName;
  document.getElementById('rotHudAxis').style.color = axisColor;
  document.getElementById('rotHudAngle').textContent = deg.toFixed(1) + '°';
  document.getElementById('rotHudAngle').style.color = axisColor;
  document.getElementById('rotHudDelta').textContent =
    'Δ ' + (dDeg >= 0 ? '+' : '') + dDeg.toFixed(1) + '°' + (snapped ? '  [SNAP 15°]' : '  (Shift=15°스냅)');
  hud.style.borderColor = axisColor;
  hud.classList.add('show');
  // footer 상태바에도 표시
  setStat('🔄 ' + axisName + ' 회전: ' + deg.toFixed(1) + '°  (Δ ' + (dDeg >= 0 ? '+' : '') + dDeg.toFixed(1) + '°)' + (snapped ? '  [15° 스냅]' : ''));
}
function hideRotHud(){
  const hud = document.getElementById('rotHud');
  if(hud){ hud.classList.remove('show'); hud.classList.remove('clickable'); }
  // 입력창은 항상 숨김 상태로 복귀
  const inp = document.getElementById('rotHudInput');
  const angSpan = document.getElementById('rotHudAngle');
  if(inp) inp.style.display = 'none';
  if(angSpan) angSpan.style.display = '';
}

// v3.9: 회전 종료 후에도 HUD를 유지하여 클릭으로 직접 입력 가능
//   _rotHudAxis는 마지막에 변경된 축 기억 → 클릭 시 입력값을 이 축에 적용
let _rotHudPersistTimer = null;
let _rotHudActiveAxis = 'y';
// v8.64: HUD를 회전/크기/위치 3종 모드로 공용 사용
let _hudMode = 'rotate';      // 'rotate' | 'scale' | 'move'
let _hudUnitAxis = 'y';       // scale/move 시 대상 축 ('x'|'y'|'z'|'XYZ')
function rotHudPersist(axis, currentRad){
  _rotHudActiveAxis = axis;
  _hudMode = 'rotate'; // v8.64
  const hud = document.getElementById('rotHud');
  if(!hud) return;
  hud.classList.add('show');
  hud.classList.add('clickable'); // v4.0: 클릭 받도록
  document.getElementById('rotHudDelta').textContent = '✏️ 여기 클릭 = 직접 입력  /  ESC = 닫기';
  if(_rotHudPersistTimer) clearTimeout(_rotHudPersistTimer);
  // 8초 후 자동 숨김
  _rotHudPersistTimer = setTimeout(() => {
    hideRotHud();
    _rotHudPersistTimer = null;
  }, 8000);
}

function onRotHudClick(event){
  // HUD 본체 클릭 시 입력 모드로 전환
  // (단, 입력창 자체를 클릭한 거면 무시)
  if(event && event.target && event.target.id === 'rotHudInput') return;
  if(_rotHudPersistTimer){ clearTimeout(_rotHudPersistTimer); _rotHudPersistTimer = null; }
  const angSpan = document.getElementById('rotHudAngle');
  const inp = document.getElementById('rotHudInput');
  if(!angSpan || !inp) return;
  inp.value = '';
  // v8.64: 모드별 현재값 프리필
  const id = state.selectedPartId;
  const p = state.parts.find(x => x.id === id);
  if(_hudMode === 'rotate'){
    let curDeg = 0;
    if(p && p.mesh) curDeg = getAbsRot(p)[_rotHudActiveAxis];
    inp.value = curDeg.toFixed(1);
  } else if(p && p.mesh){
    if(_hudMode === 'scale'){
      const sz = getLocalSize(p);
      const axc = (_hudUnitAxis === 'XYZ') ? 'x' : _hudUnitAxis;
      inp.value = sz[axc].toFixed(1);
    } else if(_hudMode === 'move'){
      inp.value = p.mesh.position[_hudUnitAxis].toFixed(1);
    }
  }
  angSpan.style.display = 'none';
  inp.style.display = '';
  setTimeout(() => { inp.focus(); inp.select(); }, 0);
}

function onRotHudInputKey(e){
  if(e.key === 'Enter'){
    e.preventDefault();
    applyRotHudInput();
  } else if(e.key === 'Escape'){
    e.preventDefault();
    // 입력 취소
    const inp = document.getElementById('rotHudInput');
    const angSpan = document.getElementById('rotHudAngle');
    if(inp) inp.style.display = 'none';
    if(angSpan) angSpan.style.display = '';
    hideRotHud();
  }
}

function applyRotHudInput(){
  const inp = document.getElementById('rotHudInput');
  const angSpan = document.getElementById('rotHudAngle');
  if(!inp || !angSpan) return;
  const v = parseFloat(inp.value);
  if(isNaN(v)){
    inp.style.display = 'none';
    angSpan.style.display = '';
    return;
  }
  const id = state.selectedPartId;
  const p = state.parts.find(x => x.id === id);
  if(p && p.mesh){
    if(_hudMode === 'rotate'){
      getAbsRot(p)[_rotHudActiveAxis] = v;
      applyAbsRot(p);
      angSpan.textContent = v.toFixed(1) + '°';
      toast('↻ ' + _rotHudActiveAxis.toUpperCase() + '축(절대) = ' + v.toFixed(1) + '°');
      setStat('회전 직접 입력(절대): ' + _rotHudActiveAxis.toUpperCase() + '축 ' + v.toFixed(1) + '°');
    } else if(_hudMode === 'scale'){
      // 절대 크기(mm) 설정 — 로컬 치수 기준 (회전 무관)
      const tgt = Math.max(0.5, v);
      const lsz = getLocalSize(p);
      if(_hudUnitAxis === 'XYZ'){
        const f = tgt / Math.max(0.001, lsz.x);
        p.mesh.scale.multiplyScalar(f);
      } else {
        const axc = _hudUnitAxis;
        const f = tgt / Math.max(0.001, lsz[axc]);
        p.mesh.scale[axc] *= f;
      }
      angSpan.textContent = tgt.toFixed(1) + ' mm';
      toast('📐 ' + _hudUnitAxis.toUpperCase() + ' 크기 = ' + tgt.toFixed(1) + ' mm');
      setStat('크기 직접 입력: ' + _hudUnitAxis.toUpperCase() + ' ' + tgt.toFixed(1) + ' mm');
    } else if(_hudMode === 'move'){
      // 절대 위치(mm) 설정
      p.mesh.position[_hudUnitAxis] = v;
      angSpan.textContent = v.toFixed(1) + ' mm';
      toast('📍 ' + _hudUnitAxis.toUpperCase() + ' 위치 = ' + v.toFixed(1) + ' mm');
      setStat('위치 직접 입력: ' + _hudUnitAxis.toUpperCase() + ' ' + v.toFixed(1) + ' mm');
    }
    syncRotPropPanel(p);
    if(transformState.activePart === p) showTransformHandles(p);
    updateDimLabels();
    refreshPropPanelTransform(p);
  }
  inp.style.display = 'none';
  angSpan.style.display = '';
  // 입력 후 3초 후 자동 숨김
  if(_rotHudPersistTimer) clearTimeout(_rotHudPersistTimer);
  _rotHudPersistTimer = setTimeout(() => {
    hideRotHud();
    _rotHudPersistTimer = null;
  }, 3000);
}

// v2.5: 크기 변경 HUD - 회전 HUD와 동일 위치/스타일 (rotHud 요소 재활용)
function showScaleHud(axisChar, currentMM, deltaMM, snapped){
  const hud = document.getElementById('rotHud');
  if(!hud) return;
  _hudMode = 'scale';      // v8.64
  _hudUnitAxis = axisChar; // v8.64
  // v4.0: 크기 HUD는 드래그 중엔 클릭 입력 대상 아님 → clickable 제거, 입력창 숨김
  hud.classList.remove('clickable');
  const _inp = document.getElementById('rotHudInput');
  const _ang = document.getElementById('rotHudAngle');
  if(_inp) _inp.style.display = 'none';
  if(_ang) _ang.style.display = '';
  const axisName = {x:'X 너비', y:'Y 높이', z:'Z 깊이', XYZ:'비례 크기'}[axisChar] || axisChar;
  const axisColor = {x:'#ff8888', y:'#88ff88', z:'#88aaff', XYZ:'#ffffff'}[axisChar] || '#f39c12';
  document.getElementById('rotHudAxis').textContent = '📐 ' + axisName;
  document.getElementById('rotHudAxis').style.color = axisColor;
  document.getElementById('rotHudAngle').textContent = currentMM.toFixed(1) + ' mm';
  document.getElementById('rotHudAngle').style.color = axisColor;
  document.getElementById('rotHudDelta').textContent =
    'Δ ' + (deltaMM >= 0 ? '+' : '') + deltaMM.toFixed(1) + ' mm' + (snapped ? '  [SNAP 1mm]' : '  (Shift=1mm스냅)');
  hud.style.borderColor = axisColor;
  hud.classList.add('show');
  setStat('📐 ' + axisName + ': ' + currentMM.toFixed(1) + ' mm  (Δ ' + (deltaMM >= 0 ? '+' : '') + deltaMM.toFixed(1) + ' mm)' + (snapped ? '  [1mm 스냅]' : ''));
}
function hideScaleHud(){
  const hud = document.getElementById('rotHud');
  if(hud){ hud.classList.remove('show'); hud.classList.remove('clickable'); }
}

// v8.64: 위치(이동) 실시간 HUD - rotHud 요소 재활용
function showMoveHud(axisChar, currentMM, deltaMM, snapped){
  const hud = document.getElementById('rotHud');
  if(!hud) return;
  _hudMode = 'move';
  _hudUnitAxis = axisChar;
  hud.classList.remove('clickable');
  const _inp = document.getElementById('rotHudInput');
  const _ang = document.getElementById('rotHudAngle');
  if(_inp) _inp.style.display = 'none';
  if(_ang) _ang.style.display = '';
  const axisName = {x:'X 위치(좌우)', y:'높이(상하)', z:'Z 위치(앞뒤)'}[axisChar] || axisChar;
  const axisColor = {x:'#ff8888', y:'#88aaff', z:'#88ff88'}[axisChar] || '#f39c12';
  document.getElementById('rotHudAxis').textContent = '📍 ' + axisName;
  document.getElementById('rotHudAxis').style.color = axisColor;
  document.getElementById('rotHudAngle').textContent = currentMM.toFixed(1) + ' mm';
  document.getElementById('rotHudAngle').style.color = axisColor;
  document.getElementById('rotHudDelta').textContent =
    'Δ ' + (deltaMM >= 0 ? '+' : '') + deltaMM.toFixed(1) + ' mm' + (snapped ? '  [SNAP]' : '');
  hud.style.borderColor = axisColor;
  hud.classList.add('show');
  setStat('📍 ' + axisName + ': ' + currentMM.toFixed(1) + ' mm  (Δ ' + (deltaMM >= 0 ? '+' : '') + deltaMM.toFixed(1) + ' mm)');
}

// v8.64: 크기/위치 드래그 종료 후 HUD를 클릭 가능 상태로 유지 → 직접 입력
function unitHudPersist(mode, axisChar, curMM){
  _hudMode = mode;
  _hudUnitAxis = axisChar;
  const hud = document.getElementById('rotHud');
  if(!hud) return;
  document.getElementById('rotHudAngle').textContent = curMM.toFixed(1) + ' mm';
  document.getElementById('rotHudDelta').textContent = '✏️ 여기 클릭 = 직접 입력  /  ESC = 닫기';
  hud.classList.add('show');
  hud.classList.add('clickable');
  if(_rotHudPersistTimer) clearTimeout(_rotHudPersistTimer);
  _rotHudPersistTimer = setTimeout(() => { hideScaleHud(); _rotHudPersistTimer = null; }, 8000);
}
// 속성 패널 회전값 동기화 (드래그 중에도)
function syncRotPropPanel(part){
  // v3.3: 회전뿐 아니라 위치/크기 정보까지 모두 갱신
  refreshPropPanelTransform(part);
}

// v3.3: 선택 부품의 위치·크기·회전 입력값을 현재 상태로 갱신
// v8.56: CAD 표준(Z-up) 컨벤션 — 표시는 Z-up이지만 내부 Three.js는 Y-up 유지
//   화면 Y 입력 ↔ mesh.position.z (깊이)
//   화면 Z 입력 ↔ mesh.position.y (높이) ← 사용자가 보는 "위쪽"
function refreshPropPanelTransform(part){
  if(!part || !part.mesh) return;
  if(state.selectedPartId !== part.id) return;
  // 회전 (절대 월드축 각도) — Y/Z swap 표시
  const rx = document.getElementById('psRotX');
  const ry = document.getElementById('psRotY');
  const rz = document.getElementById('psRotZ');
  const dRot = getAbsRot(part);
  if(rx) rx.value = dRot.x.toFixed(1);
  if(ry) ry.value = dRot.z.toFixed(1);  // 화면 Y = 내부 Z
  if(rz) rz.value = dRot.y.toFixed(1);  // 화면 Z = 내부 Y (높이)
  // 위치 — Y/Z swap 표시
  const pos = part.mesh.position;
  const px = document.getElementById('propPosX');
  const py = document.getElementById('propPosY');
  const pz = document.getElementById('propPosZ');
  if(px) px.value = pos.x.toFixed(1);
  if(py) py.value = pos.z.toFixed(1);  // 화면 Y = 내부 Z
  if(pz) pz.value = pos.y.toFixed(1);  // 화면 Z = 내부 Y (높이)
  // 크기 (로컬 치수 — 회전 무관) — Y/Z swap 표시
  part.mesh.updateMatrixWorld(true);
  const sz = getLocalSize(part);
  const sx = document.getElementById('propSizeX');
  const sy = document.getElementById('propSizeY');
  const sz2 = document.getElementById('propSizeZ');
  if(sx) sx.value = sz.x.toFixed(1);
  if(sy) sy.value = sz.z.toFixed(1);  // 화면 Y = 내부 Z
  if(sz2) sz2.value = sz.y.toFixed(1);  // 화면 Z = 내부 Y (높이)
}

// v3.3: 입력된 위치값을 부품에 적용
// v8.56: 화면 Z 입력 → 내부 Y, 화면 Y 입력 → 내부 Z
function applyPropPosition(){
  const id = state.selectedPartId;
  if(!id) return;
  const part = state.parts.find(p => p.id === id);
  if(!part) return;
  const xIn = parseFloat(document.getElementById('propPosX').value);
  const yIn = parseFloat(document.getElementById('propPosY').value);  // 화면 Y (깊이) → 내부 Z
  const zIn = parseFloat(document.getElementById('propPosZ').value);  // 화면 Z (높이) → 내부 Y
  if(!isNaN(xIn)) part.mesh.position.x = xIn;
  if(!isNaN(yIn)) part.mesh.position.z = yIn;
  if(!isNaN(zIn)) part.mesh.position.y = zIn;
  if(transformState.activePart === part) showTransformHandles(part);
  updateDimLabels();
  setStat('📍 위치 변경: X=' + xIn.toFixed(1) + ' Y=' + yIn.toFixed(1) + ' Z=' + zIn.toFixed(1) + ' (Z=위)');
}

// v3.3: 입력된 크기값을 부품에 적용 (해당 축 스케일 보정)
function applyPropSize(axisChar){
  // v8.56: 화면 Y/Z ↔ 내부 Z/Y swap (Z-up 표시 컨벤션)
  let internalAxis = axisChar;
  if(axisChar === 'y') internalAxis = 'z';
  else if(axisChar === 'z') internalAxis = 'y';
  const id = state.selectedPartId;
  if(!id) return;
  const part = state.parts.find(p => p.id === id);
  if(!part) return;
  const newSize = parseFloat(document.getElementById('propSize' + axisChar.toUpperCase()).value);
  if(isNaN(newSize) || newSize <= 0){
    toast('크기는 0보다 큰 숫자를 입력하세요');
    refreshPropPanelTransform(part);
    return;
  }
  // v8.72: 로컬 치수 기준 factor (회전된 부품도 정확)
  part.mesh.updateMatrixWorld(true);
  const lsz = getLocalSize(part);
  const cur = lsz[internalAxis];
  if(cur < 0.001){ toast('현재 크기를 측정할 수 없습니다'); return; }
  // 높이(내부 Y) 변경 시 바닥 안착용: 변경 전 월드 최저점
  const beforeMinY = new THREE.Box3().setFromObject(part.mesh).min.y;
  const factor = newSize / cur;
  part.mesh.scale[internalAxis] *= factor;
  if(internalAxis === 'y'){
    part.mesh.updateMatrixWorld(true);
    const afterMinY = new THREE.Box3().setFromObject(part.mesh).min.y;
    part.mesh.position.y += beforeMinY - afterMinY; // 바닥 유지
  }
  if(transformState.activePart === part) showTransformHandles(part);
  updateDimLabels();
  refreshPropPanelTransform(part);
  toast('📐 ' + axisChar.toUpperCase() + ' 크기 = ' + newSize.toFixed(1) + ' mm');
  setStat('크기 변경: ' + axisChar.toUpperCase() + '축 ' + newSize.toFixed(1) + ' mm');
}

// v3.3: 입력된 회전값을 부품에 적용 (절대값으로 설정)
function applyPropRotation(){
  const id = state.selectedPartId;
  if(!id) return;
  const part = state.parts.find(p => p.id === id);
  if(!part) return;
  // v8.56: 화면 Y/Z ↔ 내부 Z/Y swap
  const rxIn = parseFloat(document.getElementById('psRotX').value);
  const ryIn = parseFloat(document.getElementById('psRotY').value);  // 화면 Y → 내부 Z
  const rzIn = parseFloat(document.getElementById('psRotZ').value);  // 화면 Z → 내부 Y
  // v8.73: 절대 월드축 회전(_absRotDeg)으로 적용 — 핸들 회전과 일관, 다음 드래그 시 원복 방지
  const d = getAbsRot(part);
  if(!isNaN(rxIn)) d.x = rxIn;        // 화면 X → 내부 X
  if(!isNaN(ryIn)) d.z = ryIn;        // 화면 Y → 내부 Z
  if(!isNaN(rzIn)) d.y = rzIn;        // 화면 Z → 내부 Y (높이축)
  applyAbsRot(part);
  if(transformState.activePart === part) showTransformHandles(part);
  updateDimLabels();
  refreshPropPanelTransform(part);
  setStat('↻ 회전 변경: X=' + (isNaN(rxIn)?'-':rxIn) + '° Y=' + (isNaN(ryIn)?'-':ryIn) + '° Z=' + (isNaN(rzIn)?'-':rzIn) + '° (Z=수직)');
}

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>t.classList.remove('show'), 2200);
}

function closeModal(id){
  document.getElementById(id).classList.remove('show');
  // v2.2: 회전 모달 닫히면 회전축 미리보기 제거
  if(id === 'revolveModal') hideAxisPreview();
}

function toggleHelp(){
  // v2.9.1: 좌측 도움말 박스 제거됨. 단축키 도움말은 showShortcutHelp() 사용.
  const h = document.getElementById('helpBox');
  if(h) h.style.display = h.style.display === 'none' ? '' : 'none';
}

document.querySelectorAll('.menu').forEach(m=>{
  const title = m.querySelector('.menu-title');
  title.addEventListener('click', (e)=>{
    e.stopPropagation();
    const isOpen = m.classList.contains('open');
    document.querySelectorAll('.menu').forEach(x => x.classList.remove('open'));
    if(!isOpen) m.classList.add('open');
  });
});
document.addEventListener('click', ()=>{
  document.querySelectorAll('.menu').forEach(x => x.classList.remove('open'));
});

// ============================================================
// v6.4: 블렌더식 모달 변형 (G=이동, R=회전, S=크기)
//   G/R/S 누름 → 마우스 이동으로 변형 → X/Y/Z 축제한 → 숫자입력 정밀 →
//   클릭/Enter 확정, Esc/우클릭 취소
// ============================================================
// ============================================================
// v6.5: 블렌더식 편집 모드 (점/선/면 선택 → 이동)
//   Tab으로 진입/종료, 1=점 2=선 3=면, 클릭/Shift클릭 선택, G로 이동
// ============================================================
const editMode = {
  active: false,
  part: null,            // 편집 대상 part
  elem: 'vertex',        // 'vertex' | 'edge' | 'face'
  geom: null,            // 편집용 인덱스드 geometry (part.mesh.geometry로 교체됨)
  verts: [],             // [{idx, pos:Vector3(local)}]  대표 정점들
  edges: [],             // [{a,b}] 정점 인덱스 쌍 (중복 제거)
  faces: [],             // [{a,b,c}] 삼각형 정점 인덱스
  selVerts: new Set(),   // 선택된 정점 인덱스
  markerGroup: null,     // 정점 마커들이 담긴 Group (월드)
  dragging: false,
  dragStart: null,       // {x,y}
  dragStartPos: null,    // Map<idx, Vector3>
  dragPlane: null,
  axis: null,            // v7.1.4: 'x'|'y'|'z'|null — 블렌더식 축 제한
  numBuf: '',            // v7.1.4: 숫자 입력 버퍼
  _moveCenter: null,     // 선택 정점 월드 중심
  userEdges: [],         // v6.9: 사용자가 F/E로 만든 엣지 [[ai,bi],...]
  edgeLines: null,       // v6.9: userEdges 시각화 LineSegments
};

function enterEditMode(){
  const sel = state.parts.filter(p => p._selected && p.mesh && p.mesh.isMesh);
  const target = sel.length === 1 ? sel[0] : (transformState.activePart && transformState.activePart.mesh && transformState.activePart.mesh.isMesh ? transformState.activePart : null);
  if(!target){ toast('편집할 단일 메시 부품을 선택하세요 (그룹은 먼저 해제)'); return; }
  if(target.type === 'group'){ toast('그룹은 편집 불가 — 먼저 그룹 해제(Ctrl+Shift+G)'); return; }
  hideTransformHandles();
  editMode.active = true;
  editMode.part = target;
  editMode.elem = 'vertex';
  editMode.selVerts.clear();
  editMode.userEdges = []; // v6.9: 사용자 엣지 초기화

  // geometry를 정점 통합본으로 교체 (정점 이동 시 면이 함께 따라가도록)
  const merged = mergeVerticesGeom(target.mesh.geometry, 1e-3);
  if(target.mesh.geometry) target.mesh.geometry.dispose();
  target.mesh.geometry = merged;
  editMode.geom = merged;
  if(state.showEdges !== false) refreshEdgeOutline(target.mesh); // 외곽선 재생성

  buildEditTopology();
  buildVertexMarkers();
  setStat('✏️ 편집 모드 — 1점/2선/3면 · 클릭선택(Shift추가) · G이동 · F연결/면 · E확장 · B이등분 · Tab종료');
  toast('✏️ 편집 모드 진입 (' + (editMode.verts.length) + '개 정점)');
}

function exitEditMode(){
  if(!editMode.active) return;
  clearVertexMarkers();
  // 최종 노멀 재계산
  if(editMode.geom){
    editMode.geom.computeVertexNormals();
    editMode.geom.attributes.position.needsUpdate = true;
  }
  editMode.active = false;
  const part = editMode.part;
  // v6.6: 변경된 형상으로 외곽선 갱신
  if(part && part.mesh && state.showEdges !== false) refreshEdgeOutline(part.mesh);
  editMode.part = null;
  editMode.selVerts.clear();
  pushHistory();
  if(part){ showTransformHandles(part); }
  setStat('편집 모드 종료');
  toast('✅ 편집 종료');
}

// 정점/엣지/면 토폴로지 구성
function buildEditTopology(){
  const geom = editMode.geom;
  const pos = geom.attributes.position;
  const idx = geom.index ? geom.index.array : null;
  editMode.verts = [];
  for(let i=0;i<pos.count;i++){
    editMode.verts.push({idx:i, pos:new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i))});
  }
  editMode.faces = [];
  editMode.edges = [];
  const edgeSet = new Set();
  const addEdge=(a,b)=>{ const k=a<b?a+'_'+b:b+'_'+a; if(!edgeSet.has(k)){ edgeSet.add(k); editMode.edges.push({a,b}); } };
  if(idx){
    for(let i=0;i<idx.length;i+=3){
      const a=idx[i],b=idx[i+1],c=idx[i+2];
      editMode.faces.push({a,b,c});
      addEdge(a,b); addEdge(b,c); addEdge(c,a);
    }
  }
}

// 정점 위치를 geometry에서 다시 읽어 verts 갱신
function syncVertsFromGeom(){
  const pos = editMode.geom.attributes.position;
  editMode.verts.forEach(v=>{ v.pos.set(pos.getX(v.idx),pos.getY(v.idx),pos.getZ(v.idx)); });
}

// v6.8: 현재 editMode.geom을 position/index 일반 배열로 추출
function editGeomToArrays(){
  const pos = editMode.geom.attributes.position;
  const verts = [];
  for(let i=0;i<pos.count;i++) verts.push([pos.getX(i),pos.getY(i),pos.getZ(i)]);
  const idx = editMode.geom.index ? Array.from(editMode.geom.index.array) : [];
  return {verts, idx};
}

// v6.8: 배열로부터 editMode.geom 재구성 + 토폴로지/마커 갱신
function editRebuildFromArrays(verts, idx, keepSel){
  const flat = new Float32Array(verts.length*3);
  verts.forEach((v,i)=>{ flat[i*3]=v[0]; flat[i*3+1]=v[1]; flat[i*3+2]=v[2]; });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(flat,3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if(editMode.part.mesh.geometry) editMode.part.mesh.geometry.dispose();
  editMode.part.mesh.geometry = g;
  editMode.geom = g;
  buildEditTopology();
  if(!keepSel) editMode.selVerts.clear();
  // 마커 재생성 (정점 수가 바뀌므로)
  buildVertexMarkers();
  if(state.showEdges !== false) refreshEdgeOutline(editMode.part.mesh);
}

// v6.8: F키 — 선택 정점으로 면(또는 엣지) 생성
function editFill(){
  if(!editMode.active) return;
  const sel = Array.from(editMode.selVerts);
  if(sel.length < 2){ toast('정점을 2개 이상 선택하세요'); return; }
  if(sel.length === 2){
    // v6.9: 2점 = 선(엣지) 연결
    const [a,b] = sel;
    const k = a<b ? a+'_'+b : b+'_'+a;
    const exists = editMode.userEdges.some(([x,y])=> (x<y?x+'_'+y:y+'_'+x)===k );
    if(exists){ toast('이미 연결된 선입니다'); return; }
    editMode.userEdges.push([a,b]);
    rebuildUserEdgeLines();
    pushHistory();
    toast('✅ 두 점을 선으로 연결');
    return;
  }
  // 3점 이상 = 팬(fan) 삼각분할로 면 생성 (양면)
  const {verts, idx} = editGeomToArrays();
  const base = sel[0];
  for(let i=1;i<sel.length-1;i++){
    idx.push(base, sel[i], sel[i+1]);
    idx.push(base, sel[i+1], sel[i]);
  }
  editRebuildFromArrays(verts, idx, true);
  pushHistory();
  toast('✅ ' + sel.length + '개 정점으로 면 생성');
}

// v6.9: E키 — 선택 정점을 복제(확장)하고 기존 점과 엣지로 연결, 새 점을 이동 모드로 잡음
function editExtrude(){
  if(!editMode.active) return;
  const sel = Array.from(editMode.selVerts);
  if(sel.length === 0){ toast('확장할 점을 먼저 선택하세요'); return; }
  const {verts, idx} = editGeomToArrays();
  // 부품 크기 기준 기본 돌출 거리 (로컬 Y=높이 방향으로 약간 띄움)
  let defStep = 15;
  if(editMode.part && editMode.part.mesh){
    editMode.part.mesh.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(editMode.part.mesh);
    const sz = bb.getSize(new THREE.Vector3());
    defStep = Math.max(5, Math.max(sz.x,sz.y,sz.z) * 0.3);
  }
  // 선택 점마다 복제 → 새 인덱스 (기본 오프셋: 로컬 +Y 높이방향)
  const newIdxMap = new Map();
  sel.forEach(oi=>{
    const v = verts[oi];
    const ni = verts.length;
    verts.push([v[0], v[1] + defStep, v[2]]); // 높이(+Y) 방향으로 띄워 분리 표시
    newIdxMap.set(oi, ni);
    editMode.userEdges.push([oi, ni]); // 기존↔새 점 선 연결
  });
  if(sel.length === 2){
    editMode.userEdges.push([newIdxMap.get(sel[0]), newIdxMap.get(sel[1])]);
    // 두 점 확장 = 사각형 면도 자동 생성 (a,b,b',a')
    const a=sel[0], b=sel[1], ap=newIdxMap.get(a), bp=newIdxMap.get(b);
    idx.push(a,b,bp, a,bp,ap);   // 앞면
    idx.push(a,bp,b, a,ap,bp);   // 뒷면
  }
  editRebuildFromArrays(verts, idx, false);
  // 새 점들만 선택
  editMode.selVerts.clear();
  newIdxMap.forEach(ni=>editMode.selVerts.add(ni));
  rebuildUserEdgeLines();
  updateVertexMarkers();
  pushHistory();
  // 이어서 이동 모드 진입 (G와 동일: X/Y/Z·숫자·Ctrl스냅)
  editMoveStart(blenderOp._lastMouse ? {clientX:blenderOp._lastMouse.x, clientY:blenderOp._lastMouse.y} : null);
  setStat('🅴 확장 완료 — 새 점 이동 중 · X/Y/Z 축제한 · 숫자입력 · Ctrl=스냅 · 클릭/Enter 확정 · Esc 취소');
  toast('🅴 ' + sel.length + '개 점 확장 (' + defStep.toFixed(0) + 'mm 띄움) — 이동/축/숫자로 조정');
}

// v6.8: B키 — 선택된 엣지(정점 2개) 이등분: 중점 정점 추가 + 인접 면 분할
function editSubdivide(){
  if(!editMode.active) return;
  const sel = Array.from(editMode.selVerts);
  if(sel.length !== 2){ toast('이등분할 선의 양 끝 정점 2개를 선택하세요 (선 모드 권장)'); return; }
  const [a, b] = sel;
  const {verts, idx} = editGeomToArrays();
  // 중점 정점 추가
  const mid=[(verts[a][0]+verts[b][0])/2,(verts[a][1]+verts[b][1])/2,(verts[a][2]+verts[b][2])/2];
  const m = verts.length;
  verts.push(mid);
  // a-b 엣지를 가진 삼각형들을 찾아 두 개로 분할
  const newIdx = [];
  let split = 0;
  for(let i=0;i<idx.length;i+=3){
    const t=[idx[i],idx[i+1],idx[i+2]];
    const hasA=t.includes(a), hasB=t.includes(b);
    if(hasA && hasB){
      // 세 번째 정점
      const c = t.find(v=>v!==a && v!==b);
      // 삼각형 (a,b,c) → (a,m,c)+(m,b,c) — winding 유지 위해 원래 순서 기준
      // 원래 순서에서 a→b 인접 위치 찾아 m 삽입
      const tri=[t[0],t[1],t[2]];
      // 두 삼각형으로
      newIdx.push(a, m, c,  m, b, c);
      split++;
    } else {
      newIdx.push(t[0],t[1],t[2]);
    }
  }
  if(split===0){ toast('선택한 두 정점이 같은 면의 모서리가 아닙니다'); return; }
  editMode.selVerts.clear();
  editMode.selVerts.add(m); // 새 중점 선택
  editRebuildFromArrays(verts, newIdx, true);
  pushHistory();
  toast('✅ 선 이등분 — 중점 정점 추가 (' + split + '개 면 분할)');
}

// 정점 마커(작은 구) 생성 — 월드 좌표
function buildVertexMarkers(){
  clearVertexMarkers();
  const part = editMode.part;
  part.mesh.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(part.mesh);
  const sz = bb.getSize(new THREE.Vector3());
  const r = Math.max(sz.x,sz.y,sz.z,10) * 0.012;
  const grp = new THREE.Group();
  editMode.verts.forEach(v=>{
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, 8, 6),
      new THREE.MeshBasicMaterial({color:0x111111, depthTest:false})
    );
    m.userData._vidx = v.idx;
    m.renderOrder = 2000;
    grp.add(m);
  });
  scene.add(grp);
  editMode.markerGroup = grp;
  editMode._markerR = r;
  updateVertexMarkers();
}

function clearVertexMarkers(){
  if(editMode.markerGroup){
    scene.remove(editMode.markerGroup);
    editMode.markerGroup.traverse(o=>{ if(o.isMesh){ if(o.geometry)o.geometry.dispose(); if(o.material)o.material.dispose(); } });
    editMode.markerGroup = null;
  }
}

// 마커 위치/색 갱신 (월드 변환 반영, 선택=주황)
function updateVertexMarkers(){
  if(!editMode.markerGroup) return;
  const part = editMode.part;
  part.mesh.updateMatrixWorld(true);
  const mat = part.mesh.matrixWorld;
  const pos = editMode.geom.attributes.position;
  editMode.markerGroup.children.forEach(m=>{
    const i = m.userData._vidx;
    const lp = new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(mat);
    m.position.copy(lp);
    const selected = editMode.selVerts.has(i);
    m.material.color.setHex(selected ? 0xff8000 : 0x111111);
    m.scale.setScalar(selected ? 1.6 : 1.0);
  });
  updateUserEdgeLines();
}

// v6.9: 사용자 추가 엣지(userEdges)를 굵은 선으로 표시 (mesh 자식, 로컬 좌표)
function rebuildUserEdgeLines(){
  if(editMode.edgeLines){
    if(editMode.part && editMode.part.mesh) editMode.part.mesh.remove(editMode.edgeLines);
    if(editMode.edgeLines.geometry) editMode.edgeLines.geometry.dispose();
    if(editMode.edgeLines.material) editMode.edgeLines.material.dispose();
    editMode.edgeLines = null;
  }
  if(!editMode.userEdges || editMode.userEdges.length === 0) return;
  const pos = editMode.geom.attributes.position;
  const pts = [];
  editMode.userEdges.forEach(([a,b])=>{
    if(a<pos.count && b<pos.count){
      pts.push(pos.getX(a),pos.getY(a),pos.getZ(a));
      pts.push(pos.getX(b),pos.getY(b),pos.getZ(b));
    }
  });
  if(pts.length===0) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts,3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({color:0x2266ff, depthTest:false}));
  lines.userData._isUserEdge = true;
  lines.renderOrder = 1500;
  editMode.part.mesh.add(lines);
  editMode.edgeLines = lines;
}

// 정점 이동 중 엣지 선 위치만 갱신 (로컬 position 다시 읽기)
function updateUserEdgeLines(){
  if(!editMode.edgeLines || !editMode.userEdges) return;
  const pos = editMode.geom.attributes.position;
  const arr = editMode.edgeLines.geometry.attributes.position;
  let k=0;
  editMode.userEdges.forEach(([a,b])=>{
    if(a<pos.count && b<pos.count){
      arr.setXYZ(k++, pos.getX(a),pos.getY(a),pos.getZ(a));
      arr.setXYZ(k++, pos.getX(b),pos.getY(b),pos.getZ(b));
    }
  });
  arr.needsUpdate = true;
}

// 화면 클릭 → 가장 가까운 정점 선택 (점 모드). 선/면 모드는 구성 정점 집합 선택.
function editPickVertex(e){
  const rect = renderer.domElement.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const part = editMode.part;
  part.mesh.updateMatrixWorld(true);
  const mat = part.mesh.matrixWorld;
  const pos = editMode.geom.attributes.position;
  let best=-1, bestD=14*14; // 14px 이내
  for(let i=0;i<pos.count;i++){
    const wp = new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(mat).project(camera);
    if(wp.z>1) continue;
    const sx=(wp.x+1)*0.5*rect.width, sy=(-wp.y+1)*0.5*rect.height;
    const d=(sx-mx)*(sx-mx)+(sy-my)*(sy-my);
    if(d<bestD){ bestD=d; best=i; }
  }
  return best;
}

// 면 클릭(레이캐스트) → 삼각형 → 모드별 정점 집합
function editPickFaceVerts(e){
  const rect = renderer.domElement.getBoundingClientRect();
  mouseVec.x=((e.clientX-rect.left)/rect.width)*2-1;
  mouseVec.y=-((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(mouseVec, camera);
  const hits = raycaster.intersectObject(editMode.part.mesh, false);
  if(hits.length===0) return null;
  const f = hits[0].face;
  return [f.a, f.b, f.c];
}

function editSelect(e){
  const add = e.shiftKey || e.ctrlKey || e.metaKey;
  if(!add) editMode.selVerts.clear();

  if(editMode.elem === 'vertex'){
    const vi = editPickVertex(e);
    if(vi>=0){ if(add && editMode.selVerts.has(vi)) editMode.selVerts.delete(vi); else editMode.selVerts.add(vi); }
  } else if(editMode.elem === 'face'){
    const tri = editPickFaceVerts(e);
    if(tri){ tri.forEach(i=>editMode.selVerts.add(i)); }
  } else if(editMode.elem === 'edge'){
    // 가장 가까운 정점 2개로 엣지 추정 → 클릭점에 가까운 엣지 선택
    const vi = editPickVertex(e);
    if(vi>=0){
      // vi를 포함하는 엣지 중 화면상 클릭점에 가장 가까운 것
      editMode.selVerts.add(vi);
      // 인접 정점 중 가장 가까운 하나 추가
      const rect = renderer.domElement.getBoundingClientRect();
      const mx=e.clientX-rect.left, my=e.clientY-rect.top;
      const mat=editMode.part.mesh.matrixWorld; const pos=editMode.geom.attributes.position;
      let bestB=-1,bestD=Infinity;
      editMode.edges.forEach(ed=>{
        let other=-1; if(ed.a===vi)other=ed.b; else if(ed.b===vi)other=ed.a; else return;
        const wp=new THREE.Vector3(pos.getX(other),pos.getY(other),pos.getZ(other)).applyMatrix4(mat).project(camera);
        const sx=(wp.x+1)*0.5*rect.width, sy=(-wp.y+1)*0.5*rect.height;
        const d=(sx-mx)*(sx-mx)+(sy-my)*(sy-my);
        if(d<bestD){bestD=d;bestB=other;}
      });
      if(bestB>=0) editMode.selVerts.add(bestB);
    }
  }
  updateVertexMarkers();
  setStat('✏️ ' + ({vertex:'점',edge:'선',face:'면'}[editMode.elem]) + ' · 선택 ' + editMode.selVerts.size + '개 정점 · G:이동 Tab:종료');
}

// 선택 정점 이동 시작 (G키 또는 드래그)
function editMoveStart(e){
  if(editMode.selVerts.size===0){ toast('이동할 점/선/면을 먼저 선택'); return; }
  editMode.dragging = true;
  editMode.axis = null;
  editMode.numBuf = '';
  const sx = e && e.clientX !== undefined ? e.clientX : (blenderOp._lastMouse ? blenderOp._lastMouse.x : 0);
  const sy = e && e.clientY !== undefined ? e.clientY : (blenderOp._lastMouse ? blenderOp._lastMouse.y : 0);
  editMode.dragStart = {x: sx, y: sy};
  const pos = editMode.geom.attributes.position;
  editMode.dragStartPos = new Map();
  editMode.selVerts.forEach(i=>editMode.dragStartPos.set(i, new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i))));
  // 선택 정점 월드 중심
  const part = editMode.part; part.mesh.updateMatrixWorld(true);
  const center = new THREE.Vector3(); let n=0;
  editMode.selVerts.forEach(i=>{ center.add(new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(part.mesh.matrixWorld)); n++; });
  if(n>0) center.multiplyScalar(1/n);
  const camDir = new THREE.Vector3().subVectors(camera.position, center).normalize();
  editMode.dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, center);
  editMode._moveCenter = center.clone();
  editMode._startCenter = center.clone();
  setStat('✏️ 버텍스 이동 — X/Y/Z 축제한 · 숫자입력 · 마우스이동 · 클릭/Enter 확정 · Esc 취소');
}

// 마우스 광선과 월드 직선(점 p0, 방향 dir)의 최근접점에서 t(직선상 거리) 반환
function rayLineParam(mx, my, p0, dir){
  const rect = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((mx-rect.left)/rect.width)*2-1, -((my-rect.top)/rect.height)*2+1);
  const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
  // 두 직선(카메라 광선 vs 축직선)의 최근접점 계산
  const ro = ray.ray.origin, rd = ray.ray.direction;
  const d1 = rd.clone(), d2 = dir.clone().normalize();
  const r = ro.clone().sub(p0);
  const a = d1.dot(d1), b = d1.dot(d2), c = d2.dot(d2), d = d1.dot(r), eee = d2.dot(r);
  const denom = a*c - b*b;
  if(Math.abs(denom) < 1e-6) return 0;
  // 축직선 파라미터 s: 최근접
  const s = (a*eee - b*d) / denom;
  return s; // p0 + s*dir 이 최근접점
}

function editMoveApply(e){
  if(!editMode.dragging) return;
  if(!renderer || !camera) return;
  const part = editMode.part;
  const pos = editMode.geom.attributes.position;
  // 블렌더 축(Z=높이,Y=앞뒤) → three.js 로컬축(Y=높이,Z=앞뒤) 변환
  const ax3 = editMode.axis === 'y' ? 'z' : (editMode.axis === 'z' ? 'y' : editMode.axis);
  const num = editMode.numBuf !== '' && editMode.numBuf !== '-' ? parseFloat(editMode.numBuf) : null;

  // 로컬 변위 계산
  let localDelta = new THREE.Vector3();

  if(num !== null && ax3){
    // 숫자 + 축: 해당 로컬 축으로 num mm
    localDelta[ax3] = num;
  } else if(ax3){
    // 축 제한 (마우스): 월드 축 방향 직선에 마우스 광선을 투영해 이동량 산출
    //   월드 축 방향 = 부품 회전을 반영한 로컬축의 월드 방향
    const dirLocal = new THREE.Vector3(0,0,0); dirLocal[ax3] = 1;
    const normalMat = new THREE.Matrix3().getNormalMatrix(part.mesh.matrixWorld);
    const dirWorld = dirLocal.clone().applyMatrix3(normalMat).normalize();
    const p0 = editMode._startCenter;
    const cur = (e && e.clientX !== undefined) ? e : blenderOp._lastMouse ? {clientX:blenderOp._lastMouse.x, clientY:blenderOp._lastMouse.y} : null;
    if(cur){
      const sCur = rayLineParam(cur.clientX, cur.clientY, p0, dirWorld);
      const sStart = rayLineParam(editMode.dragStart.x, editMode.dragStart.y, p0, dirWorld);
      const worldMove = dirWorld.clone().multiplyScalar(sCur - sStart);
      // 월드 변위 → 로컬 변위 (방향만, 스케일 무시 위해 normalMatrix 역)
      const invNormal = new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().copy(part.mesh.matrixWorld).invert());
      const lv = worldMove.clone().applyMatrix3(invNormal);
      // 축 성분만 (수치 오차 제거)
      localDelta.set(0,0,0); localDelta[ax3] = lv[ax3];
    }
  } else if(e && e.clientX !== undefined){
    // 자유 이동: 카메라 평면 드래그
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1, -((e.clientY-rect.top)/rect.height)*2+1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
    const nowHit = new THREE.Vector3();
    if(ray.ray.intersectPlane(editMode.dragPlane, nowHit)){
      const ndc0 = new THREE.Vector2(((editMode.dragStart.x-rect.left)/rect.width)*2-1, -((editMode.dragStart.y-rect.top)/rect.height)*2+1);
      const ray0 = new THREE.Raycaster(); ray0.setFromCamera(ndc0, camera);
      const startHit = new THREE.Vector3();
      if(ray0.ray.intersectPlane(editMode.dragPlane, startHit)){
        const inv = new THREE.Matrix4().copy(part.mesh.matrixWorld).invert();
        const lNow = nowHit.clone().applyMatrix4(inv);
        const lStart = startHit.clone().applyMatrix4(inv);
        localDelta = lNow.clone().sub(lStart);
      }
    }
  }

  // 1차 적용
  editMode.selVerts.forEach(i=>{
    const sp = editMode.dragStartPos.get(i);
    pos.setXYZ(i, sp.x+localDelta.x, sp.y+localDelta.y, sp.z+localDelta.z);
  });

  // v6.9: 버텍스/엣지 스냅 — 자유이동 시 (스냅 ON 또는 Ctrl)
  let snapped = false;
  const wantSnap = (state.vertexSnap !== false) || (e && (e.ctrlKey || e.metaKey));
  if(wantSnap && editMode.selVerts.size > 0 && !ax3 && num === null){
    const snapLocal = computeEditSnap();
    if(snapLocal){
      editMode.selVerts.forEach(i=>{
        const b = new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i));
        pos.setXYZ(i, b.x+snapLocal.x, b.y+snapLocal.y, b.z+snapLocal.z);
      });
      snapped = true;
    }
  }

  pos.needsUpdate = true;
  editMode.geom.computeVertexNormals();
  updateVertexMarkers();

  const axLabel = editMode.axis ? (editMode.axis.toUpperCase() + (editMode.axis==='z'?'(높이)':editMode.axis==='y'?'(앞뒤)':'') ) : '자유';
  const numTxt = editMode.numBuf !== '' ? (' = ' + editMode.numBuf + 'mm') : '';
  setStat('✏️ 버텍스 이동 [' + axLabel + ']' + numTxt + (snapped?' 🧲스냅':'') + ' · Enter/클릭 확정 · Esc 취소');
}

// v6.9: 편집 모드 정점 스냅 — 선택 정점 중 하나가 비선택 정점에 화면상 가까우면
//   그 차이를 로컬 offset으로 반환 (없으면 null)
// v7.1.4: 편집 모드 스냅 — 선택 정점이 (비선택)버텍스 또는 엣지에 화면상 가까우면
//   그 위치(로컬)로 가는 offset 반환. 버텍스 우선, 없으면 엣지 수직투영점.
function computeEditSnap(){
  const part = editMode.part;
  part.mesh.updateMatrixWorld(true);
  const mat = part.mesh.matrixWorld;
  const pos = editMode.geom.attributes.position;
  const rect = renderer.domElement.getBoundingClientRect();
  const SNAP=12, SNAP2=SNAP*SNAP;
  const toScreen = (lx,ly,lz)=>{
    const wp = new THREE.Vector3(lx,ly,lz).applyMatrix4(mat).project(camera);
    return {x:(wp.x+1)*0.5*rect.width, y:(-wp.y+1)*0.5*rect.height, z:wp.z};
  };
  const localOf = i => new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i));

  // 대표 선택 정점(첫 번째) 기준
  const selArr = Array.from(editMode.selVerts);
  if(selArr.length===0) return null;
  const si = selArr[0];
  const ss = toScreen(pos.getX(si),pos.getY(si),pos.getZ(si));
  if(ss.z>1) return null;

  let best=null, bestD=SNAP2, bestType='';

  // 1) 버텍스 스냅 (비선택 정점)
  for(let ti=0; ti<pos.count; ti++){
    if(editMode.selVerts.has(ti)) continue;
    const ts = toScreen(pos.getX(ti),pos.getY(ti),pos.getZ(ti));
    if(ts.z>1) continue;
    const d=(ss.x-ts.x)*(ss.x-ts.x)+(ss.y-ts.y)*(ss.y-ts.y);
    if(d<bestD){ bestD=d; best=localOf(ti); bestType='vertex'; }
  }

  // 2) 엣지 스냅 (메시 엣지 + 사용자 엣지) — 화면상 선분에 수직투영
  if(!best || bestType!=='vertex'){
    const edges = (editMode.edges||[]).concat((editMode.userEdges||[]).map(([a,b])=>({a,b})));
    edges.forEach(ed=>{
      if(editMode.selVerts.has(ed.a) && editMode.selVerts.has(ed.b)) return; // 둘 다 선택이면 제외
      const a=toScreen(pos.getX(ed.a),pos.getY(ed.a),pos.getZ(ed.a));
      const b=toScreen(pos.getX(ed.b),pos.getY(ed.b),pos.getZ(ed.b));
      if(a.z>1||b.z>1) return;
      // 점 ss → 선분 ab 화면거리 + 투영 파라미터 t
      const abx=b.x-a.x, aby=b.y-a.y;
      const len2=abx*abx+aby*aby; if(len2<1e-6) return;
      let t=((ss.x-a.x)*abx+(ss.y-a.y)*aby)/len2;
      t=Math.max(0,Math.min(1,t));
      const px=a.x+abx*t, py=a.y+aby*t;
      const d=(ss.x-px)*(ss.x-px)+(ss.y-py)*(ss.y-py);
      if(d<bestD){
        bestD=d; bestType='edge';
        // 로컬 좌표상 같은 t 위치
        const la=localOf(ed.a), lb=localOf(ed.b);
        best=la.clone().lerp(lb, t);
      }
    });
  }

  if(!best) return null;
  const sv = localOf(si);
  return best.clone().sub(sv);
}

function editMoveConfirm(){
  if(!editMode.dragging) return;
  editMode.dragging = false;
  editMode.dragStartPos = null;
  editMode.axis = null; editMode.numBuf = '';
  // v6.6: 변경된 형상으로 외곽선 갱신
  if(editMode.part && editMode.part.mesh && state.showEdges !== false) refreshEdgeOutline(editMode.part.mesh);
  setStat('✏️ 이동 적용 · 계속 편집 (Tab 종료)');
}

function editMoveCancel(){
  if(!editMode.dragging) return;
  const pos = editMode.geom.attributes.position;
  editMode.dragStartPos.forEach((sp,i)=>pos.setXYZ(i, sp.x, sp.y, sp.z));
  pos.needsUpdate = true;
  editMode.geom.computeVertexNormals();
  editMode.dragging = false;
  editMode.dragStartPos = null;
  editMode.axis = null; editMode.numBuf = '';
  if(editMode.part && editMode.part.mesh && state.showEdges !== false) refreshEdgeOutline(editMode.part.mesh);
  updateVertexMarkers();
  setStat('이동 취소');
}

function setEditElem(elem){
  if(!editMode.active) return;
  editMode.elem = elem;
  setStat('✏️ ' + ({vertex:'점',edge:'선',face:'면'}[elem]) + ' 모드 · 클릭 선택 · G:이동');
}

function toggleEditMode(){
  if(editMode.active) exitEditMode();
  else enterEditMode();
  const btn = document.getElementById('btnEditMode');
  if(btn){
    btn.textContent = editMode.active ? '✏️ 편집중 (Tab종료)' : '✏️ 편집(Tab)';
    btn.className = editMode.active ? 'danger' : 'warn';
  }
}

const blenderOp = {
  active: false, mode: null, axis: null, numBuf: '',
  startMouse: null, parts: [], centerScreen: null, startAngle: 0,
  _lastMouse: null, _center3D: null
};

function blenderStart(mode){
  const sel = state.parts.filter(p => p._selected && p.mesh);
  if(sel.length === 0){ toast('먼저 도형을 선택하세요'); return; }
  blenderCancel();
  blenderOp.active = true;
  blenderOp.mode = mode;
  blenderOp.axis = null;
  blenderOp.numBuf = '';
  blenderOp.startMouse = blenderOp._lastMouse ? {...blenderOp._lastMouse} : {x: window.innerWidth/2, y: window.innerHeight/2};
  blenderOp.parts = sel.map(p => ({
    part: p,
    startPos: p.mesh.position.clone(),
    startRot: p.mesh.rotation.clone(),
    startScale: p.mesh.scale.clone()
  }));
  const c = new THREE.Vector3(); let n=0;
  sel.forEach(p=>{ p.mesh.updateMatrixWorld(true); const bb=new THREE.Box3().setFromObject(p.mesh); c.add(bb.getCenter(new THREE.Vector3())); n++; });
  if(n>0) c.multiplyScalar(1/n);
  blenderOp._center3D = c.clone();
  if(renderer && camera){
    const rect = renderer.domElement.getBoundingClientRect();
    const pj = c.clone().project(camera);
    blenderOp.centerScreen = {
      x: rect.left + (pj.x+1)*0.5*rect.width,
      y: rect.top + (-pj.y+1)*0.5*rect.height
    };
  } else {
    blenderOp.centerScreen = {x: window.innerWidth/2, y: window.innerHeight/2};
  }
  blenderOp.startAngle = Math.atan2(blenderOp.startMouse.y - blenderOp.centerScreen.y, blenderOp.startMouse.x - blenderOp.centerScreen.x);
  const label = {grab:'이동(G)', rotate:'회전(R)', scale:'크기(S)'}[mode];
  setStat('🅱️ 블렌더 ' + label + ' — 마우스 이동 · X/Y/Z 축제한 · 숫자입력 · 클릭/Enter 확정 · Esc 취소');
}

function blenderApply(){
  if(!blenderOp.active) return;
  const m = blenderOp.mode, ax = blenderOp.axis;
  const num = blenderOp.numBuf !== '' && blenderOp.numBuf !== '-' ? parseFloat(blenderOp.numBuf) : null;
  const cur = blenderOp._lastMouse || blenderOp.startMouse;

  // v7.1.4: 블렌더 좌표(Z=높이, Y=앞뒤) → 이 도구 three.js(Y=높이, Z=앞뒤)로 변환
  //   블렌더 X→X, 블렌더 Y(앞뒤)→Z, 블렌더 Z(높이)→Y
  const ax3 = ax === 'y' ? 'z' : (ax === 'z' ? 'y' : ax); // 실제 적용 축

  blenderOp.parts.forEach(o => {
    const p = o.part;
    if(m === 'grab'){
      if(num !== null){
        const v = o.startPos.clone();
        if(ax3 === 'x') v.x = o.startPos.x + num;
        else if(ax3 === 'y') v.y = o.startPos.y + num;
        else if(ax3 === 'z') v.z = o.startPos.z + num;
        p.mesh.position.copy(v);
      } else {
        const dx = cur.x - blenderOp.startMouse.x;
        const dy = cur.y - blenderOp.startMouse.y;
        const factor = orbitState.radius * 0.0018;
        if(ax3 === 'x'){ p.mesh.position.copy(o.startPos.clone().setX(o.startPos.x + dx*factor)); }
        else if(ax3 === 'y'){ p.mesh.position.copy(o.startPos.clone().setY(o.startPos.y - dy*factor)); } // 높이: 세로 마우스
        else if(ax3 === 'z'){ p.mesh.position.copy(o.startPos.clone().setZ(o.startPos.z + dy*factor)); } // 앞뒤: 세로 마우스
        else {
          const right = new THREE.Vector3(), up = new THREE.Vector3();
          camera.matrixWorld.extractBasis(right, up, new THREE.Vector3());
          const move = right.multiplyScalar(dx*factor).add(up.multiplyScalar(-dy*factor));
          p.mesh.position.copy(o.startPos.clone().add(move));
        }
      }
    } else if(m === 'rotate'){
      let deg;
      if(num !== null){ deg = num; }
      else {
        const a = Math.atan2(cur.y - blenderOp.centerScreen.y, cur.x - blenderOp.centerScreen.x);
        deg = (a - blenderOp.startAngle) * 180/Math.PI;
      }
      const rad = deg * Math.PI/180;
      const axis = ax3 || 'y'; // 축 미지정 시 기본 = 높이축(Y) 회전(블렌더 Z 회전 느낌)
      const r = o.startRot.clone();
      if(axis === 'x') r.x = o.startRot.x + rad;
      else if(axis === 'y') r.y = o.startRot.y + rad;
      else r.z = o.startRot.z + (-rad);
      p.mesh.rotation.copy(r);
    } else if(m === 'scale'){
      let f;
      if(num !== null){ f = num; }
      else {
        const d0 = Math.hypot(blenderOp.startMouse.x - blenderOp.centerScreen.x, blenderOp.startMouse.y - blenderOp.centerScreen.y) || 1;
        const d1 = Math.hypot(cur.x - blenderOp.centerScreen.x, cur.y - blenderOp.centerScreen.y);
        f = Math.max(0.05, d1 / d0);
      }
      const s = o.startScale.clone();
      if(ax3 === 'x') s.x = o.startScale.x * f;
      else if(ax3 === 'y') s.y = o.startScale.y * f;
      else if(ax3 === 'z') s.z = o.startScale.z * f;
      else s.set(o.startScale.x*f, o.startScale.y*f, o.startScale.z*f);
      p.mesh.scale.copy(s);
    }
  });
  // 상태바: 사용자가 누른 블렌더 축 라벨 그대로 표시 (Z=높이로 안내)
  const axLabel = ax ? (ax.toUpperCase() + (ax==='z'?'(높이)':ax==='y'?'(앞뒤)':'') + '축') : '';
  const axTxt = ax ? (' [' + axLabel + ']') : '';
  const numTxt = blenderOp.numBuf !== '' ? (' = ' + blenderOp.numBuf) : '';
  const lbl = {grab:'이동 mm', rotate:'회전 °', scale:'배율'}[m];
  setStat('🅱️ ' + lbl + axTxt + numTxt + ' · Enter/클릭 확정 · Esc 취소');
}

function blenderConfirm(){
  if(!blenderOp.active) return;
  blenderOp.active = false;
  const one = blenderOp.parts.length === 1 ? blenderOp.parts[0].part : null;
  if(one && transformState.activePart === one) showTransformHandles(one);
  pushHistory();
  const lbl = {grab:'이동', rotate:'회전', scale:'크기'}[blenderOp.mode];
  toast('✅ ' + lbl + ' 적용');
  blenderOp.mode = null; blenderOp.axis = null; blenderOp.numBuf = '';
}

function blenderCancel(){
  if(!blenderOp.active){ blenderOp.mode=null; blenderOp.axis=null; blenderOp.numBuf=''; return; }
  blenderOp.parts.forEach(o => {
    o.part.mesh.position.copy(o.startPos);
    o.part.mesh.rotation.copy(o.startRot);
    o.part.mesh.scale.copy(o.startScale);
  });
  blenderOp.active = false;
  const one = blenderOp.parts.length === 1 ? blenderOp.parts[0].part : null;
  if(one && transformState.activePart === one) showTransformHandles(one);
  blenderOp.mode = null; blenderOp.axis = null; blenderOp.numBuf = '';
  setStat('변형 취소됨');
}

window.addEventListener('mousemove', (e)=>{
  blenderOp._lastMouse = {x: e.clientX, y: e.clientY};
  if(editMode.active && editMode.dragging){ editMoveApply(e); return; }
  if(blenderOp.active) blenderApply();
});
window.addEventListener('mousedown', (e)=>{
  // v6.5: 편집 모드 마우스 처리 우선
  if(editMode.active){
    // 캔버스 영역인지 확인 (UI 버튼 클릭은 무시)
    const onCanvas = e.target && (e.target.id === 'viewerCanvas' || (renderer && renderer.domElement === e.target));
    if(editMode.dragging){
      if(e.button === 0){ editMoveConfirm(); }
      else if(e.button === 2){ editMoveCancel(); }
      e.preventDefault(); e.stopPropagation();
      return;
    }
    if(onCanvas && e.button === 0){
      editSelect(e);
      e.preventDefault(); e.stopPropagation();
      return;
    }
    // 편집 모드 중 우클릭은 회전(orbit) 허용 → 막지 않음
    return;
  }
  if(!blenderOp.active) return;
  if(e.button === 0){ blenderConfirm(); }
  else if(e.button === 2){ blenderCancel(); }
  e.preventDefault(); e.stopPropagation();
}, true);

function toggleBlenderKeys(){
  state.blenderKeys = !state.blenderKeys;
  const btn = document.getElementById('btnBlenderKeys');
  if(btn){
    btn.textContent = state.blenderKeys ? '🅱️ 블렌더키 ON' : '🅱️ 블렌더키 OFF';
    btn.className = state.blenderKeys ? 'success' : '';
  }
  if(state.blenderKeys){
    toast('🅱️ 블렌더 단축키 ON · G=이동 R=회전 S=크기 · 축: X=좌우 Y=앞뒤 Z=높이');
  } else {
    blenderCancel();
    toast('🅱️ 블렌더 단축키 OFF · 기본 단축키로 복귀');
  }
}

document.addEventListener('keydown', (e)=>{
  if(e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

  // v8.34: Ctrl 단독 누름 + 점 선택 시 정밀 격자 ON
  if(e.key === 'Control' && state.mode === 'sketch' && !state.fineGrid){
    let anchor = null;
    if(state.penCur >= 0 && state.penPoints[state.penCur]){
      anchor = {x: state.penPoints[state.penCur].x, y: state.penPoints[state.penCur].y};
    } else if(state.selectedShapes && state.selectedShapes.size === 1){
      // 단일 선택 도형의 중심/시작점 사용
      const idx = [...state.selectedShapes][0];
      const s = state.shapes[idx];
      if(s){
        if(s.type === 'line' || s.type === 'rect') anchor = {x: s.x1, y: s.y1};
        else if(s.type === 'circle' || s.type === 'arc') anchor = {x: s.cx, y: s.cy};
      }
    }
    if(anchor){
      state.fineGrid = {anchor, step: 0.1, range: 30};
      redrawSketch();
      // 토스트 안내 (한 번만)
      if(typeof toast === 'function' && !state._fineGridToastShown){
        toast('⊞ 정밀격자 ON (0.1mm·±30mm) — 마우스 자동 스냅 · Ctrl 떼면 해제');
        state._fineGridToastShown = true;
      }
    }
    // Ctrl을 다른 단축키에서도 쓰므로 preventDefault 안 함
    return;
  }

  // v6.5: Tab = 편집 모드 진입/종료 (3D 모드)
  if(e.key === 'Tab' && state.mode === 'model'){
    e.preventDefault();
    toggleEditMode();
    return;
  }
  // v6.5: 편집 모드 중 키 처리
  if(editMode.active){
    if(editMode.dragging){
      const k = e.key.toLowerCase();
      // v7.1.4: 블렌더식 축 제한 (X/Y/Z) + 숫자 입력
      if(k === 'x' || k === 'y' || k === 'z'){
        editMode.axis = (editMode.axis === k) ? null : k; // 같은 축 다시 누르면 해제
        editMode.numBuf = '';
        editMoveApply(blenderOp._lastMouse ? {clientX:blenderOp._lastMouse.x, clientY:blenderOp._lastMouse.y} : null);
        e.preventDefault(); return;
      }
      if((e.key >= '0' && e.key <= '9') || e.key === '.' || e.key === '-'){
        editMode.numBuf += e.key;
        editMoveApply(null);
        e.preventDefault(); return;
      }
      if(e.key === 'Backspace'){
        editMode.numBuf = editMode.numBuf.slice(0, -1);
        editMoveApply(blenderOp._lastMouse ? {clientX:blenderOp._lastMouse.x, clientY:blenderOp._lastMouse.y} : null);
        e.preventDefault(); return;
      }
      if(e.key === 'Enter'){ editMoveConfirm(); e.preventDefault(); return; }
      if(e.key === 'Escape'){ editMoveCancel(); e.preventDefault(); return; }
      return;
    }
    if(e.key === '1'){ setEditElem('vertex'); e.preventDefault(); return; }
    if(e.key === '2'){ setEditElem('edge'); e.preventDefault(); return; }
    if(e.key === '3'){ setEditElem('face'); e.preventDefault(); return; }
    if(e.key === 'g' || e.key === 'G'){ editMoveStart(blenderOp._lastMouse ? {clientX:blenderOp._lastMouse.x, clientY:blenderOp._lastMouse.y} : null); e.preventDefault(); return; }
    if(e.key === 'f' || e.key === 'F'){ editFill(); e.preventDefault(); return; }       // v6.8: F = 면 채우기/선 연결
    if(e.key === 'e' || e.key === 'E'){ editExtrude(); e.preventDefault(); return; }     // v6.9: E = 확장(돌출)
    if(e.key === 'b' || e.key === 'B'){ editSubdivide(); e.preventDefault(); return; }   // v6.8: B = 선 이등분
    if(e.key === 'a' || e.key === 'A'){ // 전체 선택/해제
      if(editMode.selVerts.size === editMode.verts.length){ editMode.selVerts.clear(); }
      else { editMode.verts.forEach(v=>editMode.selVerts.add(v.idx)); }
      updateVertexMarkers(); e.preventDefault(); return;
    }
    if(e.key === 'Escape'){ exitEditMode(); e.preventDefault(); return; }
    // 그 외 키는 편집 모드에서 무시 (회전 등 카메라 조작은 우클릭으로)
    return;
  }

  // v6.4: 블렌더식 모달 변형 처리 (블렌더키 ON + 3D 모드)
  if(state.blenderKeys && state.mode === 'model'){
    // 변형 진행 중이면 축/숫자/확정/취소 입력 받기
    if(blenderOp.active){
      const k = e.key.toLowerCase();
      if(k === 'x' || k === 'y' || k === 'z'){
        blenderOp.axis = (blenderOp.axis === k) ? null : k; // 같은 축 다시 누르면 해제
        blenderOp.numBuf = '';
        blenderApply(); e.preventDefault(); return;
      }
      if((e.key >= '0' && e.key <= '9') || e.key === '.' || e.key === '-'){
        blenderOp.numBuf += e.key;
        blenderApply(); e.preventDefault(); return;
      }
      if(e.key === 'Backspace'){
        blenderOp.numBuf = blenderOp.numBuf.slice(0, -1);
        blenderApply(); e.preventDefault(); return;
      }
      if(e.key === 'Enter'){ blenderConfirm(); e.preventDefault(); return; }
      if(e.key === 'Escape'){ blenderCancel(); e.preventDefault(); return; }
      // 진행 중 G/R/S 다시 누르면 모드 전환
      if(k === 'g'){ blenderCancel(); blenderStart('grab'); e.preventDefault(); return; }
      if(k === 'r'){ blenderCancel(); blenderStart('rotate'); e.preventDefault(); return; }
      if(k === 's'){ blenderCancel(); blenderStart('scale'); e.preventDefault(); return; }
      return;
    }
    // 변형 시작 (Ctrl 조합은 제외 — 저장/그룹 등 기존 단축키 보존)
    if(!e.ctrlKey && !e.metaKey){
      const k = e.key.toLowerCase();
      if(k === 'g'){ blenderStart('grab'); e.preventDefault(); return; }
      if(k === 'r'){ blenderStart('rotate'); e.preventDefault(); return; }
      if(k === 's'){ blenderStart('scale'); e.preventDefault(); return; }
    }
  }

  if(e.ctrlKey || e.metaKey){
    // v8.18: Shift+Ctrl+Z = redo (Ctrl+Z=undo와 분리)
    if(e.key === 'z' || e.key === 'Z'){
      e.preventDefault();
      if(e.shiftKey) redo();
      else undo();
      return;
    }
    if(e.key === 'y' || e.key === 'Y'){e.preventDefault(); redo(); return}
    if(e.key === 's' || e.key === 'S'){
      e.preventDefault();
      // v8.46: Shift 누르면 스케치 모드에서 SVG 저장
      if(e.shiftKey && state.mode === 'sketch'){
        if(typeof window.sk3ExportSVG === 'function') window.sk3ExportSVG();
      } else {
        saveProject();
      }
      return;
    }
    if(e.key === 'o'){e.preventDefault(); document.getElementById('fileInput').click(); return}
    if(e.key === 'n'){e.preventDefault(); newProject(); return}
    // v8.19: Ctrl+C 복사 (스케치 모드 + 도형 선택 시만, 그 외 기본 동작 허용)
    if((e.key === 'c' || e.key === 'C') && state.mode === 'sketch' && state.selectedShapes && state.selectedShapes.size > 0){
      e.preventDefault(); sk3CopySelection(); return;
    }
    // v8.19: Ctrl+V 붙여넣기 (스케치 모드 + 클립보드 보유 시만)
    if((e.key === 'v' || e.key === 'V') && state.mode === 'sketch' && _sk3Clipboard){
      e.preventDefault(); sk3PasteClipboard(); return;
    }
    // v8.21: Ctrl+A 전체 선택 (스케치 모드)
    if((e.key === 'a' || e.key === 'A') && state.mode === 'sketch'){
      e.preventDefault(); sk3SelectAll(); return;
    }
    if(e.key === 'd'){e.preventDefault(); duplicatePart(); return}
    if(e.key === 'g'){
      e.preventDefault();
      if(e.shiftKey) ungroupPart();
      else groupSelectedParts();
      return;
    }
  }
  // v8.19: 스케치 모드 Shift+H/V/R 단축키 (반전/회전)
  if(state.mode === 'sketch' && e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey){
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if(tag !== 'INPUT' && tag !== 'TEXTAREA'){
      if(e.key === 'H' || e.key === 'h'){ e.preventDefault(); sk3MirrorSel('x'); return; }
      if(e.key === 'V' || e.key === 'v'){ e.preventDefault(); sk3MirrorSel('y'); return; }
      if(e.key === 'R' || e.key === 'r'){ e.preventDefault(); sk3RotateSel(90); return; }
    }
  }
  if(e.key === 'Escape'){
    // v7.1: 측정 모드 우선 종료
    if(state.measureMode){
      if(state.measureFirst){ state.measureFirst = null; setStat('📏 첫 점 취소 — 다시 첫 점을 클릭'); return; }
      toggleMeasureMode(); return;
    }
    // v8.37: 각선 모드 진행 중이면 취소
    if(state.angleLineMode){
      sk3CancelAngleLine();
      return;
    }
    // v8.45: 채움 모드 ON이면 종료
    if(state.fillModeOn){
      sk3ToggleFillMode();
      return;
    }
    // v8.16: 도형 드래그 진행 중이면 원위치 복원
    if(state.dragShape){
      const ds = state.dragShape;
      ds.idxs.forEach((idx, k) => {
        state.shapes[idx] = JSON.parse(JSON.stringify(ds.origs[k]));
      });
      (ds.pinIdxs||[]).forEach((pi, k) => {
        state.penPoints[pi].x = ds.pinOrigs[k].x;
        state.penPoints[pi].y = ds.pinOrigs[k].y;
      });
      state.dragShape = null;
      skCanvas.style.cursor = '';
      redrawSketch(); updateInfo();
      setStat('✗ 도형 이동 취소');
      return;
    }
    // v8.35: 점 드래그(특히 Shift 복사) 진행 중이면 취소
    if(state.dragPoint){
      const dp = state.dragPoint;
      if(dp.copyMode){
        // 복제본 제거, 원본 복귀
        state.penPoints.splice(dp.idx, 1);
        state.penCur = dp.sourceIdx;
        setStat('✗ Shift+복사 취소');
      } else {
        // 일반 드래그: 원위치 복원
        const p = state.penPoints[dp.idx];
        if(p){
          const tol = 0.01;
          const curX = p.x, curY = p.y;
          state.shapes.forEach(s => {
            if(s.type !== 'line') return;
            if(Math.abs(s.x1-curX)<tol && Math.abs(s.y1-curY)<tol){ s.x1=dp.origX; s.y1=dp.origY; }
            if(Math.abs(s.x2-curX)<tol && Math.abs(s.y2-curY)<tol){ s.x2=dp.origX; s.y2=dp.origY; }
          });
          p.x = dp.origX; p.y = dp.origY;
        }
        setStat('✗ 점 이동 취소');
      }
      state.dragPoint = null;
      state._penPreviewWp = null;
      state._lastSnapKind = null;
      skCanvas.style.cursor = '';
      redrawSketch(); updateInfo();
      return;
    }
    // v2.6: 워크플레인 픽 모드 또는 활성 워크플레인 우선 해제
    if(state.workPlanePickMode || state.workPlane){
      clearWorkPlane();
      return;
    }
    state.drawing = null; setTool('select'); hideTransformHandles(); state.parts.forEach(p => p._selected = false); renderPartsList(); updateMultiSelectHighlight(); return;
  }
  if(e.key === 'Delete' || e.key === 'Backspace'){
    // v3.1: 3D 모드 - 다중 선택된 모든 부품 일괄 삭제
    if(state.mode === 'model'){
      const selParts = state.parts.filter(p => p._selected);
      if(selParts.length > 1){
        if(!confirm(selParts.length + '개 부품을 삭제하시겠습니까?')) return;
        // confirm을 한 번만 받도록 deletePartById의 confirm 우회
        const ids = selParts.map(p => p.id);
        ids.forEach(id => {
          const idx = state.parts.findIndex(p => p.id === id);
          if(idx >= 0){
            removePartFromScene(state.parts[idx]);
            state.parts.splice(idx, 1);
          }
        });
        state.selectedPartId = null;
        document.getElementById('selectedPartProp').style.display = 'none';
        const zrp = document.getElementById('zRevolvePanel');
        if(zrp) zrp.style.display = 'none';
        hideTransformHandles();
        renderPartsList();
        updateInfo();
        pushHistory(); // v4.6
        toast('🗑️ ' + ids.length + '개 부품 삭제됨');
        return;
      } else if(selParts.length === 1 || state.selectedPartId){
        // v4.9.2: Del키 단일 삭제는 confirm 없이 즉시 (Ctrl+Z로 복구 가능)
        const id = selParts.length === 1 ? selParts[0].id : state.selectedPartId;
        deletePartById(id, true);
        return;
      }
    }
    // 스케치 모드 또는 3D에서 선택 없으면 스케치 삭제 시도
    deleteSelected();
    return;
  }
  // 3D 모드 단축키 (팅커캐드 스타일)
  if(state.mode === 'model'){
    if(e.key === 'h' || e.key === 'H'){toggleHole(); return}
    if(e.key === 'j' || e.key === 'J'){setSolid(); return}
    if(e.key === 'd' || e.key === 'D'){e.preventDefault(); dropToGround(); return}     // D = 바닥 안착
    if(e.key === 'l' || e.key === 'L'){openAlignModal(); return}                        // L = 정렬
    if(e.key === 'r' || e.key === 'R'){rotate90('y'); return}                           // R = 90도 Y회전
    if(e.key === 'm' || e.key === 'M'){mirrorPart('x'); return}                          // M = 좌우 미러
    if(e.key === 'f' || e.key === 'F'){fitView(); return}                                // F = 전체맞춤
    if(e.key === 't' || e.key === 'T'){openTextModal(); return}                          // T = 텍스트 3D
    // v2.6: W = 워크플레인 (Shift+W = 와이어프레임, 충돌 회피)
    if(e.key === 'w' || e.key === 'W'){
      if(e.shiftKey){toggleWireframe();}
      else {
        // 토글: 이미 픽 모드면 취소, 워크플레인 활성이면 해제, 아니면 픽 모드 진입
        if(state.workPlanePickMode || state.workPlane) clearWorkPlane();
        else startWorkPlanePick();
      }
      return;
    }
    if(e.key === 'g' || e.key === 'G'){toggleGrid(); return}                             // G = 그리드
    // v8.71: 방향키 기본 이동 0.1mm, Shift = 10배(=1mm). 이동단위(moveSnap) 설정 시 그 값 사용
    const base = state.moveSnap > 0 ? state.moveSnap : 0.1;
    const moveStep = e.shiftKey ? base*10 : base;
    if(e.key === 'ArrowLeft'){e.preventDefault(); nudgeSelected(-moveStep, 0, 0); nudgeStat('X', -moveStep); return}
    if(e.key === 'ArrowRight'){e.preventDefault(); nudgeSelected(moveStep, 0, 0); nudgeStat('X', moveStep); return}
    if(e.key === 'ArrowUp'){e.preventDefault(); nudgeSelected(0, 0, -moveStep); nudgeStat('Z', -moveStep); return}
    if(e.key === 'ArrowDown'){e.preventDefault(); nudgeSelected(0, 0, moveStep); nudgeStat('Z', moveStep); return}
    if(e.key === 'PageUp'){e.preventDefault(); nudgeSelected(0, moveStep, 0); nudgeStat('Y(높이)', moveStep); return}
    if(e.key === 'PageDown'){e.preventDefault(); nudgeSelected(0, -moveStep, 0); nudgeStat('Y(높이)', -moveStep); return}
    if(e.key === '?'){showShortcutHelp(); return}
    return;
  }
  if(state.mode === 'sketch'){
    if(e.key === 'l' || e.key === 'L') setTool('line');
    else if(e.key === 'r' || e.key === 'R') setTool('rect');
    else if(e.key === 'c' || e.key === 'C') setTool('circle');
    else if(e.key === 'a' || e.key === 'A') setTool('arc');
    else if(e.key === 'f' || e.key === 'F') setTool('fillet');
    else if(e.key === 's' || e.key === 'S') setTool('select');
    else if(e.key === 'p' || e.key === 'P') setTool('pen');
    else if(e.key === 'g' || e.key === 'G') toggleGrid();
  }
});

document.getElementById('gridSize').addEventListener('change', (e)=>{
  state.gridSize = Math.max(1, parseFloat(e.target.value) || 10);
  redrawSketch();
});

// v8.34: Ctrl 떼면 정밀 격자 OFF
document.addEventListener('keyup', (e)=>{
  if(e.key === 'Control' && state.fineGrid){
    state.fineGrid = null;
    state._lastSnapKind = null;
    redrawSketch();
  }
});

// 창 포커스 이탈 시에도 정밀 격자 해제 (Ctrl이 안 떨어진 상태로 멈춤 방지)
window.addEventListener('blur', () => {
  if(state.fineGrid){
    state.fineGrid = null;
    state._lastSnapKind = null;
    redrawSketch();
  }
});

// v8.25: X기준 입력란 - Enter 키 + 초기 인디케이터 + change 자동 적용
(function initXOriginInput(){
  const el = document.getElementById('xOriginInput');
  if(!el) return;
  el.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); sk3SetXOrigin(); }
  });
  el.addEventListener('change', () => sk3SetXOrigin());
  if(typeof updateXOriginIndicator === 'function') updateXOriginIndicator();
})();

// 휠클릭(중간버튼) 시 브라우저 자동 스크롤(동그란 아이콘) 방지 - CAD 화면이동 전용
(function preventMiddleAutoscroll(){
  const wrap = document.querySelector('.canvas-wrap');
  if(!wrap) return;
  wrap.addEventListener('mousedown', (e)=>{ if(e.button === 1) e.preventDefault(); });
  wrap.addEventListener('auxclick', (e)=>{ if(e.button === 1) e.preventDefault(); });
})();

// ===== v5.6: 기본도형 드래그앤드롭 (팔레트 → 캔버스에 놓기) =====
let _dragKind = null;
function paletteDragStart(kind, evt){
  _dragKind = kind;
  try {
    evt.dataTransfer.setData('text/plain', kind);
    evt.dataTransfer.effectAllowed = 'copy';
  } catch(e){}
}
(function setupShapeDrop(){
  const wrap = document.querySelector('.canvas-wrap');
  if(!wrap) return;
  wrap.addEventListener('dragover', (e)=>{
    if(!_dragKind) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'copy'; } catch(err){}
    wrap.classList.add('drop-target');
  });
  wrap.addEventListener('dragleave', (e)=>{
    // 자식요소로 이동하는 dragleave는 무시
    if(e.target === wrap) wrap.classList.remove('drop-target');
  });
  wrap.addEventListener('drop', (e)=>{
    e.preventDefault();
    wrap.classList.remove('drop-target');
    let kind = _dragKind;
    try { kind = e.dataTransfer.getData('text/plain') || _dragKind; } catch(err){}
    _dragKind = null;
    if(!kind) return;
    if(state.mode !== 'model') switchMode('model');
    // 드롭 좌표 → 바닥평면/부품 윗면 교차점
    const dropPos = screenToGround(e.clientX, e.clientY);
    paletteAdd(kind, null, dropPos);
  });
})();

function init(){
  resizeSkCanvas();
  initThree();
  setTool('select');
  renderPartsList();
  updateInfo();
  redrawSketch();
  setStat('tool3 v8.0 준비됨 · 텍스트모드(커맨드바+명령키보드) + 한붓그리기 통합');
  // v2.2: 항상 3D 모드로 시작 (draw_tool import도 3D 바닥에 표시)
  switchMode('model');
  try {
    if (localStorage.getItem('c3d_import_from_draw_tool')) {
      importFromDrawTool();
    }
  } catch(e){}
  // v4.6: 초기(빈) 상태를 history[0]로 시드 → 첫 도형까지 완전히 되돌리기 가능
  if(state.history.length === 0) pushHistory();
  // 커맨드바 초기화
  initCmdBar();
}
// v7.1.4: 3D 메시 파일 가져오기 (STL 바이너리/아스키, OBJ)
function importMeshFile(event){
  const file = event.target.files[0];
  if(!file) return;
  const name = file.name;
  const ext = (name.split('.').pop() || '').toLowerCase();
  const reader = new FileReader();
  reader.onload = function(e){
    try {
      let geom = null;
      if(ext === 'stl'){
        geom = parseSTL(e.target.result); // ArrayBuffer
      } else if(ext === 'obj'){
        geom = parseOBJ(e.target.result); // text
      } else {
        toast('지원하지 않는 형식입니다 (STL/OBJ만 가능)'); return;
      }
      if(!geom){ toast('파일을 읽지 못했습니다'); return; }
      geom.computeVertexNormals();
      geom.computeBoundingBox();
      // 바닥(Y=0)에 안착 + XZ 중심 정렬
      const bb = geom.boundingBox;
      const cx = (bb.min.x+bb.max.x)/2, cz=(bb.min.z+bb.max.z)/2, minY=bb.min.y;
      geom.translate(-cx, -minY, -cz);
      const baseName = name.replace(/\.(stl|obj)$/i,'');
      const color = '#9aa7b4';
      const mat = makeMaterial(color, 1, 'plastic_matte');
      const mesh = new THREE.Mesh(geom, mat);
      const part = {
        id: state.partIdCounter++, name: baseName, type: 'imported_mesh',
        color: color, opacity: 1, visible: true, material: 'plastic_matte',
        mesh: mesh, _isHole: false,
        params: { imported: true, format: ext }
      };
      state.parts.push(part);
      addPartToScene(part);
      renderPartsList();
      updateInfo();
      switchMode('model');
      fitView();
      pushHistory();
      const sz = bb.getSize ? bb.getSize(new THREE.Vector3()) : {x:0,y:0,z:0};
      toast('✅ 가져오기 완료: ' + baseName + ' (' + (geom.index?geom.index.count/3:geom.attributes.position.count/3) + '면)');
    } catch(err){
      console.error(err);
      toast('가져오기 실패: ' + err.message);
    }
    event.target.value = ''; // 같은 파일 재선택 가능하게
  };
  if(ext === 'stl') reader.readAsArrayBuffer(file);
  else reader.readAsText(file);
}

// STL 파서 (바이너리/아스키 자동 판별) → BufferGeometry
function parseSTL(data){
  const dv = new DataView(data);
  // 아스키 판별: 선두 'solid' + 바이너리 길이 불일치
  const isBinary = (() => {
    if(data.byteLength < 84) return false;
    const nTri = dv.getUint32(80, true);
    const expected = 84 + nTri*50;
    if(expected === data.byteLength) return true;
    // 'solid'로 시작하면 아스키 가능성
    const head = String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3),dv.getUint8(4));
    return head.toLowerCase() !== 'solid';
  })();
  const positions = [];
  if(isBinary){
    const nTri = dv.getUint32(80, true);
    let off = 84;
    for(let i=0;i<nTri;i++){
      off += 12; // normal 건너뜀
      for(let v=0;v<3;v++){
        positions.push(dv.getFloat32(off,true), dv.getFloat32(off+4,true), dv.getFloat32(off+8,true));
        off += 12;
      }
      off += 2; // attribute byte count
    }
  } else {
    const text = new TextDecoder().decode(data);
    const re = /vertex\s+([\-0-9.eE+]+)\s+([\-0-9.eE+]+)\s+([\-0-9.eE+]+)/g;
    let m;
    while((m = re.exec(text)) !== null){
      positions.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
    }
  }
  if(positions.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

// OBJ 파서 (v/f만, 삼각/사각면 지원) → BufferGeometry
function parseOBJ(text){
  const verts = [];
  const positions = [];
  const lines = text.split('\n');
  for(const line of lines){
    const t = line.trim();
    if(t.startsWith('v ')){
      const p = t.split(/\s+/);
      verts.push([parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3])]);
    } else if(t.startsWith('f ')){
      const p = t.split(/\s+/).slice(1);
      // 면 정점 인덱스 (v 또는 v/vt/vn 형식, 음수 인덱스 지원)
      const fi = p.map(tok => {
        let idx = parseInt(tok.split('/')[0]);
        if(idx < 0) idx = verts.length + idx; else idx = idx - 1;
        return idx;
      });
      // 다각형 → 삼각형 팬
      for(let i=1;i<fi.length-1;i++){
        const a=verts[fi[0]], b=verts[fi[i]], c=verts[fi[i+1]];
        if(a&&b&&c) positions.push(a[0],a[1],a[2], b[0],b[1],b[2], c[0],c[1],c[2]);
      }
    }
  }
  if(positions.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return g;
}

/* v2.3: 도형 배열의 바운딩박스 중심을 원점(0,0)으로 이동 */
function centerShapesToOrigin(shapes){
  if(!shapes || shapes.length === 0) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const acc = (x, y) => {
    if(x < minX) minX = x; if(x > maxX) maxX = x;
    if(y < minY) minY = y; if(y > maxY) maxY = y;
  };
  shapes.forEach(s => {
    if(s.type === 'line'){ acc(s.x1, s.y1); acc(s.x2, s.y2); }
    else if(s.type === 'rect'){ acc(s.x1, s.y1); acc(s.x2, s.y2); }
    else if(s.type === 'circle'){ acc(s.cx - s.r, s.cy - s.r); acc(s.cx + s.r, s.cy + s.r); }
    else if(s.type === 'arc'){
      // 안전하게 원호의 외접 정사각형으로 근사
      acc(s.cx - s.r, s.cy - s.r); acc(s.cx + s.r, s.cy + s.r);
    }
  });
  if(!isFinite(minX) || !isFinite(maxX)) return;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  if(Math.abs(cx) < 0.001 && Math.abs(cy) < 0.001) return; // 이미 원점 근처
  // 모든 점을 -cx, -cy 평행이동
  shapes.forEach(s => {
    if(s.type === 'line'){ s.x1 -= cx; s.y1 -= cy; s.x2 -= cx; s.y2 -= cy; }
    else if(s.type === 'rect'){ s.x1 -= cx; s.y1 -= cy; s.x2 -= cx; s.y2 -= cy; }
    else if(s.type === 'circle' || s.type === 'arc'){ s.cx -= cx; s.cy -= cy; }
  });
  console.log('[draw_tool3] 도형 중심을 원점으로 이동:', {dx: -cx.toFixed(2), dy: -cy.toFixed(2), bbox: {minX, maxX, minY, maxY}});
}

/* ===== draw_tool.html → C3D 도형 import ===== */
function importFromDrawTool(){
  let payload = null;
  try {
    const raw = localStorage.getItem('c3d_import_from_draw_tool');
    if (!raw) return;
    payload = JSON.parse(raw);
  } catch(e) { return; }
  if (!payload || !payload.shapes || !payload.shapes.length) return;

  const incoming = payload.shapes.slice();

  // v4.7: draw_tool 좌표는 픽셀 단위 → mm로 변환 (기본 1mm = 45px)
  //   payload.pixelsPerMm 이 오면 그 값을, 없으면 45를 사용
  const PPM = (payload.pixelsPerMm && payload.pixelsPerMm > 0) ? payload.pixelsPerMm : 45;
  if(PPM !== 1){
    const k = 1 / PPM;
    incoming.forEach(s => {
      if(s.type === 'line' || s.type === 'rect'){
        s.x1 *= k; s.y1 *= k; s.x2 *= k; s.y2 *= k;
      } else if(s.type === 'circle' || s.type === 'arc'){
        // 각도(startAngle/endAngle)는 단위와 무관 → 변환 안 함
        s.cx *= k; s.cy *= k; s.r *= k;
      }
    });
    console.log('[draw_tool3] 픽셀→mm 변환 적용: 1mm =', PPM, 'px');
  }

  // 도형을 현재 스케치에 누적이 아닌 "치환" 여부 확인
  let doReplace = true;
  if (state.shapes.length > 0) {
    doReplace = confirm(
      'draw_tool에서 ' + incoming.length + '개 도형이 도착했습니다.\n\n' +
      '확인 = 기존 스케치 지우고 가져오기\n' +
      '취소 = 무시 (다음에 다시 시도)\n\n' +
      '⚠️ 누적은 새로 그린 도형이 있을 때 권장하지 않습니다.'
    );
    if (!doReplace) return;
  }

  // v2.3: 도면을 원점(0,0) 중심으로 자동 평행이동
  //   - draw_tool의 캔버스 좌표(예: 400, 300)가 그대로 들어오면
  //     회전체 생성 시 도면이 원점에서 멀리 떨어져 도넛/원반만 나옴
  //   - 도형 전체 바운딩박스 중심을 (0,0)에 맞추면 회전축/돌출이 도면 중심에 정렬
  centerShapesToOrigin(incoming);

  pushHistory();
  state.shapes = incoming;
  state.selectedShapes.clear();

  // v2.8: draw_tool에서 가져온 2D 도형을 XY 평면(Z=0)에 세로로 세움
  //        바닥이 Y=0에 닿고 X 중심이 0 (정면도에서 자연스럽게 보임)
  switchMode('model');
  // v4.8: 미리보기 대신 0.01mm 두께의 얇은 솔리드 부품으로 변환
  const thin = makeThinSolidsFromShapes(incoming, 0.01);
  // 정면도로 보면 도면이 평면 그대로 보임
  setView('front');
  fitView(true);  // 시점 유지하고 거리만 조정

  renderPartsList();
  redrawSketch();
  updateInfo();

  // 한 번 import 후 localStorage 제거 (재진입 시 중복 방지)
  try { localStorage.removeItem('c3d_import_from_draw_tool'); } catch(e){}

  if(thin){
    toast('📥 draw_tool 도형 ' + incoming.length + '개 → 0.01mm 두께 솔리드 생성');
    setStat('✅ 0.01mm 단면 솔리드 생성됨 → [🔄 회전체]로 회전 가능');
  } else {
    toast('📥 draw_tool 도형 ' + incoming.length + '개 가져옴 (닫힌 단면 없음)');
    setStat('⚠️ 솔리드 변환 실패: 닫힌 도형(사각/원/닫힌 선)이 필요합니다');
  }
}

/* 가져온 도형 전체가 화면에 들어오도록 자동 fit */
function fitSketchToShapes(){
  if (!state.shapes.length) return;
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  state.shapes.forEach(s=>{
    if (s.type === 'line' || s.type === 'rect') {
      minX = Math.min(minX, s.x1, s.x2);
      maxX = Math.max(maxX, s.x1, s.x2);
      minY = Math.min(minY, s.y1, s.y2);
      maxY = Math.max(maxY, s.y1, s.y2);
    } else if (s.type === 'circle') {
      minX = Math.min(minX, s.cx - s.r);
      maxX = Math.max(maxX, s.cx + s.r);
      minY = Math.min(minY, s.cy - s.r);
      maxY = Math.max(maxY, s.cy + s.r);
    } else if (s.type === 'arc') {
      minX = Math.min(minX, s.cx - s.r);
      maxX = Math.max(maxX, s.cx + s.r);
      minY = Math.min(minY, s.cy - s.r);
      maxY = Math.max(maxY, s.cy + s.r);
    }
  });
  if (!isFinite(minX)) return;
  const w = maxX - minX, h = maxY - minY;
  if (w <= 0 && h <= 0) return;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // 캔버스 크기에 80% 차도록
  const padding = 0.8;
  const pxW = skCanvas.width * padding;
  const pxH = skCanvas.height * padding;
  const sx = pxW / Math.max(1, w);
  const sy = pxH / Math.max(1, h);
  state.pixelsPerMm = Math.max(0.1, Math.min(200, Math.min(sx, sy)));
  // 중심을 원점에 오도록 패닝
  state.panX = -cx * state.pixelsPerMm;
  state.panY = cy * state.pixelsPerMm; // Y 반전 좌표계
}

window.addEventListener('load', init);

// ─── 커맨드바/명령키보드 토글 (툴바 버튼용) ─────────────────
window.sk3ToggleCmdBar = function() {
  let bar = document.getElementById('sk3CmdBar');
  if (!bar) {
    // 아직 초기화 안 됐으면 지금 초기화
    if (typeof initCmdBar === 'function') initCmdBar();
    bar = document.getElementById('sk3CmdBar');
  }
  if (!bar) return;
  if (bar.style.display === 'none') {
    bar.style.display = 'flex';
    const b=document.getElementById('btn-cmdbar'); if(b) b.classList.add('on');
    toast('💬 명령창 표시');
  } else {
    bar.style.display = 'none';
    const b=document.getElementById('btn-cmdbar'); if(b) b.classList.remove('on');
    toast('💬 명령창 숨김');
  }
};

window.sk3ToggleCmdKb = function() {
  let panel = document.getElementById('sk3KbPanel');
  let openBtn = document.getElementById('sk3KbOpenBtn');
  if (!panel) {
    if (typeof initCmdKeyboard === 'function') initCmdKeyboard();
    panel = document.getElementById('sk3KbPanel');
    openBtn = document.getElementById('sk3KbOpenBtn');
  }
  if (!panel) return;
  const visible = panel.style.display === 'flex';
  panel.style.display = visible ? 'none' : 'flex';
  if (openBtn) openBtn.style.display = visible ? '' : 'none';
  const kb=document.getElementById('btn-cmdkb'); if(kb) kb.classList.toggle('on', !visible);
  toast(visible ? '⌨ 명령 키보드 닫음' : '⌨ 명령 키보드 열림');
};

// 안전망: load 이벤트가 이미 발생한 경우 (지연 로드 시) 즉시 초기화
if (document.readyState === 'complete') {
  setTimeout(function() {
    if (!document.getElementById('sk3CmdBar') && typeof initCmdBar === 'function') {
      try { initCmdBar(); } catch(e) { console.error('initCmdBar 실패:', e); }
    }
  }, 100);
}



/* ============================================================
   draw_tool3 커맨드바 (텍스트 모드) 접목  v1.0
   ============================================================ */

let _cmdHistory = [], _cmdHistIdx = -1, _lastCmd = '';
// v8.15: 현재 활성화된 명령 입력창 (점번호 자동입력용)
let _cmdInputActive = null;

function _syncCmdBuffers(val){
  const a = document.getElementById('sk3CmdInput');
  const b = document.getElementById('sk3KbInput');
  if(a) a.value = val;
  if(b) b.value = val;
}

// v8.15: 스케치 점 클릭 → 명령창에 점번호 삽입
window.sk3InsertPointToCmd = function(idx){
  const inp = _cmdInputActive;
  if(!inp) return false;
  let val = inp.value;
  // 끝이 공백이 아니면 공백 추가, 끝나는 부분이 키워드(좌/우 등)면 이미 공백있음
  if(val && !/\s$/.test(val)) val += ' ';
  val += String(idx) + ' ';
  _syncCmdBuffers(val);
  // 포커스 유지 (캔버스 mousedown으로 흩어진 포커스 회복)
  setTimeout(() => {
    try { inp.focus(); inp.setSelectionRange(val.length, val.length); } catch(e){}
  }, 0);
  if(typeof skCmdLog === 'function') skCmdLog('  📍 P' + idx + ' 점번호 삽입', 'sys');
  // 시각 표시 (반짝)
  inp.style.boxShadow = '0 0 0 2px #f39c12';
  setTimeout(() => { inp.style.boxShadow = ''; }, 350);
  return true;
};

// v8.15: 명령창 활성화 해제 (Run/Esc/외부 클릭 시)
window.sk3ClearCmdActive = function(){ _cmdInputActive = null; };

function skCmdLog(text, cls) {
  const hist = document.getElementById('sk3CmdHistory');
  if (!hist) return;
  const div = document.createElement('div');
  div.className = 'sk3-cmd-line' + (cls ? ' ' + cls : '');
  div.textContent = text;
  hist.appendChild(div);
  hist.scrollTop = hist.scrollHeight;
  while (hist.children.length > 150) hist.removeChild(hist.firstChild);
}

function evalSk3Expr(s) {
  try {
    s = String(s).replace(/[^0-9+\-*/.()]/g,'');
    if (!s) return NaN;
    return Function('"use strict";return (' + s + ')')();
  } catch(e) { return NaN; }
}

// v8.74: 펜점들을 부드럽게 통과하는 스플라인(센트리페탈 Catmull-Rom)으로 변환
//   펜점 순서대로 곡선을 만들고, 잘게 분할해 line 세그먼트로 추가. 기존 직선 체인은 제거.
window.sk3SmoothSpline = function(subdivPerSpan){
  const pts = state.penPoints ? state.penPoints.slice() : [];
  if(pts.length < 3){ toast('스플라인: 펜점이 3개 이상 필요합니다 (순서대로)'); return; }
  const tol = 0.05;
  const same = (a,b,c,d) => Math.abs(a-c)<tol && Math.abs(b-d)<tol;
  const lineBetween = (p,q) => state.shapes.findIndex(s => s.type==='line' &&
      ((same(s.x1,s.y1,p.x,p.y)&&same(s.x2,s.y2,q.x,q.y))||(same(s.x1,s.y1,q.x,q.y)&&same(s.x2,s.y2,p.x,p.y))));
  // 닫힘 여부: 마지막↔처음 연결선 존재?
  const n = pts.length;
  const closed = lineBetween(pts[n-1], pts[0]) >= 0;

  pushHistory();

  // 기존 체인 직선 제거 (연속 펜점 쌍 + 닫힘선)
  const toRemove = [];
  for(let i=0;i<n-1;i++){ const idx=lineBetween(pts[i],pts[i+1]); if(idx>=0) toRemove.push(idx); }
  if(closed){ const idx=lineBetween(pts[n-1],pts[0]); if(idx>=0) toRemove.push(idx); }
  toRemove.sort((a,b)=>b-a).forEach(i=>{ if(i>=0) state.shapes.splice(i,1); });

  // 센트리페탈 Catmull-Rom 샘플러
  const lerp = (a,b,t) => ({x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t});
  const alpha = 0.5;
  function spanSamples(p0,p1,p2,p3,sub){
    const tj=(ti,a,b)=>{ const d=Math.hypot(b.x-a.x,b.y-a.y); return Math.pow(Math.max(d,1e-6),alpha)+ti; };
    const t0=0, t1=tj(t0,p0,p1), t2=tj(t1,p1,p2), t3=tj(t2,p2,p3);
    const out=[];
    for(let k=1;k<=sub;k++){
      const t = t1 + (t2-t1)*(k/sub);
      const A1=lerp(p0,p1,(t-t0)/(t1-t0));
      const A2=lerp(p1,p2,(t-t1)/(t2-t1));
      const A3=lerp(p2,p3,(t-t2)/(t3-t2));
      const B1=lerp(A1,A2,(t-t0)/(t2-t0));
      const B2=lerp(A2,A3,(t-t1)/(t3-t1));
      out.push(lerp(B1,B2,(t-t1)/(t2-t1)));
    }
    return out;
  }
  const at = i => pts[(i%n+n)%n];
  const curvePts = [ {x:pts[0].x, y:pts[0].y} ];
  const lastSeg = closed ? n : n-1;
  for(let i=0;i<lastSeg;i++){
    const p1 = at(i), p2 = at(i+1);
    const p0 = closed ? at(i-1) : at(Math.max(0,i-1));
    const p3 = closed ? at(i+2) : at(Math.min(n-1,i+2));
    const dist = Math.hypot(p2.x-p1.x, p2.y-p1.y);
    const sub = subdivPerSpan || Math.max(6, Math.min(40, Math.round(dist/1.5)));
    spanSamples(p0,p1,p2,p3,sub).forEach(pt => curvePts.push(pt));
  }

  // 곡선 점들 사이를 line 세그먼트로 연결
  const color = (document.getElementById('sketchColor')||{}).value || '#000000';
  const lw = parseInt((document.getElementById('lineWidth')||{}).value) || 2;
  let added = 0;
  for(let i=0;i<curvePts.length-1;i++){
    const a=curvePts[i], b=curvePts[i+1];
    if(Math.hypot(b.x-a.x,b.y-a.y) < 1e-4) continue;
    state.shapes.push({type:'line', x1:a.x, y1:a.y, x2:b.x, y2:b.y, color, lineWidth:lw, _spline:true});
    added++;
  }

  redrawSketch();
  toast('🌊 스플라인 변환: 펜점 ' + n + '개 → 부드러운 곡선(' + added + '세그먼트)' + (closed?' · 닫힘':''));
  if(typeof skCmdLog === 'function') skCmdLog('  🌊 스플라인: P0~P'+(n-1)+' 부드럽게 통과 (세그먼트 '+added+')'+(closed?' 닫힘':''), 'sys');
};

function sk3ExecuteCmd(raw) {
  raw = raw.trim();
  if (!raw) {
    if (_lastCmd) { skCmdLog('명령 반복: ' + _lastCmd, 'user'); sk3ExecuteCmd(_lastCmd); }
    return;
  }  if (_cmdHistory[0] !== raw) _cmdHistory.unshift(raw);
  if (_cmdHistory.length > 50) _cmdHistory.pop();
  _cmdHistIdx = -1;

  const upper = raw.toUpperCase().trim();
  skCmdLog('▶ ' + raw, 'user');

  const toolMap = {
    'L':'line','LINE':'line',
    'R':'rect','REC':'rect','RECT':'rect',
    'C':'circle','CIRCLE':'circle','CIR':'circle',
    'A':'arc','ARC':'arc',
    'F':'fillet','FILLET':'fillet',
    'S':'select','SEL':'select','SELECT':'select',
    'P':'pen','PEN':'pen','펜':'pen',
    'ESC':'select'
  };
  if (toolMap[upper]) {
    setTool(toolMap[upper]);
    skCmdLog('  → ' + upper + ' 도구 활성화', 'sys');
    _lastCmd = upper;
    return;
  }

  const toks = raw.replace(/,/g,' ').trim().split(/\s+/);
  const key = toks[0].toUpperCase();
  const nums = toks.slice(1).map(t => evalSk3Expr(t));
  const col = () => document.getElementById('sketchColor').value || '#000000';
  const lw = () => parseInt(document.getElementById('lineWidth').value)||2;

  if ((key==='RECT'||key==='REC'||key==='사각형'||key==='BASE') && nums.length >= 2) {
    let x1,y1,x2,y2;
    if (nums.length >= 4 && nums.every(isFinite)) {
      x1=nums[0]-nums[2]/2; y1=nums[1]-nums[3]/2; x2=nums[0]+nums[2]/2; y2=nums[1]+nums[3]/2;
    } else if (nums.every(isFinite)) {
      x1=-nums[0]/2; y1=-nums[1]/2; x2=nums[0]/2; y2=nums[1]/2;
    } else { skCmdLog('  ⚠ 숫자 오류', 'err'); return; }
    pushHistory();
    state.shapes.push({type:'rect',x1,y1,x2,y2,color:col(),lineWidth:lw()});
    redrawSketch(); updateInfo();
    const W=nums.length>=4?nums[2]:nums[0], H=nums.length>=4?nums[3]:nums[1];
    skCmdLog('  ▭ 사각형 '+W+'×'+H+'mm 생성', 'sys');
    _lastCmd = raw; return;
  }

  if ((key==='LINE'||key==='선') && nums.length >= 4 && nums.every(isFinite)) {
    pushHistory();
    state.shapes.push({type:'line',x1:nums[0],y1:nums[1],x2:nums[2],y2:nums[3],color:col(),lineWidth:lw()});
    redrawSketch(); updateInfo();
    skCmdLog('  ／ 선 ('+nums[0]+','+nums[1]+')→('+nums[2]+','+nums[3]+')mm', 'sys');
    _lastCmd = raw; return;
  }

  if ((key==='HLINE'||key==='가로선') && nums.length >= 1 && isFinite(nums[0])) {
    let cx=0,cy=0,L=nums[0];
    if(nums.length>=3 && nums.every(isFinite)){cx=nums[0];cy=nums[1];L=nums[2];}
    pushHistory();
    state.shapes.push({type:'line',x1:cx-L/2,y1:cy,x2:cx+L/2,y2:cy,color:col(),lineWidth:lw()});
    redrawSketch(); updateInfo();
    skCmdLog('  ― 가로선 '+L+'mm', 'sys');
    _lastCmd = raw; return;
  }

  if ((key==='VLINE'||key==='세로선') && nums.length >= 1 && isFinite(nums[0])) {
    let cx=0,cy=0,L=nums[0];
    if(nums.length>=3 && nums.every(isFinite)){cx=nums[0];cy=nums[1];L=nums[2];}
    pushHistory();
    state.shapes.push({type:'line',x1:cx,y1:cy-L/2,x2:cx,y2:cy+L/2,color:col(),lineWidth:lw()});
    redrawSketch(); updateInfo();
    skCmdLog('  ｜ 세로선 '+L+'mm', 'sys');
    _lastCmd = raw; return;
  }

  if ((key==='CIRCLE'||key==='원'||key==='CIR') && nums.length >= 1) {
    let cx=0,cy=0,d=nums[0];
    if(nums.length>=3 && isFinite(nums[2])){ cx=nums[0]; cy=nums[1]; d=nums[2]; }
    if(!isFinite(d)||d<=0){ skCmdLog('  ⚠ 지름 오류', 'err'); return; }
    pushHistory();
    state.shapes.push({type:'circle',cx,cy,r:d/2,color:col(),lineWidth:lw()});
    redrawSketch(); updateInfo();
    skCmdLog('  ○ 원 Ø'+d+'mm ('+cx+','+cy+')', 'sys');
    _lastCmd = raw; return;
  }

  if ((key==='ARC'||key==='호') && nums.length >= 5 && nums.every(isFinite)) {
    pushHistory();
    state.shapes.push({type:'arc',cx:nums[0],cy:nums[1],r:nums[2],
      startAngle:nums[3]*Math.PI/180, endAngle:nums[4]*Math.PI/180,
      color:col(), lineWidth:lw()});
    redrawSketch(); updateInfo();
    skCmdLog('  ⌒ 호 R'+nums[2]+'mm '+nums[3]+'°→'+nums[4]+'°', 'sys');
    _lastCmd = raw; return;
  }

  if ((key==='FILLET'||key==='필렛') && nums.length >= 1 && isFinite(nums[0])) {
    setTool('fillet');
    skCmdLog('  ⌣R 필렛 모드 R='+nums[0]+'mm · 선 2개 드래그 선택', 'sys');
    toast('필렛 R'+nums[0]+'mm · 선 2개 드래그로 선택하세요');
    _lastCmd = raw; return;
  }

  if (key==='CLR'||key==='CLEAR'||key==='전체삭제') {
    clearSketch(); skCmdLog('  🗑 스케치 전체 삭제', 'sys'); return;
  }
  if (key==='UNDO'||key==='U'||key==='백') {
    undo(); skCmdLog('  ↶ 실행 취소', 'sys'); return;
  }
  if (key==='REDO'||key==='Y') {
    redo(); skCmdLog('  ↷ 다시 실행', 'sys'); return;
  }
  if (key==='3D'||key==='MODEL') { switchMode('model'); skCmdLog('  → 3D 모드', 'sys'); return; }
  if (key==='2D'||key==='SKETCH') { switchMode('sketch'); skCmdLog('  → 스케치 모드', 'sys'); return; }

  if (key==='ZOOM' && nums.length>=1 && isFinite(nums[0]) && nums[0]>0) {
    state.pixelsPerMm = Math.max(0.1, Math.min(200, nums[0]));
    redrawSketch();
    skCmdLog('  🔍 줌 '+nums[0]+'px/mm', 'sys'); return;
  }

  if (key==='?'||key==='HELP'||key==='도움말') {
    skCmdLog('─── 도형 생성 ─────────────────────────────', 'sys');
    skCmdLog('  RECT W H              사각형 (원점 중심)', 'help');
    skCmdLog('  RECT X Y W H          사각형 (중심 지정)', 'help');
    skCmdLog('  LINE x1 y1 x2 y2      선분', 'help');
    skCmdLog('  HLINE [X Y] L         가로선 길이 L mm', 'help');
    skCmdLog('  VLINE [X Y] L         세로선 길이 L mm', 'help');
    skCmdLog('  CIRCLE [X Y] D        원 지름 D mm', 'help');
    skCmdLog('  ARC cx cy R 시작° 끝° 호', 'help');
    skCmdLog('  FILLET R              필렛 드래그 모드', 'help');
    skCmdLog('─── 한붓그리기 (점번호 자동) ──────────────', 'sys');
    skCmdLog('  우/좌/상/하 D          방향 D mm 선 + 점 추가', 'help');
    skCmdLog('  우/좌/상/하 교점       방향으로 첫 교점까지 선', 'help');
    skCmdLog('  각 A D / 각 A 교점     각도°+거리 또는 교점까지', 'help');
    skCmdLog('  점 N                   N번 점을 현재점으로 선택', 'help');
    skCmdLog('  점 X,Y                 좌표에 새 점', 'help');
    skCmdLog('  점 우 3 [하 5]         방향+거리에 독립 점', 'help');
    skCmdLog('  연결 N1 N2 / 선 N1 N2  두 점 직선 연결', 'help');
    skCmdLog('  닫기                   현재점 → P0 연결', 'help');
    skCmdLog('  선택 N                 현재점을 N번으로 이동', 'help');
    skCmdLog('  시작 X Y               P0 좌표 설정', 'help');
    skCmdLog('  백 / 점초기화          백=취소 / 점번호 리셋', 'help');
    skCmdLog('  라벨토글               점 번호 표시 ON/OFF', 'help');
    skCmdLog('─── 기준점 ──────────────────────────────', 'sys');
    skCmdLog('  기준 X Y               (X,Y)에 기준점(노란⊕)', 'help');
    skCmdLog('  기준 방향 D            현 기준점에서 방향D 이동', 'help');
    skCmdLog('  기준 지름 D1 D2        (-D1/2, D2)에 기준점', 'help');
    skCmdLog('  기준해제               기준점 제거', 'help');
    skCmdLog('─── 편집 ────────────────────────────────', 'sys');
    skCmdLog('  이동 N 방향 D          N번 점 이동(연결 선도)', 'help');
    skCmdLog('  이동 방향 D            현재점 이동', 'help');
    skCmdLog('  거리두기 N1 N2 좌/우 D 평행복제 (N1→N2 기준)', 'help');
    skCmdLog('  알 N R / 알 N1 N2 R    점 교점에 필렛 R', 'help');
    skCmdLog('  모따기 N R             교점 C모따기 (직선)', 'help');
    skCmdLog('─── 연장 ────────────────────────────────', 'sys');
    skCmdLog('  연장 N1 N2 D           N2 방향으로 D 연장', 'help');
    skCmdLog('  연장 N1 N2 교점        N2 방향 첫 교점까지', 'help');
    skCmdLog('  줄이기 N1 N2 D         N2쪽에서 D mm 축소', 'help');
    skCmdLog('─── 절교/절각 ───────────────────────────', 'sys');
    skCmdLog('  절교 N1 N2 N3 수직/수평  N1→N2 연장↔N3선', 'help');
    skCmdLog('  절교 N 방향 수평/수직 N2  N에서 방향↔N2선', 'help');
    skCmdLog('  절각 N A N2 수직/수평    N에서 A°↔N2선', 'help');
    skCmdLog('─── 참조 ────────────────────────────────', 'sys');
    skCmdLog('  교점                   모든 교차점 자동 번호', 'help');
    skCmdLog('  만남 N1 N2             두 선 무한교점 번호', 'help');
    skCmdLog('  라벨 / 번호            선 끝점 자동 번호', 'help');
    skCmdLog('  정리 [N]               점+짧은선 일괄삭제(≤N)', 'help');
    skCmdLog('─── 자동·도구 ────────────────────────────', 'sys');
    skCmdLog('  교차 / 분할            모든 선 교차점에서 자동 분할', 'help');
    skCmdLog('  채움 [#hex]            선택된 도형에 채움 색상', 'help');
    skCmdLog('  외곽선                 선택된 선들 끝점 자동 라벨', 'help');
    skCmdLog('  쓸어지우기 / WIPE      드래그 박스 안 도형 일괄 삭제', 'help');
    skCmdLog('  삼각형 W [X Y rot°]    정삼각형', 'help');
    skCmdLog('  두께 N1 N2 좌/우       N1→N2 평행, 두께값(툴바)만큼', 'help');
    skCmdLog('─── 마우스 ─────────────────────────────', 'sys');
    skCmdLog('  도형 더블클릭         색·두께·크기·삭제 모달', 'help');
    skCmdLog('  점 더블클릭           좌표 직접 입력 (연결 선 함께 이동)', 'help');
    skCmdLog('  ⚡ 연결 ON + 휠클릭×2 두 점 선으로 연결 (자동 OFF)', 'help');
    skCmdLog('─── 도구 단축키 ───────────────────────────', 'sys');
    skCmdLog('  L=선  R=사각형  C=원  A=호  P=✎펜  F=필렛  S=선택', 'help');
    skCmdLog('─── 기타 ──────────────────────────────────', 'sys');
    skCmdLog('  UNDO/U  REDO/Y  CLR  ZOOM N  2D  3D', 'help');
    skCmdLog('  : 또는 / 키 → 커맨드창 포커스', 'help');
    skCmdLog('─── v8.15 신규 ────────────────────────────', 'sys');
    skCmdLog('  📍 명령창 포커스 시 점 클릭 → 점번호 자동 삽입', 'help');
    skCmdLog('  🧮 수식 지원: RECT =100+20 =50/2 · 30+40 · 100/2', 'help');
    skCmdLog('  ÷2 버튼: 끝 토큰을 반값으로 (100 → 50)', 'help');
    skCmdLog('  📐 선 속성: 절대각도(0~360°) 표시', 'help');
    skCmdLog('  📐 점 속성: 연결된 선들의 절대각도 목록 표시', 'help');
    skCmdLog('─── v8.16 신규 ────────────────────────────', 'sys');
    skCmdLog('  🤚 도형 드래그 이동 (선택도구 👆 상태에서)', 'help');
    skCmdLog('     · 점 위 = 점 드래그, 도형 위 = 도형 드래그', 'help');
    skCmdLog('     · 다중선택 후 드래그 = 그룹 이동', 'help');
    skCmdLog('     · 끝점 일치하는 펜점도 함께 이동 (연결 유지)', 'help');
    skCmdLog('     · ESC = 이동 취소(원위치)', 'help');
    skCmdLog('  🧹 도구바 정리: 선/사각/원/호/펜/필렛 버튼 제거', 'help');
    skCmdLog('     · 그리기는 스케치 메뉴, 명령창, ⌨ 키보드 이용', 'help');
    skCmdLog('─── v8.17 신규 ────────────────────────────', 'sys');
    skCmdLog('  🌀 신규 필렛 V2 (스케치 메뉴): 가상 교점 기반', 'help');
    skCmdLog('     · 두 선 미리 선택 → 메뉴 → R 입력', 'help');
    skCmdLog('     · 두 선이 안 만나도 OK (필요시 자동 연장/잘라내기)', 'help');
    skCmdLog('  ✂ 모따기 / Chamfer (스케치 메뉴): 가상 교점 기반', 'help');
    skCmdLog('     · 두 선 미리 선택 → 메뉴 → D 입력', 'help');
    skCmdLog('     · 비대칭: "5,10" (선1=5mm, 선2=10mm)', 'help');
    skCmdLog('─── v8.18 신규 ────────────────────────────', 'sys');
    skCmdLog('  ↶ Ctrl+Z = 1단계 되돌리기 · ↷ Shift+Ctrl+Z = 1단계 재실행', 'help');
    skCmdLog('     · Ctrl+Y도 재실행 (동일)', 'help');
    skCmdLog('     · 히스토리 200단계 보관, 한 단계도 건너뜀 없음', 'help');
    skCmdLog('  ⊞ 교차 분할: 모든 도형 지원 (line/rect/circle/arc)', 'help');
    skCmdLog('     · rect → 4 line 분해 후 분할', 'help');
    skCmdLog('     · circle → 호 조각들로 분할 (교차점 없으면 그대로)', 'help');
    skCmdLog('     · arc → 더 작은 arc 조각들로 분할', 'help');
    skCmdLog('─── v8.19 신규 ────────────────────────────', 'sys');
    skCmdLog('  📋 Ctrl+C 복사 · 📌 Ctrl+V 붙여넣기 (+10,+10 오프셋)', 'help');
    skCmdLog('     · 선택된 도형 + 일치 펜점 함께 복사', 'help');
    skCmdLog('     · 붙여넣은 도형 자동 선택 (바로 드래그 가능)', 'help');
    skCmdLog('  ↔ Shift+H 좌우반전 · ↕ Shift+V 상하반전', 'help');
    skCmdLog('     · 선택 도형 바운딩박스 중심 기준', 'help');
    skCmdLog('  🔄 Shift+R 90° 회전 (시계반대) · 메뉴에서 ±90/180/임의', 'help');
    skCmdLog('     · 90°의 배수면 rect 유지, 그 외엔 line으로 분해', 'help');
    skCmdLog('─── v8.21 신규 ────────────────────────────', 'sys');
    skCmdLog('  🔘 Ctrl+A 전체 선택 (스케치 모드 모든 도형)', 'help');
    skCmdLog('  📄 Ctrl+N 새 프로젝트 (도형+펜점+히스토리 완전 초기화)', 'help');
    skCmdLog('  🗑 Del: 도형 삭제 시 고아 펜점도 자동 정리', 'help');
    skCmdLog('     · 다른 도형 끝점과도 연결된 점은 보존', 'help');
    skCmdLog('─── v8.23/24/25 신규 ─────────────────────', 'sys');
    skCmdLog('  📍 X기준 입력란 (도구바): 표시 X의 0점을 임의 값으로 (음수 OK)', 'help');
    skCmdLog('     · 도형은 안 움직이고 화면 표시/속성 패널만 보정', 'help');
    skCmdLog('     · 수식 가능 (=50, -30, 100/2) / 더블클릭=계산기', 'help');
    skCmdLog('  🪐 라이브 접선 스냅 (도구바 🪐 버튼)', 'help');
    skCmdLog('     · ON 상태에서 원/호 드래그 → 가까운 선에 자동 접선', 'help');
    skCmdLog('  ⊙ 원을 두 선에 접선 (스케치 메뉴)', 'help');
    skCmdLog('  🧬 겹친 선 통합 (메뉴/명령창 "통합")', 'help');
    skCmdLog('─── v8.28 신규 ────────────────────────────', 'sys');
    skCmdLog('  🧮 계산기 모달 (속성 패널 number input 클릭 시 자동)', 'help');
    skCmdLog('     · 4칙연산, ÷2/×2/×10/÷10, 1/x, x², √, ±, %, MC/MR/M+/M-/MS', 'help');
    skCmdLog('     · 키보드 입력: 숫자, +-*/, Enter=적용, Esc=취소, BS=⌫, Del=CE', 'help');
    skCmdLog('     · 도구바(격자/X기준)는 더블클릭으로 계산기 (직접 타이핑 보존)', 'help');
    return;
  }


  // ─── 한붓그리기(Pen) 명령 처리 ───────────────────────
  // 헬퍼: 방향 단위벡터 (world좌표: Y+가 위)
  function _penDir(d){
    return {'우':{x:1,y:0},'좌':{x:-1,y:0},'상':{x:0,y:1},'하':{x:0,y:-1},
            'R':{x:1,y:0},'L':{x:-1,y:0},'U':{x:0,y:1},'D':{x:0,y:-1}}[d];
  }
  function _isDir(d){ return ['우','좌','상','하','R','L','U','D'].includes(d); }
  function _penAddPt(x,y){
    state.penPoints.push({x:x, y:y});
    state.penCur = state.penPoints.length - 1;
    return state.penCur;
  }
  function _penEnsureStart(){
    if(state.penPoints.length === 0){
      state.penPoints.push({x:0, y:0});
      state.penCur = 0;
    }
    if(state.penCur < 0) state.penCur = 0;
  }
  function _penCurPt(){ return state.penPoints[state.penCur]; }
  // 반직선 ray vs 선분: 가장 가까운 t>0 교점 반환 (없으면 null)
  function _penRayFirstHit(px,py,ux,uy){
    let bestT = Infinity, hit = null;
    state.shapes.forEach(s => {
      if(s.type !== 'line') return;
      // 선분 (s.x1,s.y1)-(s.x2,s.y2)와 ray 교차
      const dx = s.x2-s.x1, dy = s.y2-s.y1;
      const denom = ux*dy - uy*dx;
      if(Math.abs(denom) < 1e-9) return;
      const t = ((s.x1-px)*dy - (s.y1-py)*dx) / denom;
      const u = ((s.x1-px)*uy - (s.y1-py)*ux) / denom;
      if(t > 1e-4 && u >= -1e-4 && u <= 1+1e-4){
        if(t < bestT){ bestT = t; hit = {x: px+ux*t, y: py+uy*t, t}; }
      }
    });
    // 원/호 ray 교차도 간단히 처리 (원만)
    state.shapes.forEach(s => {
      if(s.type !== 'circle') return;
      // ray (px,py) + t*(ux,uy) vs circle (cx,cy,r)
      const fx = px - s.cx, fy = py - s.cy;
      const a = ux*ux + uy*uy;
      const b = 2*(fx*ux + fy*uy);
      const c = fx*fx + fy*fy - s.r*s.r;
      const disc = b*b - 4*a*c;
      if(disc < 0) return;
      const sd = Math.sqrt(disc);
      [(-b-sd)/(2*a), (-b+sd)/(2*a)].forEach(t => {
        if(t > 1e-4 && t < bestT){
          bestT = t; hit = {x: px+ux*t, y: py+uy*t, t};
        }
      });
    });
    return hit;
  }
  // 점 좌표 가져오기 (인덱스 또는 N번)
  function _penGetPt(idx){
    if(idx == null || idx < 0 || idx >= state.penPoints.length) return null;
    return state.penPoints[idx];
  }
  function _parsePenIdx(t){
    const n = parseInt(t, 10);
    if(isNaN(n) || n < 0) return null;
    return n;
  }

  // ── 우/좌/상/하 D | 우/좌/상/하 교점 ──
  if(_isDir(key) && toks.length >= 2){
    _penEnsureStart();
    const cur = _penCurPt();
    const u = _penDir(key);
    if(toks[1] === '교점' || toks[1].toUpperCase() === 'IX'){
      const hit = _penRayFirstHit(cur.x, cur.y, u.x, u.y);
      if(!hit){ skCmdLog('  ⚠ ' + key + ' 방향 교점 없음', 'err'); return; }
      pushHistory();
      state.shapes.push({type:'line', x1:cur.x, y1:cur.y, x2:hit.x, y2:hit.y, color:col(), lineWidth:lw()});
      _penAddPt(hit.x, hit.y);
      redrawSketch(); updateInfo();
      skCmdLog('  → ' + key + ' 교점 P' + state.penCur + ' (' + hit.x.toFixed(1) + ',' + hit.y.toFixed(1) + ')mm', 'sys');
      _lastCmd = raw; return;
    }
    const D = evalSk3Expr(toks[1]);
    if(!isFinite(D)){ skCmdLog('  ⚠ 거리 오류', 'err'); return; }
    const nx = cur.x + u.x*D, ny = cur.y + u.y*D;
    pushHistory();
    state.shapes.push({type:'line', x1:cur.x, y1:cur.y, x2:nx, y2:ny, color:col(), lineWidth:lw()});
    _penAddPt(nx, ny);
    redrawSketch(); updateInfo();
    skCmdLog('  → ' + key + ' ' + D + 'mm → P' + state.penCur + ' (' + nx.toFixed(1) + ',' + ny.toFixed(1) + ')', 'sys');
    _lastCmd = raw; return;
  }

  // ── 선 우/좌/상/하 D | 선 우/좌/상/하 교점 ──
  if(key === '선' && toks.length >= 3 && _isDir(toks[1])){
    return sk3ExecuteCmd(toks.slice(1).join(' '));
  }
  // ── 선 N1 N2 (= 연결) ──
  if(key === '선' && toks.length >= 3){
    const i1 = _parsePenIdx(toks[1]), i2 = _parsePenIdx(toks[2]);
    if(i1 != null && i2 != null && _penGetPt(i1) && _penGetPt(i2)){
      const p1 = _penGetPt(i1), p2 = _penGetPt(i2);
      pushHistory();
      state.shapes.push({type:'line', x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y, color:col(), lineWidth:lw()});
      state.penCur = i2;
      redrawSketch(); updateInfo();
      skCmdLog('  ／ 선 P' + i1 + '–P' + i2, 'sys');
      _lastCmd = raw; return;
    }
  }

  // ── 연결 N1 N2 ──
  if((key === '연결' || key === 'CONNECT') && toks.length >= 3){
    const i1 = _parsePenIdx(toks[1]), i2 = _parsePenIdx(toks[2]);
    if(i1 != null && i2 != null && _penGetPt(i1) && _penGetPt(i2)){
      const p1 = _penGetPt(i1), p2 = _penGetPt(i2);
      pushHistory();
      state.shapes.push({type:'line', x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y, color:col(), lineWidth:lw()});
      state.penCur = i2;
      redrawSketch(); updateInfo();
      skCmdLog('  🔗 연결 P' + i1 + '–P' + i2, 'sys');
      _lastCmd = raw; return;
    }
    skCmdLog('  ⚠ 연결: 점 번호가 잘못됨', 'err'); return;
  }

  // ── 닫기 (현재점 → 0번 연결) ──
  if(key === '닫기' || key === 'CLOSE'){
    if(state.penPoints.length < 2 || state.penCur < 0){
      skCmdLog('  ⚠ 닫기: 점이 부족합니다', 'err'); return;
    }
    const cur = _penCurPt(), p0 = state.penPoints[0];
    pushHistory();
    state.shapes.push({type:'line', x1:cur.x, y1:cur.y, x2:p0.x, y2:p0.y, color:col(), lineWidth:lw()});
    state.penCur = 0;
    redrawSketch(); updateInfo();
    skCmdLog('  ▶◀ 닫기: P' + (state.penPoints.length-1) + ' → P0', 'sys');
    _lastCmd = raw; return;
  }

  // ── 점 ... ──
  if(key === '점' && toks.length >= 2){
    // 점 N (N번 선택)
    if(toks.length === 2){
      const t1 = toks[1];
      // 쉼표 좌표? "점 -100,100"
      if(t1.indexOf(',') >= 0){
        const xy = t1.split(',').map(t => evalSk3Expr(t));
        if(xy.length >= 2 && xy.every(isFinite)){
          pushHistory();
          _penAddPt(xy[0], xy[1]);
          redrawSketch(); updateInfo();
          skCmdLog('  · 점 P' + state.penCur + ' (' + xy[0] + ',' + xy[1] + ')mm', 'sys');
          _lastCmd = raw; return;
        }
      }
      const idx = _parsePenIdx(t1);
      if(idx != null && _penGetPt(idx)){
        state.penCur = idx;
        redrawSketch();
        skCmdLog('  → 현재점 = P' + idx, 'sys'); _lastCmd = raw; return;
      }
      skCmdLog('  ⚠ 점 ' + t1 + ': 번호가 없거나 좌표 형식 오류', 'err'); return;
    }
    // 점 X Y (공백 구분)
    if(toks.length >= 3 && isFinite(evalSk3Expr(toks[1])) && isFinite(evalSk3Expr(toks[2])) && !_isDir(toks[1])){
      const x = evalSk3Expr(toks[1]), y = evalSk3Expr(toks[2]);
      pushHistory();
      _penAddPt(x, y);
      redrawSketch(); updateInfo();
      skCmdLog('  · 점 P' + state.penCur + ' (' + x + ',' + y + ')mm', 'sys');
      _lastCmd = raw; return;
    }
    // 점 우/좌/상/하 D [방향 D ...] (선 없이 독립 점)
    if(_isDir(toks[1])){
      _penEnsureStart();
      let cx = _penCurPt().x, cy = _penCurPt().y;
      let i = 1;
      while(i < toks.length){
        if(!_isDir(toks[i])) break;
        const u = _penDir(toks[i]);
        const D = evalSk3Expr(toks[i+1]);
        if(!isFinite(D)){ skCmdLog('  ⚠ 거리 오류', 'err'); return; }
        cx += u.x*D; cy += u.y*D;
        i += 2;
      }
      pushHistory();
      _penAddPt(cx, cy);
      redrawSketch(); updateInfo();
      skCmdLog('  · 점 P' + state.penCur + ' (' + cx.toFixed(1) + ',' + cy.toFixed(1) + ')mm (독립)', 'sys');
      _lastCmd = raw; return;
    }
  }

  // ── 선택 N (현재점 이동) ──
  if((key === '선택' || key === 'SEL') && toks.length >= 2 && _parsePenIdx(toks[1]) != null){
    const idx = _parsePenIdx(toks[1]);
    if(_penGetPt(idx) == null){ skCmdLog('  ⚠ 선택: P' + idx + ' 없음', 'err'); return; }
    state.penCur = idx;
    redrawSketch();
    skCmdLog('  → 현재점 = P' + idx, 'sys'); _lastCmd = raw; return;
  }

  // ── 시작 X Y (0번 점 좌표 설정) ──
  if(key === '시작' && toks.length >= 3){
    const x = evalSk3Expr(toks[1]), y = evalSk3Expr(toks[2]);
    if(!isFinite(x) || !isFinite(y)){ skCmdLog('  ⚠ 좌표 오류', 'err'); return; }
    pushHistory();
    if(state.penPoints.length === 0){
      state.penPoints.push({x:x, y:y});
    } else {
      state.penPoints[0].x = x; state.penPoints[0].y = y;
    }
    state.penCur = 0;
    redrawSketch(); updateInfo();
    skCmdLog('  ▶ 시작점 P0 = (' + x + ',' + y + ')mm', 'sys'); _lastCmd = raw; return;
  }

  // ── 백 (UNDO 별칭) ──
  if(key === '백' || key === 'BACK'){
    undo(); skCmdLog('  ↶ 백', 'sys'); return;
  }

  // ── 점초기화 / 리셋 ──
  if(key === '점초기화' || key === 'PRESET' || key === '리셋'){
    pushHistory();
    state.penPoints = [];
    state.penCur = -1;
    redrawSketch();
    skCmdLog('  🔄 점 번호 초기화', 'sys'); _lastCmd = raw; return;
  }

  // ── 각 A D | 각 A 교점 ──
  if(key === '각' && toks.length >= 3){
    _penEnsureStart();
    const cur = _penCurPt();
    const A = evalSk3Expr(toks[1]);
    if(!isFinite(A)){ skCmdLog('  ⚠ 각도 오류', 'err'); return; }
    const rad = A * Math.PI / 180;
    const ux = Math.cos(rad), uy = Math.sin(rad); // Y+가 위
    if(toks[2] === '교점' || toks[2].toUpperCase() === 'IX'){
      const hit = _penRayFirstHit(cur.x, cur.y, ux, uy);
      if(!hit){ skCmdLog('  ⚠ 각 ' + A + '° 교점 없음', 'err'); return; }
      pushHistory();
      state.shapes.push({type:'line', x1:cur.x, y1:cur.y, x2:hit.x, y2:hit.y, color:col(), lineWidth:lw()});
      _penAddPt(hit.x, hit.y);
      redrawSketch(); updateInfo();
      skCmdLog('  ∠ 각 ' + A + '° 교점 → P' + state.penCur, 'sys');
      _lastCmd = raw; return;
    }
    const D = evalSk3Expr(toks[2]);
    if(!isFinite(D)){ skCmdLog('  ⚠ 거리 오류', 'err'); return; }
    const nx = cur.x + ux*D, ny = cur.y + uy*D;
    pushHistory();
    state.shapes.push({type:'line', x1:cur.x, y1:cur.y, x2:nx, y2:ny, color:col(), lineWidth:lw()});
    _penAddPt(nx, ny);
    redrawSketch(); updateInfo();
    skCmdLog('  ∠ 각 ' + A + '° ' + D + 'mm → P' + state.penCur, 'sys');
    _lastCmd = raw; return;
  }

  // ── 라벨토글 (점 번호 표시 ON/OFF) ──
  if(key === '라벨토글' || key === 'LABELTOGGLE'){
    state.penShowLabels = !state.penShowLabels;
    redrawSketch();
    skCmdLog('  라벨 표시 ' + (state.penShowLabels ? 'ON' : 'OFF'), 'sys'); return;
  }


  // ─── 헬퍼: 좌표 일치로 선 찾기/이동 ────────────────────
  function _penPtTol(){ return 0.01; }
  function _penLinesAtCoord(x, y){
    const tol = _penPtTol();
    return state.shapes.filter(s => s.type === 'line' &&
      ((Math.abs(s.x1-x)<tol && Math.abs(s.y1-y)<tol) ||
       (Math.abs(s.x2-x)<tol && Math.abs(s.y2-y)<tol)));
  }
  function _penMoveCoord(oldX, oldY, newX, newY){
    const tol = _penPtTol();
    state.shapes.forEach(s => {
      if(s.type !== 'line') return;
      if(Math.abs(s.x1-oldX)<tol && Math.abs(s.y1-oldY)<tol){ s.x1=newX; s.y1=newY; }
      if(Math.abs(s.x2-oldX)<tol && Math.abs(s.y2-oldY)<tol){ s.x2=newX; s.y2=newY; }
    });
  }
  function _segIxRaw(ax,ay,bx,by, cx,cy,dx,dy){
    const d1x=bx-ax,d1y=by-ay, d2x=dx-cx,d2y=dy-cy;
    const cr = d1x*d2y - d1y*d2x;
    if(Math.abs(cr)<1e-10) return null;
    const t = ((cx-ax)*d2y - (cy-ay)*d2x) / cr;
    const u = ((cx-ax)*d1y - (cy-ay)*d1x) / cr;
    return {x:ax+t*d1x, y:ay+t*d1y, t, u};
  }

  // ─── 기준 X Y / 기준 방향 D / 기준 지름 D1 D2 ──────────
  if(key === '기준' && toks.length >= 2){
    // 기준 지름 D1 D2 → (-D1/2, D2)
    if((toks[1] === '지' || toks[1] === '지름' || toks[1].toUpperCase() === 'DIA') && toks.length >= 4){
      const D1 = evalSk3Expr(toks[2]), D2 = evalSk3Expr(toks[3]);
      if(!isFinite(D1) || !isFinite(D2)){ skCmdLog('  ⚠ 기준 지름 D1 D2', 'err'); return; }
      pushHistory();
      state.penOrigin = {x:-D1/2, y:D2};
      redrawSketch();
      skCmdLog('  ⊕ 기준점 (' + (-D1/2).toFixed(2) + ',' + D2 + ')mm', 'sys');
      _lastCmd = raw; return;
    }
    // 기준 방향 D
    if(_isDir(toks[1]) && toks.length >= 3){
      const u = _penDir(toks[1]);
      const D = evalSk3Expr(toks[2]);
      if(!isFinite(D)){ skCmdLog('  ⚠ 거리 오류', 'err'); return; }
      pushHistory();
      const base = state.penOrigin || {x:0,y:0};
      state.penOrigin = {x:base.x + u.x*D, y:base.y + u.y*D};
      redrawSketch();
      skCmdLog('  ⊕ 기준점 → (' + state.penOrigin.x.toFixed(1) + ',' + state.penOrigin.y.toFixed(1) + ')mm', 'sys');
      _lastCmd = raw; return;
    }
    // 기준 X Y
    if(toks.length >= 3){
      const x = evalSk3Expr(toks[1]), y = evalSk3Expr(toks[2]);
      if(!isFinite(x) || !isFinite(y)){ skCmdLog('  ⚠ 좌표 오류', 'err'); return; }
      pushHistory();
      state.penOrigin = {x:x, y:y};
      redrawSketch();
      skCmdLog('  ⊕ 기준점 (' + x + ',' + y + ')mm', 'sys');
      _lastCmd = raw; return;
    }
  }
  // 기준 초기화
  if(key === '기준해제' || key === 'BASEOFF'){
    pushHistory();
    state.penOrigin = null;
    redrawSketch();
    skCmdLog('  ⊖ 기준점 해제', 'sys'); _lastCmd = raw; return;
  }

  // ─── 이동 N 우 D | 이동 우 D (현재점) ──────────────────
  if(key === '이동' && toks.length >= 3){
    let idx, dirTok, D;
    if(_isDir(toks[1]) && toks.length >= 3){
      idx = state.penCur;
      dirTok = toks[1];
      D = evalSk3Expr(toks[2]);
    } else if(_parsePenIdx(toks[1]) != null && toks.length >= 4){
      idx = _parsePenIdx(toks[1]);
      dirTok = toks[2];
      D = evalSk3Expr(toks[3]);
    }
    if(idx == null || idx < 0 || !_penGetPt(idx) || !_isDir(dirTok) || !isFinite(D)){
      skCmdLog('  ⚠ 이동 형식: 이동 N 방향 D  또는  이동 방향 D', 'err'); return;
    }
    const p = _penGetPt(idx);
    const u = _penDir(dirTok);
    const nx = p.x + u.x*D, ny = p.y + u.y*D;
    pushHistory();
    _penMoveCoord(p.x, p.y, nx, ny);
    p.x = nx; p.y = ny;
    redrawSketch(); updateInfo();
    skCmdLog('  → 이동 P' + idx + ' ' + dirTok + ' ' + D + 'mm', 'sys');
    _lastCmd = raw; return;
  }

  // ─── 거리두기 N1 N2 좌/우 D (평행 복제) ────────────────
  if(key === '거리두기' && toks.length >= 5){
    const i1 = _parsePenIdx(toks[1]), i2 = _parsePenIdx(toks[2]);
    const side = toks[3];
    const D = evalSk3Expr(toks[4]);
    if(i1==null || i2==null || !_penGetPt(i1) || !_penGetPt(i2) || !isFinite(D)){
      skCmdLog('  ⚠ 거리두기 형식 오류', 'err'); return;
    }
    if(side !== '좌' && side !== '우' && side !== 'L' && side !== 'R'){
      skCmdLog('  ⚠ 거리두기 방향은 좌/우', 'err'); return;
    }
    const p1 = _penGetPt(i1), p2 = _penGetPt(i2);
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const ln = Math.hypot(dx, dy);
    if(ln < 1e-6){ skCmdLog('  ⚠ 두 점이 일치', 'err'); return; }
    // 진행방향 좌측 법선 = (-dy, dx)/ln (Y+가 위 기준)
    let nx, ny;
    if(side === '좌' || side === 'L'){ nx = -dy/ln; ny = dx/ln; }
    else                              { nx =  dy/ln; ny = -dx/ln; }
    const ox = nx*D, oy = ny*D;
    pushHistory();
    state.shapes.push({type:'line', x1:p1.x+ox, y1:p1.y+oy, x2:p2.x+ox, y2:p2.y+oy,
      color:col(), lineWidth:lw()});
    redrawSketch(); updateInfo();
    skCmdLog('  ‖ 거리두기 P' + i1 + '–P' + i2 + ' ' + side + ' ' + D + 'mm', 'sys');
    _lastCmd = raw; return;
  }

  // ─── 알(필렛) N R | 알 N1 N2 R ──────────────────────────
  if((key === '알' || key === 'FILLETN') && toks.length >= 3){
    let R, lines;
    // 알 N1 N2 R: N1번 점과 N2번 점이 같은 위치에 있어야 (교점)
    if(toks.length >= 4 && _parsePenIdx(toks[1])!=null && _parsePenIdx(toks[2])!=null){
      const i1 = _parsePenIdx(toks[1]), i2 = _parsePenIdx(toks[2]);
      const p1 = _penGetPt(i1), p2 = _penGetPt(i2);
      R = evalSk3Expr(toks[3]);
      if(!p1 || !p2 || !isFinite(R)){ skCmdLog('  ⚠ 알 형식 오류', 'err'); return; }
      // 두 점 좌표로 두 점 위치에 연결된 선 각각 찾기
      const l1 = _penLinesAtCoord(p1.x, p1.y);
      const l2 = _penLinesAtCoord(p2.x, p2.y);
      if(l1.length === 0 || l2.length === 0){ skCmdLog('  ⚠ 알: 점에 연결된 선이 없음', 'err'); return; }
      lines = [l1[0], l2[0]];
    } else {
      // 알 N R: N번 교점에 연결된 두 선
      const idx = _parsePenIdx(toks[1]);
      R = evalSk3Expr(toks[2]);
      const p = _penGetPt(idx);
      if(!p || !isFinite(R)){ skCmdLog('  ⚠ 알 형식 오류', 'err'); return; }
      lines = _penLinesAtCoord(p.x, p.y);
      if(lines.length < 2){ skCmdLog('  ⚠ 알: P' + idx + '에 두 선이 만나야 함', 'err'); return; }
    }
    // 교점 계산
    const ix = _segIxRaw(lines[0].x1,lines[0].y1,lines[0].x2,lines[0].y2,
                         lines[1].x1,lines[1].y1,lines[1].x2,lines[1].y2);
    if(!ix){ skCmdLog('  ⚠ 알: 두 선이 평행', 'err'); return; }
    pushHistory();
    applyFillet({s:lines[0]}, {s:lines[1]}, ix, R);
    redrawSketch(); updateInfo();
    skCmdLog('  ⌣ 알 R' + R + 'mm 적용', 'sys');
    _lastCmd = raw; return;
  }

  // ─── 모따기 N R (N번 교점, 두 선을 R만큼 트림 후 직선 연결) ──
  if((key === '모따기' || key === 'CHAMFER') && toks.length >= 3){
    const idx = _parsePenIdx(toks[1]);
    const R = evalSk3Expr(toks[2]);
    const p = _penGetPt(idx);
    if(!p || !isFinite(R)){ skCmdLog('  ⚠ 모따기 형식 오류', 'err'); return; }
    const lines = _penLinesAtCoord(p.x, p.y);
    if(lines.length < 2){ skCmdLog('  ⚠ 모따기: P' + idx + '에 두 선 필요', 'err'); return; }
    const L1 = lines[0], L2 = lines[1];
    // 각 선에서 교점 측 끝점을 R만큼 안쪽(반대편)으로 이동
    function trimToward(L, px, py, dist){
      const tol = _penPtTol();
      const dx = L.x2 - L.x1, dy = L.y2 - L.y1;
      const ln = Math.hypot(dx, dy);
      const ux = dx/ln, uy = dy/ln;
      if(Math.abs(L.x1-px)<tol && Math.abs(L.y1-py)<tol){
        // x1쪽이 교점 → x1을 +방향(반대편 안쪽)으로 dist
        return {newX: L.x1 + ux*dist, newY: L.y1 + uy*dist, side:1};
      } else {
        return {newX: L.x2 - ux*dist, newY: L.y2 - uy*dist, side:2};
      }
    }
    const t1 = trimToward(L1, p.x, p.y, R);
    const t2 = trimToward(L2, p.x, p.y, R);
    pushHistory();
    if(t1.side === 1){ L1.x1 = t1.newX; L1.y1 = t1.newY; } else { L1.x2 = t1.newX; L1.y2 = t1.newY; }
    if(t2.side === 1){ L2.x1 = t2.newX; L2.y1 = t2.newY; } else { L2.x2 = t2.newX; L2.y2 = t2.newY; }
    // 새로운 모따기 직선
    state.shapes.push({type:'line', x1:t1.newX, y1:t1.newY, x2:t2.newX, y2:t2.newY,
      color:col(), lineWidth:lw()});
    redrawSketch(); updateInfo();
    skCmdLog('  ◢ 모따기 P' + idx + ' C' + R + 'mm', 'sys');
    _lastCmd = raw; return;
  }

  // ─── 연장 N1 N2 D | 연장 N1 N2 교점 ─────────────────────
  if(key === '연장' && toks.length >= 3){
    const i1 = _parsePenIdx(toks[1]), i2 = _parsePenIdx(toks[2]);
    const p1 = _penGetPt(i1), p2 = _penGetPt(i2);
    if(!p1 || !p2){ skCmdLog('  ⚠ 연장: 점 번호 오류', 'err'); return; }
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const ln = Math.hypot(dx, dy);
    if(ln < 1e-6){ skCmdLog('  ⚠ 두 점 일치', 'err'); return; }
    const ux = dx/ln, uy = dy/ln;
    let nx, ny;
    if(toks[3] === '교점' || (toks[3]||'').toUpperCase() === 'IX'){
      const hit = _penRayFirstHit(p2.x, p2.y, ux, uy);
      if(!hit){ skCmdLog('  ⚠ 연장 교점 없음', 'err'); return; }
      nx = hit.x; ny = hit.y;
    } else {
      const D = evalSk3Expr(toks[3]);
      if(!isFinite(D)){ skCmdLog('  ⚠ 거리 오류', 'err'); return; }
      nx = p2.x + ux*D; ny = p2.y + uy*D;
    }
    pushHistory();
    _penMoveCoord(p2.x, p2.y, nx, ny);
    p2.x = nx; p2.y = ny;
    redrawSketch(); updateInfo();
    skCmdLog('  ↦ 연장 P' + i1 + '→P' + i2 + ' → (' + nx.toFixed(1) + ',' + ny.toFixed(1) + ')', 'sys');
    _lastCmd = raw; return;
  }

  // ─── 줄이기 N1 N2 D (N2쪽에서 D만큼 축소) ───────────────
  if((key === '줄이기' || key === 'SHRINK') && toks.length >= 4){
    const i1 = _parsePenIdx(toks[1]), i2 = _parsePenIdx(toks[2]);
    const D = evalSk3Expr(toks[3]);
    const p1 = _penGetPt(i1), p2 = _penGetPt(i2);
    if(!p1 || !p2 || !isFinite(D)){ skCmdLog('  ⚠ 줄이기 형식 오류', 'err'); return; }
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const ln = Math.hypot(dx, dy);
    if(ln < D + 1e-6){ skCmdLog('  ⚠ 줄이기: 거리가 선보다 김', 'err'); return; }
    const ux = dx/ln, uy = dy/ln;
    const nx = p2.x - ux*D, ny = p2.y - uy*D;
    pushHistory();
    _penMoveCoord(p2.x, p2.y, nx, ny);
    p2.x = nx; p2.y = ny;
    redrawSketch(); updateInfo();
    skCmdLog('  ↤ 줄이기 P' + i2 + '쪽 ' + D + 'mm 축소', 'sys');
    _lastCmd = raw; return;
  }

  // ─── 절교 N1 N2 N3 수직/수평 ─────────────────────────────
  if(key === '절교' && toks.length >= 5){
    // 방향 절교: 절교 N 방향 수평/수직 N2
    if(_isDir(toks[2]) && (toks[3]==='수평' || toks[3]==='수직') && _parsePenIdx(toks[4])!=null){
      const i = _parsePenIdx(toks[1]);
      const u = _penDir(toks[2]);
      const targetIdx = _parsePenIdx(toks[4]);
      const p = _penGetPt(i), tgt = _penGetPt(targetIdx);
      if(!p || !tgt){ skCmdLog('  ⚠ 절교 점 오류', 'err'); return; }
      let nx, ny;
      if(toks[3] === '수평'){
        // y = tgt.y 직선과 교차
        if(Math.abs(u.y) < 1e-9){ skCmdLog('  ⚠ 방향이 수평이라 수평선과 만날 수 없음', 'err'); return; }
        const t = (tgt.y - p.y) / u.y;
        nx = p.x + u.x*t; ny = tgt.y;
      } else {
        if(Math.abs(u.x) < 1e-9){ skCmdLog('  ⚠ 방향이 수직이라 수직선과 만날 수 없음', 'err'); return; }
        const t = (tgt.x - p.x) / u.x;
        nx = tgt.x; ny = p.y + u.y*t;
      }
      pushHistory();
      state.shapes.push({type:'line', x1:p.x, y1:p.y, x2:nx, y2:ny, color:col(), lineWidth:lw()});
      _penAddPt(nx, ny);
      redrawSketch(); updateInfo();
      skCmdLog('  ⊥ 절교 P' + i + ' ' + toks[2] + ' ' + toks[3] + ' P' + targetIdx + ' → P' + state.penCur, 'sys');
      _lastCmd = raw; return;
    }
    // 두 점 절교: 절교 N1 N2 N3 수직/수평
    const i1 = _parsePenIdx(toks[1]), i2 = _parsePenIdx(toks[2]), i3 = _parsePenIdx(toks[3]);
    const mode = toks[4];
    const p1 = _penGetPt(i1), p2 = _penGetPt(i2), p3 = _penGetPt(i3);
    if(!p1 || !p2 || !p3){ skCmdLog('  ⚠ 절교 점 번호 오류', 'err'); return; }
    if(mode !== '수직' && mode !== '수평'){ skCmdLog('  ⚠ 수직/수평 지정', 'err'); return; }
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    let nx, ny;
    if(mode === '수직'){ // x = p3.x
      if(Math.abs(dx) < 1e-9){ skCmdLog('  ⚠ 연장선이 수직이라 만남 없음', 'err'); return; }
      const t = (p3.x - p1.x) / dx;
      nx = p3.x; ny = p1.y + dy*t;
    } else { // 수평: y = p3.y
      if(Math.abs(dy) < 1e-9){ skCmdLog('  ⚠ 연장선이 수평이라 만남 없음', 'err'); return; }
      const t = (p3.y - p1.y) / dy;
      nx = p1.x + dx*t; ny = p3.y;
    }
    pushHistory();
    _penMoveCoord(p2.x, p2.y, nx, ny);
    p2.x = nx; p2.y = ny;
    redrawSketch(); updateInfo();
    skCmdLog('  ⊥ 절교 P' + i1 + '→P' + i2 + ' P' + i3 + ' ' + mode, 'sys');
    _lastCmd = raw; return;
  }

  // ─── 절각 N A N2 수직/수평 ───────────────────────────────
  if(key === '절각' && toks.length >= 5){
    const i = _parsePenIdx(toks[1]);
    const A = evalSk3Expr(toks[2]);
    const i2 = _parsePenIdx(toks[3]);
    const mode = toks[4];
    const p = _penGetPt(i), p2 = _penGetPt(i2);
    if(!p || !p2 || !isFinite(A)){ skCmdLog('  ⚠ 절각 형식 오류', 'err'); return; }
    if(mode !== '수직' && mode !== '수평'){ skCmdLog('  ⚠ 수직/수평 지정', 'err'); return; }
    const rad = A * Math.PI / 180;
    const ux = Math.cos(rad), uy = Math.sin(rad);
    let nx, ny;
    if(mode === '수직'){
      if(Math.abs(ux) < 1e-9){ skCmdLog('  ⚠ 각도가 수직이라 만남 없음', 'err'); return; }
      const t = (p2.x - p.x) / ux;
      nx = p2.x; ny = p.y + uy*t;
    } else {
      if(Math.abs(uy) < 1e-9){ skCmdLog('  ⚠ 각도가 수평이라 만남 없음', 'err'); return; }
      const t = (p2.y - p.y) / uy;
      nx = p.x + ux*t; ny = p2.y;
    }
    pushHistory();
    state.shapes.push({type:'line', x1:p.x, y1:p.y, x2:nx, y2:ny, color:col(), lineWidth:lw()});
    _penAddPt(nx, ny);
    redrawSketch(); updateInfo();
    skCmdLog('  ∠⊥ 절각 P' + i + ' ' + A + '° P' + i2 + ' ' + mode + ' → P' + state.penCur, 'sys');
    _lastCmd = raw; return;
  }

  // ─── 교점 (모든 도형 교차점 자동 번호) ───────────────────
  if(key === '교점' || key === 'IX' || key === 'INTERSECT'){
    const lines = state.shapes.filter(s => s.type === 'line');
    const pts = [];
    for(let i=0; i<lines.length; i++){
      for(let j=i+1; j<lines.length; j++){
        const ix = _segIxRaw(lines[i].x1,lines[i].y1,lines[i].x2,lines[i].y2,
                             lines[j].x1,lines[j].y1,lines[j].x2,lines[j].y2);
        if(ix && ix.t>=-0.01 && ix.t<=1.01 && ix.u>=-0.01 && ix.u<=1.01){
          pts.push({x:ix.x, y:ix.y});
        }
      }
    }
    // 중복 제거 (0.1mm 이내)
    const uniq = [];
    pts.forEach(p => {
      if(!uniq.some(q => Math.hypot(q.x-p.x, q.y-p.y) < 0.1) &&
         !state.penPoints.some(q => Math.hypot(q.x-p.x, q.y-p.y) < 0.1)){
        uniq.push(p);
      }
    });
    if(uniq.length === 0){ skCmdLog('  교점: 새 교점 없음', 'sys'); return; }
    pushHistory();
    uniq.forEach(p => state.penPoints.push(p));
    state.penCur = state.penPoints.length - 1;
    redrawSketch(); updateInfo();
    skCmdLog('  ✕ 교점 ' + uniq.length + '개 → P0..P' + state.penCur, 'sys');
    _lastCmd = raw; return;
  }

  // ─── 만남 N1 N2 (두 점이 끝점인 선들의 무한직선 교점) ────
  if(key === '만남' && toks.length >= 3){
    const i1 = _parsePenIdx(toks[1]), i2 = _parsePenIdx(toks[2]);
    const p1 = _penGetPt(i1), p2 = _penGetPt(i2);
    if(!p1 || !p2){ skCmdLog('  ⚠ 만남 점 오류', 'err'); return; }
    const ll1 = _penLinesAtCoord(p1.x, p1.y);
    const ll2 = _penLinesAtCoord(p2.x, p2.y);
    if(ll1.length === 0 || ll2.length === 0){ skCmdLog('  ⚠ 만남: 점에 선이 없음', 'err'); return; }
    const L1 = ll1[0], L2 = ll2[0];
    // 무한직선 교점
    const ix = _segIxRaw(L1.x1,L1.y1,L1.x2,L1.y2, L2.x1,L2.y1,L2.x2,L2.y2);
    if(!ix){ skCmdLog('  ⚠ 만남: 두 선이 평행', 'err'); return; }
    pushHistory();
    _penAddPt(ix.x, ix.y);
    redrawSketch(); updateInfo();
    skCmdLog('  ⨯ 만남 → P' + state.penCur + ' (' + ix.x.toFixed(1) + ',' + ix.y.toFixed(1) + ')', 'sys');
    _lastCmd = raw; return;
  }

  // ─── 라벨 / 번호 (모든 선 끝점에 자동 번호 부여) ─────────
  if(key === '라벨' || key === '번호' || key === 'LABEL'){
    const tol = _penPtTol();
    const added = [];
    state.shapes.forEach(s => {
      if(s.type !== 'line') return;
      [{x:s.x1,y:s.y1}, {x:s.x2,y:s.y2}].forEach(pt => {
        if(!state.penPoints.some(p => Math.hypot(p.x-pt.x, p.y-pt.y) < 0.1) &&
           !added.some(p => Math.hypot(p.x-pt.x, p.y-pt.y) < 0.1)){
          added.push(pt);
        }
      });
    });
    if(added.length === 0){ skCmdLog('  라벨: 새 점 없음', 'sys'); return; }
    pushHistory();
    added.forEach(p => state.penPoints.push(p));
    state.penCur = state.penPoints.length - 1;
    redrawSketch(); updateInfo();
    skCmdLog('  🏷 라벨 ' + added.length + '개 추가', 'sys');
    _lastCmd = raw; return;
  }

  // ─── 정리 [N] (점 전체 + N mm 이하 짧은 선 삭제) ─────────
  if((key === '정리' || key === 'CLEANUP')){
    let tolMm = 0.1;
    if(toks.length >= 2 && isFinite(evalSk3Expr(toks[1]))) tolMm = evalSk3Expr(toks[1]);
    pushHistory();
    const beforeShapes = state.shapes.length;
    const beforePts = state.penPoints.length;
    state.shapes = state.shapes.filter(s => {
      if(s.type === 'line'){
        const L = Math.hypot(s.x2-s.x1, s.y2-s.y1);
        return L > tolMm;
      }
      return true;
    });
    state.penPoints = [];
    state.penCur = -1;
    redrawSketch(); updateInfo();
    skCmdLog('  🧹 정리: 선 ' + (beforeShapes - state.shapes.length) + '개, 점 ' + beforePts + '개 삭제 (≤' + tolMm + 'mm)', 'sys');
    _lastCmd = raw; return;
  }

  // ─── v8.27: 통합 (겹친 선 1개로) ─────────────────────────
  // 명령: 통합 / MERGE / 합치기
  if(key === '통합' || key === 'MERGE' || key === '합치기'){
    if(typeof window.sk3MergeOverlappingLines === 'function'){
      const merged = window.sk3MergeOverlappingLines(true); // silent=true, toast 안 띄움
      skCmdLog('  🧬 통합: ' + merged + '쌍 통합', 'sys');
    } else {
      skCmdLog('  ⚠ 통합 기능을 사용할 수 없음', 'err');
    }
    _lastCmd = raw; return;
  }

  // ─── v8.33: 지름좌표 / DIAM N (원점 양쪽에 점) ──────────
  // 사용: 지름 100  /  DIAM 50  /  지름좌표 25
  if(key === '지름' || key === '지름좌표' || key === 'DIAM' || key === 'DIA'){
    if(toks.length < 2){ skCmdLog('  ⚠ 사용: 지름 D (예: 지름 100)', 'err'); _lastCmd = raw; return; }
    const D = evalSk3Expr(toks[1]);
    if(!isFinite(D) || D <= 0){ skCmdLog('  ⚠ 유효한 지름 필요 (>0)', 'err'); _lastCmd = raw; return; }
    if(typeof window.sk3AddDiameterPoints === 'function'){
      window.sk3AddDiameterPoints(D);
    }
    _lastCmd = raw; return;
  }

  // ─── v8.40: 점동기 / SYNC (모든 도형 끝점에 펜점 자동) ──────
  if(key === '점동기' || key === 'SYNC' || key === '동기'){
    if(typeof window.sk3SyncPenPointsToShapes !== 'function'){
      skCmdLog('  ⚠ 동기화 기능 사용 불가', 'err'); _lastCmd = raw; return;
    }
    // 원 중심도 포함할지 (옵션 인자 "원")
    const includeCircle = toks.slice(1).some(t => t === '원' || t.toUpperCase() === 'C' || t === 'CIRCLE');
    pushHistory();
    const added = window.sk3SyncPenPointsToShapes({circle: includeCircle});
    redrawSketch(); updateInfo();
    if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
    skCmdLog('  📌 점동기: 신규 펜점 ' + added + '개 추가' + (includeCircle?' (원 중심 포함)':''), 'sys');
    if(added > 0) toast('📌 새 펜점 ' + added + '개 추가');
    else toast('📌 이미 모든 끝점에 펜점 있음');
    _lastCmd = raw; return;
  }


  // ─── 호 N R [시계|반시계] 각 A | 교점 ──────────────────
  if(key === '호' && toks.length >= 3){
    const idx = _parsePenIdx(toks[1]);
    const R = evalSk3Expr(toks[2]);
    const cp = _penGetPt(idx);
    if(!cp || !isFinite(R)){ skCmdLog('  ⚠ 호: 호 N R [시계] 각 A | 교점', 'err'); return; }
    const cur = _penCurPt();
    if(!cur){ skCmdLog('  ⚠ 현재점 필요', 'err'); return; }
    // 시작각 = 현재점→중심으로부터 각도
    const sa = Math.atan2(cur.y - cp.y, cur.x - cp.x);
    let ti = 3;
    let cw = false;
    if(toks[ti] === '시계' || toks[ti] === 'CW'){ cw = true; ti++; }
    else if(toks[ti] === '반시계' || toks[ti] === 'CCW'){ cw = false; ti++; }
    // 각 A
    if(toks[ti] === '각' && toks.length > ti+1){
      const A = evalSk3Expr(toks[ti+1]);
      if(!isFinite(A)){ skCmdLog('  ⚠ 각도 오류', 'err'); return; }
      const Arad = A * Math.PI / 180;
      const ea = sa + (cw ? -Arad : Arad);
      const ex = cp.x + R*Math.cos(ea), ey = cp.y + R*Math.sin(ea);
      pushHistory();
      // canvas는 -endAngle→-startAngle로 그림(반시계). world 기준 sa→ea CCW가 되도록 정리
      const aStart = cw ? ea : sa;
      const aEnd   = cw ? sa : ea;
      state.shapes.push({type:'arc', cx:cp.x, cy:cp.y, r:R,
        startAngle: aStart, endAngle: aEnd,
        color:col(), lineWidth:lw()});
      _penAddPt(ex, ey);
      redrawSketch(); updateInfo();
      skCmdLog('  ⌒ 호 P' + idx + ' R' + R + ' ' + (cw?'시계':'반시계') + ' ' + A + '° → P' + state.penCur, 'sys');
      _lastCmd = raw; return;
    }
    if(toks[ti] === '교점' || (toks[ti]||'').toUpperCase() === 'IX'){
      // 호 위를 1° 씩 회전하며 ray 교차 첫번째 찾기
      const stepRad = (cw ? -1 : 1) * Math.PI / 180;
      let found = null;
      for(let a = sa + stepRad; Math.abs(a - sa) < 2*Math.PI; a += stepRad){
        const px = cp.x + R*Math.cos(a), py = cp.y + R*Math.sin(a);
        // 점 위에 다른 선이 닿는지 검사
        let hit = false;
        for(const s of state.shapes){
          if(s.type !== 'line') continue;
          // 점이 선분에 매우 가까운가
          const dx = s.x2-s.x1, dy = s.y2-s.y1, ln2 = dx*dx+dy*dy;
          if(ln2 < 1e-9) continue;
          let t = ((px-s.x1)*dx + (py-s.y1)*dy)/ln2;
          if(t < 0 || t > 1) continue;
          const cx2 = s.x1+dx*t, cy2 = s.y1+dy*t;
          if(Math.hypot(px-cx2, py-cy2) < 0.3){ hit = true; break; }
        }
        if(hit){ found = {x:px, y:py, a}; break; }
      }
      if(!found){ skCmdLog('  ⚠ 호 ' + (cw?'시계':'반시계') + ' 교점 없음', 'err'); return; }
      pushHistory();
      const aStart = cw ? found.a : sa;
      const aEnd   = cw ? sa : found.a;
      state.shapes.push({type:'arc', cx:cp.x, cy:cp.y, r:R,
        startAngle:aStart, endAngle:aEnd, color:col(), lineWidth:lw()});
      _penAddPt(found.x, found.y);
      redrawSketch(); updateInfo();
      skCmdLog('  ⌒ 호 ' + (cw?'시계':'반시계') + ' 교점 → P' + state.penCur, 'sys');
      _lastCmd = raw; return;
    }
  }

  // ─── 교차 / 분할 (모든 도형 교차점에서 분할) — v8.18 ───────────
  // 지원: line ↔ line/circle/arc/rect, circle ↔ circle/arc/rect, arc ↔ arc/rect, rect ↔ rect
  // 동작:
  //   1) rect → 4개 line으로 사전 분해
  //   2) 모든 쌍의 교점을 계산
  //   3) 각 도형을 교점 파라미터(t for line, angle for arc/circle)로 분할
  //   4) state.shapes를 새 조각들로 교체
  if(key === '교차' || key === '분할' || key === 'BREAK'){
    if(state.shapes.length < 2){ skCmdLog('  ⚠ 분할할 도형이 부족(2개 이상 필요)', 'err'); return; }

    // (1) rect 사전 분해 + circle을 full-arc로 변환
    const work = [];  // 작업 대상 도형 (분할 가능한 형태)
    const others = []; // 분할 미지원 (사용자 도형 보존)
    state.shapes.forEach(s => {
      if(s.type === 'rect'){
        // 4변을 line으로
        work.push({type:'line', x1:s.x1, y1:s.y1, x2:s.x2, y2:s.y1, color:s.color, lineWidth:s.lineWidth});
        work.push({type:'line', x1:s.x2, y1:s.y1, x2:s.x2, y2:s.y2, color:s.color, lineWidth:s.lineWidth});
        work.push({type:'line', x1:s.x2, y1:s.y2, x2:s.x1, y2:s.y2, color:s.color, lineWidth:s.lineWidth});
        work.push({type:'line', x1:s.x1, y1:s.y2, x2:s.x1, y2:s.y1, color:s.color, lineWidth:s.lineWidth});
      } else if(s.type === 'circle'){
        // full arc로 변환 (0 ~ 2π)
        work.push({type:'arc', cx:s.cx, cy:s.cy, r:s.r,
          startAngle:0, endAngle:2*Math.PI, isFull:true,
          color:s.color, lineWidth:s.lineWidth});
      } else if(s.type === 'line' || s.type === 'arc'){
        work.push(JSON.parse(JSON.stringify(s)));
      } else {
        others.push(s);  // 미지원 타입은 그대로
      }
    });

    // (2) 헬퍼: 교점 계산
    function normA(a){ while(a < 0) a += 2*Math.PI; while(a >= 2*Math.PI) a -= 2*Math.PI; return a; }
    function inArc(a, s, e, isFull){
      if(isFull) return true;
      a = normA(a); const sn = normA(s), en = normA(e);
      if(sn <= en) return a >= sn - 1e-6 && a <= en + 1e-6;
      return a >= sn - 1e-6 || a <= en + 1e-6;
    }
    function lineLineIx(A, B){
      const ix = _segIxRaw(A.x1,A.y1,A.x2,A.y2, B.x1,B.y1,B.x2,B.y2);
      if(!ix) return null;
      // v8.26: 끝점 가까운 교점도 분할점으로 인정 (이전 0.001~0.999 → -1e-6~1+1e-6)
      if(ix.t > -1e-6 && ix.t < 1 + 1e-6 && ix.u > -1e-6 && ix.u < 1 + 1e-6){
        const tc = Math.max(0, Math.min(1, ix.t));
        const uc = Math.max(0, Math.min(1, ix.u));
        return {t:tc, u:uc, x:ix.x, y:ix.y};
      }
      return null;
    }
    function lineArcIx(L, C){
      const dx = L.x2 - L.x1, dy = L.y2 - L.y1;
      const fx = L.x1 - C.cx, fy = L.y1 - C.cy;
      const a = dx*dx + dy*dy;
      const b = 2*(fx*dx + fy*dy);
      const c0 = fx*fx + fy*fy - C.r*C.r;
      const disc = b*b - 4*a*c0;
      // v8.26: 부동소수점 오차 흡수 — 작은 음수 disc는 접선으로 간주
      const epsDisc = Math.max(b*b, a*a, 1) * 1e-10;
      if(disc < -epsDisc) return [];
      const sd = disc <= 0 ? 0 : Math.sqrt(disc);
      const ts = [(-b - sd)/(2*a), (-b + sd)/(2*a)];
      const out = [];
      const seenT = [];
      ts.forEach(t => {
        if(t > -1e-6 && t < 1 + 1e-6){
          const tc = Math.max(0, Math.min(1, t));
          // 중복 제거 (접선 케이스 — 같은 t 두 번)
          const dup = seenT.some(s => Math.abs(s - tc) < 1e-7);
          if(dup) return;
          seenT.push(tc);
          const x = L.x1 + tc*dx, y = L.y1 + tc*dy;
          const ang = Math.atan2(y - C.cy, x - C.cx);
          if(inArc(ang, C.startAngle, C.endAngle, C.isFull)){
            out.push({t:tc, angle: ang, x, y});
          }
        }
      });
      return out;
    }
    function arcArcIx(C1, C2){
      const dx = C2.cx - C1.cx, dy = C2.cy - C1.cy;
      const d = Math.hypot(dx, dy);
      if(d > C1.r + C2.r + 1e-6 || d < Math.abs(C1.r - C2.r) - 1e-6 || d < 1e-9) return [];
      const a = (C1.r*C1.r - C2.r*C2.r + d*d) / (2*d);
      const h2 = C1.r*C1.r - a*a;
      if(h2 < 0) return [];
      const h = Math.sqrt(h2);
      const px = C1.cx + a*dx/d, py = C1.cy + a*dy/d;
      const rx = -dy*h/d, ry = dx*h/d;
      const cands = (h < 1e-9) ? [{x:px, y:py}] : [{x:px+rx, y:py+ry}, {x:px-rx, y:py-ry}];
      const out = [];
      cands.forEach(p => {
        const a1 = Math.atan2(p.y - C1.cy, p.x - C1.cx);
        const a2 = Math.atan2(p.y - C2.cy, p.x - C2.cx);
        if(inArc(a1, C1.startAngle, C1.endAngle, C1.isFull) &&
           inArc(a2, C2.startAngle, C2.endAngle, C2.isFull)){
          out.push({angle1: a1, angle2: a2, x: p.x, y: p.y});
        }
      });
      return out;
    }

    // (3) 각 도형별 분할 파라미터 수집
    // v8.26: 진단용 카운터 추가
    const ixCount = {LL:0, LA:0, AA:0};
    const params = work.map(s => s.type === 'line' ? {ts:[0, 1]} : {angs:[]});
    for(let i = 0; i < work.length; i++){
      for(let j = i + 1; j < work.length; j++){
        const A = work[i], B = work[j];
        if(A.type === 'line' && B.type === 'line'){
          const ix = lineLineIx(A, B);
          if(ix){ params[i].ts.push(ix.t); params[j].ts.push(ix.u); ixCount.LL++; }
        } else if(A.type === 'line' && B.type === 'arc'){
          const ixs = lineArcIx(A, B);
          ixs.forEach(ix => { params[i].ts.push(ix.t); params[j].angs.push(ix.angle); ixCount.LA++; });
        } else if(A.type === 'arc' && B.type === 'line'){
          const ixs = lineArcIx(B, A);
          ixs.forEach(ix => { params[j].ts.push(ix.t); params[i].angs.push(ix.angle); ixCount.LA++; });
        } else if(A.type === 'arc' && B.type === 'arc'){
          const ixs = arcArcIx(A, B);
          ixs.forEach(ix => { params[i].angs.push(ix.angle1); params[j].angs.push(ix.angle2); ixCount.AA++; });
        }
      }
    }

    // (4) 분할 — 각 도형을 조각들로
    pushHistory();
    const newShapes = others.slice();
    let segCount = 0;
    work.forEach((s, i) => {
      if(s.type === 'line'){
        const uts = [...new Set(params[i].ts.map(t => Math.round(t*1e6)/1e6))].sort((a,b)=>a-b);
        for(let k = 0; k < uts.length - 1; k++){
          const t1 = uts[k], t2 = uts[k+1];
          if(t2 - t1 < 1e-4) continue;
          const x1 = s.x1 + (s.x2-s.x1)*t1, y1 = s.y1 + (s.y2-s.y1)*t1;
          const x2 = s.x1 + (s.x2-s.x1)*t2, y2 = s.y1 + (s.y2-s.y1)*t2;
          newShapes.push({type:'line', x1, y1, x2, y2,
            color:s.color, lineWidth:s.lineWidth, fillColor:s.fillColor});
          segCount++;
        }
      } else if(s.type === 'arc'){
        // v8.26: full circle (원)인 경우 — 0과 2π는 같은 점이므로 wrap 처리
        if(s.isFull){
          if(params[i].angs.length === 0){
            // 교점 없음 - 원 그대로 유지
            newShapes.push({type:'arc', cx:s.cx, cy:s.cy, r:s.r,
              startAngle:0, endAngle:2*Math.PI, color:s.color, lineWidth:s.lineWidth});
            segCount++;
          } else {
            // 교점 angle들을 0~2π로 정규화 후 unique sort
            const angsN = params[i].angs.map(a => {
              let x = a; while(x < 0) x += 2*Math.PI; while(x >= 2*Math.PI) x -= 2*Math.PI; return x;
            });
            const uniq = [...new Set(angsN.map(a => Math.round(a*1e6)/1e6))].sort((a,b)=>a-b);
            if(uniq.length === 1){
              // 단일 교점 (접선) - 원 그대로 유지 (분할 안 됨)
              newShapes.push({type:'arc', cx:s.cx, cy:s.cy, r:s.r,
                startAngle:0, endAngle:2*Math.PI, color:s.color, lineWidth:s.lineWidth});
              segCount++;
            } else {
              // 인접 쌍으로 분할, 마지막 쌍은 첫 점까지 wrap
              for(let k = 0; k < uniq.length; k++){
                const a1 = uniq[k];
                const a2 = (k === uniq.length - 1) ? uniq[0] + 2*Math.PI : uniq[k+1];
                if(a2 - a1 < 1e-4) continue;
                newShapes.push({type:'arc', cx:s.cx, cy:s.cy, r:s.r,
                  startAngle: a1, endAngle: a2,
                  color:s.color, lineWidth:s.lineWidth});
                segCount++;
              }
            }
          }
          return; // full circle 처리 끝
        }
        // 일반 호(arc) 분할: 시작/끝 각도 + 교점 각도들을 호 진행방향(CCW from startAngle)에 따라 정렬
        const sA = s.startAngle;
        const eA = s.endAngle;
        let arcSpan = eA - sA;
        while(arcSpan < 0) arcSpan += 2*Math.PI;
        while(arcSpan > 2*Math.PI) arcSpan -= 2*Math.PI;
        // 각 교점 angle을 [0, arcSpan] 구간의 progress로 변환
        const progs = [0, arcSpan];
        params[i].angs.forEach(a => {
          let p = a - sA;
          while(p < 0) p += 2*Math.PI;
          while(p > 2*Math.PI) p -= 2*Math.PI;
          if(p > 1e-5 && p < arcSpan - 1e-5) progs.push(p);
        });
        const uniq = [...new Set(progs.map(p => Math.round(p*1e6)/1e6))].sort((a,b)=>a-b);
        for(let k = 0; k < uniq.length - 1; k++){
          const p1 = uniq[k], p2 = uniq[k+1];
          if(p2 - p1 < 1e-4) continue;
          newShapes.push({type:'arc', cx:s.cx, cy:s.cy, r:s.r,
            startAngle: sA + p1, endAngle: sA + p2,
            color:s.color, lineWidth:s.lineWidth});
          segCount++;
        }
      }
    });
    state.shapes = newShapes;
    state.selectedShapes.clear();
    // v8.40: 분할로 새로 생긴 끝점에 펜점 자동 부여
    let autoAdded = 0;
    if(typeof window.sk3SyncPenPointsToShapes === 'function'){
      autoAdded = window.sk3SyncPenPointsToShapes();
    }
    redrawSketch(); updateInfo();
    if(typeof window.sk3UpdateSelProp === 'function') window.sk3UpdateSelProp();
    // v8.26: 교점 종류별 진단 메시지
    const ixTotal = ixCount.LL + ixCount.LA + ixCount.AA;
    skCmdLog('  ⊞ 교차 분할 → ' + segCount + '개 조각' + (autoAdded?' · 신규 펜점 ' + autoAdded + '개':''), 'sys');
    skCmdLog('     · 교점 ' + ixTotal + '개 (선↔선 ' + ixCount.LL + ', 선↔원/호 ' + ixCount.LA + ', 원/호↔원/호 ' + ixCount.AA + ')', 'sys');
    if(ixCount.LA === 0 && work.some(s => s.type === 'arc')){
      skCmdLog('     · ⚠ 원/호와 선이 만나는 교점이 0개 - 선이 원 안/밖에 있는지 확인', 'err');
    }
    _lastCmd = raw; return;
  }

  // ─── 채움 [색상] (선택된 도형에 채움색 적용) ─────────────
  if((key === '채움' || key === 'FILL' || key === 'HATCH')){
    if(state.selectedShapes.size === 0){
      skCmdLog('  ⚠ 채움: 먼저 도형을 선택하세요(S키)', 'err'); return;
    }
    let color = toks[1];
    if(!color){
      color = prompt('채움 색상 (#hex 또는 색이름)', '#ffd54a');
      if(!color) return;
    }
    pushHistory();
    state.selectedShapes.forEach(idx => {
      if(state.shapes[idx]) state.shapes[idx].fillColor = color;
    });
    redrawSketch(); updateInfo();
    skCmdLog('  🎨 채움 ' + color + ' · ' + state.selectedShapes.size + '개 도형', 'sys');
    _lastCmd = raw; return;
  }

  // ─── 외곽선 (선택된 line들의 끝점을 따라 폴리라인) ──────
  if(key === '외곽선' || key === 'OUTLINE'){
    const selLines = [...state.selectedShapes]
      .map(i => state.shapes[i])
      .filter(s => s && s.type === 'line');
    if(selLines.length < 2){
      skCmdLog('  ⚠ 외곽선: 선 2개 이상 선택 필요(S키 다중선택)', 'err'); return;
    }
    // 끝점 좌표를 펜포인트로 등록 (라벨 효과)
    const tol = _penPtTol();
    let added = 0;
    selLines.forEach(L => {
      [{x:L.x1,y:L.y1}, {x:L.x2,y:L.y2}].forEach(pt => {
        if(!state.penPoints.some(p => Math.hypot(p.x-pt.x, p.y-pt.y) < 0.1)){
          state.penPoints.push(pt); added++;
        }
      });
    });
    if(added > 0){
      pushHistory();
      state.penCur = state.penPoints.length - 1;
      redrawSketch();
    }
    skCmdLog('  🖊 외곽선 끝점 ' + added + '개 라벨 추가 (선택 선 ' + selLines.length + '개)', 'sys');
    skCmdLog('     ℹ 닫힌 영역 자동 추출은 미지원 — 끝점 번호로 다음 작업 진행', 'help');
    _lastCmd = raw; return;
  }

  // ─── 쓸어지우기 (wipe 도구 활성화) ───────────────────────
  if(key === '쓸어지우기' || key === 'WIPE'){
    setTool('wipe');
    skCmdLog('  🧽 쓸어지우기 모드 — 드래그로 박스 안 도형 일괄 삭제', 'sys');
    toast('드래그로 박스 안 도형 삭제');
    _lastCmd = raw; return;
  }

  // ─── 삼각형 W [X Y rot°] (정삼각형) ──────────────────────
  if((key === '삼각형' || key === 'TRI' || key === 'TRIANGLE') && toks.length >= 2 && isFinite(evalSk3Expr(toks[1]))){
    const side = evalSk3Expr(toks[1]);
    let cx=0, cy=0, rot=0;
    if(toks.length >= 4){ cx = evalSk3Expr(toks[2]); cy = evalSk3Expr(toks[3]); }
    if(toks.length >= 5){ rot = evalSk3Expr(toks[4]); }
    if(side<=0 || !isFinite(side)){ skCmdLog('  ⚠ 변 길이 오류', 'err'); return; }
    const R = side / Math.sqrt(3);
    const rad = rot * Math.PI / 180;
    const verts = [0, 2*Math.PI/3, 4*Math.PI/3].map(a => ({
      x: cx + R*Math.cos(Math.PI/2 + rad + a),
      y: cy + R*Math.sin(Math.PI/2 + rad + a)
    }));
    pushHistory();
    for(let i=0; i<3; i++){
      const p1 = verts[i], p2 = verts[(i+1)%3];
      state.shapes.push({type:'line', x1:p1.x, y1:p1.y, x2:p2.x, y2:p2.y,
        color:col(), lineWidth:lw()});
    }
    redrawSketch(); updateInfo();
    skCmdLog('  △ 정삼각형 변' + side + 'mm (' + cx + ',' + cy + ') ' + rot + '°', 'sys');
    _lastCmd = raw; return;
  }

  // ─── 선 좌/우 지[름] D1 D2 (지름차/2 만큼 방향선) ────────
  if(key === '선' && toks.length >= 5 && (toks[1]==='좌'||toks[1]==='우') &&
     (toks[2]==='지'||toks[2]==='지름'||toks[2].toUpperCase()==='DIA')){
    _penEnsureStart();
    const cur = _penCurPt();
    const D1 = evalSk3Expr(toks[3]), D2 = evalSk3Expr(toks[4]);
    if(!isFinite(D1) || !isFinite(D2)){ skCmdLog('  ⚠ 지름 D1 D2', 'err'); return; }
    const dist = Math.abs(D2 - D1) / 2;
    const u = _penDir(toks[1]);
    const nx = cur.x + u.x*dist, ny = cur.y + u.y*dist;
    pushHistory();
    state.shapes.push({type:'line', x1:cur.x, y1:cur.y, x2:nx, y2:ny, color:col(), lineWidth:lw()});
    _penAddPt(nx, ny);
    redrawSketch(); updateInfo();
    skCmdLog('  ⊘ 선 ' + toks[1] + ' 지름 ' + D1 + ' ' + D2 + ' = ' + dist.toFixed(2) + 'mm → P' + state.penCur, 'sys');
    _lastCmd = raw; return;
  }

  // ─── 점 좌/우 지[름] D1 D2 (지름차/2만큼 독립점) ─────────
  if(key === '점' && toks.length >= 5 && (toks[1]==='좌'||toks[1]==='우') &&
     (toks[2]==='지'||toks[2]==='지름'||toks[2].toUpperCase()==='DIA')){
    _penEnsureStart();
    const cur = _penCurPt();
    const D1 = evalSk3Expr(toks[3]), D2 = evalSk3Expr(toks[4]);
    if(!isFinite(D1) || !isFinite(D2)){ skCmdLog('  ⚠ 지름 D1 D2', 'err'); return; }
    const dist = Math.abs(D2 - D1) / 2;
    const u = _penDir(toks[1]);
    const nx = cur.x + u.x*dist, ny = cur.y + u.y*dist;
    pushHistory();
    _penAddPt(nx, ny);
    redrawSketch(); updateInfo();
    skCmdLog('  · 점 ' + toks[1] + ' 지름 ' + D1 + ' ' + D2 + ' (독립) → P' + state.penCur, 'sys');
    _lastCmd = raw; return;
  }


  // ─── 두께 N1 N2 좌/우 (소재 두께만큼 평행선) ──────────────
  if(key === '두께' && toks.length >= 4){
    const i1 = _parsePenIdx(toks[1]), i2 = _parsePenIdx(toks[2]);
    const side = toks[3];
    const p1 = _penGetPt(i1), p2 = _penGetPt(i2);
    if(!p1 || !p2){ skCmdLog('  ⚠ 두께: 점 번호 오류', 'err'); return; }
    if(side !== '좌' && side !== '우' && side !== 'L' && side !== 'R'){
      skCmdLog('  ⚠ 두께 방향은 좌/우', 'err'); return;
    }
    const T = state.thickness || 0.6;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const ln = Math.hypot(dx, dy);
    if(ln < 1e-6){ skCmdLog('  ⚠ 두 점이 일치', 'err'); return; }
    let nx, ny;
    if(side === '좌' || side === 'L'){ nx = -dy/ln; ny = dx/ln; }
    else                              { nx =  dy/ln; ny = -dx/ln; }
    const ox = nx*T, oy = ny*T;
    pushHistory();
    state.shapes.push({type:'line', x1:p1.x+ox, y1:p1.y+oy, x2:p2.x+ox, y2:p2.y+oy,
      color:col(), lineWidth:lw()});
    // v8.40: 두께 평행선 두 끝점에 펜점 자동 부여
    let autoAdded = 0;
    if(typeof window.sk3SyncPenPointsToShapes === 'function'){
      autoAdded = window.sk3SyncPenPointsToShapes();
    }
    redrawSketch(); updateInfo();
    skCmdLog('  ⚙ 두께 P' + i1 + '–P' + i2 + ' ' + side + ' ' + T + 'mm' + (autoAdded?' · 신규 펜점 ' + autoAdded + '개':''), 'sys');
    _lastCmd = raw; return;
  }

  skCmdLog("  ⚠ '" + raw + "' 알 수 없는 명령 — ? 입력으로 도움말", 'err');
}

// v8.39: 도구바 onclick에서 호출 가능하도록 window에 노출
window.sk3ExecuteCmd = sk3ExecuteCmd;

function initCmdBar() {
  if (document.getElementById('sk3CmdBar')) return;

  const style = document.createElement('style');
  style.textContent = `
    #sk3CmdBar {
      position:fixed; left:0; right:0; bottom:0; z-index:8000;
      background:rgba(12,16,20,0.97);
      border-top:1px solid #2e3a45;
      padding:5px 10px 7px;
      display:flex; flex-direction:column; gap:3px;
      font-family:'Malgun Gothic',monospace,sans-serif;
    }
    #sk3CmdBar.sk3-collapsed #sk3CmdHistory { display:none; }
    #sk3CmdHistory {
      max-height:72px; overflow-y:auto;
      font-size:11px; line-height:1.55; font-family:monospace;
    }
    #sk3CmdHistory .sk3-cmd-line { padding:0 2px; color:#7ecb85; }
    #sk3CmdHistory .user  { color:#f0c040; }
    #sk3CmdHistory .sys   { color:#7ecb85; }
    #sk3CmdHistory .help  { color:#7ab8e8; }
    #sk3CmdHistory .err   { color:#ff7070; }
    #sk3CmdInputRow { display:flex; align-items:center; gap:6px; }
    #sk3CmdPrompt {
      color:#f39c12; font-weight:bold; font-size:12px;
      white-space:nowrap; user-select:none;
    }
    #sk3CmdInput {
      flex:1; background:#070b0f; color:#e8edf2;
      border:1px solid #3a4450; border-radius:4px;
      padding:5px 9px; font-size:13px; font-family:monospace; outline:none;
    }
    #sk3CmdInput:focus { border-color:#3a9bdc; box-shadow:0 0 0 1px #3a9bdc44; }
    #sk3CmdHelp, #sk3CmdToggle {
      background:#1e2530; color:#7ab8e8;
      border:1px solid #3a4450; border-radius:4px;
      padding:4px 10px; font-size:11px; cursor:pointer;
    }
    #sk3CmdHelp:hover, #sk3CmdToggle:hover { border-color:#3a9bdc; color:#3a9bdc; }
    #sk3CmdHint { font-size:10px; color:#5a6675; white-space:nowrap; }
  `;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.id = 'sk3CmdBar';
  bar.innerHTML =
    '<div id="sk3CmdHistory"></div>' +
    '<div id="sk3CmdInputRow">' +
      '<span id="sk3CmdPrompt">스케치 명령:</span>' +
      '<input id="sk3CmdInput" type="text" autocomplete="off" spellcheck="false"' +
        ' placeholder="예: RECT 40 25  ·  CIRCLE 30  ·  LINE 0 0 50 0  ·  ? 도움말">' +
      '<button id="sk3CmdHelp">? 도움말</button>' +
      '<button id="sk3CmdToggle">▲</button>' +
      '<span id="sk3CmdHint">↑↓이력 Enter실행 :/포커스 · 📍점클릭→번호삽입 · =수식</span>' +
    '</div>';
  document.body.appendChild(bar);

  const inp = document.getElementById('sk3CmdInput');

  // v8.15: 명령창 포커스 추적 (점번호 자동삽입용)
  inp.addEventListener('focus', () => { _cmdInputActive = inp; });
  // v8.15: 포커스 이탈 시 다른 명령 UI로 갔는지 체크 후 모드 해제
  inp.addEventListener('blur', () => {
    setTimeout(() => {
      const act = document.activeElement;
      if(!act) { _cmdInputActive = null; return; }
      if(act.id === 'sk3CmdInput' || act.id === 'sk3KbInput') return;
      if(act.closest && (act.closest('#sk3KbPanel') || act.closest('#sk3CmdBar'))) return;
      _cmdInputActive = null;
    }, 120);
  });

  inp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      sk3ExecuteCmd(inp.value);
      inp.value = '';
      _cmdHistIdx = -1;
      _cmdInputActive = null;  // v8.15: 실행 후 점번호삽입 모드 해제
      e.preventDefault();
    } else if (e.key === 'Escape') {
      inp.value = ''; _cmdHistIdx = -1; inp.blur();
      _cmdInputActive = null;  // v8.15
    } else if (e.key === 'ArrowUp') {
      _cmdHistIdx = Math.min(_cmdHistIdx + 1, _cmdHistory.length - 1);
      inp.value = _cmdHistory[_cmdHistIdx] || '';
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      _cmdHistIdx = Math.max(_cmdHistIdx - 1, -1);
      inp.value = _cmdHistIdx >= 0 ? (_cmdHistory[_cmdHistIdx] || '') : '';
      e.preventDefault();
    }
  });

  document.getElementById('sk3CmdHelp').addEventListener('click', function() {
    sk3ExecuteCmd('?');
  });

  document.getElementById('sk3CmdToggle').addEventListener('click', function() {
    const b = document.getElementById('sk3CmdBar');
    const collapsed = b.classList.toggle('sk3-collapsed');
    document.getElementById('sk3CmdToggle').textContent = collapsed ? '▼' : '▲';
  });

  window.addEventListener('keydown', function(e) {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === ':' || e.key === '/') { e.preventDefault(); inp.focus(); }
  });

  skCmdLog('▶ draw_tool3 커맨드바 준비 (v1.0) · ? 도움말  : 또는 / 로 포커스', 'sys');
  initCmdKeyboard();
}


/* ============================================================
   draw_tool3 명령 키보드 패널  v1.0
   ============================================================ */
// 기본도형 입력 모달 (단순 prompt 체인)
function sk3OpenShapeModal(type){
  try {
    if(type === 'arc'){
      const cxs = prompt('원/호 중심 X (mm)', '0');
      if(cxs === null) return;
      const cys = prompt('원/호 중심 Y (mm)', '0');
      if(cys === null) return;
      const ds = prompt('지름 D (mm)', '20');
      if(ds === null) return;
      const cx = parseFloat(cxs), cy = parseFloat(cys), d = parseFloat(ds);
      if(![cx,cy,d].every(isFinite) || d<=0){ toast('숫자 입력 오류'); return; }
      const wantArc = confirm('호로 그리시겠습니까?\n(확인=호 / 취소=완전한 원)');
      if(wantArc){
        const ss = prompt('시작 각도 (°, 0=오른쪽, 반시계+)', '0');
        if(ss === null) return;
        const es = prompt('끝 각도 (°)', '90');
        if(es === null) return;
        const s = parseFloat(ss), e = parseFloat(es);
        if(!isFinite(s) || !isFinite(e)){ toast('각도 오류'); return; }
        sk3ExecuteCmd('ARC ' + cx + ' ' + cy + ' ' + (d/2) + ' ' + s + ' ' + e);
      } else {
        sk3ExecuteCmd('CIRCLE ' + cx + ' ' + cy + ' ' + d);
      }
    } else if(type === 'rect'){
      const xs = prompt('중심 X (mm)', '0');
      if(xs === null) return;
      const ys = prompt('중심 Y (mm)', '0');
      if(ys === null) return;
      const ws = prompt('가로 W (mm)', '40');
      if(ws === null) return;
      const hs = prompt('세로 H (mm)', '25');
      if(hs === null) return;
      const x = parseFloat(xs), y = parseFloat(ys), w = parseFloat(ws), h = parseFloat(hs);
      if(![x,y,w,h].every(isFinite) || w<=0 || h<=0){ toast('숫자 입력 오류'); return; }
      sk3ExecuteCmd('RECT ' + x + ' ' + y + ' ' + w + ' ' + h);
    } else if(type === 'tri'){
      const cxs = prompt('중심 X (mm)', '0');
      if(cxs === null) return;
      const cys = prompt('중심 Y (mm)', '0');
      if(cys === null) return;
      const ss = prompt('변 길이 (mm)', '50');
      if(ss === null) return;
      const rs = prompt('회전° (반시계+, 기본 0=꼭짓점 위)', '0');
      if(rs === null) return;
      const cx = parseFloat(cxs), cy = parseFloat(cys), side = parseFloat(ss), rot = parseFloat(rs);
      if(![cx,cy,side,rot].every(isFinite) || side<=0){ toast('숫자 입력 오류'); return; }
      sk3ExecuteCmd('삼각형 ' + side + ' ' + cx + ' ' + cy + ' ' + rot);
    }
  } catch(e){ toast('모달 오류: ' + e.message); }
}

function initCmdKeyboard() {
  if (document.getElementById('sk3KbPanel')) return;

  // ── 카테고리/버튼 정의 ─────────────────────────────────
  const CMD_CATS = {
    '점': [
      { l:'점 X,Y',     t:'점 ',         ex:'점 -100,100 → 좌표(mm)에 점' },
      { l:'점 N',       t:'점 ',         ex:'점 5 → 5번 점을 현재점으로 선택' },
      { l:'점',         t:'점 ',         ex:'점 우 3 → 현재점서 우3mm 독립점 · 점 우 3 하 5 대각 가능' },
      { l:'점 좌 지름', t:'점 좌 지름 ', ex:'점 좌 지름 110 130 → 지름차/2 만큼 좌측 독립점 (지=지름)' },
    ],
    '선': [
      { l:'우/좌/상/하', cycle:['우','좌','상','하'], ex:'그 방향 D mm 선. 클릭마다 방향 순환' },
      { l:'선 방향 교점',t:'선 좌 교점',  ex:'선 좌 교점 → 좌로 첫 교점까지 선' },
      { l:'선 좌 지름', t:'선 좌 지름 ', ex:'선 좌 지름 110 130 → 지름차/2 만큼 좌측 선' },
      { l:'연결',       t:'연결 ',       ex:'연결 1 4 → 1번·4번 직선 연결' },
      { l:'각 A 거리',  t:'각 ',         ex:'각 45 100 → 45°로 100mm 선 / 각 45 교점' },
      { l:'호',         t:'호 ',         ex:'호 2 3 시계 각 45 / 호 2 3 시계 교점' },
    ],
    '기준': [
      { l:'기준 X Y',   t:'기준 ',       ex:'기준 -50 30 → 빈공간에 기준점(노란⊕)' },
      { l:'기준 지름',  t:'기준 지름 ',  ex:'기준 지름 130 110 → (-D1/2, D2) 기준점' },
      { l:'기준 방향',  t:'기준 상 ',    ex:'기준 상 50 → 현 기준점에서 방향D 이동' },
    ],
    '기본도형': [
      { l:'⭕ 원/호',   action: () => sk3OpenShapeModal('arc'),  ex:'⭕ 원/호 입력 모달 (중심X,Y · 지름 · [호 각도])' },
      { l:'▭ 사각형',   action: () => sk3OpenShapeModal('rect'), ex:'▭ 사각형 입력 모달 (중심X,Y · W,H)' },
      { l:'△ 삼각형',   action: () => sk3OpenShapeModal('tri'),  ex:'△ 정삼각형 입력 모달 (중심X,Y · 변 · 회전°)' },
    ],
    '연장/절교': [
      { l:'연장',       t:'연장 ',       ex:'연장 1 2 30 → P2 방향으로 30mm 연장 / 교점' },
      { l:'줄이기',     t:'줄이기 ',     ex:'줄이기 1 2 30 → P2쪽에서 30mm 축소' },
      { l:'절교 두점',  t:'절교 ',       ex:'절교 9 10 3 수직 → P9→P10 연장↔P3 수직/수평선까지' },
      { l:'절교 방향',  t:'절교 ',       ex:'절교 1 하 수평 0 → P1에서 하방향, P0 수평선까지' },
      { l:'절각',       t:'절각 ',       ex:'절각 3 45 5 수직 → P3에서 45°, P5 수직/수평선까지' },
    ],
    '편집': [
      { l:'이동',         t:'이동 ',      ex:'이동 1 우 10 → P1을 우10mm (선도 함께) / 이동 상 3=현재점' },
      { l:'거리두기',     t:'거리두기 ',  ex:'거리두기 2 3 좌 0.6 → P2→P3 진행기준 좌측 0.6mm 평행복제' },
      { l:'삭제',         t:'삭제 ',      ex:'삭제 1 2 (선) / 삭제 3 (점)' },
      { l:'⊞ 교차(분할)', action: () => sk3ExecuteCmd('교차'),        ex:'⊞ 모든 선 교차점에서 자동 분할 → 클릭/선택 가능한 조각들' },
      { l:'🗑 삭제(선택)',action: () => { if(typeof deleteSelected==='function') deleteSelected(); }, ex:'🗑 마우스로 선택한 도형 삭제 (Delete 키와 동일)' },
      { l:'닫기',         t:'닫기',       ex:'닫기 → 현재점 → P0 자동 직선 연결' },
      { l:'백(취소)',     t:'백',         ex:'백 → 직전 작업 1회 취소' },
      { l:'교점',         t:'교점',       ex:'교점 → 모든 선 교차점에 자동 번호부여' },
      { l:'만남',         t:'만남 ',      ex:'만남 N1 N2 → 두 선을 무한연장한 교점에 번호' },
      { l:'🏷 라벨 자동', action: () => sk3ExecuteCmd('라벨'), ex:'🏷 라벨없는 모든 선 끝점에 자동 P번호 부여' },
      { l:'🧹 정리',      t:'정리 ',      ex:'🧹 정리 0.1 → 점 전체 + ≤0.1mm 짧은 선 일괄 삭제' },
      { l:'🧬 통합(겹친선)', action: () => sk3ExecuteCmd('통합'), ex:'🧬 겹친 선/포함된 선/끝점 닿은 collinear 선을 1개로 통합' },
      { l:'🖊 외곽선',    action: () => sk3ExecuteCmd('외곽선'), ex:'🖊 선택된 선들의 끝점에 자동 라벨 (선택후 클릭)' },
      { l:'🎨 채움',      action: () => sk3ExecuteCmd('채움'),    ex:'🎨 선택된 도형(사각형/원)에 채움 색상 입력 (선택후 클릭)' },
      { l:'🧽 쓸어지우기',action: () => sk3ExecuteCmd('쓸어지우기'), ex:'🧽 도구 활성화 → 캔버스 드래그로 박스 안 도형 일괄 삭제' },
    ],
  };

  // ── CSS ────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #sk3KbPanel {
      position:fixed; right:14px; bottom:140px; z-index:9050;
      width:270px;
      background:rgba(14,18,24,0.97); border:1px solid #2e3a45;
      border-radius:10px; box-shadow:0 6px 24px rgba(0,0,0,.5);
      font-family:'Malgun Gothic',sans-serif; color:#e8edf2;
      display:none; flex-direction:column; font-size:12px;
      user-select:none;
    }
    #sk3KbHead {
      display:flex; align-items:center; justify-content:space-between;
      padding:8px 12px 6px;
      border-bottom:1px solid #2e3a45;
      cursor:move;
      border-radius:10px 10px 0 0;
      background:rgba(30,36,44,0.7);
    }
    #sk3KbHead span { font-weight:700; font-size:13px; border-left:3px solid #3a9bdc; padding-left:8px; }
    #sk3KbClose { background:none; border:none; color:#7ab8e8; cursor:pointer; font-size:16px; padding:0 4px; }
    #sk3KbTabs {
      display:flex; flex-wrap:wrap; gap:4px; padding:8px 10px 4px;
      border-bottom:1px solid #1e2530;
    }
    .sk3-kbtab {
      background:#1e2530; color:#9bbfd4;
      border:1px solid #3a4450; border-radius:5px;
      padding:4px 9px; font-size:11px; cursor:pointer;
      font-family:inherit;
    }
    .sk3-kbtab:hover { border-color:#3a9bdc; color:#3a9bdc; }
    .sk3-kbtab.active { background:#3a9bdc; color:#08121a; font-weight:700; border-color:#3a9bdc; }
    #sk3KbHint {
      font-size:10px; color:#5a8a9a; padding:5px 10px 3px;
      min-height:28px; line-height:1.4; word-break:keep-all;
    }
    #sk3KbBtns {
      display:flex; flex-wrap:wrap; gap:5px; padding:6px 10px 4px;
    }
    .sk3-kbbtn {
      background:#1e2530; color:#c8dde8;
      border:1px solid #3a4450; border-radius:5px;
      padding:5px 8px; font-size:11px; cursor:pointer;
      font-family:inherit; white-space:nowrap;
    }
    .sk3-kbbtn:hover { border-color:#3a9bdc; color:#3a9bdc; }
    .sk3-kbbtn.cycle { background:#1e3530; border-color:#2a5545; }
    .sk3-kbbtn.action { background:#2a3040; border-color:#3a4860; }
    #sk3KbInput {
      background:#070b0f; color:#e8edf2;
      border:1px solid #3a4450; border-radius:4px;
      padding:5px 9px; font-size:13px; font-family:monospace;
      margin:4px 10px; width:calc(100% - 20px); box-sizing:border-box;
      outline:none;
    }
    #sk3KbInput:focus { border-color:#3a9bdc; }
    #sk3KbNumpad {
      display:grid; grid-template-columns:repeat(4,1fr); gap:4px;
      padding:6px 10px;
    }
    .sk3-kbnum {
      background:#1a2230; color:#c8dde8;
      border:1px solid #2e3a45; border-radius:5px;
      padding:8px 0; font-size:13px; cursor:pointer;
      text-align:center; font-family:monospace;
    }
    .sk3-kbnum:hover { border-color:#3a9bdc; color:#3a9bdc; }
    /* v8.15: 수식/반값 버튼 */
    .sk3-kbcalc { background:#1e2a30; color:#7ad4d4; border-color:#2e4a55; }
    .sk3-kbcalc:hover { border-color:#5acbcb; color:#5acbcb; }
    .sk3-kbhalf { background:#3a2a10; color:#f39c12; border-color:#6a4a20; font-weight:700; }
    .sk3-kbhalf:hover { border-color:#ffaa30; color:#ffaa30; }
    #sk3KbActions {
      display:flex; gap:5px; padding:6px 10px 8px;
    }
    #sk3KbBack  { flex:1; background:#2a3040; color:#ccc; border:1px solid #3a4450; border-radius:5px; padding:7px 0; cursor:pointer; font-family:inherit; font-size:12px; }
    #sk3KbClear { flex:1; background:#3a2020; color:#ff9090; border:1px solid #6a3030; border-radius:5px; padding:7px 0; cursor:pointer; font-family:inherit; font-size:12px; }
    #sk3KbRun   { flex:2; background:#1a5a1a; color:#90ff90; border:1px solid #2a8a2a; border-radius:5px; padding:7px 0; cursor:pointer; font-family:inherit; font-size:13px; font-weight:bold; }
    #sk3KbBack:hover  { border-color:#5a6aaa; }
    #sk3KbClear:hover { border-color:#ff5050; }
    #sk3KbRun:hover   { background:#2a7a2a; }
    #sk3KbOpenBtn {
      position:fixed; right:14px; bottom:140px; z-index:9000;
      background:rgba(30,60,100,0.92); color:#7ab8e8;
      border:1px solid #3a5a80; border-radius:8px;
      padding:7px 12px; font-size:12px; cursor:pointer;
      font-family:'Malgun Gothic',sans-serif;
      box-shadow:0 2px 8px rgba(0,0,0,.4);
    }
    #sk3KbOpenBtn:hover { background:rgba(40,80,130,0.95); border-color:#3a9bdc; color:#3a9bdc; }
  `;
  document.head.appendChild(style);

  // ── 열기 버튼 ──────────────────────────────────────────
  const openBtn = document.createElement('button');
  openBtn.id = 'sk3KbOpenBtn';
  openBtn.textContent = '⌨ 명령 키보드';
  document.body.appendChild(openBtn);

  // ── 패널 HTML ─────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'sk3KbPanel';
  panel.innerHTML =
    '<div id="sk3KbHead">' +
      '<span>⌨ 명령 키보드</span>' +
      '<button id="sk3KbClose">✕</button>' +
    '</div>' +
    '<div id="sk3KbTabs"></div>' +
    '<div id="sk3KbHint">명령 버튼을 누르면 사용법이 여기에 표시됩니다.</div>' +
    '<div id="sk3KbBtns"></div>' +
    '<input id="sk3KbInput" type="text" autocomplete="off" spellcheck="false" placeholder="여기에 명령이 조립됩니다">' +
    '<div id="sk3KbNumpad">' +
      '<div class="sk3-kbnum" data-k="7">7</div>' +
      '<div class="sk3-kbnum" data-k="8">8</div>' +
      '<div class="sk3-kbnum" data-k="9">9</div>' +
      '<div class="sk3-kbnum" data-k="좌">좌</div>' +
      '<div class="sk3-kbnum" data-k="4">4</div>' +
      '<div class="sk3-kbnum" data-k="5">5</div>' +
      '<div class="sk3-kbnum" data-k="6">6</div>' +
      '<div class="sk3-kbnum" data-k="우">우</div>' +
      '<div class="sk3-kbnum" data-k="1">1</div>' +
      '<div class="sk3-kbnum" data-k="2">2</div>' +
      '<div class="sk3-kbnum" data-k="3">3</div>' +
      '<div class="sk3-kbnum" data-k="상">상</div>' +
      '<div class="sk3-kbnum" data-k="0">0</div>' +
      '<div class="sk3-kbnum" data-k=".">.</div>' +
      '<div class="sk3-kbnum" data-k=" ">_</div>' +
      '<div class="sk3-kbnum" data-k="하">하</div>' +
      // v8.15: =, /2, +, - 추가 (수식 입력 + 반값)
      '<div class="sk3-kbnum sk3-kbcalc" data-k="=">=</div>' +
      '<div class="sk3-kbnum sk3-kbcalc" data-k="+">+</div>' +
      '<div class="sk3-kbnum sk3-kbcalc" data-k="-">-</div>' +
      '<div class="sk3-kbnum sk3-kbhalf" id="sk3KbHalf" title="끝의 숫자를 반값으로 (예: 100→50)">÷2</div>' +
      '<div class="sk3-kbnum" data-k="수직">수직</div>' +
      '<div class="sk3-kbnum" data-k="수평">수평</div>' +
      '<div class="sk3-kbnum" data-k="지름">지름</div>' +
      '<div class="sk3-kbnum" data-k="교점">교점</div>' +
    '</div>' +
    '<div id="sk3KbActions">' +
      '<button id="sk3KbBack">⌫ 지움</button>' +
      '<button id="sk3KbClear">전체삭제</button>' +
      '<button id="sk3KbRun">▶ 실행</button>' +
    '</div>';
  document.body.appendChild(panel);

  // ── 탭/버튼 렌더 ───────────────────────────────────────
  const tabsEl  = document.getElementById('sk3KbTabs');
  const btnsEl  = document.getElementById('sk3KbBtns');
  const hintEl  = document.getElementById('sk3KbHint');
  const kbInput = document.getElementById('sk3KbInput');
  const mainInp = document.getElementById('sk3CmdInput'); // 커맨드바 입력창

  function setBuf(v){ kbInput.value = v; if(mainInp) mainInp.value = v; }
  function appendBuf(s){
    let cur = kbInput.value;
    const keywords = ['좌','우','상','하','수직','수평','지름','교점'];
    // v8.15: =, +, - 는 공백 없이 직접 부착 (숫자 뒤에 바로 붙음)
    const noSpaceOps = ['=','+','-'];
    if(noSpaceOps.includes(s)){
      setBuf(cur + s);
      return;
    }
    if(keywords.includes(s.trim())){
      if(cur && !cur.endsWith(' ')) s = ' ' + s;
      s = s + ' ';
    }
    setBuf(cur + s);
  }

  // v8.15: 끝의 숫자/수식 토큰을 반값으로 (100→50, 200→100)
  // - 마지막 공백 이후의 토큰을 찾아 수식 평가 후 반값으로 치환
  // - 토큰이 없으면 끝의 숫자 패턴을 찾아 반값
  function halveLastToken(){
    let buf = kbInput.value;
    if(!buf.trim()){ hintEl.textContent = '⚠ 입력값 없음'; return; }
    // 끝에서부터 공백 위치 찾기
    const trimRight = buf.replace(/\s+$/, '');
    const lastSp = trimRight.lastIndexOf(' ');
    const before = lastSp >= 0 ? trimRight.substring(0, lastSp + 1) : '';
    const lastTok = lastSp >= 0 ? trimRight.substring(lastSp + 1) : trimRight;
    if(!lastTok){ hintEl.textContent = '⚠ 마지막 숫자 없음'; return; }
    // 수식 평가 (=, +, -, *, /, () 지원)
    let v;
    try {
      const cleaned = lastTok.replace(/[^0-9+\-*/.()]/g, '');
      if(!cleaned){ hintEl.textContent = '⚠ "' + lastTok + '"는 숫자 아님'; return; }
      v = Function('"use strict";return (' + cleaned + ')')();
    } catch(e){ hintEl.textContent = '⚠ 수식 오류: ' + lastTok; return; }
    if(!isFinite(v)){ hintEl.textContent = '⚠ 평가 실패: ' + lastTok; return; }
    const half = v / 2;
    // 정수면 정수로, 아니면 소수 (불필요한 0 제거)
    let halfStr;
    if(half === Math.floor(half)) halfStr = String(half);
    else halfStr = String(parseFloat(half.toFixed(6)));
    setBuf(before + halfStr + ' ');
    hintEl.textContent = '÷2 적용: ' + lastTok + ' → ' + halfStr;
    kbInput.focus();
  }

  function renderTab(cat){
    btnsEl.innerHTML = '';
    (CMD_CATS[cat]||[]).forEach(c => {
      const b = document.createElement('button');
      b.className = 'sk3-kbbtn';
      b.textContent = c.l;
      if(Array.isArray(c.cycle)){
        b.classList.add('cycle');
        b.dataset.cycleIdx = '0';
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.cycleIdx||'0', 10);
          const dir = c.cycle[idx];
          const cur = kbInput.value;
          const firstTok = cur.trim().split(/\s+/)[0];
          let newBuf;
          if(c.cycle.includes(firstTok)){ newBuf = cur.replace(/^\s*\S+/, dir); }
          else { newBuf = dir + ' '; }
          setBuf(newBuf);
          b.textContent = dir + ' (다음: ' + c.cycle[(idx+1)%c.cycle.length] + ')';
          b.dataset.cycleIdx = String((idx+1) % c.cycle.length);
          hintEl.textContent = '🔁 ' + c.ex;
        });
      } else if(typeof c.action === 'function'){
        b.classList.add('action');
        b.addEventListener('click', () => {
          hintEl.textContent = '▶ ' + c.ex;
          try{ c.action(); }catch(e){ hintEl.textContent = '✗ 오류: '+(e.message||e); }
        });
      } else {
        b.addEventListener('click', () => {
          setBuf(c.t);
          hintEl.textContent = '📝 ' + c.ex;
          kbInput.focus();
        });
      }
      btnsEl.appendChild(b);
    });
    tabsEl.querySelectorAll('.sk3-kbtab').forEach(t =>
      t.classList.toggle('active', t.dataset.cat === cat));
  }

  Object.keys(CMD_CATS).forEach((cat, i) => {
    const t = document.createElement('button');
    t.className = 'sk3-kbtab' + (i===0?' active':'');
    t.textContent = cat; t.dataset.cat = cat;
    t.addEventListener('click', () => renderTab(cat));
    tabsEl.appendChild(t);
  });
  renderTab(Object.keys(CMD_CATS)[0]);

  // ── 숫자패드 ──────────────────────────────────────────
  document.querySelectorAll('#sk3KbNumpad .sk3-kbnum').forEach(k => {
    // v8.15: ÷2 버튼은 별도 핸들러
    if(k.id === 'sk3KbHalf') return;
    k.addEventListener('click', () => { appendBuf(k.dataset.k); kbInput.focus(); });
  });
  // v8.15: ÷2 버튼 - 끝의 숫자를 반값으로
  const halfBtn = document.getElementById('sk3KbHalf');
  if(halfBtn) halfBtn.addEventListener('click', halveLastToken);

  // ── 실행 버튼들 ───────────────────────────────────────
  document.getElementById('sk3KbBack').addEventListener('click', () =>
    setBuf(kbInput.value.slice(0,-1)));
  document.getElementById('sk3KbClear').addEventListener('click', () => {
    setBuf('');
    _cmdInputActive = null;  // v8.15: 점번호삽입 모드 해제
  });
  document.getElementById('sk3KbRun').addEventListener('click', () => {
    const v = kbInput.value.trim();
    if(!v) return;
    sk3ExecuteCmd(v);
    setBuf('');
    _cmdInputActive = null;  // v8.15: 실행 후 모드 해제
  });

  // v8.15: 키보드 입력창 포커스 추적 (점번호 자동삽입용)
  kbInput.addEventListener('focus', () => { _cmdInputActive = kbInput; });
  kbInput.addEventListener('blur', () => {
    setTimeout(() => {
      const act = document.activeElement;
      if(!act) { _cmdInputActive = null; return; }
      if(act.id === 'sk3CmdInput' || act.id === 'sk3KbInput') return;
      if(act.closest && (act.closest('#sk3KbPanel') || act.closest('#sk3CmdBar'))) return;
      _cmdInputActive = null;
    }, 120);
  });

  kbInput.addEventListener('keydown', e => {
    if(e.key === 'Enter'){
      const v = kbInput.value.trim();
      if(v){ sk3ExecuteCmd(v); setBuf(''); _cmdInputActive = null; }
      e.preventDefault();
    } else if(e.key === 'Escape'){
      setBuf(''); _cmdInputActive = null; kbInput.blur();
    }
  });

  // ── 열기/닫기 ─────────────────────────────────────────
  openBtn.addEventListener('click', () => {
    const vis = panel.style.display === 'flex';
    panel.style.display = vis ? 'none' : 'flex';
    openBtn.style.display = vis ? '' : 'none';
  });
  document.getElementById('sk3KbClose').addEventListener('click', () => {
    panel.style.display = 'none';
    openBtn.style.display = '';
  });

  // ── 드래그 이동 ───────────────────────────────────────
  const head = document.getElementById('sk3KbHead');
  let drag=false, ox=0, oy=0;
  head.addEventListener('mousedown', e => {
    drag=true; const r=panel.getBoundingClientRect(); ox=e.clientX-r.left; oy=e.clientY-r.top; e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if(!drag) return;
    panel.style.left=(e.clientX-ox)+'px'; panel.style.top=(e.clientY-oy)+'px';
    panel.style.right='auto'; panel.style.bottom='auto';
  });
  window.addEventListener('mouseup', () => { drag=false; });
}

// ─── v8.28: 풍성한 계산기 모달 (Windows 계산기 표준 모드) ────
// - 모든 number input에 자동 연결: focus/click 시 모달 오픈
// - 4칙연산 + 메모리(MC/MR/M+/M-/MS) + 1/x, x², √, ±, %, ÷2, ×2
// - 적용 시 input.value 갱신 + change 이벤트 발생 (기존 핸들러 트리거)
(function initSk3Calc(){
  const calc = {
    target: null,      // 연결된 input 엘리먼트
    display: '0',
    accumulator: null,
    pendingOp: null,
    newEntry: false,
    memory: 0,
    exprHistory: ''    // 표시용 식 (예: "12 + 34")
  };
  window._sk3Calc = calc;

  function $(id){ return document.getElementById(id); }
  function dispBox(){ return $('sk3CalcDisp'); }
  function exprBox(){ return $('sk3CalcExpr'); }
  function memInd(){ return $('sk3CalcMemInd'); }

  function fmtNum(s){
    // 너무 긴 소수는 잘라서 표시
    let n = parseFloat(s);
    if(!isFinite(n)) return 'Error';
    if(Math.abs(n) < 1e-12) n = 0;
    let str = String(n);
    if(str.length > 16){
      str = n.toPrecision(12);
      // 불필요한 0 제거
      if(str.includes('e')) return str;
      if(str.includes('.')) str = str.replace(/0+$/, '').replace(/\.$/, '');
    }
    return str;
  }

  function render(){
    dispBox().textContent = calc.display === 'Error' ? 'Error' : fmtNum(calc.display);
    exprBox().textContent = calc.exprHistory;
    memInd().textContent = (Math.abs(calc.memory) > 1e-12) ? ('M: ' + fmtNum(String(calc.memory))) : '';
  }

  function evalOp(op, a, b){
    if(!isFinite(a) || !isFinite(b)) return NaN;
    if(op === '+') return a + b;
    if(op === '-') return a - b;
    if(op === '*') return a * b;
    if(op === '/') return b === 0 ? NaN : a / b;
    return b;
  }

  function opSymbol(op){
    return op === '*' ? '×' : op === '/' ? '÷' : op;
  }

  function press(key){
    if(calc.display === 'Error' && key !== 'C' && key !== 'CE'){
      calc.display = '0'; calc.accumulator = null; calc.pendingOp = null; calc.newEntry = false; calc.exprHistory = '';
    }
    if(/^[0-9]$/.test(key)){
      if(calc.newEntry || calc.display === '0'){ calc.display = key; calc.newEntry = false; }
      else if(calc.display.replace('-','').replace('.','').length < 16) calc.display += key;
    } else if(key === '.'){
      if(calc.newEntry){ calc.display = '0.'; calc.newEntry = false; }
      else if(!calc.display.includes('.')) calc.display += '.';
    } else if(['+','-','*','/'].includes(key)){
      if(calc.pendingOp && !calc.newEntry){
        const r = evalOp(calc.pendingOp, calc.accumulator, parseFloat(calc.display));
        calc.display = String(r); calc.accumulator = r;
      } else {
        calc.accumulator = parseFloat(calc.display);
      }
      calc.exprHistory = fmtNum(String(calc.accumulator)) + ' ' + opSymbol(key);
      calc.pendingOp = key; calc.newEntry = true;
    } else if(key === '='){
      if(calc.pendingOp){
        calc.exprHistory = fmtNum(String(calc.accumulator)) + ' ' + opSymbol(calc.pendingOp) + ' ' + fmtNum(calc.display) + ' =';
        const r = evalOp(calc.pendingOp, calc.accumulator, parseFloat(calc.display));
        calc.display = String(r); calc.accumulator = null; calc.pendingOp = null; calc.newEntry = true;
      }
    } else if(key === 'C'){
      calc.display = '0'; calc.accumulator = null; calc.pendingOp = null; calc.newEntry = false; calc.exprHistory = '';
    } else if(key === 'CE'){
      calc.display = '0'; calc.newEntry = false;
    } else if(key === '⌫'){
      if(!calc.newEntry){
        if(calc.display.length > 1 && !(calc.display.length === 2 && calc.display.startsWith('-'))){
          calc.display = calc.display.slice(0, -1);
        } else {
          calc.display = '0';
        }
      }
    } else if(key === '+/-'){
      if(calc.display !== '0' && calc.display !== 'Error'){
        calc.display = calc.display.startsWith('-') ? calc.display.slice(1) : '-' + calc.display;
      }
    } else if(key === '1/x'){
      const v = parseFloat(calc.display);
      if(v === 0){ calc.display = 'Error'; }
      else { calc.exprHistory = '1/(' + fmtNum(calc.display) + ')'; calc.display = String(1/v); calc.newEntry = true; }
    } else if(key === 'x²'){
      const v = parseFloat(calc.display);
      calc.exprHistory = 'sqr(' + fmtNum(calc.display) + ')'; calc.display = String(v*v); calc.newEntry = true;
    } else if(key === '√'){
      const v = parseFloat(calc.display);
      if(v < 0){ calc.display = 'Error'; }
      else { calc.exprHistory = '√(' + fmtNum(calc.display) + ')'; calc.display = String(Math.sqrt(v)); calc.newEntry = true; }
    } else if(key === '%'){
      const v = parseFloat(calc.display);
      if(calc.pendingOp){
        const r = calc.accumulator * v / 100;
        calc.display = String(r);
      } else {
        calc.display = String(v / 100);
      }
      calc.newEntry = true;
    } else if(key === '÷2'){
      const v = parseFloat(calc.display);
      calc.exprHistory = fmtNum(calc.display) + ' ÷ 2'; calc.display = String(v/2); calc.newEntry = true;
    } else if(key === 'x2'){
      const v = parseFloat(calc.display);
      calc.exprHistory = fmtNum(calc.display) + ' × 2'; calc.display = String(v*2); calc.newEntry = true;
    } else if(key === 'x10'){
      const v = parseFloat(calc.display);
      calc.exprHistory = fmtNum(calc.display) + ' × 10'; calc.display = String(v*10); calc.newEntry = true;
    } else if(key === 'd10'){
      const v = parseFloat(calc.display);
      calc.exprHistory = fmtNum(calc.display) + ' ÷ 10'; calc.display = String(v/10); calc.newEntry = true;
    } else if(key === 'MC'){ calc.memory = 0; }
    else if(key === 'MR'){ calc.display = String(calc.memory); calc.newEntry = true; }
    else if(key === 'M+'){ calc.memory += parseFloat(calc.display) || 0; calc.newEntry = true; }
    else if(key === 'M-'){ calc.memory -= parseFloat(calc.display) || 0; calc.newEntry = true; }
    else if(key === 'MS'){ calc.memory = parseFloat(calc.display) || 0; calc.newEntry = true; }
    render();
  }

  window.sk3CalcOpen = function(input){
    if(!input) return;
    calc.target = input;
    // 입력란의 현재 값으로 시작
    const cur = String(input.value || '').trim();
    if(cur === '' || cur === '0' || !isFinite(parseFloat(cur))){
      calc.display = '0';
    } else {
      // 수식 형태(=10+5 등) → 평가 후 표시
      const cleaned = cur.replace(/[^0-9+\-*/.()]/g, '');
      try {
        const v = Function('"use strict";return (' + cleaned + ')')();
        calc.display = isFinite(v) ? String(v) : cur;
      } catch(e){ calc.display = '0'; }
    }
    calc.accumulator = null; calc.pendingOp = null; calc.newEntry = true; calc.exprHistory = '';
    // 라벨 표시 (input의 라벨 텍스트 찾기)
    let labelTxt = '';
    const row = input.closest && input.closest('.prop-row');
    if(row){
      const lab = row.querySelector('label');
      if(lab) labelTxt = lab.textContent.trim();
    }
    if(!labelTxt && input.id) labelTxt = input.id;
    if(!labelTxt && input.placeholder) labelTxt = input.placeholder;
    $('sk3CalcTarget').textContent = labelTxt ? '→ ' + labelTxt : '';
    $('sk3CalcOverlay').style.display = 'flex';
    render();
    // input은 포커스 잃지 않게 (Apply 시 직접 갱신)
    setTimeout(() => $('sk3CalcDisp').focus && $('sk3CalcDisp').focus(), 0);
  };

  window.sk3CalcCancel = function(){
    $('sk3CalcOverlay').style.display = 'none';
    calc.target = null;
  };

  // v8.33: 지름좌표 변환 — 현재 표시값을 지름으로 보고 양쪽 점 추가
  window.sk3CalcDiameter = function(){
    if(calc.display === 'Error'){ return; }
    if(calc.pendingOp){ press('='); }
    const v = parseFloat(calc.display);
    if(!isFinite(v) || v <= 0){ alert('유효한 지름 필요 (>0)'); return; }
    if(typeof window.sk3AddDiameterPoints === 'function'){
      window.sk3AddDiameterPoints(v);
    }
    sk3CalcCancel();
  };

  window.sk3CalcApply = function(){
    if(!calc.target){ sk3CalcCancel(); return; }
    if(calc.display === 'Error'){ return; }
    // 진행 중인 연산이 있으면 = 자동
    if(calc.pendingOp){ press('='); }
    const val = parseFloat(calc.display);
    if(!isFinite(val)){ return; }

    // v8.42: 모달 열려 있는 동안 redrawSketch가 호출되면 sk3UpdateSelProp이
    // 속성 패널 HTML을 재생성하여 calc.target이 stale reference(이미 DOM에서 제거됨)가 됨.
    // 새로 생성된 input은 원본 도형 좌표로 렌더링되어 사용자 입력값이 무시되는 원복 버그.
    // → ID로 live element를 재조회하여 사용
    const liveTarget = calc.target.id ? (document.getElementById(calc.target.id) || calc.target) : calc.target;

    // step 정밀도로 반올림
    const step = parseFloat(liveTarget.step) || 0.01;
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    liveTarget.value = (decimals > 0 ? val.toFixed(decimals) : String(val));

    // v8.42: 이벤트 dispatch는 적용 함수 호출 후로 옮김
    // (먼저 dispatch하면 어떤 핸들러가 redrawSketch를 트리거하여 패널 재생성 →
    //  적용 함수가 새 input의 원본값을 읽게 됨)

    // 속성 패널 input이면 도형/점에 자동 반영 (속성의 "적용" 버튼 자동 클릭)
    const id = liveTarget.id;
    const SHAPE_IDS = ['sk3p1x','sk3p1y','sk3p2x','sk3p2y','sk3cx','sk3cy','sk3r','sk3sd','sk3ed','sk3color','sk3lw'];
    let handled = false;
    if(SHAPE_IDS.indexOf(id) >= 0){
      if(typeof window.sk3ApplySelProp === 'function'){
        try { window.sk3ApplySelProp(); handled = true; } catch(e){}
      }
    } else if(id === 'sk3pxv' || id === 'sk3pyv'){
      // 점 적용: 현재 펜점(state.penCur)이 타겟
      if(typeof window.sk3ApplyPointProp === 'function' &&
         typeof state !== 'undefined' && state.penCur >= 0){
        try { window.sk3ApplyPointProp(state.penCur); handled = true; } catch(e){}
      }
    }
    // 연결된 선 각도/길이 input 자동 적용
    const connMatch = id && id.match(/^sk3conn_(deg|len)_(\d+)$/);
    if(connMatch && liveTarget.dataset.connMeta){
      try {
        const meta = JSON.parse(liveTarget.dataset.connMeta);
        if(typeof window.sk3ApplyConnectedLine === 'function'){
          window.sk3ApplyConnectedLine(meta.pointIdx, meta.shapeIdx, meta.fixedEnd, meta.connIdx);
          handled = true;
        }
      } catch(e){}
    }
    // 도구바 X기준 input
    if(id === 'xOriginInput' && typeof window.sk3SetXOrigin === 'function'){
      try { window.sk3SetXOrigin(); handled = true; } catch(e){}
    }

    // 직접 적용 함수가 없는 input(예: gridSize)은 change 이벤트로 등록된 리스너에 알림
    if(!handled){
      liveTarget.dispatchEvent(new Event('input', {bubbles: true}));
      liveTarget.dispatchEvent(new Event('change', {bubbles: true}));
    }

    sk3CalcCancel();
  };

  // 버튼 클릭 위임
  document.querySelectorAll('#sk3CalcBox .sk3calcbtn[data-k]').forEach(btn => {
    btn.addEventListener('click', () => press(btn.dataset.k));
  });

  // 키보드 입력 처리
  document.addEventListener('keydown', e => {
    if($('sk3CalcOverlay').style.display !== 'flex') return;
    if(e.key >= '0' && e.key <= '9'){ press(e.key); e.preventDefault(); }
    else if(e.key === '.'){ press('.'); e.preventDefault(); }
    else if(e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/'){ press(e.key); e.preventDefault(); }
    else if(e.key === 'Enter' || e.key === '='){ sk3CalcApply(); e.preventDefault(); }
    else if(e.key === 'Escape'){ sk3CalcCancel(); e.preventDefault(); }
    else if(e.key === 'Backspace'){ press('⌫'); e.preventDefault(); }
    else if(e.key === 'Delete'){ press('CE'); e.preventDefault(); }
  });

  // ─── 모든 number input에 자동 연결 ──────────────────────
  // 새로 생성되는 input도 잡기 위해 document 레벨 이벤트 위임
  function shouldAttach(el){
    if(!el || el.tagName !== 'INPUT') return false;
    if(el.type !== 'number') return false;
    if(el.dataset.sk3NoCalc === '1') return false;  // opt-out
    if(el.disabled || el.readOnly) return false;
    return true;
  }

  // focus 시점에 모달 오픈 (click도 focus를 동반)
  document.addEventListener('focusin', e => {
    if(!shouldAttach(e.target)) return;
    // 계산기 자체 내부 입력은 제외 (지금은 없지만 미래 대비)
    if(e.target.closest && e.target.closest('#sk3CalcBox')) return;
    // 이미 모달이 열려 있으면 무시
    if($('sk3CalcOverlay').style.display === 'flex') return;
    // 약간 지연시켜 다른 포커스 핸들러 충돌 방지
    setTimeout(() => {
      if(document.activeElement === e.target){
        e.target.blur();  // 키보드 안 뜨게
        sk3CalcOpen(e.target);
      }
    }, 0);
  }, true);

  // 초기 렌더
  render();
})();

// ─── v8.43: 배경 도면 이미지 ───────────────────────────────────
// 사용 흐름:
//  1) 🖼 배경 버튼 → 모달
//  2) 이미지 파일 선택 → 픽셀 크기 표시
//  3) 도면 실측 폭(mm) 입력 → 높이는 비율 자동
//  4) 투명도 슬라이더 + 정렬(원점 어디에 둘지) + X/Y 미세 오프셋
//  5) 적용 → 캔버스 배경에 표시 (도형/그리드보다 아래 레이어)

window.sk3OpenBgImageModal = function(){
  const m = document.getElementById('bgImageModal');
  if(!m) return;
  // 기존 설정이 있으면 폼 채우기
  if(state.bgImage){
    const bg = state.bgImage;
    document.getElementById('bgImgWidth').value = bg.widthMm;
    document.getElementById('bgImgHeight').value = bg.heightMm;
    document.getElementById('bgImgOpacity').value = Math.round(bg.opacity * 100);
    document.getElementById('bgImgOpacityLbl').textContent = Math.round(bg.opacity * 100) + '%';
    document.getElementById('bgImgAnchor').value = bg.anchor || 'mr';
    document.getElementById('bgImgOffsetX').value = bg.offsetX || 0;
    document.getElementById('bgImgOffsetY').value = bg.offsetY || 0;
    document.getElementById('bgImgInfo').textContent = bg.fileName + ' · ' + bg.pxW + ' × ' + bg.pxH + 'px';
    state._bgImgTemp = {img: bg.img, pxW: bg.pxW, pxH: bg.pxH, fileName: bg.fileName};
  }
  m.style.display = 'flex';
};

window.sk3CloseBgImageModal = function(){
  const m = document.getElementById('bgImageModal');
  if(m) m.style.display = 'none';
};

window.sk3LoadBgImage = function(inputEl){
  if(!inputEl.files || inputEl.files.length === 0) return;
  const file = inputEl.files[0];
  if(!file.type.startsWith('image/')){
    alert('이미지 파일만 가능합니다 (.png, .jpg, .gif, .webp)');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      state._bgImgTemp = {img, pxW: img.width, pxH: img.height, fileName: file.name};
      document.getElementById('bgImgInfo').textContent =
        file.name + ' · ' + img.width + ' × ' + img.height + 'px';
      // 높이 자동 계산 (현재 폭 기준 비율 유지)
      sk3BgImgUpdateHeight();
    };
    img.onerror = () => alert('이미지 로드 실패');
    img.src = ev.target.result;
  };
  reader.onerror = () => alert('파일 읽기 실패');
  reader.readAsDataURL(file);
};

// 높이 자동 계산 (자동 체크박스 ON일 때 — 폭이 변경되면 픽셀 비율로 높이 갱신)
window.sk3BgImgUpdateHeight = function(){
  if(!state._bgImgTemp) return;
  const auto = document.getElementById('bgImgAuto');
  if(!auto || !auto.checked) return;
  const widthMm = parseFloat(document.getElementById('bgImgWidth').value);
  if(!isFinite(widthMm) || widthMm <= 0) return;
  const ratio = state._bgImgTemp.pxH / state._bgImgTemp.pxW;
  const heightMm = widthMm * ratio;
  document.getElementById('bgImgHeight').value = heightMm.toFixed(2);
};

window.sk3ApplyBgImage = function(){
  if(!state._bgImgTemp){
    alert('먼저 이미지 파일을 선택하세요');
    return;
  }
  const widthMm = parseFloat(document.getElementById('bgImgWidth').value);
  const heightMm = parseFloat(document.getElementById('bgImgHeight').value);
  const opacity = (parseFloat(document.getElementById('bgImgOpacity').value) || 50) / 100;
  const anchor = document.getElementById('bgImgAnchor').value || 'mr';
  const offsetX = parseFloat(document.getElementById('bgImgOffsetX').value) || 0;
  const offsetY = parseFloat(document.getElementById('bgImgOffsetY').value) || 0;
  if(!isFinite(widthMm) || widthMm <= 0){ alert('실측 폭(mm) 필요'); return; }
  if(!isFinite(heightMm) || heightMm <= 0){ alert('실측 높이(mm) 필요'); return; }
  state.bgImage = {
    img: state._bgImgTemp.img,
    pxW: state._bgImgTemp.pxW,
    pxH: state._bgImgTemp.pxH,
    fileName: state._bgImgTemp.fileName,
    widthMm, heightMm, opacity, anchor, offsetX, offsetY,
    visible: true
  };
  redrawSketch();
  sk3CloseBgImageModal();
  toast('🖼 배경 도면 적용: ' + widthMm + ' × ' + heightMm + 'mm · 투명도 ' + Math.round(opacity*100) + '%');
  if(typeof skCmdLog === 'function') skCmdLog('  🖼 배경 도면: ' + state.bgImage.fileName + ' · ' + widthMm + '×' + heightMm + 'mm · anchor=' + anchor, 'sys');
};

// 실시간 미리보기 (모달 안에서 값 바꾸면 즉시 캔버스에 반영)
window.sk3PreviewBgImage = function(){
  if(!state._bgImgTemp) return;
  const widthMm = parseFloat(document.getElementById('bgImgWidth').value);
  const heightMm = parseFloat(document.getElementById('bgImgHeight').value);
  const opacity = (parseFloat(document.getElementById('bgImgOpacity').value) || 50) / 100;
  const anchor = document.getElementById('bgImgAnchor').value || 'mr';
  const offsetX = parseFloat(document.getElementById('bgImgOffsetX').value) || 0;
  const offsetY = parseFloat(document.getElementById('bgImgOffsetY').value) || 0;
  document.getElementById('bgImgOpacityLbl').textContent = Math.round(opacity*100) + '%';
  if(!isFinite(widthMm) || widthMm <= 0 || !isFinite(heightMm) || heightMm <= 0) return;
  state.bgImage = {
    img: state._bgImgTemp.img,
    pxW: state._bgImgTemp.pxW,
    pxH: state._bgImgTemp.pxH,
    fileName: state._bgImgTemp.fileName,
    widthMm, heightMm, opacity, anchor, offsetX, offsetY,
    visible: true
  };
  redrawSketch();
};

window.sk3RemoveBgImage = function(){
  if(!confirm('🗑 배경 도면 제거?')) return;
  state.bgImage = null;
  state._bgImgTemp = null;
  redrawSketch();
  sk3CloseBgImageModal();
  toast('🗑 배경 도면 제거');
};

window.sk3ToggleBgImage = function(){
  if(!state.bgImage) return;
  state.bgImage.visible = !state.bgImage.visible;
  redrawSketch();
  toast('🖼 배경 ' + (state.bgImage.visible ? 'ON' : 'OFF'));
};

// ─── v9.6: 파일 메뉴에서 PNG/이미지 불러오기 → 배경으로 설정 ───────
window.sk3LoadBgImageFile = function(ev){
  const f = ev.target.files && ev.target.files[0];
  if(!f) return;
  if(state.mode !== 'sketch'){ if(typeof switchMode==='function') switchMode('sketch'); }
  const img = new Image();
  img.onload = () => {
    const pxW = img.naturalWidth, pxH = img.naturalHeight;
    const widthMm = 60, heightMm = 60 * pxH / pxW;
    state.bgImage = {img, pxW, pxH, fileName: f.name || '이미지', widthMm, heightMm, opacity:0.6, anchor:'cc', offsetX:0, offsetY:0, visible:true};
    redrawSketch();
    toast('🖼️ 이미지 불러옴: ' + (f.name||'') + ' (' + widthMm + '×' + heightMm.toFixed(0) + 'mm). 🖼 배경 모달에서 크기조절·추적 가능');
    if(typeof skCmdLog==='function') skCmdLog('  🖼️ PNG/이미지 불러오기: ' + (f.name||'') + ' → 배경(60mm). 🖼 배경 모달로 실측 크기 맞추고 🪄 추적', 'sys');
    // 같은 파일 재선택 가능하도록 초기화
    ev.target.value = '';
  };
  img.onerror = () => { toast('⚠ 이미지를 불러올 수 없습니다'); ev.target.value=''; };
  img.src = URL.createObjectURL(f);
};

// ─── v8.88: 클립보드 이미지 붙여넣기 → 배경으로 설정 ───────────────
window.addEventListener('paste', function(ev){
  if(state.mode !== 'sketch') return;
  const items = (ev.clipboardData || ev.originalEvent?.clipboardData)?.items;
  if(!items) return;
  for(const it of items){
    if(it.type && it.type.indexOf('image') === 0){
      ev.preventDefault();
      const blob = it.getAsFile();
      const img = new Image();
      img.onload = () => {
        // 기본 폭 60mm로 배치 (anchor 중앙) — 이후 추적/조절 가능
        const pxW = img.naturalWidth, pxH = img.naturalHeight;
        const widthMm = 60, heightMm = 60 * pxH / pxW;
        state.bgImage = {img, pxW, pxH, fileName:'클립보드', widthMm, heightMm, opacity:0.6, anchor:'cc', offsetX:0, offsetY:0, visible:true};
        redrawSketch();
        toast('📋 이미지 붙여넣기 → 배경 ' + widthMm + '×' + heightMm.toFixed(0) + 'mm. "🪄 이미지 추적"으로 벡터화하세요');
        if(typeof skCmdLog==='function') skCmdLog('  📋 클립보드 이미지 붙여넣기 (60mm 기준). 🪄 이미지 추적 = 선/채움 벡터화', 'sys');
      };
      img.src = URL.createObjectURL(blob);
      return;
    }
  }
});

// ─── v8.88: 배경 이미지 벡터화(이미지 추적) → 편집 가능한 선으로 변환 ───
//   mode: 'line'(외곽선 추적) | 'fill'(외곽선 + 채움 객체)
//   v9.3: edgeMode=true 면 밝기임계 대신 '명도 대비(엣지)'로 윤곽 판정 → 옅은/곡선 누락 감소
window.sk3TraceBgImage = function(threshold, mode, invert, simplifyTol, edgeMode){
  const bg = state.bgImage;
  if(!bg || !bg.img){ toast('⚠ 먼저 이미지를 붙여넣기/배경 설정하세요'); return; }
  threshold = (threshold===undefined) ? 128 : threshold;
  mode = mode || 'line';
  simplifyTol = (simplifyTol===undefined) ? 1.2 : simplifyTol; // px 단위 단순화 허용오차

  // 1) 샘플 캔버스 (최대 400px 변 기준)
  const maxSide = 400;
  const scale = Math.min(1, maxSide / Math.max(bg.pxW, bg.pxH));
  const W = Math.max(8, Math.round(bg.pxW * scale));
  const H = Math.max(8, Math.round(bg.pxH * scale));
  const c = document.createElement('canvas'); c.width=W; c.height=H;
  const ctx = c.getContext('2d'); ctx.drawImage(bg.img, 0, 0, W, H);
  const d = ctx.getImageData(0,0,W,H).data;
  const lumArr = new Float32Array(W*H);
  for(let i=0;i<W*H;i++){
    const r=d[i*4],g=d[i*4+1],b=d[i*4+2],a=d[i*4+3];
    let lum = (0.299*r+0.587*g+0.114*b);
    if(a<128) lum = 255; // 투명 = 배경(흰)
    lumArr[i] = lum;
  }
  const mask = new Uint8Array(W*H);
  if(edgeMode){
    // v9.3: 명도 대비(엣지) — 주변 평균과의 차이가 threshold(엣지감도) 이상이면 윤곽
    //   threshold는 0~254 슬라이더를 엣지감도로 재활용 (작을수록 민감, 권장 8~30)
    const eThresh = Math.max(4, Math.min(60, threshold > 60 ? 12 : threshold));
    const L = (x,y) => (x<0||y<0||x>=W||y>=H) ? 255 : lumArr[y*W+x];
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){
      const cl = L(x,y);
      let s=0,n=0;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue; s+=L(x+dx,y+dy); n++; }
      let on = Math.abs(cl - s/n) >= eThresh;
      if(invert) on = !on;
      mask[y*W+x] = on ? 1 : 0;
    }
  } else {
    // 기존: 밝기 임계
    for(let i=0;i<W*H;i++){
      let on = lumArr[i] < threshold;
      if(invert) on = !on;
      mask[i] = on ? 1 : 0;
    }
  }

  // 2) 모든 연결요소의 외곽 컨투어 추적 (작은 노이즈 제거)
  const contours = sk3TraceAllContours(mask, W, H, Math.max(20, Math.round(W*H*0.0008)));
  if(contours.length === 0){ toast('⚠ 외곽선을 못 찾음 — 임계값/반전을 조절하세요'); return; }

  // 3) 픽셀 → 월드 좌표 매핑 (drawBgImage와 동일 anchor 수식)
  const w = bg.widthMm, h = bg.heightMm;
  let x0=0, y0=0;
  switch(bg.anchor){
    case 'tl': x0=0; y0=0; break;     case 'tr': x0=-w; y0=0; break;
    case 'bl': x0=0; y0=h; break;     case 'br': x0=-w; y0=h; break;
    case 'mr': x0=-w; y0=h/2; break;  case 'ml': x0=0; y0=h/2; break;
    case 'cc': x0=-w/2; y0=h/2; break; default: x0=-w; y0=h/2;
  }
  x0 += (bg.offsetX||0); y0 += (bg.offsetY||0);
  const px2world = (px,py) => ({
    x: x0 + (px / W) * w,
    y: y0 - (py / H) * h   // 이미지 y아래 → 월드 y위
  });

  pushHistory();
  const color = (document.getElementById('sketchColor')||{}).value || '#000000';
  const lw = parseInt((document.getElementById('lineWidth')||{}).value) || 2;
  let added = 0, fillCount = 0;

  contours.forEach(cont => {
    const simp = sk3SimplifyRDP(cont, simplifyTol);
    if(simp.length < 2) return;
    const wpts = simp.map(p => px2world(p[0], p[1]));
    for(let i=0;i<wpts.length-1;i++){
      state.shapes.push({type:'line', x1:wpts[i].x, y1:wpts[i].y, x2:wpts[i+1].x, y2:wpts[i+1].y, color, lineWidth:lw, _traced:true});
      added++;
    }
    // 닫기 (마지막 → 처음)
    state.shapes.push({type:'line', x1:wpts[wpts.length-1].x, y1:wpts[wpts.length-1].y, x2:wpts[0].x, y2:wpts[0].y, color, lineWidth:lw, _traced:true});
    added++;
    if(mode === 'fill'){
      const fillColor = (document.getElementById('fillColor')||{}).value || '#cccccc';
      state.shapes.push({type:'fill', vertices: wpts.map(p=>({x:p.x,y:p.y})), color:fillColor, _traced:true});
      fillCount++;
    }
  });

  redrawSketch();
  toast('🪄 이미지 추적: 외곽선 ' + contours.length + '개 → 선 ' + added + (mode==='fill'?(' · 채움 '+fillCount):'') + ' (편집·SVG 저장 가능)');
  if(typeof skCmdLog==='function') skCmdLog('  🪄 이미지 추적('+mode+'): 컨투어 '+contours.length+' · 선 '+added+(mode==='fill'?(' · 채움 '+fillCount):''), 'sys');
};

// 모든 연결요소 외곽 컨투어 (면적 minArea 이상)
function sk3TraceAllContours(mask, W, H, minArea){
  const lab = new Int32Array(W*H); let next=1; const size={};
  const st=[];
  for(let s=0;s<W*H;s++){
    if(mask[s] && !lab[s]){
      const id=next++; let cnt=0; st.push(s); lab[s]=id;
      while(st.length){const p=st.pop();cnt++;const x=p%W,y=(p/W)|0;
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx,dy])=>{const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)return;const q=ny*W+nx;if(mask[q]&&!lab[q]){lab[q]=id;st.push(q);}});}
      size[id]=cnt;
    }
  }
  const out=[];
  for(const idStr in size){
    const id=+idStr; if(size[id] < minArea) continue;
    // 시작점
    let sx=-1,sy=-1;
    for(let y=0;y<H&&sx<0;y++)for(let x=0;x<W;x++){if(lab[y*W+x]===id){sx=x;sy=y;break;}}
    const isFg=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&lab[y*W+x]===id;
    const dirs=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
    const cont=[[sx,sy]]; let cx=sx,cy=sy,bdir=6,guard=0,maxg=W*H*4;
    do{
      let found=false;
      for(let k=0;k<8;k++){const dir=(bdir+1+k)%8;const nx=cx+dirs[dir][0],ny=cy+dirs[dir][1];
        if(isFg(nx,ny)){bdir=(dir+4)%8;cx=nx;cy=ny;cont.push([cx,cy]);found=true;break;}}
      if(!found)break; guard++;
    }while((cx!==sx||cy!==sy)&&guard<maxg);
    out.push(cont);
  }
  return out;
}

// Ramer–Douglas–Peucker 단순화 (점 배열 [[x,y]...])
function sk3SimplifyRDP(pts, eps){
  if(pts.length < 3) return pts;
  const sqd=(p,a,b)=>{const dx=b[0]-a[0],dy=b[1]-a[1];const L=dx*dx+dy*dy;if(L<1e-9)return (p[0]-a[0])**2+(p[1]-a[1])**2;
    let t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/L;t=Math.max(0,Math.min(1,t));const px=a[0]+t*dx,py=a[1]+t*dy;return (p[0]-px)**2+(p[1]-py)**2;};
  const keep=new Array(pts.length).fill(false); keep[0]=keep[pts.length-1]=true;
  const stack=[[0,pts.length-1]];
  while(stack.length){const [a,b]=stack.pop();let idx=-1,md=eps*eps;
    for(let i=a+1;i<b;i++){const d=sqd(pts[i],pts[a],pts[b]);if(d>md){md=d;idx=i;}}
    if(idx>=0){keep[idx]=true;stack.push([a,idx]);stack.push([idx,b]);}}
  return pts.filter((_,i)=>keep[i]);
}

// ─── v8.46: 스케치 SVG 저장 ─────────────────────────────────────
// 모든 도형(line/rect/circle/arc/fill) + 채움 객체를 SVG로 출력
// 단위: mm (사용자 환경 정밀도 그대로)
// 좌표계: SVG는 Y+가 아래쪽이므로 Y 좌표 반전 + viewBox로 사용자 좌표 그대로 보존
window.sk3ExportSVG = function(){
  if(state.mode !== 'sketch'){ toast('스케치 모드에서만 SVG 저장 가능'); return; }
  if(state.shapes.length === 0){ toast('⚠ 저장할 도형이 없습니다'); return; }

  // 1) 모든 도형의 bbox 계산
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  function expand(x, y){
    if(x < minX) minX = x; if(x > maxX) maxX = x;
    if(y < minY) minY = y; if(y > maxY) maxY = y;
  }
  state.shapes.forEach(s => {
    if(s.type === 'line'){ expand(s.x1, s.y1); expand(s.x2, s.y2); }
    else if(s.type === 'rect'){
      expand(Math.min(s.x1,s.x2), Math.min(s.y1,s.y2));
      expand(Math.max(s.x1,s.x2), Math.max(s.y1,s.y2));
    } else if(s.type === 'circle'){
      expand(s.cx - s.r, s.cy - s.r);
      expand(s.cx + s.r, s.cy + s.r);
    } else if(s.type === 'arc'){
      // 단순화: 원 전체 bbox (정확한 호 bbox는 angle wrap 처리 필요)
      expand(s.cx - s.r, s.cy - s.r);
      expand(s.cx + s.r, s.cy + s.r);
    } else if(s.type === 'fill'){
      (s.vertices||[]).forEach(v => expand(v.x, v.y));
    }
  });
  if(!isFinite(minX)){ toast('⚠ 도형 bbox 계산 실패'); return; }
  // 여백
  const pad = 2;
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  const W = maxX - minX;
  const H = maxY - minY;

  // 2) SVG 헤더
  // Y 반전을 위해 viewBox에서 minY를 -maxY로 두고 transform("scale(1, -1)")
  // 가독성: viewBox는 minX, -maxY, W, H로 설정하고 모든 좌표 그대로 사용 (Y는 -y로 적용)
  // 더 단순: <g transform="scale(1,-1)"> wrapper 사용 → 모든 좌표 그대로 작성, SVG가 자동 Y반전
  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
  lines.push('<svg xmlns="http://www.w3.org/2000/svg" version="1.1"');
  lines.push('  width="' + W.toFixed(3) + 'mm" height="' + H.toFixed(3) + 'mm"');
  lines.push('  viewBox="' + minX.toFixed(3) + ' ' + (-maxY).toFixed(3) + ' ' + W.toFixed(3) + ' ' + H.toFixed(3) + '">');
  lines.push('  <title>tool3 sketch export</title>');
  lines.push('  <desc>Generated by tool3 v8.46 — width=' + W.toFixed(2) + 'mm height=' + H.toFixed(2) + 'mm</desc>');
  lines.push('  <g transform="scale(1,-1)" stroke-linecap="round" stroke-linejoin="round" fill-rule="evenodd">');

  // 3) 채움 먼저 (가장 아래 레이어)
  state.shapes.forEach(s => {
    if(s.type !== 'fill') return;
    if(!s.vertices || s.vertices.length < 3) return;
    const pts = s.vertices.map(v => v.x.toFixed(3) + ',' + v.y.toFixed(3)).join(' ');
    const stroke = (s.stroke && (s.strokeWidth||0) > 0)
      ? ' stroke="' + s.stroke + '" stroke-width="' + s.strokeWidth + '"'
      : ' stroke="none"';
    lines.push('    <polygon points="' + pts + '" fill="' + (s.color || '#ffe599') + '"' + stroke + ' />');
  });

  // 4) 도형
  state.shapes.forEach(s => {
    if(s.type === 'line'){
      lines.push('    <line x1="' + s.x1.toFixed(3) + '" y1="' + s.y1.toFixed(3) +
                 '" x2="' + s.x2.toFixed(3) + '" y2="' + s.y2.toFixed(3) +
                 '" stroke="' + (s.color||'#000') + '" stroke-width="' + (s.lineWidth||1) + '" fill="none" />');
    } else if(s.type === 'rect'){
      const x = Math.min(s.x1, s.x2);
      const y = Math.min(s.y1, s.y2);
      const w = Math.abs(s.x2 - s.x1);
      const h = Math.abs(s.y2 - s.y1);
      lines.push('    <rect x="' + x.toFixed(3) + '" y="' + y.toFixed(3) +
                 '" width="' + w.toFixed(3) + '" height="' + h.toFixed(3) +
                 '" stroke="' + (s.color||'#000') + '" stroke-width="' + (s.lineWidth||1) + '" fill="none" />');
    } else if(s.type === 'circle'){
      lines.push('    <circle cx="' + s.cx.toFixed(3) + '" cy="' + s.cy.toFixed(3) +
                 '" r="' + s.r.toFixed(3) + '" stroke="' + (s.color||'#000') +
                 '" stroke-width="' + (s.lineWidth||1) + '" fill="none" />');
    } else if(s.type === 'arc'){
      // SVG arc path: M(start) A(rx,ry rot largeArc sweep) end
      const sx = s.cx + s.r * Math.cos(s.startAngle);
      const sy = s.cy + s.r * Math.sin(s.startAngle);
      const ex = s.cx + s.r * Math.cos(s.endAngle);
      const ey = s.cy + s.r * Math.sin(s.endAngle);
      let sweep = s.endAngle - s.startAngle;
      // -2π~2π 정규화
      while(sweep <= -Math.PI*2) sweep += Math.PI*2;
      while(sweep > Math.PI*2)   sweep -= Math.PI*2;
      const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
      const sweepFlag = sweep > 0 ? 1 : 0;  // SVG sweep-flag (1=CCW in standard, but Y가 반전된 좌표계에서는 그대로)
      const d = 'M ' + sx.toFixed(3) + ' ' + sy.toFixed(3) +
                ' A ' + s.r.toFixed(3) + ' ' + s.r.toFixed(3) + ' 0 ' +
                largeArc + ' ' + sweepFlag + ' ' +
                ex.toFixed(3) + ' ' + ey.toFixed(3);
      lines.push('    <path d="' + d + '" stroke="' + (s.color||'#000') +
                 '" stroke-width="' + (s.lineWidth||1) + '" fill="none" />');
    }
    // fill은 위에서 처리
  });

  lines.push('  </g>');
  lines.push('</svg>');
  const svgText = lines.join('\n');

  // 5) 다운로드
  const blob = new Blob([svgText], {type: 'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  // 파일명: 날짜시간 포함
  const now = new Date();
  const ts = now.getFullYear() + ('0'+(now.getMonth()+1)).slice(-2) + ('0'+now.getDate()).slice(-2) +
             '_' + ('0'+now.getHours()).slice(-2) + ('0'+now.getMinutes()).slice(-2);
  a.href = url;
  a.download = 'tool3_sketch_' + ts + '.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  const counts = {line:0, rect:0, circle:0, arc:0, fill:0};
  state.shapes.forEach(s => { if(counts[s.type] !== undefined) counts[s.type]++; });
  toast('📐 SVG 저장: ' + W.toFixed(1) + '×' + H.toFixed(1) + 'mm · ' +
        '선' + counts.line + '/사각' + counts.rect + '/원' + counts.circle +
        '/호' + counts.arc + '/채움' + counts.fill);
  if(typeof skCmdLog === 'function') skCmdLog('  📐 SVG 저장: tool3_sketch_' + ts + '.svg · ' + W.toFixed(1) + '×' + H.toFixed(1) + 'mm', 'sys');
};

try { window.state = state; } catch(e){}
try { window.THREE = THREE; } catch(e){}
try { window.toast = toast; } catch(e){}
// v9.1: 따라그리기 애드온이 쓰는 스케치 함수 노출
try { window.screenToWorld = screenToWorld; } catch(e){}
try { window.worldToScreen = worldToScreen; } catch(e){}
try { window.redrawSketch = redrawSketch; } catch(e){}
try { window.pushHistory = pushHistory; } catch(e){}
try { window.updateInfo = updateInfo; } catch(e){}
// v8.95: 렌더 객체는 init 이후 채워지므로 getter로 노출 (스무딩 미리보기 강제 렌더용)
try {
  Object.defineProperty(window, 'renderer', { get(){ return renderer; }, configurable:true });
  Object.defineProperty(window, 'scene', { get(){ return scene; }, configurable:true });
  Object.defineProperty(window, 'camera', { get(){ return camera; }, configurable:true });
} catch(e){}
