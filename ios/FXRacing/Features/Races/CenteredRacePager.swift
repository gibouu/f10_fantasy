import SwiftUI

struct RacePagerGeometry: Equatable, Sendable {
    let cardWidth: CGFloat
    let sideInset: CGFloat
    let spacing: CGFloat = 18

    var adjacentPeek: CGFloat {
        0
    }

    init(viewportWidth: CGFloat) {
        let safeViewportWidth = max(0, viewportWidth)
        cardWidth = max(0, min(safeViewportWidth - 36, 430))
        sideInset = max(0, (safeViewportWidth - cardWidth) / 2)
    }

    func contentOffset(forCardAt index: Int, itemCount: Int) -> CGFloat {
        guard itemCount > 0 else { return 0 }
        let centeredIndex = min(max(index, 0), itemCount - 1)
        return CGFloat(centeredIndex) * (cardWidth + spacing)
    }
}

struct CenteredRacePager<Item: Identifiable, Content: View>: View
where Item.ID: Hashable {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let items: [Item]
    @Binding var selection: Item.ID?
    private let content: (Item) -> Content
    private let itemAccessibilityLabel: (Item) -> String

    @State private var viewportWidth: CGFloat = 320

    init(
        items: [Item],
        selection: Binding<Item.ID?>,
        itemAccessibilityLabel: @escaping (Item) -> String,
        @ViewBuilder content: @escaping (Item) -> Content
    ) {
        self.items = items
        _selection = selection
        self.itemAccessibilityLabel = itemAccessibilityLabel
        self.content = content
    }

    var body: some View {
        let geometry = RacePagerGeometry(viewportWidth: viewportWidth)

        ScrollView(.horizontal) {
            LazyHStack(spacing: geometry.spacing) {
                ForEach(items) { item in
                    content(item)
                        .frame(width: geometry.cardWidth)
                        .id(item.id)
                }
            }
            .scrollTargetLayout()
        }
        .scrollIndicators(.hidden)
        .contentMargins(
            .horizontal,
            geometry.sideInset,
            for: .scrollContent
        )
        .scrollTargetBehavior(.viewAligned(limitBehavior: .always))
        .scrollPosition(id: $selection)
        .background {
            GeometryReader { proxy in
                Color.clear
                    .preference(
                        key: RacePagerViewportWidthKey.self,
                        value: proxy.size.width
                    )
            }
        }
        .onPreferenceChange(RacePagerViewportWidthKey.self) { width in
            guard width > 0, width != viewportWidth else { return }
            viewportWidth = width
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(selectedAccessibilityLabel)
        .accessibilityValue(accessibilityPosition)
        .accessibilityAdjustableAction(adjustSelection)
    }

    private var selectedAccessibilityLabel: String {
        guard let selectedItem else { return "Races" }
        return itemAccessibilityLabel(selectedItem)
    }

    private var selectedItem: Item? {
        items.first { $0.id == selection } ?? items.first
    }

    private var accessibilityPosition: String {
        guard !items.isEmpty else { return "No races" }
        let index = items.firstIndex { $0.id == selection } ?? 0
        return "Race \(index + 1) of \(items.count)"
    }

    private func adjustSelection(_ direction: AccessibilityAdjustmentDirection) {
        guard !items.isEmpty else { return }

        let nextIndex: Int
        switch direction {
        case .increment:
            let currentIndex = items.firstIndex { $0.id == selection } ?? -1
            nextIndex = min(currentIndex + 1, items.count - 1)
        case .decrement:
            let currentIndex = items.firstIndex { $0.id == selection } ?? items.count
            nextIndex = max(currentIndex - 1, 0)
        @unknown default:
            return
        }

        if reduceMotion {
            selection = items[nextIndex].id
        } else {
            withAnimation(.snappy) {
                selection = items[nextIndex].id
            }
        }
    }
}

private struct RacePagerViewportWidthKey: PreferenceKey {
    static let defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        let proposedValue = nextValue()
        if proposedValue > 0 {
            value = proposedValue
        }
    }
}
