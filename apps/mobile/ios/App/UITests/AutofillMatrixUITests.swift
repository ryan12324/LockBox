import XCTest

final class AutofillMatrixUITests: XCTestCase {
    private var app: XCUIApplication!
    private let username = "autofill.e2e@example.test"
    private let currentPassword = "Authwell-Current-Password-42!"
    private let replacementPassword = "Authwell-Replacement-Password-84!"

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    override func tearDownWithError() throws {
        app?.terminate()
        app = nil
    }

    func testStandard() {
        launch("standard")
        enterText("Username", username)
        enterSecure("Password", currentPassword)
        submit("Complete test sign-in")
        requireSaveVerified()
    }

    func testEmail() {
        launch("email")
        enterText("Email address", username)
        enterSecure("Password", currentPassword)
        submit("Complete test sign-in")
        requireSaveVerified()
    }

    func testSignup() {
        launch("signup")
        enterText("Email address", "new.\(username)")
        enterSecure("Create password", replacementPassword)
        enterSecure("Confirm password", replacementPassword)
        submit("Create test account")
        requireSaveVerified()
    }

    func testPasswordChange() {
        launch("password-change")
        enterText("Username", username)
        enterSecure("Current password", currentPassword)
        enterSecure("New password", replacementPassword)
        enterSecure("Confirm new password", replacementPassword)
        submit("Update test password")
        XCTAssertTrue(
            app.staticTexts["iOS secure login update verified"].waitForExistence(timeout: 20),
            "Authwell did not verify the encrypted password update"
        )
    }

    func testPasswordOnly() {
        launch("password-only")
        XCTAssertTrue(app.staticTexts["demo.account@example.test"].exists)
        enterSecure("Password", currentPassword)
        submit("Complete test sign-in")
        requireSaveVerified()
    }

    func testMultiStep() {
        launch("multi-step")
        enterText("Email or username", username)
        submit("Continue")
        XCTAssertTrue(app.staticTexts["Step 2 of 2"].waitForExistence(timeout: 5))
        enterSecure("Password", currentPassword)
        submit("Complete test sign-in")
        requireSaveVerified()
    }

    func testDynamic() {
        launch("dynamic")
        XCTAssertFalse(app.textFields["Account"].exists)
        app.buttons["Insert login form"].tap()
        enterText("Account", username)
        enterSecure("Password", currentPassword)
        submit("Complete test sign-in")
        requireSaveVerified()
    }

    func testPhone() {
        launch("phone")
        enterText("Mobile number", "+447700900000")
        enterSecure("Password", currentPassword)
        submit("Complete test sign-in")
        requireSaveVerified()
    }

    func testPin() {
        launch("pin")
        enterText("Account ID", "authwell-pin-account")
        enterSecure("PIN", "739184")
        submit("Complete test sign-in")
        requireSaveVerified()
    }

    func testFallback() {
        launch("fallback")
        enterText("Account email", username)
        enterSecure("Password", currentPassword)
        XCTAssertTrue(app.textFields["Search reference"].exists)
        submit("Complete test sign-in")
        requireSaveVerified()
    }

    func testOneTimeCode() {
        launch("one-time-code")
        enterText("Account", username)
        enterText("One-time code", "739184")
        XCTAssertEqual(app.secureTextFields.count, 0)
        submit("Verify test code")
        requireNoSaveVerified()
    }

    func testSsoOnly() {
        launch("sso-only")
        XCTAssertEqual(app.textFields.count, 0)
        XCTAssertEqual(app.secureTextFields.count, 0)
        app.buttons["Continue with test identity provider"].tap()
        requireNoSaveVerified()
    }

    private func launch(_ testCase: String) {
        app.launchEnvironment["AUTHWELL_AUTOFILL_E2E_CASE"] = testCase
        app.launch()
        XCTAssertTrue(
            app.staticTexts["Autofill test lab"].waitForExistence(timeout: 15),
            "The AutoFill test lab did not load for \(testCase)"
        )
    }

    private func enterText(_ label: String, _ value: String) {
        let field = requireText(label)
        field.tap()
        field.typeText(value)
    }

    private func enterSecure(_ label: String, _ value: String) {
        let field = requireSecure(label)
        field.tap()
        field.typeText(value)
    }

    private func submit(_ label: String) {
        let button = app.buttons[label]
        XCTAssertTrue(button.waitForExistence(timeout: 5), "Missing action: \(label)")
        for _ in 0..<5 where !button.isHittable {
            app.swipeUp()
        }
        XCTAssertTrue(button.isHittable, "Action is not reachable: \(label)")
        button.tap()
    }

    private func requireSaveVerified() {
        XCTAssertTrue(
            app.staticTexts["iOS secure login save verified"].waitForExistence(timeout: 20),
            "Authwell did not verify the encrypted login save"
        )
    }

    private func requireNoSaveVerified() {
        XCTAssertTrue(
            app.staticTexts["iOS no-save behavior verified"].waitForExistence(timeout: 20),
            "Authwell created or attempted to create an unexpected password record"
        )
    }

    @discardableResult
    private func requireText(_ label: String) -> XCUIElement {
        let field = app.textFields[label]
        XCTAssertTrue(field.waitForExistence(timeout: 5), "Missing text field: \(label)")
        return field
    }

    @discardableResult
    private func requireSecure(_ label: String) -> XCUIElement {
        let field = app.secureTextFields[label]
        XCTAssertTrue(field.waitForExistence(timeout: 5), "Missing secure field: \(label)")
        return field
    }
}
