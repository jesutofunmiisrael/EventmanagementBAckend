const { buildSchema } = require("graphql");

const schema = buildSchema(`
  type Event {
    id: ID!
    name: String!
    description: String
    date: String!
    location: String!
    venue: String!
    category: String!
    image: String
  }

  type Query {
    events: [Event!]!
    event(id: ID!): Event
  }
`);

module.exports = schema;