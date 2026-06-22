export function jsonRequest(url, body, options = {}) {
  const { headers = {}, method = "POST", ...init } = options

  return new Request(url, {
    ...init,
    method,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

export function rawRequest(url, body, options = {}) {
  const { method = "POST", ...init } = options

  return new Request(url, {
    ...init,
    method,
    body,
  })
}

export function authSession(userId = "user-1") {
  return { user: { id: userId } }
}

export function authedDeps(userId = "user-1") {
  return {
    auth: async () => authSession(userId),
    mobileAuth: async () => null,
  }
}

export function unauthenticatedDeps() {
  return {
    auth: async () => null,
    mobileAuth: async () => null,
  }
}

export async function responseJson(response) {
  return response.json()
}
