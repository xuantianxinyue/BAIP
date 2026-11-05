# BAIP — Batch AI Image Processing（Web MVP 分支）

纯前端、离线运行的 RAW AI 批处理修图工具（浏览器版）。Mac 原生版在分支 `devin/1793846216-phase1-env-setup`。
当前功能：导入文件 / 文件夹、底部缩略图条浏览、多选 / 排序 / 按格式分组 / 移除、缩放平移与按需加载原图、EXIF 展示、AI 环境自检。
功能需求与验收标准见 `docs/`（以两份基准文件为准），Web 版细化计划见 `docs/web-plan.md`。

## 技术栈
Next.js 16（App Router）+ React 19 + TypeScript 5.9 + Tailwind CSS 4 · RAW 解码 `libraw-wasm`（LibRaw 编译到 WASM，运行在 Web Worker）· AI 推理 `onnxruntime-web`

## 目录结构（依赖方向：ui → batch → decoding / pipeline / ai → core）
```
src/app/        Next.js App Router 入口（layout / page），App 仅在客户端渲染
src/core/       数据模型与接口：PhotoAsset / ExifInfo / DecodedImage / ImageDecoder / ProcessingStage（无第三方依赖）
src/decoding/   LibRawDecoder（libraw-wasm）、BitmapDecoder（JPG/PNG）、DecoderRouter
src/pipeline/   像素格式转换、预览编码（Canvas / OffscreenCanvas）
src/ai/         ONNX Runtime Web 运行时配置、AI 环境自检
src/batch/      批处理接口（流式：解码 → 处理阶段 → 导出 → 释放）
src/ui/         React 界面层，只依赖下层接口
public/models/  自检用 ONNX 模型（scripts/make_selftest_models.py 生成）
public/vendor/  LibRaw / ORT 的 WASM 运行时（scripts/copy-vendor.mjs 在 dev/build 前自动复制，git 忽略）
e2e/            Playwright 端到端验收测试
```

## 开发
```bash
npm install
npm run dev           # http://localhost:3000
npm run samples       # 可选：下载测试 RAW 样张到 Fixtures/raw（仅开发测试使用，App 本身不联网）
npm run typecheck && npm test && npm run build && npm start
npx playwright install chromium && npm run test:e2e
```

## 离线与隐私
所有 WASM（LibRaw、ONNX Runtime）和模型都由应用自身打包提供，不访问 CDN；e2e 测试会断言页面没有任何发往 localhost 以外的请求。
WASM 运行时不经过打包器，而是从 `public/vendor/` 以同源静态文件在运行时加载。
多线程 WASM 需要跨源隔离，`next.config.ts` 为 dev / `next start` 配置了 COOP/COEP 响应头，正式部署也必须带上这两个头。
