import Link from "next/link";

import { Button } from "@/components/ui/button";

import type { CardStatus } from "@/lib/db";

import type { AdminCardListItem } from "./cards-table";
import { CardsFilters } from "./cards-filters";
import { CardsPagination } from "./cards-pagination";
import { CardsTable } from "./cards-table";
import { buildAdminCardsHref } from "./cards-url";

export function CardsClient({
  productId,
  items,
  total,
  page,
  pageSize,
  totalPages,
  q,
  status,
  orderNo,
}: {
  productId: string;
  items: AdminCardListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  q: string;
  status?: CardStatus;
  orderNo: string;
}) {
  const hasActiveFilters = Boolean(q || status || orderNo);

  return (
    <div className="space-y-4">
      <CardsFilters
        productId={productId}
        q={q}
        status={status}
        orderNo={orderNo}
        pageSize={pageSize}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          共 {total} 条 · 第 {page}/{totalPages} 页
        </span>
        {hasActiveFilters ? <span className="text-xs">已启用筛选条件</span> : null}
      </div>

      {items.length > 0 ? (
        <CardsTable
          // 为什么这样做：分页/筛选切换后应清空“上一页的选中状态”，避免误操作到不在当前视图的数据。
          key={`${productId}:${page}:${pageSize}:${q}:${status ?? ""}:${orderNo}`}
          items={items}
        />
      ) : (
        <div className="rounded-lg border py-12 text-center text-sm text-muted-foreground">
          <p>{hasActiveFilters ? "没有匹配的卡密" : "该商品暂无卡密"}</p>
          {hasActiveFilters ? (
            <div className="mt-3">
              <Button asChild variant="outline">
                <Link href={buildAdminCardsHref({ productId })}>清除筛选</Link>
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <CardsPagination
        productId={productId}
        q={q}
        status={status}
        orderNo={orderNo}
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
      />
    </div>
  );
}

