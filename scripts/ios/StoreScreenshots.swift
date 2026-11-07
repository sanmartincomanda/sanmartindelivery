import XCTest

final class StoreScreenshots: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "com.sanmartinsr.app")

    func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testGuestShoppingScreens() {
        continueAfterFailure = false
        // The workflow opens the app with simctl before attaching XCTest.
        app.activate()
        let browse = app.buttons["Navegar catalogo"]
        XCTAssertTrue(browse.waitForExistence(timeout: 40), app.debugDescription)
        XCTAssertTrue(app.buttons["Continuar con Apple"].exists)
        capture("01-Ingresar")
        // Invalid synthetic credentials exercise real Firebase Auth initialization
        // without creating an account or sharing a customer's credentials with CI.
        let email = app.textFields["Correo o telefono"]
        email.tap()
        email.typeText("native-qa@example.invalid")
        let password = app.secureTextFields["Contrasena"]
        password.tap()
        password.typeText("Invalid-QA-password-2026")
        let submit = app.buttons["Entrar a la tienda"]
        for _ in 0..<4 {
            if submit.isHittable { break }
            app.swipeUp()
        }
        submit.tap()
        XCTAssertTrue(app.staticTexts["Correo, telefono o contrasena incorrectos."].waitForExistence(timeout: 40), app.debugDescription)
        XCTAssertTrue(browse.isEnabled, "Login must recover from a rejected password")
        capture("01b-Password-response")
        browse.tap()
        sleep(8)
        XCTAssertFalse(app.staticTexts["Tu direccion esta fuera de rango"].exists)
        for label in ["Cerrar anuncio de cajas", "Cerrar anuncio", "Cerrar promocion", "Cerrar horario"] {
            if app.buttons[label].exists && app.buttons[label].isHittable { app.buttons[label].tap() }
        }
        capture("02-Tienda")

        let product = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Ver ' AND (label CONTAINS 'BISTEC' OR label CONTAINS 'CAJA' OR label CONTAINS 'CORBATA')")).firstMatch
        for _ in 0..<6 {
            if product.exists && product.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(product.exists && product.isHittable, app.debugDescription)
        product.tap()
        sleep(3)
        capture("03-Producto")
        let add = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Agregar al carrito'")).firstMatch
        for _ in 0..<3 {
            if add.exists && add.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(add.exists && add.isHittable, app.debugDescription)
        add.tap()
        XCTAssertFalse(app.staticTexts["Tu direccion esta fuera de rango"].exists, "Guests must not receive coverage prompts")
        let cart = app.buttons["Abrir carrito"]
        XCTAssertTrue(cart.waitForExistence(timeout: 10), app.debugDescription)
        cart.tap()
        sleep(2)
        capture("04-Carrito")
        // Never place an order or alter customer/business records in this UI test.
    }
}
