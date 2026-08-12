/// <reference types="vite/client" />

/** 인증용 환경변수. 없으면 비로그인 모드로 동작한다. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
