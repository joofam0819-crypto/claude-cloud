// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "GameShell",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "GameShell",
            path: "Sources/GameShell"
        )
    ]
)
