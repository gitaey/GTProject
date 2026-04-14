const axios = require("axios");

const BASE_URL = process.env.SPRING_API_URL;

async function getCharacter(name) {
  const response = await axios.get(`${BASE_URL}/api/lostark/character/${name}`);
  return response.data;
}

module.exports = { getCharacter };
