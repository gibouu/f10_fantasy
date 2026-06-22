import test from "node:test"
import assert from "node:assert/strict"
import { readFile, readdir } from "node:fs/promises"

const tsconfig = JSON.parse(
  await readFile(new URL("../tsconfig.json", import.meta.url), "utf8"),
)

test("tsconfig includes executable Prisma TypeScript maintenance scripts", async () => {
  const prismaFiles = await readdir(new URL("../prisma", import.meta.url))
  const prismaTypeScriptFiles = prismaFiles.filter((file) => file.endsWith(".ts"))

  assert.ok(
    prismaTypeScriptFiles.length > 0,
    "expected at least one Prisma TypeScript maintenance script",
  )
  assert.ok(
    tsconfig.include?.some((pattern) => pattern === "**/*.ts"),
    "the project include pattern should cover TypeScript files",
  )
  assert.doesNotMatch(
    JSON.stringify(tsconfig.exclude ?? []),
    /"prisma"/,
    "the whole prisma directory must not be excluded from typecheck",
  )
})
