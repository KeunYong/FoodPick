/* ============================================================
   FoodPick

   구성
     1) 추천 메뉴 + 랜덤 뽑기
     2) 뽑힌 메뉴의 인기 레시피 2~3건을 자체 템플릿으로 렌더
     3) 마음에 든 레시피/메뉴 저장

   데이터
     menus.js    메뉴 목록 (원본)
     recipes.js  기본 레시피 (직접 작성)
     data/recipes.json  tools/fetch-recipes.mjs 로 수집한 레시피 (있으면 병합)
     data/photos.json   tools/crawl.mjs 로 수집한 썸네일/링크 (있으면 병합)

   외부에서 들여온 문자열은 항상 textContent 로만 넣습니다.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- 상수 ---------- */

  var CUISINES = { ko: "한식", cn: "중식", jp: "일식", we: "양식", as: "아시안", bs: "분식" };
  var MEALS = { b: "아침", l: "점심", d: "저녁", "*": "아무거나" };
  var SPICY = ["안 매움", "약간 매움", "매움", "아주 매움"];

  /* '아무거나' 는 시간대를 아예 따지지 않는 모드입니다.
     식권에 현재 시각 기준 끼니를 찍으면 모드와 어긋나므로 '종일' 로 표기합니다. */
  var ALL_DAY = "종일";
  var SEARCH_URL = "https://www.10000recipe.com/recipe/list.html?q=";
 
  var STORE = {
    history: "foodpick.history",
    favs: "foodpick.favs",
    saved: "foodpick.saved",
    prefs: "foodpick.prefs"
  };

  var HISTORY_MAX = 24;
  var RECENT_WINDOW = 7;
  var ROLL_MS = 850;
  var RECIPES_SHOWN = 3;
  var TODAY_SHOWN = 3;

  /* ---------- 메뉴 ---------- */

  var menus = (window.FOODPICK_MENUS || []).map(function (row, i) {
    return {
      id: row[0], name: row[0], emoji: row[1], meals: row[2], cuisine: row[3],
      minutes: row[4], spicy: row[5], veg: !!row[6],
      tags: row[7] ? row[7].split(",") : [],
      role: row[8] || "main",   /* main=집밥 side=반찬 out=사먹는 것 */
      serial: String(i + 1).padStart(4, "0"),
      hue: hueOf(row[0]),
      image: null, link: null
    };
  });

  /* 맛집을 메뉴와 같은 모양으로 맞춥니다. 이러면 룰렛·식권·찜·기록·공유가
     그대로 재사용됩니다. id 는 메뉴 이름과 겹치지 않게 "p:" 를 붙입니다. */
  var PLACE_CATS = ["한식", "중식", "일식", "양식", "아시안", "분식", "카페", "술집"];

  var places = (window.FOODPICK_PLACES || [])
    .filter(function (p) { return p && p.name; })
    .map(function (p, i) {
      return {
        id: "p:" + p.name,
        name: String(p.name),
        emoji: p.emoji || "📍",
        meals: "bld",
        cuisine: PLACE_CATS.indexOf(p.category) !== -1 ? p.category : "기타",
        minutes: numOrNull(p.walk),          /* 도보 분 */
        spicy: 0,
        veg: false,
        role: "main",
        tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
        serial: "P" + String(i + 1).padStart(3, "0"),
        hue: hueOf(p.name),
        image: null,
        link: isHttp(p.url) ? p.url : null,
        isPlace: true,
        price: [1, 2, 3].indexOf(Number(p.price)) !== -1 ? Number(p.price) : null,
        phone: p.phone ? String(p.phone) : "",
        note: p.note ? String(p.note) : ""
      };
    });

  var byId = {};
  menus.concat(places).forEach(function (m) { byId[m.id] = m; });

  function activeList() {
    return state.mode === "eat" ? places : menus;
  }

  /* ---------- 레시피 저장소 ---------- */

  var recipes = {};        /* 메뉴이름 -> [레시피] */
  var recipeById = {};     /* 레시피id -> { recipe, menu } */

  function addRecipes(map, tag) {
    if (!map) return;
    Object.keys(map).forEach(function (menuName) {
      if (!byId[menuName]) return;
      var list = map[menuName];
      if (!Array.isArray(list)) return;

      recipes[menuName] = recipes[menuName] || [];
      list.forEach(function (r) {
        if (!r || !r.id || recipeById[r.id]) return;
        var clean = normalizeRecipe(r, tag);
        if (!clean) return;
        recipes[menuName].push(clean);
        recipeById[clean.id] = { recipe: clean, menu: menuName };
      });
    });
  }

  function normalizeRecipe(r, tag) {
    if (!r.title) return null;
    return {
      id: String(r.id),
      title: String(r.title),
      minutes: numOrNull(r.minutes),
      servings: numOrNull(r.servings),
      difficulty: r.difficulty ? String(r.difficulty) : null,
      kcal: numOrNull(r.kcal),
      image: isHttp(r.image) ? r.image : null,
      ingredients: Array.isArray(r.ingredients)
        ? r.ingredients.filter(function (x) { return x && x.name; }).map(function (x) {
            return { name: String(x.name), amount: x.amount ? String(x.amount) : "" };
          })
        : [],
      steps: Array.isArray(r.steps) ? r.steps.filter(Boolean).map(String) : [],
      stepImages: Array.isArray(r.stepImages)
        ? r.stepImages.map(function (u) { return isHttp(u) ? u : null; })
        : [],
      rating: numOrNull(r.rating),
      reviews: isFinite(Number(r.reviews)) && Number(r.reviews) >= 0 ? Number(r.reviews) : null,
      source: {
        name: r.source && r.source.name ? String(r.source.name) : tag,
        url: r.source && isHttp(r.source.url) ? r.source.url : ""
      }
    };
  }

  function isHttp(v) {
    return typeof v === "string" && /^https?:\/\/\S+$/.test(v);
  }

  function numOrNull(v) {
    var n = Number(v);
    return isFinite(n) && n > 0 ? n : null;
  }

  function recipesFor(menuName) {
    return (recipes[menuName] || []).slice(0, RECIPES_SHOWN);
  }

  function recipeTotal() {
    return Object.keys(recipeById).length;
  }

  /* ---------- DOM ---------- */

  var $ = function (id) { return document.getElementById(id); };

  var el = {
    clockTime: $("clockTime"), clockMeal: $("clockMeal"),
    mealTabs: Array.prototype.slice.call(document.querySelectorAll(".meal")),
    modeTabs: Array.prototype.slice.call(document.querySelectorAll(".mode")),
    mealTabsBox: $("mealTabs"), placeEmpty: $("placeEmpty"),
    pickerHeadline: $("pickerHeadline"), homeToggles: $("homeToggles"),
    cuisineLabel: $("cuisineLabel"), minutesLabel: $("minutesLabel"),
    spicyField: $("spicyField"), priceField: $("priceField"), priceChips: $("priceChips"),
    placeTotal: $("placeTotal"),
    ticketEmpty: $("ticketEmpty"), ticket: $("ticket"),
    photo: $("photo"), photoImg: $("photoImg"), photoEmoji: $("photoEmoji"),
    stubMeal: $("stubMeal"), stubSuffix: $("stubSuffix"), name: $("name"), meta: $("meta"), serial: $("serial"),
    stamp: $("stamp"), stampMeal: $("stampMeal"),
    pick: $("pick"), pickLabel: $("pickLabel"),
    fav: $("fav"), share: $("share"), search: $("search"),
    toast: $("toast"), candidateNote: $("candidateNote"),

    recipeSection: $("recipeSection"), recipeFor: $("recipeFor"),
    recipeCount: $("recipeCount"), recipeList: $("recipeList"), recipeEmpty: $("recipeEmpty"),

    todaySection: $("todaySection"), todayTitle: $("todayTitle"),
    todayList: $("todayList"), rerollToday: $("rerollToday"),

    filterCount: $("filterCount"), cuisineChips: $("cuisineChips"), spicyChips: $("spicyChips"),
    minutes: $("minutes"), minutesOut: $("minutesOut"),
    vegOnly: $("vegOnly"), avoidRecent: $("avoidRecent"), recipeOnly: $("recipeOnly"),
    includeSides: $("includeSides"), includeOut: $("includeOut"),
    resetFilters: $("resetFilters"),

    boxSection: $("boxSection"), boxCount: $("boxCount"),
    savedBlock: $("savedBlock"), savedList: $("savedList"),
    favBlock: $("favBlock"), favs: $("favs"),

    historySection: $("historySection"), history: $("history"), clearHistory: $("clearHistory"),
    totalCount: $("totalCount"), recipeTotalOut: $("recipeTotal")
  };

  /* ---------- 상태 ---------- */

  var state = {
    mode: "home",                /* home=집밥 eat=동네 맛집 */
    meal: mealOfHour(new Date().getHours()),
    cuisines: [], spicy: [], maxMinutes: 120,
    vegOnly: false, avoidRecent: true, recipeOnly: false, includeSides: false, includeOut: false, prices: [],
    current: null, rolling: false, todayNudge: 0
  };

  var history = load(STORE.history, []);
  var favs = load(STORE.favs, []);
  var saved = load(STORE.saved, []);   /* [{ id, menu, title }] */

  /* ---------- 유틸 ---------- */

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      var v = raw ? JSON.parse(raw) : fallback;
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 무시 */ }
  }

  /* 배경 그라데이션 색조를 음식 계열(붉은빛 → 올리브)로 제한합니다.
     360도 전체를 쓰면 김치찌개가 파란 카드로 나옵니다. */
  function hueOf(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 997;
    return 8 + (h % 64);
  }

  function mealOfHour(h) {
    if (h >= 4 && h < 10) return "b";
    if (h >= 10 && h < 16) return "l";
    return "d";
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  /* 날짜 기반 고정 난수 — 추천이 새로고침마다 바뀌지 않게 */
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeEl(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  var toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove("is-on"); }, 2400);
  }

  /* ---------- 시계 ---------- */

  function tickClock() {
    var now = new Date();
    el.clockTime.textContent = pad2(now.getHours()) + ":" + pad2(now.getMinutes());
    el.clockMeal.textContent = MEALS[mealOfHour(now.getHours())] + " 시간";
  }

  /* ---------- 후보 ---------- */

  /* 기본은 집에서 해먹는 메인만 뽑습니다.
     반찬(장조림)과 사먹는 메뉴(치킨·초밥)는 필터에서 켜야 나옵니다. */
  function allowsRole(menu) {
    if (menu.role === "side") return state.includeSides;
    if (menu.role === "out") return state.includeOut;
    return true;
  }

  function candidates(ignoreRecent) {
    var recent = state.avoidRecent && !ignoreRecent
      ? history.slice(0, RECENT_WINDOW).map(function (h) { return h.id; })
      : [];

    return activeList().filter(function (m) {
      if (recent.indexOf(m.id) !== -1) return false;
      if (state.cuisines.length && state.cuisines.indexOf(m.cuisine) === -1) return false;
      if (m.minutes != null && m.minutes > state.maxMinutes) return false;

      if (m.isPlace) {
        if (state.prices.length && state.prices.indexOf(m.price) === -1) return false;
        return true;
      }

      if (!allowsRole(m)) return false;
      if (state.meal !== "*" && m.meals.indexOf(state.meal) === -1) return false;
      if (state.spicy.length && state.spicy.indexOf(m.spicy) === -1) return false;
      if (state.vegOnly && !m.veg) return false;
      if (state.recipeOnly && !(recipes[m.id] || []).length) return false;
      return true;
    });
  }

  function refreshCounts() {
    var n = candidates().length;
    el.candidateNote.innerHTML = "후보 <b>" + n + "</b>개";

    var active = state.mode === "eat"
      ? state.cuisines.length + state.prices.length + (state.maxMinutes < 120 ? 1 : 0)
      : state.cuisines.length + state.spicy.length
        + (state.vegOnly ? 1 : 0) + (state.recipeOnly ? 1 : 0)
        + (state.includeSides ? 1 : 0) + (state.includeOut ? 1 : 0)
        + (state.maxMinutes < 120 ? 1 : 0);
    el.filterCount.textContent = active ? active + "개 적용 · 후보 " + n : "후보 " + n;

    var noun = state.mode === "eat" ? "맛집" : "메뉴";
    if (n === 0 && candidates(true).length === 0) el.pickLabel.textContent = "조건에 맞는 " + noun + " 없음";
    else if (state.current) el.pickLabel.textContent = "다시 뽑기";
    else el.pickLabel.textContent = state.mode === "eat" ? "맛집 뽑기" : "식권 뽑기";
  }

  /* ---------- 뽑기 ---------- */

  function draw() {
    if (state.rolling) return;

    var pool = candidates();
    var relaxed = false;

    if (!pool.length) {
      pool = candidates(true);
      relaxed = pool.length > 0;
    }
    if (!pool.length) {
      toast("조건이 너무 좁습니다. 필터를 풀어주세요.");
      return;
    }

    var winner = pool[Math.floor(Math.random() * pool.length)];
    if (state.current && pool.length > 1) {
      while (winner.id === state.current.id) {
        winner = pool[Math.floor(Math.random() * pool.length)];
      }
    }

    roll(pool, function () {
      show(winner, true);
      if (relaxed) toast("후보가 없어 최근 뽑은 메뉴까지 포함했습니다.");
    });
  }

  function roll(pool, done) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { done(); return; }

    state.rolling = true;
    el.pick.disabled = true;
    el.ticketEmpty.hidden = true;
    el.ticket.hidden = false;
    el.recipeSection.hidden = true;
    el.name.classList.add("is-rolling");
    el.stamp.style.visibility = "hidden";

    var start = Date.now();
    var timer = setInterval(function () {
      var m = pool[Math.floor(Math.random() * pool.length)];
      el.name.textContent = m.name;
      el.photoEmoji.textContent = m.emoji;
      el.photo.classList.remove("has-img");
      el.photoImg.hidden = true;
      el.photo.style.setProperty("--hue", m.hue);

      if (Date.now() - start >= ROLL_MS) {
        clearInterval(timer);
        el.name.classList.remove("is-rolling");
        el.stamp.style.visibility = "";
        el.pick.disabled = false;
        state.rolling = false;
        done();
      }
    }, 65);
  }

  /* ---------- 식권 렌더 ---------- */

  function show(menu, record) {
    state.current = menu;

    el.ticketEmpty.hidden = true;
    el.ticket.hidden = false;

    var mealLabel = menu.isPlace
      ? "맛집"
      : (state.meal === "*" ? ALL_DAY : MEALS[state.meal]);
    el.stubMeal.textContent = mealLabel;
    el.stampMeal.textContent = mealLabel;
    el.stubSuffix.textContent = menu.isPlace ? " 다녀오기" : " 식권";

    el.name.textContent = menu.name;
    el.serial.textContent = menu.serial;
    el.photo.style.setProperty("--hue", menu.hue);
    el.photoEmoji.textContent = menu.emoji;

    setPhoto(menu);
    renderMeta(menu);

    el.search.hidden = false;
    if (menu.isPlace) {
      el.search.href = menu.link || ("https://map.kakao.com/?q=" + encodeURIComponent(menu.name));
      el.search.textContent = "🗺 지도에서 보기";
      el.search.title = menu.name + " 카카오맵에서 열기";
    } else {
      el.search.href = menu.link || (SEARCH_URL + encodeURIComponent(menu.name));
      el.search.textContent = "🔎 더 찾아보기";
      el.search.title = "만개의레시피에서 " + menu.name + " 더 찾아보기";
    }

    el.fav.disabled = false;
    el.share.disabled = false;
    syncFavButton();

    if (menu.isPlace) {
      el.recipeSection.hidden = true;
      if (menu.note) toast(menu.note);
    } else {
      renderRecipes(menu);
    }
    animate();

    if (record) pushHistory(menu);
    refreshCounts();
  }

  function setPhoto(menu) {
    if (menu.image) {
      el.photoImg.hidden = false;
      el.photoImg.alt = menu.name + " 사진";
      el.photoImg.src = menu.image;
      el.photo.classList.add("has-img");
    } else {
      el.photoImg.hidden = true;
      el.photoImg.removeAttribute("src");
      el.photo.classList.remove("has-img");
    }
  }

  el.photoImg.addEventListener("error", function () {
    el.photoImg.hidden = true;
    el.photo.classList.remove("has-img");
  });

  var PRICE_LABEL = { 1: "₩", 2: "₩₩", 3: "₩₩₩" };

  function renderMeta(menu) {
    var cuisine = CUISINES[menu.cuisine] || menu.cuisine;
    var items = [{ text: cuisine }];

    if (menu.isPlace) {
      if (menu.minutes) items.push({ text: "걸어서 " + menu.minutes + "분" });
      if (menu.price) items.push({ text: PRICE_LABEL[menu.price] });
      menu.tags.slice(0, 3).forEach(function (t) { items.push({ text: t }); });

      el.meta.textContent = "";
      items.forEach(function (it) { el.meta.appendChild(makeEl("li", it.cls || "", it.text)); });
      return;
    }

    items.push({ text: menu.minutes + "분" });
    if (menu.spicy > 0) items.push({ text: "🌶".repeat(menu.spicy), cls: "is-hot" });
    if (menu.veg) items.push({ text: "채식", cls: "is-veg" });
    if (menu.role === "side") items.push({ text: "반찬", cls: "is-side" });
    if (menu.role === "out") items.push({ text: "사먹기", cls: "is-side" });

    /* 태그가 분류·채식 칩과 겹치면 빼고 넣습니다 ("분식" 이 두 번 나오는 문제) */
    var taken = { };
    items.forEach(function (it) { taken[it.text] = true; });
    menu.tags.forEach(function (t) {
      if (taken[t] || items.length >= 5) return;
      taken[t] = true;
      items.push({ text: t });
    });

    el.meta.textContent = "";
    items.forEach(function (it) {
      el.meta.appendChild(makeEl("li", it.cls || "", it.text));
    });
  }

  function animate() {
    el.ticket.classList.remove("is-printing");
    el.stamp.classList.remove("is-stamping");
    void el.ticket.offsetWidth;
    el.ticket.classList.add("is-printing");
    el.stamp.classList.add("is-stamping");
  }

  /* ---------- 레시피 카드 ---------- */

  function renderRecipes(menu) {
    var list = recipesFor(menu.id);

    el.recipeSection.hidden = false;
    el.recipeFor.textContent = menu.name;
    el.recipeList.textContent = "";

    if (!list.length) {
      el.recipeCount.textContent = "";
      el.recipeEmpty.hidden = false;
      el.recipeEmpty.textContent = "";

      el.recipeEmpty.appendChild(makeEl("p", "empty__line",
        menu.name + " 레시피는 아직 준비 중입니다."));

      var out = makeEl("a", "rcard__btn", "만개의레시피에서 " + menu.name + " 찾아보기");
      out.href = SEARCH_URL + encodeURIComponent(menu.name);
      out.target = "_blank";
      out.rel = "noopener";
      el.recipeEmpty.appendChild(out);
      return;
    }

    el.recipeEmpty.hidden = true;
    el.recipeCount.textContent = list.length + "건";
    list.forEach(function (r) {
      el.recipeList.appendChild(recipeCard(r, menu));
    });
  }

  function recipeCard(recipe, menu) {
    var li = makeEl("li", "rcard");
    var card = makeEl("article", "rcard__inner");

    /* 상단: 썸네일 + 제목 + 지표 */
    var top = makeEl("div", "rcard__top");
    var thumb = makeEl("div", "rcard__thumb");
    thumb.style.setProperty("--hue", menu.hue != null ? menu.hue : hueOf(recipe.title));

    if (recipe.image) {
      var img = makeEl("img");
      img.alt = "";
      img.loading = "lazy";
      img.src = recipe.image;
      img.addEventListener("error", function () {
        img.remove();
        thumb.classList.remove("has-img");
      });
      thumb.appendChild(img);
      thumb.classList.add("has-img");
    }
    thumb.appendChild(makeEl("span", "rcard__emoji", menu.emoji));
    top.appendChild(thumb);

    var head = makeEl("div", "rcard__head");
    head.appendChild(makeEl("h3", "rcard__title", recipe.title));

    var facts = makeEl("ul", "rcard__facts");
    if (recipe.rating) {
      facts.appendChild(makeEl("li", "is-rating",
        "★ " + recipe.rating.toFixed(1) + (recipe.reviews ? " (" + recipe.reviews + ")" : "")));
    }
    if (recipe.minutes) facts.appendChild(makeEl("li", "", recipe.minutes + "분"));
    if (recipe.servings) facts.appendChild(makeEl("li", "", recipe.servings + "인분"));
    if (recipe.difficulty) facts.appendChild(makeEl("li", "", recipe.difficulty));
    if (recipe.kcal) facts.appendChild(makeEl("li", "", recipe.kcal + "kcal"));
    if (recipe.steps.length) facts.appendChild(makeEl("li", "", recipe.steps.length + "단계"));
    head.appendChild(facts);

    head.appendChild(makeEl("p", "rcard__src", "출처 · " + (recipe.source.name || "미표기")));
    top.appendChild(head);
    card.appendChild(top);

    /* 액션 */
    var acts = makeEl("div", "rcard__actions");

    var more = makeEl("button", "rcard__btn", "레시피 펼치기");
    more.type = "button";
    more.setAttribute("aria-expanded", "false");
    acts.appendChild(more);

    var saveBtn = makeEl("button", "rcard__btn rcard__btn--save");
    saveBtn.type = "button";
    acts.appendChild(saveBtn);
    bindSaveButton(saveBtn, recipe, menu.id);

    if (recipe.source.url) {
      var link = makeEl("a", "rcard__btn rcard__btn--link", "원문 보기");
      link.href = recipe.source.url;
      link.target = "_blank";
      link.rel = "noopener";
      acts.appendChild(link);
    }
    card.appendChild(acts);

    /* 본문: 재료 + 조리순서 */
    var body = makeEl("div", "rcard__body");
    body.hidden = true;

    if (recipe.ingredients.length) {
      body.appendChild(makeEl("h4", "rcard__sub", "재료"));
      var ing = makeEl("ul", "ing");
      recipe.ingredients.forEach(function (x) {
        var row = makeEl("li");
        row.appendChild(makeEl("span", "ing__name", x.name));
        row.appendChild(makeEl("span", "ing__amt", x.amount));
        ing.appendChild(row);
      });
      body.appendChild(ing);
    }

    if (recipe.steps.length) {
      body.appendChild(makeEl("h4", "rcard__sub", "조리순서"));
      var ol = makeEl("ol", "steps");

      recipe.steps.forEach(function (text, i) {
        var step = makeEl("li");
        step.appendChild(makeEl("p", "steps__text", text));

        var shot = recipe.stepImages[i];
        if (shot) {
          var img = makeEl("img", "steps__img");
          img.alt = "";
          img.loading = "lazy";
          img.src = shot;
          img.addEventListener("error", function () { img.remove(); });
          step.appendChild(img);
        }
        ol.appendChild(step);
      });

      body.appendChild(ol);
    }

    if (!recipe.ingredients.length && !recipe.steps.length) {
      body.appendChild(makeEl("p", "empty", "이 레시피는 재료·조리순서 데이터가 없습니다."));
    }

    card.appendChild(body);

    more.addEventListener("click", function () {
      var open = body.hidden;
      body.hidden = !open;
      more.setAttribute("aria-expanded", open ? "true" : "false");
      more.textContent = open ? "접기" : "레시피 펼치기";
    });

    li.appendChild(card);
    return li;
  }

  /* ---------- 레시피 저장 ---------- */

  function savedIndex(recipeId) {
    for (var i = 0; i < saved.length; i++) if (saved[i].id === recipeId) return i;
    return -1;
  }

  /* 같은 레시피 카드가 레시피 섹션과 보관함에 동시에 떠 있을 수 있어,
     저장 버튼을 id 별로 모아 두고 한 번에 상태를 맞춥니다. */
  var saveButtons = {};

  function syncSaveButtons(recipeId) {
    var list = saveButtons[recipeId];
    if (!list) return;

    var alive = [];
    var on = savedIndex(recipeId) !== -1;

    list.forEach(function (btn) {
      if (!btn.isConnected) return;
      alive.push(btn);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.textContent = on ? "★ 저장됨" : "☆ 저장";
    });

    if (alive.length) saveButtons[recipeId] = alive;
    else delete saveButtons[recipeId];
  }

  function bindSaveButton(btn, recipe, menuName) {
    saveButtons[recipe.id] = (saveButtons[recipe.id] || []).concat(btn);

    btn.addEventListener("click", function () {
      var i = savedIndex(recipe.id);
      if (i === -1) {
        saved.unshift({ id: recipe.id, menu: menuName, title: recipe.title });
        toast(recipe.title + " 저장했습니다.");
      } else {
        saved.splice(i, 1);
        toast("저장을 해제했습니다.");
      }
      save(STORE.saved, saved);
      renderSaved();
      syncSaveButtons(recipe.id);
    });

    btn.setAttribute("aria-pressed", savedIndex(recipe.id) !== -1 ? "true" : "false");
    btn.textContent = savedIndex(recipe.id) !== -1 ? "★ 저장됨" : "☆ 저장";
  }

  function renderSaved() {
    el.savedList.textContent = "";

    saved.forEach(function (entry) {
      var found = recipeById[entry.id];
      var li;

      if (found) {
        li = recipeCard(found.recipe, byId[found.menu] || { emoji: "🍚", id: found.menu });
      } else {
        li = makeEl("li", "rcard rcard--stale");
        var inner = makeEl("article", "rcard__inner");
        inner.appendChild(makeEl("h3", "rcard__title", entry.title || entry.id));
        inner.appendChild(makeEl("p", "rcard__src", "지금 데이터에 없는 레시피입니다."));
        var drop = makeEl("button", "rcard__btn", "목록에서 제거");
        drop.type = "button";
        drop.addEventListener("click", function () {
          var i = savedIndex(entry.id);
          if (i !== -1) saved.splice(i, 1);
          save(STORE.saved, saved);
          renderSaved();
        });
        inner.appendChild(drop);
        li.appendChild(inner);
      }
      el.savedList.appendChild(li);
    });

    syncBox();
  }

  /* ---------- 메뉴 찜 ---------- */

  function syncFavButton() {
    var on = state.current && favs.indexOf(state.current.id) !== -1;
    el.fav.setAttribute("aria-pressed", on ? "true" : "false");
    el.fav.textContent = on ? "♥ 찜함" : "♡ 찜하기";
  }

  function toggleFav() {
    if (!state.current) return;
    var i = favs.indexOf(state.current.id);
    if (i === -1) {
      favs.unshift(state.current.id);
      toast(state.current.name + " 찜했습니다.");
    } else {
      favs.splice(i, 1);
      toast("찜을 해제했습니다.");
    }
    save(STORE.favs, favs);
    syncFavButton();
    renderFavs();
  }

  function renderFavs() {
    el.favs.textContent = "";

    favs.forEach(function (id) {
      var m = byId[id];
      if (!m) return;
      var li = makeEl("li");
      var btn = makeEl("button", "fav");
      btn.type = "button";
      btn.appendChild(makeEl("span", "fav__emoji", m.emoji));
      btn.appendChild(makeEl("span", "fav__name", m.name));
      btn.addEventListener("click", function () { show(m, false); });
      li.appendChild(btn);
      el.favs.appendChild(li);
    });

    syncBox();
  }

  function syncBox() {
    el.savedBlock.hidden = saved.length === 0;
    el.favBlock.hidden = favs.length === 0;
    el.boxSection.hidden = saved.length === 0 && favs.length === 0;

    var parts = [];
    if (saved.length) parts.push("레시피 " + saved.length);
    if (favs.length) parts.push("메뉴 " + favs.length);
    el.boxCount.textContent = parts.join(" · ");
  }

  /* ---------- 기록 ---------- */

  function pushHistory(menu) {
    history.unshift({ id: menu.id, at: Date.now(), meal: state.meal });
    history = history.slice(0, HISTORY_MAX);
    save(STORE.history, history);
    renderHistory();
  }

  function renderHistory() {
    el.historySection.hidden = history.length === 0;
    el.history.textContent = "";

    history.forEach(function (h) {
      var m = byId[h.id];
      if (!m) return;
      var d = new Date(h.at);
      var li = makeEl("li");
      var btn = makeEl("button", "stub");
      btn.type = "button";
      btn.appendChild(makeEl("span", "stub__name", m.emoji + " " + m.name));
      btn.appendChild(makeEl("span", "stub__when",
        (d.getMonth() + 1) + "/" + d.getDate() + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes())));
      btn.addEventListener("click", function () { show(m, false); });
      li.appendChild(btn);
      el.history.appendChild(li);
    });
  }

  /* ---------- 오늘의 추천 ---------- */

  function renderToday() {
    var anyMeal = state.meal === "*";
    var meal = anyMeal ? "*" : state.meal;

    if (state.mode !== "eat") {
      el.todayTitle.textContent = anyMeal ? "끼니 안 가리고 추천" : "오늘 " + MEALS[meal] + " 추천";
    }

    if (state.mode === "eat") {
      el.todayTitle.textContent = "가볼 만한 곳";
    }

    var pool = activeList().filter(function (m) {
      if (m.isPlace) return true;
      if (!allowsRole(m)) return false;
      if (!anyMeal && m.meals.indexOf(meal) === -1) return false;
      if (state.cuisines.length && state.cuisines.indexOf(m.cuisine) === -1) return false;
      if (m.minutes > state.maxMinutes) return false;
      if (state.vegOnly && !m.veg) return false;
      if (state.recipeOnly && !(recipes[m.id] || []).length) return false;
      return true;
    });

    /* 레시피가 있는 메뉴를 먼저 보여줍니다 */
    pool.sort(function (a, b) {
      return ((recipes[b.id] || []).length ? 1 : 0) - ((recipes[a.id] || []).length ? 1 : 0);
    });

    var d = new Date();
    var daySeed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    var rnd = seeded(daySeed + meal.charCodeAt(0) * 7 + state.todayNudge * 977);

    var picked = [];
    var used = {};
    var guard = 0;
    while (picked.length < Math.min(TODAY_SHOWN, pool.length) && guard++ < 400) {
      var i = Math.floor(rnd() * pool.length);
      if (used[i]) continue;
      used[i] = true;
      picked.push(pool[i]);
    }

    el.todaySection.hidden = picked.length === 0;
    el.todayList.textContent = "";

    picked.forEach(function (m) {
      var li = makeEl("li");
      var btn = makeEl("button", "card");
      btn.type = "button";

      var art = makeEl("span", "card__art", m.emoji);
      art.style.setProperty("--hue", m.hue);
      btn.appendChild(art);

      var txt = makeEl("span", "card__text");
      txt.appendChild(makeEl("span", "card__name", m.name));
      var n = (recipes[m.id] || []).length;
      txt.appendChild(makeEl("span", "card__sub", m.isPlace
        ? m.cuisine + (m.minutes ? " · 걸어서 " + m.minutes + "분" : "")
          + (m.price ? " · " + PRICE_LABEL[m.price] : "")
        : (CUISINES[m.cuisine] || "") + " · " + m.minutes + "분" + (n ? " · 레시피 " + n : "")));
      btn.appendChild(txt);

      btn.addEventListener("click", function () {
        if (!m.isPlace) selectMeal(meal);
        show(m, true);
        el.recipeSection.scrollIntoView({ behavior: "smooth", block: "start" });
      });

      li.appendChild(btn);
      el.todayList.appendChild(li);
    });
  }

  /* ---------- 공유 ---------- */

  function share() {
    if (!state.current) return;
    var url = location.origin + location.pathname + "?m=" + encodeURIComponent(state.current.id);

    if (navigator.share) {
      navigator.share({ title: "FoodPick", text: "오늘은 " + state.current.name, url: url })
        .catch(function () { copy(url); });
    } else {
      copy(url);
    }
  }

  function copy(url) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(function () { toast("링크를 복사했습니다."); })
        .catch(function () { toast(url); });
    } else {
      toast(url);
    }
  }

  /* ---------- 필터 UI ---------- */

  function buildCuisineChips() {
    el.cuisineChips.textContent = "";

    if (state.mode === "eat") {
      /* 실제로 등록된 업종만 보여줍니다 */
      var seen = [];
      places.forEach(function (p) { if (seen.indexOf(p.cuisine) === -1) seen.push(p.cuisine); });
      seen.forEach(function (cat) {
        el.cuisineChips.appendChild(chip(cat, function (on) { toggleIn(state.cuisines, cat, on); }));
      });
      return;
    }

    Object.keys(CUISINES).forEach(function (key) {
      el.cuisineChips.appendChild(chip(CUISINES[key], function (on) {
        toggleIn(state.cuisines, key, on);
      }));
    });
  }

  function buildChips() {
    buildCuisineChips();

    SPICY.forEach(function (label, level) {
      el.spicyChips.appendChild(chip(level === 0 ? label : "🌶".repeat(level), function (on) {
        toggleIn(state.spicy, level, on);
      }, label));
    });

    [1, 2, 3].forEach(function (level) {
      el.priceChips.appendChild(chip(PRICE_LABEL[level], function (on) {
        toggleIn(state.prices, level, on);
      }));
    });
  }

  function chip(label, onToggle, title) {
    var b = makeEl("button", "chip", label);
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    if (title) b.title = title;
    b.addEventListener("click", function () {
      var on = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", on ? "true" : "false");
      onToggle(on);
      afterFilterChange();
    });
    return b;
  }

  function toggleIn(arr, value, on) {
    var i = arr.indexOf(value);
    if (on && i === -1) arr.push(value);
    if (!on && i !== -1) arr.splice(i, 1);
  }

  function syncChips() {
    var keys = state.mode === "eat" ? [] : Object.keys(CUISINES);
    Array.prototype.forEach.call(el.cuisineChips.children, function (b, i) {
      var key = keys.length ? keys[i] : b.textContent;
      b.setAttribute("aria-pressed", state.cuisines.indexOf(key) !== -1 ? "true" : "false");
    });
    Array.prototype.forEach.call(el.spicyChips.children, function (b, i) {
      b.setAttribute("aria-pressed", state.spicy.indexOf(i) !== -1 ? "true" : "false");
    });
  }

  function syncMinutes() {
    var v = Number(el.minutes.value);
    state.maxMinutes = v;
    el.minutesOut.textContent = v >= 120 ? "전체" : v + "분 이내";
  }

  function afterFilterChange() {
    savePrefs();
    refreshCounts();
    renderToday();
  }

  function savePrefs() {
    save(STORE.prefs, {
      meal: state.meal, cuisines: state.cuisines, spicy: state.spicy,
      maxMinutes: state.maxMinutes, vegOnly: state.vegOnly,
      avoidRecent: state.avoidRecent, recipeOnly: state.recipeOnly,
      includeSides: state.includeSides,
      includeOut: state.includeOut,
      mode: state.mode, prices: state.prices
    });
  }

  function restorePrefs() {
    var p = load(STORE.prefs, null);
    if (!p) return;
    if (Array.isArray(p.cuisines)) state.cuisines = p.cuisines;
    if (Array.isArray(p.spicy)) state.spicy = p.spicy;
    if (typeof p.maxMinutes === "number") state.maxMinutes = p.maxMinutes;
    state.vegOnly = !!p.vegOnly;
    state.recipeOnly = !!p.recipeOnly;
    state.includeSides = !!p.includeSides;
    state.includeOut = !!p.includeOut;
    if (p.mode === "eat" || p.mode === "home") state.mode = p.mode;
    if (Array.isArray(p.prices)) state.prices = p.prices;
    state.avoidRecent = p.avoidRecent !== false;

    el.minutes.value = state.maxMinutes;
    el.vegOnly.checked = state.vegOnly;
    el.recipeOnly.checked = state.recipeOnly;
    el.includeSides.checked = state.includeSides;
    el.includeOut.checked = state.includeOut;
    el.avoidRecent.checked = state.avoidRecent;
    syncMinutes();
    syncChips();
  }

  function selectMode(mode) {
    state.mode = mode;
    state.current = null;
    state.cuisines = [];

    el.modeTabs.forEach(function (t) {
      t.setAttribute("aria-selected", t.dataset.mode === mode ? "true" : "false");
    });

    var eat = mode === "eat";

    /* 집밥 전용 UI 를 접습니다 */
    el.mealTabsBox.hidden = eat;
    el.homeToggles.hidden = eat;
    el.spicyField.hidden = eat;
    el.priceField.hidden = !eat;
    el.recipeSection.hidden = true;
    el.pickerHeadline.textContent = eat ? "맛집 뽑기" : "식권 뽑기";
    el.cuisineLabel.textContent = eat ? "업종" : "종류";
    el.minutesLabel.textContent = eat ? "걸어서" : "조리시간";

    /* 결과판 초기화 */
    el.ticket.hidden = true;
    el.ticketEmpty.hidden = false;
    el.fav.disabled = true;
    el.share.disabled = true;
    el.search.hidden = true;

    el.placeEmpty.hidden = !(eat && places.length === 0);
    el.pick.disabled = eat && places.length === 0;

    buildCuisineChips();
    savePrefs();
    refreshCounts();
    renderToday();
  }

  function selectMeal(meal) {
    state.meal = meal;
    el.mealTabs.forEach(function (t) {
      t.setAttribute("aria-selected", t.dataset.meal === meal ? "true" : "false");
    });
    savePrefs();
    refreshCounts();
    renderToday();
  }

  /* ---------- 외부 데이터 병합 ---------- */

  function fetchJSON(path) {
    if (!window.fetch || location.protocol === "file:") return Promise.resolve(null);
    return fetch(path, { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }

  function applyRecipeData(data) {
    if (!data || !data.items) return;
    addRecipes(data.items, data.sourceName || "수집 데이터");
    el.recipeTotalOut.textContent = recipeTotal();
    if (state.current) renderRecipes(state.current);
    renderSaved();
    renderToday();
    refreshCounts();
  }

  function applyPhotoData(data) {
    if (!data || !data.items) return;
    var filled = 0;

    Object.keys(data.items).forEach(function (name) {
      var m = byId[name];
      if (!m) return;
      var it = data.items[name] || {};
      if (isHttp(it.image)) { m.image = it.image; filled++; }
      if (isHttp(it.link)) m.link = it.link;
    });

    if (filled && state.current) setPhoto(state.current);
  }

  function loadExternal() {
    /* 단일 파일 빌드(tools/build-single.mjs)에서는 데이터가 이미 박혀 있습니다.
       file:// 로 열면 fetch 가 막히므로 이 경로가 필요합니다. */
    if (window.FOODPICK_INLINE) {
      applyRecipeData(window.FOODPICK_INLINE.recipes);
      applyPhotoData(window.FOODPICK_INLINE.photos);
      return;
    }

    fetchJSON("data/recipes.json").then(applyRecipeData);
    fetchJSON("data/photos.json").then(applyPhotoData);
  }

  /* ---------- 이벤트 ---------- */

  el.modeTabs.forEach(function (tab) {
    tab.addEventListener("click", function () { selectMode(tab.dataset.mode); });
  });

  el.mealTabs.forEach(function (tab) {
    tab.addEventListener("click", function () { selectMeal(tab.dataset.meal); });
  });

  el.pick.addEventListener("click", draw);
  el.fav.addEventListener("click", toggleFav);
  el.share.addEventListener("click", share);

  el.rerollToday.addEventListener("click", function () {
    state.todayNudge++;
    renderToday();
  });

  el.minutes.addEventListener("input", function () {
    syncMinutes();
    refreshCounts();
  });
  el.minutes.addEventListener("change", afterFilterChange);

  el.vegOnly.addEventListener("change", function () {
    state.vegOnly = el.vegOnly.checked;
    afterFilterChange();
  });

  el.recipeOnly.addEventListener("change", function () {
    state.recipeOnly = el.recipeOnly.checked;
    afterFilterChange();
  });

  el.includeSides.addEventListener("change", function () {
    state.includeSides = el.includeSides.checked;
    afterFilterChange();
  });

  el.includeOut.addEventListener("change", function () {
    state.includeOut = el.includeOut.checked;
    afterFilterChange();
  });

  el.avoidRecent.addEventListener("change", function () {
    state.avoidRecent = el.avoidRecent.checked;
    savePrefs();
    refreshCounts();
  });

  el.resetFilters.addEventListener("click", function () {
    state.cuisines = [];
    state.spicy = [];
    state.maxMinutes = 120;
    state.vegOnly = false;
    state.recipeOnly = false;
    state.includeSides = false;
    state.includeOut = false;
    state.prices = [];
    el.minutes.value = 120;
    el.vegOnly.checked = false;
    el.recipeOnly.checked = false;
    el.includeSides.checked = false;
    el.includeOut.checked = false;
    syncMinutes();
    syncChips();
    afterFilterChange();
    toast("필터를 초기화했습니다.");
  });

  el.clearHistory.addEventListener("click", function () {
    history = [];
    save(STORE.history, history);
    renderHistory();
    refreshCounts();
    toast("기록을 지웠습니다.");
  });

  document.addEventListener("keydown", function (e) {
    if (e.code !== "Space" && e.key !== " ") return;
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "BUTTON"
      || t.tagName === "SUMMARY" || t.tagName === "A" || t.tagName === "TEXTAREA")) return;
    e.preventDefault();
    draw();
  });

  /* ---------- 시작 ---------- */

  function start() {
    addRecipes(window.FOODPICK_RECIPES, "FoodPick 기본 레시피");

    el.totalCount.textContent = menus.length;
    el.placeTotal.textContent = places.length;
    el.recipeTotalOut.textContent = recipeTotal();

    buildChips();
    restorePrefs();
    tickClock();
    setInterval(tickClock, 20000);

    var shared = new URLSearchParams(location.search).get("m");
    if (shared && byId[shared]) {
      selectMeal(byId[shared].meals[0] || "*");
      show(byId[shared], false);
      toast("공유받은 메뉴입니다.");
    } else {
      selectMeal(state.meal);
    }

    selectMode(state.mode);

    renderHistory();
    renderFavs();
    renderSaved();
    renderToday();
    refreshCounts();
    loadExternal();
  }

  start();
})();
