/**
 * 수집 스크립트 공용 파서
 * tools/crawl.mjs 와 tools/fetch-recipes.mjs 가 같이 씁니다.
 */

/* 분량이 아닌 것으로 취급할 꼬리말 (숫자가 없어도 분량인 표현) */
const LOOSE_AMOUNT = /^(약간|적당량|조금|기호에\s*따라|취향껏|넉넉히|한줌|반줌)$/;

/**
 * "육우(불고기용) 200g" → { name: "육우(불고기용)", amount: "200g" }
 *
 * 단위 목록을 늘려가며 맞추는 방식은 새 단위가 나오면 바로 깨집니다.
 * 마지막 공백을 기준으로 자르고, 꼬리에 숫자가 있거나 분량 표현이면
 * 분량으로 보는 규칙이 훨씬 잘 버팁니다.
 *   "김밥용 김 4장"  → 김밥용 김 / 4장     (마지막 공백 기준)
 *   "식용유 약간"     → 식용유 / 약간       (숫자 없지만 분량 표현)
 *   "후추 톡톡3번"    → 후추 / 톡톡3번      (숫자 포함)
 *   "다진마늘"        → 다진마늘 / ""       (공백 없음)
 */
export function splitIngredient(line) {
  const text = String(line ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  const at = text.lastIndexOf(" ");
  if (at === -1) return { name: text, amount: "" };

  const head = text.slice(0, at).trim();
  const tail = text.slice(at + 1).trim();

  const isAmount = /\d/.test(tail) || LOOSE_AMOUNT.test(tail);
  if (!head || !isAmount) return { name: text, amount: "" };

  return { name: head, amount: tail };
}

/** "PT0H60M" / "PT1H30M" / "PT90M" → 분. 못 읽으면 null */
export function isoMinutes(value) {
  const m = String(value ?? "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;

  const minutes = (Number(m[1] || 0) * 60) + Number(m[2] || 0) + Math.round(Number(m[3] || 0) / 60);
  return minutes > 0 ? minutes : null;
}

/** "2 servings" / "4인분" / "2~3인분" → 2 (앞의 수). 못 읽으면 null */
export function parseYield(value) {
  const m = String(value ?? "").match(/(\d+)/);
  if (!m) return null;

  const n = Number(m[1]);
  return n > 0 && n < 100 ? n : null;
}

/** 문자열이 http(s) URL 인지 */
export function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\/\S+$/.test(value);
}
