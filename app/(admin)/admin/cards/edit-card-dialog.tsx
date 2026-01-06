"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { updateCard } from "@/lib/actions/cards";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";

interface EditCardDialogProps {
  cardId: string;
  currentContent: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function EditCardDialog({
  cardId,
  currentContent,
  disabled = false,
  children,
}: EditCardDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(currentContent);
  const [isPending, startTransition] = useTransition();

  const handleUpdate = () => {
    if (!content.trim()) {
      toast.error("卡密内容不能为空");
      return;
    }

    if (content === currentContent) {
      toast.info("内容未修改");
      setOpen(false);
      return;
    }

    startTransition(async () => {
      const result = await updateCard({
        cardId,
        content: content.trim(),
      });

      if (result.success) {
        toast.success(result.message);
        setOpen(false);
        // 为什么这样做：卡密内容变更需要刷新服务端列表数据，避免表格仍显示旧值。
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  };

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen) {
      // 重置为当前内容
      setContent(currentContent);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {children || (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={disabled}
            title={disabled ? "已售出的卡密不能编辑" : "编辑卡密"}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5" />
            编辑卡密
          </DialogTitle>
          <DialogDescription>
            修改卡密内容，已售出的卡密不可编辑
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>卡密内容</Label>
            <Textarea
              placeholder="输入卡密内容"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            onClick={handleUpdate}
            disabled={isPending || !content.trim()}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                保存中...
              </>
            ) : (
              "保存"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
