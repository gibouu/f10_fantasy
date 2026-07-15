import SwiftUI

struct DriverPickerSheet: View {
    private enum PickerFocusTarget: Hashable {
        case slotHeading
        case driver(String)
    }

    @Environment(\.dismiss) private var dismiss
    @Binding private var state: DriverPickerState
    @AccessibilityFocusState private var focusTarget: PickerFocusTarget?

    private let entrants: [Driver]
    private let onSelect: (Driver, PickSlot) -> Bool

    init(
        state: Binding<DriverPickerState>,
        entrants: [Driver],
        onSelect: @escaping (Driver, PickSlot) -> Bool
    ) {
        _state = state
        self.entrants = entrants
        self.onSelect = onSelect
    }

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
            .compactMap { group -> (name: String, color: Color, drivers: [Driver])? in
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
                Text("Choose a driver for \(state.activeSlot.label)")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityFocused($focusTarget, equals: .slotHeading)

                ForEach(grouped, id: \.name) { group in
                    Section {
                        ForEach(group.drivers) { driver in
                            Button {
                                select(driver)
                            } label: {
                                driverRow(driver)
                            }
                            .buttonStyle(.plain)
                            .disabled(!state.isAvailable(driver))
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel(
                                "\(driver.firstName) \(driver.lastName), number \(driver.number)"
                            )
                            .accessibilityValue(accessibilityValue(for: driver))
                            .accessibilityHint(accessibilityHint(for: driver))
                            .accessibilityIdentifier("driver-\(driver.id)")
                            .accessibilityFocused(
                                $focusTarget,
                                equals: .driver(driver.id)
                            )
                        }
                    } header: {
                        HStack(spacing: 6) {
                            Circle().fill(group.color).frame(width: 8, height: 8)
                            Text(group.name)
                        }
                    }
                }
            }
            .navigationTitle(state.activeSlot.sheetTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func driverRow(_ driver: Driver) -> some View {
        HStack(spacing: 12) {
            // Team logo on team-colour background
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(driver.teamColor)
                    .frame(width: 40, height: 40)

                if let logoURL = driver.constructor.logoFullURL {
                    FXRemoteImage(
                        url: logoURL,
                        width: 28,
                        height: 28,
                        contentMode: .fit,
                        loadedAccessibilityIdentifier: loadedImageAccessibilityIdentifier(
                            for: driver
                        )
                    )
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

            if state.selectedDriverIDs[state.activeSlot] == driver.id {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.tint)
            }
        }
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }

    private func select(_ driver: Driver) {
        let selectedSlot = state.activeSlot
        var updatedState = state

        guard updatedState.select(driver) else {
            Haptics.locked()
            let message = state.unavailabilityReason(for: driver) ?? "This driver is unavailable."
            AccessibilityNotification.Announcement(message).post()
            return
        }

        guard onSelect(driver, selectedSlot) else {
            Haptics.locked()
            AccessibilityNotification.Announcement(
                "Picks are locked. Your selection was not changed."
            ).post()
            return
        }

        Haptics.select()
        state = updatedState

        if let nextSlot = selectedSlot.next {
            focusTarget = .slotHeading
            AccessibilityNotification.Announcement(
                "\(selectedSlot.label) selected. Now choose \(nextSlot.label)."
            ).post()
        } else {
            focusTarget = .driver(driver.id)
            AccessibilityNotification.Announcement(
                "DNF selected. All three picks are complete."
            ).post()
        }
    }

    private func accessibilityValue(for driver: Driver) -> String {
        guard let selectedSlot = PickSlot.allCases.first(where: {
            state.selectedDriverIDs[$0] == driver.id
        }) else {
            return ""
        }

        return "Selected for \(selectedSlot.label)"
    }

    private func accessibilityHint(for driver: Driver) -> String {
        state.unavailabilityReason(for: driver)
            ?? "Select for \(state.activeSlot.label)."
    }

    private func loadedImageAccessibilityIdentifier(for driver: Driver) -> String? {
#if FX_PERF_HARNESS
        "driver-image-\(driver.id)-loaded"
#else
        nil
#endif
    }
}
