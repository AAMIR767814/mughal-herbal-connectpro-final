const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();

// CORS - Allow frontend to call backend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "mughal_herbal_123";
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || "1325062257366392";
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || "";

console.log("========================================");
console.log("Starting Mughal Herbal ConnectPro");
console.log("Phone ID:", PHONE_NUMBER_ID);
console.log("Verify Token:", VERIFY_TOKEN);
console.log("Access Token Set:", ACCESS_TOKEN ? "YES - Length " + ACCESS_TOKEN.length : "NO - MISSING!");
console.log("========================================");

// Frontend - Serve CRM
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Live', 
    phone_id: PHONE_NUMBER_ID,
    verify_token: VERIFY_TOKEN,
    access_token_set: !!ACCESS_TOKEN,
    timestamp: new Date().toISOString()
  });
});

// Webhook Verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  console.log("WEBHOOK VERIFICATION ATTEMPT:", { mode, token, challenge: challenge ? "present" : "missing" });
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log("✅ WEBHOOK VERIFIED SUCCESSFULLY!");
    res.status(200).send(challenge);
  } else {
    console.log("❌ WEBHOOK VERIFICATION FAILED - Token mismatch");
    console.log(`Expected: ${VERIFY_TOKEN}, Got: ${token}`);
    res.sendStatus(403);
  }
});

// Incoming WhatsApp messages - CTWA Leads
app.post('/webhook', (req, res) => {
  console.log("📩 WEBHOOK POST RECEIVED - Full body:", JSON.stringify(req.body, null, 2));
  const body = req.body;
  if (body.object === 'whatsapp_business_account') {
    body.entry.forEach(entry => {
      entry.changes.forEach(change => {
        const value = change.value;
        console.log("Change value:", JSON.stringify(value, null, 2).substring(0, 1000));
        // Handle messages
        if (value.messages && value.messages[0]) {
          const message = value.messages[0];
          const contact = value.contacts && value.contacts[0] ? value.contacts[0] : { profile: { name: "Unknown" } };
          const waId = message.from;
          const text = message.text ? message.text.body : `[${message.type}]`;
          
          const lead = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            customer_name: contact.profile.name || "Unknown",
            whatsapp_number: waId,
            phone_number_id: PHONE_NUMBER_ID,
            first_message: text,
            last_message: text,
            status: "New",
            ad_source: "WhatsApp - Direct",
            messages: [{ from: 'customer', text: text, time: new Date().toISOString() }]
          };
          
          console.log("🔥 NEW CTWA LEAD CAPTURED:", JSON.stringify(lead, null, 2));
          
          // Save to leads.json
          let leads = [];
          const leadsFile = path.join(__dirname, 'leads.json');
          if (fs.existsSync(leadsFile)) {
            try { 
              const content = fs.readFileSync(leadsFile, 'utf8');
              leads = content ? JSON.parse(content) : [];
            } catch(e) { 
              console.log("Error reading leads.json:", e.message);
              leads = []; 
            }
          }
          // Check if same number exists - add message to existing chat
          const existingIndex = leads.findIndex(l => l.whatsapp_number === waId);
          if (existingIndex >= 0) {
            leads[existingIndex].last_message = text;
            leads[existingIndex].messages = leads[existingIndex].messages || [];
            leads[existingIndex].messages.push({ from: 'customer', text: text, time: new Date().toISOString() });
            leads[existingIndex].timestamp = new Date().toISOString();
          } else {
            leads.push(lead);
          }
          
          try {
            fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2));
            console.log(`✅ Lead saved to leads.json - Total leads: ${leads.length}`);
          } catch(e) {
            console.log("❌ Error saving leads.json:", e.message);
          }
        }
        // Handle status updates
        if (value.statuses && value.statuses[0]) {
          console.log("Status update:", value.statuses[0]);
        }
      });
    });
    res.status(200).send('EVENT_RECEIVED');
  } else {
    console.log("❌ Not a WhatsApp business account event:", body.object);
    res.sendStatus(404);
  }
});

// Send message from CRM
app.post('/send-message', async (req, res) => {
  const { to, message, type } = req.body;
  console.log(`📤 SEND MESSAGE REQUEST - To: ${to}, Message: ${message}`);
  
  if (!ACCESS_TOKEN) {
    console.log("❌ ACCESS_TOKEN not set!");
    return res.json({ success: false, error: "ACCESS_TOKEN not set in Environment Variables. Please add it in Render dashboard." });
  }
  if (!to || !message) {
    return res.json({ success: false, error: "Phone number and message required" });
  }
  
  // Format number - remove + and spaces, ensure country code
  let formattedTo = to.replace(/[^0-9]/g, '');
  if (formattedTo.length === 10) {
    formattedTo = '91' + formattedTo; // Assume India if 10 digits
  }
  
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: formattedTo,
    type: "text",
    text: { body: message }
  };
  
  console.log("Sending to WhatsApp API:", url, JSON.stringify(payload));
  
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
    console.log("WhatsApp API Response:", JSON.stringify(data, null, 2));
    
    if (data.error) {
      console.log("❌ WhatsApp API Error:", data.error);
      return res.json({ success: false, error: data.error.message || JSON.stringify(data.error), data });
    }
    
    // Also save to leads as sent message
    let leads = [];
    const leadsFile = path.join(__dirname, 'leads.json');
    if (fs.existsSync(leadsFile)) {
      try { leads = JSON.parse(fs.readFileSync(leadsFile, 'utf8')); } catch(e) { leads = []; }
    }
    const existingIndex = leads.findIndex(l => l.whatsapp_number === formattedTo || l.whatsapp_number === to);
    if (existingIndex >= 0) {
      leads[existingIndex].messages = leads[existingIndex].messages || [];
      leads[existingIndex].messages.push({ from: 'agent', text: message, time: new Date().toISOString() });
      leads[existingIndex].last_message = message;
    } else {
      // Create new lead for sent message
      leads.push({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        customer_name: "Unknown",
        whatsapp_number: formattedTo,
        phone_number_id: PHONE_NUMBER_ID,
        first_message: message,
        last_message: message,
        status: "New",
        ad_source: "Manual - CRM",
        messages: [{ from: 'agent', text: message, time: new Date().toISOString() }]
      });
    }
    try { fs.writeFileSync(leadsFile, JSON.stringify(leads, null, 2)); } catch(e) {}
    
    res.json({ success: true, data, formattedTo });
  } catch (error) {
    console.error("❌ Send error:", error);
    res.json({ success: false, error: error.message });
  }
});

// API to get leads for CRM frontend
app.get('/api/leads', (req, res) => {
  const leadsFile = path.join(__dirname, 'leads.json');
  if (fs.existsSync(leadsFile)) {
    try {
      const content = fs.readFileSync(leadsFile, 'utf8');
      const leads = content ? JSON.parse(content) : [];
      console.log(`📋 API /api/leads - Returning ${leads.length} leads`);
      res.json(leads);
    } catch(e) { 
      console.log("Error reading leads for API:", e.message);
      res.json([]); 
    }
  } else {
    console.log("📋 API /api/leads - No leads file, returning empty");
    res.json([]);
  }
});

// API to delete leads (for cleanup)
app.delete('/api/leads', (req, res) => {
  const leadsFile = path.join(__dirname, 'leads.json');
  try {
    fs.writeFileSync(leadsFile, JSON.stringify([], null, 2));
    console.log("🗑️ All leads deleted");
    res.json({ success: true, message: "All leads deleted" });
  } catch(e) {
    res.json({ success: false, error: e.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`🚀 Mughal Herbal ConnectPro FULL STACK`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`🌐 Frontend: http://localhost:${PORT}/`);
  console.log(`🔗 Webhook: http://localhost:${PORT}/webhook`);
  console.log(`📊 API Leads: http://localhost:${PORT}/api/leads`);
  console.log(`📱 Phone ID: ${PHONE_NUMBER_ID}`);
  console.log(`========================================\n`);
});
