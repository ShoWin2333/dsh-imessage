import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// These type-only imports merge the settings slot and generated Remote faces.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { TYPERT_REMOTE } from 'dsh-photon-imessage/remote'
import { ImessageSettingsController } from './controller.js'
import {
  ImessageSettingsSection,
  type ImessageSettingsInjected,
} from './ImessageSettingsSection.js'
import { installStyles } from './styles.js'

export type {
  ImessageClientSnapshot,
} from './controller.js'
export type {
  ImessageSettingsInjected,
  ImessageSettingsSectionProps,
} from './ImessageSettingsSection.js'

/** The parent only needs the mount service; the nested face is created by apply(). */
export const inject = ['remote']

/** Services consumed after the generated Remote contribution has mounted. */
export const settingsInject = ['slots', 'remote.dshPhotonImessage']

/** Mount the generated RPC contribution and register Settings > iMessage. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const unmountRemote = await ctx.remote.$mount(TYPERT_REMOTE)
  const settingsFiber = ctx.inject(settingsInject, (readyCtx) => {
    const controller = new ImessageSettingsController(readyCtx.remote.dshPhotonImessage)
    const removeStyles = installStyles()
    const injected = (): ImessageSettingsInjected => ({ controller })

    readyCtx.slots.inject('settings.section', () => readyCtx.slots.register({
      name: 'settings.section',
      id: 'imessage',
      order: 40,
      label: () => 'iMessage',
      inject: injected,
    }, ImessageSettingsSection))

    return () => {
      controller.dispose()
      removeStyles()
    }
  })

  try {
    await settingsFiber
  } catch (error) {
    await unmountRemote()
    throw error
  }

  return async () => {
    await settingsFiber.dispose()
    await unmountRemote()
  }
}

export default { inject, apply }
