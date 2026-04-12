import SwiftUI

struct DriverPickerSheet: View {
    let slot: PickSlot
    let entrants: [Driver]
    let onSelect: (Driver) -> Void

    @Environment(\.dismiss) private var dismiss

    /// Drivers grouped by team slug (falls back to constructor name), sorted alphabetically.
    /// Merges constructors that share the same slug (e.g. "Racing Bulls" + "Visa CashApp RB").
    private var grouped: [(name: String, color: Color, drivers: [Driver])] {
        // Use slug as key when available; fall back to constructor name
        let key: (Driver) -> String = { d in d.constructor.slug ?? d.constructor.name }
        let displayName: (Driver) -> String = { d in
            // Prefer the canonical team name from slug, else constructor name
            switch d.constructor.slug {
            case "racing-bulls":   return "Racing Bulls"
            case "red-bull":       return "Red Bull Racing"
            case "aston-martin":   return "Aston Martin"
            default:               return d.constructor.name
            }
        }
        return Dictionary(grouping: entrants, by: key)
            .sorted { $0.key < $1.key }
            .compactMap { group -> (name: String, color: Color, drivers: [DriverSummary])? in
                guard let first = group.value.first else { return nil }
                return (
                    name: displayName(first),
                    color: first.teamColor,
                    drivers: group.value.sorted { $0.number < $1.number }
                )
            }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(grouped, id: \.name) { group in
                    Section {
                        ForEach(group.drivers) { driver in
                            driverRow(driver)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    Haptics.select()
                                    onSelect(driver)
                                    dismiss()
                                }
                        }
                    } header: {
                        HStack(spacing: 6) {
                            Circle().fill(group.color).frame(width: 8, height: 8)
                            Text(group.name)
                        }
                    }
                }
            }
            .navigationTitle(slot.sheetTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func driverRow(_ driver: Driver) -> some View {
        HStack(spacing: 12) {
            // Team logo on team-colour background
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(driver.teamColor)
                    .frame(width: 40, height: 40)

                if let logoURL = driver.constructor.logoFullURL {
                    AsyncImage(url: logoURL) { phase in
                        if case .success(let img) = phase {
                            img.resizable().scaledToFit().padding(6)
                        }
                    }
                    .frame(width: 40, height: 40)
                }
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(driver.code)
                    .font(.subheadline)
                    .fontWeight(.bold)
                Text("\(driver.firstName) \(driver.lastName)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Text("#\(driver.number)")
                .font(.footnote)
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}
