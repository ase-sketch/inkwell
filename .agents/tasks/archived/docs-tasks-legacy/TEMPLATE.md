# <Task Title>

> Active task directory format: `NN-kebab-case-name/`. Archived tasks move to `docs/tasks/archived/<task-slug>/`.

## Relative documents refs

## User Request / Topic

- 

## Goal

A good Goal is more than a larger prompt. It is a compact contract for how Codex should work, what counts as success, and what should happen if success is not yet reachable.

The strongest Goals usually define six things:
* Outcome: what should be true when the work is done.
* Verification surface: the test, benchmark, report, artifact, command output, or source material that proves it.
* Constraints: what must not regress while Codex works.
* Boundaries: which files, tools, data, repositories, or resources Codex may use.
* Iteration policy: how Codex should decide what to try next after each attempt.
* Blocked stop condition: when Codex should stop and report that no defensible path remains under the current limits.

A useful pattern is:

```text
/goal <desired end state> verified by <specific evidence> while preserving <constraints>. Use <allowed inputs, tools, or boundaries>. Between iterations, <how Codex should choose the next best action>. If blocked or no valid paths remain, <what Codex should report and what would unlock progress>.
```

For example, this Goal is workable but still fairly thin:

```text
/goal Reduce p95 checkout latency below 120 ms without regressing correctness tests
```

A stronger version gives Codex a fuller operating contract:

```text
/goal Reduce p95 checkout latency below 120 ms, verified by the checkout benchmark, while keeping the correctness suite green. Use only the checkout service, benchmark fixtures, and related tests. Between iterations, record what changed, what the benchmark showed, and the next best experiment to try. If the benchmark cannot run or no valid paths remain, stop with the attempted paths, the evidence gathered, the blocker, and the next input needed.
```

## Current State

- 

## ADR / Decisions / Discussion

-


## Verification / Test

-

## Implementation Walkthrough

你能直接把 Walkthrough 记录在这一节。如果任务量较重。把实现计划放到同目录下的 walkthroughs/ 文件夹

-

## TODO / Follow-ups

- 
