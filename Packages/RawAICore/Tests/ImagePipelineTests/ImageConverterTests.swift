import CoreModels
import ImagePipeline
import XCTest

final class ImageConverterTests: XCTestCase {
    func testDecodedImageToCGImageAndDownscale() throws {
        let w = 400, h = 300
        var px = [UInt16](repeating: 0, count: w * h * 3)
        for i in 0..<(w * h) { px[i * 3] = UInt16(i % w * 65535 / (w - 1)) }
        let img = DecodedImage(width: w, height: h, pixels: px)
        let cg = try XCTUnwrap(ImageConverter.cgImage(from: img))
        XCTAssertEqual(cg.width, w)
        XCTAssertEqual(cg.bitsPerComponent, 16)
        let small = try XCTUnwrap(ImageConverter.downscaled(cg, maxPixelSize: 200))
        XCTAssertEqual(max(small.width, small.height), 200)
    }
}
