import { defineConfig } from "vite";
import path from "node:path";

/**
 * 워커 실행 설정. Next 밖에서 도는 프로세스라 두 가지를 대신 해줘야 한다.
 *
 * - `@/` 별칭 — tsconfig의 paths를 Next만 알고 있다.
 * - `server-only` — Next가 자체 처리하는 가상 모듈이라 Node에는 없다. 워커는
 *   애초에 서버라 그 가드가 필요 없으므로 빈 모듈로 바꾼다. 가드를 코드에서
 *   빼지 않는 이유는 그게 **클라이언트 번들 유입을 막는 장치**여서다.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../src"),
      "server-only": path.resolve(import.meta.dirname, "./stubs/server-only.ts"),
    },
  },
});
