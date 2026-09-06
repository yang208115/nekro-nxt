import { ArrowRight, Cable, Check, Circle, Plus, Radio, Send } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import type { AdapterConnectionDescriptor } from '@nekro-nxt/adapter-sdk'
import type { HostApiResponse } from '@nekro-nxt/contracts'
import { notify } from '../components/notifications.js'
import { EmptyState, InlineFeedback, PageHeader } from '../components/product-feedback.js'
import { connectionDisplayName, useProductStore, type ConnectionState } from '../product-store.js'
import { createQrCodeSvgDataUrl } from '../qr-code.js'
import { BindingTaskDialog } from './binding-task.js'
import { useNxtNavigate } from '../shell/nxt-link.js'
import { useUnsavedDraft } from '../unsaved-drafts.js'
import {
  Button,
  ConfirmDialog,
  Disclosure,
  Field,
  Input,
  SecretInput,
  SelectField,
  StageCrossfade,
  StatusBadge,
  SwitchField,
  type StatusTone,
} from '../ui-kit/index.js'
import styles from './product-pages.module.css'

const connectionTone = (state: ConnectionState): StatusTone => {
  if (state === '已连接') return 'success'
  if (state === '正在连接') return 'info'
  if (state === '认证过期') return 'warning'
  if (state === '异常') return 'error'
  return 'neutral'
}

const testResultLabel = (value: string): string => {
  if (value === '通过') return '通过'
  if (value === '未测试') return '未测试'
  return '未通过'
}

const maskedAccount = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return '未提供'
  return trimmed.length <= 4 ? '已提供' : `尾号 ${trimmed.slice(-4)}`
}

export const friendlyKnownChannelLabel = (channel: { readonly name: string; readonly kind: string }): string => {
  if (!/^(?:group|guild|private|c2c):/u.test(channel.name)) return channel.name
  const suffix = channel.name.match(/([\p{L}\p{N}]{4})$/u)?.[1]
  if (channel.kind === 'group') return suffix ? `群聊（尾号 ${suffix}）` : '群聊'
  return suffix ? `私聊（尾号 ${suffix}）` : '私聊'
}

export const connectionCreateAction = ({
  selectedAdapterKey,
  creatablePlatforms,
}: {
  readonly selectedAdapterKey: string | undefined
  readonly creatablePlatforms: readonly { readonly key: string }[]
}): { readonly label: '再添加一个账号' | '添加平台连接'; readonly adapterKey?: string } | null => {
  if (creatablePlatforms.length === 0) return null
  if (selectedAdapterKey && creatablePlatforms.some((item) => item.key === selectedAdapterKey)) {
    return { label: '再添加一个账号', adapterKey: selectedAdapterKey }
  }
  return { label: '添加平台连接' }
}

type WechatIlinkLoginView = HostApiResponse<'startWechatIlinkLogin'> | HostApiResponse<'getWechatIlinkLogin'>

const isWechatIlinkLoginActive = (login: WechatIlinkLoginView | null): login is WechatIlinkLoginView =>
  login?.status === 'pending' || login?.status === 'scanned'

const isWechatIlinkLoginRestartable = (login: WechatIlinkLoginView | null): boolean =>
  login === null || login.status === 'failed' || login.status === 'expired' || login.status === 'cancelled'

const collectConnectionDefaults = (
  platform: AdapterConnectionDescriptor | undefined,
): Record<string, string | number | boolean> => {
  const defaults: Record<string, string | number | boolean> = {}
  for (const [key, property] of Object.entries(platform?.configSchema.properties ?? {})) {
    if (property === undefined) continue
    if (property.type !== 'credential-reference' && property.default !== undefined) {
      defaults[key] = property.default
    }
  }
  return defaults
}

export function ConnectionsPage() {
  const { connectionId = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const host = useProductStore((state) => state.host)
  const connections = useProductStore((state) => state.connections)
  const descriptors = useProductStore((state) => state.connectionAdapters)
  const agents = useProductStore((state) => state.agents)
  const channels = useProductStore((state) => state.channels)
  const navigate = useNxtNavigate()
  const creatablePlatforms = useMemo(() => descriptors.filter((descriptor) => descriptor.userCreatable), [descriptors])
  const selectedId = connectionId || connections[0]?.id || ''
  const requestedCreateParam = searchParams.get('create') ?? ''
  const requestedAdapterKey = searchParams.get('adapter') ?? ''
  const initializedCreateSearchKeyRef = useRef('')
  const [createOpen, setCreateOpen] = useState(requestedCreateParam === '1')
  const [createStage, setCreateStage] = useState<'platform' | 'configuration'>(
    requestedCreateParam === '1' && requestedAdapterKey ? 'configuration' : 'platform',
  )
  const [selectedPlatformKey, setSelectedPlatformKey] = useState(requestedAdapterKey)
  const [configuration, setConfiguration] = useState<Record<string, string | number | boolean>>({})
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [createAlias, setCreateAlias] = useState('')
  const [createError, setCreateError] = useState('')
  const [createPlatform, setCreatePlatform] = useState<AdapterConnectionDescriptor | null>(null)
  const [wechatLogin, setWechatLogin] = useState<WechatIlinkLoginView | null>(null)
  const [testPending, setTestPending] = useState<'receive' | 'send' | null>(null)
  const [testChannelByConnection, setTestChannelByConnection] = useState<Record<string, string>>({})
  const [testsOpen, setTestsOpen] = useState(false)
  const [bindingOpen, setBindingOpen] = useState(false)
  const [aliasDraft, setAliasDraft] = useState('')
  const [aliasPending, setAliasPending] = useState(false)
  const [mediaSettingsPending, setMediaSettingsPending] = useState(false)

  useEffect(() => {
    if (requestedCreateParam !== '1') {
      initializedCreateSearchKeyRef.current = ''
      return
    }
    const createSearchKey = 'create=1&adapter=' + requestedAdapterKey
    if (initializedCreateSearchKeyRef.current === createSearchKey) return
    const platform = creatablePlatforms.find((item) => item.key === requestedAdapterKey)
    if (requestedAdapterKey && !platform) return
    initializedCreateSearchKeyRef.current = createSearchKey
    setCreateOpen(true)
    setCreateAlias('')
    setCreateError('')
    setWechatLogin(null)
    if (platform) {
      setCreatePlatform(platform)
      setSelectedPlatformKey(platform.key)
      setCreateStage('configuration')
      setConfiguration(collectConnectionDefaults(platform))
      setCredentials({})
      return
    }
    const platformStageSelection =
      creatablePlatforms.find((item) => item.key === selectedPlatformKey) ?? creatablePlatforms[0]
    setCreatePlatform(platformStageSelection ?? null)
    setCreateStage('platform')
    setSelectedPlatformKey((current) => current || platformStageSelection?.key || '')
  }, [requestedCreateParam, requestedAdapterKey, creatablePlatforms, selectedPlatformKey])

  const selected = connections.find((connection) => connection.id === selectedId) ?? connections[0]

  useEffect(() => {
    setAliasDraft(selected?.alias ?? '')
  }, [selected?.alias, selected?.id])
  useUnsavedDraft(
    `connection:${selected?.id ?? 'new'}`,
    (selected !== undefined && aliasDraft.trim() !== (selected.alias ?? '')) ||
      (createOpen &&
        (createAlias.trim().length > 0 ||
          Object.keys(configuration).length > 0 ||
          Object.values(credentials).some((value) => value.length > 0))),
  )

  const selectedPlatformFromCatalog = creatablePlatforms.find((platform) => platform.key === selectedPlatformKey)
  const selectedPlatform =
    selectedPlatformFromCatalog ??
    (createOpen && createPlatform?.key === selectedPlatformKey ? createPlatform : undefined)
  const selectedTestChannelId = selected
    ? (testChannelByConnection[selected.id] ?? selected.knownChannels[0]?.id ?? '')
    : ''
  const sendTargetAvailable = selectedTestChannelId.length > 0
  const selectedChannels = selected ? channels.filter((channel) => channel.connectionId === selected.id) : []
  const bindingCount = selectedChannels.reduce((count, channel) => count + channel.bindings.length, 0)
  const firstBoundChannel = selectedChannels.find((channel) => channel.bindings.length > 0)
  const wechatIlinkSettings = selected?.adapterSettings?.wechatIlink

  const saveAlias = async (alias: string): Promise<void> => {
    if (!selected || aliasPending) return
    setAliasPending(true)
    try {
      await useProductStore.getState().updateConnectionAlias(selected.id, alias)
      notify(alias.trim() ? '连接别名已保存。' : '连接别名已清除。', 'success', `connection-alias:${selected.id}`)
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error', `connection-alias:${selected.id}`)
    } finally {
      setAliasPending(false)
    }
  }

  const updateWechatIlinkInboundMedia = async (enabled: boolean): Promise<void> => {
    if (!selected || mediaSettingsPending) return
    setMediaSettingsPending(true)
    try {
      await useProductStore.getState().updateWechatIlinkInboundMedia(selected.id, enabled)
      notify(
        enabled ? '微信 iLink 入站图片接收已开启。' : '微信 iLink 入站图片接收已关闭。',
        'success',
        'connection-media:' + selected.id,
      )
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), 'error', 'connection-media:' + selected.id)
    } finally {
      setMediaSettingsPending(false)
    }
  }

  const applyPlatformDefaults = (adapterKey: string): void => {
    const platform = creatablePlatforms.find((item) => item.key === adapterKey) ?? creatablePlatforms[0]
    setSelectedPlatformKey(platform?.key ?? '')
    setCreatePlatform(platform ?? null)
    setConfiguration(collectConnectionDefaults(platform))
    setCredentials({})
    setWechatLogin(null)
  }

  const openCreate = (adapterKey?: string): void => {
    setCreateAlias('')
    setCreateError('')
    setWechatLogin(null)
    if (adapterKey && creatablePlatforms.some((item) => item.key === adapterKey)) {
      applyPlatformDefaults(adapterKey)
      setCreateStage('configuration')
    } else {
      applyPlatformDefaults(creatablePlatforms[0]?.key ?? '')
      setCreateStage('platform')
    }
    setCreateOpen(true)
  }

  const createAction = connectionCreateAction({
    selectedAdapterKey: selected?.adapterKey,
    creatablePlatforms,
  })

  const selectedCreationMode = selectedPlatform?.creation?.mode ?? 'schema-form'
  const isQrLoginCreate = createStage === 'configuration' && selectedCreationMode === 'qr-login'
  const wechatLoginActive = isWechatIlinkLoginActive(wechatLogin)
  const wechatLoginQrImage = wechatLogin?.qrCodeUrl ? createQrCodeSvgDataUrl(wechatLogin.qrCodeUrl) : ''

  const clearCreateSearchParams = (): void => {
    if (searchParams.get('create') !== '1' && !searchParams.get('adapter')) return
    const next = new URLSearchParams(searchParams)
    next.delete('create')
    next.delete('adapter')
    setSearchParams(next, { replace: true })
  }

  const resetCreateState = (): void => {
    setCreateStage('platform')
    setCreateAlias('')
    setCreateError('')
    setConfiguration({})
    setCredentials({})
    setCreatePlatform(null)
    setWechatLogin(null)
  }

  const handleCreateOpenChange = (open: boolean): void => {
    setCreateOpen(open)
    if (open) return
    const activeLogin = wechatLogin
    if (isWechatIlinkLoginActive(activeLogin)) {
      void useProductStore
        .getState()
        .cancelWechatIlinkLogin(activeLogin.loginId)
        .catch(() => undefined)
    }
    resetCreateState()
    clearCreateSearchParams()
  }

  const startWechatLogin = async (): Promise<WechatIlinkLoginView> => {
    const login = await useProductStore.getState().startWechatIlinkLogin({})
    setWechatLogin(login)
    return login
  }

  useEffect(() => {
    const activeLogin = wechatLogin
    if (!createOpen || !isQrLoginCreate || !isWechatIlinkLoginActive(activeLogin)) return
    const loginId = activeLogin.loginId
    const timer = window.setInterval(() => {
      void useProductStore
        .getState()
        .getWechatIlinkLogin(loginId)
        .then((next) => {
          setWechatLogin((current) => (current?.loginId === loginId ? next : current))
          if (next.status === 'confirmed') {
            notify('连接已创建', 'success', 'connection-create')
            setCreateOpen(false)
            resetCreateState()
            clearCreateSearchParams()
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          setCreateError(message)
          setWechatLogin((current) =>
            current?.loginId === loginId ? { ...current, status: 'failed', message } : current,
          )
        })
    }, 1500)
    return () => window.clearInterval(timer)
  }, [createOpen, isQrLoginCreate, searchParams, setSearchParams, wechatLogin])

  if (!connectionId && connections[0]) {
    const query = searchParams.toString()
    return <Navigate to={`/connections/${connections[0].id}${query ? `?${query}` : ''}`} replace />
  }

  const createDialogTitle =
    createStage === 'platform'
      ? '选择平台'
      : isQrLoginCreate
        ? ('登录 ' + (selectedPlatform?.displayName ?? '')).trim()
        : ('配置 ' + (selectedPlatform?.displayName ?? '')).trim()
  const createDialogDescription =
    createStage === 'platform'
      ? '选择要连接的平台账号。'
      : isQrLoginCreate
        ? '使用平台应用扫码登录。登录成功后会自动创建平台连接。'
        : (selectedPlatform?.description ?? '填写平台账号需要的配置。')
  const createConfirmLabel =
    createStage === 'platform'
      ? selectedPlatform?.creation?.mode === 'qr-login'
        ? (selectedPlatform.creation.actionLabel ?? '扫码登录')
        : '填写连接信息'
      : isQrLoginCreate
        ? wechatLoginActive
          ? (selectedPlatform?.creation?.pendingLabel ?? '等待扫码确认…')
          : (selectedPlatform?.creation?.actionLabel ?? '扫码登录')
        : '创建连接'

  const runTest = async (direction: 'receive' | 'send'): Promise<void> => {
    if (!selected || testPending) return
    setTestPending(direction)
    try {
      await useProductStore
        .getState()
        .runConnectionTest(
          selected.id,
          direction,
          direction === 'send' ? selectedTestChannelId || undefined : undefined,
        )
      notify(
        direction === 'receive' ? '接收测试完成' : '测试消息已提交',
        'success',
        `connection-test:${selected.id}:${direction}`,
      )
    } catch (error) {
      notify(
        error instanceof Error ? error.message : String(error),
        'error',
        `connection-test:${selected.id}:${direction}`,
      )
    } finally {
      setTestPending(null)
    }
  }

  return (
    <div className={[styles.page, styles.detailPage].join(' ')} data-connection-page-scroll-root>
      <StageCrossfade swapKey={selected?.id ?? 'empty'}>
        <PageHeader
          icon={Cable}
          title={selected ? connectionDisplayName(selected) : '接入聊天平台'}
          meta={
            selected ? (
              <>
                <span>{selected.userManaged ? selected.adapter : '当前设备托管'}</span>
                <span aria-hidden="true"> · </span>
                <span>{connections.length} 个账号</span>
              </>
            ) : undefined
          }
          actions={
            selected ? (
              <>
                <StatusBadge tone={connectionTone(selected.state)}>{selected.state}</StatusBadge>
                {createAction ? (
                  <Button variant="primary" onClick={() => openCreate(createAction.adapterKey)}>
                    <Plus size={15} aria-hidden="true" /> {createAction.label}
                  </Button>
                ) : null}
              </>
            ) : createAction ? (
              <Button variant="primary" onClick={() => openCreate(createAction.adapterKey)}>
                <Plus size={15} aria-hidden="true" /> {createAction.label}
              </Button>
            ) : undefined
          }
        />
        {connections.length === 0 ? (
          <EmptyState
            loading={host.status === 'initializing'}
            illustration={
              host.status === 'error'
                ? { src: '/brand/illustrations/host-unreachable.svg' }
                : { src: '/brand/illustrations/no-connections.svg' }
            }
            title={host.status === 'initializing' ? '正在读取连接' : '添加第一个平台连接'}
            description={
              host.status === 'error'
                ? '当前无法读取平台连接，请重新连接后再试。'
                : creatablePlatforms.length > 0
                  ? '添加平台连接后，可接收频道消息并进行收发测试。'
                  : '当前没有已安装且可由用户添加的平台。'
            }
            action={
              creatablePlatforms.length > 0 && host.status !== 'error' ? (
                <Button onClick={() => openCreate()}>添加平台连接</Button>
              ) : undefined
            }
          />
        ) : selected ? (
          <section className={styles.connectionWorkspace}>
            {selected.userManaged ? (
              <ol className={styles.connectionProgress} aria-label="连接完成进度">
                {[
                  { label: '连接账号', done: selected.state === '已连接' || selected.state === '已配置' },
                  { label: '发现频道', done: selected.knownChannels.length > 0 },
                  { label: '绑定智能体', done: bindingCount > 0 },
                ].map((step, index) => (
                  <li data-done={step.done ? '' : undefined} key={step.label}>
                    <span>
                      {step.done ? <Check size={12} aria-hidden="true" /> : <Circle size={10} aria-hidden="true" />}
                    </span>
                    <small>{step.label}</small>
                    {index < 2 ? <i aria-hidden="true" /> : null}
                  </li>
                ))}
              </ol>
            ) : null}

            {selected.lastError ? <InlineFeedback tone="error">{selected.lastError}</InlineFeedback> : null}

            <dl className={styles.facts}>
              <dt>最近收到消息</dt>
              <dd>{selected.lastEvent}</dd>
              <dt>已发现频道</dt>
              <dd>{selected.channels} 个</dd>
              {selected.userManaged ? (
                <>
                  <dt>连接账号</dt>
                  <dd>{maskedAccount(selected.appId)}</dd>
                  <dt>凭据</dt>
                  <dd>{selected.credentialConfigured ? '已保存' : '未配置'}</dd>
                  <dt>主动发言</dt>
                  <dd>{selected.proactiveSend ? '允许' : '不允许'}</dd>
                </>
              ) : null}
            </dl>

            {selected.userManaged ? (
              <>
                <div className={styles.sectionDivider} />
                <div className={styles.connectionAliasEditor}>
                  <div className={styles.sectionHeading}>连接别名</div>
                  <div className={styles.inlineFieldAction}>
                    <Field label="辨识名">
                      <Input
                        value={aliasDraft}
                        maxLength={80}
                        onChange={(event) => setAliasDraft(event.target.value)}
                        disabled={aliasPending}
                      />
                    </Field>
                    <Button
                      size="small"
                      loading={aliasPending}
                      loadingLabel="保存中…"
                      disabled={aliasPending || aliasDraft.trim() === (selected.alias ?? '')}
                      onClick={() => void saveAlias(aliasDraft)}
                    >
                      保存别名
                    </Button>
                    <Button
                      size="small"
                      variant="ghost"
                      disabled={aliasPending || !selected.alias}
                      onClick={() => {
                        setAliasDraft('')
                        void saveAlias('')
                      }}
                    >
                      清除
                    </Button>
                  </div>
                  <small className={styles.inlineFieldHint}>可选，用于区分同适配器频道连接</small>
                </div>
                {wechatIlinkSettings ? (
                  <>
                    <div className={styles.sectionDivider} />
                    <div className={styles.connectionAliasEditor}>
                      <div className={styles.sectionHeading}>微信 iLink 设置</div>
                      <SwitchField
                        label="入站图片接收"
                        description="开启后，微信 iLink 收到的图片会下载并导入为频道图片资源；关闭时只记录可解释的占位内容。"
                        checked={wechatIlinkSettings.enableInboundMedia}
                        disabled={mediaSettingsPending}
                        onCheckedChange={(checked) => void updateWechatIlinkInboundMedia(checked)}
                      />
                    </div>
                  </>
                ) : null}
              </>
            ) : null}

            {!selected.userManaged ? (
              <InlineFeedback tone="info">内置频道由 NekroNXT 直接提供。</InlineFeedback>
            ) : (
              <>
                <div className={styles.optionalTests}>
                  <Button
                    variant="ghost"
                    size="small"
                    aria-expanded={testsOpen}
                    onClick={() => setTestsOpen((open) => !open)}
                  >
                    收发测试
                  </Button>
                  <Disclosure open={testsOpen}>
                    {selected.knownChannels.length > 0 ? (
                      <SelectField
                        label="测试消息发送到"
                        value={selectedTestChannelId}
                        onValueChange={(channelId) =>
                          setTestChannelByConnection((current) => ({ ...current, [selected.id]: channelId }))
                        }
                        options={selected.knownChannels.map((channel) => {
                          const label = friendlyKnownChannelLabel(channel)
                          return {
                            value: channel.id,
                            label: /^(?:群聊|私聊)/u.test(label)
                              ? label
                              : `${label} · ${channel.kind === 'group' ? '群聊' : '私聊'}`,
                          }
                        })}
                      />
                    ) : (
                      <InlineFeedback tone="warning">
                        还没有发现频道。请先在已连接的平台向机器人账号发送一条消息。
                      </InlineFeedback>
                    )}
                    <div className={styles.testRows}>
                      <div className={styles.testRow}>
                        <span>
                          <strong>接收消息</strong>
                          <small>{testResultLabel(selected.receiveTest)}</small>
                        </span>
                        <Button
                          size="small"
                          loading={testPending === 'receive'}
                          loadingLabel="测试中…"
                          disabled={testPending !== null}
                          onClick={() => void runTest('receive')}
                        >
                          <Radio size={14} aria-hidden="true" /> 测试接收
                        </Button>
                      </div>
                      <div className={styles.testRow}>
                        <span>
                          <strong>发送消息</strong>
                          <small>{testResultLabel(selected.sendTest)}</small>
                        </span>
                        <Button
                          size="small"
                          loading={testPending === 'send'}
                          loadingLabel="发送中…"
                          disabled={testPending !== null || !sendTargetAvailable}
                          onClick={() => void runTest('send')}
                        >
                          <Send size={14} aria-hidden="true" /> 发送测试消息
                        </Button>
                      </div>
                    </div>
                  </Disclosure>
                </div>
                <div className={styles.sectionDivider} />
                <div className={styles.sectionBar}>
                  <div>
                    <div className={styles.sectionHeading}>绑定智能体</div>
                    <div className={styles.secondaryText}>
                      {bindingCount > 0 ? `已有 ${bindingCount} 个频道绑定。` : '为已发现频道选择响应的智能体。'}
                    </div>
                  </div>
                  {bindingCount > 0 ? <StatusBadge tone="success">已完成</StatusBadge> : null}
                </div>
                {agents.length > 0 ? (
                  <div className={styles.bindingNextStep}>
                    <Button
                      variant="primary"
                      disabled={selectedChannels.length === 0 && selected.knownChannels.length === 0}
                      onClick={() => setBindingOpen(true)}
                    >
                      绑定智能体
                    </Button>
                    {firstBoundChannel ? (
                      <Button variant="ghost" onClick={() => void navigate(`/work/channels/${firstBoundChannel.id}`)}>
                        前往已绑定频道 <ArrowRight size={14} aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <InlineFeedback tone="warning">请先创建智能体，再绑定已发现的频道。</InlineFeedback>
                )}
              </>
            )}
          </section>
        ) : null}
      </StageCrossfade>
      {selected ? (
        <BindingTaskDialog
          open={bindingOpen}
          onOpenChange={setBindingOpen}
          connectionId={selected.id}
          title="绑定智能体"
          description="选择响应这个频道的智能体和触发方式。保存后立即更新频道绑定。"
        />
      ) : null}

      <ConfirmDialog
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        title={createDialogTitle}
        description={createDialogDescription}
        confirmLabel={createConfirmLabel}
        confirmLoadingLabel={
          isQrLoginCreate || selectedPlatform?.creation?.mode === 'qr-login' ? '正在生成二维码…' : '处理中…'
        }
        confirmDisabled={isQrLoginCreate && wechatLoginActive}
        onConfirm={async () => {
          if (!selectedPlatform) {
            setCreateError('请选择连接平台。')
            return false
          }
          if (createStage === 'platform') {
            setConfiguration(collectConnectionDefaults(selectedPlatform))
            setCredentials({})
            setCreateStage('configuration')
            setCreateError('')
            setWechatLogin(null)
            if (selectedPlatform.creation?.mode === 'qr-login') {
              try {
                const login = await startWechatLogin()
                if (login.status === 'confirmed') {
                  notify('连接已创建', 'success', 'connection-create')
                  resetCreateState()
                  clearCreateSearchParams()
                  return true
                }
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                setCreateError(message)
                notify(message, 'error', 'connection-create')
              }
            }
            return false
          }
          if (isQrLoginCreate) {
            if (!isWechatIlinkLoginRestartable(wechatLogin)) return false
            setCreateError('')
            try {
              const login = await startWechatLogin()
              if (login.status === 'confirmed') {
                notify('连接已创建', 'success', 'connection-create')
                resetCreateState()
                clearCreateSearchParams()
                return true
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              setCreateError(message)
              notify(message, 'error', 'connection-create')
            }
            return false
          }
          setCreateError('')
          try {
            await useProductStore.getState().createConnection({
              adapterKey: selectedPlatform.key,
              alias: createAlias,
              configuration,
              credentials,
            })
            notify('连接已创建', 'success', 'connection-create')
            setConfiguration({})
            setCredentials({})
            setCreateAlias('')
            setCreateStage('platform')
            return true
          } catch (error) {
            notify(error instanceof Error ? error.message : String(error), 'error', 'connection-create')
            return false
          }
        }}
      >
        <div className={styles.formStack}>
          {createStage === 'platform' ? (
            <SelectField
              label="平台"
              value={selectedPlatformKey}
              onValueChange={(value) => {
                const platform = creatablePlatforms.find((item) => item.key === value)
                setSelectedPlatformKey(value)
                setCreatePlatform(platform ?? null)
                setCreateError('')
              }}
              options={creatablePlatforms.map((platform) => ({
                value: platform.key,
                label: platform.displayName,
              }))}
            />
          ) : (
            <>
              {isQrLoginCreate ? (
                <div className={styles.qrLoginPanel}>
                  <InlineFeedback tone="info">请使用平台应用扫描二维码并确认登录。</InlineFeedback>
                  {wechatLoginQrImage ? (
                    <div className={styles.qrLoginCode}>
                      <img
                        src={wechatLoginQrImage}
                        alt={(selectedPlatform?.displayName ?? '平台') + ' 扫码登录二维码'}
                      />
                    </div>
                  ) : null}
                  {wechatLogin?.message ? (
                    <InlineFeedback
                      tone={wechatLogin.status === 'failed' || wechatLogin.status === 'expired' ? 'error' : 'info'}
                    >
                      {wechatLogin.message}
                    </InlineFeedback>
                  ) : null}
                </div>
              ) : (
                <>
                  <Button type="button" size="small" variant="ghost" onClick={() => setCreateStage('platform')}>
                    返回选择平台
                  </Button>
                  <Field label="连接别名" hint="可选，用于区分这个连接；平台名称显示为次要信息。">
                    <Input
                      value={createAlias}
                      maxLength={80}
                      onChange={(event) => setCreateAlias(event.target.value)}
                    />
                  </Field>
                  {Object.entries(selectedPlatform?.configSchema.properties ?? {}).flatMap(([key, property]) => {
                    if (property === undefined) return []
                    if (property.type === 'boolean') {
                      return [
                        <SwitchField
                          key={key}
                          label={property.title}
                          description={property.description ?? ''}
                          checked={configuration[key] === true}
                          onCheckedChange={(value) => setConfiguration((current) => ({ ...current, [key]: value }))}
                        />,
                      ]
                    }
                    if (property.type === 'credential-reference') {
                      return [
                        <Field key={key} label={property.title} hint="凭据仅可覆盖，无法查看已保存值。">
                          <SecretInput
                            value={credentials[key] ?? ''}
                            onChange={(event) =>
                              setCredentials((current) => ({ ...current, [key]: event.target.value }))
                            }
                          />
                        </Field>,
                      ]
                    }
                    return [
                      <Field key={key} label={property.title} hint={property.description}>
                        <Input
                          type={property.type === 'number' ? 'number' : 'text'}
                          value={typeof configuration[key] === 'boolean' ? '' : (configuration[key] ?? '')}
                          onChange={(event) =>
                            setConfiguration((current) => ({
                              ...current,
                              [key]: property.type === 'number' ? Number(event.target.value) : event.target.value,
                            }))
                          }
                        />
                      </Field>,
                    ]
                  })}
                </>
              )}
            </>
          )}
          {createError ? <InlineFeedback tone="error">{createError}</InlineFeedback> : null}
        </div>
      </ConfirmDialog>
    </div>
  )
}
