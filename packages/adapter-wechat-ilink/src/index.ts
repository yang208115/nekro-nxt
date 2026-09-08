export * from './config.js'
export * from './inbound.js'
export * from './runtime.js'
export * from './transport.js'
export * from './types.js'

import type { AdapterHostContributionV2 } from '@nekro-nxt/adapter-sdk'
import {
  WECHAT_ILINK_CONNECTION_DEFINITION,
  WechatIlinkConnectionConfigurationSchema,
  WechatIlinkRuntimeConfigSchema,
} from './config.js'
import { WechatIlinkRuntime, type WechatIlinkRuntimeOptions } from './runtime.js'

export const createWechatIlinkHostContribution = (
  options?: Pick<WechatIlinkRuntimeOptions, 'transportFactory' | 'fetch'>,
): AdapterHostContributionV2 => ({
  apiVersion: 2,
  descriptor: WECHAT_ILINK_CONNECTION_DEFINITION.descriptor,
  create: (context, stored) =>
    Promise.resolve(
      new WechatIlinkRuntime({
        context,
        config: WechatIlinkRuntimeConfigSchema.parse({
          ...WechatIlinkConnectionConfigurationSchema.parse(stored.configuration),
          botTokenCredentialRef: stored.credentialRefs['botToken'],
        }),
        ...(options?.transportFactory === undefined ? {} : { transportFactory: options.transportFactory }),
        ...(options?.fetch === undefined ? {} : { fetch: options.fetch }),
      }),
    ),
})
