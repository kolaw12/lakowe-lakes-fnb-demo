# Persistent order storage

The old production configuration copied SQLite into `/tmp/dev.db`. Vercel's temporary filesystem is isolated per instance and can disappear on a cold start. Guest orders, staff transactions, wallet balances and audit records therefore need a shared hosted database.

## Vercel setup

1. Create an empty Turso database (hosted SQLite/libSQL), or use a dedicated existing empty database. Keep production and preview databases separate.
2. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Vercel's project environment variables for the appropriate environment. These are server secrets; do not use a `NEXT_PUBLIC_` prefix.
3. Set the same variables in your shell or ignored `.env.local`, then run `npm run db:migrate:cloud` once before deployment. The script applies the repository's SQLite migrations transactionally, records checksums, and safely skips previously applied migrations. It does not reset or seed orders. It expects an empty database on first use; existing databases imported from a different migration history require a reviewed migration baseline.
4. Deploy this code. Place a test order, open `/staff` in another tab, and verify the transaction and order after refreshing both tabs.

Vercel requests fail if the hosted database settings are absent. They never silently fall back to a temporary seed database. Builds can run without database credentials. A Vercel deployment has not been performed as part of this local change.

## Local development and persistent servers

`DATABASE_URL` remains supported for local SQLite, including production-mode local servers. To initialize a new local database, run `npx prisma migrate deploy`. Existing `prisma/dev.db` records are not modified by this code change. Never point local verification at the live database.

Guest receipts and private handoff codes are also retained in browser storage. All payment flows save through the same provider before navigation; a delayed or empty API snapshot cannot erase a saved receipt. Browser storage is a receipt cache, not the shared staff database. Clearing browser storage removes locally held private handoff codes. Records already lost from an old Vercel instance cannot be reconstructed reliably from cached receipts.

## Verification

Run `npm run build` and `npm run test:persistence`. The persistence test uses a fresh temporary database, separate production server processes and browser tabs. It verifies cloud-adapter transaction compatibility locally, restart persistence, guest and staff synchronization, wallet and room-charge checkout, cached handoff credentials, and failed/empty snapshot behavior. Hosted network connectivity must still be verified after configuring Vercel.
