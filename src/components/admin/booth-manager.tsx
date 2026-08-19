"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import NextImage from "next/image";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ImagePlus,
  X,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import {
  boothInputSchema,
  boothEnrichmentAuthorInputSchema,
} from "@/lib/schemas";
import {
  uploadBoothImage,
  BOOTH_IMAGE_MAX_COUNT,
  BOOTH_IMAGE_MAX_MB,
} from "@/lib/admin/upload-booth-image";
import { cn } from "@/lib/utils";
import {
  compareBoothsByCode,
  matchesBoothQuery,
  splitLines,
} from "@/lib/admin/booth-filter";
import { findBoothEnrichmentGaps } from "@/lib/admin/data-issues";
import { VALUE_TAGS } from "@/lib/values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryChip } from "@/components/booth/category-chip";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/common/icon";
import { EmptyState } from "@/components/common/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Booth, Category, Hall } from "@/lib/types";

interface Props {
  exhibitionId: string;
  booths: Booth[];
  categories: Category[];
  halls: Hall[];
}

type Draft = Partial<Booth>;

export function BoothManager({
  exhibitionId,
  booths,
  categories,
  halls,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Booth | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  // 태그는 서버엔 배열이지만 편집은 쉼표 구분 텍스트가 더 빠르다 — 저장 시점에만 분해.
  const [tagsText, setTagsText] = useState("");
  const [enrichmentDraft, setEnrichmentDraft] = useState({
    summary: "",
    valueTags: [] as string[], // 체크된 slug만
    reasons: {} as Record<string, string>,
    thingsToDoText: "",
    timingText: "",
    memoryHooksText: "",
  });
  const [busy, setBusy] = useState(false);
  const catById = new Map(categories.map((c) => [c.id, c]));

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [onlyGaps, setOnlyGaps] = useState(false);
  // 지도 배치(좌표·인기도)는 콘텐츠 수정보다 훨씬 드물게 건드린다 — 수정 시엔
  // 접어서 시작해 카피만 고치러 온 사람이 안 보고 지나가게 하고, 생성 시엔
  // 배치가 필수라 펼쳐서 시작한다.
  const [showPlacement, setShowPlacement] = useState(false);

  const gaps = useMemo(() => findBoothEnrichmentGaps(booths), [booths]);
  const gapByBoothId = useMemo(
    () => new Map(gaps.map((g) => [g.boothId, g])),
    [gaps],
  );

  const filtered = useMemo(() => {
    return booths
      .filter((b) => matchesBoothQuery(b, query))
      .filter(
        (b) => categoryFilter === "all" || b.categoryId === categoryFilter,
      )
      .filter((b) => !onlyGaps || gapByBoothId.has(b.id))
      .sort(compareBoothsByCode);
  }, [booths, query, categoryFilter, onlyGaps, gapByBoothId]);

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const enrichmentSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    const booth = booths.find((b) => b.id === editId);
    if (!booth) return; // 다른 전시로 필터된 상태 등 — 조용히 무시
    startEdit(booth);
    router.replace(pathname, { scroll: false });
    const t = setTimeout(() => {
      enrichmentSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 350); // Sheet 오픈 애니메이션이 끝난 뒤 스크롤
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function startCreate() {
    setEditing(null);
    setDraft({
      hallId: halls[0]?.id,
      categoryId: categories[0]?.id,
      x: 500,
      y: 350,
      popularity: 50,
      images: [],
    });
    setTagsText("");
    setEnrichmentDraft({
      summary: "",
      valueTags: [],
      reasons: {},
      thingsToDoText: "",
      timingText: "",
      memoryHooksText: "",
    });
    setShowPlacement(true);
    setOpen(true);
  }
  function startEdit(b: Booth) {
    setEditing(b);
    setDraft({ ...b });
    setTagsText((b.tags ?? []).join(", "));
    const e = b.enrichment;
    const valueTags = (e?.valueTags ?? []).map((v) => v.slug);
    setEnrichmentDraft({
      summary: e?.summary ?? "",
      valueTags,
      reasons: e?.recommendationReasons ?? {},
      thingsToDoText: (e?.thingsToDo ?? []).join("\n"),
      timingText: (e?.timing ?? []).join("\n"),
      memoryHooksText: (e?.memoryHooks ?? []).join("\n"),
    });
    setShowPlacement(false);
    setOpen(true);
  }

  async function submit() {
    const category = categories.find((c) => c.id === draft.categoryId);
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const payload = {
      exhibitionId,
      hallId: draft.hallId ?? halls[0]?.id ?? "",
      categoryId: draft.categoryId ?? categories[0]?.id ?? "",
      code: draft.code || undefined,
      name: draft.name ?? "",
      company: draft.company ?? "",
      description: draft.description ?? "",
      longDescription: draft.longDescription || draft.description || "",
      // 저장할 때마다 무조건 빈 배열을 보내던 버그가 있었다 — 수정할 때마다 이미지가
      // 조용히 사라졌다. 지금 draft에 든 값을 그대로 보낸다.
      images: draft.images ?? [],
      logoUrl: draft.logoUrl || undefined,
      instagramUrl: draft.instagramUrl || undefined,
      websiteUrl: draft.websiteUrl || undefined,
      // 태그를 직접 안 건드렸으면(빈 입력) 카테고리 slug로 시드 — 완전히 빈 부스를
      // 만들지 않기 위한 기본값이지, 직접 입력한 태그를 덮어쓰지 않는다.
      tags: tags.length > 0 ? tags : category ? [category.slug] : [],
      x: Number(draft.x ?? 500),
      y: Number(draft.y ?? 350),
      popularity: Number(draft.popularity ?? 50),
    };
    const parsed = boothInputSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요");
      return;
    }
    const enrichmentPayload = {
      summary: enrichmentDraft.summary,
      valueTags: enrichmentDraft.valueTags.map((slug) => ({
        slug,
        strength: 0.8,
      })),
      recommendationReasons: Object.fromEntries(
        enrichmentDraft.valueTags
          .map((slug) => [slug, enrichmentDraft.reasons[slug]?.trim() ?? ""])
          .filter(([, v]) => v),
      ),
      thingsToDo: splitLines(enrichmentDraft.thingsToDoText),
      timing: splitLines(enrichmentDraft.timingText),
      memoryHooks: splitLines(enrichmentDraft.memoryHooksText),
    };
    const enrichmentParsed =
      boothEnrichmentAuthorInputSchema.safeParse(enrichmentPayload);
    if (!enrichmentParsed.success) {
      toast.error(
        enrichmentParsed.error.issues[0]?.message ??
          "저작 정보를 확인해 주세요",
      );
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await api.patch(`/api/booths/${editing.id}`, {
          ...parsed.data,
          enrichment: enrichmentParsed.data,
        });
      } else {
        await api.post("/api/booths", parsed.data);
      }
      toast.success(editing ? "부스를 수정했어요" : "부스를 추가했어요");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: Booth) {
    try {
      await api.del(`/api/booths/${b.id}`);
      toast.success("삭제했어요");
      router.refresh();
    } catch {
      toast.error("삭제 실패");
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length === booths.length
            ? `${booths.length}개 부스`
            : `${filtered.length} / ${booths.length}개 부스`}
        </p>
        <Button size="sm" onClick={startCreate}>
          <Plus className="size-4" /> 새 부스
        </Button>
      </div>

      {booths.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="이름·회사·코드 검색"
            aria-label="부스 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56"
          />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 카테고리</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch
              checked={onlyGaps}
              onCheckedChange={setOnlyGaps}
              aria-label="미비만 보기"
            />
            미비만 보기
          </label>
        </div>
      )}

      {booths.length === 0 ? (
        <EmptyState
          title="부스가 없어요"
          description="첫 부스를 추가해 보세요."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="조건에 맞는 부스가 없어요"
          description="검색어나 필터를 조정해 보세요."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-14 p-2" aria-hidden />
                <th className="p-2 font-semibold">이름 / 회사</th>
                <th className="p-2 font-semibold">카테고리</th>
                <th className="p-2 font-semibold">코드</th>
                <th className="p-2 font-semibold">완성도</th>
                <th className="w-20 p-2" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const gap = gapByBoothId.get(b.id);
                return (
                  <tr key={b.id} className="border-t border-border">
                    <td className="p-2">
                      {b.images?.[0] ? (
                        <div className="relative size-9 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
                          <NextImage
                            src={b.images[0]}
                            alt=""
                            fill
                            sizes="36px"
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="size-9 shrink-0 rounded-md border border-dashed border-border" />
                      )}
                    </td>
                    <td className="min-w-0 p-2">
                      <p className="truncate font-bold">{b.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.company}
                      </p>
                    </td>
                    <td className="p-2">
                      {catById.get(b.categoryId) && (
                        <CategoryChip category={catById.get(b.categoryId)!} />
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {b.code ?? "—"}
                    </td>
                    <td className="p-2">
                      {gap ? (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                          미비 {gap.missingFields.length}
                        </span>
                      ) : (
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                          완료
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`${b.name} 수정`}
                          onClick={() => startEdit(b)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`${b.name} 삭제`}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>부스 삭제</AlertDialogTitle>
                              <AlertDialogDescription>
                                {`'${b.name}' 부스를 삭제할까요?`}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>취소</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => remove(b)}
                              >
                                삭제
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "부스 수정" : "새 부스"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-5 py-3">
            <p className="text-xs font-bold text-muted-foreground">기본 정보</p>
            <Field label="이미지">
              <BoothImageGallery
                images={draft.images ?? []}
                onChange={(images) => setDraft({ ...draft, images })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="부스명">
                <Input
                  value={draft.name ?? ""}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="부스 코드">
                <Input
                  placeholder="예: A06"
                  value={draft.code ?? ""}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                />
              </Field>
            </div>
            <Field label="회사">
              <Input
                value={draft.company ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, company: e.target.value })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="카테고리">
                <Select
                  value={draft.categoryId}
                  onValueChange={(v) => setDraft({ ...draft, categoryId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="홀">
                <Select
                  value={draft.hallId}
                  onValueChange={(v) => setDraft({ ...draft, hallId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {halls.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <p className="pt-2 text-xs font-bold text-muted-foreground">
              콘텐츠
            </p>
            <Field label="설명">
              <Textarea
                value={draft.description ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </Field>
            <Field label="상세 설명">
              <Textarea
                placeholder="비워두면 위 설명을 그대로 써요"
                rows={4}
                value={draft.longDescription ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, longDescription: e.target.value })
                }
              />
            </Field>
            <Field label="태그 (쉼표로 구분)">
              <Input
                placeholder="예: goods, discovery"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-3">
              <Field label="로고 URL">
                <Input
                  placeholder="https://…"
                  value={draft.logoUrl ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, logoUrl: e.target.value })
                  }
                />
              </Field>
              <Field label="인스타그램 URL">
                <Input
                  placeholder="https://instagram.com/…"
                  value={draft.instagramUrl ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, instagramUrl: e.target.value })
                  }
                />
              </Field>
              <Field label="웹사이트 URL">
                <Input
                  placeholder="https://…"
                  value={draft.websiteUrl ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, websiteUrl: e.target.value })
                  }
                />
              </Field>
            </div>
            {editing && (
              <div
                className="border-t border-border pt-3"
                ref={enrichmentSectionRef}
              >
                <p className="text-xs font-bold text-muted-foreground">
                  근거 카드 저작
                </p>
                <div className="mt-3 space-y-3">
                  <Field
                    label="요약"
                    badge={
                      editing &&
                      gapByBoothId
                        .get(editing.id)
                        ?.missingFields.includes("summary") && (
                        <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                          비어있음
                        </span>
                      )
                    }
                  >
                    <Textarea
                      value={enrichmentDraft.summary}
                      onChange={(e) =>
                        setEnrichmentDraft({
                          ...enrichmentDraft,
                          summary: e.target.value,
                        })
                      }
                    />
                  </Field>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">가치 태그</Label>
                      {editing &&
                        gapByBoothId
                          .get(editing.id)
                          ?.missingFields.includes("valueTags") && (
                          <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                            비어있음
                          </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {VALUE_TAGS.map((v) => {
                        const selected = enrichmentDraft.valueTags.includes(
                          v.slug,
                        );
                        const toggle = () =>
                          setEnrichmentDraft({
                            ...enrichmentDraft,
                            valueTags: selected
                              ? enrichmentDraft.valueTags.filter(
                                  (s) => s !== v.slug,
                                )
                              : [...enrichmentDraft.valueTags, v.slug],
                          });
                        return (
                          <Chip
                            key={v.slug}
                            variant={selected ? "tint" : "outline"}
                            color={v.color}
                            icon={<Icon name={v.icon} className="size-3.5" />}
                            onClick={toggle}
                            role="button"
                            tabIndex={0}
                            aria-pressed={selected}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggle();
                              }
                            }}
                            className="cursor-pointer"
                          >
                            {v.label}
                          </Chip>
                        );
                      })}
                    </div>
                    {enrichmentDraft.valueTags.map((slug) => {
                      const def = VALUE_TAGS.find((v) => v.slug === slug);
                      return (
                        <Field key={slug} label={`${def?.label ?? slug} 근거`}>
                          <Input
                            placeholder="예: 몰랐던 브랜드를 발견하기 좋아"
                            value={enrichmentDraft.reasons[slug] ?? ""}
                            onChange={(e) =>
                              setEnrichmentDraft({
                                ...enrichmentDraft,
                                reasons: {
                                  ...enrichmentDraft.reasons,
                                  [slug]: e.target.value,
                                },
                              })
                            }
                          />
                        </Field>
                      );
                    })}
                  </div>

                  <Field
                    label="뭘 하면 좋은지 (줄마다 하나)"
                    badge={
                      editing &&
                      gapByBoothId
                        .get(editing.id)
                        ?.missingFields.includes("thingsToDo") && (
                        <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                          비어있음
                        </span>
                      )
                    }
                  >
                    <Textarea
                      placeholder={"신간 훑기\n제작 과정 물어보기"}
                      rows={3}
                      value={enrichmentDraft.thingsToDoText}
                      onChange={(e) =>
                        setEnrichmentDraft({
                          ...enrichmentDraft,
                          thingsToDoText: e.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field
                    label="타이밍 (줄마다 하나)"
                    badge={
                      editing &&
                      gapByBoothId
                        .get(editing.id)
                        ?.missingFields.includes("timing") && (
                        <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                          비어있음
                        </span>
                      )
                    }
                  >
                    <Textarea
                      placeholder={"오후 2시 사인회\n한정 굿즈 오전 소진"}
                      rows={3}
                      value={enrichmentDraft.timingText}
                      onChange={(e) =>
                        setEnrichmentDraft({
                          ...enrichmentDraft,
                          timingText: e.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field
                    label="기억 단서 (줄마다 하나)"
                    badge={
                      editing &&
                      gapByBoothId
                        .get(editing.id)
                        ?.missingFields.includes("memoryHooks") && (
                        <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                          비어있음
                        </span>
                      )
                    }
                  >
                    <Textarea
                      placeholder={"파란 부스\n입구 바로 왼쪽"}
                      rows={3}
                      value={enrichmentDraft.memoryHooksText}
                      onChange={(e) =>
                        setEnrichmentDraft({
                          ...enrichmentDraft,
                          memoryHooksText: e.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
              </div>
            )}
            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowPlacement((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-bold text-muted-foreground"
              >
                지도 배치
                <span className="text-muted-foreground">
                  {showPlacement ? "접기" : "펼치기"}
                </span>
              </button>
              {showPlacement && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Field label="X 좌표">
                    <Input
                      type="number"
                      value={draft.x ?? 0}
                      onChange={(e) =>
                        setDraft({ ...draft, x: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Y 좌표">
                    <Input
                      type="number"
                      value={draft.y ?? 0}
                      onChange={(e) =>
                        setDraft({ ...draft, y: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="인기도">
                    <Input
                      type="number"
                      value={draft.popularity ?? 50}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          popularity: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
          </div>
          <SheetFooter>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} 저장
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Field({
  label,
  badge,
  children,
}: {
  label: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-xs">
          {label}
        </Label>
        {badge}
      </div>
      {isValidElement(children)
        ? cloneElement(children as React.ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}

/**
 * 부스 이미지 갤러리 — 업로드/삭제/대표 지정. images[0]이 곧 프로필 이미지라는 게
 * 암묵 규칙이라(Booth 타입엔 별도 필드가 없다), 첫 장에 뱃지를 달고 "대표로" 버튼으로
 * 순서를 바꿔 명시적으로 보여준다. note-photos.tsx와 같은 업로드 패턴, 폴더만 다르다.
 */
function BoothImageGallery({
  images,
  onChange,
}: {
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = images.length >= BOOTH_IMAGE_MAX_COUNT;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const room = BOOTH_IMAGE_MAX_COUNT - images.length;
    if (room <= 0) {
      toast.error(`이미지는 최대 ${BOOTH_IMAGE_MAX_COUNT}장까지예요`);
      return;
    }
    const picked = files.slice(0, room);
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const file of picked) {
        if (file.size > BOOTH_IMAGE_MAX_MB * 1024 * 1024) {
          toast.error(`${BOOTH_IMAGE_MAX_MB}MB보다 작은 이미지로 올려주세요`);
          continue;
        }
        urls.push(await uploadBoothImage(file));
      }
      if (urls.length === 0) return;
      onChange([...images, ...urls].slice(0, BOOTH_IMAGE_MAX_COUNT));
    } catch {
      toast.error("이미지 업로드에 실패했어요");
    } finally {
      setBusy(false);
    }
  }

  function remove(url: string) {
    onChange(images.filter((u) => u !== url));
  }

  function makePrimary(url: string) {
    onChange([url, ...images.filter((u) => u !== url)]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((url, i) => (
        <div
          key={url}
          className="group relative size-20 overflow-hidden rounded-lg border border-border bg-secondary"
        >
          <NextImage
            src={url}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
            unoptimized
          />
          {i === 0 && (
            <span className="absolute left-0.5 top-0.5 flex items-center gap-0.5 rounded-full bg-primary/90 px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
              <Star className="size-2.5 fill-current" /> 대표
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 px-1 py-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            {i !== 0 && (
              <button
                type="button"
                onClick={() => makePrimary(url)}
                aria-label="대표 이미지로 지정"
                className="text-[10px] font-semibold text-white"
              >
                대표로
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(url)}
              aria-label="이미지 삭제"
              className={cn(
                "flex size-4 items-center justify-center rounded-full bg-white/20 text-white",
                i === 0 && "ml-auto",
              )}
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      ))}

      {!full && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label="이미지 추가"
          className="flex size-20 flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border bg-card text-muted-foreground transition-colors active:bg-accent/40 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <>
              <ImagePlus className="size-5" />
              <span className="text-[11px]">추가</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
