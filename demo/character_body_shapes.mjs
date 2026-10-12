// Adult cartoon body proportions. These dimensions describe builds, not age/personality.
export const bodyShapes = [
  { id: 'slim', name: 'Slim', shoulder: 48, ribcage: 43, waist: 33, hip: 48, arm: 10, ankle: 14 },
  { id: 'average', name: 'Average', shoulder: 55, ribcage: 51, waist: 43, hip: 57, arm: 13, ankle: 17 },
  { id: 'softly-curvy', name: 'Softly curvy', shoulder: 55, ribcage: 58, waist: 40, hip: 69, arm: 14, ankle: 18 },
  { id: 'fuller', name: 'Fuller', shoulder: 64, ribcage: 70, waist: 62, hip: 78, arm: 18, ankle: 22 },
];

// One connected skeleton and shared vertical landmarks for all four builds.
export function bodyLandmarks(shape, cx = 180) {
  const { shoulder, waist, hip, ankle } = shape;
  return {
    neck: [cx, 276], chest: [cx, 338], waist: [cx, 420], pelvis: [cx, 490],
    leftShoulder: [cx - shoulder, 294], rightShoulder: [cx + shoulder, 294],
    leftElbow: [cx - hip - 24, 388], rightElbow: [cx + hip + 24, 388],
    leftWrist: [cx - hip - 12, 476], rightWrist: [cx + hip + 12, 476],
    leftHip: [cx - hip * .43, 498], rightHip: [cx + hip * .43, 498],
    leftKnee: [cx - hip * .43 - 7, 654], rightKnee: [cx + hip * .43 + 7, 654],
    leftAnkle: [cx - hip * .43 - 8, 787], rightAnkle: [cx + hip * .43 + 8, 787],
    waistbandY: 462, crotchY: 545, topHemY: 474, legHemY: 800,
    shoulder, waistHalfWidth: waist, hipHalfWidth: hip, ankleHalfWidth: ankle,
  };
}
