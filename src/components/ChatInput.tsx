import { useState } from 'react'
import type { AgentPresetInfo, PickedFile } from '../../shared/types'
import ModelDisplay from './ModelDisplay'
import type { ModelGroup } from '../../shared/types'

interface Props {
  onSend: (text: string, files: PickedFile[]) => void
  disabled: boolean
  running: boolean
  // 模型
  modelGroups: ModelGroup[]
  selection: { provider: string; model: string } | null
  onSelectModel: (provider: string, model: string) => void
  // 模式
  presets: AgentPresetInfo[]
  mode: string
  onSelectMode: (mode: string) => void
  // 工作区
  workspaceCwd: string | null
  onChangeWorkspace: () => void
  // API Key 提示
  apiKeyMissing: boolean
  onOpenSettings: () => void
  // 附件
  attachments: PickedFile[]
  onAddFiles: (files: PickedFile[]) => void
  onRemoveFile: (path: string) => void
}

function workspaceName(cwd: string | null): string {
  if (!cwd) return '未选择工作区'
  const parts = cwd.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || cwd
}

export default function ChatInput({
  onSend,
  disabled,
  running,
  modelGroups,
  selection,
  onSelectModel,
  presets,
  mode,
  onSelectMode,
  workspaceCwd,
  onChangeWorkspace,
  apiKeyMissing,
  onOpenSettings,
  attachments,
  onAddFiles,
  onRemoveFile,
}: Props) {
  const [text, setText] = useState('')
  const [fileMsg, setFileMsg] = useState<string | null>(null)

  const submit = () => {
    const value = text.trim()
    if ((!value && attachments.length === 0) || disabled) return
    onSend(value, attachments)
    setText('')
    attachments.forEach((f) => onRemoveFile(f.path))
  }

  const MAX_FILE_MB = 50
  const MAX_FILES = 10

  const pickFiles = async () => {
    setFileMsg(null)
    const res = await window.harness.pickFiles()
    if (!res.ok) {
      setFileMsg(res.error?.message ?? '添加文件失败')
      return
    }
    const picked = res.value!
    if (picked.length === 0) return
    // 数量限制
    if (attachments.length + picked.length > MAX_FILES) {
      setFileMsg(`附件最多 ${MAX_FILES} 个`)
      return
    }
    // 单文件大小限制（前端兜底；主进程 files:pick 已校验，这里防御）
    const tooBig = picked.find((f) => (f.size ?? 0) > MAX_FILE_MB * 1024 * 1024)
    if (tooBig) {
      setFileMsg(`文件「${tooBig.name}」过大，最大 ${MAX_FILE_MB}MB`)
      return
    }
    onAddFiles(picked)
  }

  return (
    <div className="chat-input-bar">
      {attachments.length > 0 && (
        <div className="attachment-row">
          {attachments.map((f) => (
            <span key={f.path} className="attachment-chip" title={f.path}>
              <span className="attachment-icon">{f.data ? '图' : '文'}</span>
              <span className="attachment-name">{f.name}</span>
              <button
                className="attachment-remove"
                onClick={() => onRemoveFile(f.path)}
                title="移除"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <textarea
        className="chat-input"
        placeholder={running ? 'Agent 工作中…' : '输入消息，Enter 发送，Shift+Enter 换行'}
        value={text}
        disabled={running}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        rows={3}
      />

      <div className="chat-input-toolbar">
        <div className="chat-input-toolbar-left">
          <button
            className="toolbar-chip workspace-chip"
            onClick={onChangeWorkspace}
            title={workspaceCwd ? `切换工作区（当前：${workspaceCwd}）` : '选择工作区文件夹'}
          >
          <span className="toolbar-text">{workspaceName(workspaceCwd)}</span>
          </button>
          <div className="toolbar-chip mode-select-wrap">
            <select
              className="mode-select"
              value={mode}
              onChange={(e) => onSelectMode(e.target.value)}
              title={presets.find((p) => p.id === mode)?.description}
            >
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="chat-input-toolbar-right">
          {apiKeyMissing && (
            <button className="key-missing-hint" onClick={onOpenSettings} title="未配置 API Key，点击打开设置">
              <span>未配置 API Key</span>
            </button>
          )}
          {modelGroups.length > 0 && (
            <ModelDisplay groups={modelGroups} selection={selection} onSelect={onSelectModel} />
          )}
          <button className="add-file-btn" onClick={pickFiles} title="添加文件">
            +
          </button>
          <button className="btn primary send-btn" onClick={submit} disabled={disabled || running}>
            发送
          </button>
        </div>
      </div>
      {fileMsg && <div className="chat-input-err">{fileMsg}</div>}
    </div>
  )
}
