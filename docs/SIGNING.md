# macOS 代码签名 + 公证（harness-desktop）

> 上线硬门槛：没有签名/公证，用户安装时会看到"无法验证开发者"被系统拦截。
> 本文档指导你从零完成签名 + 公证。**证书私钥只走钥匙串/环境变量，绝不写进代码仓库。**

## 前置条件（一次性）

1. **注册 Apple Developer**：https://developer.apple.com/（个人 99 美元/年，企业组织 299 美元/年）
2. **创建 Developer ID Application 证书**：
   - Apple Developer 后台 → Certificates, Identifiers & Profiles → 新建证书
   - 类型选 **Developer ID Application**（用于 macOS 外部分发，不是 App Store）
3. **导出证书 + 私钥**（.p12）：
   - 钥匙串访问 → 选中刚装的证书 → 右键导出（含私钥）→ 得到 `DeveloperID.p12`
   - 导出时会要求设密码，记下这个密码

## 签名（本地构建）

### 方式 A：证书已导入钥匙串（推荐日常开发）
- electron-builder 会自动从钥匙串找到 Developer ID Application 证书签名，无需额外配置。
- 直接构建：
  ```bash
  pnpm build
  pnpm dist:mac
  ```

### 方式 B：通过环境变量（CI / 无钥匙串环境）
```bash
export CSC_LINK="/path/to/DeveloperID.p12"     # p12 证书文件路径
export CSC_KEY_PASSWORD="你的p12密码"           # 导出 p12 时设置的密码
pnpm build && pnpm dist:mac
```

### 关闭签名（开发构建，不加公证）
- 不设任何证书环境变量，且 `electron-builder.yml` 的 `mac.identity: null` 生效时 → 产物未签名（仅本地自测用）。

## 公证（Notarization）

electron-builder 的 `mac.notarize` 会在签名后自动提交 Apple 公证服务。
公证需要 Apple 开发者账号凭证，通过环境变量提供：

```bash
export APPLE_ID="your@apple.com"          # 你的 Apple ID
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # App 专用密码（不是登录密码）
export APPLE_TEAM_ID="ABCDE12345"          # 你的 Team ID（后台 Account 页可见）
pnpm build && pnpm dist:mac
```

- **App 专用密码**：https://appleid.apple.com → 登录与安全 → App 专用密码 → 生成
- 公证完成会自动 staple（把公证票据粘到 dmg/app 上），离线也能通过 Gatekeeper。

## 验证

### 签名验证
```bash
codesign --verify --deep --strict out/*.app
# 应输出：out/harness-desktop.app: valid on disk / satisfies its Designated Requirement
```

### 公证验证
```bash
spctl -a -vvv out/*.dmg
# 期望输出：source=Notarized Developer ID / accepted source=Notarized Developer ID
xcrun stapler validate out/*.app
# 期望输出：The staple validation succeeded
```

### 安装验证
- 双击 dmg → 拖入 Applications → 首次打开无"无法验证开发者"拦截。

## 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| `identity: null` 生效但想签名 | 配置里显式禁用了 | 删掉 `mac.identity` 行或设为环境变量 |
| 签名报 `no identity found` | 证书没导入钥匙串 | 导入 Developer ID 证书 + 私钥 |
| 公证报 `APPLE_ID` 错误 | 用登录密码而非专用密码 | 生成 App 专用密码 |
| 公证慢（几分钟） | Apple 服务排队 | 耐心等，或用 `notarize` 的 `timeout` 配置 |
| 打包后无法加载 dsh | after-pack 未跑 | 确认 `afterPack: scripts/after-pack.mjs` 生效 |

## CI 参考（GitHub Actions）

```yaml
- name: Build & sign & notarize
  env:
    CSC_LINK: ${{ secrets.CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  run: pnpm install && pnpm build && pnpm dist:mac
```

## 当前状态（017）

- 配置就绪：`electron-builder.yml` 含 `mac.notarize` + 环境变量签名。
- 尚未配置真实证书 → 当前产物**未签名**（`identity: null` 生效），安装会提示"无法验证开发者"。
- 拿到证书后按上文「签名」+「公证」两步即可产出可公开分发的 dmg。
