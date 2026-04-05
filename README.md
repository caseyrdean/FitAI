# FitAI

FitAI is a personal **nutrition and fitness web app** that combines a dashboard for meals, workouts, labs, and progress with **Atlas**—an AI coach powered by Claude. The app is built for a single local user (demo-style `local-user` id) and stores everything in PostgreSQL.

**Repository:** [github.com/caseyrdean/FitAI](https://github.com/caseyrdean/FitAI)

---

## What it does

### Atlas (AI coach)

- Chat sidebar on the dashboard; conversations persist in the database.
- Atlas can call tools to **generate or update weekly meal plans**, **workout plans**, **estimate nutrition**, update your **health profile**, and **parse blood work** into structured markers.
- Context automatically includes your recent food logs, current plans, **latest blood panels** (with flagged analytes highlighted), and progress—so answers stay grounded in your data.

### Meals

- **Weekly meal plan** with day/meal structure, ingredients (with quantities), macros, fiber, vitamins, and minerals (~estimated).
- **Shopping list** and **prep guide** stored with the plan.
- **Swap** individual meals via AI while staying near your macro targets.
- **Food log** with AI **nutrient estimation** from free-text descriptions; quick-add from today’s planned meals.

### Nutrients

- Aggregates micronutrients from logged entries and charts intake over time (aligned with the same vitamin/mineral schema used in meal plans and logging).

### Blood work

- Upload **PDF or image** labs; the API extracts structured rows (panel, analyte, value, unit, reference range, lab flag).
- **Manual entry** grid to add a full panel at once when auto-parse is unavailable.
- **Analyte trends** across uploads and **upload history** with flagged summaries.
- Latest structured labs are fed into **meal planning** and **food-log estimation** so patterns (e.g. lipids, glucose, sodium) can inform suggestions—**general wellness framing only, not medical advice**.

### Workouts

- Weekly **workout plan** JSON (days, exercises) generated via Atlas and shown in the UI.
- **Sessions** can be tracked (completed, notes) against the plan.

### Progress

- Log **weight**, **energy (1–10)**, and **notes** over time with simple visualization.

### Home dashboard

- At-a-glance view tying together meal plan, workouts, recent logs, nutrients, and flagged blood markers.

---

## Tech stack

| Layer | Choice |
|--------|--------|
| Framework | [Next.js](https://nextjs.org/) 14 (App Router) |
| UI | React 18, [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/)–style components, [Recharts](https://recharts.org/) |
| Database | [PostgreSQL](https://www.postgresql.org/) via [Prisma](https://www.prisma.io/) 7 |
| AI | [Anthropic](https://www.anthropic.com/) Claude (SDK); optional [Tavily](https://tavily.com/) for web search in tools |
| Package manager | [pnpm](https://pnpm.io/) |

---

## Getting started

### Prerequisites

- Node.js 20+
- pnpm
- Docker (optional, for local Postgres)

### 1. Clone and install

```bash
git clone https://github.com/caseyrdean/FitAI.git
cd FitAI
pnpm install
```

### 2. Environment

Copy the example env file and set your keys:

```bash
cp .env.local.example .env.local
```

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Required for Atlas, meal/blood parsing, nutrient estimates |
| `TAVILY_API_KEY` | Optional; web search from Atlas tools |
| `UPLOAD_DIR` | Where lab uploads are stored (default `./uploads`) |

Never commit `.env` or `.env.local`. They are gitignored.

### 3. Database

Start Postgres (matches the default URL in `.env.local.example`):

```bash
docker compose up -d
```

Apply migrations and seed the default user:

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
```

### 4. Run the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Use the dashboard navigation for Meals, Nutrients, Progress, Blood Work, and Workouts; Atlas stays available from the layout.

### Build for production

```bash
pnpm build
pnpm start
```

Set the same environment variables on your host or platform (e.g. Vercel, Railway).

---

## Security & privacy

- **`.env*`** (except `*.example` templates) and **`/uploads/*`** (lab files) are **not** tracked by git—treat them as sensitive.
- Lab PDFs/images may contain **PHI/PII**; keep `UPLOAD_DIR` off public buckets unless you have proper controls.
- **Rotate API keys** if they were ever committed or leaked.

---

## Disclaimer

FitAI and Atlas provide **wellness and education-style guidance** and **automated estimates**. They are **not** a substitute for a licensed clinician, registered dietitian, or your own lab’s interpretation. Always confirm medical decisions with a qualified professional.

---

## License

This project is provided as-is for personal and learning use; add a `LICENSE` file if you want explicit open-source terms.
