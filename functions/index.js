const { onRequest } = require("firebase-functions/v2/https");
const axios = require("axios");

exports.audioProxy = onRequest(async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      res.status(400).send("URL ausente");
      return;
    }

    console.log("Proxy recebeu:");
    console.log(url);

    const response = await axios.get(url, {
      responseType: "stream",
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    console.log(
      "Content-Type Substack:",
      response.headers["content-type"]
    );

    res.setHeader(
      "Content-Type",
      "audio/mpeg"
    );

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    response.data.pipe(res);

  } catch (error) {

    console.error(
      "Erro no proxy:",
      error.message
    );

    res.status(500).send(
      "Erro no proxy de áudio"
    );
  }
});