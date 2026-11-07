#!/usr/bin/env node
/**
 * Generates the original exercise demonstrations in `public/exercises`.
 *
 *   cd frontend && node scripts/generate-exercise-diagrams.mjs
 *
 * Each exercise is described by a start and end pose. Limbs are solved with
 * two-bone inverse kinematics on every frame, so proportions stay consistent
 * while the figure moves. Two files are written per exercise:
 *
 * - `<slug>.svg`: static, with the start pose as a ghost and the end as solid.
 * - `<slug>-motion.svg`: the same movement as a looping SMIL animation.
 *
 * SMIL inside an <img> can't be paused, so pages should serve the static file
 * under `prefers-reduced-motion`, for example with <picture>.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'exercises');

const WIDTH = 480;
const HEIGHT = 300;
const FLOOR = 258;
const FRAME_COUNT = 24;
const LOOP_SECONDS = 4;

const COLOR = {
  panel: '#EEF2F6',
  floor: '#CBD5E1',
  body: '#1E293B',
  farLimb: '#64748B',
  frame: '#94A3B8',
  pad: '#64748B',
  iron: '#334155',
  cable: '#64748B',
  accent: '#0D9488',
};

const BODY = {
  torso: 72,
  neck: 25,
  headRadius: 15,
  upperArm: 40,
  forearm: 38,
  thigh: 54,
  shin: 52,
  foot: 21,
};

const STROKE = { torso: 27, upperArm: 15, forearm: 13, thigh: 21, shin: 17, foot: 11 };

const rad = (degrees) => (degrees * Math.PI) / 180;
const add = ([ax, ay], [bx, by]) => [ax + bx, ay + by];
const polar = ([x, y], length, degrees) => [
  x + length * Math.cos(rad(degrees)),
  y + length * Math.sin(rad(degrees)),
];
const angleBetween = ([ax, ay], [bx, by]) => (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const round = (value) => Math.round(value * 10) / 10;

const reachWarnings = new Map();

/** Solves the middle joint of a two-bone limb. `bend` picks the side it folds toward. */
function solveLimb(root, target, upperLength, lowerLength, bend, label) {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const distance = Math.hypot(dx, dy) || 0.001;
  const maxReach = upperLength + lowerLength - 0.5;

  if (distance > maxReach + 3) {
    reachWarnings.set(label, Math.max(reachWarnings.get(label) ?? 0, round(distance - maxReach)));
  }

  const reach = Math.min(Math.max(distance, Math.abs(upperLength - lowerLength) + 0.5), maxReach);
  const along = (upperLength ** 2 - lowerLength ** 2 + reach ** 2) / (2 * reach);
  const offset = Math.sqrt(Math.max(upperLength ** 2 - along ** 2, 0));
  const ux = dx / distance;
  const uy = dy / distance;
  const joint = [
    root[0] + along * ux + bend * offset * -uy,
    root[1] + along * uy + bend * offset * ux,
  ];
  return { joint, end: [root[0] + reach * ux, root[1] + reach * uy] };
}

function solvePose(pose, scale, label) {
  const length = Object.fromEntries(Object.entries(BODY).map(([k, v]) => [k, v * scale]));
  const depth = pose.depth ?? [5 * scale, -4 * scale];
  const { hip } = pose;
  const torsoAngle = pose.shoulderAt ? angleBetween(hip, pose.shoulderAt) : pose.torso;
  const shoulder = polar(hip, length.torso, torsoAngle);
  const head = polar(shoulder, length.neck, torsoAngle + (pose.headTilt ?? 0));

  const handTarget = pose.handRel ? add(shoulder, pose.handRel) : pose.hand;
  const farHandTarget = pose.farHandRel
    ? add(shoulder, pose.farHandRel)
    : (pose.farHand ?? add(handTarget, depth));
  const farFootTarget = pose.farFoot ?? add(pose.foot, depth);
  const farShoulder = add(shoulder, depth);
  const farHip = add(hip, depth);

  const elbowBend = pose.elbow ?? 1;
  const kneeBend = pose.knee ?? -1;
  const nearArm = solveLimb(shoulder, handTarget, length.upperArm, length.forearm, elbowBend, `${label} arm`);
  const farArm = solveLimb(
    farShoulder,
    farHandTarget,
    length.upperArm,
    length.forearm,
    pose.farElbow ?? elbowBend,
    `${label} far arm`,
  );
  const nearLeg = solveLimb(hip, pose.foot, length.thigh, length.shin, kneeBend, `${label} leg`);
  const farLeg = solveLimb(
    farHip,
    farFootTarget,
    length.thigh,
    length.shin,
    pose.farKnee ?? kneeBend,
    `${label} far leg`,
  );

  return {
    scale,
    length,
    hip,
    shoulder,
    head,
    farHip,
    farShoulder,
    elbow: nearArm.joint,
    hand: nearArm.end,
    farElbow: farArm.joint,
    farHand: farArm.end,
    knee: nearLeg.joint,
    ankle: nearLeg.end,
    farKnee: farLeg.joint,
    farAnkle: farLeg.end,
    toe: polar(nearLeg.end, length.foot, pose.toe ?? 0),
    farToe: polar(farLeg.end, length.foot, pose.farToe ?? pose.toe ?? 0),
  };
}

function interpolatePose(start, end, t) {
  const pose = {};
  for (const key of new Set([...Object.keys(start), ...Object.keys(end)])) {
    const a = start[key] ?? end[key];
    const b = end[key] ?? start[key];
    if (typeof a === 'number') pose[key] = lerp(a, b, t);
    else if (Array.isArray(a)) pose[key] = a.map((value, index) => lerp(value, b[index], t));
    else pose[key] = a;
  }
  return pose;
}

/** Collects primitives. Every frame must emit the same shapes in the same order. */
function canvas() {
  const items = [];
  const push = (tag, attrs) => items.push({ tag, attrs });
  return {
    items,
    line([x1, y1], [x2, y2], stroke, strokeWidth) {
      push('line', {
        x1, y1, x2, y2, stroke, 'stroke-width': strokeWidth, 'stroke-linecap': 'round',
      });
    },
    circle([cx, cy], r, fill, stroke, strokeWidth) {
      push('circle', {
        cx, cy, r, fill, ...(stroke ? { stroke, 'stroke-width': strokeWidth } : {}),
      });
    },
    rect(x, y, width, height, fill, rx = 3) {
      push('rect', { x, y, width, height, fill, rx });
    },
  };
}

function drawFigure(d, j) {
  const s = j.scale;
  d.line(j.farHip, j.farKnee, COLOR.farLimb, STROKE.thigh * s);
  d.line(j.farKnee, j.farAnkle, COLOR.farLimb, STROKE.shin * s);
  d.line(j.farAnkle, j.farToe, COLOR.farLimb, STROKE.foot * s);
  d.line(j.farShoulder, j.farElbow, COLOR.farLimb, STROKE.upperArm * s);
  d.line(j.farElbow, j.farHand, COLOR.farLimb, STROKE.forearm * s);
  d.line(j.hip, j.shoulder, COLOR.body, STROKE.torso * s);
  d.circle(j.head, j.length.headRadius, COLOR.body);
  d.line(j.hip, j.knee, COLOR.body, STROKE.thigh * s);
  d.line(j.knee, j.ankle, COLOR.body, STROKE.shin * s);
  d.line(j.ankle, j.toe, COLOR.body, STROKE.foot * s);
  d.line(j.shoulder, j.elbow, COLOR.body, STROKE.upperArm * s);
  d.line(j.elbow, j.hand, COLOR.body, STROKE.forearm * s);
}

// Equipment. `scenery` pieces stay still; everything else follows the joints.

const barbell = (d, [x, y], radius = 27) => {
  d.circle([x, y], radius, COLOR.iron);
  d.circle([x, y], radius * 0.62, COLOR.farLimb);
  d.circle([x, y], 4.5, COLOR.panel);
};

const dumbbell = (d, [x, y], vertical = false) => {
  const half = 15;
  const [a, b] = vertical
    ? [[x, y - half], [x, y + half]]
    : [[x - half, y], [x + half, y]];
  const cap = (point) =>
    vertical
      ? d.line([point[0] - 9, point[1]], [point[0] + 9, point[1]], COLOR.iron, 8)
      : d.line([point[0], point[1] - 9], [point[0], point[1] + 9], COLOR.iron, 8);
  d.line(a, b, COLOR.iron, 5);
  cap(a);
  cap(b);
};

const flatBench = (d, left, right, top) => {
  d.line([left + 26, top + 8], [left + 18, FLOOR], COLOR.frame, 7);
  d.line([right - 26, top + 8], [right - 18, FLOOR], COLOR.frame, 7);
  d.rect(left, top, right - left, 13, COLOR.pad, 6);
};

const inclineBench = (d, seat, backTop) => {
  d.line([seat[0] - 8, seat[1] + 6], [seat[0] - 26, FLOOR], COLOR.frame, 7);
  d.line([seat[0] + 40, seat[1] + 6], [seat[0] + 52, FLOOR], COLOR.frame, 7);
  d.line(lerpPoint(seat, backTop, 0.42), [seat[0] - 62, FLOOR], COLOR.frame, 6);
  d.line(seat, [seat[0] + 62, seat[1] - 2], COLOR.pad, 13);
  d.line(seat, backTop, COLOR.pad, 13);
};

const lerpPoint = ([ax, ay], [bx, by], t) => [lerp(ax, bx, t), lerp(ay, by, t)];

/** Weight stack whose top plates rise with `lift`. */
const weightStack = (d, x, lift, top = 90) => {
  const width = 46;
  d.line([x + 2, top - 26], [x + 2, FLOOR], COLOR.frame, 6);
  d.line([x + width - 2, top - 26], [x + width - 2, FLOOR], COLOR.frame, 6);
  for (let plate = 0; plate < 6; plate += 1) {
    d.rect(x + 7, FLOOR - 20 - plate * 15, width - 14, 12, COLOR.frame, 2);
  }
  for (let plate = 0; plate < 3; plate += 1) {
    d.rect(x + 7, FLOOR - 110 - plate * 15 - lift, width - 14, 12, COLOR.iron, 2);
  }
};

const seat = (d, x, top, width = 76) => {
  d.line([x + width / 2, top + 6], [x + width / 2, FLOOR], COLOR.frame, 9);
  d.line([x + width / 2 - 34, FLOOR - 2], [x + width / 2 + 34, FLOOR - 2], COLOR.frame, 8);
  d.rect(x, top, width, 13, COLOR.pad, 6);
};

const uprightPad = (d, x, top, bottom) => d.line([x, top], [x, bottom], COLOR.pad, 13);

const standing = (scale = 0.84) => ({ depth: [4 * scale, -3 * scale], scale });

/** Hip and torso for a rigid body running from an ankle to a shoulder. */
const plank = (foot, shoulder, scale) => {
  const legLength = (BODY.thigh + BODY.shin) * scale - 2;
  const direction = angleBetween(foot, shoulder);
  return { foot, hip: polar(foot, legLength, direction), shoulderAt: shoulder };
};

const benchPose = {
  hip: [268, 170], torso: 180, foot: [330, 246], depth: [0, -3], headTilt: 0,
};
const inclinePose = {
  hip: [244, 182], torso: -128, foot: [318, 246], depth: [4, -3], headTilt: 8,
};

const EXERCISES = {
  'barbell-bench-press': {
    scale: 0.95,
    start: { ...benchPose, hand: [200, 98] },
    end: { ...benchPose, hand: [214, 136] },
    scenery: (d) => flatBench(d, 112, 306, 184),
    front: (d, j) => barbell(d, j.hand),
    arrow: { joint: 'hand', offset: [52, 0], bend: 12 },
  },
  'barbell-incline-bench-press': {
    scale: 0.95,
    start: { ...inclinePose, hand: [216, 54] },
    end: { ...inclinePose, hand: [226, 100] },
    scenery: (d) => inclineBench(d, [222, 198], [146, 92]),
    front: (d, j) => barbell(d, j.hand),
    arrow: { joint: 'hand', offset: [50, 2], bend: 10 },
  },
  'dumbbell-flat-bench-press': {
    scale: 0.95,
    start: { ...benchPose, hand: [214, 136] },
    end: { ...benchPose, hand: [200, 98] },
    scenery: (d) => flatBench(d, 112, 306, 184),
    front: (d, j) => dumbbell(d, j.hand),
    arrow: { joint: 'hand', offset: [44, 0], bend: -12 },
  },
  'incline-dumbbell-press': {
    scale: 0.95,
    start: { ...inclinePose, hand: [226, 100] },
    end: { ...inclinePose, hand: [216, 54] },
    scenery: (d) => inclineBench(d, [222, 198], [146, 92]),
    front: (d, j) => dumbbell(d, j.hand),
    arrow: { joint: 'hand', offset: [46, 2], bend: -10 },
  },
  'chest-press-machine': {
    scale: 0.88,
    start: { hip: [176, 178], torso: -90, foot: [238, 246], hand: [204, 122], depth: [3, -3] },
    end: { hip: [176, 178], torso: -90, foot: [238, 246], hand: [242, 120], depth: [3, -3] },
    scenery: (d) => {
      seat(d, 130, 188);
      uprightPad(d, 140, 96, 182);
    },
    moving: (d, j, t) => {
      weightStack(d, 378, t * 34);
      d.line([330, 62], [402, 62], COLOR.frame, 7);
      d.line([330, 62], [330, FLOOR], COLOR.frame, 8);
      d.line([330, 70], j.hand, COLOR.frame, 7);
    },
    front: (d, j) => d.circle(j.hand, 7, COLOR.iron),
    arrow: { joint: 'hand', offset: [4, 34], bend: 8 },
  },
  'push-up': {
    scale: 0.92,
    start: {
      ...plank([160, 240], [308.6, 176], 0.92),
      hand: [320, 246], toe: -66, depth: [0, -3], headTilt: 6,
    },
    end: {
      ...plank([160, 240], [320, 216], 0.92),
      hand: [320, 246], toe: -66, depth: [0, -3], headTilt: 6,
    },
    arrow: { joint: 'shoulder', offset: [-34, -46], bend: -10 },
  },
  'incline-push-up': {
    scale: 0.9,
    start: {
      ...plank([160, 240], [275.6, 132], 0.9),
      hand: [290, 200], toe: -58, depth: [0, -3], headTilt: 6,
    },
    end: {
      ...plank([160, 240], [304.7, 176], 0.9),
      hand: [290, 200], toe: -58, depth: [0, -3], headTilt: 6,
    },
    scenery: (d) => flatBench(d, 268, 410, 208),
    arrow: { joint: 'shoulder', offset: [36, -34], bend: -10 },
  },
  'seated-dumbbell-shoulder-press': {
    scale: 0.84,
    start: {
      hip: [214, 180], torso: -94, foot: [272, 246], handRel: [20, -30], depth: [3, -3],
    },
    end: {
      hip: [214, 180], torso: -94, foot: [272, 246], handRel: [10, -62], depth: [3, -3],
    },
    scenery: (d) => {
      seat(d, 172, 190);
      uprightPad(d, 182, 96, 184);
    },
    front: (d, j) => dumbbell(d, j.hand),
    arrow: { joint: 'hand', offset: [44, 4], bend: -8 },
  },
  'machine-shoulder-press': {
    scale: 0.84,
    start: {
      hip: [190, 180], torso: -92, foot: [248, 246], handRel: [22, -24], depth: [3, -3],
    },
    end: {
      hip: [190, 180], torso: -92, foot: [248, 246], handRel: [12, -62], depth: [3, -3],
    },
    scenery: (d) => {
      seat(d, 148, 190);
      uprightPad(d, 158, 96, 184);
    },
    moving: (d, j, t) => {
      weightStack(d, 378, t * 34);
      d.line([110, 30], [402, 30], COLOR.frame, 7);
      d.line([110, 30], [110, FLOOR], COLOR.frame, 8);
      d.line([110, 96], j.hand, COLOR.frame, 7);
    },
    front: (d, j) => d.circle(j.hand, 7, COLOR.iron),
    arrow: { joint: 'hand', offset: [46, 4], bend: -8 },
  },
  'barbell-overhead-press': {
    ...standing(),
    start: {
      hip: [232, 158], torso: -90, foot: [236, 246], handRel: [18, 2], depth: [3, -3],
    },
    end: {
      hip: [232, 158], torso: -90, foot: [236, 246], handRel: [4, -62], depth: [3, -3],
    },
    front: (d, j) => barbell(d, j.hand, 24),
    arrow: { joint: 'hand', offset: [50, 0], bend: -10 },
  },
  'lat-pulldown': {
    scale: 0.84,
    start: {
      hip: [212, 190], torso: -98, foot: [280, 246], hand: [216, 66], depth: [3, -3],
    },
    end: {
      hip: [212, 190], torso: -98, foot: [280, 246], hand: [236, 138], depth: [3, -3],
    },
    scenery: (d) => {
      seat(d, 172, 200);
      d.line([236, 160], [276, 160], COLOR.pad, 13);
      d.line([276, 160], [316, 160], COLOR.frame, 7);
      d.line([316, 160], [316, FLOOR], COLOR.frame, 8);
    },
    moving: (d, j, t) => {
      weightStack(d, 378, t * 44);
      d.line([226, 30], [402, 30], COLOR.frame, 7);
      d.circle([226, 30], 8, COLOR.iron);
      d.line([226, 30], j.hand, COLOR.cable, 3);
    },
    front: (d, j) => d.line(add(j.hand, [-20, -2]), add(j.hand, [20, -2]), COLOR.iron, 7),
    arrow: { joint: 'hand', offset: [50, 2], bend: -10 },
  },
  'seated-cable-row': {
    scale: 0.84,
    start: {
      hip: [150, 206], torso: -66, foot: [232, 222], hand: [238, 168], toe: -80, depth: [3, -3],
    },
    end: {
      hip: [150, 206], torso: -94, foot: [232, 222], hand: [186, 178], toe: -80, depth: [3, -3],
    },
    scenery: (d) => {
      d.line([110, 224], [200, 224], COLOR.pad, 13);
      d.line([118, 230], [118, FLOOR], COLOR.frame, 7);
      d.line([192, 230], [192, FLOOR], COLOR.frame, 7);
      d.line([248, 196], [248, FLOOR], COLOR.iron, 8);
      d.line([248, FLOOR - 2], [372, FLOOR - 2], COLOR.frame, 8);
    },
    moving: (d, j, t) => {
      weightStack(d, 378, t * 40);
      d.circle([366, 186], 8, COLOR.iron);
      d.line([366, 186], j.hand, COLOR.cable, 3);
    },
    front: (d, j) => d.circle(j.hand, 7, COLOR.iron),
    arrow: { joint: 'hand', offset: [20, -52], bend: -10 },
  },
  'one-arm-dumbbell-row': {
    scale: 0.9,
    start: {
      hip: [176, 154], torso: -6, foot: [156, 246], hand: [246, 214],
      farHand: [268, 200], farFoot: [142, 204], depth: [0, 0], farKnee: -1, toe: 0, farToe: 180,
    },
    end: {
      hip: [176, 154], torso: -6, foot: [156, 246], hand: [204, 168],
      farHand: [268, 200], farFoot: [142, 204], depth: [0, 0], farKnee: -1, toe: 0, farToe: 180,
    },
    scenery: (d) => flatBench(d, 130, 300, 208),
    front: (d, j) => dumbbell(d, j.hand),
    arrow: { joint: 'hand', offset: [-58, 8], bend: -8 },
  },
  'machine-row': {
    scale: 0.88,
    start: {
      hip: [176, 178], torso: -82, foot: [240, 246], hand: [250, 126], depth: [3, -3],
    },
    end: {
      hip: [176, 178], torso: -82, foot: [240, 246], hand: [214, 130], depth: [3, -3],
    },
    scenery: (d) => {
      seat(d, 138, 188);
      d.line([212, 92], [212, 146], COLOR.pad, 13);
      d.line([212, 146], [330, 196], COLOR.frame, 7);
    },
    moving: (d, j, t) => {
      weightStack(d, 378, t * 34);
      d.line([330, 56], [402, 56], COLOR.frame, 7);
      d.line([330, 56], [330, FLOOR], COLOR.frame, 8);
      d.line([330, 74], j.hand, COLOR.frame, 7);
    },
    front: (d, j) => d.circle(j.hand, 7, COLOR.iron),
    arrow: { joint: 'hand', offset: [20, -36], bend: 8 },
  },
  'inverted-row': {
    scale: 0.92,
    start: {
      ...plank([150, 246], [301.8, 190], 0.92),
      hand: [304, 118], toe: -62, depth: [0, -3], headTilt: 0,
    },
    end: {
      ...plank([150, 246], [280, 150], 0.92),
      hand: [304, 118], toe: -62, depth: [0, -3], headTilt: 0,
    },
    scenery: (d) => {
      d.line([390, 40], [390, FLOOR], COLOR.frame, 9);
      d.line([304, 118], [390, 118], COLOR.frame, 7);
      d.circle([304, 118], 8, COLOR.iron);
    },
    arrow: { joint: 'shoulder', offset: [52, 18], bend: -8 },
  },
  'pull-up': {
    scale: 0.8,
    start: {
      hip: [232, 158], torso: -90, foot: [238, 243], hand: [240, 40], depth: [3, -3],
    },
    end: {
      hip: [232, 104], torso: -92, foot: [212, 186], hand: [240, 40], depth: [3, -3],
    },
    scenery: (d) => {
      d.line([120, 40], [360, 40], COLOR.iron, 8);
      d.line([120, 40], [120, FLOOR], COLOR.frame, 9);
      d.line([360, 40], [360, FLOOR], COLOR.frame, 9);
    },
    arrow: { joint: 'hip', offset: [62, 0], bend: -10 },
  },
  'barbell-back-squat': {
    ...standing(),
    start: {
      hip: [226, 158], torso: -86, foot: [240, 246], handRel: [4, 34], farHandRel: [8, 30],
      depth: [3, -3], elbow: 1, headTilt: 6,
    },
    end: {
      hip: [186, 196], torso: -50, foot: [240, 246], handRel: [4, 34], farHandRel: [8, 30],
      depth: [3, -3], elbow: 1, headTilt: 26,
    },
    front: (d, j) => barbell(d, add(j.shoulder, [-4, -6]), 26),
    arrow: { joint: 'hip', offset: [-58, -2], bend: 10 },
  },
  'goblet-squat': {
    ...standing(),
    start: {
      hip: [226, 158], torso: -88, foot: [240, 246], handRel: [24, 22], depth: [3, -3],
      headTilt: 4,
    },
    end: {
      hip: [194, 200], torso: -66, foot: [240, 246], handRel: [24, 22], depth: [3, -3],
      headTilt: 14,
    },
    front: (d, j) => dumbbell(d, add(j.hand, [8, -6]), true),
    arrow: { joint: 'hip', offset: [-52, -2], bend: 10 },
  },
  'leg-press': {
    scale: 0.9,
    start: {
      hip: [168, 206], torso: -146, foot: [246, 152], toe: -62, depth: [3, -3],
      handRel: [34, 42], headTilt: 22,
    },
    end: {
      hip: [168, 206], torso: -146, foot: [214, 176], toe: -62, depth: [3, -3],
      handRel: [34, 42], headTilt: 22,
    },
    scenery: (d) => {
      d.line([80, 156], [150, 226], COLOR.pad, 13);
      d.line([150, 226], [214, 226], COLOR.pad, 13);
      d.line([100, 200], [90, FLOOR], COLOR.frame, 7);
      d.line([190, 232], [190, FLOOR], COLOR.frame, 7);
      d.line([210, 226], [386, 96], COLOR.frame, 8);
      d.line([386, 96], [392, FLOOR], COLOR.frame, 8);
    },
    moving: (d, j) => {
      const [x, y] = add(j.ankle, [10, 6]);
      d.line([x - 22, y - 36], [x + 26, y + 34], COLOR.iron, 10);
    },
    arrow: { joint: 'ankle', offset: [34, -46], bend: -8 },
  },
  'box-squat': {
    ...standing(),
    start: {
      hip: [226, 158], torso: -88, foot: [240, 246], handRel: [62, 6], depth: [3, -3],
      headTilt: 4,
    },
    end: {
      hip: [186, 192], torso: -62, foot: [240, 246], handRel: [64, 4], depth: [3, -3],
      headTilt: 18,
    },
    scenery: (d) => d.rect(110, 206, 92, 52, COLOR.pad, 6),
    arrow: { joint: 'hip', offset: [-66, -48], bend: 10 },
  },
  'dumbbell-split-squat': {
    ...standing(),
    start: {
      hip: [226, 168], torso: -90, foot: [270, 246], farFoot: [178, 240], toe: 0, farToe: 40,
      handRel: [5, 62], depth: [0, 0], headTilt: 0,
    },
    end: {
      hip: [224, 200], torso: -90, foot: [270, 246], farFoot: [178, 240], toe: 0, farToe: 40,
      handRel: [5, 62], depth: [0, 0], headTilt: 0,
    },
    front: (d, j) => dumbbell(d, j.hand),
    arrow: { joint: 'shoulder', offset: [62, 2], bend: -8 },
  },
  'barbell-romanian-deadlift': {
    ...standing(),
    start: {
      hip: [228, 158], torso: -86, foot: [240, 246], handRel: [8, 64], depth: [3, -3],
      headTilt: 4,
    },
    end: {
      hip: [202, 168], torso: -14, foot: [240, 246], handRel: [-10, 64], depth: [3, -3],
      headTilt: 10,
    },
    front: (d, j) => barbell(d, j.hand, 24),
    arrow: { joint: 'shoulder', offset: [34, -44], bend: -14 },
  },
  'dumbbell-romanian-deadlift': {
    ...standing(),
    start: {
      hip: [228, 158], torso: -86, foot: [240, 246], handRel: [8, 64], depth: [3, -3],
      headTilt: 4,
    },
    end: {
      hip: [202, 168], torso: -14, foot: [240, 246], handRel: [-10, 64], depth: [3, -3],
      headTilt: 10,
    },
    front: (d, j) => dumbbell(d, j.hand),
    arrow: { joint: 'shoulder', offset: [34, -44], bend: -14 },
  },
  'seated-leg-curl': {
    scale: 0.88,
    start: {
      hip: [178, 176], torso: -96, foot: [270, 172], toe: -70, depth: [3, -3], handRel: [32, 56],
    },
    end: {
      hip: [178, 176], torso: -96, foot: [214, 220], toe: 40, depth: [3, -3], handRel: [32, 56],
    },
    scenery: (d) => {
      seat(d, 140, 188, 90);
      uprightPad(d, 148, 100, 182);
      d.line([208, 150], [240, 150], COLOR.pad, 13);
    },
    moving: (d, j, t) => {
      weightStack(d, 378, t * 34);
      d.circle(add(j.ankle, [8, 8]), 10, COLOR.pad);
    },
    arrow: { joint: 'ankle', offset: [46, 10], bend: 16 },
  },
  'glute-bridge': {
    scale: 0.95,
    start: {
      hip: [236, 238], shoulderAt: [166, 240], foot: [312, 246], hand: [232, 250], knee: -1,
      depth: [0, -3], headTilt: 0, elbow: -1,
    },
    end: {
      hip: [230, 186], shoulderAt: [166, 238], foot: [312, 246], hand: [232, 250], knee: -1,
      depth: [0, -3], headTilt: 8, elbow: -1,
    },
    arrow: { joint: 'hip', offset: [-40, -34], bend: -8 },
  },
  'cable-pull-through': {
    ...standing(),
    start: {
      hip: [246, 158], torso: -86, foot: [258, 246], handRel: [8, 62], depth: [3, -3],
      headTilt: 4,
    },
    end: {
      hip: [220, 168], torso: -16, foot: [258, 246], handRel: [-24, 57], depth: [3, -3],
      headTilt: 10,
    },
    moving: (d, j, t) => {
      weightStack(d, 40, t * 30);
      d.circle([104, 240], 8, COLOR.iron);
      d.line([104, 240], j.hand, COLOR.cable, 3);
    },
    front: (d, j) => d.circle(j.hand, 6, COLOR.iron),
    arrow: { joint: 'hip', offset: [-26, -62], bend: 10 },
  },
  'dead-bug': {
    scale: 0.95,
    start: {
      hip: [254, 238], torso: 180, foot: [312, 182], hand: [182, 164],
      farFoot: [312, 182], farHand: [182, 164], knee: -1, farKnee: -1, toe: 0, farToe: 0,
      depth: [0, -3], elbow: 1, headTilt: 0,
    },
    end: {
      hip: [254, 238], torso: 180, foot: [354, 226], hand: [110, 226],
      farFoot: [312, 182], farHand: [182, 164], knee: -1, farKnee: -1, toe: -60, farToe: 0,
      depth: [0, -3], elbow: 1, headTilt: 0,
    },
    arrow: { joint: 'hand', offset: [-12, -30], bend: 12 },
  },
  'bird-dog': {
    scale: 0.92,
    start: {
      hip: [176, 178], torso: 0, foot: [116, 248], hand: [248, 246], toe: 180, knee: -1,
      farFoot: [116, 248], farHand: [248, 246], farKnee: -1, farToe: 180, depth: [0, -3],
      headTilt: -8,
    },
    end: {
      hip: [176, 178], torso: 0, foot: [84, 170], hand: [312, 170], toe: 180, knee: -1,
      farFoot: [116, 248], farHand: [248, 246], farKnee: -1, farToe: 180, depth: [0, -3],
      headTilt: -8,
    },
    arrow: { joint: 'hand', offset: [34, -22], bend: -12 },
  },
  'pallof-press': {
    ...standing(),
    start: {
      hip: [232, 158], torso: -90, foot: [238, 246], handRel: [24, 16], depth: [3, -3],
    },
    end: {
      hip: [232, 158], torso: -90, foot: [238, 246], handRel: [64, 12], depth: [3, -3],
    },
    scenery: (d) => {
      d.line([128, 40], [128, FLOOR], COLOR.frame, 12);
      d.line([100, FLOOR - 2], [156, FLOOR - 2], COLOR.frame, 8);
      d.circle([128, 112], 8, COLOR.iron);
    },
    moving: (d, j) => d.line([128, 112], j.hand, COLOR.cable, 3),
    front: (d, j) => d.circle(j.hand, 7, COLOR.iron),
    arrow: { joint: 'hand', offset: [0, -34], bend: -8 },
  },
  'hanging-knee-raise': {
    scale: 0.8,
    start: {
      hip: [236, 160], torso: -90, foot: [242, 245], hand: [240, 40], depth: [3, -3],
    },
    end: {
      hip: [236, 158], torso: -92, foot: [292, 172], hand: [240, 40], depth: [3, -3], toe: 30,
    },
    scenery: (d) => {
      d.line([120, 40], [360, 40], COLOR.iron, 8);
      d.line([120, 40], [120, FLOOR], COLOR.frame, 9);
      d.line([360, 40], [360, FLOOR], COLOR.frame, 9);
    },
    arrow: { joint: 'ankle', offset: [34, 16], bend: -16 },
  },
};

function renderFrame(spec, slug, t) {
  const joints = solvePose(interpolatePose(spec.start, spec.end, t), spec.scale, slug);
  const d = canvas();
  spec.moving?.(d, joints, t);
  drawFigure(d, joints);
  spec.front?.(d, joints);
  return { joints, items: d.items };
}

const formatPoint = (value) => (typeof value === 'number' ? round(value) : value);

function attributes(attrs) {
  return Object.entries(attrs)
    .map(([key, value]) => `${key}="${formatPoint(value)}"`)
    .join(' ');
}

const element = ({ tag, attrs }) => `<${tag} ${attributes(attrs)}/>`;

function sceneryMarkup(spec) {
  const d = canvas();
  d.line([34, FLOOR + 3], [WIDTH - 34, FLOOR + 3], COLOR.floor, 6);
  spec.scenery?.(d);
  return d.items.map(element).join('');
}

function arrowMarkup(spec, slug) {
  const { joint, offset, bend } = spec.arrow;
  const from = add(renderFrame(spec, slug, 0).joints[joint], offset);
  const to = add(renderFrame(spec, slug, 1).joints[joint], offset);
  const middle = lerpPoint(from, to, 0.5);
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  const normal = [-(to[1] - from[1]) / distance, (to[0] - from[0]) / distance];
  const control = add(middle, [normal[0] * bend, normal[1] * bend]);
  const heading = angleBetween(control, to);
  const left = polar(to, 13, heading + 152);
  const right = polar(to, 13, heading - 152);
  const point = ([x, y]) => `${round(x)} ${round(y)}`;
  return (
    `<path d="M${point(from)}Q${point(control)} ${point(to)}" fill="none" stroke="${COLOR.accent}" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M${point(left)}L${point(to)}L${point(right)}" fill="none" stroke="${COLOR.accent}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

const document = (title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img"><title>${title}</title>` +
  `<rect width="${WIDTH}" height="${HEIGHT}" rx="20" fill="${COLOR.panel}"/>${body}</svg>\n`;

function renderStatic(spec, slug, title) {
  const ghost = renderFrame(spec, slug, 0).items.map(element).join('');
  const solid = renderFrame(spec, slug, 1).items.map(element).join('');
  return document(
    title,
    `${sceneryMarkup(spec)}<g opacity=".24">${ghost}</g>${solid}${arrowMarkup(spec, slug)}`,
  );
}

function renderMotion(spec, slug, title) {
  // A cosine ramp gives ease-in-out at both ends of the rep without keySplines.
  const times = Array.from(
    { length: FRAME_COUNT + 1 },
    (_, index) => (1 - Math.cos((2 * Math.PI * index) / FRAME_COUNT)) / 2,
  );
  const frames = times.map((t) => renderFrame(spec, slug, t).items);

  const shapes = frames[0].map(({ tag, attrs }, index) => {
    const fixed = {};
    const animated = [];

    for (const [name, value] of Object.entries(attrs)) {
      const values = frames.map((frame) => formatPoint(frame[index].attrs[name]));
      if (new Set(values).size === 1) fixed[name] = value;
      else {
        animated.push(
          `<animate attributeName="${name}" dur="${LOOP_SECONDS}s" repeatCount="indefinite" values="${values.join(';')}"/>`,
        );
      }
    }

    return animated.length === 0
      ? element({ tag, attrs: fixed })
      : `<${tag} ${attributes(fixed)}>${animated.join('')}</${tag}>`;
  });

  return document(title, `${sceneryMarkup(spec)}${shapes.join('')}`);
}

const titleCase = (slug) =>
  slug
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const [slug, spec] of Object.entries(EXERCISES)) {
  const title = titleCase(slug);
  writeFileSync(join(OUTPUT_DIR, `${slug}.svg`), renderStatic(spec, slug, title));
  writeFileSync(join(OUTPUT_DIR, `${slug}-motion.svg`), renderMotion(spec, slug, title));
}

if (reachWarnings.size > 0) {
  const lines = [...reachWarnings].map(([label, shortfall]) => `${label}: ${shortfall}px`);
  console.warn(`Poses out of reach:\n  ${lines.join('\n  ')}`);
}
console.log(`Wrote ${Object.keys(EXERCISES).length * 2} diagrams to ${OUTPUT_DIR}`);
