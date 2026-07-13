# AI-GM Standalone Windows 构建指南

## 概述

本文档描述了如何在 Linux 环境下交叉构建 AI-GM Standalone 的 Windows 桌面端产物。

## 构建目标

| 目标 | 文件名 | 说明 |
|------|--------|------|
| NSIS 安装包 | `AI-GM Standalone Setup 1.0.0.exe` | 可自定义安装路径的向导式安装程序 |
| Portable 便携版 | `AI-GM Standalone 1.0.0.exe` | 无需安装，解压即用的便携版本 |

## 构建环境要求

### Linux 宿主机

- Ubuntu 24.04 (x64)
- Node.js 20+
- npm 10+

### 必需依赖

```bash
# 64位 Wine（用于设置 exe 图标和版本信息）
sudo apt-get install wine64

# 32位 Wine（rcedit-ia32.exe 需要）
sudo dpkg --add-architecture i386
sudo apt-get update
sudo apt-get install wine32:i386

# NSIS（安装程序打包工具）
sudo apt-get install nsis
```

### Wine 初始化

首次构建前需要初始化 Wine 前缀：

```bash
rm -rf ~/.wine
WINEARCH=win64 winecfg
```

> 如果 winecfg 提示 X server 错误，可忽略（headless 环境不影响构建）。

## 构建配置

配置位于 `package.json` 的 `build` 字段中。

### Windows 特有配置

```json
"win": {
  "icon": "build/icons/icon.ico",
  "target": [
    { "target": "nsis", "arch": ["x64"] },
    { "target": "portable", "arch": ["x64"] }
  ],
  "verifyUpdateCodeSignature": false
}
```

### NSIS 安装器配置

```json
"nsis": {
  "oneClick": false,
  "allowToChangeInstallationDirectory": true,
  "installerIcon": "build/icons/icon.ico",
  "uninstallerIcon": "build/icons/icon.ico",
  "installerHeaderIcon": "build/icons/icon.ico",
  "createDesktopShortcut": true,
  "createStartMenuShortcut": true,
  "shortcutName": "AI-GM Standalone",
  "include": "build/nsis/installer.nsh",
  "license": "LICENSE.txt"
}
```

### 图标文件

| 文件 | 路径 | 尺寸 | 用途 |
|------|------|------|------|
| icon.ico | `build/icons/icon.ico` | 256x256, 48x48 (32bpp) | Windows 主图标 |
| icon.png | `build/icons/icon.png` | 512x512 (RGBA) | 通用 fallback |

> 使用 `build/generate-icons.cjs` 脚本可自动生成各尺寸图标。

## 构建命令

### 完整构建（含安装包）

```bash
npm run dist
# 或仅构建 Windows 目标
npx electron-builder --win --x64
```

### 仅生成未打包目录（调试用）

```bash
npx electron-builder --win --x64 --dir
```

产物位于 `dist-electron/win-unpacked/`。

### 构建产物清单

构建完成后，`dist-electron/` 目录包含：

```
dist-electron/
├── AI-GM Standalone Setup 1.0.0.exe      # NSIS 安装包
├── AI-GM Standalone Setup 1.0.0.exe.blockmap
├── AI-GM Standalone 1.0.0.exe           # Portable 便携版
├── win-unpacked/                         # 未打包目录
│   ├── AI-GM Standalone.exe             # 主程序
│   ├── *.dll                            # 系统依赖
│   ├── locales/                         # 语言文件
│   └── resources/                       # 应用资源（含 asar）
└── builder-debug.yml                     # 构建调试信息
```

## 已知问题与解决方案

### 1. rcedit 无法设置图标

**现象**：`could not load kernel32.dll, status c0000135`

**原因**：Wine 32 位支持未安装，rcedit-ia32.exe 无法运行。

**解决**：
```bash
sudo dpkg --add-architecture i386
sudo apt-get update
sudo apt-get install wine32:i386
rm -rf ~/.wine
WINEARCH=win64 winecfg
```

### 2. `verifyUpdateCodeSignature` 警告

**现象**：SmartScreen 可能拦截未签名应用。

**原因**：当前无 Windows 代码签名证书。

**解决**：
- 短期：用户需点击"更多信息"→"仍要运行"
- 长期：购买代码签名证书（如 Sectigo、DigiCert）并配置 `win.certificateFile` 和 `win.certificatePassword`

### 3. publisherName deprecated 警告

**现象**：`deprecated field publisherName`

**原因**：`publisherName` 已弃用，应使用 `signtoolOptions`。

**解决**：已更新配置，移除 `publisherName`，改为在获得签名证书后配置 `win.signtoolOptions`。

## 自动更新

Windows 版本支持 electron-updater 自动更新。配置位于 `build.publish`：

```json
"publish": {
  "provider": "github",
  "owner": "kings9527",
  "repo": "ai-gm-standalone",
  "releaseType": "release"
}
```

要求：GitHub Release 中包含 `latest.yml` 文件。

## 构建验证检查清单

- [ ] `build/icons/icon.ico` 存在且包含至少 256x256 和 48x48 尺寸
- [ ] `build/nsis/installer.nsh` 存在（NSIS 自定义脚本）
- [ ] `LICENSE.txt` 存在（NSIS 许可协议引用）
- [ ] Wine 已安装（含 32 位支持）
- [ ] NSIS 已安装
- [ ] 构建产物无错误退出（exit code 0）
- [ ] `dist-electron/win-unpacked/AI-GM Standalone.exe` 可执行
- [ ] NSIS 安装包和 Portable 版本均成功生成

## 相关文件

- `package.json` — 构建配置主入口
- `electron/main.cjs` — Electron 主进程入口
- `build/icons/` — 图标资源
- `build/nsis/installer.nsh` — NSIS 自定义安装脚本
- `build/generate-icons.cjs` — 图标生成工具

---

*文档版本：1.0.0*
*最后更新：2026-07-13*
