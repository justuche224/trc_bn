const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt"); // Import bcrypt

const { generateTrackingNumber } = require("../utils/trackingGenerator.mjs");
const { db, schema } = require("../db/index.mjs"); // Or ../db/index.mjs if you renamed it
const { eq, like } = require("drizzle-orm");

// Middleware to check admin authentication using DB and bcrypt
const adminAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log("Auth Header:", authHeader); // Log header
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res
      .status(401)
      .json({
        message: "Unauthorized: Admin access required (Missing Basic Auth)",
      });
  }
  const credentials = Buffer.from(authHeader.split(" ")[1], "base64").toString(
    "ascii"
  );
  console.log("Decoded Credentials:", credentials); // Log decoded string
  const [username, password] = credentials.split(":");

  if (!username || !password) {
    return res
      .status(401)
      .json({ message: "Unauthorized: Invalid credentials format" });
  }
  console.log(`Attempting auth for username: ${username}`); // Log username

  try {
    const adminUser = await db.query.admins.findFirst({
      where: eq(schema.admins.username, username),
    });

    console.log("Admin user found in DB:", adminUser); // Log the found user object (or undefined)

    if (!adminUser) {
      console.warn(`Authentication failed: User '${username}' not found.`);
      return res
        .status(401)
        .json({ message: "Unauthorized: Invalid credentials" });
    }

    // Compare provided password with stored hash
    const passwordMatch = password === adminUser.password;
    console.log(`Password comparison result for '${username}':`, passwordMatch); // Log comparison result

    if (!passwordMatch) {
      console.warn(
        `Authentication failed: Incorrect password for user '${username}'.`
      );
      return res
        .status(401)
        .json({ message: "Unauthorized: Invalid credentials" });
    }

    console.log(`Authentication successful for user '${username}'.`);
    next();
  } catch (error) {
    console.error("Admin auth error:", error);
    res.status(500).json({ message: "Server error during authentication" });
  }
};

// Admin login using DB and bcrypt
router.post("/login", async (req, res) => {
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

    // Compare provided password with stored hash
    if (!adminUser || !(await bcrypt.compare(password, adminUser.password))) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // Generate a token - IMPORTANT: Basic Auth token reveals password hash if not careful.
    // Consider using JWT for session management instead of sending Basic token back.
    const token = Buffer.from(`${username}:${password}`).toString("base64"); // Still sends plain password in token!

    res.status(200).json({
      message: "Login successful",
      // Sending back the Basic token like this might not be ideal for security.
      // A session token (like JWT) is usually preferred after successful login.
      token: token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
});

// Create new tracking using DB
router.post("/tracking", adminAuth, async (req, res) => {
  console.log("Creating tracking");
  try {
    const trackingNumber = generateTrackingNumber();
    console.log(req.body);
    const {
      shipDate,
      deliveryDate,
      estimatedDeliveryDate,
      recipientName, // Match schema names
      recipientPhone, // Match schema names
      destination,
      origin,
      status,
      service,
    } = req.body;

    // Basic validation
    // log all value key value
    console.log("shipDate", shipDate);
    console.log("deliveryDate", deliveryDate);
    console.log("estimatedDeliveryDate", estimatedDeliveryDate);
    console.log("recipientName", recipientName);
    console.log("recipientPhone", recipientPhone);
    console.log("destination", destination);
    console.log("origin", origin);
    console.log("status", status);
    console.log("service", service);
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
      shipDate: shipDate ? new Date(shipDate) : new Date(), // Convert to Date objects for Drizzle timestamp mode
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
    // Check for specific DB errors if needed (e.g., unique constraint)
    if (error.message.includes("UNIQUE constraint failed")) {
      return res
        .status(409)
        .json({
          message: "Tracking number conflict or other unique field violation.",
        });
    }
    res.status(500).json({ message: "Server error creating tracking" });
  }
});

// Get all trackings using DB
router.get("/tracking", adminAuth, async (req, res) => {
  try {
    const trackings = await db.query.trackings.findMany(); // Use Drizzle query API
    res.json(trackings);
  } catch (error) {
    console.error("Get all trackings error:", error);
    res.status(500).json({ message: "Server error retrieving trackings" });
  }
});

// Get tracking by number using DB
router.get("/tracking/:trackingNumber", adminAuth, async (req, res) => {
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
router.put("/tracking/:trackingNumber", adminAuth, async (req, res) => {
  try {
    const trackingNumber = req.params.trackingNumber;
    const updates = req.body;

    // Convert date strings to Date objects if present
    if (updates.shipDate) updates.shipDate = new Date(updates.shipDate);
    if (updates.deliveryDate)
      updates.deliveryDate = new Date(updates.deliveryDate);
    if (updates.estimatedDeliveryDate)
      updates.estimatedDeliveryDate = new Date(updates.estimatedDeliveryDate);

    // Ensure trackingNumber is not in the updates object if present
    delete updates.trackingNumber;
    delete updates.id; // Prevent updating primary key

    const [updatedTracking] = await db
      .update(schema.trackings)
      .set(updates)
      .where(eq(schema.trackings.trackingNumber, trackingNumber))
      .returning(); // Return the updated object

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
router.delete("/tracking/:trackingNumber", adminAuth, async (req, res) => {
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

// Search trackings using DB (Example: Search by tracking number or recipient name)
router.get("/tracking/search/:query", adminAuth, async (req, res) => {
  try {
    const query = `%${req.params.query}%`; // Prepare query for LIKE operator
    const results = await db
      .select()
      .from(schema.trackings)
      .where(like(schema.trackings.trackingNumber, query));
    // Add more fields to search if needed:
    // .orWhere(like(schema.trackings.recipientName, query))
    // .orWhere(like(schema.trackings.status, query));

    res.json(results);
  } catch (error) {
    console.error("Search tracking error:", error);
    res.status(500).json({ message: "Server error searching trackings" });
  }
});

module.exports = router;
