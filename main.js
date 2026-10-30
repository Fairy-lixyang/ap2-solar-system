// =====================================================================
// AP2 · 三维层级场景：太阳系（简洁版：太阳-地球-月球）
// 技术栈：Three.js（原生 WebGL 封装，教材明确允许）
//   —— 必做：太阳-地球-月球三级层级嵌套 + 地球 23.5° 轴倾角（先转后挂）
//   —— 必做：月球轨道用手动矩阵构造（mat4 基本变换手工组合）
//   —— 必做：位图纹理 / O 键双投影切换 / 相机漫游 / 参数面板
// 全部资源本地化（lib/ 下的 Three.js），离线可运行。
// =====================================================================

import * as THREE from 'three';
import { OrbitControls } from './lib/OrbitControls.js';

// ---------------------------------------------------------------------
// 1. 天体参数集中配置
// ---------------------------------------------------------------------
const CONFIG = {
  sunRadius: 2.0,          // 太阳半径（艺术比例：地球的 5 倍）
  earthRadius: 0.4,        // 地球半径（真实比例：太阳的 1/109，这里折中）
  moonRadius: 0.12,        // 月球半径（真实比例：地球的 1/3.5）
  earthOrbitRadius: 3.8,   // 地球到太阳距离
  moonOrbitRadius: 0.9,    // 月球到地球距离
  earthTiltDeg: 23.5,      // 地球自转轴倾角
  moonOrbitTiltDeg: 5.1,   // 月球轨道面倾角（手动矩阵演示处）
  orbitSpeed: 1.5,         // 地球公转角速度基准 (rad/s)，滑条控制
  selfRotSpeed: 1.0,       // 地球自转角速度 (rad/s)，滑条控制
  moonOrbitSpeed: 3.0,     // 月球公转角速度（绕地球转）
  sunRotSpeed: 0.12,       // 太阳自转角速度
};

// ---------------------------------------------------------------------
// 2. 场景 / 渲染器 / 相机
// ---------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070b18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// 主相机（透视，用于漫游 + 鼠标拖拽）
const masterCam = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 300);
masterCam.position.set(7, 4.5, 7);

// 正交相机（O 键对比用）
const orthoSize = 5.2;
let aspect = window.innerWidth / window.innerHeight;
const orthoCam = new THREE.OrthographicCamera(
  -orthoSize * aspect, orthoSize * aspect, orthoSize, -orthoSize, 0.1, 300
);
let activeProjection = 'persp';

// OrbitControls：负责"鼠标拖拽接管视角"
const controls = new OrbitControls(masterCam, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enabled = true;    // 鼠标拖拽始终可用（OrbitControls 一直接管）

// ---------------------------------------------------------------------
// 3. 光照
// ---------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0x9fb4ff, 0.5));
const sunLight = new THREE.PointLight(0xfff3d6, 3.5, 0, 2);
sunLight.position.set(0, 0, 0);
scene.add(sunLight);

// ---------------------------------------------------------------------
// 4. 程序化位图纹理（Canvas 生成，离线可用，规避上下颠倒问题）
// ---------------------------------------------------------------------
function makeTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// 太阳
const sunTex = makeTexture(256, 256, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w/2);
  g.addColorStop(0, '#fff8c8'); g.addColorStop(0.35, '#ffe15a');
  g.addColorStop(0.7, '#ff9d00'); g.addColorStop(1, '#ff6a00');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(255,${(130+Math.random()*90)|0},0,${0.25+Math.random()*0.35})`;
    ctx.beginPath(); ctx.arc(Math.random()*w, Math.random()*h, 2+Math.random()*9, 0, Math.PI*2); ctx.fill();
  }
});

// 地球：真实贴图（NASA Blue Marble 等距投影，本地文件）
const earthTex = new THREE.TextureLoader().load('textures/earth.jpg');
earthTex.colorSpace = THREE.SRGBColorSpace;

// 月球：真实贴图（本地文件）
const moonTex = new THREE.TextureLoader().load('textures/moon.jpg');
moonTex.colorSpace = THREE.SRGBColorSpace;

// ---------------------------------------------------------------------
// 5. 太阳（自发光 + 光晕）
// ---------------------------------------------------------------------
const sunMesh = new THREE.Mesh(
  new THREE.SphereGeometry(CONFIG.sunRadius, 48, 48),
  new THREE.MeshBasicMaterial({ map: sunTex })
);
const sunGroup = new THREE.Group();
sunGroup.add(sunMesh);
scene.add(sunGroup);

// 太阳光晕（Sprite 径向渐变，Additive 发光）
function makeGlow() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,235,150,0.5)');
  g.addColorStop(0.4, 'rgba(255,180,60,0.22)');
  g.addColorStop(1, 'rgba(255,140,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(CONFIG.sunRadius * 6, CONFIG.sunRadius * 6, 1);
  scene.add(glow);
}
makeGlow();

// ---------------------------------------------------------------------
// 6. 层级嵌套：太阳 → 地球公转组 → 地球倾角容器 → 地球 / 月球
//    地球自转轴倾斜 23.5° —— "先转后挂"：
//    先在地球自身的容器上施加倾角旋转，再整体叠加公转轨道变换。
// ---------------------------------------------------------------------
const earthMesh = new THREE.Mesh(
  new THREE.SphereGeometry(CONFIG.earthRadius, 40, 40),
  new THREE.MeshPhongMaterial({ map: earthTex })
);
const moonMesh = new THREE.Mesh(
  new THREE.SphereGeometry(CONFIG.moonRadius, 32, 32),
  new THREE.MeshPhongMaterial({ map: moonTex })
);

// 地球公转轨道组（挂太阳组下，绕太阳公转）
const earthOrbit = new THREE.Group();
sunGroup.add(earthOrbit);

// 地球自转轴倾角容器（先转后挂）
const earthTilt = new THREE.Group();
earthTilt.rotation.z = THREE.MathUtils.degToRad(CONFIG.earthTiltDeg);
earthOrbit.add(earthTilt);

// 地球系统组（挂在倾角容器下，偏移到公转轨道半径处）
// 所有跟地球一起运动的东西（地球本体、大气层、月球）都挂在这里
const earthSystem = new THREE.Group();
earthSystem.position.x = CONFIG.earthOrbitRadius;
earthTilt.add(earthSystem);

// 地球本体（挂在 earthSystem 下，不再单独偏移）
earthSystem.add(earthMesh);

// 地球大气层（半透明蓝色薄球）
const atmos = new THREE.Mesh(
  new THREE.SphereGeometry(CONFIG.earthRadius * 1.06, 40, 40),
  new THREE.MeshPhongMaterial({ color: 0x4a9bff, transparent: true, opacity: 0.22, side: THREE.BackSide })
);
earthSystem.add(atmos);

// 月球轨道组（挂在 earthSystem 下，绕地球转；轨道面用手动矩阵实现倾角）
const moonOrbit = new THREE.Group();
moonOrbit.matrixAutoUpdate = false;   // 关闭自动矩阵，改用手动矩阵（见第 9 节）
earthSystem.add(moonOrbit);
moonOrbit.add(moonMesh);

// 轨道线（地球黄道面轨道环 / 月球轨道环）
function makeOrbitRing(radius, color, opacity) {
  const pts = [];
  for (let i = 0; i <= 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
}
const earthOrbitLine = makeOrbitRing(CONFIG.earthOrbitRadius, 0x66ccff, 0.4);
scene.add(earthOrbitLine);
const moonOrbitLine = makeOrbitRing(CONFIG.moonOrbitRadius, 0xcccccc, 0.35);
earthSystem.add(moonOrbitLine);

// ---------------------------------------------------------------------
// 7. 星空背景（多色、分层）
// ---------------------------------------------------------------------
(function buildStars() {
  const geo = new THREE.BufferGeometry();
  const n = 1500, pos = new Float32Array(n*3), col = new Float32Array(n*3);
  const palette = [[255,255,255],[180,210,255],[255,240,200]];
  for (let i = 0; i < n; i++) {
    const r = 120 + Math.random() * 80;
    const theta = Math.random() * Math.PI * 2, phi = Math.acos(2*Math.random()-1);
    pos[i*3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.cos(phi);
    pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
    const c = palette[(Math.random()*palette.length)|0];
    col[i*3] = c[0]/255; col[i*3+1] = c[1]/255; col[i*3+2] = c[2]/255;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, sizeAttenuation: false })));
})();

// ---------------------------------------------------------------------
// 8. UI 参数面板绑定
// ---------------------------------------------------------------------
const ui = {
  orbitSpeed:    document.getElementById('orbitSpeed'),
  selfSpeed:     document.getElementById('selfSpeed'),
  tilt:          document.getElementById('tilt'),
  orbitLine:     document.getElementById('orbitLine'),
  orbitSpeedVal: document.getElementById('orbitSpeedVal'),
  selfSpeedVal:  document.getElementById('selfSpeedVal'),
  tiltVal:       document.getElementById('tiltVal'),
};
function readUI() {
  CONFIG.orbitSpeed = parseFloat(ui.orbitSpeed.value);
  CONFIG.selfRotSpeed = parseFloat(ui.selfSpeed.value);
  earthTilt.rotation.z = THREE.MathUtils.degToRad(parseFloat(ui.tilt.value));
  const on = ui.orbitLine.checked;
  earthOrbitLine.visible = on;
  moonOrbitLine.visible = on;
  ui.orbitSpeedVal.textContent = ui.orbitSpeed.value;
  ui.selfSpeedVal.textContent = ui.selfSpeed.value;
  ui.tiltVal.textContent = ui.tilt.value;
}
['input', 'change'].forEach(ev => {
  ui.orbitSpeed.addEventListener(ev, readUI);
  ui.selfSpeed.addEventListener(ev, readUI);
  ui.tilt.addEventListener(ev, readUI);
  ui.orbitLine.addEventListener(ev, readUI);
});
readUI();

// ---------------------------------------------------------------------
// 9. 相机漫游 + 鼠标拖拽互相接管
//    注意：lookAt 只在"自动漫游"时调用；拖拽时交给 OrbitControls，
//    否则每帧强制看向原点会把拖拽的旋转效果拉回去。
// ---------------------------------------------------------------------
let orbitActive = true;     // 自动漫游是否进行中
let isDragging = false;     // 是否正在鼠标拖拽接管
const CAM_RADIUS = 7.5, CAM_HEIGHT = 4.5;
let camAngle = Math.atan2(masterCam.position.z, masterCam.position.x);

// 键盘：空格 暂停/继续所有运动；O 切换 正交/透视
let paused = false;
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === ' ') { 
    e.preventDefault(); 
    paused = !paused; 
  }
  if (e.key === 'o' || e.key === 'O') {
    activeProjection = (activeProjection === 'persp') ? 'ortho' : 'persp';
    document.getElementById('proj').textContent =
      '投影：' + (activeProjection === 'persp' ? '透视' : '正交') + '（O 切换）';
  }
});

// 用 OrbitControls 的 start / end 事件判断"是否正在拖拽"，
// 这样鼠标拖拽在任何时刻都生效，不再依赖按下时才开启。
controls.addEventListener('start', () => { isDragging = true; });
controls.addEventListener('end', () => {
  isDragging = false;
  camAngle = Math.atan2(masterCam.position.z, masterCam.position.x);
});

function updateCamera(dt) {
  if (orbitActive && !isDragging) {
    camAngle += dt * 0.12;   // 环绕速度
    masterCam.position.set(CAM_RADIUS * Math.cos(camAngle), CAM_HEIGHT, CAM_RADIUS * Math.sin(camAngle));
    masterCam.lookAt(0, 0, 0);
  }
  // 拖拽时始终更新 controls；漫游时也更新；暂停时不更新（完全停住）
  if (orbitActive || isDragging) controls.update();
}

// ---------------------------------------------------------------------
// 10. 手动矩阵：月球轨道面倾角
//     M = T(moonOrbitRadius,0,0) · RotY(月球公转角) · RotX(轨道面倾角)
//     先 X 方向倾斜轨道面 → 再绕 Y 公转 → 平移到月球轨道半径
// ---------------------------------------------------------------------
let moonAngle = Math.PI / 2;   // 初始在地球侧面（不跟太阳重叠，一打开就能看到月球）
function updateMoonOrbitMatrix(dt) {
  moonAngle += dt * CONFIG.moonOrbitSpeed;
  const tiltRad = THREE.MathUtils.degToRad(CONFIG.moonOrbitTiltDeg);
  const T  = new THREE.Matrix4().makeTranslation(CONFIG.moonOrbitRadius, 0, 0);  // 先平移到轨道半径
  const Rx = new THREE.Matrix4().makeRotationX(tiltRad);                         // 再 X 方向倾斜轨道面
  const Ry = new THREE.Matrix4().makeRotationY(moonAngle);                       // 再绕 Y 公转
  // 矩阵顺序：先平移 → 再倾斜 → 再公转（从右到左应用）
  const M = new THREE.Matrix4().multiplyMatrices(Ry, Rx).multiply(T);
  moonOrbit.matrix.copy(M);
  moonOrbit.updateMatrixWorld(true);
}

// ---------------------------------------------------------------------
// 11. 动画循环
// ---------------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  let dt = Math.min(clock.getDelta(), 0.05);
  if (paused) dt = 0;   // 暂停时所有运动都停住

  sunMesh.rotation.y     += dt * CONFIG.sunRotSpeed;   // 太阳自转
  earthOrbit.rotation.y  += dt * CONFIG.orbitSpeed;    // 地球公转（滑条）
  earthMesh.rotation.y   += dt * CONFIG.selfRotSpeed;  // 地球自转（滑条）
  moonMesh.rotation.y    += dt * CONFIG.selfRotSpeed * 0.5;  // 月球自转
  atmos.rotation.y       += dt * CONFIG.selfRotSpeed * 0.5;
  updateMoonOrbitMatrix(dt);                           // 月球公转（手动矩阵）
  updateCamera(dt);                                    // 相机漫游

  // 双投影：正交相机同步主相机位姿
  if (activeProjection === 'ortho') {
    aspect = window.innerWidth / window.innerHeight;
    orthoCam.left = -orthoSize * aspect; orthoCam.right = orthoSize * aspect;
    orthoCam.top = orthoSize; orthoCam.bottom = -orthoSize;
    orthoCam.updateProjectionMatrix();
    orthoCam.position.copy(masterCam.position);
    orthoCam.quaternion.copy(masterCam.quaternion);
    renderer.render(scene, orthoCam);
  } else {
    renderer.render(scene, masterCam);
  }
  requestAnimationFrame(animate);
}
animate();

// ---------------------------------------------------------------------
// 12. 窗口自适应
// ---------------------------------------------------------------------
window.addEventListener('resize', () => {
  aspect = window.innerWidth / window.innerHeight;
  masterCam.aspect = aspect; masterCam.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
