// Road bike adapter: exposes contact points (saddle, hoods, pedals) and fit handles
// (saddle height, bar reach, bar height) to the rider rig. Points below are in the
// GLB's own coordinates, before SCALE is applied.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const key = name => name.replace(/[^a-z0-9-]/gi, '').toLowerCase();

// The source model is ~0.9x real size (170 mm cranks measure 153 mm); scale it to metres.
const SCALE = 1.1;
const SEAT_TUBE_TOP = V(-.2525, .845, 0);
const POST_RADIUS = .0135;
const STEM_FROM = V(.201, .99, 0), STEM_TO = V(.3145, .9925, 0);

export class RoadBike {
  constructor(gltf) {
    this.root = gltf.scene;
    this.root.scale.setScalar(SCALE);
    this.group = new THREE.Group();
    this.group.add(this.root);
    const index = new Map();
    this.root.traverse(object => index.set(key(object.name), object));
    this.find = name => {
      const object = index.get(key(name));
      if (!object) throw new Error(`road bike: missing node ${name}`);
      return object;
    };
    // The source model's saddle was pushed 14 cm forward off its seatpost; put it back.
    this.find('SeatAssy').position.set(0, 0, 0);
    this.root.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    this.root.updateMatrixWorld(true);

    this.mixer = new THREE.AnimationMixer(this.root);
    gltf.animations.forEach(clip => this.mixer.clipAction(clip).play());
    this.duration = Math.max(...gltf.animations.map(clip => clip.duration));

    this.rest = new Map();
    const remember = object => { this.rest.set(object, object.matrixWorld.clone()); return object; };
    this.saddleSurface = this.find('Seat');
    this.saddle = remember(this.find('SeatAssy'));
    this.post = remember(this.find('SeatPost'));
    this.bar = remember(this.find('Handle'));
    this.stem = remember(this.find('Stem'));
    this.hoods = { Right: this.find('Grip001'), Left: this.find('Grip') };
    this.pedals = { Right: this.find('Pedal_R'), Left: this.find('Pedal_L') };
    // The crank animation spins the pedal bodies with the arms, and the bodies are modelled
    // at an angle. Find each body's thinnest direction and store the orientation that keeps
    // the spindle lateral and that direction pointing up, so it can follow the sole.
    this.pedalFlat = Object.fromEntries(Object.entries(this.pedals).map(([side, pedal]) => [side, this.flatPedalQuaternion(pedal)]));
    this.setPedalPhase(0);
    this.bb = this.pedal('Right').add(this.pedal('Left')).multiplyScalar(.5).setZ(0);
    this.crankLength = this.pedal('Right').setZ(0).distanceTo(this.bb);
    this.sitPoint = this.measureSitPoint();

    this.tubeTop = SEAT_TUBE_TOP.clone().multiplyScalar(SCALE);
    this.seatAxis = this.tubeTop.clone().sub(this.bb).normalize();
    this.stemFrom = STEM_FROM.clone().multiplyScalar(SCALE);
    this.stemTo = STEM_TO.clone().multiplyScalar(SCALE);
    // Exposed seatpost shown when the saddle is raised above the stock height.
    this.postFiller = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 20),
      new THREE.MeshStandardMaterial({ color: 0x0b1017, roughness: .35, metalness: .4 }));
    this.postFiller.castShadow = true;
    this.postFiller.visible = false;
    this.group.add(this.postFiller);
    this.lift = V(); this.shift = V();
  }

  // Cast straight down onto the saddle 9 cm ahead of its tail, where the sit bones land.
  measureSitPoint() {
    const box = new THREE.Box3().setFromObject(this.saddleSurface);
    const x = box.min.x + .09;
    const hit = new THREE.Raycaster(V(x, box.max.y + 1, 0), V(0, -1, 0)).intersectObject(this.saddleSurface, true)[0];
    return V(x, hit ? hit.point.y : box.max.y, 0);
  }

  setPedalPhase(phase) {
    this.mixer.setTime((((phase % 1) + 1) % 1) * this.duration);
    this.root.updateMatrixWorld(true);
  }

  setWorld(object, matrix) {
    object.matrixAutoUpdate = false;
    object.matrix.copy(object.parent.matrixWorld.clone().invert().multiply(matrix));
    object.updateMatrixWorld(true);
  }

  moveWorld(object, delta) {
    this.setWorld(object, new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z).multiply(this.rest.get(object)));
  }

  // Map segment a→b0 onto a→b1: rotate about a and stretch along the segment.
  stretchWorld(object, a, b0, b1) {
    const d0 = b0.clone().sub(a), d1 = b1.clone().sub(a);
    const k = d1.length() / d0.length(), u = d0.normalize();
    const stretch = new THREE.Matrix4().set(
      1 + (k - 1) * u.x * u.x, (k - 1) * u.x * u.y, (k - 1) * u.x * u.z, 0,
      (k - 1) * u.y * u.x, 1 + (k - 1) * u.y * u.y, (k - 1) * u.y * u.z, 0,
      (k - 1) * u.z * u.x, (k - 1) * u.z * u.y, 1 + (k - 1) * u.z * u.z, 0,
      0, 0, 0, 1);
    const rotate = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(u, d1.normalize()));
    this.setWorld(object, new THREE.Matrix4().makeTranslation(a.x, a.y, a.z).multiply(rotate).multiply(stretch)
      .multiply(new THREE.Matrix4().makeTranslation(-a.x, -a.y, -a.z)).multiply(this.rest.get(object)));
  }

  // Metres. saddleOffset slides along the seat tube; setback slides the saddle back (+) or
  // forward (−) on its rails; reach is horizontal; barHeight vertical.
  applyFit({ saddleOffset = 0, setback = 0, reach = 0, barHeight = 0 }) {
    this.lift = this.seatAxis.clone().multiplyScalar(saddleOffset);
    this.saddleShift = this.lift.clone().add(V(-setback, 0, 0));
    this.moveWorld(this.saddle, this.saddleShift);
    this.moveWorld(this.post, this.lift);
    this.postFiller.visible = saddleOffset > .002;
    if (this.postFiller.visible) {
      this.postFiller.position.copy(this.tubeTop).addScaledVector(this.lift, .5);
      this.postFiller.scale.set(POST_RADIUS * SCALE, saddleOffset + .01, POST_RADIUS * SCALE);
      this.postFiller.quaternion.setFromUnitVectors(V(0, 1, 0), this.seatAxis);
    }
    this.shift = V(reach, barHeight, 0);
    this.moveWorld(this.bar, this.shift);
    this.stretchWorld(this.stem, this.stemFrom, this.stemTo, this.stemTo.clone().add(this.shift));
  }

  get saddlePoint() { return this.sitPoint.clone().add(this.saddleShift ?? this.lift); }

  // Saddle height as fitters measure it: BB centre to saddle top along the seat tube.
  get saddleHeight() { return this.saddlePoint.sub(this.bb).dot(this.seatAxis); }

  // Wrist position with the palm resting on top of the brake hood.
  handTarget(side) {
    const box = new THREE.Box3().setFromObject(this.hoods[side]);
    return V(box.min.x - .035, box.max.y + .025, box.getCenter(V()).z);
  }

  pedal(side) { return this.pedals[side].getWorldPosition(V()); }

  flatPedalQuaternion(pedal) {
    const toLocal = pedal.matrixWorld.clone().invert();
    const points = [];
    const v = V();
    pedal.traverse(mesh => {
      if (!mesh.isMesh) return;
      const position = mesh.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) points.push(v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(toLocal).clone());
    });
    // The spindle is the local axis that points sideways in the world.
    const axes = [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)];
    const worldQ = pedal.getWorldQuaternion(new THREE.Quaternion());
    const spindle = axes.reduce((best, a) => Math.abs(a.clone().applyQuaternion(worldQ).z) > Math.abs(best.clone().applyQuaternion(worldQ).z) ? a : best);
    const [e1, e2] = axes.filter(a => a !== spindle);
    let thin = e1, minExtent = Infinity;
    for (let deg = 0; deg < 180; deg++) {
      const dir = e1.clone().multiplyScalar(Math.cos(deg * Math.PI / 180)).addScaledVector(e2, Math.sin(deg * Math.PI / 180));
      let lo = Infinity, hi = -Infinity;
      for (const p of points) { const d = p.dot(dir); lo = Math.min(lo, d); hi = Math.max(hi, d); }
      if (hi - lo < minExtent) { minExtent = hi - lo; thin = dir; }
    }
    // Keep the sign closest to the current world up to avoid flipping the body over.
    if (thin.clone().applyQuaternion(worldQ).y < 0) thin.negate();
    const lateral = spindle.clone().applyQuaternion(worldQ).z > 0 ? V(0, 0, 1) : V(0, 0, -1);
    const local = new THREE.Matrix4().makeBasis(spindle, thin, V().crossVectors(spindle, thin));
    const world = new THREE.Matrix4().makeBasis(lateral, V(0, 1, 0), V().crossVectors(lateral, V(0, 1, 0)));
    return new THREE.Quaternion().setFromRotationMatrix(world.multiply(local.transpose()));
  }

  // Tilt a pedal body to match the sole: pitch in degrees, toe down positive.
  levelPedal(side, pitch) {
    const pedal = this.pedals[side];
    const world = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -pitch * Math.PI / 180).multiply(this.pedalFlat[side]);
    pedal.quaternion.copy(pedal.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
    pedal.updateMatrixWorld(true);
  }

  dispose() { this.group.removeFromParent(); }
}
