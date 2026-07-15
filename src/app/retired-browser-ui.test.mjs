import test from "node:test"
import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"

const retiredEntries = [
  new URL("./(main)", import.meta.url),
  new URL("./(auth)", import.meta.url),
  new URL("../components", import.meta.url),
  new URL("./error.tsx", import.meta.url),
  new URL("../lib/observability/report-client-error.ts", import.meta.url),
  new URL("../lib/utils.ts", import.meta.url),
  new URL("../../components.json", import.meta.url),
]

const browserOnlyDependencies = [
  "@radix-ui/react-dialog",
  "@radix-ui/react-scroll-area",
  "@radix-ui/react-select",
  "@radix-ui/react-slot",
  "@radix-ui/react-tabs",
  "class-variance-authority",
  "clsx",
  "framer-motion",
  "lucide-react",
  "swr",
  "tailwind-merge",
  "tailwindcss-animate",
]

test("retired browser UI stays removed", async () => {
  for (const entry of retiredEntries) {
    await assert.rejects(access(entry), { code: "ENOENT" })
  }
})

test("browser-only dependencies stay removed", async () => {
  const pkg = JSON.parse(
    await readFile(new URL("../../package.json", import.meta.url), "utf8"),
  )
  for (const dependency of browserOnlyDependencies) {
    assert.equal(pkg.dependencies?.[dependency], undefined)
    assert.equal(pkg.devDependencies?.[dependency], undefined)
  }
  const tailwind = await readFile(
    new URL("../../tailwind.config.ts", import.meta.url),
    "utf8",
  )
  assert.doesNotMatch(tailwind, /tailwindcss-animate/)
})

test("client-error intake API remains available", async () => {
  await assert.doesNotReject(
    access(new URL("./api/client-errors/route.ts", import.meta.url)),
  )
})
