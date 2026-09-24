// Bike + rider assembly: loads both models, sizes the rider, fits the saddle to the
// rider, and solves the rider's pose for the current crank phase every frame.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { RiderRig } from './rider.js';
import { RoadBike } from './bike.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;
const SIDES = { Right: 1, Left: -1 };

// Riding on the brake hoods.
const STYLE = { handDir: V(1, -.3, 0), palm: V(0, -.5, -.87), grip: [35, 60, 50], elbowBend: 160, elbowOut: .5, pelvis: 26, spineCurve: 36, neck: 40, head: 74 };

export const TARGET_KNEE = 145;

export class CyclingModel {
  constructor(scene) {
    this.scene = scene;
    this.loader = new GLTFLoader();
    this.phase = 0;
    this.fit = { saddle: 0, setback: 0, reach: 0, bar: 0 };
    this.ballAhead = 0; // ball of foot ahead (+) or behind (−) the pedal spindle, metres
    this.targetKnee = TARGET_KNEE;
  }

  async load(riderUrl, bikeUrl) {
    const [rider, bike] = await Promise.all([this.loader.loadAsync(riderUrl), this.loader.loadAsync(bikeUrl)]);
    this.riderRoot = rider.scene;
    this.riderRoot.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.riderRoot.rotation.y = Math.PI / 2; // Mixamo faces +Z; the bike rides towards +X.
    this.scene.add(this.riderRoot);
    this.rig = new RiderRig(this.riderRoot);
    this.modelHeight = this.measureHeight();
    this.bike = new RoadBike(bike);
    this.scene.add(this.bike.group);
    this.cachePedalPath();
    this.buildSaddleMap();
    this.seat();
  }

  measureHeight() {
    this.rig.resetPose();
    this.riderRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.riderRoot);
    // Crotch height: lowest body vertex on the midline between the legs.
    let crotch = Infinity;
    const p = V();
    this.riderRoot.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      for (let v = 0; v < mesh.geometry.attributes.position.count; v++) {
        mesh.getVertexPosition(v, p);
        mesh.localToWorld(p);
        if (Math.abs(p.z) < .012 && p.y > box.min.y + .3 && p.y < box.min.y + 1.2) crotch = Math.min(crotch, p.y);
      }
    });
    this.modelInseam = crotch - box.min.y;
    return box.max.y - box.min.y;
  }

  // Scale the rider to a visitor's height; legs follow the inseam when it is given.
  setBody({ height, inseam }) {
    const scale = height / this.modelHeight;
    const legScale = inseam ? THREE.MathUtils.clamp(inseam / height / (this.modelInseam / this.modelHeight), .88, 1.12) : 1;
    this.inseam = inseam || height * this.modelInseam / this.modelHeight;
    this.riderRoot.scale.setScalar(scale);
    for (const side of Object.keys(SIDES)) this.rig.bones[side + 'UpLeg'].scale.setScalar(legScale);
    this.rig.captureRest();
    this.seat();
  }

  // Hip-joint centre sits ~5.3% of body height above the saddle (sit bones plus soft
  // tissue); the saddle shader flattens whatever the skinned mesh pushes below the top.
  seat() {
    this.hipAbove = .053 * this.modelHeight * this.riderRoot.scale.x;
    this.baseSaddle = this.fitSaddle(this.targetKnee);
    this.applyFit();
    // The analytic fit ignores small IK details; correct it with the solved pose once.
    const error = this.targetKnee - this.extendedKneeAngle();
    this.baseSaddle = this.fitSaddle(this.targetKnee + error);
    this.applyFit();
  }

  // Largest right-knee inner angle (most extended, near bottom dead centre) of the solved pose.
  extendedKneeAngle() {
    const phase = this.phase;
    let max = 0;
    for (let i = 0; i < 24; i++) {
      this.setPhase(i / 24);
      const j = this.joints();
      max = Math.max(max, j.hip.clone().sub(j.knee).angleTo(j.ankle.clone().sub(j.knee)) / DEG);
    }
    this.setPhase(phase);
    return max;
  }

  // Crank angle ↔ animation phase (the clip turns the crank at a constant rate).
  phaseForAngle(angle) {
    return ((angle - this.angleAtZero) / 360 * this.turnDirection % 1 + 1) % 1;
  }

  cachePedalPath() {
    this.pedalPath = [];
    for (let i = 0; i < 48; i++) {
      this.bike.setPedalPhase(i / 48);
      this.pedalPath.push(this.bike.pedal('Right'));
    }
    const angleOf = p => (((Math.atan2(p.x - this.bike.bb.x, p.y - this.bike.bb.y) / DEG) % 360) + 360) % 360;
    this.angleAtZero = angleOf(this.pedalPath[0]);
    this.turnDirection = ((angleOf(this.pedalPath[12]) - this.angleAtZero + 360) % 360) < 180 ? 1 : -1;
    this.bike.setPedalPhase(this.phase);
  }

  // Height map of the saddle top, sampled once; queries follow the saddle as it slides.
  buildSaddleMap() {
    const surface = this.bike.saddleSurface;
    this.bike.applyFit({});
    const box = new THREE.Box3().setFromObject(surface);
    const nx = 48, nz = 16, heights = new Float32Array(nx * nz).fill(NaN);
    const ray = new THREE.Raycaster();
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const x = box.min.x + (box.max.x - box.min.x) * (i + .5) / nx;
      const z = box.min.z + (box.max.z - box.min.z) * (k + .5) / nz;
      ray.set(V(x, box.max.y + 1, z), V(0, -1, 0));
      const hit = ray.intersectObject(surface, true)[0];
      if (hit) heights[i * nz + k] = hit.point.y;
    }
    this.saddleMap = { box, nx, nz, heights };
    const data = new Float32Array(nx * nz);
    // Texture rows run along x; empty cells stay 0 so the shader ignores them.
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) data[k * nx + i] = Number.isNaN(heights[i * nz + k]) ? 0 : heights[i * nz + k];
    const texture = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.FloatType);
    texture.needsUpdate = true;
    this.saddleUniforms = {
      saddleMap: { value: texture },
      saddleMin: { value: V(box.min.x, 0, box.min.z) },
      saddleSize: { value: new THREE.Vector2(box.max.x - box.min.x, box.max.z - box.min.z) },
      saddleLift: { value: V() },
    };
    this.riderRoot.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      for (const material of [].concat(mesh.material)) this.pressOntoSaddle(material);
    });
  }

  // Soft-tissue compression: skinned vertices that end up inside the saddle are pushed
  // back onto its top surface.
  pressOntoSaddle(material) {
    const uniforms = this.saddleUniforms;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
uniform sampler2D saddleMap; uniform vec3 saddleMin; uniform vec2 saddleSize; uniform vec3 saddleLift;`)
        .replace('#include <skinning_vertex>', `#include <skinning_vertex>
{
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vec2 uv = (vec2(wp.x, wp.z) - vec2(saddleMin.x + saddleLift.x, saddleMin.z)) / saddleSize;
  if (all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) {
    float top = texture2D(saddleMap, uv).r;
    if (top > 0.0) {
      top += saddleLift.y;
      if (wp.y < top && wp.y > top - 0.12) {
        wp.y = top;
        transformed = (inverse(modelMatrix) * wp).xyz;
      }
    }
  }
}`);
    };
    material.customProgramCacheKey = () => 'saddle-press';
    material.needsUpdate = true;
  }

  hipTarget() { return this.bike.saddlePoint.add(V(0, this.hipAbove, 0)); }

  toeTarget(pedal, sign) {
    return V(pedal.x + this.ballAhead, pedal.y + .03 * this.riderRoot.scale.x, sign * .092);
  }

  // Heel drops on the downstroke and lifts on the upstroke (ankling). Pedalling on the toes
  // forces the ankle into more plantarflexion; on the midfoot, less.
  footPitch(pedal) {
    const angle = Math.atan2(pedal.y - this.bike.bb.y, pedal.x - this.bike.bb.x) / DEG;
    return 14 + 10 * Math.cos((angle - 200) * DEG) - this.ballAhead * 300;
  }

  ankleFor(pedal, sign) {
    const toe = this.toeTarget(pedal, sign);
    const a = (this.rig.footRestAngle + this.footPitch(pedal)) * DEG;
    return toe.add(V(-Math.cos(a), Math.sin(a), 0).multiplyScalar(this.rig.limb.foot));
  }

  // Largest knee inner angle over a pedal revolution for a given saddle offset (analytic).
  kneeExtension(offset) {
    this.bike.applyFit({ saddleOffset: offset, setback: this.fit.setback, reach: this.fit.reach, barHeight: this.fit.bar });
    const hip = this.hipTarget().setZ(this.rig.hipOffset.Right.z);
    const { thigh, shin } = this.rig.limb;
    let reach = 0;
    for (const pedal of this.pedalPath) reach = Math.max(reach, hip.distanceTo(this.ankleFor(pedal, 1)));
    reach = Math.min(reach, thigh + shin - 1e-4);
    return Math.acos((thigh * thigh + shin * shin - reach * reach) / (2 * thigh * shin)) / DEG;
  }

  fitSaddle(targetKnee) {
    let low = -.4, high = .4;
    for (let i = 0; i < 30; i++) {
      const mid = (low + high) / 2;
      if (this.kneeExtension(mid) < targetKnee) low = mid; else high = mid;
    }
    return (low + high) / 2;
  }

  // Metres, relative to the rider's recommended fit.
  setFit(fit) { Object.assign(this.fit, fit); this.applyFit(); }

  setBallAhead(metres) { this.ballAhead = metres; this.solve(); }

  applyFit() {
    this.bike.applyFit({ saddleOffset: this.baseSaddle + this.fit.saddle, setback: this.fit.setback, reach: this.fit.reach, barHeight: this.fit.bar });
    this.saddleUniforms?.saddleLift.value.copy(this.bike.saddleShift);
    this.solve();
  }

  setPhase(phase) {
    this.phase = ((phase % 1) + 1) % 1;
    this.bike.setPedalPhase(this.phase);
    this.solve();
  }

  // Crank angle of the right pedal, clockwise from top dead centre, in degrees.
  get crankAngle() {
    const p = this.bike.pedal('Right');
    return (((Math.atan2(p.x - this.bike.bb.x, p.y - this.bike.bb.y) / DEG) % 360) + 360) % 360;
  }

  solve() {
    const hand = {}, toe = {}, footPitch = {};
    for (const [side, sign] of Object.entries(SIDES)) {
      const pedal = this.bike.pedal(side);
      hand[side] = this.bike.handTarget(side);
      toe[side] = this.toeTarget(pedal, sign);
      footPitch[side] = this.footPitch(pedal);
    }
    this.rig.solve({ hip: this.hipTarget(), hand, toe, footPitch, style: STYLE });
    for (const side of Object.keys(SIDES)) this.bike.levelPedal(side, this.rig.solePitch[side]);
  }

  // Recommended saddle height (BB centre → saddle top) for the current body, in metres.
  get recommendedSaddleHeight() {
    this.bike.applyFit({ saddleOffset: this.baseSaddle });
    const height = this.bike.saddleHeight;
    this.applyFit();
    return height;
  }

  // Front of the kneecap: the knee joint pushed forward across the thigh by the patella.
  kneeFront() {
    const j = this.joints();
    const shin = j.ankle.clone().sub(j.knee).normalize();
    const forward = V(-shin.y, shin.x, 0).normalize();
    if (forward.x < 0) forward.negate();
    return j.knee.clone().addScaledVector(forward, .05 * this.riderRoot.scale.x);
  }

  // KOPS: horizontal distance from the front of the knee to the pedal spindle with the crank
  // forward at 3 o'clock, in metres (+ = knee ahead of the spindle).
  kneeOverPedal() {
    const phase = this.phase;
    this.setPhase(this.phaseForAngle(90));
    const offset = this.kneeFront().x - this.bike.pedal('Right').x;
    this.setPhase(phase);
    return offset;
  }

  joints() { return this.rig.joints('Right'); }
}
