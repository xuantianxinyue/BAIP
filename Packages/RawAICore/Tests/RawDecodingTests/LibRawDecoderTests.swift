import CoreModels
import ImagePipeline
import RawDecoding
import XCTest

/// Uses sample files from `<repo>/Fixtures/raw` (fetched by Scripts/fetch_samples.sh, not committed).
final class LibRawDecoderTests: XCTestCase {
    static let fixtures = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().appendingPathComponent("../../../../Fixtures/raw").standardizedFileURL

    var samples: [URL] {
        let files = (try? FileManager.default.contentsOfDirectory(at: Self.fixtures, includingPropertiesForKeys: nil)) ?? []
        return files.filter { ImageFormat(url: $0) != nil }.sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    func testLibRawLinked() {
        print("LibRaw \(LibRawDecoder.libRawVersion), cameras: \(LibRawDecoder.supportedCameraCount), zlib: \(LibRawDecoder.hasZlibSupport)")
        XCTAssertTrue(LibRawDecoder.libRawVersion.hasPrefix("0.21"))
        XCTAssertGreaterThan(LibRawDecoder.supportedCameraCount, 1000)
        XCTAssertTrue(LibRawDecoder.hasZlibSupport)
    }

    func testMetadataAndPreviewForAllSamples() throws {
        let files = samples
        try XCTSkipIf(files.isEmpty, "No fixtures in \(Self.fixtures.path); run Scripts/fetch_samples.sh")
        let router = DecoderRouter()
        for url in files {
            let start = Date()
            let exif = try router.readMetadata(at: url)
            let metaMs = Date().timeIntervalSince(start) * 1000
            let preview = try router.embeddedPreview(at: url, maxPixelSize: 512)
            print(String(format: "%@ | %@ %@ | ISO %@ | %@ | f/%.1f | %.0fmm | %dx%d | lens: %@ | meta %.1f ms | preview %@",
                         url.lastPathComponent, exif.cameraMake ?? "-", exif.cameraModel ?? "-",
                         exif.iso.map(String.init) ?? "-", exif.formattedExposure ?? "-", exif.aperture ?? 0,
                         exif.focalLength ?? 0, exif.pixelWidth, exif.pixelHeight, exif.lensModel ?? "-", metaMs,
                         preview.map { "\($0.width)x\($0.height)" } ?? "none"))
            XCTAssertNotNil(exif.cameraMake, url.lastPathComponent)
            XCTAssertGreaterThan(exif.pixelWidth, 0, url.lastPathComponent)
            XCTAssertNotNil(preview, url.lastPathComponent)
        }
    }

    func testFullDecodeProducesRGB16() throws {
        let files = samples.filter { ImageFormat(url: $0)?.isRaw == true }
        try XCTSkipIf(files.isEmpty, "No RAW fixtures")
        let decoder = LibRawDecoder()
        for url in files {
            let start = Date()
            let img = try decoder.decode(at: url, options: .full)
            let secs = Date().timeIntervalSince(start)
            let meta = try decoder.readMetadata(at: url)
            print(String(format: "decode %@: %dx%d in %.2f s", url.lastPathComponent, img.width, img.height, secs))
            XCTAssertEqual(img.channels, 3)
            XCTAssertEqual(img.width, meta.pixelWidth, url.lastPathComponent)
            XCTAssertEqual(img.height, meta.pixelHeight, url.lastPathComponent)
            XCTAssertGreaterThan(img.pixels.max() ?? 0, 0)
            XCTAssertNotNil(ImageConverter.cgImage(from: img))
        }
    }
}
