import { Router } from "express";
import { db, budgetsTable, expensesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import { UpdateBudgetBody } from "@workspace/api-zod";

const router = Router();

/** Returns the current month string in YYYY-MM format. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Build the full budget response including spent/remaining calculated from expenses. */
async function buildBudgetResponse(userId: number, month: string) {
  const [budget] = await db
    .select()
    .from(budgetsTable)
    .where(and(eq(budgetsTable.userId, userId), eq(budgetsTable.month, month)));

  const monthlyLimit = budget ? parseFloat(budget.monthlyLimit) : 0;

  // Calculate total spent this month
  const [spentResult] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${expensesTable.amount}::numeric), 0)`,
    })
    .from(expensesTable)
    .where(
      and(
        eq(expensesTable.userId, userId),
        sql`to_char(${expensesTable.date}, 'YYYY-MM') = ${month}`,
      ),
    );

  const spent = parseFloat(spentResult?.total ?? "0");
  const remaining = Math.max(monthlyLimit - spent, 0);
  const percentage =
    monthlyLimit > 0 ? Math.min((spent / monthlyLimit) * 100, 100) : 0;

  return {
    id: budget?.id ?? 0,
    monthlyLimit,
    month,
    spent: parseFloat(spent.toFixed(2)),
    remaining: parseFloat(remaining.toFixed(2)),
    percentage: parseFloat(percentage.toFixed(1)),
  };
}

// GET /budget
router.get("/budget", authenticate, async (req, res) => {
  const month = currentMonth();
  const budget = await buildBudgetResponse(req.userId, month);
  res.json(budget);
});

// PUT /budget
router.put("/budget", authenticate, async (req, res) => {
  const parsed = UpdateBudgetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const month = parsed.data.month ?? currentMonth();
  const monthlyLimit = parsed.data.monthlyLimit.toString();

  // Upsert: update if exists, otherwise insert
  const existing = await db
    .select({ id: budgetsTable.id })
    .from(budgetsTable)
    .where(and(eq(budgetsTable.userId, req.userId), eq(budgetsTable.month, month)));

  if (existing.length > 0) {
    await db
      .update(budgetsTable)
      .set({ monthlyLimit })
      .where(and(eq(budgetsTable.userId, req.userId), eq(budgetsTable.month, month)));
  } else {
    await db
      .insert(budgetsTable)
      .values({ userId: req.userId, monthlyLimit, month });
  }

  const budget = await buildBudgetResponse(req.userId, month);
  res.json(budget);
});

export default router;
