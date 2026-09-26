const { chromium, BASE, FIX, ok, end } = require("./lib");
const y = (p, sel) => p.locator(sel).first().boundingBox().then((b) => b && Math.round(b.y));
const box = (p, sel) => p.locator(sel).first().boundingBox();
const waitDone = (p) => p.waitForFunction(() => !document.querySelector("#run").disabled && /완료/.test(document.querySelector("#status").textContent), null, { timeout: 90000 });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errs = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto(BASE); await page.evaluate(() => localStorage.clear()); await page.reload();

  // 1) 변환·zip·비우기 한 줄, 카드 크기와 ⇄ 한 줄
  const row = async () => [await y(page, "#run"), await y(page, "#zip"), await y(page, "#clear")];
  let r = await row();
  ok(r[0] === r[1] && r[1] === r[2], "이미지 없을 때 변환·zip·비우기 한 줄 " + r);
  ok(await y(page, "#smaller") === await y(page, "#swap"), "카드 크기 −/+ 와 ⇄ 한 줄");

  // 페이지 아무 데나(드롭 칸 밖, 설명 글 위) 폴더를 놓아도 받고, 페이지가 이동하지 않는다
  const cdp = await page.context().newCDPSession(page);
  const g = await box(page, ".guide");
  const data = { items: [], files: [FIX + "/goblin"], dragOperationsMask: 1 };
  for (const type of ["dragEnter", "dragOver", "drop"]) await cdp.send("Input.dispatchDragEvent", { type, x: g.x + 100, y: g.y + 40, data });
  await page.waitForTimeout(800);
  ok(await page.locator("#list .card").count() === 4 && page.url() === BASE, "드롭 칸 밖에 놓아도 4장 추가, 페이지 그대로");

  // 정지 버튼이 변환 자리에
  const runBox = await box(page, "#run");
  await page.click("#run");
  await page.waitForSelector("#stop:not([hidden])");
  const stopBox = await box(page, "#stop");
  ok(!(await page.isVisible("#run")) && Math.abs(stopBox.x - runBox.x) < 2 && Math.abs(stopBox.y - runBox.y) < 2, "변환 중: 변환 버튼 자리에 정지");
  await waitDone(page);
  ok(await page.isVisible("#run") && !(await page.isVisible("#stop")), "끝나면 다시 변환 버튼");

  // 긴 버튼 글자('바뀐 설정으로 다시 변환')여도 한 줄
  await page.click('input[name=mode][value=distance]', { force: true });
  r = await row();
  ok(await page.textContent("#run") === "바뀐 설정으로 다시 변환" && r[0] === r[1] && r[1] === r[2], "긴 글자여도 한 줄 " + r);
  await page.click('input[name=mode][value=auto]', { force: true });

  // 목록 비우면 원본 보기도 꺼짐
  await page.click("#orig");
  ok(await page.textContent("#orig") === "결과 보기", "원본 보기 켬");
  await page.click("#clear");
  ok(await page.textContent("#orig") === "원본 보기" && await page.evaluate(() => !origAll), "비우면 원본 보기 꺼짐");

  // 숫자 칸 이름(valueLabel)
  ok(await page.getAttribute("#n-lo", "aria-label") === "배경으로 지울 기준 값", "숫자 칸 이름: " + await page.getAttribute("#n-lo", "aria-label"));

  // 영어 페이지도 한 줄
  await page.goto(BASE + "en/");
  r = [await y(page, "#run"), await y(page, "#zip"), await y(page, "#clear")];
  ok(r[0] === r[1] && r[1] === r[2] && await y(page, "#smaller") === await y(page, "#swap"), "영어 페이지도 한 줄 " + r);
  await page.close();

  // 휴대폰: 아래 버튼 줄이 내용 가리지 않게(선택·실패 버튼까지 떠도)
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const m = await ctx.newPage(); m.on("pageerror", (e) => errs.push(e.message));
  await m.goto(BASE); await m.evaluate(() => localStorage.clear()); await m.reload();
  const [fc] = await Promise.all([m.waitForEvent("filechooser"), m.click("label[for=file]")]); await fc.setFiles([FIX + "/goblin/goblin_3.png", FIX + "/black_bg.png"]);
  await m.click("#run"); await waitDone(m);
  await m.click("#pickFail"); await m.waitForTimeout(100);
  const bar = await box(m, ".actions"), pad = await m.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom));
  const mr = [await y(m, "#run"), await y(m, "#zip"), await y(m, "#clear")];
  ok(mr[0] === mr[1] && mr[1] === mr[2], "휴대폰도 한 줄 " + mr);
  ok(bar.height <= pad, `버튼 줄 높이 ${Math.round(bar.height)}px ≤ 아래 여백 ${pad}px`);
  ok(!errs.length, "페이지 에러 없음 " + errs.join(" | "));
  await browser.close();
  end();
})();
