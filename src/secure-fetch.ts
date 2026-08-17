/** Build a no-redirect fetch implementation pinned to one API origin. */
export function createSecureFetch(origin: string, implementation: typeof fetch = fetch): typeof fetch {
  const allowed = new URL(origin).origin
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const requested = input instanceof Request ? new URL(input.url) : new URL(input.toString(), allowed)
    if (requested.origin !== allowed) throw new Error('refusing cross-origin Photon request')
    const response = await implementation(input, { ...init, redirect: 'error' })
    if (new URL(response.url || requested.href).origin !== allowed) {
      throw new Error('refusing cross-origin Photon response')
    }
    return response
  }
}
