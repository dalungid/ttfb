// config.js
require('dotenv').config();

module.exports = {
  FB_PAGE_ID: process.env.FB_PAGE_ID,
  FB_PAGE_TOKEN: process.env.FB_PAGE_TOKEN,
  WA_SESSION: JSON.parse(process.env.WA_SESSION || '{}'),
  ENCRYPT_KEY: process.env.ENCRYPT_KEY
};