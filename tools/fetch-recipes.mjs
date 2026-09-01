#!/usr/bin/env node
/**
 * FoodPick 레시피 수집기 — 식품의약품안전처 「조리식품의 레시피 DB」(COOKRCP01)
 *
 *   node tools/fetch-recipes.mjs --key=발급받은키 --check    5건만 받아 변환 결과 확인
 *   node tools/fetch-recipes.mjs --key=발급받은키            전체 수집 → data/recipes.json
 *   FOODSAFETY_KEY=... node tools/fetch-recipes.mjs         환경변수로도 됩니다
 *
 *   --per=3        메뉴당 최대 레시피 수 (기본 3)
 *   --delay=400    요청 간 간격(ms)
 *
 * 키 발급
 *   https://openapi.foodsafetykorea.go.kr → 회원가입 → 인증키 신청 (무료)
 *   API 이름: COOKRCP01 (조리식품의 레시피 DB)
 *   키 없이 구조만 보려면 --key=sample 로 5건을 받아볼 수 있습니다.
 *
 * 라이선스
 *   공공데이터라 우리 템플릿에 재료·조리순서·사진을 그대로 렌더할 수 있습니다.
 *   조건은 출처 표시입니다. 각 레시피의 source.name 으로 카드에 표기됩니다.
 *
 * Node 18 이상 필요 (내장 fetch 사용).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MENUS_JS = join(ROOT, "assets", "js", "menus.js");
const OUT = join(ROOT, "data", "recipes.json");

const SOURCE_NAME = "식품안전나라 조리식품 레시피 (식품의약품안전처)";
const PAGE = 100;

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const has = (name) => args.includes(`--${name}`);

const KEY = flag("key", process.env.FOODSAFETY_KEY || "");
const PER = Number(flag("per", 3));
const DELAY = Number(flag("delay", 400));
const CHECK = has("check");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const squash = (s) => String(s ?? "").replace(/\s+/g, "");

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

/* ---------- API ---------- */

async function fetchPage(start, end) {
  const url = `http://openapi.foodsafetykorea.go.kr/api/${encodeURIComponent(KEY)}/COOKRCP01/json/${start}/${end}`;
  const res = await fetch(url, { headers: { "User-Agent": "FoodPick/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const body = await res.json();
  const box = body.COOKRCP01;
  if (!box) throw new Error("응답 형식이 다릅니다: " + JSON.stringify(body).slice(0, 200));

  const code = box.RESULT?.CODE;
  if (code && !["INFO-000", "INFO-200"].includes(code)) {
    throw new Error(`API 오류 ${code}: ${box.RESULT?.MSG ?? ""}`);
  }

  return { rows: box.row ?? [], total: Number(box.total_count ?? 0) };
}

/* ---------- 변환 ---------- */

const UNITS = "kg|g|ml|mL|L|큰술|작은술|스푼|숟갈|인분|컵|개|쪽|대|단|통|자루|조각|마리|장|봉|줄|모|톨|알|캔|팩|꼬집|주먹";
const LOOSE = "약간|적당량|조금|기호에\\s*따라";

function parseIngredients(blob) {
  if (!blob) return [];

  return String(blob)
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .filter((s) => !/^[\u25cf\u25cb\u25b6\u2022]/.test(s))   // ●양념장 같은 소제목 줄
    .filter((s) => !/^[\uac00-\ud7a3\s]{1,10}:$/.test(s))     // "양념 :" 형태 소제목
    .map((s) => s.replace(/^[\u25cf\u25cb\u25b6\u2022\-\s]+/, "").trim())
    .map((line) => {
      const m = line.match(
        new RegExp("^(.*?)\\s+([\\d./]+\\s*(?:" + UNITS + ")?|" + LOOSE + ")$")
      );
      if (m && m[1]) return { name: m[1].trim(), amount: m[2].trim() };
      return { name: line, amount: "" };
    })
    .filter((x) => x.name && x.name.length <= 30)
    .slice(0, 24);
}

function parseSteps(row) {
  const steps = [];
  for (let i = 1; i <= 20; i++) {
    const key = `MANUAL${String(i).padStart(2, "0")}`;
    const raw = row[key];
    if (!raw) continue;
    const text = String(raw).replace(/^\s*\d+\s*[.)]?\s*/, "").replace(/\s+/g, " ").trim();
    if (text) steps.push(text);
  }
  return steps;
}

function difficultyOf(stepCount) {
  if (stepCount <= 4) return "쉬움";
  if (stepCount <= 8) return "보통";
  return "어려움";
}

function toRecipe(row) {
  const steps = parseSteps(row);
  const kcal = Math.round(Number(row.INFO_ENG));
  const image = row.ATT_FILE_NO_MK || row.ATT_FILE_NO_MAIN || null;

  return {
    id: `mfds-${row.RCP_SEQ}`,
    title: String(row.RCP_NM ?? "").trim(),
    minutes: null,                       // API에 조리시간 항목이 없습니다
    servings: 1,
    difficulty: difficultyOf(steps.length),
    kcal: isFinite(kcal) && kcal > 0 ? kcal : null,
    image: image && /^https?:\/\//.test(image) ? image : null,
    ingredients: parseIngredients(row.RCP_PARTS_DTLS),
    steps,
    source: { name: SOURCE_NAME, url: "" },
    _tags: String(row.HASH_TAG ?? "") + " " + String(row.RCP_PAT2 ?? "")
  };
}

/* ---------- 메뉴 ↔ 레시피 매칭 ---------- */

function matchToMenus(recipes, names) {
  const items = {};

  for (const name of names) {
    const key = squash(name);
    const hits = [];

    for (const r of recipes) {
      const title = squash(r.title);
      if (!title) continue;

      let score = 0;
      if (title === key) score = 100;
      else if (title.includes(key)) score = 80 - Math.min(20, title.length - key.length);
      else if (key.length >= 3 && key.includes(title)) score = 60;
      else if (squash(r._tags).includes(key)) score = 40;

      if (score > 0) hits.push({ score, recipe: r });
    }

    if (!hits.length) continue;

    hits.sort((a, b) => b.score - a.score || b.recipe.steps.length - a.recipe.steps.length);
    items[name] = hits.slice(0, PER).map(({ recipe }) => {
      const { _tags, ...clean } = recipe;
      return clean;
    });
  }

  return items;
}

/* ---------- 실행 ---------- */

async function main() {
  if (!KEY) {
    throw new Error(
      "인증키가 없습니다. --key=... 또는 FOODSAFETY_KEY 환경변수로 넣어주세요.\n" +
      "발급: https://openapi.foodsafetykorea.go.kr  (구조만 볼 때는 --key=sample)"
    );
  }

  const names = await readMenuNames();
  console.log(`메뉴 ${names.length}종 로드`);

  if (CHECK) {
    const { rows, total } = await fetchPage(1, 5);
    console.log(`\n[--check] 전체 ${total}건 중 5건을 받았습니다.`);
    if (!rows.length) {
      console.log("행이 비어 있습니다. 키를 확인해주세요.");
      return;
    }
    const sample = toRecipe(rows[0]);
    delete sample._tags;
    console.log(JSON.stringify(sample, null, 2));
    console.log(
      sample.steps.length && sample.ingredients.length
        ? "\n변환 정상입니다. --check 없이 실행하세요."
        : "\n재료 또는 조리순서를 뽑지 못했습니다. parseIngredients/parseSteps 를 확인해주세요."
    );
    return;
  }

  const first = await fetchPage(1, PAGE);
  const total = first.total || first.rows.length;
  const all = [...first.rows];
  console.log(`전체 ${total}건 수집 시작 (${PAGE}건씩)`);

  for (let start = PAGE + 1; start <= total; start += PAGE) {
    const end = Math.min(start + PAGE - 1, total);
    await sleep(DELAY);
    try {
      const { rows } = await fetchPage(start, end);
      all.push(...rows);
      console.log(`  ${start}~${end} … 누적 ${all.length}건`);
    } catch (err) {
      console.log(`  ${start}~${end} 실패: ${err.message}`);
    }
  }

  const recipes = all.map(toRecipe).filter((r) => r.title && r.steps.length);
  console.log(`\n변환 완료: ${recipes.length}건 (조리순서 있는 것만)`);

  const items = matchToMenus(recipes, names);
  const matchedMenus = Object.keys(items).length;
  const matchedRecipes = Object.values(items).reduce((n, list) => n + list.length, 0);

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceName: SOURCE_NAME,
    license: "공공데이터 — 출처 표시 조건",
    items
  }, null, 2) + "\n", "utf8");

  console.log(`매칭: 메뉴 ${matchedMenus}/${names.length}종, 레시피 ${matchedRecipes}건`);
  console.log(`저장: data/recipes.json`);

  const missing = names.filter((n) => !items[n]);
  if (missing.length) {
    console.log(`\n레시피를 못 찾은 메뉴 ${missing.length}종:`);
    console.log("  " + missing.join(", "));
    console.log("이 메뉴들은 assets/js/recipes.js 에 직접 추가하는 게 빠릅니다.");
  }
}

main().catch((err) => {
  console.error(`\n중단: ${err.message}`);
  process.exit(1);
});
