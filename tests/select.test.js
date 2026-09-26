const { chromium, BASE, FIX, ok, end } = require("./lib");
const JSZip = require("jszip");
const fs = require("fs");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; page.on("pageerror", (e) => errs.push(e.message)); page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto(BASE);
  const addDir = async (d) => { const [fc] = await Promise.all([page.waitForEvent("filechooser"), page.click("label.dir")]); await fc.setFiles(d); };
  const runAndWait = async () => { await page.click("#run"); await page.waitForFunction(() => !document.querySelector("#run").disabled && /완료/.test(document.querySelector("#status").textContent), null, { timeout: 90000 }); };
  const card = (i) => page.locator("#list .card").nth(i);
  const snap = () => page.evaluate(() => (window.__b = items.map((it) => it.blob), items.length));
  const changed = () => page.evaluate(() => items.map((it, i) => it.blob !== window.__b[i]));

  await addDir(FIX + "/goblin");
  await runAndWait();
  console.log("  1차:", await page.textContent("#status"));

  // 1) 개별 빼기
  const name1 = await card(1).locator(".name").textContent();
  await card(1).locator(".rm").click();
  ok(await page.locator("#list .card").count() === 3 && await page.evaluate(() => items.length) === 3, `× 누르면 그 카드만 빠짐 (${name1})`);

  // 2) 선택한 것만 변환: 카드 0, 2를 이미지 눌러 선택 → 설정 바꾸고 변환
  await card(0).locator(".thumb").click();
  await card(2).locator(".thumb").click();
  ok(await page.textContent("#run") === "선택한 2장 변환", "버튼: " + await page.textContent("#run"));
  ok(await page.isVisible("#unpick"), "선택 해제 버튼 보임");
  await snap();
  await page.click('input[name=mode][value=distance]', { force: true });
  await runAndWait();
  let ch = await changed();
  ok(ch[0] && !ch[1] && ch[2], "선택한 0·2만 다시 변환, 1은 그대로 " + JSON.stringify(ch));
  console.log("  상태:", await page.textContent("#status"));

  // 선택 해제 → 새 폴더 추가 → '새로 추가한 n장 변환' → 새 것만
  await page.click("#unpick");
  ok(!(await page.isVisible("#unpick")) && await page.locator(".pick:checked").count() === 0, "선택 해제");
  await page.click('input[name=mode][value=auto]', { force: true });
  await addDir(FIX + "/slime");
  const total = await snap();
  ok(await page.textContent("#run") === "남은 13장 변환", "버튼: " + await page.textContent("#run"));
  await runAndWait();
  ch = await changed();
  ok(ch.slice(0, 3).every((c) => !c) && ch.slice(3).every(Boolean), `새로 추가한 13장만 변환, 기존 3장 그대로 (총 ${total})`);

  // 전부 변환된 뒤 아무것도 안 고르고 설정 바꾸면 전체 다시
  await page.click('input[name=mode][value=chroma]', { force: true });
  ok(await page.textContent("#run") === "바뀐 설정으로 다시 변환", "버튼: " + await page.textContent("#run"));

  // zip에는 남은 16장
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#zip")]);
  const z = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const files = Object.keys(z.files).filter((k) => !z.files[k].dir);
  ok(files.length === 16 && !files.some((f) => f.endsWith(name1.replace(/\.\w+$/, ".png"))), `zip ${files.length}장, 뺀 파일 없음`);

  ok(!errs.length, "페이지 에러 없음 " + errs.join(" | "));
  await browser.close();
  end();
})();
