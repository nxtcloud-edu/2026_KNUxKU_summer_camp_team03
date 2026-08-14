-- ============================================================
-- Quill · Row Level Security 정책
--
-- ⚠ 이 파일이 이 프로젝트의 실제 보안이다.
--
--   anon 키는 브라우저에 그대로 노출된다. 숨길 방법도 없고 숨길 필요도 없다.
--   대신 "이 키로 무엇을 할 수 있는가"를 DB가 정한다. 그게 RLS다.
--   RLS를 켜지 않으면 anon 키를 주운 사람이 모든 사용자의 시드머니와
--   대화 기록을 읽을 수 있다. 로그인 있는 무방비는 로그인 없는 무방비보다
--   위험하다 — 안전하다고 믿게 만들기 때문이다.
--
-- schema.sql을 실행한 뒤 반드시 이 파일을 이어서 실행할 것.
--
-- 확인 방법: Supabase 대시보드 → Table Editor에서 각 테이블에
--           "RLS enabled" 배지가 붙어 있어야 한다.
-- ============================================================

-- ── 전 테이블 RLS 켜기 ─────────────────────────────────────
-- 정책을 하나도 안 만든 상태에서 RLS를 켜면 '전부 거부'가 된다.
-- 그게 올바른 기본값이다. 필요한 통로만 아래에서 연다.
alter table public.user_profiles    enable row level security;
alter table public.reports          enable row level security;
alter table public.report_chunks    enable row level security;
alter table public.products         enable row level security;
alter table public.allocation_params enable row level security;
alter table public.portfolios       enable row level security;
alter table public.portfolio_items  enable row level security;
alter table public.notifications    enable row level security;
alter table public.chat_messages    enable row level security;
alter table public.admins           enable row level security;

-- ── 관리자 판별 ────────────────────────────────────────────
-- 정책 안에서 admins를 직접 조회하면 그 조회에도 RLS가 걸려 무한 재귀가 된다.
-- security definer 함수로 한 번 감싸 그 고리를 끊는다.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

-- ── 내 것만 읽고 쓴다 ──────────────────────────────────────
-- user_profiles / portfolios / notifications / chat_messages는
-- 전부 같은 규칙이다: auth.uid()와 user_id가 같을 때만.

create policy "본인 프로필 조회" on public.user_profiles
  for select using (auth.uid() = user_id);
create policy "본인 프로필 생성" on public.user_profiles
  for insert with check (auth.uid() = user_id);
create policy "본인 프로필 수정" on public.user_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "본인 포트폴리오 조회" on public.portfolios
  for select using (auth.uid() = user_id);
create policy "본인 포트폴리오 생성" on public.portfolios
  for insert with check (auth.uid() = user_id);
create policy "본인 포트폴리오 삭제" on public.portfolios
  for delete using (auth.uid() = user_id);

-- 항목은 상위 포트폴리오의 주인을 따라간다
create policy "본인 포트폴리오 항목 조회" on public.portfolio_items
  for select using (
    exists (
      select 1 from public.portfolios p
      where p.id = portfolio_items.portfolio_id and p.user_id = auth.uid()
    )
  );
create policy "본인 포트폴리오 항목 생성" on public.portfolio_items
  for insert with check (
    exists (
      select 1 from public.portfolios p
      where p.id = portfolio_items.portfolio_id and p.user_id = auth.uid()
    )
  );

create policy "본인 알림 조회" on public.notifications
  for select using (auth.uid() = user_id);
-- 읽음 표시만 허용한다. 알림 내용을 사용자가 고칠 수 있으면 근거가 흔들린다
create policy "본인 알림 읽음 처리" on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "본인 대화 조회" on public.chat_messages
  for select using (auth.uid() = user_id);
create policy "본인 대화 저장" on public.chat_messages
  for insert with check (auth.uid() = user_id);
create policy "본인 대화 삭제" on public.chat_messages
  for delete using (auth.uid() = user_id);

-- ── 공용 자료 — 읽기만 ─────────────────────────────────────
-- 리포트는 검수를 통과해 공개된 것만 보인다. 보류분이 새 나가면
-- 관리자 콘솔의 '보류' 기능이 무의미해진다.
create policy "공개 리포트 조회" on public.reports
  for select using (published = true or public.is_admin());

create policy "공개 리포트 청크 조회" on public.report_chunks
  for select using (
    exists (
      select 1 from public.reports r
      where r.id = report_chunks.report_id and (r.published = true or public.is_admin())
    )
  );

create policy "상품 조회" on public.products for select using (true);
create policy "파라미터 조회" on public.allocation_params for select using (true);

-- ── 관리자만 쓴다 ──────────────────────────────────────────
-- 수집 파이프라인은 service_role 키로 붙으므로 RLS를 우회한다.
-- 아래는 사람이 관리자 콘솔에서 손대는 경로다.
create policy "관리자 리포트 수정" on public.reports
  for update using (public.is_admin()) with check (public.is_admin());
create policy "관리자 상품 수정" on public.products
  for all using (public.is_admin()) with check (public.is_admin());
create policy "관리자 파라미터 수정" on public.allocation_params
  for all using (public.is_admin()) with check (public.is_admin());

-- 관리자 명단은 본인 여부만 확인할 수 있다. 명단 전체는 못 본다
create policy "본인 관리자 여부 확인" on public.admins
  for select using (auth.uid() = user_id);

-- ⚠ admins 테이블에는 insert/update/delete 정책을 만들지 않는다.
--   즉 어떤 로그인 사용자도 스스로를 관리자로 올릴 수 없다.
--   관리자 추가는 Supabase 대시보드나 service_role 키로만 한다:
--
--     insert into public.admins (user_id, note)
--     values ('여기에-auth.users의-uuid', '팀장');
