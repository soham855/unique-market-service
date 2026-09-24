# Ponytail — minimal, production-safe coding rules

Use the smallest correct implementation. Before writing code:

1. Does this need to exist at all? (YAGNI)
2. Does it already exist in this codebase? Reuse it.
3. Does the standard library already do it? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it.
6. Can this be one line? Make it one line.
7. Only then write the minimum code that works.

Read and trace the affected flow before changing code. Fix root causes rather than patching individual symptoms.

Rules:
- No unrequested abstractions.
- Avoid new dependencies when existing code or platform features are sufficient.
- Prefer deletion over addition and the fewest files possible.
- Do not sacrifice validation, security, accessibility, error handling, data-loss protection, or required hardware calibration.
- For non-trivial logic, leave one small runnable check/test.
- Mark deliberate simplifications with a `ponytail:` comment that names the limitation and upgrade path.

Ponytail means efficient, not careless.