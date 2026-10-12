---
name: GitHub authorization
description: Handling source-control authorization failures without exposing credentials.
---

A GitHub source-control connection can report healthy while a Git push fails authentication. Generic integration reconnect cards may not support that connection type.

**Why:** The source-control connection reported active, but GitHub rejected the push and both generic authorization-card flows were rejected.

**How to apply:** When this mismatch occurs, consult current Replit documentation and direct the user to authorize GitHub through the Git pane. Preserve the local commit and retry the push after authorization. Do not ask for tokens in chat or repeatedly retry unsupported cards.
