import Foundation

/// Input formats accepted by the importer. RAW formats are decoded by LibRaw, raster formats by ImageIO.
public enum ImageFormat: String, CaseIterable, Sendable, Codable {
    case cr2, cr3, nef, nrw, arw, srf, sr2, raf, orf, rw2, pef, dng, srw, threeFR = "3fr", iiq
    case jpeg, tiff, heic, png

    public var isRaw: Bool {
        switch self {
        case .jpeg, .tiff, .heic, .png: return false
        default: return true
        }
    }

    /// Maps a file extension (case-insensitive) to a supported format, or `nil` if unsupported.
    public init?(fileExtension ext: String) {
        switch ext.lowercased() {
        case "jpg", "jpeg": self = .jpeg
        case "tif", "tiff": self = .tiff
        case "heif", "heic": self = .heic
        default:
            guard let format = ImageFormat(rawValue: ext.lowercased()) else { return nil }
            self = format
        }
    }

    public init?(url: URL) {
        self.init(fileExtension: url.pathExtension)
    }

    /// All lowercase file extensions the app can import.
    public static var supportedExtensions: [String] {
        allCases.map(\.rawValue) + ["jpg", "tif", "heif"]
    }
}
