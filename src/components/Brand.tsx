import WhaleLogo from './WhaleLogo'

/**
 * 品牌区：彩色渐变动态鲸鱼 logo + "harness desktop" 字标。
 */
export default function Brand() {
  return (
    <div className="brand" title="harness desktop">
      <WhaleLogo className="brand-logo" />
      <span className="brand-wordmark">harness desktop</span>
    </div>
  )
}
