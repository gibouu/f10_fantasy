import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./HeroVisualization.tsx", import.meta.url), "utf8")

test("HeroVisualization does not import unused class-name helper", () => {
  assert.doesNotMatch(source, /import \{ cn \} from ['"]@\/lib\/utils['"]/)
})
