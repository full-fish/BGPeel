# 단색 배경 제거

마젠타·초록·흰색처럼 **한 가지 색으로 칠해진 배경**을 지워 투명 PNG로 만드는 도구입니다. AI로 만든 게임 스프라이트(마젠타 배경)를 주로 겨냥했습니다.

같은 알고리즘을 두 가지로 씁니다.

- **웹** (`web/`): 이미지를 서버로 보내지 않고 브라우저 안에서 처리합니다. 폴더째 올리기, 여러 장 한 번에 변환, 원본 비교, zip 받기(폴더 구조 유지, 크기·256색 줄이기)를 지원합니다.
- **CLI** (`remove_bh.py`): 실행한 폴더 아래의 이미지를 전부 처리해 `_nobg/`에 같은 폴더 구조로 저장합니다.

## 폴더 구조

```
bgpeel/
├─ web/               배포하는 폴더. 이 안의 파일만 사이트에 공개된다
│  ├─ index.html      한국어 페이지
│  ├─ en/             영어 페이지 (index.html, privacy.html)
│  ├─ app.js          화면: 설정, 카드 목록, 변환 순서, 보기 설정, 크게 보기, zip
│  ├─ core.js         배경 제거 알고리즘(remove_bh.py를 옮긴 것)과 기본 설정값, 내려받을 크기 계산
│  ├─ worker.js       백그라운드 처리: 배경 제거, 카드 미리보기 사본, 내려받기용 줄이기·256색
│  ├─ i18n.js         JS가 만드는 한/영 문구 (HTML에 적힌 문구는 각 언어 페이지에 있다)
│  ├─ style.css
│  ├─ guides.html     가이드 목록. 글은 web/*.html, 영어판은 en/에 같은 이름 (새 글은 sitemap.xml에도 추가)
│  ├─ img/            가이드 글 그림(WebP)
│  └─ privacy.html, about.html, contact.html, robots.txt, sitemap.xml, ads.txt
├─ tests/             실제 Chrome으로 web/을 돌려 보는 테스트 (npm test)
├─ remove_bh.py       같은 알고리즘의 Python CLI
├─ my_task.md         배포할 때 할 일 목록
└─ README.md
```

## 로컬에서 실행

```bash
cd web
python3 -m http.server 8000
```

<http://localhost:8000>으로 엽니다. 파일을 더블클릭해서(`file://`) 열면 백그라운드 처리(워커)가 돌지 않습니다.

코드를 고친 뒤에는 개발자 도구 → Network 탭의 **Disable cache**를 켜고 새로고침하세요. `python -m http.server`는 캐시 헤더를 보내지 않아서, 브라우저가 예전 JS(특히 `worker.js`)를 그대로 쓰는 일이 생깁니다.

페이지 사이 링크와 canonical·sitemap 주소는 `.html` 없이(`/features`) 씁니다. Cloudflare가 `/features.html`을 `/features`로 리디렉션하기 때문에, `.html`로 적으면 구글이 페이지를 색인하지 않습니다. python 서버는 이런 주소를 못 여니 링크까지 확인하려면 저장소 루트에서 `npx wrangler dev`로 띄우세요(배포와 똑같이 동작).

## CLI

```bash
pip install numpy pillow
cd 이미지가_있는_폴더
python3 /경로/remove_bh.py
```

설정은 `remove_bh.py` 맨 위 변수(`KEY`, `MODE`, `LO`, `HI`, `EDGE_PX` …)로 바꿉니다. 웹의 '세부 조절'에서 이름 옆에 회색으로 붙은 표시가 같은 변수입니다.

## 알고리즘을 고칠 때

`core.js`와 `remove_bh.py`는 같은 결과가 나오도록 맞춰 둔 한 쌍입니다. 한쪽을 고치면 다른 쪽도 고쳐야 합니다. 웹의 기본값은 `core.js`의 `DEFAULT_CFG` 한 곳에서만 정합니다.

## 테스트

```bash
cd tests
npm install        # 처음 한 번
npm test           # 전부 (2~3분)
npm test -- stop   # 파일 이름 일부로 골라서
```

컴퓨터에 Chrome이 깔려 있어야 합니다(Playwright가 그 Chrome을 띄웁니다). 테스트 이미지(마젠타 배경 2048px 17장과 검은 배경 1장)는 처음 실행할 때 `tests/.fixtures/`에 만들어지고, git에는 올라가지 않습니다.

## 코드만 봐서는 놓치기 쉬운 동작

- **변환 대상**: 고른 카드가 있으면 그것만, 없으면 아직 변환하지 않은 카드만, 그것도 없으면 전부 합니다. 이미 된 결과를 새 설정으로 덮어쓰지 않으려는 규칙입니다.
- **줄이기·256색**: 변환 결과는 원본 해상도로 메모리에 두고, 크기 줄이기와 256색은 다운로드하는 순간 적용합니다. 같은 설정으로 한 번 만든 파일은 다시 씁니다.
- **원본 보기**: 카드마다 원본과 결과 이미지를 겹쳐 두고 CSS로 한쪽만 보여 줍니다. 그래서 바꿀 때 다시 그리지 않아 즉시 바뀝니다.
- **카드 미리보기 해상도**: 원본 해상도를 그대로 띄우지 않고 512·1024px 사본을 만들어 둡니다. 카드 폭 × 화면 밀도 이상인 것 중 가장 작은 사본을 쓰므로 흐려지지 않고, 메모리는 카드 크기와 상관없이 화면에 보이는 픽셀만큼만 씁니다. 크게 보기와 다운로드는 항상 원본 해상도입니다.
- **처리기 묶음**: 워커를 여러 개 두고 동시에 처리합니다. PC는 CPU 코어 절반(최대 4개), 휴대폰은 1개입니다. 처리기 하나가 2048px 한 장에 약 300MB까지 쓰기 때문입니다.
- **나가기 경고**: 결과는 탭 메모리에만 있어서, 결과가 있으면 새로고침이나 탭 닫기 전에 브라우저가 한 번 묻습니다.
- **사이드바**: 900px 미만에서는 없고, 변환 버튼 줄만 화면 아래에 고정됩니다. 평소 폭은 360px이고, '세부 조절'을 펼치면 1600px 이상 화면에서 680px, 1900px 이상에서 980px로 넓어집니다.

## 외부 라이브러리 (설치할 것 없음)

모두 cdnjs에서 불러옵니다.

| 라이브러리 | 쓰는 곳 |
|---|---|
| JSZip | zip 만들 때 |
| pako, UPNG.js | 256색을 처음 켤 때만 워커가 불러옴 |
| Google AdSense | `<meta name="google-adsense-account">`에 게시자 ID를 넣었을 때만 |

CSS `:has()`를 쓰므로 Chrome 105+, Safari 15.4+, Firefox 121+가 필요합니다.

## 브라우저에 저장하는 것 (localStorage)

| 키 | 내용 |
|---|---|
| `nobg-cfg` | 배경 제거 설정 |
| `nobg-out` | 내려받을 크기·256색 기본값 |
| `nobg-view` | 미리보기 배경, 카드 크기, 사이드바 위치 |

## 배포

`web/` 폴더만 올립니다. 도메인·광고까지 포함한 순서는 [my_task.md](my_task.md)에 있습니다.

```bash
npx wrangler pages deploy web --project-name=<프로젝트 이름>
```

Cloudflare Pages를 Git 저장소와 연결해 배포한다면 빌드 명령은 비워 두고, 빌드 출력 디렉터리를 `web`으로 지정합니다.
