import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // React Compiler 계열 신규 규칙. 하이드레이션/mounted 게이트
      // (useEffect(()=>setX(true),[]))·effect 내 로딩플래그처럼 관용적이고 안전한
      // 패턴까지 error로 잡아 빌드를 막는다. 진짜 안티패턴은 리뷰에서 걸러지므로
      // warn으로 낮춰 가시성은 유지하되 CI는 막지 않는다.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
