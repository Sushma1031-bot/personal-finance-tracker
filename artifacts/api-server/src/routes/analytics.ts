import { Router } from "express";
import { db, expensesTable, budgetsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";

const router = Router();

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// GET /analytics/summary — dashboard stats
router.get("/analytics/summary", authenticate, async (req, res) => {
  const month = currentMonth();

  // All-time totals
  const [allTimeResult] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${expensesTable.amount}::numeric), 0)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(expensesTable)
    .where(eq(expensesTable.userId, req.userId));

  // This month's total
  const [monthlyResult] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${expensesTable.amount}::numeric), 0)`,
    })
    .from(expensesTable)
    .where(
      and(
        eq(expensesTable.userId, req.userId),
        sql`to_char(${expensesTable.date}, 'YYYY-MM') = ${month}`,
      ),
    );

  // Highest-spending category this month
  const [topCategory] = await db
    .select({
      category: expensesTable.category,
    })
    .from(expensesTable)
    .where(
      and(
        eq(expensesTable.userId, req.userId),
        sql`to_char(${expensesTable.date}, 'YYYY-MM') = ${month}`,
      ),
    )
    .groupBy(expensesTable.category)
    .orderBy(desc(sql`SUM(${expensesTable.amount}::numeric)`))
    .limit(1);

  // Budget for this month
  const [budget] = await db
    .select()
    .from(budgetsTable)
    .where(and(eq(budgetsTable.userId, req.userId), eq(budgetsTable.month, month)));

  const totalExpenses = parseFloat(allTimeResult?.total ?? "0");
  const monthlyExpenses = parseFloat(monthlyResult?.total ?? "0");
  const budgetLimit = budget ? parseFloat(budget.monthlyLimit) : 0;
  const remainingBudget = Math.max(budgetLimit - monthlyExpenses, 0);
  const budgetPercentage =
    budgetLimit > 0 ? Math.min((monthlyExpenses / budgetLimit) * 100, 100) : 0;

  res.json({
    totalExpenses: parseFloat(totalExpenses.toFixed(2)),
    monthlyExpenses: parseFloat(monthlyExpenses.toFixed(2)),
    remainingBudget: parseFloat(remainingBudget.toFixed(2)),
    totalTransactions: allTimeResult?.count ?? 0,
    highestCategory: topCategory?.category ?? "None",
    budgetLimit: parseFloat(budgetLimit.toFixed(2)),
    budgetPercentage: parseFloat(budgetPercentage.toFixed(1)),
  });
});

// GET /analytics/by-category — spending breakdown by category
router.get("/analytics/by-category", authenticate, async (req, res) => {
  const month = (req.query.month as string) ?? currentMonth();

  const rows = await db
    .select({
      category: expensesTable.category,
      total: sql<string>`SUM(${expensesTable.amount}::numeric)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(expensesTable)
    .where(
      and(
        eq(expensesTable.userId, req.userId),
        sql`to_char(${expensesTable.date}, 'YYYY-MM') = ${month}`,
      ),
    )
    .groupBy(expensesTable.category)
    .orderBy(desc(sql`SUM(${expensesTable.amount}::numeric)`));

  const grandTotal = rows.reduce((acc, r) => acc + parseFloat(r.total), 0);

  res.json(
    rows.map((r) => ({
      category: r.category,
      total: parseFloat(parseFloat(r.total).toFixed(2)),
      count: r.count,
      percentage:
        grandTotal > 0
          ? parseFloat(((parseFloat(r.total) / grandTotal) * 100).toFixed(1))
          : 0,
    })),
  );
});

// GET /analytics/monthly-trend — last 6 months
router.get("/analytics/monthly-trend", authenticate, async (req, res) => {
  const rows = await db
    .select({
      month: sql<string>`to_char(${expensesTable.date}, 'YYYY-MM')`,
      total: sql<string>`SUM(${expensesTable.amount}::numeric)`,
      count: sql<number>`COUNT(*)::int`,
    })
    .from(expensesTable)
    .where(
      and(
        eq(expensesTable.userId, req.userId),
        sql`${expensesTable.date} >= CURRENT_DATE - INTERVAL '6 months'`,
      ),
    )
    .groupBy(sql`to_char(${expensesTable.date}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${expensesTable.date}, 'YYYY-MM') ASC`);

  res.json(
    rows.map((r) => ({
      month: r.month,
      total: parseFloat(parseFloat(r.total).toFixed(2)),
      count: r.count,
    })),
  );
});

// GET /analytics/recent-transactions — most recent expenses
router.get("/analytics/recent-transactions", authenticate, async (req, res) => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "5", 10), 20);

  const rows = await db
    .select()
    .from(expensesTable)
    .where(eq(expensesTable.userId, req.userId))
    .orderBy(desc(expensesTable.date), desc(expensesTable.createdAt))
    .limit(limit);

  res.json(
    rows.map((e) => ({
      id: e.id,
      amount: parseFloat(e.amount),
      category: e.category,
      date: e.date,
      description: e.description,
      createdAt: e.createdAt.toISOString(),
    })),
  );
});

export default router;
