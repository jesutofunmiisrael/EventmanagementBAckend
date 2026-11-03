
require("dotenv").config();

const mongoose = require("mongoose");
const Event = require("./models/Event");
const User = require("./models/user");

const events = [
  {
    name: "Lagos Business & Leadership Summit",
    description:
      "A professional gathering for entrepreneurs, business leaders and ambitious professionals to connect, learn and grow.",
    date: "2026-10-18",
    location: "Lagos",
    category: "business",
    venue: "Landmark Event Centre",
    image: "/images/business.jpg",
  },
  {
    name: "Afrobeats Live Experience",
    description:
      "A live music experience celebrating Afrobeats, incredible performances and the best of Nigerian entertainment.",
    date: "2026-10-25",
    location: "Lagos",
    category: "music",
    venue: "Eko Convention Centre",
    image: "/images/music.jpg",
  },
  {
    name: "Abuja AI & Technology Summit",
    description:
      "Explore artificial intelligence, emerging technologies and the future of digital innovation in Africa.",
    date: "2026-11-01",
    location: "Abuja",
    category: "conference",
    venue: "International Conference Centre Abuja",
    image: "/images/technology.jpg",
  },
  {
    name: "Ibadan Creative Arts Festival",
    description:
      "A celebration of Nigerian creativity featuring art, fashion, photography, design and live performances.",
    date: "2026-11-08",
    location: "Ibadan",
    category: "festival",
    venue: "Cultural Centre Ibadan",
    image: "/images/arts.jpg",
  },
  {
    name: "Nigeria Travel & Tourism Expo",
    description:
      "Discover beautiful destinations, tourism opportunities and unforgettable travel experiences across Nigeria.",
    date: "2026-11-15",
    location: "Abuja",
    category: "travel",
    venue: "Nicon Luxury Hotel",
    image: "/images/travel.jpg",
  },
  {
    name: "Lagos Food & Culture Fair",
    description:
      "Experience Nigerian food, culture and entertainment from different communities in one exciting event.",
    date: "2026-11-22",
    location: "Lagos",
    category: "festival",
    venue: "Muri Okunola Park",
    image: "/images/food.jpg",
  },
  {
    name: "Startup Founders Meetup",
    description:
      "Meet startup founders, investors, developers and innovators building the next generation of African businesses.",
    date: "2026-11-29",
    location: "Lagos",
    category: "business",
    venue: "The Zone Tech Park",
    image: "/images/startup.jpg",
  },
  {
    name: "Nigeria Football Fan Fest",
    description:
      "A complete football experience featuring live match screenings, games, music and entertainment for football lovers.",
    date: "2026-12-06",
    location: "Lagos",
    category: "sport",
    venue: "Teslim Balogun Stadium",
    image: "/images/football.jpg",
  },
  {
    name: "Lagos Fashion & Style Week",
    description:
      "A fashion experience bringing designers, models, creatives and fashion lovers together.",
    date: "2026-12-13",
    location: "Lagos",
    category: "festival",
    venue: "Federal Palace Hotel",
    image: "/images/fashion.jpg",
  },
  {
    name: "Developer Community Conference",
    description:
      "A developer-focused conference covering modern web development, software engineering and the future of technology.",
    date: "2026-12-20",
    location: "Abuja",
    category: "conference",
    venue: "Abuja Continental Hotel",
    image: "/images/developer.jpeg",
  },
];

const seedEvents = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected successfully");
    console.log("Database:", mongoose.connection.name);

    const user = await User.findOne();

    if (!user) {
      throw new Error(
        "No user found. Please register an account in EventFlow first."
      );
    }

    // Find existing events so we don't insert duplicates.
    const existingNames = await Event.find({
      name: { $in: events.map((event) => event.name) },
    }).distinct("name");

    const existingNameSet = new Set(existingNames);

    const newEvents = events
      .filter((event) => !existingNameSet.has(event.name))
      .map((event) => ({
        ...event,
        createdBy: user._id,
      }));

    if (newEvents.length === 0) {
      console.log("All 10 sample events already exist. Nothing added.");
      return;
    }

    const insertedEvents = await Event.insertMany(newEvents);

    console.log(
      `Successfully added ${insertedEvents.length} sample events.`
    );
    console.log("Existing events were preserved.");
  } catch (error) {
    console.error("Error seeding events:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

seedEvents();