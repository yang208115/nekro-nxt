export * from './definition.js'
export * from './runtime.js'
export * from './transport.js'

import type { AdapterHostContributionV2 } from '@nekro-nxt/adapter-sdk'
import {
  ONEBOT_11_CONNECTION_DEFINITION,
  OneBot11ConnectionConfigurationSchema,
  OneBot11RuntimeConfigSchema,
} from './definition.js'
import { OneBot11Runtime, type OneBot11RuntimeOptions } from './runtime.js'

export const createOneBot11HostContribution = (
  transport?: OneBot11RuntimeOptions['transport'],
): AdapterHostContributionV2 => ({
  apiVersion: 2,
  descriptor: ONEBOT_11_CONNECTION_DEFINITION.descriptor,
  create: (context, stored) =>
    Promise.resolve(
      new OneBot11Runtime({
        context,
        config: OneBot11RuntimeConfigSchema.parse({
          ...OneBot11ConnectionConfigurationSchema.parse(stored.configuration),
          ...(stored.credentialRefs['accessToken'] === undefined
            ? {}
            : { accessTokenCredentialRef: stored.credentialRefs['accessToken'] }),
        }),
        ...(transport === undefined ? {} : { transport }),
      }),
    ),
})
