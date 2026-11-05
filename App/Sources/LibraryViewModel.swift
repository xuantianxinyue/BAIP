import AIEngine
import CoreGraphics
import CoreModels
import Foundation
import RawDecoding

/// UI state for the imported photo list. All decoding runs off the main actor; only results are published.
@MainActor
final class LibraryViewModel: ObservableObject {
    struct Item: Identifiable {
        var asset: PhotoAsset
        var thumbnail: CGImage?
        var error: String?
        var id: UUID { asset.id }
    }

    @Published private(set) var items: [Item] = []
    @Published var selection: UUID?
    @Published private(set) var selfTestReport: String?
    @Published private(set) var isRunningSelfTest = false

    private let decoder: any ImageDecoder

    init(decoder: any ImageDecoder = DecoderRouter()) {
        self.decoder = decoder
    }

    var selectedItem: Item? { items.first { $0.id == selection } }

    /// Input: user-selected file URLs (security-scoped in the sandbox). Unsupported extensions are ignored.
    func importFiles(_ urls: [URL]) {
        let newAssets = urls.compactMap(PhotoAsset.init(url:))
        items.append(contentsOf: newAssets.map { Item(asset: $0) })
        if selection == nil { selection = newAssets.first?.id }
        for asset in newAssets { loadMetadata(for: asset) }
    }

    private func loadMetadata(for asset: PhotoAsset) {
        let decoder = self.decoder
        Task.detached(priority: .userInitiated) {
            let scoped = asset.url.startAccessingSecurityScopedResource()
            defer { if scoped { asset.url.stopAccessingSecurityScopedResource() } }
            do {
                let exif = try decoder.readMetadata(at: asset.url)
                let thumb = try decoder.embeddedPreview(at: asset.url, maxPixelSize: 1024)
                await self.update(asset.id) { $0.asset.exif = exif; $0.thumbnail = thumb }
            } catch {
                await self.update(asset.id) { $0.error = error.localizedDescription }
            }
        }
    }

    private func update(_ id: UUID, _ change: (inout Item) -> Void) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        change(&items[index])
    }

    func runMLXSelfTest() {
        isRunningSelfTest = true
        Task.detached(priority: .userInitiated) {
            let report = MLXSelfTest.run()
            await MainActor.run {
                self.selfTestReport = report.summary
                self.isRunningSelfTest = false
            }
        }
    }
}
