#!/usr/bin/env node
/**
 * 집 근처 맛집 후보 수집 — 카카오맵 로컬 API
 *
 *   node tools/fetch-places.mjs --key=REST키 --near="고양시 덕양구 원당 래미안 휴레스트"
 *   node tools/fetch-places.mjs --key=REST키 --near="..." --radius=800 --out=js
 *
 *   --radius=1000   반경 미터 (기본 1000, 최대 20000)
 *   --limit=45      가져올 개수 (기본 45)
 *   --out=js|json   js: 붙여넣을 코드로 출력 (기본) / json: data/places.json
 *
 * 키 발급 (무료)
 *   https://developers.kakao.com → 애플리케이션 추가 → 앱 키 → REST API 키
 *   별도 사용 신청 없이 로컬(장소 검색) API 를 쓸 수 있습니다.
 *
 * 하는 일
 *   1) 주소/장소명을 좌표로 바꾸고 (키워드 검색)
 *   2) 그 좌표 반경 안의 음식점(FD6)과 카페(CE7)를 거리순으로 가져와
 *   3) places.js 와 같은 모양으로 저장합니다.
 *
 * 여기서 나온 건 "근처 가게 목록"이지 "맛집"이 아닙니다. 훑어보고 실제로
 * 가볼 만한 곳만 남기세요. 룰렛은 남긴 것에서만 돌아갑니다.
 *
 * Node 18 이상.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "places.json");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};

const KEY = flag("key", process.env.KAKAO_REST_KEY || "");
const NEAR = flag("near", "");
const RADIUS = Math.min(20000, Number(flag("radius", 1000)));
const LIMIT = Number(flag("limit", 45));
const OUT_MODE = flag("out", "js");

const HEADERS = { Authorization: `KakaoAK ${KEY}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 카카오 카테고리 이름을 우리 업종으로 */
function toCategory(name) {
  const t = String(name ?? "");
  if (t.includes("카페") || t.includes("디저트")) return "카페";
  if (t.includes("술집") || t.includes("호프") || t.includes("포차")) return "술집";
  if (t.includes("중식")) return "중식";
  if (t.includes("일식") || t.includes("초밥") || t.includes("돈까스")) return "일식";
  if (t.includes("양식") || t.includes("피자") || t.includes("햄버거")) return "양식";
  if (t.includes("아시아") || t.includes("베트남") || t.includes("태국")) return "아시안";
  if (t.includes("분식")) return "분식";
  if (t.includes("한식") || t.includes("백반") || t.includes("국밥")) return "한식";
  return "한식";
}

const EMOJI = {
  한식: "🍚", 중식: "🥡", 일식: "🍣", 양식: "🍝",
  아시안: "🍜", 분식: "🌶", 카페: "☕", 술집: "🍻"
};

async function kakao(path, params) {
  const url = new URL(`https://dapi.kakao.com/v2/local/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url, { headers: HEADERS });
  if (res.status === 401) throw new Error("인증 실패 — REST API 키를 확인해주세요.");
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

async function findCenter(query) {
  const data = await kakao("search/keyword.json", { query, size: 5 });
  const hit = data.documents?.[0];
  if (!hit) throw new Error(`"${query}" 위치를 찾지 못했습니다. 더 구체적으로 적어보세요.`);

  console.log(`기준점: ${hit.place_name || query}`);
  console.log(`        ${hit.road_address_name || hit.address_name}`);
  return { x: hit.x, y: hit.y };
}

async function collect(center, categoryCode) {
  const found = [];

  for (let page = 1; page <= 3 && found.length < LIMIT; page++) {
    const data = await kakao("search/category.json", {
      category_group_code: categoryCode,
      x: center.x, y: center.y,
      radius: RADIUS, sort: "distance",
      page, size: 15
    });

    found.push(...(data.documents ?? []));
    if (data.meta?.is_end) break;
    await sleep(200);
  }

  return found;
}

function toPlace(doc) {
  const category = toCategory(doc.category_name);
  const meters = Number(doc.distance);
  const walk = isFinite(meters) && meters > 0 ? Math.max(1, Math.round(meters / 67)) : null;

  return {
    name: doc.place_name,
    category,
    emoji: EMOJI[category] ?? "📍",
    walk,
    price: null,
    tags: [],
    url: doc.place_url || "",
    phone: doc.phone || "",
    note: "",
    _address: doc.road_address_name || doc.address_name,
    _meters: isFinite(meters) ? meters : null
  };
}

async function main() {
  if (!KEY) throw new Error("REST API 키가 없습니다. --key=... 또는 KAKAO_REST_KEY 환경변수.\n발급: https://developers.kakao.com");
  if (!NEAR) throw new Error('기준 위치가 없습니다. 예: --near="고양시 덕양구 원당 래미안 휴레스트"');

  const center = await findCenter(NEAR);
  console.log(`반경 ${RADIUS}m 안을 찾습니다...\n`);

  const docs = [...await collect(center, "FD6"), ...await collect(center, "CE7")];

  const seen = new Set();
  const places = docs
    .map(toPlace)
    .filter((p) => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    })
    .sort((a, b) => (a._meters ?? 9e9) - (b._meters ?? 9e9))
    .slice(0, LIMIT);

  console.log(`${places.length}곳\n`);
  places.forEach((p, i) => {
    console.log(`${String(i + 1).padStart(2)}. ${p.name}  (${p.category}, 걸어서 ${p.walk ?? "?"}분)`);
    console.log(`    ${p._address}`);
  });

  const clean = places.map(({ _address, _meters, ...rest }) => rest);

  if (OUT_MODE === "js") {
    console.log("\n--- assets/js/places.js 의 배열 안에 붙여넣으세요 ---\n");
    console.log(clean.map((p) => "  " + JSON.stringify(p) + ",").join("\n"));
  } else {
    await mkdir(dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify({
      generatedAt: new Date().toISOString(),
      near: NEAR, radius: RADIUS,
      items: clean
    }, null, 2) + "\n", "utf8");
    console.log(`\n저장: data/places.json`);
  }

  console.log("\n여기 있는 건 '근처 가게'이지 '맛집'이 아닙니다.");
  console.log("가봤거나 가볼 만한 곳만 남기고 나머지는 지우세요.");
}

const isEntryPoint = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isEntryPoint) {
  main().catch((err) => {
    console.error(`\n중단: ${err.message}`);
    process.exit(1);
  });
}
