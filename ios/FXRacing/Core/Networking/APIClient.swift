import Foundation

struct APIClient: Sendable {
    private let baseURL: URL
    private let session: URLSession

    init(baseURL: URL = Config.apiBaseURL) {
        self.baseURL = baseURL
        self.session = .shared
    }

    /// Executes an API request and decodes the JSON response body into `T`.
    /// Pass `token` to include an `Authorization: Bearer` header.
    func request<T: Decodable & Sendable>(
        _ endpoint: APIEndpoint,
        token: String? = nil
    ) async throws -> T {
        let urlRequest = try buildRequest(for: endpoint, token: token)
        let started = Date()
        let pathTag = "\(endpoint.method) \(endpoint.path)"

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch {
            fxError(.network, "\(pathTag) — network failure: \(error.localizedDescription)")
            throw APIError.networkFailed(error)
        }

        guard let http = response as? HTTPURLResponse else {
            fxError(.network, "\(pathTag) — non-HTTP response")
            throw APIError.networkFailed(URLError(.badServerResponse))
        }

        let ms = Int(Date().timeIntervalSince(started) * 1000)
        let auth = token != nil ? "auth" : "anon"

        switch http.statusCode {
        case 200...299:
            fxLog(.network, "\(pathTag) → \(http.statusCode) (\(ms)ms, \(data.count)B, \(auth))")
            do {
                return try JSONDecoder.api.decode(T.self, from: data)
            } catch {
                let preview = String(data: data.prefix(200), encoding: .utf8) ?? "<non-utf8>"
                fxError(.network, "\(pathTag) — decode \(T.self) failed: \(error.localizedDescription); body[0..200]=\(preview)")
                throw APIError.decodingFailed(error)
            }
        case 401:
            let message = (try? JSONDecoder.api.decode(APIErrorBody.self, from: data))?.error
            fxWarn(.network, "\(pathTag) → 401 (\(ms)ms, \(auth)) \(message ?? "")")
            if let message {
                throw APIError.serverError(401, message)
            }
            throw APIError.unauthorized
        case 404:
            fxWarn(.network, "\(pathTag) → 404 (\(ms)ms, \(auth))")
            throw APIError.notFound
        default:
            let message = (try? JSONDecoder.api.decode(APIErrorBody.self, from: data))?.error
            fxWarn(.network, "\(pathTag) → \(http.statusCode) (\(ms)ms, \(auth)) \(message ?? "")")
            throw APIError.serverError(http.statusCode, message)
        }
    }

    // MARK: - Private

    private func buildRequest(for endpoint: APIEndpoint, token: String?) throws -> URLRequest {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw APIError.invalidURL
        }
        components.path = endpoint.path
        if !endpoint.queryItems.isEmpty {
            components.queryItems = endpoint.queryItems
        }
        guard let url = components.url else {
            throw APIError.invalidURL
        }

        var req = URLRequest(url: url)
        req.httpMethod = endpoint.method
        req.setValue("application/json", forHTTPHeaderField: "Accept")

        if let token {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body = endpoint.bodyData {
            req.httpBody = body
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return req
    }
}

// MARK: - Helpers

private struct APIErrorBody: Decodable {
    let error: String
}

extension JSONDecoder {
    static let api: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
