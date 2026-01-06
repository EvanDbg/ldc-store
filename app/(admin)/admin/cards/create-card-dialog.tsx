"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { createCard } from "@/lib/actions/cards";

export function CreateCardDialog({
  productId,
  children,
}: {
  productId: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleCreate = () => {
    const trimmed = content.trim();
    if (!trimmed) {
      toast.error("卡密内容不能为空");
      return;
    }

    if (/\r?\n/.test(trimmed)) {
      toast.error("新增仅支持单条卡密，请使用「导入卡密」批量导入");
      return;
    }

    startTransition(async () => {
      const result = await createCard({
        productId,
        content: trimmed,
      });

      if (result.success) {
        toast.success(result.message);
        setContent("");
        setOpen(false);
        // 为什么这样做：新增会影响服务端列表与库存统计，refresh 确保页面立即同步。
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            新增卡密
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            新增卡密
          </DialogTitle>
          <DialogDescription>单条新增；多条请使用「导入卡密」。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>卡密内容</Label>
            <Textarea
              placeholder="输入卡密内容（单行）"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={isPending || !content.trim()}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                新增中...
              </>
            ) : (
              "新增"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

