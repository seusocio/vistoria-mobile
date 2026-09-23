# Architecture Decision Records

One decision per file, numbered in the order they were taken. An ADR records *why* something
is the way it is, so the next person doesn't undo it by reading the code alone. Several of the
decisions here look like premature optimisation or needless indirection until you know what they
are working around — that is exactly why they are written down.

All of these came out of one piece of work: the collapsible accordion sections on **ChecklistForm**
(authoring) and **ApplicationFill** (filling), which were janky once a group held more than ~10
items.

| # | Decision | Status |
|---|---|---|
| [0001](0001-collapsible-compound-component.md) | The accordion owns its header, row and title design | Accepted |
| [0002](0002-measure-collapsible-content-out-of-flow.md) | Collapsible height is measured from an out-of-flow child | Accepted |
| [0003](0003-never-unmount-collapsed-content.md) | Collapsed content is lazy-mounted once and never unmounted | Accepted |
| [0004](0004-one-pan-gesture-per-reorderable-list.md) | One pan gesture instance per reorderable list | Accepted |
| [0005](0005-section-local-expand-state.md) | Expand/collapse state is owned by the section | Accepted |
| [0006](0006-remove-section-level-layout-animator.md) | Remove the section-level layout animator, keep the per-cell one | Accepted (amended) |
| [0007](0007-single-pass-render-for-non-scrolling-lists.md) | Non-scrolling nested lists render in a single pass | Accepted |
| [0008](0008-memoization-contract-for-sections-and-rows.md) | Sections and rows have an explicit memoization contract | Accepted |
| [0009](0009-offline-queue-as-the-only-write-path.md) | The offline queue is the only write path | Accepted |
| [0010](0010-collapsible-card-variant.md) | A bar variant, not a second accordion | Accepted |
| [0011](0011-history-layout-is-a-persisted-preference.md) | The history layout is a persisted preference, not a screen state | Accepted |
| [0011](0011-daily-inspection-report.md) | The daily inspection report is generated offline from Convex reads | Accepted |

## A note on evidence

These were written after reading the source of `react-native-reorderable-list` (`^0.18.1`),
`react-native-gesture-handler` (`~2.32.0`) and `react-native-reanimated` (`4.5.1`), plus the app's
own code — **not** from a profiler trace or an instrumented device run.

Where an ADR states a mechanism (what the library does, what the code did), that was read directly
from the source and is cited. Where it states a performance *outcome*, that is a reasoned
expectation and is marked as such.

Two of these record optimisations that were shipped and turned out to be wrong —
[0003](0003-never-unmount-collapsed-content.md) (unmounting collapsed content broke drag-and-drop)
and [0006](0006-remove-section-level-layout-animator.md) (removing a row transition silently killed
the feedback for confirming an item). Both reversals came from reasoning about cost without
measuring it, against behaviour that was there for a reason. Treat the unverified claims here with
that in mind, and profile before building on them.
