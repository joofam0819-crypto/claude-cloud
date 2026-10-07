import AppKit
import Vision

/// On-device text recognition for copied images (Korean / English / Japanese).
enum OCRService {
    static let queue = DispatchQueue(label: "clipmint.ocr", qos: .utility)

    static func recognize(pngData: Data, completion: @escaping (String) -> Void) {
        queue.async {
            guard let image = NSImage(data: pngData), let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { completion(""); return }
            let request = VNRecognizeTextRequest { req, _ in
                let obs = (req.results as? [VNRecognizedTextObservation]) ?? []
                // keep reading order roughly top-to-bottom
                let sorted = obs.sorted { $0.boundingBox.midY > $1.boundingBox.midY }
                let lines = sorted.compactMap { $0.topCandidates(1).first?.string }
                completion(lines.joined(separator: "\n"))
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = ["ko-KR", "en-US", "ja-JP"]
            request.automaticallyDetectsLanguage = true
            let handler = VNImageRequestHandler(cgImage: cg, options: [:])
            do { try handler.perform([request]) } catch { completion("") }
        }
    }
}
