import AIEngine
import SwiftUI

@main
struct RawAIBatchApp: App {
    @StateObject private var library = LibraryViewModel()

    init() {
        MLXRuntime.configure()
    }

    var body: some Scene {
        WindowGroup("RAW AI 批处理") {
            ContentView()
                .environmentObject(library)
                .frame(minWidth: 960, minHeight: 600)
        }
        .defaultSize(width: 1280, height: 800)
        .windowResizability(.contentMinSize)
    }
}
