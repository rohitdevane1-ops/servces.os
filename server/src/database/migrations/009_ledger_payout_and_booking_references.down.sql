-- ==============================================================================
-- Rollback Migration: 009_ledger_payout_and_booking_references.down.sql
-- Description: Safely revert ledger references and constraints
-- ==============================================================================

DROP INDEX IF EXISTS uq_ledger_tx_posting;
DROP INDEX IF EXISTS uq_ledger_payout_posting;

ALTER TABLE ledger_entries
DROP COLUMN IF EXISTS posting_type,
DROP COLUMN IF EXISTS payout_id;
