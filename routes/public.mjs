import express from "express";
import { db } from "../db/index.mjs";
import { trackings } from "../db/schema.mjs";
import { eq } from "drizzle-orm";

const router = express.Router();

// Get tracking info by tracking number
router.get("/tracking/:trackingNumber", async (req, res) => {
  try {
    const { trackingNumber } = req.params;

    const tracking = await db.query.trackings.findFirst({
      where: eq(trackings.trackingNumber, trackingNumber),
    });

    if (!tracking) {
      return res
        .status(404)
        .json({ message: "Tracking information not found" });
    }

    return res.status(200).json(tracking);
  } catch (error) {
    console.error("Error fetching tracking info:", error);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
