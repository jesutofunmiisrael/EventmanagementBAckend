const https = require("https");
const yup = require("yup");
const crypto = require("crypto");

const emailSchema = yup.string().email().required();
const amountSchema = yup.number().positive().required();

const getSecret = () => {
  const secret = process.env.PAYSTACK_SECRET_KEY;

  if (!secret) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is missing from the backend .env file."
    );
  }

  return secret;
};

// Send a request to Paystack and parse its response.
const paystackRequest = (path, method, payload) => {
  const secret = getSecret();

  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : "";

    const options = {
      hostname: "api.paystack.co",
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
            }
          : {}),
      },
    };

    const request = https.request(options, (response) => {
      let data = "";

      response.setEncoding("utf8");

      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        let result;

        try {
          result = JSON.parse(data);
        } catch {
          return reject(
            new Error("Paystack returned an invalid response.")
          );
        }

        if (
          response.statusCode < 200 ||
          response.statusCode >= 300 ||
          !result.status
        ) {
          return reject(
            new Error(result.message || "Paystack request failed.")
          );
        }

        resolve(result.data);
      });
    });

    request.setTimeout(15000, () => {
      request.destroy(new Error("Paystack request timed out."));
    });

    request.on("error", reject);

    if (payload) {
      request.write(body);
    }

    request.end();
  });
};

// Initialize payment. Amount is received in naira.
const payment = async ({ email, amount }) => {
  await emailSchema.validate(email);
  await amountSchema.validate(amount);

  const amountInKobo = Math.round(Number(amount) * 100);

  if (!Number.isSafeInteger(amountInKobo) || amountInKobo < 1) {
    throw new Error("Invalid payment amount.");
  }

  // Remove a trailing slash from the frontend URL.
  const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, "");

  // An explicit callback URL takes priority over the default.
  const callbackUrl =
    process.env.PAYSTACK_CALLBACK_URL ||
    (frontendUrl
      ? `${frontendUrl}/payment/verify`
      : undefined);

  const data = await paystackRequest(
    "/transaction/initialize",
    "POST",
    {
      email,
      amount: amountInKobo,
      currency: "NGN",
      ...(callbackUrl ? { callback_url: callbackUrl } : {}),
    }
  );

  if (!data.authorization_url || !data.reference) {
    throw new Error(
      "Paystack did not return a valid payment reference."
    );
  }

  return {
    paymentUrl: data.authorization_url,
    transactionId: data.reference,
  };
};

// Verify a payment directly with Paystack.
// Never trust a successful redirect from the frontend alone.
const verifyPaystackTransaction = async (reference) => {
  if (typeof reference !== "string" || !reference.trim()) {
    throw new Error(
      "A valid Paystack payment reference is required."
    );
  }

  const data = await paystackRequest(
    `/transaction/verify/${encodeURIComponent(reference)}`,
    "GET"
  );

  return data;
};

// Validate Paystack's webhook signature using the original request body.
// Express must preserve the original request bytes as req.rawBody.
const handlePaystackWebhook = async (req, res, next) => {
  try {
    const secret = getSecret();
    const signature = req.headers["x-paystack-signature"];
    const rawBody = req.rawBody;

    if (
      typeof signature !== "string" ||
      !/^[a-f0-9]{128}$/i.test(signature) ||
      !Buffer.isBuffer(rawBody)
    ) {
      return res.status(400).json({
        status: "fail",
        message:
          "Webhook signature or raw request body is missing or invalid.",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha512", secret)
      .update(rawBody)
      .digest("hex");

    const received = Buffer.from(signature, "hex");
    const expected = Buffer.from(expectedSignature, "hex");

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      return res.status(401).json({
        status: "fail",
        message: "Invalid Paystack webhook signature.",
      });
    }

    console.log(
      "Verified Paystack webhook event:",
      req.body?.event || "unknown"
    );

    return res.status(200).json({
      status: "success",
      message: "Paystack webhook signature verified.",
    });
  } catch (error) {
    console.error("PAYSTACK WEBHOOK ERROR:", error);
    return next(error);
  }
};

module.exports = {
  payment,
  verifyPaystackTransaction,
  handlePaystackWebhook,
};