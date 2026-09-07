# 워커 이미지. Next 빌드가 아니라 소스를 그대로 vite-node로 돌린다 —
# 배치 프로세스라 번들링해서 얻을 게 없고, 앱 코드와 같은 파일을 쓰는 게
# "실행 위치가 달라도 규칙이 갈리지 않는다"는 조건을 지키기 쉽다.
FROM node:22-alpine

WORKDIR /app

# 의존성 레이어를 먼저 — 소스만 바뀌면 재설치를 안 한다.
COPY package.json package-lock.json* ./
RUN npm ci --omit=optional

COPY tsconfig.json ./
COPY src ./src
COPY worker ./worker

# 하루 멈춰도 사용자에게 아무 일 없는 것만 여기 올린다(설계 §4).
# 그래도 죽으면 다시 뜨는 게 낫다 — restart 정책은 compose가 건다.
CMD ["npx", "vite-node", "-c", "worker/vite.config.ts", "worker/index.ts"]
