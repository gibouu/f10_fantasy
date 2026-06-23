import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./HeroVisualization.tsx", import.meta.url), "utf8")

test("HeroVisualization does not import unused class-name helper", () => {
  assert.doesNotMatch(source, /import \{ cn \} from ['"]@\/lib\/utils['"]/)
})

test("HeroVisualization models a missing completed P10 result as nullable", () => {
  assert.match(
    source,
    /tenthPlace:\s*\{\s*driver:\s*DriverSummary;\s*position:\s*number\s*\}\s*\|\s*null/,
  )
  assert.match(source, /results\?\.tenthPlace\?\.driver/)
})

test("HeroVisualization renders a non-pending placeholder for missing completed results", () => {
  assert.match(source, /const isMissingCompletedResult = isCompleted && !resultDriver/)
  assert.match(source, /pending=\{isPending && !isMissingCompletedResult\}/)
})
