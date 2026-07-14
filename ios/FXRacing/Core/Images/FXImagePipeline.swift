import Foundation
import ImageIO
import UIKit

enum FXImageContentMode: String, Hashable, Sendable {
    case fit
    case fill
}

struct FXImageRequest: Hashable, Sendable {
    let url: URL
    let pixelWidth: Int
    let pixelHeight: Int
    let scale: CGFloat
    let contentMode: FXImageContentMode
}

protocol ImageDataLoading: Sendable {
    func data(for url: URL) async throws -> Data
}

protocol FXImageDecoding: Sendable {
    func downsample(data: Data, for request: FXImageRequest) throws -> UIImage
}

struct FXDecodedCacheLimits: Equatable, Sendable {
    let totalCost: Int
    let count: Int
}

enum FXImagePipelineError: Error, Sendable {
    case invalidImageData
    case unexpectedHTTPStatus(Int)
}

final class FXURLSessionImageDataLoader: ImageDataLoading, @unchecked Sendable {
    static let memoryCapacity = 16 * 1_024 * 1_024
    static let diskCapacity = 100 * 1_024 * 1_024

    let urlCache: URLCache
    private let session: URLSession

    init(urlCache: URLCache = FXURLSessionImageDataLoader.makeURLCache()) {
        self.urlCache = urlCache

        let configuration = URLSessionConfiguration.default
        configuration.urlCache = urlCache
        configuration.requestCachePolicy = .useProtocolCachePolicy
        session = URLSession(configuration: configuration)
    }

    func data(for url: URL) async throws -> Data {
        let (data, response) = try await session.data(from: url)
        if let response = response as? HTTPURLResponse,
           !(200..<300).contains(response.statusCode) {
            throw FXImagePipelineError.unexpectedHTTPStatus(response.statusCode)
        }
        return data
    }

    static func makeURLCache() -> URLCache {
        let directory = FileManager.default
            .urls(for: .cachesDirectory, in: .userDomainMask)
            .first?
            .appendingPathComponent("com.fxracing.image-responses", isDirectory: true)

        return URLCache(
            memoryCapacity: memoryCapacity,
            diskCapacity: diskCapacity,
            directory: directory
        )
    }
}

struct FXImageIODecoder: FXImageDecoding {
    func downsample(data: Data, for request: FXImageRequest) throws -> UIImage {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else {
            throw FXImagePipelineError.invalidImageData
        }

        let maxPixelSize = try thumbnailMaxPixelSize(source: source, request: request)
        let thumbnailOptions: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(
            source,
            0,
            thumbnailOptions as CFDictionary
        ) else {
            throw FXImagePipelineError.invalidImageData
        }

        return UIImage(
            cgImage: image,
            scale: request.scale > 0 ? request.scale : 1,
            orientation: .up
        )
    }

    private func thumbnailMaxPixelSize(
        source: CGImageSource,
        request: FXImageRequest
    ) throws -> Int {
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil)
                as? [CFString: Any],
              let rawWidth = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
              let rawHeight = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue,
              rawWidth > 0,
              rawHeight > 0 else {
            throw FXImagePipelineError.invalidImageData
        }

        let orientation = (properties[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1
        let swapsAxes = (5...8).contains(orientation)
        let sourceWidth = swapsAxes ? rawHeight : rawWidth
        let sourceHeight = swapsAxes ? rawWidth : rawHeight
        let targetWidth = Double(max(1, request.pixelWidth))
        let targetHeight = Double(max(1, request.pixelHeight))

        let widthScale = targetWidth / sourceWidth
        let heightScale = targetHeight / sourceHeight
        let renderScale: Double
        switch request.contentMode {
        case .fit:
            renderScale = min(widthScale, heightScale)
        case .fill:
            renderScale = max(widthScale, heightScale)
        }

        let downsampleScale = min(1, renderScale)
        return max(1, Int(ceil(max(sourceWidth, sourceHeight) * downsampleScale)))
    }
}

actor FXImagePipeline {
    private static let decodedCacheCostLimit = 48 * 1_024 * 1_024
    private static let decodedCacheCountLimit = 160
    private static let maximumPrefetchWorkers = 4

    private struct DecodedImage: @unchecked Sendable {
        let image: UIImage
        let byteCost: Int
    }

    private struct InFlight {
        let id: UUID
        let task: Task<DecodedImage, Error>
        var visibleWaiterCount: Int
        var prefetchScopes: Set<UUID>
        var isFinished = false
    }

    private struct Acquisition {
        let id: UUID
        let task: Task<DecodedImage, Error>
    }

    private let loader: any ImageDataLoading
    private let decoder: any FXImageDecoding
    private let decodedCache = NSCache<FXImageCacheKey, FXDecodedImageCacheEntry>()

    private var inFlight: [FXImageRequest: InFlight] = [:]
    private var prefetchOwnerID: UUID?
    private var prefetchScopeID: UUID?
    private var prefetchQueue: [FXImageRequest] = []
    private var nextPrefetchIndex = 0
    private var prefetchWorkers: [UUID: Task<Void, Never>] = [:]

    var decodedCacheLimits: FXDecodedCacheLimits {
        FXDecodedCacheLimits(
            totalCost: decodedCache.totalCostLimit,
            count: decodedCache.countLimit
        )
    }

    init(
        loader: any ImageDataLoading = FXURLSessionImageDataLoader(),
        decoder: any FXImageDecoding = FXImageIODecoder()
    ) {
        self.loader = loader
        self.decoder = decoder
        decodedCache.totalCostLimit = Self.decodedCacheCostLimit
        decodedCache.countLimit = Self.decodedCacheCountLimit
    }

    func image(for request: FXImageRequest) async throws -> UIImage {
        try Task.checkCancellation()
        if let cached = cachedEntry(for: request) {
            return cached.image
        }

        let acquisition = acquireVisible(request)
        do {
            let decoded = try await fxValueRespectingCancellation(of: acquisition.task)
            try Task.checkCancellation()
            storeSuccessfulResult(decoded, for: request, id: acquisition.id)
            releaseVisible(request, id: acquisition.id)
            return decoded.image
        } catch is CancellationError {
            releaseVisible(request, id: acquisition.id)
            throw CancellationError()
        } catch {
            removeFailedRequest(request, id: acquisition.id)
            releaseVisible(request, id: acquisition.id)
            throw error
        }
    }

    func replacePrefetchScope(with requests: [FXImageRequest]) {
        prefetchOwnerID = nil
        installPrefetchScope(requests)
    }

    func replacePrefetchScope(
        with requests: [FXImageRequest],
        ownerID: UUID
    ) {
        prefetchOwnerID = ownerID
        installPrefetchScope(requests)
    }

    func clearPrefetchScope(ownerID: UUID) {
        guard prefetchOwnerID == ownerID else { return }
        prefetchOwnerID = nil
        installPrefetchScope([])
    }

    private func installPrefetchScope(_ requests: [FXImageRequest]) {
        var seen = Set<FXImageRequest>()
        let nextQueue = requests.filter { seen.insert($0).inserted }
        let nextScopeID = nextQueue.isEmpty ? nil : UUID()
        transitionPrefetchScope(
            to: nextScopeID,
            retaining: Set(nextQueue)
        )

        prefetchScopeID = nextScopeID
        prefetchQueue = nextQueue
        nextPrefetchIndex = 0
        startPrefetchWorkersIfNeeded()
    }

    func waitForPrefetchToFinish() async {
        let scopeID = prefetchScopeID
        while prefetchScopeID == scopeID, !prefetchWorkers.isEmpty {
            let workers = Array(prefetchWorkers.values)
            for worker in workers {
                await worker.value
            }
        }

        guard prefetchScopeID == scopeID else { return }
        prefetchQueue.removeAll()
        nextPrefetchIndex = 0
    }

    func decodedCacheCost(for request: FXImageRequest) -> Int? {
        cachedEntry(for: request)?.byteCost
    }

    nonisolated static func decodedByteCost(for image: UIImage) -> Int {
        if let image = image.cgImage {
            let (cost, overflow) = image.bytesPerRow.multipliedReportingOverflow(by: image.height)
            return overflow ? Int.max : max(1, cost)
        }

        let width = max(1, Int((image.size.width * image.scale).rounded(.up)))
        let height = max(1, Int((image.size.height * image.scale).rounded(.up)))
        let (pixelCount, pixelOverflow) = width.multipliedReportingOverflow(by: height)
        let (cost, byteOverflow) = pixelCount.multipliedReportingOverflow(by: 4)
        return pixelOverflow || byteOverflow ? Int.max : max(1, cost)
    }

    private func acquireVisible(_ request: FXImageRequest) -> Acquisition {
        if var entry = inFlight[request] {
            entry.visibleWaiterCount += 1
            inFlight[request] = entry
            return Acquisition(id: entry.id, task: entry.task)
        }

        let entry = makeInFlight(
            request: request,
            priority: .userInitiated,
            visibleWaiterCount: 1,
            prefetchScopes: []
        )
        inFlight[request] = entry
        return Acquisition(id: entry.id, task: entry.task)
    }

    private func acquirePrefetch(
        _ request: FXImageRequest,
        scopeID: UUID
    ) -> Acquisition? {
        guard cachedEntry(for: request) == nil else { return nil }

        if var entry = inFlight[request] {
            guard !entry.prefetchScopes.contains(scopeID) else { return nil }
            entry.prefetchScopes.insert(scopeID)
            inFlight[request] = entry
            return Acquisition(id: entry.id, task: entry.task)
        }

        let entry = makeInFlight(
            request: request,
            priority: .utility,
            visibleWaiterCount: 0,
            prefetchScopes: [scopeID]
        )
        inFlight[request] = entry
        return Acquisition(id: entry.id, task: entry.task)
    }

    private func makeInFlight(
        request: FXImageRequest,
        priority: TaskPriority,
        visibleWaiterCount: Int,
        prefetchScopes: Set<UUID>
    ) -> InFlight {
        let id = UUID()
        let loader = loader
        let decoder = decoder
        let task = Task.detached(priority: priority) {
            try Task.checkCancellation()
            let data = try await loader.data(for: request.url)
            try Task.checkCancellation()
            let image = try decoder.downsample(data: data, for: request)
            try Task.checkCancellation()
            return DecodedImage(
                image: image,
                byteCost: Self.decodedByteCost(for: image)
            )
        }

        return InFlight(
            id: id,
            task: task,
            visibleWaiterCount: visibleWaiterCount,
            prefetchScopes: prefetchScopes
        )
    }

    private func startPrefetchWorkersIfNeeded() {
        guard prefetchScopeID != nil else { return }
        let pendingCount = prefetchQueue.count - nextPrefetchIndex
        let availableSlots = Self.maximumPrefetchWorkers - prefetchWorkers.count
        let workerCount = min(max(0, pendingCount), max(0, availableSlots))

        for _ in 0..<workerCount {
            let workerID = UUID()
            prefetchWorkers[workerID] = Task { [weak self] in
                await self?.runPrefetchWorker(id: workerID)
            }
        }
    }

    private func runPrefetchWorker(id: UUID) async {
        while let (request, scopeID) = nextPrefetchRequest() {
            await prefetch(request, scopeID: scopeID)
        }
        prefetchWorkerFinished(id: id)
    }

    private func prefetchWorkerFinished(id: UUID) {
        prefetchWorkers.removeValue(forKey: id)
        startPrefetchWorkersIfNeeded()
    }

    private func nextPrefetchRequest() -> (FXImageRequest, UUID)? {
        guard let scopeID = prefetchScopeID,
              prefetchQueue.indices.contains(nextPrefetchIndex) else {
            return nil
        }

        let request = prefetchQueue[nextPrefetchIndex]
        nextPrefetchIndex += 1
        return (request, scopeID)
    }

    private func prefetch(_ request: FXImageRequest, scopeID: UUID) async {
        guard prefetchScopeID == scopeID,
              let acquisition = acquirePrefetch(request, scopeID: scopeID) else {
            return
        }

        do {
            let decoded = try await acquisition.task.value
            storeSuccessfulResult(decoded, for: request, id: acquisition.id)
        } catch {
            removeFailedRequest(request, id: acquisition.id)
        }
        releasePrefetch(request, id: acquisition.id, scopeID: scopeID)
    }

    private func storeSuccessfulResult(
        _ decoded: DecodedImage,
        for request: FXImageRequest,
        id: UUID
    ) {
        guard var entry = inFlight[request], entry.id == id else { return }
        if !entry.isFinished {
            decodedCache.setObject(
                FXDecodedImageCacheEntry(image: decoded.image, byteCost: decoded.byteCost),
                forKey: FXImageCacheKey(request),
                cost: decoded.byteCost
            )
            entry.isFinished = true
            inFlight[request] = entry
        }
    }

    private func removeFailedRequest(_ request: FXImageRequest, id: UUID) {
        guard inFlight[request]?.id == id else { return }
        inFlight.removeValue(forKey: request)
    }

    private func releaseVisible(_ request: FXImageRequest, id: UUID) {
        guard var entry = inFlight[request], entry.id == id else { return }
        entry.visibleWaiterCount = max(0, entry.visibleWaiterCount - 1)
        finishOrRetain(entry, for: request)
    }

    private func releasePrefetch(
        _ request: FXImageRequest,
        id: UUID,
        scopeID: UUID
    ) {
        guard var entry = inFlight[request], entry.id == id else { return }
        if entry.isFinished {
            entry.prefetchScopes.removeAll()
        } else {
            entry.prefetchScopes.remove(scopeID)
        }
        finishOrRetain(entry, for: request)
    }

    private func finishOrRetain(_ entry: InFlight, for request: FXImageRequest) {
        guard entry.visibleWaiterCount == 0, entry.prefetchScopes.isEmpty else {
            inFlight[request] = entry
            return
        }

        if !entry.isFinished {
            entry.task.cancel()
        }
        inFlight.removeValue(forKey: request)
    }

    private func transitionPrefetchScope(
        to nextScopeID: UUID?,
        retaining retainedRequests: Set<FXImageRequest>
    ) {
        if let currentScopeID = prefetchScopeID {
            for request in Array(inFlight.keys) {
                guard var entry = inFlight[request],
                      entry.prefetchScopes.remove(currentScopeID) != nil else {
                    continue
                }
                if let nextScopeID,
                   retainedRequests.contains(request),
                   !entry.isFinished {
                    entry.prefetchScopes.insert(nextScopeID)
                }
                finishOrRetain(entry, for: request)
            }
        }

        prefetchQueue.removeAll()
        nextPrefetchIndex = 0
    }

    private func cachedEntry(for request: FXImageRequest) -> FXDecodedImageCacheEntry? {
        decodedCache.object(forKey: FXImageCacheKey(request))
    }
}

private final class FXImageCacheKey: NSObject {
    let request: FXImageRequest

    init(_ request: FXImageRequest) {
        self.request = request
    }

    override var hash: Int { request.hashValue }

    override func isEqual(_ object: Any?) -> Bool {
        (object as? FXImageCacheKey)?.request == request
    }
}

private final class FXDecodedImageCacheEntry {
    let image: UIImage
    let byteCost: Int

    init(image: UIImage, byteCost: Int) {
        self.image = image
        self.byteCost = byteCost
    }
}

private func fxValueRespectingCancellation<Value: Sendable>(
    of task: Task<Value, Error>
) async throws -> Value {
    let relay = FXTaskResultRelay<Value>()
    return try await withTaskCancellationHandler {
        try await withCheckedThrowingContinuation { continuation in
            guard relay.install(continuation) else { return }
            Task.detached {
                relay.resolve(await task.result)
            }
        }
    } onCancel: {
        relay.resolve(.failure(CancellationError()))
    }
}

private final class FXTaskResultRelay<Value: Sendable>: @unchecked Sendable {
    private enum State {
        case pending
        case waiting(CheckedContinuation<Value, Error>)
        case resolved(Result<Value, Error>)
        case consumed
    }

    private let lock = NSLock()
    private var state: State = .pending

    func install(_ continuation: CheckedContinuation<Value, Error>) -> Bool {
        var resolvedResult: Result<Value, Error>?
        let shouldObserveTask = lock.withLock {
            switch state {
            case .pending:
                state = .waiting(continuation)
                return true
            case .resolved(let result):
                state = .consumed
                resolvedResult = result
                return false
            case .waiting, .consumed:
                return false
            }
        }

        if let result = resolvedResult {
            continuation.resume(with: result)
        }
        return shouldObserveTask
    }

    func resolve(_ result: Result<Value, Error>) {
        let continuation: CheckedContinuation<Value, Error>? = lock.withLock {
            switch state {
            case .pending:
                state = .resolved(result)
                return nil
            case .waiting(let continuation):
                state = .consumed
                return continuation
            case .resolved, .consumed:
                return nil
            }
        }
        continuation?.resume(with: result)
    }
}
