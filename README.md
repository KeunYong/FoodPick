# FoodPick

오늘 뭐 먹을지 3초에 끝내는 랜덤 메뉴 뽑기. 끼니를 고르고 버튼을 누르면
식권 한 장이 나오고, 그 메뉴의 레시피가 바로 아래에 펼쳐집니다.

```
아침 · 점심 · 저녁 · 아무거나
        ↓
   식권 한 장 (메뉴 + 분류 + 조리시간 + 매운맛)
        ↓
   인기 레시피 2~3건 (재료 + 조리순서)
        ↓
   마음에 들면 저장
```

## 구성

| 기능 | 설명 |
| --- | --- |
| 오늘의 추천 | 시간대에 맞는 메뉴 3개. 날짜 기준 고정이라 새로고침해도 그대로입니다. |
| 랜덤 뽑기 | 필터를 통과한 후보에서 한 개. 같은 메뉴 연속으로 안 나옵니다. |
| 레시피 카드 | 재료·조리순서를 자체 템플릿으로 렌더. 외부 링크로 튕기지 않습니다. |
| 저장 | 레시피 저장, 메뉴 찜하기. 브라우저에만 남습니다(localStorage). |
| 기록 | 최근 뽑은 메뉴 24건. "최근 뽑은 메뉴 제외" 필터와 연동됩니다. |
| 공유 | `?m=메뉴이름` 링크 복사. 열면 그 메뉴가 바로 보입니다. |

## 실행

빌드 도구가 없습니다. 정적 파일 그대로입니다.

```bash
python3 -m http.server 8000
# http://localhost:8000
```

`index.html` 을 파일로 직접 열어도 동작하지만, 그때는 `data/*.json`
(수집 데이터)을 못 읽어서 기본 레시피만 보입니다.

## 배포

GitHub Pages: Settings → Pages → Source `main` / `root`. 끝입니다.

## 데이터

```
assets/js/menus.js     메뉴 165종 — 한 줄에 한 메뉴, 직접 편집하는 원본
assets/js/recipes.js   기본 레시피 11건 — 직접 작성. 앱의 데이터 모양 기준
data/recipes.json      tools/fetch-recipes.mjs 가 생성 (있으면 병합)
data/photos.json       tools/crawl.mjs 가 생성 (있으면 병합)
```

메뉴를 추가하려면 `assets/js/menus.js` 에 한 줄 넣으면 됩니다.

```js
["김치찌개", "🍲", "ld", "ko", 25, 2, 0, "국물,밥,돼지고기"]
//  이름     이모지  끼니  분류  분  매움 채식  태그
//                  b아침 l점심 d저녁 / ko한식 cn중식 jp일식 we양식 as아시안 bs분식
```

### 레시피 채우기 — 식약처 공공 API

식품의약품안전처 「조리식품의 레시피 DB」(COOKRCP01). 재료, 단계별 조리순서,
사진, 칼로리가 들어 있고 **공공데이터라 우리 템플릿에 그대로 렌더할 수 있습니다.**
조건은 출처 표시이고, 각 카드에 자동으로 표기됩니다.

```bash
# 1. 인증키 발급 (무료): https://openapi.foodsafetykorea.go.kr
# 2. 구조 확인
node tools/fetch-recipes.mjs --key=발급받은키 --check
# 3. 전체 수집 → data/recipes.json
node tools/fetch-recipes.mjs --key=발급받은키
```

### 썸네일 채우기 — 만개의레시피

메뉴 이름으로 검색해 **첫 결과의 썸네일 URL과 레시피 주소만** 기록합니다.
레시피 본문은 가져오지 않고, 앱은 저장된 주소로 원문을 링크합니다.

```bash
node tools/crawl.mjs --check     # 선택자가 아직 유효한지 1건 확인
node tools/crawl.mjs             # data/photos.json 채우기 (이어받기 지원)
```

실행 전에 알아둘 것:

- 이 스크립트는 **사용자가 직접 실행하는 도구**입니다. 사이트의 robots.txt 는
  `ClaudeBot` 을 전체 차단하고 `Content-Signal: ai-train=no, use=reference` 를
  선언하고 있어, AI 에이전트가 대신 수집하지 않습니다.
- 스크립트가 시작할 때 robots.txt 를 다시 확인하고, `User-agent: *` 기준으로
  대상 경로가 막혀 있으면 스스로 중단합니다. 요청 간격은 기본 1.2초입니다.
- 썸네일과 레시피 저작권은 **사이트가 아니라 레시피를 올린 개인**에게 있습니다.
  수집한 이미지를 공개 사이트에 재배포하는 것은 별개의 판단이 필요합니다.
  그래서 `data/photos.json` 은 기본적으로 `.gitignore` 에 들어 있습니다.

### 데이터 소스를 바꾸려면

레시피 데이터는 하나의 모양으로만 앱에 들어옵니다.

```js
{
  id, title, minutes, servings, difficulty, kcal, image,
  ingredients: [{ name, amount }],
  steps: ["...", ...],
  source: { name, url }     // 출처 표기 (필수)
}
```

`data/recipes.json` 을 이 모양으로 만들어 주는 스크립트만 새로 쓰면
앱은 손대지 않아도 됩니다. `tools/fetch-recipes.mjs` 가 그 예입니다.

## 만든 방식

- 프레임워크·빌드 없음. HTML 1개, CSS 1개, JS 3개.
- 외부에서 들여온 문자열은 전부 `textContent` 로만 넣습니다.
- 이미지 URL은 `https://` 로 시작하는지 검사한 뒤 사용합니다.
- `prefers-reduced-motion` 을 켜면 애니메이션 없이 결과만 나옵니다.
- 키보드: `Space` 로 뽑기, 모든 컨트롤에 포커스 표시가 있습니다.
