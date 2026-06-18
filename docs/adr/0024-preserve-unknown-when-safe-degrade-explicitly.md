# Preserve Unknown Data When Safe, Degrade Explicitly Otherwise

The `.drawio` compatibility layer will preserve unsupported or unknown properties and shape-related data when it is safe to do so, and will degrade explicitly rather than discarding information silently. The decision is to maximize round-trip fidelity and practical interoperability for the Semantic Port while being honest about unsupported behavior instead of failing too eagerly or pretending to understand data that the engine cannot yet model semantically.
