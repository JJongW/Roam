import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta 웹훅 서명 검증. Meta는 원문 바디를 앱 시크릿으로 HMAC-SHA256 한 값을
 * `X-Hub-Signature-256: sha256=<hex>`로 보낸다. 검증 없이 받으면 누구나 가짜 댓글
 * 이벤트를 보내 우리 계정으로 DM을 쏘게 만들 수 있다.
 *
 * 반드시 **파싱 전 원문 문자열**로 계산한다 — JSON.stringify로 다시 만들면 공백·
 * 이스케이프가 달라져 서명이 안 맞는다.
 */
export function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}
