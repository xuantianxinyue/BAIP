import Foundation

/// Demosaiced, white-balanced RGB image in interleaved UInt16 (RGBRGB...), sRGB primaries, gamma-encoded.
/// This is the hand-off format between RawDecoding and ImagePipeline/AIEngine.
///
/// Performance note: a 24MP image is ~144 MB in this form. Keep at most a few alive at once
/// (batch processing must stream one image at a time to stay under the 6 GB peak-memory budget).
public struct DecodedImage: Sendable {
    public let width: Int
    public let height: Int
    public let channels: Int
    public let pixels: [UInt16]

    public init(width: Int, height: Int, channels: Int = 3, pixels: [UInt16]) {
        precondition(pixels.count == width * height * channels, "pixel buffer size mismatch")
        self.width = width
        self.height = height
        self.channels = channels
        self.pixels = pixels
    }

    public var byteCount: Int { pixels.count * MemoryLayout<UInt16>.size }
}

/// Decode options shared by all decoders.
public struct DecodeOptions: Sendable, Equatable {
    /// Half-size decode (2x2 binning, 4x fewer pixels). Used for fast previews.
    public var halfSize: Bool
    /// Use the camera's as-shot white balance.
    public var useCameraWhiteBalance: Bool

    public init(halfSize: Bool = false, useCameraWhiteBalance: Bool = true) {
        self.halfSize = halfSize
        self.useCameraWhiteBalance = useCameraWhiteBalance
    }

    public static let full = DecodeOptions()
    public static let preview = DecodeOptions(halfSize: true)
}
