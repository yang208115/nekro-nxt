import { createOneBot11HostContribution } from '@nekro-nxt/adapter-onebot-11'
import { createQQOpenClawHostContribution } from '@nekro-nxt/adapter-qq-openclaw'
import type { AdapterHostContributionV2 } from '@nekro-nxt/adapter-sdk'
import { WEB_HOST_CONTRIBUTION } from '@nekro-nxt/adapter-web'
import { createWeComAiBotHostContribution } from '@nekro-nxt/adapter-wecom-ai-bot'

/** The only static composition point for first-party Adapter packages. */
export const BUILTIN_ADAPTER_CONTRIBUTIONS: readonly AdapterHostContributionV2[] = Object.freeze([
  WEB_HOST_CONTRIBUTION,
  createQQOpenClawHostContribution(),
  createOneBot11HostContribution(),
  createWeComAiBotHostContribution(),
])
