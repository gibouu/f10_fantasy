export const USERNAME_FORMAT_DOMAIN_ERRORS = [
  { pattern: /^Username must /, status: 400 },
  { pattern: /^Only letters and numbers allowed\.$/, status: 400 },
  { pattern: /^Invalid username format$/, status: 400 },
]

export const USERNAME_SET_DOMAIN_ERRORS = [
  { pattern: /^Username is already set$/, status: 400 },
  { pattern: /already taken/, status: 409 },
  ...USERNAME_FORMAT_DOMAIN_ERRORS,
]

export const USERNAME_CHANGE_DOMAIN_ERRORS = [
  { pattern: /already taken/, status: 409 },
  { pattern: /^You must set a username before changing it$/, status: 400 },
  { pattern: /^You have already used your one-time username change$/, status: 400 },
  { pattern: /^That is already your username$/, status: 400 },
  ...USERNAME_FORMAT_DOMAIN_ERRORS,
]

export function uniqueUsernameConflictRule(isUniqueConstraintError) {
  return {
    when: isUniqueConstraintError,
    message: "Username is already taken",
    status: 409,
  }
}
