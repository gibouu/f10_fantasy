import SwiftUI

struct StatusBadge: View {
    let status: RaceStatus

    var body: some View {
        Text(label)
            .font(.system(size: 10, weight: .bold))
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(bg)
            .foregroundStyle(fg)
            .cornerRadius(6)
    }

    private var label: String {
        switch status {
        case .upcoming:  return "UPCOMING"
        case .live:      return "LIVE"
        case .completed: return "DONE"
        case .cancelled: return "CANCELLED"
        }
    }

    private var bg: Color {
        switch status {
        case .upcoming:  return .secondary.opacity(0.15)
        case .live:      return FXTheme.Colors.danger.opacity(0.15)
        case .completed: return FXTheme.Colors.accent.opacity(0.15)
        case .cancelled: return .secondary.opacity(0.1)
        }
    }

    private var fg: Color {
        switch status {
        case .upcoming:  return .secondary
        case .live:      return FXTheme.Colors.danger
        case .completed: return FXTheme.Colors.accent
        case .cancelled: return .secondary
        }
    }
}
