const Event = require("../models/Event");

const resolvers = {
  events: async () => {
    const events = await Event.find();

    return events.map((event) => ({
      id: event._id.toString(),
      name: event.name,
      description: event.description,
      date: event.date.toISOString(),
      location: event.location,
      venue: event.venue,
      category: event.category,
      image: event.image,
    }));
  },

  event: async ({ id }) => {
    const event = await Event.findById(id);

    if (!event) {
      throw new Error("Event not found");
    }

    return {
      id: event._id.toString(),
      name: event.name,
      description: event.description,
      date: event.date.toISOString(),
      location: event.location,
      venue: event.venue,
      category: event.category,
      image: event.image,
    };
  },
};

module.exports = resolvers;