/**
 * FoodPick 기본 레시피 (직접 작성한 샘플)
 *
 * 이 파일은 앱이 어떤 데이터 모양을 기대하는지 보여주는 기준이자,
 * 네트워크·API 키 없이도 레시피 카드가 채워지도록 하는 기본 데이터입니다.
 * tools/fetch-recipes.mjs 를 돌리면 같은 모양의 데이터가
 * data/recipes.json 으로 생성되고, 앱이 둘을 합쳐서 보여줍니다.
 *
 * 레시피 한 건의 모양:
 *   {
 *     id, title, minutes, servings, difficulty(쉬움|보통|어려움), kcal,
 *     image, ingredients: [{ name, amount }], steps: ["...", ...],
 *     source: { name, url }        // 출처 표기 (필수)
 *   }
 */
window.FOODPICK_RECIPES = {
  "김치찌개": [
    {
      id: "fp-kimchi-jjigae-pork",
      title: "돼지고기 김치찌개",
      minutes: 25, servings: 2, difficulty: "쉬움", kcal: 420,
      ingredients: [
        { name: "잘 익은 배추김치", amount: "300g" },
        { name: "돼지고기 앞다리살", amount: "200g" },
        { name: "두부", amount: "1/2모" },
        { name: "대파", amount: "1대" },
        { name: "김치국물", amount: "4큰술" },
        { name: "고춧가루", amount: "1큰술" },
        { name: "국간장", amount: "1큰술" },
        { name: "설탕", amount: "1/2작은술" },
        { name: "쌀뜨물", amount: "500ml" }
      ],
      steps: [
        "김치는 3cm 폭으로 썰고, 돼지고기는 한입 크기로 자릅니다.",
        "냄비에 기름을 두르고 돼지고기를 겉면이 하얘질 때까지 볶습니다.",
        "김치와 고춧가루, 설탕을 넣고 5분간 더 볶아 김치의 신맛을 날립니다.",
        "쌀뜨물과 김치국물을 붓고 센 불로 끓인 뒤, 중불로 낮춰 15분 끓입니다.",
        "두부와 대파를 넣고 3분 더 끓입니다. 국간장으로 간을 맞춰 마무리합니다."
      ],
      source: { name: "FoodPick 기본 레시피", url: "" }
    },
    {
      id: "fp-kimchi-jjigae-tuna",
      title: "참치 김치찌개",
      minutes: 18, servings: 2, difficulty: "쉬움", kcal: 380,
      ingredients: [
        { name: "배추김치", amount: "300g" },
        { name: "참치캔", amount: "1캔(150g)" },
        { name: "양파", amount: "1/2개" },
        { name: "두부", amount: "1/2모" },
        { name: "대파", amount: "1/2대" },
        { name: "다진 마늘", amount: "1작은술" },
        { name: "고춧가루", amount: "1큰술" },
        { name: "물", amount: "400ml" }
      ],
      steps: [
        "참치캔은 기름만 살짝 따라내고 살은 남겨둡니다.",
        "냄비에 참치 기름을 조금 두르고 김치와 양파를 4분간 볶습니다.",
        "물을 붓고 다진 마늘, 고춧가루를 넣어 10분간 끓입니다.",
        "참치살과 두부를 넣고 5분 더 끓입니다. 참치는 오래 끓이면 부서집니다.",
        "대파를 올려 불을 끕니다. 간이 부족하면 김치국물로 조절하세요."
      ],
      source: { name: "FoodPick 기본 레시피", url: "" }
    }
  ],

  "된장찌개": [
    {
      id: "fp-doenjang-basic",
      title: "기본 된장찌개",
      minutes: 20, servings: 2, difficulty: "쉬움", kcal: 210,
      ingredients: [
        { name: "된장", amount: "2큰술" },
        { name: "애호박", amount: "1/3개" },
        { name: "감자", amount: "1개" },
        { name: "양파", amount: "1/2개" },
        { name: "두부", amount: "1/2모" },
        { name: "청양고추", amount: "1개" },
        { name: "다진 마늘", amount: "1작은술" },
        { name: "멸치다시육수", amount: "500ml" }
      ],
      steps: [
        "육수를 끓이면서 된장을 체에 걸러 풀어줍니다. 덩어리가 남으면 맛이 겉돕니다.",
        "감자를 먼저 넣고 5분간 익힙니다.",
        "애호박, 양파를 넣고 5분 더 끓입니다.",
        "두부와 다진 마늘을 넣고 3분간 끓입니다.",
        "청양고추를 넣고 1분 뒤 불을 끕니다."
      ],
      source: { name: "FoodPick 기본 레시피", url: "" }
    },
    {
      id: "fp-doenjang-beef",
      title: "소고기 된장찌개",
      minutes: 30, servings: 3, difficulty: "보통", kcal: 300,
      ingredients: [
        { name: "소고기 국거리", amount: "150g" },
        { name: "된장", amount: "2.5큰술" },
        { name: "고추장", amount: "1/2큰술" },
        { name: "무", amount: "100g" },
        { name: "애호박", amount: "1/3개" },
        { name: "두부", amount: "1/2모" },
        { name: "대파", amount: "1대" },
        { name: "참기름", amount: "1큰술" },
        { name: "물", amount: "600ml" }
      ],
      steps: [
        "냄비에 참기름을 두르고 소고기를 볶아 겉면을 익힙니다.",
        "무를 넣고 2분간 함께 볶습니다.",
        "물을 붓고 된장과 고추장을 풀어 10분간 끓입니다.",
        "애호박과 두부를 넣고 8분 더 끓입니다.",
        "대파를 넣고 2분 뒤 불을 끕니다. 밥에 곁들여 냅니다."
      ],
      source: { name: "FoodPick 기본 레시피", url: "" }
    }
  ],

  "순두부찌개": [
    {
      id: "fp-sundubu-seafood",
      title: "해물 순두부찌개",
      minutes: 20, servings: 2, difficulty: "쉬움", kcal: 260,
      ingredients: [
        { name: "순두부", amount: "1봉(350g)" },
        { name: "바지락", amount: "150g" },
        { name: "새우", amount: "6마리" },
        { name: "고춧가루", amount: "1.5큰술" },
        { name: "다진 마늘", amount: "1큰술" },
        { name: "국간장", amount: "1큰술" },
        { name: "참기름", amount: "1큰술" },
        { name: "계란", amount: "1개" },
        { name: "물", amount: "300ml" }
      ],
      steps: [
        "뚝배기에 참기름과 고춧가루를 넣고 약불에서 30초만 볶아 고추기름을 냅니다.",
        "다진 마늘을 넣고 향이 오르면 물을 붓습니다.",
        "바지락과 새우를 넣고 끓여 조개 입이 벌어지면 거품을 걷어냅니다.",
        "순두부를 큼직하게 떠 넣고 국간장으로 간을 맞춥니다.",
        "5분간 끓인 뒤 계란을 깨 올려 바로 불을 끕니다."
      ],
      source: { name: "FoodPick 기본 레시피", url: "" }
    }
  ],

  "제육볶음": [
    {
      id: "fp-jeyuk-classic",
      title: "매콤 제육볶음",
      minutes: 25, servings: 3, difficulty: "쉬움", kcal: 520,
      ingredients: [
        { name: "돼지고기 앞다리살", amount: "500g" },
        { name: "양파", amount: "1개" },
        { name: "대파", amount: "1대" },
        { name: "고추장", amount: "2큰술" },
        { name: "고춧가루", amount: "2큰술" },
        { name: "간장", amount: "2큰술" },
        { name: "설탕", amount: "1큰술" },
        { name: "다진 마늘", amount: "1큰술" },
        { name: "맛술", amount: "1큰술" },
        { name: "참기름", amount: "1큰술" }
      ],
      steps: [
        "고추장·고춧가루·간장·설탕·다진 마늘·맛술을 섞어 양념장을 만듭니다.",
        "돼지고기에 양념장을 버무려 20분 이상 재웁니다. 하루 재우면 더 좋습니다.",
        "센 불로 달군 팬에 고기를 펼쳐 넣고 물이 나오지 않게 빠르게 볶습니다.",
        "고기가 8할쯤 익으면 양파를 넣고 3분간 볶습니다.",
        "대파와 참기름을 넣고 30초만 더 볶아 불을 끕니다."
      ],
      source: { name: "FoodPick 기본 레시피", url: "" }
    }
  ],

  "김치볶음밥": [
    {
      id: "fp-kimchi-fried-rice",
      title: "기본 김치볶음밥",
      minutes: 15, servings: 1, difficulty: "쉬움", kcal: 480,
      ingredients: [
        { name: "찬밥", amount: "1공기" },
        { name: "배추김치", amount: "150g" },
        { name: "스팸 또는 베이컨", amount: "50g" },
        { name: "계란", amount: "1개" },
        { name: "김치국물", amount: "2큰술" },
        { name: "간장", amount: "1작은술" },
        { name: "설탕", amount: "1/2작은술" },
        { name: "식용유", amount: "1큰술" },
        { name: "김가루·참기름", amount: "적당량" }
      ],
      steps: [
        "김치와 스팸을 잘게 썹니다. 잘게 썰수록 밥에 잘 섞입니다.",
        "팬에 기름을 두르고 스팸을 노릇하게 볶습니다.",
        "김치와 설탕을 넣고 3분간 볶아 신맛을 눌러줍니다.",
        "밥과 김치국물, 간장을 넣고 주걱으로 눌러가며 볶습니다.",
        "접시에 담고 참기름·김가루를 뿌린 뒤 계란후라이를 올립니다."
      ],
      source: { name: "FoodPick 기본 레시피", url: "" }
    }
  ],

  "떡볶이": [
    {
      id: "fp-tteokbokki-classic",
      title: "국물 떡볶이",
      minutes: 20, servings: 2, difficulty: "쉬움", kcal: 450,
      ingredients: [
        { name: "떡볶이 떡", amount: "300g" },
        { name: "사각어묵", amount: "2장" },
        { name: "대파", amount: "1대" },
        { name: "고추장", amount: "2큰술" },
        { name: "고춧가루", amount: "1큰술" },
        { name: "설탕", amount: "1.5큰술" },
        { name: "간장", amount: "1큰술" },
        { name: "멸치다시육수", amount: "500ml" },
        { name: "삶은 계란", amount: "2개" }
      ],
      steps: [
        "떡이 딱딱하면 미지근한 물에 10분 담가둡니다.",
        "육수에 고추장·고춧가루·설탕·간장을 풀어 끓입니다.",
        "끓기 시작하면 떡을 넣고 중불에서 8분간 저어가며 끓입니다.",
        "어묵을 넣고 4분 더 끓여 국물이 걸쭉해지게 합니다.",
        "대파와 삶은 계란을 넣고 2분 뒤 불을 끕니다."
      ],
      source: { name: "FoodPick 기본 레시피", url: "" }
    },
    {
      id: "fp-tteokbokki-rose",
      title: "로제 떡볶이",
      minutes: 20, servings: 2, difficulty: "쉬움", kcal: 560,
      ingredients: [
        { name: "떡볶이 떡", amount: "300g" },
        { name: "우유", amount: "300ml" },
        { name: "생크림", amount: "100ml" },
        { name: "고추장", amount: "1큰술" },
        { name: "고춧가루", amount: "1큰술" },
        { name: "설탕", amount: "1큰술" },
        { name: "베이컨", amount: "3장" },
        { name: "슬라이스 치즈", amount: "1장" },
        { name: "다진 마늘", amount: "1작은술" }
      ],
      steps: [
        "팬에 베이컨을 볶아 기름을 낸 뒤 다진 마늘을 넣고 향을 냅니다.",
        "고추장·고춧가루·설탕을 넣고 약불에서 1분간 볶습니다.",
        "우유를 붓고 잘 풀어준 다음 떡을 넣습니다.",
        "중불에서 8분간 저어가며 끓여 소스를 졸입니다.",
        "생크림과 치즈를 넣고 2분 더 끓여 농도를 맞춥니다."
      ],
      source: { name: "FoodPick 기본 레시피", url: "" }
    }
  ],

  "토마토파스타": [
    {
      id: "fp-tomato-pasta",
      title: "토마토 스파게티",
      minutes: 25, servings: 2, difficulty: "쉬움", kcal: 520,
      ingredients: [
        { name: "스파게티면", amount: "180g" },
        { name: "토마토 홀캔", amount: "1캔(400g)" },
        { name: "양파", amount: "1/2개" },
        { name: "마늘", amount: "4쪽" },
        { name: "올리브오일", amount: "3큰술" },
        { name: "설탕", amount: "1작은술" },
        { name: "소금·후추", amount: "적당량" },
        { name: "바질 또는 파슬리", amount: "적당량" },
        { name: "파르미지아노", amount: "적당량" }
      ],
      steps: [
        "물 2L에 소금 1큰술을 넣고 면을 표기 시간보다 1분 짧게 삶습니다. 면수는 버리지 마세요.",
        "팬에 올리브오일을 두르고 편 썬 마늘을 약불에서 노릇하게 굽습니다.",
        "양파를 넣고 투명해질 때까지 볶습니다.",
        "토마토 홀을 으깨 넣고 설탕과 소금을 넣어 10분간 졸입니다.",
        "면과 면수 반 국자를 넣고 30초간 세게 섞어 소스를 면에 붙입니다.",
        "그릇에 담고 치즈와 바질을 올립니다."
      ],
      source: { name: "FoodPick 기본 레시피", url: "" }
    }
  ],

  "미역국": [
    {
      id: "fp-miyeok-beef",
      title: "소고기 미역국",
      minutes: 30, servings: 3, difficulty: "쉬움", kcal: 150,
      ingredients: [
        { name: "건미역", amount: "20g" },
        { name: "소고기 국거리", amount: "150g" },
        { name: "국간장", amount: "2큰술" },
        { name: "다진 마늘", amount: "1작은술" },
        { name: "참기름", amount: "1큰술" },
        { name: "물", amount: "1.2L" },
        { name: "소금", amount: "적당량" }
      ],
      steps: [
        "건미역을 찬물에 20분 불린 뒤 두세 번 헹궈 물기를 짭니다.",
        "냄비에 참기름을 두르고 소고기를 볶습니다.",
        "미역을 넣고 5분간 함께 볶습니다. 이 과정이 국물 맛을 결정합니다.",
        "국간장을 넣고 1분 더 볶은 뒤 물을 붓습니다.",
        "센 불로 끓이다 중불로 낮춰 20분간 끓입니다.",
        "다진 마늘을 넣고 소금으로 간을 맞춰 마무리합니다."
      ],
      source: { name: "FoodPick 기본 레시피", url: "" }
    }
  ]
};
