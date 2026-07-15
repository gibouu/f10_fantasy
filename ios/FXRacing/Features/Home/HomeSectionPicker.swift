import SwiftUI

enum MainShellSection: String, CaseIterable, Identifiable {
    case upcoming = "Upcoming"
    case past = "Past"
    case rankings = "Rankings"

    var id: Self { self }
}

struct HomeSectionPicker: View {
    @Binding var selection: MainShellSection

    var body: some View {
        Picker("Section", selection: $selection) {
            ForEach(MainShellSection.allCases) { section in
                Text(section.rawValue).tag(section)
            }
        }
        .pickerStyle(.segmented)
        .accessibilityIdentifier("home-section-picker")
    }
}
