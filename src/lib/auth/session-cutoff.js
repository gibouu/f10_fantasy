export function nextSessionRevocationCutoff(now = new Date()) {
  return new Date((Math.floor(now.getTime() / 1000) + 1) * 1000)
}
