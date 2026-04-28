import Anthropic from "@anthropic-ai/sdk";
import {
  ATLAS_SYSTEM_PROMPT,
  ONBOARDING_PROMPT,
  CHECKIN_PROMPT,
  buildContext,
} from "./prompts";
import { startOfLocalWeekSunday } from "@/lib/local-week";
import { TOOL_DEFINITIONS, getToolByName, type ToolResult } from "./tools";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/** Larger model = bigger context + output; use for heavy check-ins if Haiku truncates tools. */
const ATLAS_MODEL =
  process.env.ATLAS_MODEL?.trim() || "claude-haiku-4-5";

const ATLAS_MAX_OUTPUT_TOKENS = Math.min(
  64000,
  Math.max(
    4096,
    parseInt(process.env.ATLAS_MAX_OUTPUT_TOKENS || "16384", 10) || 16384,
  ),
);

/**
 * Check-ins often generate both meal and workout plans in one run.
 * Give these rounds 2x output budget (still capped to Anthropic max).
 */
function maxTokensForMode(mode: AtlasInput["mode"]): number {
  if (mode === "checkin") {
    return Math.min(64000, ATLAS_MAX_OUTPUT_TOKENS * 2);
  }
  return ATLAS_MAX_OUTPUT_TOKENS;
}

/** Keep last N turns so long threads do not exceed context limits. */
const ATLAS_MAX_HISTORY_MESSAGES = Math.min(
  80,
  Math.max(
    8,
    parseInt(process.env.ATLAS_MAX_HISTORY_MESSAGES || "36", 10) || 36,
  ),
);

export interface AtlasInput {
  userId: string;
  message: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  mode: "onboarding" | "checkin" | "chat";
}

export interface AtlasStreamEvent {
  type: "text" | "done" | "refresh" | "error";
  content?: string;
  target?: string;
  toolCalls?: Array<{ name: string; input: unknown; result: unknown }>;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function userOptedOutWorkoutUpdate(input: AtlasInput): boolean {
  const haystack = [
    input.message,
    ...input.conversationHistory
      .filter((m) => m.role === "user")
      .map((m) => m.content),
  ]
    .join("\n")
    .toLowerCase();
  return (
    /\b(no|skip|dont|don't)\b.{0,30}\b(workout|exercise|training)\b/.test(haystack) ||
    /\b(workout|exercise|training)\b.{0,30}\b(no|skip|dont|don't)\b/.test(haystack) ||
    /\bkeep\b.{0,20}\bworkout\b.{0,20}\b(same|unchanged)\b/.test(haystack)
  );
}

export function runAtlas(input: AtlasInput): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const refreshTargets = new Set<string>();
  const toolCallLog: Array<{ name: string; input: unknown; result: unknown }> = [];
  const currentWeekKey = localDateKey(startOfLocalWeekSunday(new Date()));
  const workoutOptional = userOptedOutWorkoutUpdate(input);
  let mealPlanSavedForCurrentWeek = false;
  let workoutPlanSavedForCurrentWeek = false;
  let attemptedMealPlanSave = false;
  let attemptedWorkoutPlanSave = false;

  return new ReadableStream({
    async start(controller) {
      try {
        const context = await buildContext(input.userId);

        let modePrompt = "";
        if (input.mode === "onboarding") modePrompt = ONBOARDING_PROMPT;
        else if (input.mode === "checkin") modePrompt = CHECKIN_PROMPT;

        const systemPrompt = [
          ATLAS_SYSTEM_PROMPT,
          modePrompt,
          "# Current User Data\n" + context,
        ]
          .filter(Boolean)
          .join("\n\n---\n\n");

        const messages: Anthropic.MessageParam[] = [];

        const historySlice = input.conversationHistory.slice(
          -ATLAS_MAX_HISTORY_MESSAGES,
        );
        for (const msg of historySlice) {
          messages.push({ role: msg.role, content: msg.content });
        }
        messages.push({ role: "user", content: input.message });

        let fullResponse = "";
        let shouldStop = false;
        let iterations = 0;
        /** Meal + workout + profile in one check-in can need several model↔tool rounds. */
        const MAX_ITERATIONS = 14;

        const sendSSE = (event: AtlasStreamEvent) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        };

        // Agentic loop: call the API, handle tool use, repeat
        while (!shouldStop && iterations < MAX_ITERATIONS) {
          iterations++;
          let stoppedForMaxTokens = false;
          const response = await anthropic.messages.create({
            model: ATLAS_MODEL,
            max_tokens: maxTokensForMode(input.mode),
            system: systemPrompt,
            tools: TOOL_DEFINITIONS,
            messages,
            stream: true,
          });

          let currentText = "";
          const toolUseBlocks: Array<{
            id: string;
            name: string;
            input: string;
          }> = [];
          let currentToolId = "";
          let currentToolName = "";
          let currentToolInput = "";
          let inToolUse = false;

          for await (const event of response) {
            if (event.type === "content_block_start") {
              if (event.content_block.type === "text") {
                inToolUse = false;
              } else if (event.content_block.type === "tool_use") {
                inToolUse = true;
                currentToolId = event.content_block.id;
                currentToolName = event.content_block.name;
                currentToolInput = "";
              }
            } else if (event.type === "content_block_delta") {
              if (!inToolUse && event.delta.type === "text_delta") {
                currentText += event.delta.text;
                fullResponse += event.delta.text;
                sendSSE({ type: "text", content: event.delta.text });
              } else if (
                inToolUse &&
                event.delta.type === "input_json_delta"
              ) {
                currentToolInput += event.delta.partial_json;
              }
            } else if (event.type === "content_block_stop") {
              if (inToolUse && currentToolName) {
                toolUseBlocks.push({
                  id: currentToolId,
                  name: currentToolName,
                  input: currentToolInput,
                });
                inToolUse = false;
              }
            } else if (event.type === "message_delta") {
              const sr = event.delta.stop_reason;
              if (sr === "max_tokens") {
                stoppedForMaxTokens = true;
                if (toolUseBlocks.length === 0) {
                  shouldStop = true;
                }
              }
            }
          }

          if (stoppedForMaxTokens && toolUseBlocks.length > 0) {
            sendSSE({
              type: "text",
              content:
                "\n\n— Output hit the token limit while building a tool request; the tool may be incomplete. I'll stop this round — say **continue** and I'll retry with smaller steps (e.g. meal plan only, then workout plan). —",
            });
            shouldStop = true;
          }

          if (toolUseBlocks.length > 0) {
            // Tool blocks take priority so DB mutations always execute.
            // Build the assistant message with text + tool_use blocks
            const assistantContent: Anthropic.ContentBlockParam[] = [];
            if (currentText) {
              assistantContent.push({ type: "text", text: currentText });
            }
            for (const tb of toolUseBlocks) {
              let parsedInput: Record<string, unknown> = {};
              try {
                parsedInput = JSON.parse(tb.input);
              } catch {
                parsedInput = {};
              }
              assistantContent.push({
                type: "tool_use",
                id: tb.id,
                name: tb.name,
                input: parsedInput,
              });
            }
            messages.push({ role: "assistant", content: assistantContent });

            // Execute each tool and append results
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const tb of toolUseBlocks) {
              let parsedInput: Record<string, unknown> = {};
              try {
                parsedInput = JSON.parse(tb.input);
              } catch {
                parsedInput = {};
              }
              if (
                input.mode === "checkin" &&
                (tb.name === "generate_meal_plan" || tb.name === "generate_workout_plan")
              ) {
                parsedInput.weekStart = currentWeekKey;
              }
              if (input.mode === "checkin" && tb.name === "generate_meal_plan") {
                attemptedMealPlanSave = true;
              }
              if (input.mode === "checkin" && tb.name === "generate_workout_plan") {
                attemptedWorkoutPlanSave = true;
              }

              const tool = getToolByName(tb.name);
              let result: ToolResult;
              let parsedResultForChecks: Record<string, unknown> | null = null;
              if (tool) {
                try {
                  result = await tool.execute(parsedInput, input.userId);
                  try {
                    parsedResultForChecks = JSON.parse(result.content) as Record<string, unknown>;
                  } catch {
                    parsedResultForChecks = null;
                  }
                  if (input.mode === "checkin" && !result.isError) {
                    if (tb.name === "generate_meal_plan") {
                      const wk = parsedResultForChecks?.normalizedWeekStartLocal;
                      if (typeof wk === "string" && wk === currentWeekKey) {
                        mealPlanSavedForCurrentWeek = true;
                      }
                    }
                    if (tb.name === "generate_workout_plan") {
                      const wk = parsedResultForChecks?.normalizedWeekStartLocal;
                      if (typeof wk === "string" && wk === currentWeekKey) {
                        workoutPlanSavedForCurrentWeek = true;
                      }
                    }
                  }
                } catch (error) {
                  result = {
                    content: JSON.stringify({
                      error: `Tool execution failed: ${error instanceof Error ? error.message : "unknown"}`,
                    }),
                    isError: true,
                  };
                }
              } else {
                result = {
                  content: JSON.stringify({ error: `Unknown tool: ${tb.name}` }),
                  isError: true,
                };
              }

              toolCallLog.push({
                name: tb.name,
                input: parsedInput,
                result: JSON.parse(result.content),
              });

              const rtList =
                result.refreshTargets?.length && result.refreshTargets.length > 0
                  ? result.refreshTargets
                  : result.refreshTarget
                    ? [result.refreshTarget]
                    : [];
              for (const t of rtList) {
                if (!refreshTargets.has(t)) {
                  refreshTargets.add(t);
                  // Stream refresh immediately so UI updates during long check-ins.
                  sendSSE({ type: "refresh", target: t });
                }
              }

              if (result.shouldStop) {
                shouldStop = true;
                sendSSE({
                  type: "text",
                  content: `\n\n${JSON.parse(result.content).message}`,
                });
              }

              toolResults.push({
                type: "tool_result",
                tool_use_id: tb.id,
                content: result.content,
                is_error: result.isError,
              });
            }

            messages.push({ role: "user", content: toolResults });
            currentText = "";

            if (shouldStop) break;
          } else {
            shouldStop = true;
          }
        }

        if (iterations >= MAX_ITERATIONS && !shouldStop) {
          sendSSE({
            type: "text",
            content:
              "\n\n— Reached the maximum number of agent steps for this message. Say **continue** to finish (e.g. remaining tools), or split into: update meal plan, then workouts. —",
          });
        }

        const attemptedPlanSave = attemptedMealPlanSave || attemptedWorkoutPlanSave;
        if (input.mode === "checkin" && attemptedPlanSave && !mealPlanSavedForCurrentWeek) {
          sendSSE({
            type: "text",
            content:
              "\n\n— Check-in did not save a meal plan for the current week, so dashboards cannot update. Please say **retry check-in** and I will regenerate and save this week's meal plan now. —",
          });
          sendSSE({
            type: "error",
            content:
              "CHECKIN_MEALPLAN_NOT_PERSISTED_CURRENT_WEEK",
          });
        }
        if (
          input.mode === "checkin" &&
          attemptedPlanSave &&
          !workoutOptional &&
          !workoutPlanSavedForCurrentWeek
        ) {
          sendSSE({
            type: "text",
            content:
              "\n\n— Check-in did not save a workout plan for the current week. Please say **retry check-in** and I will regenerate and save this week's workout plan too. —",
          });
          sendSSE({
            type: "error",
            content: "CHECKIN_WORKOUT_NOT_PERSISTED_CURRENT_WEEK",
          });
        }

        sendSSE({
          type: "done",
          content: fullResponse,
          toolCalls: toolCallLog.length > 0 ? toolCallLog : undefined,
        });

        controller.close();
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : "Atlas encountered an error";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", content: msg })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}
