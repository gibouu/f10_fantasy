import Foundation

enum APIError: LocalizedError {
    case invalidURL
    case unauthorized
    case notFound
    case serverError(Int, String?)
    case decodingFailed(Error)
    case networkFailed(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL."
        case .unauthorized:
            return "Session expired. Please sign in again."
        case .notFound:
            return "Resource not found."
        case .serverError(let code, let message):
            return message ?? "Server error (\(code))."
        case .decodingFailed(let err):
            return "Data error: \(err.localizedDescription)"
        case .networkFailed(let err):
            return err.localizedDescription
        }
    }
}
