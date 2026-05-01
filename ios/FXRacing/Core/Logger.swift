import Foundation
import os

// In-app log buffer + os.Logger mirror.
//
// Writes go to BOTH:
//   1. os.Logger (visible in Console.app, sysdiagnose, and `xcrun simctl spawn
//      booted log stream --predicate 'subsystem == "com.fxracing.app"'`)
//   2. A 500-entry ring buffer surfaced by Settings → Diagnostics with a Copy
//      button so external testers can email logs without a live debug session.
//
// Why both? os.Logger is the right system-level mechanism for live debugging,
// but it's invisible to non-technical testers. The in-app viewer covers them.
//
// Logging entry points (`fxLog` / `fxDebug` / `fxWarn` / `fxError`) are
// nonisolated — safe to call from any actor context, including URLSession
// callbacks and view-model awaits. Internal mutation hops to MainActor so the
// SwiftUI Diagnostics view stays observable.

enum FXLogCategory: String, Sendable {
    case network, auth, race, pick, score, sync, ui
}

@Observable
@MainActor
final class FXLogStore {

    static let shared = FXLogStore()

    struct Entry: Identifiable {
        let id = UUID()
        let timestamp: Date
        let category: FXLogCategory
        let level: Level
        let message: String
    }

    enum Level: String, Sendable {
        case debug, info, warn, error
    }

    private(set) var entries: [Entry] = []
    private let maxEntries = 500

    private let osLoggers: [FXLogCategory: Logger] = [
        .network: Logger(subsystem: "com.fxracing.app", category: "network"),
        .auth:    Logger(subsystem: "com.fxracing.app", category: "auth"),
        .race:    Logger(subsystem: "com.fxracing.app", category: "race"),
        .pick:    Logger(subsystem: "com.fxracing.app", category: "pick"),
        .score:   Logger(subsystem: "com.fxracing.app", category: "score"),
        .sync:    Logger(subsystem: "com.fxracing.app", category: "sync"),
        .ui:      Logger(subsystem: "com.fxracing.app", category: "ui"),
    ]

    private init() {}

    func append(_ category: FXLogCategory, _ level: Level, _ message: String) {
        let entry = Entry(timestamp: Date(), category: category, level: level, message: message)
        entries.append(entry)
        if entries.count > maxEntries {
            entries.removeFirst(entries.count - maxEntries)
        }

        guard let osLog = osLoggers[category] else { return }
        switch level {
        case .debug: osLog.debug("\(message, privacy: .public)")
        case .info:  osLog.info("\(message, privacy: .public)")
        case .warn:  osLog.warning("\(message, privacy: .public)")
        case .error: osLog.error("\(message, privacy: .public)")
        }
    }

    func clear() { entries.removeAll() }

    /// Plain-text dump suitable for clipboard / email.
    func dump() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return entries
            .map { "[\(formatter.string(from: $0.timestamp))] [\($0.category.rawValue)] [\($0.level.rawValue)] \($0.message)" }
            .joined(separator: "\n")
    }
}

// Nonisolated convenience entry points — safe to call from any context.
// They hop to MainActor internally so the ring-buffer + Observable updates
// stay single-threaded.
nonisolated func fxLog(_ cat: FXLogCategory, _ msg: String) {
    Task { @MainActor in FXLogStore.shared.append(cat, .info, msg) }
}
nonisolated func fxDebug(_ cat: FXLogCategory, _ msg: String) {
    Task { @MainActor in FXLogStore.shared.append(cat, .debug, msg) }
}
nonisolated func fxWarn(_ cat: FXLogCategory, _ msg: String) {
    Task { @MainActor in FXLogStore.shared.append(cat, .warn, msg) }
}
nonisolated func fxError(_ cat: FXLogCategory, _ msg: String) {
    Task { @MainActor in FXLogStore.shared.append(cat, .error, msg) }
}
