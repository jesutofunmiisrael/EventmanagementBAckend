const User = require("../models/user");
const Event = require("../models/Event");
const Ticket = require("../models/Ticket");
const Registration = require("../models/Registration");
const Transaction = require("../models/Transaction");
const {
  payment,
  verifyPaystackTransaction,
} = require("../services/payment");

const bcrypt = require("bcryptjs");
const moment = require("moment");
const cron = require("node-cron");
const nodemailer = require("nodemailer");

// ==================== USER PROFILE ====================

const getProfile = async (req, res, next) => {
  try {
    const userProfile = await User.findById(req.user.id);

    if (!userProfile) {
      return res.status(404).json({
        status: "fail",
        message: "Unable to fetch user profile",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "User profile was successfully fetched!",
      userProfile,
    });
  } catch (error) {
    return next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const { oldUsername, newUsername } = req.body;

    if (!oldUsername || !newUsername) {
      return res.status(400).json({
        status: "fail",
        message: "Both old and new usernames are required",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    if (user.username !== oldUsername) {
      return res.status(400).json({
        status: "fail",
        message: "Old username does not match",
      });
    }

    user.username = newUsername;
    await user.save();

    return res.status(200).json({
      status: "success",
      message: "User profile updated successfully",
      user,
    });
  } catch (error) {
    return next(error);
  }
};

const deleteProfile = async (req, res, next) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.user.id);

    if (!deletedUser) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Profile deleted successfully",
    });
  } catch (error) {
    return next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({
        status: "fail",
        message: "Both old and new passwords are required",
      });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).json({
        status: "fail",
        message: "New password must contain at least 8 characters",
      });
    }

    const user = await User.findById(req.user.id).select("+password");

    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
      return res.status(401).json({
        status: "fail",
        message: "Incorrect old password",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({
      status: "success",
      message: "Password changed successfully",
    });
  } catch (error) {
    return next(error);
  }
};

// ==================== USER EVENTS ====================

const getUserEvents = async (req, res, next) => {
  try {
    const events = await Event.find({
      createdBy: req.user.id,
    }).sort({ date: 1 });

    return res.status(200).json({
      status: "success",
      message: "User's events fetched successfully",
      result: events.length,
      events,
    });
  } catch (error) {
    console.error("GET USER EVENTS ERROR:", error);
    return next(error);
  }
};

const getMyRegisterEvent = async (req, res, next) => {
  try {
    const registrations = await Registration.find({
      userId: req.user.id,
    })
      .populate("eventId")
      .sort({ createdAt: -1 });

    const events = registrations.map((registration) => {
      const event = registration.eventId;
      const eventDate = event?.date ? moment(event.date) : null;

      return {
        registrationId: registration._id.toString(),
        eventName: event?.name || "Event unavailable",
        eventDate: eventDate ? eventDate.format("YYYY-MM-DD") : null,
        eventLocation: event?.location || "",
        eventVenue: event?.venue || "",
        eventCategory: event?.category || "",
        daysUntilEvent: eventDate
          ? eventDate.diff(moment(), "days")
          : null,
        registrationStatus: registration.status,
        numberOfSeats: registration.numberOfSeats,
        ticketPrice: registration.totalPrice,
        ticketType: registration.ticketType,
        transactionId: registration.transactionId,
      };
    });

    return res.status(200).json({
      status: "success",
      message: events.length
        ? "Registered events fetched successfully"
        : "No events registered by the user",
      events,
    });
  } catch (error) {
    console.error("GET MY REGISTERED EVENTS ERROR:", error);
    return next(error);
  }
};

// View registrations for an event created by the logged-in user
const UserregisterforMyEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const userId = req.user.id;

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({
        status: "fail",
        message: "Event not found",
      });
    }

    if (event.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to view registrations for this event",
      });
    }

    const registrations = await Registration.find({
      eventId,
      status: "completed",
    }).populate("ticketId userId");

    const userRegistrations = registrations.map((registration) => ({
      userName: registration.userId?.username || "User",
      ticketType: registration.ticketType,
      status: registration.status,
      ticketPrice:
        registration.ticketId?.price ?? registration.totalPrice,
      numberOfSeats: registration.numberOfSeats,
      pricePaid: registration.totalPrice,
    }));

    return res.status(200).json({ userRegistrations });
  } catch (error) {
    return next(error);
  }
};

// ==================== REGISTER FOR EVENT ====================
// Creates a pending registration and initializes Paystack payment.

const registerforEvent = async (req, res, next) => {
  let registration;

  try {
    const {
      ticketId,
      eventId,
      email,
      numberOfSeats,
      ticketType,
    } = req.body;

    const userId = req.user.id;
    const seats = Number(numberOfSeats);

    if (
      !ticketId ||
      !eventId ||
      !email ||
      !Number.isInteger(seats) ||
      seats < 1 ||
      !ticketType
    ) {
      return res.status(400).json({
        status: "fail",
        message:
          "Provide ticketId, eventId, email, a valid numberOfSeats, and ticketType.",
      });
    }

    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({
        status: "fail",
        message: "Ticket not found.",
      });
    }

    if (ticket.eventId.toString() !== eventId.toString()) {
      return res.status(400).json({
        status: "fail",
        message: "Ticket does not belong to this event.",
      });
    }

    if (
      ticket.type.toLowerCase() !==
      String(ticketType).toLowerCase()
    ) {
      return res.status(400).json({
        status: "fail",
        message: "Selected ticket type does not match the ticket.",
      });
    }

    if (!Number.isFinite(ticket.price) || ticket.price <= 0) {
      return res.status(400).json({
        status: "fail",
        message:
          "This ticket has no valid price configured yet. Please contact the event organizer.",
      });
    }

    if (ticket.sit < seats) {
      return res.status(400).json({
        status: "fail",
        message: "Insufficient available seats.",
      });
    }

    const totalPrice = Number(ticket.price) * seats;

    registration = await Registration.create({
      ticketId: ticket._id,
      userId,
      eventId,
      email,
      numberOfSeats: seats,
      ticketType: ticket.type,
      totalPrice,
      status: "pending",
      transactionId: null,
    });

    const { paymentUrl, transactionId } = await payment({
      email,
      amount: totalPrice,
    });

    registration.transactionId = transactionId;
    await registration.save();

    await Transaction.create({
      userId,
      eventId,
      registrationId: registration._id,
      transactionId,
      amount: totalPrice,
      status: "pending",
    });

    return res.status(200).json({
      status: "success",
      message:
        "Payment initialized. Complete payment to confirm registration.",
      paymentUrl,
      transactionId,
      totalPrice,
      registrationId: registration._id,
    });
  } catch (error) {
    console.error("REGISTER EVENT ERROR:", error);

    if (registration && !registration.transactionId) {
      await Registration.findByIdAndDelete(registration._id).catch(
        (cleanupError) => {
          console.error("REGISTRATION CLEANUP ERROR:", cleanupError);
        }
      );
    }

    return res.status(500).json({
      status: "error",
      message: "Unable to initialize payment. Please try again.",
    });
  }
};

// ==================== VERIFY PAYSTACK PAYMENT ====================
// POST /api/v1/user/verify-payment
// Request body: { "reference": "PAYSTACK_REFERENCE" }

const verifyPaystackPayment = async (req, res, next) => {
  try {
    const reference = req.body.reference || req.body.transactionId;
    const userId = req.user.id;

    if (typeof reference !== "string" || !reference.trim()) {
      return res.status(400).json({
        status: "fail",
        message: "Paystack payment reference is required.",
      });
    }

    const transaction = await Transaction.findOne({
      transactionId: reference,
      userId,
    });

    if (!transaction) {
      return res.status(404).json({
        status: "fail",
        message: "Transaction not found for this user.",
      });
    }

    const registration = await Registration.findOne({
      _id: transaction.registrationId,
      userId,
      transactionId: reference,
    });

    if (!registration) {
      return res.status(404).json({
        status: "fail",
        message:
          "Registration linked to this transaction was not found.",
      });
    }

    if (
      transaction.status === "completed" &&
      registration.status === "completed"
    ) {
      return res.status(200).json({
        status: "success",
        message: "Payment has already been verified.",
        registrationId: registration._id,
        transactionId: reference,
        totalPrice: registration.totalPrice,
      });
    }

    const verifiedPayment = await verifyPaystackTransaction(reference);

    if (
      verifiedPayment.status !== "success" ||
      verifiedPayment.reference !== reference
    ) {
      return res.status(400).json({
        status: "fail",
        message: "Paystack has not confirmed a successful payment.",
      });
    }

    const expectedAmountInKobo = Math.round(
      Number(transaction.amount) * 100
    );

    if (
      !Number.isSafeInteger(expectedAmountInKobo) ||
      Number(verifiedPayment.amount) !== expectedAmountInKobo ||
      Number(transaction.amount) !== Number(registration.totalPrice)
    ) {
      return res.status(400).json({
        status: "fail",
        message:
          "Verified payment amount does not match the registration.",
      });
    }

    // Claim the pending registration to prevent duplicate seat deductions.
    const claimedRegistration = await Registration.findOneAndUpdate(
      {
        _id: registration._id,
        userId,
        transactionId: reference,
        status: "pending",
      },
      {
        $set: { status: "completed" },
      },
      { new: true }
    );

    if (!claimedRegistration) {
      const [freshRegistration, freshTransaction] = await Promise.all([
        Registration.findById(registration._id),
        Transaction.findById(transaction._id),
      ]);

      if (
        freshRegistration?.status === "completed" &&
        freshTransaction?.status === "completed"
      ) {
        return res.status(200).json({
          status: "success",
          message: "Payment has already been verified.",
          registrationId: registration._id,
          transactionId: reference,
          totalPrice: registration.totalPrice,
        });
      }

      return res.status(409).json({
        status: "fail",
        message: "This registration is already being processed.",
      });
    }

    const updatedTicket = await Ticket.findOneAndUpdate(
      {
        _id: claimedRegistration.ticketId,
        sit: { $gte: claimedRegistration.numberOfSeats },
      },
      {
        $inc: { sit: -claimedRegistration.numberOfSeats },
      },
      { new: true }
    );

    if (!updatedTicket) {
      await Registration.findByIdAndUpdate(
        claimedRegistration._id,
        { $set: { status: "cancelled" } }
      );

      await Transaction.findByIdAndUpdate(
        transaction._id,
        { $set: { status: "cancelled" } }
      );

      return res.status(409).json({
        status: "fail",
        message:
          "Payment succeeded, but there are not enough seats remaining. Contact the event organizer for a refund.",
      });
    }

    await Transaction.findByIdAndUpdate(
      transaction._id,
      { $set: { status: "completed" } }
    );

    return res.status(200).json({
      status: "success",
      message: "Payment verified and registration confirmed.",
      registrationId: claimedRegistration._id,
      transactionId: reference,
      totalPrice: claimedRegistration.totalPrice,
      ticketType: claimedRegistration.ticketType,
      numberOfSeats: claimedRegistration.numberOfSeats,
    });
  } catch (error) {
    console.error("VERIFY PAYSTACK PAYMENT ERROR:", error);
    return next(error);
  }
};

// ==================== TRANSACTION HISTORY ====================

const viewTransactionsHistory = async (req, res, next) => {
  try {
    const transactions = await Transaction.find({
      userId: req.user.id,
    })
      .populate("eventId")
      .sort({ createdAt: -1 });

    const formattedTransactions = transactions.map((transaction) => ({
      eventName: transaction.eventId?.name || "Event unavailable",
      amount: transaction.amount,
      datePaid: moment(transaction.createdAt).format("YYYY-MM-DD"),
      status: transaction.status,
      transactionId: transaction.transactionId,
    }));

    return res.status(200).json({
      transactions: formattedTransactions,
    });
  } catch (error) {
    return next(error);
  }
};

// ==================== EVENT EMAIL REMINDERS ====================

const sendEventNotifications = async () => {
  try {
    if (
      !process.env.EMAIL_HOST ||
      !process.env.EMAIL_USERNAME ||
      !process.env.EMAIL_PASSWORD
    ) {
      console.warn(
        "Email notification skipped: email environment variables are missing."
      );
      return;
    }

    const start = moment().add(2, "days").startOf("day").toDate();
    const end = moment().add(3, "days").startOf("day").toDate();

    const registrations = await Registration.find({
      status: "completed",
    }).populate("userId eventId");

    const dueRegistrations = registrations.filter((registration) => {
      const date = registration.eventId?.date;
      return date && date >= start && date < end;
    });

    const port = Number(process.env.EMAIL_PORT || 587);

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    for (const registration of dueRegistrations) {
      const event = registration.eventId;

      if (!event || !registration.email) continue;

      await transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USERNAME,
        to: registration.email,
        subject: "EventFlow event reminder",
        html: `<p>Hello ${registration.userId?.username || "there"},</p>
          <p>This is a reminder that "${event.name}" is scheduled for ${moment(
            event.date
          ).format("YYYY-MM-DD")}.</p>
          <p>Regards,<br />EventFlow</p>`,
      });
    }

    console.log("Event notifications processed.");
  } catch (error) {
    console.error("ERROR SENDING EVENT NOTIFICATIONS:", error);
  }
};

// Run event reminders daily at midnight.
cron.schedule("0 0 * * *", sendEventNotifications);

module.exports = {
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
};