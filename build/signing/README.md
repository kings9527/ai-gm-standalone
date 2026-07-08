# Code Signing Setup for AI-GM Standalone

This directory contains placeholders and instructions for code signing on each platform.

## Windows (Code Signing Certificate)

1. Obtain a code signing certificate from a trusted CA (e.g., Sectigo, DigiCert)
2. Export as `.pfx` file with a password
3. Set environment variables before building:
   ```bash
   export WIN_CSC_LINK="file:///absolute/path/to/certificate.pfx"
   export WIN_CSC_KEY_PASSWORD="your-pfx-password"
   ```
4. electron-builder will automatically sign the `.exe` and installer

Alternative: Use Azure Trusted Signing (modern cloud signing)
- See: https://www.electron.build/code-signing#azure-trusted-signing

## macOS (Apple Developer ID)

1. Join Apple Developer Program ($99/year)
2. Generate a Developer ID Application certificate in Apple Developer portal
3. Download and install to Keychain
4. Set environment variables:
   ```bash
   export CSC_NAME="Developer ID Application: Your Name (Team ID)"
   export CSC_IDENTITY_AUTO_DISCOVERY=true
   # Or specify keychain if not default:
   # export CSC_KEYCHAIN="~/Library/Keychains/login.keychain-db"
   ```
5. For notarization (required on macOS 10.15+):
   ```bash
   export APPLE_ID="your-apple-id@example.com"
   export APPLE_ID_PASSWORD="app-specific-password"
   export APPLE_TEAM_ID="YOUR_TEAM_ID"
   ```

## Linux

No code signing required for AppImage or .deb packages.
For .deb, GPG signing can be configured via `deb` target options in package.json.

## CI/CD (GitHub Actions)

Store certificates and passwords as repository secrets:
- `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD`
- `CSC_LINK` / `CSC_KEY_PASSWORD` (macOS)
- `APPLE_ID` / `APPLE_ID_PASSWORD` / `APPLE_TEAM_ID`

Use `electron-builder --publish=always` in CI to build + sign + publish to GitHub Releases.

## Current Status

> **Placeholder**: The project is currently NOT code-signed.
> Unsigned builds will show security warnings on Windows and macOS.
> This is acceptable for pre-release/testing but MUST be addressed before public distribution.

See `example.env` in this directory for a template of required environment variables.
