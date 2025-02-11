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
      "https://travel-guide-839c4.web.app",
      "https://travel-guide-839c4.firebaseapp.com",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// verify jwt middleware
const verifyToken = async (req, res, next) => {
  // Get token
  const token = req.cookies?.token;
  console.log("find the valid token", token);
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

// const uri = `mongodb://localhost:27017`;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2xcjib6.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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

    const travelGuideCollection = client
      .db("TravelGuide")
      .collection("tourPackage");
    const tourGuideCollection = client
      .db("TravelGuide")
      .collection("tourGuide");
    const tourTypeCollection = client.db("TravelGuide").collection("tourType");
    const wishlistCollection = client.db("TravelGuide").collection("wishlist");
    const usersCollection = client.db("TravelGuide").collection("users");
    const bookingsCollection = client.db("TravelGuide").collection("bookings");
    const StoriesCollection = client.db("TravelGuide").collection("stories");

    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      console.log("hello");
      const user = req.user;
      const query = { email: user?.email };
      const result = await usersCollection.findOne(query);
      console.log("User Email", user);
      console.log("Admin Result Role", result);
      if (!result || result?.role !== "admin")
        return res.status(401).send({ message: "unauthorized access!!" });

      next();
    };
    // verify host middleware
    const verifyTourGuide = async (req, res, next) => {
      console.log("hello");
      const user = req.user;
      const query = { email: user?.email };
      const result = await usersCollection.findOne(query);
      console.log(result?.role);
      if (!result || result?.role !== "host") {
        return res.status(401).send({ message: "unauthorized access!!" });
      }

      next();
    };

    /*******Tokens JWT Generate********/
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

    /*****************Start************************************** *
    /*********Tour Package**********/
    // Get all tour-package data from db
    app.get(`/tour-package`, async (req, res) => {
      const cursor = travelGuideCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    // Get a single tour-package data from db using tour package id
    app.get("/tour-package/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await travelGuideCollection.findOne(query);
      res.send(result);
    });

    // Save a tour-package data in db
    app.post("/tour-package", async (req, res) => {
      const package = req.body;
      const result = await travelGuideCollection.insertOne(package);
      res.send(result);
    });

    /*************Tour Type******************************************/
    // Get all Tour Type data from db
    app.get(`/tour-types`, async (req, res) => {
      const cursor = tourTypeCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get(`/tour-type/:typeName`, async (req, res) => {
      const typeName = req.params.typeName;
      const query = { type_name: typeName };
      const cursor = tourTypeCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    /*************Wishlist**************************************/
    // Save a wishlist data in db
    app.post("/wishlist", async (req, res) => {
      const wishlist = req.body;
      const query = { email: wishlist?.email, userId: wishlist.userId };

      if (!wishlist?.email) {
        return res.status(400).send("Please Login First");
      }

      // check if user already exists in db
      const isExist = await wishlistCollection.findOne(query);
      if (isExist) {
        return res.status(400).send("You have already add on wishlist");
      }
      // console.log(wishlist);
      const result = await wishlistCollection.insertOne(wishlist);
      res.send(result);
    });

    // Get by email wishlist data from db
    app.get("/wishlist/:email", verifyToken, async (req, res) => {
      const tokenEmail = req?.user?.email;
      const email = req?.params?.email;
      console.log(tokenEmail);
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };

      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      let options = {};
      const result = await wishlistCollection
        .find(query, options)
        .skip(page * size)
        .limit(size)
        .toArray();

      res.send(result);
    });

    // Get all wishlist data count from db
    app.get("/wishlist/count/:email", async (req, res) => {
      // const guideName = req.params.name;
      const email = req?.params?.email;
      const query = { email: email };
      console.log(query);
      const count = await wishlistCollection.countDocuments(query);

      res.send({ count });
    });

    // delete a wishlist data
    app.delete("/wishlist/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await wishlistCollection.deleteOne(query);
      res.send(result);
    });

    /***************Users************************************************* */
    // save a user data from db
    app.put("/user", async (req, res) => {
      const user = req.body;

      const query = { email: user?.email };
      // check if user already exists in db
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        if (user.status === "Requested") {
          // if existing user try to change his role
          const result = await usersCollection.updateOne(query, {
            $set: { status: user?.status },
          });
          return res.send(result);
        } else {
          // if existing user login again
          return res.send(isExist);
        }
      }

      // save user for the first time
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // get a user info by email from db
    app.get("/user/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });

    //update a user role
    app.patch("/users/update/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email };
      const updateDoc = {
        $set: { ...user, timestamp: Date.now() },
      };
      const result = await usersCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Get all users data from db for pagination
    app.get("/users", async (req, res) => {
      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      const filter = req.query.filter;
      const search = req.query.search;
      // console.log(filter, search)
      // console.log(size, page)

      let query = {
        name: { $regex: search, $options: "i" },
      };
      if (filter) query.role = filter;
      let options = {};
      // const result = await usersCollection.find(query, options).toArray();
      const result = await usersCollection
        .find(query, options)
        .skip(page * size)
        .limit(size)
        .toArray();
      // const result = await usersCollection.find().toArray();

      res.send(result);
    });
    // Get all users data from db
    app.get("/all-users", async (req, res) => {
      const cursor = usersCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/all/users/name/:name", async (req, res) => {
      const name = req.params.name;
      const result = await usersCollection.findOne({ name });
      res.send(result);
    });
    
    app.get("/all-users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    // Get all users data count from db
    app.get("/users-count", async (req, res) => {
      const filter = req.query.filter;
      const search = req.query.search;
      let query = {
        name: { $regex: search, $options: "i" },
      };
      if (filter) query.name = filter;
      const count = await usersCollection.countDocuments(query);

      res.send({ count });
    });

    /****************Bookings***********************************************/
    // Save a booking data in db
    app.post("/booking", async (req, res) => {
      const bookingData = req.body;
      // save room booking info
      const result = await bookingsCollection.insertOne(bookingData);
      res.send(result);
    });

    // get all booking for a normal_user
    app.get("/my-bookings/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { touristEmail: email };

      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      let options = {};
      const result = await bookingsCollection
        .find(query, options)
        .skip(page * size)
        .limit(size)
        .toArray();

      res.send(result);
    });

    // Get all bookings data count from db
    app.get("/my-bookings/count/:email", async (req, res) => {
      const email = req.params.email;
      const query = { touristEmail: email };
      // console.log(query);
      const count = await bookingsCollection.countDocuments(query);

      res.send({ count });
    });

    // Update booking status
    app.patch("/booking/update/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: status,
      };
      const result = await bookingsCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // get all booking for a tour Guide
    app.get("/manage-bookings/:name", async (req, res) => {
      const guideName = req.params.name;
      // console.log("manage Bookings", guideName);
      const query = { guideName: guideName };
      // console.log(query);

      const size = parseInt(req.query.size);
      const page = parseInt(req.query.page) - 1;
      let options = {};
      const result = await bookingsCollection
        .find(query, options)
        .skip(page * size)
        .limit(size)
        .toArray();

      res.send(result);
    });

    // Get all bookings data count from db
    app.get("/bookings/count/:name", async (req, res) => {
      const guideName = req.params.name;
      // console.log("manage Bookings", guideName);
      const query = { guideName: guideName };
      console.log(query);
      const count = await bookingsCollection.countDocuments(query);

      res.send({ count });
    });

    // delete a booking
    app.delete("/booking/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });

    /*****************Stories**************************************************/
    app.get(`/stories`, async (req, res) => {
      const cursor = StoriesCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/stories/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await StoriesCollection.findOne(query);
      res.send(result);
    });

    // Save a tour-package data in db
    app.post("/story", async (req, res) => {
      const stories = req.body;
      const result = await StoriesCollection.insertOne(stories);
      res.send(result);
    });

    /*******************end***************************** */

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
  res.send("Travel Guide Server is running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
