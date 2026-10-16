# Contributing

Contributions improving correctness, developer usability, security and
portability are welcome.

- Propose significant or breaking changes in an issue first.
- Keep generated backend code vendor-neutral and self-contained.
- Prefer focused modules and typed contracts to framework-wide abstractions.
- Run `npm test` at the generator root and the generated application's
  `typecheck`, `test` and `build` after installing its dependencies.
- For database changes, generate/review a Drizzle migration in a generated
  application; do not use `db:push` against live databases.
- Never commit secrets, `.env`, bearer tokens, production database URLs or
  log files. Never add blocking CI or deployment jobs without explicit consent.
