import { z } from 'zod'

const PhotonIdentitySchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  name: z.string().min(1).optional(),
})

const PhotonProjectCredentialSchema = z.object({
  id: z.string().min(1),
  name: z.literal('dsh'),
  secret: z.string().min(1),
})

/** Atomic host-only Photon credential payload. */
export const PhotonCredentialSchema = z.object({
  version: z.literal(1),
  apiOrigin: z.string().url(),
  accessToken: z.string().min(1),
  accessTokenExpiresAt: z.number().int().positive(),
  account: PhotonIdentitySchema,
  project: PhotonProjectCredentialSchema,
})

/** Atomic host-only Photon credential payload type. */
export type PhotonCredential = z.infer<typeof PhotonCredentialSchema>

/** Parse and validate a stored opaque credential. */
export function parsePhotonCredential(value: string): PhotonCredential {
  return PhotonCredentialSchema.parse(JSON.parse(value))
}

/** Serialize one opaque credential without intermediate logging. */
export function serializePhotonCredential(value: PhotonCredential): string {
  return JSON.stringify(PhotonCredentialSchema.parse(value))
}
