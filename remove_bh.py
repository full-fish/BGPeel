"""실행한 폴더 하위의 모든 이미지에서 단색 배경(마젠타 등, 기본은 테두리에서 자동 감지)과 거기 붙은 글로우·마름모
워터마크를 지워 _nobg/ 에 같은 폴더 구조로 PNG 저장한다(이미 있으면 _nobg_2, _nobg_3 ...). 원본은 건드리지 않는다."""

import colorsys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

KEY = None  # 지울 배경색. None: 이미지마다 테두리에서 가장 많이 나오는 색을 자동 감지. (255, 0, 255)처럼 지정하면 테두리 색이 이와 비슷한(채널당 80 이내) 이미지만 처리
MODE = "auto"  # "auto": 배경색이 쨍하면 chroma, 탁하면 distance. "chroma": 쨍한 단색 배경(마젠타·초록·파랑), 가장자리 색번짐·글로우까지 깔끔. "distance": 탁한·연한 단색 배경(예: 먼지 낀 분홍, 흰색)
DIST_TOL = 160  # distance 모드 전용: 배경색과 채널 차이가 이 이상이면 완전 불투명. 글로우 주변 분홍이 남으면 올리고, 물체가 반투명해지면 내릴 것
# 픽셀마다 '배경이 안 섞인 정도'(0=순수 배경, 1=배경 없음)를 구해서 LO 이하는 투명, HI 이상은 불투명, 사이는 반투명
LO, HI = 0.12, 0.5  # 글로우가 너무 남으면 둘 다 올리고, 너무 깎이면 내릴 것
EDGE_PX = 4  # 외곽 분홍 선이 남으면 올릴 것 (2000px 기준 경계가 3~4px 번져 있음)
TINT_TOL = (
    40  # 배경에 이어진 연분홍 글로우가 남으면 올릴 것 (물체 가장자리가 먹히면 내릴 것)
)
REMOVE_GLOW = True  # True: 배경에 이어진 보라·파랑 글로우도 지움. False: 연분홍만 지우고 색 글로우는 남김
GLOW_HUE = (
    -85,
    30,
)  # 글로우로 볼 색상 범위(도, 배경색 색상 기준). 마젠타(300도) 배경이면 215~330도. 하늘색 글로우가 남으면 앞 숫자를 -105로 내릴 것(하늘색·얼음 물체는 먹힘)
GLOW_MIN_SAT = 0.3  # 이보다 채도 낮은(회색빛) 픽셀은 물체로 본다
DARK = 80  # 이보다 어두운(RGB 최댓값) 픽셀 = 외곽선으로 보고 멈춘다
REPAIR = True  # chroma 전용: 배경 근처에서 배경색이 반쯤 물든 모래·주황·노랑 픽셀(물줄기의 분홍 등)을 주변 물체색 기준으로 다시 계산. False면 이 보정 없음
REPAIR_PX = 40  # 보정 때 주변 물체색을 찾는 거리이자 '배경 근처'로 보는 거리(px). 2048px 도트 그림(한 칸≈10px) 기준. 물든 부분이 남으면 올릴 것
EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tga", ".tif", ".tiff"}


def spread(has, val, steps):
    """has(True인 픽셀)를 4방향으로 steps번 넓힌다. val이 있으면 그 값도 같이 옮긴다(가장 가까운 픽셀 값).
    한 번에 이전 상태만 보고, 여러 이웃이 있으면 좌·우·상·하 순서로 먼저 것을 쓴다(web/core.js와 같은 결과)."""
    for _ in range(steps):
        new_has, new_val = has.copy(), None if val is None else val.copy()
        for dst, src in (
            (np.s_[:, 1:], np.s_[:, :-1]),  # 왼쪽 이웃에서
            (np.s_[:, :-1], np.s_[:, 1:]),  # 오른쪽 이웃에서
            (np.s_[1:], np.s_[:-1]),  # 위 이웃에서
            (np.s_[:-1], np.s_[1:]),  # 아래 이웃에서
        ):
            take = ~new_has[dst] & has[src]
            new_has[dst] |= take
            if val is not None:
                new_val[dst][take] = val[src][take]
        has, val = new_has, new_val
    return has, val


def remove_bg(rgb):
    h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    if KEY is not None:
        seed, need = np.array(KEY), 0.1
    else:
        # 자동 감지: 테두리 색을 32단계로 묶은 칸 중심마다 비슷한(채널당 80 이내) 테두리 픽셀 수를 세어 가장 많은 색.
        # 배경이 그라데이션이라 여러 칸에 나뉘어도 합쳐서 세므로, 테두리에 닿은 단색 물체(바닥 등)에 밀리지 않는다
        seeds = np.unique((border // 32).astype(int), axis=0) * 32 + 16
        seed = seeds[(np.abs(border[None] - seeds[:, None]).max(-1) <= 80).sum(1).argmax()]
        need = 0.25  # 물체색을 배경으로 착각하지 않게, 자동일 땐 테두리의 1/4 이상이어야 배경으로 본다
    # 물체가 테두리에 닿아 있어도 배경 부분만 보도록 기준색에 가까운 픽셀만 남긴다
    bg = border[np.abs(border - seed).max(-1) <= 80]
    if len(bg) < len(border) * need:
        return None  # 테두리에 KEY 색(또는 뚜렷한 배경색)이 없음
    key = np.median(bg, axis=0)  # 배경색 = 그 픽셀들의 중앙값. KEY와 정확히 같지 않아도 된다

    # 배경색의 강한 채널(마젠타면 R·B, 파랑이면 B)이 약한 채널보다 높은 만큼 = 배경색의 쨍한 정도
    hi = key > key.max() / 2
    key_spill = key[hi].min() - key[~hi].max() if hi.any() and not hi.all() else 0
    mode = MODE if MODE != "auto" else "chroma" if key_spill >= 100 else "distance"
    if MODE == "auto" and key.max() < 60:
        return None  # 검은 배경은 도트 그림의 검은 외곽선까지 지워지므로 자동으로는 처리하지 않는다(MODE="distance"로 직접 지정하면 처리)
    if mode == "distance":
        # 배경색과의 색 거리(채널 최대 차이)로 섞인 정도를 잰다
        mix = np.clip(np.abs(rgb - key).max(-1) / DIST_TOL, 0, 1)

        # 연분홍 글로우·마름모 워터마크 = 배경색 위에 흰색이 덮인 것: 픽셀이 배경색→흰색 직선 위에 놓인다.
        # 직선에 투영해 흰색이 덮인 정도(a)를 구하고, 직선에서 벗어난 만큼(residual)이 TINT_TOL 미만이면 대상.
        # a가 음수(배경보다 어두움)면 물체라 제외. 마젠타와 같이 테두리에서 이어진(flood fill) 것만 배경으로 본다
        head = 255 - key
        a = ((rgb - key) * head).sum(-1) / max((head**2).sum(), 1)
        residual = np.abs(rgb - key - a[..., None] * head).max(-1)
        reach = (residual < TINT_TOL) & (a > -0.05)
    else:
        if key_spill < 100:
            return None  # 테두리가 채도 높은 단색이 아님

        # 배경색 성분(강한 채널이 약한 채널보다 높은 만큼)이 배경 대비 얼마나 있는지로 배경 섞인 정도를 잰다
        spill = np.clip(rgb[..., hi].min(-1) - rgb[..., ~hi].max(-1), 0, key_spill)
        mix = 1 - spill / key_spill

        # 연분홍 글로우·마름모 워터마크 = 배경 위에 흰색이 덮인 것: 강한 채널은 배경 그대로이고 약한 채널만 올라간다.
        # 물체 안의 흰 하이라이트도 같은 조건이라, 테두리에서 이어진(flood fill) 것만 배경으로 본다
        tinted = np.abs(rgb[..., hi] - key[hi]).max(-1) < TINT_TOL
        reach = tinted
        if (
            REMOVE_GLOW
        ):  # 보라·파랑 계열이면서 채도 있고 너무 어둡지 않은 픽셀도 배경 쪽으로 본다
            hsv = np.array(
                Image.fromarray(rgb.astype(np.uint8)).convert("HSV"), dtype=np.float32
            )
            hue = hsv[..., 0] * 360 / 256
            key_hue = colorsys.rgb_to_hsv(*(key / 255))[0] * 360
            rel = (hue - key_hue + 180) % 360 - 180  # 배경색 색상에서 몇 도 떨어졌는지(-180~180)
            reach = reach | (
                (rel >= GLOW_HUE[0])
                & (rel <= GLOW_HUE[1])
                & (hsv[..., 1] > GLOW_MIN_SAT * 255)
                & (hsv[..., 2] > DARK)
            )
    # 255 = 마젠타가 섞인 픽셀, 254 = 안 섞인 픽셀(흰 하이라이트·하늘색 글로우 등)
    fill = Image.fromarray(
        np.where(reach, np.where(mix < HI, 255, 254), 0).astype(np.uint8)
    ).copy()  # copy 안 하면 읽기 전용이라 floodfill이 조용히 무시됨
    px = fill.load()
    for xy in [(x, y) for x in range(w) for y in (0, h - 1)] + [
        (x, y) for y in range(h) for x in (0, w - 1)
    ]:
        if px[xy] >= 254:
            ImageDraw.floodfill(fill, xy, 128, thresh=1)  # 254·255 둘 다 채움
    # 물체에 둘러싸여 테두리와 끊긴 마젠타 구멍(반 이상 배경인 픽셀에서 시작):
    # 물체 속 흰색까지 먹지 않게 마젠타 섞인(255) 픽셀로만 번진다
    for y, x in np.argwhere((np.array(fill) == 255) & (mix < (LO + HI) / 2)).tolist():
        if px[x, y] == 255:
            ImageDraw.floodfill(fill, (x, y), 128)
    mix[np.array(fill) == 128] = 0

    alpha = np.clip((mix - LO) / (HI - LO), 0, 1)

    # 섞인 배경색을 빼서 분홍기 제거. 투명 영역에서 EDGE_PX 이내(외곽선 경계)는 섞인 만큼 전부 빼고,
    # 그 안쪽(3번 같은 넓은 글로우)은 알파만큼만 빼서 보라빛을 남긴다
    transparent = Image.fromarray((alpha == 0).astype(np.uint8) * 255)
    near_edge = np.array(transparent.filter(ImageFilter.MaxFilter(EDGE_PX * 2 + 1))) > 0
    unmix = np.where(near_edge, mix, alpha)[..., None]
    color = (rgb - (1 - unmix) * key) / np.maximum(unmix, 1e-6)

    if REPAIR and mode == "chroma":
        # 모래·주황·노랑처럼 원래 G가 B보다 큰 색은 위 spill이 음수라 0으로 잘려, 배경이 반쯤 섞여도
        # 거의 안 섞인 걸로 나와 불투명 분홍으로 남는다(chroma 계산의 편향이라 chroma 모드에서만 고친다).
        # 가까운 '배경이 전혀 안 섞인' 물체색 F와 배경색을 잇는 직선에 투영해 실제 물체 비율 t를 다시 잰다
        clean = mix >= 1
        # 색 대신 '가장 가까운 clean 픽셀 번호'를 퍼뜨린 뒤 색을 한 번에 가져온다(복사량이 1/3이라 빠름)
        has_f, src = spread(clean, np.arange(h * w, dtype=np.int32).reshape(h, w), REPAIR_PX)
        f = rgb.reshape(-1, 3)[src]
        near_bg, _ = spread(alpha == 0, None, REPAIR_PX)
        d, fk = rgb - key, f - key
        t = np.clip((d * fk).sum(-1) / np.maximum((fk**2).sum(-1), 1), 0, 1)
        residual = np.abs(d - t[..., None] * fk).max(-1)
        # 고치는 조건: F가 그 편향이 생기는 색(배경 반대쪽, sf < -10)이고, 직선에서 크게 벗어나지 않고(residual < 60),
        # 위 mix보다 배경이 확실히 더 섞였다고 나올 때. F가 검은 외곽선·회색이면 어두운 보라·자주가 전부
        # '검정+마젠타'로 오해받아 초록으로 변하므로 제외된다
        sf = f[..., hi].min(-1) - f[..., ~hi].max(-1)
        fix = (sf < -10) & (alpha > 0) & ~clean & has_f & near_bg & (residual < 60) & (t < mix - 0.05) & (t < alpha)
        alpha = np.where(fix, np.where(t < LO, 0, t), alpha)
        # 색은 F를 그대로 쓴다(배경을 빼고 t로 나누면 t가 작을 때 오차가 커져 엉뚱한 색이 나옴)
        color[fix] = f[fix]
    color[alpha == 0] = 0
    return np.dstack([np.clip(color, 0, 255), alpha * 255]).astype(np.uint8)


root = Path.cwd()
out_root = root / "_nobg"
n = 2
while out_root.exists():
    out_root = root / f"_nobg_{n}"
    n += 1

for src in sorted(root.rglob("*")):
    if src.suffix.lower() not in EXTS or any(
        p.name.startswith("_nobg") for p in src.relative_to(root).parents
    ):
        continue
    rel = src.relative_to(root)
    try:
        rgb = np.array(Image.open(src).convert("RGB"), dtype=np.float32)
    except Exception as e:
        print(f"건너뜀 {rel}: {e}")
        continue
    out = remove_bg(rgb)
    if out is None:
        print(f"건너뜀 {rel}: 테두리에서 지울 배경색을 찾지 못함(KEY와 다르거나, chroma인데 탁한 배경)")
        continue
    dst = (out_root / rel).with_suffix(".png")  # 투명도 유지 위해 PNG로 저장
    dst.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(out).save(dst)
    print(f"{rel} -> {dst.relative_to(root)}")
