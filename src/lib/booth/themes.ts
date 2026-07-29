// 부스 테마 분류 — 2층 구조. 순수·LLM 없음.
//
// 왜 필요한가: SIF 부스의 취향 축이 참가자 4분류(국내/해외 × 작가/기업)와 굿즈 개수뿐
// 이라 "굿즈 12종 파는 국내 작가"가 전부 똑같아 보였다. 무엇을 그리는가(주제)가
// 방문객의 취향이 실제로 붙는 축이다.
//
// 2층인 이유: 대분류는 카드·피드에 **하나만** 보여 한눈에 읽히게 하고, 소분류는
// 검색·추천 신호로 잘게 쓴다. 대분류가 전시 전반을 덮어야 축으로 쓸모가 있다.
//
// 분류 근거는 부스 이름 + 작가 소개(links) + 굿즈 품목(enrichment)이다. 셋 다
// 주제를 말해주지 않는 부스가 약 1/3 있는데(소개가 부스코드·날짜뿐인 경우),
// 그런 부스엔 **태그를 붙이지 않는다** — 없는 걸 지어내면 근거 없는 추천이 된다.

export interface ThemeGroup {
  /** 카드·피드에 보이는 한 단어. */
  label: string;
  /** 소분류 라벨 → 매칭 키워드(소문자 부분일치). */
  fine: Record<string, string[]>;
}

export const BOOTH_THEMES = {
  character: {
    label: "캐릭터",
    fine: {
      "오리지널 캐릭터": ["캐릭터", "오리지널", "original", "마스코트", "친구들", "character"],
      귀여움: ["귀여", "몽글", "말랑", "소프트", "cute", "깜찍"],
      이모티콘: ["이모티콘", "emoticon", "카카오"],
    },
  },
  animal: {
    label: "동물",
    fine: {
      고양이: ["고양이", "냥", "cat", "야옹"],
      강아지: ["강아지", "댕", "dog", "멍멍"],
      반려동물: ["반려", "펫", "pet"],
      "야생·상상동물": ["여우", "곰", "토끼", "공룡", "호랑이", "판다", "물고기", "고래", "펭귄"],
    },
  },
  daily: {
    label: "일상·감성",
    fine: {
      "일상 기록": ["일상", "순간", "하루", "소소", "everyday", "daily"],
      "위로·감성": ["위로", "따뜻", "감성", "마음", "다정", "포근", "힐링", "행복"],
      "에세이·글": ["에세이", "문장", "손글씨", "캘리"],
    },
  },
  fantasy: {
    label: "판타지·상상",
    fine: {
      "환상·설화": ["판타지", "마법", "신화", "설화", "요정", "마녀", "환상"],
      "우주·몽환": ["우주", "별", "달", "몽환", "꿈", "dream"],
    },
  },
  nature: {
    label: "자연·풍경",
    fine: {
      "풍경·여행": ["풍경", "여행", "도시", "골목", "건물", "travel"],
      "자연·계절": ["자연", "바다", "하늘", "숲", "꽃", "식물", "계절", "정원", "flower"],
    },
  },
  people: {
    label: "인물·패션",
    fine: {
      인물: ["인물", "초상", "소녀", "소년", "portrait"],
      패션: ["패션", "스타일", "fashion"],
    },
  },
  subculture: {
    label: "만화·서브컬처",
    fine: {
      "만화·툰": ["만화", "웹툰", "인스타툰", "comic", "툰"],
      그림책: ["그림책", "동화", "picture book"],
      "게임·애니": ["게임", "애니", "anime", "game", "팬아트"],
      아트토이: ["아트토이", "피규어", "토이", "figure", "toy", "인형", "블록", "doll"],
    },
  },
  stationery: {
    label: "문구·다꾸",
    fine: {
      "문구·다꾸": ["문구", "다꾸", "떡메", "마스킹", "다이어리", "스티커", "메모지"],
      "리빙·실용": ["리빙", "생활", "인테리어", "패브릭", "핸드메이드", "수공예"],
    },
  },
  craft: {
    label: "전통·공예",
    fine: {
      한국적: ["전통", "한국", "korean", "한복", "민화", "고전"],
      "빈티지·레트로": ["빈티지", "레트로", "vintage", "retro", "복고"],
    },
  },
} as const satisfies Record<string, ThemeGroup>;

export type ThemeKey = keyof typeof BOOTH_THEMES;

export const THEME_KEYS = Object.keys(BOOTH_THEMES) as ThemeKey[];

/** 대분류 키 → 표시 라벨. 모르는 키는 그대로 돌려준다(데이터가 앞서갈 수 있다). */
export function themeLabel(key: string): string {
  return (BOOTH_THEMES as Record<string, ThemeGroup>)[key]?.label ?? key;
}

/** 부스 이름·소개·굿즈에서 페어 일정·부스코드 같은 상투구를 걷어낸다. */
export function stripBoothNoise(text: string): string {
  return String(text)
    .replace(/서일페[^,.|/]*/gi, " ")
    .replace(/SIF\s*V?\.?\s*\d+/gi, " ")
    .replace(/\d{4}[.\-]\d{2}[.\-]\d{2}/g, " ")
    .toLowerCase();
}

export interface ThemeMatch {
  /** 대표 대분류 — 카드에 보이는 것. 근거가 없으면 undefined. */
  primary?: ThemeKey;
  /** 걸린 대분류 전부(대표 포함), 강한 순. */
  groups: ThemeKey[];
  /** 소분류 라벨 — 검색·추천 신호용. */
  fine: string[];
}

/**
 * 이름·소개·굿즈를 합친 텍스트에서 테마를 뽑는다. 아무것도 안 걸리면 빈 결과 —
 * 호출부는 태그를 붙이지 않아야 한다(추측 금지).
 */
export function classifyBoothTheme(text: string): ThemeMatch {
  const hay = stripBoothNoise(text);
  const hits = new Map<ThemeKey, number>();
  const fine: string[] = [];
  for (const key of THEME_KEYS) {
    const group: ThemeGroup = BOOTH_THEMES[key];
    for (const [fineLabel, kws] of Object.entries(group.fine)) {
      if (kws.some((k) => hay.includes(k))) {
        hits.set(key, (hits.get(key) ?? 0) + 1);
        if (!fine.includes(fineLabel)) fine.push(fineLabel);
      }
    }
  }
  if (hits.size === 0) return { groups: [], fine: [] };
  const groups = [...hits.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
  return { primary: groups[0], groups, fine };
}

/**
 * booth.tags에서 대표 테마 대분류를 꺼낸다. tags는 [카테고리 slug, ...테마 대분류]
 * 형태라(seed-sif.ts), 테마 키인 첫 항목이 대표다. 없으면 undefined —
 * 호출부는 칩을 그리지 않아야 한다.
 */
export function primaryThemeFromTags(tags: string[]): ThemeKey | undefined {
  return tags.find((t): t is ThemeKey => t in BOOTH_THEMES);
}
