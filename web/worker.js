importScripts("core.js");

// 작업 하나를 처리해 {id, ...결과}로 돌려준다. 실패하면 {id, error}. 한 처리기는 한 번에 한 작업만 받는다(app.js의 처리기 묶음)
const JOBS = { remove, shrink, thumbs };
onmessage = async ({ data }) => {
  try {
    postMessage({ id: data.id, ...(await JOBS[data.job](data)) });
  } catch (e) {
    postMessage({ id: data.id, error: String(e) });
  }
};

// 디코드 → 배경 제거 → PNG Blob + 카드 미리보기 사본. {blob, key, mode, w, h, thumbs, ms} / {skip}
async function remove({ file, cfg }) {
  const t = performance.now();
  const bmp = await createImageBitmap(file);
  const { width: w, height: h } = bmp;
  const cv = new OffscreenCanvas(w, h);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const r = removeBg(ctx.getImageData(0, 0, w, h).data, w, h, cfg);
  if (r.skip) return { skip: r.skip };
  ctx.putImageData(new ImageData(r.out, w, h), 0, 0);
  const blob = await cv.convertToBlob({ type: "image/png" });
  return { blob, key: r.key, mode: r.mode, w, h, thumbs: await thumbsOf(cv), ms: performance.now() - t };
}

// 원본 파일의 카드 미리보기 사본. {thumbs}
async function thumbs({ blob }) {
  const bmp = await createImageBitmap(blob);
  const out = await thumbsOf(bmp);
  bmp.close();
  return { thumbs: out };
}

// 긴 변 1024·512 사본(PNG). 원본이 그보다 작으면 만들지 않는다(그땐 원본을 그대로 쓴다)
async function thumbsOf(src) {
  const out = {};
  for (const side of [1024, 512]) {
    if (Math.max(src.width, src.height) <= side) continue;
    src = resize(src, side);
    out[side] = await src.convertToBlob({ type: "image/png" });
  }
  return out;
}

// 긴 변을 side 이하로 줄이고(0이면 그대로), colors면 256색 PNG로. {blob}
async function shrink({ blob, side, colors }) {
  const bmp = await createImageBitmap(blob);
  const cv = resize(bmp, side);
  bmp.close();
  if (!colors) return { blob: await cv.convertToBlob({ type: "image/png" }) };
  if (!self.UPNG) {
    // 256색을 처음 쓸 때만 불러온다. UPNG.js는 window 전역에 붙으므로 워커에서는 self를 window로 둔다
    self.window = self;
    importScripts(
      "https://cdnjs.cloudflare.com/ajax/libs/pako/1.0.11/pako.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/upng-js/2.1.0/UPNG.min.js",
    );
  }
  const { width: W, height: H } = cv;
  const rgba = cv.getContext("2d").getImageData(0, 0, W, H).data;
  return { blob: new Blob([UPNG.encode([rgba.buffer], W, H, 256)], { type: "image/png" }) };
}

// src(이미지·캔버스)를 긴 변 side 이하로 줄인 새 캔버스(0이면 같은 크기로 복사).
// 한 번에 크게 줄이면 브라우저에 따라 가는 외곽선이 끊기거나 계단이 져서 절반씩 나눠 줄인다
function resize(src, side) {
  const [W, H] = fitSize(src.width, src.height, side);
  let w = src.width, h = src.height, cv;
  do {
    w = Math.max(W, Math.ceil(w / 2));
    h = Math.max(H, Math.ceil(h / 2));
    cv = new OffscreenCanvas(w, h);
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    src = cv;
  } while (w > W || h > H);
  return cv;
}
