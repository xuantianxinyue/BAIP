import AIEngine
import XCTest

final class MLXSelfTestTests: XCTestCase {
    func testSelfTestPassesOnGPU() {
        MLXRuntime.configure()
        let report = MLXSelfTest.run()
        print(report.summary)
        XCTAssertTrue(report.device.lowercased().contains("gpu"), report.device)
        XCTAssertTrue(report.passed, report.summary)
    }
}
