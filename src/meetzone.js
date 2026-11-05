// "Phòng họp ảo" building south of the pagoda, at the end of the main road. Every virtual meeting room is an instance of
// this one interior: players in the same room see each other, everyone else is hidden (see main.js).
export const MEET = { cx: 0, cz: 82, hw: 16, hd: 12, H: 7 };
export const inMeet = (x, z) => Math.abs(x - MEET.cx) < MEET.hw && Math.abs(z - MEET.cz) < MEET.hd;
/** Just outside the north door, where people appear when they leave a meeting. */
export const MEET_EXIT = { x: MEET.cx, z: MEET.cz - MEET.hd - 3 };

export const SEAT_COUNT = 20;
const SIDE_X = [-0.9, 0.9, -2.7, 2.7, -4.5, 4.5, -6.3, 6.3];
export const TABLE = { hl: 8.5, hw: 1.8 }; // half length (x) and half width (z)

/** Chair i in world coordinates and the yaw a person sitting on it faces. Sides first (centre-out), then the table ends. */
export function seatPos(i) {
  const { cx, cz } = MEET;
  if (i < 16) {
    const north = i % 2 === 0;
    return { x: cx + SIDE_X[i >> 1], z: cz + (north ? -2.75 : 2.75), yaw: north ? 0 : Math.PI };
  }
  const west = i < 18, k = i % 2 ? 0.9 : -0.9;
  return { x: cx + (west ? -9.3 : 9.3), z: cz + k, yaw: west ? Math.PI / 2 : -Math.PI / 2 };
}
