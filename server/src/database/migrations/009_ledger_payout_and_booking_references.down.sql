-- ==============================================================================
-- Rollback Migration: 009_ledger_payout_and_booking_references.down.sql
-- Description: Safely revert ledger references and constraints (data-loss guarded)
-- ==============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM ledger_entries WHERE posting_type IS NOT NULL OR payout_id IS NOT NULL) THEN
    RAISE EXCEPTION 'MIGRATION 009 ROLLBACK ABORTED: ledger_entries contains posting_type or payout_id audit references.';
  END IF;
END $$;

DROP INDEX IF EXISTS uq_ledger_tx_posting;
DROP INDEX IF EXISTS uq_ledger_payout_posting;

ALTER TABLE ledger_entries
DROP COLUMN IF EXISTS posting_type,
DROP COLUMN IF EXISTS payout_id;
