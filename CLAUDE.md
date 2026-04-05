# FitAI — Personal Nutrition & Wellness App

A local-only, single-user nutrition and wellness application powered by an AI trainer agent called **Atlas**. Everything runs on your machine — no auth, no cloud services, no payments.

## Architecture

```
FitAI/
├── app/                    # Next.js 14 App Router
│   ├── page.tsx            # Redirect → /dashboard
│   ├── dashboard/          # All dashboard pages
│   │   ├── layout.tsx      # Sidebar nav + Atlas chat
│   │   ├── page.tsx        # Home: stats, charts, summaries
│   │   ├── meals/          # Meal plan + food log
│   │   ├── nutrients/      # Micronutrient breakdown
│   │   ├── progress/       # Weight + energy tracking
│   │   ├── bloodwork/      # Blood work upload + analysis
│   │   └── workouts/       # Workout plan + session logging
│   └── api/                # API routes (all server-side)
│       ├── atlas/          # SSE streaming endpoint
│       ├── meals/          # Meal plan CRUD
│       ├── foodlog/        # Food log CRUD
│       ├── bloodwork/      # Blood work upload + parsing
│       ├── progress/       # Progress tracking
│       └── workouts/       # Workout plan + sessions
├── lib/
│   ├── atlas/              # Atlas AI agent core
│   │   ├── agent.ts        # Agentic streaming loop
│   │   ├── tools.ts        # Tool definitions + executors
│   │   └── prompts.ts      # System prompts + context builder
│   ├── db/client.ts        # Prisma singleton
│   └── user.ts             # Single user helper (USER_ID)
├── components/             # React components
│   ├── atlas-chat.tsx      # Floating chat panel
│   ├── meal-plan.tsx       # Weekly meal plan display
│   ├── food-log.tsx        # Food logging form + table
│   ├── nutrient-chart.tsx  # Recharts nutrient bar chart
│   ├── progress-chart.tsx  # Recharts weight/energy chart
│   ├── bloodwork-upload.tsx # File upload + markers table
│   ├── workout-plan.tsx    # Weekly workout display
│   └── ui/                 # shadcn/ui primitives
├── prisma/
│   ├── schema.prisma       # 11 models
│   └── seed.ts             # Seeds single user
├── uploads/                # Blood work files (local)
└── docker-compose.yml      # PostgreSQL 16
```

## Tech Stack

- **Next.js 14** (App Router) with TypeScript
- **PostgreSQL 16** via Docker
- **Prisma 7** ORM with `@prisma/adapter-pg`
- **Anthropic SDK** (`@anthropic-ai/sdk`) for Claude API
- **Tailwind CSS** with dark biohacker theme
- **Radix UI** primitives (shadcn/ui pattern)
- **Recharts** for data visualization
- **Tavily API** (optional) for live nutrition research

## How the Atlas Agent Works

Atlas is the core AI — a nutrition and fitness trainer persona.

### The Agentic Loop (`lib/atlas/agent.ts`)

1. **Context loading**: `buildContext(userId)` fetches the user's full state from PostgreSQL — health profile, current meal plan, recent food logs, blood work markers, workout plan, and progress entries.

2. **Message assembly**: The system prompt (`ATLAS_SYSTEM_PROMPT`) + mode-specific prompt (onboarding/checkin) + user context + conversation history + new message are assembled into the Anthropic API call.

3. **Streaming + tool use**: The agent calls `anthropic.messages.create()` with `stream: true` and the 7 tool definitions. Text deltas are streamed to the client as SSE events. When the model emits a `tool_use` block:
   - The stream pauses
   - The tool's `execute()` function runs (writes to DB, calls external APIs, etc.)
   - The tool result is appended to the messages
   - The API is called again to continue the conversation

4. **Loop termination**: The loop ends when the model returns `end_turn` without tool calls, or when `flag_unsafe_condition` is triggered (hard stop).

5. **SSE events**: The stream emits:
   - `{ type: "text", content: "..." }` — token-by-token text
   - `{ type: "refresh", target: "meals"|"workouts"|"bloodwork" }` — signals dashboard refresh
   - `{ type: "done", content: "full response", toolCalls: [...] }` — completion
   - `{ type: "error", content: "..." }` — error

### Tool Definitions (`lib/atlas/tools.ts`)

| Tool | Purpose | DB Writes |
|------|---------|-----------|
| `estimate_nutrition` | Estimate nutritional content of food | None (LLM generates estimates) |
| `generate_meal_plan` | Create weekly meal plan | `MealPlan` create |
| `generate_workout_plan` | Create weekly workout plan | `WorkoutPlan` create |
| `parse_blood_work` | Parse blood work text into markers | `BloodWorkMarker` createMany |
| `web_search` | Search web via Tavily API | None |
| `update_health_profile` | Update user preferences/goals | `HealthProfile` update |
| `flag_unsafe_condition` | Hard-refuse for unsafe conditions | None (stops loop) |

### Prompts (`lib/atlas/prompts.ts`)

- `ATLAS_SYSTEM_PROMPT` — Core persona and safety rules
- `ONBOARDING_PROMPT` — First-time setup conversation
- `CHECKIN_PROMPT` — Weekly review conversation
- `buildContext(userId)` — Fetches and formats all user data

## How to Add a New Atlas Tool

1. Define the tool in `lib/atlas/tools.ts`:

```typescript
const myNewTool: AtlasTool = {
  definition: {
    name: "my_tool_name",
    description: "What this tool does",
    input_schema: {
      type: "object" as const,
      properties: {
        param1: { type: "string", description: "..." },
      },
      required: ["param1"],
    },
  },
  async execute(input, userId) {
    // Your logic here — can use prisma, fetch, etc.
    return {
      content: JSON.stringify({ result: "..." }),
      refreshTarget: "meals", // optional: triggers dashboard refresh
      shouldStop: false,       // optional: true = end conversation
    };
  },
};
```

2. Add it to the `ATLAS_TOOLS` array at the bottom of the file.

3. The tool will automatically be included in all Atlas API calls.

## How to Add a New Dashboard Page

1. Create `app/dashboard/your-page/page.tsx` — a `"use client"` component
2. Create the API route at `app/api/your-endpoint/route.ts`
3. Add the nav item in `app/dashboard/layout.tsx` in the `navItems` array
4. Create any reusable components in `components/`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude |
| `TAVILY_API_KEY` | No | Tavily API key for web search |
| `UPLOAD_DIR` | No | Directory for blood work uploads (default: `./uploads`) |

## How to Run Locally

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Run database migration
npx prisma migrate dev

# 3. Seed the database
npx prisma db seed

# 4. Set your API key in .env.local
# Edit .env.local and set ANTHROPIC_API_KEY

# 5. Start the dev server
pnpm dev
```

Open http://localhost:3000. The app will redirect to the dashboard. If onboarding hasn't been completed, Atlas will automatically open and guide you through setup.

## Key Constraints

- All nutrient values are AI estimates and display a `~est.` label
- Atlas never claims to be a licensed medical professional
- Atlas hard-refuses (via `flag_unsafe_condition`) for: Type 1 diabetes, active eating disorders, renal disease
- Blood work files are read using Claude vision (base64) — no third-party OCR
- Tavily is optional — if the API key is missing, `web_search` returns a graceful fallback
- All data is stored locally in PostgreSQL — the app works offline except for Anthropic API calls
- Single user: `USER_ID = "local-user"` — no auth required
