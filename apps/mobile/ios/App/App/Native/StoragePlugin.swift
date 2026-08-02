import Capacitor
import Foundation

@objc(StoragePlugin)
final class StoragePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "StoragePlugin"
    let jsName = "Storage"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "upsertItem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getItem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listItems", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingItems", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteItem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateSyncStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "batchUpsert", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLastSyncTimestamp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLastSyncTimestamp", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAll", returnType: CAPPluginReturnPromise),
    ]

    private static let validStatuses = Set([
        "synced", "pending_create", "pending_update", "pending_delete",
    ])
    private static let lastSyncKey = "authwell.lastSyncTimestamp"

    @objc func upsertItem(_ call: CAPPluginCall) {
        perform(call) {
            let id = try self.requiredString(call.options, key: "id")
            let existing = try AuthwellDatabase.shared.vault(id: id)
            try AuthwellDatabase.shared.upsertVault(
                try self.makeRecord(call.options, existing: existing)
            )
            call.resolve()
        }
    }

    @objc func getItem(_ call: CAPPluginCall) {
        perform(call) {
            let id = try self.requiredString(call.options, key: "id")
            let record = try AuthwellDatabase.shared.vault(id: id)
            call.resolve(["item": record?.bridgeValue ?? NSNull()])
        }
    }

    @objc func listItems(_ call: CAPPluginCall) {
        perform(call) {
            call.resolve([
                "items": try AuthwellDatabase.shared.vaultItems().map(\.bridgeValue),
            ])
        }
    }

    @objc func getPendingItems(_ call: CAPPluginCall) {
        perform(call) {
            call.resolve([
                "items": try AuthwellDatabase.shared.vaultItems(pendingOnly: true).map(\.bridgeValue),
            ])
        }
    }

    @objc func deleteItem(_ call: CAPPluginCall) {
        perform(call) {
            try AuthwellDatabase.shared.deleteVault(
                id: try self.requiredString(call.options, key: "id")
            )
            call.resolve()
        }
    }

    @objc func updateSyncStatus(_ call: CAPPluginCall) {
        perform(call) {
            let status = try self.syncStatus(call.options)
            try AuthwellDatabase.shared.updateVaultSyncStatus(
                id: try self.requiredString(call.options, key: "id"),
                syncStatus: status
            )
            call.resolve()
        }
    }

    @objc func batchUpsert(_ call: CAPPluginCall) {
        perform(call) {
            guard let items = call.options["items"] as? [[String: Any]] else {
                throw AuthwellError.invalidArgument("items array is required")
            }
            let records = try items.map { try self.makeRecord($0, existing: nil) }
            try AuthwellDatabase.shared.upsertVault(records)
            call.resolve()
        }
    }

    @objc func setLastSyncTimestamp(_ call: CAPPluginCall) {
        do {
            try AuthwellAppGroup.sharedDefaults().set(
                try requiredString(call.options, key: "timestamp"),
                forKey: Self.lastSyncKey
            )
            call.resolve()
        } catch {
            call.reject(error.localizedDescription, nil, error)
        }
    }

    @objc func getLastSyncTimestamp(_ call: CAPPluginCall) {
        do {
            call.resolve([
                "timestamp": try AuthwellAppGroup.sharedDefaults().string(
                    forKey: Self.lastSyncKey
                ) ?? NSNull(),
            ])
        } catch {
            call.reject(error.localizedDescription, nil, error)
        }
    }

    @objc func clearAll(_ call: CAPPluginCall) {
        perform(call) {
            try AuthwellDatabase.shared.clearVault()
            try AuthwellAppGroup.sharedDefaults().removeObject(forKey: Self.lastSyncKey)
            call.resolve()
        }
    }

    private func perform(_ call: CAPPluginCall, operation: @escaping () throws -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            do { try operation() }
            catch { call.reject(error.localizedDescription, nil, error) }
        }
    }

    private func makeRecord(
        _ options: [AnyHashable: Any],
        existing: VaultRecord?
    ) throws -> VaultRecord {
        let id = try requiredString(options, key: "id")
        let revisionDate = try requiredString(options, key: "revisionDate")
        let status = try syncStatus(options)
        let requestedBase = nullableString(options, key: "baseRevisionDate")
        let baseRevisionDate: String?
        switch status {
        case "synced": baseRevisionDate = requestedBase ?? revisionDate
        case "pending_create": baseRevisionDate = nil
        default: baseRevisionDate = requestedBase ?? existing?.baseRevisionDate ?? existing?.revisionDate
        }
        return VaultRecord(
            id: id,
            encryptedData: try requiredString(options, key: "encryptedData"),
            type: try requiredString(options, key: "type"),
            folderId: nullableString(options, key: "folderId"),
            tags: options["tags"] as? [String] ?? [],
            favorite: (options["favorite"] as? NSNumber)?.boolValue ?? false,
            revisionDate: revisionDate,
            baseRevisionDate: baseRevisionDate,
            syncStatus: status
        )
    }

    private func syncStatus(_ options: [AnyHashable: Any]) throws -> String {
        let status = try requiredString(options, key: "syncStatus")
        guard Self.validStatuses.contains(status) else {
            throw AuthwellError.invalidArgument("Invalid syncStatus")
        }
        return status
    }

    private func requiredString(_ options: [AnyHashable: Any], key: String) throws -> String {
        guard let value = options[key] as? String, !value.isEmpty else {
            throw AuthwellError.invalidArgument("\(key) is required")
        }
        return value
    }

    private func nullableString(_ options: [AnyHashable: Any], key: String) -> String? {
        options[key] as? String
    }
}
