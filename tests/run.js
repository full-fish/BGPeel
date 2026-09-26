// npm test: web/을 띄우고, 테스트 이미지를 만들고, *.test.js를 하나씩 실제 Chrome으로 돌린다
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { chromium } = require("playwright-core");

const WEB = path.join(__dirname, "..", "web");
const FIX = path.join(__dirname, ".fixtures");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".txt": "text/plain", ".xml": "application/xml" };

// 정적 파일 서버(폴더 주소는 index.html)
const server = http.createServer((req, res) => {
  let file = path.join(WEB, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(WEB)) return res.writeHead(403).end();
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }).end(data);
  });
});

// 테스트 이미지: 마젠타 배경 스프라이트 흉내(goblin 4장 + slime 13장, 2048px)와 검은 배경 1장(자동이면 건너뜀). Chrome 캔버스로 그린다
async function makeFixtures() {
  if (fs.existsSync(path.join(FIX, "black_bg.png"))) return;
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();
  const specs = [
    ...[3, 4, 5, 9].map((n) => `goblin/goblin_${n}.png`),
    ...Array.from({ length: 13 }, (_, i) => `slime/slime_${i + 1}.png`),
  ];
  const pngs = await page.evaluate(async (specs) => {
    const b64 = async (cv) => {
      const buf = new Uint8Array(await (await cv.convertToBlob({ type: "image/png" })).arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    };
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) % 180) + 40;
    const out = {};
    for (const name of specs) {
      const cv = new OffscreenCanvas(2048, 2048), c = cv.getContext("2d");
      c.fillStyle = "#ff00ff"; c.fillRect(0, 0, 2048, 2048);
      c.lineWidth = 40; c.strokeStyle = "#14141e";
      c.fillStyle = `rgb(${rnd()},${rnd()},${rnd()})`;
      c.beginPath(); c.ellipse(1025, 1150, 625, 650, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.lineWidth = 30; c.fillStyle = "#c8b43c"; c.fillRect(900, 300, 250, 400); c.strokeRect(900, 300, 250, 400);
      out[name] = await b64(cv);
    }
    const cv = new OffscreenCanvas(256, 256), c = cv.getContext("2d");
    c.fillStyle = "#000"; c.fillRect(0, 0, 256, 256);
    c.fillStyle = "#f0c828"; c.beginPath(); c.arc(128, 128, 64, 0, Math.PI * 2); c.fill();
    out["black_bg.png"] = await b64(cv);
    return out;
  }, specs);
  for (const [name, data] of Object.entries(pngs)) {
    fs.mkdirSync(path.dirname(path.join(FIX, name)), { recursive: true });
    fs.writeFileSync(path.join(FIX, name), Buffer.from(data, "base64"));
  }
  await browser.close();
}

(async () => {
  await makeFixtures();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${server.address().port}/`;
  const only = process.argv[2]; // npm test -- sidebar 처럼 이름 일부로 골라 돌리기
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith(".test.js") && (!only || f.includes(only))).sort();
  const failed = [];
  for (const f of files) {
    console.log(`\n── ${f}`);
    const code = await new Promise((r) => spawn(process.execPath, [path.join(__dirname, f)], { stdio: "inherit", env: { ...process.env, BASE, FIX } }).on("exit", r));
    if (code) failed.push(f);
  }
  server.close();
  console.log(failed.length ? `\n실패: ${failed.join(", ")}` : `\n전부 통과 (${files.length}개 파일)`);
  process.exit(failed.length ? 1 : 0);
})();
