import express from "express";
import "dotenv/config";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";

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

// --------------------------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------middleware--------------------------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------

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
app.get("/users", async (req, res) => {
  const result = await usersCollections.find({}).toArray();
  res.send(result);
});

// update user role
app.patch("/users/update-role/:id", async (req, res) => {
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
});

// get all services by approval status
app.get("/all-services", async (req, res) => {
  const query = {};
  if (req.query) {
    if (req.query.approvalStatus) {
      query.approvalStatus = req.query.approvalStatus;
    }
  }
  const result = await servicesCollections.find(query).toArray();
  res.send(result);
});

// update service status
app.patch("/services/update-status/:id", async (req, res) => {
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
});

// get all bookings
app.get("/bookings", async (req, res) => {
  const result = await bookingsCollections.find({}).toArray();
  res.send(result);
});

// --------------------------------------------------------------------------------------------------------------------------------------
//---------------------------------------------------------------ONLY TECHNICIAN CAN ACCESS----------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------

// add service
app.post("/add-service", async (req, res) => {
  const service = req.body;
  const result = await servicesCollections.insertOne(service);
  res.send(result);
});

// get services for each technician
app.get("/services/technician/:email", async (req, res) => {
  const { email } = req.params;
  const result = await servicesCollections
    .find({ technicianEmail: email })
    .toArray();
  res.send(result);
});

// update availability of service
app.patch("/services/availability/:id", async (req, res) => {
  const { id } = req.params;
  const updatedDoc = {
    $set: {
      isAvailable: req.body.isAvailable,
    },
  };
  const result = await servicesCollections.updateOne(
    { _id: new ObjectId(id) },
    updatedDoc,
  );
  res.send(result);
});

// update service
app.put("/service/edit/:id", async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;
  const updateDoc = {
    $set: updatedData,
  };
  const result = await servicesCollections.updateOne(
    { _id: new ObjectId(id) },
    updateDoc,
  );
  res.send(result);
});

// delete service
app.delete("/service/delete/:id", async (req, res) => {
  const { id } = req.params;
  const result = await servicesCollections.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// get bookings by each technician
app.get("/bookings/technician/:email", async (req, res) => {
  const { email } = req.params;
  const query = {
    technicianEmail: email,
  };
  const result = await bookingsCollections.find(query).toArray();
  res.send(result);
});

// --------------------------------------------------------------------------------------------------------------------------------------
//-------------------------------------------------------------------ONLY CUSTOMER CAN ACCESS--------------------------------------------
// --------------------------------------------------------------------------------------------------------------------------------------

// add bookings
app.post("/add-bookings", async (req, res) => {
  const booking = req.body;
  const result = await bookingsCollections.insertOne(booking);
  res.send(result);
});

// get bookings for each customer
app.get("/bookings/customer/:email", async (req, res) => {
  const { email } = req.params;
  const result = await bookingsCollections
    .find({ customerEmail: email })
    .toArray();
  res.send(result);
});

// update booking status
app.patch("/bookings/cancel/:id", async (req, res) => {
  const { id } = req.params;
  const updateDoc = {
    $set: {
      status: req.body.status,
    },
  };
  const result = await bookingsCollections.updateOne(
    { _id: new ObjectId(id) },
    updateDoc,
  );
  res.send(result);
});

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
