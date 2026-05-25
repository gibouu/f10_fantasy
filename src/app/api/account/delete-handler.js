export async function deleteAccountForSession(
  req,
  { auth, mobileAuth, deleteUser, logger = console },
) {
  const session = (await auth()) ?? (await mobileAuth(req))
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await deleteUser(session.user.id)
    logger.log(`[account/delete] userId=${session.user.id}`)
    return Response.json({ ok: true })
  } catch (err) {
    logger.error('[account/delete] failed:', err)
    return Response.json({ error: 'Deletion failed' }, { status: 500 })
  }
}
