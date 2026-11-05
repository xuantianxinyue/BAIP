import CLibRaw
import CoreGraphics
import CoreImage
import CoreModels
import Foundation
import ImageIO

/// RAW decoder backed by LibRaw (statically linked, reentrant `libraw_r`).
///
/// Thread safety: stateless; every call opens its own `libraw_data_t`, so calls may run concurrently.
/// Memory note: a full 24MP decode peaks around ~0.5 GB inside LibRaw (raw buffer + 4-channel work image
/// + output copy). Callers doing batches must decode sequentially or with a small concurrency limit.
public final class LibRawDecoder: ImageDecoder, @unchecked Sendable {
    public init() {}

    public static var libRawVersion: String { String(cString: libraw_version()) }
    public static var supportedCameraCount: Int { Int(libraw_cameraCount()) }
    /// `true` if deflate-compressed DNG support (zlib) is compiled in.
    public static var hasZlibSupport: Bool {
        libraw_capabilities() & UInt32(LIBRAW_CAPS_ZLIB.rawValue) != 0
    }

    public func canDecode(_ format: ImageFormat) -> Bool { format.isRaw }

    /// Input: RAW file URL. Output: EXIF/size info. Only parses headers (no unpack), typically < 30 ms.
    public func readMetadata(at url: URL) throws -> ExifInfo {
        let handle = try LibRawHandle(url: url)
        return handle.exifInfo()
    }

    /// Input: RAW URL + max edge length. Output: embedded camera JPEG/bitmap preview, rotated upright,
    /// downscaled to `maxPixelSize`. Returns `nil` if the file has no embedded preview.
    public func embeddedPreview(at url: URL, maxPixelSize: Int) throws -> CGImage? {
        let handle = try LibRawHandle(url: url)
        guard libraw_unpack_thumb(handle.raw) == LIBRAW_SUCCESS.rawValue else { return nil }
        var err: Int32 = 0
        guard let thumb = libraw_dcraw_make_mem_thumb(handle.raw, &err) else { return nil }
        defer { libraw_dcraw_clear_mem(thumb) }

        let image: CGImage?
        let dataPtr = UnsafeRawPointer(thumb).advanced(by: MemoryLayout<libraw_processed_image_t>.offset(of: \.data)!)
        let size = Int(thumb.pointee.data_size)
        switch thumb.pointee.type {
        case LIBRAW_IMAGE_JPEG:
            let data = Data(bytes: dataPtr, count: size) as CFData
            guard let src = CGImageSourceCreateWithData(data, nil) else { return nil }
            let opts: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
                kCGImageSourceCreateThumbnailWithTransform: true,
            ]
            image = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
        case LIBRAW_IMAGE_BITMAP:
            image = Self.makeRGBImage(
                bytes: dataPtr, count: size, width: Int(thumb.pointee.width), height: Int(thumb.pointee.height),
                bitsPerComponent: Int(thumb.pointee.bits), components: Int(thumb.pointee.colors))
        default:
            image = nil
        }
        guard let image else { return nil }
        // Embedded previews are stored in sensor orientation; apply the RAW's flip.
        return OrientationTransform.apply(exifOrientation: handle.exifOrientation, to: image)
    }

    /// Input: RAW URL + options. Output: demosaiced 16-bit sRGB image (camera WB, AHD demosaic).
    /// Performance: dominated by demosaic; ~2-4 s for 24MP full size on M1, ~4x faster with `halfSize`.
    public func decode(at url: URL, options: DecodeOptions) throws -> DecodedImage {
        let handle = try LibRawHandle(url: url)
        let raw = handle.raw
        raw.pointee.params.output_bps = 16
        raw.pointee.params.use_camera_wb = options.useCameraWhiteBalance ? 1 : 0
        raw.pointee.params.half_size = options.halfSize ? 1 : 0
        raw.pointee.params.user_qual = 3  // AHD demosaic

        try handle.check(libraw_unpack(raw), stage: "unpack")
        try handle.check(libraw_dcraw_process(raw), stage: "process")

        var err: Int32 = 0
        guard let img = libraw_dcraw_make_mem_image(raw, &err) else {
            throw DecodeError.decodeFailed(path: url.path, code: err, message: String(cString: libraw_strerror(err)))
        }
        defer { libraw_dcraw_clear_mem(img) }
        // Free LibRaw's internal buffers before allocating our copy to lower the peak.
        libraw_recycle(raw)

        let width = Int(img.pointee.width), height = Int(img.pointee.height), colors = Int(img.pointee.colors)
        guard img.pointee.bits == 16, colors == 3 else {
            throw DecodeError.decodeFailed(path: url.path, code: -1, message: "unexpected output \(img.pointee.bits)bit/\(colors)ch")
        }
        let count = width * height * colors
        let src = UnsafeRawPointer(img).advanced(by: MemoryLayout<libraw_processed_image_t>.offset(of: \.data)!)
        let pixels = [UInt16](unsafeUninitializedCapacity: count) { buffer, initialized in
            memcpy(buffer.baseAddress!, src, count * MemoryLayout<UInt16>.size)
            initialized = count
        }
        return DecodedImage(width: width, height: height, channels: colors, pixels: pixels)
    }

    static func makeRGBImage(bytes: UnsafeRawPointer, count: Int, width: Int, height: Int,
                             bitsPerComponent: Int, components: Int) -> CGImage? {
        guard components == 3, bitsPerComponent == 8, count >= width * height * 3,
              let provider = CGDataProvider(data: Data(bytes: bytes, count: count) as CFData) else { return nil }
        return CGImage(
            width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 24, bytesPerRow: width * 3,
            space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
            provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }
}

/// RAII wrapper around `libraw_data_t*`.
final class LibRawHandle {
    let raw: UnsafeMutablePointer<libraw_data_t>
    let path: String

    init(url: URL) throws {
        path = url.path
        guard let ptr = libraw_init(0) else {
            throw DecodeError.fileOpenFailed(path: url.path, code: -1, message: "libraw_init failed")
        }
        raw = ptr
        let rc = libraw_open_file(ptr, url.path)
        if rc != LIBRAW_SUCCESS.rawValue {
            libraw_close(ptr)
            throw DecodeError.fileOpenFailed(path: url.path, code: rc, message: String(cString: libraw_strerror(rc)))
        }
    }

    deinit { libraw_close(raw) }

    func check(_ rc: Int32, stage: String) throws {
        guard rc == LIBRAW_SUCCESS.rawValue else {
            throw DecodeError.decodeFailed(path: path, code: rc, message: "\(stage): " + String(cString: libraw_strerror(rc)))
        }
    }

    /// LibRaw `flip` (0/3/5/6) -> EXIF orientation (1/3/8/6).
    var exifOrientation: Int {
        switch raw.pointee.sizes.flip {
        case 3: return 3
        case 5: return 8
        case 6: return 6
        default: return 1
        }
    }

    func exifInfo() -> ExifInfo {
        let d = raw.pointee
        var width = Int(d.sizes.width), height = Int(d.sizes.height)
        if d.sizes.flip & 4 != 0 { swap(&width, &height) }
        return ExifInfo(
            cameraMake: cString(d.idata.make),
            cameraModel: cString(d.idata.model),
            lensModel: cString(d.lens.Lens),
            iso: d.other.iso_speed > 0 ? Int(d.other.iso_speed.rounded()) : nil,
            exposureTime: d.other.shutter > 0 ? Double(d.other.shutter) : nil,
            aperture: d.other.aperture > 0 ? Double(d.other.aperture) : nil,
            focalLength: d.other.focal_len > 0 ? Double(d.other.focal_len) : nil,
            captureDate: d.other.timestamp > 0 ? Date(timeIntervalSince1970: TimeInterval(d.other.timestamp)) : nil,
            pixelWidth: width, pixelHeight: height, orientation: exifOrientation)
    }
}

/// Converts a fixed-size C char array (imported as a tuple) into a trimmed Swift string.
func cString<T>(_ tuple: T) -> String? {
    withUnsafeBytes(of: tuple) { raw in
        let s = String(decoding: raw.prefix { $0 != 0 }, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        return s.isEmpty ? nil : s
    }
}
