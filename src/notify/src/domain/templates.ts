import type { EventFacts } from "./routing.js";

// Plain-language messages. They name what happened and where to act, and never include prices,
// costs or margins: an email can be forwarded, and not every recipient may see cost data.

export interface RenderedNotification {
  title: string;
  body: string;
  /** Workspace path the notification opens. */
  linkPath: string;
  emailSubject: string;
  emailText: string;
}

const PRODUCT = "Owómidé";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function render(
  facts: EventFacts,
  appBaseUrl: string,
): RenderedNotification {
  const proposalPath = `/proposals/${facts.entityId}`;
  let title: string;
  let body: string;
  let linkPath: string;
  switch (facts.type) {
    case "proposal.submitted":
      title = "A proposal needs your review";
      body = "A pricing proposal has been submitted for approval.";
      linkPath = proposalPath;
      break;
    case "proposal.blocked": {
      const lines = facts.blockedLineCount ?? 0;
      title = "Your proposal is blocked";
      body =
        lines > 0
          ? `${plural(lines, "line breaks", "lines break")} a margin guardrail. Review the lines, then resubmit or request an override.`
          : "The proposal breaks a margin guardrail. Review the lines, then resubmit or request an override.";
      linkPath = proposalPath;
      break;
    }
    case "proposal.approved":
      title = "Your proposal was approved";
      body =
        "Finance approved your pricing proposal. It can now be handed to the store team.";
      linkPath = proposalPath;
      break;
    case "proposal.published":
      title = "Approved price changes are ready";
      body =
        "An approved proposal has been released. Store staff can download the price list and record each change once it is on the shelf.";
      linkPath = proposalPath;
      break;
    case "override.requested":
      title = "An override needs your decision";
      body =
        "Someone has asked to approve prices below a margin guardrail, with a written reason.";
      linkPath = proposalPath;
      break;
    case "override.approved":
      title = "Your override was approved";
      body = "Your request to go below a margin guardrail was approved.";
      linkPath = proposalPath;
      break;
    case "import.committed": {
      const c = facts.importCounts ?? {
        ok: 0,
        warned: 0,
        excluded: 0,
        errored: 0,
      };
      const saved = c.ok + c.warned;
      title = "Your import is complete";
      body =
        `${plural(saved, "row was", "rows were")} saved` +
        (c.errored > 0
          ? `, ${plural(c.errored, "row was", "rows were")} rejected with reasons`
          : "") +
        (c.excluded > 0
          ? `, ${plural(c.excluded, "row was", "rows were")} excluded`
          : "") +
        ".";
      linkPath = `/imports/${facts.entityId}`;
      break;
    }
  }
  const url = `${appBaseUrl.replace(/\/+$/, "")}${linkPath}`;
  return {
    title,
    body,
    linkPath,
    emailSubject: `${PRODUCT}: ${title}`,
    emailText: `${body}\n\nOpen it in ${PRODUCT}: ${url}\n\nYou can change which emails you receive in your notification settings.`,
  };
}
