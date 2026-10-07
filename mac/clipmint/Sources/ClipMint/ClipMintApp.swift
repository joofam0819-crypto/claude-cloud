import SwiftUI
import ClipMintCore

@main
struct ClipMintApp: App {
    var body: some Scene {
        MenuBarExtra("ClipMint", systemImage: "doc.on.clipboard") {
            Text("ClipMint — placeholder build")
            Button("Quit") { NSApp.terminate(nil) }
        }
    }
}
