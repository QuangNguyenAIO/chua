// "Thế giới chó" district west of the pagoda. Walking into this rectangle turns a visitor into a dog.
export const DOG = { cx: -72, cz: 22, hw: 24, hd: 28 };
export const inDogZone = (x, z) => Math.abs(x - DOG.cx) < DOG.hw && Math.abs(z - DOG.cz) < DOG.hd;
/** District-local -> world coordinates. */
export const DW = (lx, lz) => [DOG.cx + lx, DOG.cz + lz];
