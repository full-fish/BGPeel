const { chromium, BASE, FIX, ok, end } = require("./lib");
const JSZip = require("jszip");
const fs = require("fs");
// PNG 머리에서 가로·세로·색 형식(3=팔레트 256색, 6=RGBA)
const png = (buf) => ({ w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: buf[25] === 3 ? "256색" : "RGBA", kb: Math.round(buf.length / 1024) });
const unzip = async (dl) => { const z = await JSZip.loadAsync(fs.readFileSync(await dl.path())); const r = {}; for (const k of Object.keys(z.files).sort()) if (!z.files[k].dir) r[k] = png(Buffer.from(await z.files[k].async("uint8array"))); return r; };

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto(BASE);
  ok(await page.$eval("#export .side", (s) => s.value) === "0" && !(await page.$eval("#export .colors", (c) => c.checked)), "기본값: 원본 크기 + 256색 끔");

  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("label.dir")]);
  await fc.setFiles(FIX + "/goblin");
  await page.click("#run");
  await page.waitForFunction(() => /완료/.test(document.querySelector("#status").textContent), null, { timeout: 60000 });
  const dims = () => page.$$eval("#list .dims", (els) => els.map((e) => e.textContent));
  console.log("  변환 직후:", (await dims())[0]);

  let [dl] = await Promise.all([page.waitForEvent("download"), page.click("#zip")]);
  let z = await unzip(dl);
  ok(Object.values(z).every((p) => p.w === 2048 && p.type === "RGBA"), "기본 zip = 원본 2048 RGBA  " + JSON.stringify(Object.values(z)[0]));
  console.log("  상태:", await page.textContent("#status"));

  // 전체 512 → 카드 2는 256+256색, 카드 3은 직접 입력 300
  await page.selectOption("#export .side", "512");
  ok((await page.$$eval("#list .side", (s) => s.map((x) => x.value))).every((v) => v === "512"), "전체 512 → 모든 카드 512");
  const card = (i) => page.locator("#list .card").nth(i);
  await card(1).locator(".side").selectOption("256");
  await card(1).locator(".colors").check();
  await card(2).locator(".side").selectOption("custom");
  await card(2).locator(".px").fill("300");
  await card(2).locator(".px").press("Enter"); await card(2).locator(".px").blur();
  console.log("  카드 dims:", await dims());

  [dl] = await Promise.all([page.waitForEvent("download"), page.click("#zip")]);
  await page.waitForFunction(() => /저장됨/.test(document.querySelector("#status").textContent));
  z = await unzip(dl); console.log("  zip:", z);
  const v = Object.values(z);
  ok(v[0].w === 512 && v[0].type === "RGBA", "카드1: 전체 설정 512");
  ok(v[1].w === 256 && v[1].type === "256색", "카드2: 개별 256 + 256색");
  ok(v[2].w === 300 && v[2].h === 300, "카드3: 직접 입력 300");
  console.log("  상태:", await page.textContent("#status"));
  console.log("  카드 dims(용량 표시):", await dims());

  // 카드별 다운로드도 그 카드 설정대로
  [dl] = await Promise.all([page.waitForEvent("download"), card(1).locator(".st a").click()]);
  const one = png(fs.readFileSync(await dl.path()));
  ok(one.w === 256 && one.type === "256색", `카드2 개별 다운로드 ${dl.suggestedFilename()} ` + JSON.stringify(one));

  // 전체 256색 켜기 → 모든 카드 켜지고, 카드3 크기(300)는 그대로
  await page.check("#export .colors");
  ok((await page.$$eval("#list .colors", (c) => c.map((x) => x.checked))).every(Boolean), "전체 256색 → 모든 카드 켜짐");
  ok(await card(2).locator(".px").inputValue() === "300", "전체 256색 바꿔도 카드3 크기 300 유지");

  // 원본 크기 + 256색 한 장 걸리는 시간
  await card(3).locator(".side").selectOption("0");
  const t = Date.now();
  [dl] = await Promise.all([page.waitForEvent("download"), card(3).locator(".st a").click()]);
  const big = png(fs.readFileSync(await dl.path()));
  console.log(`  원본 2048 + 256색 한 장: ${Date.now() - t}ms`, big);


  await page.reload();
  ok(await page.$eval("#export .side", (s) => s.value) === "512" && await page.$eval("#export .colors", (c) => c.checked), "새로고침해도 전체 설정 기억");
  ok(!errs.length, "페이지 에러 없음 " + errs.join(" | "));
  await browser.close();
  end();
})();
