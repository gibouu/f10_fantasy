import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./friendship.service.ts", import.meta.url),
  "utf8",
)

test("sendFriendRequest verifies the addressee exists before creating a request", () => {
  const sendBlock = source.match(
    /export async function sendFriendRequest[\s\S]*?\/\*\*\n \* Accept a friend request/,
  )?.[0]

  assert.ok(sendBlock, "sendFriendRequest source block should exist")
  const existenceCheckIndex = sendBlock.indexOf("tx.user.findUnique")
  const createIndex = sendBlock.indexOf("tx.friendRequest.create")

  assert.ok(
    existenceCheckIndex !== -1,
    "sendFriendRequest should query for the addressee before insert",
  )
  assert.ok(
    existenceCheckIndex < createIndex,
    "addressee existence should be checked before friendRequest.create",
  )
  assert.match(sendBlock, /throw new Error\('Friend request recipient not found'\)/)
})
