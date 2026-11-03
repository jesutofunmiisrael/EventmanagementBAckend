const express = require("express");

const {
  getProfile,
  updateProfile,
  deleteProfile,
  changePassword,
  getUserEvents,
  getMyRegisterEvent,
  registerforEvent,
  verifyPaystackPayment,
  viewTransactionsHistory,
  UserregisterforMyEvent,
} = require("../controllers/userController");

const { protectRoutes } = require("../middlewares/auth");

const router = express.Router();

router.get("/profile", protectRoutes, getProfile);

router.patch("/profile", protectRoutes, updateProfile);

router.delete("/profile", protectRoutes, deleteProfile);

router.patch("/changepassword", protectRoutes, changePassword);

router.get("/my-events", protectRoutes, getUserEvents);

router.get("/my-transactions", protectRoutes, viewTransactionsHistory);

router.get(
  "/Userregisteringformyevent/:eventId",
  protectRoutes,
  UserregisterforMyEvent
);

router.get("/myregister-event", protectRoutes, getMyRegisterEvent);

// Register for an event and initialize Paystack payment.
router.post(
  "/registerforevent",
  (req, res, next) => {
    console.log("REGISTER ROUTE REACHED");
    console.log("BODY:", req.body);
    console.log(
      "AUTH HEADER:",
      req.headers.authorization ? "PRESENT" : "MISSING"
    );
    next();
  },
  protectRoutes,
  (req, res, next) => {
    console.log("PROTECT ROUTE PASSED");
    console.log("USER ID:", req.user?._id);
    next();
  },
  registerforEvent
);


router.post(
  "/verify-payment",
  protectRoutes,
  verifyPaystackPayment
);

module.exports = router;