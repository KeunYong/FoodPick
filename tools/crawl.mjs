#!/usr/bin/env node
/**
 * FoodPick 사진/레시피 링크 수집기 — 사용자가 직접 로컬에서 실행하는 스크립트
 *
 *   node tools/crawl.mjs --check          선택자가 아직 유효한지 1건만 확인
 *   node tools/crawl.mjs                  data/photos.json 채우기 (이어받기 지원)
 *   node tools/crawl.mjs --limit=20        20건만
 *   node tools/crawl.mjs --force           이미 채운 항목도 다시 조회
 *   node tools/crawl.mjs --delay=2000      요청 간 간격(ms), 기본 1200
 *
 * 동작 방식
 *   메뉴 이름으로 만개의레시피 검색 페이지를 열어, 첫 결과의 썸네일 URL과
 *   레시피 주소만 기록합니다. 이미지 파일을 내려받지 않고 URL만 저장하며,
 *   레시피 본문(재료·조리순서)은 수집하지 않습니다. 앱은 저장된 주소로
 *   원문을 링크합니다.
 *
 * 실행 전 확인
 *   - robots.txt 는 ClaudeBot 을 전체 차단하고 ai-train=no, use=reference 를
 *     선언하고 있습니다. 그래서 이 스크립트는 AI 에이전트가 아니라 사용자가
 *     직접 실행하며, 수집물을 모델 학습에 쓰지 않습니다.
 *   - 사진과 레시피 저작권은 각 작성자에게 있습니다. 수집한 썸네일을 공개
 *     사이트에 재배포하는 것은 별개의 판단이 필요합니다. 개인/내부용으로
 *     쓰거나, 공개 배포 시에는 출처 표기와 원문 링크를 반드시 함께 두세요.
 *   - Node 18 이상 필요 (내장 fetch 사용).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MENUS_JS = join(ROOT, "assets", "js", "menus.js");
const OUT = join(ROOT, "data", "photos.json");

const ORIGIN = "https://www.10000recipe.com";
const LIST_PATH = "/recipe/list.html";
const DISALLOWED = ["/admin/", "/app/", "/static/"];   // robots.txt User-agent: *

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const has = (name) => args.includes(`--${name}`);

const DELAY = Number(flag("delay", 1200));
const LIMIT = Number(flag("limit", Infinity));
const FORCE = has("force");
const CHECK = has("check");
const UA = flag("ua", "FoodPick-DataFetcher/1.0 (personal recipe picker; contact: repo owner)");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 메뉴 이름 읽기 ---------- */

async function readMenuNames() {
  const src = await readFile(MENUS_JS, "utf8");
  const open = src.indexOf("[", src.indexOf("window.FOODPICK_MENUS"));
  const close = src.lastIndexOf("]");
  if (open === -1 || close === -1) throw new Error("menus.js 에서 배열을 찾지 못했습니다.");

  const json = src
    .slice(open, close + 1)
    .replace(/\/\/[^\n]*/g, "")          // 줄 주석 제거
    .replace(/,(\s*[\]}])/g, "$1");      // 트레일링 콤마 제거

  return JSON.parse(json).map((row) => row[0]);
}

/* ---------- robots.txt 확인 ---------- */

async function assertAllowed() {
  const res = await fetch(`${ORIGIN}/robots.txt`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`robots.txt 를 읽을 수 없습니다 (HTTP ${res.status}).`);
  const text = await res.text();

  // User-agent: * 블록만 확인 (특정 봇 블록은 이 스크립트 UA에 해당하지 않음)
  const blocks = text.split(/\n(?=User-[Aa]gent:)/);
  const star = blocks.filter((b) => /^User-[Aa]gent:\s*\*/m.test(b));
  const rules = star.flatMap((b) =>
    [...b.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1])
  );

  const blocked = rules.some((rule) => rule === "/" || LIST_PATH.startsWith(rule));
  if (blocked) {
    throw new Error(`robots.txt 가 ${LIST_PATH} 를 차단하고 있습니다. 중단합니다.`);
  }
  for (const p of DISALLOWED) {
    if (LIST_PATH.startsWith(p)) throw new Error(`${p} 는 수집 금지 경로입니다.`);
  }
  console.log(`robots.txt 확인 완료 — User-agent: * 기준 ${LIST_PATH} 접근 허용`);
}

/* ---------- 검색 결과 1건 파싱 ---------- */

function parseFirstResult(html) {
  const idMatch = html.match(/href="\/recipe\/(\d+)"/);
  if (!idMatch) return null;

  const sid = idMatch[1];
  const at = idMatch.index ?? 0;
  const window_ = html.slice(Math.max(0, at - 400), at + 1200);

  const img =
    window_.match(/data-src="(https?:\/\/[^"]+?\.(?:jpe?g|png|gif))"/i) ||
    window_.match(/src="(https?:\/\/[^"]+?\.(?:jpe?g|png|gif))"/i);

  const title =
    html.match(/common_sp_caption_tit[^>]*>\s*([^<]+?)\s*</) ||
    window_.match(/alt="([^"]+)"/);

  return {
    sid,
    link: `${ORIGIN}/recipe/${sid}`,
    image: img ? img[1] : null,
    title: title ? title[1].trim() : null
  };
}

async function search(name, attempt = 1) {
  const url = `${ORIGIN}${LIST_PATH}?q=${encodeURIComponent(name)}&order=reco`;
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

    const found = parseFirstResult(await res.text());
    return found || { error: "검색 결과 없음 또는 페이지 구조 변경" };
  } catch (err) {
    if (attempt < 3) {
      const wait = DELAY * attempt * 2;
      console.log(`  재시도 ${attempt}/2 (${wait}ms 후) — ${err.message}`);
      await sleep(wait);
      return search(name, attempt + 1);
    }
    return { error: err.message };
  }
}

/* ---------- 실행 ---------- */

async function main() {
  const names = await readMenuNames();
  console.log(`메뉴 ${names.length}종 로드`);

  await assertAllowed();
  await sleep(DELAY);

  if (CHECK) {
    const sample = names[0];
    console.log(`\n[--check] "${sample}" 1건만 조회합니다.`);
    const r = await search(sample);
    console.log(JSON.stringify(r, null, 2));
    console.log(
      r.error || !r.image
        ? "\n사진 URL을 뽑지 못했습니다. parseFirstResult() 의 정규식을 현재 페이지 구조에 맞게 고쳐야 합니다."
        : "\n정상입니다. --check 없이 실행하세요."
    );
    return;
  }

  let store = { generatedAt: null, source: ORIGIN, items: {} };
  try {
    store = JSON.parse(await readFile(OUT, "utf8"));
    store.items ??= {};
  } catch { /* 첫 실행 */ }

  const todo = names.filter((n) => FORCE || !store.items[n]?.image).slice(0, LIMIT);
  console.log(`대상 ${todo.length}건 (완료 ${Object.keys(store.items).length}건, 간격 ${DELAY}ms)`);
  console.log(`예상 소요 약 ${Math.ceil((todo.length * DELAY) / 60000)}분\n`);

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < todo.length; i++) {
    const name = todo[i];
    const r = await search(name);

    if (r.error || !r.image) {
      fail++;
      console.log(`[${i + 1}/${todo.length}] ✗ ${name} — ${r.error ?? "사진 없음"}`);
    } else {
      ok++;
      store.items[name] = { image: r.image, link: r.link, title: r.title };
      console.log(`[${i + 1}/${todo.length}] ✓ ${name} — ${r.title ?? r.sid}`);
    }

    if ((i + 1) % 10 === 0 || i === todo.length - 1) await flush(store);
    if (i < todo.length - 1) await sleep(DELAY);
  }

  console.log(`\n완료 — 성공 ${ok}건, 실패 ${fail}건`);
  console.log(`저장 위치: data/photos.json (총 ${Object.keys(store.items).length}건)`);
  if (fail) console.log("실패한 항목은 다시 실행하면 이어서 시도합니다.");
}

async function flush(store) {
  store.generatedAt = new Date().toISOString();
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(store, null, 2) + "\n", "utf8");
}

main().catch((err) => {
  console.error(`\n중단: ${err.message}`);
  process.exit(1);
});
