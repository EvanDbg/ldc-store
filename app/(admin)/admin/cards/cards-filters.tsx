"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type { CardStatus } from "@/lib/db";

import { buildAdminCardsHref } from "./cards-url";

function Select({
  name,
  defaultValue,
  children,
  className,
  ariaLabel,
}: {
  name: string;
  defaultValue?: string;
  children: ReactNode;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      className={
        className ??
        "h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
      }
    >
      {children}
    </select>
  );
}

const cardStatusLabel: Record<CardStatus, string> = {
  available: "可用",
  locked: "锁定",
  sold: "已售",
};

export function CardsFilters({
  productId,
  q,
  status,
  orderNo,
  pageSize,
}: {
  productId: string;
  q: string;
  status?: CardStatus;
  orderNo: string;
  pageSize: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const hasActiveFilters = Boolean(q || status || orderNo);

  const submit = (form: HTMLFormElement) => {
    const formData = new FormData(form);
    const nextQ = String(formData.get("q") || "").trim();
    const nextStatus = String(formData.get("status") || "").trim();
    const nextOrderNo = String(formData.get("orderNo") || "").trim();
    const nextPageSize = Number.parseInt(String(formData.get("pageSize") || ""), 10);

    const normalizedStatus =
      nextStatus && (nextStatus as CardStatus) in cardStatusLabel
        ? (nextStatus as CardStatus)
        : undefined;

    const nextHref = buildAdminCardsHref({
      productId,
      q: nextQ || undefined,
      status: normalizedStatus,
      orderNo: nextOrderNo || undefined,
      pageSize: Number.isFinite(nextPageSize) ? nextPageSize : pageSize,
    });

    startTransition(() => {
      router.push(nextHref);
    });
  };

  const resetHref = buildAdminCardsHref({ productId, pageSize });

  return (
    <Card>
      <CardContent className="pt-6">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget);
          }}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q}
                placeholder="搜索卡密内容…"
                className="pl-9 pr-9"
                aria-label="搜索卡密"
              />
              {q ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                  onClick={() =>
                    router.push(
                      buildAdminCardsHref({
                        productId,
                        status,
                        orderNo: orderNo || undefined,
                        pageSize,
                      })
                    )
                  }
                  aria-label="清空搜索"
                >
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>

            <Input
              name="orderNo"
              defaultValue={orderNo}
              placeholder="订单号（支持部分匹配）"
              aria-label="按订单号查卡密"
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Select
              name="status"
              defaultValue={status ?? ""}
              ariaLabel="按状态筛选"
            >
              <option value="">全部状态</option>
              {(Object.keys(cardStatusLabel) as CardStatus[]).map((value) => (
                <option key={value} value={value}>
                  {cardStatusLabel[value]}
                </option>
              ))}
            </Select>

            <Select
              name="pageSize"
              defaultValue={String(pageSize)}
              ariaLabel="每页条数"
            >
              {[20, 50, 100, 200].map((size) => (
                <option key={size} value={String(size)}>
                  {size}/页
                </option>
              ))}
            </Select>

            <Button type="submit" disabled={isPending}>
              应用筛选
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(resetHref)}
              disabled={isPending || !hasActiveFilters}
            >
              重置
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
