/**
 * 집 근처 맛집 목록
 *
 * 여기는 직접 채우는 곳입니다. 실제로 가본 곳을 적어야 룰렛이 쓸모 있습니다.
 * tools/fetch-places.mjs 를 쓰면 카카오맵에서 후보를 뽑아 이 형식으로
 * 만들어 줍니다 (data/places.json). 거기서 마음에 드는 것만 골라
 * 이 파일로 옮겨도 되고, data/places.json 을 그대로 써도 됩니다.
 *
 * 가게 한 곳의 모양 — 이름 말고는 전부 선택 항목입니다.
 *   {
 *     name:     "가게 이름",              // 필수
 *     category: "한식",                   // 한식 중식 일식 양식 아시안 분식 카페 술집
 *     emoji:    "🍲",
 *     walk:     7,                        // 걸어서 몇 분
 *     price:    2,                        // 1 저렴 · 2 보통 · 3 비쌈
 *     tags:     ["국물", "혼밥"],
 *     url:      "https://place.map.kakao.com/...",   // 카카오맵 링크
 *     phone:    "031-000-0000",
 *     note:     "김치찌개가 낫다"
 *   }
 */
window.FOODPICK_PLACES = [
  // 예시입니다. 지우고 실제 가게로 채우세요.
  // {
  //   name: "원당식당",
  //   category: "한식",
  //   emoji: "🍲",
  //   walk: 6,
  //   price: 1,
  //   tags: ["백반", "혼밥"],
  //   url: "https://map.kakao.com/?q=원당식당",
  //   note: "점심 백반이 빠르다"
  // },
];
