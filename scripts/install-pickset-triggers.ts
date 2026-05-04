/**
 * Install (or re-install) the Postgres triggers that protect PickSet from
 * post-lock tampering. Idempotent — safe to re-run.
 *
 * Run after `npm run db:push` and any time the trigger SQL is changed.
 *
 *   npx tsx scripts/install-pickset-triggers.ts
 *
 * Reads DATABASE_URL from .env / .env.local. Triggers live OUTSIDE the Prisma
 * schema and are not managed by `db:push`, so they must be installed via this
 * script after every fresh DB or schema reset.
 *
 * Authoritative source for the trigger body lives at
 * `prisma/triggers/pickset_post_lock_guard.sql` for human review; this script
 * inlines the same SQL because Prisma's `$executeRawUnsafe` can only run one
 * statement per call.
 */
import { PrismaClient } from '@prisma/client'

// Triggers and functions are DDL — Supabase's pooled connection user does
// not have CREATE FUNCTION privilege on schema public. Use DIRECT_URL (the
// same URL Prisma uses for `db push`) so we connect with the owner role.
const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!directUrl) {
  console.error('Set DIRECT_URL (or DATABASE_URL) before running this script.')
  process.exit(1)
}

const db = new PrismaClient({
  datasources: { db: { url: directUrl } },
})

async function main() {
  console.log('Installing prevent_post_lock_pickset_edit() function ...')
  await db.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION prevent_post_lock_pickset_edit()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD."lockedAt" IS NOT NULL AND (
           NEW."tenthPlaceDriverId" IS DISTINCT FROM OLD."tenthPlaceDriverId" OR
           NEW."winnerDriverId"     IS DISTINCT FROM OLD."winnerDriverId"     OR
           NEW."dnfDriverId"        IS DISTINCT FROM OLD."dnfDriverId"        OR
           NEW."tenthPlaceSeatKey"  IS DISTINCT FROM OLD."tenthPlaceSeatKey"  OR
           NEW."winnerSeatKey"      IS DISTINCT FROM OLD."winnerSeatKey"      OR
           NEW."dnfSeatKey"         IS DISTINCT FROM OLD."dnfSeatKey"
         ) THEN
        RAISE EXCEPTION
          'PickSet % is locked (lockedAt=%); driver/seat fields cannot be modified',
          OLD.id, OLD."lockedAt"
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `)
  console.log('  OK')

  console.log('Dropping existing trigger (if any) ...')
  await db.$executeRawUnsafe(`DROP TRIGGER IF EXISTS pickset_post_lock_guard ON "PickSet"`)
  console.log('  OK')

  console.log('Creating trigger pickset_post_lock_guard ...')
  await db.$executeRawUnsafe(`
    CREATE TRIGGER pickset_post_lock_guard
      BEFORE UPDATE ON "PickSet"
      FOR EACH ROW
      EXECUTE FUNCTION prevent_post_lock_pickset_edit()
  `)
  console.log('  OK')

  // Sanity check: the trigger should be visible in pg_trigger.
  const installed = await db.$queryRaw<Array<{ tgname: string; tgrelid: string }>>`
    SELECT tgname, tgrelid::regclass::text AS tgrelid
    FROM pg_trigger
    WHERE tgname = 'pickset_post_lock_guard'
  `
  if (installed.length === 0) {
    throw new Error('Trigger pickset_post_lock_guard was not installed.')
  }
  console.log(
    `Verified: ${installed.length} trigger(s) installed: ${installed
      .map((t) => `${t.tgname} on ${t.tgrelid}`)
      .join(', ')}`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
