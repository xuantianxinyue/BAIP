import Foundation
import MLX

/// Process-wide MLX configuration and memory telemetry.
/// All AI stages must go through this type for memory limits so the app stays under the 6 GB peak budget on 8 GB M1.
public enum MLXRuntime {
    public struct MemoryStats: Sendable, Equatable {
        public let activeBytes: Int
        public let cacheBytes: Int
        public let peakBytes: Int
    }

    /// Input: byte limits. Caps MLX's buffer cache and soft memory limit (defaults: 512 MB cache, 3 GB limit),
    /// leaving headroom for LibRaw decode buffers and the UI.
    public static func configure(cacheLimitBytes: Int = 512 << 20, memoryLimitBytes: Int = 3 << 30) {
        Memory.cacheLimit = cacheLimitBytes
        Memory.memoryLimit = memoryLimitBytes
    }

    public static var memoryStats: MemoryStats {
        MemoryStats(activeBytes: Memory.activeMemory, cacheBytes: Memory.cacheMemory, peakBytes: Memory.peakMemory)
    }

    /// Releases cached MLX buffers; call between batch items.
    public static func releaseCache() { Memory.clearCache() }

    public static var defaultDeviceDescription: String { String(describing: Device.defaultDevice()) }
}
