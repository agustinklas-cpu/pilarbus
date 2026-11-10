import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

export const requirePilarBusAdmin: RequestHandler = async (
  req,
  res,
  next,
): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Iniciá sesión para continuar." });
    return;
  }

  const allowedEmail = process.env.PILARBUS_ADMIN_EMAIL?.trim().toLowerCase();
  if (!allowedEmail) {
    req.log.error("PILARBUS_ADMIN_EMAIL is not configured");
    res.status(503).json({ error: "El acceso municipal no está configurado." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const isAuthorized = user.emailAddresses.some(
      (address) =>
        address.emailAddress.trim().toLowerCase() === allowedEmail &&
        address.verification?.status === "verified",
    );

    if (!isAuthorized) {
      res.status(403).json({ error: "No tenés permiso para administrar reclamos." });
      return;
    }

    next();
  } catch (err) {
    req.log.error({ err }, "Could not verify PilarBus administrator");
    res.status(503).json({ error: "No se pudo verificar el acceso municipal." });
  }
};
