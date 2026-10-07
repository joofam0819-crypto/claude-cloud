// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ClipMint",
    defaultLocalization: "ko",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "ClipMint", targets: ["ClipMint"]),
        .library(name: "ClipMintCore", targets: ["ClipMintCore"]),
    ],
    targets: [
        .target(
            name: "ClipMintCore",
            path: "Sources/ClipMintCore"
        ),
        .executableTarget(
            name: "ClipMint",
            dependencies: ["ClipMintCore"],
            path: "Sources/ClipMint"
        ),
        .testTarget(
            name: "ClipMintCoreTests",
            dependencies: ["ClipMintCore"],
            path: "Tests/ClipMintCoreTests"
        ),
    ]
)
