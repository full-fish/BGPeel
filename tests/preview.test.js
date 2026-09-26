// 미리보기 사본(카드 크기·화면 밀도에 맞춘 해상도), 처리기 묶음, 붙여넣기, 나가기 경고
const { chromium, BASE, FIX, ok, end } = require("./lib");

const waitDone = (p) => p.waitForFunction(() => !document.querySelector("#run").disabled && /완료/.test(document.querySelector("#status").textContent), null, { timeout: 90000 });
const addDir = async (p, d) => { const [fc] = await Promise.all([p.waitForEvent("filechooser"), p.click("label.dir")]); await fc.setFiles(d); };
// 카드마다 보이는 쪽 이미지의 실제 픽셀 폭
const widths = (p, sel) => p.$$eval(`#list .card ${sel}`, (imgs) => imgs.map((i) => i.naturalWidth));
const thumbsReady = (p) => p.waitForFunction(() => items.every((it) => it.th.orig) && [...document.querySelectorAll("#list .orig")].every((i) => i.complete && i.naturalWidth));

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errs = [];

  // 화면 밀도 1: 기본 카드(약 210px) → 512 사본, 가장 큰 카드(약 870px) → 1024 사본
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  let page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload();
  ok(await page.evaluate(() => POOL) > 1, "PC는 처리기 여러 개: " + await page.evaluate(() => POOL));
  await addDir(page, FIX + "/goblin");
  await thumbsReady(page);
  ok((await widths(page, ".orig")).every((w) => w === 512), "원본 미리보기 = 512 사본 " + await widths(page, ".orig"));

  // 동시에 몇 개가 돌았는지 기록하며 변환
  await page.evaluate(() => { window.__max = 0; setInterval(() => (window.__max = Math.max(window.__max, POOL - idle.length)), 2); });
  await page.click("#run"); await waitDone(page);
  ok(await page.evaluate(() => window.__max) > 1, "변환이 동시에 돌았다: 최대 " + await page.evaluate(() => window.__max) + "개");
  ok((await widths(page, ".res")).every((w) => w === 512), "결과 미리보기 = 512 사본 " + await widths(page, ".res"));

  while (!(await page.isDisabled("#bigger"))) await page.click("#bigger"); // 가장 크게
  await page.waitForFunction(() => [...document.querySelectorAll("#list .res")].every((i) => i.complete && i.naturalWidth === 1024));
  ok(true, "가장 큰 카드 → 1024 사본으로 바뀜");
  for (let i = 0; i < 3; i++) await page.click("#smaller"); // 기본 크기로
  await page.waitForFunction(() => [...document.querySelectorAll("#list .res")].every((i) => i.complete && i.naturalWidth === 512));
  ok(true, "다시 작게 → 512 사본으로 돌아옴");

  // 크게 보기는 원본 해상도
  await page.locator("#list .card").first().locator(".zbtn").click();
  await page.waitForFunction(() => document.querySelector("#zoom .res").naturalWidth > 0);
  ok(await page.$eval("#zoom .res", (i) => i.naturalWidth) === 2048, "크게 보기는 원본 2048px");
  await page.keyboard.press("Escape");

  // 사본보다 작은 이미지는 원본 그대로
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("label[for=file]")]); await fc.setFiles(FIX + "/black_bg.png");
  await thumbsReady(page);
  ok((await widths(page, ".orig")).at(-1) === 256, "256px 이미지는 원본 그대로");

  // 붙여넣기
  await page.evaluate(async () => {
    const cv = new OffscreenCanvas(64, 64); const c = cv.getContext("2d"); c.fillStyle = "#f0f"; c.fillRect(0, 0, 64, 64);
    const dt = new DataTransfer(); dt.items.add(new File([await cv.convertToBlob()], "pasted.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  ok((await page.$$eval("#list .name", (n) => n.map((x) => x.textContent))).includes("pasted.png"), "붙여넣은 이미지가 목록에 추가");

  // 결과가 있으면 나가기 전에 묻는다
  let asked = "";
  page.on("dialog", (d) => { asked = d.type(); d.dismiss(); });
  await page.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 500));
  ok(asked === "beforeunload", "결과가 있으면 나가기 전에 확인: " + (asked || "안 물음"));
  await ctx.close();

  // 결과가 없으면 묻지 않는다
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  await page.goto(BASE); await page.click("#bigger"); // 사용자 조작이 있어야 브라우저가 물어볼 수 있다
  asked = "";
  page.on("dialog", (d) => { asked = d.type(); d.dismiss(); });
  await page.close({ runBeforeUnload: true });
  await new Promise((r) => setTimeout(r, 500));
  ok(asked === "", "결과가 없으면 안 물음");
  await ctx.close();

  // 화면 밀도 2(레티나): 기본 카드 약 210px × 2 = 420 → 512, 큰 카드(약 870 × 2) → 원본
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  page = await ctx.newPage();
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload();
  await addDir(page, FIX + "/goblin"); await thumbsReady(page);
  ok((await widths(page, ".orig")).every((w) => w === 512), "레티나 기본 카드 → 512 " + await widths(page, ".orig"));
  while (!(await page.isDisabled("#bigger"))) await page.click("#bigger"); // 가장 크게
  await page.waitForFunction(() => [...document.querySelectorAll("#list .orig")].every((i) => i.complete && i.naturalWidth === 2048));
  ok(true, "레티나 가장 큰 카드 → 원본 2048");
  await ctx.close();

  // 휴대폰은 처리기 1개
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  page = await ctx.newPage();
  await page.goto(BASE);
  ok(await page.evaluate(() => POOL) === 1, "휴대폰은 처리기 1개");
  await ctx.close();

  ok(!errs.length, "페이지 에러 없음 " + errs.join(" | "));
  await browser.close();
  end();
})();
