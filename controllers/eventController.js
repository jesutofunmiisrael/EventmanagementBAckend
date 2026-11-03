const Event = require("../models/Event");
const mongoose = require("mongoose");
const Ticket = require("../models/Ticket");
const {
    multerUploads,
    dataUri,
    uploader,
    cloudinaryConfig
} = require("../middlewares/cloudinary");
const User = require("../models/user");




const createEvent = async (req, res, next) => {
  console.log("CREATE EVENT CONTROLLER REACHED");

  try {
    multerUploads(req, res, async function (err) {
      if (err) {
        console.error("IMAGE UPLOAD ERROR:", err);
        return res.status(400).json({
          status: "fail",
          message: "Error uploading image",
          error: err.message,
        });
      }

      try {
        cloudinaryConfig();

        const {
          name,
          description,
          date,
          location,
          category,
          venue,
          regularPrice = 5000,
          vipPrice = 10000,
          regularSeats = 100,
          vipSeats = 50,
        } = req.body;

        if (!req.user?._id) {
          return res.status(401).json({
            status: "fail",
            message: "You must be logged in to create an event.",
          });
        }

        if (
          !name ||
          !description ||
          !date ||
          !location ||
          !category ||
          !venue
        ) {
          return res.status(400).json({
            status: "fail",
            message:
              "Please provide name, description, date, location, category, and venue.",
          });
        }

        const eventDate = new Date(date);

        if (
          Number.isNaN(eventDate.getTime()) ||
          eventDate <= new Date()
        ) {
          return res.status(400).json({
            status: "fail",
            message: "Please provide a valid future event date.",
          });
        }

        const prices = {
          regular: Number(regularPrice),
          vip: Number(vipPrice),
        };

        const seats = {
          regular: Number(regularSeats),
          vip: Number(vipSeats),
        };

        if (
          !Number.isFinite(prices.regular) ||
          !Number.isFinite(prices.vip) ||
          prices.regular <= 0 ||
          prices.vip <= 0 ||
          !Number.isInteger(seats.regular) ||
          !Number.isInteger(seats.vip) ||
          seats.regular < 1 ||
          seats.vip < 1
        ) {
          return res.status(400).json({
            status: "fail",
            message:
              "Ticket prices must be greater than zero, and seat counts must be positive whole numbers.",
          });
        }

        let image = null;

        if (req.file) {
          const imageDataUri = dataUri(req);
          const result = await uploader.upload(imageDataUri, {
            folder: "event_images",
          });

          image = result.secure_url;
        }

        const event = await Event.create({
          name,
          description,
          date: eventDate,
          location,
          category,
          venue,
          createdBy: req.user._id,
          image,
        });

        try {
          const tickets = await Ticket.create([
            {
              eventId: event._id,
              userId: req.user._id,
              type: "Regular",
              sit: seats.regular,
              price: prices.regular,
            },
            {
              eventId: event._id,
              userId: req.user._id,
              type: "VIP",
              sit: seats.vip,
              price: prices.vip,
            },
          ]);

          return res.status(201).json({
            status: "success",
            message: "Event and tickets created successfully.",
            event,
            tickets,
          });
        } catch (ticketError) {
          // Avoid leaving an event behind if its tickets cannot be created.
          await Event.findByIdAndDelete(event._id);
          throw ticketError;
        }
      } catch (error) {
        console.error("CREATE EVENT ERROR:", error);
        return next(error);
      }
    });
  } catch (error) {
    console.error("CREATE EVENT OUTER ERROR:", error);
    return next(error);
  }
};




const getallEvents = async (req, res, next) => {
    try {
        const events = await Event.find().sort({ date: 1 });

        res.status(200).json({
            status: "success",
            results: events.length,
            events
        });

    } catch (error) {
        next(error);
    }
};


// ======================================================
// GET SINGLE EVENT
// ======================================================

const getsigleEvents = async (req, res, next) => {
    try {
        const eventId = req.params.eventId;

        const event = await Event.findById(eventId);

        if (!event) {
            return res.status(404).json({
                status: "fail",
                message: "Event not found"
            });
        }

        res.status(200).json({
            status: "success",
            event
        });

    } catch (error) {
        next(error);
    }
};


// ======================================================
// UPDATE EVENT
// ======================================================

const updateEvents = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const eventId = req.params.eventId;

        const event = await Event.findById(eventId);

        if (!event) {
            return res.status(404).json({
                status: "fail",
                message: "Event not found"
            });
        }

        if (event.createdBy.toString() !== userId) {
            return res.status(403).json({
                status: "fail",
                message: "You're not authorized to update this event."
            });
        }

        const updatedEvent = await Event.findByIdAndUpdate(
            eventId,
            req.body,
            {
                new: true,
                runValidators: true
            }
        );

        res.status(200).json({
            status: "success",
            message: "Event updated successfully",
            event: updatedEvent
        });

    } catch (error) {
        next(error);
    }
};


// ======================================================
// DELETE EVENT
// ======================================================

const deleteEvents = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const eventId = req.params.eventId;

        const event = await Event.findById(eventId);

        if (!event) {
            return res.status(404).json({
                status: "fail",
                message: "Event not found"
            });
        }

        if (event.createdBy.toString() !== userId) {
            return res.status(403).json({
                status: "fail",
                message: "You're not authorized to delete this event."
            });
        }

        await Ticket.deleteMany({
            eventId: event._id
        });

        await Event.findByIdAndDelete(eventId);

        res.status(200).json({
            status: "success",
            message: "Event successfully deleted"
        });

    } catch (error) {
        next(error);
    }
};



const createTicket = async (req, res, next) => {
  try {
    const { eventId, type, sit, price } = req.body;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        status: "fail",
        message: "You must be logged in.",
      });
    }

    if (!mongoose.isValidObjectId(eventId)) {
      return res.status(400).json({
        status: "fail",
        message: "A valid event ID is required.",
      });
    }

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({
        status: "fail",
        message: "Event not found.",
      });
    }

    if (event.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to create tickets for this event.",
      });
    }

    if (!["Regular", "VIP"].includes(type)) {
      return res.status(400).json({
        status: "fail",
        message: "Ticket type must be Regular or VIP.",
      });
    }

    const seatCount = Number(sit);
    const ticketPrice = Number(price);

    if (!Number.isInteger(seatCount) || seatCount < 1) {
      return res.status(400).json({
        status: "fail",
        message: "Number of seats must be a positive whole number.",
      });
    }

    if (!Number.isFinite(ticketPrice) || ticketPrice <= 0) {
      return res.status(400).json({
        status: "fail",
        message: "Ticket price must be greater than zero.",
      });
    }

    const existingTicket = await Ticket.findOne({ eventId, type });

    if (existingTicket) {
      return res.status(409).json({
        status: "fail",
        message: `${type} ticket already exists for this event. Update the existing ticket instead.`,
      });
    }

    const newTicket = await Ticket.create({
      eventId,
      userId,
      type,
      sit: seatCount,
      price: ticketPrice,
    });

    return res.status(201).json({
      status: "success",
      message: `${type} ticket created successfully.`,
      ticket: newTicket,
    });
  } catch (error) {
    console.error("CREATE TICKET ERROR:", error);
    return next(error);
  }
};




const getTicketforEvent = async (req, res, next) => {
  try {
    const eventId = req.params.ticketId;

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

    const tickets = await Ticket.find({ eventId }).sort({ type: 1 });

    if (tickets.length === 0) {
      return res.status(200).json({
        status: "success",
        message: "No tickets have been created for this event yet.",
        result: 0,
        tickets: [],
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Tickets fetched successfully.",
      result: tickets.length,
      tickets,
    });
  } catch (error) {
    console.error("GET TICKETS ERROR:", error);
    return next(error);
  }
};









const updateTicket = async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const ticketId = req.params.ticketId;
    const { sit, price } = req.body;

    if (!mongoose.isValidObjectId(ticketId)) {
      return res.status(400).json({
        status: "fail",
        message: "Invalid ticket ID.",
      });
    }

    const ticket = await Ticket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({
        status: "fail",
        message: "Ticket not found.",
      });
    }

    if (ticket.userId.toString() !== userId?.toString()) {
      return res.status(403).json({
        status: "fail",
        message: "You are not authorized to update this ticket.",
      });
    }

    if (sit !== undefined) {
      const seatCount = Number(sit);

      if (!Number.isInteger(seatCount) || seatCount < 0) {
        return res.status(400).json({
          status: "fail",
          message: "Seats must be a non-negative whole number.",
        });
      }

      ticket.sit = seatCount;
    }

    if (price !== undefined) {
      const ticketPrice = Number(price);

      if (!Number.isFinite(ticketPrice) || ticketPrice <= 0) {
        return res.status(400).json({
          status: "fail",
          message: "Ticket price must be greater than zero.",
        });
      }

      ticket.price = ticketPrice;
    }

    const updatedTicket = await ticket.save();

    return res.status(200).json({
      status: "success",
      message: "Ticket updated successfully.",
      ticket: updatedTicket,
    });
  } catch (error) {
    console.error("UPDATE TICKET ERROR:", error);
    return next(error);
  }
};



const deleteTicket = async (req, res, next) => {
    try {
        const ticketId = req.params.ticketId;
        const userId = req.user.id;

        const ticket = await Ticket.findById(ticketId);

        if (!ticket) {
            return res.status(404).json({
                status: "fail",
                message: "Ticket not found"
            });
        }

        if (ticket.userId.toString() !== userId) {
            return res.status(403).json({
                status: "fail",
                message: "You're not authorized to delete this ticket."
            });
        }

        await Ticket.findByIdAndDelete(ticketId);

        res.status(200).json({
            status: "success",
            message: "Ticket deleted successfully"
        });

    } catch (error) {
        next(error);
    }
};


// ======================================================
// UPCOMING EVENTS
// ======================================================

const getUpcomimgEvent = async (req, res, next) => {
    try {
        const currentDate = new Date();

        const upcomingEvents = await Event.find({
            date: {
                $gte: currentDate
            }
        })
            .sort({ date: 1 })
            .exec();

        res.status(200).json({
            status: "success",
            message: "Upcoming events fetched successfully",
            result: upcomingEvents.length,
            events: upcomingEvents
        });

    } catch (error) {
        next(error);
    }
};


// ======================================================
// FEATURED EVENTS
// ======================================================

const getFeaturedEvent = async (req, res, next) => {
    try {
        const currentDate = new Date();

        const endDate = new Date(currentDate);
        endDate.setDate(currentDate.getDate() + 7);

        const featuredEvents = await Event.find({
            date: {
                $gte: currentDate,
                $lte: endDate
            }
        })
            .sort({ date: 1 })
            .exec();

        res.status(200).json({
            status: "success",
            message: "Featured events fetched successfully",
            result: featuredEvents.length,
            events: featuredEvents
        });

    } catch (error) {
        next(error);
    }
};


// ======================================================
// EVENTS BY CATEGORY
// ======================================================

const getEventForCategories = async (req, res, next) => {
    try {
        const { category } = req.params;

        if (!category) {
            return res.status(400).json({
                status: "fail",
                message: "Category parameter is missing."
            });
        }

        const events = await Event.find({
            category
        }).sort({ date: 1 });

        res.status(200).json({
            status: "success",
            message: "Events fetched successfully",
            events
        });

    } catch (error) {
        next(error);
    }
};


// ======================================================
// CATEGORY COUNTS
// ======================================================

const getLengthofCategories = async (req, res, next) => {
    try {
        const categories = await Event.distinct("category");

        const categoriesWithLength = [];

        for (const category of categories) {
            const count = await Event.countDocuments({
                category
            });

            categoriesWithLength.push({
                category,
                length: count
            });
        }

        res.status(200).json({
            status: "success",
            message: "Length of categories fetched successfully",
            categories: categoriesWithLength
        });

    } catch (error) {
        next(error);
    }
};


// ======================================================
// SEARCH EVENTS
// ======================================================

const getSearchEvent = async (req, res, next) => {
    try {
        const {
            name,
            category,
            time
        } = req.params;

        let query = {};

        if (name !== "any") {
            query.name = {
                $regex: name,
                $options: "i"
            };
        }

        if (category !== "any") {
            query.category = category;
        }

        const now = new Date();

        switch (time) {

            case "today": {
                const start = new Date(now);
                start.setHours(0, 0, 0, 0);

                const end = new Date(now);
                end.setHours(23, 59, 59, 999);

                query.date = {
                    $gte: start,
                    $lte: end
                };

                break;
            }

            case "tomorrow": {
                const tomorrow = new Date(now);
                tomorrow.setDate(now.getDate() + 1);

                const start = new Date(tomorrow);
                start.setHours(0, 0, 0, 0);

                const end = new Date(tomorrow);
                end.setHours(23, 59, 59, 999);

                query.date = {
                    $gte: start,
                    $lte: end
                };

                break;
            }

            case "this_week": {
                const startOfWeek = new Date(now);

                startOfWeek.setDate(
                    now.getDate() -
                    ((now.getDay() + 6) % 7)
                );

                startOfWeek.setHours(0, 0, 0, 0);

                const endOfWeek = new Date(startOfWeek);

                endOfWeek.setDate(
                    startOfWeek.getDate() + 6
                );

                endOfWeek.setHours(23, 59, 59, 999);

                query.date = {
                    $gte: startOfWeek,
                    $lte: endOfWeek
                };

                break;
            }

            case "next_week": {
                const nextWeek = new Date(now);

                nextWeek.setDate(
                    now.getDate() +
                    ((1 + 7 - now.getDay()) % 7)
                );

                const startOfNextWeek = new Date(nextWeek);

                startOfNextWeek.setHours(0, 0, 0, 0);

                const endOfNextWeek = new Date(startOfNextWeek);

                endOfNextWeek.setDate(
                    startOfNextWeek.getDate() + 6
                );

                endOfNextWeek.setHours(23, 59, 59, 999);

                query.date = {
                    $gte: startOfNextWeek,
                    $lte: endOfNextWeek
                };

                break;
            }

            case "next_month": {
                const firstDayOfNextMonth = new Date(
                    now.getFullYear(),
                    now.getMonth() + 1,
                    1
                );

                const firstDayOfFollowingMonth = new Date(
                    now.getFullYear(),
                    now.getMonth() + 2,
                    1
                );

                query.date = {
                    $gte: firstDayOfNextMonth,
                    $lt: firstDayOfFollowingMonth
                };

                break;
            }

            case "future":
                query.date = {
                    $gte: now
                };
                break;
        }

        const events = await Event
            .find(query)
            .sort({ date: 1 });

        res.status(200).json({
            status: "success",
            count: events.length,
            events
        });

    } catch (error) {
        console.error("Error fetching events:", error);

        res.status(500).json({
            status: "error",
            message: "Error fetching events",
            error: error.message
        });
    }
};


// ======================================================
// EVENT / VENUE / USER COUNTS
// ======================================================

const getLengthofEventUser = async (req, res, next) => {
    try {
        const eventCount = await Event.countDocuments();

        const allEvents = await Event.find();

        const uniqueVenues = [
            ...new Set(
                allEvents.map(event => event.venue)
            )
        ];

        const venueCount = uniqueVenues.length;

        const userCount = await User.countDocuments();

        res.status(200).json({
            userCount,
            eventCount,
            venueCount
        });

    } catch (error) {
        next(error);
    }
};


// ======================================================
// EXPORTS
// ======================================================

module.exports = {
    createEvent,
    getallEvents,
    getsigleEvents,
    updateEvents,
    deleteEvents,
    createTicket,
    getTicketforEvent,
    updateTicket,
    deleteTicket,
    getUpcomimgEvent,
    getFeaturedEvent,
    getEventForCategories,
    getLengthofCategories,
    getSearchEvent,
    getLengthofEventUser
};
