import SwiftUI

struct RaceDetailView: View {
    let raceId: String
    @Environment(AuthManager.self) private var authManager
    @Environment(LocalPickStore.self) private var localPickStore
    @Environment(TutorialStore.self) private var tutorialStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var viewModel: RaceDetailViewModel
    @State private var activeSlot: PickSlot?
    @State private var showSignIn = false

    init(raceId: String) {
        self.raceId = raceId
        _viewModel = State(initialValue: RaceDetailViewModel(raceId: raceId))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                if viewModel.isLoading && viewModel.race == nil {
                    raceDetailSkeleton
                } else if let err = viewModel.errorMessage, viewModel.race == nil {
                    RetryView(message: err) { await viewModel.load(token: authManager.accessToken, localPickStore: localPickStore) }
                        .padding(.top, 40)
                } else if let race = viewModel.race {
                    raceHeader(race)
                    picksCard(race)
                    if race.status == .completed {
                        resultsCard
                    }
                    qualifyingCard(race)
                }
            }
            .padding(FXTheme.Spacing.md)
        }
        .navigationTitle(viewModel.race?.name ?? "Race")
        .navigationBarTitleDisplayMode(.large)
        .task { await viewModel.load(token: authManager.accessToken, localPickStore: localPickStore) }
        .onChange(of: scenePhase) { _, phase in
            // Reload when returning to foreground — catches the case where
            // the user backgrounded the app before lock cutoff and resumed
            // after; ensures the lock banner + race status reflect reality.
            guard phase == .active else { return }
            Task { await viewModel.load(token: authManager.accessToken, localPickStore: localPickStore) }
        }
        .onChange(of: viewModel.serverPick?.scoreBreakdown?.totalScore) { _, score in
            if score != nil, viewModel.race?.status == .completed {
                Haptics.scoreReveal()
            }
        }
        .sheet(item: $activeSlot) { slot in
            DriverPickerSheet(slot: slot, entrants: viewModel.entrants) { driver in
                viewModel.select(driver: driver, for: slot)
            }
        }
        .sheet(isPresented: $showSignIn) {
            SignInPromptView(reason: "Sign in to sync your picks and track your score against friends.")
        }
        .safeAreaInset(edge: .bottom) {
            if !tutorialStore.hasSeenPickTutorial && !authManager.isAuthenticated,
               let race = viewModel.race, race.status != .completed, !race.isLocked {
                TutorialCard(
                    icon: "hand.tap.fill",
                    title: "Make your picks",
                    message: "P1 = race winner · P10 = 10th place · DNF = first retirement. Tap each circle to choose your driver."
                ) {
                    withAnimation(.spring(duration: 0.3)) {
                        tutorialStore.hasSeenPickTutorial = true
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    // MARK: - Detail skeleton

    private var raceDetailSkeleton: some View {
        VStack(spacing: 16) {
            // Header card skeleton
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    SkeletonView(width: 60, height: 12)
                    Spacer()
                    SkeletonView(width: 70, height: 22, cornerRadius: 11)
                }
                HStack(spacing: 10) {
                    SkeletonView(width: 40, height: 40, cornerRadius: 8)
                    VStack(alignment: .leading, spacing: 6) {
                        SkeletonView(width: 160, height: 14)
                        SkeletonView(width: 100, height: 11)
                    }
                }
            }
            .padding(FXTheme.Spacing.md)
            .background(FXTheme.Colors.surface)
            .cornerRadius(FXTheme.Radius.lg)

            // Picks card skeleton
            VStack(spacing: 16) {
                SkeletonView(width: 80, height: 14)
                HStack {
                    Spacer()
                    ForEach(0..<3, id: \.self) { _ in
                        SkeletonView(width: 64, height: 64, cornerRadius: 32)
                        Spacer()
                    }
                }
                SkeletonView(height: 50, cornerRadius: FXTheme.Radius.md)
            }
            .padding(FXTheme.Spacing.md)
            .background(FXTheme.Colors.surface)
            .cornerRadius(FXTheme.Radius.lg)
        }
    }

    // MARK: - Race header card

    @ViewBuilder
    private func raceHeader(_ race: Race) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Round \(race.round)")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                    .tracking(1)
                if race.isSprint {
                    Text("SPRINT")
                        .font(.system(size: 10, weight: .black))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(FXTheme.Colors.gold.opacity(0.18))
                        .foregroundStyle(FXTheme.Colors.gold)
                        .cornerRadius(4)
                }
                Spacer()
                StatusBadge(status: race.status)
            }

            HStack(spacing: 10) {
                Text(race.flagEmoji).font(.largeTitle)
                VStack(alignment: .leading, spacing: 2) {
                    Text(race.circuitName)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(
                        race.scheduledStartUtc.formatted(
                            .dateTime.weekday(.abbreviated).month(.abbreviated).day().hour().minute()
                        )
                    )
                    .font(.caption)
                    .foregroundStyle(Color(uiColor: .tertiaryLabel))
                }
            }
        }
        .padding(FXTheme.Spacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fxCardSurface()
    }

    // MARK: - Picks card

    @ViewBuilder
    private func picksCard(_ race: Race) -> some View {
        // TimelineView ticks every 30s while visible so the lock banner +
        // bubble-disabled state flip the instant `Date() >= lockCutoffUtc`,
        // even if the user is sitting on this screen when lock crosses.
        TimelineView(.periodic(from: .now, by: 30)) { context in
            picksCardContent(race, now: context.date)
        }
    }

    @ViewBuilder
    private func picksCardContent(_ race: Race, now: Date) -> some View {
        let isLocked = now >= race.lockCutoffUtc || viewModel.serverPick?.lockedAt != nil
        let isCompleted = race.status == .completed
        let hasAnyPick = viewModel.serverPick != nil || localPickStore.pick(for: raceId) != nil

        // Resolve actual result drivers for each slot
        let driverMap = Dictionary(uniqueKeysWithValues: viewModel.entrants.map { ($0.id, $0) })
        let actualWinner = viewModel.results.first { $0.status == .classified && $0.position == 1 }.flatMap { driverMap[$0.driverId] }
        let actualP10    = viewModel.results.first { $0.status == .classified && $0.position == 10 }.flatMap { driverMap[$0.driverId] }
        let actualDNF    = viewModel.results.first { $0.status == .dnf }.flatMap { driverMap[$0.driverId] }

        VStack(spacing: 16) {
            HStack {
                Text("Your Picks").font(.headline)
                Spacer()
                if isLocked && !isCompleted {
                    Label("Locked", systemImage: "lock.fill")
                        .font(.caption).foregroundStyle(.secondary)
                } else if viewModel.isLocalOnly {
                    Label("Saved locally", systemImage: "internaldrive")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }

            // Visible lock-cutoff banner — pre-lock countdown or post-lock notice
            if !isCompleted {
                cutoffBanner(race: race, isLocked: isLocked, now: now)
            }

            // Three pick bubbles
            HStack(alignment: .top) {
                Spacer()
                slotBubble(slot: .winner, race: race, isLocked: isLocked, actualResult: actualWinner)
                Spacer()
                slotBubble(slot: .p10,    race: race, isLocked: isLocked, actualResult: actualP10)
                Spacer()
                slotBubble(slot: .dnf,    race: race, isLocked: isLocked, actualResult: actualDNF)
                Spacer()
            }

            // Show the early-bird bonus on completed races
            if isCompleted,
               let bonus = viewModel.serverPick?.scoreBreakdown?.earlyBirdBonus,
               bonus > 0 {
                HStack(spacing: 6) {
                    Image(systemName: "sparkles")
                        .font(.caption.weight(.bold))
                    Text("Early-bird 2x bonus locked in: +\(bonus) pts")
                        .font(.caption.weight(.semibold))
                    Spacer()
                }
                .foregroundStyle(Color(red: 0.18, green: 0.78, blue: 0.35))
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(Color(red: 0.18, green: 0.78, blue: 0.35).opacity(0.10))
                .cornerRadius(FXTheme.Radius.sm)
            }

            // Pre-lock early-bird CTA / status banner
            if !isLocked && !isCompleted {
                earlyBirdBanner(race: race)
            }

            if !isLocked && !isCompleted {
                if let err = viewModel.errorMessage {
                    Text(err)
                        .font(.footnote)
                        .foregroundStyle(FXTheme.Colors.danger)
                        .multilineTextAlignment(.center)
                }

                Button {
                    Task { await viewModel.submit(token: authManager.accessToken, localPickStore: localPickStore) }
                } label: {
                    Group {
                        if viewModel.isSubmitting {
                            ProgressView().tint(FXTheme.Colors.onAccent)
                        } else if viewModel.submitSuccess {
                            Label("Picks Saved!", systemImage: "checkmark").fontWeight(.bold)
                        } else {
                            Text(hasAnyPick ? "Update Picks" : "Save Picks").fontWeight(.bold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(viewModel.canSave ? FXTheme.Colors.accent : Color.secondary.opacity(0.2))
                    .foregroundStyle(viewModel.canSave ? FXTheme.Colors.onAccent : .secondary)
                    .cornerRadius(FXTheme.Radius.md)
                }
                .disabled(!viewModel.canSave || viewModel.isSubmitting)

                // Guest sync nudge — only show after a local pick exists
                if viewModel.isLocalOnly && !authManager.isAuthenticated {
                    Button {
                        showSignIn = true
                    } label: {
                        Label("Sign in to sync your picks", systemImage: "arrow.up.circle")
                            .font(.footnote)
                            .foregroundStyle(FXTheme.Colors.accent)
                    }
                    .buttonStyle(.plain)
                }
            } else if isLocked && !isCompleted {
                // Race is locked but not yet completed — picks are frozen until
                // results land. Hard-stop messaging in case any tap path falls
                // through (defense in depth alongside .disabled bubbles).
                if let err = viewModel.errorMessage {
                    Text(err)
                        .font(.footnote)
                        .foregroundStyle(FXTheme.Colors.danger)
                        .multilineTextAlignment(.center)
                }
            }
        }
        .padding(FXTheme.Spacing.md)
        .fxCardSurface()
    }

    @ViewBuilder
    private func earlyBirdBanner(race: Race) -> some View {
        if let qualifyingStart = race.qualifyingStartUtc, qualifyingStart > Date() {
            // Quali still in the future — encourage user to lock in for 2x.
            HStack(spacing: 8) {
                Image(systemName: "bolt.fill")
                    .font(.caption.weight(.bold))
                Group {
                    Text("Lock in before \(qualifyingStart.formatted(date: .abbreviated, time: .shortened)) for ")
                        .font(.caption)
                    + Text("2x bonus").font(.caption.weight(.bold))
                }
                Spacer(minLength: 0)
            }
            .foregroundStyle(FXTheme.Colors.accent)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(FXTheme.Colors.accent.opacity(0.10))
            .cornerRadius(FXTheme.Radius.sm)
        }
    }

    @ViewBuilder
    private func cutoffBanner(race: Race, isLocked: Bool, now: Date) -> some View {
        if isLocked {
            HStack(spacing: 10) {
                Image(systemName: "lock.fill")
                    .font(.subheadline.weight(.semibold))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Picks closed")
                        .font(.subheadline.weight(.semibold))
                    Text("Race starts \(race.scheduledStartUtc.formatted(date: .abbreviated, time: .shortened))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(FXTheme.Colors.danger.opacity(0.10))
            .foregroundStyle(FXTheme.Colors.danger)
            .cornerRadius(FXTheme.Radius.sm)
        } else {
            HStack(spacing: 10) {
                Image(systemName: "clock")
                    .font(.subheadline.weight(.semibold))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Picks lock \(race.lockCutoffUtc.formatted(date: .abbreviated, time: .shortened))")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                    Text(timeUntilString(target: race.lockCutoffUtc, now: now))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.vertical, 10)
            .padding(.horizontal, 12)
            .background(FXTheme.Colors.gold.opacity(0.14))
            .foregroundStyle(FXTheme.Colors.gold)
            .cornerRadius(FXTheme.Radius.sm)
        }
    }

    private func timeUntilString(target: Date, now: Date) -> String {
        let interval = target.timeIntervalSince(now)
        if interval <= 60 { return "Locking now…" }
        if interval < 3600 { return "Locks in \(Int(interval / 60)) min" }
        let hours = Int(interval / 3600)
        let mins  = Int(interval.truncatingRemainder(dividingBy: 3600) / 60)
        if hours < 24 { return "Locks in \(hours)h \(mins)m" }
        let days = hours / 24
        return "Locks in \(days)d \(hours % 24)h"
    }

    @ViewBuilder
    private func slotBubble(slot: PickSlot, race: Race, isLocked: Bool, actualResult: Driver? = nil) -> some View {
        let driver: Driver? = {
            switch slot {
            case .winner: viewModel.selectedWinner
            case .p10:    viewModel.selectedP10
            case .dnf:    viewModel.selectedDNF
            }
        }()
        let size: CGFloat = slot == .p10 ? 72 : 58
        let score: Int? = {
            guard let sb = viewModel.serverPick?.scoreBreakdown else { return nil }
            switch slot {
            case .winner: return sb.winnerBonus
            case .p10:    return sb.tenthPlaceScore
            case .dnf:    return sb.dnfBonus
            }
        }()
        let isCompleted = race.status == .completed
        // A DNF pick is correct if the driver did NOT finish (any non-classified outcome)
        let isCorrect: Bool = {
            guard isCompleted, let d = driver else { return false }
            if slot == .dnf {
                return viewModel.results.contains { $0.driverId == d.id && $0.status != .classified }
            }
            return d.id == actualResult?.id
        }()
        let resultSize: CGFloat = 30
        // Extra padding so the bottom-right result bubble doesn't clip
        let pad: CGFloat = isCompleted && actualResult != nil && !isCorrect ? resultSize * 0.4 : 0

        // Ring colour for correct picks
        let ringColor: Color = slot == .p10 ? FXTheme.Colors.gold
                             : slot == .winner ? Color(red: 0.18, green: 0.78, blue: 0.35)
                             : FXTheme.Colors.danger

        VStack(spacing: 4) {
            Button {
                if !isLocked {
                    Haptics.pick()
                    activeSlot = slot
                }
            } label: {
                DriverBubbleView(driver: driver, size: size)
                    // Coloured ring when pick is correct
                    .overlay(
                        Circle()
                            .stroke(isCorrect ? ringColor : Color.clear, lineWidth: 3)
                    )
                    // Add indicator (bottom-right) when no pick and not locked
                    .overlay(alignment: .bottomTrailing) {
                        if driver == nil && !isLocked { addIndicator }
                    }
                    // Score badge (top-left) for completed races
                    .overlay(alignment: .topLeading) {
                        if isCompleted, let score {
                            scoreBadge(score: score, slot: slot, caps: race.scoreCaps)
                                .offset(x: -6, y: -6)
                        }
                    }
                    // Actual result bubble (bottom-right) — only when pick differs from actual
                    .overlay(alignment: .bottomTrailing) {
                        if isCompleted, let actual = actualResult, !isCorrect {
                            DriverBubbleView(driver: actual, size: resultSize)
                                .overlay(Circle().stroke(Color(uiColor: .systemBackground), lineWidth: 2))
                                .offset(x: pad, y: pad)
                        }
                    }
                    // Extra space so bottom-right bubble is visible
                    .padding(.bottom, pad)
                    .padding(.trailing, pad)
            }
            .buttonStyle(.plain)
            .disabled(isLocked)

            Text(slot.label)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(FXTheme.Colors.textTertiary)
                .textCase(.uppercase)
                .tracking(1.5)
        }
    }

    private var addIndicator: some View {
        Circle()
            .fill(FXTheme.Colors.accent)
            .frame(width: 20, height: 20)
            .overlay(
                Image(systemName: "plus")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(FXTheme.Colors.onAccent)
            )
    }

    /// Score badge shown in the top-left corner of each pick bubble after results.
    private func scoreBadge(score: Int, slot: PickSlot, caps: ScoreCaps) -> some View {
        let cap = switch slot {
            case .winner: caps.winner
            case .p10:    caps.p10
            case .dnf:    caps.dnf
        }
        let isExact = score == cap
        let color: Color = isExact && slot == .p10    ? FXTheme.Colors.gold
                         : isExact && slot == .winner  ? Color(red: 0.18, green: 0.78, blue: 0.35)
                         : isExact && slot == .dnf     ? FXTheme.Colors.danger
                         : score > 0                   ? Color.primary.opacity(0.7)
                         : Color.secondary.opacity(0.45)

        return Text("+\(score)")
            .font(.system(size: 11, weight: .black, design: .rounded))
            .foregroundStyle(color)
            .padding(.horizontal, 5)
            .padding(.vertical, 3)
            .background(.ultraThinMaterial)
            .clipShape(Capsule())
            .shadow(color: color.opacity(0.5), radius: 3, x: 0, y: 1)
    }

    // MARK: - Qualifying card

    @ViewBuilder
    private func qualifyingCard(_ race: Race) -> some View {
        if !viewModel.qualifyingResults.isEmpty {
            let driverMap = Dictionary(uniqueKeysWithValues: viewModel.entrants.map { ($0.id, $0) })
            let sorted = viewModel.qualifyingResults.sorted { $0.position < $1.position }
            let header = race.isSprint ? "Sprint Qualifying Results" : "Qualifying Results"

            VStack(alignment: .leading, spacing: 0) {
                Text(header)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, FXTheme.Spacing.md)
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Rectangle()
                    .fill(Color.secondary.opacity(0.2))
                    .frame(height: 0.5)

                ForEach(sorted, id: \.driverId) { row in
                    qualifyingRow(row: row, driver: driverMap[row.driverId])
                }
            }
            .fxCardSurface()
        }
    }

    @ViewBuilder
    private func qualifyingRow(row: QualifyingResultRow, driver: Driver?) -> some View {
        let isPole = row.position == 1
        HStack(spacing: 10) {
            Text("P\(row.position)")
                .font(.system(size: 11, weight: .bold, design: .monospaced))
                .foregroundStyle(isPole ? FXTheme.Colors.gold : Color(uiColor: .tertiaryLabel))
                .frame(width: 32, alignment: .leading)

            DriverBubbleView(driver: driver, size: 28)

            Text(driver?.code ?? "???")
                .font(.subheadline.weight(.semibold))

            Text(driver.map { "\($0.firstName) \($0.lastName)" } ?? "")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            Spacer()
        }
        .padding(.horizontal, FXTheme.Spacing.md)
        .padding(.vertical, 8)
        .background(isPole ? FXTheme.Colors.gold.opacity(0.08) : Color.clear)
    }

    // MARK: - Results card

    @ViewBuilder
    private var resultsCard: some View {
        let driverMap = Dictionary(uniqueKeysWithValues: viewModel.entrants.map { ($0.id, $0) })
        let classified = viewModel.results
            .filter { $0.status == .classified }
            .sorted { ($0.position ?? 999) < ($1.position ?? 999) }
        let nonClassified = viewModel.results
            .filter { $0.status != .classified }
            .sorted { ($0.position ?? 999) < ($1.position ?? 999) }

        // User's picks for highlighting
        let pickedWinnerId  = viewModel.serverPick?.winnerDriverId   ?? viewModel.selectedWinner?.id
        let pickedP10Id     = viewModel.serverPick?.tenthPlaceDriverId ?? viewModel.selectedP10?.id
        let pickedDNFId     = viewModel.serverPick?.dnfDriverId       ?? viewModel.selectedDNF?.id

        if !classified.isEmpty || !nonClassified.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Results")
                    .font(.headline)
                    .padding(.horizontal, 2)

                VStack(spacing: 4) {
                    ForEach(classified, id: \.driverId) { result in
                        if let driver = driverMap[result.driverId] {
                            let isP10 = result.position == 10
                            let isWinner = result.position == 1
                            let isUserPick = driver.id == pickedWinnerId || driver.id == pickedP10Id
                            let pts = potentialScore(result: result)
                            resultRow(
                                result: result,
                                driver: driver,
                                isP10: isP10,
                                isWinner: isWinner,
                                isUserPick: isUserPick,
                                slotLabel: isWinner ? "P1" : isP10 ? "P10" : nil,
                                potentialScore: pts
                            )
                        }
                    }

                    if !nonClassified.isEmpty {
                        HStack {
                            Rectangle().fill(Color.secondary.opacity(0.2)).frame(height: 1)
                            Text("DNF · DNS · DSQ")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(Color(uiColor: .tertiaryLabel))
                                .fixedSize()
                            Rectangle().fill(Color.secondary.opacity(0.2)).frame(height: 1)
                        }
                        .padding(.vertical, 4)

                        ForEach(nonClassified, id: \.driverId) { result in
                            if let driver = driverMap[result.driverId] {
                                let isUserPick = driver.id == pickedDNFId
                                let pts = potentialScore(result: result)
                                resultRow(
                                    result: result,
                                    driver: driver,
                                    isP10: false,
                                    isWinner: false,
                                    isUserPick: isUserPick,
                                    slotLabel: "DNF",
                                    potentialScore: pts
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    /// Points you'd earn for picking this driver in the relevant slot.
    /// The server owns this score guide so the iOS UI cannot drift from stored scoring.
    private func potentialScore(result: RaceResult) -> (pts: Int, color: Color) {
        if result.status == .classified {
            guard let pos = result.position else { return (0, Color(uiColor: .tertiaryLabel)) }
            if pos == 1 {
                return (result.scoreGuide?.winner ?? 0, Color(red: 0.18, green: 0.78, blue: 0.35))
            }
            let score = result.scoreGuide?.p10 ?? 0
            let color: Color = pos == 10 ? FXTheme.Colors.gold : score > 0 ? .primary : Color(uiColor: .tertiaryLabel)
            return (score, color)
        }
        return (result.scoreGuide?.dnf ?? 0, FXTheme.Colors.danger)
    }

    @ViewBuilder
    private func resultRow(
        result: RaceResult,
        driver: Driver,
        isP10: Bool,
        isWinner: Bool,
        isUserPick: Bool,
        slotLabel: String?,
        potentialScore: (pts: Int, color: Color)
    ) -> some View {
        HStack(spacing: 10) {
            // Potential score column (left side)
            Group {
                if potentialScore.pts > 0 {
                    Text("+\(potentialScore.pts)")
                        .font(.system(size: 11, weight: .black, design: .rounded))
                        .foregroundStyle(potentialScore.color)
                        .shadow(color: potentialScore.color.opacity(0.5), radius: 2, x: 0, y: 1)
                } else {
                    Text("—")
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(.quaternary)
                }
            }
            .frame(width: 30, alignment: .trailing)

            // Position number
            Group {
                if let pos = result.position {
                    Text("\(pos)")
                } else {
                    Text(result.status == .dnf ? "DNF"
                       : result.status == .dns ? "DNS"
                       : result.status == .dsq ? "DSQ" : "—")
                        .font(.system(size: 10, weight: .bold))
                }
            }
            .font(.system(.subheadline, design: .monospaced))
            .fontWeight(.bold)
            .frame(width: 28, alignment: .trailing)
            .foregroundStyle(isWinner ? FXTheme.Colors.accent : isP10 ? FXTheme.Colors.gold : .primary)

            Circle().fill(driver.teamColor).frame(width: 8, height: 8)

            Text(driver.code)
                .font(.subheadline)
                .fontWeight(.semibold)

            Text("\(driver.firstName) \(driver.lastName)")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            Spacer()

            if result.fastestLap {
                Image(systemName: "bolt.fill")
                    .font(.caption)
                    .foregroundStyle(.purple)
            }

            // Slot badge showing which pick category this position covers
            if let label = slotLabel {
                Text(label)
                    .font(.system(size: 9, weight: .black))
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(label == "P10" ? FXTheme.Colors.gold
                              : label == "DNF" ? FXTheme.Colors.danger
                              : FXTheme.Colors.accent)
                    .foregroundStyle(label == "P10" ? Color.black : FXTheme.Colors.onAccent)
                    .clipShape(Capsule())
            }
        }
        .padding(.vertical, 8)
        .padding(.horizontal, FXTheme.Spacing.md)
        .background(
            isP10 ? FXTheme.Colors.gold.opacity(0.08)
          : isUserPick ? FXTheme.Colors.accent.opacity(0.06)
          : FXTheme.Colors.surface
        )
        .overlay(
            RoundedRectangle(cornerRadius: FXTheme.Radius.sm)
                .stroke(isP10 ? FXTheme.Colors.gold.opacity(0.3) : Color.clear, lineWidth: 1)
        )
        .cornerRadius(FXTheme.Radius.sm)
    }
}
