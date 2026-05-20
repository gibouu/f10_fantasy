type ProviderEmailClaims = {
  email: string
  email_verified?: boolean | string
}

export function isVerifiedProviderEmail(value: boolean | string | undefined): boolean {
  return value === true || value === "true"
}

export function verifiedProviderEmail(claims: ProviderEmailClaims): string {
  return isVerifiedProviderEmail(claims.email_verified) ? claims.email : ""
}
