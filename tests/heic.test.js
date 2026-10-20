// 아이폰 HEIC 열기 → JPG로 받기, 화질 낮추면 작아지는지. sample.heic = 400×300, 네 칸(빨강·초록 / 노랑·파랑)
const { chromium, BASE, ok, end } = require("./lib");
const fs = require("fs");
const path = require("path");
// JPEG 머리(SOF)에서 가로·세로
const jpgSize = (buf) => { for (let i = 2; i + 9 < buf.length; i += 2 + buf.readUInt16BE(i + 2)) if (buf[i + 1] >= 0xc0 && buf[i + 1] <= 0xc2) return `${buf.readUInt16BE(i + 7)}x${buf.readUInt16BE(i + 5)}`; };

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await (await browser.newContext()).newPage();
  // JS 예외만 센다. 광고 스크립트처럼 막힐 수 있는 외부 파일 실패는 빼고, HEIC 라이브러리를 못 불러오면 아래 검사가 실패한다
  const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await page.goto(BASE + "?mode=none&format=jpg");
  ok(await page.$eval("#export .fmt", (s) => s.value) === "jpg" && await page.$eval("#export .qual", (e) => !e.hidden), "?format=jpg → JPG, 화질 칸 보임");

  await page.setInputFiles("#file", path.join(__dirname, "sample.heic"));
  await page.click("#run");
  await page.waitForFunction(() => /완료/.test(document.querySelector("#status").textContent), null, { timeout: 60000 });
  const dims = await page.textContent("#list .dims");
  ok(dims.startsWith("400×300 · ") && dims.includes(`${Math.round(fs.statSync(path.join(__dirname, "sample.heic")).size / 1024)} KB →`), "400×300으로 열리고 원본 용량은 HEIC 파일 그대로  " + dims);
  // 결과 이미지의 네 칸 색
  const px = await page.evaluate(async () => {
    const bm = await createImageBitmap(await (await fetch(document.querySelector("#list .res").src)).blob());
    const c = new OffscreenCanvas(bm.width, bm.height).getContext("2d"); c.drawImage(bm, 0, 0);
    return [[100, 75], [300, 75], [100, 225], [300, 225]].map(([x, y]) => [...c.getImageData(x, y, 1, 1).data].slice(0, 3));
  });
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 25);
  ok(near(px[0], [220, 30, 30]) && near(px[1], [30, 200, 60]) && near(px[2], [240, 210, 40]) && near(px[3], [30, 60, 220]), "네 칸 색·방향 그대로 " + JSON.stringify(px));

  let [dl] = await Promise.all([page.waitForEvent("download"), page.click("#list .st a")]);
  const a = fs.readFileSync(await dl.path());
  ok(dl.suggestedFilename() === "sample.jpg" && a[0] === 0xff && a[1] === 0xd8 && jpgSize(a) === "400x300", `sample.jpg, JPEG 400×300 (${jpgSize(a)}, ${a.length}B)`);
  ok(!a.includes("Exif"), "JPG에 EXIF(촬영 위치 등) 없음");

  await page.selectOption("#export .q", "0.6");
  [dl] = await Promise.all([page.waitForEvent("download"), page.click("#list .st a")]);
  const b = fs.readFileSync(await dl.path());
  ok(b.length < a.length, `화질 60이 기본(92)보다 작음 ${a.length}B → ${b.length}B`);
  ok((await page.textContent("#list .dims")).endsWith(`${Math.max(1, Math.round(b.length / 1024))} KB`), "카드에 받은 용량 표시 " + await page.textContent("#list .dims"));

  ok(!errs.length, "JS 에러 없음 " + errs.join(" | "));
  await browser.close();
  end();
})();
