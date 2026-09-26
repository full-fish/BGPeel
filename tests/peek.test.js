const { chromium, BASE, FIX, ok, end } = require("./lib");
// 카드마다 보이는 쪽: "원" 원본 / "결" 결과
const shown = (page) => page.$$eval("#list .card", (cs) => cs.map((c) => getComputedStyle(c.querySelector(".orig")).visibility === "visible" ? "원" : "결").join(""));
const load = async (page) => {
  await page.goto(BASE);
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("label.dir")]);
  await fc.setFiles(FIX + "/goblin");
};
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errs = [];
  // PC
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => errs.push(e.message));
  await load(page);
  ok(await shown(page) === "원원원원" && await page.isDisabled("#orig"), "변환 전: 원본 보임, '원본 보기' 꺼짐");
  await page.click("#run");
  await page.waitForFunction(() => /완료/.test(document.querySelector("#status").textContent), null, { timeout: 60000 });
  await page.mouse.move(5, 5);
  ok(await shown(page) === "결결결결", "변환 후: 결과 " + await shown(page));
  await page.click("#orig");
  ok(await shown(page) === "원원원원" && await page.textContent("#orig") === "결과 보기", "원본 보기 → 전체 원본, 버튼 '결과 보기'");
  const blobs = await page.evaluate(() => items.map((it) => it.blob.size).join());
  await page.click("#orig");
  ok(await shown(page) === "결결결결" && await page.textContent("#orig") === "원본 보기", "다시 누르면 결과로");
  ok(await page.evaluate(() => items.map((it) => it.blob.size).join()) === blobs, "결과는 그대로(미리보기만)");
  await page.hover("#list .card:nth-child(2) .thumb");
  ok(await shown(page) === "결원결결", "마우스 올린 카드만 원본 " + await shown(page));
  await page.mouse.move(5, 5);
  ok(await shown(page) === "결결결결", "마우스 떼면 결과");
  await page.click("#orig"); await page.hover("#list .card:nth-child(3) .thumb");
  ok(await shown(page) === "원원결원", "원본 보기 중엔 올린 카드만 결과 " + await shown(page));
  await page.mouse.move(5, 5); await page.click("#orig");
  await page.close();

  // 모바일(터치)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const m = await ctx.newPage();
  m.on("pageerror", (e) => errs.push(e.message));
  await load(m);
  await m.click("#run");
  await m.waitForFunction(() => /완료/.test(document.querySelector("#status").textContent), null, { timeout: 60000 });
  const cdp = await ctx.newCDPSession(m);
  const th = m.locator("#list .card").first().locator(".thumb");
  await th.scrollIntoViewIfNeeded();
  const b = await th.boundingBox(), pt = [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
  await m.waitForTimeout(600);
  const during = await shown(m);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await m.waitForTimeout(200);
  const pickedAfterHold = await m.locator(".pick").first().isChecked();
  ok(during[0] === "원" && (await shown(m))[0] === "결" && !pickedAfterHold, `꾹 누르는 동안 원본(${during[0]}), 떼면 결과, 선택 안 됨(${pickedAfterHold})`);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt });
  await m.waitForTimeout(80);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await m.waitForTimeout(300);
  ok(await m.locator(".pick").first().isChecked() && (await shown(m))[0] === "결", "짧게 탭하면 선택되고 원본으로 안 바뀜");
  ok(!errs.length, "페이지 에러 없음 " + errs.join(" | "));
  await browser.close();
  end();
})();
