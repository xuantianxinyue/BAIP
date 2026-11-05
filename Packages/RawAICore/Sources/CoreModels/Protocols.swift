import CoreGraphics
import Foundation

/// Reads metadata and pixels from an image file. Implementations must be thread-safe
/// (each call is independent) so batch processing can run them off the main thread.
public protocol ImageDecoder: Sendable {
    /// Returns `true` if this decoder can handle the given format.
    func canDecode(_ format: ImageFormat) -> Bool
    /// Reads EXIF/size metadata without decoding pixels (fast, < 50 ms for typical RAWs).
    func readMetadata(at url: URL) throws -> ExifInfo
    /// Returns the embedded preview/thumbnail if present (fast path for the thumbnail grid).
    func embeddedPreview(at url: URL, maxPixelSize: Int) throws -> CGImage?
    /// Full demosaic/decode to 16-bit RGB. Slow (seconds for 24MP RAW).
    func decode(at url: URL, options: DecodeOptions) throws -> DecodedImage
}

/// A single image-processing stage (AI denoise, portrait retouch, ...).
/// New stages (e.g. presets, sky replacement in later versions) plug in by conforming to this protocol
/// without touching the batch engine or UI.
public protocol ProcessingStage: Sendable {
    /// Stable identifier used in saved job configurations.
    var identifier: String { get }
    var displayName: String { get }
    func process(_ image: DecodedImage) async throws -> DecodedImage
}

public enum DecodeError: Error, Equatable, LocalizedError {
    case unsupportedFormat(String)
    case fileOpenFailed(path: String, code: Int32, message: String)
    case decodeFailed(path: String, code: Int32, message: String)
    case noEmbeddedPreview

    public var errorDescription: String? {
        switch self {
        case .unsupportedFormat(let ext): return "Unsupported format: \(ext)"
        case .fileOpenFailed(let path, let code, let msg): return "Cannot open \(path) (\(code)): \(msg)"
        case .decodeFailed(let path, let code, let msg): return "Decode failed for \(path) (\(code)): \(msg)"
        case .noEmbeddedPreview: return "No embedded preview"
        }
    }
}
