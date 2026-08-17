import React, {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from 'react'
import type { SettingsSectionOwnerProps } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {
  ImessagePluginState,
  PublicPluginError,
  RuntimeView,
} from '../types.js'
import type { ImessageSettingsController } from './controller.js'

/** Dependencies supplied by the client slot registration. */
export interface ImessageSettingsInjected {
  controller: ImessageSettingsController
}

/** Slot props are partial until the renderer has resolved every injected seat. */
export type ImessageSettingsSectionProps = Partial<ImessageSettingsInjected & SettingsSectionOwnerProps>

/** Render the complete three-stage Photon iMessage setup surface. */
export function ImessageSettingsSection(props: ImessageSettingsSectionProps): ReactNode {
  if (props.controller === undefined) return null
  return <Loaded controller={props.controller} />
}

function Loaded({ controller }: ImessageSettingsInjected): ReactNode {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )
  if (snapshot.state === undefined) {
    return (
      <section className="dsh-imessage-section" aria-busy={snapshot.phase === 'loading'}>
        <PageHeader />
        {snapshot.error === undefined
          ? <p className="dsh-imessage-muted">Loading iMessage configuration…</p>
          : <ErrorNotice error={snapshot.error} onRetry={() => { void controller.refresh() }} />}
      </section>
    )
  }

  return (
    <section className="dsh-imessage-section" aria-busy={snapshot.pendingAction !== undefined}>
      <PageHeader />
      {snapshot.error === undefined ? null : <ErrorNotice error={snapshot.error} />}
      <AuthorizationCard controller={controller} state={snapshot.state} pending={snapshot.pendingAction} />
      <PhoneCard controller={controller} state={snapshot.state} pending={snapshot.pendingAction} />
      <LineCard controller={controller} state={snapshot.state} pending={snapshot.pendingAction} />
      <p className="dsh-imessage-footnote">
        Only messages from your saved number to the assigned line are accepted. Message text and raw phone
        numbers are not written to plugin logs. Disconnecting removes local routing only; it never deletes
        Photon projects or users.
      </p>
    </section>
  )
}

function PageHeader(): ReactNode {
  return (
    <header className="dsh-imessage-heading">
      <div>
        <p className="dsh-imessage-eyebrow">Photon transport</p>
        <h1>iMessage</h1>
        <p>Connect a hosted iMessage line to DeepSeek Harness.</p>
      </div>
    </header>
  )
}

function AuthorizationCard({
  controller,
  state,
  pending,
}: {
  controller: ImessageSettingsController
  state: ImessagePluginState
  pending: string | undefined
}): ReactNode {
  const authorization = state.authorization
  const isWaiting = authorization.phase === 'pending'
  const [popupBlocked, setPopupBlocked] = useState(false)
  const [copied, setCopied] = useState(false)

  const authorize = (): void => {
    // The blank window must be opened in the click task or browsers will treat it as an unsolicited popup.
    const popup = openAuthorizationWindow()
    setPopupBlocked(popup === null)
    void controller.beginAuthorization().then((result) => {
      if (result === undefined || !result.ok) {
        popup?.close()
        return
      }
      const next = result.state.authorization
      if (next.phase !== 'pending') {
        popup?.close()
        return
      }
      const url = next.verificationUriComplete ?? next.verificationUri
      if (popup !== null && !popup.closed) {
        try {
          popup.opener = null
          popup.location.replace(url)
        } catch {
          setPopupBlocked(true)
        }
      }
    })
  }

  const canMutate = state.settingsWritable && state.credentialWritable && pending === undefined
  return (
    <article className="dsh-imessage-card">
      <CardTitle number="1" title="Authorize Photon" status={authorizationLabel(state)} />
      {authorization.phase === 'authorized' ? (
        <p className="dsh-imessage-body">
          Signed in as <strong>{authorization.account.name ?? authorization.account.email}</strong>. The
          project is <code>dsh</code>.
        </p>
      ) : authorization.phase === 'reauthorization-required' ? (
        <p className="dsh-imessage-warning">
          Management authorization expired. Existing routing can keep using the stored project secret, but
          configuration changes require authorization again.
        </p>
      ) : authorization.phase === 'failed' ? (
        <ErrorNotice error={authorization.error} />
      ) : authorization.phase === 'disconnected' ? (
        <p className="dsh-imessage-body">
          Use Photon’s device login. DSH never launches the Photon CLI or reads its credential files.
        </p>
      ) : null}

      {isWaiting ? (
        <div className="dsh-imessage-device" aria-live="polite">
          <span className="dsh-imessage-label">Device code</span>
          <strong className="dsh-imessage-code">{authorization.userCode}</strong>
          <Expiry expiresAt={authorization.expiresAt} />
          <div className="dsh-imessage-actions">
            <a
              className="dsh-imessage-button dsh-imessage-primary"
              href={authorization.verificationUriComplete ?? authorization.verificationUri}
              target="_blank"
              rel="noreferrer"
            >
              Open Photon
            </a>
            <button
              type="button"
              className="dsh-imessage-button"
              onClick={() => {
                void copyText(authorization.userCode).then((ok) => {
                  setCopied(ok)
                  window.setTimeout(() => { setCopied(false) }, 2_000)
                })
              }}
            >
              {copied ? 'Copied' : 'Copy code'}
            </button>
            <button
              type="button"
              className="dsh-imessage-button"
              disabled={pending !== undefined}
              onClick={() => { void controller.cancelAuthorization() }}
            >
              Cancel
            </button>
          </div>
          {popupBlocked ? (
            <p className="dsh-imessage-muted">The popup was blocked. Use “Open Photon” or copy the code.</p>
          ) : null}
        </div>
      ) : (
        <div className="dsh-imessage-actions">
          <button
            type="button"
            className="dsh-imessage-button dsh-imessage-primary"
            disabled={!canMutate}
            onClick={authorize}
          >
            {authorization.phase === 'disconnected' ? 'Authorize' : 'Reauthorize'}
          </button>
        </div>
      )}
      {!state.settingsWritable || !state.credentialWritable ? (
        <p className="dsh-imessage-warning">
          This profile is read-only. Remove the settings or credential override before changing setup.
        </p>
      ) : null}
    </article>
  )
}

function PhoneCard({
  controller,
  state,
  pending,
}: {
  controller: ImessageSettingsController
  state: ImessagePluginState
  pending: string | undefined
}): ReactNode {
  const [phone, setPhone] = useState(state.phoneNumber ?? '')
  const [dirty, setDirty] = useState(false)
  const normalized = phone.trim()
  const valid = isStrictE164(normalized)
  const authorized = state.authorization.phase === 'authorized'
  const projectReady = state.provisioning.phase === 'ready'

  useEffect(() => {
    if (!dirty) setPhone(state.phoneNumber ?? '')
  }, [dirty, state.phoneNumber])

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!valid) return
    void controller.savePhone(normalized, state.revision).then((result) => {
      if (result?.ok === true) setDirty(false)
    })
  }

  return (
    <article className="dsh-imessage-card">
      <CardTitle
        number="2"
        title="Choose your sending number"
        status={state.assignedPhoneNumber === undefined ? 'Not configured' : 'Configured'}
      />
      <p className="dsh-imessage-body">
        Enter the personal number that will text Photon’s hosted number. It must be a full E.164 number.
      </p>
      <form className="dsh-imessage-form" onSubmit={submit}>
        <label htmlFor="dsh-imessage-phone">Number you will text from</label>
        <input
          id="dsh-imessage-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+14155552671"
          value={phone}
          aria-invalid={phone.length > 0 && !valid}
          disabled={pending !== undefined}
          onChange={(event) => {
            setPhone(event.currentTarget.value)
            setDirty(true)
          }}
        />
        {phone.length > 0 && !valid ? (
          <p className="dsh-imessage-error">Use “+” followed by 2–15 digits; the first digit cannot be zero.</p>
        ) : null}
        {!authorized ? (
          <p className="dsh-imessage-muted">Authorize Photon before saving a number.</p>
        ) : !projectReady ? (
          <p className="dsh-imessage-muted">The <code>dsh</code> project is still being prepared.</p>
        ) : null}
        {state.provisioning.phase === 'failed' ? <ErrorNotice error={state.provisioning.error} /> : null}
        <div className="dsh-imessage-actions">
          <button
            type="submit"
            className="dsh-imessage-button dsh-imessage-primary"
            disabled={!valid || !authorized || !projectReady || pending !== undefined
              || !state.settingsWritable || !state.credentialWritable}
          >
            {pending === 'save-phone' ? 'Provisioning…' : 'Save number'}
          </button>
        </div>
      </form>
    </article>
  )
}

function LineCard({
  controller,
  state,
  pending,
}: {
  controller: ImessageSettingsController
  state: ImessagePluginState
  pending: string | undefined
}): ReactNode {
  const [copied, setCopied] = useState(false)
  const assigned = state.assignedPhoneNumber
  const disconnect = (): void => {
    if (!window.confirm('Disconnect local iMessage routing? Photon projects and users will be preserved.')) return
    void controller.disconnect(state.revision)
  }

  return (
    <article className="dsh-imessage-card">
      <CardTitle number="3" title="Text your hosted line" status={runtimeLabel(state.runtime)} />
      {assigned === undefined ? (
        <p className="dsh-imessage-body">Your hosted iMessage number appears here after the sender is saved.</p>
      ) : (
        <>
          <div className="dsh-imessage-line">
            <div>
              <span className="dsh-imessage-label">Hosted iMessage number</span>
              <strong>{assigned}</strong>
            </div>
            <div className="dsh-imessage-actions">
              <button
                type="button"
                className="dsh-imessage-button"
                onClick={() => {
                  void copyText(assigned).then((ok) => {
                    setCopied(ok)
                    window.setTimeout(() => { setCopied(false) }, 2_000)
                  })
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              <a className="dsh-imessage-button dsh-imessage-primary" href={`sms:${assigned}`}>
                Text this number
              </a>
            </div>
          </div>
          <dl className="dsh-imessage-health">
            <div><dt>Listener</dt><dd>{runtimeLabel(state.runtime)}</dd></div>
            <div><dt>Active session</dt><dd>{state.activeSessionId ?? 'A new session will be created'}</dd></div>
          </dl>
          {state.runtime.phase === 'failed' ? <ErrorNotice error={state.runtime.error} /> : null}
          {state.runtime.phase === 'retrying' ? (
            <p className="dsh-imessage-muted">
              Reconnect attempt {state.runtime.attempt} is scheduled for {formatTime(state.runtime.retryAt)}.
            </p>
          ) : null}
          <div className="dsh-imessage-actions">
            {state.runtime.phase === 'failed' || state.runtime.phase === 'stopped' ? (
              <button
                type="button"
                className="dsh-imessage-button"
                disabled={pending !== undefined}
                onClick={() => { void controller.retryRuntime() }}
              >
                {pending === 'retry-runtime' ? 'Starting…' : 'Retry listener'}
              </button>
            ) : null}
            <button
              type="button"
              className="dsh-imessage-button dsh-imessage-danger"
              disabled={pending !== undefined || !state.settingsWritable || !state.credentialWritable}
              onClick={disconnect}
            >
              {pending === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
          <CommandReference />
        </>
      )}
    </article>
  )
}

function CardTitle({ number, title, status }: { number: string; title: string; status: string }): ReactNode {
  return (
    <div className="dsh-imessage-card-title">
      <div><span>{number}</span><h2>{title}</h2></div>
      <small>{status}</small>
    </div>
  )
}

function CommandReference(): ReactNode {
  const commands = [
    ['/help', 'Show command help'],
    ['/new', 'Start a new DSH session'],
    ['/sessions [page]', 'List same-workspace root sessions'],
    ['/switch <index|session-id>', 'Change the active session'],
    ['/status', 'Show listener and session status'],
    ['/stop or /cancel', 'Stop the active turn'],
    ['/approve <request-id>', 'Approve a correlated request once'],
    ['/deny <request-id>', 'Deny a correlated request'],
    ['/answer <request-id> <answer>', 'Answer a correlated question'],
    ['//text', 'Send a normal prompt beginning with /'],
  ] as const
  return (
    <details className="dsh-imessage-commands">
      <summary>Command reference</summary>
      <dl>
        {commands.map(([command, description]) => (
          <div key={command}><dt><code>{command}</code></dt><dd>{description}</dd></div>
        ))}
      </dl>
      <p>Session switching and creation are refused during a turn or human interaction; send <code>/stop</code> first.</p>
    </details>
  )
}

function Expiry({ expiresAt }: { expiresAt: number }): ReactNode {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { window.clearInterval(timer) }
  }, [])
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1_000))
  return <span className="dsh-imessage-muted">Expires in {formatDuration(seconds)}</span>
}

function ErrorNotice({ error, onRetry }: { error: PublicPluginError; onRetry?: () => void }): ReactNode {
  return (
    <div className="dsh-imessage-error-box" role="alert">
      <strong>{error.message}</strong>
      {error.details === undefined || error.details.length === 0 ? null : (
        <ul>{error.details.map(detail => <li key={detail}><code>{detail}</code></li>)}</ul>
      )}
      {onRetry === undefined ? null : (
        <button type="button" className="dsh-imessage-button" onClick={onRetry}>Retry</button>
      )}
    </div>
  )
}

function authorizationLabel(state: ImessagePluginState): string {
  switch (state.authorization.phase) {
    case 'authorized': return state.provisioning.phase === 'ready' ? 'Authorized' : provisioningLabel(state)
    case 'pending': return 'Waiting for device login'
    case 'reauthorization-required': return 'Reauthorization required'
    case 'failed': return 'Authorization failed'
    case 'disconnected': return 'Not authorized'
  }
}

function provisioningLabel(state: ImessagePluginState): string {
  switch (state.provisioning.phase) {
    case 'project': return 'Preparing dsh project'
    case 'user': return 'Preparing hosted line'
    case 'failed': return 'Provisioning failed'
    case 'ready': return 'Authorized'
    case 'idle': return 'Authorized'
  }
}

function runtimeLabel(runtime: RuntimeView): string {
  switch (runtime.phase) {
    case 'listening': return 'Listening'
    case 'starting': return 'Starting'
    case 'retrying': return `Reconnecting (${runtime.attempt})`
    case 'failed': return 'Listener failed'
    case 'stopped': return 'Stopped'
  }
}

function isStrictE164(value: string): boolean {
  return /^\+[1-9]\d{1,14}$/u.test(value)
}

function openAuthorizationWindow(): Window | null {
  const popup = window.open(
    'about:blank',
    'dsh-photon-device-authorization',
    'popup,width=720,height=760,resizable=yes,scrollbars=yes',
  )
  if (popup !== null) {
    try {
      popup.document.title = 'Photon authorization'
      popup.document.body.textContent = 'Waiting for a Photon device code…'
    } catch {
      // A reused named window can still be cross-origin until about:blank commits.
    }
  }
  return popup
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
}
