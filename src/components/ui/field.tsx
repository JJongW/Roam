"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

type FieldContextValue = {
  /** 라벨이 가리키는 입력 요소의 id */
  id: string;
  /** 지금 **실제로 그려진** 설명·오류 문단의 id (없으면 undefined) */
  describedBy?: string;
  invalid: boolean;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

type FieldControlProps = {
  id?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  "aria-describedby"?: string;
};

/**
 * 입력 컴포넌트가 자기를 감싼 Field의 id·aria를 **자동으로** 물려받게 한다.
 *
 * 호출부마다 `id`·`htmlFor`·`aria-describedby`를 짝 맞춰 적는 구조는 새 화면이
 * 생길 때마다 같은 실수가 난다(지금 코드에도 라벨 없는 입력과, aria-invalid만
 * 켜고 스타일이 없는 입력이 섞여 있다). 그래서 Field 안에 있다는 사실만으로
 * 연결되게 한다 — Field 밖에서는 아무것도 하지 않는다.
 *
 * `id`만은 Field가 쥔다 — 호출부가 입력에 다른 id를 달면 라벨의 htmlFor와 어긋나
 * 라벨을 눌러도 입력이 안 잡힌다. 특정 id가 필요하면 Field에 넘긴다(라벨과 함께 움직인다).
 * aria-invalid는 호출부가 이기고, aria-describedby는 합친다(둘 다 읽혀야 한다).
 */
export function useFieldProps<T extends FieldControlProps>(props: T): T {
  const field = React.useContext(FieldContext);
  if (!field) return props;
  const describedBy = [field.describedBy, props["aria-describedby"]]
    .filter(Boolean)
    .join(" ");
  return {
    ...props,
    id: field.id,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
    "aria-describedby": describedBy || undefined,
  };
}

export interface FieldProps {
  /** 입력에 특정 id가 필요할 때(외부에서 focus 등). 라벨도 같이 따라간다. */
  id?: string;
  label?: React.ReactNode;
  /** 라벨 오른쪽 작은 표식(예: 관리 콘솔의 "비어있음" 뱃지). */
  badge?: React.ReactNode;
  /** 입력 전에 알려줄 것(형식·예시). 오류가 생기면 자리를 오류에 내준다. */
  description?: React.ReactNode;
  /**
   * 오류 메시지. 값이 있으면 입력 테두리가 destructive로 바뀌고 메시지가 설명을
   * 대체한다. 메시지 없이 테두리만 바꾸려면 `true`.
   */
  error?: React.ReactNode;
  /** 라벨 옆 필수 표시. 입력의 required 속성은 호출부가 따로 넘긴다. */
  required?: boolean;
  className?: string;
  labelClassName?: string;
  children: React.ReactNode;
}

/**
 * 라벨 + 입력 + 설명/오류 한 묶음.
 *
 * 설명과 오류는 **같은 자리를 나눠 쓴다**. 둘을 쌓으면 오류가 났을 때 상자가
 * 한 줄 더 밀리고, 사용자는 "형식은 이렇다"와 "틀렸다"를 같이 읽어야 한다.
 * 지금 당장 고쳐야 할 말 하나만 남긴다.
 */
export function Field({
  id: idProp,
  label,
  badge,
  description,
  error,
  required,
  className,
  labelClassName,
  children,
}: FieldProps) {
  const uid = React.useId();
  const id = idProp ?? `${uid}c`;
  const messageId = `${uid}m`;
  const invalid = Boolean(error);
  // error={true}는 "테두리만" — 그릴 메시지가 없다.
  const message = invalid && error !== true ? error : description;
  const showing = invalid && error !== true ? "error" : description ? "hint" : null;

  const ctx = React.useMemo<FieldContextValue>(
    // 안 그려진 문단을 가리키면 스크린리더가 빈 설명을 읽는다 — 그려질 때만 넘긴다.
    () => ({ id, describedBy: showing ? messageId : undefined, invalid }),
    [id, messageId, invalid, showing],
  );

  return (
    <div className={cn("space-y-1.5", className)}>
      {label !== undefined && (
        <div className="flex items-center gap-1.5">
          <Label htmlFor={id} className={cn("text-sm", labelClassName)}>
            {label}
            {required && (
              <span aria-hidden className="ml-0.5 text-destructive">
                *
              </span>
            )}
          </Label>
          {badge}
        </div>
      )}
      <FieldContext.Provider value={ctx}>{children}</FieldContext.Provider>
      {showing && (
        <p
          id={messageId}
          // 오류는 떠오르는 즉시 읽혀야 한다(설명은 입력 전에 이미 읽었다).
          role={showing === "error" ? "alert" : undefined}
          className={cn(
            "text-sm",
            showing === "error"
              ? "font-medium text-destructive"
              : "text-muted-foreground",
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/**
 * 오류 상태의 입력 테두리. `aria-invalid`가 켜지면 보이게 — 그 속성을 켜고도
 * 화면에 아무 변화가 없던(login-form) 문제를 구조로 막는다.
 * 두 변형이 겹친 선택자라 평상시 focus-visible 규칙보다 특이도가 높아, 클래스
 * 순서와 무관하게 포커스 중에도 빨간 테두리가 유지된다.
 */
export const fieldInvalidClass =
  "aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30";
