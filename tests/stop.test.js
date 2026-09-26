const { chromium, BASE, FIX, ok, end } = require("./lib");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(BASE);
  for (const d of ["goblin", "slime"]) { const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("label.dir")]); await fc.setFiles(FIX + "/" + d); }

  // 정지
  ok(!(await page.isVisible("#stop")), "변환 전에는 정지 버튼 없음");
  await page.click("#run");
  await page.waitForFunction(() => items.filter((it) => it.blob).length >= 2);
  ok(await page.isVisible("#stop"), "변환 중 정지 버튼 보임");
  await page.click("#stop");
  console.log("  누른 직후 버튼:", await page.textContent("#stop"));
  await page.waitForFunction(() => !document.querySelector("#run").disabled);
  const done1 = await page.evaluate(() => items.filter((it) => it.blob !== undefined).length);
  const waiting = await page.$$eval("#list .st", (els) => els.filter((e) => e.textContent === "대기 중").length);
  console.log("  상태:", await page.textContent("#status"));
  ok(done1 < 17 && done1 + waiting === 17, `정지: ${done1}장 처리, ${waiting}장 대기 중 그대로`);
  ok(!(await page.isVisible("#stop")), "정지 후 정지 버튼 숨김");
  ok(await page.textContent("#run") === `남은 ${17 - done1}장 변환`, "버튼: " + await page.textContent("#run"));
  await page.evaluate(() => (window.__b = items.map((it) => it.blob)));
  await page.click("#run");
  await page.waitForFunction(() => !document.querySelector("#run").disabled && /완료/.test(document.querySelector("#status").textContent), null, { timeout: 90000 });
  const ch = await page.evaluate(() => items.map((it, i) => it.blob !== window.__b[i]));
  ok(ch.slice(0, done1).every((c) => !c) && ch.slice(done1).every(Boolean) && await page.evaluate(() => items.every((it) => it.blob)), "이어서 남은 것만 변환, 앞에 한 건 그대로");

  ok(!errs.length, "페이지 에러 없음 " + errs.join(" | "));
  await browser.close();
  end();
})();
