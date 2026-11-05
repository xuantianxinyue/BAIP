import Foundation
import MLX
import MLXNN

/// Result of the MLX environment self-check.
public struct MLXSelfTestReport: Sendable {
    public struct Check: Sendable {
        public let name: String
        public let passed: Bool
        public let milliseconds: Double
        public let detail: String
    }

    public let device: String
    public let checks: [Check]
    public let peakMemoryBytes: Int
    public var passed: Bool { checks.allSatisfy(\.passed) }

    public var summary: String {
        var lines = ["MLX device: \(device)"]
        for c in checks {
            lines.append("[\(c.passed ? "PASS" : "FAIL")] \(c.name) — \(String(format: "%.1f", c.milliseconds)) ms — \(c.detail)")
        }
        lines.append("Peak MLX memory: \(peakMemoryBytes / 1_048_576) MB")
        return lines.joined(separator: "\n")
    }
}

/// Tiny residual conv net with the same structure as an image denoiser (conv-relu-conv + skip).
/// Used only to prove that a conv inference graph compiles and runs on the GPU.
final class ResidualConvProbe: Module, UnaryLayer {
    @ModuleInfo var conv1: Conv2d
    @ModuleInfo var conv2: Conv2d

    init(channels: Int = 16) {
        conv1 = Conv2d(inputChannels: 3, outputChannels: channels, kernelSize: 3, padding: 1)
        conv2 = Conv2d(inputChannels: channels, outputChannels: 3, kernelSize: 3, padding: 1)
    }

    /// Input/Output: NHWC float tensor [N, H, W, 3].
    func callAsFunction(_ x: MLXArray) -> MLXArray {
        x + conv2(relu(conv1(x)))
    }
}

/// Runs a fixed set of deterministic MLX checks: dense matmul, 4-bit quantized matmul, conv inference.
public enum MLXSelfTest {
    /// Output: report with pass/fail + timing per check. Takes < 2 s on M1 (first call includes Metal kernel JIT).
    public static func run(imageSize: Int = 512) -> MLXSelfTestReport {
        var checks: [MLXSelfTestReport.Check] = []

        checks.append(measure("matmul 512x512") {
            let c = matmul(MLXArray.ones([512, 512]), MLXArray.ones([512, 512]))
            eval(c)
            let ok = (c .== 512).all().item(Bool.self)
            return (ok, "all elements == 512: \(ok)")
        })

        checks.append(measure("4-bit quantized matmul") {
            MLXRandom.seed(42)
            let w = MLXRandom.normal([256, 512])
            let x = MLXRandom.normal([8, 512])
            let q = quantized(w, groupSize: 64, bits: 4)
            let y = quantizedMatmul(x, q.wq, scales: q.scales, biases: q.biases, transpose: true, groupSize: 64, bits: 4)
            let wDeq = dequantized(q.wq, scales: q.scales, biases: q.biases, groupSize: 64, bits: 4)
            let ref = matmul(x, wDeq.T)
            let maxErr = abs(y - ref).max().item(Float.self)
            let ok = y.shape == [8, 256] && maxErr < 1e-2
            return (ok, String(format: "shape %@, max |err| vs dequantized %.2e", "\(y.shape)", maxErr))
        })

        checks.append(measure("conv inference \(imageSize)x\(imageSize)") {
            MLXRandom.seed(7)
            let model = ResidualConvProbe()
            let input = MLXRandom.uniform(low: 0, high: 1, [1, imageSize, imageSize, 3])
            let out = model(input)
            eval(out)
            let finite = !(isNaN(out).any().item(Bool.self) || isInf(out).any().item(Bool.self))
            let ok = out.shape == [1, imageSize, imageSize, 3] && finite
            return (ok, "output shape \(out.shape), finite: \(finite)")
        })

        let report = MLXSelfTestReport(
            device: MLXRuntime.defaultDeviceDescription, checks: checks, peakMemoryBytes: Memory.peakMemory)
        MLXRuntime.releaseCache()
        return report
    }

    private static func measure(_ name: String, _ body: () -> (Bool, String)) -> MLXSelfTestReport.Check {
        let start = DispatchTime.now().uptimeNanoseconds
        let (ok, detail) = body()
        let ms = Double(DispatchTime.now().uptimeNanoseconds - start) / 1e6
        return .init(name: name, passed: ok, milliseconds: ms, detail: detail)
    }
}
