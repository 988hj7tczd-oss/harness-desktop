import { useId, useMemo } from 'react'
import faviconRaw from '../assets/brand/favicon.svg?raw'

/** 去掉 favicon 自带的 prefers-color-scheme style（改由渐变 fill 控制）。 */
function stripStyle(svg: string): string {
  return svg.replace(/<style>[\s\S]*?<\/style>/g, '')
}

/**
 * 生成一组随机且颜色多样的调色板：
 * 随机起始色相，然后沿色环均匀分布（带小幅抖动），保证颜色丰富、互不相同。
 */
function randomPalette(count: number): string[] {
  const startHue = Math.floor(Math.random() * 360)
  return Array.from({ length: count }, (_, i) => {
    const jitter = Math.floor(Math.random() * 14) - 7
    const h = (startHue + Math.round((i * 360) / count) + jitter + 360) % 360
    const s = 82 + Math.floor(Math.random() * 14) // 82-95%
    const l = 52 + Math.floor(Math.random() * 18) // 52-69%
    return `hsl(${h}, ${s}%, ${l}%)`
  })
}

/** 把一组颜色拼成 SMIL values（末尾回到首色保证循环平滑）。 */
function valuesOf(palette: string[]): string {
  return `${palette.join(';')};${palette[0]}`
}

/** 构造带随机渐变 defs 的鲸鱼 SVG（gradientId 需唯一，避免多实例冲突）。 */
function buildWhale(svg: string, gradientId: string): string {
  const N = 12 // 渐变中参与流动的颜色数量
  const palette = randomPalette(N)
  const dur = `${N * 1.1}s`
  const cycle = (shift: number) => valuesOf(palette.map((_, i) => palette[(i + shift) % N]))

  const defs = `<defs>
  <linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%"><animate attributeName="stop-color" values="${cycle(0)}" dur="${dur}" repeatCount="indefinite"/></stop>
    <stop offset="50%"><animate attributeName="stop-color" values="${cycle(4)}" dur="${dur}" repeatCount="indefinite"/></stop>
    <stop offset="100%"><animate attributeName="stop-color" values="${cycle(8)}" dur="${dur}" repeatCount="indefinite"/></stop>
  </linearGradient>
</defs>`

  let out = stripStyle(svg)
  out = out.replace(/(<svg[^>]*>)/, `$1${defs}`)
  out = out.replace('fill="#000"', `fill="url(#${gradientId})"`)
  return out
}

interface Props {
  className?: string
}

/**
 * 彩色渐变动态鲸鱼 logo（同款用于品牌区与聊天空状态）。
 * 渐变 id 按实例唯一，多个鲸鱼可同时存在、各自随机配色。
 */
export default function WhaleLogo({ className }: Props) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const gradientId = useMemo(() => `whale-grad-${rawId}`, [rawId])
  const html = useMemo(() => buildWhale(faviconRaw, gradientId), [gradientId])
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
