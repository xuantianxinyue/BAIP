import CoreGraphics
import CoreModels
import Foundation
import ImageIO

/// Decoder for non-RAW inputs (JPEG/TIFF/HEIC/PNG) using the system ImageIO framework.
public final class ImageIODecoder: ImageDecoder, @unchecked Sendable {
    public init() {}

    public func canDecode(_ format: ImageFormat) -> Bool { !format.isRaw }

    public func readMetadata(at url: URL) throws -> ExifInfo {
        let src = try source(url)
        guard let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] else {
            throw DecodeError.decodeFailed(path: url.path, code: -1, message: "no image properties")
        }
        let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:]
        let tiff = props[kCGImagePropertyTIFFDictionary] as? [CFString: Any] ?? [:]
        let orientation = props[kCGImagePropertyOrientation] as? Int ?? 1
        var width = props[kCGImagePropertyPixelWidth] as? Int ?? 0
        var height = props[kCGImagePropertyPixelHeight] as? Int ?? 0
        if orientation >= 5 { swap(&width, &height) }

        var date: Date?
        if let s = exif[kCGImagePropertyExifDateTimeOriginal] as? String {
            let f = DateFormatter()
            f.locale = Locale(identifier: "en_US_POSIX")
            f.dateFormat = "yyyy:MM:dd HH:mm:ss"
            date = f.date(from: s)
        }
        return ExifInfo(
            cameraMake: (tiff[kCGImagePropertyTIFFMake] as? String)?.trimmingCharacters(in: .whitespaces),
            cameraModel: (tiff[kCGImagePropertyTIFFModel] as? String)?.trimmingCharacters(in: .whitespaces),
            lensModel: exif[kCGImagePropertyExifLensModel] as? String,
            iso: (exif[kCGImagePropertyExifISOSpeedRatings] as? [Int])?.first,
            exposureTime: exif[kCGImagePropertyExifExposureTime] as? Double,
            aperture: exif[kCGImagePropertyExifFNumber] as? Double,
            focalLength: exif[kCGImagePropertyExifFocalLength] as? Double,
            captureDate: date, pixelWidth: width, pixelHeight: height, orientation: orientation)
    }

    public func embeddedPreview(at url: URL, maxPixelSize: Int) throws -> CGImage? {
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageIfAbsent: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
            kCGImageSourceCreateThumbnailWithTransform: true,
        ]
        return CGImageSourceCreateThumbnailAtIndex(try source(url), 0, opts as CFDictionary)
    }

    /// Decodes to upright 16-bit sRGB RGB. `halfSize` halves both dimensions.
    public func decode(at url: URL, options: DecodeOptions) throws -> DecodedImage {
        let meta = try readMetadata(at: url)
        let maxEdge = max(meta.pixelWidth, meta.pixelHeight) / (options.halfSize ? 2 : 1)
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxEdge,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(try source(url), 0, opts as CFDictionary) else {
            throw DecodeError.decodeFailed(path: url.path, code: -1, message: "ImageIO decode failed")
        }
        return try Self.rgb16(from: cg, path: url.path)
    }

    /// Renders any CGImage into interleaved 16-bit sRGB RGB.
    static func rgb16(from cg: CGImage, path: String) throws -> DecodedImage {
        let w = cg.width, h = cg.height
        var rgbx = [UInt16](repeating: 0, count: w * h * 4)
        let ok = rgbx.withUnsafeMutableBytes { buf -> Bool in
            guard let ctx = CGContext(
                data: buf.baseAddress, width: w, height: h, bitsPerComponent: 16, bytesPerRow: w * 8,
                space: CGColorSpace(name: CGColorSpace.sRGB)!,
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue | CGBitmapInfo.byteOrder16Little.rawValue)
            else { return false }
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
            return true
        }
        guard ok else { throw DecodeError.decodeFailed(path: path, code: -1, message: "CGContext failed") }
        var rgb = [UInt16](repeating: 0, count: w * h * 3)
        rgb.withUnsafeMutableBufferPointer { dst in
            rgbx.withUnsafeBufferPointer { src in
                for i in 0..<(w * h) {
                    dst[i * 3] = src[i * 4]
                    dst[i * 3 + 1] = src[i * 4 + 1]
                    dst[i * 3 + 2] = src[i * 4 + 2]
                }
            }
        }
        return DecodedImage(width: w, height: h, channels: 3, pixels: rgb)
    }

    private func source(_ url: URL) throws -> CGImageSource {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary) else {
            throw DecodeError.fileOpenFailed(path: url.path, code: -1, message: "ImageIO cannot open file")
        }
        return src
    }
}
