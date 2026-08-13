/**
 * 대화 보관함 UI — 왼쪽 목록 + PIN 잠금 화면
 *
 * 세 가지 상태가 있다.
 *   off     보관함을 만들지 않음. 대화는 새로고침하면 사라진다 (기본값)
 *   locked  보관함은 있는데 잠겨 있음. PIN을 넣어야 목록이 보인다
 *   open    풀림. 목록이 보이고 새 대화가 저장된다
 *
 * 기본값을 off로 둔 이유: 저장하지 않는 것이 가장 안전하다. 저장은
 * 사용자가 명시적으로 켜는 기능이어야지 기본으로 켜져 있으면 안 된다.
 */
import { useState } from 'react'
import type { Conversation } from '../lib/vault'
import { IconArrowRight, IconShield } from './icons'

export type VaultState = 'off' | 'locked' | 'open'

export default function ChatVault({
  state,
  list,
  activeId,
  error,
  busy,
  onCreate,
  onUnlock,
  onOpen,
  onNew,
  onLock,
  onDestroy,
}: {
  state: VaultState
  list: Conversation[]
  activeId: string | null
  error: string | null
  busy: boolean
  onCreate: (pin: string) => void
  onUnlock: (pin: string) => void
  onOpen: (id: string) => void
  onNew: () => void
  onLock: () => void
  onDestroy: () => void
}) {
  const [pin, setPin] = useState('')
  const [setup, setSetup] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin.length < 4) return
    if (state === 'off') onCreate(pin)
    else onUnlock(pin)
    setPin('')
  }

  /* ── 저장을 아직 안 켠 상태 ── */
  if (state === 'off' && !setup) {
    return (
      <aside className="vault">
        <div className="vault-head">
          <span className="eyebrow">대화</span>
        </div>
        <button className="vault-new" onClick={onNew}>
          새 대화
        </button>

        <div className="vault-off">
          <IconShield size={20} style={{ color: 'var(--ink-4)' }} />
          <p className="small strong mt-3">지금은 저장하지 않습니다</p>
          <p className="xs muted keep mt-2" style={{ lineHeight: 1.7 }}>
            새로고침하면 대화가 사라집니다. 이어 보시려면 확인 키를 만들어
            주세요. 대화는 그 키로 암호화해서 이 브라우저에만 둡니다.
          </p>
          <button className="btn btn-soft btn-sm btn-block mt-4" onClick={() => setSetup(true)}>
            확인 키 만들기
          </button>
        </div>
      </aside>
    )
  }

  /* ── PIN 입력 (생성 또는 해제) ── */
  if (state !== 'open') {
    const creating = state === 'off'
    return (
      <aside className="vault">
        <div className="vault-head">
          <span className="eyebrow">{creating ? '확인 키 만들기' : '잠김'}</span>
        </div>

        <form className="vault-pin" onSubmit={submit}>
          <p className="xs muted keep" style={{ lineHeight: 1.75 }}>
            {creating
              ? '숫자 4자리 이상으로 정해 주세요. 이 키로 대화를 암호화합니다.'
              : '확인 키를 넣으면 저장된 대화가 열립니다.'}
          </p>

          <input
            className="vault-input mt-4"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
            placeholder="••••"
            aria-label="확인 키"
            autoFocus
          />

          {error && <p className="vault-err">{error}</p>}

          <button className="btn btn-primary btn-sm btn-block mt-3" disabled={pin.length < 4 || busy}>
            {busy ? '확인 중…' : creating ? '이 키로 만들기' : '열기'}
            <IconArrowRight size={14} />
          </button>

          {creating ? (
            <button type="button" className="vault-plain mt-3" onClick={() => setSetup(false)}>
              그만두기 — 저장하지 않고 쓸게요
            </button>
          ) : (
            <button type="button" className="vault-plain mt-3" onClick={onDestroy}>
              키를 잊었어요 — 저장된 대화 전부 지우기
            </button>
          )}

          {/* 무엇을 못 지키는지 숨기지 않는다 */}
          <p className="vault-limit">
            같은 PC를 쓰는 다른 사람이 저장된 대화를 읽는 것은 막습니다. 다만 이 키를
            아는 사람이나 기기 자체가 털리는 경우는 막지 못해요. 진짜 계정 보호는
            서버 로그인이 붙어야 생깁니다.
          </p>
        </form>
      </aside>
    )
  }

  /* ── 열린 상태 ── */
  return (
    <aside className="vault">
      <div className="vault-head">
        <span className="eyebrow">대화</span>
        <button className="vault-lock" onClick={onLock}>
          잠그기
        </button>
      </div>

      <button className="vault-new" onClick={onNew}>
        새 대화
      </button>

      <div className="vault-list">
        {list.length === 0 && (
          <p className="xs faint keep" style={{ padding: '12px 4px', lineHeight: 1.7 }}>
            저장된 대화가 없습니다. 질문을 하시면 여기에 쌓여요.
          </p>
        )}
        {list.map((c) => (
          <button
            key={c.id}
            className={`vault-item${c.id === activeId ? ' on' : ''}`}
            onClick={() => onOpen(c.id)}
          >
            <span className="vault-item-t truncate">{c.title}</span>
            <span className="vault-item-d">{c.at.slice(5, 10).replace('-', '/')}</span>
          </button>
        ))}
      </div>

      <p className="vault-foot">암호화되어 이 브라우저에만 저장됩니다</p>
    </aside>
  )
}
