import { countHashtags, isJpeg, validateCarousel, IG_LIMITS } from "./publish";

/**
 * `npm run ig:publish`의 본체. 파일·네트워크·입력은 전부 deps로 받는다 — 기본이
 * **드라이런**이라 "드라이런은 아무 데도 안 올린다"를 테스트로 지키기 위해서다.
 * 실제 연결(Supabase Storage·Graph API·stdin)은 scripts/ig-publish.ts가 넣는다.
 */

export interface CliArgs {
  dir?: string;
  caption?: string;
  locationId?: string;
  slug?: string;
  publish: boolean;
  yes: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { publish: false, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--dir") args.dir = next();
    else if (a === "--caption") args.caption = next();
    else if (a === "--location-id") args.locationId = next();
    else if (a === "--slug") args.slug = next();
    else if (a === "--publish") args.publish = true;
    else if (a === "--yes" || a === "-y") args.yes = true;
  }
  return args;
}

export interface CliDeps {
  /** 폴더 안 파일 이름들. */
  listDir(dir: string): Promise<string[]>;
  readFile(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  /** 공개 URL로 올리고 URL을 돌려준다. 드라이런에선 부르지 않는다. */
  upload(key: string, bytes: Uint8Array): Promise<string>;
  publish(input: { imageUrls: string[]; caption: string; locationId?: string }): Promise<{ mediaId: string; permalink?: string }>;
  /** y/n 확인. --yes면 부르지 않는다. */
  confirm(question: string): Promise<boolean>;
  out(line: string): void;
  today(): string;
}

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/** 저장 경로용 슬러그 — 영문·숫자·하이픈만. 한글 폴더명이면 post로. */
export function toSlug(s: string): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "post";
}

/** 성공하면 0, 멈추면 1(검사 실패·취소). 예외는 호출자가 받는다. */
export async function runPublishCli(argv: string[], deps: CliDeps): Promise<number> {
  const args = parseArgs(argv);
  const { out } = deps;
  if (!args.dir || !args.caption) {
    out("사용법: npm run ig:publish -- --dir <이미지 폴더> --caption <캡션.txt> [--location-id <id>] [--slug <이름>] [--publish] [--yes]");
    return 1;
  }

  // 파일 이름 순서가 곧 장 순서다(01.jpg, 02.jpg …).
  const names = (await deps.listDir(args.dir)).filter((n) => IMAGE_EXT.test(n)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const caption = (await deps.readText(args.caption)).replace(/\s+$/, "");
  const files = await Promise.all(names.map(async (n) => ({ name: n, bytes: await deps.readFile(`${args.dir}/${n}`) })));

  out(`이미지 ${files.length}장`);
  for (const [i, f] of files.entries()) out(`  ${String(i + 1).padStart(2, "0")}  ${f.name}  ${(f.bytes.length / 1024).toFixed(0)}KB${isJpeg(f.bytes) ? "" : "  ← JPEG 아님"}`);
  out(`캡션 ${[...caption].length}/${IG_LIMITS.captionChars}자 · 해시태그 ${countHashtags(caption)}/${IG_LIMITS.hashtags}개`);
  out("---");
  out(caption);
  out("---");

  const errors = validateCarousel({ imageCount: files.length, caption });
  const notJpeg = files.filter((f) => !isJpeg(f.bytes)).map((f) => f.name);
  if (notJpeg.length) {
    // sharp가 의존성에 없어 변환하지 않는다. Figma 내보내기에서 JPG를 고르면 된다.
    errors.push(`JPEG가 아닌 파일: ${notJpeg.join(", ")} — Figma에서 JPG로 내보내 주세요 (Instagram API는 JPEG만 받습니다)`);
  }
  if (errors.length) {
    for (const e of errors) out(`✗ ${e}`);
    return 1;
  }

  if (!args.publish) {
    out("드라이런 — 아무것도 올리지 않았습니다. 게시하려면 --publish를 붙이세요.");
    return 0;
  }
  if (!args.yes && !(await deps.confirm("이대로 인스타에 게시할까요? 게시하면 바로 공개됩니다 (y/N) "))) {
    out("취소했습니다.");
    return 1;
  }

  const prefix = `${deps.today()}-${toSlug(args.slug ?? args.dir.split("/").filter(Boolean).pop() ?? "")}`;
  const imageUrls: string[] = [];
  for (const [i, f] of files.entries()) {
    imageUrls.push(await deps.upload(`${prefix}/${String(i + 1).padStart(2, "0")}.jpg`, f.bytes));
  }
  out(`이미지 업로드 ${imageUrls.length}장 (${prefix}/)`);

  const res = await deps.publish({ imageUrls, caption, locationId: args.locationId });
  out(`게시했습니다: ${res.permalink ?? `media ${res.mediaId}`}`);
  return 0;
}
