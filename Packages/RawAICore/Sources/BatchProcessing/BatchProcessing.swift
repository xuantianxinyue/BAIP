import CoreModels
import Foundation

/// Configuration of one batch run: which stages to apply, in order. Stages are referenced by protocol,
/// so new stages added in later versions need no change here.
public struct BatchConfiguration: Sendable {
    public var stages: [any ProcessingStage]
    public var decodeOptions: DecodeOptions

    public init(stages: [any ProcessingStage] = [], decodeOptions: DecodeOptions = .full) {
        self.stages = stages
        self.decodeOptions = decodeOptions
    }
}

/// Per-item progress event emitted by a batch runner.
public enum BatchEvent: Sendable {
    case started(assetID: UUID)
    case finished(assetID: UUID, output: URL)
    case failed(assetID: UUID, message: String)
    case completed(succeeded: Int, failed: Int)
}

/// Contract for the batch engine (implemented in phase 2). Implementations must process images as a
/// stream (decode -> stages -> export -> release) so peak memory is independent of batch size.
public protocol BatchRunning: Sendable {
    func run(assets: [PhotoAsset], configuration: BatchConfiguration, outputDirectory: URL) -> AsyncStream<BatchEvent>
}
