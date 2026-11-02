// RGBA 픽셀 -> 선(잉크) 마스크. 투명 배경은 흰색으로 취급한다.
export function luminanceMask(rgba, width, height, threshold, invert) {
  const mask = new Uint8Array(width * height);
  for (let p = 0; p < mask.length; p++) {
    const a = rgba[p * 4 + 3] / 255;
    const r = rgba[p * 4] * a + 255 * (1 - a);
    const g = rgba[p * 4 + 1] * a + 255 * (1 - a);
    const b = rgba[p * 4 + 2] * a + 255 * (1 - a);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const isInk = lum < threshold;
    mask[p] = (invert ? !isInk : isInk) ? 1 : 0;
  }
  return mask;
}

const FAR = 1e20;

// 1차원 제곱 유클리드 거리 변환 (Felzenszwalb & Huttenlocher)
function distance1d(f, n, out, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    out[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

// 마스크를 반지름(칸 단위)만큼 둥글게 부풀려 선을 굵게 만든다. 반지름이 커도 빠르다.
export function dilateMask(mask, width, height, radius) {
  if (radius <= 0) return mask;
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const grid = new Float64Array(width * height);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = mask[y * width + x] ? 0 : FAR;
    distance1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }
  const out = new Uint8Array(mask.length);
  const limit = radius * radius + 0.5;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x];
    distance1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) out[y * width + x] = d[x] <= limit ? 1 : 0;
  }
  return out;
}

// 선이 모서리끼리만 닿는 곳(대각선 체크무늬)은 한 모서리에 면 4개가 몰려 3D 프린터 슬라이서가 싫어한다.
// 그런 곳의 빈 칸 하나를 메워서 선을 안전하게 이어 붙인다.
export function fixCornerTouches(mask, width, height) {
  const out = Uint8Array.from(mask);
  for (let pass = 0; pass < 50; pass++) {
    let changed = false;
    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const a = y * width + x;
        const b = a + 1;
        const c = a + width;
        const d = c + 1;
        if (out[a] && out[d] && !out[b] && !out[c]) {
          out[b] = 1;
          changed = true;
        } else if (out[b] && out[c] && !out[a] && !out[d]) {
          out[a] = 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return out;
}

// 마스크를 높이맵 기둥(칸마다 상자)으로 세워 STL 삼각형 목록(Float32 xyz*3)을 만든다.
// 칸 단위 그대로 면을 만들기 때문에 이웃 면의 꼭짓점이 항상 맞물려 닫힌 메쉬가 된다.
export function maskToTriangles(mask, width, height, opts) {
  const { sizeMm, lineHeight, plate, plateThickness } = opts;
  const cell = sizeMm / Math.max(width, height);
  const heights = new Float32Array(width * height);
  for (let p = 0; p < heights.length; p++) {
    heights[p] = (plate ? plateThickness : 0) + (mask[p] ? lineHeight : 0);
  }
  const hAt = (i, j) => (i < 0 || i >= width || j < 0 || j >= height ? 0 : heights[j * width + i]);

  const t = [];
  const tri = (a, b, c) => t.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  const quad = (a, b, c, d) => {
    tri(a, b, c);
    tri(a, c, d);
  };

  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const h = heights[j * width + i];
      if (h <= 0) continue;
      const x0 = i * cell;
      const x1 = x0 + cell;
      const y1 = (height - j) * cell;
      const y0 = y1 - cell;

      quad([x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]);
      quad([x0, y0, 0], [x0, y1, 0], [x1, y1, 0], [x1, y0, 0]);

      // 이미지 가장자리의 바깥쪽 옆면(0~높이)은 바닥판 높이에서 쪼개야 이웃 칸의 옆면과 모서리가 맞는다.
      const sides = (lo, hi, emit) => {
        const cuts = plate && lo < plateThickness && plateThickness < hi ? [lo, plateThickness, hi] : [lo, hi];
        for (let k = 0; k < cuts.length - 1; k++) emit(cuts[k], cuts[k + 1]);
      };
      const he = hAt(i + 1, j);
      if (h > he) sides(he, h, (a, b) => quad([x1, y0, a], [x1, y1, a], [x1, y1, b], [x1, y0, b]));
      const hw = hAt(i - 1, j);
      if (h > hw) sides(hw, h, (a, b) => quad([x0, y0, a], [x0, y0, b], [x0, y1, b], [x0, y1, a]));
      const hn = hAt(i, j - 1);
      if (h > hn) sides(hn, h, (a, b) => quad([x1, y1, a], [x0, y1, a], [x0, y1, b], [x1, y1, b]));
      const hs = hAt(i, j + 1);
      if (h > hs) sides(hs, h, (a, b) => quad([x0, y0, a], [x1, y0, a], [x1, y0, b], [x0, y0, b]));
    }
  }
  return t;
}

export function trianglesToBinaryStl(t) {
  const count = t.length / 9;
  const buffer = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buffer);
  view.setUint32(80, count, true);
  let off = 84;
  for (let n = 0; n < count; n++) {
    const b = n * 9;
    const ux = t[b + 3] - t[b];
    const uy = t[b + 4] - t[b + 1];
    const uz = t[b + 5] - t[b + 2];
    const vx = t[b + 6] - t[b];
    const vy = t[b + 7] - t[b + 1];
    const vz = t[b + 8] - t[b + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    view.setFloat32(off, nx, true);
    view.setFloat32(off + 4, ny, true);
    view.setFloat32(off + 8, nz, true);
    for (let k = 0; k < 9; k++) view.setFloat32(off + 12 + k * 4, t[b + k], true);
    off += 50;
  }
  return buffer;
}
