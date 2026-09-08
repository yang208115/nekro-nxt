import type {
  WechatIlinkLoginClient,
  WechatIlinkLoginClientFactory,
  WechatIlinkDownloadedMedia,
  WechatIlinkMessage,
  WechatIlinkMessageItem,
  WechatIlinkTransport,
  WechatIlinkTransportConfig,
  WechatIlinkTransportFactory,
  WechatIlinkTransportReceipt,
  WechatIlinkTransportStartInput,
} from './types.js'

interface WechatIlinkSdkClient {
  on(event: 'message', handler: (message: WechatIlinkMessage) => void | Promise<void>): void
  on(event: 'error', handler: (error: unknown) => void): void
  on(event: 'sessionExpired', handler: () => void): void
  start(input: {
    readonly longPollTimeoutMs: number
    readonly signal: AbortSignal
    readonly loadSyncBuf: () => Promise<string | undefined>
    readonly saveSyncBuf: (syncBuf: string) => Promise<void>
  }): Promise<void>
  stop?(): Promise<void> | void
  downloadMedia?(item: WechatIlinkMessageItem): Promise<WechatIlinkDownloadedMedia | null>
  sendText(toUserId: string, text: string, contextToken: string): Promise<unknown>
}

type WechatIlinkSdkModule = {
  readonly WeChatClient: new (config: WechatIlinkTransportConfig) => WechatIlinkSdkClient
}

type WechatIlinkSdkLoginModule = {
  readonly WeChatClient: new () => WechatIlinkLoginClient
}

const isReceipt = (value: unknown): value is WechatIlinkTransportReceipt =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export class WechatIlinkSdkTransport implements WechatIlinkTransport {
  readonly #client: WechatIlinkSdkClient
  #startTask: Promise<void> | undefined

  constructor(client: WechatIlinkSdkClient) {
    this.#client = client
  }

  async start(input: WechatIlinkTransportStartInput): Promise<void> {
    this.#client.on('message', (message) => {
      void Promise.resolve(input.onMessage(message)).catch(input.onError)
    })
    this.#client.on('error', input.onError)
    this.#client.on('sessionExpired', input.onSessionExpired)
    this.#startTask = this.#client
      .start({
        longPollTimeoutMs: input.longPollTimeoutMs,
        signal: input.signal,
        loadSyncBuf: input.loadSyncBuf,
        saveSyncBuf: input.saveSyncBuf,
      })
      .catch((error: unknown) => {
        if (!input.signal.aborted) input.onError(error)
      })
    await Promise.resolve()
  }

  async stop(): Promise<void> {
    await this.#client.stop?.()
    if (this.#startTask) await Promise.allSettled([this.#startTask])
  }

  async downloadMedia(item: WechatIlinkMessageItem, signal: AbortSignal): Promise<WechatIlinkDownloadedMedia | null> {
    if (signal.aborted) throw signal.reason
    const media = await this.#client.downloadMedia?.(item)
    if (signal.aborted) throw signal.reason
    return media ?? null
  }

  async sendText(input: {
    readonly toUserId: string
    readonly text: string
    readonly contextToken: string
    readonly signal: AbortSignal
  }): Promise<WechatIlinkTransportReceipt> {
    if (input.signal.aborted) throw input.signal.reason
    const receipt = await this.#client.sendText(input.toUserId, input.text, input.contextToken)
    if (isReceipt(receipt)) return receipt
    return {}
  }
}

export const createWechatIlinkSdkTransportFactory = (): WechatIlinkTransportFactory => (config) => {
  let transport: WechatIlinkTransport | undefined
  return {
    async start(input) {
      const module = (await import('wechat-ilink-client')) as WechatIlinkSdkModule
      transport = new WechatIlinkSdkTransport(new module.WeChatClient(config))
      await transport.start(input)
    },
    async stop() {
      await transport?.stop()
    },
    async sendText(input) {
      if (!transport) throw new Error('微信 iLink 连接尚未启动。')
      return transport.sendText(input)
    },
    async downloadMedia(item, signal) {
      if (!transport) throw new Error('微信 iLink 连接尚未启动。')
      return (await transport.downloadMedia?.(item, signal)) ?? null
    },
  }
}

export const createWechatIlinkSdkLoginClientFactory = (): WechatIlinkLoginClientFactory => () => ({
  async login(options) {
    const module = (await import('wechat-ilink-client')) as WechatIlinkSdkLoginModule
    const client = new module.WeChatClient()
    return await client.login(options)
  },
})
