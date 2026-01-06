import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { CardStatus } from "@/lib/db";

import { buildAdminCardsHref } from "./cards-url";

export function CardsPagination({
  productId,
  q,
  status,
  orderNo,
  page,
  totalPages,
  pageSize,
}: {
  productId: string;
  q: string;
  status?: CardStatus;
  orderNo: string;
  page: number;
  totalPages: number;
  pageSize: number;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      {page <= 1 ? (
        <Button variant="outline" disabled className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          上一页
        </Button>
      ) : (
        <Button asChild variant="outline" className="gap-2">
          <Link
            href={buildAdminCardsHref({
              productId,
              q: q || undefined,
              status,
              orderNo: orderNo || undefined,
              page: page - 1,
              pageSize,
            })}
          >
            <ArrowLeft className="h-4 w-4" />
            上一页
          </Link>
        </Button>
      )}

      {page >= totalPages ? (
        <Button variant="outline" disabled className="gap-2">
          下一页
          <ArrowRight className="h-4 w-4" />
        </Button>
      ) : (
        <Button asChild variant="outline" className="gap-2">
          <Link
            href={buildAdminCardsHref({
              productId,
              q: q || undefined,
              status,
              orderNo: orderNo || undefined,
              page: page + 1,
              pageSize,
            })}
          >
            下一页
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      )}
    </div>
  );
}

