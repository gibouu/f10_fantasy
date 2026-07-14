import Foundation
import UIKit
import XCTest
@testable import FXRacing

final class FXImagePipelineTests: XCTestCase {
    private let onePixelPNG = Data(
        base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XQ2hAAAAAElFTkSuQmCC"
    )!

    func testRequestKeyIncludesEveryRenderingInput() {
        let request = makeRequest()
        let requests: Set<FXImageRequest> = [
            request,
            makeRequest(url: URL(string: "https://example.test/other.png")!),
            makeRequest(pixelWidth: 145),
            makeRequest(pixelHeight: 145),
            makeRequest(scale: 2),
            makeRequest(contentMode: .fit),
        ]

        XCTAssertEqual(requests.count, 6)
    }

    func testDedicatedResponseCacheUsesBoundedLimits() {
        let loader = FXURLSessionImageDataLoader()

        XCTAssertFalse(loader.urlCache === URLCache.shared)
        XCTAssertEqual(loader.urlCache.memoryCapacity, 16 * 1_024 * 1_024)
        XCTAssertEqual(loader.urlCache.diskCapacity, 100 * 1_024 * 1_024)
    }

    func testDecodedCacheUsesBoundedLimits() async {
        let pipeline = makePipeline()

        let limits = await pipeline.decodedCacheLimits

        XCTAssertEqual(limits.totalCost, 48 * 1_024 * 1_024)
        XCTAssertEqual(limits.count, 160)
    }

    func testConcurrentIdenticalVisibleRequestsShareOneLoad() async throws {
        let loader = ControlledImageDataLoader(data: onePixelPNG)
        let pipeline = makePipeline(loader: loader)
        let request = makeRequest()

        async let first = pipeline.image(for: request)
        async let second = pipeline.image(for: request)
        await loader.waitForStarts(1)

        let initialStartCount = await loader.startCount(for: request.url)
        XCTAssertEqual(initialStartCount, 1)
        await loader.finishAll()
        _ = try await (first, second)
        let finalStartCount = await loader.startCount(for: request.url)
        XCTAssertEqual(finalStartCount, 1)
    }

    func testCancellingOnlyVisibleConsumerFinishesPromptlyAndCancelsLoad() async {
        let request = makeRequest()
        let loadCancellation = ExpectationSignal(
            expectation: expectation(description: "underlying image load cancelled")
        )
        let loader = ControlledImageDataLoader(
            data: onePixelPNG,
            cancellationObserver: { url in
                guard url == request.url else { return }
                loadCancellation.fulfill()
            }
        )
        let pipeline = makePipeline(loader: loader)
        let visible = Task { try await pipeline.image(for: request) }
        await loader.waitForStarts(1)
        let result = observeCancellation(
            of: visible,
            description: "cancelled visible request finished"
        )

        visible.cancel()

        await fulfillment(
            of: [result.expectation, loadCancellation.expectation],
            timeout: 1
        )
        await loader.finishAll()
        await result.observer.value
        XCTAssertTrue(result.probe.didThrowCancellation)
        let cancellationCount = await loader.cancellationCount(for: request.url)
        XCTAssertEqual(cancellationCount, 1)
    }

    func testCancellingOneVisibleConsumerDoesNotCancelSharedVisibleLoad() async throws {
        let request = makeRequest()
        let loader = ControlledImageDataLoader(data: onePixelPNG)
        let pipeline = makePipeline(loader: loader)
        let survivor = Task { try await pipeline.image(for: request) }
        await loader.waitForStarts(1)
        let cancelled = Task { try await pipeline.image(for: request) }
        for _ in 0..<10 { await Task.yield() }
        let result = observeCancellation(
            of: cancelled,
            description: "one shared visible request cancelled"
        )

        cancelled.cancel()

        await fulfillment(of: [result.expectation], timeout: 1)
        XCTAssertTrue(result.probe.didThrowCancellation)
        let cancellationCountBeforeFinish = await loader.cancellationCount(for: request.url)
        XCTAssertEqual(cancellationCountBeforeFinish, 0)

        await loader.finishAll()
        _ = try await survivor.value
        await result.observer.value
        let startCount = await loader.startCount(for: request.url)
        XCTAssertEqual(startCount, 1)
    }

    func testCancellingVisibleConsumerDoesNotCancelSharedPrefetchLoad() async {
        let request = makeRequest()
        let loader = ControlledImageDataLoader(data: onePixelPNG)
        let pipeline = makePipeline(loader: loader)
        await pipeline.replacePrefetchScope(with: [request])
        await loader.waitForStarts(1)
        let visible = Task { try await pipeline.image(for: request) }
        for _ in 0..<10 { await Task.yield() }
        let result = observeCancellation(
            of: visible,
            description: "visible request sharing prefetch cancelled"
        )

        visible.cancel()

        await fulfillment(of: [result.expectation], timeout: 1)
        XCTAssertTrue(result.probe.didThrowCancellation)
        let cancellationCountBeforeFinish = await loader.cancellationCount(for: request.url)
        XCTAssertEqual(cancellationCountBeforeFinish, 0)

        await loader.finishAll()
        await pipeline.waitForPrefetchToFinish()
        await result.observer.value
        let startCount = await loader.startCount(for: request.url)
        let cancellationCount = await loader.cancellationCount(for: request.url)
        XCTAssertEqual(startCount, 1)
        XCTAssertEqual(cancellationCount, 0)
    }

    func testDecodedImageIsCachedUsingItsByteCost() async throws {
        let image = try XCTUnwrap(UIImage(data: onePixelPNG))
        let decoder = ImageDecoderSpy(image: image)
        let loader = ControlledImageDataLoader(data: onePixelPNG, startsSuspended: false)
        let pipeline = makePipeline(loader: loader, decoder: decoder)
        let request = makeRequest()

        _ = try await pipeline.image(for: request)
        let storedCost = await pipeline.decodedCacheCost(for: request)

        XCTAssertEqual(storedCost, FXImagePipeline.decodedByteCost(for: image))
        XCTAssertGreaterThan(storedCost ?? 0, 0)
    }

    func testDownsamplingRunsAwayFromMainThread() async throws {
        let decoder = ImageDecoderSpy(image: try XCTUnwrap(UIImage(data: onePixelPNG)))
        let loader = ControlledImageDataLoader(data: onePixelPNG, startsSuspended: false)
        let pipeline = makePipeline(loader: loader, decoder: decoder)

        _ = try await pipeline.image(for: makeRequest())

        XCTAssertEqual(decoder.wasMainThread, false)
    }

    func testImageIODownsamplingFitAvoidsUnnecessaryOverdecode() throws {
        let decoder = FXImageIODecoder()
        let data = try makePNG(width: 800, height: 200)
        let request = makeRequest(
            pixelWidth: 100,
            pixelHeight: 300,
            scale: 1,
            contentMode: .fit
        )

        let image = try decoder.downsample(data: data, for: request)
        let cgImage = try XCTUnwrap(image.cgImage)

        XCTAssertEqual(cgImage.width, 100)
        XCTAssertEqual(cgImage.height, 25)
    }

    func testImageIODownsamplingFillDecodesEnoughPixelsForCropping() throws {
        let decoder = FXImageIODecoder()
        let data = try makePNG(width: 800, height: 200)
        let request = makeRequest(
            pixelWidth: 100,
            pixelHeight: 100,
            scale: 1,
            contentMode: .fill
        )

        let image = try decoder.downsample(data: data, for: request)
        let cgImage = try XCTUnwrap(image.cgImage)

        XCTAssertEqual(cgImage.width, 400)
        XCTAssertEqual(cgImage.height, 100)
    }

    func testPrefetchRunsAtMostFourLoadsAtOnce() async {
        let loader = ControlledImageDataLoader(data: onePixelPNG)
        let pipeline = makePipeline(loader: loader)
        let requests = (0..<8).map {
            makeRequest(url: URL(string: "https://example.test/\($0).png")!)
        }

        await pipeline.replacePrefetchScope(with: requests)
        await loader.waitForStarts(4)

        let initialStartCount = await loader.totalStartCount
        let initialMaximum = await loader.maximumActiveCount
        XCTAssertEqual(initialStartCount, 4)
        XCTAssertEqual(initialMaximum, 4)

        await loader.finishAll()
        await loader.waitForStarts(8)
        await loader.finishAll()
        await pipeline.waitForPrefetchToFinish()
        let finalMaximum = await loader.maximumActiveCount
        XCTAssertEqual(finalMaximum, 4)
    }

    func testRapidPrefetchScopeReplacementKeepsGlobalWorkerAcquisitionsAtFour() async {
        let loader = ControlledImageDataLoader(data: onePixelPNG)
        let pipeline = makePipeline(loader: loader)
        let initial = makeRequests(prefix: "initial", count: 4)
        await pipeline.replacePrefetchScope(with: initial)
        await loader.waitForStarts(4)

        let visibleTasks = initial.map { request in
            Task { try await pipeline.image(for: request) }
        }
        for _ in 0..<50 { await Task.yield() }

        await pipeline.replacePrefetchScope(with: makeRequests(prefix: "second", count: 4))
        await pipeline.replacePrefetchScope(with: makeRequests(prefix: "third", count: 4))
        await pipeline.replacePrefetchScope(with: makeRequests(prefix: "current", count: 4))
        try? await Task.sleep(for: .milliseconds(100))

        let maximumActiveCount = await loader.maximumActiveCount
        XCTAssertEqual(maximumActiveCount, 4)
        for request in initial {
            let cancellationCount = await loader.cancellationCount(for: request.url)
            XCTAssertEqual(cancellationCount, 0)
        }

        await pipeline.replacePrefetchScope(with: [])
        await loader.finishAll()
        for task in visibleTasks {
            _ = try? await task.value
        }
        await pipeline.waitForPrefetchToFinish()
    }

    func testReplacingPrefetchScopeCancelsStaleLoad() async {
        let loader = ControlledImageDataLoader(data: onePixelPNG)
        let pipeline = makePipeline(loader: loader)
        let stale = makeRequest(url: URL(string: "https://example.test/stale.png")!)
        let current = makeRequest(url: URL(string: "https://example.test/current.png")!)

        await pipeline.replacePrefetchScope(with: [stale])
        await loader.waitForStarts(1)
        await pipeline.replacePrefetchScope(with: [current])
        await loader.waitForCancellation(of: stale.url)

        let cancellationCount = await loader.cancellationCount(for: stale.url)
        XCTAssertEqual(cancellationCount, 1)

        await loader.waitForStarts(2)
        await loader.finishAll()
        await pipeline.waitForPrefetchToFinish()
    }

    func testReplacingPrefetchScopeKeepsOverlappingLoad() async {
        let loader = ControlledImageDataLoader(data: onePixelPNG)
        let pipeline = makePipeline(loader: loader)
        let retained = makeRequest(url: URL(string: "https://example.test/retained.png")!)
        let stale = makeRequest(url: URL(string: "https://example.test/stale.png")!)
        let current = makeRequest(url: URL(string: "https://example.test/current.png")!)

        await pipeline.replacePrefetchScope(with: [retained, stale])
        await loader.waitForStarts(2)
        await pipeline.replacePrefetchScope(with: [retained, current])
        await loader.waitForCancellation(of: stale.url)
        await loader.waitForStarts(3)

        let retainedStarts = await loader.startCount(for: retained.url)
        let retainedCancellations = await loader.cancellationCount(for: retained.url)
        XCTAssertEqual(retainedStarts, 1)
        XCTAssertEqual(retainedCancellations, 0)

        await loader.finishAll()
        await pipeline.waitForPrefetchToFinish()
    }

    func testReplacingPrefetchScopeDoesNotCancelSharedVisibleRequest() async throws {
        let loader = ControlledImageDataLoader(data: onePixelPNG)
        let pipeline = makePipeline(loader: loader)
        let visible = makeRequest(url: URL(string: "https://example.test/visible.png")!)
        let current = makeRequest(url: URL(string: "https://example.test/current.png")!)

        let visibleTask = Task { try await pipeline.image(for: visible) }
        await loader.waitForStarts(1)
        await pipeline.replacePrefetchScope(with: [visible])
        await pipeline.replacePrefetchScope(with: [current])

        let cancellationCountBeforeFinish = await loader.cancellationCount(for: visible.url)
        XCTAssertEqual(cancellationCountBeforeFinish, 0)

        await loader.waitForStarts(2)
        await loader.finishAll()
        _ = try await visibleTask.value
        await pipeline.waitForPrefetchToFinish()
        let startCount = await loader.startCount(for: visible.url)
        let cancellationCount = await loader.cancellationCount(for: visible.url)
        XCTAssertEqual(startCount, 1)
        XCTAssertEqual(cancellationCount, 0)
    }

    private func makePipeline(
        loader: any ImageDataLoading = ControlledImageDataLoader(
            data: Data(),
            startsSuspended: false
        ),
        decoder: any FXImageDecoding = ImageDecoderSpy(image: UIImage())
    ) -> FXImagePipeline {
        FXImagePipeline(loader: loader, decoder: decoder)
    }

    private func makeRequest(
        url: URL = URL(string: "https://example.test/avatar.png")!,
        pixelWidth: Int = 144,
        pixelHeight: Int = 144,
        scale: CGFloat = 3,
        contentMode: FXImageContentMode = .fill
    ) -> FXImageRequest {
        FXImageRequest(
            url: url,
            pixelWidth: pixelWidth,
            pixelHeight: pixelHeight,
            scale: scale,
            contentMode: contentMode
        )
    }

    private func makeRequests(prefix: String, count: Int) -> [FXImageRequest] {
        (0..<count).map {
            makeRequest(url: URL(string: "https://example.test/\(prefix)-\($0).png")!)
        }
    }

    private func makePNG(width: Int, height: Int) throws -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(
            size: CGSize(width: width, height: height),
            format: format
        )
        let image = renderer.image { context in
            UIColor.systemRed.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
        return try XCTUnwrap(image.pngData())
    }

    private func observeCancellation(
        of task: Task<UIImage, Error>,
        description: String
    ) -> (
        probe: CancellationResultProbe,
        expectation: XCTestExpectation,
        observer: Task<Void, Never>
    ) {
        let probe = CancellationResultProbe(
            expectation: expectation(description: description)
        )
        let observer = Task {
            do {
                _ = try await task.value
                probe.resolve(didThrowCancellation: false)
            } catch is CancellationError {
                probe.resolve(didThrowCancellation: true)
            } catch {
                probe.resolve(didThrowCancellation: false)
            }
        }
        return (probe, probe.expectation, observer)
    }
}

private final class ExpectationSignal: @unchecked Sendable {
    let expectation: XCTestExpectation

    init(expectation: XCTestExpectation) {
        self.expectation = expectation
    }

    func fulfill() {
        expectation.fulfill()
    }
}

private final class CancellationResultProbe: @unchecked Sendable {
    let expectation: XCTestExpectation
    private let lock = NSLock()
    private var cancellationResult = false

    var didThrowCancellation: Bool {
        lock.withLock { cancellationResult }
    }

    init(expectation: XCTestExpectation) {
        self.expectation = expectation
    }

    func resolve(didThrowCancellation: Bool) {
        lock.withLock {
            cancellationResult = didThrowCancellation
        }
        expectation.fulfill()
    }
}

private final class ImageDecoderSpy: FXImageDecoding, @unchecked Sendable {
    private let lock = NSLock()
    private let image: UIImage
    private var mainThreadObservation: Bool?

    var wasMainThread: Bool? {
        lock.withLock { mainThreadObservation }
    }

    init(image: UIImage) {
        self.image = image
    }

    func downsample(data: Data, for request: FXImageRequest) throws -> UIImage {
        lock.withLock {
            mainThreadObservation = Thread.isMainThread
        }
        return image
    }
}

private actor ControlledImageDataLoader: ImageDataLoading {
    private struct PendingCall {
        let url: URL
        let continuation: CheckedContinuation<Data, Error>
    }

    private let data: Data
    private let startsSuspended: Bool
    private let cancellationObserver: (@Sendable (URL) -> Void)?
    private var pending: [UUID: PendingCall] = [:]
    private var startsByURL: [URL: Int] = [:]
    private var cancellationsByURL: [URL: Int] = [:]
    private var activeCount = 0
    private(set) var maximumActiveCount = 0
    private var startWaiters: [(Int, CheckedContinuation<Void, Never>)] = []
    private var cancellationWaiters: [(URL, CheckedContinuation<Void, Never>)] = []

    var totalStartCount: Int {
        startsByURL.values.reduce(0, +)
    }

    init(
        data: Data,
        startsSuspended: Bool = true,
        cancellationObserver: (@Sendable (URL) -> Void)? = nil
    ) {
        self.data = data
        self.startsSuspended = startsSuspended
        self.cancellationObserver = cancellationObserver
    }

    func data(for url: URL) async throws -> Data {
        let id = UUID()
        startsByURL[url, default: 0] += 1
        activeCount += 1
        maximumActiveCount = max(maximumActiveCount, activeCount)
        resumeStartWaiters()

        guard startsSuspended else {
            activeCount -= 1
            return data
        }

        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                pending[id] = PendingCall(url: url, continuation: continuation)
            }
        } onCancel: {
            Task { await self.cancel(id: id) }
        }
    }

    func startCount(for url: URL) -> Int {
        startsByURL[url, default: 0]
    }

    func cancellationCount(for url: URL) -> Int {
        cancellationsByURL[url, default: 0]
    }

    func waitForStarts(_ count: Int) async {
        guard totalStartCount < count else { return }
        await withCheckedContinuation { continuation in
            startWaiters.append((count, continuation))
        }
    }

    func waitForCancellation(of url: URL) async {
        guard cancellationsByURL[url, default: 0] == 0 else { return }
        await withCheckedContinuation { continuation in
            cancellationWaiters.append((url, continuation))
        }
    }

    func finishAll() {
        let calls = pending.values
        pending.removeAll()
        activeCount -= calls.count
        calls.forEach { $0.continuation.resume(returning: data) }
    }

    private func cancel(id: UUID) {
        guard let call = pending.removeValue(forKey: id) else { return }
        activeCount -= 1
        cancellationsByURL[call.url, default: 0] += 1
        call.continuation.resume(throwing: CancellationError())
        cancellationObserver?(call.url)

        let ready = cancellationWaiters.filter { $0.0 == call.url }
        cancellationWaiters.removeAll { $0.0 == call.url }
        ready.forEach { $0.1.resume() }
    }

    private func resumeStartWaiters() {
        let ready = startWaiters.filter { totalStartCount >= $0.0 }
        startWaiters.removeAll { totalStartCount >= $0.0 }
        ready.forEach { $0.1.resume() }
    }
}
