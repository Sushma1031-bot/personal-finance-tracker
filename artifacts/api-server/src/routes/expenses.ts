import { Router } from "express";
import { db, expensesTable } from "@workspace/db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { authenticate } from "../middlewares/auth";
import {
  ListExpensesQueryParams,
  CreateExpenseBody,
  UpdateExpenseBody,
} from "@workspace/api-zod";
import type { Expense } from "@workspace/db";

const router = Router();

/** Serialize a DB expense row to the API response shape. */
function formatExpense(e: Expense) {
  return {
    id: e.id,
    amount: parseFloat(e.amount),
    category: e.category,
    date: e.date,
    description: e.description,
    createdAt: e.createdAt.toISOString(),
  };
}

// GET /expenses
router.get("/expenses", authenticate, async (req, res) => {
  const parsed = ListExpensesQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};
  const { category, month, search, sortBy = "newest" } = params;

  // Build WHERE conditions
  const conditions = [eq(expensesTable.userId, req.userId)];

  if (category) {
    conditions.push(eq(expensesTable.category, category));
  }
  if (month) {
    conditions.push(
      sql`to_char(${expensesTable.date}, 'YYYY-MM') = ${month}`,
    );
  }
  if (search) {
    const pattern = `%${search}%`;
    conditions.push(
      sql`(${expensesTable.description} ILIKE ${pattern} OR ${expensesTable.category} ILIKE ${pattern})`,
    );
  }

  // Sort direction
  const orderClause =
    sortBy === "oldest"
      ? asc(expensesTable.date)
      : sortBy === "highest"
        ? desc(sql`${expensesTable.amount}::numeric`)
        : sortBy === "lowest"
          ? asc(sql`${expensesTable.amount}::numeric`)
          : desc(expensesTable.date); // newest (default)

  const rows = await db
    .select()
    .from(expensesTable)
    .where(and(...conditions))
    .orderBy(orderClause);

  res.json(rows.map(formatExpense));
});

// POST /expenses
router.post("/expenses", authenticate, async (req, res) => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { amount, category, date, description } = parsed.data;

  const [expense] = await db
    .insert(expensesTable)
    .values({
      userId: req.userId,
      amount: amount.toString(),
      category,
      date,
      description,
    })
    .returning();

  res.status(201).json(formatExpense(expense));
});

// GET /expenses/:id
router.get("/expenses/:id", authenticate, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [expense] = await db
    .select()
    .from(expensesTable)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.userId, req.userId)));

  if (!expense) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.json(formatExpense(expense));
});

// PUT /expenses/:id
router.put("/expenses/:id", authenticate, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const parsed = UpdateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { amount, category, date, description } = parsed.data;
  const updates: Partial<Expense> = {};
  if (amount !== undefined) updates.amount = amount.toString();
  if (category !== undefined) updates.category = category;
  if (date !== undefined) updates.date = date;
  if (description !== undefined) updates.description = description;

  const [updated] = await db
    .update(expensesTable)
    .set(updates)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.userId, req.userId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.json(formatExpense(updated));
});

// DELETE /expenses/:id
router.delete("/expenses/:id", authenticate, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [deleted] = await db
    .delete(expensesTable)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.userId, req.userId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.status(204).send();
});

export default router;
