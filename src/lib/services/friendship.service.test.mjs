import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = await readFile(
  new URL("./friendship.service.ts", import.meta.url),
  "utf8",
)

function serviceBlock(startText, endText) {
  const start = source.indexOf(startText)
  const end = source.indexOf(endText, start)

  assert.notEqual(start, -1, `${startText} source block should exist`)
  assert.notEqual(end, -1, `${endText} source block should follow ${startText}`)

  return source.slice(start, end)
}

test("sendFriendRequest verifies the addressee exists before creating a request", () => {
  const sendBlock = serviceBlock(
    "export async function sendFriendRequest",
    "export async function acceptFriendRequest",
  )
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

test("acceptFriendRequest conditionally accepts only pending requests for the addressee", () => {
  const acceptBlock = serviceBlock(
    "export async function acceptFriendRequest",
    "export async function rejectFriendRequest",
  )

  assert.doesNotMatch(acceptBlock, /friendRequest\.update\(/)
  assert.match(
    acceptBlock,
    /db\.friendRequest\.updateMany\(\{\s*where: \{ id: requestId, addresseeId: userId, status: 'PENDING' \},\s*data: \{ status: 'ACCEPTED' \},\s*\}\)/,
  )
  assert.match(
    acceptBlock,
    /if \(updated\.count !== 1\) \{\s*throw new Error\('Friend request is no longer pending'\)\s*\}/,
  )
})

test("rejectFriendRequest conditionally rejects only pending requests for either party", () => {
  const rejectBlock = serviceBlock(
    "export async function rejectFriendRequest",
    "export async function getPendingRequests",
  )

  assert.doesNotMatch(rejectBlock, /friendRequest\.update\(/)
  assert.match(
    rejectBlock,
    /db\.friendRequest\.updateMany\(\{\s*where: \{\s*id: requestId,\s*status: 'PENDING',\s*OR: \[\{ requesterId: userId \}, \{ addresseeId: userId \}\],\s*\},\s*data: \{ status: 'REJECTED' \},\s*\}\)/,
  )
  assert.match(
    rejectBlock,
    /if \(updated\.count !== 1\) \{\s*throw new Error\('Friend request is no longer pending'\)\s*\}/,
  )
})

test("getSentRequests owns pending-sent mapping in the service layer", () => {
  const sentBlock = serviceBlock(
    "export async function getSentRequests",
    "export async function getFriends",
  )

  assert.match(sentBlock, /db\.friendRequest\.findMany\(\{[\s\S]*requesterId: userId[\s\S]*status: 'PENDING'/)
  assert.match(sentBlock, /addressee:\s*\{ select: \{ publicUsername: true, image: true, favoriteTeamSlug: true \} \}/)
  assert.match(sentBlock, /const teamInfo = r\.addressee\.favoriteTeamSlug/)
  assert.match(sentBlock, /teamLogoUrl: teamInfo\?\.logoUrl \?\? null/)
  assert.match(sentBlock, /teamColor: teamInfo\?\.color \?\? null/)
})
