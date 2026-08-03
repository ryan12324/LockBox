import CryptoKit
import Foundation
import SQLite3

final class AuthwellDatabase: @unchecked Sendable {
    static let shared = AuthwellDatabase()

    private let queue = DispatchQueue(label: "dev.lockbox.app.database")
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var connection: OpaquePointer?
    private var setupError: Error?

    private init() {
        do {
            let databaseURL = try AuthwellAppGroup.containerURL()
                .appendingPathComponent("authwell-native.sqlite3")
            var database: OpaquePointer?
            let status = sqlite3_open_v2(
                databaseURL.path,
                &database,
                SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX,
                nil
            )
            guard status == SQLITE_OK, let database else {
                throw AuthwellError.storage("Could not open the Authwell native database")
            }
            connection = database
            try executeDirect("PRAGMA journal_mode=WAL")
            try executeDirect("PRAGMA busy_timeout=5000")
            try executeDirect("PRAGMA foreign_keys=ON")
            try executeDirect(
                """
                CREATE TABLE IF NOT EXISTS vault_items (
                    id TEXT PRIMARY KEY NOT NULL,
                    revision_date TEXT NOT NULL,
                    sync_status TEXT NOT NULL,
                    record TEXT NOT NULL
                )
                """
            )
            try executeDirect(
                """
                CREATE TABLE IF NOT EXISTS autofill_credentials (
                    id TEXT PRIMARY KEY NOT NULL,
                    record TEXT NOT NULL
                )
                """
            )
            try executeDirect(
                """
                CREATE TABLE IF NOT EXISTS passkey_metadata (
                    credential_id TEXT PRIMARY KEY NOT NULL,
                    rp_id TEXT NOT NULL,
                    account_id TEXT NOT NULL,
                    source TEXT NOT NULL,
                    record TEXT NOT NULL
                )
                """
            )
            try executeDirect(
                "CREATE INDEX IF NOT EXISTS passkey_rp_account ON passkey_metadata(rp_id, account_id)"
            )
            try executeDirect(
                """
                CREATE TABLE IF NOT EXISTS totp_credentials (
                    id TEXT PRIMARY KEY NOT NULL,
                    record TEXT NOT NULL
                )
                """
            )
            try executeDirect(
                """
                CREATE TABLE IF NOT EXISTS pending_credential_saves (
                    id TEXT PRIMARY KEY NOT NULL,
                    account_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    record TEXT NOT NULL
                )
                """
            )
            try executeDirect(
                "CREATE INDEX IF NOT EXISTS pending_save_account ON pending_credential_saves(account_id, created_at)"
            )
            try executeDirect(
                """
                CREATE TABLE IF NOT EXISTS pending_totp_setups (
                    id TEXT PRIMARY KEY NOT NULL,
                    account_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    record TEXT NOT NULL
                )
                """
            )
        } catch {
            setupError = error
        }
    }

    deinit {
        if let connection { sqlite3_close(connection) }
    }

    func upsertVault(_ record: VaultRecord) throws {
        try queue.sync {
            _ = try ensureReady()
            try upsertVaultLocked(record)
        }
    }

    func upsertVault(_ records: [VaultRecord]) throws {
        try queue.sync {
            _ = try ensureReady()
            try transaction {
                for record in records { try upsertVaultLocked(record) }
            }
        }
    }

    func vault(id: String) throws -> VaultRecord? {
        try queue.sync {
            try queryRecords(
                "SELECT record FROM vault_items WHERE id = ? LIMIT 1",
                bindings: [.text(id)],
                as: VaultRecord.self
            ).first
        }
    }

    func vaultItems(pendingOnly: Bool = false) throws -> [VaultRecord] {
        try queue.sync {
            let sql = pendingOnly
                ? "SELECT record FROM vault_items WHERE sync_status != 'synced' ORDER BY revision_date DESC"
                : "SELECT record FROM vault_items ORDER BY revision_date DESC"
            return try queryRecords(sql, as: VaultRecord.self)
        }
    }

    func deleteVault(id: String) throws {
        try queue.sync {
            try run("DELETE FROM vault_items WHERE id = ?", bindings: [.text(id)])
        }
    }

    func updateVaultSyncStatus(id: String, syncStatus: String) throws {
        try queue.sync {
            guard var record = try queryRecords(
                "SELECT record FROM vault_items WHERE id = ? LIMIT 1",
                bindings: [.text(id)],
                as: VaultRecord.self
            ).first else { return }
            record.syncStatus = syncStatus
            if syncStatus == "synced" { record.baseRevisionDate = record.revisionDate }
            try upsertVaultLocked(record)
        }
    }

    func clearVault() throws {
        try queue.sync { try run("DELETE FROM vault_items") }
    }

    func replaceAutofill(_ records: [AutofillRecord]) throws {
        try queue.sync {
            try transaction {
                try run("DELETE FROM autofill_credentials")
                for record in records {
                    try run(
                        "INSERT INTO autofill_credentials(id, record) VALUES(?, ?)",
                        bindings: [.text(record.id), .text(try encode(record))]
                    )
                }
            }
        }
    }

    func upsertAutofill(_ record: AutofillRecord) throws {
        try queue.sync {
            try run(
                "INSERT OR REPLACE INTO autofill_credentials(id, record) VALUES(?, ?)",
                bindings: [.text(record.id), .text(try encode(record))]
            )
        }
    }

    func allAutofill() throws -> [AutofillRecord] {
        try queue.sync {
            try queryRecords("SELECT record FROM autofill_credentials", as: AutofillRecord.self)
        }
    }

    func autofill(id: String) throws -> AutofillRecord? {
        try queue.sync {
            try queryRecords(
                "SELECT record FROM autofill_credentials WHERE id = ? LIMIT 1",
                bindings: [.text(id)],
                as: AutofillRecord.self
            ).first
        }
    }

    func matchingAutofill(domainHash: String) throws -> [AutofillRecord] {
        try allAutofill().filter { $0.domainHashes.contains(domainHash) }
    }

    func clearAutofill() throws {
        try queue.sync { try run("DELETE FROM autofill_credentials") }
    }

    @available(iOS 18.0, *)
    func replaceTotp(_ records: [TotpRecord]) throws {
        try queue.sync {
            try transaction {
                try run("DELETE FROM totp_credentials")
                for record in records {
                    try run(
                        "INSERT INTO totp_credentials(id, record) VALUES(?, ?)",
                        bindings: [.text(record.id), .text(try encode(record))]
                    )
                }
            }
        }
    }

    @available(iOS 18.0, *)
    func allTotp() throws -> [TotpRecord] {
        try queue.sync { try queryRecords("SELECT record FROM totp_credentials", as: TotpRecord.self) }
    }

    @available(iOS 18.0, *)
    func totp(id: String) throws -> TotpRecord? {
        try queue.sync {
            try queryRecords(
                "SELECT record FROM totp_credentials WHERE id = ? LIMIT 1",
                bindings: [.text(id)],
                as: TotpRecord.self
            ).first
        }
    }

    @available(iOS 18.0, *)
    func matchingTotp(domainHash: String) throws -> [TotpRecord] {
        try allTotp().filter { $0.domainHashes.contains(domainHash) }
    }

    func clearTotp() throws {
        try queue.sync { try run("DELETE FROM totp_credentials") }
    }

    func upsertPendingCredentialSave(_ record: PendingCredentialSaveRecord) throws {
        try queue.sync {
            try run(
                """
                INSERT OR REPLACE INTO pending_credential_saves(id, account_id, created_at, record)
                VALUES(?, ?, ?, ?)
                """,
                bindings: [
                    .text(record.id), .text(record.accountId), .text(record.createdAt),
                    .text(try encode(record)),
                ]
            )
        }
    }

    func pendingCredentialSaves(accountId: String) throws -> [PendingCredentialSaveRecord] {
        try queue.sync {
            try queryRecords(
                "SELECT record FROM pending_credential_saves WHERE account_id = ? ORDER BY created_at",
                bindings: [.text(accountId)],
                as: PendingCredentialSaveRecord.self
            )
        }
    }

    func pendingCredentialSave(id: String, accountId: String) throws -> PendingCredentialSaveRecord? {
        try queue.sync {
            try queryRecords(
                "SELECT record FROM pending_credential_saves WHERE id = ? AND account_id = ? LIMIT 1",
                bindings: [.text(id), .text(accountId)],
                as: PendingCredentialSaveRecord.self
            ).first
        }
    }

    func deletePendingCredentialSave(id: String, accountId: String) throws -> Bool {
        try queue.sync {
            try run(
                "DELETE FROM pending_credential_saves WHERE id = ? AND account_id = ?",
                bindings: [.text(id), .text(accountId)]
            )
            return sqlite3_changes(try ensureReady()) == 1
        }
    }

    func clearPendingCredentialSaves() throws {
        try queue.sync { try run("DELETE FROM pending_credential_saves") }
    }

    func upsertPendingTotpSetup(_ record: PendingTotpSetupRecord) throws {
        try queue.sync {
            try run(
                """
                INSERT OR REPLACE INTO pending_totp_setups(id, account_id, created_at, record)
                VALUES(?, ?, ?, ?)
                """,
                bindings: [
                    .text(record.id), .text(record.accountId), .text(record.createdAt),
                    .text(try encode(record)),
                ]
            )
        }
    }

    func pendingTotpSetups(accountId: String) throws -> [PendingTotpSetupRecord] {
        try queue.sync {
            try queryRecords(
                "SELECT record FROM pending_totp_setups WHERE account_id = ? ORDER BY created_at",
                bindings: [.text(accountId)],
                as: PendingTotpSetupRecord.self
            )
        }
    }

    func pendingTotpSetup(id: String, accountId: String) throws -> PendingTotpSetupRecord? {
        try queue.sync {
            try queryRecords(
                "SELECT record FROM pending_totp_setups WHERE id = ? AND account_id = ? LIMIT 1",
                bindings: [.text(id), .text(accountId)],
                as: PendingTotpSetupRecord.self
            ).first
        }
    }

    func deletePendingTotpSetup(id: String, accountId: String) throws -> Bool {
        try queue.sync {
            try run(
                "DELETE FROM pending_totp_setups WHERE id = ? AND account_id = ?",
                bindings: [.text(id), .text(accountId)]
            )
            return sqlite3_changes(try ensureReady()) == 1
        }
    }

    func clearPendingTotpSetups() throws {
        try queue.sync { try run("DELETE FROM pending_totp_setups") }
    }

    func replaceSyncedPasskeys(_ records: [PasskeyRecord]) throws {
        try queue.sync {
            try transaction {
                try run(
                    "DELETE FROM passkey_metadata WHERE source = ?",
                    bindings: [.text(PasskeyRecord.sourceSynced)]
                )
                for record in records { try upsertPasskeyLocked(record) }
            }
        }
    }

    func upsertPasskey(_ record: PasskeyRecord) throws {
        try queue.sync { try upsertPasskeyLocked(record) }
    }

    func passkeys(relyingParty: String? = nil, accountId: String) throws -> [PasskeyRecord] {
        try queue.sync {
            if let relyingParty {
                return try queryRecords(
                    "SELECT record FROM passkey_metadata WHERE rp_id = ? AND account_id = ?",
                    bindings: [.text(relyingParty), .text(accountId)],
                    as: PasskeyRecord.self
                )
            }
            return try queryRecords(
                "SELECT record FROM passkey_metadata WHERE account_id = ?",
                bindings: [.text(accountId)],
                as: PasskeyRecord.self
            )
        }
    }

    func passkeys(source: String, accountId: String) throws -> [PasskeyRecord] {
        try queue.sync {
            try queryRecords(
                "SELECT record FROM passkey_metadata WHERE source = ? AND account_id = ?",
                bindings: [.text(source), .text(accountId)],
                as: PasskeyRecord.self
            )
        }
    }

    func passkey(credentialId: String, accountId: String) throws -> PasskeyRecord? {
        try queue.sync {
            try queryRecords(
                "SELECT record FROM passkey_metadata WHERE credential_id = ? AND account_id = ? LIMIT 1",
                bindings: [.text(credentialId), .text(accountId)],
                as: PasskeyRecord.self
            ).first
        }
    }

    func deletePasskey(credentialId: String, accountId: String) throws {
        try queue.sync {
            try run(
                "DELETE FROM passkey_metadata WHERE credential_id = ? AND account_id = ?",
                bindings: [.text(credentialId), .text(accountId)]
            )
        }
    }

    func updatePasskeySource(
        credentialId: String,
        vaultItemId: String,
        accountId: String,
        source: String
    ) throws -> Bool {
        try queue.sync {
            guard var record = try queryRecords(
                "SELECT record FROM passkey_metadata WHERE credential_id = ? AND account_id = ? LIMIT 1",
                bindings: [.text(credentialId), .text(accountId)],
                as: PasskeyRecord.self
            ).first, record.vaultItemId == vaultItemId else { return false }
            record.source = source
            try upsertPasskeyLocked(record)
            return true
        }
    }

    func clearSyncedPasskeys() throws {
        try queue.sync {
            try run(
                "DELETE FROM passkey_metadata WHERE source = ?",
                bindings: [.text(PasskeyRecord.sourceSynced)]
            )
        }
    }

    private func upsertVaultLocked(_ record: VaultRecord) throws {
        try run(
            """
            INSERT OR REPLACE INTO vault_items(id, revision_date, sync_status, record)
            VALUES(?, ?, ?, ?)
            """,
            bindings: [
                .text(record.id),
                .text(record.revisionDate),
                .text(record.syncStatus),
                .text(try encode(record)),
            ]
        )
    }

    private func upsertPasskeyLocked(_ record: PasskeyRecord) throws {
        try run(
            """
            INSERT OR REPLACE INTO passkey_metadata(
                credential_id, rp_id, account_id, source, record
            ) VALUES(?, ?, ?, ?, ?)
            """,
            bindings: [
                .text(record.credentialId),
                .text(record.rpId),
                .text(record.accountId),
                .text(record.source),
                .text(try encode(record)),
            ]
        )
    }

    private func ensureReady() throws -> OpaquePointer {
        if let setupError { throw setupError }
        guard let connection else {
            throw AuthwellError.storage("The Authwell native database is unavailable")
        }
        return connection
    }

    private func executeDirect(_ sql: String) throws {
        let database = try ensureReady()
        var message: UnsafeMutablePointer<CChar>?
        let status = sqlite3_exec(database, sql, nil, nil, &message)
        guard status == SQLITE_OK else {
            let detail = message.map { String(cString: $0) } ?? "SQLite error \(status)"
            sqlite3_free(message)
            throw AuthwellError.storage(detail)
        }
    }

    private func transaction(_ work: () throws -> Void) throws {
        try executeDirect("BEGIN IMMEDIATE TRANSACTION")
        do {
            try work()
            try executeDirect("COMMIT")
        } catch {
            try? executeDirect("ROLLBACK")
            throw error
        }
    }

    private enum Binding {
        case text(String)
    }

    private func run(_ sql: String, bindings: [Binding] = []) throws {
        let statement = try prepare(sql, bindings: bindings)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_DONE else {
            throw sqliteError()
        }
    }

    private func queryRecords<T: Decodable>(
        _ sql: String,
        bindings: [Binding] = [],
        as type: T.Type
    ) throws -> [T] {
        let statement = try prepare(sql, bindings: bindings)
        defer { sqlite3_finalize(statement) }
        var records: [T] = []
        while true {
            let status = sqlite3_step(statement)
            if status == SQLITE_DONE { return records }
            guard status == SQLITE_ROW, let value = sqlite3_column_text(statement, 0) else {
                throw sqliteError()
            }
            records.append(try decoder.decode(T.self, from: Data(String(cString: value).utf8)))
        }
    }

    private func prepare(_ sql: String, bindings: [Binding]) throws -> OpaquePointer {
        let database = try ensureReady()
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
              let statement else {
            throw sqliteError()
        }
        do {
            for (offset, binding) in bindings.enumerated() {
                switch binding {
                case .text(let value):
                    guard sqlite3_bind_text(
                        statement,
                        Int32(offset + 1),
                        value,
                        -1,
                        unsafeBitCast(-1, to: sqlite3_destructor_type.self)
                    ) == SQLITE_OK else {
                        throw sqliteError()
                    }
                }
            }
            return statement
        } catch {
            sqlite3_finalize(statement)
            throw error
        }
    }

    private func encode<T: Encodable>(_ value: T) throws -> String {
        guard let result = String(data: try encoder.encode(value), encoding: .utf8) else {
            throw AuthwellError.storage("Could not encode a native database record")
        }
        return result
    }

    private func sqliteError() -> Error {
        let message = connection.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLite error"
        return AuthwellError.storage(message)
    }
}

enum NativeCredentialCapture {
    static func hasMatchingPassword(username: String, serviceIdentifier: String) throws -> Bool {
        guard let domain = DomainIdentifier.normalize(serviceIdentifier) else { return false }
        let hash = try DomainIdentifier.hash(domain)
        let displayUsername = AutofillPresentation.username(username)
        return try AuthwellDatabase.shared.matchingAutofill(domainHash: hash).contains {
            $0.displayUsername == displayUsername
        }
    }

    static func savePassword(
        username: String,
        password: String,
        serviceIdentifier: String,
        title: String?,
        sessionId: String,
        event: String
    ) throws -> PendingCredentialSaveRecord {
        guard username.count <= 10_000, !password.isEmpty, password.count <= 100_000,
              sessionId.count <= 2_048,
              let domain = DomainIdentifier.normalize(serviceIdentifier),
              let accountId = try AuthwellAppGroup.sharedDefaults().string(
                  forKey: AuthwellAppGroup.accountKey
              ) else {
            throw AuthwellError.invalidArgument("The password save request is invalid")
        }
        let id = stableId(
            "password\u{0}\(accountId)\u{0}\(domain)\u{0}\(username)\u{0}\(sessionId)"
        )
        let candidateTitle = title?.trimmingCharacters(in: .whitespacesAndNewlines)
        let nameSource = candidateTitle.flatMap { $0.isEmpty ? nil : $0 } ?? domain
        let name = String(nameSource.prefix(500))
        let uri = "https://\(domain)"
        let createdAt = ISO8601DateFormatter().string(from: Date())
        var payload = try JSONSerialization.data(withJSONObject: [
            "name": name,
            "username": username,
            "password": password,
            "uri": uri,
            "event": event,
        ])
        defer { payload.resetBytes(in: 0..<payload.count) }
        let protectedOutboxPayload = try DeviceOutboxCrypto.encrypt(payload)
        let protectedAutofillPayload = try DeviceIndexCrypto.encrypt(payload)
        let autofill = AutofillRecord(
            id: id,
            domainHashes: [try DomainIdentifier.hash(domain)],
            displayUsername: username,
            encryptedData: protectedAutofillPayload,
            updatedAt: createdAt,
            serviceIdentifiers: [domain]
        )
        let record = PendingCredentialSaveRecord(
            id: id,
            accountId: accountId,
            createdAt: createdAt,
            encryptedData: protectedOutboxPayload,
            domainHashes: autofill.domainHashes,
            autofillRecord: autofill
        )
        try AuthwellDatabase.shared.upsertPendingCredentialSave(record)
        try AuthwellDatabase.shared.upsertAutofill(autofill)
        return record
    }

    static func captureTotpSetup(url: URL) throws -> PendingTotpSetupRecord {
        let value = url.absoluteString
        guard value.count <= 131_072,
              let scheme = url.scheme?.lowercased(),
              scheme == "otpauth" || scheme == "otpauth-migration",
              let accountId = try AuthwellAppGroup.sharedDefaults().string(
                  forKey: AuthwellAppGroup.accountKey
              ) else {
            throw AuthwellError.invalidArgument("Unlock Authwell before setting up a verification code")
        }
        if scheme == "otpauth" {
            _ = try NativeTotpConfiguration.parse(value)
        } else {
            guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                  components.host?.lowercased() == "offline",
                  let encoded = components.queryItems?.first(where: { $0.name == "data" })?.value,
                  !encoded.isEmpty, encoded.count <= 100_000,
                  Data(base64Encoded: encoded) != nil else {
                throw AuthwellError.invalidArgument("Invalid authenticator migration link")
            }
        }
        let record = PendingTotpSetupRecord(
            id: stableId("totp\u{0}\(accountId)\u{0}\(value)"),
            accountId: accountId,
            createdAt: ISO8601DateFormatter().string(from: Date()),
            scheme: scheme,
            encryptedData: try DeviceOutboxCrypto.encrypt(Data(value.utf8))
        )
        try AuthwellDatabase.shared.upsertPendingTotpSetup(record)
        return record
    }

    private static func stableId(_ value: String) -> String {
        Data(SHA256.hash(data: Data(value.utf8))).base64URLEncodedString
    }
}
