#if FX_PERF_HARNESS
import Foundation

/// A closed-network URL protocol for performance/UI fixtures. Any request
/// that escapes an injected fixture fails locally instead of reaching the
/// production API.
final class DeterministicFailureURLProtocol: URLProtocol, @unchecked Sendable {
    @MainActor
    static func install() {
        _ = URLProtocol.registerClass(Self.self)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        request
    }

    override func startLoading() {
        client?.urlProtocol(
            self,
            didFailWithError: URLError(.notConnectedToInternet)
        )
    }

    override func stopLoading() {}
}
#endif
