const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "mughal_herbal_123";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "1325062257366392";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";

console.log("Starting Mughal Herbal ConnectPro - Phone ID:", PHONE_NUMBER_ID);
console.log("Frontend + Webhook Server Starting...");

// Frontend - Serve CRM login page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Webhook Verification
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

// Incoming WhatsApp messages - CTWA Leads
app.post('/webhook', (req, res) => {
  const body = req.body;
  console.log("Incoming webhook:", JSON.stringify(body, null, 2).substring(0, 500));
  if (body.object === 'whatsapp_business_account') {
    body.entry.forEach(entry => {
      entry.changes.forEach(change => {
        const value = change.value;
        if (value.messages && value.messages[0]) {
          const message = value.messages[0];
          const contact = value.contacts ? value.contacts[0] : { profile: { name: "Unknown" } };
          const lead = {
            timestamp: new Date().toISOString(),
            customer_name: contact.profile.name,
            whatsapp_number: message.from,
            phone_number_id: PHONE_NUMBER_ID,
            first_message: message.text ? message.text.body : message.type,
            last_message: message.text ? message.text.body : "",
            status: "New",
            ad_source: "CTWA - Mughal Herbal"
          };
          console.log("NEW CTWA LEAD:", JSON.stringify(lead));
          // Save to leads.json for CRM to read
          let leads = [];
          const leadsFile = path.join(__dirname, 'leads.json');
          if (fs.existsSync(leadsFile)) {
            try { leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8')); } catch(e) { leads = []; }
          }
          leads.push(lead);
          fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2));
        }
      });
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Send message from CRM
app.post('/send-message', async (req, res) => {
  const { to, message } = req.body;
  if (!ACCESS_TOKEN) {
    return res.json({ success: false, error: "ACCESS_TOKEN not set in Environment" });
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
    console.log("Message sent:", data);
    res.json({ success: true, data });
  } catch (error) {
    console.error("Send error:", error);
    res.json({ success: false, error: error.message });
  }
});

// API to get leads for CRM frontend
app.get('/api/leads', (req, res) => {
  const leadsFile = path.join(__dirname, 'leads.json');
  if (fs.existsSync(leadsFile)) {
    try {
      const leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8'));
      res.json(leads);
    } catch(e) { res.json([]); }
  } else {
    res.json([]);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Mughal Herbal ConnectPro FULL STACK running on port ${PORT}`);
  console.log(`Frontend CRM: http://localhost:${PORT}/`);
  console.log(`Webhook: http://localhost:${PORT}/webhook`);
  console.log(`Phone ID: ${PHONE_NUMBER_ID}`);
});
