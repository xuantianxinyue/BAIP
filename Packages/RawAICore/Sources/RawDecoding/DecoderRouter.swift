import CoreGraphics
import CoreModels
import Foundation

/// Routes each file to the first decoder that supports its format (LibRaw for RAW, ImageIO otherwise).
/// Additional decoders (e.g. a future Apple RAW fallback) can be appended without changing callers.
public struct DecoderRouter: ImageDecoder {
    public let decoders: [any ImageDecoder]

    public init(decoders: [any ImageDecoder] = [LibRawDecoder(), ImageIODecoder()]) {
        self.decoders = decoders
    }

    public func canDecode(_ format: ImageFormat) -> Bool { decoders.contains { $0.canDecode(format) } }

    public func readMetadata(at url: URL) throws -> ExifInfo { try decoder(for: url).readMetadata(at: url) }

    public func embeddedPreview(at url: URL, maxPixelSize: Int) throws -> CGImage? {
        try decoder(for: url).embeddedPreview(at: url, maxPixelSize: maxPixelSize)
    }

    public func decode(at url: URL, options: DecodeOptions) throws -> DecodedImage {
        try decoder(for: url).decode(at: url, options: options)
    }

    private func decoder(for url: URL) throws -> any ImageDecoder {
        guard let format = ImageFormat(url: url), let d = decoders.first(where: { $0.canDecode(format) }) else {
            throw DecodeError.unsupportedFormat(url.pathExtension)
        }
        return d
    }
}
