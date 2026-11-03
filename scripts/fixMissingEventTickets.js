
require("dotenv").config();

const mongoose = require("mongoose");
const Event = require("../models/Event");
const Ticket = require("../models/Ticket");

async function fixMissingEventTickets() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Connected to MongoDB");

    const events = await Event.find({});
    let createdCount = 0;

    for (const event of events) {
      const existingTickets = await Ticket.find({
        eventId: event._id,
      });

      const existingTypes = new Set(
        existingTickets.map((ticket) => ticket.type)
      );

      const ticketsToCreate = [];

      if (!existingTypes.has("Regular")) {
        ticketsToCreate.push({
          eventId: event._id,
          userId: event.createdBy,
          type: "Regular",
          sit: 100,
          price: 5000,
        });
      }

      if (!existingTypes.has("VIP")) {
        ticketsToCreate.push({
          eventId: event._id,
          userId: event.createdBy,
          type: "VIP",
          sit: 50,
          price: 10000,
        });
      }

      if (ticketsToCreate.length > 0) {
        await Ticket.insertMany(ticketsToCreate);
        createdCount += ticketsToCreate.length;

        console.log(
          `Created ${ticketsToCreate.length} missing ticket(s) for: ${event.name}`
        );
      }
    }

    console.log(`Finished. Created ${createdCount} missing ticket(s).`);
  } catch (error) {
    console.error("Ticket migration failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

fixMissingEventTickets();
