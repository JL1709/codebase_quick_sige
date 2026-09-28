# Follow coding best practices

- Descriptive Naming: Choose descriptive names for variables, classes, and methods to convey clear meaning (e.g., totalAmount instead of x).
- Intent-Focused Comments: Write comments to explain why code was written a specific way, not how it works or what it does.
- No Magic Numbers: Replace literal numbers with explanatory named constants to prevent confusion.
- Adopt Style Guides: Enforce language-specific layouts (like PEP 8) and use automated tools like linters and formatters to keep styling uniform.
- DRY Principle (Don't Repeat Yourself): Extract repetitive business logic into reusable functions, utilities, or components.
- Single Responsibility Principle (SRP): Design every class, module, or function to focus entirely on doing one single thing well.
- Minimize Changing State: Reduce global variables and mutable data to prevent unpredictable side effects across the codebase.
- Keep It Simple (KISS): Avoid over-engineering systems with unnecessary design patterns; write the simplest code possible.
- Write Unit Tests: Verify isolated methods or components by mocking external dependencies like APIs or databases.
- Continuous Refactoring: Dedicate time to clean and improve old code regularly to pay down technical debt.
- Automated CI/CD: Use pipelines to automatically build, lint, and run tests every time code is pushed.
- Small Pull Requests: Keep code branches small and focused on single problems to ensure thorough peer reviews.
- Constructive Peer Reviews: Use the review process to catch edge cases, validate architectural decisions, and share team knowledge.
- Security by Design: Sanitize all external inputs to block injection attacks, encrypt sensitive data, and keep third-party dependencies updated.

Don't immediately code → investigate first.
Don't patch → find root cause.
Don't create duplicated state → single source of truth.
Don't interpret a bug too narrowly → think system-wide.
Don't optimize for smallest diff → optimize for correct architecture.
Don't overengineer → simplest proper solution.
Don't say “done” after compiling → actually verify.