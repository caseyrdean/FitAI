import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { USER_ID } from "@/lib/user";
import { runAtlas } from "@/lib/atlas/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Long check-ins (meal + workout tools) can exceed default serverless limits on Vercel. */
export const maxDuration = 300;

export async function GET() {
  const [conversation, profile] = await Promise.all([
    prisma.atlasConversation.findFirst({
      where: { userId: USER_ID },
      orderBy: { createdAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.healthProfile.findUnique({ where: { userId: USER_ID } }),
  ]);

  return NextResponse.json({
    conversationId: conversation?.id ?? null,
    messages: conversation?.messages ?? [],
    onboardingComplete: profile?.onboardingComplete ?? false,
    mode: conversation?.type ?? "chat",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      message,
      conversationId,
      mode = "chat",
    } = body as {
      message: string;
      conversationId?: string;
      mode?: "onboarding" | "checkin" | "chat";
    };

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    let conversation;
    if (conversationId) {
      conversation = await prisma.atlasConversation.findUnique({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }

    if (!conversation) {
      conversation = await prisma.atlasConversation.create({
        data: { userId: USER_ID, type: mode },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    }

    await prisma.atlasMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message,
      },
    });

    const conversationHistory = conversation.messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const stream = runAtlas({
      userId: USER_ID,
      message,
      conversationHistory,
      mode,
    });

    // Tee the stream so we can save the response after streaming
    const [browserStream, saveStream] = stream.tee();

    // Save the response in the background
    saveResponseInBackground(saveStream, conversation.id);

    return new Response(browserStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Conversation-Id": conversation.id,
      },
    });
  } catch (error) {
    console.error("Atlas API error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function saveResponseInBackground(
  stream: ReadableStream<Uint8Array>,
  conversationId: string
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let toolCalls: unknown = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "text" && typeof event.content === "string") {
            fullContent += event.content;
          }
          if (event.type === "done") {
            fullContent = event.content || fullContent;
            toolCalls = event.toolCalls || null;
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    if (fullContent) {
      await prisma.atlasMessage.create({
        data: {
          conversationId,
          role: "assistant",
          content: fullContent,
          toolCalls: toolCalls as object | undefined,
        },
      });
    }
  } catch (error) {
    console.error("Error saving Atlas response:", error);
  }
}
