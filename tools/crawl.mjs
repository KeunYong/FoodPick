#!/usr/bin/env node
/**
 * FoodPick 수집기 (만개의레시피) — 사용자가 직접 로컬에서 실행하는 스크립트
 *
 * 두 가지 모드
 *   기본       메뉴별 대표 썸네일 + 원문 링크만  → data/photos.json
 *   --detail   재료 · 조리순서 · 단계별 사진까지 → data/recipes.json
 *
 * 사용 예
 *   node tools/crawl.mjs --detail --check --file=page.html   저장한 페이지로 파서 검증 (네트워크 X)
 *   node tools/crawl.mjs --check                             검색 목록 파서 1건 확인
 *   node tools/crawl.mjs                                     썸네일 채우기
 *   node tools/crawl.mjs --detail --menus=김치찌개,떡볶이       특정 메뉴만 상세 수집
 *   node tools/crawl.mjs --detail                            전체 상세 수집 (오래 걸립니다)
 *
 * 옵션
 *   --per=3        메뉴당 레시피 수 (상세 모드, 기본 3)
 *   --limit=20     처리할 메뉴 수
 *   --menus=a,b    특정 메뉴만
 *   --delay=1200   요청 간 간격(ms)
 *   --force        이미 채운 항목도 다시 조회
 *   --ua="..."     User-Agent
 *
 * 파싱 방식
 *   상세 페이지의 schema.org/Recipe JSON-LD 를 씁니다. 클래스명을 긁는 방식보다
 *   페이지 개편에 훨씬 잘 버팁니다. 난이도만 JSON-LD 에 없어서 HTML 에서 읽습니다.
 *
 * 실행 전 확인
 *   - robots.txt 는 ClaudeBot 을 전체 차단하고 ai-train=no, use=reference 를
 *     선언합니다. 그래서 AI 에이전트가 아니라 사용자가 직접 실행하며,
 *     수집물을 모델 학습에 쓰지 않습니다.
 *   - 스크립트가 시작할 때 robots.txt 를 다시 읽어 User-agent: * 기준으로
 *     대상 경로가 막혀 있으면 스스로 중단합니다.
 *   - 재료와 조리순서, 사진의 저작권은 사이트가 아니라 레시피를 올린 개인에게
 *     있습니다. 수집 결과에는 작성자 이름과 원문 주소가 항상 함께 저장되고,
 *     앱은 카드마다 이를 표기합니다. 공개 사이트에 재배포할지는 별개의
 *     판단이 필요해서 data/ 는 기본적으로 .gitignore 에 있습니다.
 *
 * Node 18 이상 필요 (내장 fetch 사용).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { splitIngredient, isoMinutes, parseYield, isHttpUrl } from "./lib/parse.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MENUS_JS = join(ROOT, "assets", "js", "menus.js");
const PHOTOS_OUT = join(ROOT, "data", "photos.json");
const RECIPES_OUT = join(ROOT, "data", "recipes.json");

const ORIGIN = "https://www.10000recipe.com";
const LIST_PATH = "/recipe/list.html";
const DISALLOWED = ["/admin/", "/app/", "/static/"];   // robots.txt User-agent: *
const SOURCE_LABEL = "만개의레시피";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const has = (name) => args.includes(`--${name}`);

const DELAY = Number(flag("delay", 1200));
const LIMIT = Number(flag("limit", Infinity));
const PER = Math.max(1, Number(flag("per", 3)));
const ONLY = flag("menus", "").split(",").map((s) => s.trim()).filter(Boolean);
const FILE = flag("file", "");
const FORCE = has("force");
const CHECK = has("check");
const DETAIL = has("detail");
const UA = flag("ua", "FoodPick-DataFetcher/1.0 (personal recipe picker)");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 메뉴 이름 ---------- */

async function readMenuNames() {
  const src = await readFile(MENUS_JS, "utf8");
  const open = src.indexOf("[", src.indexOf("window.FOODPICK_MENUS"));
  const close = src.lastIndexOf("]");
  if (open === -1 || close === -1) throw new Error("menus.js 에서 배열을 찾지 못했습니다.");

  const json = src.slice(open, close + 1)
    .replace(/\/\/[^\n]*/g, "")
    .replace(/,(\s*[\]}])/g, "$1");

  return JSON.parse(json).map((row) => row[0]);
}

/* ---------- robots.txt ---------- */

async function assertAllowed() {
  const res = await fetch(`${ORIGIN}/robots.txt`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`robots.txt 를 읽을 수 없습니다 (HTTP ${res.status}).`);
  const text = await res.text();

  // User-agent: * 블록만 봅니다. 특정 봇 블록은 이 스크립트 UA 에 해당하지 않습니다.
  const blocks = text.split(/\n(?=User-[Aa]gent:)/);
  const star = blocks.filter((b) => /^User-[Aa]gent:\s*\*/m.test(b));
  const rules = star.flatMap((b) => [...b.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]));

  for (const path of [LIST_PATH, "/recipe/"]) {
    if (rules.some((rule) => rule === "/" || path.startsWith(rule))) {
      throw new Error(`robots.txt 가 ${path} 를 차단하고 있습니다. 중단합니다.`);
    }
    if (DISALLOWED.some((p) => path.startsWith(p))) {
      throw new Error(`${path} 는 수집 금지 경로입니다.`);
    }
  }
  console.log("robots.txt 확인 — User-agent: * 기준 /recipe/ 접근 허용");
}

/* ---------- 검색 목록 파싱 ---------- */

/** 검색 결과 페이지에서 레시피 id 를 문서 순서대로 최대 limit 개 */
export function parseSearchResults(html, limit = 3) {
  const seen = new Set();
  const out = [];

  for (const m of html.matchAll(/href="\/recipe\/(\d+)"/g)) {
    const sid = m[1];
    if (seen.has(sid)) continue;
    seen.add(sid);

    const around = html.slice(Math.max(0, m.index - 400), m.index + 1200);
    const img =
      around.match(/data-src="(https?:\/\/[^"]+?\.(?:jpe?g|png|gif))/i) ||
      around.match(/src="(https?:\/\/[^"]+?\.(?:jpe?g|png|gif))/i);
    const title = around.match(/alt="([^"]{2,80})"/);

    out.push({
      sid,
      link: `${ORIGIN}/recipe/${sid}`,
      image: img ? img[1] : null,
      title: title ? title[1].trim() : null
    });

    if (out.length >= limit) break;
  }

  return out;
}

/* ---------- 상세 페이지 파싱 (JSON-LD) ---------- */

export function parseRecipePage(html, fallbackUrl = "") {
  const block = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  if (!block) return { error: "JSON-LD 를 찾지 못했습니다 (페이지 구조 변경 가능)" };

  let data;
  try {
    data = JSON.parse(block[1].trim());
  } catch (err) {
    return { error: `JSON-LD 파싱 실패: ${err.message}` };
  }

  const recipe = Array.isArray(data)
    ? data.find((d) => d && d["@type"] === "Recipe")
    : data;
  if (!recipe || recipe["@type"] !== "Recipe") return { error: "Recipe 타입이 아닙니다" };

  const steps = (Array.isArray(recipe.recipeInstructions) ? recipe.recipeInstructions : [])
    .map((s) => (typeof s === "string" ? { text: s } : s))
    .map((s) => ({
      text: String(s?.text ?? "").replace(/\s+/g, " ").trim(),
      image: isHttpUrl(s?.image) ? s.image : null
    }))
    .filter((s) => s.text);

  const ingredients = (Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [])
    .map(splitIngredient)
    .filter(Boolean);

  const images = [recipe.image].flat().filter(isHttpUrl);
  const url = isHttpUrl(recipe.url) ? recipe.url
    : (html.match(/<meta property="og:url" content="([^"]+)"/) || [])[1] || fallbackUrl;

  // 난이도는 JSON-LD 에 없어서 HTML 에서 읽습니다. 없으면 조리순서 수로 대신합니다.
  const level = html.match(/class="view2_summary_info3"[^>]*>\s*([^<\s][^<]*?)\s*</);
  const author = String(recipe.author?.name ?? "").trim();

  const rating = Number(recipe.aggregateRating?.ratingValue);
  const reviews = Number(recipe.aggregateRating?.reviewCount);

  const out = {
    id: url ? `mrs-${(url.match(/\/recipe\/(\d+)/) || [])[1] ?? Date.now()}` : `mrs-${Date.now()}`,
    title: String(recipe.name ?? "").replace(/\s+/g, " ").trim(),
    minutes: isoMinutes(recipe.totalTime),
    servings: parseYield(recipe.recipeYield),
    difficulty: level ? level[1] : (steps.length <= 5 ? "쉬움" : steps.length <= 10 ? "보통" : "어려움"),
    kcal: null,
    rating: isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
    reviews: isFinite(reviews) && reviews >= 0 ? reviews : null,
    image: images[0] ?? null,
    ingredients,
    steps: steps.map((s) => s.text),
    stepImages: steps.map((s) => s.image),
    source: {
      name: author ? `${SOURCE_LABEL} · ${author}` : SOURCE_LABEL,
      url: url || ""
    }
  };

  if (!out.title) return { error: "제목이 비어 있습니다" };
  if (!out.steps.length) return { error: "조리순서가 비어 있습니다" };
  return out;
}

/* ---------- 요청 ---------- */

async function get(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ko-KR,ko;q=0.9"
      }
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { html: await res.text() };
  } catch (err) {
    if (attempt < 3) {
      const wait = DELAY * attempt * 2;
      console.log(`    재시도 ${attempt}/2 (${wait}ms 후) — ${err.message}`);
      await sleep(wait);
      return get(url, attempt + 1);
    }
    return { error: err.message };
  }
}

const searchUrl = (name) => `${ORIGIN}${LIST_PATH}?q=${encodeURIComponent(name)}&order=reco`;

/* ---------- 모드: 저장한 파일로 파서 검증 ---------- */

async function checkFile() {
  const html = await readFile(FILE, "utf8");
  console.log(`[--check --file] ${FILE} 파싱\n`);

  const r = parseRecipePage(html);
  if (r.error) {
    console.log("실패:", r.error);
    return;
  }

  console.log(`제목      ${r.title}`);
  console.log(`출처      ${r.source.name}`);
  console.log(`원문      ${r.source.url}`);
  console.log(`조리시간  ${r.minutes ?? "-"}분 / 분량 ${r.servings ?? "-"}인분 / 난이도 ${r.difficulty}`);
  console.log(`평점      ${r.rating ?? "-"} (리뷰 ${r.reviews ?? 0})`);
  console.log(`대표사진  ${r.image ?? "없음"}`);
  console.log(`\n재료 ${r.ingredients.length}개`);
  r.ingredients.forEach((x) => console.log(`  ${x.name.padEnd(18)} ${x.amount}`));
  console.log(`\n조리순서 ${r.steps.length}단계 (사진 ${r.stepImages.filter(Boolean).length}장)`);
  r.steps.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s}`));
  console.log("\n파서 정상입니다.");
}

/* ---------- 모드: 썸네일 ---------- */

async function runPhotos(names) {
  let store = { generatedAt: null, source: ORIGIN, items: {} };
  try {
    store = JSON.parse(await readFile(PHOTOS_OUT, "utf8"));
    store.items ??= {};
  } catch { /* 첫 실행 */ }

  const todo = names.filter((n) => FORCE || !store.items[n]?.image).slice(0, LIMIT);
  console.log(`대상 ${todo.length}건 (완료 ${Object.keys(store.items).length}건, 간격 ${DELAY}ms)`);
  console.log(`예상 약 ${Math.ceil((todo.length * DELAY) / 60000)}분\n`);

  let ok = 0, fail = 0;

  for (let i = 0; i < todo.length; i++) {
    const name = todo[i];
    const res = await get(searchUrl(name));
    const hit = res.html ? parseSearchResults(res.html, 1)[0] : null;

    if (!hit?.image) {
      fail++;
      console.log(`[${i + 1}/${todo.length}] ✗ ${name} — ${res.error ?? "사진 없음"}`);
    } else {
      ok++;
      store.items[name] = { image: hit.image, link: hit.link, title: hit.title };
      console.log(`[${i + 1}/${todo.length}] ✓ ${name} — ${hit.title ?? hit.sid}`);
    }

    if ((i + 1) % 10 === 0 || i === todo.length - 1) await flush(PHOTOS_OUT, store);
    if (i < todo.length - 1) await sleep(DELAY);
  }

  console.log(`\n완료 — 성공 ${ok}건, 실패 ${fail}건`);
  console.log(`저장: data/photos.json (총 ${Object.keys(store.items).length}건)`);
}

/* ---------- 모드: 상세 ---------- */

async function runDetail(names) {
  let store = {
    generatedAt: null,
    sourceName: SOURCE_LABEL,
    license: "각 레시피 작성자에게 저작권이 있습니다. 카드에 작성자와 원문 주소를 표기합니다.",
    items: {}
  };
  try {
    const prev = JSON.parse(await readFile(RECIPES_OUT, "utf8"));
    if (prev.items) store = { ...store, items: prev.items };
  } catch { /* 첫 실행 */ }

  const todo = names
    .filter((n) => FORCE || (store.items[n]?.length ?? 0) < PER)
    .slice(0, LIMIT);

  const requests = todo.length * (1 + PER);
  console.log(`대상 메뉴 ${todo.length}종 × 최대 ${PER}건 (요청 약 ${requests}회, 간격 ${DELAY}ms)`);
  console.log(`예상 약 ${Math.ceil((requests * DELAY) / 60000)}분\n`);

  let okMenus = 0, okRecipes = 0;

  for (let i = 0; i < todo.length; i++) {
    const name = todo[i];
    const head = `[${i + 1}/${todo.length}] ${name}`;

    const listRes = await get(searchUrl(name));
    if (!listRes.html) {
      console.log(`${head} ✗ 검색 실패 — ${listRes.error}`);
      await sleep(DELAY);
      continue;
    }

    const hits = parseSearchResults(listRes.html, PER);
    if (!hits.length) {
      console.log(`${head} ✗ 검색 결과 없음`);
      await sleep(DELAY);
      continue;
    }

    const collected = [];
    for (const hit of hits) {
      await sleep(DELAY);
      const page = await get(hit.link);
      if (!page.html) {
        console.log(`${head}   ✗ ${hit.sid} — ${page.error}`);
        continue;
      }

      const recipe = parseRecipePage(page.html, hit.link);
      if (recipe.error) {
        console.log(`${head}   ✗ ${hit.sid} — ${recipe.error}`);
        continue;
      }

      collected.push(recipe);
      console.log(`${head}   ✓ ${recipe.title} (재료 ${recipe.ingredients.length} · ${recipe.steps.length}단계)`);
    }

    if (collected.length) {
      store.items[name] = collected;
      okMenus++;
      okRecipes += collected.length;
      await flush(RECIPES_OUT, store);
    }
    if (i < todo.length - 1) await sleep(DELAY);
  }

  console.log(`\n완료 — 메뉴 ${okMenus}종, 레시피 ${okRecipes}건`);
  console.log(`저장: data/recipes.json`);
  console.log("실패한 메뉴는 다시 실행하면 이어서 시도합니다.");
}

async function flush(path, store) {
  store.generatedAt = new Date().toISOString();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2) + "\n", "utf8");
}

/* ---------- 실행 ---------- */

async function main() {
  if (CHECK && FILE) return checkFile();

  const all = await readMenuNames();
  const names = ONLY.length ? ONLY.filter((n) => all.includes(n)) : all;

  if (ONLY.length && names.length !== ONLY.length) {
    const missing = ONLY.filter((n) => !all.includes(n));
    console.log(`menus.js 에 없는 이름은 건너뜁니다: ${missing.join(", ")}`);
  }
  console.log(`메뉴 ${names.length}종 대상`);

  await assertAllowed();
  await sleep(DELAY);

  if (CHECK) {
    const name = names[0];
    console.log(`\n[--check] "${name}" 검색 목록 파싱`);
    const res = await get(searchUrl(name));
    if (!res.html) {
      console.log("실패:", res.error);
      return;
    }

    const hits = parseSearchResults(res.html, 5);
    if (!hits.length) {
      console.log("결과를 뽑지 못했습니다. parseSearchResults() 를 확인해주세요.");
      return;
    }

    hits.forEach((h, i) => console.log(`  ${i + 1}. ${h.sid}  ${h.title ?? "(제목 없음)"}\n     ${h.image ?? "사진 없음"}`));
    console.log("\n위 목록이 검색 결과와 맞는지 확인해주세요. 맞으면 --check 없이 실행하세요.");
    console.log("상세 수집은 --detail 을 붙이세요.");
    return;
  }

  if (DETAIL) await runDetail(names);
  else await runPhotos(names);
}

/* 이 파일을 직접 실행했을 때만 동작합니다.
   파서를 다른 스크립트에서 import 해도 수집이 시작되지 않게 하는 안전장치입니다. */
const isEntryPoint = process.argv[1]
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isEntryPoint) {
  main().catch((err) => {
    console.error(`\n중단: ${err.message}`);
    process.exit(1);
  });
}
