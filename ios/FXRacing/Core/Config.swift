import Foundation

enum Config {
    #if DEBUG
    static let apiBaseURL = URL(string: "http://127.0.0.1:3000")!
    #else
    /// Use the canonical production host. Avoid the apex domain here:
    /// if it redirects to `www`, URLSession may drop the Authorization header
    /// on the redirected request and mobile Bearer auth will fail.
    static let apiBaseURL = URL(string: "https://www.fxracing.ca")!
    #endif
}
