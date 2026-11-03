const express = require("express");

const {
    createEvent,
    getallEvents,
    getsigleEvents,
    updateEvents,
    deleteEvents,
    getUpcomimgEvent,
    getFeaturedEvent,
    getEventForCategories,
    getLengthofCategories,
    getSearchEvent,
    createTicket,
    getTicketforEvent,
    updateTicket,
    deleteTicket,
    getLengthofEventUser,
} = require("./../controllers/eventController");

const { protectRoutes } = require("../middlewares/auth");
const mongoose = require("mongoose");
const Event = require("../models/Event");
const Ticket = require("../models/Ticket");

const router = express.Router();

// CREATE EVENT
router.post(
    "/createEvent",
    (req, res, next) => {
        console.log("CREATE EVENT ROUTE REACHED");
        next();
    },
    protectRoutes,
    createEvent
);

// GET EVENTS
router.get("/getEvent", getallEvents);
router.get("/events/upcoming", getUpcomimgEvent);
router.get("/events/featured", getFeaturedEvent);
router.get("/event/usereventvenues", getLengthofEventUser);

// GET EVENTS BY CATEGORY / SEARCH
router.get("/category/:category", getEventForCategories);
router.get("/categories/length", getLengthofCategories);
router.get("/search/:name/:category/:time", getSearchEvent);

// CREATE TICKETS
router.post("/createTicket", protectRoutes, createTicket);

// GET TICKETS FOR AN EVENT
router.get("/getTicket/:ticketId", getTicketforEvent);

// INITIALIZE MISSING TICKETS FOR AN EXISTING EVENT
router.post(
    "/:eventId/initializeTickets",
    protectRoutes,
    async (req, res, next) => {
        try {
            const { eventId } = req.params;
            const userId = req.user?._id;

            if (!mongoose.isValidObjectId(eventId)) {
                return res.status(400).json({
                    status: "fail",
                    message: "Invalid event ID.",
                });
            }

            const event = await Event.findById(eventId);

            if (!event) {
                return res.status(404).json({
                    status: "fail",
                    message: "Event not found.",
                });
            }

            if (event.createdBy.toString() !== userId?.toString()) {
                return res.status(403).json({
                    status: "fail",
                    message: "You are not authorized to manage this event.",
                });
            }

            const ticketTypes = [
                { type: "Regular", sit: 100, price: 5000 },
                { type: "VIP", sit: 50, price: 10000 },
            ];

            for (const ticketData of ticketTypes) {
                const existingTicket = await Ticket.findOne({
                    eventId: event._id,
                    type: ticketData.type,
                });

                if (!existingTicket) {
                    await Ticket.create({
                        eventId: event._id,
                        userId,
                        ...ticketData,
                    });
                }
            }

            const tickets = await Ticket.find({
                eventId: event._id,
            }).sort({ type: 1 });

            return res.status(200).json({
                status: "success",
                message: "Event tickets checked successfully.",
                result: tickets.length,
                tickets,
            });
        } catch (error) {
            console.error("INITIALIZE TICKETS ERROR:", error);
            return next(error);
        }
    }
);

// UPDATE / DELETE TICKETS
router.put("/updateTicket/:ticketId", protectRoutes, updateTicket);
router.delete("/deleteTicket/:ticketId", protectRoutes, deleteTicket);

// UPDATE / DELETE EVENTS
router.put("/:eventId", protectRoutes, updateEvents);
router.delete("/:eventId", protectRoutes, deleteEvents);

// GET A SINGLE EVENT — KEEP THIS AFTER SPECIFIC ROUTES
router.get("/:eventId", getsigleEvents);

module.exports = router;