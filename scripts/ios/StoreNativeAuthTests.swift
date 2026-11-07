import XCTest

final class StoreNativeAuthTests: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "com.sanmartinsr.app")
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["Navegar catalogo"].waitForExistence(timeout: 45), app.debugDescription)
    }

    func capture(_ name: String) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
        let tree = XCTAttachment(string: app.debugDescription + "\nSYSTEM\n" + springboard.debugDescription)
        tree.name = name + "-accessibility"
        tree.lifetime = .keepAlways
        add(tree)
    }

    func testGoogleOpensAndCancelAllowsRetry() {
        let google = app.buttons["Continuar con Google"]
        XCTAssertTrue(google.isHittable, app.debugDescription)
        google.tap()
        let consent = springboard.alerts.firstMatch
        let appConsent = app.alerts.firstMatch
        let opened = NSPredicate { _, _ in consent.exists || appConsent.exists }
        let result = XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: opened, object: nil)], timeout: 25)
        capture("Google-native-presentation")
        XCTAssertEqual(result, .completed, "Google must open its native consent window, not leave a spinner")
        let dialog = consent.exists ? consent : appConsent
        XCTAssertTrue(dialog.label.lowercased().contains("google") || dialog.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] 'google'")).count > 0, dialog.debugDescription)
        let cancel = dialog.buttons.matching(NSPredicate(format: "label == 'Cancel' OR label == 'Cancelar'" )).firstMatch
        XCTAssertTrue(cancel.exists, dialog.debugDescription)
        cancel.tap()
        let recovered = NSPredicate { _, _ in google.exists && google.isEnabled }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: recovered, object: nil)], timeout: 10), .completed)
        capture("Google-cancel-recovery")
        google.tap()
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: opened, object: nil)], timeout: 15), .completed)
        (consent.exists ? consent : appConsent).buttons.matching(NSPredicate(format: "label == 'Cancel' OR label == 'Cancelar'")).firstMatch.tap()
    }

    func testAppleReachesSystemAndDoesNotHang() {
        let apple = app.buttons["Continuar con Apple"]
        XCTAssertTrue(apple.isHittable, app.debugDescription)
        apple.tap()
        // CI has no Apple ID. A system sign-in prompt OR a returned authorization
        // error is expected; neither proves a successful real-device sign-in.
        let response = NSPredicate { _, _ in
            self.springboard.alerts.firstMatch.exists || self.app.alerts.firstMatch.exists ||
            self.app.staticTexts["No pudimos completar el ingreso con Apple. Intenta de nuevo o usa tu correo y contrasena."].exists
        }
        let result = XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: response, object: nil)], timeout: 25)
        capture("Apple-native-response")
        XCTAssertEqual(result, .completed, "Apple must respond without waiting for the JavaScript login timeout")
    }
}
