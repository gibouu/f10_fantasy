@testable import FXRacing

actor MemoryRaceSnapshotCache: RaceSnapshotCaching {
    var list: RaceListSnapshot?
    var details: [String: RaceDetailSnapshot]

    init(
        list: RaceListSnapshot? = nil,
        details: [String: RaceDetailSnapshot] = [:]
    ) {
        self.list = list
        self.details = details
    }

    func readList() async throws -> RaceListSnapshot? {
        list
    }

    func writeList(_ snapshot: RaceListSnapshot) async throws {
        list = snapshot
    }

    func readDetail(id: String) async throws -> RaceDetailSnapshot? {
        details[id]
    }

    func writeDetail(_ snapshot: RaceDetailSnapshot) async throws {
        details[snapshot.race.id] = snapshot
    }

    func removeDetail(id: String) async {
        details.removeValue(forKey: id)
    }

    func pruneDetails(keeping raceIDs: Set<String>) async {
        details = details.filter { raceIDs.contains($0.key) }
    }
}
