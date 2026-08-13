/**
 * 필터 규칙
 *
 * 수집 파이프라인의 1차 관문. 여기서 정한 키워드가 하루 수집분의 3분의 2를 버린다.
 * 버리는 비율이 높은 것이 정상이고, 낮아지면 근거의 질이 먼저 떨어진다.
 */
import { useState } from 'react'
import { INGEST_DAYS } from '../lib/adminMock'
import { DEFAULT_RULES, getAdmin, setAdmin, useAdmin, type Rules } from '../lib/overrides'
import { useToast } from '../components/ui'
import { IconAlert, IconCheck, IconX } from '../components/icons'

export default function AdminRules() {
  const admin = useAdmin()
  const toast = useToast()
  const [draft, setDraft] = useState<Rules>(admin.rules)
  const [incInput, setIncInput] = useState('')
  const [excInput, setExcInput] = useState('')

  const dirty = JSON.stringify(draft) !== JSON.stringify(admin.rules)

  const add = (kind: 'include' | 'exclude', raw: string) => {
    const word = raw.trim()
    if (!word || draft[kind].includes(word)) return
    setDraft({ ...draft, [kind]: [...draft[kind], word] })
  }
  const remove = (kind: 'include' | 'exclude', word: string) =>
    setDraft({ ...draft, [kind]: draft[kind].filter((w) => w !== word) })

  const save = () => {
    setAdmin({ rules: draft })
    toast('규칙을 저장했습니다')
  }

  // 규칙을 느슨하게 하면 어떤 일이 벌어지는지 대략치로 보여 준다
  const avgFetched = Math.round(
    INGEST_DAYS.reduce((s, d) => s + d.fetched, 0) / INGEST_DAYS.length
  )
  const keywordFactor = Math.min(1, draft.include.length / DEFAULT_RULES.include.length)
  const estPass = Math.round(avgFetched * (0.34 * keywordFactor + 0.06))

  return (
    <div className="col gap-4">
      <div className="grid g2">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>포함 키워드</h3>
              <div className="sub">제목이나 요약에 하나라도 있어야 살아남습니다</div>
            </div>
            <span className="badge badge-brand">{draft.include.length}개</span>
          </div>
          <div className="panel-body">
            <div className="keyword-box">
              {draft.include.map((w) => (
                <span className="kw" key={w}>
                  {w}
                  <button onClick={() => remove('include', w)} aria-label={`${w} 삭제`}>
                    <IconX size={11} />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="row gap-2 mt-3"
              onSubmit={(e) => {
                e.preventDefault()
                add('include', incInput)
                setIncInput('')
              }}
            >
              <input
                className="input"
                style={{ height: 36 }}
                value={incInput}
                onChange={(e) => setIncInput(e.target.value)}
                placeholder="키워드 추가 후 Enter"
              />
              <button className="btn btn-sm btn-soft" disabled={!incInput.trim()}>
                추가
              </button>
            </form>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>제외 키워드</h3>
              <div className="sub">하나라도 있으면 그 자리에서 버립니다</div>
            </div>
            <span className="badge badge-neutral">{draft.exclude.length}개</span>
          </div>
          <div className="panel-body">
            <div className="keyword-box">
              {draft.exclude.map((w) => (
                <span className="kw" key={w}>
                  {w}
                  <button onClick={() => remove('exclude', w)} aria-label={`${w} 삭제`}>
                    <IconX size={11} />
                  </button>
                </span>
              ))}
            </div>
            <form
              className="row gap-2 mt-3"
              onSubmit={(e) => {
                e.preventDefault()
                add('exclude', excInput)
                setExcInput('')
              }}
            >
              <input
                className="input"
                style={{ height: 36 }}
                value={excInput}
                onChange={(e) => setExcInput(e.target.value)}
                placeholder="키워드 추가 후 Enter"
              />
              <button className="btn btn-sm btn-soft" disabled={!excInput.trim()}>
                추가
              </button>
            </form>
          </div>
          <div className="panel-foot">
            개별 종목 추천이나 공모주처럼 이 서비스가 다루지 않는 주제를 여기에 둡니다.
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>임계값</h3>
            <div className="sub">모델 태깅을 어디까지 믿을지</div>
          </div>
        </div>
        <div className="panel-body">
          <div className="grid g2 gap-8">
            <div>
              <div className="row-between mb-2">
                <span className="small strong">태깅 신뢰도 하한</span>
                <span className="num strong">{Math.round(draft.minConfidence * 100)}%</span>
              </div>
              <input
                className="slider"
                type="range"
                min={40}
                max={95}
                step={1}
                value={Math.round(draft.minConfidence * 100)}
                onChange={(e) =>
                  setDraft({ ...draft, minConfidence: Number(e.target.value) / 100 })
                }
              />
              <p className="xs faint keep" style={{ lineHeight: 1.8 }}>
                이 값 미만이면 자동 확정하지 않고 사람 검수 큐로 넘깁니다. 올리면 근거의
                질은 올라가지만 검수 부담이 커지고, 내리면 사람 손은 덜 가지만 엉뚱한
                태그가 붙은 리포트가 답변에 섞일 수 있습니다.
              </p>
            </div>

            <div>
              <div className="row-between mb-2">
                <span className="small strong">최소 쪽수</span>
                <span className="num strong">{draft.minPages}쪽</span>
              </div>
              <input
                className="slider"
                type="range"
                min={1}
                max={20}
                step={1}
                value={draft.minPages}
                onChange={(e) => setDraft({ ...draft, minPages: Number(e.target.value) })}
              />
              <p className="xs faint keep" style={{ lineHeight: 1.8 }}>
                이 쪽수 미만은 단신으로 보고 버립니다. 시황 속보처럼 근거로 삼기에는
                내용이 얇은 글을 걸러 내기 위한 장치입니다.
              </p>
            </div>
          </div>

          <div className="alert alert-info mt-6">
            <IconAlert size={15} style={{ flex: 'none', marginTop: 2 }} />
            <div className="keep">
              현재 규칙이면 하루 평균 <b>{avgFetched}건</b> 중 <b>약 {estPass}건</b>이 통과할
              것으로 보입니다. (포함 키워드 수에 따른 대략치입니다)
            </div>
          </div>
        </div>
      </div>

      {dirty && (
        <div className="savebar">
          <IconAlert size={15} style={{ color: 'var(--gold-bright)', flex: 'none' }} />
          <span className="grow">저장하지 않은 변경이 있습니다.</span>
          <button className="btn btn-sm btn-ghost" style={{ color: '#f3ead8' }} onClick={() => setDraft(admin.rules)}>
            되돌리기
          </button>
          <button className="btn btn-sm btn-primary" onClick={save}>
            <IconCheck size={14} />
            저장
          </button>
        </div>
      )}

      <div className="row-between">
        <span className="xs faint">
          기본값과 다른 항목은 관리자가 손댄 것으로 표시됩니다.
        </span>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setDraft(DEFAULT_RULES)
            setAdmin({ rules: DEFAULT_RULES })
            toast('기본값으로 되돌렸습니다')
          }}
          disabled={JSON.stringify(getAdmin().rules) === JSON.stringify(DEFAULT_RULES)}
        >
          기본값으로 초기화
        </button>
      </div>
    </div>
  )
}
