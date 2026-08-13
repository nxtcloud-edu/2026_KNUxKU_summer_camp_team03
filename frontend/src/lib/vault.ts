/**
 * 대화 보관함 — PIN으로 실제 암호화한다.
 *
 * 왜 암호화까지 하는가:
 *   대화 내용은 "내 돈이 얼마고 어디까지 잃어도 되는가"에 대한 기록이다.
 *   화면만 가려 두고 localStorage에 평문으로 두면, 개발자 도구를 열 줄 아는
 *   사람에게는 잠금이 없는 것과 같다. 잠금 시늉은 없느니만 못하다.
 *
 * 무엇을 지키고 무엇을 못 지키는가 (화면에도 이대로 적는다):
 *   지킨다 — 같은 PC를 쓰는 다른 사람이 저장된 대화를 읽는 것
 *   못 지킨다 — 이 브라우저에서 PIN을 아는 사람, 화면을 보고 있는 사람,
 *              그리고 기기 자체가 털리는 경우
 *   진짜 계정 보호는 서버 인증이 붙어야 생긴다. 이건 그 전 단계의 최소 조치다.
 *
 * PBKDF2(SHA-256, 20만 회) → AES-GCM 256. 브라우저 표준 WebCrypto만 쓴다.
 */

const META_KEY = 'quill.vault.meta.v1'
const DATA_KEY = 'quill.vault.data.v1'
/** PIN이 맞는지 확인하는 데 쓰는 고정 문구 */
const VERIFIER = 'quill-vault-ok'
const ITERATIONS = 200_000

interface Meta {
  salt: string
  /** VERIFIER를 암호화해 둔 값. 복호화되면 PIN이 맞는 것 */
  verifier: string
}

/* ── 인코딩 유틸 ─────────────────────────────────────────── */

const enc = new TextEncoder()
const dec = new TextDecoder()

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s)
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/* ── 키 유도 ─────────────────────────────────────────────── */

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      // BufferSource로 넘겨야 타입이 맞는다
      salt: salt as unknown as BufferSource,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** iv를 앞에 붙여 한 덩어리로 저장한다 */
async function encryptText(key: CryptoKey, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const buf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    enc.encode(text),
  )
  return `${toB64(iv)}.${toB64(buf)}`
}

async function decryptText(key: CryptoKey, blob: string): Promise<string> {
  const [ivB64, dataB64] = blob.split('.')
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) as unknown as BufferSource },
    key,
    fromB64(dataB64) as unknown as BufferSource,
  )
  return dec.decode(buf)
}

/* ── 보관함 API ──────────────────────────────────────────── */

function readMeta(): Meta | null {
  try {
    const raw = localStorage.getItem(META_KEY)
    return raw ? (JSON.parse(raw) as Meta) : null
  } catch {
    return null
  }
}

/** 보관함이 이미 만들어져 있는가 */
export const vaultExists = () => readMeta() !== null

/** 처음 PIN을 정한다 */
export async function createVault(pin: string): Promise<CryptoKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(pin, salt)
  const meta: Meta = {
    salt: toB64(salt),
    verifier: await encryptText(key, VERIFIER),
  }
  localStorage.setItem(META_KEY, JSON.stringify(meta))
  localStorage.removeItem(DATA_KEY)
  return key
}

/** PIN을 확인하고 키를 돌려준다. 틀리면 null */
export async function unlockVault(pin: string): Promise<CryptoKey | null> {
  const meta = readMeta()
  if (!meta) return null
  try {
    const key = await deriveKey(pin, fromB64(meta.salt))
    const check = await decryptText(key, meta.verifier)
    return check === VERIFIER ? key : null
  } catch {
    // 복호화 실패 = PIN 불일치
    return null
  }
}

/** 보관함을 통째로 지운다. PIN을 잊었을 때의 유일한 길이다 */
export function destroyVault() {
  localStorage.removeItem(META_KEY)
  localStorage.removeItem(DATA_KEY)
}

/* ── 대화 저장 ───────────────────────────────────────────── */

export interface StoredMessage {
  role: 'user' | 'agent'
  text: string
  evidence?: string[]
}

export interface Conversation {
  id: string
  /** 첫 질문을 제목으로 쓴다 */
  title: string
  at: string
  messages: StoredMessage[]
}

export async function saveConversations(key: CryptoKey, list: Conversation[]) {
  const blob = await encryptText(key, JSON.stringify(list))
  localStorage.setItem(DATA_KEY, blob)
}

export async function loadConversations(key: CryptoKey): Promise<Conversation[]> {
  const blob = localStorage.getItem(DATA_KEY)
  if (!blob) return []
  try {
    return JSON.parse(await decryptText(key, blob)) as Conversation[]
  } catch {
    // 키가 바뀌었거나 저장본이 깨진 경우. 지우지 않고 빈 목록만 돌려준다
    return []
  }
}
