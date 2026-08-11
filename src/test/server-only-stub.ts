// vitest용 "server-only" 스텁. 실제 npm 패키지가 아니라 Next.js 내부에 번들된
// 가드(react-server 조건 밖에서 import되면 throw)라 vite/vitest는 이 bare
// specifier를 해석 못 한다(vitest.config.ts의 resolve.alias가 이 파일로 돌린다).
// 테스트 환경엔 클라이언트/서버 번들 경계가 없으므로 no-op으로 둔다.
export {};
