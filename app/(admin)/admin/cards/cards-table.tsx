"use client";

import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LocalTime } from "@/components/time/local-time";

import type { CardStatus } from "@/lib/db";
import { deleteCards, resetLockedCards } from "@/lib/actions/cards";

import { EditCardDialog } from "./edit-card-dialog";

export interface AdminCardListItem {
  id: string;
  content: string;
  contentMasked: boolean;
  status: CardStatus;
  createdAt: Date;
  orderId: string | null;
  order?: { id: string; orderNo: string } | null;
}

const statusConfig: Record<CardStatus, { label: string; className: string }> = {
  available: {
    label: "可用",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
  },
  locked: {
    label: "锁定",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
  },
  sold: {
    label: "已售",
    className: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  },
};

function Checkbox({
  checked,
  onChange,
  inputRef,
  ariaLabel,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={ariaLabel}
      disabled={disabled}
      className="h-4 w-4 rounded border-input bg-background accent-primary disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

function useCardsSelection(items: AdminCardListItem[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const selectableIds = useMemo(
    () => items.filter((i) => i.status !== "sold").map((i) => i.id),
    [items]
  );

  const selection = useMemo(() => {
    const selectedOnPage = selectableIds.filter((id) => selectedIds.has(id));
    return {
      selectedCount: selectedIds.size,
      selectedOnPageCount: selectedOnPage.length,
      allOnPageSelected:
        selectableIds.length > 0 && selectedOnPage.length === selectableIds.length,
      someOnPageSelected:
        selectedOnPage.length > 0 && selectedOnPage.length < selectableIds.length,
      hasSelectableOnPage: selectableIds.length > 0,
    };
  }, [selectableIds, selectedIds]);

  const selectAllRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = selection.someOnPageSelected;
  }, [selection.someOnPageSelected]);

  const toggleAllOnPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of selectableIds) next.add(id);
      } else {
        for (const id of selectableIds) next.delete(id);
      }
      return next;
    });
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  return {
    selectedIds,
    selection,
    selectAllRef,
    toggleAllOnPage,
    toggleOne,
    clearSelection,
  };
}

function CardsBulkActionBar({
  selectedCount,
  availableSelectedCount,
  lockedSelectedCount,
  isPending,
  onDeleteSelected,
  onResetSelected,
  onClearSelection,
}: {
  selectedCount: number;
  availableSelectedCount: number;
  lockedSelectedCount: number;
  isPending: boolean;
  onDeleteSelected: () => void;
  onResetSelected: () => void;
  onClearSelection: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        {selectedCount > 0 ? (
          <span>
            已选择 <span className="font-medium text-foreground">{selectedCount}</span>{" "}
            项（可用 {availableSelectedCount} · 锁定 {lockedSelectedCount}）
          </span>
        ) : (
          <span>可勾选“可用/锁定”卡密进行批量操作</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || lockedSelectedCount === 0}
          onClick={onResetSelected}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          重置锁定
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={isPending || availableSelectedCount === 0}
          onClick={onDeleteSelected}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          删除选中
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || selectedCount === 0}
          onClick={onClearSelection}
        >
          清除选择
        </Button>
      </div>
    </div>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText,
  confirmVariant,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText: string;
  confirmVariant: "destructive" | "default";
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CardsTable({ items }: { items: AdminCardListItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteIds, setDeleteIds] = useState<string[] | null>(null);
  const [resetIds, setResetIds] = useState<string[] | null>(null);

  const {
    selectedIds,
    selection,
    selectAllRef,
    toggleAllOnPage,
    toggleOne,
    clearSelection,
  } = useCardsSelection(items);

  const selectedOnPage = useMemo(
    () => items.filter((card) => selectedIds.has(card.id)),
    [items, selectedIds]
  );
  const availableSelectedIds = useMemo(
    () =>
      selectedOnPage
        .filter((c) => c.status === "available" && !c.orderId)
        .map((c) => c.id),
    [selectedOnPage]
  );
  const lockedSelectedIds = useMemo(
    () => selectedOnPage.filter((c) => c.status === "locked").map((c) => c.id),
    [selectedOnPage]
  );

  const openDelete = (ids: string[]) => {
    if (ids.length === 0) return;
    setDeleteIds(ids);
  };

  const openReset = (ids: string[]) => {
    if (ids.length === 0) return;
    setResetIds(ids);
  };

  const confirmDelete = () => {
    if (!deleteIds || deleteIds.length === 0) {
      setDeleteIds(null);
      return;
    }

    startTransition(async () => {
      const result = await deleteCards(deleteIds);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setDeleteIds(null);
      // 为什么这样做：删除会影响服务端列表/库存统计，refresh 触发重新拉取，避免“页面显示与数据库不一致”。
      clearSelection();
      router.refresh();
    });
  };

  const confirmReset = () => {
    if (!resetIds || resetIds.length === 0) {
      setResetIds(null);
      return;
    }

    startTransition(async () => {
      const result = await resetLockedCards(resetIds);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      setResetIds(null);
      // 为什么这样做：重置锁定会解除订单绑定，需要刷新以同步“订单号/状态/库存”展示。
      clearSelection();
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <ConfirmDialog
        open={Boolean(deleteIds)}
        onOpenChange={(open) => setDeleteIds(open ? deleteIds : null)}
        title="确认删除卡密"
        description={`将删除 ${deleteIds?.length ?? 0} 个可用卡密。该操作不可恢复，请确认后继续。`}
        confirmText="确认删除"
        confirmVariant="destructive"
        pending={isPending}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={Boolean(resetIds)}
        onOpenChange={(open) => setResetIds(open ? resetIds : null)}
        title="确认重置锁定"
        description={`将重置 ${resetIds?.length ?? 0} 个锁定卡密为可用，并清空关联订单。`}
        confirmText="确认重置"
        confirmVariant="default"
        pending={isPending}
        onConfirm={confirmReset}
      />

      <CardsBulkActionBar
        selectedCount={selection.selectedOnPageCount}
        availableSelectedCount={availableSelectedIds.length}
        lockedSelectedCount={lockedSelectedIds.length}
        isPending={isPending}
        onDeleteSelected={() => openDelete(availableSelectedIds)}
        onResetSelected={() => openReset(lockedSelectedIds)}
        onClearSelection={clearSelection}
      />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selection.allOnPageSelected}
                  onChange={toggleAllOnPage}
                  inputRef={selectAllRef}
                  ariaLabel="全选当前页卡密"
                  disabled={!selection.hasSelectableOnPage}
                />
              </TableHead>
              <TableHead>卡密内容</TableHead>
              <TableHead className="text-center">状态</TableHead>
              <TableHead>订单</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-center w-28">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((card) => {
              const status = statusConfig[card.status];
              const selectable = card.status !== "sold";
              const isSelected = selectedIds.has(card.id);
              return (
                <TableRow key={card.id}>
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onChange={(checked) => toggleOne(card.id, checked)}
                      ariaLabel="选择卡密"
                      disabled={!selectable}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm max-w-[360px] truncate">
                    {card.contentMasked ? (
                      <span className="text-zinc-400">{card.content}</span>
                    ) : (
                      <span title={card.content}>{card.content}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={status.className}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {card.order ? (
                      <Link
                        href={`/admin/orders/${card.order.id}`}
                        className="underline underline-offset-4"
                      >
                        {card.order.orderNo}
                      </Link>
                    ) : card.orderId ? (
                      <Link
                        href={`/admin/orders/${card.orderId}`}
                        className="underline underline-offset-4"
                      >
                        {card.orderId.slice(0, 8)}…
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-zinc-500">
                    <LocalTime value={card.createdAt} mode="short" />
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {card.status === "available" && !card.orderId && !card.contentMasked ? (
                        <EditCardDialog
                          cardId={card.id}
                          currentContent={card.content}
                        />
                      ) : null}
                      {card.status === "locked" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title="重置锁定"
                          onClick={() => openReset([card.id])}
                          disabled={isPending}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {card.status === "available" && !card.orderId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-rose-600 hover:text-rose-600"
                          title="删除卡密"
                          onClick={() => openDelete([card.id])}
                          disabled={isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
