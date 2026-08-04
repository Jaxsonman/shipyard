# Engineering practices — every dev task follows these

Injected into every task brief and review. Numbered so findings can cite
them (e.g. "violates #2"). Ordered by evidence strength.

1. **Simplicity first.** Prefer the simplest design that fully satisfies
   the stated requirements — including required security and scale
   constraints — and nothing more. Complexity (dependencies + obscurity)
   is the enemy, not a trade-off.
2. **YAGNI.** Implement exactly what the task specifies. No speculative
   config flags, abstraction layers, or generalized interfaces. Agents
   scope-creep by inference; this is the checkable constraint against it.
3. **Tests as proof, not decoration.** Red-then-green observed output is
   the only evidence a change does what it claims. A test never seen
   failing proves nothing.
4. **Small, verifiable increments.** One task, one commit, independently
   reviewable. Small batches are what keep AI-generated velocity from
   becoming instability.
5. **Independent verification before "done".** Review catches defects
   testing alone does not (~55–60% vs ~25–45% detection). Never
   self-certify.
6. **Fail fast, fail loud.** Never swallow an error to keep going. Loud
   failure at the point of fault makes mistakes cheap to catch.
7. **Read-optimized, convention-matching code.** Code is read far more
   than written. Match the surrounding codebase's idioms — naming,
   comment density, error style — never import a preferred style.
8. **Secure by default.** Least privilege, validate at trust boundaries,
   fail closed. "Simplest" never means skipping validation — it means the
   simplest solution that still validates and fails closed.
9. **Small, single-purpose units.** One reason to change per unit — the
   enabler of small diffs, focused tests, and reviewable changes.
   (Design doctrine rather than measured evidence, but it is what makes
   #3–#5 workable.)
10. **Duplication over the wrong abstraction.** Don't unify
    similar-looking code unless the plan calls for it or a third
    duplicate appears. Unwinding a bad abstraction costs far more than
    duplication does.

---

Sources: Ousterhout, *A Philosophy of Software Design*; Gabriel, "Worse is
Better"; PEP 20 (1); Fowler bliki "Yagni", Jeffries/XP (2); Beck, *TDD by
Example*, Google Testing Blog, DORA (3); Google eng-practices "Small CLs",
Forsgren/Humble/Kim *Accelerate*, dora.dev (4); McConnell, *Code
Complete*, DORA 2019 (5); Shore, "Fail Fast", IEEE Software 2004 (6);
*Software Engineering at Google* ch. 3, PEP 20 (7); OWASP secure design
principles (8); Martin, SRP (9); Hunt & Thomas *The Pragmatic Programmer*,
Metz "The Wrong Abstraction" (10).
