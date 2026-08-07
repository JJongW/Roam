"use client";

import { Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";

export function MenuDemo() {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="outline" size="sm">
          메뉴 열기
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={<Pencil className="size-4" />}>수정</MenuItem>
        <MenuItem icon={<Copy className="size-4" />}>복제</MenuItem>
        <MenuSeparator />
        <MenuItem variant="destructive" icon={<Trash2 className="size-4" />}>
          삭제
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
