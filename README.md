# RawAIBatch

macOS 原生本地 RAW AI 批处理修图工具（MVP）。纯离线，Apple Silicon（arm64），macOS 14.0+。

## 架构

```
App/                         SwiftUI 界面层（只依赖下层的协议和模型）
Packages/RawAICore/
  Sources/CoreModels         数据层：PhotoAsset / ExifInfo / DecodedImage / ImageDecoder、ProcessingStage 协议
  Sources/RawDecoding        LibRaw（静态链接）+ ImageIO 解码，DecoderRouter 按格式分发
  Sources/ImagePipeline      Core Image / Accelerate 图像转换
  Sources/AIEngine           MLX 运行时、内存上限、模型描述、自检
  Sources/BatchProcessing    批处理接口（流式：解码 → 各处理阶段 → 导出 → 释放）
  Binaries/CLibRaw.xcframework   由 Scripts/build_libraw.sh 生成（不提交到 git）
Scripts/                     bootstrap / build_libraw / fetch_samples
```

依赖方向：App → BatchProcessing → RawDecoding / ImagePipeline / AIEngine → CoreModels。
LibRaw 只出现在 RawDecoding 里，MLX 只出现在 AIEngine 里。

## 开发环境

```bash
./Scripts/bootstrap.sh        # 安装 xcodegen，检查 Metal 工具链，编译 LibRaw，生成 RawAIBatch.xcodeproj
./Scripts/fetch_samples.sh    # 可选：把测试用 RAW 样张下载到 Fixtures/raw
```

## 编译与测试

```bash
# 核心库单元测试（必须用 xcodebuild；直接 `swift build` 不会编译 MLX 的 Metal 着色器）
cd Packages/RawAICore && xcodebuild test -scheme RawAICore-Package -destination 'platform=macOS,arch=arm64'

# 编译 App
xcodebuild -project RawAIBatch.xcodeproj -scheme RawAIBatch -configuration Release ARCHS=arm64 build
```

## 隐私

App 开启沙盒，只申请 `files.user-selected.read-write` 权限，不申请网络权限（`network.client`）。
