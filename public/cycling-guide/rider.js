// Runtime rig for a Mixamo-skeleton rider: every frame the pose is solved from
// the bike's contact points (saddle, hand position, pedals), so any Mixamo
// character can replace X Bot and the fit sliders move the real model.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), FORWARD = V(1, 0, 0), RIGHT = V(0, 0, 1);
const DEG = Math.PI / 180;

// Direction in the sagittal plane: angle measured from +X (forward) towards +Y (up).
const sagittal = angle => V(Math.cos(angle * DEG), Math.sin(angle * DEG), 0);

// Quaternion whose X axis is `dir` and whose Y axis is `side` made orthogonal to it.
function basis(dir, side) {
  const x = dir.clone().normalize();
  const y = side.clone().addScaledVector(x, -side.dot(x));
  if (y.lengthSq() < 1e-8) y.copy(Math.abs(x.y) < .9 ? UP : FORWARD).addScaledVector(x, -x.dot(Math.abs(x.y) < .9 ? UP : FORWARD));
  y.normalize();
  const z = V().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

// Classic two-bone solve. Returns the middle joint and the (possibly clamped) end.
function twoBone(start, end, upper, lower, pole) {
  const offset = end.clone().sub(start);
  const reach = THREE.MathUtils.clamp(offset.length(), Math.abs(upper - lower) + 1e-4, upper + lower - 1e-4);
  const dir = offset.normalize();
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  const height = Math.sqrt(Math.max(0, upper * upper - along * along));
  const bend = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return {
    mid: start.clone().addScaledVector(dir, along).addScaledVector(bend, height),
    end: start.clone().addScaledVector(dir, reach),
  };
}

const SIDES = { Right: 1, Left: -1 };
const FINGERS = ['Index', 'Middle', 'Ring', 'Pinky'];

export class RiderRig {
  constructor(root) {
    this.root = root;
    this.bones = {};
    const boneName = bone => bone.name.replace(/^mixamorig:?/, '');
    const meshes = [];
    root.traverse(object => { if (object.isSkinnedMesh) { object.frustumCulled = false; meshes.push(object); } });
    // Take the bones from the most complete skeleton; some Mixamo FBX exports give
    // head/eye meshes their own copies of the upper-spine bones, so rebind those.
    meshes.sort((a, b) => b.skeleton.bones.length - a.skeleton.bones.length);
    for (const bone of meshes[0]?.skeleton.bones ?? []) this.bones[boneName(bone)] = bone;
    root.traverse(object => { if (object.isBone && !this.bones[boneName(object)]) this.bones[boneName(object)] = object; });
    for (const mesh of meshes.slice(1)) {
      const { bones, boneInverses } = mesh.skeleton;
      if (bones.every(bone => this.bones[boneName(bone)] === bone)) continue;
      mesh.bind(new THREE.Skeleton(bones.map(bone => this.bones[boneName(bone)] ?? bone), boneInverses), mesh.bindMatrix);
    }
    const missing = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']
      .filter(name => !this.bones[name]);
    if (missing.length) throw new Error('Rider is missing Mixamo bones: ' + missing.join(', '));
    this.restLocal = new Map();
    for (const bone of Object.values(this.bones)) this.restLocal.set(bone, { q: bone.quaternion.clone(), p: bone.position.clone() });
    this.captureRest();
  }

  // Rest data is measured in world space with the rider facing +X and its right side on +Z.
  captureRest() {
    this.resetPose();
    this.root.updateMatrixWorld(true);
    const world = name => this.bones[name].getWorldPosition(V());
    this.rest = {};
    const setRest = (name, child, side) => {
      const bone = this.bones[name], next = this.bones[child];
      if (!bone || !next) return;
      const dir = world(child).sub(world(name)).normalize();
      const q = bone.getWorldQuaternion(new THREE.Quaternion());
      this.rest[name] = { offset: basis(dir, side(dir)).invert().multiply(q), length: world(child).distanceTo(world(name)) };
    };
    const lateral = () => RIGHT;
    for (const [name, child] of [['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Spine2', 'Neck'], ['Neck', 'Head'], ['Head', 'HeadTop_End']]) setRest(name, child, lateral);
    for (const side of Object.keys(SIDES)) {
      // Knee and foot hinge about the rider's lateral axis.
      const kneeHinge = () => RIGHT.clone().negate();
      setRest(side + 'UpLeg', side + 'Leg', kneeHinge);
      setRest(side + 'Leg', side + 'Foot', kneeHinge);
      setRest(side + 'Foot', side + 'ToeBase', kneeHinge);
      setRest(side + 'ToeBase', side + 'Toe_End', kneeHinge);
      // In a palms-down T-pose the elbow flexes towards the front, so the hinge is dir x forward.
      const elbowHinge = dir => V().crossVectors(dir, FORWARD);
      setRest(side + 'Shoulder', side + 'Arm', elbowHinge);
      setRest(side + 'Arm', side + 'ForeArm', elbowHinge);
      setRest(side + 'ForeArm', side + 'Hand', elbowHinge);
      // Hands and fingers use the palm normal (down in the T-pose).
      const palm = () => V(0, -1, 0);
      setRest(side + 'Hand', side + 'HandMiddle1', palm);
      for (const finger of [...FINGERS, 'Thumb'])
        for (let i = 1; i <= 3; i++) setRest(`${side}Hand${finger}${i}`, `${side}Hand${finger}${i + 1}`, palm);
    }
    this.hipOffset = {};
    const hips = world('Hips');
    for (const side of Object.keys(SIDES)) this.hipOffset[side] = world(side + 'UpLeg').sub(hips);
    this.limb = {
      thigh: this.rest.RightUpLeg.length, shin: this.rest.RightLeg.length, foot: this.rest.RightFoot.length,
      upperArm: this.rest.RightArm.length, foreArm: this.rest.RightForeArm.length,
    };
    const foot = world('RightToeBase').sub(world('RightFoot'));
    this.footRestAngle = Math.atan2(-foot.y, Math.hypot(foot.x, foot.z)) / DEG;
    this.restWorldHipsQ = this.bones.Hips.getWorldQuaternion(new THREE.Quaternion());
  }

  resetPose() {
    for (const [bone, rest] of this.restLocal) { bone.quaternion.copy(rest.q); bone.position.copy(rest.p); }
  }

  // Orient a bone so it points along `dir` with its hinge/palm reference aligned to `side`.
  aim(name, dir, side) {
    const bone = this.bones[name], rest = this.rest[name];
    if (!bone || !rest) return;
    const worldQ = basis(dir, side).multiply(rest.offset);
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parentQ.invert().multiply(worldQ));
    bone.updateWorldMatrix(false, false);
  }

  pos(name) { return this.bones[name].getWorldPosition(V()); }

  placeHips(hipJointCenter, pelvisAngle) {
    const hips = this.bones.Hips;
    const q = basis(sagittal(pelvisAngle), RIGHT).multiply(this.rest.Hips.offset);
    const parentQ = hips.parent.getWorldQuaternion(new THREE.Quaternion());
    hips.quaternion.copy(parentQ.clone().invert().multiply(q));
    // Hip joints sit symmetrically around the Hips bone; rotate that offset with the pelvis.
    const delta = q.clone().multiply(this.restWorldHipsQ.clone().invert());
    const mid = this.hipOffset.Right.clone().add(this.hipOffset.Left).multiplyScalar(.5).applyQuaternion(delta);
    const target = hipJointCenter.clone().sub(mid);
    hips.position.copy(hips.parent.worldToLocal(target));
    hips.updateWorldMatrix(false, false);
  }

  /**
   * targets: hip (hip-joint centre), hand.{Right,Left} (wrist), toe.{Right,Left} (ball of foot),
   * footPitch.{Right,Left} in degrees (toe down), style: {pelvis, elbowBend, palm, grip}
   */
  solve(targets) {
    this.resetPose();
    this.root.updateMatrixWorld(true);
    const style = targets.style;
    const wantReach = Math.sqrt(this.limb.upperArm ** 2 + this.limb.foreArm ** 2
      - 2 * this.limb.upperArm * this.limb.foreArm * Math.cos(style.elbowBend * DEG));
    const handMid = targets.hand.Right.clone().add(targets.hand.Left).multiplyScalar(.5);

    // Back angle is solved so the arms keep the requested elbow bend.
    const torso = angle => {
      this.placeHips(targets.hip, angle + style.pelvis);
      // A gentle, even curve from the pelvis to the upper back (not a flat plank).
      const c = style.spineCurve;
      this.aim('Spine', sagittal(angle + c * .45), RIGHT);
      this.aim('Spine1', sagittal(angle + c * .1), RIGHT);
      this.aim('Spine2', sagittal(angle - c * .3), RIGHT);
      for (const side of Object.keys(SIDES)) this.aimClavicle(side, targets.hand[side]);
      this.root.updateMatrixWorld(true);
      const shoulders = this.pos('RightArm').add(this.pos('LeftArm')).multiplyScalar(.5);
      return shoulders.distanceTo(handMid);
    };
    let low = 5, high = 85;
    for (let i = 0; i < 22; i++) {
      const mid = (low + high) / 2;
      if (torso(mid) > wantReach) high = mid; else low = mid;
    }
    this.backAngle = (low + high) / 2;
    torso(this.backAngle);

    // Neck extends so the eyes look up the road; the head stays close to upright.
    this.aim('Neck', sagittal(this.backAngle + style.neck), RIGHT);
    this.aim('Head', sagittal(style.head), RIGHT);

    for (const [side, sign] of Object.entries(SIDES)) {
      this.solveArm(side, sign, targets.hand[side], style);
      this.solveLeg(side, sign, targets.toe[side], targets.footPitch[side]);
    }
    this.root.updateMatrixWorld(true);
  }

  // Clavicles reach slightly towards the bar so the shoulders round forward.
  aimClavicle(side, wrist) {
    const bone = this.bones[side + 'Shoulder'];
    bone.quaternion.copy(this.restLocal.get(bone).q);
    bone.updateWorldMatrix(false, true);
    const start = this.pos(side + 'Shoulder');
    const dir = this.pos(side + 'Arm').sub(start).normalize()
      .add(wrist.clone().sub(start).normalize().multiplyScalar(.3)).normalize();
    this.aim(side + 'Shoulder', dir, V().crossVectors(dir, FORWARD));
  }

  solveArm(side, sign, wrist, style) {
    const shoulder = this.pos(side + 'Arm');
    const pole = V(-.25, -1, sign * style.elbowOut);
    const { mid: elbow, end: hand } = twoBone(shoulder, wrist, this.limb.upperArm, this.limb.foreArm, pole);
    const upper = elbow.clone().sub(shoulder).normalize(), fore = hand.clone().sub(elbow).normalize();
    let hinge = V().crossVectors(upper, fore);
    if (hinge.lengthSq() < 1e-6) hinge = V().crossVectors(upper, FORWARD);
    this.aim(side + 'Arm', upper, hinge);
    this.aim(side + 'ForeArm', fore, hinge);

    const handDir = style.handDir.clone().normalize();
    const palm = style.palm.clone().multiply(V(1, 1, sign)).normalize();
    this.aim(side + 'Hand', handDir, palm);
    // Knuckle axis: fingers curl around it towards the palm.
    const knuckle = V().crossVectors(handDir, palm).normalize();
    for (const finger of FINGERS) {
      let dir = handDir.clone();
      for (let i = 1; i <= 3; i++) {
        dir = dir.clone().applyAxisAngle(knuckle, style.grip[i - 1] * DEG);
        this.aim(`${side}Hand${finger}${i}`, dir, V().crossVectors(dir, knuckle).negate());
      }
    }
    let thumb = handDir.clone().multiplyScalar(.7).add(palm.clone().multiplyScalar(.35)).add(V(0, 0, -sign * .5)).normalize();
    for (let i = 1; i <= 3; i++) {
      this.aim(`${side}HandThumb${i}`, thumb, palm);
      thumb = thumb.clone().applyAxisAngle(palm, sign * 12 * DEG);
    }
  }

  solveLeg(side, sign, toe, pitch) {
    const hip = this.pos(side + 'UpLeg');
    // Ankle sits behind and above the ball of the foot; `pitch` tilts the sole toe-down.
    // When the leg cannot reach, point the toes further (as riders do on a too-high saddle).
    const legLength = (this.limb.thigh + this.limb.shin) * .995;
    const ankleAt = p => {
      const a = (this.footRestAngle + p) * DEG;
      return toe.clone().add(V(-Math.cos(a), Math.sin(a), 0).multiplyScalar(this.limb.foot));
    };
    let extra = 0, ankle = ankleAt(pitch);
    while (extra < 36 && ankle.distanceTo(hip) > legLength) { extra += 3; ankle = ankleAt(pitch + extra); }
    pitch += extra;
    (this.solePitch ??= {})[side] = pitch;
    const { mid: knee, end } = twoBone(hip, ankle, this.limb.thigh, this.limb.shin, V(1, .15, 0));
    const thigh = knee.clone().sub(hip).normalize(), shin = end.clone().sub(knee).normalize();
    let hinge = V().crossVectors(thigh, shin);
    if (hinge.lengthSq() < 1e-6) hinge = RIGHT.clone().negate();
    this.aim(side + 'UpLeg', thigh, hinge);
    this.aim(side + 'Leg', shin, hinge);
    this.aim(side + 'Foot', toe.clone().sub(end).normalize(), hinge);
    this.aim(side + 'ToeBase', V(Math.cos(pitch * DEG), -Math.sin(pitch * DEG), 0), hinge);
  }

  joints(side = 'Right') {
    return {
      hip: this.pos(side + 'UpLeg'), knee: this.pos(side + 'Leg'), ankle: this.pos(side + 'Foot'),
      shoulder: this.pos(side + 'Arm'), elbow: this.pos(side + 'ForeArm'), wrist: this.pos(side + 'Hand'),
      toe: this.pos(side + 'ToeBase'), neck: this.pos('Neck'), head: this.pos('Head'),
    };
  }
}
