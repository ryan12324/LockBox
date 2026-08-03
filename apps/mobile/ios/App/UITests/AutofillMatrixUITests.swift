import XCTest

final class AutofillMatrixUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
    }

    override func tearDownWithError() throws {
        app?.terminate()
        app = nil
    }

    func testStandard() { launch("standard"); requireText("Username"); requireSecure("Password") }
    func testEmail() { launch("email"); requireText("Email address"); requireSecure("Password") }

    func testSignup() {
        launch("signup")
        requireText("Email address")
        requireSecure("Create password")
        requireSecure("Confirm password")
    }

    func testPasswordChange() {
        launch("password-change")
        requireText("Username")
        requireSecure("Current password")
        requireSecure("New password")
        requireSecure("Confirm new password")
    }

    func testPasswordOnly() {
        launch("password-only")
        XCTAssertTrue(app.staticTexts["demo.account@example.test"].exists)
        requireSecure("Password")
    }

    func testMultiStep() {
        launch("multi-step")
        let username = requireText("Email or username")
        username.tap()
        username.typeText("autofill.e2e@example.test")
        app.buttons["Continue"].tap()
        requireSecure("Password")
        XCTAssertTrue(app.staticTexts["Step 2 of 2"].exists)
    }

    func testDynamic() {
        launch("dynamic")
        XCTAssertFalse(app.textFields["Account"].exists)
        app.buttons["Insert login form"].tap()
        requireText("Account")
        requireSecure("Password")
    }

    func testPhone() { launch("phone"); requireText("Mobile number"); requireSecure("Password") }
    func testPin() { launch("pin"); requireText("Account ID"); requireSecure("PIN") }

    func testFallback() {
        launch("fallback")
        requireText("Account email")
        requireSecure("Password")
        requireText("Search reference")
    }

    func testOneTimeCode() {
        launch("one-time-code")
        requireText("Account")
        requireText("One-time code")
        XCTAssertTrue(app.staticTexts["Expect verification code only"].exists)
        XCTAssertEqual(app.secureTextFields.count, 0)
    }

    func testSsoOnly() {
        launch("sso-only")
        XCTAssertTrue(app.buttons["Continue with test identity provider"].exists)
        XCTAssertEqual(app.textFields.count, 0)
        XCTAssertEqual(app.secureTextFields.count, 0)
    }

    private func launch(_ testCase: String) {
        app.launchEnvironment["AUTHWELL_AUTOFILL_E2E_CASE"] = testCase
        app.launch()
        XCTAssertTrue(
            app.staticTexts["Autofill test lab"].waitForExistence(timeout: 15),
            "The AutoFill test lab did not load for \(testCase)"
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
