import Foundation

/// Describes an on-device model bundled with the app. Phase 2 adds concrete denoise/portrait models;
/// later versions register additional models (presets, sky segmentation) the same way.
public struct ModelDescriptor: Sendable, Hashable, Codable {
    public enum Task: String, Sendable, Codable { case denoise, portraitRetouch, faceDetection }

    public let identifier: String
    public let task: Task
    public let version: String
    /// Weight quantization in bits (MVP requirement: 4-bit).
    public let quantizationBits: Int
    /// Weights file name inside the app bundle's `Models` folder (.safetensors).
    public let weightsFileName: String

    public init(identifier: String, task: Task, version: String, quantizationBits: Int = 4, weightsFileName: String) {
        self.identifier = identifier
        self.task = task
        self.version = version
        self.quantizationBits = quantizationBits
        self.weightsFileName = weightsFileName
    }
}

/// Lifecycle contract for MLX-backed models: load lazily, unload when idle to free unified memory.
public protocol InferenceModel: AnyObject, Sendable {
    var descriptor: ModelDescriptor { get }
    var isLoaded: Bool { get }
    func load(from modelsDirectory: URL) throws
    func unload()
}
