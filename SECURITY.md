# Security Policy

## Supported versions

Security fixes are released for the latest published version of the Asin Node.js SDK.

## Reporting a vulnerability

Please do not report security vulnerabilities through public GitHub issues.

Email **contact@asin.dev** with a description of the issue, the affected version, and steps to reproduce. We acknowledge reports within three business days and keep you informed until the issue is resolved.

## Handling API keys

- Keep your Asin API key out of source control. Load it from the `ASIN_API_KEY` environment variable or a secret manager.
- Rotate the key from the [Asin dashboard](https://www.asin.dev/app) if you believe it was exposed.
