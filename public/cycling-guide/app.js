import * as THREE from 'three';
import { CyclingModel } from './cycling.js';
import { zones, zoneOrder, zoneTraining, muscles, phases, training, trainingGroups } from './content.js';
import { PressureMap } from './pressure.js';

const $ = selector => document.querySelector(selector);
const DEG = Math.PI / 180;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Scene ---------- */
const stage = $('#scene'), labelsEl = $('#scene-labels');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, .05, 60);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.append(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd9f4ff, 0x3b5261, 1.9));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(-1.5, 5, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: .5, far: 12 });
keyLight.shadow.bias = -.0004;
scene.add(keyLight);
const rim = new THREE.DirectionalLight(0xb8ddeb, 1.8);
rim.position.set(2, 3, -3);
scene.add(rim);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: .3 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const model = new CyclingModel(scene);

/* ---------- Overlays ---------- */
const overlayMaterial = (color, opacity = .95) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false });

// Skeleton: hip–knee–ankle (cyan) and shoulder–elbow–wrist (orange) with a knee arc.
const skeleton = new THREE.Group();
scene.add(skeleton);
const jointKeys = ['hip', 'knee', 'ankle', 'shoulder', 'elbow', 'wrist'];
const jointDots = Object.fromEntries(jointKeys.map((key, i) => {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(.022, 16, 12), overlayMaterial(i < 3 ? 0x78e9ff : 0xffb17a));
  dot.renderOrder = 12;
  skeleton.add(dot);
  return [key, dot];
}));
const bonePairs = [['hip', 'knee'], ['knee', 'ankle'], ['hip', 'shoulder'], ['shoulder', 'elbow'], ['elbow', 'wrist']];
const boneLines = bonePairs.map(([from, to], i) => {
  const line = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 1, 8), overlayMaterial(i < 2 ? 0x78e9ff : 0xffb17a, .9));
  line.renderOrder = 11;
  skeleton.add(line);
  return { from, to, line };
});
function makeArc(color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 3), 3));
  const arc = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, depthTest: false, toneMapped: false }));
  arc.frustumCulled = false;
  arc.renderOrder = 11;
  skeleton.add(arc);
  return arc;
}
// Sweep from direction a to direction b around `centre`.
function setArc(arc, centre, a, b, radius) {
  const from = a.clone().normalize(), to = b.clone().normalize(), q = new THREE.Quaternion();
  const full = new THREE.Quaternion().setFromUnitVectors(from, to);
  const position = arc.geometry.attributes.position;
  for (let i = 0; i < 21; i++) {
    q.identity().slerp(full, i / 20);
    const p = from.clone().applyQuaternion(q).multiplyScalar(radius).add(centre);
    position.setXYZ(i, p.x, p.y, p.z);
  }
  position.needsUpdate = true;
}
const arcs = { knee: makeArc(0x78e9ff), elbow: makeArc(0xffb17a), back: makeArc(0xe6ebef) };
const horizon = new THREE.Mesh(new THREE.CylinderGeometry(.003, .003, 1, 6), overlayMaterial(0xe6ebef, .5));
horizon.renderOrder = 11;
skeleton.add(horizon);

// Live angle tags next to the skeleton, with reference ranges.
const ANGLE_TAGS = {
  knee: { name: '膝内角', range: [140, 150], hint: '最低点参考 140°–150°' },
  back: { name: '背角', range: [35, 50], hint: '参考 35°–50°（耐力 / 运动）' },
  elbow: { name: '肘内角', range: [150, 165], hint: '参考 150°–165°，微屈不锁死' },
};
const angleTags = Object.fromEntries(Object.entries(ANGLE_TAGS).map(([key, tag]) => {
  const el = document.createElement('div');
  el.className = `angle-tag ${key}`;
  el.innerHTML = `<span>${tag.name}</span><b>—</b><small>${tag.hint}</small>`;
  labelsEl.append(el);
  return [key, el];
}));
const leaderSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
leaderSvg.classList.add('leaders');
labelsEl.prepend(leaderSvg);
const leaders = Object.fromEntries(Object.keys(ANGLE_TAGS).map(key => {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.classList.add(key);
  leaderSvg.append(line);
  return [key, line];
}));
let kneeExtension = null;

function placeSegment(mesh, a, b) {
  const direction = b.clone().sub(a);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.scale.y = direction.length();
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), direction.normalize());
}

// Arrows for the force demo.
function makeArrow(color, opacity) {
  const group = new THREE.Group();
  const material = overlayMaterial(color, opacity);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, 1, 10), material);
  const head = new THREE.Mesh(new THREE.ConeGeometry(.026, .06, 16), material);
  shaft.renderOrder = head.renderOrder = 13;
  group.add(shaft, head);
  group.userData = { shaft, head };
  scene.add(group);
  return group;
}
function setArrow(arrow, origin, vector) {
  const length = vector.length();
  arrow.visible = length > .012;
  if (!arrow.visible) return;
  const { shaft, head } = arrow.userData;
  const dir = vector.clone().normalize();
  arrow.position.copy(origin);
  arrow.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
  const shaftLength = Math.max(.001, length - .05);
  shaft.scale.y = shaftLength;
  shaft.position.y = shaftLength / 2;
  head.position.y = shaftLength + .03;
}
const effectiveArrow = makeArrow(0xd3dbe2, .95);
const totalArrow = makeArrow(0x5d7686, .7);

// Muscle glow blobs on the near (right) leg.
const muscleBlobs = Object.fromEntries(muscles.map(m => {
  const blob = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xff8a4c, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  blob.renderOrder = 10;
  scene.add(blob);
  return [m.key, blob];
}));

// Foot chapter: pedal spindle axis and ball-of-foot marker.
const spindleLine = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, .22, 8), overlayMaterial(0xd3dbe2, .9));
const ballMarker = new THREE.Mesh(new THREE.SphereGeometry(.016, 16, 12), overlayMaterial(0xffa96a));
spindleLine.renderOrder = ballMarker.renderOrder = 14;
scene.add(spindleLine, ballMarker);

// Pain markers.
const markerGroup = new THREE.Group();
scene.add(markerGroup);
const markers = zoneOrder.map(key => {
  const group = new THREE.Group();
  const halo = new THREE.Mesh(new THREE.SphereGeometry(.05, 16, 12), overlayMaterial(0xc9d2da, .22));
  const core = new THREE.Mesh(new THREE.SphereGeometry(.024, 16, 12), overlayMaterial(0xe6ebef));
  halo.userData.zone = core.userData.zone = key;
  halo.renderOrder = core.renderOrder = 15;
  group.add(halo, core);
  markerGroup.add(group);
  const label = document.createElement('span');
  label.className = 'marker-label';
  label.textContent = zones[key].name;
  labelsEl.append(label);
  return { key, group, halo, core, label };
});
const footLabels = ['踏板轴', '跖骨头'].map(text => {
  const el = document.createElement('span');
  el.className = 'marker-label foot-label';
  el.textContent = text;
  labelsEl.append(el);
  return el;
});

// Saddle height: BB centre to saddle top along the seat tube.
const heightLine = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 1, 10), overlayMaterial(0xeef2f5, .95));
const heightEnds = [0, 1].map(() => new THREE.Mesh(new THREE.SphereGeometry(.016, 16, 12), overlayMaterial(0xeef2f5)));
heightLine.renderOrder = 16; heightEnds.forEach(m => { m.renderOrder = 16; });
scene.add(heightLine, ...heightEnds);
const heightLabel = document.createElement('span');
heightLabel.className = 'marker-label height-label';
labelsEl.append(heightLabel);
let showHeight = false;

// Whole-body centre of mass from a segment model (Dempster mass fractions).
const comMarker = new THREE.Group();
const comRing = new THREE.Mesh(new THREE.TorusGeometry(.035, .006, 10, 40), overlayMaterial(0xeef2f5));
const comCore = new THREE.Mesh(new THREE.SphereGeometry(.014, 16, 12), overlayMaterial(0xffa96a));
const comDrop = new THREE.Mesh(new THREE.CylinderGeometry(.002, .002, 1, 6), overlayMaterial(0xeef2f5, .45));
comRing.renderOrder = comCore.renderOrder = comDrop.renderOrder = 16;
comMarker.add(comRing, comCore);
scene.add(comMarker, comDrop);
const comLabel = document.createElement('span');
comLabel.className = 'marker-label com-label';
labelsEl.append(comLabel);
let showCom = false;
function centreOfMass() {
  const R = model.rig.joints('Right'), L = model.rig.joints('Left');
  const hips = R.hip.clone().lerp(L.hip, .5), shoulders = R.shoulder.clone().lerp(L.shoulder, .5);
  const seg = (a, b, t) => a.clone().lerp(b, t);
  const parts = [
    [.497, seg(hips, shoulders, .5)], [.081, R.head.clone().lerp(model.rig.pos('HeadTop_End'), .4)],
  ];
  for (const J of [R, L]) parts.push(
    [.1, seg(J.hip, J.knee, .433)], [.0465, seg(J.knee, J.ankle, .433)], [.0145, seg(J.ankle, J.toe, .5)],
    [.028, seg(J.shoulder, J.elbow, .436)], [.016, seg(J.elbow, J.wrist, .43)], [.006, J.wrist.clone()]);
  const total = parts.reduce((s, [m]) => s + m, 0);
  return parts.reduce((c, [m, p]) => c.addScaledVector(p, m / total), V());
}

/* ---------- Camera ---------- */
const PRESETS = {
  fit: { target: V(.02, .85, 0), yaw: .32, pitch: .12, dist: 3.3 },
  power: { target: V(-.05, .78, 0), yaw: 0, pitch: .04, dist: 3.3 },
  foot: { target: V(-.12, .46, .1), yaw: .2, pitch: .12, dist: 1.15 },
  pain: { target: V(.02, .88, 0), yaw: .55, pitch: .16, dist: 3.2 },
};
const view = { target: PRESETS.fit.target.clone(), yaw: PRESETS.fit.yaw, pitch: PRESETS.fit.pitch, dist: PRESETS.fit.dist };
let tween = null;
function flyTo(preset) {
  const from = { target: view.target.clone(), yaw: view.yaw, pitch: view.pitch, dist: view.dist };
  tween = { from, to: preset, t: reducedMotion ? 1 : 0 };
}
function updateCamera() {
  const { target, yaw, pitch, dist } = view;
  camera.position.set(target.x + dist * Math.sin(yaw) * Math.cos(pitch), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(yaw) * Math.cos(pitch));
  camera.lookAt(target);
}
const pointers = new Map();
let pinchStart = 0, dragMoved = false;
renderer.domElement.addEventListener('pointerdown', e => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  renderer.domElement.setPointerCapture(e.pointerId);
  dragMoved = false;
  tween = null;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchStart = Math.hypot(a.x - b.x, a.y - b.y); }
});
renderer.domElement.addEventListener('pointermove', e => {
  const last = pointers.get(e.pointerId);
  if (!last) return;
  const dx = e.clientX - last.x, dy = e.clientY - last.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (Math.abs(dx) + Math.abs(dy) > 2) dragMoved = true;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    view.dist = THREE.MathUtils.clamp(view.dist * pinchStart / distance, .6, 7);
    pinchStart = distance;
  } else {
    view.yaw -= dx * .008;
    view.pitch = THREE.MathUtils.clamp(view.pitch + dy * .006, -.2, 1.1);
  }
});
const endPointer = e => pointers.delete(e.pointerId);
renderer.domElement.addEventListener('pointerup', endPointer);
renderer.domElement.addEventListener('pointercancel', endPointer);
renderer.domElement.addEventListener('wheel', e => {
  e.preventDefault();
  tween = null;
  view.dist = THREE.MathUtils.clamp(view.dist * (1 + e.deltaY * .001), .6, 7);
}, { passive: false });
$('#reset-view').addEventListener('click', () => flyTo(PRESETS[chapter]));

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
resize();

/* ---------- State ---------- */
let chapter = 'fit', playing = false, slow = false, skeletonOn = true, cadence = 80;
let selectedZone = 'knee', sensation = '酸胀', ready = false;
const bump = t => Math.sin(Math.min(Math.max(t, 0), 1) * Math.PI / 2) ** 2;

function activation(angle, m) {
  const rise = (m.peak - m.on + 360) % 360, fall = (m.off - m.peak + 360) % 360;
  const t = (angle - m.on + 360) % 360;
  if (t <= rise) return bump(t / rise);
  if (t <= rise + fall) return bump(1 - (t - rise) / fall);
  return 0;
}

// Normalised pedal forces (illustrative): tangential drives the crank, radial is wasted.
function pedalForces(angle) {
  const a = angle * DEG;
  const tangential = angle <= 185 ? Math.max(.04, Math.sin(Math.min(a, Math.PI)) ** 1.2) : -.12 * Math.sin(a - Math.PI);
  const radial = -.55 * Math.cos(a) * (angle < 200 || angle > 330 ? 1 : .25);
  return { tangential, radial };
}

/* ---------- Chapters ---------- */
function setChapter(next) {
  chapter = next;
  document.querySelectorAll('[data-chapter]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.chapter === next)));
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== next; });
  $('#dial').classList.toggle('show', next === 'power');
  $('#angle-badge').classList.toggle('compact', next === 'power');
  // Pain screening is easier on a still rider: stop with the cranks level (3 o'clock).
  if (next === 'pain' && ready) setCrank(90);
  flyTo(PRESETS[next]);
}
document.querySelectorAll('[data-chapter]').forEach(b => b.addEventListener('click', () => setChapter(b.dataset.chapter)));
document.querySelectorAll('[data-goto]').forEach(a => a.addEventListener('click', () => setChapter(a.dataset.goto)));

function setPlaying(next) {
  playing = next;
  const b = $('#play-toggle');
  b.textContent = playing ? '❚❚' : '▶';
  b.setAttribute('aria-label', playing ? '暂停' : '播放');
  b.setAttribute('aria-pressed', String(playing));
}
$('#play-toggle').addEventListener('click', () => setPlaying(!playing));

// Manual crank control: dragging or nudging pauses playback.
const crankInput = $('#crank');
const clockName = angle => `${Math.round(angle / 30) % 12 || 12} 点钟`;
function setCrank(angle) {
  if (!ready) return;
  angle = ((angle % 360) + 360) % 360;
  setPlaying(false);
  model.setPhase(model.phaseForAngle(angle));
}
let scrubbing = false;
crankInput.addEventListener('pointerdown', () => { scrubbing = true; });
window.addEventListener('pointerup', () => { scrubbing = false; });
crankInput.addEventListener('input', () => setCrank(Number(crankInput.value)));
document.querySelectorAll('[data-nudge]').forEach(b => b.addEventListener('click', () => setCrank(model.crankAngle + Number(b.dataset.nudge))));
$('#slow-toggle').addEventListener('click', e => { slow = !slow; e.currentTarget.setAttribute('aria-pressed', String(slow)); });
$('#com-toggle').addEventListener('click', e => { showCom = !showCom; e.currentTarget.setAttribute('aria-pressed', String(showCom)); });
$('#saddle-rec-card').addEventListener('click', e => { showHeight = !showHeight; e.currentTarget.setAttribute('aria-pressed', String(showHeight)); });
$('#skeleton-toggle').addEventListener('click', e => { skeletonOn = !skeletonOn; e.currentTarget.setAttribute('aria-pressed', String(skeletonOn)); });

/* ---------- 01 Fit ---------- */
const mm = metres => `${Math.round(metres * 1000)} mm`;
function readFit() {
  return Object.fromEntries(['saddle', 'setback', 'reach', 'bar'].map(id => [id, Number($('#' + id).value) / 1000]));
}
function refreshFitText() {
  const knee = kneeExtension = model.extendedKneeAngle();
  const { elbow, back } = currentAngles();
  const notes = [];
  if (knee > 163) notes.push(`最低点膝内角 ${Math.round(knee)}°，腿够不着：脚尖被迫往下点、骨盆左右摇，膝后和跟腱受牵拉。`);
  else if (knee > 152) notes.push(`最低点膝内角 ${Math.round(knee)}°，腿接近伸直：骨盆容易左右摇，膝后和大腿后侧受牵拉。`);
  else if (knee < 138) notes.push(`最低点膝内角 ${Math.round(knee)}°，膝盖弯曲偏多：膝前侧和大腿前侧负担加大。`);
  else notes.push(`最低点膝内角 ${Math.round(knee)}°，在常用的 140°–150° 参考范围内。`);
  if (elbow > 168) notes.push('手臂几乎伸直锁死，路面冲击会直接传到手腕和肩颈。');
  if (back < 26) notes.push('背很低很平：需要足够的髋和胸椎灵活度，见第 05 章。');
  else if (back > 50) notes.push('上身较直立：舒适，但迎风面积大，重量更多压在坐垫上。');
  $('#fit-note').textContent = notes.join(' ');
  refreshKops();
}
let kopsOffset = 0;
const kopsWords = mm => Math.abs(mm) < 3 ? '正好在踏板轴上方' : `在踏板轴${mm > 0 ? '前' : '后'} ${Math.abs(mm)} mm`;
function refreshKops() {
  kopsOffset = Math.round(model.kneeOverPedal() * 1000);
  const tone = Math.abs(kopsOffset) <= 20 ? '在常见的 ±2 cm 范围内。' : kopsOffset > 0 ? '膝盖明显靠前：股四头肌和膝前负担加重，手上压力也会变大。' : '膝盖明显靠后：更多用臀和腘绳肌，但髋角更闭合、够车把更费劲。';
  $('#kops-text').innerHTML = `3 点钟时膝盖垂线<b>${kopsWords(kopsOffset)}</b>，${tone}<br><small>“膝盖过踏板轴（KOPS）”是定坐垫前后的传统起点，不是硬标准；计时赛/铁三常见膝盖靠前。坐垫前后也会轻微改变有效座高。</small>`;
}
function applyFit() {
  for (const id of ['saddle', 'setback', 'reach', 'bar']) {
    const v = Number($('#' + id).value);
    $(`#${id}-value`).textContent = `${v > 0 ? '+' : ''}${v} mm`;
  }
  model.setFit(readFit());
  refreshFitText();
}
['saddle', 'setback', 'reach', 'bar'].forEach(id => $('#' + id).addEventListener('input', applyFit));
$('#reset-fit').addEventListener('click', () => { ['saddle', 'setback', 'reach', 'bar'].forEach(id => { $('#' + id).value = 0; }); applyFit(); });

function applyBody() {
  const height = THREE.MathUtils.clamp(Number($('#height').value) || 175, 140, 210) / 100;
  const inseamInput = Number($('#inseam').value);
  const inseam = inseamInput ? THREE.MathUtils.clamp(inseamInput, 55, 110) / 100 : 0;
  model.setBody({ height, inseam });
  model.setFit(readFit());
  model.recommendedHeightCache = model.recommendedSaddleHeight;
  $('#saddle-rec').textContent = mm(model.recommendedHeightCache);
  $('#saddle-formula').textContent = mm(model.inseam * .883);
  $('#saddle-formula').nextElementSibling.textContent = inseam ? 'LeMond 经验公式，差 1–2 cm 属正常' : `未填裆高，按身高估 ${Math.round(model.inseam * 100)} cm`;
  refreshFitText();
}
$('#body-form').addEventListener('submit', e => { e.preventDefault(); applyBody(); });

/* ---------- 02 Power ---------- */
$('#muscle-list').innerHTML = muscles.map(m => `<div class="muscle" data-muscle="${m.key}"><div><strong>${m.name}</strong><small>${m.role}</small></div><span class="bar"><i></i></span></div>`).join('');
const muscleRows = Object.fromEntries(muscles.map(m => [m.key, document.querySelector(`[data-muscle="${m.key}"] i`)]));
$('#cadence').addEventListener('input', e => { cadence = Number(e.target.value); $('#cadence-value').textContent = `${cadence} rpm`; });

// Crank dial with the effective-force polar curve.
const dial = $('#dial');
(() => {
  const points = [];
  for (let a = 0; a <= 360; a += 4) {
    const r = 26 + 22 * Math.max(0, pedalForces(a).tangential);
    points.push(`${(Math.sin(a * DEG) * r).toFixed(1)},${(-Math.cos(a * DEG) * r).toFixed(1)}`);
  }
  dial.innerHTML = `<circle r="54" class="dial-bg"/><circle r="26" class="dial-ring"/>
    <polygon points="${points.join(' ')}" class="dial-force"/>
    ${[0, 90, 180, 270].map(a => `<text x="${Math.sin(a * DEG) * 45}" y="${-Math.cos(a * DEG) * 45 + 3}">${{ 0: '12', 90: '3', 180: '6', 270: '9' }[a]}</text>`).join('')}
    <line id="dial-crank" x1="0" y1="0" x2="0" y2="-26"/><circle id="dial-pedal" r="4.5"/>`;
})();

let lastPhaseKey = '';
function updatePower(angle, j) {
  const { tangential, radial } = pedalForces(angle);
  const pedal = model.bike.pedal('Right').setZ(.14 * model.riderRoot.scale.x);
  const a = angle * DEG;
  const radialDir = V(Math.sin(a), Math.cos(a), 0), tangentDir = V(Math.cos(a), -Math.sin(a), 0);
  const scale = .32;
  setArrow(effectiveArrow, pedal, tangentDir.clone().multiplyScalar(tangential * scale));
  setArrow(totalArrow, pedal, tangentDir.multiplyScalar(tangential * scale).add(radialDir.multiplyScalar(radial * scale)));
  effectiveArrow.userData.shaft.material.color.set(tangential >= 0 ? 0xd3dbe2 : 0xff8a6a);

  const thigh = j.knee.clone().sub(j.hip), shin = j.ankle.clone().sub(j.knee);
  const antThigh = V(-thigh.y, thigh.x, 0).normalize(), antShin = V(-shin.y, shin.x, 0).normalize();
  const s = model.riderRoot.scale.x, z = V(0, 0, .09 * s);
  const spots = {
    glute: j.hip.clone().add(V(-.06, .01, 0).multiplyScalar(s)),
    quad: j.hip.clone().lerp(j.knee, .55).addScaledVector(antThigh, .06 * s),
    rf: j.hip.clone().lerp(j.knee, .25).addScaledVector(antThigh, .07 * s),
    ham: j.hip.clone().lerp(j.knee, .5).addScaledVector(antThigh, -.06 * s),
    calf: j.knee.clone().lerp(j.ankle, .3).addScaledVector(antShin, -.05 * s),
    soleus: j.knee.clone().lerp(j.ankle, .62).addScaledVector(antShin, -.035 * s),
    ta: j.knee.clone().lerp(j.ankle, .35).addScaledVector(antShin, .035 * s),
    hipflex: j.hip.clone().add(V(.07, .06, 0).multiplyScalar(s)),
  };
  for (const m of muscles) {
    const level = activation(angle, m);
    const blob = muscleBlobs[m.key];
    blob.position.copy(spots[m.key]).add(z);
    blob.scale.setScalar((.035 + .03 * level) * s);
    blob.material.opacity = .08 + .62 * level;
    muscleRows[m.key].style.transform = `scaleX(${level.toFixed(3)})`;
    muscleRows[m.key].parentElement.parentElement.classList.toggle('on', level > .45);
  }
  const phase = phases.find(p => (p.from < p.to ? angle >= p.from && angle < p.to : angle >= p.from || angle < p.to));
  if (phase.name !== lastPhaseKey) {
    lastPhaseKey = phase.name;
    $('#phase-name').textContent = phase.name;
    $('#phase-text').textContent = phase.text;
  }
  const clock = Math.round(angle / 30) % 12 || 12;
  $('#phase-clock').textContent = `曲柄 ${clock} 点钟 · ${Math.round(angle)}°`;
  dial.querySelector('#dial-crank').setAttribute('x2', (Math.sin(a) * 26).toFixed(1));
  dial.querySelector('#dial-crank').setAttribute('y2', (-Math.cos(a) * 26).toFixed(1));
  dial.querySelector('#dial-pedal').setAttribute('cx', (Math.sin(a) * 26).toFixed(1));
  dial.querySelector('#dial-pedal').setAttribute('cy', (-Math.cos(a) * 26).toFixed(1));
}

/* ---------- Plantar pressure ---------- */
const pressurePower = new PressureMap($('#pressure-power'));
const pressureFoot = new PressureMap($('#pressure-foot'));
function pedalLoad(angle) {
  const { tangential, radial } = pedalForces(angle);
  return THREE.MathUtils.clamp(Math.hypot(Math.max(tangential, 0), radial) / 1.05, .08, 1);
}
let footSummary = null;

/* ---------- 03 Foot ---------- */
function footText(ball) {
  if (ball <= -10) return ['踩在脚尖', 'warn', '小腿和跟腱一直绷着，脚跟容易上下晃；长骑后小腿抽筋、跟腱酸痛的风险更高。有效腿长变长，坐垫往往需要略升高。'];
  if (ball < -2) return ['略偏脚尖', 'mid', '踝关节参与多、踩踏“弹”，适合冲刺型；耐力骑行中小腿负担偏大。'];
  if (ball <= 4) return ['常用起点', 'ok', '跖骨头在轴上方或略后：力从前脚掌传到踏板，踝关节还能参与控制。'];
  if (ball <= 12) return ['偏中足', 'mid', '小腿更省力、脚更稳，长距离和铁三常见；踝关节参与少，爆发力略弱。有效腿长变短，坐垫可能要略降。'];
  return ['踩在足弓', 'warn', '锁片过于靠后：足底和膝前负担可能增加，需要专业评估后再这样调。'];
}
$('#ball').addEventListener('input', e => {
  const v = Number(e.target.value);
  $('#ball-value').textContent = `${v > 0 ? '+' : ''}${v} mm`;
  model.setBallAhead(v / 1000);
  renderFootState();
});
function renderFootState() {
  const [title, tone, text] = footText(Number($('#ball').value));
  $('#foot-state').className = `foot-state ${tone}`;
  const ball = Number($('#ball').value) / 1000;
  footSummary = pressureFoot.draw({ ballAhead: ball, footLength: .26 * model.riderRoot.scale.x, force: 1 });
  $('#foot-state').innerHTML = `<strong>${title}</strong><p>${text}</p>
    <div class="region-bars">${footSummary.regions.map(r => `<div><span>${r.name}压力</span><i style="--w:${Math.min(100, r.ratio / 3.5 * 100)}%"></i><b class="${r.ratio > 1.3 ? 'up' : r.ratio < .8 ? 'down' : ''}">${Math.round(r.ratio * 100)}%</b></div>`).join('')}<small>相对“跖骨头在轴上方”时的压力</small></div>
    <span>最低点膝内角 <b>${Math.round(kneeExtension = model.extendedKneeAngle())}°</b>（锁片前后会改变有效腿长）</span>`;
}

/* ---------- 04 Pain ---------- */
const zoneList = $('#zone-list'), detail = $('#detail');
zoneOrder.forEach(key => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'zone-button';
  b.dataset.zone = key;
  b.textContent = zones[key].name;
  b.addEventListener('click', () => selectZone(key));
  zoneList.append(b);
});
function selectZone(key) {
  selectedZone = key;
  sensation = '酸胀';
  document.querySelectorAll('.zone-button').forEach(b => {
    b.classList.toggle('active', b.dataset.zone === key);
    b.setAttribute('aria-pressed', String(b.dataset.zone === key));
  });
  markers.forEach(m => {
    const on = m.key === key;
    m.core.material.color.set(on ? 0xffa96a : 0xe6ebef);
    m.halo.material.color.set(on ? 0xffa96a : 0xc9d2da);
    m.label.classList.toggle('active', on);
  });
  renderDetail();
}
function renderDetail() {
  const d = zones[selectedZone];
  const related = (zoneTraining[selectedZone] || []).map(id => training.find(t => t.id === id)).filter(Boolean);
  detail.innerHTML = `<h3>${d.name}</h3><p class="detail-lead">${d.lead}</p>
    <div class="prompt-label">你更接近哪种感觉？</div>
    <div class="chip-row" role="group" aria-label="疼痛感觉">${['酸胀', '麻刺', '尖锐痛'].map(x => `<button type="button" class="chip ${sensation === x ? 'active' : ''}" data-feel="${x}" aria-pressed="${sensation === x}">${x}</button>`).join('')}</div>
    <div class="cause-box"><h4>优先排查</h4>${d.causes[sensation].map(([h, p]) => `<div class="cause-item"><strong>${h}</strong><p>${p}</p></div>`).join('')}</div>
    <div class="cause-box"><h4>自查清单</h4>${d.checks.map(c => `<div class="cause-item"><p>□ ${c}</p></div>`).join('')}</div>
    <div class="next-step"><strong>可以先做：</strong>${d.step}</div>
    ${related.length ? `<div class="related"><span>相关训练</span>${related.map(t => `<a href="#card-${t.id}">${t.name}</a>`).join('')}</div>` : ''}
    <p class="detail-warning">${d.warning}</p>`;
  detail.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { sensation = b.dataset.feel; renderDetail(); }));
  detail.querySelectorAll('.related a').forEach(a => a.addEventListener('click', () => {
    const card = document.getElementById(a.getAttribute('href').slice(1));
    card?.classList.add('flash');
    setTimeout(() => card?.classList.remove('flash'), 1600);
  }));
}
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
renderer.domElement.addEventListener('click', e => {
  if (dragMoved || chapter !== 'pain') return;
  const b = renderer.domElement.getBoundingClientRect();
  mouse.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(markers.flatMap(m => [m.core, m.halo]))[0];
  if (hit) selectZone(hit.object.userData.zone);
});

/* ---------- 05 Training ---------- */
$('#training-grid').innerHTML = training.map((t, i) => `<article class="train-card" id="card-${t.id}" data-group="${t.group}">
  <div class="train-figure" data-img="${t.img}">${[1, 2, 3].map(n => `<img src="./assets/training/${t.img}-${n}.png" alt="${t.name} 第 ${n} 步示意" loading="lazy" ${n === 1 ? 'class="on"' : ''} />`).join('')}
    <span>${trainingGroups[t.group]}</span><ol class="frame-dots" aria-hidden="true"><li class="on"></li><li></li><li></li></ol></div>
  <div class="train-body"><span class="train-index">${String(i + 1).padStart(2, '0')}</span><h3>${t.name}</h3><p class="train-goal">${t.goal}</p>
  <ol>${t.steps.map(s => `<li>${s}</li>`).join('')}</ol>
  <p class="train-dose"><b>剂量</b>${t.dose}</p><p class="train-tip"><b>注意</b>${t.tip}</p></div></article>`).join('');
// Each card steps through its three frames; hovering pauses on the frame under the pointer.
let trainingFrame = 0;
function showFrame(figure, n) {
  figure.querySelectorAll('img').forEach((img, k) => img.classList.toggle('on', k === n));
  figure.querySelectorAll('.frame-dots li').forEach((dot, k) => dot.classList.toggle('on', k === n));
}
if (!reducedMotion) setInterval(() => {
  trainingFrame = (trainingFrame + 1) % 3;
  document.querySelectorAll('.train-figure:not(.hold)').forEach(f => showFrame(f, trainingFrame));
}, 1100);
document.querySelectorAll('.train-figure').forEach(figure => {
  figure.addEventListener('pointermove', e => {
    const r = figure.getBoundingClientRect();
    figure.classList.add('hold');
    showFrame(figure, Math.min(2, Math.floor((e.clientX - r.left) / r.width * 3)));
  });
  figure.addEventListener('pointerleave', () => figure.classList.remove('hold'));
});
document.querySelectorAll('.training-filter .chip').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.training-filter .chip').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', String(x === b)); });
  document.querySelectorAll('.train-card').forEach(card => { card.hidden = b.dataset.group !== 'all' && card.dataset.group !== b.dataset.group; });
}));

/* ---------- Frame loop ---------- */
function currentAngles() {
  const j = model.joints();
  const angle = (a, b, c) => a.clone().sub(b).angleTo(c.clone().sub(b)) / DEG;
  const torso = j.shoulder.clone().sub(j.hip);
  return { j, knee: angle(j.hip, j.knee, j.ankle), elbow: angle(j.shoulder, j.elbow, j.wrist), back: Math.atan2(torso.y, torso.x) / DEG };
}

function updateSkeleton(j) {
  skeleton.visible = skeletonOn && (chapter === 'fit' || chapter === 'power');
  if (!skeleton.visible) return;
  const p = Object.fromEntries(jointKeys.map(k => [k, j[k].clone()]));
  for (const k of jointKeys) jointDots[k].position.copy(p[k]);
  for (const { from, to, line } of boneLines) placeSegment(line, p[from], p[to]);
  setArc(arcs.knee, p.knee, p.hip.clone().sub(p.knee), p.ankle.clone().sub(p.knee), .08);
  setArc(arcs.elbow, p.elbow, p.shoulder.clone().sub(p.elbow), p.wrist.clone().sub(p.elbow), .06);
  const torso = p.shoulder.clone().sub(p.hip);
  setArc(arcs.back, p.hip, V(1, 0, 0), torso, .14);
  placeSegment(horizon, p.hip, p.hip.clone().add(V(.22, 0, 0)));
}

function tagStatus(value, [lo, hi]) { return value < lo - 3 || value > hi + 3 ? 'warn' : value < lo || value > hi ? 'near' : 'ok'; }
function updateAngleTags(j, angles) {
  const show = skeleton.visible;
  $('#angle-badge').hidden = show;
  const s = model.riderRoot.scale.x;
  // Tags sit in empty space around the rider; leader lines point back to the joint.
  const joints = { knee: j.knee, back: j.hip.clone().lerp(j.shoulder, .35), elbow: j.elbow };
  const anchors = {
    knee: j.knee.clone().add(V(.3, -.08, 0).multiplyScalar(s)),
    back: j.hip.clone().add(V(-.34, .28, 0).multiplyScalar(s)),
    elbow: j.elbow.clone().add(V(.2, .3, 0).multiplyScalar(s)),
  };
  const toScreen = v => { const p = v.clone().project(camera); return [(p.x * .5 + .5) * stage.clientWidth, (-p.y * .5 + .5) * stage.clientHeight]; };
  const w = stage.clientWidth, h = stage.clientHeight;
  for (const [key, el] of Object.entries(angleTags)) {
    el.style.display = show ? 'block' : 'none';
    leaders[key].style.display = show ? '' : 'none';
    if (!show) continue;
    const [x1, y1] = toScreen(joints[key]);
    let [x2, y2] = toScreen(anchors[key]);
    const hw = el.offsetWidth / 2 + 8, hh = el.offsetHeight / 2 + 8;
    x2 = THREE.MathUtils.clamp(x2, hw, w - hw);
    y2 = THREE.MathUtils.clamp(y2, hh + 30, h - hh - 70);
    el.style.left = `${x2}px`;
    el.style.top = `${y2}px`;
    Object.entries({ x1, y1, x2, y2 }).forEach(([k, v]) => leaders[key].setAttribute(k, v.toFixed(1)));
    const value = Math.round(angles[key]);
    // The knee is judged at its most extended point, not the live value.
    const judged = key === 'knee' && kneeExtension ? kneeExtension : value;
    const text = key === 'knee' && kneeExtension ? `${value}° <em>最低点 ${Math.round(kneeExtension)}°</em>` : `${value}°`;
    if (el.dataset.text !== text) { el.dataset.text = text; el.querySelector('b').innerHTML = text; }
    el.dataset.status = tagStatus(judged, ANGLE_TAGS[key].range);
  }
}

function placePainMarkers(j) {
  markerGroup.visible = chapter === 'pain';
  const s = model.riderRoot.scale.x, z = .16 * s;
  const mid = (a, b, t = .5) => a.clone().lerp(b, t);
  const spots = {
    neck: j.neck.clone().add(V(-.02, .02, 0)), hand: j.wrist.clone().add(V(.05, .02, 0)), back: mid(j.hip, j.shoulder, .45).add(V(-.04, .07, 0)),
    saddle: j.hip.clone().add(V(-.13, -.1, 0)), thigh: mid(j.hip, j.knee, .6).add(V(0, .06, 0)), knee: j.knee.clone().add(V(.04, 0, 0)), foot: j.toe.clone().add(V(0, .03, 0)),
  };
  const pulse = 1 + .12 * Math.sin(performance.now() / 260);
  for (const m of markers) {
    m.group.position.copy(spots[m.key]).setZ(z);
    m.halo.scale.setScalar(m.key === selectedZone ? pulse * 1.2 : pulse);
  }
}

function projectLabel(el, position, show) {
  const v = position.clone().project(camera);
  const visible = show && v.z < 1 && v.z > -1;
  el.style.display = visible ? 'block' : 'none';
  if (visible) {
    el.style.left = `${(v.x * .5 + .5) * stage.clientWidth}px`;
    el.style.top = `${(-v.y * .5 + .5) * stage.clientHeight}px`;
  }
}

let lastBadge = '';
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), .05);
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / .9);
    const k = 1 - (1 - tween.t) ** 3;
    view.target.lerpVectors(tween.from.target, tween.to.target, k);
    for (const key of ['yaw', 'pitch', 'dist']) view[key] = THREE.MathUtils.lerp(tween.from[key], tween.to[key], k);
    if (tween.t >= 1) tween = null;
  }
  updateCamera();
  if (ready) {
    if (playing) model.setPhase(model.phase + dt * cadence / 60 * (slow ? .25 : 1) * (chapter === 'foot' ? .5 : 1));
    const crank = model.crankAngle;
    if (!scrubbing) crankInput.value = Math.round(crank);
    $('#crank-value').textContent = `${clockName(crank)} · ${Math.round(crank)}°`;
    if (chapter === 'power') pressurePower.draw({ ballAhead: model.ballAhead, footLength: .26 * model.riderRoot.scale.x, force: pedalLoad(crank) });
    if (chapter === 'foot') pressureFoot.draw({ ballAhead: model.ballAhead, footLength: .26 * model.riderRoot.scale.x, force: pedalLoad(crank) });
    const { j, knee, elbow, back } = currentAngles();
    const badge = `${Math.round(knee)}|${Math.round(elbow)}|${Math.round(back)}`;
    if (badge !== lastBadge) {
      lastBadge = badge;
      $('#knee-angle').textContent = `${Math.round(knee)}°`;
      $('#elbow-angle').textContent = `${Math.round(elbow)}°`;
      $('#back-angle').textContent = `${Math.round(back)}°`;
    }
    updateSkeleton(j);
    updateAngleTags(j, { knee, elbow, back });
    const power = chapter === 'power';
    Object.values(muscleBlobs).forEach(b => { b.visible = power; });
    if (power) updatePower(model.crankAngle, j);
    else { effectiveArrow.visible = totalArrow.visible = false; }
    const foot = chapter === 'foot';
    spindleLine.visible = ballMarker.visible = foot;
    const pedal = model.bike.pedal('Right');
    const toeZ = .092 * model.riderRoot.scale.x + .03;
    spindleLine.position.copy(pedal).setZ(toeZ).add(V(0, .06, 0));
    ballMarker.position.copy(j.toe).setZ(toeZ);
    projectLabel(footLabels[0], pedal.clone().setZ(toeZ).add(V(.06, -.06, 0)), foot);
    projectLabel(footLabels[1], ballMarker.position.clone().add(V(.07, .06, 0)), foot);
    heightLine.visible = heightEnds[0].visible = heightEnds[1].visible = showHeight && chapter === 'fit';
    if (heightLine.visible) {
      const bb = model.bike.bb.clone().setZ(.1), current = model.bike.saddleHeight;
      const top = bb.clone().addScaledVector(model.bike.seatAxis, current);
      placeSegment(heightLine, bb, top);
      heightEnds[0].position.copy(bb); heightEnds[1].position.copy(top);
      const diff = Math.round((current - model.recommendedHeightCache) * 1000);
      heightLabel.textContent = `座高 ${Math.round(current * 1000)} mm${diff ? `（${diff > 0 ? '+' : ''}${diff}）` : ''}`;
      projectLabel(heightLabel, bb.clone().lerp(top, .5).add(V(-.16, 0, 0)), true);
    } else heightLabel.style.display = 'none';

    comMarker.visible = comDrop.visible = showCom && chapter !== 'pain';
    if (comMarker.visible) {
      const com = centreOfMass().setZ(.12);
      comMarker.position.copy(com);
      comMarker.quaternion.copy(camera.quaternion);
      placeSegment(comDrop, com, V(com.x, 0, com.z));
      // Coasting estimate: feet unloaded, weight shared by saddle and hands by lever rule.
      const seatX = model.bike.saddlePoint.x, handX = model.bike.handTarget('Right').x;
      const hands = THREE.MathUtils.clamp((com.x - seatX) / (handX - seatX), 0, 1);
      const ahead = Math.round((com.x - model.bike.bb.x) * 1000);
      comLabel.innerHTML = `重心 · 中轴${ahead >= 0 ? '前' : '后'} ${Math.abs(ahead)} mm<br><small>不踩踏时约 ${Math.round(hands * 100)}% 体重压在手上</small>`;
      projectLabel(comLabel, com.clone().add(V(0, .09, 0)), true);
    } else comLabel.style.display = 'none';
    placePainMarkers(j);
    markers.forEach(m => projectLabel(m.label, m.group.position.clone().add(V(0, .06, 0)), chapter === 'pain'));
  }
  renderer.render(scene, camera);
}

/* ---------- Boot ---------- */
selectZone(selectedZone);
setChapter(PRESETS[location.hash.slice(1)] ? location.hash.slice(1) : 'fit');
frame();
try {
  await model.load('./assets/rider_marker.glb', './assets/bike_road.glb');
  ready = true;
  setPlaying(!reducedMotion);
  applyBody();
  applyFit();
  renderFootState();
  $('#loading').remove();
} catch (error) {
  console.error(error);
  $('#loading').textContent = '3D 模型加载失败，请刷新重试。';
}
