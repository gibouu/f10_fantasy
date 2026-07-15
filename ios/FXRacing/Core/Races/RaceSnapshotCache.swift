import Foundation

protocol RaceSnapshotCaching: Sendable {
    func readList() async throws -> RaceListSnapshot?
    func writeList(_ snapshot: RaceListSnapshot) async throws
    func readDetail(id: String) async throws -> RaceDetailSnapshot?
    func writeDetail(_ snapshot: RaceDetailSnapshot) async throws
    func writeDetail(_ snapshot: RaceDetailSnapshot, epoch: UInt64) async throws -> Bool
    func advanceDetailEpoch(to epoch: UInt64) async
    func removeDetail(id: String) async
    func pruneDetails(keeping raceIDs: Set<String>) async
}

actor RaceSnapshotCache: RaceSnapshotCaching {
    private let fileManager: FileManager
    private let directory: URL
    private var detailEpoch: UInt64 = 0

    init(
        baseDirectory: URL? = nil,
        fileManager: FileManager = .default
    ) {
        self.fileManager = fileManager

        let cachesDirectory = baseDirectory
            ?? fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        directory = cachesDirectory
            .appendingPathComponent("FXRacing", isDirectory: true)
            .appendingPathComponent("RaceSnapshots", isDirectory: true)
            .appendingPathComponent("v1", isDirectory: true)
    }

    func readList() async throws -> RaceListSnapshot? {
        guard let snapshot: RaceListSnapshot = try readEntry(at: listURL) else {
            return nil
        }
        guard snapshot.schemaVersion == RaceListSnapshot.currentSchemaVersion else {
            deleteEntry(at: listURL)
            return nil
        }
        return snapshot
    }

    func writeList(_ snapshot: RaceListSnapshot) async throws {
        try writeEntry(snapshot, to: listURL)
    }

    func readDetail(id: String) async throws -> RaceDetailSnapshot? {
        let url = detailURL(id: id)
        guard let snapshot: RaceDetailSnapshot = try readEntry(at: url) else {
            return nil
        }
        guard snapshot.schemaVersion == RaceDetailSnapshot.currentSchemaVersion else {
            deleteEntry(at: url)
            return nil
        }
        return snapshot
    }

    func writeDetail(_ snapshot: RaceDetailSnapshot) async throws {
        _ = try await writeDetail(snapshot, epoch: detailEpoch)
    }

    func writeDetail(
        _ snapshot: RaceDetailSnapshot,
        epoch: UInt64
    ) async throws -> Bool {
        guard epoch == detailEpoch else {
            return false
        }
        try writeEntry(snapshot, to: detailURL(id: snapshot.race.id))
        return true
    }

    func advanceDetailEpoch(to epoch: UInt64) async {
        detailEpoch = epoch
    }

    func removeDetail(id: String) async {
        deleteEntry(at: detailURL(id: id))
    }

    func pruneDetails(keeping raceIDs: Set<String>) async {
        let keptNames = Set(raceIDs.map { detailURL(id: $0).lastPathComponent })
        guard let entries = try? fileManager.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else {
            return
        }

        for entry in entries where isDetailEntry(entry) && !keptNames.contains(entry.lastPathComponent) {
            deleteEntry(at: entry)
        }
    }

    private var listURL: URL {
        directory.appendingPathComponent("list.json", isDirectory: false)
    }

    private func detailURL(id: String) -> URL {
        let encodedID = Data(id.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return directory.appendingPathComponent("detail-\(encodedID).json", isDirectory: false)
    }

    private func isDetailEntry(_ url: URL) -> Bool {
        url.lastPathComponent.hasPrefix("detail-") && url.pathExtension == "json"
    }

    private func readEntry<Snapshot: Decodable>(at url: URL) throws -> Snapshot? {
        guard fileManager.fileExists(atPath: url.path) else {
            return nil
        }

        let data = try Data(contentsOf: url)
        do {
            return try makeDecoder().decode(Snapshot.self, from: data)
        } catch {
            deleteEntry(at: url)
            return nil
        }
    }

    private func writeEntry<Snapshot: Encodable>(_ snapshot: Snapshot, to url: URL) throws {
        try fileManager.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let data = try makeEncoder().encode(snapshot)
        try data.write(to: url, options: .atomic)
    }

    private func deleteEntry(at url: URL) {
        try? fileManager.removeItem(at: url)
    }

    private func makeEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }

    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
