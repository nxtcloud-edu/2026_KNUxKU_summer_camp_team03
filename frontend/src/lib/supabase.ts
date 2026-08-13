/**
 * Supabase 클라이언트
 *
 * 키가 없으면 null을 돌려준다. 이 프로젝트는 아직 화면 프로토타입이라
 * "키가 없으면 아예 안 뜨는" 상태가 되면 안 된다. 그래서 인증은 선택 기능이고,
 * 환경변수가 들어오는 순간 켜지는 구조로 뒀다.
 *
 *   키 없음 → 비로그인 모드. 지금까지처럼 그냥 쓸 수 있다
 *   키 있음 → 로그인 모드. /admin은 막히고 헤더에 계정이 뜬다
 *
 * ⚠ anon 키는 브라우저에 그대로 노출된다. 그게 정상이고, 숨길 방법도 없다.
 *   보안은 키가 아니라 RLS(supabase/rls.sql)가 만든다. RLS를 걸지 않으면
 *   로그인은 붙었는데 남의 데이터가 다 읽히는 상태가 된다. 로그인 있는 무방비가
 *   로그인 없는 무방비보다 위험하다.
 *
 * ⚠ service_role 키는 절대 여기 넣지 말 것. 그 키는 RLS를 통째로 우회한다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** 인증이 켜져 있는가 — 화면 곳곳에서 이 값으로 분기한다 */
export const authEnabled = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = authEnabled
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // 이메일+비밀번호만 쓰므로 URL에서 세션을 주워 올 일이 없다
        detectSessionInUrl: false,
      },
    })
  : null

/** service_role 키를 실수로 넣었는지 본다. 넣으면 브라우저에 관리자 권한이 새 나간다 */
if (anonKey && anonKey.includes('service_role')) {
  console.error(
    '[Quill] service_role 키가 프런트에 들어와 있습니다. 즉시 제거하고 키를 새로 발급하세요. ' +
      '이 키는 RLS를 우회합니다.',
  )
}
