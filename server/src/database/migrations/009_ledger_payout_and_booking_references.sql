-- ==============================================================================
-- Migration: 009_ledger_payout_and_booking_references.sql
-- Description: Add payout_id, posting_type, and unique idempotent constraints to ledger_entries
-- Target: PostgreSQL 16 + PostGIS
-- ==============================================================================

-- 1. Add foreign key to provider_payouts on ledger_entries
ALTER TABLE ledger_entries
ADD COLUMN IF NOT EXISTS payout_id UUID REFERENCES provider_payouts(id) ON DELETE RESTRICT;

-- 2. Add posting_type column for granular double-entry leg accounting
ALTER TABLE ledger_entries
ADD COLUMN IF NOT EXISTS posting_type VARCHAR(50);

-- 3. Unique index for payout disbursal ledger entries (idempotent exactly-once posting)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_payout_posting 
ON ledger_entries (payout_id, posting_type) 
WHERE payout_id IS NOT NULL;

-- 4. Unique index for payment transaction ledger legs (platform fee, tech payable)
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_tx_posting 
ON ledger_entries (transaction_id, posting_type) 
WHERE transaction_id IS NOT NULL;
