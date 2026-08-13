-- ============================================================
-- Quill · 스키마 초안
-- 설계문서 v2의 ERD를 그대로 옮긴 것이다.
--
-- 적용 순서
--   1) 이 파일을 Supabase SQL Editor에 붙여 실행
--   2) 반드시 rls.sql을 이어서 실행 (RLS 없이는 남의 데이터가 다 읽힌다)
--
-- users 테이블은 만들지 않는다. Supabase의 auth.users를 그대로 쓴다.
-- 계정 정보를 두 군데 두면 반드시 어긋난다.
-- ============================================================

create extension if not exists vector;

-- ── 사용자 프로필 ──────────────────────────────────────────
-- 온보딩 6문항의 답과 산출된 스코어. 1:1이므로 user_id가 곧 PK다.
create table if not exists public.user_profiles (
  user_id         uuid primary key references auth.users(id) on delete cascade,

  seed_money      bigint      not null default 0,
  monthly_invest  integer     not null default 0,
  horizon         text        not null check (horizon in ('short','mid','long')),
  target_return   text        not null check (target_return in ('deposit','inflation','aggressive')),
  drop20          text        not null check (drop20 in ('sell','hold','buy')),
  mdd_pct         integer     not null check (mdd_pct between 0 and 100),

  age             integer,
  monthly_income  bigint,

  -- 스코어는 코드가 계산해 넣는다. 여기 값을 사람이 손으로 고치지 말 것
  capacity_score  integer     not null check (capacity_score between 0 and 100),
  tolerance_score integer     not null check (tolerance_score between 0 and 100),
  risk_score      integer     not null check (risk_score between 0 and 100),

  literacy_level  text        not null default 'beginner',
  updated_at      timestamptz not null default now()
);

-- ── 리포트 ─────────────────────────────────────────────────
-- 수집 파이프라인이 넣는다. 모든 사용자가 읽지만 쓰지는 못한다.
create table if not exists public.reports (
  id           uuid primary key default gen_random_uuid(),
  title        text        not null,
  publisher    text        not null,
  analyst      text,
  published_at date        not null,
  summary      text[]      not null default '{}',
  excerpt      text,
  pdf_url      text,
  tags         text[]      not null default '{}',
  confidence   numeric(3,2) check (confidence between 0 and 1),
  -- 신뢰도 미달분은 검수 전까지 공개하지 않는다
  published    boolean     not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists reports_tags_idx on public.reports using gin (tags);
create index if not exists reports_date_idx on public.reports (published_at desc);

create table if not exists public.report_chunks (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports(id) on delete cascade,
  chunk_index integer not null,
  chunk_text  text    not null,
  embedding   vector(1536),
  unique (report_id, chunk_index)
);

-- ── 상품 · 파라미터 ────────────────────────────────────────
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  asset_class   text not null check (asset_class in ('cash','bond','etf')),
  expense_ratio numeric(5,3),
  credit_rating text
);

-- 보간 앵커 · 현금 하한 · 조정 한도. 코드 배포 없이 튜닝하려고 테이블로 뺐다.
create table if not exists public.allocation_params (
  param_key   text primary key,
  param_value numeric not null,
  note        text
);

insert into public.allocation_params (param_key, param_value, note) values
  ('cash_floor',       5,    '현금성 하한(%). 비상금 명목으로 선차감'),
  ('adjust_cap_pp',   10,    '3단계 조정 한도(±%p)'),
  ('etf_share_at_0',   0.05, 'risk 0일 때 잔여분 중 위험자산 비율'),
  ('etf_share_at_100', 0.95, 'risk 100일 때 잔여분 중 위험자산 비율'),
  ('capacity_weight',  0.4,  'risk_score 배합 — 객관'),
  ('tolerance_weight', 0.6,  'risk_score 배합 — 주관')
on conflict (param_key) do nothing;

-- ── 포트폴리오 ─────────────────────────────────────────────
-- 기준(baseline)과 조정(adjusted)을 둘 다 남긴다. 무엇이 왜 움직였는지
-- 되돌려 설명하지 못하면 이 서비스의 근거는 증명되지 않는다.
create table if not exists public.portfolios (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  baseline_weights    jsonb not null,
  adjusted_weights    jsonb,
  adjustment_evidence jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists portfolios_user_idx on public.portfolios (user_id, created_at desc);

create table if not exists public.portfolio_items (
  portfolio_id        uuid not null references public.portfolios(id) on delete cascade,
  product_id          uuid not null references public.products(id),
  weight_pct          numeric(5,2) not null,
  -- 근거 연결 — 이 서비스의 심장. NULL이면 화면에 내보내지 않는다
  evidence_report_id  uuid references public.reports(id),
  primary key (portfolio_id, product_id)
);

-- ── 알림 · 대화 ────────────────────────────────────────────
create table if not exists public.notifications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  type               text not null check (type in ('정보','제안')),
  title              text not null,
  body               text,
  -- 근거 없는 알림은 만들지 않는다
  evidence_report_id uuid not null references public.reports(id),
  read               boolean not null default false,
  created_at         timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  conversation  uuid not null,
  role          text not null check (role in ('user','agent')),
  content       text not null,
  cited_reports jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists chat_user_idx on public.chat_messages (user_id, conversation, created_at);

-- ── 관리자 ─────────────────────────────────────────────────
-- 역할을 auth.users의 metadata에 두면 사용자가 스스로 고칠 수 있는 경로가
-- 생긴다. 별도 테이블에 두고 서비스 키로만 넣는다.
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  added_at   timestamptz not null default now(),
  note       text
);
