#!/usr/bin/env node
/**
 * FoodPick 단일 파일 빌드 — 개인용
 *
 *   node tools/build-single.mjs
 *   node tools/build-single.mjs --out=~/Desktop/foodpick.html
 *
 * CSS · JS · 수집한 데이터를 index.html 안에 전부 박아 HTML 한 개로 만듭니다.
 * 서버도 인터넷도 필요 없습니다. 더블클릭하면 열리고, 폰에 에어드롭해서
 * 파일 앱에서 열어도 그대로 동작합니다.
 *
 * 왜 필요한가
 *   브라우저는 file:// 에서 fetch 를 막습니다. 그래서 data/*.json 을 따로 두면
 *   파일로 열었을 때 레시피가 안 보입니다. 데이터까지 같이 박아야 합니다.
 *
 * 알아둘 점
 *   - 글꼴은 Google Fonts 를 그대로 링크합니다. 오프라인이면 시스템 글꼴로
 *     대체되어 모양만 조금 달라지고 기능은 그대로입니다.
 *   - 음식 사진은 원본 주소를 링크합니다. 오프라인이면 이모지 카드로 나옵니다.
 *   - 찜·저장 기록은 브라우저별로 따로 저장됩니다. file:// 로 열면 출처가
 *     null 이라, 파일을 다른 폴더로 옮기면 기록이 안 보일 수 있습니다.
 *
 * Node 18 이상.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const OUT = resolve(flag("out", join(ROOT, "foodpick.html")).replace(/^~/, homedir()));

/** 인라인 스크립트 안에서 </script> 가 나오면 파서가 태그를 닫아버립니다. */
const safeForScript = (text) =>
  text.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");

async function readIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function readJsonIfExists(path) {
  const raw = await readIfExists(path);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.log(`  ${path} 파싱 실패, 건너뜁니다 — ${err.message}`);
    return null;
  }
}

async function main() {
  let html = await readFile(join(ROOT, "index.html"), "utf8");

  /* CSS */
  const css = await readFile(join(ROOT, "assets", "css", "style.css"), "utf8");
  const cssTag = '<link rel="stylesheet" href="assets/css/style.css">';
  if (!html.includes(cssTag)) throw new Error("index.html 에서 스타일 링크를 찾지 못했습니다.");
  html = html.replace(cssTag, `<style>\n${css}\n</style>`);

  /* 수집 데이터 — app.js 보다 먼저 들어가야 합니다 */
  const recipes = await readJsonIfExists(join(ROOT, "data", "recipes.json"));
  const photos = await readJsonIfExists(join(ROOT, "data", "photos.json"));

  const recipeCount = recipes
    ? Object.values(recipes.items ?? {}).reduce((n, list) => n + list.length, 0)
    : 0;
  const photoCount = photos ? Object.keys(photos.items ?? {}).length : 0;

  const inline = `<script>\nwindow.FOODPICK_INLINE = ${
    safeForScript(JSON.stringify({ recipes, photos }))
  };\n</script>`;

  /* JS 파일들 */
  const scripts = ["menus.js", "places.js", "recipes.js", "app.js"];
  for (const file of scripts) {
    const tag = `<script src="assets/js/${file}"></script>`;
    if (!html.includes(tag)) throw new Error(`index.html 에서 ${file} 태그를 찾지 못했습니다.`);
    const code = await readFile(join(ROOT, "assets", "js", file), "utf8");
    const replacement = file === "menus.js"
      ? `${inline}\n<script>\n${safeForScript(code)}\n</script>`
      : `<script>\n${safeForScript(code)}\n</script>`;
    html = html.replace(tag, replacement);
  }

  /* 개인용 표시 */
  html = html.replace(
    "<title>FoodPick — 오늘 뭐 먹지</title>",
    "<title>FoodPick — 오늘 뭐 먹지</title>\n<!-- 단일 파일 빌드 (개인용). 생성: " +
      new Date().toISOString() + " -->"
  );

  await writeFile(OUT, html, "utf8");

  const kb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(0);
  console.log(`완료 → ${OUT}`);
  console.log(`  크기       ${kb}KB (파일 1개)`);
  console.log(`  수집 레시피 ${recipeCount}건${recipes ? "" : " (data/recipes.json 없음)"}`);
  console.log(`  수집 사진   ${photoCount}건${photos ? "" : " (data/photos.json 없음)"}`);
  console.log("");
  console.log("맥: 더블클릭하면 열립니다.");
  console.log("폰: 에어드롭 → 파일 앱에서 탭. Safari 로 열린 뒤 공유 → 홈 화면에 추가.");
}

main().catch((err) => {
  console.error(`\n중단: ${err.message}`);
  process.exit(1);
});
