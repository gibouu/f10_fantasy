import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(new URL("./FriendSearch.tsx", import.meta.url), "utf8")

test("FriendSearch types pending sent request presentation fields", () => {
  assert.match(source, /type PendingSentRequestData = FriendRequestData & \{[\s\S]*teamLogoUrl: string \| null[\s\S]*teamColor: string \| null[\s\S]*\}/)
  assert.match(source, /pendingSent: PendingSentRequestData\[\]/)
})

test("FriendSearch renders pending sent avatars without any casts", () => {
  assert.doesNotMatch(source, /as any/)
  assert.match(source, /teamLogoUrl=\{req\.teamLogoUrl\}/)
  assert.match(source, /teamColor=\{req\.teamColor\}/)
})
