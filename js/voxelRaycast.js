export function voxelRaycast(cm, origin, direction, maxDistance) {
  const bs = cm.blockSize || 1;

  const dx = direction.x;
  const dy = direction.y;
  const dz = direction.z;
  const dirLen = Math.hypot(dx, dy, dz);
  if (dirLen <= 1e-9) return null;

  const invLen = 1 / dirLen;
  const ndx = dx * invLen;
  const ndy = dy * invLen;
  const ndz = dz * invLen;

  let gx = Math.floor(origin.x / bs);
  let gy = Math.floor(origin.y / bs);
  let gz = Math.floor(origin.z / bs);

  const stepX = ndx > 0 ? 1 : ndx < 0 ? -1 : 0;
  const stepY = ndy > 0 ? 1 : ndy < 0 ? -1 : 0;
  const stepZ = ndz > 0 ? 1 : ndz < 0 ? -1 : 0;

  const inf = Number.POSITIVE_INFINITY;
  const tDeltaX = stepX === 0 ? inf : Math.abs(bs / ndx);
  const tDeltaY = stepY === 0 ? inf : Math.abs(bs / ndy);
  const tDeltaZ = stepZ === 0 ? inf : Math.abs(bs / ndz);

  const nextBoundaryX = stepX > 0 ? (gx + 1) * bs : gx * bs;
  const nextBoundaryY = stepY > 0 ? (gy + 1) * bs : gy * bs;
  const nextBoundaryZ = stepZ > 0 ? (gz + 1) * bs : gz * bs;

  let tMaxX = stepX === 0 ? inf : (nextBoundaryX - origin.x) / ndx;
  let tMaxY = stepY === 0 ? inf : (nextBoundaryY - origin.y) / ndy;
  let tMaxZ = stepZ === 0 ? inf : (nextBoundaryZ - origin.z) / ndz;

  if (tMaxX < 0) tMaxX = 0;
  if (tMaxY < 0) tMaxY = 0;
  if (tMaxZ < 0) tMaxZ = 0;

  let t = 0;
  let prevGx = gx;
  let prevGy = gy;
  let prevGz = gz;
  let face = { x: 0, y: 0, z: 0 };

  while (t <= maxDistance) {
    const worldX = (gx + 0.5) * bs;
    const worldY = (gy + 0.5) * bs;
    const worldZ = (gz + 0.5) * bs;
    const bid = cm.getBlockAtWorld(worldX, worldY, worldZ);
    if (bid !== 0) {
      return {bx: gx, by: gy, bz: gz, bid, face,
        prev: { x: prevGx, y: prevGy, z: prevGz },
        hitPos: {x: origin.x + ndx * t, y: origin.y + ndy * t, z: origin.z + ndz * t,},
      };
    }

    const nextT = Math.min(tMaxX, tMaxY, tMaxZ);
    if (nextT > maxDistance) break;

    prevGx = gx;
    prevGy = gy;
    prevGz = gz;
    t = nextT;

    const stepFace = { x: 0, y: 0, z: 0 };
    let hitAxes = 0;

    if (tMaxX === nextT) {gx += stepX; tMaxX += tDeltaX; stepFace.x = -stepX; hitAxes++;}
    if (tMaxY === nextT) {gy += stepY; tMaxY += tDeltaY; stepFace.y = -stepY; hitAxes++;}
    if (tMaxZ === nextT) {gz += stepZ; tMaxZ += tDeltaZ; stepFace.z = -stepZ; hitAxes++;}
    face = hitAxes === 1 ? stepFace : { x: 0, y: 0, z: 0 };
  }

  return null;
}