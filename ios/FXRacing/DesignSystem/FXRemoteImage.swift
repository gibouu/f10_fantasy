import SwiftUI
import UIKit

private enum FXImagePipelineEnvironmentKey: EnvironmentKey {
    /// A single process-wide fallback for previews and isolated views.
    /// The app replaces this with its own explicitly owned instance at the root.
    static let defaultValue = FXImagePipeline()
}

extension EnvironmentValues {
    var fxImagePipeline: FXImagePipeline {
        get { self[FXImagePipelineEnvironmentKey.self] }
        set { self[FXImagePipelineEnvironmentKey.self] = newValue }
    }
}

/// A cancellation-aware remote image backed by the app's shared decoded-image pipeline.
struct FXRemoteImage<Placeholder: View>: View {
    @Environment(\.displayScale) private var displayScale
    @Environment(\.fxImagePipeline) private var imagePipeline

    private let url: URL?
    private let width: CGFloat
    private let height: CGFloat
    private let contentMode: FXImageContentMode
    private let loadedAccessibilityIdentifier: String?
    private let placeholder: () -> Placeholder

    @State private var loadedImage: LoadedImage?

    init(
        url: URL?,
        width: CGFloat,
        height: CGFloat,
        contentMode: FXImageContentMode,
        loadedAccessibilityIdentifier: String? = nil,
        @ViewBuilder placeholder: @escaping () -> Placeholder
    ) {
        self.url = url
        self.width = width
        self.height = height
        self.contentMode = contentMode
        self.loadedAccessibilityIdentifier = loadedAccessibilityIdentifier
        self.placeholder = placeholder
    }

    var body: some View {
        Group {
            if let request,
               let loadedImage,
               loadedImage.request == request {
                renderedImage(loadedImage.image)
            } else {
                placeholder()
            }
        }
        .frame(width: width, height: height)
        .clipped()
        .task(id: request) {
            await load(request)
        }
    }

    private var request: FXImageRequest? {
        guard let url else { return nil }
        let scale = max(1, displayScale)
        return FXImageRequest(
            url: url,
            pixelWidth: max(1, Int(ceil(width * scale))),
            pixelHeight: max(1, Int(ceil(height * scale))),
            scale: scale,
            contentMode: contentMode
        )
    }

    private var swiftUIContentMode: ContentMode {
        switch contentMode {
        case .fit: .fit
        case .fill: .fill
        }
    }

    @ViewBuilder
    private func renderedImage(_ image: UIImage) -> some View {
        if let loadedAccessibilityIdentifier {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: swiftUIContentMode)
                .accessibilityLabel("Image loaded")
                .accessibilityIdentifier(loadedAccessibilityIdentifier)
        } else {
            Image(uiImage: image)
                .resizable()
                .aspectRatio(contentMode: swiftUIContentMode)
                .accessibilityHidden(true)
        }
    }

    @MainActor
    private func load(_ request: FXImageRequest?) async {
        guard let request else {
            loadedImage = nil
            return
        }

        do {
            let image = try await imagePipeline.image(for: request)
            guard !Task.isCancelled else { return }
            loadedImage = LoadedImage(request: request, image: image)
        } catch is CancellationError {
            // SwiftUI cancels work automatically when a row disappears or changes identity.
        } catch {
            guard !Task.isCancelled, loadedImage?.request == request else { return }
            loadedImage = nil
        }
    }
}

extension FXRemoteImage where Placeholder == Color {
    init(
        url: URL?,
        width: CGFloat,
        height: CGFloat,
        contentMode: FXImageContentMode,
        loadedAccessibilityIdentifier: String? = nil
    ) {
        self.init(
            url: url,
            width: width,
            height: height,
            contentMode: contentMode,
            loadedAccessibilityIdentifier: loadedAccessibilityIdentifier
        ) {
            Color.clear
        }
    }
}

private struct LoadedImage {
    let request: FXImageRequest
    let image: UIImage
}
