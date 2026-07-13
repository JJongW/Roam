import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-secondary">
        <Compass className="size-7 text-primary" />
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold">페이지를 찾을 수 없어</h1>
        <p className="text-sm text-muted-foreground">
          주소가 바뀌었거나 삭제됐을 수 있어.
        </p>
      </div>
      <Button asChild>
        <Link href="/">홈으로</Link>
      </Button>
    </div>
  );
}
