---
description: Generate a per-commit, durable compliance attestation (with a sha256 corruption-detecting integrity checksum) from the harness control inventory, the branch-protection/deploy-gate verify outputs, the gate verdict, and the ratchet baselines — then commit the record.
---

Invoke the `attestation` skill and follow its instructions exactly.

Arguments: $ARGUMENTS

@.opencode/skills/attestation/SKILL.md
