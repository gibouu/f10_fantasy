export type CronSecretGetter = () => string | null | undefined

export function validateCronSecret(
  request: Pick<Request, "headers">,
  getCronSecret?: CronSecretGetter,
): boolean
