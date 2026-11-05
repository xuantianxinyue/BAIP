import CoreGraphics
import CoreImage
import CoreModels
import Foundation

/// Conversions between the pipeline's `DecodedImage` and system image types (CGImage / CIImage).
public enum ImageConverter {
    /// Shared Metal-backed Core Image context. Intermediates are not cached to keep memory flat in batches.
    public static let context = CIContext(options: [.cacheIntermediates: false, .useSoftwareRenderer: false])

    /// Input: 16-bit RGB `DecodedImage`. Output: 48-bpp sRGB CGImage (copies the pixel buffer once).
    public static func cgImage(from image: DecodedImage) -> CGImage? {
        guard image.channels == 3 else { return nil }
        let data = image.pixels.withUnsafeBytes { Data($0) } as CFData
        guard let provider = CGDataProvider(data: data) else { return nil }
        return CGImage(
            width: image.width, height: image.height, bitsPerComponent: 16, bitsPerPixel: 48,
            bytesPerRow: image.width * 6, space: CGColorSpace(name: CGColorSpace.sRGB)!,
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue | CGBitmapInfo.byteOrder16Little.rawValue),
            provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent)
    }

    /// Input: any CGImage + max edge. Output: Lanczos-downscaled copy (or the original if already small enough).
    public static func downscaled(_ image: CGImage, maxPixelSize: Int) -> CGImage? {
        let longEdge = max(image.width, image.height)
        guard longEdge > maxPixelSize else { return image }
        let scale = Double(maxPixelSize) / Double(longEdge)
        let filter = CIFilter(name: "CILanczosScaleTransform")!
        filter.setValue(CIImage(cgImage: image), forKey: kCIInputImageKey)
        filter.setValue(scale, forKey: kCIInputScaleKey)
        filter.setValue(1.0, forKey: kCIInputAspectRatioKey)
        guard let out = filter.outputImage else { return nil }
        return context.createCGImage(out, from: out.extent.integral)
    }
}
