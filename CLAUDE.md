# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目与分支

BAIP（Batch AI Image Processing）：纯前端、完全离线的 RAW AI 批处理修图工具。本仓库的 Web 版是浏览器应用（Next.js 16 App Router + React 19 + TS 5.9 + Tailwind 4，由 `web-mvp` 分支的 Vite 版迁移而来）；Mac 原生版在分支 `devin/1793846216-phase1-env-setup`。

- 需求基准：`docs/MVP需求说明书.txt` 和 `docs/photography-ai-mvp-SKILL.txt`。这两份是按 macOS 原生栈（SwiftUI / LibRaw / MLX）写的，Web 版把它们映射为 libraw-wasm / onnxruntime-web / Canvas。功能范围和验收指标以这两份为准。
- Web 版阶段计划和已知风险见 `docs/web-plan.md`。开发严格分阶段推进，上一阶段自检通过后才能进入下一阶段。当前在第一阶段：1.1–1.4 已完成，1.6「基础查看与文件管理」已实现并经手动测试、`e2e/phase1_6.spec.ts` 尚未全部跑通；第二阶段（Worker 化解码、降噪、人脸轻修、批处理队列、导出）尚未开始。
- MVP 范围红线：只做批量导入、RAW 解析、AI 降噪、人像轻修、前后对比、批量队列、导出。**不做**调色 / HSL / 曲线、天空替换、物体移除、AI 打标检索、账号、云端、埋点、人脸参数微调面板。
- 性能指标必须量化报告（耗时 ms、内存），不要用主观描述。目标机：M1 8GB，Chrome / Safari。

## 常用命令

```bash
npm install
npm run dev                 # next dev（Turbopack），http://localhost:3000，已带 COOP/COEP 头
npm run typecheck           # tsc --noEmit
npm test                    # vitest，只跑 src/**/*.test.ts，node 环境
npx vitest run src/core/core.test.ts        # 单个单测文件
npx vitest run -t 'formats exposure'        # 按用例名过滤
npm run build               # next build（含类型检查）；npm start 运行产物
npx playwright install chromium && npm run test:e2e
npx playwright test -g 'AI self-test'       # 单个 e2e 用例
npm run samples             # 下载 RAW 样张到 Fixtures/raw（git 忽略）
npm run models:selftest     # 重新生成 public/models/*.onnx（需 pip install onnx==1.17.0）
```

- `predev` / `prebuild` 会先运行 `scripts/copy-vendor.mjs`，把 WASM 运行时复制到 `public/vendor/`。直接运行 `npx next dev` 会跳过这一步，导致运行时 404。
- e2e 用 `npm run build && next start --port 4173` 起服务（`reuseExistingServer: false`），所以每次都会重新完整构建，单用例超时 300 秒。
- 如果 `Fixtures/raw` 不存在，导入 / 解码两个 e2e 用例会自动 skip，只有 AI 自检用例会跑。
- `scripts/fetch_samples.sh` 最后一步用 macOS 的 `sips` 生成 JPG 样张，在 Linux 上这一步会失败（RAW 文件已经下载好了）。

## 架构

分层，依赖只能向下：`app → ui → batch → decoding / pipeline / ai → core`。每层通过各自的 `index.ts` 对外导出，跨层只从 `index.ts` 引用。

- `app/`：Next.js 入口。`ClientApp.tsx` 用 `next/dynamic` 加 `ssr: false` 加载 `ui/App`，整个应用只在客户端渲染（依赖 File / Worker / WASM / OffscreenCanvas）。不要引入 Server Components 数据获取、Server Actions 或 Route Handlers（应用必须是纯前端）。
- `core/`：纯数据模型和接口，无第三方依赖。`library.ts` 是导入 / 去重（`planImport`，不支持的文件直接丢弃）、排序 / 分组（`arrangeAssets`，返回分组和用于导航与范围选择的扁平 `order`）等纯函数；`orientation.ts` 处理 LibRaw `flip` 和 JPEG EXIF 方向。`publicUrl.ts` 负责处理 `NEXT_PUBLIC_BASE_PATH`，`importPublicModule()` 用来在运行时绕过打包器加载 `public/` 下的 ES 模块。关键接口在 `protocols.ts`：`ImageDecoder`（readMetadata / embeddedPreview / decode）、`ProcessingStage`（不可修改输入，接受 `AbortSignal`）、`DecodeError`（code 为 `unsupported | corrupt | failed`）。`DecodedImage` 是交错 RGB，8 或 16 bit。
- `decoding/`：`DecoderRouter` 根据 `classifyFile(扩展名)` 把文件分派给 `LibRawDecoder`（RAW）或 `BitmapDecoder`（JPG/PNG，浏览器原生解码；目前不解析 JPG 的 EXIF）。`LibRawDecoder` 在运行时从 `public/vendor/libraw/index.js` 加载 libraw-wasm（代码里只有 `import type`），每次调用都新建一个 LibRaw 实例（也就是一个 Web Worker），用完就 `dispose()`，确保下一个文件打开前，上一个文件占用的 WASM 堆已经释放。
- `pipeline/`：像素格式转换（16bit 转 RGBA8 时取高字节）和 OffscreenCanvas 预览编码。
- `ai/`：`ortRuntime.ts` 的 `getOrt()` 在运行时加载 `public/vendor/ort/ort.min.mjs`（非 bundle 版，因为包默认导出的 `ort.bundle.min.mjs` 会依赖打包器解析 wasm），并设置 `wasmPaths` 和线程数；`selfTest.ts` 跑环境自检（conv 推理走 wasm，有 WebGPU 时再跑一遍 webgpu；另跑 4bit `MatMulNBits`）。`selfTestSpec.ts` 和 `scripts/make_selftest_models.py` 用同一套公式生成模型和期望值，**改其中一边必须同步改另一边**，然后重新生成 `.onnx`。
- `batch/`：目前只有 `BatchRunner` 接口（串行、流式事件、支持 signal 取消），实现留到第二阶段。
- `ui/`：`useLibrary` 维护导入列表，用单个 pump 队列逐张读取 EXIF、内嵌预览（≤1600px）和缩略图（≤240px），同一时间只持有一个 RAW 缓冲；移除时 revoke 对应的 objectURL。选择状态是纯 reducer（`selection.ts`，有单测）：`currentId`（大图）和 `selected`（勾选）分开，多选模式下点击只勾选、不换大图。`Viewer` 以照片 id 作为 key 挂载，换图即卸载：缩放复位、`useFullImage` 中止未完成的解码并释放原图 canvas。原图只在放大到超过预览分辨率时才解码。
- 方向：LibRaw 的元数据宽高和完整解码已按 `flip` 旋转；内嵌 JPEG 只有自带 EXIF 方向时浏览器才会自动转，否则由 `LibRawDecoder.embeddedPreview` 手动旋转。

## 必须遵守的约束

- **完全离线**：LibRaw / ORT 的 WASM 和模型都必须由应用自己提供，不能用 CDN，也不要用 `next/font/google` 之类会联网的功能。e2e 会断言没有任何请求发往 localhost 以外的地址。模型放在 `public/models/`，通过 `createSession(file)` 加载。
- **跨源隔离**：多线程 WASM 依赖 SharedArrayBuffer，所以 `next.config.ts` 的 `headers()` 给所有路径都配了 COOP/COEP，正式部署也必须带这两个头，否则 ORT 会退化成单线程（`numThreads = 1`）。
- **不要用普通 `import` 引入 `libraw-wasm` 或 `onnxruntime-web` 的运行时代码**（只允许 `import type`）。两者都通过 `new URL(..., import.meta.url)` 定位 worker / wasm，打包后路径会失效，所以统一从 `public/vendor/` 运行时加载。升级这两个包或改用其他构建产物时，要同步修改 `scripts/copy-vendor.mjs` 里的文件清单。
- **内存**：24MP 16bit 解码图约 144MB，WASM32 堆上限是 4GB。批处理必须按「解码 → 处理 → 导出 → 释放」流式进行，同一时间只保留一张解码图；`ImageBitmap` 用完要 `close()`。
- **e2e 契约**：`e2e/*.spec.ts` 依赖 UI 的 `data-testid` 和 data 属性（如 `asset-item` 的 `data-name` / `data-status` / `data-current` / `data-selected` / `data-capture`，`viewer-source`、`zoom-level`、`full-image`、`confirm-dialog`、`import-toast`）以及页面标题「RAW AI 批处理」，改 UI 时要同步改测试。1.6 的 e2e 会在 `Fixtures/folder-import/` 用硬链接生成文件夹样本。名称排序是自然排序（`Canon_5D…` 排在 `Canon_350D…` 前）。URL 带 `?e2e` 时会安装 `window.__decodeLastImport` 测试钩子（`ui/devHooks.ts`）。
- 应用必须在非安全上下文（用局域网 / 公网 IP 加 http 访问）下也能用，这时只是没有跨源隔离、ORT 退化为单线程。不要使用仅限安全上下文的 API（如 `crypto.randomUUID`、`navigator.clipboard`），否则功能会悄无声息地失效。
- UI 文案和错误信息用中文。TS 开启了 strict、`noUnusedLocals`、`noUnusedParameters`。
