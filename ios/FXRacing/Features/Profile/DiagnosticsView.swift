import SwiftUI
import UIKit

/// Surfaces the in-memory FXLogStore so external testers can copy logs
/// without needing a USB-tethered Console.app session.
struct DiagnosticsView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var store = FXLogStore.shared
    @State private var copiedJustNow = false
    @State private var filter: FXLogCategory? = nil

    private var visible: [FXLogStore.Entry] {
        guard let filter else { return store.entries.reversed() }
        return store.entries.filter { $0.category == filter }.reversed()
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                categoryFilter
                    .padding(.horizontal, FXTheme.Spacing.md)
                    .padding(.vertical, 8)

                Divider()

                if visible.isEmpty {
                    ContentUnavailableView(
                        "No log entries",
                        systemImage: "doc.text",
                        description: Text("Use the app — network calls, sign-in, picks, and race loads will appear here.")
                    )
                } else {
                    List(visible) { entry in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 6) {
                                Text(entry.category.rawValue)
                                    .font(.caption2.weight(.bold))
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(badgeColor(entry.category))
                                    .foregroundStyle(.white)
                                    .clipShape(Capsule())
                                Text(entry.level.rawValue.uppercased())
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(levelColor(entry.level))
                                Spacer()
                                Text(timeString(entry.timestamp))
                                    .font(.caption2.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            }
                            Text(entry.message)
                                .font(.system(.footnote, design: .monospaced))
                                .textSelection(.enabled)
                        }
                        .padding(.vertical, 2)
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Diagnostics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button {
                            UIPasteboard.general.string = store.dump()
                            copiedJustNow = true
                            Task {
                                try? await Task.sleep(for: .seconds(1.5))
                                copiedJustNow = false
                            }
                        } label: {
                            Label(copiedJustNow ? "Copied!" : "Copy all (\(store.entries.count))",
                                  systemImage: copiedJustNow ? "checkmark" : "doc.on.doc")
                        }
                        ShareLink(item: store.dump()) {
                            Label("Share log", systemImage: "square.and.arrow.up")
                        }
                        Divider()
                        Button(role: .destructive) {
                            store.clear()
                        } label: {
                            Label("Clear", systemImage: "trash")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
            }
        }
    }

    private var categoryFilter: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterChip(label: "All", isOn: filter == nil) { filter = nil }
                ForEach([FXLogCategory.network, .auth, .race, .pick, .score, .sync, .ui], id: \.self) { cat in
                    filterChip(label: cat.rawValue, isOn: filter == cat) { filter = cat }
                }
            }
        }
    }

    private func filterChip(label: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.caption.weight(isOn ? .bold : .medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isOn ? FXTheme.Colors.accent : Color.secondary.opacity(0.15))
                .foregroundStyle(isOn ? FXTheme.Colors.onAccent : Color.primary)
                .clipShape(Capsule())
        }
    }

    private func badgeColor(_ cat: FXLogCategory) -> Color {
        switch cat {
        case .network: return .blue
        case .auth:    return .purple
        case .race:    return .orange
        case .pick:    return .green
        case .score:   return .pink
        case .sync:    return .teal
        case .ui:      return .gray
        }
    }

    private func levelColor(_ level: FXLogStore.Level) -> Color {
        switch level {
        case .debug: return .secondary
        case .info:  return .primary
        case .warn:  return .orange
        case .error: return .red
        }
    }

    private func timeString(_ d: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm:ss.SSS"
        return f.string(from: d)
    }
}
