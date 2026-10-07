import {
  type BugFields,
  buildBug,
  buildReportLag,
  buildSurveySubmit,
  type LagFields,
  type SurveyAnswer,
} from "#wow/areas/tickets/protocol";
import type { TicketsCtx } from "#wow/areas/tickets/runtime-shared";
import { waitFor } from "#wow/areas/tickets/runtime-shared";
import { GameOpcode } from "#wow/protocol/opcodes";

export type ResolveGmResponseResult =
  | { status: "resolved"; surveyOffered: boolean }
  | { status: "none" };

export type TicketsResponseActs = {
  resolveGmResponse: () => Promise<ResolveGmResponseResult>;
  submitSurvey: (
    surveyId: number,
    answers: readonly SurveyAnswer[],
    comment: string,
  ) => Promise<{ status: "recorded" }>;
  reportBug: (fields: BugFields) => Promise<{ status: "recorded" }>;
  reportLag: (fields: LagFields) => Promise<{ status: "recorded" }>;
};

export function ticketsResponseActs(ctx: TicketsCtx): TicketsResponseActs {
  async function resolveGmResponse(): Promise<ResolveGmResponseResult> {
    const reply = await waitFor(
      ctx,
      (incoming) => incoming.type === "gm_survey",
      () => ctx.send(GameOpcode.CMSG_GMRESPONSE_RESOLVE),
    );
    if (reply?.type !== "gm_survey") return { status: "none" };
    return { status: "resolved", surveyOffered: reply.offered };
  }

  function submitSurvey(
    surveyId: number,
    answers: readonly SurveyAnswer[],
    comment: string,
  ): Promise<{ status: "recorded" }> {
    ctx.send(
      GameOpcode.CMSG_GMSURVEY_SUBMIT,
      buildSurveySubmit(surveyId, answers, comment),
    );
    return Promise.resolve({ status: "recorded" });
  }

  function reportBug(fields: BugFields): Promise<{ status: "recorded" }> {
    ctx.send(GameOpcode.CMSG_BUG, buildBug(fields));
    return Promise.resolve({ status: "recorded" });
  }

  function reportLag(fields: LagFields): Promise<{ status: "recorded" }> {
    ctx.send(GameOpcode.CMSG_GM_REPORT_LAG, buildReportLag(fields));
    return Promise.resolve({ status: "recorded" });
  }

  return { reportBug, reportLag, resolveGmResponse, submitSurvey };
}
