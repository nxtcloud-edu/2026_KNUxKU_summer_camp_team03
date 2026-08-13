/**
 * 상품 · 배분표
 *
 * 여기서 고친 배분은 고객 결과 화면에 바로 반영된다.
 * 합이 100%가 아니면 저장을 막는다 — 틀린 배분이 나가는 것보다 저장이 안 되는 편이 낫다.
 */
import { useMemo, useState } from 'react'
import {
  ASSET_META,
  ASSET_ORDER,
  PRODUCTS,
  type AssetKey,
} from '../lib/mock'
import { PROFILES, type ProfileKey } from '../lib/survey'
import { getAdmin, setAdmin, useAdmin } from '../lib/overrides'
import { pct, riskLabel } from '../lib/format'
import { AllocDonut } from '../components/Charts'
import { useToast } from '../components/ui'
import { IconAlert, IconCheck } from '../components/icons'

export default function AdminProducts() {
  const admin = useAdmin()
  const toast = useToast()
  const [key, setKey] = useState<ProfileKey>('neutral')

  const profile = PROFILES.find((p) => p.key === key)!
  const saved = admin.alloc[key] ?? profile.alloc
  const [draft, setDraft] = useState<Record<AssetKey, number>>(saved)

  // 성향을 바꾸면 그 성향의 저장값으로 초안을 다시 잡는다
  const [lastKey, setLastKey] = useState<ProfileKey>(key)
  if (lastKey !== key) {
    setLastKey(key)
    setDraft(admin.alloc[key] ?? PROFILES.find((p) => p.key === key)!.alloc)
  }

  const sum = ASSET_ORDER.reduce((s, k) => s + (draft[k] ?? 0), 0)
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const valid = sum === 100

  const expected = useMemo(() => {
    let v = 0
    for (const k of ASSET_ORDER) {
      const inAsset = PRODUCTS.filter((p) => p.asset === k)
      if (!inAsset.length || !draft[k]) continue
      const avg = inAsset.reduce((s, p) => s + p.expected - p.fee, 0) / inAsset.length
      v += (draft[k] / 100) * avg
    }
    return v
  }, [draft])

  const safe = draft.cash + draft.govShort + draft.govLong + draft.corp

  return (
    <div className="col gap-4">
      {/* ── 배분표 ────────────────────────────────── */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>성향별 자산 배분</h3>
            <div className="sub">고객 결과 화면에 그대로 나가는 값입니다</div>
          </div>
          <div className="tabs">
            {PROFILES.map((p) => (
              <button
                key={p.key}
                className="tab"
                aria-selected={key === p.key}
                onClick={() => setKey(p.key)}
              >
                {p.name}
                {admin.alloc[p.key] && <span style={{ color: 'var(--gold)' }}> ·</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="panel-body">
          <div className="row wrap gap-8" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 380px', minWidth: 320 }}>
              {ASSET_ORDER.map((k) => (
                <div key={k} className="row gap-3" style={{ padding: '9px 0' }}>
                  <span
                    className="alloc-swatch"
                    style={{ background: ASSET_META[k].color, flex: 'none' }}
                  />
                  <div style={{ width: 108, flex: 'none' }}>
                    <div className="small strong">{ASSET_META[k].label}</div>
                    <div className="xs faint truncate">{ASSET_META[k].note}</div>
                  </div>
                  <input
                    className="slider grow"
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={draft[k] ?? 0}
                    onChange={(e) =>
                      setDraft({ ...draft, [k]: Number(e.target.value) })
                    }
                  />
                  <span
                    className="num strong"
                    style={{ width: 46, textAlign: 'right', flex: 'none' }}
                  >
                    {draft[k] ?? 0}%
                  </span>
                </div>
              ))}

              <div
                className="row-between mt-4"
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--r-md)',
                  background: valid ? 'var(--ok-soft)' : 'var(--danger-soft)',
                }}
              >
                <span className="small strong" style={{ color: valid ? 'var(--ok)' : 'var(--danger)' }}>
                  {valid ? '합계 100% — 저장할 수 있습니다' : `합계 ${sum}% — 100%가 되어야 합니다`}
                </span>
                {!valid && (
                  <button
                    className="btn btn-sm btn-plain"
                    onClick={() => {
                      // 가장 큰 항목에서 차이를 흡수한다
                      const diff = 100 - sum
                      const biggest = [...ASSET_ORDER].sort(
                        (a, b) => (draft[b] ?? 0) - (draft[a] ?? 0)
                      )[0]
                      setDraft({
                        ...draft,
                        [biggest]: Math.max(0, (draft[biggest] ?? 0) + diff),
                      })
                    }}
                  >
                    자동 맞춤
                  </button>
                )}
              </div>
            </div>

            <div className="row gap-5 wrap" style={{ alignItems: 'center' }}>
              <AllocDonut alloc={draft} size={180} />
              <div className="col gap-4">
                <div>
                  <div className="xs faint">연 기대수익</div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 680 }}>
                    {pct(expected, 1)}
                  </div>
                </div>
                <div>
                  <div className="xs faint">안전자산 비중</div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 680 }}>
                    {safe}%
                  </div>
                </div>
                <div>
                  <div className="xs faint">연 변동 폭</div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 680 }}>
                    ±{profile.band}%
                  </div>
                </div>
              </div>
            </div>
          </div>

          {safe < 25 && (
            <div className="alert alert-warn mt-5">
              <IconAlert size={15} style={{ flex: 'none', marginTop: 2 }} />
              <div className="keep">
                안전자산이 {safe}%입니다. 이 서비스는 채권·ETF만 다루는 안전자산 중심
                서비스로 소개하고 있으니, 25% 아래로 내리면 그 약속과 어긋납니다.
              </div>
            </div>
          )}
        </div>

        <div className="panel-foot">
          {admin.alloc[key]
            ? '이 성향은 관리자가 손댄 값을 쓰고 있습니다.'
            : '기본값을 쓰고 있습니다.'}
        </div>
      </div>

      {dirty && (
        <div className="savebar">
          <IconAlert size={15} style={{ color: 'var(--gold-bright)', flex: 'none' }} />
          <span className="grow">
            {profile.name} 배분을 바꿨습니다. 저장하면 고객 결과 화면에 바로 반영됩니다.
          </span>
          <button
            className="btn btn-sm btn-ghost"
            style={{ color: '#f3ead8' }}
            onClick={() => setDraft(saved)}
          >
            되돌리기
          </button>
          <button
            className="btn btn-sm btn-primary"
            disabled={!valid}
            onClick={() => {
              const s = getAdmin()
              setAdmin({ alloc: { ...s.alloc, [key]: draft } })
              toast(`${profile.name} 배분을 저장했습니다`)
            }}
          >
            <IconCheck size={14} />
            저장
          </button>
        </div>
      )}

      {/* ── 상품 목록 ─────────────────────────────── */}
      <div className="panel">
        <div className="panel-head">
          <div>
            <h3>상품 마스터 {PRODUCTS.length}종</h3>
            <div className="sub">자산군별 대표 상품 · 근거 리포트가 없으면 추천에서 빠집니다</div>
          </div>
        </div>
        <div className="panel-body">
          <div className="table-wrap">
            <table className="table adm-table">
              <thead>
                <tr>
                  <th>상품</th>
                  <th>자산군</th>
                  <th>태그</th>
                  <th className="num-cell">기대</th>
                  <th className="num-cell">보수</th>
                  <th>위험</th>
                  <th className="num-cell">근거</th>
                  <th className="num-cell">현재 배분</th>
                </tr>
              </thead>
              <tbody>
                {PRODUCTS.map((p) => {
                  const inAsset = PRODUCTS.filter((x) => x.asset === p.asset).length
                  const w = Math.round((draft[p.asset] ?? 0) / inAsset)
                  return (
                    <tr key={p.id} style={w === 0 ? { opacity: 0.5 } : undefined}>
                      <td>
                        <div className="strong">{p.name}</div>
                        <div className="xs faint mono">{p.ticker}</div>
                      </td>
                      <td>
                        <span className="row gap-2">
                          <span
                            className="alloc-swatch"
                            style={{ background: ASSET_META[p.asset].color }}
                          />
                          <span className="small">{ASSET_META[p.asset].label}</span>
                        </span>
                      </td>
                      <td>
                        <span className="tag">{p.tag.split('-').join(' · ')}</span>
                      </td>
                      <td className="num-cell strong">{pct(p.expected, 2)}</td>
                      <td className="num-cell muted">
                        {p.fee > 0 ? pct(p.fee, 2) : '—'}
                      </td>
                      <td className="small muted">{riskLabel(p.risk)}</td>
                      <td className="num-cell">
                        {p.sources.length > 0 ? (
                          <span className="badge badge-brand">{p.sources.length}건</span>
                        ) : (
                          <span className="badge badge-danger">없음</span>
                        )}
                      </td>
                      <td className="num-cell strong">{w}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel-foot">
          자산군 비중은 그 안의 상품들에 균등 분배됩니다. 같은 자산군에 상품을 추가하면
          기존 상품의 배분이 그만큼 줄어듭니다.
        </div>
      </div>
    </div>
  )
}
