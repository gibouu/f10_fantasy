import Foundation

enum Config {
    #if DEBUG
    /// Point at your local dev server when running in the simulator.
    /// If you want to test against production, change this to https://fxracing.ca
    static let apiBaseURL = URL(string: "https://fxracing.ca")!
    #else
    static let apiBaseURL = URL(string: "https://fxracing.ca")!
    #endif
}
