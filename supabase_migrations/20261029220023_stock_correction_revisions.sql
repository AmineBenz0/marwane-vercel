-- Allocation-only corrections must advance the parent transaction revision.
-- Existing revision triggers automatically capture this explicit stock marker.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS stock_revision bigint NOT NULL DEFAULT 0
    CONSTRAINT check_stock_revision_nonnegative CHECK (stock_revision >= 0);
