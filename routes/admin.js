const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { generateTrackingNumber } = require("../utils/trackingGenerator.mjs");
const { db, schema } = require("../db/index.mjs");
const { eq, like } = require("drizzle-orm");

const JWT_SECRET = process.env.JWT_SECRET;

// New verifyJwt middleware
const verifyJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: "Unauthorized: Invalid token" });
      }
      req.admin = decoded; // Contains { userId, username }
      next();
    });
  } else {
    res.status(401).json({ message: "Unauthorized: Missing Bearer token" });
  }
};

router.post("/login", async (req, res) => {
  console.log("Login attempt:", req.body);
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    const adminUser = await db.query.admins.findFirst({
      where: eq(schema.admins.username, username),
    });
    console.log("adminUser:", adminUser);
    if (!adminUser) {
      return res.status(401).json({ message: "Invalid username or password" });
    }
    // bcrypt password
    const passwordMatch = await bcrypt.compare(password, adminUser.password);
    console.log("passwordMatch:", passwordMatch);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // Ensure adminUser.id exists and is used as userId
    const userId = adminUser.id; // Assuming your admin table has an 'id' field
    console.log("userId:", userId);
    if (userId === undefined) {
      console.error(
        "Admin user object does not have an 'id' field:",
        adminUser
      );
      return res
        .status(500)
        .json({ message: "Server configuration error: User ID missing." });
    }

    const token = jwt.sign(
      { userId: userId, username: adminUser.username },
      JWT_SECRET,
      { expiresIn: "1h" }
    );
    console.log("token:", token);
    res.status(200).json({ token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
});

// Create new tracking using DB
router.post("/tracking", verifyJwt, async (req, res) => {
  try {
    const trackingNumber = generateTrackingNumber();

    const {
      shipDate,
      deliveryDate,
      estimatedDeliveryDate,
      recipientName,
      recipientPhone,
      destination,
      origin,
      status,
      service,
    } = req.body;

    if (
      !recipientName ||
      !recipientPhone ||
      !destination ||
      !origin ||
      !status ||
      !service
    ) {
      return res
        .status(400)
        .json({ message: "Missing required tracking fields" });
    }

    const newTrackingData = {
      trackingNumber,
      shipDate: shipDate ? new Date(shipDate) : new Date(),
      deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
      estimatedDeliveryDate: estimatedDeliveryDate
        ? new Date(estimatedDeliveryDate)
        : null,
      recipientName,
      recipientPhone,
      destination,
      origin,
      status,
      service,
    };

    const [createdTracking] = await db
      .insert(schema.trackings)
      .values(newTrackingData)
      .returning(); // Return the created object
    console.log(createdTracking);
    res.status(201).json(createdTracking);
  } catch (error) {
    console.error("Create tracking error:", error);
    if (error.message.includes("UNIQUE constraint failed")) {
      return res.status(409).json({
        message: "Tracking number conflict or other unique field violation.",
      });
    }
    res.status(500).json({ message: "Server error creating tracking" });
  }
});

// Get all trackings using DB
router.get("/tracking", verifyJwt, async (req, res) => {
  try {
    const trackings = await db.query.trackings.findMany();
    res.json(trackings);
  } catch (error) {
    console.error("Get all trackings error:", error);
    res.status(500).json({ message: "Server error retrieving trackings" });
  }
});

// Get tracking by number using DB
router.get("/tracking/:trackingNumber", verifyJwt, async (req, res) => {
  try {
    const trackingNumber = req.params.trackingNumber;
    const tracking = await db.query.trackings.findFirst({
      where: eq(schema.trackings.trackingNumber, trackingNumber),
    });

    if (!tracking) {
      return res.status(404).json({ message: "Tracking not found" });
    }
    res.json(tracking);
  } catch (error) {
    console.error("Get tracking by number error:", error);
    res.status(500).json({ message: "Server error retrieving tracking" });
  }
});

// Update tracking using DB
router.put("/tracking/:trackingNumber", verifyJwt, async (req, res) => {
  try {
    const trackingNumber = req.params.trackingNumber;
    const updates = req.body;

    if (updates.shipDate) updates.shipDate = new Date(updates.shipDate);
    if (updates.deliveryDate)
      updates.deliveryDate = new Date(updates.deliveryDate);
    if (updates.estimatedDeliveryDate)
      updates.estimatedDeliveryDate = new Date(updates.estimatedDeliveryDate);

    delete updates.trackingNumber;
    delete updates.id;

    const [updatedTracking] = await db
      .update(schema.trackings)
      .set(updates)
      .where(eq(schema.trackings.trackingNumber, trackingNumber))
      .returning();

    if (!updatedTracking) {
      return res.status(404).json({ message: "Tracking not found" });
    }
    res.json(updatedTracking);
  } catch (error) {
    console.error("Update tracking error:", error);
    res.status(500).json({ message: "Server error updating tracking" });
  }
});

// Delete tracking using DB
router.delete("/tracking/:trackingNumber", verifyJwt, async (req, res) => {
  try {
    const trackingNumber = req.params.trackingNumber;
    const result = await db
      .delete(schema.trackings)
      .where(eq(schema.trackings.trackingNumber, trackingNumber))
      .returning({ id: schema.trackings.id }); // Check if anything was deleted

    if (result.length === 0) {
      return res.status(404).json({ message: "Tracking not found" });
    }
    res.json({ message: "Tracking deleted successfully" });
  } catch (error) {
    console.error("Delete tracking error:", error);
    res.status(500).json({ message: "Server error deleting tracking" });
  }
});

// Search trackings using DB
router.get("/tracking/search/:query", verifyJwt, async (req, res) => {
  try {
    const query = `%${req.params.query}%`;
    const results = await db
      .select()
      .from(schema.trackings)
      .where(like(schema.trackings.trackingNumber, query));

    res.json(results);
  } catch (error) {
    console.error("Search tracking error:", error);
    res.status(500).json({ message: "Server error searching trackings" });
  }
});

module.exports = router;
