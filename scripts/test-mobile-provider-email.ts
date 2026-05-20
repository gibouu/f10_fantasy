/**
 * Regression test for mobile OAuth email linking.
 *
 *   npx tsx scripts/test-mobile-provider-email.ts
 */
import {
  isVerifiedProviderEmail,
  verifiedProviderEmail,
} from "../src/lib/auth/providerEmail"

const cases: Array<{
  name: string
  email: string
  email_verified?: boolean | string
  expectedVerified: boolean
  expectedEmail: string
}> = [
  {
    name: "boolean false",
    email: "victim@example.com",
    email_verified: false,
    expectedVerified: false,
    expectedEmail: "",
  },
  {
    name: "string false",
    email: "victim@example.com",
    email_verified: "false",
    expectedVerified: false,
    expectedEmail: "",
  },
  {
    name: "missing",
    email: "victim@example.com",
    expectedVerified: false,
    expectedEmail: "",
  },
  {
    name: "boolean true",
    email: "driver@example.com",
    email_verified: true,
    expectedVerified: true,
    expectedEmail: "driver@example.com",
  },
  {
    name: "string true",
    email: "driver@example.com",
    email_verified: "true",
    expectedVerified: true,
    expectedEmail: "driver@example.com",
  },
]

for (const testCase of cases) {
  const verified = isVerifiedProviderEmail(testCase.email_verified)
  if (verified !== testCase.expectedVerified) {
    console.error(
      `${testCase.name}: expected verified=${testCase.expectedVerified}, got ${verified}`,
    )
    process.exit(1)
  }

  const email = verifiedProviderEmail(testCase)
  if (email !== testCase.expectedEmail) {
    console.error(
      `${testCase.name}: expected email=${JSON.stringify(testCase.expectedEmail)}, got ${JSON.stringify(email)}`,
    )
    process.exit(1)
  }
}

console.log("PASS mobile provider email verification")
