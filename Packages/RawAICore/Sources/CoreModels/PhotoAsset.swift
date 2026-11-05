import Foundation

/// One imported file in the session.
public struct PhotoAsset: Identifiable, Sendable, Hashable {
    public let id: UUID
    public let url: URL
    public let format: ImageFormat
    public var exif: ExifInfo?

    public init(id: UUID = UUID(), url: URL, format: ImageFormat, exif: ExifInfo? = nil) {
        self.id = id
        self.url = url
        self.format = format
        self.exif = exif
    }

    /// Returns `nil` if the file extension is not supported.
    public init?(url: URL) {
        guard let format = ImageFormat(url: url) else { return nil }
        self.init(url: url, format: format)
    }

    public var fileName: String { url.lastPathComponent }

    public static func == (lhs: PhotoAsset, rhs: PhotoAsset) -> Bool { lhs.id == rhs.id }
    public func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
