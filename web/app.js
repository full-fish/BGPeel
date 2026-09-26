// 설정 화면 + 변환. 한/영 페이지가 같이 쓴다(문구는 i18n.js, 기본값·로직은 core.js)
const $ = (s, el = document) => el.querySelector(s);
const T = I18N[document.documentElement.lang] || I18N.ko;
const D = DEFAULT_CFG; // 기본값은 core.js 하나에서만 정한다
const workerUrl = new URL("worker.js", document.currentScript.src); // /en/ 페이지에서도 같은 파일

// 세부 조절 항목. v = remove_bh.py 변수 이름
const SLIDERS = {
  common: [
    { id: "lo", v: "LO", min: 0, max: 0.9, step: 0.01 },
    { id: "hi", v: "HI", min: 0.1, max: 1, step: 0.01 },
    { id: "edgePx", v: "EDGE_PX", min: 0, max: 16, step: 1, unit: "px" },
    { id: "tintTol", v: "TINT_TOL", min: 0, max: 120, step: 1 },
  ],
  chroma: [
    { toggle: "removeGlow", v: "REMOVE_GLOW" },
    { hue: "glowHue", needs: "removeGlow", v: "GLOW_HUE" },
    { id: "glowMinSat", needs: "removeGlow", v: "GLOW_MIN_SAT", min: 0, max: 1, step: 0.05 },
    { id: "dark", needs: "removeGlow", v: "DARK", min: 0, max: 255, step: 1 },
    { toggle: "repair", v: "REPAIR" },
    { id: "repairPx", needs: "repair", v: "REPAIR_PX", min: 0, max: 100, step: 1, unit: "px" },
  ],
  distance: [
    { id: "distTol", v: "DIST_TOL", min: 20, max: 255, step: 1 },
  ],
};

// 설정은 이 브라우저에 기억한다(없거나 막혀 있으면 기본값)
const clone = (o) => JSON.parse(JSON.stringify(o));
let cfg = clone(D);
try { Object.assign(cfg, JSON.parse(localStorage.getItem("nobg-cfg")) || {}); } catch {}
const save = () => { try { localStorage.setItem("nobg-cfg", JSON.stringify(cfg)); } catch {} };

const toHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const decimals = (step) => (String(step).split(".")[1] || "").length;
const clamp = (v, s) => Math.min(s.max, Math.max(s.min, v));

function sliderHTML(s) {
  const t = T.ctrl[s.id];
  return `<div class="ctrl" data-needs="${s.needs || ""}">
    <div class="top"><label for="r-${s.id}">${t.name} <span class="var">${s.v}</span></label>
      <input class="num" type="number" id="n-${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" aria-label="${T.valueLabel(t.name)}${s.unit ? ` (${s.unit})` : ""}"></div>
    <input type="range" id="r-${s.id}" min="${s.min}" max="${s.max}" step="${s.step}">
    <div class="ends"><span>← ${t.ends[0]}</span><span>${t.ends[1]} →</span></div>
    <p class="help">${t.help}</p></div>`;
}
function toggleHTML(s) {
  const t = T.ctrl[s.toggle];
  return `<div class="ctrl"><label class="switch"><span>${t.name} <span class="var">${s.v}</span></span>
    <input type="checkbox" role="switch" id="t-${s.toggle}"></label><p class="help">${t.help}</p></div>`;
}
function hueHTML(s) {
  const t = T.ctrl[s.hue];
  return `<div class="ctrl" data-needs="${s.needs}">
    <div class="top"><span class="name">${t.name} <span class="var">${s.v}</span></span><span class="mono" id="hueVal"></span></div>
    <div class="hue" id="hueBar"><div class="sel" id="hueSel"></div><div class="mid" title="${T.bgMarker}"></div></div>
    <div class="hue-row">
      <label class="help">${t.start}<input type="range" id="h0" min="-180" max="0" step="1"></label>
      <label class="help">${t.end}<input type="range" id="h1" min="0" max="180" step="1"></label>
    </div>
    <p class="help">${t.help}</p></div>`;
}
for (const [g, list] of Object.entries(SLIDERS)) {
  $(`#g-${g} .ctrls`).innerHTML = list.map((s) => (s.toggle ? toggleHTML(s) : s.hue ? hueHTML(s) : sliderHTML(s))).join("");
}

// 화면 ← cfg
function render() {
  document.querySelector(`input[name=keyMode][value=${cfg.key ? "manual" : "auto"}]`).checked = true;
  $("#keyPick").hidden = !cfg.key;
  const keyCol = cfg.key || [255, 0, 255];
  $("#key").value = toHex(keyCol);
  $("#keyHex").textContent = toHex(keyCol).toUpperCase();
  $("#keyHelp").textContent = T.keyHelp[cfg.key ? "manual" : "auto"];
  document.querySelector(`input[name=mode][value=${cfg.mode}]`).checked = true;
  $("#modeHelp").textContent = T.modeHelp[cfg.mode];
  $("#g-chroma").hidden = cfg.mode === "distance";
  $("#g-distance").hidden = cfg.mode === "chroma";
  $("#g-chroma-help").textContent = cfg.mode === "auto" ? T.groupHelpAuto.chroma : "";
  $("#g-distance-help").textContent = cfg.mode === "auto" ? T.groupHelpAuto.distance : "";
  for (const s of Object.values(SLIDERS).flat()) {
    if (s.toggle) $(`#t-${s.toggle}`).checked = cfg[s.toggle];
    else if (s.id) {
      $(`#r-${s.id}`).value = cfg[s.id];
      $(`#n-${s.id}`).value = (+cfg[s.id]).toFixed(decimals(s.step));
    }
  }
  $("#h0").value = cfg.glowHue[0]; $("#h1").value = cfg.glowHue[1];
  renderHue(keyCol);
  for (const el of document.querySelectorAll(".ctrl[data-needs]")) {
    const dep = el.dataset.needs;
    el.classList.toggle("dim", !!dep && !cfg[dep]);
  }
  const n = Object.keys(D).filter((k) => k !== "key" && k !== "mode" && JSON.stringify(cfg[k]) !== JSON.stringify(D[k])).length;
  $("#changed").textContent = n ? T.changed(n) : "";
  markDirty();
}

// 글로우 색 범위 막대: 배경색 색상을 가운데 두고 −180°~+180°
function renderHue(keyCol) {
  const kh = hueDeg(keyCol);
  const stops = Array.from({ length: 13 }, (_, i) => `hsl(${kh - 180 + i * 30} 90% 55%)`);
  $("#hueBar").style.background = `linear-gradient(to right, ${stops.join(",")})`;
  const [a, b] = cfg.glowHue;
  $("#hueSel").style.left = `${((a + 180) / 360) * 100}%`;
  $("#hueSel").style.right = `${100 - ((b + 180) / 360) * 100}%`;
  $("#hueVal").textContent = `${a}° ~ +${b}°`;
}

// 화면 → cfg
function set(k, v) { cfg[k] = v; save(); render(); }
for (const r of document.querySelectorAll("input[name=keyMode]")) r.onchange = () => set("key", r.value === "manual" ? hex($("#key").value) : null);
$("#key").oninput = () => set("key", hex($("#key").value));
for (const r of document.querySelectorAll("input[name=mode]")) r.onchange = () => set("mode", r.value);
for (const s of Object.values(SLIDERS).flat()) {
  if (s.toggle) { $(`#t-${s.toggle}`).onchange = (e) => set(s.toggle, e.target.checked); continue; }
  if (!s.id) continue;
  const apply = (raw) => {
    if (raw === "" || isNaN(+raw)) return render();
    let v = clamp(+raw, s);
    // 지울 기준은 남길 기준보다 항상 작아야 한다
    if (s.id === "lo") v = Math.min(v, cfg.hi - 0.01);
    if (s.id === "hi") v = Math.max(v, cfg.lo + 0.01);
    set(s.id, +v.toFixed(decimals(s.step)));
  };
  $(`#r-${s.id}`).oninput = (e) => apply(e.target.value);
  $(`#n-${s.id}`).onchange = (e) => apply(e.target.value);
}
$("#h0").oninput = (e) => set("glowHue", [+e.target.value, cfg.glowHue[1]]);
$("#h1").oninput = (e) => set("glowHue", [cfg.glowHue[0], +e.target.value]);
$("#reset").onclick = () => { const key = cfg.key, mode = cfg.mode; cfg = clone(D); cfg.key = key; cfg.mode = mode; save(); render(); };

// 처리기(워커) 묶음: 여러 장을 동시에 처리해 화면은 멈추지 않는다. 처리기 하나가 2048px 한 장에 ~300MB까지 써서
// 휴대폰(터치)은 1개, 그 밖은 CPU 코어 절반(최대 4개)
// ponytail: 기기 메모리는 보지 않는다. 메모리 적은 PC에서 멈추면 navigator.deviceMemory로 줄일 것
const POOL = matchMedia("(pointer: coarse)").matches ? 1 : Math.min(4, Math.max(1, Math.floor((navigator.hardwareConcurrency || 2) / 2)));
const pending = new Map(), queue = [], idle = [];
let seq = 0;
const pump = () => { while (idle.length && queue.length) idle.pop().postMessage(queue.shift()); };
for (let i = 0; i < POOL; i++) {
  const w = new Worker(workerUrl);
  w.onmessage = ({ data }) => { idle.push(w); pending.get(data.id)(data); pending.delete(data.id); pump(); };
  w.onerror = () => { $("#status").textContent = T.workerFail; };
  idle.push(w);
}
// 작업 하나를 줄에 세우고 결과를 기다린다. job: remove(배경 제거) · shrink(받기용 줄이기) · thumbs(미리보기 사본)
const call = (msg) => new Promise((res) => { const id = ++seq; pending.set(id, res); queue.push({ id, ...msg }); pump(); });

// 내려받을 크기(긴 변 px, 0=원본)와 256색. 전체 기본값은 이 브라우저에 기억하고, 카드마다 따로 가진다
const SIDES = [0, 1024, 512, 256, 128, 64];
let out = { side: 0, colors: false };
try { Object.assign(out, JSON.parse(localStorage.getItem("nobg-out")) || {}); } catch {}

const outHTML = (colorsLabel) => `<select class="side" aria-label="${T.side}">${SIDES.map((v) => `<option value="${v}">${v ? v + " px" : T.original}</option>`).join("")}<option value="custom">${T.custom}</option></select>
  <input class="num px" type="number" min="1" step="1" placeholder="px" aria-label="${T.customPx}" hidden>
  <label class="chk"><input type="checkbox" class="colors"> ${colorsLabel}</label>`;
// 크기·256색 칸 ← 값
function setOutUI(el, { side, colors }) {
  const custom = !SIDES.includes(side);
  $(".side", el).value = custom ? "custom" : side;
  $(".px", el).hidden = !custom;
  if (custom) $(".px", el).value = side;
  $(".colors", el).checked = colors;
}
// 크기·256색 칸 → onChange({side} 또는 {colors}). 바뀐 쪽만 넘겨서, 전체에서 크기만 바꾸면 카드의 256색은 그대로 둔다
function bindOut(el, onChange) {
  const px = $(".px", el);
  $(".side", el).onchange = (e) => {
    if (e.target.value !== "custom") return onChange({ side: +e.target.value });
    px.hidden = false; px.focus();
  };
  px.onchange = () => { const v = Math.round(+px.value); if (v >= 1) onChange({ side: v }); };
  $(".colors", el).onchange = (e) => onChange({ colors: e.target.checked });
}

$("#export").innerHTML = `<span class="lbl">${T.side}</span>${outHTML(T.colors)}<p class="help">${T.exportHelp}</p>`;
setOutUI($("#export"), out);
// 전체에서 바꾸면 모든 카드가 따라가고, 그다음 카드마다 따로 바꿀 수 있다
bindOut($("#export"), (patch) => {
  Object.assign(out, patch);
  try { localStorage.setItem("nobg-out", JSON.stringify(out)); } catch {}
  setOutUI($("#export"), out);
  for (const it of items) { Object.assign(it, patch); showOut(it); }
});

const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
const expKey = (it) => `${it.side}|${it.colors}`;
const shrinks = (it) => { const [W, H] = fitSize(it.w, it.h, it.side); return it.colors || W !== it.w || H !== it.h; };

// 카드의 크기 칸과 '원본 크기·용량 → 내려받을 크기·용량' 줄. 용량은 한 번 내려받은 뒤에 보인다
function showOut(it) {
  setOutUI(it.card, it);
  if (!it.blob) return;
  const [W, H] = fitSize(it.w, it.h, it.side);
  const made = it.exp?.key === expKey(it) && it.exp.src === it.blob ? ` · ${fmtSize(it.exp.blob.size)}` : "";
  $(".dims", it.card).textContent = `${it.w}×${it.h} · ${fmtSize(it.blob.size)}` + (shrinks(it) ? ` → ${W}×${H}${made}` : "");
}

// 내려받을 파일. 줄일 게 없으면 변환 결과 그대로, 같은 설정으로 이미 만들었으면 다시 쓴다
async function exported(it) {
  if (!shrinks(it)) return it.blob;
  const key = expKey(it), src = it.blob;
  if (it.exp?.key !== key || it.exp.src !== src) {
    const r = await call({ job: "shrink", blob: src, side: it.side, colors: it.colors });
    if (r.error) throw new Error(r.error);
    it.exp = { key, src, blob: r.blob };
    showOut(it);
  }
  return it.exp.blob;
}

const items = []; // {file, path, url, card, side, colors, blob, w, h, resultUrl, exp}. path = 놓은 폴더 기준 경로(zip 안 구조)
let busy = false;
let lastRunCfg = null; // 마지막으로 변환한 설정(바뀌면 '다시 변환' 안내)

function addFiles(list) {
  list.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })); // 폴더 순서대로, g2가 g10보다 앞
  for (const { file, path } of list) {
    if (!file.type.startsWith("image/")) continue;
    const url = URL.createObjectURL(file);
    const card = document.createElement("div");
    card.className = "card";
    // 썸네일을 누르면 선택(label), 오른쪽 위 ×는 목록에서 빼기, 그 아래 돋보기는 크게 보기
    // 원본(.orig)과 결과(.res)는 겹쳐 두고 보이는 쪽만 바꾼다(paint)
    card.innerHTML = `<label class="thumb"><input type="checkbox" class="pick" aria-label="${T.pick}"><img class="res" alt="" draggable="false" decoding="async"><img class="orig" alt="" draggable="false" decoding="async"></label>
      <button type="button" class="rm" aria-label="${T.remove}" title="${T.remove}">×</button>
      <button type="button" class="zbtn" aria-label="${T.zoom}" title="${T.zoom}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.5-4.5"/></svg></button>
      <div class="meta"><div class="name"></div><div class="st"></div><div class="detected" hidden></div>
      <div class="out" hidden>${outHTML(T.colorsShort)}</div><div class="dims"></div></div>`;
    card.querySelector(".name").textContent = file.name;
    card.querySelector(".name").title = path;
    card.querySelector(".st").textContent = T.waiting;
    $("#list").append(card);
    const it = { file, path, url, card, th: { orig: null, res: null }, ...out };
    bindOut(card, (patch) => { Object.assign(it, patch); showOut(it); });
    bindPeek(it);
    paint(it);
    // 원본 미리보기 사본은 처리기에서 따로 만든다. 그동안 카드 그림은 비어 있다(2048px 원본을 여러 장 띄우지 않으려고)
    call({ job: "thumbs", blob: file }).then((r) => {
      if (!items.includes(it)) return;
      it.th.orig = thumbUrls(r.thumbs);
      setSrc(it);
    });
    const pick = $(".pick", card);
    pick.onchange = refresh;
    // Shift+클릭: 마지막으로 누른 카드부터 여기까지를 이 카드가 바뀔 상태로 한 번에
    $(".thumb", card).addEventListener("click", (e) => {
      if (e.defaultPrevented) return; // 꾹 누르기
      if (e.shiftKey && items.includes(anchor)) {
        // 체크박스를 직접 누르면 이미 바뀐 상태로 온다(취소하면 브라우저가 되돌리니 그대로 둔다). 이미지를 누르면 label이 한 번 더 바꾸지 않게 취소
        const direct = e.target === pick, on = direct ? pick.checked : !pick.checked;
        if (!direct) e.preventDefault();
        const [a, b] = [items.indexOf(anchor), items.indexOf(it)].sort((x, y) => x - y);
        for (const x of items.slice(a, b + 1)) $(".pick", x.card).checked = on;
        refresh();
      }
      anchor = it;
    });
    $(".zbtn", card).onclick = () => showZoom(items.indexOf(it));
    $(".rm", card).onclick = () => { forget(it); card.remove(); items.splice(items.indexOf(it), 1); refresh(); };
    items.push(it);
  }
  refresh();
}

// 놓은 폴더는 하위 폴더까지 전부 훑는다. readEntries는 한 번에 일부(크롬 100개)만 주므로 빈 배열이 올 때까지 반복
const promisify = (fn) => new Promise((res, rej) => fn(res, rej));
async function walk(entry) {
  if (entry.isFile) return [{ file: await promisify((ok, no) => entry.file(ok, no)), path: entry.fullPath.slice(1) }];
  const reader = entry.createReader(), out = [];
  for (let batch; (batch = await promisify((ok, no) => reader.readEntries(ok, no))).length; ) {
    for (const e of batch) out.push(...(await walk(e)));
  }
  return out;
}

function setSt(it, text, cls = "") {
  const el = it.card.querySelector(".st");
  el.className = "st " + cls;
  el.textContent = text;
}

const forget = (it) => {
  URL.revokeObjectURL(it.url);
  if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
  [it.th.orig, it.th.res].forEach(dropUrls);
};
let anchor = null; // Shift 범위 선택의 시작 카드
const picked = () => items.filter((it) => $(".pick", it.card).checked);
const failed = () => items.filter((it) => it.blob === null); // 건너뜀·실패
const fresh = () => items.filter((it) => it.blob === undefined); // 아직 한 번도 변환하지 않은 것

// 변환할 것: 고른 게 있으면 그것만, 없으면 새로 추가한 것만, 그것도 없으면 전부. 나머지 결과는 그대로 둔다
function targets() {
  const sel = picked(), add = fresh();
  return sel.length ? sel : add.length ? add : items;
}

function markDirty() {
  const sel = picked().length, add = fresh().length;
  const dirty = lastRunCfg && lastRunCfg !== JSON.stringify(cfg) && items.some((it) => it.blob !== undefined);
  $("#run").textContent = sel ? T.runPicked(sel) : add && add < items.length ? T.runNew(add) : dirty ? T.rerun : T.run;
  $("#unpick").hidden = !sel;
  const fail = failed().length;
  Object.assign($("#pickFail"), { hidden: !fail, textContent: T.pickFail(fail) });
}

function refresh() {
  $("#run").disabled = busy || !items.length;
  $("#clear").disabled = busy || !items.length;
  $("#zip").disabled = busy || !items.some((it) => it.blob);
  $("#orig").disabled = !items.some((it) => it.blob);
  markDirty();
}

// 원본 미리보기. 결과는 그대로 두고 보이는 이미지만 바꾼다.
// '원본 보기'(전체)와 카드 하나 들여다보기(마우스 올리기, 터치는 꾹 누르기)는 서로 뒤집는다
let origAll = false;
const paint = (it) => it.card.classList.toggle("show-orig", !it.blob || origAll !== !!it.peek);
const peek = (it, on) => { it.peek = on; paint(it); };

// 카드 미리보기 해상도: 카드 한 칸의 실제 화면 픽셀(카드 폭 × 화면 밀도) 이상인 사본 중 가장 작은 것(512 → 1024 → 원본).
// 늘려 보이는 일이 없어 흐려지지 않고, 카드가 크면 보이는 장 수가 줄어 메모리는 카드 크기와 상관없이 '화면에 보이는 픽셀만큼'이다
const TH = [512, 1024];
let bucket = 512; // 지금 쓰는 사본 크기(Infinity = 원본)
const thumbUrls = (thumbs = {}) => Object.fromEntries(Object.entries(thumbs).map(([s, b]) => [s, URL.createObjectURL(b)]));
const dropUrls = (th) => th && Object.values(th).forEach((u) => URL.revokeObjectURL(u));
const srcFor = (full, th) => (th ? th[bucket] || full : ""); // 원본이 사본보다 작으면 사본이 없어 원본을 쓴다
function setSrc(it) {
  const set = (img, url) => { if ((img.getAttribute("src") || "") !== url) url ? (img.src = url) : img.removeAttribute("src"); };
  set($(".orig", it.card), srcFor(it.url, it.th.orig));
  set($(".res", it.card), it.blob ? srcFor(it.resultUrl, it.th.res) : "");
}
// 카드 폭이 바뀔 때(카드 크기 −/+, 창 크기, 사이드바) 필요한 사본 크기가 달라졌으면 전부 바꿔 끼운다
function fitThumbs() {
  const col = parseFloat(getComputedStyle($("#list")).gridTemplateColumns) || 200; // 첫 칸 폭(px)
  const b = TH.find((s) => s >= col * devicePixelRatio) ?? Infinity;
  if (b !== bucket) { bucket = b; items.forEach(setSrc); }
}
new ResizeObserver(fitThumbs).observe($("#list")); // 카드 크기 −/+는 목록 폭이 그대로라 applyView에서 따로 부른다
function bindPeek(it) {
  const th = $(".thumb", it.card);
  let timer = 0, held = false;
  th.onpointerenter = (e) => e.pointerType === "mouse" && peek(it, true);
  th.onpointerleave = (e) => e.pointerType === "mouse" && peek(it, false);
  th.onpointerdown = (e) => {
    if (e.pointerType === "mouse") return;
    held = false;
    timer = setTimeout(() => { held = true; peek(it, true); }, 300);
  };
  // 손을 떼거나 스크롤로 넘어가면(cancel) 돌아온다
  th.onpointerup = th.onpointercancel = (e) => { if (e.pointerType !== "mouse") { clearTimeout(timer); peek(it, false); } };
  th.onclick = (e) => { if (held) { e.preventDefault(); held = false; } }; // 꾹 누른 건 선택으로 치지 않는다
  th.oncontextmenu = (e) => held && e.preventDefault(); // 안드로이드 길게 누르기 메뉴
}
$("#orig").onclick = () => {
  origAll = !origAll;
  Object.assign($("#orig"), { textContent: origAll ? T.showResult : T.showOrig });
  $("#orig").setAttribute("aria-pressed", origAll);
  items.forEach(paint);
  paintZoom();
};

// 크게 보기: 화면을 다 덮으니 마우스를 올리는 대신 누르고 있는 동안(터치도) 원본. ←/→로 다음 카드, Esc로 닫기
document.body.insertAdjacentHTML("beforeend", `<dialog id="zoom" aria-label="${T.zoom}">
  <div class="zbar"><span id="zname"></span><span id="zpos"></span><span class="help">${T.zoomHelp}</span><button type="button" id="zclose" aria-label="${T.close}">×</button></div>
  <div class="zstage"><div class="zimg" id="zimg"><img class="res" alt="" draggable="false"><img class="orig" alt="" draggable="false"></div>
    <button type="button" class="znav" id="zprev" aria-label="${T.prev}">‹</button><button type="button" class="znav" id="znext" aria-label="${T.next}">›</button></div>
</dialog>`);
const zoom = $("#zoom");
let zi = 0, zpeek = false, ztype = "";
const paintZoom = () => { const it = items[zi]; if (zoom.open && it) zoom.classList.toggle("show-orig", !it.blob || origAll !== zpeek); };
function showZoom(i) {
  if (!items.length) return;
  zi = (i + items.length) % items.length;
  const it = items[zi];
  $(".orig", zoom).src = it.url;
  if (it.resultUrl) $(".res", zoom).src = it.resultUrl; else $(".res", zoom).removeAttribute("src");
  $("#zname").textContent = it.path;
  $("#zpos").textContent = `${zi + 1} / ${items.length}`;
  if (!zoom.open) zoom.showModal();
  paintZoom();
}
const zset = (on) => { zpeek = on; paintZoom(); };
$("#zimg").onpointerdown = (e) => { ztype = e.pointerType; if (e.button === 0) zset(true); };
$("#zimg").onpointerup = $("#zimg").onpointercancel = $("#zimg").onpointerleave = () => zset(false);
$("#zimg").oncontextmenu = (e) => ztype !== "mouse" && e.preventDefault(); // 꾹 누를 때 저장 메뉴 대신 원본
$("#zprev").onclick = () => showZoom(zi - 1);
$("#znext").onclick = () => showZoom(zi + 1);
$("#zclose").onclick = () => zoom.close();
zoom.onclick = (e) => e.target === zoom && zoom.close(); // 바깥(어두운 곳)을 누르면 닫기
zoom.onkeydown = (e) => { if (e.key === "ArrowLeft") showZoom(zi - 1); if (e.key === "ArrowRight") showZoom(zi + 1); };
zoom.onclose = () => zset(false);

// 보기 설정(미리보기 배경, 카드 크기, 사이드바 위치)은 이 브라우저에 기억한다
const CARD = [120, 160, 200, 260, 340, 440]; // 카드 최소 폭(px). 작을수록 한 화면에 많이
let view = { bg: "check", card: 200, left: false };
try { Object.assign(view, JSON.parse(localStorage.getItem("nobg-view")) || {}); } catch {}
function applyView() {
  try { localStorage.setItem("nobg-view", JSON.stringify(view)); } catch {}
  document.body.dataset.bg = view.bg;
  document.querySelector(`input[name=bg][value=${view.bg}]`).checked = true;
  $("#list").style.setProperty("--card", view.card + "px");
  $("#smaller").disabled = view.card <= CARD[0];
  $("#bigger").disabled = view.card >= CARD.at(-1);
  document.body.classList.toggle("side-left", view.left);
  fitThumbs();
}
const step = (d) => { view.card = CARD[Math.min(CARD.length - 1, Math.max(0, CARD.indexOf(view.card) + d))]; applyView(); };
for (const r of document.querySelectorAll("input[name=bg]")) r.onchange = () => { view.bg = r.value; applyView(); };
$("#smaller").onclick = () => step(-1);
$("#bigger").onclick = () => step(1);
$("#swap").onclick = () => { view.left = !view.left; applyView(); };
applyView();

let stopReq = false; // 정지: 처리 중인 것만 끝내고 멈춘다. 남은 것은 손대지 않아 '남은 n장 변환'으로 이어서 할 수 있다

async function run() {
  const todo = targets(), ran = [];
  busy = true; stopReq = false; refresh();
  Object.assign($("#stop"), { hidden: false, disabled: false, textContent: T.stop });
  $("#run").hidden = true; // 변환 중에는 그 자리에 정지
  const runCfg = clone(cfg);
  // 처리기 수만큼 줄을 세워 동시에 돌린다
  let next = 0;
  const lane = async () => {
    while (!stopReq && next < todo.length) {
      const it = todo[next++];
      if (!items.includes(it)) continue; // 도중에 목록에서 뺀 것
      ran.push(it);
      $("#status").textContent = T.progress(ran.length, todo.length);
      await convert(it, runCfg);
    }
  };
  await Promise.all(Array.from({ length: POOL }, lane));
  busy = false;
  $("#stop").hidden = true;
  $("#run").hidden = false;
  if (!stopReq) lastRunCfg = JSON.stringify(runCfg); // 도중에 멈췄으면 '바뀐 설정으로 다시 변환' 안내를 남긴다
  refresh();
  const ok = ran.filter((it) => it.blob).length;
  $("#status").textContent = T.summary(ok, ran.length - ok) + (stopReq ? T.stopped(todo.filter((it) => items.includes(it) && !ran.includes(it)).length) : "");
}

// 한 장 변환하고 카드를 바꾼다
async function convert(it, runCfg) {
  setSt(it, T.processing);
  const det = it.card.querySelector(".detected");
  det.hidden = true;
  const r = await call({ job: "remove", file: it.file, cfg: runCfg });
  $(".out", it.card).hidden = !r.blob;
  if (r.blob) {
    if (it.resultUrl) URL.revokeObjectURL(it.resultUrl);
    dropUrls(it.th.res);
    it.blob = r.blob; it.w = r.w; it.h = r.h;
    it.resultUrl = URL.createObjectURL(r.blob);
    it.th.res = thumbUrls(r.thumbs);
    setSrc(it);
    paint(it);
    if (zoom.open && items[zi] === it) showZoom(zi);
    showOut(it);
    setSt(it, T.done((r.ms / 1000).toFixed(1)), "ok");
    const a = document.createElement("a");
    a.href = it.resultUrl; a.textContent = T.download;
    a.onclick = async (e) => {
      e.preventDefault();
      try { download(await exported(it), pngName(it.file.name)); } catch (err) { $("#status").textContent = T.shrinkFail + err.message; }
    };
    it.card.querySelector(".st").append(a);
    det.innerHTML = `<span class="sw"></span><span>${T.bg} <span class="mono"></span> · ${T.modeName[r.mode]}</span>`;
    $(".sw", det).style.background = toHex(r.key);
    $(".mono", det).textContent = toHex(r.key).toUpperCase();
    det.hidden = false;
  } else {
    it.blob = null;
    $(".dims", it.card).textContent = "";
    setSrc(it);
    paint(it);
    setSt(it, r.skip ? T.skipped + T.skip[r.skip] : T.error + r.error, r.skip ? "skip" : "err");
  }
}
$("#stop").onclick = () => { stopReq = true; Object.assign($("#stop"), { disabled: true, textContent: T.stopping }); };

const pngName = (name) => name.replace(/\.[^./]+$/, "") + ".png"; // 경로의 폴더 이름에 붙은 점은 건드리지 않는다
const download = (blob, name) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

async function zip() {
  if (!window.JSZip) { $("#status").textContent = T.zipNoLib; return; }
  const z = new JSZip();
  const used = new Map();
  const done = items.filter((it) => it.blob);
  let before = 0, after = 0;
  busy = true; refresh();
  try {
    let n = 0;
    $("#status").textContent = T.zipMaking(0, done.length);
    // 카드마다 정한 크기·256색대로. 줄이는 작업은 처리기 묶음에서 동시에
    const blobs = await Promise.all(done.map((it) => exported(it).then((b) => { $("#status").textContent = T.zipMaking(++n, done.length); return b; })));
    for (const [i, it] of done.entries()) {
      const blob = blobs[i];
      before += it.blob.size; after += blob.size;
      let name = pngName(it.path); // 폴더 구조 그대로
      const c = (used.get(name) || 0) + 1;
      used.set(name, c);
      if (c > 1) name = name.replace(/\.png$/, `_${c}.png`); // 이름이 겹치면 번호를 붙인다
      z.file(name, blob);
    }
    download(await z.generateAsync({ type: "blob", compression: "STORE" }), "nobg.zip"); // PNG는 이미 압축돼 있어 STORE
    $("#status").textContent = T.zipSaved(done.length, fmtSize(before), fmtSize(after));
  } catch (e) {
    $("#status").textContent = T.shrinkFail + e.message;
  } finally {
    busy = false; refresh();
  }
}

// 폴더 선택이면 webkitRelativePath에 '고른폴더/하위/파일' 경로가 들어 있다
$("#file").onchange = $("#dir").onchange = (e) => {
  addFiles([...e.target.files].map((file) => ({ file, path: file.webkitRelativePath || file.name })));
  e.target.value = "";
};
// 페이지 어디에 놓아도 받는다. 드롭 칸 밖에 놓으면 브라우저가 그 이미지를 열어 버려 작업이 날아간다
document.ondragover = (e) => { e.preventDefault(); $("#drop").classList.add("over"); };
document.ondragleave = (e) => { if (!e.relatedTarget) $("#drop").classList.remove("over"); }; // 창 밖으로 나갈 때만
document.ondrop = async (e) => {
  e.preventDefault(); $("#drop").classList.remove("over");
  const entries = [...e.dataTransfer.items].map((i) => i.webkitGetAsEntry()).filter(Boolean); // items는 이벤트가 끝나면 비므로 먼저 꺼낸다
  addFiles((await Promise.all(entries.map(walk))).flat());
};
// 붙여넣기(Ctrl+V·⌘V)로도 추가. 글자를 붙여넣을 때는 그대로 둔다
document.onpaste = (e) => {
  const files = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  e.preventDefault();
  addFiles(files.map((file) => ({ file, path: file.name })));
};
// 결과는 이 탭 메모리에만 있어서, 새로고침·탭 닫기·언어 바꾸기 전에 한 번 묻는다
addEventListener("beforeunload", (e) => { if (items.some((it) => it.blob)) { e.preventDefault(); e.returnValue = ""; } });
$("#run").onclick = run;
$("#zip").onclick = zip;
$("#clear").onclick = () => {
  if (origAll) $("#orig").click();
  items.forEach(forget);
  items.length = 0; lastRunCfg = null; $("#list").innerHTML = ""; $("#status").textContent = ""; refresh();
};
$("#unpick").onclick = () => { for (const it of picked()) $(".pick", it.card).checked = false; refresh(); };
$("#pickFail").onclick = () => { for (const it of items) $(".pick", it.card).checked = it.blob === null; refresh(); };
// 휴대폰에서 아래 고정된 버튼 줄은 선택·상태 문구에 따라 높이가 바뀌어, 그만큼 페이지 아래를 비워 둔다
new ResizeObserver(([e]) => document.body.style.setProperty("--bar", e.borderBoxSize[0].blockSize + "px")).observe($(".actions"));


// 광고: <meta name="google-adsense-account">에 게시자 ID가 있을 때만 AdSense를 불러오고,
// 광고 자리는 data-slot(광고 단위 ID)까지 채워진 것만 보인다. 비어 있으면 요청도 빈 자리도 없다
const adClient = $('meta[name="google-adsense-account"]')?.content;
if (adClient) {
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(adClient)}`;
  document.head.append(s);
  for (const el of document.querySelectorAll(".ad[data-slot]")) {
    if (!el.dataset.slot) continue;
    const ins = $("ins", el);
    ins.dataset.adClient = adClient;
    ins.dataset.adSlot = el.dataset.slot;
    el.hidden = false;
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  }
}

render();
