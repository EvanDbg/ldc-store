-- 添加新的订单状态枚举值
ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'refund_pending';
ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'refund_rejected';

-- 添加退款相关字段到订单表
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refund_reason" text;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refund_requested_at" timestamp with time zone;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "refunded_at" timestamp with time zone;

-- 添加退款状态索引（可选，用于快速查询退款订单）
CREATE INDEX IF NOT EXISTS "orders_refund_status_idx" ON "orders" USING btree ("status") WHERE status IN ('refund_pending', 'refund_rejected', 'refunded');

