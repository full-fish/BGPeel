// 테스트 파일들이 같이 쓰는 것. BASE(사이트 주소)·FIX(테스트 이미지 폴더)는 run.js가 넘겨준다
const { chromium } = require("playwright-core");

const BASE = process.env.BASE, FIX = process.env.FIX;
if (!BASE || !FIX) throw new Error("npm test(run.js)로 실행하세요");

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? "PASS " : "FAIL ") + msg); if (!cond) fails++; };
const end = () => { process.exitCode = fails ? 1 : 0; };

module.exports = { chromium, BASE, FIX, ok, end };
