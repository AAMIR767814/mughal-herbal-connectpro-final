
const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "mughal_herbal_123";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "1325062257366392";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";

console.log("Starting Mughal Herbal ConnectPro - Phone ID:", PHONE_NUMBER_ID);

app.get('/', (req, res) => {
  res.send('Mughal Herbal ConnectPro Server Live - Phone ID: 1325062257366392');
});

// Webhook Verification - Meta ye call karega
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  console.log("Webhook verification attempt:", { mode, token });
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("WEBHOOK VERIFIED SUCCESSFULLY!");
    res.status(200).send(challenge);
  } else {
    console.log("WEBHOOK VERIFICATION FAILED");
    res.sendStatus(403);
  }
});

// Jab customer message bhejega
app.post('/webhook', (req, res) => {
  const body = req.body;
  console.log("Incoming webhook:", JSON.stringify(body, null, 2));
  
  if (body.object === 'whatsapp_business_account') {
    body.entry.forEach(entry => {
      entry.changes.forEach(change => {
        const value = change.value;
        if (value.messages && value.messages[0]) {
          const message = value.messages[0];
          const contact = value.contacts ? value.contacts[0] : { profile: { name: "Unknown" } };
          console.log(`NEW CTWA LEAD from ${contact.profile.name} (${message.from}): ${message.text ? message.text.body : message.type}`);
        }
      });
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Agent yaha se message bhejega
app.post('/send-message', async (req, res) => {
  const { to, message } = req.body;
  if (!ACCESS_TOKEN) {
    return res.json({ success: false, error: "ACCESS_TOKEN not set" });
  }
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: to,
    type: "text",
    text: { body: message }
  };
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    res.json({ success: true, data });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} - Webhook ready at /webhook`));
