# 배포 할 일 — 단색 배경 제거

올리는 건 `web/` 폴더 하나뿐이다. 이 파일, 몬스터 이미지 폴더들, `remove_bh.py`는 올리지 않는다.

## 0. 먼저 정할 것

- [ ] **도메인 이름** (예: `nobg.com`). 광고(AdSense)를 붙이려면 내 도메인이 꼭 있어야 한다. 무료 주소 `xxx.pages.dev`로는 AdSense 신청이 안 된다.
      -> bgpeel.com

- [ ] **공개 문의 이메일**. 페이지 맨 아래와 개인정보처리방침에 그대로 보이니 스팸이 올 수 있다. 따로 만든 주소를 권장.
      -> manseon94@gmail.com

## 1. Cloudflare 가입 + 도메인 사기

- [ ] cloudflare.com 가입
- [ ] 대시보드 → Domain Registration → Register Domains에서 도메인 구매
  - 여기서 사면 DNS가 자동으로 연결돼서 제일 편하다.
  - `.kr`은 Cloudflare에서 못 산다. 가비아 같은 곳에서 산 뒤 네임서버를 Cloudflare로 바꾸면 된다.
    -> 너가 바꿔줘

## 2. 자리표시자 채우기

코드 안에 `__DOMAIN__`(30곳)과 `__CONTACT__`(4곳)이 비어 있다. 아래 한 줄로 전부 바꾼다.
도메인은 `https://`와 끝의 `/` 없이 `nobg.com` 모양으로 넣는다.

```bash
cd ~/dev/bgpeel/web
grep -rl "__DOMAIN__\|__CONTACT__" . | xargs sed -i '' -e 's/__DOMAIN__/내도메인.com/g' -e 's/__CONTACT__/문의메일@주소.com/g'
```

- [ ] 바꾸기 실행
- [ ] 확인: `grep -rn "__DOMAIN__\|__CONTACT__" .` 결과가 한 줄도 없어야 한다.

## 3. 올리기 (Cloudflare Workers 정적 배포)

설정은 `wrangler.jsonc`에 있다(`web/` 폴더를 올리고, `bgpeel.com`을 연결).
GitHub 저장소를 Cloudflare에 연결해 뒀으면 `git push`만 하면 자동 배포된다. 배포 명령은 `npx wrangler deploy`, 빌드 명령은 비운다.
손으로 올릴 때는:

```bash
cd ~/dev/bgpeel
npx wrangler deploy
```

- [ ] 올리기
- [ ] `https://bgpeel.com`으로 열어서 확인: 폴더 드래그, 폴더 선택, 변환, zip 다운로드 (영어 페이지 `/en/`, `/privacy.html`도)
- [ ] `www`도 쓰고 싶으면 `wrangler.jsonc`의 `routes`에 `www.bgpeel.com`을 추가

## 4. 검색 등록

- [ ] Google Search Console → 속성 추가(도메인) → 소유 확인(Cloudflare DNS면 거의 자동) → Sitemaps에 `sitemap.xml` 제출
- [ ] (선택) 네이버 서치어드바이저 → 사이트 등록 → `sitemap.xml` 제출. 한국어 검색으로 들어오는 사람을 받으려면 해 두는 게 좋다.

## 5. 광고 (AdSense)

사이트가 내 도메인에서 실제로 열리는 상태에서 신청한다. 심사는 며칠에서 몇 주 걸린다.

- [ ] adsense.google.com 가입 → 사이트에 내 도메인 추가 → 게시자 ID `ca-pub-XXXXXXXXXXXXXXXX` 받기
- [ ] `web/index.html`, `web/en/index.html`의 `<meta name="google-adsense-account" content="">` 따옴표 안에 `ca-pub-...` 넣기
- [ ] `web/ads.txt` 두 번째 줄 맨 앞 `#`을 지우고, `pub-0000000000000000`을 내 ID로 바꾸기 (여기엔 `ca-` 없이 `pub-...`만)
- [ ] 3번 명령으로 다시 올리기 → AdSense에서 사이트 "검토 요청"
- [ ] AdSense → 개인 정보 보호 및 메시지 → 유럽(GDPR) 동의 메시지 만들기
  - 개인정보처리방침에 "유럽경제지역·영국·스위스 방문자에게 동의를 요청한다"고 적어 뒀기 때문에 꼭 해야 한다.
- [ ] 승인되면 광고 위치 정하기 (둘 중 하나)
  - **자동 광고**: AdSense에서 켜기만 하면 된다. 코드 수정 없음.
  - **직접 위치**: 디스플레이 광고 단위를 만들고, 받은 슬롯 번호를 `data-slot=""` 4곳(`index.html` 2곳, `en/index.html` 2곳)에 넣은 뒤 다시 올리기. 슬롯이 빈 자리는 화면에 안 보인다.
- [ ] 수익이 $10을 넘으면 우편으로 PIN이 온다 → 입력. 세금 정보(W-8BEN)도 입력. 지급은 $100부터.

## 6. 나중에 고칠 때

- [ ] 코드를 고친 뒤 `git push`(또는 3번 명령)하면 끝.
  - Cloudflare는 브라우저가 매번 새 버전인지 확인하게 해서, 로컬 서버에서 겪은 "예전 app.js가 남는" 문제는 생기지 않는다.
- [ ] 개인정보처리방침 내용을 바꾸면 `시행일`도 같이 바꾸기 (한/영 두 파일).

## 비용

| 항목                                  | 비용                                                   |
| ------------------------------------- | ------------------------------------------------------ |
| Cloudflare Workers 호스팅             | 0원. 정적 사이트는 트래픽 무제한                       |
| 이미지 변환 서버                      | 없음. 방문자 브라우저에서 처리하니 사용자가 늘어도 0원 |
| 도메인 `.com` (Cloudflare)            | 연 $10.44, 2026-11-01부터 연 $11.15 (약 1.5만 원)      |
| AdSense · Search Console · JSZip(CDN) | 0원                                                    |

**합계: 1년에 1.5만 원 정도 (도메인 값뿐)**
