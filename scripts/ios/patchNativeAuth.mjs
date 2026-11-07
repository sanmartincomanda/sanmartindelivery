// Compatibility patch for @capacitor-firebase/authentication 8.0.0 (Apache-2.0).
// Fail on changed upstream code instead of silently shipping an unpatched flow.
function replace(source, before, after) {
  if (source.includes(after)) return source;
  if (source.split(before).length !== 2) throw new Error('Native auth source changed; review the iOS compatibility patch.');
  return source.replace(before, after);
}

export function patchNativeAuth(file, input) {
  let source = input.replace(/\r\n/g, '\n');
  if (file === 'FirebaseAuthenticationPlugin.swift') {
    for (const provider of ['Apple', 'Google']) {
      for (const action of ['signIn', 'link']) {
        const method = `${action}With${provider}`;
        source = replace(source, `        implementation?.${method}(call)`, `        // Capacitor dispatches calls on its bridge queue; provider UI belongs on main.
        DispatchQueue.main.async {
            guard let implementation = self.implementation else {
                call.reject("Native authentication is not initialized.", "auth/native-not-ready")
                return
            }
            implementation.${method}(call)
        }`);
      }
    }
  } else if (file === 'FirebaseAuthentication.swift') {
    for (const provider of ['apple', 'google']) {
      for (const action of ['signIn', 'link']) {
        source = replace(source, `        self.${provider}AuthProviderHandler?.${action}(call: call)`, `        guard let handler = self.${provider}AuthProviderHandler else {
            call.reject("${provider} provider is not configured.", "auth/provider-not-configured")
            return
        }
        handler.${action}(call: call)`);
      }
    }
  } else if (file === 'Handlers/GoogleAuthProviderHandler.swift') {
    source = replace(source, '    private func startSignInWithGoogleFlow', `    private func fail(_ isLink: Bool, _ message: String) {
        if isLink {
            pluginImplementation.handleFailedLink(message: message, error: nil)
        } else {
            pluginImplementation.handleFailedSignIn(message: message, error: nil)
        }
    }

    private func startSignInWithGoogleFlow`);
    source = replace(source, '        guard let clientId = FirebaseApp.app()?.options.clientID else { return }', `        dispatchPrecondition(condition: .onQueue(.main))
        guard let clientId = FirebaseApp.app()?.options.clientID, !clientId.isEmpty else {
            fail(isLink, "Google configuration has no CLIENT_ID.")
            return
        }`);
    source = replace(source, 'GIDConfiguration(clientID: clientId, serverClientID: clientId)', 'GIDConfiguration(clientID: clientId)');
    source = replace(source, '        guard let controller = self.pluginImplementation.getPlugin().bridge?.viewController else { return }', `        guard let controller = self.pluginImplementation.getPlugin().bridge?.viewController,
              controller.viewIfLoaded?.window != nil else {
            fail(isLink, "Google has no active presentation window. Please retry.")
            return
        }`);
    source = replace(source, `                else {
                    return
                }
                let accessToken`, `                else {
                    self.fail(isLink, "Google did not return an identity token.")
                    return
                }
                let accessToken`);
    source = replace(source, `        }
        #endif
    }
}`, `        }
        #else
        fail(isLink, "Google SDK is not included in this app.")
        #endif
    }
}`);
  } else if (file === 'Handlers/AppleAuthProviderHandler.swift') {
    source = replace(source, '    fileprivate var isLink: Bool?', `    fileprivate var isLink = false
    private var authorizationController: ASAuthorizationController?
    private var presentationWindow: ASPresentationAnchor?

    private func clearAuthorization() {
        authorizationController = nil
        presentationWindow = nil
        currentNonce = nil
    }

    private func fail(_ message: String?, error: Error? = nil) {
        clearAuthorization()
        if isLink {
            pluginImplementation.handleFailedLink(message: message, error: error)
        } else {
            pluginImplementation.handleFailedSignIn(message: message, error: error)
        }
    }`);
    source = replace(source, '        return (self.pluginImplementation.getPlugin().bridge?.webView?.window)!', `        // Retain the validated window throughout authorization, including Face ID.
        return presentationWindow ?? ASPresentationAnchor()`);
    source = replace(source, `    func startSignInWithAppleFlow() {
        let nonce = randomNonceString()`, `    func startSignInWithAppleFlow() {
        dispatchPrecondition(condition: .onQueue(.main))
        guard let window = pluginImplementation.getPlugin().bridge?.viewController?.viewIfLoaded?.window else {
            fail("Apple has no active presentation window. Please retry.")
            return
        }
        presentationWindow = window
        let nonce = randomNonceString()`);
    source = replace(source, `        authorizationController.performRequests()`, `        self.authorizationController = authorizationController
        authorizationController.performRequests()`);
    source = replace(source, `        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            return
        }`, `        defer { clearAuthorization() }
        guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            fail("Apple did not return an Apple ID credential.")
            return
        }`);
    source = replace(source, `            fatalError("Invalid state: A login callback was received, but no login request was sent.")`, `            fail("Apple authorization no longer has a valid nonce. Please retry.")
            return`);
    source = replace(source, '            print("Unable to fetch identity token")', '            fail("Apple did not return an identity token.")');
    source = replace(source, '            print("Unable to serialize token string from data: \\(appleIDToken.debugDescription)")', '            fail("Apple returned an unreadable identity token.")');
    source = replace(source, `        guard let isLink = self.isLink else {
            return
        }
        if isLink == true {
            self.pluginImplementation.handleSuccessfulLink`, `        if isLink == true {
            self.pluginImplementation.handleSuccessfulLink`);
    source = replace(source, `        guard let isLink = self.isLink else {
            return
        }
        if isLink == true {
            self.pluginImplementation.handleFailedLink(message: nil, error: error)
        } else {
            self.pluginImplementation.handleFailedSignIn(message: nil, error: error)
        }`, `        fail(nil, error: error)`);
  } else {
    throw new Error(`Unexpected native auth patch target: ${file}`);
  }
  return source;
}

export const nativeAuthPatchFiles = [
  'FirebaseAuthenticationPlugin.swift', 'FirebaseAuthentication.swift',
  'Handlers/GoogleAuthProviderHandler.swift', 'Handlers/AppleAuthProviderHandler.swift',
];
