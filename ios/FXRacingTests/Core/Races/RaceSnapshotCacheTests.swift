import Foundation
import XCTest
@testable import FXRacing

final class RaceSnapshotCacheTests: XCTestCase {
    private var testDirectory: URL!
    private let fileManager = FileManager.default

    override func setUpWithError() throws {
        testDirectory = fileManager.temporaryDirectory
            .appendingPathComponent("RaceSnapshotCacheTests-\(UUID().uuidString)", isDirectory: true)
    }

    override func tearDownWithError() throws {
        if let testDirectory {
            try? fileManager.removeItem(at: testDirectory)
        }
        testDirectory = nil
    }

    func testListRoundTrip() async throws {
        let cache = makeCache()
        let snapshot = makeListSnapshot(races: [RaceFixtures.liveSpa, RaceFixtures.upcoming])

        try await cache.writeList(snapshot)
        let stored = try await cache.readList()
        let restored = try XCTUnwrap(stored)

        XCTAssertEqual(restored.schemaVersion, RaceListSnapshot.currentSchemaVersion)
        XCTAssertEqual(restored.savedAt, RaceFixtures.now)
        XCTAssertEqual(restored.season?.id, RaceFixtures.season2026.id)
        XCTAssertEqual(restored.season?.year, RaceFixtures.season2026.year)
        XCTAssertEqual(restored.races.map(\.id), [RaceFixtures.liveSpa.id, RaceFixtures.upcoming.id])
    }

    func testListRoundTripPreservesValidatedDetailSeason() async throws {
        let cache = makeCache()
        let snapshot = RaceListSnapshot(
            schemaVersion: RaceListSnapshot.currentSchemaVersion,
            savedAt: RaceFixtures.now,
            season: RaceFixtures.season2026,
            races: [RaceFixtures.liveSpa],
            validatedDetailSeasonID: RaceFixtures.season2026.id
        )

        try await cache.writeList(snapshot)
        let stored = try await cache.readList()
        let restored = try XCTUnwrap(stored)

        XCTAssertEqual(restored.validatedDetailSeasonID, RaceFixtures.season2026.id)
    }

    func testDetailRoundTripKeepsQualifyingResultsNonOptional() async throws {
        let cache = makeCache()
        let snapshot = makeDetailSnapshot(race: RaceFixtures.liveSpa)

        try await cache.writeDetail(snapshot)
        let stored = try await cache.readDetail(id: RaceFixtures.liveSpa.id)
        let restored = try XCTUnwrap(stored)

        XCTAssertEqual(restored.schemaVersion, RaceDetailSnapshot.currentSchemaVersion)
        XCTAssertEqual(restored.savedAt, RaceFixtures.now)
        XCTAssertEqual(restored.race.id, RaceFixtures.liveSpa.id)
        XCTAssertEqual(restored.entrants.map(\.id), [DriverFixtures.norris.id])
        XCTAssertEqual(restored.results.map(\.driverId), [DriverFixtures.norris.id])
        XCTAssertEqual(restored.qualifyingResults.map(\.driverId), [DriverFixtures.norris.id])
    }

    func testStoredDatesUseStableISO8601Encoding() async throws {
        let cache = makeCache()
        try await cache.writeList(makeListSnapshot())

        let data = try Data(contentsOf: listURL)
        let json = try XCTUnwrap(String(data: data, encoding: .utf8))
        let stored = try await cache.readList()
        let restored = try XCTUnwrap(stored)

        XCTAssertTrue(json.contains(#""savedAt":"2027-01-15T08:00:00Z""#))
        XCTAssertEqual(restored.savedAt.timeIntervalSince1970, RaceFixtures.now.timeIntervalSince1970)
    }

    func testWritingListAgainReplacesItWithLatestValue() async throws {
        let cache = makeCache()
        try await cache.writeList(makeListSnapshot(races: [RaceFixtures.liveSpa]))

        let replacement = makeListSnapshot(
            savedAt: RaceFixtures.now.addingTimeInterval(60),
            races: [RaceFixtures.upcoming]
        )
        try await cache.writeList(replacement)

        let stored = try await cache.readList()
        let restored = try XCTUnwrap(stored)
        XCTAssertEqual(restored.savedAt, replacement.savedAt)
        XCTAssertEqual(restored.races.map(\.id), [RaceFixtures.upcoming.id])
    }

    func testPathLikeRaceIDRoundTripsInsideSnapshotDirectory() async throws {
        let cache = makeCache()
        let pathLikeRace = RaceFixtures.race(
            id: "../private/tokens/race",
            round: 4,
            status: .upcoming,
            startOffset: 259_200
        )

        try await cache.writeDetail(makeDetailSnapshot(race: pathLikeRace))
        let restored = try await cache.readDetail(id: pathLikeRace.id)
        let entries = try fileManager.contentsOfDirectory(
            at: cacheDirectory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        )

        XCTAssertEqual(restored?.race.id, pathLikeRace.id)
        XCTAssertEqual(entries.count, 1)
        let entry = try XCTUnwrap(entries.first)
        XCTAssertEqual(
            entry.deletingLastPathComponent().standardizedFileURL,
            cacheDirectory.standardizedFileURL
        )
        XCTAssertFalse(entry.lastPathComponent.contains(".."))
    }

    func testCorruptListIsDeletedWithoutAffectingValidDetail() async throws {
        let cache = makeCache()
        try await cache.writeList(makeListSnapshot())
        try await cache.writeDetail(makeDetailSnapshot(race: RaceFixtures.liveSpa))
        try Data("not-json".utf8).write(to: listURL)

        let list = try await cache.readList()
        let detail = try await cache.readDetail(id: RaceFixtures.liveSpa.id)

        XCTAssertNil(list)
        XCTAssertFalse(fileManager.fileExists(atPath: listURL.path))
        XCTAssertEqual(detail?.race.id, RaceFixtures.liveSpa.id)
        XCTAssertTrue(fileManager.fileExists(atPath: detailURL(id: RaceFixtures.liveSpa.id).path))
    }

    func testCorruptDetailIsDeletedWithoutAffectingListOrOtherDetail() async throws {
        let cache = makeCache()
        try await cache.writeList(makeListSnapshot())
        try await cache.writeDetail(makeDetailSnapshot(race: RaceFixtures.liveSpa))
        try await cache.writeDetail(makeDetailSnapshot(race: RaceFixtures.upcoming))
        try Data("not-json".utf8).write(to: detailURL(id: RaceFixtures.liveSpa.id))

        let corruptDetail = try await cache.readDetail(id: RaceFixtures.liveSpa.id)
        let list = try await cache.readList()
        let otherDetail = try await cache.readDetail(id: RaceFixtures.upcoming.id)

        XCTAssertNil(corruptDetail)
        XCTAssertFalse(fileManager.fileExists(atPath: detailURL(id: RaceFixtures.liveSpa.id).path))
        XCTAssertEqual(list?.races.map(\.id), [RaceFixtures.liveSpa.id])
        XCTAssertEqual(otherDetail?.race.id, RaceFixtures.upcoming.id)
    }

    func testIncompatibleListVersionIsDeleted() async throws {
        let cache = makeCache()
        try await cache.writeList(
            makeListSnapshot(schemaVersion: RaceListSnapshot.currentSchemaVersion + 1)
        )

        let restored = try await cache.readList()

        XCTAssertNil(restored)
        XCTAssertFalse(fileManager.fileExists(atPath: listURL.path))
    }

    func testIncompatibleDetailVersionIsDeletedWithoutAffectingOtherDetail() async throws {
        let cache = makeCache()
        try await cache.writeDetail(
            makeDetailSnapshot(
                schemaVersion: RaceDetailSnapshot.currentSchemaVersion + 1,
                race: RaceFixtures.liveSpa
            )
        )
        try await cache.writeDetail(makeDetailSnapshot(race: RaceFixtures.upcoming))

        let incompatible = try await cache.readDetail(id: RaceFixtures.liveSpa.id)
        let compatible = try await cache.readDetail(id: RaceFixtures.upcoming.id)

        XCTAssertNil(incompatible)
        XCTAssertFalse(fileManager.fileExists(atPath: detailURL(id: RaceFixtures.liveSpa.id).path))
        XCTAssertEqual(compatible?.race.id, RaceFixtures.upcoming.id)
    }

    func testRemoveDetailDeletesOnlyRequestedEntry() async throws {
        let cache = makeCache()
        try await cache.writeDetail(makeDetailSnapshot(race: RaceFixtures.liveSpa))
        try await cache.writeDetail(makeDetailSnapshot(race: RaceFixtures.upcoming))

        await cache.removeDetail(id: RaceFixtures.liveSpa.id)

        let removed = try await cache.readDetail(id: RaceFixtures.liveSpa.id)
        let retained = try await cache.readDetail(id: RaceFixtures.upcoming.id)
        XCTAssertNil(removed)
        XCTAssertEqual(retained?.race.id, RaceFixtures.upcoming.id)
    }

    func testPruneDetailsKeepsOnlyRequestedRaceIDs() async throws {
        let cache = makeCache()
        let completed = RaceFixtures.race(
            id: "completed",
            round: 3,
            status: .completed,
            startOffset: -86_400
        )
        try await cache.writeDetail(makeDetailSnapshot(race: RaceFixtures.liveSpa))
        try await cache.writeDetail(makeDetailSnapshot(race: RaceFixtures.upcoming))
        try await cache.writeDetail(makeDetailSnapshot(race: completed))

        await cache.pruneDetails(keeping: [RaceFixtures.liveSpa.id, completed.id])

        let live = try await cache.readDetail(id: RaceFixtures.liveSpa.id)
        let upcoming = try await cache.readDetail(id: RaceFixtures.upcoming.id)
        let completedDetail = try await cache.readDetail(id: completed.id)
        XCTAssertEqual(live?.race.id, RaceFixtures.liveSpa.id)
        XCTAssertNil(upcoming)
        XCTAssertEqual(completedDetail?.race.id, completed.id)
    }

    private var cacheDirectory: URL {
        testDirectory
            .appendingPathComponent("FXRacing", isDirectory: true)
            .appendingPathComponent("RaceSnapshots", isDirectory: true)
            .appendingPathComponent("v1", isDirectory: true)
    }

    private var listURL: URL {
        cacheDirectory.appendingPathComponent("list.json", isDirectory: false)
    }

    private func detailURL(id: String) -> URL {
        let encodedID = Data(id.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return cacheDirectory.appendingPathComponent("detail-\(encodedID).json", isDirectory: false)
    }

    private func makeCache() -> RaceSnapshotCache {
        RaceSnapshotCache(baseDirectory: testDirectory, fileManager: FileManager())
    }

    private func makeListSnapshot(
        schemaVersion: Int = RaceListSnapshot.currentSchemaVersion,
        savedAt: Date = RaceFixtures.now,
        races: [Race] = [RaceFixtures.liveSpa]
    ) -> RaceListSnapshot {
        RaceListSnapshot(
            schemaVersion: schemaVersion,
            savedAt: savedAt,
            season: RaceFixtures.season2026,
            races: races
        )
    }

    private func makeDetailSnapshot(
        schemaVersion: Int = RaceDetailSnapshot.currentSchemaVersion,
        race: Race
    ) -> RaceDetailSnapshot {
        RaceDetailSnapshot(
            schemaVersion: schemaVersion,
            savedAt: RaceFixtures.now,
            race: race,
            entrants: [DriverFixtures.norris],
            results: [
                RaceResult(
                    driverId: DriverFixtures.norris.id,
                    position: 1,
                    status: .classified,
                    fastestLap: true,
                    scoreGuide: nil
                ),
            ],
            qualifyingResults: [
                QualifyingResultRow(driverId: DriverFixtures.norris.id, position: 1),
            ]
        )
    }
}
