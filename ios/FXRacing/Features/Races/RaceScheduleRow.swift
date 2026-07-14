import Foundation

struct RaceScheduleRow: Identifiable, Equatable, Sendable {
    enum Kind: String, Equatable, Sendable {
        case qualifying
        case bonusCutoff
        case lockCutoff
        case eventStart
    }

    let kind: Kind
    let title: String
    let date: Date
    let systemImage: String

    var id: Kind { kind }

    var accessibilityIdentifier: String {
        switch kind {
        case .qualifying: "schedule-qualifying"
        case .bonusCutoff: "schedule-bonus-cutoff"
        case .lockCutoff: "schedule-lock-cutoff"
        case .eventStart: "schedule-event-start"
        }
    }

    static func resolve(for race: Race) -> [RaceScheduleRow] {
        var rows: [RaceScheduleRow] = []

        if let qualifyingStartUtc = race.qualifyingStartUtc {
            rows.append(
                RaceScheduleRow(
                    kind: .qualifying,
                    title: race.isSprint ? "Sprint Shootout" : "Qualifying",
                    date: qualifyingStartUtc,
                    systemImage: "timer"
                )
            )
            rows.append(
                RaceScheduleRow(
                    kind: .bonusCutoff,
                    title: "2× bonus cutoff",
                    date: qualifyingStartUtc,
                    systemImage: "sparkles"
                )
            )
        }

        rows.append(
            RaceScheduleRow(
                kind: .lockCutoff,
                title: "Picks lock",
                date: race.lockCutoffUtc,
                systemImage: "lock.fill"
            )
        )
        rows.append(
            RaceScheduleRow(
                kind: .eventStart,
                title: race.isSprint ? "Sprint start" : "Race start",
                date: race.scheduledStartUtc,
                systemImage: "flag.2.crossed.fill"
            )
        )

        return rows
    }
}
