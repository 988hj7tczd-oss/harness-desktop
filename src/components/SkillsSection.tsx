import { useCallback, useEffect, useState } from 'react'
import type { SkillInfo } from '../../shared/types'

const harness = window.harness

interface Props {
  sessionId: string | null
  suggestions: { type: string; count: number }[]
  onGenerateSkill: (sessionId: string, type: string) => void
}

/** 技能：浏览 dsh 技能目录 + 3 次同类任务后建议沉淀。 */
export default function SkillsSection({ sessionId, suggestions, onGenerateSkill }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([])

  const refresh = useCallback(async () => {
    if (!sessionId) {
      setSkills([])
      return
    }
    const res = await harness.listSkills(sessionId)
    if (res.ok) setSkills(res.value!)
  }, [sessionId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <section>
      <h3>技能</h3>
      <p className="hint" style={{ marginBottom: 8 }}>
        同类任务完成 3 次后可沉淀成技能，agent 下次直接用 /技能名 调用。
      </p>

      {suggestions.length > 0 && (
        <div className="skill-suggest">
          <div className="skill-suggest-title">建议沉淀技能</div>
          {suggestions.map((s) => (
            <div key={s.type} className="skill-suggest-item">
              <span>「{s.type}」已做 {s.count} 次</span>
              <button
                className="btn secondary small"
                disabled={!sessionId}
                onClick={() => sessionId && onGenerateSkill(sessionId, s.type)}
              >
                生成技能
              </button>
            </div>
          ))}
        </div>
      )}

      {skills.length > 0 && (
        <div className="skill-list">
          {skills.map((sk) => (
            <div key={sk.name} className="skill-item">
              <div className="skill-item-main">
                <span className="skill-name">/{sk.name}</span>
                <span className={`skill-tag ${sk.modelInvocable ? 'status-ok' : 'status-warn'}`}>
                  {sk.modelInvocable ? '模型可调用' : '仅手动'}
                </span>
                <span className="skill-desc">{sk.description}</span>
                {sk.whenToUse && <span className="skill-when mono">何时用：{sk.whenToUse}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {skills.length === 0 && suggestions.length === 0 && (
        <div className="empty-hint">
          <div>还没有沉淀的技能</div>
          <div className="hint">多做几个同类任务（完成 3 次），agent 会建议你提炼成技能。</div>
        </div>
      )}
    </section>
  )
}
