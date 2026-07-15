#if FX_PERF_HARNESS
import Foundation
import XCTest

struct PerformanceResult: Codable, Sendable {
    let name: String
    let unit: String
    let warmups: Int
    let samples: [Double]
    let p50: Double
    let p95: Double
    let threshold: Double
    let passed: Bool
    let enforced: Bool

    @MainActor
    @discardableResult
    static func record(
        _ name: String,
        durations: [Double],
        warmups: Int,
        enforced: Bool,
        testCase: XCTestCase
    ) throws -> PerformanceResult {
        let ordered = durations.sorted()
        let threshold = threshold(for: name)
        let result = PerformanceResult(
            name: name,
            unit: "seconds",
            warmups: warmups,
            samples: durations,
            p50: percentile(50, in: ordered),
            p95: percentile(95, in: ordered),
            threshold: threshold,
            passed: percentile(95, in: ordered) <= threshold,
            enforced: enforced
        )
        let report = PerformanceReport(
            schemaVersion: 1,
            generatedAt: Date(),
            results: [result]
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(report)

        if let outputPath = ProcessInfo.processInfo.environment[
            "FX_PERFORMANCE_RESULT_PATH"
        ] {
            let outputURL = URL(fileURLWithPath: outputPath)
            try FileManager.default.createDirectory(
                at: outputURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: outputURL, options: .atomic)
        }

        let attachment = XCTAttachment(
            data: data,
            uniformTypeIdentifier: "public.json"
        )
        attachment.name = "\(name)-raw.json"
        attachment.lifetime = .keepAlways
        testCase.add(attachment)

        return result
    }

    private static func threshold(for name: String) -> Double {
        switch name {
        // These wall times remain diagnostics because XCUIApplication includes
        // host-side process/debugger and event-synthesis latency. App-owned
        // signposts are the reproducible gates; retaining the approved targets
        // here keeps the diagnostic comparison meaningful.
        case "shell":
            0.8
        case "cached-launch", "offline-launch":
            1.0
        case "race-swipe":
            0.6
        case "driver-sheet", "schedule-sheet":
            0.5
        case "local-save":
            0.2
        case "empty-launch", "image-launch":
            10.0
        default: .infinity
        }
    }

    private static func percentile(_ percentile: Int, in ordered: [Double]) -> Double {
        guard !ordered.isEmpty else { return 0 }
        let rank = Int(
            ceil((Double(percentile) / 100) * Double(ordered.count))
        )
        return ordered[max(0, min(ordered.count - 1, rank - 1))]
    }
}

private struct PerformanceReport: Codable, Sendable {
    let schemaVersion: Int
    let generatedAt: Date
    let results: [PerformanceResult]
}
#endif
