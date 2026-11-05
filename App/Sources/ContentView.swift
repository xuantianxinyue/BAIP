import CoreModels
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var library: LibraryViewModel
    @State private var showImporter = false
    @State private var showSelfTest = false

    private static let importTypes: [UTType] =
        [.rawImage, .jpeg, .tiff, .heic, .png] + ImageFormat.supportedExtensions.compactMap { UTType(filenameExtension: $0) }

    var body: some View {
        NavigationSplitView {
            List(library.items, selection: $library.selection) { item in
                HStack {
                    thumbnail(item.thumbnail).frame(width: 48, height: 36)
                    VStack(alignment: .leading) {
                        Text(item.asset.fileName).lineLimit(1)
                        Text(item.error ?? item.asset.format.rawValue.uppercased())
                            .font(.caption).foregroundStyle(item.error == nil ? Color.secondary : Color.red)
                    }
                }
            }
            .navigationSplitViewColumnWidth(min: 220, ideal: 260)
            .overlay { if library.items.isEmpty { Text("点击「导入」添加 RAW / JPG 文件").foregroundStyle(.secondary) } }
        } detail: {
            if let item = library.selectedItem {
                DetailView(item: item)
            } else {
                Text("未选择照片").foregroundStyle(.secondary)
            }
        }
        .toolbar {
            ToolbarItemGroup {
                Button { showImporter = true } label: { Label("导入", systemImage: "square.and.arrow.down") }
                Button {
                    showSelfTest = true
                    library.runMLXSelfTest()
                } label: { Label("MLX 自检", systemImage: "cpu") }
            }
        }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: Self.importTypes, allowsMultipleSelection: true) { result in
            if case .success(let urls) = result { library.importFiles(urls) }
        }
        .sheet(isPresented: $showSelfTest) { SelfTestSheet() }
    }

    @ViewBuilder private func thumbnail(_ image: CGImage?) -> some View {
        if let image {
            Image(decorative: image, scale: 1).resizable().aspectRatio(contentMode: .fit)
        } else {
            Rectangle().fill(.quaternary)
        }
    }
}

private struct DetailView: View {
    let item: LibraryViewModel.Item

    var body: some View {
        HSplitView {
            Group {
                if let image = item.thumbnail {
                    Image(decorative: image, scale: 1).resizable().aspectRatio(contentMode: .fit)
                } else {
                    ProgressView()
                }
            }
            .frame(minWidth: 320, maxWidth: .infinity, maxHeight: .infinity)
            .padding()

            Form {
                Section("EXIF") {
                    let e = item.asset.exif
                    row("相机", [e?.cameraMake, e?.cameraModel].compactMap { $0 }.joined(separator: " "))
                    row("镜头", e?.lensModel)
                    row("ISO", e?.iso.map(String.init))
                    row("快门", e?.formattedExposure)
                    row("光圈", e?.aperture.map { String(format: "f/%.1f", $0) })
                    row("焦距", e?.focalLength.map { String(format: "%.0f mm", $0) })
                    row("尺寸", e.map { String(format: "%d × %d (%.1f MP)", $0.pixelWidth, $0.pixelHeight, $0.megapixels) })
                    row("拍摄时间", e?.captureDate?.formatted(date: .abbreviated, time: .standard))
                }
            }
            .formStyle(.grouped)
            .frame(minWidth: 280, idealWidth: 300, maxWidth: 360)
        }
    }

    private func row(_ title: String, _ value: String?) -> some View {
        LabeledContent(title, value: (value?.isEmpty == false ? value : nil) ?? "—")
    }
}

private struct SelfTestSheet: View {
    @EnvironmentObject private var library: LibraryViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("MLX 环境自检").font(.headline)
            if library.isRunningSelfTest {
                ProgressView("运行中…")
            } else {
                Text(library.selfTestReport ?? "").font(.system(.body, design: .monospaced)).textSelection(.enabled)
            }
            HStack { Spacer(); Button("关闭") { dismiss() }.keyboardShortcut(.defaultAction) }
        }
        .padding(20)
        .frame(width: 560)
    }
}
