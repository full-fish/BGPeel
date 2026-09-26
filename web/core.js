// remove_bh.py의 remove_bg()를 그대로 옮긴 것. 브라우저 워커와 Node에서 같이 쓴다.
// data: RGBA Uint8ClampedArray(알파는 무시), cfg: 아래 removeBg 위쪽 주석 참고.
// 반환: {out: RGBA Uint8ClampedArray, key: [r,g,b], mode} 또는 {skip: 사유 코드}
// 사유 코드: no_key(지정한 배경색이 테두리에 없음) no_bg(테두리에 뚜렷한 배경색 없음) dark_bg(자동인데 검은 배경) not_vivid(chroma인데 탁한 배경)

const DEFAULT_CFG = {
  key: null, // 지울 배경색. null이면 이미지마다 테두리에서 가장 많이 나오는 색을 자동 감지
  mode: "auto", // "auto": 배경색이 쨍하면 chroma, 탁하면 distance / "chroma": 쨍한 단색 배경 / "distance": 탁한·연한 단색 배경
  distTol: 160, // distance 전용
  lo: 0.12,
  hi: 0.5,
  edgePx: 4,
  tintTol: 40,
  removeGlow: true, // chroma 전용
  glowHue: [-85, 30], // chroma 전용. 배경색 색상 기준 범위(도)
  glowMinSat: 0.3, // chroma 전용
  dark: 80, // chroma 전용
  repair: true, // chroma 전용: 배경 근처에서 배경색이 반쯤 물든 모래·주황·노랑 픽셀을 주변 물체색 기준으로 다시 계산
  repairPx: 40, // 주변 물체색을 찾는 거리이자 '배경 근처'로 보는 거리(px)
};

// has(1인 픽셀)를 4방향으로 steps번 넓힌다. val(n*3)이 있으면 가장 가까운 픽셀 값도 옮긴다.
// 각 단계는 이전 단계까지 정해진 픽셀만 보고, 여러 이웃이 있으면 좌·우·상·하 순서 (remove_bh.py spread와 같은 결과)
function spread(has, val, steps, w, h) {
  const n = w * h;
  const stamp = new Int32Array(n).fill(-1); // 정해진 단계, -1 = 아직, -2 = 이번 단계 후보
  let front = new Int32Array(n), next = new Int32Array(n), nf = 0;
  for (let p = 0; p < n; p++) if (has[p]) { stamp[p] = 0; front[nf++] = p; }
  const outVal = val && val.slice();
  const ok = (q, s) => stamp[q] >= 0 && stamp[q] < s;
  // 새로 정해질 수 있는 픽셀은 직전 단계에 정해진 픽셀(front)의 이웃뿐이라 그것만 본다
  for (let s = 1; s <= steps && nf; s++) {
    let nn = 0;
    for (let k = 0; k < nf; k++) {
      const p = front[k], x = p % w;
      if (x > 0 && stamp[p - 1] === -1) { stamp[p - 1] = -2; next[nn++] = p - 1; }
      if (x < w - 1 && stamp[p + 1] === -1) { stamp[p + 1] = -2; next[nn++] = p + 1; }
      if (p >= w && stamp[p - w] === -1) { stamp[p - w] = -2; next[nn++] = p - w; }
      if (p < n - w && stamp[p + w] === -1) { stamp[p + w] = -2; next[nn++] = p + w; }
    }
    for (let k = 0; k < nn; k++) {
      const p = next[k], x = p % w;
      const q = x > 0 && ok(p - 1, s) ? p - 1
        : x < w - 1 && ok(p + 1, s) ? p + 1
        : p >= w && ok(p - w, s) ? p - w
        : p + w; // 후보가 된 이유인 이웃이 반드시 있다
      stamp[p] = s;
      if (outVal) for (let c = 0; c < 3; c++) outVal[3 * p + c] = outVal[3 * q + c];
    }
    [front, next, nf] = [next, front, nn];
  }
  const out = new Uint8Array(n);
  for (let p = 0; p < n; p++) out[p] = stamp[p] >= 0 ? 1 : 0;
  return { has: out, val: outVal };
}

// 색상(도, 0~360). Python colorsys.rgb_to_hsv와 같은 식
function hueDeg([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const rc = (mx - r) / (mx - mn), gc = (mx - g) / (mx - mn), bc = (mx - b) / (mx - mn);
  const h = r === mx ? bc - gc : g === mx ? 2 + rc - bc : 4 + gc - rc;
  return (((h / 6) % 1) + 1) % 1 * 360;
}

function median(vals) {
  vals.sort();
  const m = vals.length;
  return m % 2 ? vals[(m - 1) / 2] : (vals[m / 2 - 1] + vals[m / 2]) / 2;
}

function removeBg(data, w, h, cfg) {
  const n = w * h;
  const { lo, hi: HI } = cfg;

  // 테두리 픽셀(모서리는 두 번 셈: numpy 버전과 같다)
  const bIdx = [];
  for (let x = 0; x < w; x++) bIdx.push(x);
  for (let x = 0; x < w; x++) bIdx.push((h - 1) * w + x);
  for (let y = 0; y < h; y++) bIdx.push(y * w);
  for (let y = 0; y < h; y++) bIdx.push(y * w + w - 1);
  const near80 = (i, col) => {
    for (let c = 0; c < 3; c++) if (Math.abs(data[4 * i + c] - col[c]) > 80) return false;
    return true;
  };
  let seed = cfg.key;
  if (!seed) {
    // 자동 감지: 테두리 색을 32단계로 묶은 칸 중심마다 비슷한(채널당 80 이내) 테두리 픽셀 수를 세어 가장 많은 색.
    // 배경이 그라데이션이라 여러 칸에 나뉘어도 합쳐서 세므로, 테두리에 닿은 단색 물체(바닥 등)에 밀리지 않는다
    const bins = new Uint8Array(512);
    for (const i of bIdx) bins[(data[4 * i] >> 5) * 64 + (data[4 * i + 1] >> 5) * 8 + (data[4 * i + 2] >> 5)] = 1;
    let best = -1;
    for (let b = 0; b < 512; b++) {
      if (!bins[b]) continue;
      const col = [(b >> 6) * 32 + 16, ((b >> 3) & 7) * 32 + 16, (b & 7) * 32 + 16];
      let cnt = 0;
      for (const i of bIdx) if (near80(i, col)) cnt++;
      if (cnt > best) { best = cnt; seed = col; }
    }
  }
  // 물체가 테두리에 닿아 있어도 배경 부분만 보도록 기준색에 가까운 픽셀만 남긴다.
  // 자동일 땐 물체색을 배경으로 착각하지 않게 테두리의 1/4 이상이어야 배경으로 본다
  const use = bIdx.filter((i) => near80(i, seed));
  if (use.length < bIdx.length * (cfg.key ? 0.1 : 0.25))
    return { skip: cfg.key ? "no_key" : "no_bg" };
  const key = [0, 1, 2].map((c) => median(Float32Array.from(use, (i) => data[4 * i + c])));

  // 배경색의 강한 채널(마젠타면 R·B, 파랑이면 B)이 약한 채널보다 높은 만큼 = 배경색의 쨍한 정도
  const kMax = Math.max(...key);
  const hiIdx = [0, 1, 2].filter((c) => key[c] > kMax / 2);
  const loIdx = [0, 1, 2].filter((c) => !(key[c] > kMax / 2));
  const keySpill = hiIdx.length && loIdx.length
    ? Math.min(...hiIdx.map((c) => key[c])) - Math.max(...loIdx.map((c) => key[c])) : 0;
  const mode = cfg.mode !== "auto" ? cfg.mode : keySpill >= 100 ? "chroma" : "distance";
  if (cfg.mode === "auto" && kMax < 60)
    return { skip: "dark_bg" }; // 검은 배경은 도트 그림의 검은 외곽선까지 지워진다

  const mix = new Float32Array(n);
  const reach = new Uint8Array(n);

  if (mode === "distance") {
    // 배경색과의 색 거리(채널 최대 차이)로 섞인 정도를 잰다
    // 연분홍 글로우·워터마크 = 배경색 위에 흰색이 덮인 것: 배경색→흰색 직선 위에 놓인다
    const head = key.map((k) => 255 - k);
    const headSq = Math.max(head[0] ** 2 + head[1] ** 2 + head[2] ** 2, 1);
    for (let i = 0; i < n; i++) {
      const d = [data[4 * i] - key[0], data[4 * i + 1] - key[1], data[4 * i + 2] - key[2]];
      const a = (d[0] * head[0] + d[1] * head[1] + d[2] * head[2]) / headSq;
      let maxD = 0;
      let residual = 0;
      for (let c = 0; c < 3; c++) {
        maxD = Math.max(maxD, Math.abs(d[c]));
        residual = Math.max(residual, Math.abs(d[c] - a * head[c]));
      }
      mix[i] = Math.min(Math.max(maxD / cfg.distTol, 0), 1);
      reach[i] = residual < cfg.tintTol && a > -0.05 ? 1 : 0;
    }
  } else {
    if (keySpill < 100) return { skip: "not_vivid" };
    const keyHue = hueDeg(key);

    for (let i = 0; i < n; i++) {
      const p = 4 * i;
      let mnHi = 255;
      let dHi = 0;
      for (const c of hiIdx) {
        mnHi = Math.min(mnHi, data[p + c]);
        dHi = Math.max(dHi, Math.abs(data[p + c] - key[c]));
      }
      let mxLo = 0;
      for (const c of loIdx) mxLo = Math.max(mxLo, data[p + c]);
      const spill = Math.min(Math.max(mnHi - mxLo, 0), keySpill);
      mix[i] = 1 - spill / keySpill;
      let r = dHi < cfg.tintTol;
      if (!r && cfg.removeGlow) {
        // 보라·파랑 계열이면서 채도 있고 너무 어둡지 않은 픽셀도 배경 쪽으로 본다 (PIL HSV 0~255 스케일)
        const R = data[p], G = data[p + 1], B = data[p + 2];
        const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
        if (mx !== mn && mx > cfg.dark) {
          const cr = mx - mn;
          const s = Math.trunc((cr / mx) * 255);
          if (s > cfg.glowMinSat * 255) {
            const rc = (mx - R) / cr, gc = (mx - G) / cr, bc = (mx - B) / cr;
            let hh = R === mx ? bc - gc : G === mx ? 2 + rc - bc : 4 + gc - rc;
            hh = (hh / 6 + 1) % 1;
            const hue = (Math.trunc(hh * 255) * 360) / 256;
            const rel = ((((hue - keyHue + 180) % 360) + 360) % 360) - 180; // 배경색 색상에서 몇 도 떨어졌는지
            r = rel >= cfg.glowHue[0] && rel <= cfg.glowHue[1];
          }
        }
      }
      reach[i] = r ? 1 : 0;
    }
  }

  // 255 = 배경이 섞인 픽셀, 254 = 안 섞인 픽셀(흰 하이라이트·하늘색 글로우 등)
  const fill = new Uint8Array(n);
  for (let i = 0; i < n; i++) fill[i] = reach[i] ? (mix[i] < HI ? 255 : 254) : 0;
  const stack = new Int32Array(n);
  // 4방향 flood fill: fill 값이 thr 이상인 이웃만 128로 채운다
  const flood = (seed, thr) => {
    let sp = 0;
    stack[sp++] = seed;
    fill[seed] = 128;
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      if (x > 0 && fill[p - 1] >= thr) { fill[p - 1] = 128; stack[sp++] = p - 1; }
      if (x < w - 1 && fill[p + 1] >= thr) { fill[p + 1] = 128; stack[sp++] = p + 1; }
      if (p >= w && fill[p - w] >= thr) { fill[p - w] = 128; stack[sp++] = p - w; }
      if (p < n - w && fill[p + w] >= thr) { fill[p + w] = 128; stack[sp++] = p + w; }
    }
  };
  const seeds = [];
  for (let x = 0; x < w; x++) seeds.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) seeds.push(y * w, y * w + w - 1);
  for (const s of seeds) if (fill[s] >= 254) flood(s, 254); // 254·255 둘 다 채움
  // 물체에 둘러싸여 테두리와 끊긴 구멍(반 이상 배경인 픽셀에서 시작): 배경이 섞인(255) 픽셀로만 번진다
  const mid = (lo + HI) / 2;
  for (let i = 0; i < n; i++) if (fill[i] === 255 && mix[i] < mid) flood(i, 255);
  for (let i = 0; i < n; i++) if (fill[i] === 128) mix[i] = 0;

  const alpha = new Float32Array(n);
  const trans = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    alpha[i] = Math.min(Math.max((mix[i] - lo) / (HI - lo), 0), 1);
    trans[i] = alpha[i] === 0 ? 1 : 0;
  }

  // 투명 영역에서 edgePx 이내(외곽선 경계)는 섞인 만큼 전부 빼고, 그 안쪽은 알파만큼만 뺀다.
  // PIL MaxFilter처럼 (2*edgePx+1) 정사각 창의 최댓값이고, 이미지 가장자리에서는 창을 이미지 안으로 자른다
  const r = cfg.edgePx;
  const hd = new Uint8Array(n);
  const pre = new Int32Array(w + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + trans[y * w + x];
    for (let x = 0; x < w; x++) hd[y * w + x] = pre[Math.min(w, x + r + 1)] - pre[Math.max(0, x - r)] > 0 ? 1 : 0;
  }
  const near = new Uint8Array(n);
  const cnt = new Int32Array(w);
  for (let y = 0; y < Math.min(h, r); y++) for (let x = 0; x < w; x++) cnt[x] += hd[y * w + x];
  for (let y = 0; y < h; y++) {
    if (y + r < h) for (let x = 0; x < w; x++) cnt[x] += hd[(y + r) * w + x];
    if (y - r - 1 >= 0) for (let x = 0; x < w; x++) cnt[x] -= hd[(y - r - 1) * w + x];
    for (let x = 0; x < w; x++) near[y * w + x] = cnt[x] > 0 ? 1 : 0;
  }

  // 모래·주황·노랑처럼 원래 G가 B보다 큰 색은 spill이 음수라 0으로 잘려, 배경이 반쯤 섞여도 거의 안 섞인 걸로 나와
  // 불투명 분홍으로 남는다(chroma 계산의 편향이라 chroma 모드에서만 고친다).
  // 가까운 '배경이 전혀 안 섞인' 물체색 F와 배경색을 잇는 직선에 투영해 실제 물체 비율 t를 다시 잰다
  const fixed = new Uint8Array(n);
  let Fval = null;
  if (cfg.repair && mode === "chroma") {
    const clean = new Uint8Array(n);
    for (let i = 0; i < n; i++) clean[i] = mix[i] >= 1 ? 1 : 0;
    const rgb = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) rgb[3 * i + c] = data[4 * i + c];
    const F = spread(clean, rgb, cfg.repairPx, w, h);
    Fval = F.val;
    const bg = spread(trans, null, cfg.repairPx, w, h).has;
    for (let i = 0; i < n; i++) {
      if (!(alpha[i] > 0) || clean[i] || !F.has[i] || !bg[i]) continue;
      let dot = 0, fk2 = 0;
      for (let c = 0; c < 3; c++) {
        const fk = F.val[3 * i + c] - key[c];
        dot += (rgb[3 * i + c] - key[c]) * fk;
        fk2 += fk * fk;
      }
      const t = Math.min(Math.max(dot / Math.max(fk2, 1), 0), 1);
      let res = 0;
      for (let c = 0; c < 3; c++) res = Math.max(res, Math.abs(rgb[3 * i + c] - key[c] - t * (F.val[3 * i + c] - key[c])));
      let fHi = 255, fLo = 0;
      for (const c of hiIdx) fHi = Math.min(fHi, F.val[3 * i + c]);
      for (const c of loIdx) fLo = Math.max(fLo, F.val[3 * i + c]);
      // F가 편향이 생기는 색(배경 반대쪽)이고, 직선에서 크게 벗어나지 않고, mix보다 배경이 확실히 더 섞였다고 나올 때만.
      // F가 검은 외곽선·회색이면 어두운 보라·자주가 '검정+마젠타'로 오해받아 초록으로 변하므로 제외
      if (fHi - fLo < -10 && res < 60 && t < mix[i] - 0.05 && t < alpha[i]) {
        fixed[i] = 1;
        alpha[i] = t < lo ? 0 : t;
      }
    }
  }

  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    if (alpha[i] === 0) continue; // 투명은 색 0
    if (fixed[i]) {
      // 고친 픽셀 색은 F 그대로(배경을 빼고 t로 나누면 t가 작을 때 오차가 커져 엉뚱한 색이 나옴)
      for (let c = 0; c < 3; c++) out[4 * i + c] = Fval[3 * i + c];
      out[4 * i + 3] = Math.trunc(alpha[i] * 255);
      continue;
    }
    const u = near[i] ? mix[i] : alpha[i];
    const d = Math.max(u, 1e-6);
    for (let c = 0; c < 3; c++) {
      const v = (data[4 * i + c] - (1 - u) * key[c]) / d;
      out[4 * i + c] = Math.trunc(Math.min(Math.max(v, 0), 255));
    }
    out[4 * i + 3] = Math.trunc(alpha[i] * 255);
  }
  return { out, key, mode };
}

// 내려받을 크기: 긴 변을 side px 이하로, 비율 유지. 0이거나 원본보다 크면 원본 크기(키우지 않는다)
function fitSize(w, h, side) {
  const s = side ? Math.min(1, side / Math.max(w, h)) : 1;
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

if (typeof module !== "undefined") module.exports = { removeBg, DEFAULT_CFG, fitSize };
