import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

/** Durable local state for active-session selection and inbound deduplication. */
export const pluginDomainSpec = defineDomain({
  name: 'dsh_imessage',
  version: 1,
  global: {
    schema: z.object({ activeSessionId: z.string().min(1).optional() }),
    initial: {} as { activeSessionId?: string },
  },
  tables: {
    inbound: domainTable<string, { receivedAt: number }>(z.object({
      receivedAt: z.number().int().nonnegative(),
    })),
  },
})
