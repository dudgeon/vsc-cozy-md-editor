```
title: Kitchen Sink Test Document
date: 2026-03-21
author: Test Author
tags: [markdown, testing, decorations]
status: draft
google-doc-url: https://docs.google.com/document/d/example
```

# Product Requirements: Notification System Redesign

The current notification system was built three years ago when the product had fewer than a thousand users. It worked well at that scale, but now that we have grown significantly the limitations are obvious. Users receive too many notifications, the delivery pipeline is unreliable during peak hours, and there is no way to batch or summarize alerts. This document proposes a complete redesign with **phased delivery**, *user-controlled preferences*, and integration with our existing `EventBus` infrastructure.

## Background and Motivation

Our research team conducted a study last quarter that revealed some important findings. Roughly seventy percent of users who churned in the past six months cited "notification fatigue" as a contributing factor. The [full research report](https://docs.google.com/document/d/example-research-report) is available internally, and the executive summary was shared in the March all-hands. The key takeaway is simple: users want **fewer, smarter notifications** rather than a firehose of every event that touches their workspace.

There is also a technical motivation. The current notification pipeline runs as a synchronous process inside the main request handler, which means that a slow email provider or a backed-up push queue can add latency to unrelated API calls. Moving to an **asynchronous, queue-based architecture** would eliminate this coupling and give us the ability to retry, batch, and deduplicate before delivery.

### Goals

- Reduce notification volume by at least 40% without losing important signals
- Deliver all notifications through a unified pipeline with retry and batching
- Give users a `NotificationPreferences` panel with per-channel, per-category controls
- Support three delivery channels: in-app, email digest, and push
- Maintain backward compatibility with the existing webhook integration

### Non-Goals

- We are *not* building a full messaging or chat system
- Real-time collaborative presence indicators are out of scope for this phase
- Mobile-specific notification UX will be handled in a separate workstream

## Proposed Architecture

The new system replaces the synchronous `NotificationService.send()` call with an event-driven pipeline. When something noteworthy happens, the originating service publishes a `NotificationEvent` to the `EventBus`. A set of downstream consumers handle routing, deduplication, batching, and delivery.

```typescript
interface NotificationEvent {
    id: string;
    userId: string;
    category: "mention" | "assignment" | "status_change" | "comment" | "system";
    priority: "urgent" | "normal" | "low";
    payload: Record<string, unknown>;
    timestamp: Date;
}
```

The pipeline has four stages:

1. **Ingestion** — validate the event schema and enrich with user prenoferences
2. **Deduplication** — collapse repeated events within a configurable time window
3. **Batching** — group `low` and `normal` priority events into periodic digests
4. **Delivery** — route to the appropriate channel (in-app, email, push) based on user settings

> This architecture intentionally separates *what happened* from *how to tell the user*. The originating service should never need to know whether the user prefers email or push, or whether their notifications are currently batched. That is the pipeline's job.

## Notification Categories

| Category | Default Channel | Batching | Example |
| :--- | :---: | :---: | ---: |
| Mention | In-app + Push | No | "@you in a comment" |
| Assignment | In-app + Email | No | "Task assigned to you" |
| Status Change | In-app | Yes (hourly) | "PR merged" |
| Comment | In-app | Yes (hourly) | "New reply on your doc" |
| System | Email | Yes (daily) | "Billing update" |

Users can override any of these defaults through the preferences panel. The only constraint is that `urgent` priority events always deliver immediately regardless of batching settings.

## User Preferences

The preferences panel should feel simple even though the underlying model is flexible. We want to avoid the anti-pattern where the settings page is so granular that users give up and leave everything on default. The recommended approach is a **three-tier model**:

- **Quick toggle** — a single switch for "Focus Mode" that suppresses everything except urgent and direct mentions
- **Category controls** — one row per category with channel checkboxes (in-app, email, push) and a batch/immediate toggle
- **Advanced overrides** — per-project or per-workspace rules, hidden behind an "Advanced" disclosure triangle

> For the initial release, we recommend shipping only the quick toggle and category controls. The advanced overrides can come in a follow-up once we see how users interact with the simpler version. It is better to ship a clean, understandable interface than to expose every knob on day one.

## Lists and Task Tracking

### Implementation Milestones

- Define the `NotificationEvent` schema and publish to the internal API docs
- Build the `EventBus` consumer with deduplication logic
- Implement the batching service with configurable time windows
- Create the preferences panel UI with **category controls** and *Focus Mode* toggle
- Wire up delivery adapters for in-app, email via `SendGrid`, and push via `Firebase`
- Load-test the pipeline at 10x current peak volume
- Run a two-week A/B test comparing old vs. new notification volume

### Open Questions

1. Should we support a "snooze" feature that delays non-urgent notifications for a user-specified period?
2. What is the right default batch interval — thirty minutes, one hour, or should it vary by category?
3. Do we need a dedicated notification history view, or is the existing activity feed sufficient?

### Nested Lists

- Channel adapters
    - In-app adapter
        - Uses WebSocket for real-time delivery
        - Falls back to polling for clients without WebSocket support
    - Email adapter
        - SendGrid integration with template system
        - Supports both HTML and plain-text rendering
    - Push adapter
        - Firebase Cloud Messaging for Android and iOS
        - Web Push API for browser notifications

1. Phase one deliverables
    1. Event schema and bus integration
    2. Deduplication service
    3. Basic preferences panel
2. Phase two deliverables
    1. Batching and digest system
    2. Advanced per-project overrides
    3. Notification history view
3. Phase three deliverables
    1. Analytics dashboard for notification engagement
    2. Machine-learning-based priority scoring
    3. Cross-device sync for read/unread state

### Task Lists

- [x] Draft the PRD
- [x] Get stakeholder sign-off on architecture
- [ ] Define the event schema
- [ ] Build the deduplication service
- [ ] Design the preferences panel mockups
- [ ] Implement delivery adapters

## CriticMarkup Examples

This paragraph contains several examples of CriticMarkup for testing the track changes display. The team decided to {++ add a retry mechanism to the delivery pipeline ++} after the outage last month. We also agreed to {-- remove the legacy synchronous notification path --} once the new pipeline is stable. The original proposal called the batching interval {~~ thirty minutes ~> one hour ~~} based on user research feedback.

{>> Consider whether we need a separate SLA for urgent notifications vs. batched ones. The current language is vague about delivery guarantees. <<}

The executive summary {== should be reviewed by legal before publishing ==}{>> Elena flagged this in the last review cycle <<}.

## Links in Context

The [notification preferences API](https://api.example.com/docs/notifications) supports both REST and GraphQL. For implementation details, see the [architecture decision record](https://confluence.example.com/adr/notification-pipeline) and the [original RFC](https://github.com/example/rfcs/pull/47). The design mockups are in [Figma](https://figma.com/file/example-notifications) and the project board is tracked in [Linear](https://linear.app/example/project/notifications).

## Horizontal Rules

The sections above cover the core proposal. Below are appendices and reference material.

---

## Appendix A: Mixed Content Stress Test

> ### Blockquoted Heading
>
> This blockquote contains a full paragraph with **bold text**, *italic text*, `inline code`, and a [link to the spec](https://example.com/spec). It also spans multiple lines to test how the decoration system handles blockquote continuation across wrapped lines in the editor viewport. The goal is to verify that the left border and italic styling extend cleanly without visual breaks.

> A second blockquote immediately following the first, to test that the decoration system handles adjacent blockquotes as separate visual blocks rather than merging them.

| Metric | Before | After | Change |
| :--- | :---: | :---: | ---: |
| **Notifications per user per day** | 47 | 18 | -62% |
| *Email open rate* | 12% | 34% | +183% |
| `P99 delivery latency` | 2.4s | 0.3s | -87% |
| [Dashboard link](https://grafana.example.com/notifications) | — | — | — |
| {++ New metric ++} | — | TBD | — |

The end.
