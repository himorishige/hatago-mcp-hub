IHub introduction and docs (2025-09-07):

- Added IHub interface to packages/hub/src/types.ts and exported from index; methods: start/stop/on/onNotification?/handleJsonRpcRequest
- Server: metrics.ts now depends on Pick<IHub,'on'>; stdio.ts uses typed bridge for handleJsonRpcRequest
- Test-utils: types.ts and with-hub.ts use IHub; with-hub casts createHub result to IHub for tests
- Docs: added docs/CHANGELOG_refactor.md summarizing refactor and IHub; updated plan docs earlier
- Whole repo passes typecheck and lint; tests pass
