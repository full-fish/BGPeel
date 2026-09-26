const { chromium, BASE, FIX, ok, end } = require("./lib");
const box = (p, sel) => p.locator(sel).first().boundingBox().then((b) => b && ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.x + b.width), b: Math.round(b.y + b.height) }));
const cols = (p) => p.$eval("#list", (l) => getComputedStyle(l).gridTemplateColumns.split(" ").length);
const waitDone = (p) => p.waitForFunction(() => !document.querySelector("#run").disabled && /완료/.test(document.querySelector("#status").textContent), null, { timeout: 90000 });

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errs = [];
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } });
  page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear()); await page.reload();

  // 1·3) 이미지 없을 때: 사이드바 항상 오른쪽, 제목·설명은 남은 자리 가운데
  let o = await box(page, "#opts"), h1 = await box(page, "h1"), g = await box(page, ".guide"), d = await box(page, "#drop");
  const areaMid = (16 + (o.x - 16)) / 2;
  ok(o.r === 1904 && o.w === 360, `사이드바 오른쪽 고정 x=${o.x} w=${o.w}`);
  ok(Math.abs((d.x + d.r) / 2 - areaMid) < 20 && h1.x === d.x && g.x === d.x, `제목·드롭·설명 가운데 (드롭 ${d.x}~${d.r}, 남은 자리 가운데 ${Math.round(areaMid)}, 설명 x=${g.x})`);

  // 파일 올리고 변환 (goblin 4 + 검은 배경 1장 = 건너뜀)
  const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("label.dir")]); await fc.setFiles(FIX + "/goblin");
  const [fc2] = await Promise.all([page.waitForEvent("filechooser"), page.click("label[for=file]")]); await fc2.setFiles(FIX + "/black_bg.png");
  await page.click("#run"); await waitDone(page);
  const l = await box(page, "#list");
  ok(l.x === 16 && l.r <= o.x - 16, `목록은 왼쪽 끝~사이드바 앞 (${l.x}~${l.r})`);

  // 사이드바 폭: 세부 조절 펼칠 때만 넓게
  await page.click("#adv > summary");
  ok((await box(page, "#opts")).w === 980, "1920px 세부 조절 펼침 → 980px");
  // 2) 맨 윗줄 고정
  await page.evaluate(() => (document.querySelector("#opts").scrollTop = 99999));
  const oo = await box(page, "#opts"), a = await box(page, "#opts .actions");
  ok(await page.evaluate(() => document.querySelector("#opts").scrollTop) > 0 && Math.abs(a.y - oo.y) <= 2, `사이드바 스크롤해도 변환 버튼 줄은 맨 위 (줄 y=${a.y}, 사이드바 y=${oo.y})`);
  await page.click("#adv > summary");
  ok((await box(page, "#opts")).w === 360, "세부 조절 접으면 360px");
  for (const [w, want] of [[1440, 360], [1700, 680], [1920, 980]]) {
    await page.setViewportSize({ width: w, height: 1000 }); await page.click("#adv > summary");
    const ow = (await box(page, "#opts")).w; await page.click("#adv > summary");
    ok(ow === want, `${w}px 펼침 → ${ow}px (기대 ${want})`);
  }

  // 4) 사이드바 왼쪽
  await page.click("#swap");
  o = await box(page, "#opts"); const l2 = await box(page, "#list");
  ok(o.x === 16 && l2.x >= o.r + 16, `왼쪽으로 (사이드바 ${o.x}~${o.r}, 목록 ${l2.x}~)`);

  // 미리보기 배경
  await page.click(".bgopt[title=검정]");
  ok(await page.$eval(".thumb", (t) => getComputedStyle(t).backgroundColor) === "rgb(0, 0, 0)", "배경 검정");
  // 카드 크기
  const c0 = await cols(page); await page.click("#smaller"); const c1 = await cols(page); await page.click("#bigger"); await page.click("#bigger"); const c2 = await cols(page);
  ok(c1 > c0 && c2 < c0, `카드 크기 −/+ → 한 줄 ${c0}개 → ${c1}개 / ${c2}개`);
  await page.reload();
  ok(await page.evaluate(() => document.body.classList.contains("side-left") && document.body.dataset.bg === "black"), "새로고침해도 왼쪽·검정·카드 크기 기억");
  await page.click("#swap"); await page.click(".bgopt[title=체크무늬]"); await page.click("#smaller");
  // 다시 올리고 변환
  const [fc3] = await Promise.all([page.waitForEvent("filechooser"), page.click("label.dir")]); await fc3.setFiles(FIX + "/goblin");
  const [fc4] = await Promise.all([page.waitForEvent("filechooser"), page.click("label[for=file]")]); await fc4.setFiles(FIX + "/black_bg.png");
  await page.click("#run"); await waitDone(page);

  // 실패만 선택
  ok(await page.textContent("#pickFail") === "실패 1장 선택", "버튼: " + await page.textContent("#pickFail"));
  await page.click("#pickFail");
  const sel = await page.evaluate(() => items.filter((it) => it.card.querySelector(".pick").checked).map((it) => it.file.name));
  ok(sel.length === 1 && sel[0] === "black_bg.png", "실패만 선택 → " + sel);
  await page.click("#unpick");
  // Shift 범위 선택
  const th = (i) => page.locator("#list .card").nth(i).locator(".thumb");
  await th(0).click(); await th(3).click({ modifiers: ["Shift"] });
  const picks = () => page.$$eval("#list .pick", (ps) => ps.map((p) => (p.checked ? 1 : 0)).join(""));
  ok(await picks() === "11110", "0 누르고 Shift+3 → " + await picks());
  await th(1).click({ modifiers: ["Shift"] });
  ok(await picks() === "10000", "이어서 Shift+1 → 1~3 해제 " + await picks());
  await page.locator("#list .card").nth(4).locator(".pick").click({ modifiers: ["Shift"] });
  ok(await picks() === "11111", "체크박스 직접 Shift+클릭도 → " + await picks());
  await page.click("#unpick");

  // 크게 보기
  await page.locator("#list .card").nth(1).locator(".zbtn").click();
  ok(await page.evaluate(() => document.querySelector("#zoom").open) && (await page.textContent("#zname")) === "goblin/goblin_4.png", "돋보기 → 크게 보기 " + await page.textContent("#zname"));
  const zshow = () => page.$eval("#zoom", (z) => getComputedStyle(z.querySelector(".orig")).visibility === "visible" ? "원본" : "결과");
  const zb = await box(page, "#zimg");
  await page.mouse.move(zb.x + zb.w / 2, zb.y + zb.h / 2);
  ok(await zshow() === "결과", "마우스만 올리면 결과");
  await page.mouse.down(); const held = await zshow(); await page.mouse.up();
  ok(held === "원본" && await zshow() === "결과", "누르고 있는 동안 원본, 떼면 결과");
  await page.keyboard.press("ArrowRight");
  ok(await page.textContent("#zpos") === "3 / 5", "→ 다음 장 " + await page.textContent("#zpos"));
  await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft"); await page.keyboard.press("ArrowLeft");
  ok(await page.textContent("#zpos") === "5 / 5", "← 처음에서 마지막으로 " + await page.textContent("#zpos"));
  await page.keyboard.press("Escape");
  ok(!(await page.evaluate(() => document.querySelector("#zoom").open)), "Esc → 닫힘");
  await page.close();

  // 휴대폰
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const m = await ctx.newPage(); m.on("pageerror", (e) => errs.push(e.message));
  await m.goto(BASE); await m.evaluate(() => localStorage.clear()); await m.reload();
  const [mf] = await Promise.all([m.waitForEvent("filechooser"), m.click("label.dir")]); await mf.setFiles(FIX + "/goblin");
  const ab = await box(m, ".actions");
  ok(ab.b === 844 && ab.x === 0 && ab.w === 390, `버튼 줄 화면 아래 고정 (y ${ab.y}~${ab.b})`);
  await m.evaluate(() => window.scrollTo(0, 3000));
  const ab2 = await box(m, ".actions");
  ok(ab2.b === 844, "스크롤해도 아래 고정");
  ok(!(await m.isVisible("#swap")), "휴대폰은 좌우 바꾸기 버튼 없음");
  const mc0 = await cols(m); await m.click("#smaller"); const mc1 = await cols(m);
  ok(mc0 === 1 && mc1 === 2, `카드 − → 한 줄 ${mc0}개 → ${mc1}개`);
  await m.evaluate(() => window.scrollTo(0, 0));
  ok(!errs.length, "페이지 에러 없음 " + errs.join(" | "));
  await browser.close();
  end();
})();
