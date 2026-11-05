import CoreGraphics
import CoreImage
import ImageIO

enum OrientationTransform {
    private static let context = CIContext(options: [.cacheIntermediates: false])

    /// Rotates/flips `image` so that it displays upright for the given EXIF orientation (1...8).
    static func apply(exifOrientation: Int, to image: CGImage) -> CGImage {
        guard exifOrientation != 1, let orientation = CGImagePropertyOrientation(rawValue: UInt32(exifOrientation)) else {
            return image
        }
        let ci = CIImage(cgImage: image).oriented(orientation)
        return context.createCGImage(ci, from: ci.extent) ?? image
    }
}
