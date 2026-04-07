// Server component wrapper — reads env vars and passes availability flags down.
// The actual UI is in SignInClient to keep framer-motion client-only.

import { Suspense } from 'react'
import SignInClient from './SignInClient'

export default function SignInPage() {
  const appleEnabled = Boolean(
    process.env.APPLE_ID && process.env.APPLE_SECRET
  )
  return (
    <Suspense>
      <SignInClient appleEnabled={appleEnabled} />
    </Suspense>
  )
}
