/**
 * 인스타 여러 장(캐러셀) 게시. Instagram API(Instagram 로그인) 콘텐츠 게시 흐름:
 *
 *   1. 장마다 컨테이너 — POST /{ig-user}/media {image_url, is_carousel_item}
 *   2. 캐러셀 컨테이너 — POST /{ig-user}/media {media_type: CAROUSEL, children, caption}
 *   3. status_code가 FINISHED가 될 때까지 GET /{container}?fields=status_code
 *   4. 게시 — POST /{ig-user}/media_publish {creation_id}
 *
 * API는 파일을 직접 받지 않고 **공개 URL의 JPEG**만 받는다(그래서 CLI가 먼저 Supabase
 * Storage 공개 버킷에 올린다). 음악·예약 게시는 API에 없다.
 * https://developers.facebook.com/docs/instagram-platform/content-publishing/
 *
 * env를 직접 읽지 않고 설정을 인자로 받는다 — 토큰 없는 테스트(fetch 목)와
 * Next 밖 CLI(scripts/ig-publish.ts)에서 같이 쓰기 위해서다.
 */

/** 인스타 제한. 캐러셀은 2~10장, 캡션 2,200자, 해시태그 30개. */
export const IG_LIMITS = { minImages: 2, maxImages: 10, captionChars: 2200, hashtags: 30 } as const;

export function countHashtags(caption: string): number {
  return caption.match(/#[^\s#]+/g)?.length ?? 0;
}

/** 게시 전 검사. 문제가 있으면 사람이 읽을 메시지 목록을 돌려준다(없으면 빈 배열). */
export function validateCarousel(input: { imageCount: number; caption: string }): string[] {
  const errors: string[] = [];
  const { imageCount, caption } = input;
  if (imageCount < IG_LIMITS.minImages || imageCount > IG_LIMITS.maxImages) {
    errors.push(`이미지는 ${IG_LIMITS.minImages}~${IG_LIMITS.maxImages}장이어야 합니다 (지금 ${imageCount}장)`);
  }
  // 인스타는 글자 수를 UTF-16 단위가 아니라 문자 단위로 센다 — 이모지 하나는 1자.
  const chars = [...caption].length;
  if (chars > IG_LIMITS.captionChars) {
    errors.push(`캡션이 ${chars}자입니다 (최대 ${IG_LIMITS.captionChars}자)`);
  }
  const tags = countHashtags(caption);
  if (tags > IG_LIMITS.hashtags) {
    errors.push(`해시태그가 ${tags}개입니다 (최대 ${IG_LIMITS.hashtags}개)`);
  }
  return errors;
}

/** 파일 앞부분으로 JPEG인지 본다(확장자는 믿지 않는다). */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export interface PublishConfig {
  token: string;
  igUserId: string;
  /** 비우면 v23.0. */
  version?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** 캐러셀 컨테이너 준비를 기다리는 간격과 상한. */
  pollIntervalMs?: number;
  timeoutMs?: number;
  /** 단계별 진행 로그. 토큰은 절대 넘기지 않는다. */
  log?: (line: string) => void;
}

export interface PublishInput {
  imageUrls: string[];
  caption: string;
  locationId?: string;
}

export interface PublishResult {
  mediaId: string;
  permalink?: string;
}

interface GraphError {
  error?: { message?: string; code?: number };
}

function client(cfg: PublishConfig) {
  const f = cfg.fetch ?? fetch;
  const base = `https://graph.instagram.com/${cfg.version ?? "v23.0"}`;
  async function call(method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
    const res = await f(`${base}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    // graph.ts와 같은 규칙 — 실패 응답이 JSON이 아닐 수 있다.
    const json = (await res.json().catch(() => ({}))) as GraphError & Record<string, unknown>;
    if (!res.ok || json.error) {
      const message = json.error?.message ?? res.statusText;
      throw new Error(`Instagram API ${res.status}: ${message} (code ${json.error?.code ?? "?"})`);
    }
    return json;
  }
  return { call };
}

export interface PrepareResult {
  /** 게시할 수 있는 상태(FINISHED)가 된 캐러셀 컨테이너 ID. */
  creationId: string;
  itemCount: number;
}

/**
 * 게시 직전까지 — 장별 컨테이너와 캐러셀 컨테이너를 만들고 FINISHED까지 기다린다.
 * 여기까지는 인스타에 아무것도 공개되지 않는다(컨테이너는 24시간 뒤 만료). 그래서
 * `--check`가 이것만 불러 토큰·권한·공개 URL·이미지 처리를 실제 API로 확인한다.
 */
export async function prepareCarousel(input: PublishInput, cfg: PublishConfig): Promise<PrepareResult> {
  const errors = validateCarousel({ imageCount: input.imageUrls.length, caption: input.caption });
  if (errors.length) throw new Error(errors.join("\n"));

  const { call } = client(cfg);
  const log = cfg.log ?? (() => {});
  const sleep = cfg.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const interval = cfg.pollIntervalMs ?? 3000;
  const timeout = cfg.timeoutMs ?? 120_000;

  const children: string[] = [];
  for (const [i, url] of input.imageUrls.entries()) {
    const item = await call("POST", `${cfg.igUserId}/media`, { image_url: url, is_carousel_item: true });
    children.push(String(item.id));
    log(`컨테이너 ${i + 1}/${input.imageUrls.length}`);
  }

  const carousel = await call("POST", `${cfg.igUserId}/media`, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption: input.caption,
    ...(input.locationId ? { location_id: input.locationId } : {}),
  });
  const creationId = String(carousel.id);
  log("캐러셀 컨테이너 생성");

  // 이미지 처리는 비동기다. FINISHED 전에 media_publish를 부르면 실패한다.
  for (let waited = 0; ; waited += interval) {
    const s = await call("GET", `${creationId}?fields=status_code`);
    const status = String(s.status_code ?? "");
    if (status === "FINISHED") break;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Error(`캐러셀 컨테이너 상태가 ${status}입니다 — 이미지가 JPEG·공개 URL인지 확인하세요`);
    }
    if (waited >= timeout) throw new Error(`캐러셀 준비가 ${timeout / 1000}초 안에 끝나지 않았습니다 (상태 ${status || "없음"})`);
    await sleep(interval);
  }
  log("캐러셀 준비 완료(FINISHED)");
  return { creationId, itemCount: children.length };
}

/**
 * 캐러셀을 만들고 게시한다. 게시 전에 실패하면 인스타에는 아무것도 올라가지 않는다
 * (컨테이너는 24시간 뒤 만료) — 그래서 중간 실패는 그냥 다시 돌리면 된다.
 */
export async function publishCarousel(input: PublishInput, cfg: PublishConfig): Promise<PublishResult> {
  const { creationId } = await prepareCarousel(input, cfg);
  const { call } = client(cfg);
  const log = cfg.log ?? (() => {});

  const published = await call("POST", `${cfg.igUserId}/media_publish`, { creation_id: creationId });
  const mediaId = String(published.id);
  log("게시 완료");

  // 링크는 덤이다 — 못 가져와도 게시는 이미 끝났다.
  let permalink: string | undefined;
  try {
    const p = await call("GET", `${mediaId}?fields=permalink`);
    permalink = typeof p.permalink === "string" ? p.permalink : undefined;
  } catch {
    permalink = undefined;
  }
  return { mediaId, permalink };
}
