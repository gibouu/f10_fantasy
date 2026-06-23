import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./user.service.ts", import.meta.url), "utf8")

function changeUsernameSource() {
  const start = source.indexOf("export async function changeUsername")
  assert.notEqual(start, -1)

  const end = source.indexOf("/**\n * Look up a user profile", start)
  assert.notEqual(end, -1)

  return source.slice(start, end)
}

test("changeUsername consumes the one-time username change atomically", () => {
  const changeUsername = changeUsernameSource()

  assert.match(changeUsername, /await db\.\$transaction\(async \(tx\) => \{/)
  assert.match(
    changeUsername,
    /const updated = await tx\.user\.updateMany\(\{\s*where:\s*\{[\s\S]*id:\s*userId[\s\S]*usernameSet:\s*true[\s\S]*usernameChangeUsed:\s*false[\s\S]*\}[\s\S]*data:\s*\{[\s\S]*publicUsername:\s*stored[\s\S]*usernameChangeUsed:\s*true/s,
  )
  assert.match(
    changeUsername,
    /if \(updated\.count !== 1\) \{\s*throw new Error\('You have already used your one-time username change'\)/,
  )
})
