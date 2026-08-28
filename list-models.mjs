// list-models.mjs — 이 키가 지원하는 모델 목록 출력
// 실행:  node --env-file=.env list-models.mjs
const key = process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY;
if (!key) { console.error("키 없음: GEMINI_API_KEY_2 / GEMINI_API_KEY"); process.exit(1); }

const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
  headers: { "x-goog-api-key": key },
});
const j = await r.json();
if (!j.models) { console.error("응답:", JSON.stringify(j).slice(0, 500)); process.exit(1); }

console.log("=== 이미지 관련(추정) 모델 ===");
for (const m of j.models) {
  if (/image|imagen/i.test(m.name)) {
    console.log(m.name.replace("models/", ""), "->", (m.supportedGenerationMethods || []).join(", "));
  }
}
console.log("\n=== 전체 모델 ===");
for (const m of j.models) {
  console.log(m.name.replace("models/", ""), "->", (m.supportedGenerationMethods || []).join(", "));
}
