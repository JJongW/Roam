import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportPKCS8, generateKeyPair, jwtVerify, type CryptoKey } from "jose";
import { apnsConfigFromEnv, classifyApnsResponse, createApnsSender } from "./apns";

describe("APNs 응답 분류", () => {
  it("410과 BadDeviceToken은 토큰을 끊고, 403, 429, 5xx는 다시 해 본다", () => {
    expect(classifyApnsResponse(200, undefined)).toEqual({ ok: true, status: 200 });
    expect(classifyApnsResponse(410, "Unregistered")).toMatchObject({ ok: false, tokenDead: true, retryable: false });
    expect(classifyApnsResponse(400, "BadDeviceToken")).toMatchObject({ tokenDead: true, retryable: false });
    expect(classifyApnsResponse(400, "DeviceTokenNotForTopic")).toMatchObject({ tokenDead: false, retryable: false });
    expect(classifyApnsResponse(403, "ExpiredProviderToken")).toMatchObject({ tokenDead: false, retryable: true });
    expect(classifyApnsResponse(429, "TooManyRequests")).toMatchObject({ retryable: true });
    expect(classifyApnsResponse(503, "ServiceUnavailable")).toMatchObject({ retryable: true });
  });
});

describe("환경변수", () => {
  it("빠진 이름만 알려 주고 값은 돌려주지 않는다", () => {
    expect(apnsConfigFromEnv({})).toEqual({ ok: false, missing: ["APNS_KEY_ID", "APNS_KEY_P8 또는 APNS_KEY_PATH"] });
    const r = apnsConfigFromEnv({ APNS_KEY_ID: "ABC123DEFG", APNS_KEY_P8: "-----BEGIN PRIVATE KEY-----\\nx\\n-----END PRIVATE KEY-----" });
    expect(r.ok && r.config).toMatchObject({ keyId: "ABC123DEFG", teamId: "39MK2JX9R4", bundleId: "jw.romi.Roam" });
    expect(r.ok && r.config.privateKey).toContain("\nx\n");
  });
});

describe("APNs 보내기(로컬 HTTP/2 서버)", () => {
  let server: http2.Http2Server;
  let base: string;
  let publicKey: CryptoKey;
  let privatePem: string;
  const seen: { path: string; headers: http2.IncomingHttpHeaders; body: unknown }[] = [];

  beforeAll(async () => {
    const kp = await generateKeyPair("ES256", { extractable: true });
    publicKey = kp.publicKey;
    privatePem = await exportPKCS8(kp.privateKey);
    server = http2.createServer();
    server.on("stream", (stream, headers) => {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        const path = String(headers[":path"]);
        seen.push({ path, headers, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
        if (path.endsWith("/dead")) {
          stream.respond({ ":status": 410 });
          stream.end(JSON.stringify({ reason: "Unregistered" }));
        } else {
          stream.respond({ ":status": 200, "apns-id": "x" });
          stream.end();
        }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("ES256 토큰, 토픽, 경로를 실어 보내고 410을 토큰 끊기로 돌려준다", async () => {
    const sender = createApnsSender(
      { keyId: "KEY1234567", teamId: "39MK2JX9R4", bundleId: "jw.romi.Roam", privateKey: privatePem },
      { hosts: { sandbox: base, production: base } },
    );
    const body = { aps: { alert: { title: "t", body: "b" } }, kind: "brand", slug: "s", exhibitorIds: ["a"] };
    const ok = await sender.send({ token: "good", environment: "sandbox" }, { body, collapseId: "batch-1", expiresAt: 123 });
    const dead = await sender.send({ token: "dead", environment: "production" }, { body });
    sender.close();

    expect(ok).toEqual({ ok: true, status: 200 });
    expect(dead).toMatchObject({ ok: false, status: 410, reason: "Unregistered", tokenDead: true });
    const first = seen[0];
    expect(first.path).toBe("/3/device/good");
    expect(first.headers["apns-topic"]).toBe("jw.romi.Roam");
    expect(first.headers["apns-push-type"]).toBe("alert");
    expect(first.headers["apns-collapse-id"]).toBe("batch-1");
    expect(first.headers["apns-expiration"]).toBe("123");
    expect(first.body).toEqual(body);
    const jwt = String(first.headers.authorization).replace(/^bearer /, "");
    const { payload, protectedHeader } = await jwtVerify(jwt, publicKey);
    expect(protectedHeader).toMatchObject({ alg: "ES256", kid: "KEY1234567" });
    expect(payload.iss).toBe("39MK2JX9R4");
    // 같은 토큰을 다시 쓴다(50분 안).
    expect(seen[1].headers.authorization).toBe(first.headers.authorization);
  });
});
