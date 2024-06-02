const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://job-portal-3285e.web.app",
      "https://job-portal-3285e.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// My Middleware
const logger = async (req, res, next) => {
  // console.log('called', req.host, req.originalUrl);
  next();
};

// verify jwt middleware
const verifyToken = async (req, res, next) => {
  // Get token
  const token = req.cookies?.token;
  // console.log("find the valid token", token);
  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    //if token is not valid... error
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }

    // If token is valid
    console.log("value in token", decoded);
    req.user = decoded;
    next();
  });
};

const uri = `mongodb://localhost:27017`;

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2xcjib6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const jobPortalCollection = client.db("jobPortal").collection("jobs");
    const applyJobCollection = client.db("jobPortal").collection("appliedJob");

    //Tokens JWT Generate
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      // console.log(user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "365d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          // secure: false,
          secure: process.env.NODE_ENV === "production" ? true : false,
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // Clear token on logout
    app.post("/logout", async (req, res) => {
      const user = req.body;
      // console.log('User logged out');
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production" ? true : false,
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
          maxAge: 0,
        })
        .send({ message: true });
    });

    // Get all jobs data from db
    app.get(`/jobs`, async (req, res) => {
      const cursor = jobPortalCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Get a single job data from db using job id
    app.get("/job/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobPortalCollection.findOne(query);
      res.send(result);
    });

    // Save a apply data in db
    app.post("/apply", async (req, res) => {
      const applyData = req.body;
      // console.log(applyData);

      // check if its a duplicate request
      const query = {
        email: applyData.email,
        jobId: applyData.jobId,
      };
      const alreadyApplied = await applyJobCollection.findOne(query);
      // console.log(alreadyApplied)
      if (alreadyApplied) {
        return res.status(400).send("You have already apply on this job.");
      }

      const result = await applyJobCollection.insertOne(applyData);

      // update apply count in jobs collection
      const updateDoc = {
        $inc: { apply_count: 1 },
      };
      const jobQuery = { _id: new ObjectId(applyData.jobId) };
      const updateApplyCount = await jobPortalCollection.updateOne(
        jobQuery,
        updateDoc
      );
      // console.log(updateApplyCount)
      res.send(result);
    });

    // Save a job data in db
    app.post("/job", async (req, res) => {
      const jobData = req.body;
      // console.log(jobData);
      const result = await jobPortalCollection.insertOne(jobData);
      res.send(result);
    });

    // get all jobs posted by a specific user
    app.get("/jobs/:email", verifyToken, async (req, res) => {
      const tokenEmail = req.user.email;
      const email = req.params.email;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { "buyer.email": email };
      const result = await jobPortalCollection.find(query).toArray();
      res.send(result);
    });

    // delete a job data from db
    app.delete("/job/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await jobPortalCollection.deleteOne(query);
      res.send(result);
    });

    // update a job in db
    app.put("/job/:id", async (req, res) => {
      const id = req.params.id;
      const jobData = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...jobData,
        },
      };
      const result = await jobPortalCollection.updateOne(
        query,
        updateDoc,
        options
      );
      res.send(result);
    });

    // get all apply for a user by email from db
    app.get("/my-apply/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const tokenEmail = req.user.email;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email };
      const result = await applyJobCollection.find(query).toArray();
      res.send(result);
    });

    // Get all jobs data from db for pagination
    app.get("/all-jobs", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      const filter = req.query.filter;
      const sort = req.query.sort;
      const search = req.query.search;
      // console.log(size, page)

      let query = {
        job_title: { $regex: search, $options: "i" },
      };
      if (filter) query.category = filter;
      let options = {};
      if (sort) options = { sort: { deadline: sort === "asc" ? 1 : -1 } };
      const result = await jobPortalCollection
        .find(query, options)
        .skip(page * size)
        .limit(size)
        .toArray();

      res.send(result);
    });

    // Get all jobs data count from db
    app.get("/jobs-count", async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;
      let query = {
        job_title: { $regex: search, $options: "i" },
      };
      if (filter) query.category = filter;
      const count = await jobPortalCollection.countDocuments(query);

      res.send({ count });
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Job Portal Server is running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
