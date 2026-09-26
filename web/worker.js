importScripts("core.js");

// 이미지 한 장을 처리해 {id, ...결과}로 돌려준다. file이 오면 배경 제거, blob이 오면 내려받기용 줄이기. 실패하면 {id, error}
onmessage = async ({ data }) => {
  try {
    postMessage({ id: data.id, ...(await (data.file ? remove(data) : shrink(data))) });
  } catch (e) {
    postMessage({ id: data.id, error: String(e) });
  }
};

// 디코드 → 배경 제거 → PNG Blob. {blob, key, mode, w, h} / {skip}
async function remove({ file, cfg }) {
  const bmp = await createImageBitmap(file);
  const { width: w, height: h } = bmp;
  const cv = new OffscreenCanvas(w, h);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const r = removeBg(ctx.getImageData(0, 0, w, h).data, w, h, cfg);
  if (r.skip) return { skip: r.skip };
  ctx.putImageData(new ImageData(r.out, w, h), 0, 0);
  return { blob: await cv.convertToBlob({ type: "image/png" }), key: r.key, mode: r.mode, w, h };
}

// 긴 변을 side 이하로 줄이고(0이면 그대로), colors면 256색 PNG로. {blob}
async function shrink({ blob, side, colors }) {
  const bmp = await createImageBitmap(blob);
  const [W, H] = fitSize(bmp.width, bmp.height, side);
  // 한 번에 크게 줄이면 브라우저에 따라 가는 외곽선이 끊기거나 계단이 져서 절반씩 나눠 줄인다
  let src = bmp, w = bmp.width, h = bmp.height, cv;
  do {
    w = Math.max(W, Math.ceil(w / 2));
    h = Math.max(H, Math.ceil(h / 2));
    cv = new OffscreenCanvas(w, h);
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, w, h);
    src = cv;
  } while (w > W || h > H);
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
  const rgba = cv.getContext("2d").getImageData(0, 0, W, H).data;
  return { blob: new Blob([UPNG.encode([rgba.buffer], W, H, 256)], { type: "image/png" }) };
}
