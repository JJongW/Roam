"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/common/states";
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
import type { User } from "@/lib/types";

export default function AdminAccountsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  async function load() {
    setLoading(true);
    setError(false);
    try {
      const { users } = await api.get<{ users: User[] }>("/api/admin/users");
      setUsers(users);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(u: User) {
    try {
      await api.del(`/api/admin/users/${u.id}`);
      toast.success("삭제했어요");
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "삭제 실패");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">계정</h1>
        <p className="text-sm text-muted-foreground">{users.length}개 계정</p>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : error ? (
        <ErrorState onRetry={() => void load()} />
      ) : users.length === 0 ? (
        <EmptyState title="계정이 없어요" />
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/accounts/${u.id}`}
                  className="truncate font-bold text-primary hover:underline"
                >
                  {u.nickname}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {u.provider ? `구글 연동` : "닉네임"} ·{" "}
                  {format(new Date(u.createdAt), "yyyy.M.d")} 가입
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="삭제">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>계정 삭제</AlertDialogTitle>
                    <AlertDialogDescription>
                      &apos;{u.nickname}&apos; 계정을 삭제할까요?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => remove(u)}>
                      삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
