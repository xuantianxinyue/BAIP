import Foundation

/// Camera metadata shown in the UI. All fields are optional because coverage differs per camera/format.
public struct ExifInfo: Sendable, Equatable, Codable {
    public var cameraMake: String?
    public var cameraModel: String?
    public var lensModel: String?
    public var iso: Int?
    /// Exposure time in seconds.
    public var exposureTime: Double?
    public var aperture: Double?
    public var focalLength: Double?
    public var captureDate: Date?
    /// Final (oriented) output size in pixels.
    public var pixelWidth: Int
    public var pixelHeight: Int
    /// EXIF orientation 1...8 (1 = up).
    public var orientation: Int

    public init(
        cameraMake: String? = nil, cameraModel: String? = nil, lensModel: String? = nil,
        iso: Int? = nil, exposureTime: Double? = nil, aperture: Double? = nil,
        focalLength: Double? = nil, captureDate: Date? = nil,
        pixelWidth: Int = 0, pixelHeight: Int = 0, orientation: Int = 1
    ) {
        self.cameraMake = cameraMake
        self.cameraModel = cameraModel
        self.lensModel = lensModel
        self.iso = iso
        self.exposureTime = exposureTime
        self.aperture = aperture
        self.focalLength = focalLength
        self.captureDate = captureDate
        self.pixelWidth = pixelWidth
        self.pixelHeight = pixelHeight
        self.orientation = orientation
    }

    public var megapixels: Double { Double(pixelWidth * pixelHeight) / 1_000_000 }

    /// "1/250 s" style shutter speed string.
    public var formattedExposure: String? {
        guard let t = exposureTime, t > 0 else { return nil }
        if t >= 1 { return String(format: "%.1f s", t) }
        return "1/\(Int((1 / t).rounded())) s"
    }
}
