// APNs 보내기 — HTTP/2 + 토큰 인증(.p8, ES256 JWT).
//
// 왜 라이브러리가 아닌가: 레포에 APNs 라이브러리가 없고, 필요한 건 요청 하나(POST /3/device/<token>)다.
// node 내장 http2와 이미 쓰는 jose(ES256 서명)로 충분하다. node-apn은 관리가 멈췄고(마지막 릴리스 2019 무렵),
// 다른 라이브러리는 의존성만 늘린다. 결정 기록: docs/decisions/2026-11-19_브랜드-알림-서버.md
//
// 환경변수(값은 읽기만 하고 출력하지 않는다):
//   APNS_KEY_ID      .p8 키 id(10자)
//   APNS_TEAM_ID     팀 id. 없으면 39MK2JX9R4
//   APNS_KEY_P8      .p8 내용(PEM). 줄바꿈을 \n으로 적어도 된다. 또는
//   APNS_KEY_PATH    .p8 파일 경로
//   APNS_BUNDLE_ID   apns-topic. 없으면 jw.romi.Roam
// 기기마다 push_device.environment(sandbox | production)로 보낼 서버를 고른다.
import { readFileSync } from "node:fs";
import http2 from "node:http2";
import { importPKCS8, SignJWT } from "jose";

export interface PushTarget {
  token: string;
  environment: "sandbox" | "production";
}

export interface PushMessage {
  /** APNs JSON 본문(aps + 사용자 키). */
  body: Record<string, unknown>;
  /** 같은 묶음을 다시 보내면 기기에서 하나로 겹친다(64바이트 이하). */
  collapseId?: string;
  /** 이 시각(초)이 지나면 APNs가 버린다. */
  expiresAt?: number;
}

export type PushResult =
  | { ok: true; status: number }
  | {
      ok: false;
      status: number;
      reason: string;
      /** 410 Unregistered, 400 BadDeviceToken — 이 토큰은 끊는다. */
      tokenDead: boolean;
      /** 403(우리 키 문제), 429, 5xx, 연결 실패 — 사용자 탓이 아니니 다음 번에 다시 해 본다. */
      retryable: boolean;
    };

export interface PushSender {
  send(target: PushTarget, msg: PushMessage): Promise<PushResult>;
  close(): void;
}

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  /** PEM(PKCS#8). */
  privateKey: string;
}

export const APNS_HOSTS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
} as const;

/** 환경변수에서 설정을 읽는다. 빠진 이름만 돌려주고 값은 돌려주지 않는다. */
export function apnsConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): { ok: true; config: ApnsConfig } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const keyId = env.APNS_KEY_ID?.trim();
  if (!keyId) missing.push("APNS_KEY_ID");
  let privateKey = env.APNS_KEY_P8?.replace(/\\n/g, "\n").trim();
  if (!privateKey && env.APNS_KEY_PATH) {
    try {
      privateKey = readFileSync(env.APNS_KEY_PATH, "utf8").trim();
    } catch {
      missing.push("APNS_KEY_PATH(읽을 수 없음)");
    }
  }
  if (!privateKey && !missing.some((m) => m.startsWith("APNS_KEY_PATH"))) missing.push("APNS_KEY_P8 또는 APNS_KEY_PATH");
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    config: {
      keyId: keyId!,
      teamId: env.APNS_TEAM_ID?.trim() || "39MK2JX9R4",
      bundleId: env.APNS_BUNDLE_ID?.trim() || "jw.romi.Roam",
      privateKey: privateKey!,
    },
  };
}

/** APNs 응답 → 결과. 순수(테스트한다). */
export function classifyApnsResponse(status: number, reason: string | undefined): PushResult {
  if (status === 200) return { ok: true, status };
  const r = reason ?? `HTTP ${status}`;
  return {
    ok: false,
    status,
    reason: r,
    tokenDead: status === 410 || (status === 400 && r === "BadDeviceToken"),
    retryable: status === 403 || status === 429 || status >= 500 || status === 0,
  };
}

/** 토큰 JWT는 20분에서 60분 사이에 새로 만들어야 한다(Apple). 50분마다 바꾼다. */
const JWT_TTL_MS = 50 * 60_000;

export function createApnsSender(
  config: ApnsConfig,
  /** hosts는 테스트가 로컬 HTTP/2 서버로 바꿔 끼울 때만 쓴다. */
  opts: { now?: () => number; hosts?: Record<PushTarget["environment"], string> } = {},
): PushSender {
  const now = opts.now ?? Date.now;
  const hosts = opts.hosts ?? APNS_HOSTS;
  let jwt: { token: string; at: number } | null = null;
  const sessions = new Map<string, http2.ClientHttp2Session>();

  async function bearer(): Promise<string> {
    if (jwt && now() - jwt.at < JWT_TTL_MS) return jwt.token;
    const key = await importPKCS8(config.privateKey, "ES256");
    const at = now();
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: config.keyId })
      .setIssuer(config.teamId)
      .setIssuedAt(Math.floor(at / 1000))
      .sign(key);
    jwt = { token, at };
    return token;
  }

  function session(env: PushTarget["environment"]): http2.ClientHttp2Session {
    const have = sessions.get(env);
    if (have && !have.closed && !have.destroyed) return have;
    const s = http2.connect(hosts[env]);
    s.on("error", () => sessions.delete(env));
    s.on("close", () => sessions.delete(env));
    sessions.set(env, s);
    return s;
  }

  return {
    async send(target, msg) {
      let auth: string;
      try {
        auth = await bearer();
      } catch (e) {
        // 키가 잘못됐다. 기기 탓이 아니라 다시 해도 같다.
        return { ok: false, status: 0, reason: `JWT 서명 실패: ${e instanceof Error ? e.message : String(e)}`, tokenDead: false, retryable: false };
      }
      const payload = Buffer.from(JSON.stringify(msg.body));
      return new Promise<PushResult>((resolve) => {
        let req: http2.ClientHttp2Stream;
        try {
          req = session(target.environment).request({
            ":method": "POST",
            ":path": `/3/device/${target.token}`,
            authorization: `bearer ${auth}`,
            "apns-topic": config.bundleId,
            "apns-push-type": "alert",
            "apns-priority": "10",
            ...(msg.collapseId ? { "apns-collapse-id": msg.collapseId.slice(0, 64) } : {}),
            ...(msg.expiresAt ? { "apns-expiration": String(msg.expiresAt) } : {}),
            "content-type": "application/json",
            "content-length": payload.length,
          });
        } catch (e) {
          resolve(classifyNetwork(e));
          return;
        }
        let status = 0;
        const chunks: Buffer[] = [];
        req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
        req.on("response", (h) => {
          status = Number(h[":status"] ?? 0);
        });
        req.on("data", (c: Buffer) => chunks.push(c));
        req.on("end", () => {
          let reason: string | undefined;
          if (chunks.length) {
            try {
              reason = (JSON.parse(Buffer.concat(chunks).toString("utf8")) as { reason?: string }).reason;
            } catch {
              reason = undefined;
            }
          }
          resolve(classifyApnsResponse(status, reason));
        });
        req.on("error", (e) => resolve(classifyNetwork(e)));
        // 시간 초과로 끊기면 end 없이 close만 온다. 먼저 온 resolve가 이긴다.
        req.on("close", () => resolve(classifyNetwork(new Error(status ? `HTTP ${status}에서 끊김` : "응답 없음"))));
        req.end(payload);
      });
    },
    close() {
      for (const s of sessions.values()) s.close();
      sessions.clear();
    },
  };
}

function classifyNetwork(e: unknown): PushResult {
  return { ok: false, status: 0, reason: `연결 실패: ${e instanceof Error ? e.message : String(e)}`, tokenDead: false, retryable: true };
}
