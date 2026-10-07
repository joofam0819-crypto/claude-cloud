// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Approach",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "Approach",
            path: "Sources/Approach"
        )
    ]
)
