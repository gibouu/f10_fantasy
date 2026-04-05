/**
 * Auth.js v5 catch-all route.
 *
 * Delegates all /api/auth/* traffic to the Auth.js handler exported
 * from the centralised @/auth config module.
 */
import { handlers } from "@/auth"

export const { GET, POST } = handlers
