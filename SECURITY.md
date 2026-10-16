# Security policy

This is an application starter, not a guarantee of production security.

If you discover a security issue, **do not open a public issue containing the
exploit or sensitive details**. Use GitHub's private vulnerability reporting
feature for this repository once it has been created, or contact the repository
maintainer privately through a verified contact channel.

Please include affected versions, relevant routes, reproduction steps and
potential impact without exposing user credentials or personal data.

Operational priorities: keep dependencies patched, run a full security review
before deployments, rotate exposed JWT/DB credentials, use HTTPS and backup
restore drills, and review cross-site refresh-cookie/CSRF requirements.
