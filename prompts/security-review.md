# Security Review (OWASP Top 10)

Analyze the PR diff for security vulnerabilities:

## 1. Injection
- SQL built with string concatenation or String.format
- Command injection via Runtime.exec() or child_process
- LDAP, XPath, template injection

## 2. Broken Authentication
- Hardcoded credentials, API keys, tokens
- Weak password validation
- Tokens or secrets logged to console/files

## 3. Sensitive Data Exposure
- PII (emails, names, IDs) in log statements
- Secrets in source code or config files
- Missing encryption for sensitive data at rest/transit

## 4. XXE
- XML parsers without disabling external entities
- Unvalidated XML input processing

## 5. Broken Access Control
- Missing authorization checks on endpoints
- IDOR (direct object reference without ownership check)
- Missing data isolation between users/organizations

## 6. Security Misconfiguration
- Debug mode enabled in production config
- CORS with wildcard origin (*)
- Exposed management/actuator endpoints
- Verbose error messages leaking internals

## 7. XSS
- dangerouslySetInnerHTML or v-html with user content
- Unsanitized user input rendered in HTML

## 8. Insecure Deserialization
- ObjectInputStream on untrusted data
- JSON deserialization with polymorphic types

## 9. Known Vulnerabilities
- Outdated dependencies with known CVEs (check version numbers)

## 10. Insufficient Logging
- Security events not logged (auth failures, access denied)
- Sensitive data IN log statements

Focus ONLY on changed lines. Be specific about the vulnerability and how to fix it.
