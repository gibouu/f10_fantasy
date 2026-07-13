import Foundation

protocol ClockProviding: Sendable {
    func now() -> Date
}

struct SystemClock: ClockProviding {
    func now() -> Date { Date() }
}
