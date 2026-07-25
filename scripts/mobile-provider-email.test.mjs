import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import ts from "typescript"

async function loadProviderEmailModule() {
  const source = await readFile(
    new URL("../src/lib/auth/providerEmail.ts", import.meta.url),
    "utf8",
  )
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const encoded = Buffer.from(outputText).toString("base64")
  return import(`data:text/javascript;base64,${encoded}`)
}

const { isVerifiedProviderEmail, verifiedProviderEmail } = await loadProviderEmailModule()

test("mobile provider email linking requires explicit provider verification", () => {
  const cases = [
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
    assert.equal(
      isVerifiedProviderEmail(testCase.email_verified),
      testCase.expectedVerified,
      `${testCase.name} verification state`,
    )
    assert.equal(
      verifiedProviderEmail(testCase),
      testCase.expectedEmail,
      `${testCase.name} linked email`,
    )
  }
})
