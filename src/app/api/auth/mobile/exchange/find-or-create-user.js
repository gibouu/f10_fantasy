function isUniqueConstraintError(err, Prisma) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
}

export async function findOrCreateMobileUser({
  provider,
  claims,
  db,
  Prisma,
  userSelect,
  verifiedProviderEmail,
}) {
  const providerAccountId = claims.sub
  const email = verifiedProviderEmail(claims)

  const existingAccount = await db.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    include: {
      user: {
        select: userSelect,
      },
    },
  })

  if (existingAccount) {
    return existingAccount.user
  }

  const existingUser = email
    ? await db.user.findUnique({
        where: { email },
        select: userSelect,
      })
    : null

  if (existingUser) {
    const linkedAccount = await db.account.upsert({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      update: {},
      create: {
        userId: existingUser.id,
        type: "oauth",
        provider,
        providerAccountId,
      },
      include: {
        user: {
          select: userSelect,
        },
      },
    })
    return linkedAccount.user
  }

  try {
    return await db.user.create({
      data: {
        email: email || `${provider}.${providerAccountId}@placeholder.fxracing`,
        name: claims.name ?? null,
        image: claims.picture ?? null,
        emailVerified: email ? new Date() : null,
        accounts: {
          create: {
            type: "oauth",
            provider,
            providerAccountId,
          },
        },
      },
      select: userSelect,
    })
  } catch (err) {
    if (!isUniqueConstraintError(err, Prisma)) {
      throw err
    }

    const racedAccount = await db.account.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: {
        user: {
          select: userSelect,
        },
      },
    })
    if (racedAccount) {
      return racedAccount.user
    }

    const racedUser = email
      ? await db.user.findUnique({
          where: { email },
          select: userSelect,
        })
      : null
    if (racedUser) {
      const linkedAccount = await db.account.upsert({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        update: {},
        create: {
          userId: racedUser.id,
          type: "oauth",
          provider,
          providerAccountId,
        },
        include: {
          user: {
            select: userSelect,
          },
        },
      })
      return linkedAccount.user
    }

    throw err
  }
}
