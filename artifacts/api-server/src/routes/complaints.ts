import { and, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateComplaintBody,
  CreateComplaintResponse,
  DeleteComplaintParams,
  GetComplaintSummaryResponse,
  ListComplaintsQueryParams,
  ListComplaintsResponse,
  UpdateComplaintBody,
  UpdateComplaintParams,
  UpdateComplaintResponse,
} from "@workspace/api-zod";
import { complaintsTable, db } from "@workspace/db";
import { requirePilarBusAdmin } from "../middlewares/requirePilarBusAdmin";

const router: IRouter = Router();

router.post("/complaints", async (req, res): Promise<void> => {
  const parsed = CreateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [complaint] = await db
    .insert(complaintsTable)
    .values(parsed.data)
    .returning();

  res.status(201).json(CreateComplaintResponse.parse(complaint));
});

router.get(
  "/complaints",
  requirePilarBusAdmin,
  async (req, res): Promise<void> => {
    const query = ListComplaintsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }

    const { status } = query.data;
    const rows =
      status === "all"
        ? await db
            .select()
            .from(complaintsTable)
            .orderBy(desc(complaintsTable.createdAt))
        : await db
            .select()
            .from(complaintsTable)
            .where(eq(complaintsTable.status, status))
            .orderBy(desc(complaintsTable.createdAt));

    res.json(ListComplaintsResponse.parse(rows));
  },
);

router.get(
  "/complaints/summary",
  requirePilarBusAdmin,
  async (_req, res): Promise<void> => {
    const [summary] = await db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${complaintsTable.status} = 'open')::int`,
        resolved: sql<number>`count(*) filter (where ${complaintsTable.status} = 'resolved')::int`,
        lastUpdatedAt: sql<Date | null>`max(${complaintsTable.createdAt})`,
      })
      .from(complaintsTable);

    res.json(GetComplaintSummaryResponse.parse(summary));
  },
);

router.patch(
  "/complaints/:id",
  requirePilarBusAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateComplaintParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateComplaintBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const [existing] = await db
      .select()
      .from(complaintsTable)
      .where(eq(complaintsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "No se encontró el reclamo." });
      return;
    }

    const [updated] = await db
      .update(complaintsTable)
      .set({
        status: body.data.status,
        adminNote:
          body.data.adminNote === undefined
            ? existing.adminNote
            : body.data.adminNote,
        resolvedAt:
          body.data.status === "resolved"
            ? existing.resolvedAt ?? new Date()
            : null,
      })
      .where(eq(complaintsTable.id, params.data.id))
      .returning();

    res.json(UpdateComplaintResponse.parse(updated));
  },
);

router.delete(
  "/complaints/:id",
  requirePilarBusAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteComplaintParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [deleted] = await db
      .delete(complaintsTable)
      .where(
        and(
          eq(complaintsTable.id, params.data.id),
          eq(complaintsTable.status, "resolved"),
        ),
      )
      .returning({ id: complaintsTable.id });

    if (!deleted) {
      const [existing] = await db
        .select({ status: complaintsTable.status })
        .from(complaintsTable)
        .where(eq(complaintsTable.id, params.data.id));

      if (!existing) {
        res.status(404).json({ error: "No se encontró el reclamo." });
        return;
      }
      res.status(409).json({
        error: "Solo se pueden eliminar reclamos resueltos.",
      });
      return;
    }

    res.sendStatus(204);
  },
);

export default router;
