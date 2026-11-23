import express from "express";
import "dotenv/config";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import { jwtVerify, createRemoteJWKSet } from "jose";

// --------------------------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------define express app and port--------------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------
const app = express();
const port = process.env.PORT || 5000;

// --------------------------------------------------------------------------------------------------------------------------------------
// ---------------------------------------------------------overall middleware-----------------------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// --------------------------------------------------------------------------------------------------------------------------------------
// ----------------------------------------------------------mongodb connection----------------------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient = await connectToMongoDB();
const database = mongoClient.db("fixmate");

// --------------------------------------------------------------------------------------------------------------------------------------
// -------------------------------------------------------get the collections------------------------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------

const usersCollections = database.collection("user");
const servicesCollections = database.collection("services");
const bookingsCollections = database.collection("bookings");
const paymentsCollections = database.collection("payments");

// --------------------------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------middleware--------------------------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------

// verify token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const JWKS = createRemoteJWKSet(
    new URL(`${process.env.FRONTEND_URL}/api/auth/jwks`),
  );

  const { payload } = await jwtVerify(token, JWKS);
  req.user = payload;
  console.log(payload);

  next();
};

// verify admin
const verifyAdmin = async (req, res, next) => {
  if (req.user.role !== "admin") {
    res.status(403).send({ message: "Forbidden" });
    return;
  }
  next();
};

// verify technician
const verifyTechnician = async (req, res, next) => {
  if (req.user.role !== "technician") {
    res.status(403).send({ message: "Forbidden" });
    return;
  }
  next();
};

// verify customer
const verifyCustomer = async (req, res, next) => {
  if (req.user.role !== "customer") {
    res.status(403).send({ message: "Forbidden" });
    return;
  }
  next();
};

// --------------------------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------home route--------------------------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------

app.get("/", (req, res) => {
  res.send("Welcome to Fix Mate!");
});

// --------------------------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------ONLY ADMIN CAN ACCESS---------------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------

// get all the users
app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  const result = await usersCollections.find({}).toArray();
  res.send(result);
});

// update user role
app.patch(
  "/users/update-role/:id",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    const { id } = req.params;
    const updatedDoc = {
      $set: {
        role: req.body.role,
      },
    };
    const result = await usersCollections.updateOne(
      { _id: new ObjectId(id) },
      updatedDoc,
    );
    res.send(result);
  },
);

// get all services by approval status
app.get("/all-services", verifyToken, verifyAdmin, async (req, res) => {
  const query = {};
  if (req.query) {
    if (req.query.approvalStatus) {
      query.approvalStatus = req.query.approvalStatus;
    }
  }
  const result = await servicesCollections
    .find(query)
    .sort({ createdAt: -1 })
    .toArray();
  res.send(result);
});

// update service status
app.patch(
  "/services/update-status/:id",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    const { id } = req.params;
    const updatedDoc = {
      $set: {
        approvalStatus: req.body.approvalStatus,
      },
    };
    const result = await servicesCollections.updateOne(
      { _id: new ObjectId(id) },
      updatedDoc,
    );
    res.send(result);
  },
);

// get all bookings
app.get("/bookings", verifyToken, verifyAdmin, async (req, res) => {
  const result = await bookingsCollections
    .find({})
    .sort({ preferredDate: 1 })
    .toArray();
  res.send(result);
});

// get all payments
app.get("/all-payments", verifyToken, verifyAdmin, async (req, res) => {
  const payments = await paymentsCollections
    .find({})
    .sort({ paidAt: -1 })
    .toArray();

  const revenueResult = await paymentsCollections
    .aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amountPaid" },
        },
      },
    ])
    .toArray();

  const totalRevenue = revenueResult[0]?.totalRevenue || 0;

  res.send({
    totalRevenue,
    totalCount: payments.length,
    payments,
  });
});

// --------------------------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------ONLY TECHNICIAN CAN ACCESS----------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------

// add service
app.post("/add-service", verifyToken, verifyTechnician, async (req, res) => {
  const service = req.body;
  const newService = {
    ...service,
    technicianName: req.user.name,
    technicianEmail: req.user.email,
  };
  const result = await servicesCollections.insertOne(newService);
  res.send(result);
});

// get services for each technician
app.get(
  "/services/technician/:email",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const { email } = req.params;

    if (req.user?.email !== email) {
      return res.status(403).send({
        message: "Forbidden: You can only view your own services",
      });
    }

    const result = await servicesCollections
      .find({ technicianEmail: email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(result);
  },
);

// update availability of service
app.patch(
  "/services/availability/:id",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const { id } = req.params;
    const filter = { _id: new ObjectId(id) };

    const service = await servicesCollections.findOne(filter);

    if (req.user?.email !== service.technicianEmail) {
      return res.status(403).send({
        message: "Forbidden: You can only update your own service availability",
      });
    }

    const updatedDoc = {
      $set: {
        isAvailable: req.body.isAvailable,
      },
    };
    const result = await servicesCollections.updateOne(filter, updatedDoc);
    res.send(result);
  },
);

// update service
app.put(
  "/service/edit/:id",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const { id } = req.params;
    const filter = { _id: new ObjectId(id) };
    const service = await servicesCollections.findOne(filter);

    if (req.user?.email !== service.technicianEmail) {
      return res.status(403).send({
        message: "Forbidden: You can only edit your own service",
      });
    }

    const { _id, technicianEmail, ...safeUpdates } = req.body;

    const updateDoc = {
      $set: {
        ...safeUpdates,
        updatedAt: new Date(),
      },
    };

    const result = await servicesCollections.updateOne(filter, updateDoc);
    res.send(result);
  },
);

// delete service
app.delete(
  "/service/delete/:id",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const { id } = req.params;
    const filter = { _id: new ObjectId(id) };
    const service = await servicesCollections.findOne(filter);

    if (req.user?.email !== service.technicianEmail) {
      return res.status(403).send({
        message: "Forbidden: You can only delete your own service",
      });
    }

    const result = await servicesCollections.deleteOne(filter);
    res.send(result);
  },
);

// get bookings by each technician
app.get(
  "/bookings/technician/:email",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const { email } = req.params;
    if (req.user?.email !== email) {
      return res.status(403).send({
        message: "Forbidden: You can only view your own assigned bookings",
      });
    }
    const query = {
      technicianEmail: email,
    };
    const result = await bookingsCollections
      .find(query)
      .sort({ preferredDate: -1 })
      .toArray();
    res.send(result);
  },
);

// update booking status
app.patch(
  "/bookings/cancel/:id",
  verifyToken,
  verifyTechnician,
  async (req, res) => {
    const { id } = req.params;
    const filter = { _id: new ObjectId(id) };

    const booking = await bookingsCollections.findOne(filter);

    if (!booking) {
      return res.status(404).send({ message: "Booking not found" });
    }

    if (req.user?.email !== booking.technicianEmail) {
      return res.status(403).send({
        message: "Forbidden: You can only cancel your own bookings",
      });
    }

    const updateDoc = {
      $set: {
        status: req.body.status,
      },
    };
    const result = await bookingsCollections.updateOne(filter, updateDoc);
    res.send(result);
  },
);

// --------------------------------------------------------------------------------------------------------------------------------------
//-------------------------------------------------------------------ONLY CUSTOMER CAN ACCESS--------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------

// add bookings
app.post("/add-bookings", verifyToken, verifyCustomer, async (req, res) => {
  const booking = req.body;
  const newBooking = {
    ...booking,
    customerName: req.user.name,
    customerEmail: req.user.email,
  };
  const result = await bookingsCollections.insertOne(newBooking);
  res.send(result);
});

// get bookings for each customer
app.get(
  "/bookings/customer/:email",
  verifyToken,
  verifyCustomer,
  async (req, res) => {
    const { email } = req.params;

    if (req.user?.email !== email) {
      return res.status(403).send({
        message: "Forbidden: You can only view your own bookings",
      });
    }

    const result = await bookingsCollections
      .find({ customerEmail: email })
      .sort({ _id: -1 })
      .toArray();
    res.send(result);
  },
);

// pay for the service
app.patch("/api/bookings/:id/pay", async (req, res) => {
  const { id } = req.params;
  const { paymentStatus, transactionId, customerEmail, amountPaid } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid booking ID" });
  }

  const paidAt = new Date();
  const finalStatus = paymentStatus || "paid";
  const finalAmount = amountPaid ?? 0;

  const updatedBooking = await bookingsCollections.findOneAndUpdate(
    { _id: new ObjectId(id) },
    {
      $set: {
        paymentStatus: finalStatus,
        transactionId: transactionId || "",
        customerEmail: customerEmail || "",
        amountPaid: finalAmount,
        paidAt,
      },
    },
    { returnDocument: "after" },
  );

  if (!updatedBooking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  if (transactionId) {
    await paymentsCollections.updateOne(
      { transactionId },
      {
        $setOnInsert: {
          bookingId: new ObjectId(id),
          transactionId,
          customerEmail: customerEmail || "",
          amountPaid: finalAmount,
          status: finalStatus,
          paidAt,
        },
      },
      { upsert: true },
    );
  } else {
    await paymentsCollections.insertOne({
      bookingId: new ObjectId(id),
      transactionId: "",
      customerEmail: customerEmail || "",
      amountPaid: finalAmount,
      status: finalStatus,
      paidAt,
    });
  }

  return res.status(200).json({
    message: "Booking payment updated",
    booking: updatedBooking,
  });
});

// payment for each customer
app.get(
  "/payments/customer/:email",
  verifyToken,
  verifyCustomer,
  async (req, res) => {
    const { email } = req.params;
    if (req.user?.email !== email) {
      return res.status(403).send({
        message: "Forbidden: You can only view your own payment history",
      });
    }
    const result = await paymentsCollections
      .find({ customerEmail: email })
      .sort({ paidAt: -1 })
      .toArray();
    res.send(result);
  },
);

// --------------------------------------------------------------------------------------------------------------------------------------
//-------------------------------------------------------------------EVERYONE CAN ACCESS-------------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------

// get all the services which are available and approved by query
app.get("/services/available-approved", async (req, res) => {
  const query = {
    isAvailable: true,
    approvalStatus: "approved",
  };

  if (req.query) {
    if (req.query.category) {
      query.category = req.query.category;
    }
    if (req.query.serviceMode) {
      query.serviceMode = req.query.serviceMode;
    }
    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: "i" } },
        { category: { $regex: req.query.search, $options: "i" } },
      ];
    }
  }

  let sortObj = {};
  if (req.query.sortBy) {
    const field = req.query.sortBy;
    const order = req.query.sortOrder === "desc" ? -1 : 1;
    sortObj[field] = order;
  } else {
    sortObj = { createdAt: -1 };
  }
  const result = await servicesCollections.find(query).sort(sortObj).toArray();
  res.send(result);
});

// get service details
app.get("/service/:id", async (req, res) => {
  const { id } = req.params;
  const result = await servicesCollections.findOne({ _id: new ObjectId(id) });
  res.send(result);
});

// get featured services
app.get("/featured-service", async (req, res) => {
  const query = {
    isAvailable: true,
    approvalStatus: "approved",
  };
  let sortObj = { createdAt: -1 };

  const result = await servicesCollections
    .find(query)
    .sort(sortObj)
    .limit(6)
    .toArray();
  res.send(result);
});

// --------------------------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------port listening----------------------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

export default app;
