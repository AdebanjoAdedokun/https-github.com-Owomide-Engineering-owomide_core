// Who is told about each event, and through which channels.
//
// Recipients are decided from the event itself, from the participant projection (the Proposal's
// submitter and approver, which later events do not repeat), and from RBAC permissions. The
// person who caused an event is never notified of their own action, and the submitter is never
// asked to approve their own Proposal (maker-checker, PRD FLOW-013).

export type EventType =
  | "proposal.submitted"
  | "proposal.blocked"
  | "proposal.approved"
  | "proposal.published"
  | "override.requested"
  | "override.approved"
  | "import.committed";

export const SUBSCRIBED_EVENT_TYPES: readonly EventType[] = [
  "proposal.submitted",
  "proposal.blocked",
  "proposal.approved",
  "proposal.published",
  "override.requested",
  "override.approved",
  "import.committed",
];

/** Facts decoded from an event that routing and templates need. No cost or margin values. */
export interface EventFacts {
  eventId: string;
  type: EventType;
  orgId: string;
  actorId: string;
  entityType: "proposal" | "import_batch";
  entityId: string;
  /** Present on proposal.approved and override.approved. */
  approverId?: string;
  /** Present on override.approved. */
  requesterId?: string;
  /** Present on proposal.blocked. */
  blockedLineCount?: number;
  /** Present on import.committed. */
  importCounts?: {
    ok: number;
    warned: number;
    excluded: number;
    errored: number;
  };
}

export interface Participants {
  submitterUserId: string;
  approverUserId: string | null;
}

/** A recipient rule: fixed people, or everyone holding a permission. */
export type Audience =
  | { kind: "submitter" }
  | { kind: "approver" }
  | { kind: "actor" }
  | { kind: "requester" }
  | { kind: "permission"; permission: string };

export interface Route {
  audiences: readonly Audience[];
  /** In-app delivery cannot be switched off for requests that need someone to act. */
  inAppMandatory: boolean;
}

export const ROUTES: Readonly<Record<EventType, Route>> = {
  "proposal.submitted": {
    audiences: [{ kind: "permission", permission: "approval.approve" }],
    inAppMandatory: true,
  },
  "proposal.blocked": {
    audiences: [{ kind: "submitter" }],
    inAppMandatory: false,
  },
  "proposal.approved": {
    audiences: [{ kind: "submitter" }],
    inAppMandatory: false,
  },
  "proposal.published": {
    audiences: [
      { kind: "submitter" },
      { kind: "approver" },
      { kind: "permission", permission: "execution.mark_implemented" },
    ],
    inAppMandatory: true,
  },
  "override.requested": {
    audiences: [{ kind: "permission", permission: "override.approve" }],
    inAppMandatory: true,
  },
  "override.approved": {
    audiences: [{ kind: "requester" }],
    inAppMandatory: false,
  },
  "import.committed": { audiences: [{ kind: "actor" }], inAppMandatory: false },
};

export function isSubscribedEventType(type: string): type is EventType {
  return (SUBSCRIBED_EVENT_TYPES as readonly string[]).includes(type);
}

/** Looks up people and their permissions. Implemented against RBAC. */
export interface RecipientDirectory {
  /** Active members holding the permission through an active role assignment. */
  usersWithPermission(
    orgId: string,
    permission: string,
  ): Promise<readonly string[]>;
  /** Email addresses of active members; people without one are absent from the map. */
  emailAddresses(
    orgId: string,
    userIds: readonly string[],
  ): Promise<ReadonlyMap<string, string>>;
}

/**
 * Returns the distinct user ids to notify, in a stable order. The actor is always excluded;
 * for a submission the submitter (the actor) is excluded from the approvers too.
 */
export async function resolveRecipients(
  facts: EventFacts,
  participants: Participants | null,
  directory: RecipientDirectory,
): Promise<string[]> {
  const route = ROUTES[facts.type];
  const recipients = new Set<string>();
  for (const audience of route.audiences) {
    switch (audience.kind) {
      case "submitter":
        if (participants) recipients.add(participants.submitterUserId);
        break;
      case "approver": {
        const approver = facts.approverId || participants?.approverUserId;
        if (approver) recipients.add(approver);
        break;
      }
      case "actor":
        recipients.add(facts.actorId);
        break;
      case "requester":
        if (facts.requesterId) recipients.add(facts.requesterId);
        break;
      case "permission":
        for (const user of await directory.usersWithPermission(
          facts.orgId,
          audience.permission,
        )) {
          recipients.add(user);
        }
        break;
    }
  }
  // Nobody is told about their own action, except the uploader, who is told their import
  // finished (it completes asynchronously, after they have left the page).
  if (facts.type !== "import.committed") recipients.delete(facts.actorId);
  if (facts.type === "proposal.submitted" && participants) {
    recipients.delete(participants.submitterUserId);
  }
  recipients.delete("");
  return [...recipients].sort();
}

export interface ChannelPreference {
  emailEnabled: boolean;
  inAppEnabled: boolean;
}

export interface Channels {
  inApp: boolean;
  email: boolean;
}

/** Defaults: both channels on. A mandatory in-app notification ignores an opt-out. */
export function channelsFor(
  type: EventType,
  preference: ChannelPreference | undefined,
): Channels {
  const route = ROUTES[type];
  return {
    inApp: route.inAppMandatory || (preference?.inAppEnabled ?? true),
    email: preference?.emailEnabled ?? true,
  };
}
