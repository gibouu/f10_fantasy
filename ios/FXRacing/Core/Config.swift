import Foundation

enum Config {
    #if DEBUG
    /// Use the canonical production host. Avoid the apex domain here:
    /// if it redirects to `www`, URLSession may drop the Authorization header
    /// on the redirected request and mobile Bearer auth will fail.
    static let apiBaseURL = URL(string: "https://www.fxracing.ca")!
    #else
    static let apiBaseURL = URL(string: "https://www.fxracing.ca")!
    #endif
}
