# tasks

One directory per task, named by slug. Inside it, one artefact per pipeline
stage the task runs:

`understand.md` → `research.md` → `design.md` → `implement.md` → `test.md` →
`review.md` → `deploy.md`

The stages group into the project's three phases: discovery is understand and
research, development is design, implement and test, delivery is review and
deploy. The artefacts stay together here regardless of phase — the phase
directories hold the work, the task directory holds how the task moved
through it.

Every artefact opens with:

```yaml
---
task: <slug>
stage: understand | research | design | implement | test | review | deploy
status: draft | gated
---
```

`gated` means the stage's exit gate passed and downstream stages may treat
the artefact as settled. A stage that reads a `draft` upstream artefact says
so and states the assumption it proceeds on.

A task runs only the stages it earns, and the files that exist state which.
For data-engineering tasks the de-* skill set extends the stages: contract
before build, profile before design, reconcile before acceptance, operate
before schedule. When a later stage contradicts an earlier artefact, fix the
earlier file in place and continue — never leave two artefacts disagreeing,
never annotate.
