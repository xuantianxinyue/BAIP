// swift-tools-version: 5.9
import PackageDescription

// Layering (dependencies only point downward):
//   App (SwiftUI/AppKit)  ->  BatchProcessing  ->  RawDecoding / ImagePipeline / AIEngine  ->  CoreModels
// CoreModels has no third-party dependency; LibRaw is confined to RawDecoding and MLX to AIEngine.
let package = Package(
    name: "RawAICore",
    platforms: [.macOS(.v14)],
    products: [
        .library(name: "CoreModels", targets: ["CoreModels"]),
        .library(name: "RawDecoding", targets: ["RawDecoding"]),
        .library(name: "ImagePipeline", targets: ["ImagePipeline"]),
        .library(name: "AIEngine", targets: ["AIEngine"]),
        .library(name: "BatchProcessing", targets: ["BatchProcessing"]),
    ],
    dependencies: [
        .package(url: "https://github.com/ml-explore/mlx-swift", .upToNextMinor(from: "0.33.0")),
    ],
    targets: [
        // Built by Scripts/build_libraw.sh (static arm64, LibRaw 0.21.4).
        .binaryTarget(name: "CLibRaw", path: "Binaries/CLibRaw.xcframework"),

        .target(name: "CoreModels"),
        .target(
            name: "RawDecoding",
            dependencies: ["CoreModels", "CLibRaw"],
            linkerSettings: [.linkedLibrary("z"), .linkedLibrary("c++")]
        ),
        .target(name: "ImagePipeline", dependencies: ["CoreModels"]),
        .target(
            name: "AIEngine",
            dependencies: [
                "CoreModels",
                .product(name: "MLX", package: "mlx-swift"),
                .product(name: "MLXNN", package: "mlx-swift"),
            ]
        ),
        .target(
            name: "BatchProcessing",
            dependencies: ["CoreModels", "RawDecoding", "ImagePipeline", "AIEngine"]
        ),

        .testTarget(name: "RawDecodingTests", dependencies: ["RawDecoding", "ImagePipeline"]),
        .testTarget(name: "ImagePipelineTests", dependencies: ["ImagePipeline"]),
        .testTarget(name: "AIEngineTests", dependencies: ["AIEngine"]),
    ]
)
