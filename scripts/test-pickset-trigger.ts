/**
 * One-shot trigger smoke test. Picks a locked PickSet, attempts to flip its
 * tenthPlaceDriverId inside a transaction, expects the DB to refuse, then
 * rolls back. Should never succeed; if it does, the trigger is missing or
 * broken.
 *
 *   npx tsx scripts/test-pickset-trigger.ts
 */
import { PrismaClient, Prisma } from '@prisma/client'

const directUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!directUrl) {
  console.error('Set DIRECT_URL (or DATABASE_URL).')
  process.exit(1)
}
const db = new PrismaClient({ datasources: { db: { url: directUrl } } })

async function main() {
  const ps = await db.pickSet.findFirst({
    where: { lockedAt: { not: null } },
    select: { id: true, tenthPlaceDriverId: true },
  })
  if (!ps) {
    console.log('No locked PickSet found to test against.')
    return
  }

  console.log(`Testing trigger against pickSetId=${ps.id} (live tenth=${ps.tenthPlaceDriverId})`)

  // Try to mutate driver field inside a transaction — expect failure, then
  // roll back regardless. The transaction wrapper guarantees no state escapes.
  let raised = false
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "PickSet"
        SET "tenthPlaceDriverId" = 'tampered-driver-id'
        WHERE id = ${ps.id}
      `
      // If we got here, the trigger did not fire — force a rollback so we
      // don't leave the row tampered.
      throw new Error('TRIGGER_DID_NOT_FIRE')
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.message.includes('locked')) {
      raised = true
    } else if (err instanceof Error && err.message === 'TRIGGER_DID_NOT_FIRE') {
      console.error(
        '✗ FAIL: trigger did NOT raise — UPDATE on a locked row succeeded. Rolled back.',
      )
      process.exit(2)
    } else if (err instanceof Error && /locked/.test(err.message)) {
      raised = true
    } else {
      console.error('Unexpected error:', err)
      process.exit(3)
    }
  }

  if (raised) {
    console.log('✓ PASS: trigger correctly refused post-lock driver mutation.')
  }

  // Sanity: confirm row is unchanged.
  const after = await db.pickSet.findUnique({
    where: { id: ps.id },
    select: { tenthPlaceDriverId: true },
  })
  if (after?.tenthPlaceDriverId !== ps.tenthPlaceDriverId) {
    console.error('✗ FAIL: row was mutated despite the test wrapper.')
    process.exit(4)
  }
  console.log('✓ Row state unchanged.')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
