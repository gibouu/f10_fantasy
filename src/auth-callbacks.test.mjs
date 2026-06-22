import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const fullAuthSource = await readFile(new URL("./auth.ts", import.meta.url), "utf8")
const edgeAuthConfigSource = await readFile(
  new URL("./auth.config.ts", import.meta.url),
  "utf8",
)

function requireMatch(source, pattern, label) {
  const match = source.match(pattern)
  assert.ok(match, `Missing ${label}`)
  return match
}

test("Auth.js session updates refresh username claims from the database", () => {
  assert.match(fullAuthSource, /async jwt\(\{ token, user, trigger \}\)/)
  assert.match(
    fullAuthSource,
    /if \(trigger === "update" && typeof token\.id === "string"\) \{/,
  )
  assert.match(
    fullAuthSource,
    /await db\.user\.findUnique\(\{\s*where: \{ id: token\.id \},\s*select: \{ publicUsername: true, usernameSet: true \},\s*\}\)/s,
  )
  assert.match(
    fullAuthSource,
    /token\.publicUsername = currentUser\?\.publicUsername \?\? null/,
  )
  assert.match(
    fullAuthSource,
    /token\.usernameSet = currentUser\?\.usernameSet \?\? false/,
  )
  assert.doesNotMatch(fullAuthSource, /session\.publicUsername/)
  assert.doesNotMatch(fullAuthSource, /session\.usernameSet/)
})

test("edge auth config JWT callback only copies username claims from trusted user", () => {
  const [, jwtBody] = requireMatch(
    edgeAuthConfigSource,
    /jwt\(\{ token, user \}\) \{([\s\S]*?)\n    \},\n\n    session/,
    "edge JWT callback",
  )

  assert.match(jwtBody, /if \(user\) \{/)
  assert.match(jwtBody, /token\.publicUsername = \(user as/)
  assert.match(jwtBody, /token\.usernameSet = \(user as/)
  assert.doesNotMatch(jwtBody, /trigger/)
  assert.doesNotMatch(jwtBody, /session/)
})
