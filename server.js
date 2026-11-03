require("dotenv").config();

const app = require("./app");
const connectDB = require("./config/ConnectTODB");
const { cloudinaryConfig } = require("./middlewares/cloudinary");

cloudinaryConfig();

const port = process.env.PORT || 4000;

connectDB();

app.listen(port, () => {
    console.log("App is listening on port " + port);
});